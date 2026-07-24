# E2E Feature Coverage Expansion — Tasks

## Gate Check Commands

- `bun run type-check` — 6/6 tsc projects pass
- `RUN_E2E=1 bun test packages/core/src/__tests__/e2e/00.harness.smoke.test.ts` — smoke passes (needs live stack)
- `RUN_E2E=1 bun test packages/core/src/__tests__/e2e/10.synapse.test.ts` — synapse passes (needs live stack)
- `RUN_E2E=1 bun test packages/core/src/__tests__/e2e/24.dashboard-architecture.test.ts` — new file passes (needs live stack)
- `RUN_E2E=1 bun test packages/core/src/__tests__/e2e/20.new-features.test.ts` — SG1 fix passes (needs live stack)

## Test Coverage Matrix

| Requirement | Test File | Test Name |
| --- | --- | --- |
| E2E-01 | 00.harness.smoke.test.ts | "MCP advertises all 52 tools" |
| E2E-02 | 24.dashboard-architecture.test.ts | DB1-DB5 dashboard route tests |
| E2E-03 | 24.dashboard-architecture.test.ts | AR1-AR5 get_architecture tests |
| E2E-04 | 10.synapse.test.ts | TE1-TE5 task envelope tests |
| E2E-05 | 24.dashboard-architecture.test.ts | RN1-RN5 rename/merge tests |
| E2E-06 | COVERAGE.md | suite map + tests updated section |

## Tasks

### Phase 1: Fix Existing Tests

**T1: Fix 00.harness.smoke.test.ts — update EXPECTED_TOOLS (47→52)**
- Add `get_architecture` after `project_map` in CANONICAL_ORDER
- Add `synapse_task_begin`, `synapse_task_end` after `synapse_list`
- Add `rename_project`, `merge_projects` at end after `fetch_and_index`
- Update comment "47 tools" → "52 tools"
- Update test name "MCP advertises all 47 tools" → "MCP advertises all 52 tools"
- Gate: `bun run type-check`

**T2: Fix 20.new-features.test.ts SG1 — replace gap probe with real assertions**
- Remove SG1 gap probe describe block
- Replace with dashboard route assertions: GET /api/v1/scheduler/status returns valid shape
- Add GET /api/v1/hooks/queue-status returns valid shape
- Keep OE1 offline embeddings gap probe (still valid)
- Gate: `bun run type-check`

### Phase 2: New Tests

**T3: Create 24.dashboard-architecture.test.ts — dashboard + architecture + rename/merge**
- Dashboard: DB1 scheduler/status shape, DB2 hooks/queue-status shape, DB3 scheduler disabled default, DB4 graceful degradation, DB5 no scheduler MCP tool
- Architecture: AR1 MCP get_architecture shape, AR2 HTTP parity, AR3 aspects=cycles, AR4 unknown aspect 400, AR5 _aspects list
- Rename/merge: RN1 dryRun preview shape, RN2 HTTP parity, RN3 merge preview, RN4 nonexistent source error, RN5 missing operationId error
- Gate: `bun run type-check`

**T4: Extend 10.synapse.test.ts — add synapse_task_begin/end tests**
- TE1: MCP synapse_task_begin returns sessionId + search + partial
- TE2: HTTP POST /synapse/task/begin parity
- TE3: MCP synapse_task_end returns summary
- TE4: synapse_task_end on missing session → success:false
- TE5: synapse_task_begin partial failure (unindexed projectId) → partial:true, errors non-empty, sessionId present
- Gate: `bun run type-check`

### Phase 3: Documentation

**T5: Update COVERAGE.md**
- Add `24.dashboard-architecture.test.ts` to suite map
- Update `00.harness.smoke.test.ts` row (52 tools)
- Update `10.synapse.test.ts` row (task envelope)
- Update `20.new-features.test.ts` row (dashboard routes, SG1 fix)
- Add "Tests updated in the E2E coverage expansion pass" section
- Gate: visual review