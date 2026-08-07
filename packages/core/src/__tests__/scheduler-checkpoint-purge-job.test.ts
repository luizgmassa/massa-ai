/**
 * Track 5 (data hygiene) — checkpoint-purge default scheduled job.
 *
 * Wires the existing `PgCheckpointStore.purgeExpired()`
 * (`services/checkpoint/checkpoint-store-pg.ts`) as a scheduler default job,
 * default-DISABLED, controlled by `MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED`
 * / `MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS` — same pattern as the
 * sibling default jobs in `scheduler-safe-defaults.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  Scheduler,
  resetScheduledJobStore,
} from "../services/scheduler/index.js";
import { DEFAULT_SCHEDULED_JOBS, registerDefaultJobs } from "../services/scheduler/scheduler-defaults.js";
import type { ScheduledJobStore, ScheduledJob } from "../services/scheduler/index.js";

// Mock the checkpoint manager so the handler body can execute without a DB.
let purgeExpiredCalls = 0;

mock.module("../services/checkpoint/checkpoint-manager.js", () => ({
  CheckpointManager: {
    getInstance: () => ({
      purgeExpired: () => {
        purgeExpiredCalls++;
        return 3;
      },
    }),
  },
}));

function makeInMemoryStore(): ScheduledJobStore & {
  _dump(): ScheduledJob[];
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
  };
}

const ENV_KEYS = [
  "MASSA_AI_SCHEDULER_ENABLED",
  "MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED",
  "MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS",
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  resetScheduledJobStore();
  purgeExpiredCalls = 0;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetScheduledJobStore();
});

function jobByName(scheduler: Scheduler): Record<string, ScheduledJob> {
  const jobs = (scheduler as unknown as { store: ScheduledJobStore & { _dump(): ScheduledJob[] } }).store._dump();
  const map: Record<string, ScheduledJob> = {};
  for (const j of jobs) {
    map[j.jobKind] = j;
  }
  return map;
}

describe("Track 5: checkpoint-purge default scheduled job", () => {
  test("checkpoint-purge is registered in DEFAULT_SCHEDULED_JOBS, default-disabled", () => {
    const def = DEFAULT_SCHEDULED_JOBS.find((j) => j.jobKind === "checkpoint-purge");
    expect(def).toBeDefined();
    expect(def?.defaultEnabled).toBe(false);
    expect(def?.enableEnvVar).toBe("MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED");
    expect(def?.intervalEnvVar).toBe("MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS");
  });

  test("registerDefaultJobs registers the checkpoint-purge handler", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: false });
    registerDefaultJobs(scheduler);
    expect(scheduler.registeredKinds()).toContain("checkpoint-purge");
  });

  test("checkpoint-purge job is disabled by default (no env set)", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["checkpoint-purge"]?.enabled).toBe(false);
  });

  test("MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED=true enables the job", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["checkpoint-purge"]?.enabled).toBe(true);
  });

  test("MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS overrides the default interval", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS = "120000"; // 2 min
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["checkpoint-purge"]?.schedule.intervalMs).toBe(120000);
  });

  test("handler fires through the scheduler and calls CheckpointManager.purgeExpired()", async () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true, tickIntervalMs: 60000 });
    registerDefaultJobs(scheduler);
    const jobs = store._dump();
    const purge = jobs.find((j) => j.jobKind === "checkpoint-purge");
    expect(purge).toBeDefined();
    expect(purge!.enabled).toBe(true);
    if (purge) {
      purge.nextRunAt = Date.now() - 1;
      store.save(purge);
    }
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 100));
    expect(purgeExpiredCalls).toBe(1);
    scheduler.stop();
  });
});
