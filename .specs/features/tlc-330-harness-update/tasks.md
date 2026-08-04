# TLC 3.3.0 Harness Update — Tasks

- **Feature:** `tlc-330-harness-update`. Spec: `spec.md`. Design: `design.md`.
- 18 tasks, 3 phases. One atomic commit per task; task status closed in this file **before** each commit, same commit (dogfoods SYNC-04 from the first task).

## Execution Plan

### Phase Execution Map

```
Phase 1: T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6
Phase 2: T7 ──→ T8 ──→ T9 ──→ T10 ──→ T11 ──→ T12 ──→ T13 ──→ T14 ──→ T15
Phase 3: T16 ──→ T17 ──→ T18
Phase 4: FT1 ──→ FT2
Phase 5: T19 ──→ T20 ──→ T21 ──→ T22
Phase 6: FT3 ──→ FT4 ──→ FT5
```

Phase 2 depends on Phase 1 (prose wires scripts that must exist). Phase 3 depends on Phase 2 (regeneration snapshots final prose).

## Test Coverage Matrix

| Task | Requirement | Test |
|---|---|---|
| T1 | SYNC-01 AC1 | `spec-driven-validators.test.ts`: filled fixture exits 0; missing-section + SHALL-less-AC fixtures exit 1 |
| T2 | SYNC-01 AC2 | missing-Gate + forward-phase-dep fixtures exit 1, task named |
| T3 | SYNC-01 AC3 | valid header 0; bad type 1; `[SA-142] feat(x): y` 0 |
| T4 | SYNC-01 AC4 | missing/FAIL/placeholder/no-evidence validation.md fixtures exit 1; legacy-shaped fixture no-crash |
| T5 | SYNC-10 AC1 | `selftest` exits 0; diacritic merge + non-Latin non-collision asserted |
| T6 | GATE-02 AC1-2 | dirty/untracked/absent-artifact fixtures exit 1 with paths; clean+tracked exits 0 with population |
| T7-T15 | SYNC-02..09,12,13; BATCH-01 AC1; GATE-01,03; SYNC-05 | content-identity sweeps: new rule present, old phrasing population = 0 (per task) |
| T16 | SYNC-11 AC1 | both parity suites green; regenerated verifier artifacts resolve `deep`; both `--check` gates clean |
| T17 | GEN-01 AC1, BATCH-01 AC2, C3 | both generators `--check` clean; `skill-artifact-parity` green; threshold sweep 0; cross-file clause consistency pass |
| T1-T4 (C5) | GEN-02 | template-conformance test: validator expectations asserted against the live template blocks in `specify.md`/`tasks.md`/`validate.md` |
| T18 | GEN-03 AC1, GATE-02 dogfood | CHANGELOG entry present; `check_specs_delivered.py tlc-330-harness-update` exits 0 |

## Gate Check Commands

- Scripts: `bun test scripts/__tests__/spec-driven-validators.test.ts` (single file, safe)
- Prose sweeps: `/usr/bin/grep -rn '<old-phrase>' skills/ | wc -l` printed beside verdict (raw grep, never rtk)
- Full: `bun run test:scripts`; `bun run lint`; `bun run scripts/generate-skill-artifacts.ts --check`; `bun run scripts/generate-subagent-artifacts.ts --check`

## Task Breakdown

### Phase 1: Validator scripts + lessons fix

### T1: Port validate_spec.py
**Where**: `skills/massa-ai/scripts/validate_spec.py` (new) + test file
**What**: Copy TLC 3.3.0 script; patch per D1 (`--root`, `.specs/features/*/` auto-detect). Author fixtures; invert SHALL check once, observe red (D2).
**Depends on**: none
**Tests**: fixture suite in `scripts/__tests__/spec-driven-validators.test.ts`
**Gate**: `bun test scripts/__tests__/spec-driven-validators.test.ts`
**Status**: [x]

### T2: Port validate_tasks.py
**Where**: `skills/massa-ai/scripts/validate_tasks.py` (new) + tests
**What**: Copy + D1 patch. Run against THIS tasks.md as a live fixture — must exit 0.
**Depends on**: T1
**Tests**: missing-Gate, forward-dep, diagram-parity fixtures
**Gate**: same suite green
**Status**: [x]

### T3: Port check_commit.py with Jira-prefix support
**Where**: `skills/massa-ai/scripts/check_commit.py` (new) + tests
**What**: Copy; add optional `[KEY] ` leading group per D1(c); verify against `workflows/commit.md` §8 examples.
**Depends on**: T1
**Tests**: valid/invalid/prefixed headers; breaking-marker footer rule
**Gate**: same suite green
**Status**: [x]

### T4: Port validate_state.py
**Where**: `skills/massa-ai/scripts/validate_state.py` (new) + tests
**What**: Copy + D1 patch; legacy-feature fixture (R2) no-crash test.
**Depends on**: T1
**Tests**: missing/FAIL/placeholder/no-evidence/legacy fixtures
**Gate**: same suite green
**Status**: [x]

### T5: lessons.py Unicode _norm + selftest
**Where**: `skills/massa-ai/scripts/lessons.py`
**What**: Replace `_norm` (line 185 regex) with NFD + Mn-strip + isalnum/isspace; add `selftest` subcommand (SYNC-10). Touch nothing else in the file.
**Depends on**: none
**Tests**: `python3 skills/massa-ai/scripts/lessons.py selftest` exit 0 + TS wrapper asserts diacritic/non-Latin behavior
**Gate**: selftest 0 + suite green
**Status**: [x]

### T6: New check_specs_delivered.py
**Where**: `skills/massa-ai/scripts/check_specs_delivered.py` (new) + tests
**What**: Implement D3 (porcelain + tracked-on-HEAD conjunction, population printed).
**Depends on**: T1
**Tests**: 4 fixture repos (dirty, untracked, absent-artifact, clean)
**Gate**: same suite green
**Status**: [x]

### Phase 2: Reference + workflow prose

### T7: specify.md — EARS + wiring + facts-rule
**Where**: `skills/massa-ai/references/spec-driven/specify.md`
**What**: SYNC-06 (6 EARS patterns, template ACs, edge-case reframe, closure precondition `validate_spec.py` clean), SYNC-13 facts-you-look-up rule, SYNC-02 wiring. D4 ripple check first (scripted; extend scope only if a WHEN/THEN mandate found in design/tasks templates).
**Depends on**: T1
**Tests**: sweep — EARS section present; `validate_spec.py` named; D4 check output recorded
**Gate**: sweep populations printed, old-phrase count 0
**Status**: [x]

### T8: tasks.md ref — wiring + linter capture + AGENTS generalization
**Where**: `skills/massa-ai/references/spec-driven/tasks.md`
**What**: SYNC-02 (`validate_tasks.py` "run it, do not eyeball it"), SYNC-13 linter-capture clause + convention-file generalization, BATCH-01 threshold mention.
**Depends on**: T2
**Tests**: content sweep per rule
**Gate**: sweep 0 old / new present
**Status**: [x]

### T9: execute.md — status-before-commit + blast radius + wiring
**Where**: `skills/massa-ai/references/spec-driven/execute.md`
**What**: SYNC-04 reorder (§7-9 → status+commit same step, resume rationale), SYNC-05 blast-radius in scope guardrail (per D7 adaptation), SYNC-02 `check_commit.py` + `validate_state.py` Done line, BATCH-01 threshold mention.
**Depends on**: T3, T4
**Tests**: content sweep; ordering asserted by section-sequence check
**Gate**: sweep 0 old / new present
**Status**: [x]

### T10: validate.md — stash ban + baseline + template Result line
**Where**: `skills/massa-ai/references/spec-driven/validate.md`
**What**: SYNC-03 (forbid stash at line 104 site, porcelain baseline + post-cleanup match), SYNC-12 literal `**Result**: PASS/FAIL` Summary line, SYNC-02 `validate_state.py` step-9 wiring.
**Depends on**: T4
**Tests**: sweep — `git stash` appears only as forbidden; template line matches `validate_state.py` regex (executed against a rendered fixture)
**Gate**: sweep + fixture check green
**Status**: [x]

### T11: sub-agents.md — stash ban + threshold + tier rubric
**Where**: `skills/massa-ai/references/spec-driven/sub-agents.md`
**What**: SYNC-03 (line 124 site), BATCH-01 (>3 trigger, algorithm step 2, offer text), SYNC-11 rubric per D5 (Verifier always `deep`), SYNC-02 fallback `validate_state.py`.
**Depends on**: T4
**Tests**: content sweeps per rule
**Gate**: sweep 0 old / new present
**Status**: [x]

### T12: discuss.md — pace system
**Where**: `skills/massa-ai/references/spec-driven/discuss.md`
**What**: SYNC-07: pace step (Quick/Guided/Detailed), Guided ≤2/turn + exactly-1 dependent, lead-with-recommendation, look-up-don't-ask, pace-switch handling, tips. Preserve Trigger Signals / Output / Confirmation Gate / Closure sections.
**Depends on**: none
**Tests**: sweep — "3-4 questions" phrasing gone; pace section present; preserved sections intact
**Gate**: sweep green
**Status**: [x]

### T13: coding-principles.md + memory.md ports
**Where**: `skills/massa-ai/references/spec-driven/{coding-principles,memory}.md`
**What**: SYNC-08 Writing Voice section; SYNC-09 git-reconciliation resume steps (Handoff = hypothesis, evidence wins).
**Depends on**: none
**Tests**: sections present; massa-ai-only sections untouched (diff scoped)
**Gate**: sweep green
**Status**: [x]

### T14: workflows/spec-driven.md — threshold + contract + step 7
**Where**: `skills/massa-ai/workflows/spec-driven.md`
**What**: BATCH-01 (lines 42, 95 threshold), SYNC-05 Execution Contract blast-radius item, SYNC-02 gate references, GATE-03 step-7 reword (STATE/HANDOFF/FEATURES committed before Propose; names `check_specs_delivered.py`).
**Depends on**: T6, T9
**Tests**: content sweeps per rule
**Gate**: sweep 0 old / new present
**Status**: [x]

### T15: implementation-delivery.md — stage 3.5 + push precondition
**Where**: `skills/massa-ai/references/implementation-delivery.md`
**What**: GATE-01 stage between Push and Propose per D8; D7 delivery-authorization sentence (one approval per feature covers commits+push+PR; destructive ops always separate).
**Depends on**: T6
**Tests**: chain table contains new stage; Propose precondition named
**Gate**: sweep green
**Status**: [x]

### Phase 3: Charter, regeneration, close-out

### T16: verification-agent charter → deep + full regen (both generators)
**Where**: `skills/agents/verification-agent/SKILL.md`, regenerated `apps/*-plugin/agents/**` + `apps/*-plugin/skills/**`
**What**: SYNC-11 `model_tier: standard → deep`; run **both** `generate-subagent-artifacts.ts` and `generate-skill-artifacts.ts`; commit source + all regen together (D9 as amended by Plan Challenge C1 — gate as wide as the invariant).
**Depends on**: T11
**Tests**: `subagent-parity.test.ts` + `skill-artifact-parity.test.ts`
**Gate**: both parity suites green + both generators `--check` clean
**Status**: [x]

### T17: Skill-bundle regeneration + threshold sweep + cross-file consistency
**Where**: regenerated `apps/*-plugin/skills/**`
**What**: GEN-01: run `generate-skill-artifacts.ts`; BATCH-01 AC2 repo-wide old-threshold sweep (population printed); Plan Challenge C3 check — extract the blast-radius clause and each gate-invocation clause from every touched file, assert they are byte-identical or explicitly parameterized, print the clause population beside the verdict.
**Depends on**: T7, T8, T9, T10, T11, T12, T13, T14, T15, T16
**Tests**: `skill-artifact-parity.test.ts`; sweep output; consistency-check output
**Gate**: `--check` clean + parity green + sweep 0 + consistency check pass
**Status**: [x] (no-op regen — T16's run already covered it; no commit, no diff)

### T18: CHANGELOG + state artifacts + delivery gate dogfood
**Where**: `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/project/FEATURES.json`
**What**: GEN-03 entry under `### Changed`; register feature + close-out state; run `check_specs_delivered.py tlc-330-harness-update` — must exit 0 before PR (GATE-02 dogfood). Per Plan Challenge C2: this close-out commits **before** the first push; no commits may land between this task and PR creation.
**Depends on**: T17
**Tests**: CI CHANGELOG gate; script exit 0
**Gate**: script prints population, exits 0
**Status**: [x]

### Phase 4: Fix tasks — validation iteration 1

### FT1: Stop validator tests writing __pycache__ into the source tree
**Where**: `scripts/__tests__/spec-driven-validators.test.ts`, `scripts/generate-skill-artifacts.ts`
**What**: `python3 -B` on both spawn sites (bytecode cache broke `generate-skill-artifacts.ts --check` when suites run together — verifier gap 1, GEN-01 blocker); generator `walkFiles` skips `__pycache__` as defense-in-depth.
**Depends on**: T17
**Tests**: validator suite + both parity suites in ONE run; no `__pycache__` dir afterward
**Gate**: combined run green, `--check` clean
**Status**: [x]

### FT2: Scope validate_state.py verdict to the Summary section
**Where**: `skills/massa-ai/scripts/validate_state.py`, `scripts/__tests__/spec-driven-validators.test.ts`
**What**: `_verdict()` prefers the `## Summary` section's own `**Result**:` line; the sensor's per-mutation Result sub-line no longer collides when verdicts diverge (verifier gap 2, SYNC-12 major). Regression fixture: Summary FAIL + sensor PASS → "verdict is FAIL", not "template placeholder".
**Depends on**: FT1
**Tests**: new diverging-verdict fixture red-before/green-after
**Gate**: validator suite green
**Status**: [x]

### Phase 5: ALL-workflows amendment + py→ts spec

### T19: Core Contract rules + KVC leads-not-truth rewording
**Where**: `skills/massa-ai/SKILL.md`
**What**: ALLWF-01 + ALLWF-02 as two Core Contract bullets (verify-don't-assume / docs-are-leads; ask-when-in-doubt with facts-vs-decisions boundary), per D10. Reword the KVC "Project docs" step at its 4 sites (spec-driven.md:154, exploration.md:25, design.md:47 and 113) — second file set belongs to this task's sweep, single commit with SKILL.md. Regenerate skill bundles.
**Depends on**: T18
**Tests**: content sweep — both rules present once in Core Contract; 4 KVC sites carry the qualifier; `--check` clean
**Gate**: sweep populations printed + `skill-artifact-parity` green
**Status**: [x]

### T20: Read-only charter tier sweep → deep
**Where**: `skills/agents/{audit-specialist,context-curator,furps-analyst,investigator,mobile-specialist,navigator,requirements-analyst,reviewer}/SKILL.md`
**What**: ALLWF-03: `model_tier` → `deep` on the 8 read-only charters below it; extend the D5 rubric in `sub-agents.md` (read-only specialists always `deep`); parity allowlist + `FEATURES.md` tier table record the 8 authorized changes; run BOTH generators (D9 rule).
**Depends on**: T19
**Tests**: scripted tier sweep prints 14/17 deep + 3 write-capable unchanged; both parity suites green; both `--check` clean
**Gate**: sweep + parity + checks all exit 0
**Status**: [x]

### T21: Author python-to-typescript-scripts spec + registration
**Where**: `.specs/features/python-to-typescript-scripts/spec.md` (new), `.specs/project/FEATURES.json`
**What**: PYTS-01 per D12 — Specify-only artifact for the 8-script migration, invocation-surface evidence per script, wiring ripple enumerated; FEATURES.json entry `planned`. Orchestrator-authored (spec authoring is never delegated).
**Depends on**: T18
**Tests**: `validate_spec.py python-to-typescript-scripts` exit 0 (dogfood)
**Gate**: validator exit 0
**Status**: [x]

### T22: Amendment close-out
**Where**: `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/features/tlc-330-harness-update/validation.md`
**What**: CHANGELOG entry extended (ALL-workflows rules + tier sweep + py→ts spec); state files updated; verifier iteration 3 re-validates Group E/F ACs; `check_specs_delivered.py` exit 0; push (delivery authorization from this feature covers it).
**Depends on**: T19, T20, T21
**Tests**: iteration-3 verdict PASS; delivery gate 0
**Gate**: validation PASS + gate 0
**Status**: [x]

### Phase 6: Fix tasks — validation iteration 3

### FT3: Correct py→ts spec wiring-ripple population
**Where**: `.specs/features/python-to-typescript-scripts/spec.md`
**What**: Iteration-3 gap (PYTS-01 AC1): spec quoted an earlier narrow sweep (24 sites / 12 files); re-measured 41 python3 lines / 25 skill files (36/23 scoped), + 16 non-literal .py refs incl. the execute.md:311 commit-msg hook recipe, + 3 test spawns + package.json:42. Spec now embeds the sweep commands, prints populations beside claims, and PTS-04 AC2 makes Design re-derive the work list. Also swept the verifier's secondary finding: stale "validation.md intentionally absent" note in FEATURES.json replaced (a status field is a claim that goes stale).
**Depends on**: T22
**Tests**: `validate_spec.py python-to-typescript-scripts` exit 0; zero "intentionally absent" refs in FEATURES.json
**Gate**: validator 0 + sweep 0
**Status**: [x]

### FT4: validate_tasks.py accepts letter-prefixed task ids (IT2-01 closure)
**Where**: `skills/massa-ai/scripts/validate_tasks.py`
**What**: TASK_RE/EDGE_RE accept `[A-Z]*T\d+` so `### FT3:` headers parse as their own tasks instead of folding fields into the previous task's record — the fold produced a false self-dependency ERROR on this feature's own contract after FT3 landed (and FT3's commit slipped through that red gate: compound command echo reset the exit code; recorded as process deviation). Regression fixtures: FT backward-dep passes; FT missing-Gate reported against FT1. Bundles regenerated.
**Depends on**: FT3
**Tests**: 2 new fixtures in `spec-driven-validators.test.ts` (44/0)
**Gate**: suite + live-contract validator + `--check` all exit 0
**Status**: [x]

### FT5: Close iteration-4 gaps — stale traceability row, dead fixture, HANDOFF narrative
**Where**: `.specs/features/python-to-typescript-scripts/spec.md`, `scripts/__tests__/spec-driven-validators.test.ts`, `.specs/HANDOFF.md`
**What**: (1) spec.md:79 PTS-04 traceability row still carried the "12 skill prose files (24 sites)" figure FT3 was meant to eliminate — a clause and its fix must touch the same lines; now sweep-derived phrasing. (2) FT4's first regression fixture never observed its defect (passed identically under mutation); rebuilt into the live defect shape (later-phase FT depending on previous phase's last task, diagram arrows present) and observed red against a reverted parser in scratch (exit 1, exact "T2 declares Depends on: T2" error) vs current exit 0. (3) HANDOFF.md's "validation.md intentionally absent" narrative replaced with the iteration history.
**Depends on**: FT4
**Tests**: suite green with rebuilt fixture; scratch mutation kills 2/2; sweep shows 0 LIVE status claims of the stale phrase (8 hits total, all quotations in fix-task/validation narrative + one unrelated sealed spec — a claim of absence can be the match)
**Gate**: suite + validators + sweep all exit 0
**Status**: [x]
