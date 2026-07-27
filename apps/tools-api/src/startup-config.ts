import {
  assertDedicatedDbAllowed,
  requirePostgresDatabaseUrl,
  type ResolvedApiKey,
} from "@massa-ai/shared/config";
import { initAuth } from "./middleware/auth.js";

/** Validate the mandatory database contract before API services initialize. */
export function validateApiStartup(): string {
  assertDedicatedDbAllowed();
  return requirePostgresDatabaseUrl();
}

/**
 * Resolve the API key before the port binds, or exit non-zero (SEC-01 AC2).
 *
 * A failure here means a key had to be generated and `config.json` could not be
 * written. Continuing would bind an unauthenticated `0.0.0.0` listener exposing
 * three arbitrary-code-execution routes, so this is fatal rather than a
 * degradation. Both dependencies are injected so the exit path is testable
 * without ending the test runner's own process.
 */
export function initAuthOrExit(
  init: () => ResolvedApiKey = initAuth,
  onFatal: (message: string) => never = (message) => {
    console.error(message);
    process.exit(1);
  },
): ResolvedApiKey {
  try {
    return init();
  } catch (error) {
    return onFatal(
      `[massa-ai] Fatal: cannot start without an API key. ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
