/**
 * SSE keep-alive constants — the single module `logs.ts` and `events.ts` read
 * so the heartbeat-vs-idle-window inequality is declared once instead of
 * twice (spec SSE-01, design D1).
 *
 * The defect this module exists to prevent: the shipped heartbeat (15 000 ms)
 * was scheduled LONGER than the transport's idle window (10 000 ms), so the
 * heartbeat could never fire before the socket was already dropped
 * (spec E1-E3). Every constant below is measured, not chosen by feel — see
 * `.specs/features/sse-heartbeat-idle-timeout/spec.md` § Evidence.
 */

/**
 * Bun.serve closes an idle request after this long. Not configurable at
 * LISTEN time under `adapter: node()` — five placements were tried and all
 * five were inert (spec E4). Bun states the mechanism on every drop:
 *
 *   [Bun.serve]: request timed out after 10 seconds. Pass `idleTimeout` to
 *   configure.
 *
 * The window IS configurable PER REQUEST via the native `Bun.Server`'s
 * `timeout(request, seconds)` (spec E5, D6) — `SSE_REQUEST_TIMEOUT_SECONDS`
 * below is that override's value. This constant is the un-widened floor: the
 * value every SSE stream falls back to whenever the override cannot be
 * applied (AC-07.3), which is why `SSE_HEARTBEAT_MS_DEFAULT` is sized against
 * THIS number rather than against the wider, override-only window.
 */
export const TRANSPORT_IDLE_WINDOW_MS = 10_000;

/**
 * Default SSE keep-alive interval. Half the un-widened idle window, so a
 * loaded host still gets a heartbeat frame in before the drop — sized against
 * the observed floor (8.5 s across spec E3's samples, not the 10 s nominal),
 * giving a real margin of 8.5 / 5 = 1.7x. Proven sufficient in spec E2: 45 s
 * fully idle, 9 heartbeats, zero drops.
 */
export const SSE_HEARTBEAT_MS_DEFAULT = 5_000;

/** Scheduled auto-close for any SSE stream, heartbeat or not (design D1;
 *  unchanged from the pre-existing per-route literals — spec SSE-05 /
 *  AC-05.1 requires this behavior stay byte-equivalent). */
export const SSE_MAX_DURATION_MS_DEFAULT = 10 * 60 * 1000; // 10 minutes

/**
 * Per-request transport idle-window override (spec SSE-07, design D6),
 * applied via the native `Bun.Server.timeout(request, seconds)` reachable at
 * `listenHandle.bun?.server`. Measured: `server.timeout(request, 60)` moved a
 * real drop from 12.0 s to exactly 60.0 s (spec E5); 120 s held both SSE
 * endpoints idle for a full 180 s alongside the unchanged 15 s heartbeat that
 * was standing in at the time (spec E6). The override alone is not enough —
 * it sets a FINITE window, so a stream with no heartbeat inside it still
 * drops when the window expires (spec E5's 60 s row) — which is why this
 * constant is a complement to `SSE_HEARTBEAT_MS_DEFAULT`, not a replacement
 * for it.
 */
export const SSE_REQUEST_TIMEOUT_SECONDS = 120;

/**
 * Resolves the SSE heartbeat interval, honoring `MASSA_AI_SSE_HEARTBEAT_MS`
 * when set. Read PER CALL (not cached at module load) — this is the existing
 * behavior in both `logs.ts` and `events.ts`, preserved deliberately because
 * it is what lets a test set the env var after the route module was already
 * imported.
 *
 * Semantics are `Number(value) || default`, matching the expression this
 * replaces exactly: an unset, non-numeric, empty, or `"0"` value all fall
 * back to the default (`Number(x)` is `NaN`/`0`, both falsy) rather than
 * being treated as an explicit "no heartbeat" request. Preserved as-is, not
 * "fixed" — the task charter is explicit that this quirk stays.
 */
export function resolveHeartbeatMs(): number {
  return Number(process.env.MASSA_AI_SSE_HEARTBEAT_MS) || SSE_HEARTBEAT_MS_DEFAULT;
}

/**
 * Resolves the SSE max-duration auto-close, honoring
 * `MASSA_AI_SSE_MAX_DURATION_MS` when set. Same per-call read and same
 * `Number(value) || default` fallback semantics as `resolveHeartbeatMs` —
 * see its docblock.
 */
export function resolveMaxDurationMs(): number {
  return Number(process.env.MASSA_AI_SSE_MAX_DURATION_MS) || SSE_MAX_DURATION_MS_DEFAULT;
}
