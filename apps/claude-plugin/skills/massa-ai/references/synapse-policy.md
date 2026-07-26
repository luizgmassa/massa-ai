# Synapse Policy

Load this reference when a task is expected to issue more than one
`search`, when parallel agents need isolated retrieval context, or when
Synapse compatibility/fallback behavior matters.

## Two Session IDs

- `workflowSessionId`: stable, durable task identity used by recall, remember,
  tags, reports, handoffs, and continuation packages.
- `synapseSessionId`: ephemeral ID returned by `synapse_session`; pass it
  only as `search.sessionId`.

Never persist `synapseSessionId` as the task's durable session identity. A
resumed handoff reuses `workflowSessionId` and opens a fresh Synapse session.

## Activation

- One-shot lookup: skip Synapse.
- Planned related `search` calls >= 2: create a Synapse session before the first search.
- Parallel subagents: each agent gets its own Synapse session while retaining
  the parent/child `workflowSessionId` tags.
- Major focus shift: update task context through REST when available; otherwise
  create a fresh Synapse session and let the prior session expire.

Default search budget inside a Synapse session:

- Summary discovery: `responseMode="summary"`, `maxResults=10`.
- Targeted deep reads: `responseMode="enriched"`, `maxResults=3`.
- Expanded deep reads: `maxResults=5` only when 4-5 exact files, symbols, or report finding IDs are already named.
- Do not use Synapse for a single recall, project map, exact file read, or one symbol lookup.

Server-side bounds that constrain the budget:

- Working-memory buffer holds **20 entries** by default. Priming or prefetching
  more than that evicts the earlier ones — seed the few memories that matter,
  not a whole recall page.
- Sessions expire after **1h**, sliding forward on every `synapse_get` or
  recorded access.

Config knobs (env, read by the server, not by the agent):

| Env var | Default | Effect |
|---|---|---|
| `SYNAPSE_ENABLED` | `true` | Master kill switch; `false` bypasses the whole pipeline, and `search` behaves statelessly even when a `sessionId` is passed. |
| `SYNAPSE_ATTENTION_ENABLED` | `false` | Multi-signal attention re-ranker. **Off by default** — do not attribute re-ranking to Synapse unless it is on. |
| `LOG_LEVEL` | `info` | `debug` emits one pipeline log line per query (see Reading Pipeline Output). |

## MCP-First Lifecycle

1. Call `synapse_session` with explicit `agentId`, `workspaceId`,
   one-sentence `taskContext`, and `ttlMs`. Omit `sessionId` so the server
   generates a collision-free ID. Keep `agentId` stable across the whole task —
   agent affinity needs one identity.
2. Call `recall` using `workflowSessionId` and project/entity context.
3. Open a task envelope with `synapse_task_begin` (`id` = the session id, plus a
   one-sentence `taskContext`) before the task's searches.
4. Prime the buffer when the adapter supports it, within the 20-entry bound.
5. Pass the returned `synapseSessionId` as `sessionId` on every related
   `search` call.
6. Call `synapse_prefetch` right after deciding to open a specific file, so the
   buffer is warm before the next search.
7. After consuming a result, record its `memoryId` through the verified access
   route when available.
8. Close the task envelope with `synapse_task_end` when the task's work is done.
   Update `taskContext` only when the *kind* of work changes, never per query.

Verified v2.0.2 adapter warnings:

- MCP prime exposes `{ id, results }`, but the installed adapter forwarded that
  body unchanged to REST, which requires `{ entries }`, and returned HTTP 422.
- MCP access returned `Session not found or expired` for a live session that
  REST could inspect and update; direct REST access with the same `memoryId`
  succeeded.

Treat MCP prime and access as compatibility-sensitive. Do not retry the same
failing call; use REST or skip the optional step. Always use `memoryId` for
access recording. File-path-only access is unsupported until a runtime probe
proves adapter translation.

## REST Lifecycle Fallback

Use REST only when `MASSA_AI_API_URL` is available and the operation is absent or
broken in MCP. Default local URL is `http://localhost:3333`.

If `MASSA_AI_API_KEY` is configured, send it as `x-api-key`. Never print, persist,
or place the key in memory, reports, status updates, command transcripts, or
committed files.

REST-only lifecycle operations:

| Operation | Route | Use |
|---|---|---|
| Inspect | `GET /api/v1/synapse/session/:id` | Confirm state or diagnose expiry. |
| Update focus | `PATCH /api/v1/synapse/session/:id` | Replace task context after a major focus shift. |
| Prime | `POST /api/v1/synapse/session/:id/prime` | Send `{ "entries": [...] }` when MCP priming fails. |
| Prefetch | `POST /api/v1/synapse/session/:id/prefetch` | Warm context for a file that will be investigated. |
| Close | `DELETE /api/v1/synapse/session/:id` | Free resources after completion when practical. |

REST prime entries require `id` and `content`; `score` and `metadata` are
optional. REST prefetch requires `filePath` and may include `symbols`, `chains`,
`maxResults`, `minImportance`, or `entries`.

## Reading Pipeline Output

With `LOG_LEVEL=debug`, the server emits one structured line per Synapse-scoped
query. Use it to decide whether Synapse is helping or whether the query needs
refining — not as evidence about the codebase.

```json
{
  "before": 16, "after": 14,
  "queryClass": "specific",
  "intent": "decision",
  "appliedFilters": ["buffer-hit","pre-gate","attention","chain","diversity","temporal","confidence-gate","spectrum","buffer-put"],
  "flags": { "lowConfidence": false, "noStrongMatch": false, "definitiveMatch": true,
             "spread": 0.31, "mean": 0.78, "confidence": 0.24 }
}
```

| Signal | Reading |
|---|---|
| `appliedFilters` has `buffer-hit` | Buffer had warm results — priming/prefetch is paying off. |
| `appliedFilters` has `pre-gate` | Early raw-score filter cut noise before attention. |
| `appliedFilters` lacks `attention` | `SYNAPSE_ATTENTION_ENABLED=false`; task alignment did not re-rank. |
| `queryClass = "specific"` | Symbol-like query; confidence gate at 0.55. |
| `queryClass = "focused"` | Tech terms; gate at 0.40. |
| `queryClass = "broad"` | Exploratory; gate at 0.25. |
| `intent != "general"` | Chain inhibition modulated results by memory type. |
| `flags.definitiveMatch = true` | One dominant hit; the top result is trustworthy. |
| `flags.lowConfidence = true` | Results clustered — the query is ambiguous. Refine it; this is not a failure. |
| `flags.noStrongMatch = true` | Nothing crossed the threshold — the answer is probably not in the corpus. Fall back to source reads. |

## Failure Policy

- Session creation fails: continue with stateless massa-ai search.
- Priming or access fails: use verified REST exactly once after recording the MCP failure mode; if REST fails or is unavailable, continue without priming/access.
- Search rejects `sessionId`: retry once without it and report the divergence.
- REST unavailable or unauthorized: stay MCP-only and let TTL expire.
- Session expires or disappears after server restart: create a new session; do
  not reuse the old ID. Synapse state is ephemeral and process-local.
- Never reset or reindex a project to repair a Synapse-only failure.

## Anti-Patterns

- Reusing one session across unrelated tasks: task-alignment, agent-affinity,
  and buffer signals drift into noise. Open a fresh session per task.
- Updating `taskContext` after every query — the signal stops meaning anything.
- Priming hundreds of entries against a 20-entry buffer.
- Sending a different `agentId` per call.
- Passing `synapseSessionId` on a one-shot stateless lookup.
- Treating `flags.lowConfidence` as "search failed".
- Persisting `synapseSessionId` as the task's durable session identity.

## Completion

Close the REST session when the endpoint is available and cleanup is cheap.
Otherwise rely on the explicit TTL. Report Synapse failures only when they
changed retrieval confidence, skipped expected behavior, or exposed a contract
regression.
