# M7 — Query Deadline: Summary

Additive wall-clock bound on graph traversal so runaway walks abort with
partial results instead of hanging.

## Files changed (6 source + 2 test + 2 spec)

- `packages/core/src/services/symbol/trace-path.ts`
  - `deadlineMs?` + `now?` on `TracePathOptions`
  - `DEFAULT_TRAVERSAL_DEADLINE_MS = 5_000`
  - `deadlineAt` captured at entry; per-iteration `now() >= deadlineAt` check
    in BFS while-loop -> `markTruncated(); return` (partial nodes/edges kept)
- `packages/core/src/services/symbol/impact-analysis.ts`
  - `deadlineMs?` + `now?` on `ImpactAnalysisOptions`
  - `DEFAULT_TRAVERSAL_DEADLINE_MS = 5_000`
  - per-iteration check in reverse-BFS while-loop -> `truncated = true; break`
- `packages/core/src/tools/trace_path.ts` — `deadline_ms?` param + inputSchema + passthrough
- `packages/core/src/tools/impact_analysis.ts` — `deadline_ms?` param + inputSchema + passthrough
- `apps/mcp-client/src/tool-definitions.ts` — `deadline_ms` parity (both tools)
- `packages/core/src/__tests__/trace-path.test.ts` — +2 deadline tests
- `packages/core/src/__tests__/impact-analysis-diff.test.ts` — +2 deadline tests
- `.specs/quick/001-query-deadline/{TASK,SUMMARY}.md`

## Design

- Inline `Date.now() >= deadlineAt` per iteration (O(1), aborts mid-traversal).
- Injectable `now?` clock for deterministic tests — no sleeps, no PG timing
  dependence. Mirrors the test-friendly seam in `parser-pool.ts`.
- Additive: MAX_DEPTH / MAX_NODES / MAX_IMPACTED / MAX_DEF_QUERIES unchanged.
- Default 5s >> typical sub-second walks -> behavior-preserving when unset.

## Gate evidence

- `bun test src/__tests__/impact-analysis-diff.test.ts` -> 5 pass / 0 fail
  (was 3; +2 new deadline tests green).
- `bun test src/__tests__/trace-path.test.ts` -> 16 pass / 2 fail
  (baseline before change: 12 pass / 4 fail). Both NEW deadline tests PASS
  (`deadline aborts traversal with truncated=true and partial nodes` and
  `default deadline (unset) does not truncate a normal walk`).
- Type-check `packages/core` (`bunx tsc --noEmit`) -> EXIT 0.
- Type-check `apps/mcp-client` (`bunx tsc --noEmit`) -> EXIT 0.

### Pre-existing failure split (NOT mine)

The 2 remaining trace-path failures are the established PG workspace-state
flake (also seen at baseline). Root cause: `graph_generation_workspace_missing`
/ `active_graph_generation_missing` errors in
`data/graph-generation/graph-generation-repository-pg.ts` and
`data/symbol/symbol-repository-pg.ts` — concurrent workspace/centrality lock
contention on the shared `p4d2-trace-path` project ID across tests. Which
specific tests fail moves run-to-run. Each failing test PASSES in isolation
(`bun test -t "<name>"`), confirming the flake is PG-state contention, not the
deadline change. Recorded in repo MEMORY (BUG-SYN-4 / e2e-stack-gotchas).

## SPEC_DEVIATION

None. Injectable clock was a minor additive decision to keep tests
deterministic without PG — falls under the spec's "injectable clock if needed"
escape hatch.
