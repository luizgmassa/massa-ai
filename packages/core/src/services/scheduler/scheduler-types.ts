/**
 * Scheduler types — shared across the scheduler engine, stores, and registry.
 *
 * The scheduler persists ScheduledJob rows so a process restart can resume the
 * schedule (nextRunAt / lastRunAt survive across restarts). Job *handlers* are
 * registered in-process via the JobRegistry; the store only persists the
 * definition + schedule, never the handler (handlers are code, not data).
 */

/** A registered job kind. Handlers are keyed by this string. */
export type JobKind =
  | "memory-consolidation"
  | "decay-sweep"
  | "auto-improve"
  | "observation-bridge"
  | string; // allow future kinds without a store migration

/** Schedule spec: either a fixed interval (ms) or a 5-field cron expression. */
export interface ScheduleSpec {
  /** "interval" = every `intervalMs` milliseconds; "cron" = 5-field cron. */
  type: "interval" | "cron";
  /** For type="interval": milliseconds between runs. */
  intervalMs?: number;
  /** For type="cron": standard 5-field expression "m h dom mon dow". */
  cron?: string;
}

/** A persisted scheduled-job definition. */
export interface ScheduledJob {
  /** Stable identifier (used as the primary key). */
  id: string;
  /** Human-readable name (logged on fire). */
  name: string;
  /** Handler key — must be registered in the JobRegistry before the job fires. */
  jobKind: JobKind;
  /** The schedule. */
  schedule: ScheduleSpec;
  /** ms-epoch of the next scheduled run. */
  nextRunAt: number;
  /** ms-epoch of the last completed run (0 if never). */
  lastRunAt: number;
  /** Whether the scheduler should consider this job. */
  enabled: boolean;
  /** Optional payload passed to the handler (e.g. projectId). JSON-serializable. */
  payload?: Record<string, unknown>;
  /**
   * Wave 5 FR-13: success/failure split. last_success_at is the ms-epoch of
   * the last SUCCESSFUL run (null until the first success). last_failure_at
   * is the ms-epoch of the last FAILED run (null until the first failure).
   */
  lastSuccessAt?: number | null;
  lastFailureAt?: number | null;
  /** Failure streak counter (0 on success, ++ on failure). */
  consecutiveFailures?: number;
  /** Truncated error message from the last failure (null on success). */
  lastError?: string | null;
}

/** A handler invoked when a scheduled job fires. Must never throw. */
export type JobHandler = (
  job: ScheduledJob,
) => void | Promise<void>;

/** Result of a single scheduler tick for observability/debug. */
export interface TickResult {
  evaluated: number;
  fired: number;
  skipped: number;
  errors: number;
}

/**
 * Scheduler status snapshot — the only black-box view of scheduler health.
 *
 * EB-SCH-3b: the four Wave 5 FR-13 health fields below are maintained and
 * persisted by `fireJob`, but were never projected here, so
 * `GET /api/v1/scheduler/status` had nothing to read and emitted `null` / `0`
 * as literals. Over HTTP a job failing every tick was then indistinguishable
 * from a healthy one, while SQL held the truth. They belong in the snapshot
 * because a health surface that cannot express failure is not one.
 *
 * They are required, not optional, unlike their `ScheduledJob` counterparts:
 * a consumer of a *snapshot* must not have to distinguish "absent" from
 * "never succeeded", which is the ambiguity that let the literals pass review.
 */
export interface SchedulerStatus {
  running: boolean;
  tickIntervalMs: number;
  registeredHandlers: JobKind[];
  jobs: Array<{
    id: string;
    name: string;
    jobKind: JobKind;
    enabled: boolean;
    nextRunAt: number;
    lastRunAt: number;
    /** ms-epoch of the last successful run; null until the first success. */
    lastSuccessAt: number | null;
    /** ms-epoch of the last failed run; null until the first failure. */
    lastFailureAt: number | null;
    /** Failure streak: 0 after a success, incremented on each failure. */
    consecutiveFailures: number;
    /** Truncated message from the last failure; null after a success. */
    lastError: string | null;
    due: boolean;
    currentlyRunning: boolean;
  }>;
}
