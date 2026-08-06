# PR Review Workflow Tasks

Slug: `pr-review-workflow` · Session: `spec-pr-review-workflow` ·
Plan: `2 Phases = 6 Tasks` · Branch: `spec/pr-review-workflow` (from origin/main v1.29.0)

Sub-agent offer disposition: plan exceeds 3 Tasks, but execution is inline in the main
agent — the work is one dominant prose file with sequential single-file dependencies
(T1→T2 edit the same harness surface; T3–T5 are integer edits + gate runs), so a batch
worker adds handoff overhead without parallelism. Recorded as the offer's declined
default for an unattended session.

## Execution Plan

### Phase 1 — Authoring (1 Phase = 4 Tasks)

T1 T2 T3 T4

Sequential: T2 registers the file T1 creates; T3's count edits go red until T1 exists
(observed-red ordering is deliberate: run the two count suites before T3 to see the
38-lock fail, then after to see 39 pass).

### Phase 2 — Gates and state (1 Phase = 2 Tasks)

T5 T6

T5 depends on all of Phase 1; T6 is the delivery/state close-out plus independent
validation.

## Test Coverage Matrix

| Requirement | Verified by | Sensor |
| --- | --- | --- |
| PRW-01a | WMH gate over new file | `bun test scripts/__tests__/workflow-metadata-headers.test.ts` (39 population, parse clean) |
| PRW-01b | intake + read-only complement | `bun test scripts/__tests__/workflow-harness-contract.test.ts` (intake test + complement 23) |
| PRW-01c | attribution literal | `grep -c "augusto-dmh" skills/massa-ai/workflows/pr-review.md` → ≥1 |
| PRW-02a | router row + precedence clause | `grep -n "pr-review" skills/massa-ai/SKILL.md` → table row + tier-3 clause |
| PRW-02b | byte ceiling | `wc -c skills/massa-ai/SKILL.md` ≤ 21000 + `bun test scripts/__tests__/skill-size-budgets.test.ts` |
| PRW-03a/b, PRW-04a/c, PRW-05a/c/d, PRW-06a–e, PRW-08a/b, PRW-10a/b | shipped prose contract | clause-by-clause read of `workflows/pr-review.md` against spec (validation.md records each) |
| PRW-04b | citations recorded | design.md D1 citation block exists (this artifact) |
| PRW-05b | dispatch gates | `bun test scripts/__tests__/skills-harness-integrity.test.ts` (resolution + persona-emission over 6 new blocks) |
| PRW-07a/b/c | prose contract + references resolve | clause read + `bun scripts/check-skill-doc-paths.ts` |
| PRW-09a | count locks | both count suites green at 39/23 |
| PRW-09b | regen + parity | `bun run generate:artifacts && bun scripts/generate-skill-artifacts.ts --check`; parity + duplication + size suites |
| PRW-09c | changelog | `grep -n "pr-review" CHANGELOG.md` under `[Unreleased]` `### Added` |

## Gate Check Commands

```bash
bun skills/massa-ai/scripts/validate_spec.ts pr-review-workflow --root .
bun skills/massa-ai/scripts/validate_design.ts pr-review-workflow --root .
bun skills/massa-ai/scripts/validate_tasks.ts pr-review-workflow --root .
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
bun skills/massa-ai/scripts/check_specs_delivered.ts pr-review-workflow --root .
```

## Task Breakdown

### T1: Author workflows/pr-review.md

- [ ] Requirement: PRW-01, PRW-03, PRW-04, PRW-05, PRW-06, PRW-07, PRW-08, PRW-10
- [ ] Create `skills/massa-ai/workflows/pr-review.md` per design D1–D5: WMH
      frontmatter (CC-BY-4.0, version 1.0.0, quoted single-line description);
      attribution line; intake line (`references/project-context.md`); host
      detection order + dual-fail stop; verbatim host command map (D1 table);
      six dispatch blocks (audit-specialist ×5 by lens, reviewer ×1) copied
      structurally from `tests-audit.md`'s block including the persona clause;
      two-wave dispatch plan; universal rules (added-line anchoring, ±3 dedupe,
      [RESOLVED] replies, 80% confidence, comment-only + forbidden commands,
      marker + no attribution, file-body posting); orchestrator-posts channel
      discipline; requirements Tracks A/B with `.specs/` integration;
      DISCOVERY MAP + INDEX row; consolidation summary format; graceful
      degradation; Evidence Gate close.
- [ ] Sensor: file exists; no `implementation-delivery` path string in it.
Where: skills/massa-ai/workflows/pr-review.md
Tests: `grep -c "augusto-dmh"` ≥1; `grep -c "references/project-context.md"` = 1; `grep -c "implementation-delivery" skills/massa-ai/workflows/pr-review.md` → 0
Gate: WMH + harness-contract suites still red at count 38 (expected until T3); frontmatter parses via `bun -e "Bun.YAML.parse(...)"`; commit.
- Depends on: —

### T2: Register route in SKILL.md

- [ ] Requirement: PRW-02
- [ ] Add router-table row (`pr-review` | hosted PR/MR review with posted findings |
      `workflows/pr-review.md`) after `judge-with-debate`; add tier-3 target-type
      clause: hosted PR/MR reference (number/URL) → `pr-review`, local working
      diff stays with audit routes.
- [ ] Sensor: byte ceiling.
Where: skills/massa-ai/SKILL.md
Tests: `grep -n "pr-review" skills/massa-ai/SKILL.md` (2 sites); `wc -c` ≤ 21000
Gate: `bun test scripts/__tests__/skill-size-budgets.test.ts` green; commit.
- Depends on: T1

### T3: Count-lock edits

- [ ] Requirement: PRW-09a
- [ ] `EXPECTED_WORKFLOW_COUNT` 38→39 in `workflow-harness-contract.test.ts` and
      `workflow-metadata-headers.test.ts`; complement literal 22→23 (assertion
      text "exactly 22" → "exactly 23") in the former.
- [ ] Sensor: observed red→green (run both suites before and after the edit).
Where: scripts/__tests__/workflow-harness-contract.test.ts, scripts/__tests__/workflow-metadata-headers.test.ts
Tests: both suites green post-edit
Gate: `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/workflow-metadata-headers.test.ts` exit 0; commit.
- Depends on: T1

### T4: CHANGELOG entry

- [ ] Requirement: PRW-09c
- [ ] `[Unreleased]` → `### Added`: pr-review workflow, six-dimension hosted
      PR/MR review, GitHub `gh` + GitLab `glab`, roster dispatches, router row.
Where: CHANGELOG.md
Tests: `grep -A6 "Unreleased" CHANGELOG.md` shows the entry
Gate: CHANGELOG merge gate satisfied (entry present, no `no-changelog` label); commit.
- Depends on: T1

### T5: Regenerate bundles + full gate matrix

- [ ] Requirement: PRW-09b
- [ ] `bun run generate:artifacts`; run every command in Gate Check Commands
      (excluding check_specs_delivered, which is T6's); fix anything red
      without weakening a gate (fix the subject, not the gate).
- [ ] Sensor: parity `--check` exit 0; integrity dispatch gates parse 6 new
      blocks; duplication ≤ ceiling; lint 0; `bun run test:scripts` exit 0.
- [ ] Live read-only dry run (Plan Challenge F2): run the map's read-only GitHub
      commands against a real PR of this repo, capture output for validation.md;
      glab side skipped-with-reason (`glab` not installed in this environment,
      measured 2026-08-05) — doc-verified only, follow-up evidence audit noted.
Where: apps/*-plugin/skills/ (generated, untracked), no source edits expected
Tests: all Gate Check Commands rows exit 0
Gate: full matrix green; commit any needed repairs atomically.
- Depends on: T1, T2, T3, T4

### T6: State artifacts + independent validation

- [ ] Requirement: PRW-09 (delivery evidence), all PRW prose ACs
- [ ] Update `.specs/project/STATE.md` (new Current block, rotate prior to
      Previous), `.specs/project/FEATURES.json` (new entry, active_feature),
      `.specs/HANDOFF.md` (rename-to-Previous first, then prepend — rotation
      lesson); run `check_specs_delivered`; dispatch `massa-ai-verification-agent`
      (author ≠ verifier) per `references/spec-driven/validate.md` → writes
      `.specs/features/pr-review-workflow/validation.md`; fix loop ≤3.
- [ ] Sensor: `check_specs_delivered` exit 0; validation.md verdict recorded.
Where: .specs/project/STATE.md, .specs/project/FEATURES.json, .specs/HANDOFF.md, .specs/features/pr-review-workflow/validation.md
Tests: `bun skills/massa-ai/scripts/check_specs_delivered.ts pr-review-workflow --root .` exit 0; `bun skills/massa-ai/scripts/validate_state.ts --root .` exit 0
Gate: validation PASS (or Blocked with evidence); commit.
- Depends on: T5
