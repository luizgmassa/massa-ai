# Coverage >90% — Handoff

**Active Feature**: coverage-90pct — COMPLETE + validated PASS
**Branch**: `main`
**Spec**: `.specs/features/coverage-90pct/spec.md`
**Design**: `.specs/features/coverage-90pct/design.md`
**Tasks**: `.specs/features/coverage-90pct/tasks.md`
**Validation**: `.specs/features/coverage-90pct/validation.md`

## Progress

### Phase 0 — Infra-green baseline (Batch A) [COMPLETE — prior session]
- T1: mcp-client isolation runner (a36a2a1)
- T2: scripts/tests docs-drift fixes (a721dee)
- T3: scripts/tests flaky/manifest fixes (a721dee)

### Phase 1 — Coverage batches B–L [COMPLETE — prior session]
- T4: Batch B — symbol graph + structural indexing (db75f26)
- T5: Batch C — synapse + compression (e280481)
- T6: Batch D — memory + jobs + R8 fixes (9db365a)
- T7: Batch E — search + query + web + vector (285d15b)
- T8: Batch F — etl + scheduler + cache + embeddings + identity (45c7188)
- T9: Batch G — hooks + executors + monitoring (2bcb405)
- T10: Batch H — controllers + models + tools (8971ee7)
- T11: Batch I — shared utils + config + migrateDataDirOnce fix (af3e915)
- T12: Batch J — tools-api routes + middleware + SSE leak fix (f077c38)
- T13: Batch K — mcp-client + plugins + web-ui (a8d5129)
- T14: Batch L — repo-level scripts (3f23637)
- Batch F stragglers + sweep wins (e28cb86)

### Phase 1 Completion (this session — 3 commits)
- `fb1a02c`: Recovered coherent partial work from 2 cancelled subagents (graph-queries, graph-store-pg, graph-store-factory, memory-graph.service, relation-extractor, keyword-search-factory, index-job-store-pg, index-job-tracker, auto-improve-job, base-vector-store, postgres-vector-store — all to >=90%; R8 fix in graph-queries.ts)
- `e3c11db`: Completion-1 subagent — contextual-search-rlm.ts 80→99.26%, context-controller.ts 3.4→100% (47 new tests)
- `b19518e`: Completion-2 subagent — observation-repository-pg.ts 10.81→100%, symbol-repo-graph.ts →100%, apply.ts 88.48→100% (79 new tests)

### Phase 2 — Integration gate (T15) + coverage verification (T16) [COMPLETE]
- T15: Full suite green — all 11 packages 0 fail, type-check 6/6 (cold), build 5/5 (cold)
- T16: Coverage verification — all in-scope source >=90% line; 9 documented exclusions; validation.md written
- Independent verifier: PASS (R10 disjoint, no conflicts, all suites green, coverage spot-checked)

## Gate Status
- Core unit (isolated): 124 groups, 0 fail
- shared: 176 pass, 0 fail
- tools-api: 23 groups, 0 fail
- mcp-client: 7 groups, 0 fail
- opencode-plugin: 101 pass, 0 fail
- web-ui: 95 pass, 0 fail
- claude-plugin: 59 pass, 0 fail
- codex-plugin: 16 pass, 0 fail
- cursor-plugin: 15 pass, 0 fail
- scripts/__tests__: 506 pass, 0 fail
- scripts/tests: 45 pass, 0 fail
- type-check: 6/6 exit 0 (cold re-run with --force)
- build: 5/5 exit 0 (cold re-run with --force)

## R8 Bugs Fixed
1. graph-queries.ts: `pinned::integer` → `CASE WHEN pinned THEN 1 ELSE 0 END` (this session, fb1a02c)
2. memory-repository-pg.ts: metadata double-encode (Batch D, 9db365a)
3. memory-repository-pg.ts: pagination determinism (Batch D, 9db365a)
4. events.ts: SSE leak (Batch J, f077c38)
5. config-loader.ts: migrateDataDirOnce isolation (Batch I, af3e915)

## Documented Exclusions (packages/core — below 90% with justification)
- `services/structural/query-pack-captures.ts` (73.62%) — tree-sitter native parser internals
- `services/structural/grammar-loaders.ts` (85.31%) — tree-sitter native parser internals
- `services/structural/native-node-helpers.ts` (87.30%) — tree-sitter native parser internals
- `services/embeddings/providers/local-transformers.ts` (78.10%) — ONNX platform-gated
- `services/embeddings/index.ts` (41.79%) — barrel re-export
- `services/health/local-health-checker.ts` (42.19%) — e2e-gated (needs live API server)
- `services/query/prisma-client.ts` (88.46%) — connection singleton / env-boilerplate
- `__tests__/e2e/_helpers.ts` (31.91%) — test infra (not source)
- `__tests__/e2e/qwen-fixture.ts` (42.71%) — test fixture (not source)

## Next Step
None — feature complete. coverage-90pct status → complete in FEATURES.json.