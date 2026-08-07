/**
 * safe-error-summary — kernel leaf.
 *
 * Produces a log-safe `{name, message}` summary for an unknown caught value.
 * Every call site that used to hand-roll a "log the name, drop the message,
 * append '(sanitized)' to the string literal" pattern (`kernel/alias-resolver.ts`,
 * `services/hooks/attribution-resolver.ts`) had the same defect: dropping the
 * message entirely throws away debugging signal the message might have safely
 * carried. This scrubs the message through {@link scrubCredentials} instead of
 * discarding it, so the log line stays useful without risking a credential leak.
 */

import { scrubCredentials } from "./credential-scrub.js";

export interface SafeErrorSummary {
  readonly name: string;
  readonly message: string;
  // Index signature: call sites pass this straight into `logger.warn/error`'s
  // `meta?: Record<string, unknown>` parameter.
  readonly [key: string]: unknown;
}

/** Produce a `{name, message}` summary with credential-shaped substrings scrubbed. */
export function safeErrorSummary(error: unknown): SafeErrorSummary {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: scrubCredentials(error.message).sanitized,
    };
  }
  return {
    name: "UnknownError",
    message: scrubCredentials(String(error)).sanitized,
  };
}
