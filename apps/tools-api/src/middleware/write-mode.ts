/**
 * Write-mode gate (HPC-03, design.md §D1).
 *
 * Registered immediately after `authMiddleware` in `index.ts`, using the same
 * `.onBeforeHandle({ as: "global" })` form authMiddleware itself uses.
 * `{ as: "global" }` is load-bearing and is why this works at all — Elysia
 * scopes hooks to the plugin instance by default, and this gate needs to
 * reach the 20+ route plugins `.use()`d after it, exactly like auth.ts does.
 * Registration order alone would not be sufficient; a test that only
 * exercises routes registered in the same file as this middleware would pass
 * without proving that.
 *
 * Decision rule, in order (design.md §D1):
 *
 *   1. `GET` → allow. Reads are never gated.
 *   2. `isPublicPath(path)` → allow, unchanged (AC-03.7). This gate never
 *      makes a currently-public path non-public, nor the reverse.
 *   3. Read-only mode inactive → allow. This is today's default (AC-03.6),
 *      so nothing about current behaviour changes for any existing caller.
 *      Resolving "inactive" fails CLOSED (AC-03.8): a throwing accessor is
 *      treated as *active*, refusing the write. This deliberately inverts
 *      the four existing config gates in this tree — `handoffsDisabled`
 *      (routes/handoff.ts:24-30), `autoImproveDisabled`
 *      (routes/proposals.ts:23-26), bootstrap.ts:21, hooks.ts:35 — all of
 *      which resolve a throwing config read to "not disabled". That shape is
 *      defensible for a feature flag: a broken config should not disable the
 *      product. It is not defensible for an authorization gate, where the
 *      same shape means a config hiccup silently un-refuses every write at
 *      exactly the moment the operator's intent cannot be confirmed. The
 *      likely implementation mistake here is copying the neighbouring file,
 *      so this inversion is deliberate and documented against exactly that.
 *   4. Normalise one trailing slash (AC-03.9: measured against this
 *      worktree's `elysia@1.4.29`, `POST /api/v1/handoff/list/` matches the
 *      same route as `/list`, and this hook receives the raw, unnormalised
 *      string), then: path classified read-only
 *      (write-mode-classification.ts) → allow, applying that entry's body
 *      sanitizer in place if it declares one (AC-03.3a).
 *   5. Otherwise → 403. This is the default-deny (AC-03.2): a route nobody
 *      classified is refused, not silently exposed. A curated list of
 *      "dangerous" routes was measured to miss 9 of 50 non-GET routes on
 *      this exact codebase, several of them more dangerous than the 14 it
 *      caught — see write-mode-classification.ts and design.md §D1.
 */

import { Elysia } from "elysia";
import { isPublicPath } from "./auth.js";
import { findReadOnlyRoute } from "./write-mode-classification.js";

export type ReadOnlyModeAccessor = () => boolean;

/**
 * Default resolution: the `MASSA_AI_READ_ONLY_MODE` env knob, off unless
 * literally `"true"` (AC-03.6). Reading `process.env` directly here — rather
 * than through the `@massa-ai/shared` config schema — keeps this gate's
 * write set to this middleware alone; see `turbo.json` →
 * `tasks.test.passThroughEnv` (AD-010) for the knob's pass-through entry.
 */
function defaultReadOnlyModeAccessor(): boolean {
  return process.env.MASSA_AI_READ_ONLY_MODE === "true";
}

let readOnlyModeAccessor: ReadOnlyModeAccessor = defaultReadOnlyModeAccessor;

/**
 * Test-only seam: replace the accessor used to resolve read-only mode, e.g.
 * to force it active, inactive, or throwing. Production code never calls
 * this — reading `MASSA_AI_READ_ONLY_MODE` via `defaultReadOnlyModeAccessor`
 * is the only supported path. Pass `undefined` to restore the default.
 */
export function __setReadOnlyModeAccessorForTests(accessor: ReadOnlyModeAccessor | undefined): void {
  readOnlyModeAccessor = accessor ?? defaultReadOnlyModeAccessor;
}

/**
 * Resolve whether read-only mode is active right now. Fails CLOSED
 * (AC-03.8): a throwing accessor resolves to `true` (active), never
 * `false`. This is the one gate in this tree that deliberately inverts the
 * local "a throw means not disabled" idiom — see the module docblock.
 */
export function isReadOnlyModeActive(): boolean {
  try {
    return readOnlyModeAccessor();
  } catch {
    return true;
  }
}

const WRITE_REFUSED = {
  success: false,
  error: "Write refused: read-only mode is active",
} as const;

export const writeModeMiddleware = new Elysia({ name: "write-mode" }).onBeforeHandle(
  { as: "global" },
  ({ request, path, set, body }) => {
    if (request.method.toUpperCase() === "GET") return;
    if (isPublicPath(path)) return;
    if (!isReadOnlyModeActive()) return;

    const entry = findReadOnlyRoute(request.method, path);
    if (entry) {
      if (entry.sanitizeBody && body && typeof body === "object") {
        entry.sanitizeBody(body as Record<string, unknown>);
      }
      return;
    }

    set.status = 403;
    return { ...WRITE_REFUSED };
  },
);
