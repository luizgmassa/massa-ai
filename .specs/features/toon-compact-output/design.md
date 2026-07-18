# TOON Compact Output — Design (M36)

## Context

`@toon-format/toon` (`encode as toTOON`) is already pinned and wired into 9 tools via a per-tool inline switch. Three data-heavy tools lack `format`; none support field projection. MCP schemas are **statically duplicated** in `apps/mcp-client/src/tool-definitions.ts` (not derived from class `inputSchema`), so every schema change must be made in two layers. See `spec.md`.

## Component Design

### 1. Shared serializer — `packages/core/src/tools/serialize.ts` (NEW)

```ts
export interface SerializeOpts {
  format?: "json" | "toon";
  fields?: string[];
}
export function serializeToolResponse(
  result: unknown,
  opts: SerializeOpts = {}
): ToolResponse {
  const projected = projectFields(result, opts.fields);
  return { success: true, data: opts.format === "toon" ? toTOON(projected) : projected };
}
```

- Projection runs **before** encoding so `fields` works in both json and toon.
- `format` resolves to the caller's per-tool default before calling (caller passes its resolved value); the helper only branches on the literal `"toon"`.

### 2. Projection — `projectFields(data, fields)`

```ts
export function projectFields(data: unknown, fields?: string[]): unknown {
  if (!fields || fields.length === 0) return data;            // absent/empty → full
  if (Array.isArray(data)) return data.map((e) => projectFields(e, fields)); // element-wise
  if (data === null || typeof data !== "object") return data;  // scalar → unchanged
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const [head, ...rest] = f.split(".");
    if (!(head in (data as object))) continue;                 // unknown key → silently dropped
    const v = (data as Record<string, unknown>)[head];
    out[head] = rest.length === 0 ? v : projectPath(v, rest);
  }
  return out;
}
// projectPath: walk dotted remainder; arrays recurse element-wise; missing/primitive → drop
```

Semantics locked in spec AC P3: shallow + dotted, arrays element-wise, unknown/empty-mid silently dropped, empty `fields` = full.

### 3. Per-tool default preservation

| Tool | Existing default | After M36 |
| --- | --- | --- |
| read_file | **json** (implicit — no `default`, `format==="toon"` check) | json (unchanged) |
| list_checkpoints, store_memory, search_memories, update_memory, create_checkpoint, search_project, restore_checkpoint, delete_memory (8) | toon | toon (unchanged) |
| get_optimized_context, trace_path, impact_analysis (3 new) | n/a → json | json (additive, default json) |

Each tool resolves its own default and passes the resolved `format` into `serializeToolResponse` — guarantees byte-identical behavior for the 9.

### 4. Two-layer MCP parity

For each tool touched, add the param to **both**:
- class `inputSchema.properties.<param>` (drives tools-api / direct dispatch), and
- `apps/mcp-client/src/tool-definitions.ts` static `inputSchema` (drives MCP clients).

`fields` added to all 12; `format` added to the 3 missing. Duplication is acknowledged M32 debt — M36 keeps parity manually.

## Public Contract Impact

Additive only. New **optional** params (`format` on 3 tools, `fields` on 12) with safe defaults. No param removed/renamed; no response shape change at default params. MCP clients see new optional schema fields → backward compatible.

## Serializer Call Boundary (plan-critic F2)

`serializeToolResponse` wraps ONLY the success-path return statement of each tool. Error branches (`catch`, validation failures, not-found) — including trace_path/impact_analysis `{success:false, error, data:{hint}}` — are returned directly and never pass through projection/encode. This keeps the error contract byte-identical and avoids projecting/throwing on partial `data`.

## Critique Refinements (plan-critic incorporation, 2026-07-18)

- **AC precision (F1):** "behavior-preserving / byte-unchanged" means at DEFAULT params — `fields` absent and `format` at the tool's existing default. Opt-in `fields` projection is advertised new behavior, not a regression.
- **Defaults (F5):** each tool resolves its own default and passes the literal into the helper; the helper never picks a default. Prevents json↔toon flips.
- **Fields flow (F4):** TASK-04 must verify `fields` survives MCP-client → core `handle()` dispatch (no proxy/validator strips unknown keys) with a dispatch-level test.
- **Projection shape (F3):** unit test on a real trace_path-shaped `data` (scalar counts + nested arrays) proves dotted-path element-wise projection.

## What Does NOT Change

- Error paths: `{success:false, error}` (and existing not-found `hint` `data` on trace_path/impact error branches) — serializer applies only to success `data`.
- `read_file` `compress`/`targetRatio` — independent mechanism, untouched.
- RLM search ranking, `responseMode` (summary/full/enriched) — orthogonal to format/fields; `responseMode` shapes `data` before serialization, `fields`/`format` act after.

## Risks & Mitigations

- **Projection drops a needed field** — opt-in; agent's responsibility. AC: unknown field silently dropped (no throw).
- **Per-tool default drift during refactor** — TASK-02 characterization: existing tool tests must stay green; the table above is the source of truth.
- **Schema drift between two layers** — TASK checklist requires editing both; verifier confirms parity.
- **toon CPU cost on huge payloads** — acceptable; fields cuts payload before encode, compounding the win.

## Verification Recipe (Gate Commands)

```bash
cd packages/core
bun test src/__tests__/serialize.test.ts          # helper unit matrix (TASK-01)
bun test src/__tests__/structural-etl.test.ts      # unaffected guard
# per-tool focused tests for the 9 + 3 (TASK-02/03/04)
# repo-wide:
bun run typecheck                                  # (confirm script name in package.json)
bun run build
```
Exact test file names confirmed at Execute time; new serializer suite is `serialize.test.ts`.
