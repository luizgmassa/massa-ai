/**
 * Retry a database operation on PostgreSQL retriable isolation anomalies.
 *
 * A full-repository ETL Load writes many files concurrently (batch of 10),
 * each in its own transaction, while a separate 30s loop renews the graph
 * generation lease. The cycle mechanism is FK-implicit locking: every
 * symbol_* table FKs to workspaces(project_id), so a per-file write takes
 * FOR UPDATE on its graph_generations row first and then an implicit
 * FOR KEY SHARE on the workspaces row when its inserts fire (generation →
 * workspace). A lease method locking workspace-first forms an AB-BA cycle
 * with any in-flight writer; PostgreSQL detects it (SQLSTATE 40P01) and
 * aborts one transaction as the deadlock victim. The lease methods now lock
 * generation-first to match (begin() is the documented workspace-first
 * exception), leaving retry as the safety net for the residual begin()
 * window. Serialization conflicts (40001/40P02) are the same class of
 * transient, retriable failure.
 *
 * The aborted transaction is NOT a data problem — it never committed. Every
 * Load write is idempotent (generation-scoped upserts / ON CONFLICT /
 * deterministic document ids), so retrying the whole operation is safe and
 * resolves as soon as the contender releases its lock. Without this retry, a
 * single transient cycle aborts the entire index run (the lease renewal
 * failure propagates and aborts the pipeline).
 */

import { logger } from "@massa-ai/shared";

const RETRIABLE_SQLSTATES = new Set(["40P01", "40001", "40P02"]);

/**
 * True when the error is a Prisma connection-pool acquisition failure
 * (P2024 family): the interactive transaction could not BEGIN within its
 * maxWait because the pool was saturated or its connections were being
 * re-established. Observed live at the tail of a 5.5h resolve under system
 * memory pressure, where the query engine churned connections for ~12
 * minutes before the run's first post-resolve transaction. Not a lock
 * anomaly and not a data problem — retrying with a much slower backoff is
 * safe (every Load write is idempotent) and rides out the churn.
 */
export function isConnectionPoolAcquisitionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "P2024") return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return (
    message.includes("Unable to start a transaction in the given time") ||
    message.includes("Timed out fetching a new connection from the connection pool")
  );
}

/**
 * True when an error is a PostgreSQL lock cycle / serialization anomaly that
 * the application may safely retry. Prisma surfaces raw-query failures with
 * the SQLSTATE embedded in the message ("Raw query failed. Code: `40P01`…"),
 * so both the structured `.code` and the message text are inspected.
 * Connection-pool acquisition failures (P2024 family) are retriable too,
 * with their own backoff ladder in {@link withDeadlockRetry}.
 */
export function isRetriableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (isConnectionPoolAcquisitionError(error)) return true;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && RETRIABLE_SQLSTATES.has(code)) return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string" && /Code:\s*`(?:40P01|40001|40P02)`/.test(message)) {
    return true;
  }
  return false;
}

export interface DeadlockRetryOptions {
  /** Maximum attempts including the first (default 5). */
  maxAttempts?: number;
  /** Base backoff in ms; doubled each retry (default 75). */
  baseDelayMs?: number;
  /** Linear backoff step in ms for connection-pool acquisition retries
   * (default 30_000; tests pass a small value to keep them fast). */
  connectionDelayMs?: number;
  /** Label included in the retry log for traceability. */
  operation?: string;
}

/**
 * Run an async DB operation, retrying it on a retriable transaction anomaly
 * with exponential backoff. Non-retriable errors rethrow immediately.
 */
export async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  options: DeadlockRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 75;
  const connectionDelayMs = options.connectionDelayMs ?? 30_000;
  // Connection-pool acquisition failures get their own attempt budget (see
  // the catch below); the loop bound must allow for it even though the
  // common path throws at maxAttempts and never reaches the extension.
  const loopBound = Math.max(maxAttempts, 10);
  for (let attempt = 1; attempt <= loopBound; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetriableTransactionError(error)) throw error;
      // Connection-pool acquisition churn runs on a slower clock than lock
      // cycles (minutes, not milliseconds) and gets its own budget: at least
      // 10 attempts with a linear 30s-step backoff (~22 min of coverage)
      // instead of the 75ms exponential ladder.
      const isConn = isConnectionPoolAcquisitionError(error);
      const effectiveMax = isConn ? Math.max(maxAttempts, 10) : maxAttempts;
      if (attempt >= effectiveMax) throw error;
      const delayMs = isConn ? connectionDelayMs * attempt : baseDelayMs * 2 ** (attempt - 1);
      logger.warn("Retriable DB failure; retrying operation", {
        operation: options.operation ?? "unknown",
        attempt,
        maxAttempts: effectiveMax,
        delayMs,
        error: error as Error,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // Unreachable: the loop either returns or throws. Satisfies TS return type.
  throw new Error("withDeadlockRetry exhausted retries");
}
