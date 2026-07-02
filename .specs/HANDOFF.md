# Handoff

## Snapshot
- feature: phase-1-memory-foundation — COMPLETE, same-author verified (PASS)
- phase/task: Execute done; validation.md written
- completed: decay fn + pinned/soft-delete; shared llm-client + top-level llm config; consolidator + backend-polymorphic consolidation job + SUPERSEDES read-side filter; durable SessionStore + SqliteJobStore (write-through + crash recovery)
- in-progress: none
- next step: Phase 2 (retrieval quality — query rewrite + HyDE). Consumes `llm-client` + `config.llm` + `memory:consolidated` from here.
- blockers: none
- uncommitted files: none (STATE.md/FEATURES.json/HANDOFF.md/PHASE-INTEGRATION.md updates pending this commit)
- branch: main; commits 538fe66..3fb4eb1 (Phase 0), befa3cb, e49ffa9, 12fe002, 1ccb42c (Phase 1)

## Key decisions for Phase 2 (and later phases)
- Shared LLM surface: `import { llm, llmComplete, llmObject, isLlmEnabled } from "packages/core/src/services/memory/llm-client.js"`. Every call is default-off (config `llm.enabled`, env `RLM_LLM_ENABLED=true`) and silently degrades to `{ok:false}` — never throws. Treat `{ok:false}` as "fall through to non-LLM path".
- Config: read `config.get("llm")` for `{baseUrl, apiKey, model, temperature, maxOutputTokens, timeoutMs}`. `compression.llm` remains as a deprecated alias of `llm` (do not extend it — use top-level `llm`).
- EventBus: emit/subscribe `memory:consolidated` via `eventBus` from `services/events/event-bus.ts`. Add new typed events to `EventMap` there.
- Backend dispatch: mirror `getMemoryRepository()` / `getGraphStore()` factories for any new polymorphic service. Never re-introduce an `isPostgresEnabled()` short-circuit.
- Schema: `memories` now has `pinned` (Boolean/0-1) + `deleted_at` (nullable). Recall filters both (`deleted_at IS NULL` AND `NOT EXISTS … SUPERSEDES`). `memory_edges` exists in `memories.db` (GraphStore) — SQLite cols `source_id/target_id/relation_type/evidence`; PG `from_id/to_id/edge_type/metadata`.
- Sessions/Jobs: `SessionRegistry` and `IndexJobTracker` are now durable (SQLite). Inject stores via ctor for tests; production wiring is automatic in `getSessionRegistry()` / `IndexJobTracker.getInstance()`.
- Test isolation: bun `mock.module("@th0th-ai/shared")` is process-wide — do NOT mock it in two test files. The memory subsystem's config mock lives in `memory-crud.test.ts`; co-locate new memory tests there or avoid the config mock (pass explicit paths / use the `_setLlmEnabledForTesting` seam).

## Same-author caveat (Phase 1)
Sole agent verified its own work — no independent verifier sub-agent. Mitigations: per-AC file:line evidence, discrimination sensor (3/3 mutants killed), objective gate (677/0). See `.specs/features/phase-1-memory-foundation/validation.md`.

## Plan reference
`i-want-to-understand-virtual-lantern.md` Phase 0 (done) → Phase 1 (done) → Phase 2 next.
