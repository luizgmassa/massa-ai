# Phase 5 — Auto-improvement loop (G7): Specification

Slug: `phase-5-auto-improve`. Workflow: `spec-driven` (TLC v3). Project:
`massa-th0th`. Branch: `main`. Plan anchor: `i-want-to-understand-virtual-lantern.md`
§"Phase 5 — Auto-improvement loop [G7]" + cross-cutting §1–5.

## Goal

A scheduled review of completed Synapse sessions / recent observations that
detects recurring patterns (repeated queries, frequently-referenced files,
common fixes) and proposes memory edits as **pending proposals** with an
audit trail. Proposals default to **auto-approve** (apply + log) unless an
explicit review gate (`memory.autoImprove.reviewGate`) opts into
human-in-the-loop surfacing via `th0th_list_proposals` +
`th0th_approve_proposal`. The pattern-detection pipeline MUST NOT require
the LLM; LLM enrichment is optional, default-off, silent-degrade.

## Background / dependencies

- **Phase 3** (landed): `ObservationStore.listRecent(projectId, limit)`,
  `observation:ingested` event, `MemoryObservationStore` (test fallback).
- **Phase 1** (landed): `llm-client.ts` (`llmComplete`/`llmObject`/`isLlmEnabled`,
  `LlmSurface`), `MemoryRepository.insert`/`update`, `MemoryLevel`,
  `EventMap`, `eventBus.publish`.
- **Phase 4/6** (landed): bootstrap seed memories + handoff dual-write memories
  are a queryable baseline (FTS-only, `level:PROJECT`).
- Test-isolation landmine: the real `MemoryRepository` singleton is **closed**
  by `memory-crud.test.ts` in the full suite → inject a fake repo via a
  ctor seam (mirror `ObservationConsolidationJob` / `BootstrapDeps` /
  `HandoffDeps`). Never call `getMemoryRepository()` directly in job tests.

## Requirements

### R1 — Proposal persistence (additive, both backends)
A new **proposals** table is SQLite-canonical (`proposals.db`, WAL +
`busy_timeout=3000`), created via `CREATE TABLE IF NOT EXISTS`. Columns:
`id, project_id, kind, target_memory_id, payload_json, rationale, status,
created_at, decided_at`. Status literals: `pending | approved | rejected`.
A `MemoryProposalStore` (no-op fallback) + `SqliteProposalStore` (lazy open)
behind a polymorphic factory `getProposalStore()`/`resetProposalStore()`
(mirrors `getHandoffStore`). PG parity via an additive Prisma `Proposal`
model (`@@map("proposals")`); no PgProposalStore code yet (matches the
synapse_sessions / index_jobs / observations / handoffs precedent —
SQLite-canonical runtime state). The factory never short-circuits on
`isPostgresEnabled()`.

### R2 — Proposal record + kinds
A `ProposalRecord` carries: `id, projectId, kind, targetMemoryId?, payload,
rationale, status, createdAt, decidedAt?`. `kind` is one of
`{ "memory.create" | "memory.update" | "memory.tag" }`. `payload` is the
typed edit (content/importance/tags/level/type for create; patch for update;
tag merge for tag). `rationale` is a short human-readable justification
("file X referenced 5 times across 8 observations"). The audit trail is the
row itself + the `memory:auto-improved` event payload.

### R3 — Pattern detection (rule-based, LLM-optional)
`detectPatterns(observations)` is a pure function over `Observation[]` that
counts frequency signals from `payloadJson` (no embeddings, no LLM required):

- **Repeated queries**: tokens under `source:"user-prompt"` payloads recurring
  ≥ `minQueryHits` times (default 3) within the window → `memory.create`
  proposal.
- **Frequently-referenced files**: file paths under `source:"post-tool-use"`
  payloads recurring ≥ `minFileHits` times (default 3) → `memory.tag`
  proposal (suggest tagging a known seed/handoff memory) or
  `memory.create` (suggest a `pattern` memory noting the hot file).
- **Common fixes**: edit/tool patterns recurring ≥ `minFixHits` (default 2) →
  `memory.create` proposal (`pattern` type).

When the LLM is enabled (`llm.isEnabled()`) the rule-based candidates are
optionally enriched: a single `llm.object(...)` call summarizes the raw
observations into a cleaner rationale + content draft. `{ok:false}` /
throw / timeout → fall through to the rule-based candidates verbatim
(silent degrade; **never** throws, never blocks proposal generation).

### R4 — Auto-improve job (debounce trigger, ctor seam)
`AutoImproveJob` ctor accepts `{ llm?, observationStore?, sessionStore?,
proposalStore?, memoryRepo?, minObservations?, minIntervalMs?, maxWindow?,
minQueryHits?, minFileHits?, minFixHits?, reviewGate? }`. `maybeRun(projectId)`
is a fire-and-forget debounce trigger (every `minObservations` OR
`minIntervalMs`) mirroring `ObservationConsolidationJob.maybeRun`. `runOnce(projectId)`:

1. Read `observationStore.listRecent(projectId, maxWindow)`.
2. `detectPatterns(observations, thresholds)` → candidates (rule-based).
3. (Optional) LLM enrichment when enabled; silent-skip on `{ok:false}`/throw.
4. For each candidate: `proposalStore.insert({ status:"pending", ... })`.
5. **Review gate** (read from `memory.autoImprove.reviewGate`, default `false`):
   - `reviewGate === false` (default): auto-approve each pending proposal →
     apply via `memoryRepo` (`insert` for create/tag, `update` for update) →
     flip status to `approved` + set `decidedAt` + emit `memory:auto-improved`
     + log "auto-approved" (audit trail = the row + the event).
   - `reviewGate === true`: leave proposals `pending` for surfacing via
     `th0th_list_proposals` + `th0th_approve_proposal`.
6. Never throws to caller; all errors are caught + logged + return a `noop`
   result `{ improved:false, proposalsCreated:0, proposalsApplied:0 }`.

### R5 — Apply / reject state machine (approve/reject)
`approve(id, projectId?)`: load → `pending` guard → apply via `memoryRepo` →
flip `approved` + `decidedAt` → emit `memory:auto-improved` → return
`{ok:true, proposal}`. Missing / non-pending / project-mismatch / apply-throw →
`{ok:false, reason}` (never silent no-op; mirrors HandoffService.terminate).
`reject(id, projectId?, reason?)`: load → `pending` guard → flip `rejected` +
`decidedAt` (no apply, no event) → `{ok:true, proposal}`. Both terminal.

### R6 — EventBus `memory:auto-improved`
Add to `EventMap`: `memory:auto-improved: { proposalId, projectId?,
kind, targetMemoryId?, status:"approved", appliedAt, source:"llm"|"rule-based" }`.
Published once after a successful apply (auto-approve OR explicit approve).
NOT published on reject / no-op / throw.

### R7 — Surfacing: MCP tools + API route
`th0th_list_proposals` (POST `/api/v1/proposal/list`) → pending proposals for
a project. `th0th_approve_proposal` (POST `/api/v1/proposal/approve`) → apply +
flip + emit. (Optional `th0th_reject_proposal` POST `/api/v1/proposal/reject`
is included for completeness, mirroring the handoff accept/cancel pair.)
Route `apps/tools-api/src/routes/proposals.ts` (Elysia prefix
`/api/v1/proposal`): 423 when `memory.autoImprove.enabled === false`; 400 on
missing `projectId`/`id`; 200 + `{ success, data }`. Wired into
`apps/tools-api/src/index.ts` via `.use(proposalRoutes)` after
`.use(handoffRoutes)`. Swagger tag `proposals`. Core barrel re-exports Phase-5
symbols from `packages/core/src/index.ts`.

### R8 — Silent degradation contract
LLM off → rule-based detection only → still produces proposals (or skips with
a logged reason when no patterns fire). LLM `{ok:false}` / throw / timeout →
rule-based candidates verbatim. Store insert throw → proposal not created,
job returns `noop`. Memory apply throw → approve returns `{ok:false,
reason:"apply-failed"}`, status stays `pending`. The outer job / service
methods NEVER throw to the caller.

## Acceptance criteria

| AC ID | Outcome |
| --- | --- |
| P5-DETECT-01 | `runOnce` over ≥1 deterministic pattern (e.g. 3 observations referencing the same file path under `post-tool-use`) produces ≥1 `pending` proposal whose `kind` and `rationale` reference the pattern. |
| P5-DETECT-02 | `runOnce` with no recurring pattern (all-distinct observations) produces 0 proposals and returns `{improved:false, proposalsCreated:0}` without throwing. |
| P5-LIST-01 | `th0th_list_proposals` returns pending proposals for a project (ordered newest-first or oldest-first — documented), excluding approved/rejected. |
| P5-APPROVE-01 | `approve(pending_id)` applies the edit via `memoryRepo` (insert for create/tag, update for update), flips status to `approved`, sets `decidedAt`, and emits `memory:auto-improved` with the spec-defined shape. |
| P5-AUTOAPPROVE-01 | With `reviewGate=false` (default), `runOnce` auto-approves each generated proposal: applies the edit, flips status, emits the event, and logs an "auto-approved" record (assertable via an injected logger sink or the event payload). |
| P5-REJECT-01 | `reject(pending_id)` flips status to `rejected`, sets `decidedAt`, does NOT apply the edit, does NOT emit `memory:auto-improved`. |
| P5-DEGRADE-01 | With LLM off (`isLlmEnabled()===false`), `runOnce` still produces ≥1 proposal from the same deterministic pattern (rule-based path; no throw). |
| P5-DEGRADE-02 | With LLM on but `{ok:false}`/throw, `runOnce` falls through to rule-based candidates verbatim (no throw; same proposal count as LLM-off). |
| P5-FAIL-01 | `approve` on missing id → `{ok:false, not-found}`; on non-pending → `{ok:false, not-pending}`; on project-mismatch → `{ok:false, project-mismatch}`. No event in any failure case. |
| P5-EVENT-01 | `memory:auto-improved` is in `EventMap` with the R6 shape; the test asserts all fields on a real approve. |
| P5-TOOL-01 | `th0th_list_proposals` + `th0th_approve_proposal` (+ `th0th_reject_proposal`) are in `TOOL_DEFINITIONS`; the route is registered in `index.ts`. Type-check confirms the route compiles + is imported. |
| P5-MIGRATION-01 | SQLite `CREATE TABLE IF NOT EXISTS proposals` with the R1 columns + indexes; Prisma `Proposal @@map("proposals")` model. An idempotent-reopen test asserts a second store on the same dbPath reads the prior row. |
| P5-CONFIG-01 | `memory.autoImprove.{enabled, reviewGate, minObservations, minIntervalMs, maxWindow, minQueryHits, minFileHits, minFixHits}` exist with documented defaults; `mergeConfig` shallow-merges the nested block. |

## Edge cases

- Empty observation window (`listRecent` returns < 2) → noop, no proposals.
- Duplicate pattern within one `runOnce` → one proposal per distinct signal
  (dedup by signal key; a second run within the debounce window does not
  re-fire for the same window).
- `approve` called twice (second on already-approved) → `{ok:false, not-pending}`.
- Apply throws (memory repo insert fails) → status stays `pending`,
  `{ok:false, apply-failed}`, no event.
- LLM enrichment returns a candidate whose `kind` is invalid → schema-validated
  out (rejected); rule-based candidates still apply.
- Concurrent `runOnce` for the same project (debounce) → fire-and-forget;
  the proposalStore insert is idempotent per signal key within a window
  (best-effort; the audit trail is the row timestamps).

## Out of scope (deferred)

- A real OS-level scheduler (cron / `setInterval` OS tick). Trigger-driven
  debounce from the observation-ingest path is sufficient (mirrors Phase-3).
- Cross-project pattern aggregation (proposals are per-`projectId`).
- A `PgProposalStore` runtime impl (Prisma model gives schema parity; a
  future store can use it — mirrors observations/handoffs precedent).
- Proposal TTL / automatic expiry of stale `pending` rows (a future job).
- Web UI for proposal review (Phase 8 will consume `list`).
- Real Synapse-session-content mining (the session store API is consulted as
  a seam but the v1 detection keys on observation payloads, which are the
  stable structured signal).
