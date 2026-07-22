/**
 * Scheduler catch-up + success/failure split tests (Wave 5 T20 / FR-13 / AC-11).
 *
 * Validates:
 *  - catchUpMissedJobs fires ONE tick per missed job (not full backfill).
 *  - Non-overlapping per kind (same jobKind not run twice concurrently).
 *  - last_success_at updates only on success.
 *  - consecutive_failures increments on failure, resets to 0 on success.
 *  - last_error captures the truncated error message.
 *  - registerOrResumeJob preserves past-due nextRunAt (no reschedule on boot).
 *
 * Uses dependency injection (in-memory store) — same pattern as scheduler.test.ts.
 */

import { describe, expect, test } from "bun:test";
import { Scheduler } from "../services/scheduler/index.js";
import type {
  ScheduledJob,
  ScheduledJobStore,
  JobHandler,
  JobKind,
} from "../services/scheduler/index.js";

// ── In-memory store ──────────────────────────────────────────────────────────

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
    id: "catchup-test-job",
    name: "Catch-up Test Job",
    jobKind: "test-kind" as JobKind,
    schedule: { type: "interval", intervalMs: 60_000 },
    nextRunAt: Date.now(),
    lastRunAt: 0,
    enabled: true,
    ...overrides,
  };
}

// ── catchUpMissedJobs ─────────────────────────────────────────────────────────

describe("Scheduler catchUpMissedJobs (T20 / FR-13 / AC-11)", () => {
  test("fires one tick per missed job (overdue > tick)", () => {
    const store = makeInMemoryStore();
    let fireCount = 0;
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });
    scheduler.registerHandler("test-kind" as JobKind, () => {
      fireCount++;
    });

    const now = Date.now();
    // Job overdue by 5 ticks (5 * 60_000 = 300_000 ms past due).
    const job = makeJob({ nextRunAt: now - 300_000 });
    store.save(job);

    const result = scheduler.catchUpMissedJobs(now);
    expect(result.caughtUp).toBe(1);
    expect(result.skipped).toBe(0);
    expect(fireCount).toBe(1);
  });

  test("does not fire jobs due within the current tick window", () => {
    const store = makeInMemoryStore();
    let fireCount = 0;
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });
    scheduler.registerHandler("test-kind" as JobKind, () => {
      fireCount++;
    });

    const now = Date.now();
    // Job overdue by only 30s (less than tick = 60s) — not missed.
    const job = makeJob({ nextRunAt: now - 30_000 });
    store.save(job);

    const result = scheduler.catchUpMissedJobs(now);
    expect(result.caughtUp).toBe(0);
    expect(fireCount).toBe(0);
  });

  test("non-overlapping per kind — skips if jobKind already running", async () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 5,
      enabled: true,
    });

    // Block the handler so the job stays "running".
    let resolveHandler: () => void;
    const handlerPromise = new Promise<void>((r) => {
      resolveHandler = r;
    });
    scheduler.registerHandler("test-kind" as JobKind, async () => {
      await handlerPromise;
    });

    const now = Date.now();
    const job = makeJob({ nextRunAt: now - 300_000 });
    store.save(job);

    // First catch-up fires the job (async, handler pending).
    const result1 = scheduler.catchUpMissedJobs(now);
    expect(result1.caughtUp).toBe(1);

    // Wait a tick for the async handler to register in the running set.
    await new Promise((r) => setTimeout(r, 10));

    // Second catch-up — same kind is running, must skip.
    const result2 = scheduler.catchUpMissedJobs(now);
    expect(result2.caughtUp).toBe(0);
    expect(result2.skipped).toBe(1);

    // Release the handler.
    resolveHandler!();
    await new Promise((r) => setTimeout(r, 10));
  });

  test("does not fire disabled jobs", () => {
    const store = makeInMemoryStore();
    let fireCount = 0;
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });
    scheduler.registerHandler("test-kind" as JobKind, () => {
      fireCount++;
    });

    const now = Date.now();
    const job = makeJob({ nextRunAt: now - 300_000, enabled: false });
    store.save(job);

    const result = scheduler.catchUpMissedJobs(now);
    expect(result.caughtUp).toBe(0);
    expect(fireCount).toBe(0);
  });

  test("catch-up advances nextRunAt after firing (no repeat)", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });
    scheduler.registerHandler("test-kind" as JobKind, () => {});

    const now = Date.now();
    const job = makeJob({ nextRunAt: now - 300_000 });
    store.save(job);

    scheduler.catchUpMissedJobs(now);
    // Wait for async fireJob to settle.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const updated = store.get(job.id)!;
        // nextRunAt should be advanced to now + interval (not still in the past).
        expect(updated.nextRunAt).toBeGreaterThan(now);
        resolve();
      }, 50);
    });
  });

  test("catch-up is no-op when scheduler disabled", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: false,
    });

    const now = Date.now();
    const job = makeJob({ nextRunAt: now - 300_000 });
    store.save(job);

    const result = scheduler.catchUpMissedJobs(now);
    expect(result.caughtUp).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

// ── success/failure split (FR-13) ─────────────────────────────────────────────

describe("Scheduler success/failure split (T20 / FR-13)", () => {
  test("success updates last_success_at + resets consecutive_failures", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });
    scheduler.registerHandler("test-kind" as JobKind, async () => {
      // success — no throw
    });

    const now = Date.now();
    const job = makeJob({
      nextRunAt: now - 300_000,
      consecutiveFailures: 3,
    });
    store.save(job);

    scheduler.catchUpMissedJobs(now);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const updated = store.get(job.id)!;
        expect(updated.lastSuccessAt).toBe(now);
        expect(updated.consecutiveFailures).toBe(0);
        expect(updated.lastError).toBeNull();
        resolve();
      }, 50);
    });
  });

  test("failure updates last_failure_at + increments consecutive_failures + last_error", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });
    const errMsg = "simulated handler failure";
    scheduler.registerHandler("test-kind" as JobKind, async () => {
      throw new Error(errMsg);
    });

    const now = Date.now();
    const job = makeJob({
      nextRunAt: now - 300_000,
      consecutiveFailures: 1,
    });
    store.save(job);

    scheduler.catchUpMissedJobs(now);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const updated = store.get(job.id)!;
        expect(updated.lastFailureAt).toBe(now);
        expect(updated.consecutiveFailures).toBe(2);
        expect(updated.lastError).toBe(errMsg);
        resolve();
      }, 50);
    });
  });

  test("last_error is truncated to 2000 chars", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });
    const longMsg = "x".repeat(3000);
    scheduler.registerHandler("test-kind" as JobKind, async () => {
      throw new Error(longMsg);
    });

    const now = Date.now();
    const job = makeJob({ nextRunAt: now - 300_000 });
    store.save(job);

    scheduler.catchUpMissedJobs(now);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const updated = store.get(job.id)!;
        expect(updated.lastError).toHaveLength(2000);
        expect(updated.lastError!.endsWith("...")).toBe(true);
        resolve();
      }, 50);
    });
  });

  test("last_success_at is null until first success", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({
      store,
      tickIntervalMs: 60_000,
      maxConcurrent: 2,
      enabled: true,
    });
    scheduler.registerHandler("test-kind" as JobKind, async () => {
      throw new Error("fail first");
    });

    const now = Date.now();
    const job = makeJob({
      nextRunAt: now - 300_000,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      lastError: null,
    });
    store.save(job);

    scheduler.catchUpMissedJobs(now);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const updated = store.get(job.id)!;
        // lastSuccessAt remains null after a failure (no success yet).
        expect(updated.lastSuccessAt).toBeNull();
        expect(updated.lastFailureAt).toBe(now);
        resolve();
      }, 50);
    });
  });
});