import { describe, expect, test } from "bun:test";
import { Scheduler } from "../services/scheduler/index.js";
import type { JobKind, ScheduledJob, ScheduledJobStore } from "../services/scheduler/index.js";

const TICK = 60_000;

function makeStore(): ScheduledJobStore {
  const map = new Map<string, ScheduledJob>();
  return {
    save: (job) => { map.set(job.id, { ...job }); },
    get: (id) => { const job = map.get(id); return job ? { ...job } : null; },
    listAll: () => [...map.values()].map((j) => ({ ...j })),
    listEnabled: () => [...map.values()].filter((j) => j.enabled).map((j) => ({ ...j })),
    delete: (id) => { map.delete(id); },
  };
}

function makeJob(id: string, kind: string, nextRunAt: number): ScheduledJob {
  return {
    id,
    name: id,
    jobKind: kind as JobKind,
    schedule: { type: "interval", intervalMs: 10 * TICK },
    nextRunAt,
    lastRunAt: 0,
    enabled: true,
  };
}

function setup(opts: { maxConcurrent?: number } = {}) {
  const store = makeStore();
  let busy = false;
  let fail: Error | null = null;
  let probes = 0;
  const fired: string[] = [];
  const scheduler = new Scheduler({
    store,
    enabled: true,
    tickIntervalMs: TICK,
    maxConcurrent: opts.maxConcurrent ?? 2,
    heavyWorkProbe: async () => {
      probes++;
      if (fail) throw fail;
      return busy ? { busy: true, reason: "indexing run 1 (proj)" } : { busy: false };
    },
  });
  for (const kind of ["kind-a", "kind-b"]) {
    scheduler.registerHandler(kind as JobKind, (job) => { fired.push(job.id); });
  }
  return {
    store,
    scheduler,
    fired,
    setBusy: (value: boolean) => { busy = value; },
    setFailure: (error: Error | null) => { fail = error; },
    probes: () => probes,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("Scheduler heavy-work gate", () => {
  test("defers a due job while heavy work runs, without rescheduling it", async () => {
    const t = setup();
    const now = Date.now();
    t.store.save(makeJob("a", "kind-a", now - 1_000));
    t.setBusy(true);

    const result = await t.scheduler.tick(now);
    await settle();

    expect(result).toMatchObject({ fired: 0, deferred: 1 });
    expect(t.fired).toEqual([]);
    expect(t.store.get("a")!.nextRunAt).toBe(now - 1_000);
    expect(t.scheduler.status(now).jobs.find((j) => j.id === "a")!.deferred).toBe(true);
  });

  test("runs a deferred job once when the work ends, even if overdue past the missed-run window", async () => {
    const t = setup();
    const start = Date.now();
    t.store.save(makeJob("a", "kind-a", start - 1_000));
    t.setBusy(true);
    await t.scheduler.tick(start);

    t.setBusy(false);
    const later = start + 5 * TICK;
    const result = await t.scheduler.tick(later);
    await settle();

    expect(result).toMatchObject({ fired: 1, deferred: 0 });
    expect(t.fired).toEqual(["a"]);
    expect(t.store.get("a")!.nextRunAt).toBe(later + 10 * TICK);
    expect(t.scheduler.status(later).jobs.find((j) => j.id === "a")!.deferred).toBe(false);

    await t.scheduler.tick(later + TICK);
    await settle();
    expect(t.fired).toEqual(["a"]);
  });

  test("an overdue job that was never deferred keeps the missed-run policy", async () => {
    const t = setup();
    const now = Date.now();
    t.store.save(makeJob("a", "kind-a", now - 5 * TICK));

    const result = await t.scheduler.tick(now);
    await settle();

    expect(result).toMatchObject({ fired: 0, skipped: 1 });
    expect(t.fired).toEqual([]);
  });

  test("a deferred job held back by the concurrency cap stays deferred", async () => {
    const t = setup({ maxConcurrent: 1 });
    const start = Date.now();
    t.store.save(makeJob("a", "kind-a", start - 1_000));
    t.store.save(makeJob("b", "kind-b", start - 1_000));
    let release!: () => void;
    t.scheduler.registerHandler("kind-a" as JobKind, () => new Promise<void>((resolve) => { release = resolve; }));
    t.scheduler.registerHandler("kind-b" as JobKind, (job) => { t.fired.push(job.id); });
    t.setBusy(true);
    await t.scheduler.tick(start);

    t.setBusy(false);
    await t.scheduler.tick(start + 3 * TICK);
    expect(t.scheduler.isJobRunning("kind-a" as JobKind)).toBe(true);
    expect(t.fired).toEqual([]);

    release();
    await settle();
    await t.scheduler.tick(start + 6 * TICK);
    await settle();
    expect(t.fired).toEqual(["b"]);
  });

  test("a failing probe defers due jobs and is reported in status", async () => {
    const t = setup();
    const now = Date.now();
    t.store.save(makeJob("a", "kind-a", now - 1_000));
    t.setFailure(new Error("pg unreachable"));

    await t.scheduler.tick(now);
    await t.scheduler.tick(now + 1);
    await settle();

    expect(t.fired).toEqual([]);
    expect(t.scheduler.status(now).heavyWork).toEqual({
      lastProbeError: "pg unreachable",
      consecutiveProbeFailures: 2,
    });

    t.setFailure(null);
    await t.scheduler.tick(now + 2 * TICK);
    await settle();
    expect(t.fired).toEqual(["a"]);
    expect(t.scheduler.status(now).heavyWork).toEqual({ lastProbeError: null, consecutiveProbeFailures: 0 });
  });

  test("does not probe when nothing is due", async () => {
    const t = setup();
    const now = Date.now();
    t.store.save(makeJob("a", "kind-a", now + TICK));
    await t.scheduler.tick(now);
    expect(t.probes()).toBe(0);
  });

  test("boot catch-up defers missed jobs while heavy work runs, then the first idle tick runs them", async () => {
    const t = setup();
    const now = Date.now();
    t.store.save(makeJob("a", "kind-a", now - 5 * TICK));
    t.setBusy(true);

    const catchUp = await t.scheduler.catchUpMissedJobs(now);
    await settle();
    expect(catchUp).toEqual({ caughtUp: 0, skipped: 0, deferred: 1 });
    expect(t.fired).toEqual([]);

    t.setBusy(false);
    await t.scheduler.tick(now + TICK);
    await settle();
    expect(t.fired).toEqual(["a"]);
  });
});
