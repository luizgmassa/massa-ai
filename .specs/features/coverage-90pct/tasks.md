# Tasks: Coverage >90%

- feature: `coverage-90pct`

## Phase 0 — Infra-green baseline (Batch A) [must complete before others]

### T1 — mcp-client isolation runner
- Create `apps/mcp-client/scripts/run-tests-isolated.ts` mirroring `packages/core/scripts/run-tests-isolated.ts` (classify files by module-mock / DB / global-state; spawn per-group).
- Update `apps/mcp-client/package.json` `test` script to `bun scripts/run-tests-isolated.ts`.
- Verify: `cd apps/mcp-client && bun scripts/run-tests-isolated.ts` → 0 fail.
- Commit.

### T2 — Fix scripts/tests docs-drift (polyglot-indexing-docs)
- Update `scripts/tests/polyglot-indexing-docs.test.ts` expectations to match current README.md / FEATURES.md content (the 9 failing assertions about extensions, native targets, readiness vs liveness, graph schema v2, diagnostics bounding, FQNs, embedded parsing, verifier commands, performance status).
- Verify: `bun test scripts/tests/polyglot-indexing-docs.test.ts` → 0 fail.
- Commit.

### T3 — Fix scripts/tests flaky/manifest tests
- `verify-tree-sitter-grammars.test.ts`: env-gate or relax the RSS-growth discriminator (mark as env-dependent or increase tolerance).
- `native-macos-arm64-workflow.test.ts` manifest-freeze: update expected manifests to current artifacts or mark as build-gated.
- Verify: `bun test scripts/tests/` → 0 fail (or remaining failures only platform-gated with documented reason).
- Commit.

## Phase 1 — Coverage batches (B–L, parallel)

Each task: add/extend unit tests for the batch's source cluster until per-file line coverage ≥90% AND run its tests with 0 fail/0 skip. Fix any source bug found; add a test asserting the fix. One atomic commit per batch.

### T4 — Batch B: Symbol Graph + Structural Indexing
### T5 — Batch C: Synapse + Compression + Compact Snapshot
### T6 — Batch D: Memory + Auto-improve + Bootstrap + Handoffs
### T7 — Batch E: Search + Query Understanding + Rerank + Fetch/Index
### T8 — Batch F: ETL + Scheduler + Checkpoints + Cache + Embeddings + Project Identity
### T9 — Batch G: Hooks + Executors + Code Execution + Monitoring
### T10 — Batch H: Controllers + remaining Tools + Models
### T11 — Batch I: packages/shared (utils + config)
### T12 — Batch J: apps/tools-api (routes + middleware)
### T13 — Batch K: apps/mcp-client + opencode-plugin + web-ui + plugins
### T14 — Batch L: scripts (repo-level)

## Phase 2 — Integration gate

### T15 — Full suite green
- Run every package test command with dedicated DB env; confirm 0 fail across all.
- Confirm `bun run type-check` exit 0, `bun run build` exit 0.

### T16 — Coverage verification
- Aggregate per-package coverage; confirm overall ≥90% lines and per-file ≥90% for all in-scope source.
- Write `.specs/features/coverage-90pct/validation.md`.

## Test Coverage Matrix
| Requirement | Verified by |
|---|---|
| R1 zero fail | T15 full suite |
| R2 zero skip | T15 full suite (dedicated DB env) |
| R3 core >90% | T4–T10 + T16 |
| R4 shared >90% | T11 + T16 |
| R5 tools-api >90% | T12 + T16 |
| R6 mcp-client >90% | T1 + T13 + T16 |
| R7 plugins/scripts >90% | T13 + T14 + T16 |
| R8 bugs fixed | per-batch commits + T15 |
| R9 gates green | T15 |
| R10 disjoint | git history audit at T16 |

## Gate Check Commands
```
# Dedicated DB env (export once per shell)
export DATABASE_URL=postgresql://massa_th0th:massa_th0th_password@127.0.0.1:5433/massa_ai_test
export MASSA_AI_DEDICATED=1
export RUN_POSTGRES_TESTS=1

# Core
cd packages/core && bun scripts/run-tests-isolated.ts --unit
# Shared
cd packages/shared && bun test
# tools-api
cd apps/tools-api && bun scripts/run-tests-isolated.ts
# mcp-client
cd apps/mcp-client && bun scripts/run-tests-isolated.ts
# plugins + web-ui
cd apps/opencode-plugin && bun test src/
cd apps/web-ui && bun test src/
cd apps/claude-plugin && bun test
cd apps/codex-plugin && bun test
cd apps/cursor-plugin && bun test
# scripts
bun test scripts/__tests__/
bun test scripts/tests/
# Gates
bun run type-check
bun run build
```