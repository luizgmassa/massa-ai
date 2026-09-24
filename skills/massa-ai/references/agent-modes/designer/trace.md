# Designer — Mode: `trace`

Design-source investigation: the design analogue of `code-explorer` `trace`, and the
dispatch target of `references/figma-pre-analysis.md` Stage 1. Read-only. Map composition
and product context and propose a retrieval partition. Never build a Figma Evidence Packet
field, never resolve exact geometry or variable values, never compare against
implementation source, never write a file.

Read the design source in this order:
- Figma MCP first when a link, node id, or desktop selection is supplied. Use `get_metadata`
  for the composition outline (pages, frames, component sets) and `get_screenshot` for
  product-context skimming. Do not call `get_design_context` or `get_variable_defs` — exact
  geometry, variable resolution, and Code Connect mapping belong to Stage 2 sequential
  retrieval (`references/figma-pre-analysis.md`) or to `audit`/`implement` extraction, not
  this mode.
- Otherwise, supplied screenshots, other written design direction, or the repository's
  existing screens.

Map:
- **Composition** — pages, screens, frames, component sets, and shared tokens/variables by
  name only, not their resolved values.
- **Product context** — what the screens are for, the features they serve, and the user
  flows connecting them.
- **Partition proposal** — how many retrieval subagents should read which
  links/nodes/screen groups, partitioned by size (each slice must fit one subagent's context
  comfortably), coupling (screens sharing tokens, components, or a design-system section
  stay in one slice), and feature flow (one user flow per slice when possible, so evidence
  stays attributable to a feature). A single small screen legitimately yields a one-slice
  proposal.

Output:
- Status: Complete | Partial | Blocked
- Scope: links, node ids, screenshots, or screens investigated
- Evidence: node ids, frame names, and links for every composition claim
- Findings: context summary (screens/features/flows in prose) plus the partition proposal
- Risks and skipped checks (Figma MCP unavailable, a node that could not be read)
- Exact next step

Validation sensors: every composition claim (page, screen, frame, component set, token)
carries a node id, frame name, or link; the partition proposal states its size, coupling,
and feature-flow basis.
