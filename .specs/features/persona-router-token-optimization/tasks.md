# Persona Router Token Optimization — Tasks

Spec: `./spec.md` (PRT-01..09) · Design: `./design.md` (C1–C13) · Branch:
`spec/persona-router-token-optimization`, worktree
`.claude/worktrees/persona-router-token-optimization`, cut from `main`.

2 Phases = 10 Tasks (Phase 1 = 7 Tasks, Phase 2 = 3 Tasks).

## Execution Plan

Sequential inline execution T0→T9 (see sub-agent offer decision in STATE.md).
T4 may run after T2 in parallel with T3 conceptually, but bundle regeneration
serializes commits — executed strictly in order. T7 runs after T5; T8 after T6;
T9 last.

## Task Breakdown

### Phase 1 — Repo artifacts and gates

T0 T1 T2 T3 T4 T5 T6

### Phase 2 — Machine dedupe and delivery

T7 T8 T9

---

### T0: Activate feature (branch + registry)

Create branch/worktree; register feature in `.specs/project/FEATURES.json`
(status `in_progress`, `active_feature`) + STATE.md Current section. Atomic
activation commit.

Tests: none — registry activation only (coverage matrix: no PRT row)
Depends on: —
Gate: `git log -1` shows activation commit; FEATURES.json parses.

### T1: Author size-budget gate; observe red (C8; PRT-07)

Write `scripts/__tests__/skill-size-budgets.test.ts` (budget map per design;
population print; empty-glob failure). Run against the pre-slim tree and
record the red output verbatim (expected: SKILL.md 13,316 > 5,000; catalog
8,871 > 2,500; 4 prompts > 4,500). **Commit deferred to T6** — committing a red
gate would break the branch; the red observation is this task's deliverable
(recorded deviation from one-commit-per-task).

Tests: `skill-size-budgets.test.ts` authored here; red run is the evidence
Depends on: T0
Gate: red run output captured with per-file figures (PRT-07 AC2).

### T2: Catalog v2 + signals split + gate repoint (C3, C4, C13; PRT-04)

`catalog.json` → schema_version 2 index (≤2,500 B); create
`personas/signals/<id>.json` ×5 with v1 arrays verbatim; update
`validate-repository.test.ts` v1 assertions → v2 (schema, field list,
signals-file existence + arrays). Pre-land sweep:
`grep -rn "primary_signals\|schema_version" skills/ scripts/` — every hit
dispositioned. Regenerate bundles. One commit.

Tests: `validate-repository.test.ts` (repointed v2 assertions), `skill-artifact-parity.test.ts`
Depends on: T1 (red baseline uses pre-slim tree)
Gate: `bun test scripts/__tests__/validate-repository.test.ts` green;
  `bun scripts/generate-skill-artifacts.ts --check` green; signals diff-equal
  to v1 arrays.

### T3: SKILL.md rewrite + routing-details reference (C1, C2; PRT-02/03/06)

Slim `skills/persona-router/SKILL.md` ≤5,000 B: pin fast path, route-memory
fast path, v2 catalog validation, compressed workflow; retain the 6
gate-anchored sentences in their named sections + `massa-ai/personas/catalog.json`
literal; frontmatter untouched. Create `references/routing-details.md` with load
conditions. Widen `AUTHORITY_SCANNED_FILES` with seeded-red proof (temporary
grant sentence in the new file must fail, then removed). Regenerate. One commit.

Tests: `skills-harness-integrity.test.ts` (anchors + widened authority scan, seeded red)
Depends on: T2 (SKILL.md text references v2 shape)
Gate: `bun test scripts/__tests__/skills-harness-integrity.test.ts` green;
  seeded-red observed; `wc -c` ≤ 5,000.

### T4: Compress five persona prompts (C5; PRT-05)

Each `personas/*.md` prompt ≤4,500 B, original top-level themes retained
(checklist per prompt in commit body). README untouched. Regenerate. One commit.

Tests: `skill-size-budgets.test.ts` prompt budgets (green at T6)
Depends on: T2
Gate: `wc -c` per prompt ≤4,500; theme checklist complete.

### T5: Pin policy + repo pin (C6, C7; PRT-02)

`skills/AGENTS.md` bootstrap block: `persona_pin` documentation + route-memory
note (single `persona_router:` declaration preserved). Root `AGENTS.md`:
`## Persona Pin` + `persona_pin: context-skill-harness-engineer-architect`.
Regenerate. One commit.

Tests: `skills-harness-integrity.test.ts` policy single-source tests
Depends on: T3 (SKILL.md fast path defines what the policy documents)
Gate: integrity policy-single-source tests green; pin line present.

### T6: Land green size gate + double-surface probe + CHANGELOG (C8, C9, C12; PRT-07/08/09)

Commit `skill-size-budgets.test.ts` (now green — quote T1 red evidence in the
commit body). Add `--check` double-surface probe to `scripts/install-skills.sh`
+ `scripts/tests/test-skills-check-double-surface.sh` (fixture TARGET_HOMEs:
both-surfaces → exit 1 naming surfaces; single-surface / missing-key → exit 0).
CHANGELOG `[Unreleased]` entries. One commit (or two: gate, then probe —
executor's call, both atomic).

Tests: `skill-size-budgets.test.ts` green; `scripts/tests/test-skills-check-double-surface.sh` both polarities
Depends on: T3, T4 (budgets green); T0 (installer file)
Gate: `bun run test:scripts` green; shell suite both polarities observed;
  `bun run lint` green.

### T7: User-machine dedupe (C11; PRT-01) — order load-bearing (F1)

(1) `MASSA_AI_SKIP_PLUGIN_REGISTRY=1 bash scripts/install-skills.sh --apply`
(+ agents/commands installer path, same suppression) → 17-agent roster,
current commands. (2) `rm` broken symlinks. (3) LAST: disable
`massa-ai@massa-ai` in `~/.claude/settings.json` `enabledPlugins` +
`installed_plugins.json` alignment (read-before-write; evidence quotes
`enabledPlugins`/`hooks` keys only — F4). (4) Falsifying 3-file re-check.
No repo commit; evidence into validation.md draft.

Tests: none — machine mutation; falsifying 3-file re-check is the sensor
Depends on: T2–T5 (installs copy current artifacts)
Gate: PRT-01 AC1–5 evidence recorded, redacted.

### T8: Full gate sweep + PR

`bun run test:scripts`, `bun run lint`,
`bun scripts/generate-skill-artifacts.ts --check`, `bun run test:plugins`
(bundles changed). Push branch, open PR (CHANGELOG present → no label needed).

Tests: full `bun run test:scripts` + `bun run test:plugins` aggregate
Depends on: T6 (T7 parallel-safe)
Gate: all four commands exit 0; PR open; CI watched to green.

### T9: Independent validation (author ≠ verifier)

Dispatch `massa-ai-verification-agent` per workflow: spec-anchored outcome
check + discrimination sensor over the delivered gates (size budgets,
double-surface probe, integrity anchors). Restart-gated PRT-02 walkthrough
recorded as pending-restart if same-session (F6). Write
`.specs/features/<slug>/validation.md`; update FEATURES.json/STATE.md/HANDOFF.md.

Tests: verification-agent discrimination sensor (mutations vs delivered gates)
Depends on: T7, T8
Gate: validation.md PASS or fix-loop (≤3 iterations).

---

## Test Coverage Matrix

| PRT | Covered by |
| --- | --- |
| PRT-01 | T7 evidence (AC1–5) |
| PRT-02 | T3 (fast path) + T5 (pin) + T9 walkthrough (restart-gated) |
| PRT-03 | T3 + T1/T6 gate |
| PRT-04 | T2 + T1/T6 gate + repointed validate-repository assertions |
| PRT-05 | T4 + T1/T6 gate |
| PRT-06 | T3 contract text (MCP down: documented-contract verification per spec assumption) |
| PRT-07 | T1 red + T6 green + population print |
| PRT-08 | T6 shell suite (both polarities) |
| PRT-09 | T2–T6 per-task regen + T8 sweep |

## Gate Check Commands

```bash
bun test scripts/__tests__/skill-size-budgets.test.ts
bun test scripts/__tests__/skills-harness-integrity.test.ts
bun test scripts/__tests__/validate-repository.test.ts
bun test scripts/__tests__/skill-artifact-parity.test.ts
bash scripts/tests/test-skills-check-double-surface.sh
bun scripts/generate-skill-artifacts.ts --check
bun run test:scripts && bun run lint && bun run test:plugins
```
