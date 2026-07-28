/**
 * Authentication Middleware
 *
 * Every request outside PUBLIC_PATHS must carry a valid `x-api-key`.
 *
 * This middleware used to return early when no key was configured — "dev mode".
 * That was the default state of a fresh install (`MASSA_AI_API_KEY` appears in
 * neither `.env.example` nor the `.env` the installers write), so the API shipped
 * unauthenticated, including three `/api/v1/executor/*` routes that run arbitrary
 * code as the process user, on a `0.0.0.0` bind. The bypass is gone: a key always
 * exists, because `resolveApiKey()` provisions one on first start (SEC-01).
 *
 * The key is resolved by an explicit `initAuth()` that only `index.ts` calls —
 * NOT at module-import time. `resolveApiKey()` writes a generated secret into
 * `~/.config/massa-ai/config.json`, and this module is imported directly by its
 * own test file, so an import-time resolve would provision a key into every
 * developer's and CI runner's real config as a side effect of `bun test`.
 *
 * M8 — also derives a minimal `ActorContext` (stable identity seam) from
 * the request for audit-log attribution. Auth is API-key-only today, so the
 * actor is `actorType="api_key"` with `actorId` drawn from the optional
 * `x-actor-id` header (a non-secret identifier) when present, else
 * "unknown". Future identity sources (JWT subject, signed-in user, MCP
 * agent id) replace `deriveActor` without touching call sites — every
 * destructive op already takes `ActorContext` from the request.
 */

import { Elysia } from "elysia";
import type { ActorContext } from "@massa-ai/core";
import { resolveApiKey, type ResolvedApiKey } from "@massa-ai/shared/config";

/**
 * Paths served without a key.
 *
 * `/health` is here because the Docker healthcheck depends on it and it returns
 * no project data. `/ui` is here because `authMiddleware` is registered before
 * `webUiRoutes` in `index.ts`, so without it `GET /ui` would 401 before the
 * route that injects the key into the page ever runs — SEC-05 would be dead
 * code. The static shell carries no project data; every `/api/v1/*` call the
 * dashboard makes still needs the key.
 */
const PUBLIC_PATHS = ["/health", "/swagger", "/ui"];

/**
 * Exact match, or a child path under a public prefix.
 *
 * Deliberately not `path.startsWith(p)`: that form exempts `/uixyz` along with
 * `/ui`, so any route whose name merely begins with a public path's characters
 * would be served anonymously.
 */
export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * The resolved runtime key. `undefined` until `initAuth()` runs, and the
 * middleware rejects everything while it is — an uninitialized auth layer fails
 * closed, never open.
 */
let configuredApiKey: string | undefined;

/**
 * Resolve (and if absent, provision) the API key for this process.
 *
 * Called once from `index.ts` during startup, before the port binds. Throws
 * `ApiKeyProvisioningError` when a key must be generated and `config.json`
 * cannot be written; the caller treats that as fatal, because starting without
 * a key is exactly the exposure this closes.
 */
export function initAuth(): ResolvedApiKey {
  const resolved = resolveApiKey();
  configuredApiKey = resolved.key;
  return resolved;
}

/**
 * The key `initAuth()` resolved, or `undefined` before it runs.
 *
 * Exists so `web-ui.ts` can stamp the key into the dashboard shell without
 * calling `resolveApiKey()` again — a second call on a fresh install would
 * provision, and provisioning belongs to startup, not to a GET.
 */
export function getConfiguredApiKey(): string | undefined {
  return configuredApiKey;
}

/**
 * Test-only seam: set the key without touching the filesystem. Production code
 * never calls this — `initAuth()` is the only supported entry point.
 */
export function __setAuthKeyForTests(key: string | undefined): void {
  configuredApiKey = key;
}

/**
 * Derive the actor responsible for a request. Pure function — no I/O, no
 * secrets. Reads the optional `x-actor-id` header (callers may set a
 * non-secret identifier like an agent name or user id). When absent,
 * returns "unknown" so the audit row still records that *something*
 * performed the op.
 *
 * This is the single seam future identity work replaces: swap the body to
 * decode a JWT / session cookie / MCP agent header and every call site
 * picks up the richer identity for free.
 */
export function deriveActor(headers: Record<string, string | string | undefined>): ActorContext {
  const raw = headers["x-actor-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const actorId = typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, 256)
    : "unknown";
  return { actorType: "api_key", actorId };
}

const UNAUTHORIZED = {
  success: false,
  error: "Unauthorized: Invalid or missing API key",
} as const;

export const authMiddleware = new Elysia({ name: "auth" })
  .onBeforeHandle(
    { as: "global" },
    ({ headers, path, set }) => {
      if (isPublicPath(path)) {
        return;
      }

      const providedKey = headers["x-api-key"];

      // `configuredApiKey` being unset means initAuth() never ran. That is a
      // wiring bug, not an operating mode — reject rather than serve.
      if (!configuredApiKey || !providedKey || providedKey !== configuredApiKey) {
        set.status = 401;
        return { ...UNAUTHORIZED };
      }

      return;
    },
  )
  // Expose the derived ActorContext on every request so destructive routes
  // can pass it straight into recordOperation without re-parsing headers.
  .derive(({ headers }) => ({ actor: deriveActor(headers as Record<string, string>) }));
