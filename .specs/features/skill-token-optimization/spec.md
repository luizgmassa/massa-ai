# Skill Token Optimization Specification

Slug: `skill-token-optimization` · Workflow: spec-driven (Large) ·
Session: `spec-skill-token-optimization`

## Problem Statement

The massa-ai skill surface loads too many tokens per session. Measured at
baseline (branch `spec/skill-token-optimization` @ `41daeb68`): 36 workflow
files 339,809 B, 87 reference files 603,273 B, 17 agent charters 63,781 B —
~1.0 MB (~250k tokens if fully loaded). Three conditional definition families
sit inline in workflows and load even when their condition is false: mobile
definitions (design-source intake gate duplicated in `feature.md` and
`spec-driven.md`; mobile clauses across generic workflows), Figma definitions
(evidence rules restated in `feature.md`, `spec-driven.md`, `adr.md`, `rfc.md`,
`tdd.md`), and the SonarQube MCP protocol (~24 lines inline in
`implementation-audit.md` + normalization clauses in steps 10–12 and
`implementation-fix.md`). Beyond the moves, all three file classes carry
verbose prose that caveman compression can shrink without losing technical
substance.

## Goals

- [ ] Conditional mobile/Figma/SonarQube definitions load only when their
      trigger condition holds (lazy-loaded references, thin inline pointers).
- [ ] All workflows, references, and agent charters caveman-compressed;
      measured byte reduction reported per class (target ≥20% overall).
- [ ] Every existing gate stays green; zero drift in generated bundles.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Compressing `skills/massa-ai/SKILL.md` and `skills/persona-router/SKILL.md` routers | Routers are gate-anchored contracts; persona-router just shipped a size-budget pass (PRT); separate feature |
| Persona catalog/prompts (`skills/massa-ai/personas/`) | Optimized in `persona-router-token-optimization` (PR #68) |
| `skills/AGENTS.md` bootstrap block | Canonical policy source guarded by `skills-harness-integrity.test.ts` |
| Hand-editing `apps/*-plugin/skills/**` bundles | Generated; regenerated via `scripts/generate-skill-artifacts.ts` |
| Dispatch-block extraction to `references/agent-orchestration.md` | Documented invariant (`agent-orchestration.md:92-93`): dispatch blocks stay inline so dispatch never depends on the reference loading |
| Marginal extraction candidates (findings #12, #14, #16–#27 not named in STO-8) | User selected the high-value set only (2026-08-05); rest recorded in findings for later |
| Validator mechanisms beyond the top pack (RFC/TDD/ticket/judge/write-set/etc.) | User selected top pack only; remainder recorded as follow-up backlog |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Extraction threshold | Move only conditional blocks >3 lines; ≤3-line clauses stay inline and get compressed | A pointer line costs nearly as much as a short clause; net-negative below threshold | y (token-math) |
| No `*.original.md` backups committed | Skip caveman-compress's backup-file default; git history is the backup | 140 backup files would double the tree and pollute bundles/installers | y (repo is git-tracked) |
| Compression is prose-only | Code blocks, commands, YAML/policy blocks, dispatch blocks, tables' structure, file paths, finding-ID grammars, and gate-anchored literals are byte-preserved | Tests and generators match literals; capability-packet parity reads dispatch blocks | y (structural requirement wins) |
| Protected-literal inventory is scripted | Before compression, a script extracts every literal that `scripts/__tests__/*.ts`, `skills/massa-ai/scripts/*.ts`, and hook/generator code assert against skill file content; compression must not alter those spans | Eyeballing 140 files against ~12 content-coupled test files is the defect class memory warns about | y |
| Mobile+Figma intake gate home | Fold into existing `references/mobile-context.md` (new "Design-Source Intake Gate" section); no new reference file | Reference already lazy-loads on the same mobile trigger set; avoids a new file in 4 host bundles | y (design) |
| SonarQube home | New `references/sonarqube-mcp.md` | No existing reference owns SonarQube; `audit-report-io.md` is report-format-scoped | y (design) |
| `workflow-metadata-headers` interplay | That feature's T1–T4 edits sit uncommitted in the main checkout on its own branch; this feature branches from `main` in an isolated worktree and does not touch them | Both features edit the same 36 files; merge order decided by user | open question |
| Compression executor | Model applies `/caveman:caveman-compress` semantics per file inside Execute; deterministic post-checks (protected literals, reference-path resolution, bundle regen) gate the result | No deterministic compressor exists; gates make quality falsifiable | y |

**Open questions:** none — all resolved 2026-08-05 (user): Execute approved with
Phase workers; high-value extraction set + validator top pack in scope; this
feature merges before `workflow-metadata-headers` (that branch's uncommitted
tree stays untouched and re-runs prepend-only over the compressed bodies).

## User Stories

### P1: Conditional definitions load lazily ⭐ MVP

As the skill owner, I want mobile, Figma, and SonarQube definitions out of the
always-loaded workflow bodies, so sessions that never touch those domains stop
paying for them.

**Acceptance Criteria** (STO-1, STO-2, STO-3):

1. WHEN `implementation-audit.md` or `implementation-fix.md` is loaded THEN the
   SonarQube MCP protocol SHALL appear only as a ≤3-line availability-gated
   pointer to `references/sonarqube-mcp.md`, and that reference SHALL contain
   the full detection, firewall, normalization, and ID-mapping rules currently
   inline.
2. WHEN `feature.md` or `spec-driven.md` is loaded THEN the mobile UI
   design-source intake gate SHALL appear only as a ≤2-line trigger pointer,
   with the full gate (ask/none-handling/routing/screenshot rules) living in
   `references/mobile-context.md`.
3. WHEN a workflow carries a Figma or mobile conditional clause ≤3 lines THEN
   it SHALL remain inline (compressed), and clauses >3 lines SHALL move to the
   owning reference with a pointer.
4. WHEN the moved content is diffed against its source THEN every normative
   rule SHALL survive verbatim-or-equivalent in exactly one place (no dropped
   rule, no second copy).

**Independent Test**: grep the two workflow pairs for `SonarQube`/`Figma
Source`/intake-gate phrases → only pointer lines match; diff extracted
reference sections against pre-move blocks → rule-complete.

### P1: Caveman-compressed skill surface ⭐ MVP

As the skill owner, I want all 36 workflows, 87 references, and 17 agent
charters caveman-compressed, so every load costs fewer tokens.

**Acceptance Criteria** (STO-4, STO-5):

1. WHEN compression completes THEN all 140 files SHALL be prose-compressed with
   technical substance intact: every code block, command, YAML/policy block,
   dispatch block, table, file path, and protected literal byte-identical to
   before compression.
2. WHEN the tree is searched for `*.original.md` THEN zero matches SHALL exist.
3. WHEN every relative `references/…`, `workflows/…`, or `skills/…` path cited
   in a compressed file is resolved THEN it SHALL exist on disk (scripted
   check).
4. WHEN gates run THEN `bun run test:scripts`, `bun run lint`, and
   `bun scripts/generate-skill-artifacts.ts --check` (0 drift after regen)
   SHALL pass.

**Independent Test**: protected-literal script exits 0; path-resolution script
exits 0; gate commands exit 0.

### P2: Measured savings

As the skill owner, I want the reduction measured, so the optimization is a
figure, not a feeling.

**Acceptance Criteria** (STO-6):

1. WHEN validation runs THEN before/after byte counts per class (workflows,
   references, agents) SHALL be produced by script from git-committed states
   and recorded in `validation.md`, with the ≥20% overall goal marked met or
   missed (missed is reportable, not a gate failure).

**Independent Test**: re-run the measurement script against the base and head
commits; figures reproduce.

## Requirement Traceability

| ID | Requirement | Story AC | Planned coverage |
| --- | --- | --- | --- |
| STO-1 | SonarQube MCP protocol extracted to `references/sonarqube-mcp.md`, availability-gated pointer inline | S1.AC1, S1.AC4 | T2 + grep/diff sensors |
| STO-2 | Mobile design-source intake gate extracted to `references/mobile-context.md`, trigger pointer inline | S1.AC2, S1.AC4 | T3 + grep/diff sensors |
| STO-3 | Figma clauses >3 lines extracted; ≤3-line clauses stay inline | S1.AC3, S1.AC4 | T3 + grep/diff sensors |
| STO-4 | All 140 files caveman-compressed, no backups, protected spans byte-preserved | S2.AC1, S2.AC2 | T4–T6 + protected-literal script |
| STO-5 | All gates green, bundles regenerated with 0 drift | S2.AC4 | T7 gate runs |
| STO-6 | Scripted before/after measurement in validation.md | S3.AC1 | T7 + verification-agent |
| STO-7 | Reference-path resolution: every cited relative path exists | S2.AC3 | T1 script + T7 re-run |
