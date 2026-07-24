/**
 * Retry a database operation on PostgreSQL retriable isolation anomalies.
 *
 * A full-repository ETL Load writes many files concurrently (batch of 10),
 * each in its own transaction, while a separate 30s loop renews the graph
 * generation lease. These two writers lock overlapping generation-scoped rows
 * and occasionally form a lock cycle: PostgreSQL detects it (SQLSTATE 40P01)
 * and aborts one transaction as the deadlock victim. Serialization conflicts
 * (40001/40P02) are the same class of transient, retriable failure.
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
 * True when an error is a PostgreSQL lock cycle / serialization anomaly that
 * the application may safely retry. Prisma surfaces raw-query failures with
 * the SQLSTATE embedded in the message ("Raw query failed. Code: `40P01`…"),
 * so both the structured `.code` and the message text are inspected.
 */
export function isRetriableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
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
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetriableTransactionError(error) || attempt === maxAttempts) throw error;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      logger.warn("Retriable DB lock cycle; retrying operation", {
        operation: options.operation ?? "unknown",
        attempt,
        maxAttempts,
        delayMs,
        error: (error as Error)?.message?.slice(0, 120),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // Unreachable: the loop either returns or throws. Satisfies TS return type.
  throw new Error("withDeadlockRetry exhausted retries");
}
