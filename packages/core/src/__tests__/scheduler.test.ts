/**
 * Unit tests for the in-process scheduler (Phase 3, C2).
 *
 * Covers:
 *  - cron parser: field parsing + next-run computation
 *  - interval next-run computation
 *  - missed-run skip policy (overdue > tick → skip + reschedule)
 *  - concurrent-execution guard (same jobKind not run twice concurrently)
 *  - concurrency cap (maxConcurrent)
 *  - persistence of nextRunAt across a simulated restart
 *  - job registry dispatch (handler invoked with the job)
 *  - enable/disable (disabled jobs never fire)
 *
 * Uses dependency injection (no mock.module): the Scheduler is constructed
 * with an in-memory store + explicit tickIntervalMs/maxConcurrent/enabled.
 */

import { describe, expect, test } from "bun:test";
import {
  parseCron,
  nextCronRun,
  Scheduler,
  getScheduler,
  resetScheduler,
} from "../services/scheduler/index.js";
import type {
  ScheduledJob,
  ScheduledJobStore,
  JobHandler,
  JobKind,
} from "../services/scheduler/index.js";

// ── In-memory store (test fixture) ───────────────────────────────────────────

function makeInMemoryStore(): ScheduledJobStore & {
  _dump(): ScheduledJob[];
  _load(jobs: ScheduledJob[]): void;
} {
  const map = new Map<string, ScheduledJob>();
  return {
    save(job: ScheduledJob): void {
      map.set(job.id, { ...job });
    },
    get(id: string): ScheduledJob | null {
      const j = map.get(id);
      return j ? { ...j } : null;
    },
    listAll(): ScheduledJob[] {
      return Array.from(map.values()).sort((a, b) => a.nextRunAt - b.nextRunAt);
    },
    listEnabled(): ScheduledJob[] {
      return Array.from(map.values())
        .filter((j) => j.enabled)
        .sort((a, b) => a.nextRunAt - b.nextRunAt);
    },
    delete(id: string): void {
      map.delete(id);
    },
    _dump(): ScheduledJob[] {
      return Array.from(map.values());
    },
    _load(jobs: ScheduledJob[]): void {
      for (const j of jobs) map.set(j.id, { ...j });
    },
  };
}

function makeJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: "test-job",
    name: "Test Job",
    jobKind: "test-kind" as JobKind,
    schedule: { type: "interval", intervalMs: 60_000 },
    nextRunAt: Date.now(),
    lastRunAt: 0,
    enabled: true,
    ...overrides,
  };
}

// ── Cron parser ──────────────────────────────────────────────────────────────

describe("cron parser", () => {
  test("parses a basic 5-field expression", () => {
    const parsed = parseCron("0 3 * * *");
    expect(parsed.minute).toEqual([0]);
    expect(parsed.hour).toEqual([3]);
    expect(parsed.dom.length).toBe(31);
    expect(parsed.month.length).toBe(12);
    expect(parsed.dow.length).toBe(7);
  });

  test("parses ranges", () => {
    const parsed = parseCron("0 9-17 * * 1-5");
    expect(parsed.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(parsed.dow).toEqual([1, 2, 3, 4, 5]);
  });

  test("parses lists", () => {
    const parsed = parseCron("0,30 * * * *");
    expect(parsed.minute).toEqual([0, 30]);
  });

  test("parses steps", () => {
    const parsed = parseCron("*/15 * * * *");
    expect(parsed.minute).toEqual([0, 15, 30, 45]);
  });

  test("parses stepped range", () => {
    const parsed = parseCron("0 0-23/6 * * *");
    expect(parsed.hour).toEqual([0, 6, 12, 18]);
  });

  test("normalizes 7 to 0 (both mean Sunday)", () => {
    const parsed = parseCron("* * * * 7");
    expect(parsed.dow).toEqual([0]);
  });

  test("throws on wrong field count", () => {
    expect(() => parseCron("0 3 * *")).toThrow(/5 fields/);
    expect(() => parseCron("0 3 * * * 0")).toThrow(/5 fields/);
  });

  test("throws on invalid value", () => {
    expect(() => parseCron("60 3 * * *")).toThrow(/invalid value/);
    expect(() => parseCron("0 24 * * *")).toThrow(/invalid value/);
  });
});

// ── Cron next-run computation ────────────────────────────────────────────────

describe("nextCronRun", () => {
  test("every minute fires within 1 minute", () => {
    const parsed = parseCron("* * * * *");
    const now = Date.now();
    const next = nextCronRun(parsed, now);
    expect(next).toBeGreaterThan(now);
    // Should be within 70 seconds (1 minute + small clock margin).
    expect(next - now).toBeLessThanOrEqual(70_000);
  });

  test("3am daily: next run is tomorrow 3am if after 3am", () => {
    const parsed = parseCron("0 3 * * *");
    // Anchor at 2026-07-10T10:00:00Z
    const anchor = Date.UTC(2026, 6, 10, 10, 0, 0);
    const next = nextCronRun(parsed, anchor);
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(3);
    expect(nextDate.getUTCMinutes()).toBe(0);
    // Should be the next day (July 11).
    expect(nextDate.getUTCDate()).toBe(11);
  });

  test("3am daily: next run is today 3am if before 3am", () => {
    const parsed = parseCron("0 3 * * *");
    // Anchor at 2026-07-10T01:00:00Z (before 3am)
    const anchor = Date.UTC(2026, 6, 10, 1, 0, 0);
    const next = nextCronRun(parsed, anchor);
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(3);
    expect(nextDate.getUTCDate()).toBe(10);
  });

  test("weekdays only: skips Saturday/Sunday", () => {
    const parsed = parseCron("0 9 * * 1-5");
    // Anchor at 2026-07-11T10:00:00Z (Saturday)
    const anchor = Date.UTC(2026, 6, 11, 10, 0, 0);
    const next = nextCronRun(parsed, anchor);
    const nextDate = new Date(next);
    // Should be Monday July 14 at 9am.
    expect(nextDate.getUTCDay()).toBe(1); // Monday
    expect(nextDate.getUTCDate()).toBe(13);
    expect(nextDate.getUTCHours()).toBe(9);
  });

  test("hourly at :15", () => {
    const parsed = parseCron("15 * * * *");
    const anchor = Date.UTC(2026, 6, 10, 10, 0, 0);
    const next = nextCronRun(parsed, anchor);
    const nextDate = new Date(next);
    expect(nextDate.getUTCMinutes()).toBe(15);
    expect(nextDate.getUTCHours()).toBe(10);
  });

  test("every 30 minutes", () => {
    const parsed = parseCron("*/30 * * * *");
    const anchor = Date.UTC(2026, 6, 10, 10, 0, 0);
    const next = nextCronRun(parsed, anchor);
    const nextDate = new Date(next);
    expect(nextDate.getUTCMinutes()).toBe(30);
  });

  test("Feb 30 (impossible) throws after iteration cap", () => {
    const parsed = parseCron("0 0 30 2 *");
    const anchor = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(() => nextCronRun(parsed, anchor)).toThrow(/no next-run|impossible/);
  });
});

// ── Interval next-run computation ────────────────────────────────────────────

describe("Scheduler.computeNextRun (interval)", () => {
  test("interval adds intervalMs to the anchor", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });
    const now = 100_000;
    const next = scheduler.computeNextRun(
      { type: "interval", intervalMs: 30_000 },
      now,
    );
    expect(next).toBe(130_000);
  });

  test("interval with missing intervalMs falls back to tick", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 5000,
      maxConcurrent: 2,
      enabled: true,
    });
    const now = 100_000;
    const next = scheduler.computeNextRun({ type: "interval" }, now);
    expect(next).toBe(105_000);
  });
});

// ── Scheduler.computeNextRun (cron) ──────────────────────────────────────────

describe("Scheduler.computeNextRun (cron)", () => {
  test("computes next cron run from now", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });
    const now = Date.UTC(2026, 6, 10, 10, 0, 0);
    const next = scheduler.computeNextRun(
      { type: "cron", cron: "0 3 * * *" },
      now,
    );
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(3);
    expect(nextDate.getUTCDate()).toBe(11);
  });
});

// ── Job registry dispatch ────────────────────────────────────────────────────

describe("job registry dispatch", () => {
  test("handler is invoked with the job when due", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    let receivedJob: ScheduledJob | null = null;
    const handler: JobHandler = async (job) => {
      receivedJob = job;
    };
    scheduler.registerHandler("test-kind" as JobKind, handler);

    const job = makeJob({
      id: "dispatch-test",
      jobKind: "test-kind" as JobKind,
      nextRunAt: Date.now() - 1, // due now
      schedule: { type: "interval", intervalMs: 60_000 },
    });
    store.save(job);

    await scheduler.tick();

    // The handler is invoked async (fire-and-forget inside fireJob). Wait for it.
    await new Promise((r) => setTimeout(r, 50));

    expect(receivedJob).not.toBeNull();
    expect(receivedJob!.id).toBe("dispatch-test");
  });

  test("no handler → job is still rescheduled (no spin)", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    const job = makeJob({
      id: "no-handler",
      jobKind: "unregistered-kind" as JobKind,
      nextRunAt: Date.now() - 1,
      schedule: { type: "interval", intervalMs: 60_000 },
    });
    store.save(job);

    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    const updated = store.get("no-handler");
    expect(updated).not.toBeNull();
    // nextRunAt should have advanced (rescheduled).
    expect(updated!.nextRunAt).toBeGreaterThan(job.nextRunAt);
  });
});

// ── Concurrent-execution guard ───────────────────────────────────────────────

describe("concurrent-execution guard", () => {
  test("same jobKind not run twice concurrently", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 5,
      enabled: true,
    });

    let activeCount = 0;
    let maxActive = 0;
    const handler: JobHandler = async () => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      // Hold the handler open so a second tick can overlap.
      await new Promise((r) => setTimeout(r, 80));
      activeCount--;
    };
    scheduler.registerHandler("slow-kind" as JobKind, handler);

    // Two jobs with the SAME jobKind, both due now.
    const now = Date.now();
    const job1 = makeJob({
      id: "slow-1",
      jobKind: "slow-kind" as JobKind,
      nextRunAt: now - 1,
      schedule: { type: "interval", intervalMs: 60_000 },
    });
    const job2 = makeJob({
      id: "slow-2",
      jobKind: "slow-kind" as JobKind,
      nextRunAt: now - 1,
      schedule: { type: "interval", intervalMs: 60_000 },
    });
    store.save(job1);
    store.save(job2);

    // First tick fires job1 (or job2). The second job is skipped because the
    // jobKind is already running.
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 20));
    // While job1 is still running, tick again — job2 should be skipped.
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 120));

    expect(maxActive).toBe(1);
  });

  test("different jobKinds can run concurrently up to maxConcurrent", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    let activeCount = 0;
    let maxActive = 0;
    const makeHandler = (): JobHandler => async () => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise((r) => setTimeout(r, 50));
      activeCount--;
    };
    scheduler.registerHandler("kind-a" as JobKind, makeHandler());
    scheduler.registerHandler("kind-b" as JobKind, makeHandler());

    const now = Date.now();
    store.save(
      makeJob({
        id: "a",
        jobKind: "kind-a" as JobKind,
        nextRunAt: now - 1,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );
    store.save(
      makeJob({
        id: "b",
        jobKind: "kind-b" as JobKind,
        nextRunAt: now - 1,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );
    // A third job that should be capped out.
    store.save(
      makeJob({
        id: "c",
        jobKind: "kind-c" as JobKind,
        nextRunAt: now - 1,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );
    scheduler.registerHandler("kind-c" as JobKind, makeHandler());

    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 100));

    // maxConcurrent=2 → at most 2 ran simultaneously.
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBeGreaterThanOrEqual(1);
  });
});

// ── Missed-run skip policy ───────────────────────────────────────────────────

describe("missed-run skip policy", () => {
  test("overdue job (> tick) is skipped + rescheduled, not fired", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000, // 1 min tick
      maxConcurrent: 2,
      enabled: true,
    });

    let fired = false;
    scheduler.registerHandler("missed-kind" as JobKind, async () => {
      fired = true;
    });

    // nextRunAt is 5 minutes ago — way past the tick window.
    const oldNext = Date.now() - 5 * 60_000;
    store.save(
      makeJob({
        id: "missed",
        jobKind: "missed-kind" as JobKind,
        nextRunAt: oldNext,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );

    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    expect(fired).toBe(false);
    const updated = store.get("missed");
    expect(updated).not.toBeNull();
    // nextRunAt should have been rescheduled to ~now + interval.
    expect(updated!.nextRunAt).toBeGreaterThan(Date.now() - 1000);
  });

  test("barely-due job (within tick) fires normally", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });

    let fired = false;
    scheduler.registerHandler("ok-kind" as JobKind, async () => {
      fired = true;
    });

    // nextRunAt is 10s ago — within the tick window.
    store.save(
      makeJob({
        id: "ok",
        jobKind: "ok-kind" as JobKind,
        nextRunAt: Date.now() - 10_000,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );

    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    expect(fired).toBe(true);
  });
});

// ── Enable/disable ───────────────────────────────────────────────────────────

describe("enable/disable", () => {
  test("disabled jobs never fire", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    let fired = false;
    scheduler.registerHandler("disabled-kind" as JobKind, async () => {
      fired = true;
    });

    store.save(
      makeJob({
        id: "disabled",
        jobKind: "disabled-kind" as JobKind,
        nextRunAt: Date.now() - 1,
        enabled: false,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );

    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    expect(fired).toBe(false);
  });

  test("setEnabled re-enables a disabled job and reschedules if past due", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    store.save(
      makeJob({
        id: "toggle",
        jobKind: "toggle-kind" as JobKind,
        nextRunAt: Date.now() - 100_000,
        enabled: false,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );

    scheduler.setEnabled("toggle", true);

    const updated = store.get("toggle");
    expect(updated).not.toBeNull();
    expect(updated!.enabled).toBe(true);
    // nextRunAt should have been rescheduled to the future.
    expect(updated!.nextRunAt).toBeGreaterThan(Date.now() - 1000);
  });

  test("setEnabled on a non-existent job logs a warning and is a no-op", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    // Should not throw.
    scheduler.setEnabled("does-not-exist", true);
    expect(store.get("does-not-exist")).toBeNull();
  });
});

// ── Persistence across simulated restart ─────────────────────────────────────

describe("persistence across simulated restart", () => {
  test("nextRunAt + lastRunAt survive a store reload", async () => {
    // Use a shared store that we "reload" by creating a new Scheduler pointing
    // at the same backing map. This simulates a process restart where the
    // store is re-read from disk.
    const backing = new Map<string, ScheduledJob>();
    const store1: ScheduledJobStore = {
      save: (j) => void backing.set(j.id, { ...j }),
      get: (id) => {
        const j = backing.get(id);
        return j ? { ...j } : null;
      },
      listAll: () => Array.from(backing.values()),
      listEnabled: () => Array.from(backing.values()).filter((j) => j.enabled),
      delete: (id) => void backing.delete(id),
    };

    const scheduler1 = new Scheduler({
      store: store1,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });
    scheduler1.registerHandler("persist-kind" as JobKind, async () => {});

    // Register a job via registerOrResumeJob. Use a 10-min interval so the
    // nextRunAt is comfortably in the future and not borderline (avoids flake
    // under CI load where the resume call might happen >60s after firedAt).
    const INTERVAL = 10 * 60_000;
    const job = scheduler1.registerOrResumeJob({
      id: "persist-1",
      name: "Persist Test",
      jobKind: "persist-kind" as JobKind,
      schedule: { type: "interval", intervalMs: INTERVAL },
      nextRunAt: 0,
      enabled: true,
    });

    // Simulate a run: set lastRunAt + advance nextRunAt.
    const firedAt = Date.now();
    job.lastRunAt = firedAt;
    job.nextRunAt = firedAt + INTERVAL;
    store1.save(job);

    // Verify the store has the updated values.
    const persisted = store1.get("persist-1");
    expect(persisted).not.toBeNull();
    expect(persisted!.lastRunAt).toBe(firedAt);
    expect(persisted!.nextRunAt).toBe(firedAt + INTERVAL);

    // "Restart": create a new store reading from the same backing.
    const store2: ScheduledJobStore = {
      save: (j) => void backing.set(j.id, { ...j }),
      get: (id) => {
        const j = backing.get(id);
        return j ? { ...j } : null;
      },
      listAll: () => Array.from(backing.values()),
      listEnabled: () => Array.from(backing.values()).filter((j) => j.enabled),
      delete: (id) => void backing.delete(id),
    };

    const scheduler2 = new Scheduler({
      store: store2,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    // registerOrResumeJob should preserve nextRunAt/lastRunAt when the schedule
    // is unchanged. The persisted nextRunAt (firedAt + INTERVAL) is in the
    // future, so resume keeps it rather than rescheduling from now.
    const resumed = scheduler2.registerOrResumeJob({
      id: "persist-1",
      name: "Persist Test",
      jobKind: "persist-kind" as JobKind,
      schedule: { type: "interval", intervalMs: INTERVAL },
      nextRunAt: 0,
      enabled: true,
    });

    expect(resumed.lastRunAt).toBe(firedAt);
    // nextRunAt is preserved because it's in the future (not past due).
    expect(resumed.nextRunAt).toBe(firedAt + INTERVAL);
  });

  test("schedule change recomputes nextRunAt on resume", () => {
    const backing = new Map<string, ScheduledJob>();
    const store: ScheduledJobStore = {
      save: (j) => void backing.set(j.id, { ...j }),
      get: (id) => {
        const j = backing.get(id);
        return j ? { ...j } : null;
      },
      listAll: () => Array.from(backing.values()),
      listEnabled: () => Array.from(backing.values()).filter((j) => j.enabled),
      delete: (id) => void backing.delete(id),
    };

    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    // Register with a 60s interval.
    scheduler.registerOrResumeJob({
      id: "change-1",
      name: "Change Test",
      jobKind: "change-kind" as JobKind,
      schedule: { type: "interval", intervalMs: 60_000 },
      nextRunAt: 0,
      enabled: true,
    });
    const before = store.get("change-1")!;
    expect(before.nextRunAt).toBeGreaterThan(Date.now() - 5000);

    // Re-register with a different interval (120s).
    const now = Date.now();
    const after = scheduler.registerOrResumeJob({
      id: "change-1",
      name: "Change Test",
      jobKind: "change-kind" as JobKind,
      schedule: { type: "interval", intervalMs: 120_000 },
      nextRunAt: 0,
      enabled: true,
    });

    // nextRunAt should have been recomputed (~now + 120s, not the old value).
    expect(after.nextRunAt).toBeGreaterThan(now);
    expect(after.schedule.intervalMs).toBe(120_000);

    // Stop the enabled scheduler so its 1s tick timer does not leak into later
    // tests and mutate shared state mid-assertion.
    scheduler.stop();
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe("lifecycle", () => {
  test("start/stop: timer is created and cleared", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 100,
      maxConcurrent: 2,
      enabled: true,
    });

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  test("start when disabled does not create a timer", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 100,
      maxConcurrent: 2,
      enabled: false,
    });

    scheduler.start();
    expect(scheduler.isRunning()).toBe(false);
  });

  test("double start is a no-op", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 100,
      maxConcurrent: 2,
      enabled: true,
    });

    scheduler.start();
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
  });
});

// ── Status ───────────────────────────────────────────────────────────────────

describe("status", () => {
  test("returns a snapshot of registered handlers + jobs", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: true,
    });

    scheduler.registerHandler("status-kind" as JobKind, async () => {});
    store.save(
      makeJob({
        id: "status-1",
        jobKind: "status-kind" as JobKind,
        nextRunAt: Date.now() - 1,
        enabled: true,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );

    const status = scheduler.status();
    expect(status.running).toBe(false); // not started
    expect(status.registeredHandlers).toContain("status-kind");
    expect(status.jobs.length).toBe(1);
    expect(status.jobs[0].id).toBe("status-1");
    expect(status.jobs[0].due).toBe(true);
  });
});

// ── Disabled master switch ───────────────────────────────────────────────────

describe("disabled master switch", () => {
  test("tick is a no-op when master switch is off", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 1000,
      maxConcurrent: 2,
      enabled: false,
    });

    let fired = false;
    scheduler.registerHandler("master-off-kind" as JobKind, async () => {
      fired = true;
    });
    store.save(
      makeJob({
        id: "master-off",
        jobKind: "master-off-kind" as JobKind,
        nextRunAt: Date.now() - 1,
        enabled: true,
        schedule: { type: "interval", intervalMs: 60_000 },
      }),
    );

    const result = await scheduler.tick();
    expect(fired).toBe(false);
    expect(result.fired).toBe(0);
    expect(result.evaluated).toBe(0); // no jobs evaluated when disabled
  });
});

// ── readEnabled / env-based construction ─────────────────────────────────────

describe("readEnabled (env-based construction)", () => {
  test("enabled defaults to false when env not set", () => {
    delete process.env.MASSA_AI_SCHEDULER_ENABLED;
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store });
    expect(scheduler.status().running).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(false);
    scheduler.stop();
  });

  test("enabled=true when MASSA_AI_SCHEDULER_ENABLED=true", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, tickIntervalMs: 60000 });
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    delete process.env.MASSA_AI_SCHEDULER_ENABLED;
  });

  test("enabled=true when MASSA_AI_SCHEDULER_ENABLED=1", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "1";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, tickIntervalMs: 60000 });
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    delete process.env.MASSA_AI_SCHEDULER_ENABLED;
  });
});

// ── unregisterHandler ──────────────────────────────────────────────────────────

describe("unregisterHandler", () => {
  test("unregisterHandler removes a handler", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    scheduler.registerHandler("unreg-kind" as JobKind, async () => {});
    expect(scheduler.registeredKinds()).toContain("unreg-kind");
    scheduler.unregisterHandler("unreg-kind" as JobKind);
    expect(scheduler.registeredKinds()).not.toContain("unreg-kind");
  });
});

// ── registerJob (upsert) ──────────────────────────────────────────────────────

describe("registerJob", () => {
  test("registerJob creates a new job with computed nextRunAt", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    const job = scheduler.registerJob({
      id: "rj-1",
      name: "Register Job Test",
      jobKind: "rj-kind" as JobKind,
      schedule: { type: "interval", intervalMs: 60_000 },
      nextRunAt: 0,
      enabled: true,
    });
    expect(job.nextRunAt).toBeGreaterThan(Date.now() - 5000);
    expect(store.get("rj-1")).not.toBeNull();
  });

  test("registerJob preserves lastRunAt from existing job", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    // Seed an existing job with lastRunAt.
    const existing = makeJob({
      id: "rj-2",
      lastRunAt: 12345,
      nextRunAt: Date.now() + 60_000,
    });
    store.save(existing);
    // Re-register with lastRunAt omitted → should preserve 12345.
    const job = scheduler.registerJob({
      id: "rj-2",
      name: "Test Job",
      jobKind: "test-kind" as JobKind,
      schedule: { type: "interval", intervalMs: 60_000 },
      nextRunAt: 0,
      enabled: true,
    });
    expect(job.lastRunAt).toBe(12345);
  });

  test("registerJob recomputes nextRunAt when schedule changes", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    // Seed an existing job.
    store.save(makeJob({
      id: "rj-3",
      schedule: { type: "interval", intervalMs: 60_000 },
      nextRunAt: Date.now() + 60_000,
    }));
    const before = store.get("rj-3")!.nextRunAt;
    // Re-register with a different interval.
    const job = scheduler.registerJob({
      id: "rj-3",
      name: "Test Job",
      jobKind: "test-kind" as JobKind,
      schedule: { type: "interval", intervalMs: 120_000 },
      nextRunAt: 0,
      enabled: true,
    });
    // nextRunAt should have been recomputed (different from before).
    expect(job.nextRunAt).not.toBe(before);
    expect(job.schedule.intervalMs).toBe(120_000);
  });

  test("registerJob preserves nextRunAt when schedule unchanged and nextRunAt != 0", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    const futureNext = Date.now() + 300_000;
    store.save(makeJob({
      id: "rj-4",
      schedule: { type: "interval", intervalMs: 60_000 },
      nextRunAt: futureNext,
    }));
    const job = scheduler.registerJob({
      id: "rj-4",
      name: "Test Job",
      jobKind: "test-kind" as JobKind,
      schedule: { type: "interval", intervalMs: 60_000 },
      nextRunAt: futureNext,
      enabled: true,
    });
    // Schedule unchanged + nextRunAt != 0 → preserved.
    expect(job.nextRunAt).toBe(futureNext);
  });
});

// ── removeJob ──────────────────────────────────────────────────────────────────

describe("removeJob", () => {
  test("removeJob deletes a job from the store", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    store.save(makeJob({ id: "rm-1" }));
    expect(store.get("rm-1")).not.toBeNull();
    scheduler.removeJob("rm-1");
    expect(store.get("rm-1")).toBeNull();
  });
});

// ── start() with real timer ──────────────────────────────────────────────────

describe("start() with real timer", () => {
  test("start creates a timer that ticks", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 50,
      maxConcurrent: 2,
      enabled: true,
    });
    let fired = false;
    scheduler.registerHandler("tick-kind" as JobKind, async () => { fired = true; });
    store.save(makeJob({
      id: "tick-1",
      jobKind: "tick-kind" as JobKind,
      nextRunAt: Date.now() - 1,
      schedule: { type: "interval", intervalMs: 60_000 },
    }));
    scheduler.start();
    // Wait for at least one tick.
    await new Promise((r) => setTimeout(r, 120));
    expect(fired).toBe(true);
    scheduler.stop();
  });
});

// ── catchUpMissedJobs ──────────────────────────────────────────────────────────

describe("catchUpMissedJobs", () => {
  test("catchUpMissedJobs fires one tick per missed job", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 5,
      enabled: true,
    });
    scheduler.registerHandler("catchup-kind" as JobKind, async () => {});
    // Two jobs that are way overdue (5 minutes past + tick = 60s → missed).
    const now = Date.now();
    store.save(makeJob({
      id: "catchup-1",
      jobKind: "catchup-kind" as JobKind,
      nextRunAt: now - 5 * 60_000,
      schedule: { type: "interval", intervalMs: 60_000 },
    }));
    store.save(makeJob({
      id: "catchup-2",
      jobKind: "catchup-kind" as JobKind,
      nextRunAt: now - 3 * 60_000,
      schedule: { type: "interval", intervalMs: 60_000 },
    }));
    const result = scheduler.catchUpMissedJobs(now);
    // Both are missed (> tickIntervalMs overdue). But same jobKind →
    // concurrency guard: the first fires, the second is skipped (running).
    expect(result.caughtUp + result.skipped).toBe(2);
    await new Promise((r) => setTimeout(r, 50));
  });

  test("catchUpMissedJobs is a no-op when disabled", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      enabled: false,
    });
    store.save(makeJob({
      id: "catchup-disabled",
      nextRunAt: Date.now() - 5 * 60_000,
    }));
    const result = scheduler.catchUpMissedJobs();
    expect(result.caughtUp).toBe(0);
    expect(result.skipped).toBe(0);
  });

  test("catchUpMissedJobs skips jobs not yet missed (within tick window)", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 5,
      enabled: true,
    });
    scheduler.registerHandler("not-missed" as JobKind, async () => {});
    // Job overdue by only 10s (< 60s tick) → not missed.
    store.save(makeJob({
      id: "not-missed-1",
      jobKind: "not-missed" as JobKind,
      nextRunAt: Date.now() - 10_000,
      schedule: { type: "interval", intervalMs: 60_000 },
    }));
    const result = scheduler.catchUpMissedJobs();
    expect(result.caughtUp).toBe(0);
  });
});

// ── isJobRunning ──────────────────────────────────────────────────────────────

describe("isJobRunning", () => {
  test("isJobRunning returns false when no handler is running", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    expect(scheduler.isJobRunning("test-kind" as JobKind)).toBe(false);
  });

  test("isJobRunning returns true while a handler is executing", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true, maxConcurrent: 5 });
    const runningCheck = new Promise<void>((resolve) => {
      scheduler.registerHandler("running-kind" as JobKind, async () => {
        // While this handler runs, isJobRunning should return true.
        expect(scheduler.isJobRunning("running-kind" as JobKind)).toBe(true);
        resolve();
        await new Promise((r) => setTimeout(r, 30));
      });
    });
    store.save(makeJob({
      id: "running-1",
      jobKind: "running-kind" as JobKind,
      nextRunAt: Date.now() - 1,
      schedule: { type: "interval", intervalMs: 60_000 },
    }));
    await scheduler.tick();
    await runningCheck;
    await new Promise((r) => setTimeout(r, 50));
    expect(scheduler.isJobRunning("running-kind" as JobKind)).toBe(false);
  });
});

// ── Singleton ──────────────────────────────────────────────────────────────────

describe("singleton", () => {
  test("getScheduler returns a shared instance", () => {
    delete process.env.MASSA_AI_SCHEDULER_ENABLED;
    const a = getScheduler();
    const b = getScheduler();
    expect(a).toBe(b);
    resetScheduler();
  });

  test("resetScheduler clears the cached instance and stops it", () => {
    const a = getScheduler();
    resetScheduler();
    const b = getScheduler();
    expect(a).not.toBe(b);
    resetScheduler();
  });
});
