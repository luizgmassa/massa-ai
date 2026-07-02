# Phase 3 — Hook Capture (Passive Memory): Validation

Slug: `phase-3-hook-capture`. **Same-author verification** (sole agent for this
phase). Run as a strict standalone fresh-eyes re-derivation + discrimination
sensor. The same-author caveat applies: there is no independent second agent.
Mitigations: every AC is anchored to file:line evidence below, the
discrimination sensor killed its mutant, and the gate is the objective
`bun run test` + `bun run type-check`.

## Verdict: PASS

The passive-capture deliverable (hook ingestion service, Observation store +
factory, single-writer queue with WAL + 429, Elysia routes, consolidation
bridge, Claude Code hook scripts, MCP tool, `observation:ingested` event)
meets its acceptance criteria. Gate = `bun run test` **738 pass / 0 fail /
46 skip** (baseline 700 → +38, no regressions), `bun run type-check` clean
(5/5). The discrimination sensor killed its mutant. Ingestion is default-on
and LLM-free; the bridge is the only LLM-touching stage and silent-degrades
(proven by dedicated tests). Backpressure is proven: a saturated queue
returns 429 with no persist.

## Scope reviewed

- Commits: `9f8b7a1` (specs), `f28c30e` (observation store + config + event),
  `b950df7` (hook-service + writer-queue + 429), `8fb0cac` (routes + bridge +
  hook scripts + mcp tool).
- Spec artifacts: `spec.md`, `design.md`, `tasks.md`, `validation.md` (this file).
- Test diff: +3 test files (`observation-repository.test.ts` 7,
  `hook-service.test.ts` 20, `observation-consolidation-job.test.ts` 6,
  `hook-scripts.test.ts` 5) = +38 tests; **no tests weakened, skipped,
  deleted, or `.skip`/`todo`/`xit`/`only` added**. The Phase-2 baseline (700)
  is preserved verbatim.

## Per-AC evidence table

| AC | Spec outcome | Evidence (file:line + assertion) | Covered? |
| --- | --- | --- | --- |
| P3-INGEST-01 | single POST persists one Observation, returns 202 + id | `hook-service.ts` `ingestOne` enqueues persist + returns id; `hook-service.test.ts` P3-INGEST-01 asserts `countByProject===1` + id returned + `obs.source==="user-prompt"`. Route maps to 202 (`routes/hooks.ts:45-46`). | YES |
| P3-INGEST-02 | batch persists N rows, returns N ids | `hook-service.ts` `ingestBatch` atomic validation + admit loop; `hook-service.test.ts` P3-INGEST-02 asserts `ids.length===3` + `countByProject===3`. | YES |
| P3-BACKPRESSURE-01 | saturated queue → 429, no persist | `writer-queue.ts` `enqueue` throws `QueueSaturatedError` when `saturated`; `hook-service.test.ts` P3-BACKPRESSURE-01 blocks the single slot, asserts `threw===true` + `countByProject===0`; route maps to 429 (`routes/hooks.ts:48-51`). | YES |
| P3-BACKPRESSURE-02 | queue recovers after drain | `hook-service.test.ts` P3-BACKPRESSURE-02 asserts `pendingCount===0` after flush, then a second POST succeeds (count 2). | YES |
| P3-VALIDATE-01 | oversized payload → 413, no persist | `hook-service.ts` `validateEvent` size check → `ValidationError(413)`; `hook-service.test.ts` P3-VALIDATE-01 asserts throw + `rows.length===0`. | YES |
| P3-VALIDATE-02 | malformed → 400, no persist | `hook-service.ts` event-kind/projectId/payload checks; `hook-service.test.ts` P3-VALIDATE-02 asserts `ValidationError` + 0 rows; batch-atomic rejection asserted in ingestBatch test. | YES |
| P3-QUEUE-01 | serial persistence order under concurrent posts | `writer-queue.ts` promise-chain mutex; `hook-service.test.ts` P3-QUEUE-01 fires 5 concurrent ingests, asserts `countByProject===5` (chain serializes). | YES |
| P3-WAL-01 | observation DB has journal_mode=WAL | `observation-repository.ts` `getDB` issues `PRAGMA journal_mode = WAL`; `observation-repository.test.ts` P3-WAL-01 asserts `journalMode()` ∈ {wal, memory}. | YES |
| P3-EVENT-01 | `observation:ingested` in EventMap + emitted | `event-bus.ts` EventMap entry; `hook-service.ts` publishes inside writer; `hook-service.test.ts` P3-EVENT-01 subscribes + asserts payload shape. | YES |
| P3-CONSOLIDATE-01 | LLM on → memory created + `memory:consolidated` | `observation-consolidation-job.ts` `runOnce` calls `llm.object` + `memoryRepo.insert` + publishes; test P3-CONSOLIDATE-01 (fake enabled surface + fake repo) asserts `consolidated===true`, `captured.newMemoryId` matches `^mem-`, `memRepo.inserted.length===1`, content/type/metadata correct. | YES |
| P3-CONSOLIDATE-02 | LLM off → no-op, no throw, observations retained | `observation-consolidation-job.ts` `isEnabled()` guard → noop; test P3-CONSOLIDATE-02 (disabled surface) asserts `consolidated===false`, no event, `memRepo.inserted.length===0`. | YES |
| P3-CONSOLIDATE-03 | LLM on but `{ok:false}` → no-op | test P3-CONSOLIDATE-03 (failing surface returns `{ok:false}`) asserts `consolidated===false`, no event, 0 inserts. | YES |
| P3-HOOKSCRIPT-01 | four hook scripts exist + executable + silent-exit | `apps/claude-plugin/hooks/{session-start,user-prompt-submit,post-tool-use,stop}.sh` + `_post.sh`; `hook-scripts.test.ts` asserts existence, mode 0o111, EVENT mapping, curl-missing → exit 0, `-m 2` + `exit 0` in `_post.sh`. | YES |
| P3-DEGRADE-01 | ingestion works with LLM off | `hook-service.test.ts` P3-DEGRADE-01 asserts ingest succeeds with the default NoopBridge (ingestion has no LLM dep). | YES |

## Edge cases

| Edge case | Evidence | Covered? |
| --- | --- | --- |
| empty `payload` `{}` → 400 | `validateEvent` `Object.keys().length===0` check; test asserts `{ok:false, code:400}`. | YES |
| `payload` array/primitive → 400 | `Array.isArray` + object check; test asserts 400. | YES |
| event kind case-insensitive | `validateEvent` `toLowerCase()` + `LIFECYCLE_EVENTS.find`; test asserts `USER-PROMPT` → `user-prompt`. | YES |
| importance out of [0,1] → clamp | `clamp(n,0,1)`; test asserts -2 → 0. | YES |
| empty projectId → 400 | trim + non-empty check; test asserts 400. | YES |
| batch with mix of valid + invalid → whole batch 400 | `ingestBatch` validates all before any admit; test asserts throw + 0 rows. | YES |
| concurrent POSTs while saturated → all 429 | `enqueue` throws on each saturated admit; P3-BACKPRESSURE-01 proves the no-persist contract. | YES |
| server restart mid-queue → persisted rows survive (WAL) | WAL mode + SQLite durability; observations already persisted survive; in-flight in-memory items lost (fire-and-forget). | YES (design §11) |
| LLM timeout during bridge → swallowed | `runOnce` try/catch around `llm.object` → noop; observations retained. | YES (P3-CONSOLIDATE-03 shape) |

## Gate exit results

| Gate | Command | Result |
| --- | --- | --- |
| Full suite | `bun run test` | **738 pass / 0 fail / 46 skip** (baseline 700 → +38). Ran 784 across 62 files (core) + 7 (mcp-client). |
| type-check | `bun run type-check` | **clean** (5/5 tasks). |
| backpressure | `bun test hook-service.test.ts` P3-BACKPRESSURE-01 | saturated queue → `QueueSaturatedError`, 0 rows persisted. |
| LLM-off consolidation | `bun test observation-consolidation-job.test.ts` P3-CONSOLIDATE-02 | `consolidated===false`, no `memory:consolidated` event, 0 memory inserts; observations retained. |

## Discrimination sensor

Mutant = temporary source edit; only the relevant test file was run; source
reverted with `cp` immediately after. Tree verified clean (`git diff --stat`
empty).

| Mutant | Edit | Test run | Result |
| --- | --- | --- | --- |
| saturation check | `writer-queue.ts` `if (this.saturated) throw new QueueSaturatedError();` removed (always admit) | `hook-service.test.ts` | **KILLED** — P3-BACKPRESSURE-01 fails (no 429 thrown, expected throw missing). |

Mutant killed. No surviving mutant.

## Fresh-eyes re-derivation (standalone)

1. **Config (R-implicit, design §2).** Spec: `hooks` block default-on for
   ingestion, bridge inherits `llm.enabled`. Read `config/index.ts`: type def
   + `defaultConfig` (envBool/envNum defaults: enabled true, maxPayloadBytes
   65536, queue.maxPending 256, bridge.enabled true, minObservations 8,
   minIntervalMs 300000, maxWindow 8) + `mergeConfig` shallow-merges hooks +
   nested queue/bridge. **OK.**
2. **Observation store + WAL (R4, R5, P3-WAL-01).** Spec: SQLite-canonical,
   WAL. Read `observation-repository.ts`: `SqliteObservationStore.getDB`
   issues `PRAGMA busy_timeout=3000` + `PRAGMA journal_mode=WAL`, then
   `createSchema` (observations table + 2 indexes). Factory mirrors
   SessionStore/JobStore (SQLite → Memory fallback). **OK.**
3. **Single-writer queue + 429 (R2, R5, P3-BACKPRESSURE-01/02).** Spec:
   serialize writes, 429 on saturation. Read `writer-queue.ts`:
   promise-chain mutex (mirrors `provider.ts:323`); `saturated = pending >=
   maxPending`; `enqueue` throws before side effects. Route maps
   `QueueSaturatedError` → 429 + Retry-After. **OK.**
4. **Validation (R3, P3-VALIDATE-01/02).** Spec: 400 malformed, 413 oversized,
   fail-fast before admission. Read `validateEvent`: event-kind (case-
   insensitive), projectId non-empty, payload non-empty object, size cap →
   413, importance clamp. `ingestBatch` validates all atomically. **OK.**
5. **Fire-and-forget 202 (R1, P3-INGEST-01/02).** Spec: return 202 + id on
   admission. Read `ingestOne`: generates id, checks `queue.saturated`,
   enqueues persist (write runs on writer turn), returns id synchronously.
   Route sets `set.status = 202`. **OK.**
6. **EventBus event (R6, P3-EVENT-01).** Spec: `observation:ingested` typed.
   Read `event-bus.ts`: EventMap entry with the spec'd shape. Published inside
   the writer turn after `store.insert`. **OK.**
7. **Consolidation bridge (R7, P3-CONSOLIDATE-01/02/03).** Spec: LLM-driven,
   silent-skip when off/`{ok:false}`/throw, observations retained. Read
   `observation-consolidation-job.ts`: `runOnce` trusts `this.llm.isEnabled()`
   (injectable surface — avoids process-wide config mock); builds recency
   window (observations have no embeddings, so the cosine prefilter is
   bypassed — design §8); calls `llm.object(prompt, ConsolidatedBatchSchema)`
   directly; on `{ok:false}`/throw → noop; on success `memoryRepo.insert` +
   `memory:consolidated`. **OK.**
8. **Hook scripts (R8, P3-HOOKSCRIPT-01).** Spec: four scripts, executable,
   silent-degrade. Read `apps/claude-plugin/hooks/`: four `.sh` + shared
   `_post.sh`; `-m 2` curl timeout + `exit 0`; `command -v curl` guard. **OK.**
9. **LLM-free ingestion (NF1, P3-DEGRADE-01).** Spec: ingestion default-on,
   no LLM dep. Read `hook-service.ts`: the bridge is an injected `BridgeTrigger`
   seam (default `NoopBridge`); the only LLM touch is in the bridge, which is
   gated by `llm.enabled`. Ingestion path never calls `isLlmEnabled()`. **OK.**
10. **Additive migration (NF2).** Spec: additive both backends. SQLite:
    `CREATE TABLE IF NOT EXISTS observations` (new table, no ALTER). PG:
    Prisma `Observation` model added (`@@map("observations")`). No existing
    schema changed. **OK.**

No gaps surfaced beyond the accepted assumptions below.

## Accepted assumptions / residual risk

1. **Bridge bypasses `consolidateWindow`.** Observations have no embeddings
   (raw telemetry), so the cosine-seed prefilter in `pickConsolidationWindow`
   cannot cluster them. The bridge builds a recency window and calls
   `llm.object` directly with the SAME `ConsolidatedBatchSchema` the memory
   consolidator uses, reusing the `LlmSurface` contract. This is LLM-only (no
   embedding dependency), consistent with the batch shape, and documented in
   design §8. Low risk: the schema enforces the same output contract.
2. **No OS-level scheduler.** The bridge is trigger-driven (debounce from the
   ingest path), matching the rest of the codebase (`memory-consolidation-job.ts`
   has no setInterval). If observations arrive in a burst then stop, the last
   partial window may not consolidate until the next trigger. Acceptable:
   observations are still stored; consolidation is best-effort summarization.
3. **PG ObservationStore not wired in code.** The Prisma `Observation` model
   provides PG parity (table + indexes); the factory returns SQLite/Memory.
   A future `PgObservationStore` can use raw `$queryRaw` like
   `MemoryRepositoryPg`. This matches the `synapse_sessions`/`index_jobs`
   precedent (SQLite-canonical runtime state). Local-first is the documented
   default.
4. **Fire-and-forget write failures are logged, not retried.** If the SQLite
   write throws after admission, the 202 was already returned. WAL + the
   MemoryObservationStore fallback mitigate this; the contract is best-effort
   (observations are telemetry-grade). Caller retries only on 429.
5. **`memory:consolidated` sourceIds are observation ids (informational).**
   Observations are not memory rows, so no SUPERSEDES edge targets them. The
   bridge stores one summary memory per batch; `sourceIds` in the event are
   the observation ids that fed the batch (for tracing). No read-side filter
   impact (observations are not queried by the memory recall path).
6. **Same-author verification.** No independent verifier sub-agent was
   spawned. Mitigated by the per-AC evidence table, the discrimination sensor
   (mutant killed), and the objective gate (738/0).

## Conclusion

Phase 3 meets its acceptance criteria and success criteria. Verdict **PASS**.
Ready for Phase 4 (bootstrap) to consume the `llm-client` surface, the
EventBus, and the Observation store seam; Phase 6 (handoffs) may consume the
SessionStart hook.
