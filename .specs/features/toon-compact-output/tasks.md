# TOON Compact Output — Tasks (M36)

One atomic commit per task. Gate must pass before next task. Never weaken/skip tests.

## Test Coverage Matrix

| Behavior | Test | Task |
| --- | --- | --- |
| `format=json`/unset → object | serialize.test.ts | 01 |
| `format=toon` → string | serialize.test.ts | 01 |
| `fields` shallow/dotted/array/unknown/empty | serialize.test.ts | 01 |
| 9 existing tools unchanged | existing per-tool tests | 02 |
| 3 tools toon=string / default=object | per-tool tests | 03 |
| fields projection on trace_path/impact | per-tool tests | 04 |
| error path unaffected | existing tests | 02 |

## Tasks

### TASK-01 — Shared serializer + projection + unit suite
- Add `packages/core/src/tools/serialize.ts` (`serializeToolResponse`, `projectFields`, `projectPath`) per design.md.
- Add `packages/core/src/__tests__/serialize.test.ts` covering the full format×fields matrix (json/toon/unset × none/shallow/dotted/array-element/unknown-key/empty/scalar-data).
- **Gate:** `bun test src/__tests__/serialize.test.ts` green; type-check clean.
- **Commit:** `feat(tools): add shared serializeToolResponse with format + fields projection`
- Maps: TOON-01, TOON-05.

### TASK-02 — Route 9 existing tools through serializer (behavior-preserving)
- Replace each tool's inline `format === "toon" ? {success,data:toTOON(x)} : {success,data:x}` with `serializeToolResponse(x, {format})`.
- **BOUNDARY (plan-critic F2):** the serializer wraps ONLY the success-path return. Every error/`catch`/not-found `return {success:false,...}` (including any `data:{hint}`) stays untouched — do not route error branches through the serializer.
- **DEFAULTS (plan-critic F5):** each tool keeps its OWN default-resolution line (`const format = p.format || "toon"` for the 8; read_file stays json-implicit via its existing check) and passes the resolved value in. Do NOT homogenize defaults.
- Tools: read_file (json default), list_checkpoints, store_memory, search_memories, update_memory, create_checkpoint, search_project, restore_checkpoint, delete_memory (toon default). Preserve each default exactly.
- Remove now-unused `toTOON` imports from these 9 (import moves to serialize.ts).
- **Gate:** existing per-tool tests green; type-check; no response-shape diff at default params.
- **Commit:** `refactor(tools): route 9 tools through shared serializeToolResponse`
- Maps: TOON-02, TOON-07.

### TASK-03 — Add `format` to the 3 missing tools
- `get_optimized_context`, `trace_path`, `impact_analysis`: add `format?: "json"|"toon"` to class param interface + `inputSchema` (default `"json"`); destructure; route success return through `serializeToolResponse(result, {format})`.
- MCP parity: add `format` to each of the 3 in `apps/mcp-client/src/tool-definitions.ts`.
- **Gate:** per-tool tests — toon returns `typeof data === "string"`, default returns object; type-check.
- **Commit:** `feat(tools): add format (json|toon) to get_optimized_context, trace_path, impact_analysis`
- Maps: TOON-03, TOON-06 (partial).

### TASK-04 — Add `fields` projection to all 12 tools
- Add `fields?: string[]` to class param interface + `inputSchema` for all 12 tools; thread through to `serializeToolResponse(result, {format, fields})`.
- MCP parity: add `fields` to all 12 in `apps/mcp-client/src/tool-definitions.ts`.
- **FIELDS-FLOW VERIFY (plan-critic F4):** before declaring done, confirm `fields` actually reaches the tool `handle(params)` from the MCP client path — i.e. no proxy/validator strips unknown keys. Add/extend a test that invokes a tool through the MCP-client dispatch with `fields` set and asserts the projected output (if a proxy strips it, the test fails loud and the proxy must be fixed in this task).
- **PROJECTION-SHAPE TEST (plan-critic F3):** add a `projectFields` unit test on a real trace_path-shaped object — `{nodeCount, truncated, nodes:[{symbol,kind,...}], edges:[{type,...}]}` — with `fields:["nodes.symbol","edges.type","nodeCount","truncated"]`, asserting nested arrays project element-wise and top-level scalars survive.
- Add focused projection tests on trace_path (`fields:["nodes.symbol","edges.type"]`) and impact_analysis (`fields:["impacted.symbol","impacted.risk"]`).
- **Gate:** projection + fields-flow tests green; type-check; both schema layers advertise `fields`.
- **Commit:** `feat(tools): add fields projection to all data-returning tools`
- Maps: TOON-04, TOON-06 (complete).

### TASK-05 — Finalize + full gate
- Run focused tool suite + repo type-check + build.
- Update `.specs/project/STATE.md` + this feature's status.
- **Gate:** all green; hand off to independent verifier.
- **Commit:** `test(tools): finalize toon compact output coverage` (only if test artifacts need committing; otherwise fold into 04).
- Maps: all.

## Sub-agent Execution Plan

User authorized subagents for execution. 5 tasks, 1 logical batch (whole feature) — one worker executes TASK-01→05 in order (implement → gate → atomic commit each), reports compact summary (commits, test counts, deviations). Worker spawns no further sub-agents. Independent verifier (TASK validate) is a separate agent (author≠verifier).
