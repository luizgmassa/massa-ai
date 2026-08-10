/**
 * Default scheduled-job registration — wires the existing job implementations
 * to the scheduler as default-DISABLED, conservative-interval jobs.
 *
 * This does NOT rewrite the existing jobs. It registers their existing
 * entrypoints as handlers and defines default job rows. A deployment opts in by
 * setting MASSA_AI_SCHEDULER_ENABLED=true (master switch) AND the per-kind
 * enable env var (e.g. MASSA_AI_SCHEDULER_CONSOLIDATION_ENABLED=true).
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
 *   checkpoint-purge     → CheckpointManager.getInstance().purgeExpired()
 *
 * IMPORTANT: the scheduler must NEVER trigger indexing jobs (OOM risk per
 * project memory). Only memory/decay/consolidation/auto-improve/observation/
 * checkpoint-purge jobs are registered here — checkpoint-purge is a bounded
 * DELETE of already-expired rows, not an indexing job.
 */

import { loadRawUserConfig, logger } from "@massa-ai/shared";
import type { Scheduler } from "./scheduler.js";
import type { JobKind, ScheduleSpec } from "./scheduler-types.js";

/** Raw per-job file-config block (mirrors `SchedulerJobConfig` in
 *  `packages/shared/src/config/massa-ai-config.ts`, which is not part of
 *  `@massa-ai/shared`'s public export surface — duplicated as a minimal
 *  local shape rather than widening that package's exports for one type). */
interface FileSchedulerJob {
  enabled?: boolean;
  intervalMs?: number;
}

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
    enableEnvVar: "MASSA_AI_SCHEDULER_CONSOLIDATION_ENABLED",
    intervalEnvVar: "MASSA_AI_SCHEDULER_CONSOLIDATION_INTERVAL_MS",
  },
  {
    id: "scheduled-decay-sweep",
    name: "Decay Sweep (clock)",
    jobKind: "decay-sweep",
    schedule: { type: "interval", intervalMs: ONE_HOUR },
    defaultEnabled: false,
    enableEnvVar: "MASSA_AI_SCHEDULER_DECAY_ENABLED",
    intervalEnvVar: "MASSA_AI_SCHEDULER_DECAY_INTERVAL_MS",
  },
  {
    id: "scheduled-auto-improve",
    name: "Auto-Improve (clock)",
    jobKind: "auto-improve",
    schedule: { type: "interval", intervalMs: THIRTY_MIN },
    defaultEnabled: false,
    enableEnvVar: "MASSA_AI_SCHEDULER_AUTO_IMPROVE_ENABLED",
    intervalEnvVar: "MASSA_AI_SCHEDULER_AUTO_IMPROVE_INTERVAL_MS",
  },
  {
    id: "scheduled-observation-bridge",
    name: "Observation Bridge (clock)",
    jobKind: "observation-bridge",
    schedule: { type: "interval", intervalMs: THIRTY_MIN },
    defaultEnabled: false,
    enableEnvVar: "MASSA_AI_SCHEDULER_OBSERVATION_BRIDGE_ENABLED",
    intervalEnvVar: "MASSA_AI_SCHEDULER_OBSERVATION_BRIDGE_INTERVAL_MS",
  },
  {
    id: "scheduled-checkpoint-purge",
    name: "Checkpoint Purge (clock)",
    jobKind: "checkpoint-purge",
    schedule: { type: "interval", intervalMs: ONE_HOUR },
    defaultEnabled: false,
    enableEnvVar: "MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED",
    intervalEnvVar: "MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS",
  },
];

/**
 * `env > config.json's raw scheduler.jobs[kind] > fallback` (SCH-02).
 *
 * `fileValue` is the raw, all-optional file-config value — deliberately NOT
 * `config.get("scheduler")` from `@massa-ai/shared`, whose per-job
 * `enabled`/`intervalMs` are already fully resolved (`env > file > false`) at
 * that layer and therefore never `undefined`. Feeding that already-resolved
 * value in as the "config" layer here would make `fallback` (this file's own
 * `applySafeDefaults`/`DEFAULT_SCHEDULED_JOBS` literal) unreachable.
 *
 * A *defined* env value that is neither "true" nor "1" resolves to `false`
 * directly (unchanged from the pre-T5 behavior) — it does not fall through
 * to `fileValue`. Only an *unset* env var consults the file layer.
 */
function envBool(key: string, fileValue: boolean | undefined, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fileValue ?? fallback;
  return raw === "true" || raw === "1";
}

/**
 * `env > config.json's raw scheduler.jobs[kind] > fallback` (SCH-02). An
 * unset, empty, or invalid (non-finite / non-positive) env value all fall
 * through to `fileValue`, then `fallback` — unchanged observable behavior
 * from the pre-T5 two-arg form for every case with no file layer present
 * (every existing test), and consistent with the design's `??` chain when a
 * file layer *is* present.
 */
function envNum(key: string, fileValue: number | undefined, fallback: number): number {
  const raw = process.env[key];
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fileValue ?? fallback;
}

/**
 * Never-throwing accessor for the raw file-config `scheduler.jobs` block
 * (SCH-06), reading `config.json` fresh via `loadRawUserConfig()` (itself
 * never-throwing).
 *
 * It must be the RAW file read, and there are now two ways to get that wrong.
 * `config.get("scheduler")` is the one `envBool`/`envNum` above already warn
 * about: fully resolved, never `undefined`. `loadConfigSafe()` is the second,
 * and it is the one that actually shipped a defect — it folds
 * `defaultMassaAiConfig` in, so once the scheduler gained real defaults every
 * job's `enabled` arrived as a defined `false` and `envBool`'s `fileValue ??
 * fallback` could no longer reach `applySafeDefaults`. The safe-defaults
 * preset silently stopped enabling anything, with `MASSA_AI_SCHEDULER_SAFE_
 * DEFAULTS=true` still set.
 *
 * The distinction this file depends on is between "the user wrote false" and
 * "the user wrote nothing". Only a raw read can tell those apart, and only
 * that distinction lets a user's explicit `false` beat the preset while the
 * mere default does not.
 */
function readFileSchedulerJobs(): Record<string, FileSchedulerJob> | undefined {
  try {
    const raw = loadRawUserConfig().scheduler?.jobs;
    return raw as Record<string, FileSchedulerJob> | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Apply the safe-defaults preset to a single job definition. When
 * `MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true`, consolidation + decay jobs get
 * `defaultEnabled=true` at conservative intervals (≥30 min consolidation,
 * ≥60 min decay). Auto-improve is NOT enabled by the preset. Individual envs
 * still override the preset (the envBool loop runs after this).
 *
 * CRITICAL (pre-mortem F5): this function is called INSIDE
 * `registerDefaultJobs` before the `envBool` loop reads `defaultEnabled` —
 * NOT as a separate export (silent no-op if caller forgets).
 */
function applySafeDefaults(job: DefaultJobDef): DefaultJobDef {
  // No file-config middle layer for the preset switch itself — it stays a
  // pure env toggle (env > literal), unchanged from before this task.
  if (!envBool("MASSA_AI_SCHEDULER_SAFE_DEFAULTS", undefined, false)) {
    return job;
  }
  if (job.jobKind === "memory-consolidation") {
    // Conservative: ≥30 min consolidation. Keep the default interval if it is
    // already ≥30 min; otherwise bump to 30 min.
    const currentInterval = job.schedule.intervalMs ?? THIRTY_MIN;
    const safeInterval = Math.max(currentInterval, THIRTY_MIN);
    return {
      ...job,
      defaultEnabled: true,
      schedule: { type: "interval", intervalMs: safeInterval },
    };
  }
  if (job.jobKind === "decay-sweep") {
    // Conservative: ≥60 min decay. Keep the default interval if it is already
    // ≥60 min; otherwise bump to 60 min.
    const currentInterval = job.schedule.intervalMs ?? ONE_HOUR;
    const safeInterval = Math.max(currentInterval, ONE_HOUR);
    return {
      ...job,
      defaultEnabled: true,
      schedule: { type: "interval", intervalMs: safeInterval },
    };
  }
  // auto-improve and observation-bridge are NOT enabled by the preset.
  return job;
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

  scheduler.registerHandler("checkpoint-purge", async () => {
    // Reuse the existing checkpoint store's purgeExpired() (already-expired
    // rows only — a bounded DELETE, not a full-table scan of live data).
    const { CheckpointManager } = await import(
      "../checkpoint/checkpoint-manager.js"
    );
    const count = CheckpointManager.getInstance().purgeExpired();
    logger.info("Scheduled checkpoint purge completed", { count });
  });

  // ── Default job definitions ───────────────────────────────────────────────

  // One read of the raw file config for all five kinds (SCH-02) — cheaper
  // than a per-kind disk read, and `readFileSchedulerJobs()` never throws.
  const fileJobs = readFileSchedulerJobs();

  for (const rawDef of DEFAULT_SCHEDULED_JOBS) {
    // Apply the safe-defaults preset BEFORE the envBool loop reads
    // `defaultEnabled`. This ensures the preset is wired into the registration
    // path (pre-mortem F5: not a separate export). `applySafeDefaults` keeps
    // its current position: it runs BEFORE the literal default is read, so
    // MASSA_AI_SCHEDULER_SAFE_DEFAULTS still preloads consolidation + decay
    // while both env and config.json still win over the preset.
    const def = applySafeDefaults(rawDef);
    const fileJob = fileJobs?.[def.jobKind];
    const enabled = envBool(def.enableEnvVar, fileJob?.enabled, def.defaultEnabled);
    const intervalMs = envNum(
      def.intervalEnvVar,
      fileJob?.intervalMs,
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
