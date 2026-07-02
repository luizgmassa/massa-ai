# Phase Integration Ledger (massa-th0th improvement plan)

Working aid for the spec-driven multi-phase rollout of
`i-want-to-understand-virtual-lantern.md`. Updated after each phase so the next
phase's sub-agent inherits exact integration points (config keys, services,
schema, EventBus events, seams). Not the spec; canonical state stays in
`project/STATE.md`, `project/FEATURES.json`, `HANDOFF.md`.

## Project / session
- projectId: `massa-th0th` (the TS MCP server repo — NOT the useful-agent-skills skills repo).
- workflowSessionId: `spec-virtual-lantern-plan`. workflow: `spec-driven`. branch: `main`.
- Recommended phase order: 1 → 2 → 3 → 4 → 6 → 5 → 7(7e first, then 7a–7d, 7f last) → 8.
- One sub-agent per phase, sequential; prior phase's summary feeds the next.

## Repo facts (every agent assumes these)
- Runtime: **bun** (`bun:test`). Build via turborepo. `bun run test` (all),
  `bun run type-check` (5 tasks, must be clean). No package-level lint task.
- Baseline after Phase 0: **609 pass / 0 fail** (61 pre-existing env-dependent
  skips). New work must not regress this.
- `node_modules`/`dist` may be absent at agent start → run `bun install` first if
  `node_modules` is missing, then build/type-check.
- **`th0th_search`/index is N/A for this repo** (not indexed; only massa-vault +
  useful-agent-skills are). Use direct source reads + `grep`/Glob/Read.
- Architecture tiers: MCP client (`apps/mcp-client`) → Tools API
  (`apps/tools-api`, routes under `src/routes/`) → core (`packages/core`) +
  shared config (`packages/shared/src/config`).
- Phase 0 commit range `4e27925^..be65877` is the precedent for spec/artifact +
  per-task commit style.

## Cross-cutting architecture decisions (apply to every phase)
1. **One shared LLM client, local-first.** `packages/core/src/services/memory/llm-client.ts`
   wrapping `generateText`/`generateObject` (`ai` + `@ai-sdk/openai` already in
   `package.json`). New top-level `llm` config block in `packages/shared/src/config/index.ts`,
   Ollama defaults (`baseUrl http://localhost:11434/v1`, model `qwen2.5-coder:7b`,
   `apiKey "ollama"`). Migrate `compression.llm` → `llm` (keep deprecated alias one
   release). Expose `llmComplete(prompt, opts?)` + `llmObject(prompt, zodSchema)`.
   Every call: (a) respect `timeoutMs`, (b) degrade silently to non-LLM path on
   failure, (c) config-gated default-off. Env toggle observed in Phase 0:
   `RLM_LLM_ENABLED`.
2. **SQLite is first-class.** No new feature may repeat the `isPostgresEnabled()`
   short-circuit (`memory-consolidation-job.ts:36-42`). New jobs route through
   backend-polymorphic dispatch mirroring factories
   (`data/vector/vector-store-factory.ts:86`, `data/memory/memory-repository-factory.ts:13`).
3. **EventBus is the integration bus** (`services/events/event-bus.ts`). New stages
   emit typed events: `memory:consolidated`, `search:query-rewritten`,
   `search:reranked`, `memory:salience-scored`, `observation:ingested`,
   `handoff:accepted`, `bootstrap:completed`. No new plugin system.
4. **SQLite write discipline.** Enable **WAL mode**; serialize observation/hook
   ingestion through a single-writer queue; 429 on saturation (protects readers).
5. **Migrations additive-only**, both backends (`ALTER TABLE … ADD COLUMN` /
   `CREATE TABLE IF NOT EXISTS`; pattern at `memory-repository.ts:148-160`).

## Phase 0 landed (reference, do not redo)
- 0a upload-gate: shared `DEFAULT_ALLOWED_EXTENSIONS` (34) in
  `packages/shared/src/config/index.ts` consumed by config default + index-manager
  + `apps/mcp-client/src/file-collector.ts` (old 8-ext drift killed).
- 0b reindex cap: `config.search.autoReindexMaxFiles` (default 200, env
  `AUTOREINDEX_MAX_FILES`); 3 sites derive (`search-controller.ts:246`,
  `contextual-search-rlm.ts:290-291,317,346`).
- 0c memory CRUD: `MemoryRepository`(SQLite) + `MemoryRepositoryPg` gained
  `update`/`deleteById`; MCP tools `th0th_memory_update` + `th0th_memory_delete`;
  routes under `apps/tools-api/src/routes/memory.ts`. **Delete = HARD delete +
  sever GraphStore edges via `MemoryGraphService.onMemoryDeleted(id)`.** Soft-delete
  (`deleted_at` + recall filtering) deferred to Phase 1. Update re-embeds + rebuilds
  FTS5 external-content index on content/tag change.
- 0d checkpoint MCP: 3 tools wired into `tool-definitions.ts` + thin
  `routes/checkpoints.ts` over existing core tools.

## Per-phase integration deltas (append as phases complete)

### Phase 1 — landed (commits befa3cb, e49ffa9, 12fe002, 1ccb42c)

**Config keys (new):**
- `memory.decay: { lambda=0.02; sigma=0.6; mu=0.04; coldThreshold=0.20 }` (`DecayParams`, exported from `@th0th-ai/shared`).
- Top-level `llm: { enabled; baseUrl; apiKey; model; temperature; maxOutputTokens; timeoutMs }` — Ollama defaults (`http://localhost:11434/v1`, `qwen2.5-coder:7b`, `apiKey "ollama"`), **default-off** (env `RLM_LLM_ENABLED=true`).
- `compression.llm` is now a **deprecated alias** of `llm` (same env vars; `prompt` stays compression-specific). Migrate readers to `config.get("llm")`.
- New env helpers in `packages/shared/src/config`: `envBool`, `envString` (alongside `envNum`).

**Services exported (path + symbol) — what Phase 2+ consumes:**
- `packages/core/src/services/memory/decay.ts` → `decayScore(mem, params?, now?)`, `isCold(mem, params?, now?)`, `DEFAULT_DECAY_PARAMS`, `DecayMemory`.
- `packages/core/src/services/memory/llm-client.ts` → `llmComplete(prompt, opts?)`, `llmObject(prompt, zodSchema, opts?)`, `isLlmEnabled()`, `llm` (bundled handle), `LlmResult<T>`. `_setLlmEnabledForTesting` is an internal test seam.
- `packages/core/src/services/memory/consolidator.ts` → `consolidateWindow(candidates, llmSurface, opts?)`, `pickConsolidationWindow`, `cosineSimilarity`, `ConsolidatedBatch`, `ConsolidatedBatchSchema`, `rowsToCandidates`, `LlmSurface`.
- `packages/core/src/services/synapse/session/session-store.ts` → `SessionStore`, `SqliteSessionStore`, `MemorySessionStore`, `getSessionStore()`, `resetSessionStore()`.
- `packages/core/src/services/jobs/index-job-store.ts` → `JobStore`, `SqliteJobStore`, `getJobStore()`, `resetJobStore()`.
- `packages/core/src/services/jobs/memory-consolidation-job.ts` → `MemoryConsolidationJob` (ctor accepts `{ llm?: LlmSurface }`), `ConsolidationStats` (now `{promoted, decayed, pruned, edgesCleaned, merged, batchesCreated}`), singleton `memoryConsolidationJob`.

**Schema delta (additive, both backends):**
- `memories`: `pinned` (SQLite `INTEGER NOT NULL DEFAULT 0` / PG `Boolean @default(false)`) + `deleted_at` (SQLite `INTEGER` nullable / PG `DateTime?`). Indexes on `deleted_at`.
- `memory_edges`: now also ensured by `MemoryRepository` (so the SUPERSEDES read filter works even when GraphStore isn't instantiated). SQLite cols unchanged (`source_id/target_id/relation_type/evidence/auto_extracted`); PG unchanged (`from_id/to_id/edge_type/metadata`). Batch id carried via SQLite `evidence` (JSON) / PG `metadata`.
- `synapse_sessions` + `synapse_access_history` (new, SQLite-canonical; `synapse-sessions.db`).
- `index_jobs` (new, SQLite-canonical; `index-jobs.db`).

**EventBus events emitted:**
- `memory:consolidated: { batchId, sourceIds[], newMemoryId, projectId?, stats:{merged, batchesCreated} }` (added to `EventMap`).

**Read-side seams (must be respected by new recall paths):**
- SQLite FTS + PG FTS + `listMemories` all exclude `deleted_at IS NOT NULL` AND targets of a `SUPERSEDES` edge. Any new recall path MUST apply both filters.

**Backend-polymorphic dispatch pattern:** use `getMemoryRepository()` / `getGraphStore()` / `getSessionStore()` / `getJobStore()`. Never re-introduce `isPostgresEnabled()` short-circuits.

**Latent landmine removed:** `graph-store-pg.ts` no longer eagerly constructs the Prisma client at module-eval (lazy Proxy) — importing `graph-store-factory` is now side-effect-free in SQLite-only environments.

**Test-isolation rule (IMPORTANT for Phase 2+):** bun `mock.module("@th0th-ai/shared")` is process-wide and collides across files. Only ONE test file (memory-crud.test.ts) mocks shared config for the memory subsystem; co-locate new memory tests there or avoid mocking config (pass explicit dbPaths / use the `_setLlmEnabledForTesting` seam). The SQLite consolidation tests live in memory-crud.test.ts for this reason.
### Phase 2 — landed (commits ebcc202 specs, 5b0ba18, 6a7598f, 6cb5edb, f2acceb)

**Config keys (new):**
- `search.queryUnderstanding: { enabled=false; hydeEnabled=true; cacheTtlMs=300_000; cacheMaxSize=256 }` — additive nested block in `ServerConfig.search`. Env opt-in `SEARCH_QUERY_UNDERSTANDING_ENABLED` (also `SEARCH_QUERY_UNDERSTANDING_HYDE_ENABLED`, `SEARCH_QUERY_UNDERSTANDING_CACHE_TTL_MS`, `SEARCH_QUERY_UNDERSTANDING_CACHE_MAX_SIZE`). Default-off; `mergeConfig` shallow-merges the nested object.

**Services exported (path + symbol) — what Phase 3+ consumes:**
- `packages/core/src/services/search/query-understanding.ts` → `QueryUnderstandingService` (ctor `{ llmSurface?, embedFn?, cacheTtlMs?, cacheMaxSize? }`; method `understand(query, projectId): Promise<QueryUnderstandingResult | null>`), `rewriteQuery(query, surface, opts?)`, `hyde(query, surface, embedFn, opts?)`, `buildRewrittenFTSQuery(query, keywords)`, `QueryRewriteSchema` + `QueryRewrite` type, `QueryLlmSurface` + `EmbedFn` interfaces, `QueryUnderstandingResult` type.
- Default `llmSurface` = the real `llm` handle from Phase-1 `llm-client.ts`. Default `embedFn` reuses the existing `EmbeddingService` singleton (lazy, `data/chromadb/vector-store.ts`) — no new provider.
- `ContextualSearchRLM.search()` now accepts `options.sessionId?: string` (forward-compatible seam for Synapse-biased fusion; not yet consumed).

**EventBus events emitted (new):**
- `search:query-rewritten: { query, projectId, expansions[], keywords[], hydeUsed }` — published after a successful LLM rewrite (only when `queryUnderstanding.enabled`).
- `search:reranked: { query, projectId, streamCount, resultCount }` — published after fusing the expanded streams (only on the query-understanding path; NOT on the original 2-stream path).

**Fan-out shape / seams Phase 3 reuses:**
- `ContextualSearchRLM.search()` builds `resultSets: SearchResult[][]` then calls the existing `fuseResults(resultSets, query, explainScores)` (RRF). When QU off/degraded → 2 streams (vector + keyword), byte-identical to Phase-1. When QU on → 3 streams (vector + rewritten-FTS + HyDE via `vectorStore.searchByEmbedding`).
- Silent-degrade contract: the QU branch is wrapped in an outer try/catch in `search()` that resets to the original 2-stream path on ANY throw. `understand()` returns `null` on disabled/timeout/error/empty-query. NEVER blocks search, NEVER throws to caller.
- Cache: in-memory `Map<projectId::query, {value, expiresAt}>`, TTL+size-bounded (no new dependency). `clearCache()` for tests.

**No schema delta, no migration.** Additive config + code + EventBus events only.

**Test-isolation note (extends Phase-1 rule):** `query-understanding.test.ts` does NOT mock `@th0th-ai/shared`. It injects a fake `QueryLlmSurface` + fake `EmbedFn` (no config, no DB, no network). The `QueryUnderstandingService` constructor has defensive config readers (fall back to spec defaults) because other test files' process-wide shared-config mock omits the `queryUnderstanding` block — this is a no-op in production.

### Phase 3 — landed (commits 9f8b7a1 specs, f28c30e store+config+event, b950df7 hook-service+queue+429, 8fb0cac routes+bridge+scripts+mcp)

**Config keys (new):**
- `hooks: { enabled (envBool HOOKS_ENABLED=true); maxPayloadBytes (envNum HOOKS_MAX_PAYLOAD_BYTES=65536); queue.{ maxPending (envNum HOOKS_QUEUE_MAX_PENDING=256) }; bridge.{ enabled (envBool HOOKS_BRIDGE_ENABLED=true); minObservations (8); minIntervalMs (300_000); maxWindow (8) } }`. Additive nested block in `ServerConfig`; `mergeConfig` shallow-merges `hooks` + nested `queue`/`bridge`.

**Services exported (path + symbol) — what Phase 4+ consumes:**
- `packages/core/src/data/memory/observation-repository.ts` → `ObservationStore` (interface), `MemoryObservationStore` (no-op fallback), `SqliteObservationStore` (lazy open, WAL + busy_timeout=3000, `observations` table), `getObservationStore()`/`resetObservationStore()` (factory mirrors SessionStore/JobStore), `newObservationId()`, `LIFECYCLE_EVENTS` (const tuple of the 6 event kinds), `LifecycleEventKind`/`Observation`/`ObservationRow` types.
- `packages/core/src/services/hooks/writer-queue.ts` → `WriterQueue` (promise-chain mutex mirroring `provider.ts:323`), `QueueSaturatedError` (carries `retryAfterSeconds`).
- `packages/core/src/services/hooks/hook-service.ts` → `HookService` (ctor `{ store?, maxPending?, maxPayloadBytes?, bridge?, idFactory? }`), `validateEvent(raw, maxPayloadBytes)` (pure), `ingestOne`/`ingestBatch`, `ValidationError` (code 400|413), `getHookService()`/`resetHookService()` singleton, `IncomingEvent`/`NormalizedEvent`/`BridgeTrigger` types.
- `packages/core/src/services/jobs/observation-consolidation-job.ts` → `ObservationConsolidationJob` (ctor `{ llm?, store?, memoryRepo?, minObservations?, minIntervalMs?, maxWindow? }`), `maybeRun(projectId)` (debounce trigger), `runOnce(projectId)` (silent-skip on LLM-off/`{ok:false}`/throw), singleton `observationConsolidationJob`.
- Core barrel re-exports Phase-3 hook symbols from `packages/core/src/index.ts` (consumed by routes via `@th0th-ai/core`).

**Routes (new, Elysia):**
- `POST /api/v1/hook` → single lifecycle event → 202 + `{ id }`; 429 + `Retry-After` when saturated; 400/413 validation; 423 when `hooks.enabled=false`.
- `POST /api/v1/hook/batch` → `{ events: [...] }` atomic validation → 202 + `{ ids: [] }`; same error mapping.
- Wired into `apps/tools-api/src/index.ts` (`.use(hookRoutes)`) + swagger tag `hooks`.

**Schema delta (additive, both backends):**
- SQLite: new `observations` table (`id TEXT PK, project_id, session_id, source, payload_json, importance, created_at`) + 2 indexes (`idx_obs_project_created`, `idx_obs_session`). DB file `observations.db` (WAL + busy_timeout=3000). No ALTER (new table).
- PG: additive Prisma `Observation` model (`@@map("observations")`, indexes on `[projectId, createdAt(sort:Desc)]` + `[sessionId]`). No PgObservationStore code yet (SQLite-canonical runtime state, like synapse_sessions/index_jobs).

**EventBus events emitted (new):**
- `observation:ingested: { observationId, projectId, sessionId?, source, importance }` — published inside the writer turn after `store.insert`.

**Single-writer queue + 429 design (cross-cutting §4):**
- `WriterQueue` serializes the persist step via a promise-chain mutex (mirrors `provider.ts:323`). `saturated = pending >= maxPending` (default 256); `enqueue` throws `QueueSaturatedError` BEFORE any side effect → route maps to 429. WAL + busy_timeout protect readers from the fire-hose. The queue lives on the `HookService` singleton.

**Consolidation bridge design:**
- Separate job (`ObservationConsolidationJob`), NOT extending `memory-consolidation-job.ts` — observations are a different source stream (no embeddings) with a different trigger. Reuses `ConsolidatedBatchSchema` + `LlmSurface` contract. Bypasses `consolidateWindow`'s cosine prefilter (observations have no embeddings → recency window + direct `llm.object` call). Silent-skip when `!isEnabled()` / `{ok:false}` / throw; observations ALWAYS retained. Debounce trigger from the ingest path (every `minObservations` OR `minIntervalMs`); fire-and-forget, never blocks the 202.

**Hook scripts + MCP tool:**
- `apps/claude-plugin/hooks/{session-start,user-prompt-submit,post-tool-use,stop}.sh` + shared `_post.sh` (2s curl timeout, `exit 0`, env `TH0TH_API_BASE`/`TH0TH_API_KEY`/`TH0TH_PROJECT_ID`) + `README.md`.
- MCP tool `th0th_hook_ingest` (POST /api/v1/hook/batch) for non-Claude hosts.

**Test-isolation note (extends Phase-1/2 rule):** Phase-3 tests do NOT mock `@th0th-ai/shared`. `observation-repository.test.ts` uses explicit temp `dbPath`; `hook-service.test.ts` injects `MemoryObservationStore` + fake `BridgeTrigger` + explicit `maxPending`; `observation-consolidation-job.test.ts` injects a fake `LlmSurface` + fake `memoryRepo` (the real `MemoryRepository` singleton is closed by `memory-crud.test.ts` in the full suite — the `memoryRepo` injection seam avoids the closed-DB landmine).

**Seams Phase 4/5/6 reuse:**
- Phase 4 (bootstrap): independent of observations; consumes `llm-client` + `project_map` PageRank.
- Phase 5 (auto-improve): consumes `observation:ingested` + the Observation store (`listRecent`) to detect patterns; may emit proposals.
- Phase 6 (handoffs): may consume the SessionStart hook (auto-inject a pending handoff on session-start) + the `observation:ingested` stream.
### Phase 4 — (pending)
### Phase 6 — (pending)
### Phase 5 — (pending)
### Phase 7 — (pending)
### Phase 8 — (pending)

## Commit ledger (append)
| Phase | Commit(s) | Summary |
| --- | --- | --- |
| 0 | 538fe66 4e27925 c25f9d3 b84ea3e be65877 a1e5ca2 3fb4eb1 | quick wins + specs + validation |
| 1 | befa3cb e49ffa9 12fe002 1ccb42c | memory foundation: decay/pinned/soft-delete, llm-client+consolidator+polymorphic job+read-side, durable sessions/jobs |
| 2 | ebcc202 5b0ba18 6a7598f 6cb5edb f2acceb | query understanding: config gate, rewrite+hyde+cache service, search fan-out, search:query-rewritten/reranked events, tests |
| 3 | 9f8b7a1 f28c30e b950df7 8fb0cac | passive capture: hooks config + Observation store (WAL) + writer queue + 429 + HookService + Elysia routes + consolidation bridge + Claude Code hook scripts + th0th_hook_ingest + observation:ingested event, tests |
