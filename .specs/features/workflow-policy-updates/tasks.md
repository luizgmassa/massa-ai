# Workflow Policy Updates — Tasks

2 Phases = 5 Tasks. Phase 1 = 4 Tasks, Phase 2 = 1 Task. Phases run sequentially;
tasks within a phase run in order. One atomic commit per task; each Phase-1 task
includes its bundle regeneration (D5) in the same commit.

## Gate Check Commands

Per Phase-1 task: `bun scripts/generate-skill-artifacts.ts && bun scripts/generate-skill-artifacts.ts --check` (exit 0) and `bun run lint` (exit 0).
Phase 2 adds: `bun run test:scripts` (all pass; includes `skill-artifact-parity.test.ts`), `bun skills/massa-ai/scripts/validate_spec.ts --root . workflow-policy-updates` and `validate_tasks.ts` equivalents (0 errors), `bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-policy-updates --root .` before PR.

## Phase 1: Policy source edits (4 Tasks)

- [ ] **T1 (WFP-04, WFP-05):** `skills/massa-ai/SKILL.md` — two Core Contract bullets
  (abbreviation expansion; Phase/Task vocabulary with `1 Phase = X Tasks` /
  `Y Phases = Z Tasks` forms). `workflows/spec-driven.md` — reword sub-agent offer
  "batch" prose to Phase/Task vocabulary (D6), semantics unchanged.
  Test (literal, F3/F4): `grep -c "1 Phase = X Tasks" skills/massa-ai/SKILL.md` == 1;
  `grep -c "abbreviation" skills/massa-ai/SKILL.md` >= 1;
  `grep -n "batch" skills/massa-ai/workflows/spec-driven.md` → print full population;
  expected residual: verb-form "batch tasks" (atomic-commit rule) only — zero
  unit-noun "batch" for worker/task groups. Regen `--check` green.
- [ ] **T2 (WFP-02):** `references/implementation-delivery.md` — "PR description stays
  current" subsection in the chain (after Stage 4) + Anti-Patterns bullet.
  Test: grep single normative copy; lint + regen `--check` green.
- [ ] **T3 (WFP-01):** `references/mobile-context.md` — Compose Screen Previews rule
  (`@Preview` for every created/updated screen-level composable, Android Compose +
  KMP Compose Multiplatform, previews are protected validation assets);
  `references/mobile-diagnosis.md` — one pointer line.
  Test: grep normative copy count == 1 (mobile-context), pointer present; gates green.
- [ ] **T4 (WFP-03):** new `references/figma-pre-analysis.md` (two-stage protocol per
  D3); wire load+step into `workflows/design.md`, `workflows/mobile-figma/
  mobile-figma-audit.md`, `workflows/mobile-figma/mobile-figma-fix.md`,
  `workflows/spec-driven.md` (design-source gate), `workflows/feature.md`
  (design-source gate); add to SKILL.md Shared References list.
  Wiring is a load-pointer sentence in each workflow's **local** gate line/block only
  (F2) — never in `references/mobile-context.md`.
  Test (literal, F1/F2/F4):
  `grep -c "figma-pre-analysis" skills/massa-ai/workflows/design.md workflows/mobile-figma/mobile-figma-audit.md workflows/mobile-figma/mobile-figma-fix.md workflows/spec-driven.md workflows/feature.md` — each > 0;
  `grep -c "figma-pre-analysis" skills/massa-ai/references/mobile-context.md` == 0;
  `grep -rl "proposes a partition\|never parallel" skills/massa-ai/` → only
  `references/figma-pre-analysis.md` (protocol lives once);
  SKILL.md Shared References lists the file; gates green.

## Phase 2: Delivery close-out (1 Task)

- [ ] **T5:** CHANGELOG entry under `[Unreleased]`; mark tasks `[x]`; update
  `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, `.specs/HANDOFF.md`;
  full gates (`test:scripts`, lint, regen `--check`, spec validators,
  `check_specs_delivered`); push; PR; per WFP-02 update PR description after any
  further requested push.

## Test Coverage Matrix

| Requirement | Sensor |
|---|---|
| WFP-01 | grep normative rule in mobile-context.md == 1 copy; pointer in mobile-diagnosis.md |
| WFP-02 | grep rule + anti-pattern in implementation-delivery.md; no copy elsewhere |
| WFP-03 | reference exists; 5 workflow wirings + router listing; sequential/never-parallel wording |
| WFP-04 | Core Contract bullet present |
| WFP-05 | Core Contract bullet present; spec-driven offer vocabulary aligned |
| All | `generate-skill-artifacts.ts --check` 0; `skill-artifact-parity.test.ts` pass; lint 0; `test:scripts` all pass |

## Phase Execution Map

Phase 1: T1 → T2 → T3 → T4
Phase 2: T5
