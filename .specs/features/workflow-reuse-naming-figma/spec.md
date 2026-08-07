# Workflow Reuse-Scan, English Naming, and Figma Wiring Specification

Feature slug: `workflow-reuse-naming-figma` · workflow: spec-driven (Large) ·
session: `spec-workflow-reuse-naming-figma`

## Problem Statement

The 16 implementation workflows let an agent write new code without first scanning
for existing reusable elements, so duplicated components/helpers/use-cases ship
undetected. Nothing forbids non-English (typically Portuguese) identifiers from
reaching code, specs, tasks, or designs. And when Figma links drive spec-driven or
feature work, the design evidence is never wired to specs/tasks/designs at node-id
granularity — coverage of the design source is unverifiable, and the design
workflow's implementation directions are locked inside `workflows/design.md`
where spec-driven/feature cannot reuse them.

## Goals

- [ ] Every implementation workflow runs a mandatory subagent-based reuse scan before writing new code; in spec-driven it lands before Design and Tasks.
- [ ] Every implementation workflow converts non-English names to English before they reach code or spec/task/design artifacts.
- [ ] When Figma links are supplied to spec-driven/feature, every Figma node-id category row is wired to a spec, task, or design item — with unused rows surfaced to the user — and Execute implements each task's wired node IDs through Figma MCP.
- [ ] The design workflow's directions are abstracted into references that spec-driven/feature lazy-load only when Figma ingestion is enabled.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Editing installed host copies under `~/.claude/` | Install flow (`install-skills.sh`/plugins) owns propagation; repo `skills/` is the single source |
| Hook-level (PreToolUse) enforcement of the reuse scan | Hook binary contract is observation-only (worktree-isolation-gate design D2 precedent); gate is textual + harness-contract sensor |
| Widening `mobile-figma-matcher/*` contracts to web/desktop | Non-mobile Figma targets proceed with wiring + best-effort implementation; new platform contracts are a separate feature |
| Changes to read-only workflows (`*-audit`, exploration, the-fool, pr-review, discovery, to-prd, ticket, commit, adr, rfc, tdd, skill-architect, judge-with-debate, long-session, onboarding, furps-refinement) | User scope is the implementation class; audits never mutate |
| Retiring or merging `workflows/design.md` | Explicitly deferred: post-implementation analysis is presented with options and the user makes the call (PROC-01) |
| New MCP tools or Figma MCP server changes | Existing Figma MCP surface is consumed as-is |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Workflow set for reuse scan + naming rule | All 16 `IMPLEMENTATION_WORKFLOWS` (13 user-listed + design, general, maestro) | Uniform with Isolation Gate class; one gate assertion covers one set | y (user, 2026-08-07) |
| Naming rule language scope | Any non-English name converted to English; Portuguese named as primary case | Broader protection, same cost | y (user, 2026-08-07) |
| Figma ingestion platform scope | Any Figma-supplied spec-driven/feature work, all platforms; mobile keeps matcher contracts, non-mobile implementation contracts are best-effort | User choice over mobile-only gating | y (user, 2026-08-07) |
| `<type>` in `.specs/<type>/<slug>/figma/` | The workflow's canonical artifact home: `features` for spec-driven and Standard+ feature work; Quick-tier work with Figma links exits Quick (design decision present) | Quick mode forbids design decisions; Figma ingestion is one | n (accepted default) |
| "Design(s) ID" column meaning | IDs of design-artifact decisions/components (`design.md` D-numbers) for spec-driven; empty for feature runs without a design artifact | Matches existing design.md D-number convention in `.specs/` | n (accepted default) |
| Reuse-scan executor | Read-only investigator-class dispatch (`massa-ai-investigator`), ≥1 subagent, with the repo-standard inline fallback when spawning is unavailable | Matches existing dispatch + fallback pattern in all 16 workflows | n (accepted default) |
| Duplication-gate handling | Pre-measure excess; if new cross-file duplication is unavoidable, raise `EXCESS_CEILING` in the same commit with the documented attribution comment | Repo convention documented in `skills-duplication-metric.test.ts` docblock | n (accepted default) |
| Sub-workflow reuse-scan depth | Reuse scan output feeds Tasks and Design; it is not re-run per task unless the task introduces a new code area | Cost control; scan is a phase gate, not a per-edit tax | n (accepted default) |

**Open questions:** none — all resolved or logged above.

## Discuss Context Summary

Three gray areas were resolved with the user on 2026-08-07: workflow set = all 16
(the enforced `IMPLEMENTATION_WORKFLOWS` class), naming rule = any non-English →
English, Figma scope = any Figma-supplied work in spec-driven/feature (not
mobile-gated). Premise measurement preceded the ask: the user's 13-file list vs
the repo's 16-file enforced class.

## User Stories

### P1: Mandatory reuse scan before new code ⭐ MVP

**User Story**: As an agent running any implementation workflow, I want a
mandatory pre-implementation reuse scan run in separate subagents so that I
extend existing components/helpers/use-cases/repositories instead of
duplicating them.

**Why P1**: Duplicated code is the direct pain named first in the request.

**Acceptance Criteria**:

1. The repository SHALL contain exactly one normative reuse-scan reference (`references/code-reuse-scan.md`) defining: scan targets (existing components, helper methods, classes, use cases, repositories, business logic, and similar reusable elements), separate read-only subagent execution (investigator-class dispatch), the reuse-map output contract (candidate element → location → use/extend/new decision), and the inline fallback with recorded skip reason. <!-- ubiquitous → REUSE-01 -->
2. WHEN any of the 16 implementation workflows reaches the point of planning or writing new implementation code THEN the workflow SHALL direct a mandatory reuse scan per `references/code-reuse-scan.md` before that code is written. <!-- event-driven → REUSE-02 -->
3. WHILE running spec-driven with Design or Tasks phases included, the workflow SHALL complete the reuse scan after Specify closes and before `references/spec-driven/design.md` or `references/spec-driven/tasks.md` produces its artifact, and both phase artifacts SHALL record the reuse-map decisions they consumed. <!-- state-driven → REUSE-03 -->
4. IF subagent spawning is unavailable THEN the workflow SHALL run the scan inline against the same output contract and record the skipped-delegation reason. <!-- unwanted-behavior → REUSE-01 -->

**Independent Test**: Grep all 16 workflows for the reuse-scan action line;
open `references/code-reuse-scan.md` and check the four contract elements; in
spec-driven, verify ordering prose places the scan before Design/Tasks.

---

### P1: English-only naming conversion ⭐ MVP

**User Story**: As an agent implementing in any workflow, I want a rule that
converts non-English names to English before implementation so that classes,
methods, screens, components, and attributes are never shipped in Portuguese
or another non-English language.

**Why P1**: Direct user directive; touches every code-writing path.

**Acceptance Criteria**:

1. `references/naming-standards.md` SHALL contain an English-language rule: all new or renamed identifiers, classes, methods, screens, components, attributes, and implementation-facing artifact names are written in English, converting any non-English source term (Portuguese as the primary case) before implementing, while preserving existing public contracts, persisted fields, and external names unless compatibility handling is explicitly in scope. <!-- ubiquitous → NAME-01 -->
2. The 16 implementation workflows SHALL each load `references/naming-standards.md` before introducing or renaming identifiers. <!-- ubiquitous → NAME-02 -->
3. WHILE running spec-driven, the workflow SHALL apply the English-conversion rule before writing spec, task, and design artifacts, so no non-English implementation-facing name enters `.specs/features/<slug>/{spec,design,tasks}.md`. <!-- state-driven → NAME-03 -->

**Independent Test**: Read the new rule in naming-standards.md; grep the 16
workflows for the naming-standards load line; check spec-driven phase prose
orders conversion before artifact writes.

---

### P1: Figma node-id wiring for spec-driven and feature ⭐ MVP

**User Story**: As an agent running spec-driven or feature work with Figma
links supplied, I want every link pre-analyzed into a per-link figma file with
a category/node-id wiring table connected to specs, tasks, and designs so that
design coverage is traceable and Execute implements exactly the wired nodes.

**Why P1**: The largest directive; unverifiable design coverage is the pain.

**Acceptance Criteria**:

1. WHERE Figma ingestion is enabled (one or more Figma links or node IDs supplied to spec-driven or feature work, any platform), the workflow SHALL load the Figma wiring reference lazily; workflows without Figma sources SHALL NOT load it. <!-- optional-feature → FIGMA-01, ABST-02 -->
2. WHEN Stage 1 of `references/figma-pre-analysis.md` runs THEN the workflow SHALL create one file per supplied Figma link under `.specs/<type>/<slug>/figma/`. <!-- event-driven → FIGMA-02 -->
3. WHEN Stage 2 retrieval completes for a link THEN that link's figma file SHALL contain a wiring table with columns Number, Figma node id(s), Category, Spec(s) ID, Task(s) ID, Design(s) ID, Explanation, Notes, using the 13-category table (Structure, Components, Tokens / Theming, Typography, Visual effects, Behavior / Prototype, Flows, Content, Assets, States, Spatial, Semantics, Mappings). <!-- event-driven → FIGMA-03, FIGMA-04 -->
4. WHEN spec, task, or design items are authored under Figma ingestion THEN each item SHALL reference its figma file + Number; specs SHALL wire high-level categories (Structure, Behavior / Prototype, Flows, and similar) and tasks/designs SHALL wire the remaining low-level categories not covered by specs (Components, Visual effects, Tokens / Theming, Typography, Content, Assets, States, Spatial, Semantics, Mappings), connecting them to codebase elements (classes, methods, variables, architecture, strings, screens, states). <!-- event-driven → FIGMA-05 -->
5. WHILE creating or breaking down Tasks and Designs under Figma ingestion, the workflow SHALL run the reuse scan per `references/code-reuse-scan.md` so wired implementation work reuses existing code. <!-- state-driven → FIGMA-06 -->
6. IF any figma-file Number remains unwired to every spec, task, and design at the end of the wiring pass THEN the workflow SHALL stop, report the unused Numbers to the user, and ask for direction with alternatives and recommendations before Execute. <!-- unwanted-behavior → FIGMA-07 -->
7. WHEN Execute implements a task with wired Figma node IDs THEN the workflow SHALL retrieve those node IDs through Figma MCP and implement them per the wiring recorded in the figma file, spec, task, and design entries. <!-- event-driven → FIGMA-08 -->

**Independent Test**: Dry-read the updated figma-pre-analysis.md + wiring
reference: per-link file creation in Stage 1, table contract in Stage 2,
wiring rules, unused-Number stop rule, Execute retrieval step — all present
and lazy-loaded only under Figma ingestion.

---

### P2: Design-workflow abstraction

**User Story**: As the spec-driven or feature workflow, I want the design
workflow's implementation directions available as shared references so that I
absorb its steps under Figma ingestion without duplicating its prose.

**Why P2**: Enables P1 Figma wiring without a second normative copy; the
design workflow itself keeps working unchanged for direct routes.

**Acceptance Criteria**:

1. The design workflow's implementation directions (evidence packet, target-surface classification, mapping matrix, verification steps) SHALL live in shared reference files that `workflows/design.md`, spec-driven, and feature all point to, with exactly one normative copy of each direction. <!-- ubiquitous → ABST-01 -->
2. WHERE Figma ingestion is enabled in spec-driven or feature, those workflows SHALL absorb the abstracted design directions by reference (lazy-loaded), not by restating them. <!-- optional-feature → ABST-02 -->
3. The `workflows/design.md` file SHALL retain its routing scope, Isolation Gate line, mutation-reference loads, and `references/project-context.md` line unchanged in form (harness-contract invariants). <!-- ubiquitous → ABST-03 -->

**Independent Test**: Diff design.md before/after: steps delegated to
references, invariant lines intact; grep spec-driven/feature for the lazy
load; duplication metric shows no second normative copy.

---

### P2: Deterministic gate coverage for the new mandates

**User Story**: As the repo's CI, I want the new mandatory lines and
references covered by the existing harness-contract gate so that future edits
cannot silently drop them.

**Why P2**: Repo convention (CONTRIBUTING step 7); textual mandates without
sensors rot.

**Acceptance Criteria**:

1. The `scripts/__tests__/workflow-harness-contract.test.ts` gate SHALL assert the reuse-scan action line is present and uniform across the 16 implementation workflows, and the naming-standards load is present in all 16. <!-- ubiquitous → GATE-01 -->
2. WHEN the full gate set runs (`bun run test:scripts` after `bun run generate:artifacts`) THEN workflow-harness-contract, skills-duplication-metric, workflow-metadata-headers, skill-doc-paths, skills-harness-integrity, and skill-artifact-parity SHALL all pass on the delivered tree. <!-- event-driven → GATE-02 -->
3. IF the edits add cross-file duplicated windows pushing excess past 483 THEN the delivery SHALL raise `EXCESS_CEILING` in the same commit with the documented attribution comment (feature ID, before/after, base commit, causal block). <!-- unwanted-behavior → GATE-03 -->
4. The delivery SHALL bump `metadata.version` (semver) in each edited workflow file in the same change, and the workflow population SHALL remain exactly 40 (new files are references, not workflows). <!-- ubiquitous → GATE-04 -->
5. The validation SHALL observe each new sensor assertion red at least once (scratch mutation or pre-fix commit order) before trusting it green. <!-- ubiquitous → GATE-05 -->

**Independent Test**: Run the gate suite; inspect the new assertions; check
the observed-red evidence in the validation report.

---

### P3: Post-implementation design-workflow disposition

**User Story**: As the user, I want an analysis of whether `workflows/design.md`
still earns its route after the abstraction so that I can decide its fate.

**Why P3**: Explicit user instruction; decision is reserved to the user.

**Acceptance Criteria**:

1. WHEN implementation and validation complete THEN the agent SHALL present a keep/absorb/retire analysis of the design workflow with options, trade-offs, and a recommendation, and SHALL NOT change the design workflow's route without the user's decision. <!-- event-driven → PROC-01 -->

**Independent Test**: The closing report contains the analysis + question;
no route change shipped.

---

## Edge Cases

- IF Figma MCP is unavailable during Execute for a wired task THEN the workflow SHALL stop that task and report the missing capability rather than implementing from memory of the design. <!-- FIGMA-08 -->
- IF a supplied Figma link yields zero readable nodes in Stage 1 THEN the workflow SHALL record the empty result in that link's figma file and surface it with the unused-Number report rather than silently skipping the link. <!-- FIGMA-02/07 -->
- IF a non-English name is itself a public contract (API field, persisted column, event name) THEN the naming rule SHALL preserve it and record the exception, per the existing public-contract clause. <!-- NAME-01 -->
- IF the reuse scan finds no reusable elements THEN the reuse map SHALL record the empty result explicitly (evidence-or-zero), not omit the section. <!-- REUSE-01 -->
- WHEN a workflow is resumed after the scan but before Tasks/Design THEN the recorded reuse map SHALL be reused, not re-run, unless the code area changed. <!-- REUSE-03 -->

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| REUSE-01 | P1: Reuse scan | Design | Pending |
| REUSE-02 | P1: Reuse scan | Design | Pending |
| REUSE-03 | P1: Reuse scan | Design | Pending |
| NAME-01 | P1: English naming | Design | Pending |
| NAME-02 | P1: English naming | Design | Pending |
| NAME-03 | P1: English naming | Design | Pending |
| FIGMA-01 | P1: Figma wiring | Design | Pending |
| FIGMA-02 | P1: Figma wiring | Design | Pending |
| FIGMA-03 | P1: Figma wiring | Design | Pending |
| FIGMA-04 | P1: Figma wiring | Design | Pending |
| FIGMA-05 | P1: Figma wiring | Design | Pending |
| FIGMA-06 | P1: Figma wiring | Design | Pending |
| FIGMA-07 | P1: Figma wiring | Design | Pending |
| FIGMA-08 | P1: Figma wiring | Design | Pending |
| ABST-01 | P2: Design abstraction | Design | Pending |
| ABST-02 | P2: Design abstraction | Design | Pending |
| ABST-03 | P2: Design abstraction | Design | Pending |
| GATE-01 | P2: Gate coverage | Design | Pending |
| GATE-02 | P2: Gate coverage | Design | Pending |
| GATE-03 | P2: Gate coverage | Design | Pending |
| GATE-04 | P2: Gate coverage | Design | Pending |
| GATE-05 | P2: Gate coverage | Design | Pending |
| PROC-01 | P3: Design disposition | Validate | Pending |

**Coverage:** 23 total, 0 mapped to tasks, 23 unmapped ⚠️ (Tasks phase pending)

## Implicit-Requirement Dimensions (Large — full sweep)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | FIGMA-02/03: per-link file + table shape; malformed/unreadable link edge case recorded. Others N/A because the feature edits markdown contracts, not runtime input paths |
| Failure / partial-failure states | FIGMA-07 stop rule; Figma-MCP-unavailable edge case; inline fallback in REUSE-01 |
| Idempotency / retry / duplicate handling | Resume edge case (reuse map reused, not re-run); generators are prune-before-emit (existing property) |
| Auth boundaries & rate limits | N/A because no runtime auth surface changes; Figma MCP session/rate limits already governed by sequential-dispatch rule in figma-pre-analysis.md (preserved) |
| Concurrency / ordering | REUSE-03 ordering (scan before Design/Tasks); Stage 2 sequential-dispatch rule preserved |
| Data lifecycle / expiry | Figma files are canonical `.specs/` artifacts, git-versioned like all others (artifact-store rules apply) |
| Observability | Conversation Feedback labels at phase boundaries (existing policy); unused-Number report is explicit |
| External-dependency failure | Figma MCP unavailable → stop + report (edge case) |
| State-transition integrity | Wiring statuses live in the figma-file table columns; spec Traceability Status chain unchanged |

## Verification Approach

- Deterministic: `bun run generate:artifacts` then `bun run test:scripts` (harness-contract, duplication ≤ ceiling, metadata headers 40, doc-paths, harness-integrity, artifact parity) — all green on the delivered tree.
- Sensor: extended harness-contract assertions (GATE-01) observed red via scratch mutation before trusted (GATE-05), including ordering assertions for the hook chain (plan-critic F1 revision: spec-driven scan clause between Specify and Design/Tasks; figma-pre-analysis Stage 1 pointer before Stage 2; phase-guide hook literals present).
- Deterministic backing for FIGMA-07: `bun skills/massa-ai/scripts/validate_figma_wiring.ts <slug>` — parses wiring tables, prints parsed population, exits non-zero on unwired Numbers (plan-critic F1 revision; graceful no-code-execution fallback preserved).
- `bun skills/massa-ai/scripts/validate_spec.ts workflow-reuse-naming-figma --root .` green for this spec.
- Independent validation per `references/spec-driven/validate.md`: verification-agent (author ≠ verifier) re-derives AC coverage, runs discrimination mutations, writes `validation.md`.
- Manual dry-read: one simulated Figma-enabled spec-driven pass over the new prose confirms load order (specify → figma pre-analysis → wiring → reuse scan → design/tasks → execute).

## Success Criteria

- [ ] All 16 implementation workflows carry the reuse-scan mandate and naming-standards load; spec-driven orders the scan before Design/Tasks.
- [ ] English-conversion rule live in naming-standards.md and referenced by spec authoring prose.
- [ ] A Figma-enabled spec-driven/feature run produces per-link figma files with complete wiring tables, stops on unused Numbers, and Execute consumes wired node IDs via Figma MCP.
- [ ] Design workflow unchanged in behavior for direct routes; its directions absorbed by reference elsewhere; no second normative copy (duplication gate green).
- [ ] Full gate suite green; CHANGELOG entry present; design-workflow disposition question presented to the user.

## Artifact-Store Evidence

- Artifact: `.specs/features/workflow-reuse-naming-figma/spec.md` · version: 1 (initial) ·
  validate_spec: 0 errors / 0 warnings · sha256 recorded in STATE at commit time.
