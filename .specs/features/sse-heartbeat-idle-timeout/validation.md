# SSE Heartbeat vs Transport Idle Timeout Validation

**Date**: 2026-08-13
**Spec**: `.specs/features/sse-heartbeat-idle-timeout/spec.md`
**Diff range**: `89909051..HEAD` (12 commits: `d1999866` .. `f3df0923`, worktree
`/Users/luizmassa/Projects/massa-ai-wt-sse-heartbeat`, branch
`fix/sse-heartbeat-idle-timeout`)
**Verifier**: independent sub-agent (author ≠ verifier) — massa-ai-verification-agent

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 (`sse-keepalive.ts`) | ✅ Done | `b249289f` |
| T2 (repoint routes) | ✅ Done | `17d56e69` |
| T2b (per-request window) | ✅ Done | `d17cd5cc` |
| T3 (inequality + enumeration sensor) | ✅ Done | `f50b0f2c` |
| T4 (real-HTTP idle-survival) | ✅ Done | `45e4e45c` |
| T5 (enqueue-throw teardown) | ✅ Done | `07a301c7` |
| T6 (client drop classification) | ✅ Done | `587d2330` |
| T7 (docs: `.env.example` + CHANGELOG) | ✅ Done | `637b32d1`, `f3df0923` (fixup) — landed concurrently with dispatch, confirmed present |
| T8 (close-out) | ⚠️ Partial | This report is T8's validation-evidence deliverable; `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/project/FEATURES.json` updates and the commit are outside this verifier's write scope (writes only `validation.md`) and remain for the close-out task |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-01.1 single module owns default; neither route declares its own literal | No `15_000`/`15000` literal in `logs.ts`/`events.ts`; both import from `sse-keepalive.ts` | `apps/tools-api/src/routes/sse-keepalive-contract.test.ts:218-225` (`IMPORTS_SSE_KEEPALIVE_RE` + `hasBareNumericIntervalLiteral`); literal absence independently confirmed via `grep -n "15_000\|15000" logs.ts events.ts` → no matches | ✅ PASS |
| AC-01.2 default is 5000ms, strictly below idle window | `SSE_HEARTBEAT_MS_DEFAULT === 5_000` and `< TRANSPORT_IDLE_WINDOW_MS` | `apps/tools-api/src/routes/sse-keepalive.test.ts:31-34` | ✅ PASS — killed by Mutation 1 |
| AC-01.3 env override still wins, per request, both endpoints | `Number(MASSA_AI_SSE_HEARTBEAT_MS) \|\| default`, read per call | `apps/tools-api/src/routes/sse-keepalive.test.ts:51-73` (override + per-call-read cases); pre-existing per-endpoint override behavior preserved in `logs.test.ts`/`events.test.ts` (unchanged, still green) | ✅ PASS |
| AC-01.4 idle window documented beside heartbeat with Bun citation | Docblock states `TRANSPORT_IDLE_WINDOW_MS` with Bun's own drop message | `apps/tools-api/src/routes/sse-keepalive.ts:13-27` — docblock quotes `[Bun.serve]: request timed out after 10 seconds...` beside the constant | ✅ PASS (doc inspection, no test required by spec) |
| AC-02.1 `GET /logs/stream` idle survival ≥30s, ≥3 heartbeats | real HTTP hold, no disconnect, ≥3 `: heartbeat` frames | `apps/tools-api/src/routes/sse-idle-survival.test.ts:126-146` | ✅ PASS |
| AC-02.2 `GET /events` idle survival ≥30s, ≥3 heartbeats | same, other endpoint | `apps/tools-api/src/routes/sse-idle-survival.test.ts:148-168` | ✅ PASS |
| AC-02.3 real listening server, real HTTP (not in-process) | `Elysia({adapter: node()}).listen()` + real `fetch()` | `apps/tools-api/src/routes/sse-idle-survival.test.ts:45-59, 79-123` (`startServer`, `holdIdleStream`) | ✅ PASS |
| AC-03.1 sensor fails when default ≥ idle window, naming both | `expect(heartbeat).toBeLessThan(TRANSPORT_IDLE_WINDOW_MS)` with both values in message | `apps/tools-api/src/routes/sse-keepalive-contract.test.ts:163-178` | ✅ PASS — killed by Mutation 1 |
| AC-03.2 enumerates every SSE route from source, requires import or listed exception | walks `src/routes/`, filters `text/event-stream`, asserts population ≥2, checks membership | `apps/tools-api/src/routes/sse-keepalive-contract.test.ts:180-234` | ✅ PASS — killed by Mutation 6 |
| AC-03.3 sensor proved RED before trusted | restoring `15_000` fails the test, recorded here | See Discrimination Sensor Mutation 1 below | ✅ PASS |
| AC-03.4 detection-rule blind spot stated as named limitation, not left implicit | docblock states the `text/event-stream` literal-match limitation | `apps/tools-api/src/routes/sse-keepalive-contract.test.ts:32-42` (module docblock, "AC-03.4 — detection-rule blind spot...") | ✅ PASS (docblock, per dispatch instructions this AC is satisfied by a docblock not a test) |
| AC-04.1 enqueue throw closes the stream (not just `closed=true`) | subsequent `reader.read()` resolves `done: true` | `apps/tools-api/src/routes/logs.test.ts:734-765` (data-path), `:769-800` (heartbeat-path); `apps/tools-api/src/routes/events.test.ts:123-155` (data-path), `:160-190`ish (heartbeat-path) | ✅ PASS |
| AC-04.2 teardown releases the source subscription | subscriber/listener count returns to pre-open baseline | `apps/tools-api/src/routes/logs.test.ts:752-753` (`liveSubscriberCount` back to `before`); `apps/tools-api/src/routes/events.test.ts:126, 146` (`totalListeners()` back to `before`) | ✅ PASS — killed by Mutation 4 |
| AC-05.1 `SSE_MAX_DURATION_MS` semantics unchanged, T47/T49 reconnect still fires | existing max-duration cases stay green, byte-equivalent constant | `apps/tools-api/src/routes/logs.test.ts:695-712` (heartbeat + auto-close via env override); `apps/tools-api/src/routes/events.test.ts:58` (auto-closes after max duration); full-file re-run 51/0 and 8/0 (below) | ✅ PASS |
| AC-06.1 thrown non-abort, non-non-200 error is retryable | reconnects under existing bounds, no immediate `logsLive=false` | `apps/web-ui/src/__tests__/admin-handlers.test.ts:2241-2269` | ✅ PASS — killed by Mutation 5 |
| AC-06.2 non-200 stays terminal, never retried | exactly 1 fetch call, `logsLive=false`, banner names the status | `apps/web-ui/src/__tests__/admin-handlers.test.ts:2354-2375` | ✅ PASS — killed by Mutation 5 |
| AC-06.3 our own abort stays silent | no banner rendered | `apps/web-ui/src/__tests__/admin-handlers.test.ts:2277-2305` | ✅ PASS |
| AC-06.4 reconnect bound exhausted still turns Live off + banners | give-up banner, `logsLive=false` | `apps/web-ui/src/__tests__/admin-handlers.test.ts:2254-2261` (retryable-exhaustion) and `:2341-2346` (clean-exhaustion) | ✅ PASS |
| AC-07.1 native `Bun.Server` exposed through one named accessor in `index.ts` | `setSseRequestTimeoutSource` called once from the listen callback | `apps/tools-api/src/index.ts:196-205` (code inspection) | ⚠️ Covered by code inspection only — no automated sensor exercises the real `index.ts` listen-callback wiring (see Gaps) |
| AC-07.2 every SSE route calls `server.timeout(request, N)` at stream start from the shared constant | `applySseRequestTimeout(request)` called in both routes | `apps/tools-api/src/routes/logs.ts:534`, `apps/tools-api/src/routes/events.ts:51`; behaviorally proven by Mutation 2 (removing the logs.ts call drops the apply count to 0) | ✅ PASS |
| AC-07.3 degrades silently when handle/`timeout` absent — never throws, never 500s | `res.status===200`, `threw===false`, apply count `0` | `apps/tools-api/src/routes/logs.test.ts:1021-1070`; `apps/tools-api/src/routes/events.test.ts:222-253` | ✅ PASS — killed by Mutation 3 |
| AC-07.4 counter proves override actually applied on request path | apply count `0→1`, called with `SSE_REQUEST_TIMEOUT_SECONDS` | `apps/tools-api/src/routes/logs.test.ts:1000-1017`; `apps/tools-api/src/routes/events.test.ts:202-217` | ✅ PASS — killed by Mutation 2 |

**Status**: ⚠️ 21/22 ACs fully covered and matching the spec-defined outcome; 1 (AC-07.1) verified only by code inspection, no automated sensor — see Gaps.

---

## Discrimination Sensor

All mutations applied by text edit in place in the worktree (never `git checkout`/`stash`), each followed by `git status --short` confirming a clean tree before moving to the next.

| # | File:line | Description | Test run | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `apps/tools-api/src/routes/sse-keepalive.ts:37` | `SSE_HEARTBEAT_MS_DEFAULT` reverted `5_000 → 15_000` | `sse-keepalive-contract.test.ts` (1 pass/1 fail, names `15000 >= 10000`), `sse-keepalive.test.ts` (13 pass/1 fail) | ✅ Killed |
| 2 | `apps/tools-api/src/routes/logs.ts:534` | `applySseRequestTimeout(request)` call removed from `logs.ts` only | `logs.test.ts` (50 pass/1 fail — AC-07.4's apply-count assertion, expected 1 got 0) | ✅ Killed |
| 3 | `apps/tools-api/src/routes/sse-keepalive.ts:143` | `applySseRequestTimeout` throws instead of no-op when source/`timeout` absent | `logs.test.ts` (40 pass/11 fail, incl. both AC-07.3 tests returning 500), `events.test.ts` (5 pass/3 fail, incl. AC-07.3 heartbeat-content test) | ✅ Killed |
| 4 | `apps/tools-api/src/routes/logs.ts:553` | `unsubscribe?.()` removed from the shared `teardown()` | `logs.test.ts` (49 pass/2 fail — both AC-04.2 subscriber-count assertions, expected 0 got 1) | ✅ Killed |
| 5 | `apps/web-ui/src/static/views/logs.ts:448` | `LogsStreamNonOkError` branch short-circuited (`if (false && ...)`), so a non-200 is no longer terminal | `bun test apps/web-ui` (725 pass/2 fail — AC-06.2's 401 test timed out at 5000ms; a collateral T49 lifetime test also failed) | ✅ Killed |
| 6 | scratch `apps/tools-api/src/routes/scratch-rogue-sse-route.ts` | new file declaring `"text/event-stream"`, importing nothing (created, tested, then deleted — never restored via git) | `sse-keepalive-contract.test.ts` (1 pass/1 fail — AC-03.2, named the scratch file as ungoverned) | ✅ Killed |

**Sensor depth**: P0-full (behavior-level mutations on the feature's own new code, one variable changed per mutation)
**Result**: 6/6 killed — PASS ✅
**Honest denominator note**: all 5 dispatch-suggested mutations plus 1 additional (AC-03.2's enumeration/membership path, distinct from Mutation 1's inequality-only path) were exercised; none were equivalent or unreachable, so none were excluded.
**Post-mutation restoration**: `git status --short` and `git diff --stat` both empty after all 6 mutations were reverted; full re-run of every touched test file confirmed the original green figures below.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ — SSE-04 co-fix is explicitly scoped and isolated per-task, per spec |
| Matches patterns | ✅ — mirrors existing per-call env-read idiom in both routes |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ except AC-07.1 (see Gaps) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | `.specs/features/sse-heartbeat-idle-timeout/{spec,design,tasks}.md`; repo `CLAUDE.md` gate-command and one-file-per-`bun test` rules |

---

## Edge Cases

- [x] Host under heavy load stretches the effective window — sensor pins the ratio (AC-03.1), not an absolute value.
- [x] Operator sets `MASSA_AI_SSE_HEARTBEAT_MS` above the idle window — honored as an explicit override (AC-01.3); documented as a foot-gun in `.env.example:130-132`.
- [x] Reverse proxy with a shorter idle timeout — out of repo control, named in `design.md` Risks; smaller default heartbeat only helps.
- [x] Client disconnects mid-heartbeat — existing `cancel()` teardown unchanged, still exercised by pre-existing tests.
- [x] Two portal tabs open on Logs — unaffected, each holds its own stream/subscription (per-stream unsubscribe confirmed by Mutation 4).

---

## Gate Check

- **Gate commands** (from `tasks.md` § Gate Check Commands, re-derived independently, one tools-api file per invocation per the CRITICAL EXECUTION RULES):
  - `bun run lint` → 0 violations (oxlint, exit 0)
  - `npx turbo run type-check --force` (cache bypassed to avoid a stale-cache false pass) → 6/6 packages successful
  - `cd apps/tools-api && bun test src/routes/logs.test.ts` → 51 pass / 0 fail
  - `cd apps/tools-api && bun test src/routes/events.test.ts` → 8 pass / 0 fail
  - `cd apps/tools-api && bun test src/routes/sse-keepalive.test.ts` → 14 pass / 0 fail
  - `cd apps/tools-api && bun test src/routes/sse-keepalive-contract.test.ts` → 2 pass / 0 fail
  - `cd apps/tools-api && bun test src/routes/sse-idle-survival.test.ts` → 2 pass / 0 fail (65.18s wall — two real 30s idle HTTP holds, consistent with the pre-derived ~65s figure)
  - `bun test apps/web-ui` → 727 pass / 0 fail (1750 expect() calls, 15 files)
- **Result**: 810 tests passed (51+8+14+2+2+727 = 804 tools-api/web-ui + 6 type-check packages counted separately), 0 failed, 0 skipped, across the feature's gate surface
- **Test count before feature** (at `89909051`): not independently re-baselined against `main` (out of scope for a read-only verifier without a second checkout); the tasks.md-recorded deltas (5 new test files, +190/+174 lines in `logs.test.ts`/`events.test.ts`, +86 in `admin-handlers.test.ts`) are consistent with the diff `git diff --stat` shown in the parent context
- **Delta**: new test files `sse-keepalive.test.ts` (14), `sse-keepalive-contract.test.ts` (2), `sse-idle-survival.test.ts` (2); substantial additions inside `logs.test.ts`, `events.test.ts`, `admin-handlers.test.ts`
- **Skipped tests**: none observed
- **Failures**: none, in the real (non-mutated) tree
- **Known pre-existing, unrelated failure mode** (per `tasks.md`/`CLAUDE.md`): `bun test src/routes/logs.test.ts src/routes/events.test.ts` together report 49/1 due to `events.test.ts`'s `eventBus` publish polluting `logs.test.ts`'s `logBuffer` assertion — reproduces on clean `main`, not this feature's regression, and specifically why every tools-api file above was run in its own invocation.

---

## Fix Plans

None required for the discrimination sensor (6/6 killed) or 21 of 22 ACs. One gap below is a coverage recommendation, not a correctness defect — the shipped behavior is correct by code inspection; only its automated-sensor coverage is thin.

### Gap 1: AC-07.1 has no automated sensor for the real `index.ts` wiring

- **Root cause**: `setSseRequestTimeoutSource(bunServer)` is called exactly once, inside `app.listen()`'s callback in `apps/tools-api/src/index.ts:189-206`. Every existing test (including `sse-idle-survival.test.ts`, which does bind a real listening server) constructs its own `Elysia({adapter: node()})` app directly and never imports/exercises `index.ts` itself, so no test asserts that the *production* listen callback performs this capture, or that it is not re-derived ad hoc elsewhere. `AC-07.4`'s counter test proves the *consumption* path (`applySseRequestTimeout`) works once a source is set via the test-only seam, but nothing proves `index.ts` is the one caller who sets it in production.
- **Fix task** (optional, low priority): add a focused test that imports `apps/tools-api/src/index.ts`'s listen path (or extracts the `handle.bun?.server` → `setSseRequestTimeoutSource` wiring into a small testable helper) and asserts it is invoked with the listen callback's `server` argument. Given `index.ts` starts a real port and drives the whole app's lifecycle, this may be better served by a narrow unit test around a small extracted function than a full e2e boot.
- **Priority**: Minor — the property is structural (one accessor, not ad hoc reads) and is easy to verify by code review; it is not a runtime-behavior risk today since the sole call site is unambiguous and code-reviewed at commit `d17cd5cc`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| SSE-01 | Implementing | ✅ Verified |
| SSE-02 | Implementing | ✅ Verified |
| SSE-03 | Implementing | ✅ Verified |
| SSE-04 | Implementing | ✅ Verified |
| SSE-05 | Implementing | ✅ Verified |
| SSE-06 | Implementing | ✅ Verified |
| SSE-07 | Implementing | ⚠️ Verified with one coverage gap (AC-07.1, non-blocking) |

(`.specs/project/FEATURES.json` has no existing entry for this slug to update — that registration is part of T8's own write set, outside this verifier's scope.)

---

## Summary

**Overall**: ✅ Ready
**Result**: PASS

**Spec-anchored check**: 21/22 ACs matched the spec-defined outcome with a `file:line` sensor; 1 AC (AC-07.1) verified by code inspection only, no dedicated automated sensor — flagged as a non-blocking coverage gap, not a correctness defect.
**Sensor**: 6/6 mutations killed (5 dispatch-suggested + 1 added for AC-03.2's distinct enumeration path), honest denominator 6, none equivalent/unreachable/excluded.
**Gate**: lint 0 violations; type-check 6/6 (forced, non-cached); tools-api 51+8+14+2+2 = 77 pass/0 fail across 5 files run individually; web-ui 727 pass/0 fail. All figures independently re-derived and matched the pre-supplied figures exactly.

**What works**: The heartbeat-vs-idle-window inequality is fixed and pinned by a self-proving regression sensor; both SSE endpoints survive real 30s idle HTTP holds; the enqueue-throw leak is closed on both routes with subscription release and stream close verified independently; the web-ui live tail correctly distinguishes retryable/terminal/aborted/clean exits; the per-request transport-window override is applied, counted, and degrades silently and safely when the native handle is absent.

**Issues found**: Gap 1 (AC-07.1, code-inspection-only coverage of the `index.ts` listen-callback wiring) — recommend an optional focused unit test in a future task; does not block this feature.

**Next steps**: Proceed to T8 close-out (STATE.md, HANDOFF.md, FEATURES.json updates and the close-out commit), citing this report and its PASS verdict. Optionally open a follow-up minor task for Gap 1's AC-07.1 sensor.


---

## Author addendum — Gap 1 closed (2026-08-13)

Written by the feature author, not the verifier, and marked as such. The
verifier's PASS verdict above stands unchanged; this records what happened to
the one gap it ranked.

**Gap 1 (AC-07.1) is closed, and it was not theoretical.** Before writing a
sensor, the gap was reproduced as a mutation: deleting
`setSseRequestTimeoutSource(bunServer)` from `apps/tools-api/src/index.ts` left
every suite green — `logs` 51/0, `events` 8/0, `sse-keepalive` 14/0,
`sse-keepalive-contract` 2/0. A surviving mutant, not a documentation nit:
production would have fallen back to Bun's 10 s default window on every SSE
request while the whole suite reported success.

Closed by `8acd988f`, a source-level wiring sensor appended to
`sse-keepalive-contract.test.ts`. Two independent claims, each mutation-proved:

| Mutation to `index.ts` | Contract suite |
| --- | --- |
| call site deleted | 2 pass / **1 fail** |
| argument replaced with hardcoded `undefined` | 2 pass / **1 fail** |
| unmutated | 3 pass / 0 fail |

`index.ts` restored by text edit after each and confirmed byte-identical to
`HEAD` — never `git checkout`.

**What this sensor does not prove**, stated in its own docblock rather than
left for a reader to discover: it proves the call site exists, sits inside the
`app.listen` callback, and is fed from the handle traversal rather than a
literal. It does not prove the traversal still finds a real server on a future
Bun or adapter version. `sse-idle-survival.test.ts`'s real-HTTP hold is what
would catch that.

**One finding from building it, worth carrying forward.** The sensor's first
draft failed against *correct* code: `index.ts`'s own docblock explains the
degrading case using the literal text `setSseRequestTimeoutSource(undefined)`,
and the scanner captured `undefined` from that comment as the argument name.
Comments are source to a text scanner. The sensor now strips whole-line
comments before matching — and only whole-line ones, so a `//` inside a URL or
string literal cannot silently truncate real code.

Revised coverage: **22/22 ACs** carry an automated sensor. Mutation total for
the feature: **8/8 killed** (the verifier's 6, plus these 2), honest
denominator 8, none equivalent or excluded.
