# Spec: Coverage >90% Unit Tests (massa-ai)

- projectId: `massa-ai`
- workflowSessionId: `spec-coverage-90pct`
- workflow: spec-driven (Large/Complex)
- feature: `coverage-90pct`

## Goal

Raise unit-test code coverage across the massa-ai monorepo to **above 90%** line coverage, fix every currently-failing or skipped test (no skips, no failures), and fix any bugs/gaps discovered in source code while writing tests. Work is partitioned across parallel subagents, each owning 2–3 features with a disjoint write set.

## Context (baseline measured this session)

### Stack / gate commands
- Runtime: Bun 1.3.14; test runner: `bun test`; coverage via `bunfig.toml` (`coverage=true`)
- Type-check: `bun run type-check` (6 tsc projects) — MUST stay green
- Build: `bun run build` (turbo, 5 packages) — MUST stay green
- Core unit tests: `cd packages/core && bun scripts/run-tests-isolated.ts --unit` (isolated runner; spawn-per-file for DB/module/global state)
- Core e2e: `bun scripts/run-tests-isolated.ts --e2e` (requires live API + MCP dist; separate suite)
- tools-api tests: `cd apps/tools-api && bun scripts/run-tests-isolated.ts`
- mcp-client tests: `cd apps/mcp-client && bun test` (no isolation runner; collision risk)
- Other packages: `bun test` in each package dir
- scripts tests: `bun test scripts/__tests__/` and `bun test scripts/tests/`

### Test DB (required for DB-gated suites)
- Dedicated postgres on **127.0.0.1:5433** with db `massa_ai_test`, user `massa_th0th`, pgvector extension, all prisma migrations applied.
- Env to enable all DB-gated tests:
  ```
  DATABASE_URL=postgresql://massa_th0th:massa_th0th_password@127.0.0.1:5433/massa_ai_test
  MASSA_AI_DEDICATED=1
  RUN_POSTGRES_TESTS=1
  RUN_E2E=1
  ```
- Ollama running locally (models: qwen3-embedding:8b, qwen2.5:7b-instruct, qwen2.5-coder:7b) for embedding/LLM-gated paths.

### Baseline results (this session)
- packages/core unit (isolated, dedicated DB): **76 groups, ALL PASS**
- packages/shared: 27 pass
- apps/tools-api (isolated, dedicated DB): 5 groups, ALL PASS
- apps/mcp-client (`bun test`, no isolation): **2 fail / 2 errors** — module-state collision (`buildPrefetchPlan` not found when tests run in one process; passes in isolation). Root cause: no isolation runner for mcp-client.
- apps/opencode-plugin: 35 pass; web-ui: 19 pass; claude/codex/cursor plugins: 27/16/15 pass
- scripts/__tests__: 319 pass
- scripts/tests: **10 fail** — 9 `polyglot-indexing-docs` (README content drifted, tests expect old phrases) + 1 `verify-tree-sitter-grammars` RSS-growth discriminator (env/flaky) + 1 `macOS arm64 packed artifact contract` manifest freeze
- E2E suite: requires running API server (separate gate; not in scope for "unit coverage" but must not be broken)

### Coverage gaps (core aggregate snapshot — files below 90% line coverage)
106 files in packages/core below 90% (see design.md for the full ranked list). Major clusters:
- `src/services/symbol/` — symbol-graph.service (4.57%), trace-path (13.07%), centrality (0%), architecture, communities
- `src/services/search/` — search-analytics-pg (0%), index-manager (0%), rlm-admin (0%), rlm-indexing, contextual-search-rlm, search-cache-pg, file-filter-cache, ignore-patterns, lexical-search, rlm-search
- `src/services/graph/` — graph-queries (0%), memory-graph.service (0%), graph-store-pg, relation-extractor
- `src/services/jobs/` — memory-consolidation-job (5%), index-job-store-pg, auto-improve-job, index-job-tracker
- `src/services/embeddings/` — embedding-service (0%), provider (0%), cached-provider
- `src/services/cache/` — l1-memory-cache (0%), embedding-cache-pg (0%), embedding-cache-factory (0%)
- `src/services/pricing/` — models-dev-client (0%)
- `src/services/memory/` — memory-clustering (0%), redundancy-filter (0%), llm-client, consolidator, salience-judge
- `src/services/checkpoint/` — auto-checkpointer (0%), checkpoint-store-pg, checkpoint-manager
- `src/services/etl/` — stages/discover, parse, resolve; pipeline
- `src/services/hooks/` — co-retrieval-hook, search-session-hook, attribution-resolver, writer-queue
- `src/services/scheduler/` — scheduler-store-pg, scheduler-defaults, scheduler
- `src/services/web/` — fetcher (77%), web-controller
- `src/services/workspace/` — workspace-manager (39%)
- `src/services/project-identity/` — service, production-wiring, identity-guard-installer
- `src/services/executor/` — executor, runtime
- `src/controllers/` — memory-controller (0%), search-controller, executor-controller
- `src/data/` — symbol/* (workspace, generation, identity, queries, mappers, graph), memory/* (repository-pg, observation-repository-pg), graph-generation/*, keyword/*, vector/* (base, postgres, factory), managed-runs/*, audit/*, proposal/*, handoff/*, with-deadlock-retry
- `src/models/` — CacheEntry (0%), CompressedContent
- `src/tools/` — index_project (54%), list_projects (73%), search_definitions, get_references, impact_analysis, trace_path
- packages/shared/src/utils/ — benchmark (0%), metrics (0%), rate-limiter (0%), sanitizer (0%), tokenizer (0%), logger (59%), config (config-loader 52%, xdg 56%, db-guard 1%)
- apps/tools-api/src/routes/ — proposals (0%), events, analytics, search, synapse, context, file, dashboard, memory, handoff, hooks, executor, project, workspace, web-ui, web, bootstrap, system, architecture, checkpoints (many untested)

## Requirements

### R1 — Zero failing tests (all packages)
After work completes, every test suite passes with zero failures:
- `packages/core` unit (isolated, dedicated DB env): 0 fail
- `packages/shared`: 0 fail
- `apps/tools-api` (isolated): 0 fail
- `apps/mcp-client`: 0 fail (fix collision via isolation runner OR fix module state)
- `apps/opencode-plugin`, `apps/web-ui`, `apps/{claude,codex,cursor}-plugin`: 0 fail
- `scripts/__tests__`: 0 fail
- `scripts/tests`: 0 fail (fix docs-drift tests to match current README/FEATURES content; fix/relax RSS discriminator; fix manifest-freeze test)
- E2E suite: not broken by changes (gated on live API; leave skip-gates intact)

**AC-R1:** Running the full per-package test commands (with dedicated DB env) reports `0 fail` for every package.

### R2 — Zero skipped tests (unit suites)
No `test.skip`/`describe.skip`/`it.skip` that can run in the dedicated DB environment remains skipped. DB-gated tests run when the dedicated DB env is set. Platform-specific skips (`describe.skipIf(!darwin)` etc.) remain only where genuinely platform-gated and documented.

**AC-R2:** With dedicated DB env applied, `bun test` reports `0 skip` for unit suites (core unit, shared, tools-api, mcp-client, plugins, scripts/__tests__).

### R3 — Line coverage >90% (packages/core)
`packages/core` source (excluding `__tests__/`, generated prisma, scripts) exceeds 90% line coverage AND no individual source file is below 90% line coverage.

**AC-R3:** A coverage run over `packages/core/src` (excluding `__tests__/`, `generated/`, `scripts/`, `data/db-connection` if it only wraps env) shows overall ≥90% lines and every `src/**/*.ts` file ≥90% lines.

### R4 — Line coverage >90% (packages/shared)
`packages/shared` source exceeds 90% line coverage; every `src/**/*.ts` file ≥90%.

**AC-R4:** Coverage over `packages/shared/src` shows overall ≥90% lines and per-file ≥90%.

### R5 — Line coverage >90% (apps/tools-api)
`apps/tools-api/src` (routes, middleware, startup-config, health, index) exceeds 90% line coverage; every route/middleware file ≥90%.

**AC-R5:** Coverage over `apps/tools-api/src` shows overall ≥90% lines and per-file ≥90%.

### R6 — Line coverage >90% (apps/mcp-client)
`apps/mcp-client/src` exceeds 90% line coverage; per-file ≥90%. Includes fixing the module-collision so tests run reliably (isolation runner or module-state fix).

**AC-R6:** Coverage over `apps/mcp-client/src` shows overall ≥90% lines and per-file ≥90%; tests pass with 0 fail.

### R7 — Line coverage >90% (plugins + web-ui + scripts)
`apps/opencode-plugin/src`, `apps/web-ui/src`, `apps/{claude,codex,cursor}-plugin` (hook source + installers), and `scripts/*.ts` (diagnose, generate-subagent-artifacts, install-agents, install-skills, run-deterministic, run-tests-parallel, verify-*, version-sync) exceed 90% line coverage.

**AC-R7:** Coverage over each listed app/scripts source shows ≥90% lines and per-file ≥90%.

### R8 — Bugs/gaps found during testing are fixed
Any latent bug discovered while writing tests is fixed in the source, and tests assert the corrected behavior. Fixes do not weaken existing assertions.

**AC-R8:** All source fixes have accompanying tests; no test was weakened/skipped to pass; `bun run type-check` and `bun run build` stay green.

### R9 — Gates stay green
`bun run type-check` (6/6) and `bun run build` (5/5) pass after all changes.

**AC-R9:** `bun run type-check` exit 0; `bun run build` exit 0.

### R10 — Disjoint parallel partition (no cross-subagent file conflicts)
Subagents are partitioned so each owns a disjoint set of source + test files. No two subagents edit the same file.

**AC-R10:** Git history shows no overlapping file edits across subagent commits; `git diff` has no conflict markers.

## Out of scope
- E2E suite needing a live API server (leave its skip-gates intact; do not break)
- Tree-sitter native parser internals (platform/build-gated; relax flaky RSS test only)
- Generated prisma code (`src/generated/`)
- `dist/`, `node_modules/`
- New features (only tests + bug fixes)

## Implicit requirement sweep
- Persistence/state: tests touching PostgreSQL use the dedicated DB env; no test pollutes the shared dev DB.
- External calls: embedding/LLM calls hit local Ollama; network-fetch tests are mocked or gated.
- Concurrency: isolated runner preserves per-file process isolation where needed.
- Irreversible actions: no destructive migrations; tests use throwaway project IDs.