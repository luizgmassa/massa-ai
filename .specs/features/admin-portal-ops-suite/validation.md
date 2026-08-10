# Admin Portal Operations Suite — Validation

**Feature**: admin-portal-ops-suite
**Branch**: spec/admin-portal-ops-suite
**Base**: cd4c4e9c (origin/main @ c82d8f92, v1.46.0)
**Verified**: 2026-08-10
**Verifier**: massa-ai-verification-agent (independent — did not author any implementation commit)

> **Reading order.** Everything down to and including "Acceptance Steps Not
> Verifiable From This Repository" is the independent verifier's report,
> recorded verbatim against commits `99437c8a..5e222a53` (T1–T20). The
> **Post-Verification Repairs** section at the end is the main agent's record of
> what changed *after* that report, and is the only part the verifier did not
> write. The verifier's findings are not edited in place — a finding that was
> subsequently closed is marked as closed in the addendum, not rewritten above.

## Verdict

**PASS WITH FINDINGS.** All four vertical slices (MBD, SCH, LOG, CPP) are implemented to a high standard — the code correctly matches the design's precedence chains, teardown disciplines, and disclosure requirements, and five independent source mutations covering distinct failure classes (guard logic, wire-protocol content-type, async-stream teardown, caching-contract, precedence-ordering) all produced the expected RED, then were cleanly restored (`git status --porcelain` empty, confirmed below) — real evidence the named tests sense the behavior rather than passing vacuously. However, **Phase 8 (T21, close-out) was never executed**: `.specs/project/STATE.md` carries no AD-020 entry, `.specs/project/FEATURES.json` and `.specs/HANDOFF.md` have zero references to this feature, `CHANGELOG.md`'s `[Unreleased]` section is empty, and `validation.md` did not exist before this dispatch — all four contradict tasks.md's explicit T21 requirements and design.md's "Appended... as AD-020 at close-out" commitment. This is a real gap in a documentation-only gate (`check_specs_delivered.ts`) that structurally cannot detect it, since it only checks presence/tracked-status of files that already existed pre-feature, not their content. There are also two smaller, previously-unreported findings: MBD-07's audit-row assertion for the exact memories-only scope combination was never added despite tasks.md/design.md explicitly promising it, and the pre-mortem #6 UI disclosure ("already-tombstoned rows are included") was never added to the bulk-delete confirmation copy despite design.md recording it as an applied revision.

## Gate Results

| Gate | Command | Exit | Result | Source |
| --- | --- | --- | --- | --- |
| Lint | `bun run lint` | 0 | clean | Re-ran |
| Type-check | `bun run type-check` | 0 | 6/6 tasks (turbo cache hit — content-hash-valid, tree unmodified since main agent's run) | Re-ran |
| Core layering | `bun scripts/check-core-layering.ts` | 0 | 0 violations / 994 edges / 1037 files | Re-ran |
| Turbo passthrough env | `bun test scripts/__tests__/turbo-passthrough-env.test.ts` | 0 | 3 pass — all 5 new `MASSA_AI_*` vars present in `turbo.json` | Re-ran |
| MCP stdout clean | `bun test apps/mcp-client/src/__tests__/mcp-stdout-clean.test.ts` | 0 | 3 pass | Re-ran |
| `packages/shared` full suite | `bun test` | 0 | 458 pass / 0 fail / 27 files | Re-ran |
| `apps/tools-api` logs route suite | `bun test apps/tools-api/src/routes/logs.test.ts` | 0 | full suite green pre/post each mutation restore | Re-ran (partial, targeted) |
| `apps/web-ui` admin-handlers/app-renderers | `bun test` (targeted) | 0 | targeted subsets green pre/post each mutation restore | Re-ran (partial, targeted) |
| Specs-delivered gate | `bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-ops-suite --root .` | 0 | 0 errors — **but this gate only checks file presence/tracked-status, not content; see Findings #1** | Re-ran |
| `bun run test`, `bun run test:scripts`, `bun run test:plugins`, `cd apps/web-ui && bun test` (full) | — | 0 (all) | 11/11, 1739/0/79, 135/0/8, 520/0 | Inherited from main agent, not re-run in full (spot-checked subsets above) |

## Requirement Coverage

| ID | Status | Implementing code | Discriminating test + assertion | Notes |
| --- | --- | --- | --- | --- |
| MBD-01 | SATISFIED | `apps/web-ui/src/static/app.js:333-360` `renderMemoryBulkDelete` | `app-renderers.test.ts` "renders the bulk-delete control when write mode on and a project is selected" / "hides... when write mode off" (4-way matrix) | — |
| MBD-02 | SATISFIED | same fn, `formState` branch | `app-renderers.test.ts` "renders the inline confirmation form when memoryBulkForm is open" | — |
| MBD-03 | SATISFIED | `app.js:2068` `if (typed !== project)` in `handleMemoryDeleteProject` | `admin-handlers.test.ts` "a mismatched typed value renders the exact error and issues ZERO api.request calls" | **Mutation-verified** (see Discrimination Sensor #1) |
| MBD-04 | SATISFIED | `app.js:2054-2062` reads `[data-bulk="confirm-id"]` via DOM lookup, never `btn.dataset` | `admin-handlers.test.ts` "POSTs the exact request body on an exact typed match" asserts exact `{projectId, clearVectors:false, clearSymbols:false, clearMemories:true}` | — |
| MBD-05 | SATISFIED | `app.js:2088-2096` success/failure branches | "displays memoriesDeleted and re-renders on success"; "success:false renders the returned errors and claims no deletion" | — |
| MBD-06 | PARTIAL | route pre-existing, generic `data.memoriesDeleted != null ? ... : 0` display logic (`app.js:2098`) | No test drives the literal `memoriesDeleted: 0` case at either layer | Code inspection shows `!= null` (not `\|\|`) correctly keeps 0 truthy-safe, but this specific idempotent-redelete value is never exercised by a test — an untested but plausibly-correct path |
| MBD-07 | **PARTIAL** | `apps/tools-api/src/routes/project.ts:277-293` (pre-existing, unmodified — `requestedScopes: {vectors, symbols, memories}` in `recordOperation`) | **No test added.** `apps/tools-api/src/routes/project.test.ts` has zero diff in this feature; existing cases only exercise individual-scope-failure branches (`{projectId}` full-scope calls), never the exact `{clearVectors:false, clearSymbols:false, clearMemories:true}` combination tasks.md/design.md's Verification Design table explicitly promised ("`project.test.ts` extension... `operation_log` row records `requestedScopes.memories:true, vectors:false, symbols:false`") | See Findings #2 — the route logic is correct by inspection (skipped `if` branches leave `result.vectorsDeleted`/`symbolsCleared` absent), but the promised discriminating test does not exist |
| SCH-01 | SATISFIED | `packages/shared/src/config/massa-ai-config.ts:1-24` `SchedulerConfig`/`SCHEDULER_JOB_KINDS` | `scheduler-config.test.ts` resolution matrix | — |
| SCH-02 | SATISFIED | `config/index.ts:963-1010` resolver; `core/.../scheduler.ts:133-147`; `scheduler-defaults.ts:109-166` | `scheduler-config.test.ts`, `scheduler.test.ts` "SCH-02 ctor resolution chain", `scheduler-safe-defaults.test.ts` per-kind matrix | **Mutation-verified** (see Discrimination Sensor #5) |
| SCH-03 | SATISFIED | `config/index.ts:1010` — absent key → `fileScheduler = {}` | `scheduler-config.test.ts` "no scheduler key at all resolves to the literal defaults (absent-key parity)" | — |
| SCH-04 | SATISFIED | `config-writer.ts:335-357` `validatePartial` scheduler block | `config-writer.test.ts` bound-rejection + byte-unchanged-file tests | — |
| SCH-05 | SATISFIED | `config-writer.ts:344-351` unknown-key check | `config-writer.test.ts` "rejects an unknown scheduler.jobs key, naming that key" | — |
| SCH-06 | SATISFIED | `config/index.ts` `readSchedulerConfig` try/catch → `{}` | `scheduler-config.test.ts` "an unreadable (corrupt) config.json falls back to the literal defaults without throwing" | — |
| SCH-07 | SATISFIED | `config-writer.ts:9` `RESTART_SECTIONS` + `restartNeededSections`/`changedRestartSections` | `config-writer.test.ts` "restartNeededSections includes scheduler whenever the key is present"; "changedRestartSections includes scheduler on a real change and excludes it on an unchanged re-save" | — |
| SCH-08 (design/tasks-only ID, folds under the P1-Scheduler story's AC8; absent from spec.md's own 33-row traceability table) | SATISFIED | `app.js` `CONFIG_SECTIONS` scheduler entry | `config-forms.test.ts` "round-trips render → collectConfigSectionFields → buildConfigSectionBody for the nested jobs.\<kind\>.\<field\> tree" | Supplementary row per task brief; not counted in the 33 |
| LOG-01 | SATISFIED | `packages/shared/src/utils/log-buffer.ts` | `log-buffer.test.ts` eviction, monotonic seq, re-entrant-subscriber-terminates | — |
| LOG-02 | SATISFIED | `config/index.ts:963-1010` `file`/`enableFileSink` resolution | `logging-config.test.ts` | Also see Pre-Mortem #1 below |
| LOG-03 | SATISFIED | `logs.ts:253-317` `scanEntries`/`filteredEntries` | `logs.test.ts` "returns entries within [from,to]... newest first, with total + source" (+ level/substring/rotation-boundary cases). LOG-13 (UI side) folds in via `renderLogs`'s filter bar | — |
| LOG-04 | SATISFIED | `logs.ts:64-102` `parseRangeQuery`, called before any I/O | `logs.test.ts` "validation before any read (LOG-04)" — 5 cases with an injected `listFilesCalls()`/`readTailCalls()` spy asserting **zero** calls | — |
| LOG-05 | SATISFIED | `logs.ts:407-482` `/stream` route, `cancel()` teardown | `logs.test.ts` "cancel() unsubscribes — asserted by the buffer's live subscriber count" | **Mutation-verified** (see Discrimination Sensor #3). LOG-13 (UI) folds in via `runLogsLiveStream` |
| LOG-06 | SATISFIED | `logs.ts:370-406` `/export`, explicit `Response` object | `logs.test.ts` real-socket suite "format=jsonl... application/x-ndjson + attachment filename"; "format=txt" | **Mutation-verified** (see Discrimination Sensor #2). LOG-13 (UI) folds in via `handleLogsExport` |
| LOG-07 | SATISFIED | `log-sink.ts:87-141` `rotate`/`appendLine` | `log-sink.test.ts` "rotation at the cap"; "maxFiles is never exceeded"; "rotation shifts files newest-last" | — |
| LOG-08 | SATISFIED | `log-sink.ts:134` `fs.appendFileSync` (O_APPEND) | `log-sink.test.ts` "uses O_APPEND semantics: multiple writes append rather than overwrite" | — |
| LOG-09 | SATISFIED | `logs.ts:258-260` `files.length === 0` → buffer fallback | `logs.test.ts` "source:\"buffer\" when no sink file exists"; "an unreadable (permission-denied) sink file also falls back to the buffer" | — |
| LOG-10 | SATISFIED | `logs.ts` pure scan/filter, no mutation | `logs.test.ts` "two consecutive identical queries return the same entries in the same order" | — |
| LOG-11 | SATISFIED | `apps/tools-api/src/index.ts:132-156` — `authMiddleware` registered before `logsRoutes`; `PUBLIC_PATHS` unchanged | `logs.test.ts` real-socket suite: `GET /api/v1/logs` (+`/stream`, +`/export`) without a key → **401**, confirmed via a genuinely registered route (not the Elysia route-matched-before-`onBeforeHandle` 404 trap) | Independently confirmed by reading `index.ts`'s registration order — the route is real, and the assertion is 401 |
| LOG-12 | SATISFIED | `logs.ts` — no `logger` import (enforced structurally) | `logs.test.ts` "the source file's import statements never bind a `logger` identifier" (both `/` and `/stream` describe blocks) + "logBuffer.size() is unchanged after a range query and an export" | — |
| LOG-13 (UI side; folds into LOG-03/05/06 per spec's own mapping) | SATISFIED | `app.js` `renderLogs`, `index.html` nav | `app-renderers.test.ts` full `renderLogs` describe block + nav/`viewFromHash` agreement test | — |
| LOG-14 (folds into LOG-03) | SATISFIED, with a caveat | `app.js` `runLogsLiveStream`/`appendLogsLiveEntry` | `admin-handlers.test.ts` "appends streamed entries to state.logsEntries without re-issuing the range query" | **Self-reported gap confirmed**: the DOM `tbody` patch path (`app.js:355-357`) is never asserted at the DOM level — no test seeds a `table.logs-table` and checks `tbody.innerHTML` grew. Only the `state.logsEntries` accumulator is asserted |
| LOG-15 (folds into LOG-05) | SATISFIED, with a caveat | `app.js` `runLogsLiveStream` catch block | `admin-handlers.test.ts` "a stream failure turns Live off, banners the error, and keeps already-rendered rows intact" | **Self-reported gap confirmed**: the abort-vs-genuine-failure discrimination is proven only via a hand-rolled `FakeAbortController` class, not the real global |
| CPP-01 | SATISFIED | `claude-marketplace.ts:76-107`; `hosts.ts:92-101` | `claude-marketplace.test.ts`; `engine.test.ts` "(CPP-03) listProfiles reports installed:true + variants from the resolved marketplace root" | — |
| CPP-02 | SATISFIED | `claude-marketplace.ts` — no module-level cache, re-reads registry every call | `claude-marketplace.test.ts` "two calls across a moved installPath return two different roots" | **Mutation-verified** (see Discrimination Sensor #4) |
| CPP-03 | SATISFIED | `engine.ts:120-146` `listProfiles` marketplace branch | `engine.test.ts` "(CPP-03) listProfiles reports installed:true..." | — |
| CPP-04 | SATISFIED | `engine.ts:280-360` `switchProfile` copy-then-record ordering | `engine.test.ts` "(CPP-04) switchProfile... copies... and records modelProfile only after the copy" | — |
| CPP-05 | SATISFIED | same `switchProfile` path, idempotent re-switch | `engine.test.ts` "(CPP-05) re-switching to the already-active marketplace profile still reports switched" | — |
| CPP-06 | SATISFIED | `engine.ts:296-310` (`listProfiles`) and `:325-343` (`switchProfile`) unresolved-root special-casing | `engine.test.ts` "(CPP-06) listProfiles reports installed:false..."; "installRoute marketplace with no resolvable install root fails, naming the unresolved registry path" — file-route fallback explicitly asserted absent (`agents` dir not written / not created). CPP-08 (codex-still-refuses) folds in here: `engine.test.ts` "codex marketplace-route switch still refuses... reason names codex only" + `hosts.test.ts` "codex + host:\"codex\" refuses with a reason naming codex only" | — |
| CPP-07 | SATISFIED | `apps/claude-plugin/install.sh:528-611` `apply_recorded_profile_after_update` | `test-plugin-marketplace-cache-refresh.sh` Scenario 6 (re-apply copies the recorded variant, content-diff proven) + Scenario 7 (no recorded profile → no-op, `modelProfile` never invented) | AD-015 read-only conformance directly asserted in Scenario 7 |
| CPP-09 (design/tasks-only ID for T20; spec.md's own text says AC9 "folds into CPP-01") | SATISFIED | `app.js:1252` `renderProfiles` no-variants copy correction | `app-renderers.test.ts` "renderProfiles shows... a no-variants message... that does NOT assert a marketplace install can't switch (CPP-09, T20)" — explicit `not.toContain("marketplace")` | Verified NOT a weakened assertion — see Known Gaps #6 below |

**Coverage summary**: 31 of 33 canonical IDs SATISFIED; 2 PARTIAL (MBD-06, MBD-07), both in the memory-bulk-delete slice, both because a promised discriminating test was never written (implementation itself appears correct by code inspection in both cases).

## Discrimination Sensor

| Requirement | Mutation applied (exact) | Test re-run | Observed verdict | Population | Class |
| --- | --- | --- | --- | --- | --- |
| MBD-03 | `app.js:2068` `if (typed !== project)` → `if (false)` | `admin-handlers.test.ts -t "MBD-05 discriminating case"` | **RED** — `expect(request).not.toHaveBeenCalled()` got 1 call instead of 0 | 1 test, live logic branch | Guard-logic bypass |
| LOG-06 | `logs.ts` `/export` handler: replaced `return new Response(body, {status:200, headers:{Content-Type, Content-Disposition}})` with `return body;` (bare string) | `logs.test.ts` real-socket "format=jsonl"/"format=txt" | **RED** — `content-type` observed `text/plain` (expected `application/x-ndjson`); `content-disposition` observed `""` (expected to contain `.txt`) | 2 tests | Wire-protocol / bare-return content-type trap |
| LOG-05 | `logs.ts` SSE `cancel()` body emptied to `cancel() {}` (teardown removed) | `logs.test.ts -t "cancel"` | **RED** — `liveSubscriberCount` stayed at `before + 1` instead of returning to `before` | 1 test | Async-stream teardown / resource leak |
| CPP-02 | `claude-marketplace.ts`: added `let __memoCache; if (__memoCache !== undefined) return __memoCache;` + `__memoCache = installPath` before the final return | `claude-marketplace.test.ts -t "moved installPath"` | **RED** — second call returned the first call's stale path instead of the moved one | 1 test | Caching-contract violation |
| SCH-02 | `scheduler.ts` ctor: swapped `opts ?? env ?? config ?? literal` to `opts ?? config ?? env ?? literal` for `tickIntervalMs`/`maxConcurrent` | `scheduler.test.ts -t "env beats config and literal when opts are absent"` | **RED** — `tickIntervalMs` observed `1111` (config value) instead of `4242` (env value) | 1 test | Precedence-ordering |

All 5 mutations targeted a genuinely live code path (none resolved to dead/unreachable code — every mutation changed the value returned by a call the test directly observes), covering 5 distinct failure classes: guard-logic bypass, wire-protocol/content-type, async-teardown/resource-leak, caching-contract, and precedence-ordering.

**Restoration discipline**: every mutation was applied to a file first copied to `/tmp/verify-backups/<name>.orig`, and restored via `cp /tmp/verify-backups/<name>.orig <path>` (never `git checkout`/`git restore`). After each restore, and again at the end of the full session, `git status --porcelain` was run and returned **empty** — confirmed clean. Final confirmation: `git status --porcelain` at the end of this dispatch is empty and `git diff --stat cd4c4e9c..HEAD` still reports the original `36 files changed, 5282 insertions(+), 82 deletions(-)`, unchanged from the pre-verification baseline.

## Pre-Mortem Conformance

| Finding | Conformed? | Evidence |
| --- | --- | --- |
| #1 (empty `logging.file` must mean default, not disabled) | **YES** | `config/index.ts`: `file: process.env.MASSA_AI_LOG_FILE \|\| fileConfig.logging?.file \|\| path.join(resolvedDataDir, "logs", "massa-ai.log")` — `\|\|` treats `""` as falsy; `enableFileSink` is the sole disable. `logger.test.ts` "sink off (enableFileSink:false): file untouched even though a path is configured" proves the boolean is the only disable path |
| #2 (sink must create its directory; failure reportable, not presented as empty history) | **YES**, mostly | `log-sink.ts:55-60` `ensureDir` (`mkdirSync(dir, {recursive:true})`), proven by `log-sink.test.ts` "an absent parent directory is created and the line lands" and `logger.test.ts` "sink on, absent parent directory: directory is created and the line lands". `getLastError()` is exposed and asserted (`log-sink.test.ts` "never throws... and sets lastError"). The route's `source:"buffer"` fallback on a directory-creation failure is **structurally correct but not directly integration-tested** — it works because a failed `mkdirSync` means the file never exists, so `logs.ts`'s `files.length === 0` check naturally falls through to the buffer; there is no dedicated end-to-end test exercising "directory creation fails → route answers source:buffer" |
| #3 (`detectRoute`'s `host` param optional/trailing; existing calls unchanged) | **YES** | `hosts.ts:149` `detectRoute(platform, host?)`. `hosts.test.ts` "the four existing single-argument detectRoute calls keep their current verdicts" explicitly re-runs the four pre-feature call shapes. `packages/shared/src/index.ts`'s re-export was not touched (no diff), so the exported symbol continues to type-check for every existing caller |
| #4 (CPP-07 installer re-apply, read-only w.r.t. modelProfile — AD-015) | **YES** | `install.sh` `apply_recorded_profile_after_update` only reads via `recorded_profile()`; shell test Scenario 7 explicitly asserts `"the installer never wrote a modelProfile of its own"` |
| #5 (Logs tab discloses live-tail is this-process-only vs. shared history) | **YES** | `app.js` `renderLogs`'s `liveScopeDisclosure` block, always rendered (not conditional on Live); `app-renderers.test.ts` "discloses the live/history process-scope mismatch (pre-mortem #5)" asserts `"this server process"` and `"stdio MCP server"` both present |
| #6 (bulk-delete confirmation copy discloses already-tombstoned rows are included) | **NO** | **Not implemented.** `renderMemoryBulkDelete` (`app.js:333-360`) — the trigger button reads only `"Delete all memories for {project}"`, and the confirmation form has no tombstone-inclusion disclosure text anywhere. Design.md explicitly records "Revision applied: disclosure. The confirmation copy states the action removes every memory for the project including already-tombstoned rows" as an applied mitigation — it was never coded. See Findings #3 |
| #7 (T5/T6 scheduler suites isolate from the real config) | **YES** | `scheduler.test.ts`'s "SCH-02 ctor resolution chain (T6)" block uses `mock.module("@massa-ai/shared", ...)` (the design's stated alternative to a scratch `XDG_CONFIG_HOME`) plus `resetScheduler()` in both `beforeEach`/`afterEach`; `scheduler-safe-defaults.test.ts` mocks `@massa-ai/shared`'s `loadConfigSafe` similarly. Neither can reach `~/.config/massa-ai/config.json` |

## Findings

1. **[CRITICAL, blocks the PR] Phase 8 close-out (T21) was never executed.** `git log --oneline cd4c4e9c..HEAD` lists exactly 20 commits (T1–T20); no commit updates `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, `.specs/HANDOFF.md`, or `CHANGELOG.md` (`git diff --stat cd4c4e9c..HEAD -- .specs/ CHANGELOG.md` is empty). Specifically:
   - No AD-020 entry anywhere in `STATE.md` (`grep -in "AD-020"` returns nothing), contradicting design.md's explicit "Appended to `.specs/project/STATE.md` `## Decisions` as **AD-020** at close-out" and tasks.md's T21 spec.
   - `FEATURES.json` and `HANDOFF.md` have zero references to `admin-portal-ops-suite`.
   - `CHANGELOG.md`'s `[Unreleased]` section is empty — per this repo's own CI contract (`CLAUDE.md` § CI gates), a PR that does not modify `CHANGELOG.md` fails the merge gate unless it carries the `no-changelog` label, which does not apply here (this is a real, substantial feature).
   - `validation.md` did not exist prior to this dispatch (consistent with T21 never running — this document is that missing deliverable).
   - The `check_specs_delivered.ts` gate the main agent ran and reported "0 errors" **cannot catch any of this**: it only checks that a fixed list of files exist and are `git`-tracked on HEAD, never their content, and `validation.md` is in its "required only if present" optional set — so its absence is silently non-fatal to that specific gate. This is a gate-vs-actual-requirement gap the team should be aware of, not just a defect in this feature.
   - Recommendation: run T21 before opening the PR — update STATE.md (AD-020), FEATURES.json, HANDOFF.md, and CHANGELOG.md `[Unreleased]`, and commit this `validation.md`.

2. **[Medium] MBD-07's promised discriminating test does not exist.** `apps/tools-api/src/routes/project.test.ts` has zero diff across all 20 commits. Design.md's Verification Design table and tasks.md's Test Coverage Matrix both explicitly promise a `project.test.ts` extension asserting the memories-only-scope `operation_log` row (`requestedScopes.memories:true, vectors:false, symbols:false`) and the absence of `vectorsDeleted`/`symbolsCleared` from the result — none of that was added. By code inspection (`project.ts:228-266`, unmodified pre-existing logic) the route already behaves correctly for this combination (the `if (clearVectors)`/`if (clearSymbols)` blocks are skipped entirely, so those result keys are genuinely absent, and `requestedScopes` is built directly from the request flags), but this is inference from reading code, not verified by a running assertion. Does not block the PR (behavior is almost certainly correct), but the coverage gap should be closed — it is a one-test addition.

3. **[Low] Pre-mortem finding #6's UI disclosure was never implemented.** Design.md records this as an *applied* revision ("The confirmation copy states the action removes every memory for the project including already-tombstoned rows") but `renderMemoryBulkDelete`'s trigger and confirmation form carry no such text (verified by reading the full function body and grepping the diff and tests for "tombstone"/synonyms — zero matches). The spec.md edge case that motivated this is still correctly documented at the spec level, and the underlying behavior (deleting tombstoned rows) is unchanged/correct — this is purely a missing UI string. Low severity since it does not affect correctness, only operator expectation-setting; recommend a one-line addition before merge, or an explicit spec amendment if the team decides the disclosure isn't needed.

4. **[Low] Unresolved doc drift, pre-existing, surfaced during this review.** `apps/tools-api/src/routes/project.test.ts`'s header comment references `project-reset.test.ts` and `project-identity.test.ts` as sibling files — neither exists anywhere in the repo. This predates this feature (the file has zero diff in this branch) and is out of scope to fix here, but worth a follow-up ticket since it makes MBD-07's actual test surface harder to locate.

5. **[Informational] LOG-14/15's two self-reported gaps are confirmed accurate and are of genuinely low real-world risk.** The DOM `tbody`-append path is exercised only through the `state.logsEntries` accumulator, not a seeded-DOM assertion; and the abort-vs-genuine-failure branch is proven with a hand-rolled `FakeAbortController`, not the platform global. Both are honestly disclosed by the implementing task rather than hidden, and neither affects the production code path (which is straightforward and low-risk by inspection).

## Known Gaps Carried Forward

1. **Phase 3 edge case (project-select-closes-open-form) has no dedicated test.** CONFIRMED — `grep` across `apps/web-ui/src/__tests__/*.test.ts` for `projectSelect` change-listener coverage finds nothing beyond the render-state assertions already covered by the bulk-delete describe block. The behavior lives inline in `startApp()`'s `projectSelect.addEventListener("change", ...)` closure (`app.js`, not exported as a standalone handler), so testing it directly would require a DOM-level `startApp()` integration test that doesn't currently exist for this interaction. Recommendation: low priority — add a `startApp`-level integration test, or extract the close-logic into an exported handler the way `handleMemoryDeleteProjectCancel` already is, so it becomes unit-testable.

2. **Phase 7/T15 (a) empty-state → first-live-entry DOM patch is unasserted.** CONFIRMED — `appendLogsLiveEntry` records into `state.logsEntries` unconditionally but only patches `tbody.innerHTML` when a `table.logs-table` element is already present; no test seeds the empty-state DOM and checks this specific transition. Recommendation: low priority, add one test.

3. **Phase 7/T15 (b) abort-discrimination proven only via `FakeAbortController`.** CONFIRMED — see Findings #5. Low priority; would need a real environment or a more faithful stub to close.

4. **Phase 7/T15 (c) live DOM table-append path unasserted at the DOM level.** CONFIRMED — same root cause as #2 above; no test reads `tbody.innerHTML` after a live push. Low priority.

5. **Phase 6/T14: `index.test.ts` vs. `app-renderers.test.ts`.** CONFIRMED, worker's claim is accurate — `apps/web-ui/src/__tests__/index.test.ts` is 8 lines, asserting only `WEB_UI_PACKAGE_MARKER === "@massa-ai/web-ui"`. The real nav/route-agreement test ("index.html has a Logs nav item between Dashboard and Config") lives in `app-renderers.test.ts`, which does provide the coverage tasks.md asked for, just under a different (correctly identified) file. No action needed.

6. **Phase 4/T11: logger test file location + "byte-identical format" claim.** CONFIRMED file-location discrepancy — the extension landed in `packages/shared/src/__tests__/logger.test.ts` (16.7 KB), not `packages/shared/src/utils/__tests__/logger.test.ts` (that directory holds only `log-buffer.test.ts`/`log-sink.test.ts`). The "byte-identical" claim is **substantiated**, not merely restated: `logger.test.ts:142`'s `expect(out).toMatch(/^\[\d{4}-...\] \[INFO\] hello$/)` is a **pre-existing, unmodified** assertion (not touched by this diff) that continues to pass after `write()` was replaced by `emit()` — a real regression check, not a test written to match the new code. No action needed.

7. **Phase 5/T18: `marketplaceRoots` duplicated in `engine.ts` and `variant-sync.ts`.** CONFIRMED duplicated, and CONFIRMED behaviorally identical — both implementations are `state.platforms.claude?.installRoute === "marketplace" ? {claude: resolveClaudeMarketplaceRoot({targetHome}) ?? undefined} : {}`, byte-for-byte the same logic, each with a documented rationale (both private, state loaded independently in each caller) for not sharing an export. No divergence risk to the regenerate-bridge-vs-switch-read concern the audit item raised. No action needed.

8. **Phase 5/T18: the pre-existing "marketplace refuses" test expectation change.** CONFIRMED as an intentional, correct reflection of the spec's behavior change, not a weakened guard — the old test asserted a blanket marketplace refusal; the new version (`engine.test.ts` "installRoute 'marketplace' with no resolvable install root fails, naming the unresolved registry path") narrows the assertion to the CPP-06 unresolved-root failure specifically, and five new dedicated tests were added alongside it covering the proceed path (CPP-03/04/05) and the codex-still-refuses path. No action needed.

9. **Phase 7/T20: the inverted `"marketplace"` assertion.** CONFIRMED as the correct CPP-09 requirement, not a weakened assertion — `app-renderers.test.ts` now asserts `expect(html).not.toContain("marketplace")` specifically because AD-020 makes the old copy's claim false for Claude; the replacement copy and its assertion are internally consistent and match `design.md § 4e`'s prescribed replacement text exactly. No action needed.

## Acceptance Steps Not Verifiable From This Repository

**Mandatory manual UAT (CPP, per spec.md's Success Criteria):** after a Claude profile switch via `POST /api/v1/profiles/switch`, fully restart the Claude Code session and re-read `<installPath>/agents/massa-ai-builder.md`'s model line. Claude's plugin-cache refresh cadence cannot be established from this repository — the only evidence available (`installed_plugins.json`'s `lastUpdated` moving with the installer's `claude plugin update` and not with any of 189 recorded prior startups) is suggestive, not proof. If the file reverts after a restart, the recorded `platforms.claude.modelProfile` remains authoritative and the CPP-07 installer re-apply (verified working via the shell-test scenarios above) is the supported recovery path — report the reversion rather than reporting the switch as effective. This step was out of scope for this dispatch (read-only, no installer runs against the real `~/.claude`) and must be performed by a human against a real Claude Code session before the CPP slice is considered fully validated end-to-end.

---

# Post-Verification Repairs (main agent, 2026-08-10)

Written by the main agent **after** the verifier's dispatch closed. The report
above is left unedited; this section records what changed and re-states the
delivered status of each finding. Both repairs were proven by an observed RED
before being committed — a new sensor is unquotable until it has failed on
purpose.

| Verifier finding | Severity | Status at delivery | Evidence |
| --- | --- | --- | --- |
| #1 — T21 close-out never executed | critical | **CLOSED** | This document, plus AD-020 in `.specs/project/STATE.md`, the `admin-portal-ops-suite` record in `.specs/project/FEATURES.json`, the rewritten `.specs/HANDOFF.md`, and the `[Unreleased]` `### Added` / `### Fixed` block in `CHANGELOG.md` |
| #2 — MBD-07's promised test does not exist | medium | **CLOSED** (`b47b8de4`) | `apps/tools-api/src/routes/project.test.ts` gains a `memories-only scope (MBD-06, MBD-07)` describe with 3 cases |
| #3 — pre-mortem #6 disclosure never coded | low | **CLOSED** (`cfe09133`) | `renderMemoryBulkDelete`'s confirmation form gains the scope note; 2 new cases in `app-renderers.test.ts` |
| #4 — stale sibling-file names in `project.test.ts`'s header comment | low | **OPEN, out of scope** | Pre-existing (zero diff in this branch); carried into HANDOFF as a follow-up |
| #5 — LOG-14/15 self-reported gaps | informational | **OPEN, accepted** | Carried into HANDOFF; production paths unaffected |

## Repair 1 — MBD-06 / MBD-07 route assertions (`b47b8de4`)

The Test Coverage Matrix names `routes/project.test.ts` as MBD-07's sensor, and
every pre-existing reset case posts a bare `{projectId}` and takes the
full-scope defaults — so the memories-only combination the Memory tab actually
sends was unexercised at the route layer. Three cases added:

- vector / keyword / symbol paths are **never called** (call-count baseline
  captured before the request, not merely "counts unchanged"), and their result
  keys are **absent** rather than `0` — a `0` would read as "cleared nothing"
  instead of "was never in scope";
- the `operation_log` row records
  `requestedScopes {vectors:false, symbols:false, memories:true}`, `result:"success"`,
  and `meta: {memoriesDeleted: 4}` exactly;
- a re-delete returning `0` still reports `success:true` with `memoriesDeleted: 0`
  and a `success` audit outcome (MBD-06's idempotent path).

**Observed RED**: mutating `apps/tools-api/src/routes/project.ts`'s
`if (clearVectors) {` to `if (true) {` produced **16 pass / 2 fail** — the
non-interference and audit-scope cases both fired. Restored by file copy
(`cp` from a `/tmp` backup, never `git checkout`); `git status --porcelain`
after restore showed only the intended test file. Post-repair:
`bun test apps/tools-api/src/routes/project.test.ts` → **18 pass / 0 fail**.

This upgrades MBD-06 and MBD-07 from PARTIAL to SATISFIED. Final coverage:
**33 of 33 canonical IDs SATISFIED.**

## Repair 2 — bulk-delete scope disclosure (`cfe09133`)

`renderMemoryBulkDelete`'s confirmation form now states that the action deletes
every memory for the project **including already-deleted rows still held as
tombstones**, that the reported count may therefore exceed the rows listed
above, that vectors / keyword rows / the symbol graph are left untouched (the
operator-facing half of MBD-07), and that the action cannot be undone. The note
renders only with the form open, so the closed state is unchanged.

**Observed RED**: removing the `scopeNote` concatenation from the form produced
**521 pass / 1 fail**. Restore verified byte-exact with `diff -q` against the
`/tmp` backup. Post-repair: `cd apps/web-ui && bun test` → **522 pass / 0 fail**.

This moves pre-mortem conformance #6 from **NO** to **YES**; all seven
pre-mortem findings are now conformed.

## Final gate readings at delivery

Re-run after both repairs, exit codes captured explicitly (never read from a
`| tail` pipeline's status):

| Gate | Exit | Result |
| --- | --- | --- |
| `bun run lint` | 0 | clean |
| `bun run type-check` | 0 | 6/6 tasks |
| `bun run test` (`DATABASE_URL` set, `MASSA_AI_EXECUTOR_SANDBOX=none`) | 0 | 11/11 tasks, 157 isolation groups |
| `bun run test:scripts` (scratch `XDG_CONFIG_HOME`) | 0 | 1739 pass / 0 fail across 79 files |
| `bun run test:plugins` | 0 | 135 pass / 0 fail across 8 files |
| `cd apps/web-ui && bun test` | 0 | 522 pass / 0 fail |
| `bun test apps/tools-api/src/routes/project.test.ts` | 0 | 18 pass / 0 fail |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-ops-suite --root .` | 0 | 0 errors |

**Environmental note, not a regression.** `bun run test:scripts` fails exactly 2
tests in `scripts/__tests__/generate-subagent-artifacts.test.ts`
(`opencode/agent-profiles/local_models drift detected`) when run against a
developer machine whose real `~/.config/massa-ai/model-profiles.json` defines a
`local_models` profile overlay — `generate:artifacts` reads the effective
registry (builtin + local overlay) while `--check` compares against
builtin-only output. Under `XDG_CONFIG_HOME=$(mktemp -d)` that file is
**53 pass / 0 fail**. CI has no config file and never reproduces it. Any figure
quoted from that suite must name which of the two config states it was measured
in.
