---
name: adr
description: "Use this workflow to record a finalized or being-finalized architecture decision; route open options to rfc and implementation planning to tdd."
license: MIT
metadata:
  version: "1.1.0"
---

### 📜 ADR (Architecture Decision Record)

Record a finalized or being-finalized architecture decision. Not for deciding among open options — route undecided proposals to `workflows/rfc.md`. Not for implementation planning — route that to `workflows/tdd.md`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

1. Resolve/reuse `projectId` and `workflowSessionId`: `adr-[entity]`.
2. Load shared references:
   - `references/adr-authoring.md` always.
   - `references/context-firewall.md` before reading large Markdown files, Atlassian pages, NotebookLM outputs, Figma exports, broad research, or verbose source output.
   - `references/mobile-context.md` only when ADR context touches KMP, iOS, Android, native bridges, mobile lifecycle, offline sync, permissions, push/background behavior, local persistence, or backend-mobile contracts.
3. `recall` -> load previous decisions, related RFCs, PRDs, discussions, superseded ADRs, accepted constraints, rejected options, and project-specific ADR conventions for the entity.
4. Gather source context using `references/adr-authoring.md`:
   - Use explicitly provided Markdown files and prompt context first.
   - Use ADR templates, PRDs, and RFCs from Markdown or Atlassian MCP when provided.
   - Use optional complementary-stack ADRs (Markdown or Atlassian MCP) as cross-stack context only when they affect contracts, constraints, dependencies, risks, or links.
   - Use optional same-stack example ADRs (Markdown or Atlassian MCP) as format/style references only — not as facts for the new ADR.
   - Use Figma MCP for UI/UX context only when provided and relevant; otherwise fall back to PRD/RFC/NotebookLM context, or skip UI/UX when absent.
   - When Figma links, nodes, desktop selections, or screenshots materially affect the decision, use `workflows/design.md` as optional child context for mobile UI implications only; the ADR still owns the decision record. Screenshots are context-only unless paired with structured Figma evidence.
   - Use NotebookLM only when the user provides one or more notebook IDs; query each relevant notebook separately, preserve attribution, and do not assume a default notebook.
   - Corroborate with massa-ai search, current repo docs, existing ADRs, and code when the decision depends on current project reality.
5. Run the ADR readiness gate from `references/adr-authoring.md`:
   - If a needed PRD, RFC, template, decision detail, or source fact is absent, ask for the missing context instead of inventing it.
   - If an RFC is needed but absent and the user does not know the missing context, assume the decision is not made and route to `workflows/rfc.md`.
   - Require a source-backed or user-confirmed title, date, status, context, decision, consequences, links, and supersession status before drafting.
6. Draft the ADR using the project's template when available; otherwise use the format selected via `references/adr-authoring.md`'s fallback questions. Tie claims to source confidence: confirmed, user-provided, recalled, inferred, or unresolved.
7. Run the configured Plan Challenge Gate before saving. ADR decisions require the full gate under the default policy (`adr` is named in the full-gate set of the canonical Plan Challenge Policy); revise valid critical or high findings before the record is written, especially a decision presented without its rejected alternatives, consequences stated only as benefits, an unstated assumption the decision depends on, and status quo or sunk-cost bias in the framing. A challenge that invalidates the decision means the decision is not final — route to `workflows/rfc.md` rather than recording it.
8. Save the generated ADR using the selected output target:
   - Default: write to the project's standard ADR directory in Default mode. In Plan Mode, propose the path and content without writing.
   - Confluence: when requested and a parent page link is provided, write a child page through Atlassian MCP and report the resulting page link.
   - Fallback: if Confluence was requested without a parent link or Atlassian MCP is unavailable, ask for the parent link or permission to write local Markdown under `.adr/`.
   - Use sequential numbering from the selected local ADR directory when writing Markdown.
9. At completion, persist the decision via `remember` as a scored `decision` memory (`memory:semantic`), linking the ADR file path and source context used.
10. Complete the Evidence Gate from `references/evidence-gate.md`.
