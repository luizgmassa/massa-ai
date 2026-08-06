# Discovery Workflow Tasks

Slug: `discovery-workflow` · Session: `spec-discovery-workflow` ·
Plan: `2 Phases = 6 Tasks` · Branch: `spec/discovery-workflow` (stacked on
`spec/pr-review-workflow` @ `975a020d`)

Sub-agent offer disposition: plan exceeds 3 Tasks, but execution is inline in the
main agent — one dominant prose file with sequential single-surface dependencies
(T1→T2 edit the same harness surface; T3–T5 are integer edits + gate runs), so a
batch worker adds handoff overhead without parallelism. Same declined default as
pr-review-workflow, recorded for an unattended session.

Delivery note (Plan Challenge F1): the base branch `spec/pr-review-workflow` has
no remote and no PR (measured 2026-08-05). Discovery's eventual PR must target
`base=spec/pr-review-workflow`, or wait until that feature merges to main and
retarget. Push and PR creation for both branches remain the user's decision —
not taken unattended.

## Execution Plan

### Phase 1 — Authoring (1 Phase = 4 Tasks)

T1 T2 T3 T4

Sequential: T2 registers the file T1 creates; T3's count edits go red until T1
exists (observed-red ordering: run both count suites before T3 to see the 39-lock
fail, then after to see 40 pass).

```
T1 -> T2 -> T3 -> T4
```

### Phase 2 — Gates and state (1 Phase = 2 Tasks)

T5 T6

T5 depends on all of Phase 1; T6 is the delivery/state close-out plus independent
validation.

```
T4 -> T5 -> T6
```

## Test Coverage Matrix

| Requirement | Verified by | Sensor |
| --- | --- | --- |
| DSC-01 (frontmatter, population) | WMH gate over new file | `bun test scripts/__tests__/workflow-metadata-headers.test.ts` (40 population, parse clean) |
| DSC-01 AC1/AC2 (intake, complement) | harness contract | `bun test scripts/__tests__/workflow-harness-contract.test.ts` (intake test + complement 24) |
| DSC-01 AC3 (provenance) | literal | `grep -c "product-brainstorming" skills/massa-ai/workflows/discovery.md` ≥ 1 |
| DSC-02 AC1 (row + clause) | grep | `grep -n "discovery" skills/massa-ai/SKILL.md` → table row + tier-4 clause |
| DSC-02 AC2 (ceiling) | byte count | `wc -c skills/massa-ai/SKILL.md` ≤ 21000 + `bun test scripts/__tests__/skill-size-budgets.test.ts` |
| DSC-03..DSC-07 | shipped prose contract | clause-by-clause read of `workflows/discovery.md` against spec (validation.md records each) |
| DSC-08 (to-prd handoff) | literal + clause read | `grep -c "to-prd" skills/massa-ai/workflows/discovery.md` ≥ 2 (name + path) |
| DSC-09 AC1 (count locks) | observed red→green | both count suites green at 40/24 |
| DSC-09 AC2 (regen + parity) | gates | `bun run generate:artifacts && bun scripts/generate-skill-artifacts.ts --check`; parity + duplication + size + integrity suites |
| DSC-09 AC3 (changelog) | grep | `grep -n "discovery" CHANGELOG.md` under `[Unreleased]` `### Added` |

## Gate Check Commands

```bash
bun skills/massa-ai/scripts/validate_spec.ts discovery-workflow --root .
bun skills/massa-ai/scripts/validate_design.ts discovery-workflow --root .
bun skills/massa-ai/scripts/validate_tasks.ts discovery-workflow --root .
bun run generate:artifacts && bun scripts/generate-skill-artifacts.ts --check
bun test scripts/__tests__/workflow-harness-contract.test.ts
bun test scripts/__tests__/workflow-metadata-headers.test.ts
bun test scripts/__tests__/skills-harness-integrity.test.ts
bun test scripts/__tests__/skill-size-budgets.test.ts
bun test scripts/__tests__/skills-duplication-metric.test.ts
bun test scripts/__tests__/skill-artifact-parity.test.ts
bun scripts/check-skill-doc-paths.ts
bun run lint
bun run test:scripts
bun skills/massa-ai/scripts/check_specs_delivered.ts discovery-workflow --root .
```

## Task Breakdown

### T1: Author workflows/discovery.md

- [ ] Requirement: DSC-01, DSC-03, DSC-04, DSC-05, DSC-06, DSC-07, DSC-08
- [ ] Create `skills/massa-ai/workflows/discovery.md` per design D1–D6: WMH
      frontmatter (Apache-2.0, version "1.0.0", quoted single-line
      description); attribution line (product-brainstorming skill,
      anthropics/knowledge-work-plugins, Apache-2.0); intake line
      (`references/project-context.md`); four modes; seven frameworks +
      no-framework-dumping rule; Frame→Diverge→Provoke→Converge→Capture with
      mandatory Capture outputs; Do/Do-Not conduct + six anti-patterns;
      massa-ai session/memory binding (D6); mandatory to-prd offer with
      accept/decline branches (D4); graceful degradation; Evidence Gate close.
- [ ] Sensor: file exists; no `implementation-delivery` path string in it.
Where: skills/massa-ai/workflows/discovery.md
Tests: `grep -c "knowledge-work-plugins"` ≥ 1; `grep -c "references/project-context.md"` = 1; `grep -c "implementation-delivery" skills/massa-ai/workflows/discovery.md` → 0; `grep -c "to-prd"` ≥ 2
Gate: WMH + harness-contract suites still red at count 39 (expected until T3); frontmatter parses via `bun -e "Bun.YAML.parse(...)"`; commit.
Depends on: —

### T2: Register route in SKILL.md

- [ ] Requirement: DSC-02
- [ ] Add router-table row (`discovery` | product brainstorming / problem-space
      thinking partner | `workflows/discovery.md`) before `to-prd`; add tier-4
      primary-verb clause: brainstorm/explore a product problem, idea, or
      direction with no concrete code target → `discovery` (codebase
      understanding stays `exploration`).
- [ ] Sensor: byte ceiling.
Where: skills/massa-ai/SKILL.md
Tests: `grep -n "discovery" skills/massa-ai/SKILL.md` (row + clause); `wc -c` ≤ 21000
Gate: `bun test scripts/__tests__/skill-size-budgets.test.ts` green; commit.
Depends on: T1

### T3: Count-lock edits

- [ ] Requirement: DSC-09 AC1
- [ ] `EXPECTED_WORKFLOW_COUNT` 39→40 in `workflow-harness-contract.test.ts` and
      `workflow-metadata-headers.test.ts`; complement literal 23→24 (assertion
      text "exactly 23" → "exactly 24" and `toBe(23)` → `toBe(24)`) in the
      former.
- [ ] Sensor: observed red→green (run both suites before and after the edit).
Where: scripts/__tests__/workflow-harness-contract.test.ts, scripts/__tests__/workflow-metadata-headers.test.ts
Tests: both suites green post-edit
Gate: `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/workflow-metadata-headers.test.ts` exit 0; commit.
Depends on: T1

### T4: CHANGELOG entry

- [ ] Requirement: DSC-09 AC3
- [ ] `[Unreleased]` → `### Added`: discovery workflow — product brainstorming
      thinking partner (modes, frameworks, session rhythm), to-prd handoff
      offer, router row.
Where: CHANGELOG.md
Tests: `grep -A8 "Unreleased" CHANGELOG.md` shows the entry
Gate: CHANGELOG merge gate satisfied (entry present, no `no-changelog` label); commit.
Depends on: T1

### T5: Regenerate bundles + full gate matrix

- [ ] Requirement: DSC-09 AC2
- [ ] `bun run generate:artifacts`; run every command in Gate Check Commands
      (excluding check_specs_delivered, which is T6's); fix anything red without
      weakening a gate (fix the subject, not the gate).
- [ ] Sensor: parity `--check` exit 0; duplication ≤ ceiling; lint 0;
      `bun run test:scripts` exit 0 modulo the documented `.claude/worktrees/`
      needle-anchor contamination class (CI authoritative).
Where: apps/*-plugin/skills/ (generated, untracked), no source edits expected
Tests: all Gate Check Commands rows exit 0 (modulo documented contamination class)
Gate: full matrix green; commit any needed repairs atomically.
Depends on: T2, T3, T4

### T6: State artifacts + independent validation

- [ ] Requirement: DSC-09 (delivery evidence), all DSC prose ACs
- [ ] Update `.specs/project/STATE.md` (new Current block, rotate prior to
      Previous), `.specs/project/FEATURES.json` (new entry, active_feature),
      `.specs/HANDOFF.md` (rename-to-Previous first, then prepend — rotation
      lesson); run `check_specs_delivered`; dispatch
      `massa-ai-verification-agent` (author ≠ verifier) per
      `references/spec-driven/validate.md` → writes
      `.specs/features/discovery-workflow/validation.md`; fix loop ≤ 3.
- [ ] Sensor: `check_specs_delivered` exit 0; validation.md verdict recorded.
Where: .specs/project/STATE.md, .specs/project/FEATURES.json, .specs/HANDOFF.md, .specs/features/discovery-workflow/validation.md
Tests: `bun skills/massa-ai/scripts/check_specs_delivered.ts discovery-workflow --root .` exit 0; `bun skills/massa-ai/scripts/validate_state.ts --root .` adds no new errors vs the branch baseline (51 pre-existing on origin/main measured 2026-08-05; this feature contributes 0)
Gate: validation PASS (or Blocked with evidence); commit.
Depends on: T5
