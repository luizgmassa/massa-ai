# Figma Pre-Analysis And Sequential Retrieval

Load whenever a workflow receives one or more Figma links, node
IDs, or a readable desktop selection as a design source — the Figma audit/fix
family (`mobile-figma-audit`, `mobile-figma-fix`), `design`, and the
design-source gates of implementation workflows (`feature`, `spec-driven`).
This reference owns the orchestration protocol only; Figma Evidence Packet
field contracts stay in `references/mobile-figma-matcher/core.md`.

The protocol is the single normative copy. Workflows point here; they do not
restate it.

## Why Two Stages

Full Figma extraction on unscoped links overloads one context with mixed
screens, buries feature boundaries, and makes evidence non-attributable. A
cheap pre-analysis pass maps what the links contain first, so each retrieval
pass reads one coherent slice.

## Stage 1 — Pre-Analysis (always first, exactly one subagent)

Dispatch one read-only subagent (investigator-class; Figma MCP — Model Context
Protocol — access, no repository mutation) over the user-provided Figma links.
Its job: understanding, **not** extraction:

- Summarize composition: pages, screens, frames, component sets, shared tokens.
- Summarize product context: what the screens are for, the features they serve,
  and the user flows connecting them.
- It does not build Figma Evidence Packet fields, does not resolve variables or
  exact geometry, and does not compare against source code.

Its output is a compact packet:

1. **Context summary** — screens/features/flows in prose, sized for the main
   agent's context budget.
2. **Partition proposal** — how many retrieval subagents should read which
   links/nodes/screen groups, partitioned by:
   - **Size:** each slice must fit one subagent's context comfortably.
   - **Coupling:** screens sharing tokens, components, or a design system
     section stay in one slice.
   - **Feature flow:** one user flow per slice when possible, so evidence
     stays attributable to a feature.
   A single small screen legitimately yields a one-slice proposal.

The main agent reviews the proposal, adjusts slice boundaries if project
knowledge contradicts them, and records the final partition before Stage 2.

WHERE the parent workflow is `spec-driven` or `feature` with Figma ingestion
enabled, create one file per supplied Figma link under
`.specs/<type>/<slug>/figma/NN-<link-slug>.md` per the per-link file template
in `references/figma-wiring.md`, before Stage 2 begins. Audit, fix, and
`design` parent routes are unaffected by this pointer.

## Stage 2 — Sequential Retrieval (N subagents, one at a time)

The main agent orchestrates the retrieval subagents **strictly sequentially —
never in parallel**. For each slice, in the recorded order:

1. Dispatch one read-only retrieval subagent scoped to that slice's
   links/nodes, carrying the Stage 1 context summary and the slice's purpose.
2. Wait for completion; fold its output into the workflow's Figma Evidence
   Packet (or Screenshot Context Packet rows) before dispatching the next.
3. Let each completed slice inform the next dispatch prompt — resolved shared
   tokens, discovered variants, and naming conventions carry forward.

Sequential dispatch is a hard rule, not a tuning choice: it respects Figma MCP
session/rate limits, and it is what lets slice N+1 reuse what slice N learned.
Retrieval subagents never spawn further subagents.

WHERE Figma ingestion is enabled per `references/figma-wiring.md`, populate
each completed slice's Number, Figma node id(s), Category, Explanation, and
Notes rows into its link's figma file wiring table as that slice's retrieval
completes.

## Fallback

If subagent spawning is unavailable (forbidden, plugin missing, unknown agent
type), run both stages inline in the main agent in the same order — pre-analysis
summary first, then per-slice retrieval — and record the skipped delegation
with its reason. Do not skip Stage 1 because delegation is unavailable.
