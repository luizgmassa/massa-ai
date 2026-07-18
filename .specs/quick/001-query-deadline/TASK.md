# M7 — Query Deadline (wall-clock traversal bound)

Intent: bound graph-traversal wall-clock so runaway trace_path /
impact_analysis walks abort with partial results instead of hanging.

## Acceptance

- `deadlineMs?` (default 5000) on `TracePathOptions` and `ImpactAnalysisOptions`.
- Per-iteration `Date.now() >= deadlineAt` check inside each BFS while-loop;
  fires `truncated = true` + break/return, preserving partial nodes/edges/impacted.
- Additive to existing MAX_DEPTH / MAX_NODES / MAX_IMPACTED / MAX_DEF_QUERIES
  (those bounds are NOT removed or weakened).
- `deadline_ms?` threaded through both tool layers (core tools + MCP
  tool-definitions) with default 5000.
- Behavior-preserving when unset (default 5s >> typical sub-second walks).
- Deadline tests pass deterministically (injectable clock — no PG, no sleeps).
