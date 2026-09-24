# Codebase Investigation

Use when understanding unfamiliar code before planning, fixing, reviewing, or refactoring.

## Golden Rules

1. **Never assume or invent.** Uncertainty beats fabrication.
2. **Deserves-a-note.** Persist durable understanding, not trivia.
3. **Pointers, not copies.** Reference source by `path`/symbol/line; do not duplicate bulk content.
4. **Surgical precision.** Smallest sufficient read/change.
5. **Verify against source.** Memories and indexed context are leads until confirmed.

Write and search in the user's human language. Match the user's prompt language for prose; match the codebase for identifiers, paths, and commands.

## Mission Cycle

Follow this proportional cycle (BRIEFING → PLAN → EXECUTE → DEBRIEF):

1. **Briefing:** define objective, success criteria, constraints, and current session.
2. **Recon:** inspect only relevant code paths and prior memories.
3. **Plan:** state steps with per-step `verify:` criteria (what confirms the step succeeded) before non-trivial reads or edits.
4. **Execute:** make surgical changes only when the workflow allows mutation.
5. **Verify:** use deterministic sensors or concrete artifact inspection.
6. **Debrief:** persist only durable discoveries; record what was verified against source.

For exploration-only work, Recon and Debrief are the main deliverables.

## Source Order

This is the single ordered retrieval list for massa-ai workflows and agents.
Every other reference (`mcp-tools.md`, `spec-driven/code-analysis.md`,
`synapse-policy.md`, workflow files, agent charters) points here instead of
restating it; where a file adds tool-specific parameters, budgets, or a
tier not listed below, it says so as an explicit delta on top of this order.

Prefer sources in this order:

1. `recall` for prior decisions, patterns, failed attempts, and handoffs.
2. `list_projects` or equivalent index metadata to verify project ID,
   path, status, and freshness (`lastIndexedAt`).
3. `project_map` for indexed-project general architecture orientation when the
   index is fresh for the current repository path and worktree state.
4. `get_architecture` for architecture-specific deep maps (packages, routes,
   hotspots, communities, cycles) when the index is fresh.
5. Summary search, then targeted enriched search. Parameters and default
   budgets for these two modes are a schema delta owned by `mcp-tools.md`
   §Retrieval Order.
6. Symbol tools (`search_definitions`, `get_references`, `go_to_definition`)
   and `read_file` for exact definitions, usages, and ranges.
7. `symbol_snippet` for raw code snippets by exact file + line range.
8. `trace_path` for typed-edge call/data-flow path tracing (fresh index only).
9. `impact_analysis` for git-diff centrality-ranked impact (fresh index only).
10. `optimized_context` when synthesized compact context is available and more useful
    than exact source.
11. Local `.notebook/INDEX.md` only if the project already uses `.notebook/`.
12. Focused shell search/read fallback (`rg`, `grep`) when massa-ai is
    unavailable, stale, incomplete, unindexed, or misses obvious local truth. Spec-driven code analysis
    adds one tier here — `sg`/ast-grep for structural pattern search when
    installed, tried before `rg`/`grep`; see
    `references/spec-driven/code-analysis.md` §Tool Priority.
13. External sources only when current external library/API behavior matters — and then strictly through the ordered chain in `references/knowledge-verification-chain.md` (project docs → Context7 MCP → web search → flag-as-uncertain, unavailable steps recorded as skipped sensors).

Project maps, search results, and optimized context are leads until confirmed
against source files read in the current session or returned with current
freshness evidence. Current repository source and approved `.specs/` artifacts
override indexed context, memories, external summaries, and old handoff notes.
This is the canonical statement of that rule; other references point here
instead of restating it.

For multi-search investigations, load `references/synapse-policy.md`. Keep the
durable `workflowSessionId` separate from the ephemeral Synapse session.

massa-ai remains canonical memory for massa-ai workflows. Do not introduce `.notebook/` as a default persistence layer.

## Recon Rules

- Start from the closest entry point to the question.
- Trace input -> transformation -> output for behavior questions.
- Prefer pointers over copied code in notes and reports.
- Read signatures and high-value logic first; avoid whole-project sweeps.
- Treat generated, dependency, build, log, cache, and secret paths as out of scope unless explicitly relevant.

## Debrief Rules

Persist only if rediscovery would cost future effort:

- project convention or repeated pattern
- architectural constraint or accepted exception
- fragile flow, gotcha, or verified root cause
- rejected approach that future agents might reintroduce
- verification recipe worth reusing

**Note-worthiness trigger:** when understanding touches 3+ files or a non-trivial flow, persist a note to the massa-ai memory layer. Below that threshold, decide per-finding.

Three-way note decision:

- **create** — new durable finding worth its own note
- **update** — existing non-stale note for the same entity
- **skip** — trivial, one-off, or already captured

Skip memory for trivial observations, one-off findings, and facts already captured in current non-stale memories.

## Investigation Output

Use this compact shape:

```md
Objective: ...
Scope checked: ...
Entry points: ...
Flow: input -> transformation -> output
Key evidence: `path` / symbol / command
Open questions: ...
Next step: ...
Memory: write / skip, with reason
```
