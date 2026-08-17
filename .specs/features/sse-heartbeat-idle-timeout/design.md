# SSE Heartbeat vs Transport Idle Timeout — Design

Contract: `.specs/features/sse-heartbeat-idle-timeout/spec.md`.

## Approach

The defect is an inequality that is wrong by construction: `heartbeat (15 s) >
idle window (10 s)`. **Both** sides can move — that took two rounds to
establish, and the correction is the most important thing in this document.

The first draft moved only the heartbeat, on the strength of five *listen-time*
attempts to raise the window (spec E4). The Plan Challenge Gate falsified that
with Bun's *per-request* `server.timeout(request, seconds)`, reachable at
`listenHandle.bun.server`, and re-measurement against the real route modules
confirmed it: a 60 s override moved the drop to exactly 60.0 s (spec E5).

So the design does both, because measurement shows each alone is insufficient:

- The **override** removes the invisible 10 s default, which is what made this
  defect possible in the first place — no edit site named the window at all.
- The **heartbeat** is what makes a stream survive *indefinitely*, because the
  override sets a finite window. Dropping the heartbeat just relocates the drop
  (spec E5). With a 120 s window and the unchanged 15 s heartbeat, both
  endpoints held 180 s idle — survival past the window, produced by the
  heartbeat resetting the idle timer inside it (spec E6).

A sensor then **pins the inequality** so it cannot silently invert again.

Alternatives considered and rejected:

| Alternative | Rejected because |
| --- | --- |
| Raise `Bun.serve`'s `idleTimeout` at listen time | Unreachable through Elysia's public surface under `adapter: node()` — five placements measured inert (spec E4). The per-request API is a different surface and **is** used (D6). |
| Per-request override alone, heartbeat deleted | Measured insufficient: the window is finite, so the stream drops exactly when it expires (spec E5). Fewer moving parts, but it trades a 10 s bug for an N-second one. |
| Migrate off `adapter: node()` to Bun's native adapter | Would reach `idleTimeout`, but `reusePort: false` and the restart/drain stopper are built on the node adapter (`index.ts:170-200`), and that path has its own recorded split-brain incident. A transport swap to fix a constant is disproportionate, and belongs in its own spec. |
| Let the client reconnect every ~12 s and call it fixed | Turns a broken keep-alive into a reconnect storm: each reconnect re-runs `startSinkTail`, re-stats the sink, and restarts from the current end of file — so entries appended during the reconnect gap are lost, silently. |

## D1 — one module owns the SSE lifecycle constants

New: `apps/tools-api/src/routes/sse-keepalive.ts`.

```ts
/** Bun.serve closes an idle request after this long; not configurable under
 *  `adapter: node()` (measured — see spec E4). Every SSE keep-alive must stay
 *  strictly below it. */
export const TRANSPORT_IDLE_WINDOW_MS = 10_000;

/** Half the window, so a loaded host still gets a frame in before the drop. */
export const SSE_HEARTBEAT_MS_DEFAULT = 5_000;

export const SSE_MAX_DURATION_MS_DEFAULT = 10 * 60 * 1000;

export function resolveHeartbeatMs(): number { … }   // env override wins, per call
export function resolveMaxDurationMs(): number { … }
```

Both `routes/logs.ts` and `routes/events.ts` delete their local literals and
call the two resolvers. Reading per call (not per module import) is the
existing behavior in both files and is preserved deliberately: it is what lets
a test set the env var after import.

Placed in `routes/` rather than `packages/shared` because both consumers are
route modules in this app and no other package serves SSE — promoting it would
widen a shared package's contract for no consumer (`references/naming-standards.md`:
the name states the role, and the location states the ownership).

## D2 — why 5 000 ms

Measured, not chosen by feel, and sized against the **worst case rather than
the nominal one**. The nominal window is 10 s (Bun's own message), but the
observed floor across E3's samples was 8.5 s, so the honest margin is
8.5 ÷ 5 = **1.7×**, not the 2× the nominal implies. The Plan Challenge Gate
raised this; the arithmetic here uses the observed floor.

The heartbeat is deliberately sized against the **un-widened** window even
though D6 widens it to 120 s. That is the graceful-degradation property: on any
deployment where the native handle is absent (AC-07.3), the stream still
survives on the heartbeat alone. Cost of the smaller interval is 12 comment
frames per minute per stream, ~10 bytes each.

Not swept: the 8.5 s outlier was recorded, not explained. It stops mattering
once D6 lands, because the override replaces the default window wherever it
applies — which is why the sweep the Plan Challenge Gate asked for was
answered by changing the design instead of by taking more samples.

## D3 — the sensor enumerates, it does not assume

`AC-03.2` is deliberately not "check the two files we know about". The recorded
failure mode in this repository is a sensor that names one instance and hides
its siblings — which is exactly how `events.ts` carried the same bug unreported
while `logs.ts` was being hardened through T47/T49/T50.

The sensor therefore derives its population from source:

1. Read every file under `apps/tools-api/src/routes/`, excluding `*.test.ts`.
2. An **SSE route** is any file whose source contains `text/event-stream`.
3. For each, assert either (a) it imports from `sse-keepalive.ts` and installs
   no bare numeric interval, or (b) it is listed in an explicit
   `NO_HEARTBEAT_ROUTES` map **with a reason string**, which the test prints.
4. Print the discovered population and its size beside the verdict, so a
   sweep that matches nothing reads as a broken sweep rather than a clean one.

Point 3(b) exists for `model-registry-stream.ts`, which serves SSE and
correctly has no heartbeat (it streams generator output continuously and ends
in seconds). Listing it with a reason is a claim a reviewer can falsify; a
silent skip is not.

Matching is done with a JavaScript regular expression inside a `bun test`, not
a shell sweep — this repository's `grep` is `ugrep` honouring `.gitignore`, and
its `git grep -E` build drops `\b`; both have produced false-clean sweeps here.

## D4 — the enqueue-throw path leaks (SSE-04)

`logs.ts:560-571` and the matching block in `events.ts`:

```ts
heartbeatTimer = setInterval(() => {
  if (closed) { clearInterval(heartbeatTimer); return; }
  try { controller.enqueue(…); }
  catch { closed = true; clearInterval(heartbeatTimer); }   // <- never closes
}, HEARTBEAT_MS);
```

On a throw the flag flips and the timer stops, but the stream is never closed
and `unsubscribe` is never called — so `startSinkTail`'s 1 s poll keeps
stat-ing and reading the sink forever, enqueueing into a dead controller, for
the life of the process. The client sees a connection that is open and silent.

Fix: route both the heartbeat catch and the `enqueue` catch through the same
teardown `cancel()` already performs — `unsubscribe?.()`, clear both timers,
`controller.close()` inside a try. This is a real leak independent of the
heartbeat interval and is fixed here because the same lines are being edited;
it is not scope creep hunting.

## D5 — client drop classification (SSE-06)

`connectLogsStreamOnce` currently returns `boolean` and collapses three
distinct exits into `false`: our own abort, a non-200, and a thrown network
error. Only the third should reconnect.

Return type becomes a discriminated string so the caller can tell them apart:

| Exit | Value | Caller behavior |
| --- | --- | --- |
| server closed the stream cleanly, `logsLive` still true | `"clean"` | reconnect (existing T47 path) |
| thrown error, not our abort, not a non-200 | `"retryable"` | reconnect under the same bounds; banner only on give-up |
| non-200 response | `"terminal"` | banner + `logsLive = false`, never retried (T47's rule, preserved) |
| our own abort, or `logsLive` went false | `"aborted"` | silent, no reconnect |

`rapidCloseStreak` and `maxReconnectAttempts` are reused unchanged, so a
genuinely broken endpoint still gives up in ~10 s instead of hot-looping.

## D6 — the per-request window override

`app.listen()`'s callback handle carries the native `Bun.Server` at
`handle.bun.server`, and that object has `timeout(request, seconds)` — Bun's
per-request idle override. `index.ts` captures it once and exposes it through a
named accessor; each SSE route calls it at stream start with
`SSE_REQUEST_TIMEOUT_SECONDS` from the shared constant module.

```
listen callback ──> setSseRequestTimeoutSource(handle.bun?.server)
                             │
route stream start ──> applySseRequestTimeout(request)   // no-op if absent
```

Three properties this shape buys, each of which a naive inline
`handle.bun.server.timeout(...)` at each call site would lose:

1. **One place knows the handle's shape.** `handle.bun?.server` is an
   undocumented-by-Elysia traversal into an adapter internal; it belongs behind
   one accessor that can be re-pointed when the adapter changes, not repeated in
   every route.
2. **Absence is normal, not exceptional** (AC-07.3). Under a non-Bun runtime, a
   different adapter, or any test that imports a route without calling
   `listen()`, there is no native server. The accessor returns `undefined` and
   the call is skipped; the heartbeat (D2) is what covers that case, which is
   exactly why D2 sizes against the un-widened window.
3. **It is observable.** AC-07.4 requires counting applications, because a
   survival assertion cannot tell "the override worked" from "the override was
   never applied and the heartbeat carried it". That confusion is precisely how
   the first draft of this design reached a wrong conclusion, and a test that
   cannot distinguish the two would let it recur.

Applied from the route's stream start rather than a global `onRequest` hook so
non-SSE requests keep the default window — a widened idle window on ordinary
JSON routes would hold sockets open for no benefit.

## Risks

| Risk | Mitigation |
| --- | --- |
| A reverse proxy in front of the API has its own idle timeout under 5 s | Not reachable from this repo. The smaller heartbeat strictly helps; documented in `.env.example` beside the override. |
| The 30 s integration test is slow and gets a 5 s default timeout from `bunfig.toml` | Explicit third-arg budget (`}, 60_000)`), the established idiom here. Raise the per-test value, never the global one. |
| The integration test binds a real port and flakes under parallel CI | Bind port `0` / a high random port with `reusePort: false`, and stop the server from the listen callback's handle — `app.stop()` throws under this adapter (recorded). |
| Changing `connectLogsStreamOnce`'s return type breaks its existing tests | Those tests are the sensor for SSE-06; updating them is expected. Each updated assertion must still fail against the pre-fix behavior — checked in T6's gate, not assumed. |
| The new sensor passes vacuously if the route glob matches nothing | AC-03.2 requires printing the discovered population and its size; the test asserts the count is ≥ 2 before judging membership. |

## Reproduction

The harnesses used for spec E1–E4 are not shipped. To re-derive:

```bash
# server under the shipped default
cd apps/tools-api && bun src/index.ts

# hold the stream idle and watch for the drop
KEY=$(python3 -c "import json;print(json.load(open('$HOME/.config/massa-ai/config.json'))['security']['apiKey'])")
curl -sN -H "x-api-key: $KEY" http://localhost:3333/api/v1/logs/stream | ts

# the same with the heartbeat inside the window — survives
MASSA_AI_SSE_HEARTBEAT_MS=5000 bun src/index.ts
```

Bun prints `[Bun.serve]: request timed out after 10 seconds. Pass
`idleTimeout` to configure.` on the server side at each drop — the fastest
single confirmation that the transport, not the route, closed the stream.
