# Workflow Reuse-Scan, English Naming, and Figma Wiring — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

CONTRIBUTING 7-step mapping: step 1 = spec ACs; step 2 = router registration lines (T1–T3); step 6 = invariant preservation (harness-contract); step 7 = discriminating tests (T5/T6 observed-red + validation mutations). Steps 3–5 (preserve argv, read-only export, deliver-before-ack) are N/A — this delivery is prose-only skill content plus one gate script; no CLI argv surface or acknowledgment path changes (plan-critic F5).

---

**Design**: `.specs/features/workflow-reuse-naming-figma/design.md`
**Status**: Draft

---

## Project Testing Guidelines Scan

Guidelines found: `CLAUDE.md` (gate commands, test:scripts scope, generate:artifacts chain), `CONTRIBUTING.md` (7-step managed-harness protocol, CHANGELOG authoring), `scripts/__tests__/workflow-harness-contract.test.ts` (byte-identity + population conventions), `scripts/__tests__/skills-duplication-metric.test.ts` docblock (ceiling-raise convention). Test placement convention: harness gates live in `scripts/__tests__/*.test.ts`, run by `bun run test:scripts`; no per-skill test files exist.

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CLAUDE.md`, `CONTRIBUTING.md`, existing `scripts/__tests__/` gate suite.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Skill markdown (workflows, references) | harness gates | Every mandate line asserted (presence ×16; byte-uniformity for the reuse-scan line); 3 new references existence-asserted; all citations resolve; duplication excess ≤ ceiling; frontmatter valid ×40 | `scripts/__tests__/*.test.ts` | `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/skills-duplication-metric.test.ts scripts/__tests__/workflow-metadata-headers.test.ts scripts/__tests__/skill-doc-paths.test.ts scripts/__tests__/skills-harness-integrity.test.ts` |
| Generated plugin bundles | parity gate | Byte-identical bundles, no drift | `scripts/__tests__/skill-artifact-parity.test.ts` | `bun run generate:artifacts && bun test scripts/__tests__/skill-artifact-parity.test.ts` |
| Sensor extension (this feature's new assertions) | observed-red discipline | Each new assertion observed red before trusted green (GATE-05); discrimination mutations at validation | scratch mutation + committed red-by-design ordering (T5→T6) | per-task gate + verifier |
| Spec artifacts | deterministic validators | validate_spec / validate_design / validate_tasks / validate_state exit 0 | `.specs/features/workflow-reuse-naming-figma/` | `bun skills/massa-ai/scripts/validate_tasks.ts workflow-reuse-naming-figma --root .` |

Requirement→sensor mapping: REUSE-02, NAME-02, GATE-01 → harness-contract extension (T5/T6). REUSE-03 + hook-chain integrity → ordering assertions in the same extension (design D11a, plan-critic F1). FIGMA-07 → `skills/massa-ai/scripts/validate_figma_wiring.ts` deterministic backing (T11, design D11b). REUSE-01, NAME-01/03, FIGMA-01..06/08, ABST-01..03 → new-reference existence assertion + doc-paths/integrity resolution + verifier dry-read + discrimination mutations (prose contracts; the gate suite + ordering assertions + independent verifier are the deterministic sensors — recorded as the coverage-gap resolution, not omitted). GATE-02..05 → the gate suite itself. PROC-01 → closing report (verifier checks presence).

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After any single skills/ markdown edit | `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/skills-duplication-metric.test.ts scripts/__tests__/workflow-metadata-headers.test.ts scripts/__tests__/skill-doc-paths.test.ts` |
| Full | After tasks touching router, references population, or design.md restructure | Quick + `bun test scripts/__tests__/skills-harness-integrity.test.ts` + `bun run generate:artifacts && bun test scripts/__tests__/skill-artifact-parity.test.ts` |
| Build | Phase completion + close-out | `bun run generate:artifacts && bun run test:scripts` |

---

## Execution Plan

Phases are ordered and run sequentially. `2 Phases = 13 Tasks` planned as `Phase 1 = 6 Tasks`, `Phase 2 = 7 Tasks`.

### Phase 1: References, naming rule, sensor, class-wide insertion

T1 → T2 → T3 → T4 → T5 → T6

### Phase 2: Spec-driven/feature Figma + ordering hooks, wiring validator, close-out

T7 → T8 → T9 → T10 → T11 → T12 → T13

---

## Task Breakdown

### T1: Create code-reuse-scan reference and register it

**What**: TASK-001 — write `skills/massa-ai/references/code-reuse-scan.md` (scan targets, investigator-class read-only dispatch block with the exact persona-bullet clause, reuse-map output contract with use/extend/new decisions and evidence-or-zero empty result, inline fallback + recorded skip reason) and add its single line to the router's Shared References list; measure `skills/massa-ai/SKILL.md` ≤ 21,000 B.
**Where**: `skills/massa-ai/references/code-reuse-scan.md` (+ one line in `skills/massa-ai/SKILL.md`)
**Depends on**: None
**Reuses**: dispatch-block template + persona bullet (existing 16 workflows), figma-pre-analysis single-normative-copy pattern
**Requirement**: REUSE-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Four contract elements present (targets, dispatch, reuse map, fallback)
- [ ] Router line added; SKILL.md byte count ≤ 21,000 reported
- [ ] Gate check passes: Quick + integrity (reference resolves, no orphan)

**Tests**: harness gates
**Gate**: full

**Commit**: `feat(skills): add code-reuse-scan reference (REUSE-01)`

---

### T2: Create figma-wiring reference and register it

**What**: TASK-002 — write `skills/massa-ai/references/figma-wiring.md`: per-link file template `.specs/<type>/<slug>/figma/NN-<link-slug>.md`, wiring-table contract (Number, Figma node id(s), Category, Spec(s) ID, Task(s) ID, Design(s) ID, Explanation, Notes), the 13-category table verbatim from spec FIGMA-04, category-tier rules (specs high-level; tasks/designs low-level wired to codebase elements), reuse-scan cross-link (FIGMA-06), unused-Number stop rule (FIGMA-07), Execute Figma-MCP retrieval protocol (FIGMA-08), platform-neutral enablement definition (FIGMA-01). Add router Shared References line.
**Where**: `skills/massa-ai/references/figma-wiring.md` (+ one line in `skills/massa-ai/SKILL.md`)
**Depends on**: T1
**Reuses**: figma-pre-analysis two-stage protocol (referenced, not restated); artifact-store `.specs/` canonical rules
**Requirement**: FIGMA-01, FIGMA-02, FIGMA-03, FIGMA-04, FIGMA-05, FIGMA-06, FIGMA-07, FIGMA-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Table columns and 13 categories match spec exactly
- [ ] Stop rule + retrieval protocol + enablement definition present
- [ ] Gate check passes: Quick + integrity; SKILL.md ≤ 21,000 B

**Tests**: harness gates
**Gate**: full

**Commit**: `feat(skills): add figma-wiring reference (FIGMA-01..08)`

---

### T3: Extract design-implementation reference; slim design workflow

**What**: TASK-003 — move `workflows/design.md` steps 5–13 direction set (Target Surface Packet, Evidence/Screenshot packets, mapping matrix, slice rules, verification/completion) into new `skills/massa-ai/references/design-implementation.md`; `workflows/design.md` keeps frontmatter (version bump), routing scope, project-context line, mutation paragraph, Isolation Gate line, session/recall/intake steps, and delegates the rest; add router line. Same commit so no transient cross-file duplication.
**Where**: `skills/massa-ai/references/design-implementation.md`, `skills/massa-ai/workflows/design.md` (+ one line in `skills/massa-ai/SKILL.md`)
**Depends on**: T2
**Reuses**: mobile-figma-matcher references (citations preserved verbatim)
**Requirement**: ABST-01, ABST-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Pre-edit evidence recorded before the extraction commit: dispatch-block count and validator-anchor count in `workflows/design.md` (expected 0 dispatch blocks — plan-critic F3), plus one pre-edit `skills-harness-integrity` run
- [ ] design.md invariant lines byte-unchanged (harness-contract green)
- [ ] No second normative copy (duplication excess ≤ ceiling, measured before/after)
- [ ] Gate check passes: Full

**Tests**: harness gates
**Gate**: full

**Commit**: `refactor(skills): extract design-implementation reference from design workflow (ABST-01)`

---

### T4: Add English-language rule to naming-standards

**What**: TASK-004 — add a `## Language` rule block to `references/naming-standards.md`: all new/renamed identifiers, classes, methods, screens, components, attributes, and implementation-facing artifact names in English; convert any non-English source term (Portuguese primary case) before implementing; public contracts/persisted names preserved per existing rule.
**Where**: `skills/massa-ai/references/naming-standards.md`
**Depends on**: None
**Reuses**: existing naming-standards Rules/Verification structure
**Requirement**: NAME-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Rule block present; existing public-contract clause untouched
- [ ] Gate check passes: Quick

**Tests**: harness gates
**Gate**: quick

**Commit**: `feat(skills): English-language naming rule (NAME-01)`

---

### T5: Extend workflow-harness-contract gate (committed observed-red)

**What**: TASK-005 — extend `scripts/__tests__/workflow-harness-contract.test.ts`: (a) reuse-scan action line present + byte-uniform across the 16 `IMPLEMENTATION_WORKFLOWS`; (b) literal `references/naming-standards.md` present in all 16; (c) the 3 new references exist on disk; (d) ordering assertions per design D11a — spec-driven's reuse-scan clause indexes after its Specify step and before its Design/Tasks decision steps, figma-pre-analysis's Stage 1 pointer indexes before its Stage 2 pointer, and each spec-driven phase-guide hook literal is present (plan-critic F1). Committed red-by-design for (a)/(b)/(d) — worktree-isolation-gate T2 precedent — with the observed-red counts recorded; (c) green from T1–T3. **Bounded lifetime (plan-critic F4): if the session cannot proceed to T6 immediately, complete T6 before ending the session or squash the two commits — the red-by-design state must not persist as a branch resting point.**
**Where**: `scripts/__tests__/workflow-harness-contract.test.ts`
**Depends on**: T1, T2, T3, T4
**Reuses**: existing Isolation Gate uniformity assertion structure in the same file
**Requirement**: GATE-01, GATE-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] New assertions fail with per-file precision (expected red ≈ 16 per-file + uniformity + 10 naming) — counts recorded
- [ ] All other suites green (`skills-duplication-metric`, `workflow-metadata-headers`, `skill-doc-paths`)

**Tests**: observed-red discipline
**Gate**: quick (red only in the new assertions, by design)

**Commit**: `test(scripts): harness-contract assertions for reuse-scan + naming loads (GATE-01, red until next commit)`

---

### T6: Insert reuse-scan line ×16 and naming bullets ×10; bump versions

**What**: TASK-006 — insert the byte-identical reuse-scan action line into all 16 implementation workflows at a position whose normalized neighbors are file-specific (never adjacent to the project-context/mutation/Isolation-Gate identical run — design D2); add the naming-standards load bullet to the 10 workflows missing it, adjacent to family-specific bullets; minor-bump `metadata.version` in all 16 edited files. First run the plan-critic F2 scratch measurement: place the line naively adjacent to the identical 3-run in 2–3 representative files in scratch, record the actual excess delta, revert; then apply the D2 placement. Measure duplication excess before/after (live baseline 226/483); if > 483, raise `EXCESS_CEILING` in this same commit with the documented attribution comment (design D7).
**Where**: the 16 `IMPLEMENTATION_WORKFLOWS` files (`skills/massa-ai/workflows/…`), possibly `scripts/__tests__/skills-duplication-metric.test.ts:70`
**Depends on**: T5
**Reuses**: Isolation Gate insertion precedent (16 files × uniform line, delta-0 placement)
**Requirement**: REUSE-02, NAME-02, GATE-03, GATE-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] T5 assertions green (sensor red→green observed across the two commits)
- [ ] Duplication excess reported before/after; ceiling untouched or raised-with-attribution
- [ ] Gate check passes: Quick, all 40 frontmatter valid

**Tests**: harness gates
**Gate**: quick

**Commit**: `feat(skills): mandatory reuse scan + naming-standards load across the 16 implementation workflows (REUSE-02, NAME-02)`

---

### T7: Spec-driven workflow — scan ordering + Figma enablement

**What**: TASK-007 — edit `workflows/spec-driven.md`: order the reuse scan after Specify closes and before the Design/Tasks decisions (steps 4–5 region), consuming `references/code-reuse-scan.md`; add the platform-neutral Figma-ingestion enablement clause (Figma links/node IDs supplied → lazily load `references/figma-pre-analysis.md`, `references/figma-wiring.md`, `references/design-implementation.md`; mobile targets keep the mobile-context intake gate); minor version bump.
**Where**: `skills/massa-ai/workflows/spec-driven.md`
**Depends on**: T6
**Reuses**: existing step-3 design-source gate line (extended, not duplicated)
**Requirement**: REUSE-03, FIGMA-01, ABST-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Scan ordering explicit (post-Specify, pre-Design/Tasks); lazy-load conditional explicit
- [ ] Gate check passes: Quick

**Tests**: harness gates
**Gate**: quick

**Commit**: `feat(skills): spec-driven reuse-scan ordering + Figma ingestion enablement (REUSE-03, FIGMA-01)`

---

### T8: Spec-driven phase guides — wiring, conversion, retrieval hooks

**What**: TASK-008 — one-line conditional hooks: `references/spec-driven/specify.md` (WHERE Figma ingestion enabled: wire spec items to figma file + Number per figma-wiring; English conversion before authoring), `references/spec-driven/design.md` (consume reuse map in Code Reuse Analysis; fill Design ID wiring column), `references/spec-driven/tasks.md` (consume reuse map; fill Task ID wiring column; unused-Number gate before presenting), `references/spec-driven/execute.md` (Figma-MCP retrieval per task's wired node IDs; English conversion guard).
**Where**: `skills/massa-ai/references/spec-driven/{specify,design,tasks,execute}.md`
**Depends on**: T7
**Reuses**: figma-wiring.md as the single normative copy (hooks point, never restate)
**Requirement**: REUSE-03, NAME-03, FIGMA-05, FIGMA-07, FIGMA-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Hooks are pointers (no restated tables/rules); load order dry-read passes
- [ ] Gate check passes: Quick

**Tests**: harness gates
**Gate**: quick

**Commit**: `feat(skills): spec-driven phase-guide hooks for Figma wiring + English conversion (FIGMA-05..08, NAME-03)`

---

### T9: Feature workflow — Figma enablement + scan ordering

**What**: TASK-009 — edit `workflows/feature.md`: platform-neutral Figma enablement clause + lazy loads (mirroring T7's conditional, pointer-shaped to avoid duplication windows), reuse-scan ordering before PR-group decomposition/implementation (steps 5/12 region), minor version bump.
**Where**: `skills/massa-ai/workflows/feature.md`
**Depends on**: T8
**Reuses**: existing step-4 mobile intake gate line (kept); figma-wiring.md pointers
**Requirement**: FIGMA-01, ABST-02, REUSE-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Enablement + lazy loads + scan ordering present; duplication delta measured
- [ ] Gate check passes: Quick

**Tests**: harness gates
**Gate**: quick

**Commit**: `feat(skills): feature workflow Figma ingestion + reuse-scan ordering (FIGMA-01)`

---

### T10: Figma pre-analysis — Stage 1/2 conditional pointers

**What**: TASK-010 — edit `references/figma-pre-analysis.md`: Stage 1 gains the conditional per-link file creation pointer (WHERE the parent is spec-driven/feature with Figma ingestion enabled → create `.specs/<type>/<slug>/figma/NN-<link-slug>.md` per figma-wiring); Stage 2 gains the wiring-table population pointer (fill Number/node-ids/Category/Explanation/Notes rows as retrieval completes). Audit/fix/design parent routes unaffected.
**Where**: `skills/massa-ai/references/figma-pre-analysis.md`
**Depends on**: T9
**Reuses**: figma-wiring.md as normative copy
**Requirement**: FIGMA-02, FIGMA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Pointers conditional on parent workflow + enablement; sequential-dispatch hard rule untouched
- [ ] Gate check passes: Quick

**Tests**: harness gates
**Gate**: quick

**Commit**: `feat(skills): figma-pre-analysis per-link file + wiring-table pointers (FIGMA-02..03)`

---

### T11: Figma wiring deterministic validator

**What**: TASK-011 — create `skills/massa-ai/scripts/validate_figma_wiring.ts` (design D11b, plan-critic F1): parses every wiring table under `.specs/<type>/<slug>/figma/*.md` for a named slug, prints the parsed population beside the verdict (never a bare verdict), exits non-zero when any Number row has all of Spec/Task/Design ID columns empty, and lists the unused rows. Add a unit test with a fixture (wired table passes, unwired row fails, zero-parsed-rows fails loudly). Point `references/figma-wiring.md`'s unused-Number stop rule at it as the deterministic backing with the standard no-code-execution-tool fallback clause.
**Where**: `skills/massa-ai/scripts/validate_figma_wiring.ts`, `scripts/__tests__/validate-figma-wiring.test.ts` (+ one pointer sentence in `skills/massa-ai/references/figma-wiring.md`)
**Depends on**: T10
**Reuses**: `skills/massa-ai/scripts/validate_{spec,design,tasks}.ts` structure and CLI shape
**Requirement**: FIGMA-07, GATE-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Fixture test: pass/fail/empty-population cases all observed (fail cases red before implementation complete or via deliberate fixture)
- [ ] figma-wiring.md names the script as deterministic backing
- [ ] Gate check passes: Quick + the new unit test

**Tests**: unit (fixture) + harness gates
**Gate**: quick

**Commit**: `feat(scripts): validate_figma_wiring deterministic backing (FIGMA-07)`

---

### T12: CHANGELOG + full gate run

**What**: TASK-012 — add `CHANGELOG.md` `[Unreleased]` `### Added` entry (reuse-scan mandate, English naming rule, Figma wiring for spec-driven/feature, design-workflow abstraction, wiring validator); run the Build gate (`bun run generate:artifacts && bun run test:scripts`) and record counts.
**Where**: `CHANGELOG.md`
**Depends on**: T11
**Reuses**: CONTRIBUTING CHANGELOG authoring rules
**Requirement**: GATE-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Entry present under `[Unreleased]` `### Added`
- [ ] Build gate green; suite counts recorded (no skip-ci literal anywhere in prose)

**Tests**: harness gates
**Gate**: build

**Commit**: `docs(changelog): workflow reuse-scan, English naming, Figma wiring entry`

---

### T13: Close-out — STATE, FEATURES, HANDOFF, AD-019

**What**: TASK-013 — append AD-019 to `.specs/project/STATE.md` `## Decisions` (class-wide directive shape per design D9); rotate STATE Current section (rename prior Current → Previous, prepend this feature — assert section count grew); register feature in `.specs/project/FEATURES.json`; update `.specs/HANDOFF.md`; run `bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-reuse-naming-figma --root .` and `validate_state`.
**Where**: `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, `.specs/HANDOFF.md`
**Depends on**: T12
**Reuses**: STATE rotation precedent (HANDOFF rotation lesson: rename-first, then prepend)
**Requirement**: GATE-02, PROC-01 (setup)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] check_specs_delivered exit 0; validate_state exit 0
- [ ] AD-019 appended; registry row added; HANDOFF rotated correctly

**Tests**: deterministic validators
**Gate**: build

**Commit**: `docs(specs): close out workflow-reuse-naming-figma (STATE, FEATURES, HANDOFF, AD-019)`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6
Phase 2:  T7 ──→ T8 ──→ T9 ──→ T10 ──→ T11 ──→ T12 ──→ T13
```

Execution is strictly sequential — no intra-phase parallelism. T5 is committed red-by-design in its new assertions only; T6 restores green (observed red→green across adjacent commits).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: code-reuse-scan ref | 1 file + 1 router line | ✅ Granular |
| T2: figma-wiring ref | 1 file + 1 router line | ✅ Granular |
| T3: design extraction | 2 files (atomic move — split would create transient duplication) | ✅ Cohesive |
| T4: naming rule | 1 file | ✅ Granular |
| T5: sensor extension | 1 test file | ✅ Granular |
| T6: 16-file insertion | 16 files, one mechanical uniform deliverable (Isolation Gate precedent) | ✅ Cohesive |
| T7: spec-driven workflow | 1 file | ✅ Granular |
| T8: 4 phase-guide hooks | 4 files, one hook set (pointers only) | ✅ Cohesive |
| T9: feature workflow | 1 file | ✅ Granular |
| T10: figma-pre-analysis | 1 file | ✅ Granular |
| T11: wiring validator | 1 script + 1 test + 1 pointer sentence | ✅ Cohesive |
| T12: CHANGELOG | 1 file + gate run | ✅ Granular |
| T13: close-out | 3 spec-state files | ✅ Cohesive |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | start of Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None (runs after T3 in sequence) | T3 → T4 (sequence, not dependency) | ✅ Match |
| T5 | T1, T2, T3, T4 | T4 → T5 (all prior in-phase) | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | Phase 1 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | skill markdown | harness gates | harness gates | ✅ OK |
| T2 | skill markdown | harness gates | harness gates | ✅ OK |
| T3 | skill markdown | harness gates | harness gates | ✅ OK |
| T4 | skill markdown | harness gates | harness gates | ✅ OK |
| T5 | sensor extension | observed-red discipline | observed-red discipline | ✅ OK |
| T6 | skill markdown | harness gates | harness gates | ✅ OK |
| T7 | skill markdown | harness gates | harness gates | ✅ OK |
| T8 | skill markdown | harness gates | harness gates | ✅ OK |
| T9 | skill markdown | harness gates | harness gates | ✅ OK |
| T10 | skill markdown | harness gates | harness gates | ✅ OK |
| T11 | gate script + unit test | unit (fixture) | unit (fixture) + harness gates | ✅ OK |
| T12 | changelog (docs) | harness gates (build) | harness gates | ✅ OK |
| T13 | spec artifacts | deterministic validators | deterministic validators | ✅ OK |

## MCP And Skill Question

No MCP materially changes implementation or verification: all edits are local markdown + one test file; gates are repo scripts. Figma MCP is a *subject* of the prose, not a tool for authoring it. massa-ai index tools unnecessary (all target files already enumerated by direct evidence). Selected answer: filesystem tools + repo gate scripts only — confirm at approval.

## Artifact-Store Evidence

- Artifact: `.specs/features/workflow-reuse-naming-figma/tasks.md` · version 1 (initial) · validate_tasks run recorded after write.
