/**
 * `Scheduler.status()` health projection (EB-SCH-3b).
 *
 * `fireJob` maintains and persists four health fields — lastSuccessAt,
 * lastFailureAt, consecutiveFailures, lastError — and `status()` did not carry
 * any of them outward. `GET /api/v1/scheduler/status`, the scheduler's only
 * black-box surface, therefore had nothing to read and emitted `null` / `0` as
 * literals. Measured on the live stack at one instant with both kinds having
 * fired: HTTP said `"lastSuccessAt":null` while SQL said
 * `last_success_at=1788787737541`. A job failing every tick was
 * indistinguishable over HTTP from a healthy one.
 *
 * These cases pin the projection only. The maintenance path is already covered
 * by `scheduler-catchup.test.ts` (FR-13) and is deliberately not re-tested
 * here — it never had the defect, and a behaviour test would pass with the
 * projection still broken.
 *
 * Uses the in-memory store, so no PostgreSQL and no live stack.
 */

import { describe, expect, test } from "bun:test";
import { Scheduler } from "../services/scheduler/index.js";
import type {
  ScheduledJob,
  ScheduledJobStore,
  JobKind,
} from "../services/scheduler/index.js";

function makeInMemoryStore(): ScheduledJobStore {
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
  };
}

function makeJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: "status-projection-job",
    name: "Status Projection Job",
    jobKind: "test-kind" as JobKind,
    schedule: { type: "interval", intervalMs: 60_000 },
    nextRunAt: 1_000_000,
    lastRunAt: 0,
    enabled: true,
    ...overrides,
  };
}

function schedulerWith(jobs: ScheduledJob[]): Scheduler {
  const store = makeInMemoryStore();
  for (const j of jobs) store.save(j);
  return new Scheduler({
    store,
    tickIntervalMs: 60_000,
    maxConcurrent: 2,
    enabled: true,
  });
}

describe("Scheduler.status() health projection (EB-SCH-3b)", () => {
  test("carries every persisted health field outward", () => {
    const scheduler = schedulerWith([
      makeJob({
        lastRunAt: 900,
        lastSuccessAt: 900,
        lastFailureAt: 800,
        consecutiveFailures: 0,
        lastError: null,
      }),
    ]);

    const job = scheduler.status(1_000)!.jobs[0]!;

    expect(job.lastSuccessAt).toBe(900);
    expect(job.lastFailureAt).toBe(800);
    expect(job.consecutiveFailures).toBe(0);
    expect(job.lastError).toBeNull();
  });

  test("a failing job is distinguishable from a healthy one", () => {
    // The defect made this comparison impossible over the status surface: both
    // jobs reported lastSuccessAt=null and consecutiveFailures=0 regardless of
    // what the store held.
    const scheduler = schedulerWith([
      makeJob({
        id: "healthy",
        nextRunAt: 1,
        lastSuccessAt: 500,
        lastFailureAt: null,
        consecutiveFailures: 0,
        lastError: null,
      }),
      makeJob({
        id: "failing",
        nextRunAt: 2,
        lastSuccessAt: null,
        lastFailureAt: 600,
        consecutiveFailures: 5,
        lastError: "handler threw",
      }),
    ]);

    const byId = new Map(scheduler.status(1_000).jobs.map((j) => [j.id, j]));
    const healthy = byId.get("healthy")!;
    const failing = byId.get("failing")!;

    expect(healthy.lastSuccessAt).toBe(500);
    expect(healthy.consecutiveFailures).toBe(0);

    expect(failing.lastSuccessAt).toBeNull();
    expect(failing.lastFailureAt).toBe(600);
    expect(failing.consecutiveFailures).toBe(5);
    expect(failing.lastError).toBe("handler threw");

    expect(failing.consecutiveFailures).not.toBe(healthy.consecutiveFailures);
    expect(failing.lastSuccessAt).not.toBe(healthy.lastSuccessAt);
  });

  test("a never-run job normalises absent fields rather than omitting them", () => {
    // On `ScheduledJob` these four are optional; on the status snapshot they
    // are required, so a consumer never has to tell "field absent" from "never
    // succeeded" — the ambiguity that let the hardcoded literals pass review.
    const scheduler = schedulerWith([makeJob()]);

    const job = scheduler.status(1_000).jobs[0]!;

    expect(job).toHaveProperty("lastSuccessAt");
    expect(job).toHaveProperty("lastFailureAt");
    expect(job).toHaveProperty("consecutiveFailures");
    expect(job).toHaveProperty("lastError");
    expect(job.lastSuccessAt).toBeNull();
    expect(job.lastFailureAt).toBeNull();
    expect(job.consecutiveFailures).toBe(0);
    expect(job.lastError).toBeNull();
  });

  test("the health fields do not disturb the pre-existing snapshot fields", () => {
    const scheduler = schedulerWith([
      makeJob({ id: "j", nextRunAt: 500, lastRunAt: 400, enabled: true }),
    ]);

    const job = scheduler.status(1_000).jobs[0]!;

    expect(job.id).toBe("j");
    expect(job.nextRunAt).toBe(500);
    expect(job.lastRunAt).toBe(400);
    expect(job.due).toBe(true); // enabled && nextRunAt <= now
    expect(job.currentlyRunning).toBe(false);
  });
});
