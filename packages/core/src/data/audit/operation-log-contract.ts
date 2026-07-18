/**
 * Operation Log — audit attribution for destructive operations.
 *
 * M8 introduced an `operation_log` table so every destructive entry point
 * (project reset, memory purge, workspace delete, …) records who/when/what/
 * scope/result for later attribution. Auth is API-key-only today, so the
 * actor is whatever the API layer can derive from the request; richer
 * identity (signed-in user, agent headers, etc.) plugs in via the same
 * `ActorContext` seam without rewriting call sites.
 */

/**
 * Stable identity seam for whoever triggered a destructive op.
 *
 * Today the only source is the API key (actor_type="api_key", actor_id =
 * key id when one can be derived, else "unknown"). Future identity sources
 * (X-Actor-User, JWT subject, MCP agent id, …) construct their own
 * `ActorContext` and pass it to `recordOperation` — no call-site changes.
 *
 * NEVER put secrets in `actorId`. It is logged verbatim and stored in a
 * long-lived audit table, so it must be a non-secret identifier.
 */
export interface ActorContext {
  /** Free-form actor class — "api_key" today, "user" / "agent" / "system" later. */
  actorType: string;
  /** Non-secret identifier; "unknown" when no identity is available. */
  actorId: string;
}

/** Canonical "no identity available" context used when none was provided. */
export const UNKNOWN_ACTOR: ActorContext = Object.freeze({
  actorType: "api_key",
  actorId: "unknown",
});

/** Outcome of the destructive operation being audited. */
export type OperationResult = "success" | "failure" | "partial";

/**
 * Input shape for `OperationLogRepository.recordOperation`.
 *
 * `scope` and `meta` are JSONB blobs: `scope` describes WHAT was touched
 * (e.g. `{ scopes: ["vectors","symbols","memories"], projectId }`) while
 * `meta` carries optional telemetry (deleted counts, durations, etc.).
 * `error` is only meaningful when `result` !== "success".
 */
export interface RecordOperationInput {
  actorType?: string;
  actorId?: string;
  projectId?: string | null;
  op: string;
  scope?: Record<string, unknown> | null;
  result: OperationResult;
  meta?: Record<string, unknown> | null;
  error?: string | null;
}

/** Row returned by `OperationLogRepository.list` / future read paths. */
export interface OperationLogRow {
  id: string;
  occurredAt: number;
  actorType: string;
  actorId: string;
  projectId: string | null;
  op: string;
  scope: Record<string, unknown>;
  result: OperationResult;
  meta: Record<string, unknown>;
  error: string | null;
}

/** Repository contract — the pg implementation is the only one today. */
export interface OperationLogRepository {
  recordOperation(input: RecordOperationInput): Promise<void>;
  listByProject(projectId: string, limit?: number): Promise<OperationLogRow[]>;
}
