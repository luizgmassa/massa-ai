# Workflow Reuse-Scan, English Naming, and Figma Wiring — Design

**Spec**: `.specs/features/workflow-reuse-naming-figma/spec.md`
**Status**: Draft

---

## Design Summary

Three new lazy-loaded shared references carry the single normative copy of each
directive; the 16 implementation workflows gain minimal pointer lines; the
design workflow delegates its direction set to one of those references so
spec-driven/feature absorb it under Figma ingestion; the harness-contract gate
grows matching assertions. No new workflow files (population stays 40), no
runtime code changes, no hook changes.

New references (all under `skills/massa-ai/references/`):

| File | Owns | Loaded by |
| --- | --- | --- |
| `code-reuse-scan.md` | Mandatory pre-implementation reuse scan: subagent dispatch contract (investigator-class, read-only), scan targets (components, helper methods, classes, use cases, repositories, business logic), reuse-map output (candidate → location → use/extend/new), inline fallback + recorded skip reason, evidence-or-zero empty result | All 16 implementation workflows (uniform action line); spec-driven orders it after Specify, before Design/Tasks; re-invoked during Figma-wired Tasks/Design breakdown (FIGMA-06) |
| `figma-wiring.md` | Per-link figma file template under `.specs/<type>/<slug>/figma/NN-<link-slug>.md`; the 13-category table; wiring-table contract (Number, Figma node id(s), Category, Spec(s) ID, Task(s) ID, Design(s) ID, Explanation, Notes); category-tier rules (specs = Structure, Behavior / Prototype, Flows + similar; tasks/designs = the remaining low-level categories wired to codebase elements); unused-Number stop rule; Execute retrieval protocol (Figma MCP fetch + implement per task's wired node IDs) | spec-driven + feature only, lazily, WHERE Figma ingestion is enabled; `figma-pre-analysis.md` Stages 1–2 point here conditionally |
| `design-implementation.md` | The design workflow's abstracted direction set: Target Surface Packet, Figma Evidence Packet / Screenshot Context Packet build, Design-To-Code Mapping Matrix, coherent-slice implementation rules, per-slice verification and completion criteria | `workflows/design.md` (delegation — behavior unchanged); spec-driven + feature under Figma ingestion (ABST-02) |

## Requirements Traceability

| Requirement | Design element |
| --- | --- |
| REUSE-01 | `code-reuse-scan.md` contract (D1) |
| REUSE-02 | Uniform action line ×16 (D2) |
| REUSE-03 | spec-driven step ordering + phase-guide hooks (D2, D5) |
| NAME-01 | English rule in `naming-standards.md` (D3) |
| NAME-02 | naming-standards load bullet in the 10 missing workflows (D3) |
| NAME-03 | Conversion clause in spec-driven authoring prose (specify/design/tasks hooks) (D5) |
| FIGMA-01, ABST-02 | Platform-neutral enablement clause + lazy loads in spec-driven/feature (D4) |
| FIGMA-02..04 | `figma-wiring.md` file template + table + category table; Stage 1/2 conditional pointers (D5, D8) |
| FIGMA-05 | Category-tier wiring rules in `figma-wiring.md` + phase-guide hooks (D5, D8) |
| FIGMA-06 | Cross-link in `figma-wiring.md` + tasks/design phase hooks (D2, D8) |
| FIGMA-07 | Unused-Number stop rule in `figma-wiring.md`, checked at wiring-pass close (D8) |
| FIGMA-08 | Execute retrieval protocol in `figma-wiring.md` + `execute.md` hook (D5, D8) |
| ABST-01 | `design-implementation.md` extraction (D6) |
| ABST-03 | design.md keeps frontmatter/routing/invariant lines (D6) |
| GATE-01..05 | Harness-contract extension + measurement discipline (D7) |
| PROC-01 | Closing analysis + user question (Validate phase) |

## Current Codebase Evidence

- `IMPLEMENTATION_WORKFLOWS` (16 files) + byte-identity precedent: `scripts/__tests__/workflow-harness-contract.test.ts:39-63,246-293`.
- Duplication metric: `scripts/skills-duplication-metric.ts` (window hashing, blank-drop normalization, cross-file-only); ceiling `EXCESS_CEILING = 483`, `CEILING_WINDOW = 4` at `scripts/__tests__/skills-duplication-metric.test.ts:70-71`; raise convention documented in its docblock (attribution comment, same commit).
- Today's invisible 3-run: `project-context` line + mutation-references paragraph + Isolation Gate line are consecutive identical normalized lines in most of the 16 — one more adjacent identical line forms a visible 4-window block. Placement rule below avoids that.
- Frontmatter gate: `scripts/__tests__/workflow-metadata-headers.test.ts` (name=stem, description 20–1024 single-line, license MIT, semver version; population 40).
- naming-standards currently loaded by 6 of 16 (feature, code-quality-fix, implementation-fix, maestro, maestro-fix, spec-driven-via-refs); missing from debug, refactor, design, general, bugs-fix, security-fix, requirements-fix, architecture-fix, tests-fix, mobile-figma-fix.
- Figma intake today: `references/mobile-context.md` Design-Source Intake Gate (mobile-only) → `workflows/design.md` + `references/figma-pre-analysis.md` (two-stage protocol, sequential dispatch hard rule).
- Router budget: `skills/massa-ai/SKILL.md` = 20,293 B against a 21,000 B ceiling (`skill-size-budgets.test.ts`) — 707 B headroom.
- Reachability: every new `.md` under `skills/` must be cited somewhere (`skills-duplication-metric.test.ts` orphans sub-suite) and every cited path must resolve (`skill-doc-paths`, `skills-harness-integrity`).
- AD-016: bundles are generated on demand — `bun run generate:artifacts` must run before parity-dependent consumers.

## Approach Exploration (Large — recommendation first)

**A (recommended): three new lazy-loaded references + pointer lines.**
Single normative copy per directive, lazy-load seams exactly where the spec
demands them (ABST-02, FIGMA-01), minimal per-workflow diff, duplication-safe.
Cost: 3 new files + citations.

**B: extend existing references only** (reuse scan → `codebase-investigation.md`,
figma wiring → inline in `figma-pre-analysis.md`, design directions →
`mobile-figma-matcher/core.md`). Fewer files, but `figma-pre-analysis.md` is
loaded by the audit/fix family — inlining the wiring protocol taxes read-only
workflows' context and defeats the lazy-load requirement; mixing scan protocol
into the retrieval-order reference muddies ownership. Rejected.

**C: `references/figma-ingestion/` directory with 3–4 split files.** Finer
lazy loading, but more citations to maintain for content that fits one file
each; the category table is ~20 lines. Rejected now; revisit if
`figma-wiring.md` outgrows one coherent load unit.

## Tech Decisions (only non-obvious ones)

| # | Decision | Choice | Rationale |
| --- | --- | --- | --- |
| D1 | Reuse-scan normative home | New `references/code-reuse-scan.md` | Single normative copy; every workflow points, none restates (repo pattern: figma-pre-analysis, discrimination-sensor) |
| D2 | Reuse-scan mandate shape | One byte-identical action line `**Reuse Scan — before writing new implementation code:** run the mandatory scan per \`references/code-reuse-scan.md\`…` inserted per file at a position whose immediate normalized neighbors are file-specific (inside/adjacent to each file's own step list, NOT adjacent to the identical project-context/mutation/Isolation-Gate run) | Byte-identity gives the gate a uniformity assertion (Isolation Gate precedent); neighbor-varying placement keeps the new line below the 4-line duplication window; spec-driven's ordering (post-Specify, pre-Design/Tasks) lives in its own numbered steps, not in the uniform line |
| D3 | English naming rule home | New `## Language` rule block in `references/naming-standards.md`; +1 load bullet in the 10 workflows missing the reference | naming-standards is the established identifier-rule home; the gate asserts presence (literal `references/naming-standards.md`) ×16, not byte-uniformity, because 6 existing load shapes differ legitimately |
| D4 | Figma enablement definition | "Figma ingestion is enabled when one or more Figma links or node IDs are supplied for the work" — platform-neutral, declared in spec-driven/feature; mobile targets additionally keep the mobile-context intake gate + matcher contracts; non-mobile targets proceed with wiring + best-effort implementation contracts and record that class | User decision 2026-08-07; keeps mobile behavior unchanged while unlocking any-platform wiring |
| D5 | Hook shape in shared phase guides | One-line conditional pointers in `figma-pre-analysis.md` (Stages 1–2 → figma-wiring), `spec-driven/{specify,design,tasks,execute}.md` (wiring + reuse-scan ordering + English conversion), `spec-driven.md` + `feature.md` (enablement + lazy loads) | Pointers keep normative copies single and the duplication metric flat; phase guides stay load-cheap for non-Figma runs |
| D6 | design.md abstraction cut | Steps 5–13 (packets, matrix, slices, verification) move to `design-implementation.md`; `workflows/design.md` keeps frontmatter, routing scope, project-context line, mutation-references paragraph, Isolation Gate line, session-id, intake/recall steps, and delegates the rest; exported behavior unchanged for the direct route | ABST-03 harness invariants are position-independent but line-exact; the delegation cut leaves them untouched |
| D7 | Gate extension | `workflow-harness-contract.test.ts` gains: (a) reuse-scan line presence + byte-uniformity ×16; (b) naming-standards presence ×16; (c) existence of the 3 new references. Each new assertion observed red via scratch mutation before trust. Duplication measured before/after each edit task; if excess > 483, raise `EXCESS_CEILING` in the same commit with the documented attribution comment | CONTRIBUTING step 7; a-new-sensor-needs-an-observed-red; sanctioned ceiling-raise convention |
| D8 | Figma artifact shape | `.specs/<type>/<slug>/figma/NN-<link-slug>.md` (NN = supply order); wiring table at top; Stage 2 fills Number/node-ids/Category/Explanation/Notes; Specify/Design/Tasks passes fill Spec/Task/Design ID columns; unused-Number check runs when the last included authoring phase closes (Tasks when present, else Design, else Specify) and blocks Execute | Canonical `.specs/` artifact rules apply (git-versioned, no second store); the check must precede Execute per FIGMA-07 |
| D9 | Project decision record | Append AD-019 to STATE `## Decisions`: implementation-class directives ship as one normative reference + pointer lines + harness-contract assertion; lazy-load seams for optional-capability directives (Figma) | Future features adding class-wide mandates follow the same shape instead of inventing a fourth pattern |
| D10 | Version bumps | Minor bump (`x.y.0` → `x.(y+1).0`) for every workflow file whose body changes; references carry no frontmatter version (unchanged convention) | Metadata-headers gate requires valid semver; L-018 convention bumps on body change |
| D11 | Behavioral-chain sensors (plan-critic F1) | (a) Harness-contract extension also asserts *ordering*: spec-driven's reuse-scan clause indexes after its Specify step and before its Design/Tasks decision steps; figma-pre-analysis Stage 1 pointer indexes before the Stage 2 pointer; each spec-driven phase-guide hook literal present. (b) New `skills/massa-ai/scripts/validate_figma_wiring.ts`: parses every `.specs/<type>/<slug>/figma/*.md` wiring table for a named slug, exits non-zero when any Number row has empty Spec/Task/Design ID columns, prints the unused rows + parsed population (never a bare verdict); `figma-wiring.md` names it as the deterministic backing for the unused-Number stop rule, with the standard no-code-execution-tool fallback clause | 11 of 23 requirements otherwise rest on presence-only checks; repo idiom is "deterministic backing (run it, do not eyeball it)"; printing population prevents vacuous-pass (spec-scripts-parse-strict-shapes lesson) |

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| Duplication: identical 3-run (project-context + mutation paragraph + Isolation Gate) sits one line under the 4-window in the 16 files. Live excess measured by the plan critic: **226 / 483 ceiling (257 headroom)** — the earlier "zero headroom" framing was stale (F2) | `scripts/__tests__/skills-duplication-metric.test.ts:70` | A naive adjacent insertion ×16 adds a visible block (~+60 excess) — absorbable but sloppy | D2 neighbor-varying placement preferred; T6 runs a scratch naive-placement delta measurement in 2–3 files first (F2 revision); measure excess before/after every cross-file edit task; sanctioned same-commit ceiling raise with attribution as fallback |
| Presence-only sensors cannot catch a future reorder/drop of the hook chain (plan-critic F1, critical) | pointer hooks in T7–T10 files | An unrelated later edit reorders or drops a clause while every literal survives; feature silently stops being served | D11: ordering assertions in the harness-contract extension + deterministic `validate_figma_wiring.ts` backing for the unused-Number gate |
| T5→T6 committed red-by-design window (plan-critic F4) | branch history | Interrupted session leaves a known-red test as the branch resting state | T5 carries a bounded-lifetime rule: complete T6 in the same session or squash before stopping |
| SKILL.md router budget 707 B headroom | `skills/massa-ai/SKILL.md` (20,293/21,000 B) | Adding 3 Shared References lines could approach the ceiling | Add exactly 3 single-line entries (~130 B); measure size in the same task; if over, cite references only from workflows (reachability satisfied without router lines) |
| `figma-pre-analysis.md` shared by audit/fix/design routes | `references/figma-pre-analysis.md:3-6` | Inline wiring prose would tax read-only workflows | Conditional one-line pointers only; normative copy stays in `figma-wiring.md` |
| Protected invariant substrings in the 4 mutation references | `workflow-harness-contract.test.ts:304-393` | Accidental rewording breaks the gate | This design touches none of the 4 files' protected spans; design.md workflow edit preserves its mutation paragraph verbatim |
| Roster-count regex catches new prose | `workflow-harness-contract.test.ts:400-511` | A sentence like "16 specialists" fails the gate | New prose never uses `N specialists` phrasing |
| Stale bundles fail parity/CI | `scripts/__tests__/skill-artifact-parity.test.ts:35-58` | Red CI on every skills/ edit | `bun run generate:artifacts` before each gate run; AD-016 chain respected |
| design.md slimming could drop a validator anchor or dispatch block the integrity gate expects | `skills-harness-integrity.test.ts:120-170,727-751` | Red integrity gate | Keep design.md's dispatch blocks (it has none today — verify), keep validator-anchor comments; run integrity gate in the design.md edit task |
| Fresh-worktree native suites | `scripts/tests/verify-tree-sitter-grammars` contract suites | False red in full `test:scripts` | Worktree provisioned; native build present (verified: `node_modules/tree-sitter/build/Release` exists); run the grammar verify test once before trusting full-suite results |

## Verification Design

- Per-edit-task: targeted gate (`bun test scripts/__tests__/workflow-harness-contract.test.ts`, `…skills-duplication-metric.test.ts`, `…workflow-metadata-headers.test.ts`) + `bun scripts/generate-skill-artifacts.ts --check`.
- New assertions (D7): scratch mutation per assertion — remove the reuse-scan line from one file → red; remove a naming bullet → red; delete a new reference → red (doc-paths also red). Restore, re-run green. Evidence recorded in validation.md.
- Full: `bun run generate:artifacts && bun run test:scripts` on the delivered tree.
- Dry-read simulation: one Figma-enabled spec-driven pass and one feature pass over the new prose confirming load order: intake → figma-pre-analysis (Stage 1 files) → Stage 2 tables → specify wiring → reuse scan → design/tasks wiring + reuse re-check → unused-Number gate → execute Figma-MCP retrieval.
- Independent verification per `references/spec-driven/validate.md` (author ≠ verifier), discrimination mutations included.

## Reuse Plan and Rejected Alternatives

- Reuses: figma-pre-analysis two-stage protocol (extended, not replaced); mobile-context intake gate (kept for mobile); naming-standards.md (extended); investigator dispatch pattern + persona bullet template (copied into the reuse-scan dispatch block — the identical dispatch-template duplication class is the documented cause of the 414→483 ceiling raise, so a delta here lands under D7's measurement rule); existing spec-driven phase-guide hook style.
- Rejected: Approaches B and C above; hook-level enforcement (out of scope per spec); a new workflow file for Figma ingestion (would break the 40-count and add a routing surface AD-018 warns against duplicating).

## Artifact-Store Evidence

- Artifact: `.specs/features/workflow-reuse-naming-figma/design.md` · version 1 (initial) · validate_design run recorded below after write.
