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
| Raising `Bun.serve`'s `idleTimeout` | Measured unreachable under `adapter: node()` — see Evidence E4. Four placements and two node-server knobs all inert. |
| Migrating off `adapter: node()` | `reusePort: false` and the restart/drain path are built on it (`apps/tools-api/src/index.ts:170-200`); swapping the adapter is a separate, higher-risk change with its own spec. |
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

**E4 — the idle window is not configurable here.** Bun states the mechanism
itself on every drop:

```
[Bun.serve]: request timed out after 10 seconds. Pass `idleTimeout` to configure.
```

Five placements were tried against a minimal `Elysia({ adapter: node() })`
server; all five dropped at 12.0 s:

| Attempt | Observed |
| --- | --- |
| `app.listen({ port, idleTimeout: 120 })` | `serveOptions.idleTimeout` stayed `undefined` |
| `new Elysia({ adapter: node(), serve: { idleTimeout: 120 } })` | `serveOptions.idleTimeout` stayed `undefined` |
| `app.listen({ port, serve: { idleTimeout: 120 } })` | `serveOptions.idleTimeout` stayed `undefined` |
| mutate `handle.serveOptions.idleTimeout` after listen | write accepted, inert (server already started) |
| `server.setTimeout(...)` / `server.timeout = …` | handle is a plain `Object`, `hasSetTimeout: false`; field writes accepted, inert |

The listen callback's handle exposes `runtime, options, bun, serveOptions,
fetch, …` — an Elysia server abstraction, not a `node:http.Server`. So the
window is a fixed 10 s from this codebase's point of view, and the heartbeat is
the only side of the inequality that can move.

---

## Requirements

### SSE-01 — one heartbeat constant, below the idle window

The heartbeat interval default MUST be strictly less than the transport idle
window, with margin for a slow or loaded host, and MUST be declared **once**
rather than per route.

- **AC-01.1** A single exported module owns the SSE keep-alive default; both
  `routes/logs.ts` and `routes/events.ts` read it and neither declares its own
  numeric literal.
- **AC-01.2** The default is 5 000 ms — half the measured 10 s window, the
  value proven green in E2.
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

### SSE-04 — the drop is diagnosable if it ever returns

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

## Open Questions

None. The one design unknown — whether the idle window could be raised instead
— was closed by measurement (E4) before this spec was written.
