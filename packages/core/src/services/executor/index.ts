/**
 * Executor service — polyglot sandbox + run-pool + intent progressive disclosure.
 *
 * Exports are deliberately grouped:
 *   - `PolyglotExecutor` + types: the sandbox spawner.
 *   - `runPool`: standalone concurrency primitive (no executor dependency —
 *     reused by P2-T2 web fetch).
 *   - `detectRuntimes` etc.: runtime detection (also exported for tests).
 *   - `intentSearch`: opt-in progressive disclosure for large outputs.
 *   - `Execute*Params`: the request shapes callers hand in (T8b).
 */
export type {
  ExecuteParams,
  ExecuteFileParams,
  BatchExecuteParams,
} from "./params.js";

export { PolyglotExecutor } from "./executor.js";
export type {
  ExecResult,
  ExecuteOptions,
  ExecuteFileOptions,
} from "./executor.js";
export {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_HARD_CAP_BYTES,
} from "./executor.js";

export { getSandboxMode, wrapSpawn } from "./sandbox.js";
export type { SandboxMode } from "./sandbox.js";

export { runPool, fulfilledValues } from "./run-pool.js";
export type {
  PoolJob,
  RunPoolOptions,
  RunPoolResult,
} from "./run-pool.js";

export {
  detectRuntimes,
  commandExists,
  runnableExists,
  getVersion,
  getRuntimeSummary,
  getAvailableLanguages,
  buildCommand,
  SCRIPT_EXT,
} from "./runtime.js";
export type {
  Language,
  RuntimeMap,
  RuntimeInfo,
  DetectDeps,
} from "./runtime.js";

export {
  intentSearch,
  renderIntentResult,
  INTENT_SEARCH_THRESHOLD,
} from "./intent-search.js";
export type {
  IntentSearchResult,
  IntentSection,
} from "./intent-search.js";
