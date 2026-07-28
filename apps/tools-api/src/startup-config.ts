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

/** The subset of `@elysiajs/cors` options this API sets. */
export interface CorsOptions {
  origin: string[] | false;
  credentials: boolean;
}

/**
 * Build the CORS options from the configured allowlist (SEC-02).
 *
 * The API ran bare `cors()`, which reflects the request's own Origin back and
 * sets `credentials: true` — so any page a developer had open could call the
 * local API and read the response. An empty allowlist, the default, now permits
 * nothing cross-origin.
 *
 * `*` is rejected rather than passed through. It cannot legally combine with
 * credentials, and as an allowlist entry it means "no allowlist" — the exact
 * configuration this requirement removes. Failing at startup beats silently
 * serving a weaker policy than the operator wrote.
 */
export function buildCorsOptions(origins: readonly string[]): CorsOptions {
  const allowed = origins.map((origin) => origin.trim()).filter((origin) => origin.length > 0);

  if (allowed.includes("*")) {
    throw new Error(
      `[massa-ai] Invalid CORS configuration: "*" is not an allowed origin. ` +
        `A wildcard cannot be combined with credentials and defeats the allowlist. ` +
        `List exact origins in MASSA_AI_API_CORS_ORIGINS, or leave it unset to block ` +
        `all cross-origin requests.`,
    );
  }

  if (allowed.length === 0) return { origin: false, credentials: false };
  return { origin: allowed, credentials: true };
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
