/**
 * Default scheduled-job registration — wires the existing job implementations
 * to the scheduler as default-DISABLED, conservative-interval jobs.
 *
 * This does NOT rewrite the existing jobs. It registers their existing
 * entrypoints as handlers and defines default job rows. A deployment opts in by
 * setting MASSA_TH0TH_SCHEDULER_ENABLED=true (master switch) AND the per-kind
 * enable env var (e.g. MASSA_TH0TH_SCHEDULER_CONSOLIDATION_ENABLED=true).
 *
 * Job kinds and their existing entrypoints:
 *   memory-consolidation → memoryConsolidationJob.consolidate()
 *   decay-sweep          → memoryConsolidationJob.consolidate() (decay is a
 *                          phase inside consolidate; there is no standalone
 *                          decay-sweep entrypoint — decay.ts is a pure fn called
 *                          by consolidate's decayStaleMemories phase). We map
 *                          decay-sweep to the same handler so a clock-triggered
 *                          decay pass runs the full consolidate cycle, which
 *                          includes decay + prune + merge. This is the safest
 *                          reuse: the existing debounce trigger already calls
 *                          consolidate(), and the scheduler does the same on a
 *                          clock.
 *   auto-improve         → autoImproveJob.runOnce(projectId)
 *   observation-bridge   → observationConsolidationJob.runOnce(projectId)
 *
 * IMPORTANT: the scheduler must NEVER trigger indexing jobs (OOM risk per
 * project memory). Only memory/decay/consolidation/auto-improve/observation
 * jobs are registered here.
 */

import { logger } from "@massa-th0th/shared";
import type { Scheduler } from "./scheduler.js";
import type { JobKind, ScheduleSpec } from "./scheduler-types.js";

// ── Default intervals (conservative) ─────────────────────────────────────────

const MIN = 60 * 1000;
const THIRTY_MIN = 30 * MIN;
const ONE_HOUR = 60 * MIN;

interface DefaultJobDef {
  id: string;
  name: string;
  jobKind: JobKind;
  schedule: ScheduleSpec;
  /** Default enable state (env can override). */
  defaultEnabled: boolean;
  /** Env var that overrides the enable flag. */
  enableEnvVar: string;
  /** Env var that overrides the interval (ms). */
  intervalEnvVar: string;
}

export const DEFAULT_SCHEDULED_JOBS: DefaultJobDef[] = [
  {
    id: "scheduled-memory-consolidation",
    name: "Memory Consolidation (clock)",
    jobKind: "memory-consolidation",
    schedule: { type: "interval", intervalMs: THIRTY_MIN },
    defaultEnabled: false,
    enableEnvVar: "MASSA_TH0TH_SCHEDULER_CONSOLIDATION_ENABLED",
    intervalEnvVar: "MASSA_TH0TH_SCHEDULER_CONSOLIDATION_INTERVAL_MS",
  },
  {
    id: "scheduled-decay-sweep",
    name: "Decay Sweep (clock)",
    jobKind: "decay-sweep",
    schedule: { type: "interval", intervalMs: ONE_HOUR },
    defaultEnabled: false,
    enableEnvVar: "MASSA_TH0TH_SCHEDULER_DECAY_ENABLED",
    intervalEnvVar: "MASSA_TH0TH_SCHEDULER_DECAY_INTERVAL_MS",
  },
  {
    id: "scheduled-auto-improve",
    name: "Auto-Improve (clock)",
    jobKind: "auto-improve",
    schedule: { type: "interval", intervalMs: THIRTY_MIN },
    defaultEnabled: false,
    enableEnvVar: "MASSA_TH0TH_SCHEDULER_AUTO_IMPROVE_ENABLED",
    intervalEnvVar: "MASSA_TH0TH_SCHEDULER_AUTO_IMPROVE_INTERVAL_MS",
  },
  {
    id: "scheduled-observation-bridge",
    name: "Observation Bridge (clock)",
    jobKind: "observation-bridge",
    schedule: { type: "interval", intervalMs: THIRTY_MIN },
    defaultEnabled: false,
    enableEnvVar: "MASSA_TH0TH_SCHEDULER_OBSERVATION_BRIDGE_ENABLED",
    intervalEnvVar: "MASSA_TH0TH_SCHEDULER_OBSERVATION_BRIDGE_INTERVAL_MS",
  },
];

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Register the existing job implementations as handlers on the scheduler, and
 * upsert default job definitions (default-disabled). Call this ONCE at boot,
 * before scheduler.start().
 *
 * The handlers are imported lazily (inside the function) to avoid pulling the
 * heavy job deps at module-eval time and to keep the scheduler module itself
 * free of direct job dependencies.
 */
export function registerDefaultJobs(scheduler: Scheduler): void {
  // ── Handlers ──────────────────────────────────────────────────────────────

  scheduler.registerHandler("memory-consolidation", async () => {
    // Reuse the existing singleton's entrypoint. consolidate() runs the full
    // decay + prune + merge cycle. Fire-and-forget on the debounce path;
    // here we await it so the scheduler's concurrency guard reflects real
    // completion.
    const { memoryConsolidationJob } = await import(
      "../jobs/memory-consolidation-job.js"
    );
    await memoryConsolidationJob.consolidate();
  });

  scheduler.registerHandler("decay-sweep", async () => {
    // decay.ts is a pure function; its only caller inside the job layer is
    // MemoryConsolidationJob.consolidate()'s decayStaleMemories phase. There is
    // no standalone "decay sweep" entrypoint, so we delegate to consolidate()
    // (which includes the decay phase). This avoids duplicating decay logic.
    const { memoryConsolidationJob } = await import(
      "../jobs/memory-consolidation-job.js"
    );
    await memoryConsolidationJob.consolidate();
  });

  scheduler.registerHandler("auto-improve", async (job) => {
    const { autoImproveJob } = await import("../jobs/auto-improve-job.js");
    const projectId =
      (job.payload?.projectId as string | undefined) ?? "default";
    await autoImproveJob.runOnce(projectId);
  });

  scheduler.registerHandler("observation-bridge", async (job) => {
    const { observationConsolidationJob } = await import(
      "../jobs/observation-consolidation-job.js"
    );
    const projectId =
      (job.payload?.projectId as string | undefined) ?? "default";
    await observationConsolidationJob.runOnce(projectId);
  });

  // ── Default job definitions ───────────────────────────────────────────────

  for (const def of DEFAULT_SCHEDULED_JOBS) {
    const enabled = envBool(def.enableEnvVar, def.defaultEnabled);
    const intervalMs = envNum(
      def.intervalEnvVar,
      def.schedule.intervalMs ?? THIRTY_MIN,
    );
    const schedule: ScheduleSpec = { type: "interval", intervalMs };

    // registerOrResumeJob preserves existing nextRunAt/lastRunAt across a
    // restart when the schedule is unchanged (resumes the schedule), and
    // recomputes when the schedule changes or the job is new.
    scheduler.registerOrResumeJob({
      id: def.id,
      name: def.name,
      jobKind: def.jobKind,
      schedule,
      nextRunAt: 0, // registerOrResumeJob resolves this
      enabled,
    });
  }

  logger.info("Scheduler default jobs registered", {
    handlers: scheduler.registeredKinds(),
    jobs: DEFAULT_SCHEDULED_JOBS.length,
  });
}
