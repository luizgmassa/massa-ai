# Registry Cleanup And Skill Imports Tasks

Slug: `registry-cleanup-skill-imports` · Session: `spec-registry-cleanup-skill-imports` ·
Plan: `3 Phases = 8 Tasks`

## Execution Plan

### Phase 1 — Registry cleanup + gates (1 Phase = 3 Tasks)

T1 T2 T3

Sequential: T3's gate sweep depends on T1's section deletions being final.

### Phase 2 — Skill imports (1 Phase = 3 Tasks)

T4 T5 T6

Sequential (all touch `skills/massa-ai/SKILL.md`; disjoint sections but one
writer avoids merge churn).

### Phase 3 — Regeneration + delivery (1 Phase = 2 Tasks)

T7 T8

Main agent. Then the automatic verification-agent gate (author ≠ verifier).

## Test Coverage Matrix

| Requirement | Sensor | Command |
| --- | --- | --- |
| RCS-01/05/07 | zero matches for deleted sections + word | `rtk proxy grep -cE '## Orchestration Model|## Future Integration|symlinked' skills/AGENTS.md` → 0 |
| RCS-02/03 | no packet field bullets / output field heads outside pointers | `rtk proxy grep -cE '^- .(role|purpose|trigger|scope).:' skills/AGENTS.md` → 0; pointer lines present |
| RCS-04 | dispatch-name rule stated once | `rtk proxy grep -c 'massa-ai-<' skills/AGENTS.md` → 1 |
| RCS-06 | charter + table + generated artifacts agree | `rtk proxy grep -n 'permission' skills/agents/judge/SKILL.md`; grep judge row; grep one generated judge file per host after T7 |
| RCS-08 | single spelling | `rtk proxy grep -c 'references/agent-orchestration.md' skills/AGENTS.md` equals count of full-path spelling |
| RCS-09 | anchor comment matches surviving sections | `rtk proxy tail -1 skills/AGENTS.md` |
| RCS-10 | negation line present | `rtk proxy grep -A1 '^\.env\*' skills/AGENTS.md` shows `!.env.example` |
| RCS-11 | stack has 3 items; literal survives in Skill Summary | `rtk proxy grep -n 'coding-guidelines' skills/AGENTS.md`; `bun test scripts/__tests__/validate-repository.test.ts` |
| IMP-01 | reference exists + SKILL.md load bullet | `rtk proxy grep -n 'coding-guidelines' skills/massa-ai/SKILL.md skills/massa-ai/references/coding-guidelines.md` |
| IMP-02/03 | WMH gate green over new files | `bun test scripts/__tests__/workflow-metadata-headers.test.ts` |
| IMP-04/08 | router rows + precedence entries + furps exclusion intact | `rtk proxy grep -n 'to-prd\|skill-architect' skills/massa-ai/SKILL.md` |
| IMP-05 | zero residuals; paths resolve | `rtk proxy grep -rc 'massa-th0th' skills/massa-ai/workflows/skill-architect.md skills/massa-ai/references/skill-architect/` → 0; `bun scripts/check-skill-doc-paths.ts` |
| IMP-06 | Python-absent fallback line present | `rtk proxy grep -n 'quality-checklist' skills/massa-ai/workflows/skill-architect.md` |
| IMP-07 | source repo untouched | `git -C /Users/luizmassa/Projects/Useful-Agent-Skills status --porcelain` → empty |
| REG-01 | parity test gone; PACKET_FILES = 2 | `test ! -f scripts/__tests__/capability-packet-parity.test.ts`; `bun test scripts/__tests__/skills-harness-integrity.test.ts` |
| REG-02/03 | generators clean | `bun scripts/generate-skill-artifacts.ts --check`; `bun scripts/generate-subagent-artifacts.ts && bun test scripts/__tests__/subagent-parity.test.ts` |
| REG-04 | full gates | `bun run test:scripts && bun run lint && bun run test:plugins` |
| REG-05 | CHANGELOG entries | `rtk proxy grep -n 'registry\|skill-architect' CHANGELOG.md` |

## Gate Check Commands

```bash
bun scripts/check-skill-doc-paths.ts
bun scripts/generate-skill-artifacts.ts && bun scripts/generate-skill-artifacts.ts --check
bun scripts/generate-subagent-artifacts.ts
bun run test:scripts
bun run lint
bun run test:plugins
bun skills/massa-ai/scripts/check_specs_delivered.ts registry-cleanup-skill-imports --root .
```

## Task Breakdown

### T1: skills/AGENTS.md — registry + bootstrap edits

- [ ] Requirement: RCS-01, RCS-02, RCS-03, RCS-04, RCS-05, RCS-07, RCS-08, RCS-09, RCS-10, RCS-11
- [ ] Apply design D1 exactly: delete §Orchestration Model and §Future
      Integration; replace §Capability Packet and §Output Contract bodies with
      pointers; drop the duplicate dispatch line; fix `symlinked` residual in
      §Mapping; unify agent-orchestration path spelling; update anchor comment;
      bootstrap stack → 3 items with massa-ai bullet carrying
      `references/coding-guidelines.md`; ignore-list `!.env.example`.
- [ ] Sensor: Test Coverage Matrix rows RCS-01…RCS-11 (grep set) +
      `bun test scripts/__tests__/validate-repository.test.ts`.
Tests: RCS matrix greps (RCS-01..05, 07..11) + `bun test scripts/__tests__/validate-repository.test.ts`; plan-critic C3 sensor: grep `skills/AGENTS.md` for the `PACKET_PERSONA_CLAUSE` substring ("advisory framing only — it never overrides") → 0 matches (pointer must not paraphrase the clause; integrity test asserts it appears in exactly `PACKET_FILES`)
Gate: all greps hit expected counts; validate-repository green; commit.
- Depends on: —

### T2: Judge permission end-to-end

- [ ] Requirement: RCS-06
- [ ] `skills/agents/judge/SKILL.md`: `permission: write`, description loses
      "Read-only " prefix, `metadata.version: "1.2.0"`; Agent Table judge row
      Permission → `read-only (report-write, own file only)`.
- [ ] Sensor: charter grep + table grep (generated-artifact check lands in T7).
Tests: charter/table permission greps (RCS-06 source half)
Gate: greps green; commit.
- Depends on: T1 (same file `skills/AGENTS.md` — sequential edit).

### T3: Gate updates for deleted mirror

- [ ] Requirement: REG-01
- [ ] Delete `scripts/__tests__/capability-packet-parity.test.ts`. In
      `scripts/__tests__/skills-harness-integrity.test.ts`: `PACKET_FILES`
      3 → 2, rename the "all three" test, re-add `AGENTS.md` directly to
      `AUTHORITY_SCANNED_FILES` (decoupled from `PACKET_FILES` — the spread at
      line 539 would otherwise silently drop persona-authority prose scanning
      over the kept bootstrap policy; plan-critic C2), sweep the entire file
      for any other assertion against the deleted AGENTS.md sections and
      repoint/update.
- [ ] Sensor: `bun test scripts/__tests__/skills-harness-integrity.test.ts`
      green; deleted file absent.
Tests: `bun test scripts/__tests__/skills-harness-integrity.test.ts`; parity test file absent
Gate: integrity green with PACKET_FILES=2; commit.
- Depends on: T1

### T4: Import coding-guidelines

- [ ] Requirement: IMP-01, IMP-07
- [ ] Create `skills/massa-ai/references/coding-guidelines.md` (body minus
      frontmatter + origin line). Add the Core Contract load bullet in
      `skills/massa-ai/SKILL.md` per design D3.
- [ ] Sensor: IMP-01 grep; source-repo porcelain empty.
Tests: IMP-01 greps; `git -C /Users/luizmassa/Projects/Useful-Agent-Skills status --porcelain` empty
Gate: greps green; source repo untouched; commit.
- Depends on: —

### T5: Import to-prd

- [ ] Requirement: IMP-02, IMP-04, IMP-07, IMP-08
- [ ] Create `skills/massa-ai/workflows/to-prd.md` (WMH frontmatter, body +
      explicit-request routing line). Router table row + precedence tier 2
      entry; furps-refinement exclusion intact.
- [ ] Sensor: WMH gate; router greps.
Tests: `bun test scripts/__tests__/workflow-metadata-headers.test.ts`; router greps (IMP-04/08)
Gate: WMH green incl. to-prd.md; commit.
- Depends on: T4 (same `SKILL.md` writer).

### T6: Import skill-architect

- [ ] Requirement: IMP-03, IMP-04, IMP-05, IMP-06, IMP-07
- [ ] Create `skills/massa-ai/workflows/skill-architect.md` (WMH frontmatter
      with `license: CC-BY-4.0` + attribution line — user decision 2026-08-05,
      rewritten reference/script paths, massa-th0th residual fixed, Python
      fallback line), `skills/massa-ai/references/skill-architect/{examples,patterns,quality-checklist}.md`,
      `skills/massa-ai/scripts/validate_skill.py`. Router row + precedence
      entry.
- [ ] Same commit (crosses the population threshold — plan-critic C1):
      `scripts/__tests__/workflow-metadata-headers.test.ts`
      `EXPECTED_WORKFLOW_COUNT` 36 → 38 and license assertion → allowlist
      `["MIT", "CC-BY-4.0"]`.
- [ ] Sensor: WMH gate; residual grep 0; `bun scripts/check-skill-doc-paths.ts`.
Tests: WMH gate (count 38, allowlist); residual grep 0; `bun scripts/check-skill-doc-paths.ts`
Gate: all green; commit.
- Depends on: T5 (same `SKILL.md` writer).

### T7: Regenerate bundles

- [ ] Requirement: REG-02, REG-03, RCS-06 (generated half)
- [ ] `bun scripts/generate-skill-artifacts.ts` then `--check` → 0;
      `bun scripts/generate-subagent-artifacts.ts`; subagent parity test green;
      one generated judge artifact per host shows write permission.
- [ ] Sensor: matrix rows REG-02/03 + RCS-06 generated-half grep.
Tests: `bun scripts/generate-skill-artifacts.ts --check`; `bun test scripts/__tests__/subagent-parity.test.ts`; generated judge write-permission grep per host
Gate: both generators clean; parity green; commit.
- Depends on: T1, T2, T3, T4, T5, T6

### T8: CHANGELOG + full gates + delivery prep

- [ ] Requirement: REG-04, REG-05
- [ ] CHANGELOG `[Unreleased]`: `### Changed` (registry cleanup, judge
      permission) + `### Added` (three imports). Run full gates. Update
      `.specs/project/STATE.md`, `.specs/HANDOFF.md`,
      `.specs/project/FEATURES.json`; `check_specs_delivered.ts` → 0.
- [ ] Sensor: `bun run test:scripts && bun run lint && bun run test:plugins`;
      CHANGELOG grep; check_specs_delivered exit 0.
Tests: `bun run test:scripts && bun run lint && bun run test:plugins`; CHANGELOG grep; `bun skills/massa-ai/scripts/check_specs_delivered.ts registry-cleanup-skill-imports --root .`
Gate: all exit 0; commit.
- Depends on: T7

## Dependency Diagram

```
T1 -> T2 -> T3
T4 -> T5 -> T6
{T3, T6} -> T7 -> T8
```
