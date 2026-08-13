# SSE Heartbeat vs Transport Idle Timeout — Design

Contract: `.specs/features/sse-heartbeat-idle-timeout/spec.md`.

## Approach

The defect is an inequality that is wrong by construction: `heartbeat (15 s) >
idle window (10 s)`. Only one side can move (spec E4), so the design moves the
heartbeat and then **pins the inequality with a sensor** so it cannot silently
invert again.

Three alternatives were considered and rejected:

| Alternative | Rejected because |
| --- | --- |
| Raise `Bun.serve`'s `idleTimeout` to 120 s | Unreachable through Elysia's public surface under `adapter: node()` — five placements measured inert (spec E4). |
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

Measured, not chosen by feel. The window is 10 s (Bun's own message). A
heartbeat at 5 s survived 45 s fully idle with 9 frames and zero drops
(spec E2). The margin is a factor of 2, which absorbs a loaded host without
making the heartbeat itself a traffic source: on an idle stream this is 12
comment frames per minute, ~10 bytes each.

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
