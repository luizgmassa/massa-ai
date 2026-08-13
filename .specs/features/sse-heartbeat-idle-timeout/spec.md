# SSE Heartbeat vs Transport Idle Timeout — Specification

Slug: `sse-heartbeat-idle-timeout` · Session `spec-sse-heartbeat-idle-timeout` ·
Workflow **spec-driven** · Persona pin `context-skill-harness-engineer-architect`
· Branch `fix/sse-heartbeat-idle-timeout` from `origin/main` @ `89909051`,
worktree `/Users/luizmassa/Projects/massa-ai-wt-sse-heartbeat`.

## Problem Statement

Every Server-Sent Events (SSE) stream this API serves is killed by the
transport roughly 10 seconds after its last byte, because the keep-alive
heartbeat that exists to prevent exactly that is scheduled **15 seconds** apart
— longer than the idle window it is supposed to stay inside. The heartbeat can
therefore never fire on an idle stream: the socket is always closed first.

The reported symptom is the Admin Portal's Logs tab: Live delivers the initial
burst of entries, then stops "after some seconds". That is the whole mechanism
— the burst keeps the socket alive while it lasts, log traffic goes quiet, and
~10 seconds later the transport drops the connection. The browser client
(`apps/web-ui/src/static/views/logs.ts`) sees a thrown fetch error rather than a
clean close, so it takes its `LOG-15` terminal path: `state.logsLive = false`
plus an error banner, and does **not** reconnect.

The defect is not specific to the Logs tab. `GET /api/v1/events` — the stream
that drives the portal's real-time updates — hardcodes the same 15 000 ms
heartbeat in a second, independent literal and drops identically. It has gone
unnoticed because `EventSource` reconnects automatically, so the failure
presents as a silent ~12-second reconnect cycle instead of a visible stop.

## Goals

- [ ] An idle SSE stream survives indefinitely, on every SSE endpoint, without
      the client reconnecting.
- [ ] The heartbeat interval and the transport idle window are related by an
      explicit, documented margin rather than by two unrelated constants that
      happen to be wrong.
- [ ] A deterministic sensor fails if a future edit reintroduces a heartbeat at
      or above the idle window.
- [ ] A transient mid-stream transport drop no longer permanently disables the
      Logs live tail.

## Out of Scope

| Item | Reason |
| --- | --- |
| Configuring `Bun.serve`'s `idleTimeout` at **listen time** | Measured unreachable under `adapter: node()` — see E4. Five placements all inert. The **per-request** override is reachable and is now in scope (SSE-07); these are different APIs. |
| Migrating off `adapter: node()` | `reusePort: false` and the restart/drain path are built on it (`apps/tools-api/src/index.ts:170-200`); swapping the adapter is a separate, higher-risk change with its own spec. |
| Removing the heartbeat in favor of the per-request override alone | Measured insufficient: the override sets a **finite** window, so a stream with no keep-alive inside it drops exactly when the window expires (E5: `server.timeout(request, 60)` → dropped at 60.0 s). Streams are designed to live 10 minutes. |
| `SSE_MAX_DURATION_MS` (10-minute scheduled close) | Working as designed; the client's T47/T49 reconnect path already handles it and was measured correct. |
| The live tail's source selection (file sink vs ring buffer) | Correct as shipped; `startSinkTail` was observed delivering 8 entries before the drop. |
| `POST /api/v1/model-registry/regenerate-*-stream` heartbeat | That stream has no heartbeat and needs none — it emits generator output continuously and terminates in seconds. Covered by AC-03's sensor only as a non-offender. |
| Web UI reconnect UX beyond the drop class named in SSE-06 | The T47/T49/T50 reconnect design is sound; this feature changes only which exit counts as reconnectable. |

---

## Evidence

Measured on 2026-08-12 against `origin/main` @ `89909051`, macOS arm64, Bun
1.3.14, real PostgreSQL, real API server on :3333. Every figure below is
reproducible with the commands recorded in `design.md` § Reproduction.

**E1 — the reported symptom, reproduced at the HTTP layer.** A client that
mirrors `views/logs.ts`'s fetch + `ReadableStream` + `data:` frame parsing,
against the shipped 15 000 ms heartbeat:

```
 2.0s connected status=200 ct=text/event-stream
 3.0s data #8 seq=8 info PostgreSQL vector store initialized   <- last frame
12.0s SILENT for 9.0s (data=8 hb=0)
13.6s THREW: The socket connection was closed unexpectedly.
```

Note `hb=0`: **no heartbeat ever arrived**, because the socket died ~10.6 s
after the last byte and the first heartbeat was due at 15 s.

**E2 — discriminating test.** Same harness, same server, one variable changed
(`MASSA_AI_SSE_HEARTBEAT_MS=5000`):

```
 5.0s heartbeat #1 … 45.0s heartbeat #9
50.0s RUN_MS reached — data=0 heartbeats=9
```

45 seconds fully idle, 9 heartbeats, zero drops. The heartbeat interval is the
single controlling variable.

**E3 — the class, not the named instance.** With the heartbeat pushed out of
the way (`MASSA_AI_SSE_HEARTBEAT_MS=600000`), both SSE endpoints drop:

| Endpoint | Sample 1 | Sample 2 |
| --- | --- | --- |
| `GET /api/v1/logs/stream` | DROPPED at 8.5 s | DROPPED at 12.0 s |
| `GET /api/v1/events` | DROPPED at 12.0 s | DROPPED at 12.0 s |

`events.ts:15` and `logs.ts:347` each declare their own `15_000` literal. Two
copies, one defect.

**E4 — the idle window is not configurable at listen time.** Bun states the
mechanism itself on every drop:

```
[Bun.serve]: request timed out after 10 seconds. Pass `idleTimeout` to configure.
```

Five **listen-time** placements were tried against a minimal
`Elysia({ adapter: node() })` server; all five dropped at 12.0 s:

| Attempt | Observed |
| --- | --- |
| `app.listen({ port, idleTimeout: 120 })` | `serveOptions.idleTimeout` stayed `undefined` |
| `new Elysia({ adapter: node(), serve: { idleTimeout: 120 } })` | `serveOptions.idleTimeout` stayed `undefined` |
| `app.listen({ port, serve: { idleTimeout: 120 } })` | `serveOptions.idleTimeout` stayed `undefined` |
| mutate `handle.serveOptions.idleTimeout` after listen | write accepted, inert (server already started) |
| `server.setTimeout(...)` / `server.timeout = …` | handle is a plain `Object`, `hasSetTimeout: false`; field writes accepted, inert |

The listen callback's handle exposes `runtime, options, bun, serveOptions,
fetch, …` — an Elysia server abstraction, not a `node:http.Server`.

**E5 — but the window IS configurable per request, and this spec originally got
that wrong.** The Plan Challenge Gate (evidence-audit mode) rejected E4's
"not configurable" conclusion as overreaching: every placement tried was
*listen-time* configuration, and Bun also exposes a *per-request* override,
`server.timeout(request, seconds)`, on the native `Bun.Server` reachable at
`listenHandle.bun.server`. Re-measured against the **real** `logsRoutes` and
`eventsRoutes` modules — not a minimal repro — applied from an `onRequest` hook,
with heartbeats pushed out of reach (`MASSA_AI_SSE_HEARTBEAT_MS=600000`) so
survival could only be credited to the override:

| Configuration | `GET /api/v1/events` |
| --- | --- |
| no override (this harness's own baseline) | DROPPED at 12.0 s |
| `server.timeout(request, 60)` | DROPPED at **60.0 s** |

The window is therefore not fixed: it tracks the value passed, exactly.

**E6 — and the override alone is not the fix; the two are complements.** The
override sets a *finite* window, so removing the heartbeat merely moves the drop
(E5's 60 s row is that failure). With the window widened to 120 s and the
**shipped, unchanged 15 s heartbeat** left in place, both endpoints were held
fully idle for 180 s:

| Endpoint | Outcome | Heartbeats received |
| --- | --- | --- |
| `GET /api/v1/logs/stream` | SURVIVED 180 s | 12 |
| `GET /api/v1/events` | SURVIVED 180 s | 11 |

180 s > 120 s, so survival is not the window being large — it is each heartbeat
resetting the idle timer inside it. Both sides of the inequality move, and the
fix needs both: the override removes the invisible 10 s default, and the
heartbeat is what keeps a stream alive indefinitely inside whatever window is
set.

**Measurement conditions.** All figures above: macOS arm64, Bun 1.3.14, host at
load average 1.46, 35 days uptime, real PostgreSQL, nothing else contending.
The one 8.5 s sample in E3's four is unexplained and was not swept further —
recorded rather than dismissed. It no longer affects the design's correctness,
because SSE-07's override makes the default window's exact floor irrelevant
whenever it can be applied, and SSE-01's heartbeat is chosen to sit inside the
**un-widened** floor for the case where it cannot.

---

## Requirements

### SSE-01 — one heartbeat constant, below the idle window

The heartbeat interval default MUST be strictly less than the transport idle
window, with margin for a slow or loaded host, and MUST be declared **once**
rather than per route.

- **AC-01.1** A single exported module owns the SSE keep-alive default; both
  `routes/logs.ts` and `routes/events.ts` read it and neither declares its own
  numeric literal.
- **AC-01.2** The default is 5 000 ms, chosen against the **un-widened** window
  so the stream survives even on a deployment where SSE-07's override cannot be
  applied. Margin is stated against the observed floor, not the nominal one:
  8.5 s ÷ 5 s = 1.7×, not the 2× a 10 s nominal would suggest. Proven green in
  E2.
- **AC-01.3** The existing `MASSA_AI_SSE_HEARTBEAT_MS` override still wins, on
  both endpoints, read per request (the current behavior; unchanged).
- **AC-01.4** The documented idle window (10 000 ms) is declared beside the
  heartbeat with its Bun citation, so the inequality is legible at the edit
  site rather than inferable only from a bug report.

### SSE-02 — an idle stream survives past the idle window

- **AC-02.1** A real HTTP client holding `GET /api/v1/logs/stream` open with
  **zero** application traffic receives at least 3 heartbeat frames and is not
  disconnected within 30 s.
- **AC-02.2** The same holds for `GET /api/v1/events`.
- **AC-02.3** Both assertions run against a real listening server over real
  HTTP. An in-process handler call cannot observe a transport idle timeout, so
  an in-process test would pass vacuously against the broken code.

### SSE-03 — a regression sensor on the inequality

- **AC-03.1** A test fails when the resolved heartbeat default is ≥ the
  declared idle window, naming both values.
- **AC-03.2** The sensor enumerates **every** SSE route in `apps/tools-api`
  (discovered from source, not from a hardcoded list of two) and fails if any
  of them installs a keep-alive interval from a literal instead of the shared
  constant. A route that legitimately has no heartbeat is reported as such
  rather than silently passing.
- **AC-03.3** The sensor is proved RED before it is trusted: restoring the
  15 000 ms literal makes it fail, and that failure is recorded in
  `validation.md`.
- **AC-03.4** The enumeration's detection rule is stated as a named limitation
  rather than left implicit: it matches the literal `text/event-stream` in route
  source, so a future route that sets its content-type from an imported constant
  would fall outside the population entirely. Raised by the Plan Challenge Gate
  as a narrower recurrence of the very blind spot this sensor exists to close.
  The test's own docblock records it, and the printed population is what a
  reviewer checks against `routes/`.

### SSE-04 — the drop is diagnosable if it ever returns

**Opportunistic co-fix, not a dependency.** This leak is triggered by
`controller.enqueue` throwing on client disconnect and is independent of the
heartbeat interval; SSE-01–03 are correct without it. It is included because it
lives on the same lines, and it is isolated in its own task with its own gate
so it never rides along inside another task's diff.

- **AC-04.1** When a stream's heartbeat `controller.enqueue` throws, the route
  closes the stream rather than leaving `closed = true` with an open socket and
  a still-polling source subscription. (Observed in `logs.ts:560-571` and
  `events.ts`: the flag is set, the interval is cleared, but the stream is
  never closed and `startSinkTail` keeps polling into a dead enqueue.)
- **AC-04.2** Teardown on that path releases the source subscription, matching
  what `cancel()` already does.

### SSE-05 — no silent behavior change to the 10-minute close

- **AC-05.1** `SSE_MAX_DURATION_MS` semantics are unchanged, and the client's
  existing clean-close reconnect (T47/T49) still fires for it.

### SSE-07 — widen the transport window explicitly, per request

The 10 s default is invisible at every edit site and is the reason this defect
was possible. Every SSE route MUST set its own window rather than inherit it.

- **AC-07.1** The native `Bun.Server` captured at `app.listen()` is exposed
  through one named accessor in `apps/tools-api/src/index.ts`, not read ad hoc
  from the listen handle at each call site.
- **AC-07.2** Every SSE route calls `server.timeout(request, N)` at stream
  start, with `N` from the shared constant module (SSE-01), so the window is
  declared beside the heartbeat it must exceed.
- **AC-07.3** The call degrades silently when the native handle or its
  `timeout` method is absent — a non-Bun runtime, a future adapter change, or a
  test harness that never called `listen()`. Absence reduces the stream to the
  un-widened window, which AC-01.2's heartbeat already survives; it must never
  throw and must never 500 the request.
- **AC-07.4** A test asserts the override is actually applied on the request
  path, counting applications. A survival assertion alone cannot distinguish
  "the override worked" from "the override was never applied and the heartbeat
  carried it" — the exact confusion that produced the wrong E4.

### SSE-06 — a transient drop does not permanently disable the live tail

- **AC-06.1** A thrown fetch error that is **not** our own abort and **not** a
  non-200 response is treated as reconnectable: the tail retries under the
  existing `maxReconnectAttempts` / `rapidCloseStreak` bounds instead of
  setting `logsLive = false`.
- **AC-06.2** A non-200 response stays terminal, preserving T47's deliberate
  rule that a status which will not fix itself is never retried.
- **AC-06.3** Our own teardown abort stays silent — no banner, no reconnect.
- **AC-06.4** When the reconnect bound is exhausted, the tail still turns Live
  off and banners, as today.

---

## Edge Cases

| Case | Required behavior |
| --- | --- |
| Host under heavy load stretches the effective window | 5 000 ms leaves a 2× margin; the sensor in SSE-03 pins the ratio, not the absolute value. |
| Operator sets `MASSA_AI_SSE_HEARTBEAT_MS` above the idle window | Honored (it is an explicit override), but SSE-03's sensor covers the **default** only. Documented in `.env.example` as a foot-gun with the 10 s bound named. |
| Reverse proxy with its own idle timeout shorter than 10 s | Out of this repo's control; the smaller default helps rather than hurts. Named in `design.md` Risks. |
| Client disconnects mid-heartbeat | Existing `cancel()` teardown unchanged. |
| Two portal tabs open on Logs | Each holds its own stream; unchanged, and unaffected by the interval. |

## Verification

| Requirement | Sensor |
| --- | --- |
| SSE-01 | Unit: both routes resolve the shared constant; no `15_000`/`15000` literal remains in either. |
| SSE-02 | Integration over real HTTP, ≥30 s idle hold, both endpoints. |
| SSE-03 | Guard test on the inequality + a source-derived enumeration of SSE routes; mutation-proved RED. |
| SSE-04 | Unit: a throwing controller drives the heartbeat path and the stream is observed closed and unsubscribed. |
| SSE-05 | Existing `logs.test.ts` / `events.test.ts` max-duration cases stay green. |
| SSE-06 | Unit against `connectLogsStreamOnce` / `runLogsLiveStream`: thrown-network-error reconnects, non-200 does not, abort is silent. |
| SSE-07 | Application counter asserted non-zero on the request path, plus absent-handle degradation test. |

## Open Questions

None open. One was closed **wrongly** and is recorded here so the correction is
not lost: the first draft of this spec asserted that the transport idle window
could not be raised, on the strength of five listen-time placements. The Plan
Challenge Gate falsified that with Bun's per-request `server.timeout`, which was
then re-measured against the real routes (E5, E6) and became SSE-07. The
lesson generalizes past this feature: an exhaustive-looking negative result is
only exhaustive over the API surface it searched, and "I tried five things"
is not "there is no sixth".
