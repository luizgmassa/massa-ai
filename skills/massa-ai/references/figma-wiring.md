# Figma Node-Id Wiring

Load in `spec-driven` and `feature` only, lazily, WHERE Figma ingestion is
enabled — never for workflows without a Figma source. This file owns the
per-link figma file template, the wiring-table contract, the 13-category
table, category-tier rules, the unused-Number stop rule, and the Execute
retrieval protocol. It is the single normative copy; workflows point here,
they do not restate it.

## Enablement

Figma ingestion is enabled when one or more Figma links or node IDs are
supplied for the work, on any platform. Mobile targets additionally keep the
existing `references/mobile-context.md` Design-Source Intake Gate and the
`references/mobile-figma-matcher/` implementation contracts. Non-mobile
targets proceed with wiring plus best-effort implementation contracts —
record that class explicitly rather than treating it as parity with the
mobile matcher contracts.

## Relationship To Figma Pre-Analysis

`references/figma-pre-analysis.md` owns the two-stage retrieval protocol
(Stage 1 pre-analysis, Stage 2 sequential per-slice retrieval) and its hard
sequential-dispatch rule — never run Stage 2 subagents in parallel. This file
is where Stage 1's per-link file creation and Stage 2's table population
point; it does not restate the retrieval protocol itself.

## Per-Link File Template

Stage 1 of `references/figma-pre-analysis.md` creates one file per supplied
Figma link under:

```
.specs/<type>/<slug>/figma/NN-<link-slug>.md
```

- `<type>` is the canonical artifact home for the parent work: `features` for
  spec-driven and Standard+ feature work. Quick-tier work that receives
  Figma links exits Quick tier — Figma ingestion is a design decision, and
  Quick mode forbids design decisions.
- `NN` is the two-digit supply order (`01`, `02`, ...).
- `<link-slug>` is a short slug derived from the link or its screen/page name.

Each file's wiring table sits at the top. Stage 2 retrieval fills Number,
Figma node id(s), Category, Explanation, and Notes as it completes each
slice. Specify, Design, and Tasks passes fill the Spec(s)/Task(s)/Design(s)
ID columns as those artifacts wire each row.

## Wiring-Table Contract

Every per-link figma file carries a table with exactly these columns, in
this order:

| Number | Figma node id(s) | Category | Spec(s) ID | Task(s) ID | Design(s) ID | Explanation | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

- **Number** — the row's identifier within this file, referenced by spec,
  task, and design items as `<link-slug>#<Number>`.
- **Figma node id(s)** — one or more node IDs the row covers.
- **Category** — exactly one of the 13 categories below.
- **Spec(s) ID / Task(s) ID / Design(s) ID** — the requirement, task, or
  design-decision identifiers that wire this row; empty until an authoring
  pass fills them.
- **Explanation** — what the node(s) represent and why they matter.
- **Notes** — ambiguity, assumptions, or follow-up needed.

## The 13 Categories

Structure, Components, Tokens / Theming, Typography, Visual effects,
Behavior / Prototype, Flows, Content, Assets, States, Spatial, Semantics,
Mappings.

## Category-Tier Rules

When spec, task, or design items are authored under Figma ingestion, each
item references its figma file plus Number:

- **Specs wire the high-level categories:** Structure, Behavior / Prototype,
  Flows, and similar cross-cutting categories that describe requirements
  rather than implementation detail.
- **Tasks and designs wire the remaining low-level categories** not covered
  by specs: Components, Visual effects, Tokens / Theming, Typography,
  Content, Assets, States, Spatial, Semantics, Mappings — each connected to
  concrete codebase elements (classes, methods, variables, architecture,
  strings, screens, states).

While creating or breaking down Tasks and Designs under Figma ingestion, run
the reuse scan per `references/code-reuse-scan.md` so wired implementation
work reuses existing code instead of duplicating it.

## Unused-Number Stop Rule

The unused-Number check runs when the last included authoring phase closes
(Tasks when the plan includes Tasks, else Design, else Specify) and blocks
Execute until it passes. If any figma-file Number remains unwired to every
spec, task, and design item at that point, stop, report the unused Numbers
to the user, and ask for direction with alternatives and recommendations
before Execute proceeds. Do not silently drop or auto-wire an unused row.

**Deterministic backing (run it, do not eyeball it):** `bun skills/massa-ai/scripts/validate_figma_wiring.ts <slug> [--root .] [--type features|quick|debug|refactors]` parses every wiring table for the slug, always prints the parsed population (files scanned, rows parsed) beside the verdict, and exits non-zero when any Number row is unwired or when the figma directory exists but zero rows were parsed. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).

## Execute Retrieval Protocol

When Execute implements a task with wired Figma node IDs, retrieve those
node IDs through Figma MCP (Model Context Protocol) and implement them per
the wiring recorded in the figma file, spec, task, and design entries — not
from memory of an earlier read. If Figma MCP is unavailable during Execute
for a wired task, stop that task and report the missing capability rather
than implementing from memory of the design.

## Empty Or Unreadable Links

If a supplied Figma link yields zero readable nodes in Stage 1, record the
empty result in that link's figma file and surface it with the unused-Number
report rather than silently skipping the link.
