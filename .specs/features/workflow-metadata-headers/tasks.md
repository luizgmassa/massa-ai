# Workflow Metadata Headers — Tasks

Sizing: Medium. Design skipped — format fully determined by the Agent Skills
spec + existing repo SKILL.md convention; no architecture, interface, data,
migration, or public-contract choice beyond what the spec fixes (safety valve
armed: any design concern surfacing mid-task stops work and creates design.md).

Plan: `1 Phase = 5 Tasks`.

## Phase 1 — Headers, gates, delivery

- **T1 — Sensor red-first.** Write
  `scripts/__tests__/workflow-metadata-headers.test.ts` (WMH-03): enumerate
  `skills/massa-ai/workflows/**/*.md` from disk, assert population > 0 and
  print it, parse the frontmatter block with a real YAML parser (Plan
  Challenge F1/F2 — never regex key-presence), validate
  name/description/metadata.version per spec constraints. Run against
  pre-change tree → observed red (AC6). Gate: failing output captured.
- **T2 — Add frontmatter to all 36 files.** Scripted prepend (name = stem,
  `license: MIT`, `metadata.version: "1.0.0"`); descriptions hand-authored
  (not verbatim-extracted — F3 wrap-truncation moot), emitted as double-quoted
  single-line YAML scalars with escaping (F1). Verify AC3 (prepend-only,
  strip-reproduces-original) with a scripted byte check, not eyeball. Gate:
  T1 sensor green (36/36 parse clean); byte check 36/36.
- **T3 — Regenerate bundles.** `bun scripts/generate-skill-artifacts.ts`, then
  `--check` → exit 0 (AC4). Gate: --check exit code.
- **T4 — Full gates + CHANGELOG + spec state.** `bun run test:scripts`,
  `bun run lint` (AC5). CHANGELOG `[Unreleased]` entry (WMH-06). Update
  `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, `.specs/HANDOFF.md`;
  `bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-metadata-headers`
  exit 0. Gate: all exit codes.
- **T5 — Deliver.** Push branch `spec/workflow-metadata-headers`, `gh pr create`,
  CI watch. PR body notes (Plan Challenge F2/F4): `skills.yml` CI does not
  validate `workflows/*.md` frontmatter — the new test is the sole backstop;
  and `generate-skill-artifacts.ts` byte-copies, so a YAML defect would
  propagate into all 4 bundles unseen without it. Requires the Execute-start
  go-ahead (blast radius: one delivery through PR creation; merge stays the
  user's). Gate: PR URL + CI green.

## Test Coverage Matrix

| Requirement | Gate |
| --- | --- |
| WMH-01 | T1 sensor (frontmatter fields, spec constraints, 36 population) |
| WMH-02 | T2 byte check (strip frontmatter → original bytes) |
| WMH-03 | T1 red run + T4 green run |
| WMH-04 | T3 `--check` exit 0 |
| WMH-05 | T4 `test:scripts` + `lint` exit 0 |
| WMH-06 | CI CHANGELOG merge gate + T4 diff |

## Gate Check Commands

```bash
bun test scripts/__tests__/workflow-metadata-headers.test.ts   # T1/T2 sensor
bun scripts/generate-skill-artifacts.ts --check                # T3
bun run test:scripts && bun run lint                           # T4
bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-metadata-headers
```

## Commit Plan

One atomic commit per task on `spec/workflow-metadata-headers` (plain branch in
the main checkout — tree is clean, no parallel session; worktree isolation
deviation recorded). T1 commit carries the red-first sensor with a skip-guard
removed in T2's commit? No — sensor commits WITH T2 (red run is logged evidence,
not a committed red state; committing a red gate would break `test:scripts` for
anyone on the branch between commits). T1's red log lands in validation.md.
Commits: (1) activation + spec artifacts, (2) headers + sensor + byte check,
(3) bundle regen, (4) CHANGELOG + state, (5) none (T5 is push/PR).
