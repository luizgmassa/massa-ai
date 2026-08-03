# Cross-Pollination Ports & Gap Closure — Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `massa-ai` skill: activate it by name and follow its Execute flow and Critical Rules. If the skill cannot be activated, STOP and tell the user.

**Design**: `.specs/features/cross-pollination-ports/design.md`
**Status**: Draft (pending user approval + Plan Challenge)
**Branch**: `feature/cross-pollination-ports` off `main` @ `94e6b05`. One PR. One commit per task.

---

## Project Testing Guidelines Scan

Guidelines found (cited, not restated): `CLAUDE.md` §Running tests (isolation runner, 5 s per-test budget, seam-over-budget rule, `test:scripts` reach, turbo `passThroughEnv` contract), `CONTRIBUTING.md` Step 7 (discriminating tests, deterministic gate when possible), `coverage.yml` (90%-per-file floor — applies to `packages/core` source added by XP-02), `scripts/__tests__/` conventions (gate scripts tested with fixture sources, e.g. `check-coverage.test.ts`), `bunfig.toml` (5 s timeout). New-sensor rule from project lessons: every new gate shows an observed red before it counts.

## Test Coverage Matrix

> Generated from codebase + guidelines + spec. Guidelines: `CLAUDE.md`, `CONTRIBUTING.md`, `coverage.yml`, existing `scripts/__tests__/*` samples.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| `kernel/sanitize` scrubber (XP-02) | unit | 1:1 to XP-02 ACs: per-rule redact + near-miss pass-through (both directions), non-growth invariant, purity, adversarial 64 KiB input, escaped-`\n` PEM | `packages/core/src/__tests__/credential-scrub.test.ts` | `bun test packages/core/src/__tests__/credential-scrub.test.ts` |
| Observation insert seam (XP-02) | unit + type-level | branded-type rejection (`@ts-expect-error`), scrubbed persistence via `MemoryObservationStore`, both call sites covered; existing hook/observation/route suites stay green | same dir + existing suites | `bun test packages/core/src/__tests__/hook-service.test.ts` + full battery |
| Gate scripts (XP-03, XP-04-parity, XP-01-yaml, XP-10-drift) | unit | fixture red + green per clause; evasion shapes (rename, string-literal, comment); exception-list paths; live-tree smoke exit 0 | `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| CI YAML (XP-01, XP-04) | unit (YAML-parse assertions) + real CI run on PR | every install step preceded by cache step (exception named); build job env triple present | `scripts/__tests__/workflow-bun-cache.test.ts` | `bun run test:scripts` + PR CI |
| Generators (XP-06) | unit + byte-identity | both `--check` no-drift; parity suites unchanged; fixture-host discrimination; capability-table mutation red | `scripts/__tests__/host-capabilities.test.ts` + existing parity suites | `bun run test:scripts` |
| Test helper (XP-07) | its consumers | both RSS suites green, thresholds unchanged | existing files | `bun test packages/core/src/__tests__/cycle-detection.test.ts packages/core/src/__tests__/structural-runtime.test.ts` |
| Docs / registry / lessons / CHANGELOG (XP-05/08/09/11/12/13) | none — artifact check | measured figures cited in diff; lessons via tool only; grep checks | — | build gate + grep |

## Gate Check Commands

| Gate Level | When | Command |
|---|---|---|
| Quick | after unit-only tasks | `bun test <file>` (single file — safe single process) |
| Scripts | after any `scripts/` change | `bun run test:scripts` |
| Full battery | after each behavior-changing commit | `bun run lint && bun run type-check && bun run build && bun run test && bun run test:scripts && bun run test:plugins` |
| Deterministic | per phase completion | `bun scripts/run-deterministic.ts` |
| Generators | after T9–T13 | `bun run scripts/generate-subagent-artifacts.ts --check && bun run scripts/generate-skill-artifacts.ts --check` |
| Layering | after T3/T4 | `bun scripts/check-core-layering.ts` |
| Dedicated-DB local sensor | T7 | `docker run -d --name xp-pg5433 -p 5433:5432 -e POSTGRES_USER=massa_ai -e POSTGRES_PASSWORD=massa_ai_password -e POSTGRES_DB=massa_ai_test pgvector/pgvector:pg17` + `cd packages/core && DATABASE_URL=postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test bunx prisma migrate deploy` + run one gated suite with the triple set |
| Coverage floor | XP-02 files | `bun run test:coverage` scope check for new core files (90% floor) |

---

## Execution Plan

Phases ordered, sequential. 21 tasks → packs into 3 worker batches + inline final phase (offer-then-confirm at Execute).

```
Phase 0 (setup):      T1 → T2
Phase 1 (XP-02):      T3 → T4
Phase 2 (gates):      T5 → T6 → T7
Phase 3 (XP-01):      T8
Phase 4 (XP-06):      T9 → T10 → T11 → T12 → T13
Phase 5 (small):      T14 → T15 → T16 → T17 → T18 → T19
Phase 6 (close):      T20 → T21   (always inline — author ≠ verifier)
Batch plan: B1 = P0+P1+P2 (7 tasks) · B2 = P3+P4 (6) · B3 = P5 (6) · P6 inline
```

---

## Task Breakdown

### T1 / TASK-XP-001: Branch + commit spec artifacts
**What**: create `feature/cross-pollination-ports` off `main`; commit spec.md, design.md, tasks.md, the source report (`.specs/reports/cross-pollination-portability-and-gaps.md`, currently untracked), FEATURES.json registration, STATE.md block.
**Where**: `.specs/**` only. **Depends on**: none. **Requirement**: process. **Tools**: git only (massa-ai MCP unavailable — recorded). 
**Done when**: branch exists; one commit `docs(specs): specify + design cross-pollination-ports`; working tree clean; no source file touched.
**Tests**: none (matrix: docs). **Gate**: `git status` clean + `bun run test:scripts` untouched-green not required (docs-only).

### T2 / TASK-XP-002: turbo passThroughEnv completeness + drift guard
**What**: add `RUN_POSTGRES_TESTS` + the re-measured missing `MASSA_AI_*` set (27 at spec time — re-derive) to `turbo.json` `tasks.test.passThroughEnv`; new `scripts/__tests__/turbo-passthrough-env.test.ts` (scan tracked `packages/`+`apps/` for both `process.env.X` accessor forms; assert read-set ⊆ list + sentinel vars present); update CLAUDE.md AD-010 note to name the enforcing test.
**Where**: `turbo.json`, `scripts/__tests__/turbo-passthrough-env.test.ts`, `CLAUDE.md` (one sentence). **Depends on**: T1. **Requirement**: XP-10 (unblocks XP-04).
**Done when**: drift test red when a listed var is removed (observed, reverted), green as shipped; `bun run test:scripts` passes.
**Tests**: unit (gate-script layer). **Gate**: Scripts. **Commit**: `feat(build): complete turbo passThroughEnv + mechanical drift guard`

### T3 / TASK-XP-003: kernel credential scrubber
**What**: `packages/core/src/kernel/sanitize/credential-scrub.ts` per design C1 (7 rules, branded `SanitizedPayloadJson`, `ScrubResult`, no escape hatch) + `credential-scrub.test.ts` (per-rule both-direction, non-growth, purity, escaped-PEM, 64 KiB adversarial under budget).
**Where**: new kernel file + test. **Depends on**: T1. **Requirement**: XP-02.
**Done when**: all rule tests pass; non-growth asserted over every rule; `check-core-layering` unchanged-green; coverage ≥90% for the new file.
**Tests**: unit. **Gate**: Quick + Layering. **Commit**: `feat(core): kernel credential scrubber with branded Sanitized type`

### T4 / TASK-XP-004: enforce boundary at Observation insert seam
**What**: `InsertableObservation` in `observation-contract.ts`; wire `hook-service.ts:246` + `tools/compact_snapshot.ts:111` through `scrubCredentials`; `logger.debug` on `total>0`; append AD-013 to STATE Decisions. **Plan-Challenge amendment (critic C1, critical)**: `packages/core/tsconfig.json:25` excludes `src/__tests__` from every type-check, so an in-tree `@ts-expect-error` proves nothing — the type-level AC is instead enforced by a **compile-fixture gate**: `scripts/__tests__/xp02-branded-type.test.ts` builds an in-process `ts.createProgram` over two fixtures (violating: bare-string `payloadJson` into `insert` → MUST produce a type diagnostic; conforming: scrubbed value → MUST be clean). Additionally route the existing bare-string test constructions through `scrubCredentials` so the test surface exercises the real boundary: `auto-improve-job.test.ts`, `observation-consolidation-job.test.ts`, `auto-improve-job.characterization.test.ts`, `compact-snapshot-attribution.test.ts`, `hook-service.test.ts` (+ any further `insert(` site a sweep finds — enumerate at Execute, don't trust this list).
**Where**: `observation-contract.ts`, `hook-service.ts`, `compact_snapshot.ts`, `scripts/__tests__/xp02-branded-type.test.ts` (+fixtures), the enumerated `packages/core/src/__tests__/*` insert sites, STATE.md. **Depends on**: T3. **Requirement**: XP-02 AC-1..5.
**Done when**: compile-fixture gate red-fixture produces the diagnostic and clean-fixture none (the red fixture IS the observed red); MemoryObservationStore path shows redacted persistence for each rule; hooks/observation/route/mcp suites green; wire-shape suites (`hooks.test.ts`, `hook-compact-snapshot-route.test.ts`) unchanged-green; test-file insert sweep shows zero remaining bare-string constructions.
**Tests**: unit + compile-fixture type gate. **Gate**: Full battery + Scripts. **Commit**: `feat(core): type-enforced sanitization boundary on observation persistence`

### T5 / TASK-XP-005: security allowlist gate
**What**: `scripts/check-security-allowlist.ts` (AST, 4 classes per design C2) + `scripts/security-allowlist.txt` (seeded from the gate's own measured run, each entry reviewed + justified — **disclosed open-ended sub-scope (critic C4)**: the per-site review count is unknowable before the gate first runs; if the review exceeds ~10 justification entries, pause and report rather than rubber-stamp) + fixture unit tests + ci.yml `build` wiring after oxlint.
**Where**: 2 new scripts files, `scripts/__tests__/check-security-allowlist.test.ts`, `ci.yml`. **Depends on**: T1 (T4 ordering note: runs after T4 so the tree it baselines includes XP-02's final call sites). **Requirement**: XP-03.
**Done when**: live tree exit 0 with population printed; injected `child_process.exec` on scratch → exit 1 naming file:line (observed, reverted content-verified); stale-entry + eval-hit fixtures red; `test:scripts` green.
**Tests**: unit. **Gate**: Scripts. **Commit**: `feat(ci): count-bounded security allowlist gate for dangerous primitives`

### T6 / TASK-XP-006: workflow venue-parity gate
**What**: `scripts/check-workflow-venue-parity.ts` (Bun.YAML; semantic key set; EXEMPT + exception tables per design C4) + unit tests + ci.yml `build` wiring.
**Where**: new script + test, `ci.yml`. **Depends on**: T1. **Requirement**: XP-04 AC-2/3.
**Done when**: fixture divergence red / declared exception green / unclassified workflow red; live tree exit 0 (with T7's flip it must PASS with near-empty exceptions; run again after T7); observed red via scratch env-key edit.
**Tests**: unit. **Gate**: Scripts. **Commit**: `feat(ci): workflow venue-parity gate`

### T7 / TASK-XP-007: ci.yml dedicated-DB flip
**What**: build job service → `5433:5432`/`massa_ai_test`; job env `DATABASE_URL` (127.0.0.1:5433) + `MASSA_AI_DEDICATED=1`; test step `RUN_POSTGRES_TESTS=1`; fix `check-coverage.ts:414/:434` "50" comment with re-measured populations (13/11/1-overlap — re-measure).
**Where**: `ci.yml`, `scripts/check-coverage.ts` (comment only). **Depends on**: T2 (passthrough), T6 (parity gate sees final shape). **Requirement**: XP-04 AC-1/4.
**Done when**: local sensor — one `DEDICATED_DB` suite (e.g. `graph-store-pg-coverage.test.ts`) executes (not skipped) against local 5433 dedicated DB with the triple set through `bun run test` (proves turbo passthrough end-to-end); venue-parity gate PASS; `release.yml` untouched (`git diff --stat` proves); real-CI confirmation deferred to PR (recorded in validation).
**Tests**: unit (existing gated suites) + CI. **Gate**: Dedicated-DB local sensor + Scripts. **Commit**: `feat(ci): exercise dedicated-DB suites in the blocking test job`

### T8 / TASK-XP-008: Bun install cache warming
**What**: `actions/cache@v4` step before all 5 install steps (`ci.yml` ×3, `coverage.yml`, `publish.yml`) per design C3; `scripts/__tests__/workflow-bun-cache.test.ts` (YAML assertion, needles-gate exception named).
**Where**: 3 workflow files + 1 test. **Depends on**: T7 (same-file edits ordered). **Requirement**: XP-01.
**Done when**: YAML test red on removed cache step (observed), green shipped; purge blocks byte-identical (diff-proven); no build-output path cached.
**Tests**: unit. **Gate**: Scripts. **Commit**: `feat(ci): warm Bun install cache across install-bearing jobs`

### T9 / TASK-XP-009: host-capabilities module
**What**: `scripts/lib/host-capabilities.ts` per design C5 (re-export HOSTS/Host from model-profiles; `HOST_CAPABILITIES` 4-host record; `capabilitiesFor` frozen) + `scripts/__tests__/host-capabilities.test.ts` (shape, frozen/no-mutation, per-host expected values).
**Where**: new lib + test. **Depends on**: T1. **Requirement**: XP-06.
**Done when**: unit tests green; no generator touched yet; `test:scripts` green.
**Tests**: unit. **Gate**: Scripts. **Commit**: `feat(harness): explicit per-host capability table`

### T10 / TASK-XP-010: subagent generator onto capabilities
**What**: replace bare-union `Host` + `RegistryHost` casts with imports; dispatch ternary → `Record<Host, EmitFn>`; `ext` ternaries (×2) → `artifactExtension`. **Plan-Challenge amendment (critic C2, high)**: the hosts seam is an APPENDED third parameter — `emitAll(targetDirs, opts = {}, hosts = HOSTS)` — preserving the existing positional contract; `emitAll` has 8 existing call sites (2 internal + 6 in `scripts/__tests__/generate-subagent-artifacts.test.ts`) which must compile and pass **unmodified**.
**Where**: `scripts/generate-subagent-artifacts.ts`. **Depends on**: T9. **Requirement**: XP-06 AC-1.
**Done when**: `generate-subagent-artifacts.ts --check` no drift; `subagent-parity.test.ts` AND `generate-subagent-artifacts.test.ts` unchanged-green; `test:plugins` green.
**Tests**: byte-identity + existing parity. **Gate**: Generators + Scripts. **Commit**: `refactor(harness): subagent generator consumes capability table (byte-identical)`

### T11 / TASK-XP-011: skill generator onto capabilities
**What**: local `HOSTS`/`Host` → import; `HOOK_BINARY_HOSTS` → derived from `hookBinaryDelivery`; opencode `managedRootsFor`/lib copy → `extraManagedRoots`.
**Where**: `scripts/generate-skill-artifacts.ts`. **Depends on**: T9. **Requirement**: XP-06 AC-1.
**Done when**: `generate-skill-artifacts.ts --check` no drift; `skill-artifact-parity.test.ts` green.
**Tests**: byte-identity + existing parity. **Gate**: Generators + Scripts. **Commit**: `refactor(harness): skill generator consumes capability table (byte-identical)`

### T12 / TASK-XP-012: fixture-host discrimination
**What**: test-only 5th-host capabilities entry driven through `emitAll`'s hosts seam; assert extension/marker/hook-binary behavior follows the table; scratch table-mutation (codex `artifactExtension` flip) shows `--check` drift red (observed, reverted).
**Where**: `scripts/__tests__/host-capabilities.test.ts` (extend). **Depends on**: T10, T11. **Requirement**: XP-06 AC-2.
**Done when**: fixture host emits per table; mutation red observed; nothing ships for host 5 (`git status` proves no `apps/` change).
**Tests**: unit discriminating. **Gate**: Generators + Scripts. **Commit**: `test(harness): fixture 5th host proves capability table is load-bearing`

### T13 / TASK-XP-013: adding-a-host doc
**What**: `docs/adding-a-host.md` per design C5 (capability contract, quirk classes, sibling surfaces incl. bash installer tables, table-first rule); 7-step protocol record (steps + N/A entries) in the PR body source.
**Where**: new doc. **Depends on**: T12. **Requirement**: XP-06 AC-3/4.
**Done when**: doc names every `HostCapabilities` field + all sibling surfaces from design; no stale pointer (`check-stale-pointers` via test:scripts green).
**Tests**: none (docs). **Gate**: Scripts. **Commit**: `docs(harness): adding-a-host capability contract`

### T14 / TASK-XP-014: RSS helper
**What**: `packages/core/src/__tests__/helpers/rss-delta.ts` (`rssNow`, `rssDeltaOver`, `median`); refactor `cycle-detection.test.ts` (2 sites) + `structural-runtime.test.ts` (sampling loop keeps shape) onto it.
**Where**: 1 new + 2 modified test files. **Depends on**: T1. **Requirement**: XP-07.
**Done when**: both suites green with unchanged thresholds (diff shows no numeric/comparison change); helper not exported from package (`packages/core/src/index.ts` untouched).
**Tests**: consumers. **Gate**: Quick (both files). **Commit**: `refactor(core-tests): shared RSS-delta helper`

### T15 / TASK-XP-015: CLAUDE.md testing-claims fix
**What**: rewrite runner paragraph (thin wrappers over `scripts/lib/run-tests-isolated.ts`, line counts re-measured at HEAD) + `test:scripts` line (fresh run counts + `ls scripts/tests/*.sh | wc -l`). Runs LATE so counts include this feature's new suites.
**Where**: `CLAUDE.md`. **Depends on**: T2..T13 (all suite-adding tasks). **Requirement**: XP-08, XP-09.
**Done when**: every figure in the edited paragraphs reproduces from a command run in this task (commands + outputs recorded in commit body).
**Tests**: none. **Gate**: fresh `bun run test:scripts` + `wc -l`. **Commit**: `docs: correct test-runner architecture and test:scripts figures`

### T16 / TASK-XP-016: CONTRIBUTING tripwire paragraph
**What**: append spec-AC paragraph to Step 6 citing `llm-env-prefix.test.ts`.
**Where**: `CONTRIBUTING.md`. **Depends on**: T1. **Requirement**: XP-05.
**Done when**: paragraph present; cited path resolves.
**Tests**: none. **Gate**: `test:scripts` (stale-pointer check). **Commit**: `docs(contributing): name the revert-with-tripwire-test pattern`

### T17 / TASK-XP-017: FEATURES.json spelling
**What**: `workflow-harness-overhaul` status `in-progress` → `in_progress` (python read-modify-write); grep proves zero hyphen variants remain.
**Where**: `.specs/project/FEATURES.json`. **Depends on**: T1. **Requirement**: XP-11.
**Done when**: `grep -c '"status": "in-progress"'` = 0; JSON valid.
**Tests**: none. **Gate**: grep + `python3 -c json.load`. **Commit**: `fix(specs): normalize feature status spelling`

### T18 / TASK-XP-018: record 5 lessons
**What**: `lessons.py add` ×5 per design C8 signal mapping; verify LESSONS.md regenerated by tool.
**Where**: `.specs/lessons.json` + `.specs/LESSONS.md` (tool-owned). **Depends on**: T1. **Requirement**: XP-12.
**Done when**: `lessons.py list` shows 5 new candidates; no hand edit (`git diff` only from tool run).
**Tests**: none. **Gate**: `lessons.py status`. **Commit**: `docs(specs): record five cross-pollination lessons via lessons pipeline`

### T19 / TASK-XP-019: CHANGELOG
**What**: `[Unreleased]` `### Added` + `### Fixed` entries per design C8; no skip-ci marker anywhere.
**Where**: `CHANGELOG.md`. **Depends on**: T2..T18 (describes them). **Requirement**: XP-13.
**Done when**: entries match shipped work; merge gate satisfied.
**Tests**: none. **Gate**: prose review + CI merge gate on PR. **Commit**: `docs(changelog): cross-pollination ports entries`

### T20 / TASK-XP-020: full battery + independent validation
**What**: run Full battery + Deterministic + Generators + Layering; dispatch `massa-ai-verification-agent` (read-only, author ≠ verifier) over spec ACs + diff; write `validation.md`; fix→re-verify ≤3 loops.
**Depends on**: all. **Requirement**: all. **Gate**: everything. No commit (validation.md committed in T21).

### T21 / TASK-XP-021: close-out
**What**: STATE.md/HANDOFF.md/FEATURES.json updates; commit validation.md + state; push branch; open PR (body: 7-step record, no skip-ci literal); report evidence gate.
**Depends on**: T20 PASS. **Commit**: `docs(specs): validation + state close-out for cross-pollination-ports`

---

## Execution Record

**T1 DONE — `d62ab74`** (orchestrator): worktree `feature/cross-pollination-ports` @ 94e6b05, artifacts committed, provisioned (install 8.7s), baseline battery green warm (one cold red = documented DA-13 mcp-client flake, standalone-green both configs).

**Batch 1 (T2–T7) DONE — worker, Status Complete.**
- T2 `b1360c4`: +28 passThroughEnv (27 `MASSA_AI_*` re-derived + `RUN_POSTGRES_TESTS`); drift test observed-red on removed var; test:scripts 1119/0/50.
- T3 `170f357`: scrubber 26/26, 100% cov, layering 0 violations; non-growth observed-red. SPEC_DEVIATION (accepted): rule id `aws-key` (not `aws-key-id`) + slack near-miss floor 18 — both forced by the non-growth invariant vs marker length; documented in module header.
- T4 `a6fdafb`: full battery green; compile-fixture diagnostic verbatim (`Type 'string' is not assignable to type 'SanitizedPayloadJson'`); insert sweep zero bare strings; one justified `as unknown as InsertableObservation` fixture in `compact-snapshot-attribution.test.ts:123` fabricating a pre-spec legacy row (verified by orchestrator — the fixture proves compact_snapshot re-scrubs legacy content on persist; response-XML deliberately unredacted, durable row redacted). SPEC_DEVIATION (accepted): AD-013 STATE append deferred to T21 (worker forbidden from `.specs/**`).
- T5 `261d118`: allowlist gate live in ci.yml build; 15 measured sites (14 child-process, 1 raw-sql-unsafe, 0 bun-spawn, 0 dynamic-eval) in 6 entries; observed-red scratch exec named file:line; 39 tests; test:scripts 1161/52.
- T6 `c8410d7`: venue-parity gate live; 21 tests; observed-red on mutated coverage.yml env key; test:scripts 1182/53.
- T7 `fada98b`: build job flipped to dedicated triple; sensor before/after `graph-store-pg-coverage.test.ts` 0 pass/20 skip → 18 pass/0 fail THROUGH turbo (passthrough proven end-to-end); full `bun run test` under flipped env 11/11, 151 groups, 0 fail; `release.yml` diff empty; check-coverage comment now states measured 13/11/1-overlap (union 23); venue-parity exceptions 4→1.

Real-CI confirmation of T7 deferred to the PR run (as scoped). Statuses: T1–T7 ✅.

**Batch 2 (T8–T13) DONE — worker, Status Complete.**
- T8 `30ee336`: cache steps ×5 (ci ×3, coverage, publish); observed-red on removed build-job cache step (2 tests named it); purge blocks byte-identical (33 insertions / 0 deletions across 3 workflow files); needles-gate exclusion asserted for real; both B1 gates re-run green post-edit; test:scripts 1197/54.
- T9 `41ea0d4`: `scripts/lib/host-capabilities.ts` (deep-frozen, HOSTS re-exported from model-profiles); test:scripts 1224/55. SPEC_DEVIATION (accepted): `ownershipMarker` gained third value `"filename"` — measured against `apps/{claude,cursor}-plugin/install.sh` uninstall scoping (filename prefix, not text marker); nothing wires the field into a generator, enum accuracy over design literal.
- T10 `e9d6105`: subagent generator on the table; `emitAll(targetDirs, opts={}, hosts=HOSTS)` per critic-C2 amendment, 8 call sites unmodified (47/47); parity 40/40; --check no drift.
- T11 `c27b9f7`: skill generator on the table via injectable `capsLookup` seam; parity 19/19; --check no drift.
- T12 `fd02d2e`: fixture 5th host drives real emit behavior (hook-binary + lib copy vs control host); scratch codex ext flip → --check exit 1 naming 17 codex files, reverted diff-empty; apps/ 0 lines.
- T13 `96c207a`: `docs/adding-a-host.md` — all 8 fields + quirk classes + sibling surfaces; stale-pointers PASS.
- Phase-4 close (worker): lint 0 / type-check 6/6 / build 5/5 / test 11/11 under dedicated triple (184 groups: 151 core + 25 tools-api + 8 mcp-client, 0 fail) / test:scripts **1230/55** / test:plugins 96 / deterministic **2098 pass, 127 skip, 0 fail, 138 files** / both --check no drift / layering 985 edges 933 files 0 violations / bun.lock untouched.
- Orchestrator re-verified first-hand: both --check no-drift re-run, `git diff fc15882..HEAD -- apps/` EMPTY, tree clean.

Statuses: T8–T13 ✅. Worker note carried for the verifier: T12's `capsLookup` injection seam shape was an Execute-level judgment (design fixed the observable AC, not the seam mechanics) — reviewer's eye requested.

**Batch 3 (T14–T19) DONE — worker, Status Complete.**
- T14 `2a665f9`: rss-delta helper + both consumers; zero numeric/comparator literal changed (diff-reviewed); helper unexported; layering 0 violations.
- T15 `cc050d8`: CLAUDE.md figures re-measured in-task (121/30/46 over shared 373; 1230 TS tests/55 files + 21 shell suites); commands + outputs in commit body; AD-010 note verified current.
- T16 `6d0b83e`: CONTRIBUTING Step 6 tripwire paragraph, 9-line append, cited path resolves.
- T17 `e8d28f7`: FEATURES.json single-line status fix; near-miss recorded — first write used `ensure_ascii=True` (would have re-encoded every em-dash), caught via `git diff --stat` before staging, reverted, redone with `ensure_ascii=False`.
- T18 `e7ead10`: lessons L-009..L-013 via lessons.py (13 total, 5 new, all candidate); LESSONS.md 100% tool-regenerated.
- T19 `24d657e`: CHANGELOG `### Added` ×7 + `### Fixed` ×4 under [Unreleased]; no skip-ci literal in the diff. Worker flag for T20: CHANGELOG prose summarizes B1/B2 work from the Execution Record, not independently re-verified — validator spot-check requested.
- Batch close: test:scripts 1230/55 + 21/21 shell, lint 0, tree clean.

Statuses: T14–T19 ✅. All 19 implementation tasks complete; Phase 6 (T20 validation, T21 close-out) runs inline.

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1 | artifacts commit | ✅ |
| T2 | 1 config + 1 test + 1 doc sentence | ✅ cohesive |
| T3 | 1 module + its test | ✅ |
| T4 | 1 seam (3 files, one contract change) | ✅ cohesive |
| T5 | 1 gate (script+allowlist+test+wiring) | ✅ cohesive |
| T6 | 1 gate | ✅ |
| T7 | 1 workflow job + 1 comment | ✅ |
| T8 | 1 step shape ×5 + 1 test | ✅ cohesive (identical step) |
| T9–T13 | 1 module / 1 file each | ✅ |
| T14 | 1 helper + 2 call sites | ✅ |
| T15–T19 | 1 doc/registry each | ✅ |
| T20–T21 | validation / close-out | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram | Status |
|---|---|---|---|
| T1 | none | phase 0 start | ✅ |
| T2 | T1 | P0: T1→T2 | ✅ |
| T3 | T1 | P1 after P0 | ✅ |
| T4 | T3 | P1: T3→T4 | ✅ |
| T5 | T1 (+ordering note after T4) | P2 after P1 | ✅ |
| T6 | T1 | P2: T5→T6 | ✅ (phase order supplies) |
| T7 | T2, T6 | P2: T6→T7 | ✅ backward-only |
| T8 | T7 | P3 after P2 | ✅ |
| T9 | T1 | P4 start | ✅ |
| T10 | T9 | T9→T10 | ✅ |
| T11 | T9 | T10→T11 (phase order) | ✅ backward-only |
| T12 | T10, T11 | T11→T12 | ✅ |
| T13 | T12 | T12→T13 | ✅ |
| T14 | T1 | P5 | ✅ |
| T15 | T2..T13 | P5 late | ✅ |
| T16–T18 | T1 | P5 | ✅ |
| T19 | T2..T18 | P5 last | ✅ |
| T20 | all | P6 | ✅ |
| T21 | T20 | P6 | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T2 | gate script | unit | unit (drift test) | ✅ |
| T3 | kernel module | unit | unit co-located | ✅ |
| T4 | seam | unit+type | unit+type | ✅ |
| T5 | gate script | unit | unit | ✅ |
| T6 | gate script | unit | unit | ✅ |
| T7 | CI YAML | unit+CI | gated-suite sensor + parity + CI | ✅ |
| T8 | CI YAML | unit | YAML test | ✅ |
| T9 | lib module | unit | unit | ✅ |
| T10/T11 | generator | byte-identity | --check + parity | ✅ |
| T12 | test | discriminating | fixture+mutation | ✅ |
| T13/T15–T19 | docs/registry | none (matrix: none) | none + artifact checks | ✅ |
| T14 | test helper | consumers | consumers | ✅ |

## MCP and Skill question

massa-ai MCP server unreachable this session (recorded in STATE) — index/search/memory tools unavailable; standard file/git/Bash tools materially sufficient for every task; no other MCP changes correctness or verification. Skills: none beyond the active massa-ai workflow. Recorded as resolved.

## Artifact-store evidence

Active artifact: `.specs/features/cross-pollination-ports/tasks.md` v1 (checksum in STATE at next update). Requirement coverage: XP-01→T8, XP-02→T3/T4, XP-03→T5, XP-04→T2/T6/T7, XP-05→T16, XP-06→T9–T13, XP-07→T14, XP-08/09→T15, XP-10→T2, XP-11→T17, XP-12→T18, XP-13→T19 — 13/13 covered, 0 unmapped.
