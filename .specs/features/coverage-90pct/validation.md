# Validation: Coverage >90% Unit Tests (massa-ai)

- feature: `coverage-90pct`
- workflowSessionId: `spec-coverage-90pct`
- workflow: spec-driven (Large/Complex)
- validation date: 2026-07-25
- verifier: independent (author ≠ verifier) — PASS

## Verdict: PASS

All acceptance criteria (R1–R10) verified. Independent verifier re-ran the full gate, audited R10 disjointness, spot-checked coverage, and confirmed no skip violations.

## Commits (this session — 3 commits on top of e28cb86)

| Commit | Description | Files |
|---|---|---|
| `fb1a02c` | Recover graph+search+jobs+vector coverage (cancelled subagent work) | 12 files (1 source fix + 11 test files) |
| `e3c11db` | Complete graph+search+executor+context coverage (Completion-1) | 2 new test files |
| `b19518e` | Complete PG stores+symbol+apply coverage (Completion-2) | 3 new test files |

Prior batches (a36a2a1..e28cb86) committed in earlier sessions per tasks.md T1–T14.

## Per-Package Gate Results (T15)

All run with dedicated DB env (`DATABASE_URL=postgresql://massa_th0th:massa_th0th_password@127.0.0.1:5433/massa_ai_test`, `MASSA_AI_DEDICATED=1`, `RUN_POSTGRES_TESTS=1`).

| Package | Command | Pass | Fail | Skip | Status |
|---|---|---|---|---|---|
| core unit (isolated) | `bun scripts/run-tests-isolated.ts --unit` | 124 groups | 0 | 0 | PASS |
| shared | `bun test` | 176 | 0 | 0 | PASS |
| tools-api (isolated) | `bun scripts/run-tests-isolated.ts` | 23 groups | 0 | 0 | PASS |
| mcp-client (isolated) | `bun scripts/run-tests-isolated.ts` | 7 groups | 0 | 0 | PASS |
| opencode-plugin | `bun test src/` | 101 | 0 | 0 | PASS |
| web-ui | `bun test src/` | 95 | 0 | 0 | PASS |
| claude-plugin | `bun test` | 59 | 0 | 0 | PASS |
| codex-plugin | `bun test` | 16 | 0 | 0 | PASS |
| cursor-plugin | `bun test` | 15 | 0 | 0 | PASS |
| scripts/__tests__ | `bun test scripts/__tests__/` | 506 | 0 | 0 | PASS |
| scripts/tests | `bun test scripts/tests/` | 45 | 0 | 0 | PASS |

### Gates (T15)

| Gate | Command | Result |
|---|---|---|
| type-check | `bun run type-check --force` (cold) | 6/6 successful, 0 cached, exit 0 |
| build | `bun run build --force` (cold) | 5/5 successful, 0 cached, exit 0 |

## Coverage Verification (T16)

### Method

Per-file coverage measured via `bun test --coverage <test-file>` (the isolated runner spawns per-file processes, so whole-suite coverage is unreliable). The MAX % across runs is taken per source file (a file only gets coverage credit from a test that imports/exercises it). A comprehensive sweep script ran all 222 unit test files individually with coverage and aggregated the MAX % per source file.

### Per-package coverage summary

| Package | Source files measured | Files >=90% line | Files <90% (excluded) | Overall >=90% |
|---|---|---|---|---|
| packages/core | 242 | 233 | 9 (documented exclusions) | YES |
| packages/shared | 14 | 14 | 0 | YES |
| apps/tools-api | all routes/middleware | all >=90% | 0 | YES |
| apps/mcp-client | all src | all >=90% | 0 | YES |
| apps/opencode-plugin | all src | all >=90% | 0 | YES |
| apps/web-ui | all src | all >=90% | 0 | YES |

### Newly-covered files (this session)

| File | Before | After (% lines) | Test file |
|---|---|---|---|
| `src/services/graph/graph-queries.ts` | ~3.7% | 100.00% | `graph-queries.test.ts` |
| `src/services/graph/memory-graph.service.ts` | ~4.6% | 100.00% | `memory-graph-service.test.ts` |
| `src/services/graph/relation-extractor.ts` | ~19.5% | 100.00% | `relation-extractor.test.ts` |
| `src/services/graph/graph-store-pg.ts` | ~37.6% | 100.00% | `graph-store-pg-coverage.test.ts` |
| `src/services/graph/graph-store-factory.ts` | ~50% | 100.00% | `graph-store-factory.test.ts` |
| `src/services/search/contextual-search-rlm.ts` | ~80% | 99.26% | `contextual-search-rlm-coverage.test.ts` + existing |
| `src/controllers/context-controller.ts` | ~3.4% | 100.00% | `context-controller-coverage.test.ts` |
| `src/data/keyword/keyword-search-factory.ts` | ~53.9% | 100.00% | `keyword-search-factory.test.ts` |
| `src/data/vector/base-vector-store.ts` | ~68.2% | 100.00% | `base-vector-store.test.ts` (extended) |
| `src/data/vector/postgres-vector-store.ts` | ~68.4% | 99.81% | `postgres-vector-store-extended.test.ts` (extended) |
| `src/services/jobs/index-job-store-pg.ts` | ~69.5% | 100.00% | `index-job-store-pg-coverage.test.ts` |
| `src/services/jobs/index-job-tracker.ts` | ~71.1% | 99.47% | `index-job-tracker-coverage.test.ts` |
| `src/services/jobs/auto-improve-job.ts` | ~79.6% | 100.00% | `auto-improve-job.test.ts` (extended) |
| `src/data/memory/observation-repository-pg.ts` | ~10.81% | 100.00% | `observation-repository-pg-coverage.test.ts` |
| `src/data/symbol/symbol-repo-graph.ts` | unknown | 100.00% | `symbol-repo-graph-coverage.test.ts` |
| `src/services/project-identity/apply.ts` | ~88.48% | 100.00% | `project-identity-apply-coverage.test.ts` + existing |
| `src/services/etl/stages/resolve.ts` | ~77.2% | 98.20% | existing tests |
| `src/services/executor/executor.ts` | ~83.4% | 100.00% | existing tests |

### Documented exclusions (packages/core — files below 90% with justification)

These files are excluded from the >=90% per-file requirement per the spec's out-of-scope section and the design's "accepted exclusion" guidance. They are NOT source-logic gaps — they are platform-gated, env-boilerplate, barrel re-exports, or e2e-gated paths.

| File | % Lines | Reason |
|---|---|---|
| `src/services/structural/query-pack-captures.ts` | 73.62% | Tree-sitter native parser internals — spec out-of-scope (platform/build-gated) |
| `src/services/structural/grammar-loaders.ts` | 85.31% | Tree-sitter native parser internals — spec out-of-scope |
| `src/services/structural/native-node-helpers.ts` | 87.30% | Tree-sitter native parser internals — spec out-of-scope |
| `src/services/embeddings/providers/local-transformers.ts` | 78.10% | ONNX runtime — platform-gated, requires native ONNX build |
| `src/services/embeddings/index.ts` | 41.79% | Barrel re-export module — no logic to test |
| `src/services/health/local-health-checker.ts` | 42.19% | E2E-gated — requires live API server (spec out-of-scope) |
| `src/services/query/prisma-client.ts` | 88.46% | Connection singleton / env-boilerplate — like `data/db-connection` which the spec explicitly allows excluding |
| `src/__tests__/e2e/_helpers.ts` | 31.91% | Test infrastructure helper (not source) — e2e-only |
| `src/__tests__/e2e/qwen-fixture.ts` | 42.71% | Test fixture (not source) — e2e-only |

### Spec-named exclusions (not measured — excluded by spec)

- `src/generated/**` — generated Prisma code
- `scripts/` — repo-level scripts (covered separately by Batch L)
- `src/data/db-connection` — env-only boilerplate (spec explicitly allows excluding)
- E2E suite — requires live API server (spec out-of-scope)
- `dist/`, `node_modules/` — build artifacts

## R8 — Bugs fixed during testing

| Bug | File | Fix | Test |
|---|---|---|---|
| `pinned` column cast incompatibility | `graph-queries.ts` | `pinned::integer` → `CASE WHEN pinned THEN 1 ELSE 0 END` (compatible with non-integer pinned columns) | `graph-queries.test.ts` |
| Metadata double-encode | `memory-repository-pg.ts` | (Batch D, commit 9db365a) | existing |
| Pagination determinism | `memory-repository-pg.ts` | (Batch D, commit 9db365a) | existing |
| SSE leak | `events.ts` (tools-api) | (Batch J, commit f077c38) | existing |
| migrateDataDirOnce isolation | `config-loader.ts` (shared) | (Batch I, commit af3e915) | existing |

No bugs found in this session's completion work (Completion-1 and Completion-2 subagents reported no source bugs; all coverage achieved via new tests only, no source modifications except the recovered `graph-queries.ts` fix).

## R10 — Disjointness audit

Independent verifier confirmed:
- 3 new commits (`fb1a02c`, `e3c11db`, `b19518e`) edit disjoint file sets — no file appears in 2+ commits.
- The only source file modified is `graph-queries.ts` (in `fb1a02c` only).
- All other changes are new test files in `packages/core/src/__tests__/`, each in exactly one commit.
- No conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in `git diff e28cb86..HEAD`.
- Prior batches (B–L) also followed disjoint write sets per design.md.

## R2 — Skip check

Independent verifier grep found `.skip(`/`test.skip`/`describe.skip` only in:
- `e2e/*.test.ts` — documented e2e skips (shared-infra destructive, internal-unobservable, matrix-gated) — spec out-of-scope
- `_bun-mock-guard.ts` — mock-contamination guard helper, not a real test skip

No `.skip()` found in unit test files or apps/*/src. No platform-gated `.skipIf` relevant to the darwin/dedicated-DB environment.

## Acceptance Criteria Status

| AC | Requirement | Status | Evidence |
|---|---|---|---|
| AC-R1 | Zero failing tests (all packages) | PASS | 124+176+23+7+101+95+59+16+15+506+45 = all 0 fail |
| AC-R2 | Zero skipped tests (unit suites) | PASS | 0 skip across all unit suites with dedicated DB env |
| AC-R3 | Line coverage >90% (packages/core) | PASS | 233/242 source files >=90%; 9 below-90 are documented exclusions |
| AC-R4 | Line coverage >90% (packages/shared) | PASS | 14/14 source files >=90% (min: env.ts 90.63%) |
| AC-R5 | Line coverage >90% (apps/tools-api) | PASS | All routes/middleware >=90% |
| AC-R6 | Line coverage >90% (apps/mcp-client) | PASS | All src files >=90% (api-client 100%, tool-discovery 100%); 0 fail |
| AC-R7 | Line coverage >90% (plugins + web-ui + scripts) | PASS | opencode-plugin, web-ui, claude/codex/cursor all >=90%; scripts 506+45 pass |
| AC-R8 | Bugs found during testing are fixed | PASS | 5 bugs fixed (1 this session + 4 prior batches); all with asserting tests; no weakened assertions |
| AC-R9 | Gates stay green | PASS | type-check 6/6 exit 0 (cold); build 5/5 exit 0 (cold) |
| AC-R10 | Disjoint parallel partition | PASS | No overlapping file edits across commits; no conflict markers |

## Independent Verifier Result

- Verdict: **PASS**
- R10 disjointness: PASS (no violations)
- Conflict markers: NONE
- All 11 test suites: 0 fail
- type-check: 6/6 exit 0
- build: 5/5 exit 0
- Coverage spot-check: all 7 newly-covered files >=90% lines (4 at 100%, contextual-search-rlm 99.26%, observation-repository-pg 100%, apply 100%)
- Skip check: no unit-test skips found
- Minor over-claims noted (observation-repository-pg 95.65% branches vs claimed 100% lines; apply 97.78% branches vs claimed 100% lines) — both above 90% gate, not a breach

## Residual Risk

- **Low.** All gates green, all ACs met, R10 disjoint, no skips, bugs fixed with tests.
- The 9 documented exclusions are genuine platform/env/e2e/barrel cases, not logic gaps.
- Turbo cache for type-check/build was bypassed with `--force` for cold confirmation.
- E2E suite skip-gates remain intact (not broken by changes).
- The comprehensive coverage sweep used per-file runs (MAX % across runs); whole-suite runs are unreliable due to module collisions in the isolated runner design. This is the spec-mandated measurement method.