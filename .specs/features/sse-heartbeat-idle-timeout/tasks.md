# SSE Heartbeat vs Transport Idle Timeout — Tasks

Contract: `spec.md` · Design: `design.md`.
Sizing: **4 Phases = 9 Tasks.**

Revised after the Plan Challenge Gate (evidence-audit) falsified the original
"the window cannot be raised" premise. T2b is the task that correction added;
`--filter` gate commands were corrected in the same pass.

A Phase is an ordered group of Tasks sharing a dependency boundary. Each Task
is one atomic commit landed after its own gate passes.

---

## Phase 1 = 2 Tasks — the constant and its consumers

### T1 — introduce `sse-keepalive.ts`

- Requirements: SSE-01 (AC-01.1, AC-01.2, AC-01.4)
- Write set: `apps/tools-api/src/routes/sse-keepalive.ts`,
  `apps/tools-api/src/routes/sse-keepalive.test.ts`
- Do: export `TRANSPORT_IDLE_WINDOW_MS = 10_000`,
  `SSE_HEARTBEAT_MS_DEFAULT = 5_000`, `SSE_MAX_DURATION_MS_DEFAULT`,
  `resolveHeartbeatMs()`, `resolveMaxDurationMs()`. Each constant carries the
  Bun citation from spec E4 in its docblock.
- Gate: `bun test apps/tools-api/src/routes/sse-keepalive.test.ts`
- Done when: resolvers honor `MASSA_AI_SSE_HEARTBEAT_MS` /
  `MASSA_AI_SSE_MAX_DURATION_MS` per call, fall back to the defaults, and
  ignore a non-numeric value the same way the current `Number(x) || default`
  expression does.

### T2 — repoint both SSE routes

- Requirements: SSE-01 (AC-01.1, AC-01.3), SSE-05
- Write set: `apps/tools-api/src/routes/logs.ts`,
  `apps/tools-api/src/routes/events.ts`
- Do: delete `SSE_HEARTBEAT_MS_DEFAULT` / `HEARTBEAT_MS_DEFAULT` and both
  `MAX_DURATION_MS_DEFAULT` literals; call the resolvers instead.
- Gate: `cd apps/tools-api && bun test src/routes/logs.test.ts src/routes/events.test.ts`
  (**not** `run-tests-isolated.ts --filter=…` — `--filter` is core-only; the
  tools-api wrapper rejects it with `Unknown argument(s)`. Verified.)
- Done when: no `15_000` / `15000` literal remains in either file, and every
  pre-existing `logs.test.ts` / `events.test.ts` case is still green — in
  particular the max-duration cases (AC-05.1).

### T2b — widen the transport window per request

- Requirements: SSE-07 (AC-07.1 … AC-07.4)
- Write set: `apps/tools-api/src/index.ts`,
  `apps/tools-api/src/routes/sse-keepalive.ts`,
  `apps/tools-api/src/routes/logs.ts`, `apps/tools-api/src/routes/events.ts`,
  `apps/tools-api/src/routes/sse-keepalive.test.ts`
- Do: add `SSE_REQUEST_TIMEOUT_SECONDS = 120` to the constant module; capture
  the native `Bun.Server` from the `app.listen()` callback
  (`handle.bun?.server`) behind one named accessor in `index.ts`; call it at
  each SSE route's stream start; no-op when the handle or its `timeout` method
  is absent.
- Gate: `cd apps/tools-api && bun test src/routes/logs.test.ts src/routes/events.test.ts src/routes/sse-keepalive.test.ts`
- Done when: an application counter proves the override actually ran on the
  request path (AC-07.4 — survival alone cannot distinguish it from the
  heartbeat carrying the stream), and a test with no native handle registered
  passes without throwing.
- Measured basis: `server.timeout(request, 60)` moved the drop from 12.0 s to
  exactly 60.0 s against the real route modules (spec E5); a 120 s window with
  the 15 s heartbeat held both endpoints 180 s idle (spec E6).

---

## Phase 2 = 2 Tasks — the sensors

### T3 — inequality guard + source-derived SSE route enumeration

- Requirements: SSE-03 (AC-03.1, AC-03.2, AC-03.3)
- Write set: `apps/tools-api/src/routes/sse-keepalive-contract.test.ts`
- Do: (a) fail when `resolveHeartbeatMs()` default ≥ `TRANSPORT_IDLE_WINDOW_MS`,
  naming both values; (b) enumerate every non-test file under
  `src/routes/` containing `text/event-stream`, print the population and its
  size, assert size ≥ 2, and require each member either to import from
  `sse-keepalive.ts` or to appear in `NO_HEARTBEAT_ROUTES` with a reason.
- Gate: `bun test apps/tools-api/src/routes/sse-keepalive-contract.test.ts`
- Done when: the test is **observed RED** by temporarily restoring `15_000` as
  the default, and RED again by adding a scratch SSE route that imports
  nothing — both mutations restored by text edit, never by `git checkout`, and
  both transcripts recorded in `validation.md`.

### T4 — real-HTTP idle-survival test

- Requirements: SSE-02 (AC-02.1, AC-02.2, AC-02.3)
- Write set: `apps/tools-api/src/routes/sse-idle-survival.test.ts`
- Do: start a real listening Elysia app carrying `logsRoutes` and
  `eventsRoutes` on an ephemeral port with `reusePort: false`; hold each stream
  open with zero application traffic; assert ≥ 3 heartbeat frames and no
  disconnect within 30 s. Stop the server via the listen callback's handle.
- Gate: `bun test apps/tools-api/src/routes/sse-idle-survival.test.ts`
- Done when: green with the fix, and **observed RED** against the pre-fix
  15 000 ms default. Per-test budget `}, 60_000)`; the global 5 s timeout is
  not touched.

---

## Phase 3 = 2 Tasks — the leak and the client

### T5 — close the stream when enqueue throws

- Requirements: SSE-04 (AC-04.1, AC-04.2)
- Write set: `apps/tools-api/src/routes/logs.ts`,
  `apps/tools-api/src/routes/events.ts`, plus their existing test files
- Do: route the heartbeat catch and the `enqueue` catch through the same
  teardown `cancel()` performs — `unsubscribe?.()`, clear both timers,
  `controller.close()` guarded.
- Gate: `cd apps/tools-api && bun test src/routes/logs.test.ts src/routes/events.test.ts`
  (**not** `run-tests-isolated.ts --filter=…` — `--filter` is core-only; the
  tools-api wrapper rejects it with `Unknown argument(s)`. Verified.)
- Done when: a test drives a throwing controller and observes the subscription
  released and the stream closed; it fails against the pre-fix code.

### T6 — classify client drops as reconnectable vs terminal

- Requirements: SSE-06 (AC-06.1 … AC-06.4)
- Write set: `apps/web-ui/src/static/views/logs.ts`,
  `apps/web-ui/src/__tests__/view-handlers.test.ts` (or the file that currently
  covers `connectLogsStreamOnce`)
- Do: change `connectLogsStreamOnce` to return
  `"clean" | "retryable" | "terminal" | "aborted"` per design D5;
  `runLogsLiveStream` reconnects on `clean` and `retryable`, banners and stops
  on `terminal`, stays silent on `aborted`, and keeps the existing
  `rapidCloseStreak` / `maxReconnectAttempts` bounds.
- Gate: `bun test apps/web-ui` and `bun run type-check`
- Done when: each of the four exits has its own assertion, and each assertion
  is checked to fail against the pre-fix boolean behavior rather than assumed
  to — a `data-action` fake-DOM test can pass vacuously here.

---

## Phase 4 = 2 Tasks — documentation and close-out

### T7 — document the inequality where an operator meets it

- Requirements: SSE-01 (AC-01.4), spec Edge Cases
- Write set: `.env.example`, `CHANGELOG.md`
- Do: annotate `MASSA_AI_SSE_HEARTBEAT_MS` with the 10 s Bun bound and the
  foot-gun of exceeding it; add `### Fixed` entries under `[Unreleased]` for
  both endpoints (patch bump per `CONTRIBUTING.md` § CHANGELOG authoring —
  confirm the heading→bump table before writing).
- Gate: `bun run lint` and the CHANGELOG merge gate's own shape
- Done when: `[Unreleased]` names the user-visible symptom, not only the
  constant.

### T8 — close-out

- Write set: `.specs/features/sse-heartbeat-idle-timeout/validation.md`,
  `.specs/project/STATE.md`, `.specs/HANDOFF.md`,
  `.specs/project/FEATURES.json`
- Do: record the independent verification result, every mutation transcript
  from T3/T4/T5/T6, and the gate figures.
- Gate: `bun skills/massa-ai/scripts/check_specs_delivered.ts sse-heartbeat-idle-timeout --root .`
- Done when: exit 0, committed **before** the first push.

---

## Test Coverage Matrix

| Requirement | Sensor | Task |
| --- | --- | --- |
| SSE-01 | `sse-keepalive.test.ts` + literal-absence assertion | T1, T2 |
| SSE-02 | `sse-idle-survival.test.ts` (real HTTP, 30 s idle) | T4 |
| SSE-03 | `sse-keepalive-contract.test.ts` (inequality + enumeration) | T3 |
| SSE-04 | throwing-controller teardown test | T5 |
| SSE-05 | existing max-duration cases stay green | T2 |
| SSE-06 | four-exit classification tests | T6 |
| SSE-07 | application counter + absent-handle degradation | T2b |

## Gate Check Commands

```bash
bun run lint          # oxlint, repo root, correctness category at error
bun run type-check
cd apps/tools-api && bun test src/routes/logs.test.ts src/routes/events.test.ts \
                              src/routes/sse-keepalive.test.ts \
                              src/routes/sse-keepalive-contract.test.ts \
                              src/routes/sse-idle-survival.test.ts
bun test apps/web-ui
bun run test:scripts
```

`--filter` is a **core-only** flag (`scripts/lib/run-tests-isolated.ts:155`);
the tools-api wrapper rejects it. Single-file `bun test` invocations are safe —
one file is one process, so the cross-contamination the isolation runner exists
to prevent cannot occur.

**Worktree provisioning precedes every gate.** A fresh worktree needs
`bun install` *and* `bun run build` before any tools-api suite can run;
without the build, every suite fails identically with
`Cannot find module '@massa-ai/core'`. That is an environment failure, never a
code failure — measured here on the first baseline attempt.

## Dependencies

T1 → {T2, T2b} → {T3, T4, T5}; T6 is independent of T1–T5; T7 after T2b and T6;
T8 last.
