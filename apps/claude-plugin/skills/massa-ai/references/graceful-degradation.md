# Graceful Degradation

Load when any massa-ai tool, index, or MCP capability named below is
unavailable, empty, stale, or mismatched. Continue the workflow with the
listed fallback instead of blocking.

| Failure | Behavior |
|---|---|
| `recall` empty | Continue as cold start; do not invent memory. |
| massa-ai server unavailable | Fall back to focused shell/file reads; keep session concept. |
| Synapse unavailable | Continue with stateless search. |
| Synapse prime/access mismatch | Use verified REST fallback or skip that optional step. |
| index incomplete or stale | Use recall; skip search-dependent steps until ready. Graph tools (`trace_path`, `impact_analysis`, `get_architecture`) fall back to `search`/`get_references`; record reduced retrieval confidence. |
| no meaningful memory | Say memory was intentionally skipped. |
| memory write fails | Continue and report the unpersisted insight. |
| `create_checkpoint` unavailable | Continue with `.specs/` artifact state as fallback. |
| `handoff_begin` unavailable (`HANDOFFS_ENABLED=false`) | Fall back to `remember` + `.specs/` writes; record skipped handoff-table write. |
| `bootstrap` unavailable | Proceed with manual `remember` calls. |
| `compact_snapshot` unavailable | Continue with `compress` + `remember`; record skipped snapshot. |
| code execution (`execute`/`execute_file`/`batch_execute`) unavailable | Load file into context instead; note the local-dev-only trust model still applies. |
| `fetch_and_index` unavailable | Use native web fetch + manual indexing or skip external content. |
| feedback reference unavailable | Continue without feedback lines; do not block the workflow. |
