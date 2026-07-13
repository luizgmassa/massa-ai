# AI Engineering Handoff

## Project

`massa-th0th` — Bun/Turbo TypeScript monorepo for local-first code indexing, hybrid search,
memory, graph/Synapse retrieval, checkpoints, MCP/REST tools, and read-only UI.

## Current State

Repository maintenance is complete with one documented performance exception. No commit or
push was authorized. All changes remain in the dirty worktree. Feature evidence lives at
`.specs/features/repository-maintenance-2026-07-12/`.

## Key Decisions

- PostgreSQL/pgvector is acceptance; SQLite remains but has full mapped PG test parity.
- Scope was amended for one additive migration because handoffs/proposals were still
  SQLite-backed under PG config.
- Tests never use Turbo cache and live integration is excluded from root/unit discovery.
- Qwen relevance thresholds were preserved; bge-specific failures were documented rather
  than hidden by lowering floors.

## Active Files

- Production clusters: PG keyword/search/cache, ETL, graph, scheduler, embedding cache,
  memory PG FTS, handoff/proposal PG stores, API reset/workspace typing.
- Test infrastructure: core/Tools API isolated runners, PG parity suites, E2E lifecycle and
  ranking regressions.
- Schema: `packages/core/prisma/schema.prisma` and migration
  `20260713090000_add_handoffs_proposals_pg`.
- User-owned protected files are listed in `baseline.md` and `validation.md`.

## Known Issue

Cold `qwen3-embedding:8b` self-indexing exceeds the 420-second E2E setup deadline after a
fresh DB reset. Reproduction: use the G10 command/environment in `gate-manifest.md` with an
empty embedding cache. Risk is verification latency, not a failing assertion. Preferred next
action is a deterministic qwen warm-cache fixture or an explicit provider-score calibration
design; do not raise/lower gates casually.

## Rejected Approaches

- SQLite failures as acceptance evidence: rejected; PG assertions were added instead.
- Lowering bge relevance/minScore floors: rejected because qwen is the calibrated contract.
- Parallel Ollama stress: rejected; the model serialized internally and queueing worsened.
- Allowing root tests to probe live API opportunistically: rejected; explicit integration
  gate owns it.
- Blind retries for Bun mock/DB races: rejected; process isolation and deterministic drains
  were implemented.

## Exact Validators

```bash
bun run build
bun run type-check
DATABASE_URL=postgresql://test:test@127.0.0.1:5433/massa_th0th_test \
POSTGRES_VECTOR_URL=postgresql://test:test@127.0.0.1:5433/massa_th0th_test \
VECTOR_STORE_TYPE=postgres MASSA_TH0TH_DEDICATED=1 RUN_E2E= \
bun run test
```

For PG suites and E2E, reuse the exact isolated environment from `gate-manifest.md`; never
fall back to shared `:3333` or the shared database.

## Next Tasks

None required for this maintenance feature. Optional follow-up: design the cold-qwen E2E
fixture/calibration work as a new spec, then rerun G10 from a clean stack.

## Continuation Rules

- Preserve the dirty baseline and do not commit/push without authorization.
- Read the feature artifacts before changing any fixed cluster.
- Keep at most one subagent active for follow-up maintenance.
- Update parity evidence whenever a backend-specific behavior changes.

## Hidden Context

Shared API `:3333` is user-owned. Dedicated resources used `:5433`, `:3334`, and `:11435`.
The user permits destructive operations only in that dedicated dev scope.
