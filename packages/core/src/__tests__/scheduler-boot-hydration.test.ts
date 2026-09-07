/**
 * Boot-time hydration ordering (EB-SCH-6).
 *
 * `registerOrResumeJob` decides between preserving and recomputing `nextRunAt`
 * by comparing against a SYNCHRONOUS `store.get(id)`. `PgScheduledJobStore`
 * serves that read from an in-memory mirror it fills asynchronously —
 * `get()` calls `ensureHydrated()` fire-and-forget and answers immediately
 * (`scheduler-store-pg.ts:246-249`). At boot the mirror is still empty, so every
 * persisted job looked new and had its schedule reset to `now + intervalMs`.
 * Measured on the live stack: the drift equalled the restart duration, 20702 ms.
 *
 * `Scheduler.ready()` is the seam that closes it, and `apps/tools-api/src/
 * index.ts` awaits it before `registerDefaultJobs`.
 *
 * The double below models the real store's defining property — a synchronous
 * read that is blind until hydration resolves — rather than a store that is
 * simply slow. A double without that property could not sense this defect at
 * all: it would answer correctly on the first `get()` and both cases would pass.
 *
 * No PostgreSQL, no live stack, no timers.
 */

import { describe, expect, test } from "bun:test";
import { Scheduler } from "../services/scheduler/index.js";
import type {
  ScheduledJob,
  ScheduledJobStore,
  JobKind,
} from "../services/scheduler/index.js";

const INTERVAL_MS = 60_000;

/** A persisted row, as PostgreSQL would already hold it before a restart. */
function persistedJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: "boot-job",
    name: "Boot Job",
    jobKind: "test-kind" as JobKind,
    schedule: { type: "interval", intervalMs: INTERVAL_MS },
    // Far enough in the future that a recompute from `now` is unmistakable.
    nextRunAt: Date.now() + 10 * 60_000,
    lastRunAt: Date.now() - 50_000,
    enabled: true,
    ...overrides,
  };
}

/**
 * Mirror-backed store: reads answer from `mirror`, which starts EMPTY and is
 * filled only when `ready()` resolves — the shape of `PgScheduledJobStore`.
 */
function makeMirrorStore(persisted: ScheduledJob[]): ScheduledJobStore & {
  hydrations: number;
} {
  const mirror = new Map<string, ScheduledJob>();
  const db = new Map(persisted.map((j) => [j.id, j] as const));
  const store = {
    hydrations: 0,
    save(job: ScheduledJob): void {
      mirror.set(job.id, { ...job });
      db.set(job.id, { ...job });
    },
    get(id: string): ScheduledJob | null {
      const j = mirror.get(id);
      return j ? { ...j } : null;
    },
    listAll(): ScheduledJob[] {
      return Array.from(mirror.values()).sort((a, b) => a.nextRunAt - b.nextRunAt);
    },
    listEnabled(): ScheduledJob[] {
      return Array.from(mirror.values()).filter((j) => j.enabled);
    },
    delete(id: string): void {
      mirror.delete(id);
      db.delete(id);
    },
    async ready(): Promise<void> {
      store.hydrations++;
      // One microtask, matching the real store: hydration never completes
      // within the synchronous call that kicked it off.
      await Promise.resolve();
      for (const [id, job] of db) if (!mirror.has(id)) mirror.set(id, { ...job });
    },
  };
  return store;
}

function schedulerOver(store: ScheduledJobStore): Scheduler {
  return new Scheduler({
    store,
    tickIntervalMs: INTERVAL_MS,
    maxConcurrent: 2,
    enabled: true,
  });
}

describe("Scheduler.ready() before registration (EB-SCH-6)", () => {
  test("a persisted schedule survives registration once ready() is awaited", async () => {
    const persisted = persistedJob();
    const store = makeMirrorStore([persisted]);
    const scheduler = schedulerOver(store);

    await scheduler.ready();
    const resumed = scheduler.registerOrResumeJob({
      id: persisted.id,
      name: persisted.name,
      jobKind: persisted.jobKind,
      schedule: persisted.schedule,
      // Callers pass 0: the persisted value is the one that must win.
      nextRunAt: 0,
      enabled: true,
    });

    expect(resumed.nextRunAt).toBe(persisted.nextRunAt);
    expect(resumed.lastRunAt).toBe(persisted.lastRunAt);
  });

  test("registering WITHOUT ready() resets the schedule — the reason the await exists", async () => {
    // This case asserts the defect's mechanism on purpose, so the guard cannot
    // outlive its own reason unnoticed. If a future change makes `get()`
    // answer from persisted state synchronously, this test fails and says the
    // await in apps/tools-api/src/index.ts is now redundant — rather than
    // leaving it in place forever as unexplained ceremony.
    const persisted = persistedJob();
    const store = makeMirrorStore([persisted]);
    const scheduler = schedulerOver(store);

    const before = Date.now();
    const registered = scheduler.registerOrResumeJob({
      id: persisted.id,
      name: persisted.name,
      jobKind: persisted.jobKind,
      schedule: persisted.schedule,
      nextRunAt: 0,
      enabled: true,
    });

    expect(registered.nextRunAt).not.toBe(persisted.nextRunAt);
    // Recomputed from now, which is the observable signature: on the live stack
    // the drift equalled the restart duration rather than a schedule interval.
    expect(registered.nextRunAt).toBeGreaterThanOrEqual(before + INTERVAL_MS);
    expect(store.hydrations).toBe(0);
  });

  test("ready() is idempotent across repeated awaits", async () => {
    const store = makeMirrorStore([persistedJob()]);
    const scheduler = schedulerOver(store);

    await scheduler.ready();
    await scheduler.ready();

    expect(store.hydrations).toBe(2);
    expect(scheduler.status().jobs).toHaveLength(1);
  });

  test("a store with no ready() is already ready and does not throw", async () => {
    // The in-memory store and every existing test double omit `ready()`; the
    // optional call must degrade to a no-op rather than a TypeError at boot.
    const map = new Map<string, ScheduledJob>();
    const bare: ScheduledJobStore = {
      save: (j) => void map.set(j.id, j),
      get: (id) => map.get(id) ?? null,
      listAll: () => Array.from(map.values()),
      listEnabled: () => Array.from(map.values()).filter((j) => j.enabled),
      delete: (id) => void map.delete(id),
    };
    expect(bare.ready).toBeUndefined();

    const scheduler = schedulerOver(bare);
    await scheduler.ready();

    const persisted = persistedJob();
    bare.save(persisted);
    const resumed = scheduler.registerOrResumeJob({
      id: persisted.id,
      name: persisted.name,
      jobKind: persisted.jobKind,
      schedule: persisted.schedule,
      nextRunAt: 0,
      enabled: true,
    });
    expect(resumed.nextRunAt).toBe(persisted.nextRunAt);
  });
});
