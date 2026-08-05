# Skill Token Optimization Tasks

Slug: `skill-token-optimization` · Session: `spec-skill-token-optimization` ·
Plan: `3 Phases = 12 Tasks`

## Execution Plan

### Phase 1 — Guards, extractions, validators (1 Phase = 7 Tasks)

T1 T2 T3 T4 T5 T6 T7

T1 by main agent (guard tooling must exist before workers). T2–T7 by one
`massa-ai-builder` Phase worker, sequential, in this worktree.

### Phase 2 — Compression (1 Phase = 4 Tasks)

T8 T9 T10 T11

One `massa-ai-builder` Phase worker, sequential, dispatched after Phase 1
commits are in.

### Phase 3 — Delivery (1 Phase = 1 Task)

T12

Main agent. Then the automatic verification-agent gate (author ≠ verifier).

## Test Coverage Matrix

| Requirement | Sensor | Command |
| --- | --- | --- |
| STO-1 SonarQube extraction | grep pointer-only + rule-survival diff | `grep -c -i sonar skills/massa-ai/workflows/implementation/*.md` (≤ pointer lines); manual diff extracted vs source block |
| STO-2/STO-3 mobile+Figma gate | grep pointer-only in `feature.md`/`spec-driven.md`; gate text present once in `mobile-context.md` | `grep -n 'Figma Source' skills/massa-ai/workflows/{feature,spec-driven}.md` |
| STO-4 compression integrity | protected literals unchanged; code blocks/tables byte-identical | coupled test set + `bun scripts/generate-skill-artifacts.ts --check` |
| STO-5 gates | full suite | `bun run test:scripts && bun run lint` |
| STO-6 measurement | scripted bytes at base vs head | measurement one-liner over `git show` states |
| STO-7 path resolution | resolver exits 0 | `bun scripts/check-skill-doc-paths.ts` |
| STO-8 extraction set | per-move grep + rule-survival diff | task-listed greps |
| STO-9 validators | red-first tests then green; workflows call scripts | `bun test scripts/__tests__/audit-report-validators.test.ts` etc. |

## Gate Check Commands

```bash
bun scripts/check-skill-doc-paths.ts
bun scripts/generate-skill-artifacts.ts && bun scripts/generate-skill-artifacts.ts --check
bun run test:scripts
bun run lint
bun skills/massa-ai/scripts/check_specs_delivered.ts skill-token-optimization --root .
```

## Task Breakdown

### T1: Guard tooling — path resolver + protected-literal inventory

- [x] Requirement: STO-7, STO-4
- [x] `scripts/check-skill-doc-paths.ts`: for every `.md` under
      `skills/massa-ai/` and `skills/agents/`, resolve each cited relative
      `references/…`, `workflows/…`, `skills/…`, `scripts/…` path against the
      repo; non-zero exit listing misses. Red-first: plant a bad path in a
      scratch copy, observe failure, remove.
- [x] `scripts/skill-protected-literals.ts`: scan `scripts/__tests__/*.ts`,
      `scripts/lib/*.ts`, `skills/massa-ai/scripts/*.ts` for **string literals
      AND regex-literal source text** (≥12 chars; regex source normalized —
      escapes/`\s+` reduced to match-relevant words) that occur in any skill
      `.md`; emit JSON `{file: [spans]}`. Must list the known `spec-driven.md`
      validator anchors AND the `workflow-harness-contract.test.ts` regex
      anchors (e.g. "two consecutive failed fix attempts" in
      `root-cause-scripts.md`, "merge is never automatic" in
      `implementation-delivery.md`) — Plan Challenge F1. Observed-red
      calibration: temporarily remove one string anchor and one regex anchor
      from scratch copies and confirm detection of both.
- [x] Test `scripts/__tests__/skill-doc-paths.test.ts` running the resolver
      repo-wide (green at HEAD).
Tests: `scripts/__tests__/skill-doc-paths.test.ts` (new); observed-red calibration for both scripts
Gate: both scripts run green at HEAD; commit.

### T2: SonarQube MCP extraction

- [x] Requirement: STO-1
- [x] Create `references/sonarqube-mcp.md` from `implementation-audit.md`
      step 9 + normalization clauses in steps 10–12 + `implementation-fix.md`
      SonarQube clause: detection, unavailability skip reasons, firewall
      rules, wait-for-analysis, normalization areas, ID mapping (`Area/PREFIX-N`,
      never `SONAR-*`), preserved fields, exclusion rules.
- [x] Replace inline blocks with ≤3-line availability-gated pointers.
Tests: STO-1 matrix greps + rule-survival diff of extracted reference vs source block
Gate: sensors green; `generate-skill-artifacts` regen + `--check` 0 in-commit.

### T3: Mobile/Figma design-source intake gate extraction

- [x] Requirement: STO-2, STO-3
- [x] Add "Design-Source Intake Gate" section to
      `references/mobile-context.md` from `feature.md` step 4 block and
      `spec-driven.md` step 3 mobile/Figma paragraph: ask-once rules, `none`
      handling, `design.md`/mobile-figma routing preservation, unsupported
      targets, screenshot-evidence limits, `figma-pre-analysis.md` two-stage
      protocol trigger.
- [x] Replace both inline blocks with ≤2-line trigger pointers; keep the
      trigger set (platform/scope signals) inline.
- [x] Sweep `adr.md`, `rfc.md`, `tdd.md`: clauses ≤3 lines stay; >3 lines move.
Tests: STO-2/STO-3 matrix greps + rule-survival diff
Gate: sensors green; regen + `--check` 0 in-commit.

### T4: Audit-scope branch dedupe (6 audit workflows)

- [x] Requirement: STO-8
- [x] Reconcile the 5 mutually-exclusive scope-resolution branches
      (modified-files, commit-range, explicit-files/glob/branch/symbol/repo,
      codebase-area, implementation-parent) into `references/audit-scope.md`
      as the single home; resolve conflicts in favor of the richer text.
- [x] The 6 `*-audit.md` files keep branch names + one pointer line each.
- [x] Scripted branch-term check (Plan Challenge F2): extract per-branch
      distinctive terms from the 6 pre-move blocks (T1 machinery); every term
      present pre-move must be present post-move in `audit-scope.md` or the
      pointer line; misses listed, each resolved or explicitly accepted.
Tests: rule-survival diff per scope branch (5 branches × 6 files vs single home) + scripted branch-term check
Gate: diffs rule-complete, term check clean-or-accepted; regen + `--check` 0 in-commit.

### T5: Misc high-value dedupes

- [x] Requirement: STO-8
- [x] `skills/massa-ai/SKILL.md` Graceful Degradation table → new
      `references/graceful-degradation.md`; SKILL.md keeps 2-line
      load-on-failure rule. (Extraction only — no other SKILL.md edits.)
- [x] `spec-driven.md` brownfield 7-doc table →
      `references/spec-driven/brownfield-mapping.md` (keep trigger + minimum
      bar line inline).
- [x] `general.md` failure-handling bullets: delete (duplicate of SKILL.md
      table rows), keep pointer.
- [x] Judge + meta-judge duplicated model-hint block →
      `references/agent-orchestration.md` "Model Diversity Fallback" section.
- [x] `feature.md`/`refactor.md` stacked-branch restatements → pointer to
      `references/pr-task-fix.md`.
- [x] `spec-driven.md`: trim sub-agent-offer restatement (keep >3-Task trigger
      + single-Phase-group nuance); move checkpoint field list into
      `references/spec-driven/execute.md`.
Tests: rule-survival diffs; `bun test scripts/__tests__/skill-size-budgets.test.ts scripts/__tests__/skills-harness-integrity.test.ts`
Gate: tests green; regen + `--check` 0 in-commit.

### T6: validate_audit_report.ts + wiring

- [x] Requirement: STO-9
- [x] `skills/massa-ai/scripts/validate_audit_report.ts`: metadata fields,
      Area↔Prefix table membership, `PREFIX-N` format, uniqueness, gap-free
      sequencing; parameterized by report family (ARCH/BUG/CQ/SEC/REQ/TST/
      MST/MFM/implementation composite).
- [x] Red-first `scripts/__tests__/audit-report-validators.test.ts`: valid
      fixture + one fixture per violation class; observe red on planted
      violations before wiring. Source at least one fixture per report family
      from a real historical report artifact (`audits/**` or git history) when
      one exists; hand-author only families with no real sample (Plan
      Challenge F4 — vacuous-fixture guard: assert parsed finding count > 0
      per fixture).
- [x] Wire `references/audit-report-io.md` + 9 `*-fix.md` workflows to run the
      script instead of inline checklist prose (removed, pointer retained).
Tests: `scripts/__tests__/audit-report-validators.test.ts` — observed red on planted violations, then green
Gate: new test green; coupled `test:scripts` subset green; regen + `--check` 0.

### T7: validate_design.ts + wiring

- [x] Requirement: STO-9
- [x] `skills/massa-ai/scripts/validate_design.ts`: required sections
      (Design summary, Risks & Concerns, Tech Decisions), non-empty
      mitigation per flagged concern — same parse style as `validate_spec.ts`.
- [x] Red-first test additions (fixture with missing section / empty
      mitigation observed red).
- [x] Wire `references/spec-driven/design.md` + spec-driven workflow step 4 to
      call it.
Tests: validate_design fixtures — missing-section and empty-mitigation observed red, then green
Gate: tests green; regen + `--check` 0.

### T8: Compress workflows (36 files)

- [x] Requirement: STO-4
- [x] Caveman-compress prose in every `skills/massa-ai/workflows/**/*.md`;
      byte-preserve code blocks, commands, YAML, dispatch blocks, tables,
      paths, protected literals (T1 inventory in packet). No `*.original.md`.
Tests: `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/validate-repository.test.ts scripts/__tests__/skill-size-budgets.test.ts` + `bun scripts/check-skill-doc-paths.ts` (Plan Challenge F1: named per-batch, not "coupled set")
Gate: tests + resolver green; regen + `--check` 0 in-commit.

### T9: Compress references — top level (~40 files)

- [x] Requirement: STO-4
- [x] Same discipline over `skills/massa-ai/references/*.md`.
Tests: same as T8
Gate: same as T8.

### T10: Compress references — subdirectories (~47 files)

- [x] Requirement: STO-4
- [x] Same discipline over `skills/massa-ai/references/*/**.md`
      (mobile-figma-matcher, the-fool, spec-driven, tdd, rfc, ticket, furps,
      maestro). 2 ATTRIBUTION.md files (mobile-figma-matcher, rfc) left
      byte-identical by design — third-party license/attribution text.
Tests: same as T8
Gate: same as T8.

### T11: Compress agent charters (17 files)

- [ ] Requirement: STO-4
- [ ] Same discipline over `skills/agents/*/SKILL.md`; frontmatter and
      capability-packet-coupled sections byte-preserved where tests require.
Tests: `bun test scripts/__tests__/capability-packet-parity.test.ts scripts/__tests__/subagent-parity.test.ts` + charter tests
Gate: tests green; regen + `--check` 0 in-commit.

### T12: Delivery

- [ ] Requirement: STO-5, STO-6
- [ ] Rebase onto `origin/main`; re-run regen post-rebase.
- [ ] Full gates: `bun run test:scripts`, `bun run lint`,
      `generate-skill-artifacts --check` 0, `test:plugins` if plugin bundles
      changed.
- [ ] Scripted measurement: bytes per class at merge-base vs HEAD → recorded
      for `validation.md`, with the ≥20% goal stated as an explicit MET or
      MISSED verdict line, not raw numbers alone (Plan Challenge F3).
- [ ] CHANGELOG `[Unreleased]` entry; `.specs/project/STATE.md`,
      `.specs/project/FEATURES.json`, `.specs/HANDOFF.md` committed on branch;
      `check_specs_delivered.ts` green.
- [ ] Push branch, open PR (merge stays user's). Then verification-agent runs
      automatically and writes `validation.md`.
Tests: full `bun run test:scripts` + `bun run lint` + measurement reproduction
Gate: all Gate Check Commands exit 0; PR opened; verification-agent PASS.
