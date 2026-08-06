# Agent-Era Harness Upgrades Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The
skill is the source of truth for the full flow (per-task cycle, sub-agent delegation,
adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/agent-era-harness-upgrades/design.md`
**Status**: Draft

---

## Project Testing Guidelines Scan

Guidelines found and applied: `CONTRIBUTING.md` (7-step managed-harness protocol — Step 7
discriminating tests, mutation-style reasoning; measurement discipline), `CLAUDE.md`
(test-runner conventions, `bun run test:scripts` reaches `scripts/__tests__`; lint =
root oxlint; generated bundles AD-016), repo `AGENTS.md`. Existing samples:
`scripts/__tests__/pyts-golden.test.ts` (lessons.ts golden parity),
`spec-driven-validators.test.ts` (validator behavior tests, temp-dir fixture pattern).
Test placement convention: root-level script tests live in `scripts/__tests__/*.test.ts`,
plain `bun test`, no DB, deterministic.

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`, existing `scripts/__tests__` samples.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| lessons.ts CLI extension (AEH-03, AEH-05) | unit | All branches; 1:1 to spec ACs; every listed edge case (threshold boundary, demotion, legacy store, enum rejection, insufficient data); legacy-command byte-stability | `scripts/__tests__/lessons-trust-metrics.test.ts` | `bun test scripts/__tests__/lessons-trust-metrics.test.ts` |
| Skills prose (workflows, references, charters) (AEH-01/02/04/06/07/08/09) | content-sensor | One assertion per AC-critical literal; each observed red under deliberate mutation once | `scripts/__tests__/agent-era-guidance-content.test.ts` | `bun test scripts/__tests__/agent-era-guidance-content.test.ts` |
| Generated plugin bundles (AEH-10) | parity | Existing suites unchanged-green after regeneration | `scripts/__tests__/{skill-artifact-parity,subagent-parity}.test.ts` | `bun run generate:artifacts && bun test scripts/__tests__/skill-artifact-parity.test.ts scripts/__tests__/subagent-parity.test.ts` |
| SKILL.md frontmatter (AEH-04/08/09) | validator | `validate_skill.ts` clean on edited charters | n/a | `bun skills/massa-ai/scripts/validate_skill.ts skills/agents/test-engineer/SKILL.md` (and audit-specialist) |
| Existing lessons commands (regression) | golden | pyts-golden unchanged-green | `scripts/__tests__/pyts-golden.test.ts` | `bun test scripts/__tests__/pyts-golden.test.ts` |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After each script or prose task | `bun test scripts/__tests__/lessons-trust-metrics.test.ts scripts/__tests__/agent-era-guidance-content.test.ts scripts/__tests__/skills-harness-integrity.test.ts` |
| Full | After phase completion | Quick + `bun test scripts/__tests__/pyts-golden.test.ts scripts/__tests__/spec-driven-validators.test.ts` |
| Build | Before PR | `bun run generate:artifacts --check` (after a plain `generate:artifacts`) + `bun run lint` + Full + parity suites |

---

## Execution Plan

Phases are ordered and run sequentially. `6 Phases = 19 Tasks`.

### Phase 1: Ramp engine (2 Tasks)

T1 → T2

### Phase 2: Code-shape guidance (4 Tasks)

T3 → T4 → T5 → T6

### Phase 3: Testing surfaces (4 Tasks)

T7 → T8 → T9 → T10

### Phase 4: Spec anchor and policy prose (4 Tasks)

T11 → T12 → T13 → T14

### Phase 5: Reviewer wiring (3 Tasks)

T15 → T16 → T17

### Phase 6: Gates and delivery (2 Tasks)

T18 → T19

---

## Task Breakdown

### T1: Add review add + trust status to lessons.ts with unit tests

**Task ID**: TASK-001
**What**: `review add --category --feedback none|minor|major --source` appending to `data.reviews`, `trust status` derived view (trailing-streak scan, `trusted = streak >= trust_threshold`, default 30), lazy `ensureRampFields` (never in `load()`), plus unit tests for every AEH-03 AC and edge case.
**Where**: `skills/massa-ai/scripts/lessons.ts`, `scripts/__tests__/lessons-trust-metrics.test.ts`
**Depends on**: None
**Reuses**: `parseFlags` choices validation, `now()`, `load()/save()`, exit-code contract; temp-dir fixture pattern from `spec-driven-validators.test.ts`
**Requirement**: AEH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] 30 `none` records → trusted; 29 → not (boundary asserted both sides)
- [ ] `minor` extends streak; `major` resets to 0 and demotes
- [ ] Legacy store loads clean, `trust status` reports empty, exit 0
- [ ] Unknown `--feedback` exits 2 naming accepted values
- [ ] Second-level subcommand dispatch is new code (none exists today); top-level usage string and invalid-choice list updated to include `review`, `trust`, `metrics`
- [ ] Mutation check: `>=`→`>` at threshold and dropped-`major`-reset each turn a test red
- [ ] Gate check passes: quick gate command

**Tests**: unit
**Gate**: quick

**Commit**: `feat(skills): lessons.ts review-feedback records and derived trust status`

---

### T2: Add metrics add + metrics trend to lessons.ts with unit tests

**Task ID**: TASK-002
**What**: `metrics add` (enum + non-negative-integer validation) appending to `data.metrics`, `metrics trend` with scalar score `FAIL*100 + mutants*10 + fixIters + uncoveredACs` comparing last two snapshots, `insufficient data` under 2; unit tests for every AEH-05 AC plus legacy-command byte-stability (run `list` over a fixture store, assert file bytes unchanged).
**Where**: `skills/massa-ai/scripts/lessons.ts`, `scripts/__tests__/lessons-trust-metrics.test.ts`
**Depends on**: T1
**Reuses**: `ensureRampFields` from T1; same fixture pattern
**Requirement**: AEH-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] improving / stable / degrading verdicts each asserted; comparison-direction mutation turns a test red
- [ ] Single snapshot → `insufficient data`, exit 0
- [ ] NaN/negative numeric flag exits 2 naming the flag
- [ ] Byte-stability: legacy `list` leaves store file byte-identical
- [ ] `bun test scripts/__tests__/pyts-golden.test.ts` green
- [ ] Gate check passes: quick gate command

**Tests**: unit
**Gate**: full

**Commit**: `feat(skills): lessons.ts metric snapshots and trend verdict`

---

### T3: Rewrite code-quality-audit split and size leads

**Task ID**: TASK-003
**What**: Replace the split-on-"does more than one thing" lead with the discoverability-or-change-risk criterion; add static leads flagging multi-subject files and >2000-line files with the explicit no-flag-below-bound guard; create the content-sensor test file with this task's assertions.
**Where**: `skills/massa-ai/workflows/code-quality/code-quality-audit.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T2
**Reuses**: Existing static-leads list structure; KISS lead cross-reference wording from design
**Requirement**: AEH-01, AEH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] No remaining split-recommendation on size/"and" grounds alone (sensor asserts absence)
- [ ] Discoverability criterion present verbatim in split lead (sensor asserts presence)
- [ ] Multi-subject + >2000-line flags present with below-bound guard (sensor)
- [ ] Each new sensor observed red once via deliberate source mutation
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): code-quality-audit agent-read-aware split and file-size leads`

---

### T4: Rewrite code-quality-fix split directive

**Task ID**: TASK-004
**What**: Apply the same discoverability-or-change-risk criterion to the fix-side Clean Code/SOLID directives; KISS fix direction cross-references the criterion.
**Where**: `skills/massa-ai/workflows/code-quality/code-quality-fix.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T3
**Reuses**: Criterion sentence from T3 (single wording, both files)
**Requirement**: AEH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Fix-side split directive cites the criterion (sensor)
- [ ] Sensor observed red via mutation
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): code-quality-fix discoverability split criterion`

---

### T5: Name extract-for-findability in refactor workflow

**Task ID**: TASK-005
**What**: Step 8 of `refactor.md` names extract-for-findability (externally-searchable named unit) as the primary extraction payoff, tied to the existing "AI-navigable" goal.
**Where**: `skills/massa-ai/workflows/refactor.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T4
**Reuses**: Existing step-8 pragmatic-refactoring bullet list
**Requirement**: AEH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Findability payoff present in step 8 (sensor)
- [ ] Sensor observed red via mutation
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): refactor workflow names extract-for-findability payoff`

---

### T6: Add file-shape-for-agent-readers section to coding-guidelines

**Task ID**: TASK-006
**What**: New section: one-subject file up to ~1000 lines fine; >2000 exceeds a single agent read; one subject across N files costs N reads with per-hop loss; explicitly framed as read mechanics, not module depth (names the deepening-lens rejected framing).
**Where**: `skills/massa-ai/references/coding-guidelines.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T5
**Reuses**: `architecture-deepening-lens.md` Rejected Framings phrasing (cited, not restated)
**Requirement**: AEH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Section present with both numbers and the not-a-depth-metric framing (sensors)
- [ ] Sensors observed red via mutation
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): coding-guidelines file shape for agent readers`

---

### T7: Add gate table, variation and trend sensors, tests lens to tests-audit

**Task ID**: TASK-007
**What**: Five-row gate/error-class table (unit→logic, coverage→holes, variation→brittleness, AC-mapping→wrong-thing, trend→drift); variation sensor (single-fixture-example flag); trend sensor reading `lessons.ts metrics trend`; dispatch lens `performance` → `tests`.
**Where**: `skills/massa-ai/workflows/tests/tests-audit.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T6
**Reuses**: Existing sensor list structure; `metrics trend` CLI from T2
**Requirement**: AEH-04, AEH-05, AEH-08, AEH-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] All five gate rows present (sensor); variation + trend sensors present (sensors)
- [ ] Dispatch block names `lens: tests` and no longer files coverage under performance (sensor)
- [ ] Sensors observed red via mutation
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): tests-audit five-gate error-class model, variation and trend sensors`

---

### T8: Add variation fix method to tests-fix

**Task ID**: TASK-008
**What**: Fix method for variation findings: add varied-input cases (bounds, parameter changes), never a second copy of the fixture example.
**Where**: `skills/massa-ai/workflows/tests/tests-fix.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T7
**Reuses**: Existing fix-method list structure
**Requirement**: AEH-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Variation fix method present (sensor); sensor observed red via mutation
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): tests-fix variation finding method`

---

### T9: Update test-engineer charter mission and responsibilities

**Task ID**: TASK-009
**What**: Mission names the five error classes; responsibilities gain variation/property-style test design (library-neutral). Frontmatter untouched except body prose.
**Where**: `skills/agents/test-engineer/SKILL.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T8
**Reuses**: Charter structure; five-class wording from T7
**Requirement**: AEH-04, AEH-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Five classes in mission, variation responsibility present (sensors, observed red)
- [ ] `bun skills/massa-ai/scripts/validate_skill.ts skills/agents/test-engineer/SKILL.md` exits 0
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): test-engineer charter five error classes and variation design`

---

### T10: Add tests lens to audit-specialist charter

**Task ID**: TASK-010
**What**: Lens table gains `tests` row (coverage, regression protection, assertion quality, variation) routing to `workflows/tests/tests-audit.md`.
**Where**: `skills/agents/audit-specialist/SKILL.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T9
**Reuses**: Existing lens-table row format
**Requirement**: AEH-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `tests` lens row present (sensor, observed red)
- [ ] `validate_skill.ts` exits 0 on the charter
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): audit-specialist tests lens`

---

### T11: Add AC capture and AC-anchored verification to feature workflow

**Task ID**: TASK-011
**What**: `feature.md` gains a pre-implementation step capturing 1–5 testable ACs (or referencing an existing spec artifact) and its verification step checks outcomes against those captured ACs.
**Where**: `skills/massa-ai/workflows/feature.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T10
**Reuses**: Existing numbered-step structure
**Requirement**: AEH-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] AC capture precedes implementation steps; verification references captured ACs (sensors, observed red)
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): feature workflow lite spec anchor`

---

### T12: Document trust-ramp and metrics policy in lessons reference

**Task ID**: TASK-012
**What**: `references/lessons.md` gains the trust-ramp + metrics section: categories, feedback levels, threshold semantics, advisory meaning, the four commands, derived-state note.
**Where**: `skills/massa-ai/references/lessons.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T11
**Reuses**: Existing signal-table and command-doc structure
**Requirement**: AEH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Policy section present covering levels, threshold, advisory scope (sensors, observed red)
- [ ] Documented commands match T1/T2 CLI exactly (sensor compares literals)
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `docs(skills): lessons reference trust-ramp and metrics policy`

---

### T13: Add advisory trust-status line to implementation-delivery

**Task ID**: TASK-013
**What**: Human-review stage gains one advisory instruction: report the change's category trust status (`lessons.ts trust status`) as reading-depth context. The per-PR merge-approval clause stays verbatim.
**Where**: `skills/massa-ai/references/implementation-delivery.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T12
**Reuses**: Existing stage structure
**Requirement**: AEH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Advisory line present (sensor); merge clause byte-identical (sensor asserts exact clause)
- [ ] Sensors observed red via mutation
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): implementation-delivery advisory trust-status context`

---

### T14: Instruct metric-snapshot recording in validate reference

**Task ID**: TASK-014
**What**: `references/spec-driven/validate.md` gains a post-validation step recording the run's snapshot via `lessons.ts metrics add`.
**Where**: `skills/massa-ai/references/spec-driven/validate.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T13
**Reuses**: Existing lessons-distillation step placement
**Requirement**: AEH-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Recording step present with exact CLI (sensor, observed red)
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): validate reference records metric snapshots`

---

### T15: Wire reviewer dispatch into implementing workflows

**Task ID**: TASK-015
**What**: Instantiate the design's reviewer dispatch block (post-implementation, pre-verification, fallback clause) in the five implementing workflows; spec-driven placement is Execute step 6 before the verification-agent dispatch.
**Where**: `skills/massa-ai/workflows/feature.md`, `skills/massa-ai/workflows/general.md`, `skills/massa-ai/workflows/debug.md`, `skills/massa-ai/workflows/refactor.md`, `skills/massa-ai/workflows/spec-driven.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T14
**Reuses**: Dispatch-block format from `spec-driven.md:113-122`; template from design
**Requirement**: AEH-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] All 5 files contain the dispatch block with fallback clause AND the mandatory `persona:` bullet (sensor per file, observed red once)
- [ ] Existing verification gates untouched (sensor asserts verification-agent block intact)
- [ ] `bun test scripts/__tests__/skills-harness-integrity.test.ts` ≥ its pre-feature 32 pass / 0 fail
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): reviewer dispatch in implementing workflows`

---

### T16: Wire reviewer dispatch into fix workflows batch 1

**Task ID**: TASK-016
**What**: Same block, fix-diff scope wording, in five fix workflows.
**Where**: `skills/massa-ai/workflows/bugs/bugs-fix.md`, `skills/massa-ai/workflows/code-quality/code-quality-fix.md`, `skills/massa-ai/workflows/architecture/architecture-fix.md`, `skills/massa-ai/workflows/security/security-fix.md`, `skills/massa-ai/workflows/requirements/requirements-fix.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T15
**Reuses**: Block instantiation from T15
**Requirement**: AEH-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] All 5 files contain the block with `persona:` bullet (sensors); one observed red covers the shared template assertion
- [ ] `skills-harness-integrity.test.ts` still ≥ 32 pass / 0 fail
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): reviewer dispatch in fix workflows (1/2)`

---

### T17: Wire reviewer dispatch into fix workflows batch 2

**Task ID**: TASK-017
**What**: Same block in the remaining four fix workflows.
**Where**: `skills/massa-ai/workflows/tests/tests-fix.md`, `skills/massa-ai/workflows/implementation/implementation-fix.md`, `skills/massa-ai/workflows/maestro/maestro-fix.md`, `skills/massa-ai/workflows/mobile-figma/mobile-figma-fix.md`, `scripts/__tests__/agent-era-guidance-content.test.ts`
**Depends on**: T16
**Reuses**: Block instantiation from T15
**Requirement**: AEH-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] All 4 files contain the block with `persona:` bullet (sensors); 14-file total asserted by a count sensor
- [ ] `skills-harness-integrity.test.ts` still ≥ 32 pass / 0 fail
- [ ] Gate check passes: quick gate command

**Tests**: content-sensor
**Gate**: quick

**Commit**: `feat(skills): reviewer dispatch in fix workflows (2/2)`

---

### T18: Regenerate bundles and run build gates

**Task ID**: TASK-018
**What**: `bun run generate:artifacts`, then `--check`; parity suites; root lint; full gate; record the mutation-verification sweep table (every sensor's observed red) in the task record.
**Where**: generated `apps/*-plugin` bundles (no source edits)
**Depends on**: T17
**Reuses**: AD-016 generation-on-demand chain
**Requirement**: AEH-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `bun run generate:artifacts --check` exits 0
- [ ] Parity suites green; `bun run lint` exits 0
- [ ] Gate check passes: build gate command
- [ ] Mutation sweep table recorded (sensor → mutation → red evidence)
- [ ] Verification-agent inputs will name a spot-check: re-run the stated mutation for a sample of "observed red" claims rather than trusting the table (repo failure class: self-attested sensors)

**Tests**: parity
**Gate**: build

**Commit**: none (no tracked changes expected; gates only)

---

### T19: CHANGELOG entry and spec state artifacts

**Task ID**: TASK-019
**What**: `CHANGELOG.md` `[Unreleased]` entries (`### Added` for trust ramp/metrics/reviewer wiring/tests lens, `### Changed` for guidance rewrites); write and commit `.specs/project/STATE.md` (append new feature section, preserve prior), `.specs/project/FEATURES.json` registration, `.specs/HANDOFF.md` rotation (rename-then-prepend, section count grows).
**Where**: `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, `.specs/HANDOFF.md`
**Depends on**: T18
**Reuses**: CONTRIBUTING CHANGELOG heading→bump table; `check_specs_delivered.ts` gate
**Requirement**: AEH-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `bun skills/massa-ai/scripts/check_specs_delivered.ts agent-era-harness-upgrades --root .` exits 0
- [ ] CHANGELOG entries under `[Unreleased]` only; no released section touched
- [ ] Gate check passes: build gate command

**Tests**: none
**Gate**: build

**Commit**: `chore(specs): agent-era-harness-upgrades state, registry, changelog`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4 ──→ T5 ──→ T6
Phase 3:  T7 ──→ T8 ──→ T9 ──→ T10
Phase 4:  T11 ──→ T12 ──→ T13 ──→ T14
Phase 5:  T15 ──→ T16 ──→ T17
Phase 6:  T18 ──→ T19
```

Execution is strictly sequential — there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1, T2 | one script + its co-located tests each | ✅ Granular |
| T3–T14 | one prose file + its sensors each | ✅ Granular |
| T15–T17 | 4–5 files each, identical mechanical template insertion | ⚠️ Cohesive batch — one template, per-file sensors; split further only if a file needs bespoke wording |
| T18, T19 | gates / state only | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | phase start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | phase start after Phase 1 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | phase start after Phase 2 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | phase start after Phase 3 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | phase start after Phase 4 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | phase start after Phase 5 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | lessons.ts CLI | unit | unit | ✅ OK |
| T2 | lessons.ts CLI | unit | unit | ✅ OK |
| T3 | skills prose | content-sensor | content-sensor | ✅ OK |
| T4 | skills prose | content-sensor | content-sensor | ✅ OK |
| T5 | skills prose | content-sensor | content-sensor | ✅ OK |
| T6 | skills prose | content-sensor | content-sensor | ✅ OK |
| T7 | skills prose | content-sensor | content-sensor | ✅ OK |
| T8 | skills prose | content-sensor | content-sensor | ✅ OK |
| T9 | skills prose + frontmatter | content-sensor + validator | content-sensor (+ validator in Done when) | ✅ OK |
| T10 | skills prose + frontmatter | content-sensor + validator | content-sensor (+ validator in Done when) | ✅ OK |
| T11 | skills prose | content-sensor | content-sensor | ✅ OK |
| T12 | skills prose | content-sensor | content-sensor | ✅ OK |
| T13 | skills prose | content-sensor | content-sensor | ✅ OK |
| T14 | skills prose | content-sensor | content-sensor | ✅ OK |
| T15 | skills prose | content-sensor | content-sensor | ✅ OK |
| T16 | skills prose | content-sensor | content-sensor | ✅ OK |
| T17 | skills prose | content-sensor | content-sensor | ✅ OK |
| T18 | generated bundles | parity | parity | ✅ OK |
| T19 | state/changelog | none (build gate only) | none | ✅ OK |
