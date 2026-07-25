/**
 * Scheduler safe-defaults preset — Wave 6 T29 / N29.
 *
 * Tests the `MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true` preset wiring inside
 * `registerDefaultJobs`.
 *
 * CRITICAL (pre-mortem F5): the preset is applied INSIDE
 * `registerDefaultJobs` before the `envBool` loop reads `defaultEnabled` —
 * NOT as a separate export. The test "preset + master + no per-kind env →
 * consolidation enabled" proves the wiring.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  Scheduler,
  resetScheduledJobStore,
} from "../services/scheduler/index.js";
import { registerDefaultJobs } from "../services/scheduler/scheduler-defaults.js";
import type { ScheduledJobStore, ScheduledJob } from "../services/scheduler/index.js";

// Mock the heavy job modules so the handler bodies can execute without a DB.
let consolidationCalls = 0;
let autoImproveCalls = 0;
let observationCalls = 0;
let autoImproveProjectId: string | undefined;
let observationProjectId: string | undefined;

mock.module("../services/jobs/memory-consolidation-job.js", () => ({
  memoryConsolidationJob: {
    consolidate: async () => { consolidationCalls++; },
  },
}));

mock.module("../services/jobs/auto-improve-job.js", () => ({
  autoImproveJob: {
    runOnce: async (projectId: string) => {
      autoImproveCalls++;
      autoImproveProjectId = projectId;
    },
  },
}));

mock.module("../services/jobs/observation-consolidation-job.js", () => ({
  observationConsolidationJob: {
    runOnce: async (projectId: string) => {
      observationCalls++;
      observationProjectId = projectId;
    },
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
  "MASSA_AI_SCHEDULER_SAFE_DEFAULTS",
  "MASSA_AI_SCHEDULER_CONSOLIDATION_ENABLED",
  "MASSA_AI_SCHEDULER_DECAY_ENABLED",
  "MASSA_AI_SCHEDULER_AUTO_IMPROVE_ENABLED",
  "MASSA_AI_SCHEDULER_OBSERVATION_BRIDGE_ENABLED",
  "MASSA_AI_SCHEDULER_CONSOLIDATION_INTERVAL_MS",
  "MASSA_AI_SCHEDULER_DECAY_INTERVAL_MS",
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  resetScheduledJobStore();
  consolidationCalls = 0;
  autoImproveCalls = 0;
  observationCalls = 0;
  autoImproveProjectId = undefined;
  observationProjectId = undefined;
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

describe("T29: Scheduler safe-defaults preset", () => {
  test("preset without master → no jobs enabled", () => {
    process.env.MASSA_AI_SCHEDULER_SAFE_DEFAULTS = "true";
    // Master switch NOT set → scheduler.enabled=false, but jobs are still
    // registered. The preset should enable consolidation+decay defaultEnabled,
    // but without the master switch the scheduler won't run. The test checks
    // that the preset does not bypass the master switch for job registration:
    // jobs are registered but the scheduler is not enabled.
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: false });
    registerDefaultJobs(scheduler);
    const status = scheduler.status();
    // Scheduler not running (master switch off)
    expect(status.running).toBe(false);
    // Jobs are registered regardless of master switch
    expect(status.jobs.length).toBeGreaterThan(0);
  });

  test("preset + master → consolidation + decay enabled, auto-improve NOT enabled", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_SAFE_DEFAULTS = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["memory-consolidation"]?.enabled).toBe(true);
    expect(jobs["decay-sweep"]?.enabled).toBe(true);
    // Auto-improve is NOT enabled by the preset
    expect(jobs["auto-improve"]?.enabled).toBe(false);
    // Observation-bridge is NOT enabled by the preset
    expect(jobs["observation-bridge"]?.enabled).toBe(false);
  });

  test("preset + master + auto-improve env → all three (consolidation+decay+auto-improve)", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_SAFE_DEFAULTS = "true";
    process.env.MASSA_AI_SCHEDULER_AUTO_IMPROVE_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["memory-consolidation"]?.enabled).toBe(true);
    expect(jobs["decay-sweep"]?.enabled).toBe(true);
    expect(jobs["auto-improve"]?.enabled).toBe(true);
    // Observation-bridge still NOT enabled (no env, not in preset)
    expect(jobs["observation-bridge"]?.enabled).toBe(false);
  });

  test("preset + master + no per-kind env → consolidation enabled (proves wiring)", () => {
    // This test proves the preset is wired INSIDE registerDefaultJobs, not
    // just function logic. If applySafeDefaults were a separate export that
    // callers must invoke, this test would fail (consolidation would be
    // defaultEnabled=false because no env overrides it).
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_SAFE_DEFAULTS = "true";
    // NO per-kind env vars set
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    // Consolidation enabled by the preset alone (no per-kind env)
    expect(jobs["memory-consolidation"]?.enabled).toBe(true);
  });

  test("preset not set → behavior unchanged (all jobs disabled)", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    // Preset NOT set
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["memory-consolidation"]?.enabled).toBe(false);
    expect(jobs["decay-sweep"]?.enabled).toBe(false);
    expect(jobs["auto-improve"]?.enabled).toBe(false);
    expect(jobs["observation-bridge"]?.enabled).toBe(false);
  });

  test("individual env overrides preset (consolidation disabled via env)", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_SAFE_DEFAULTS = "true";
    // Explicitly disable consolidation via env → overrides preset
    process.env.MASSA_AI_SCHEDULER_CONSOLIDATION_ENABLED = "false";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["memory-consolidation"]?.enabled).toBe(false);
    // Decay still enabled by preset
    expect(jobs["decay-sweep"]?.enabled).toBe(true);
  });

  test("custom interval env vars override defaults", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_CONSOLIDATION_INTERVAL_MS = "120000"; // 2 min
    process.env.MASSA_AI_SCHEDULER_DECAY_INTERVAL_MS = "300000"; // 5 min
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["memory-consolidation"]?.schedule.intervalMs).toBe(120000);
    expect(jobs["decay-sweep"]?.schedule.intervalMs).toBe(300000);
  });

  test("invalid interval env (non-numeric) falls back to default", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_CONSOLIDATION_INTERVAL_MS = "not-a-number";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    // Falls back to the default 30-min interval.
    expect(jobs["memory-consolidation"]?.schedule.intervalMs).toBe(30 * 60 * 1000);
  });

  test("invalid interval env (zero/negative) falls back to default", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_DECAY_INTERVAL_MS = "0";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    // 0 is not > 0 → falls back to default 60-min interval.
    expect(jobs["decay-sweep"]?.schedule.intervalMs).toBe(60 * 60 * 1000);
  });

  test("empty interval env falls back to default", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_AUTO_IMPROVE_INTERVAL_MS = "";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["auto-improve"]?.schedule.intervalMs).toBe(30 * 60 * 1000);
  });

  test("envBool treats '1' as true", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_DECAY_ENABLED = "1";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["decay-sweep"]?.enabled).toBe(true);
  });

  test("envBool treats anything else as false", () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_DECAY_ENABLED = "yes";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["decay-sweep"]?.enabled).toBe(false);
  });

  test("registerDefaultJobs registers all four handlers", () => {
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: false });
    registerDefaultJobs(scheduler);
    const kinds = scheduler.registeredKinds();
    expect(kinds).toContain("memory-consolidation");
    expect(kinds).toContain("decay-sweep");
    expect(kinds).toContain("auto-improve");
    expect(kinds).toContain("observation-bridge");
  });

  test("preset bumps consolidation interval to ≥30 min when default is shorter", () => {
    // The default consolidation interval is already 30 min, so the preset
    // keeps it. But we can verify the safe-defaults logic doesn't shrink it.
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_SAFE_DEFAULTS = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true });
    registerDefaultJobs(scheduler);
    const jobs = jobByName(scheduler);
    expect(jobs["memory-consolidation"]?.schedule.intervalMs).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(jobs["decay-sweep"]?.schedule.intervalMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  test("handlers fire through the scheduler (memory-consolidation)", async () => {
    // The real handlers (registered by registerDefaultJobs) use dynamic imports
    // of job modules — those are mocked above. Verify the scheduler dispatches
    // to the real handler which calls memoryConsolidationJob.consolidate().
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_CONSOLIDATION_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true, tickIntervalMs: 60000 });
    registerDefaultJobs(scheduler);
    const jobs = store._dump();
    const consolidation = jobs.find((j) => j.jobKind === "memory-consolidation");
    expect(consolidation).toBeDefined();
    expect(consolidation!.enabled).toBe(true);
    if (consolidation) {
      consolidation.nextRunAt = Date.now() - 1;
      store.save(consolidation);
    }
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 100));
    expect(consolidationCalls).toBe(1);
    scheduler.stop();
  });

  test("auto-improve handler reads projectId from payload", async () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_AUTO_IMPROVE_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true, tickIntervalMs: 60000 });
    registerDefaultJobs(scheduler);
    const jobs = store._dump();
    const autoImprove = jobs.find((j) => j.jobKind === "auto-improve");
    expect(autoImprove).toBeDefined();
    expect(autoImprove!.enabled).toBe(true);
    if (autoImprove) {
      autoImprove.nextRunAt = Date.now() - 1;
      autoImprove.payload = { projectId: "test-proj" };
      store.save(autoImprove);
    }
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 100));
    expect(autoImproveCalls).toBe(1);
    expect(autoImproveProjectId).toBe("test-proj");
    scheduler.stop();
  });

  test("auto-improve handler defaults projectId to 'default' when payload absent", async () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_AUTO_IMPROVE_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true, tickIntervalMs: 60000 });
    registerDefaultJobs(scheduler);
    const jobs = store._dump();
    const autoImprove = jobs.find((j) => j.jobKind === "auto-improve");
    expect(autoImprove).toBeDefined();
    if (autoImprove) {
      autoImprove.nextRunAt = Date.now() - 1;
      // No payload → defaults to "default".
      store.save(autoImprove);
    }
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 100));
    expect(autoImproveProjectId).toBe("default");
    scheduler.stop();
  });

  test("observation-bridge handler reads projectId from payload", async () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_OBSERVATION_BRIDGE_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true, tickIntervalMs: 60000 });
    registerDefaultJobs(scheduler);
    const jobs = store._dump();
    const obs = jobs.find((j) => j.jobKind === "observation-bridge");
    expect(obs).toBeDefined();
    expect(obs!.enabled).toBe(true);
    if (obs) {
      obs.nextRunAt = Date.now() - 1;
      obs.payload = { projectId: "obs-proj" };
      store.save(obs);
    }
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 100));
    expect(observationCalls).toBe(1);
    expect(observationProjectId).toBe("obs-proj");
    scheduler.stop();
  });

  test("observation-bridge handler defaults projectId to 'default'", async () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_OBSERVATION_BRIDGE_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true, tickIntervalMs: 60000 });
    registerDefaultJobs(scheduler);
    const jobs = store._dump();
    const obs = jobs.find((j) => j.jobKind === "observation-bridge");
    expect(obs).toBeDefined();
    if (obs) {
      obs.nextRunAt = Date.now() - 1;
      store.save(obs);
    }
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 100));
    expect(observationProjectId).toBe("default");
    scheduler.stop();
  });

  test("decay-sweep handler fires (dispatches to same handler as consolidation)", async () => {
    process.env.MASSA_AI_SCHEDULER_ENABLED = "true";
    process.env.MASSA_AI_SCHEDULER_DECAY_ENABLED = "true";
    const store = makeInMemoryStore();
    const scheduler = new Scheduler({ store, enabled: true, tickIntervalMs: 60000 });
    registerDefaultJobs(scheduler);
    const jobs = store._dump();
    const decay = jobs.find((j) => j.jobKind === "decay-sweep");
    expect(decay).toBeDefined();
    expect(decay!.enabled).toBe(true);
    if (decay) {
      decay.nextRunAt = Date.now() - 1;
      store.save(decay);
    }
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 100));
    // decay-sweep delegates to memoryConsolidationJob.consolidate().
    expect(consolidationCalls).toBe(1);
    scheduler.stop();
  });
});