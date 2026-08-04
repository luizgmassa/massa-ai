# Workflow Policy Updates Specification

- **Slug:** `workflow-policy-updates`
- **Status:** active
- **Workflow:** spec-driven (Medium-Large — cross-cutting policy edits over the skills surface; Design required for placement decisions, Tasks required for phased delivery)
- **Authored:** 2026-08-04, session `spec-workflow-policy-updates`
- **User direction (verbatim intent):** four policy changes to massa-ai workflows —
  1. ALL implementation workflows: add screen previews (`@Preview`) in screens if Android / Compose / KMP (Kotlin Multiplatform) Compose.
  2. ALL implementation workflows: update PR (Pull Request) description after each requested push, before merging.
  3. Figma audit/fix + implementation workflows (including spec-driven): a first subagent pre-analyzes provided Figma links (composition, context, features — not the actual extraction), then suggests how many subagents should read which parts (by size, coupling, feature flows); subagent spawns are always sequential, never parallel; the main agent then orchestrates the sequential retrieval subagents.
  4. ALL workflows: always explain word abbreviations.
  5. ALL workflows: uniform batch-of-work vocabulary — Phases and Tasks; `1 Phase = X Tasks`; `Y Phases = Z Tasks`.

## Problem Statement

The massa-ai workflow sources under `skills/massa-ai/` lack five behavioral policies the
user wants enforced harness-wide. The repo's doc-layering rule ("keep each rule in one
place and link from the others", `CLAUDE.md`) plus measured reference-loader maps
(2026-08-04, this session) determine placement: `references/implementation-delivery.md`
is loaded by exactly the 16 implementation workflows (spec-driven, feature, debug,
refactor, general, design, maestro, maestro-fix, and the 8 other `*-fix` workflows);
`references/mobile-context.md` is the router-mandated context modifier for non-debug
mobile work; `SKILL.md`'s Core Contract is the only text every workflow session loads.

## Requirements

| ID | Requirement | Acceptance criteria (testable) |
|---|---|---|
| WFP-01 | Every implementation workflow, when the target surface is Android Jetpack Compose or KMP Compose Multiplatform, requires `@Preview` composables for every created or updated screen-level composable | Normative rule present once in `references/mobile-context.md`; pointer in `references/mobile-diagnosis.md` (debug path); no second normative copy (grep) |
| WFP-02 | After each push requested while the feature's PR exists, and always before merge, the PR description is updated to reflect the current commit set | Rule present in `references/implementation-delivery.md` chain (push/repair/merge stages); stale-description merge listed as an anti-pattern; single normative copy |
| WFP-03 | Figma-consuming audit/fix + implementation workflows run a two-stage subagent protocol: (a) one read-only pre-analysis subagent summarizes the provided Figma links' composition/context/features and proposes a partition (how many retrieval subagents read which parts, by size, coupling, feature flow); (b) the main agent dispatches the retrieval subagents strictly sequentially — never parallel — and merges their outputs into the Figma Evidence Packet | New shared reference `references/figma-pre-analysis.md` holds the protocol once; wired (load + step) into `design.md`, `mobile-figma-audit.md`, `mobile-figma-fix.md`, `spec-driven.md` (design-source gate), `feature.md` (design-source gate); every mention says sequential/never parallel |
| WFP-04 | All workflows expand abbreviations on first use in user-facing output | One Core Contract bullet in `skills/massa-ai/SKILL.md` |
| WFP-05 | All workflows use one vocabulary for batching work: Task = atomic unit, Phase = ordered group of Tasks; sizes reported as `1 Phase = X Tasks`, totals as `Y Phases = Z Tasks`; no synonyms (batch/wave/stage/chunk) in agent-facing prose for these units | One Core Contract bullet in `SKILL.md`; `workflows/spec-driven.md` sub-agent offer prose aligned from "batch" to Phase/Task vocabulary |

## Out of Scope

- Renaming `workflows/ticket.md` / `implementation-delivery.md` "Phase/Wave" Jira
  vocabulary — "Wave" there names an external Jira structure created by the ticket
  workflow, not agent batching prose; renaming risks breaking the Jira-key branch
  contract. Recorded as accepted deviation under WFP-05.
- Planning-only workflows (`adr`, `rfc`, `tdd`, `ticket`, audits other than the Figma
  pair) gaining the WFP-03 protocol — user scoped WFP-03 to Figma audit/fix +
  implementation workflows.
- Reinstalling the updated skills to any host (`bun run install:skills` after merge
  covers it; same policy as prior features).
- Changing subagent charters under `skills/agents/` — WFP-03 uses existing
  investigator-class read-only agents via prompt, not a new charter.

## Assumptions (accepted, autonomous session — user not available mid-task)

| Assumption | Chosen default | Rationale |
|---|---|---|
| "Implementation workflows" = the 16 loaders of `implementation-delivery.md` | Place WFP-01/02 in refs those workflows already load | Measured loader map; matches that reference's own header ("every implementation workflow") |
| WFP-03 applies to `feature.md` | Yes — it owns a Figma design-source gate and delegates to `design.md` | Feature is an implementation workflow that accepts Figma links |
| Pre-analysis + retrieval subagents run read-only with Figma MCP (Model Context Protocol) access | Protocol text requires read-only, no repo mutation | Matches audit-phase "do not edit" contract |
| Delivery-through-PR authorized; merge stays the user's | Push branch, open PR, stop before merge | Standing repo protocol (implementation-delivery Stage 7) + prior-feature precedent |
