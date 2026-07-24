# E2E Feature Coverage Expansion Specification

## Problem Statement

Since the last E2E coverage update (COVERAGE.md 2026-07-13), five new MCP tools
and two new dashboard routes shipped without E2E coverage. The smoke test
still asserts 47 tools while the MCP roster is now 52. The scheduler gap probe
in `20.new-features.test.ts` probes the wrong path and asserts no surface
exists, when `/api/v1/scheduler/status` and `/api/v1/hooks/queue-status` have
been live since Wave 6 N28. The existing test suite must be updated and new
tests added to cover these features.

## Goals

- [ ] MCP smoke test asserts exactly 52 tools matching `CANONICAL_ORDER`
- [ ] Dashboard routes (`/scheduler/status`, `/hooks/queue-status`) have E2E coverage
- [ ] `get_architecture` MCP tool + HTTP route have E2E coverage
- [ ] `synapse_task_begin` / `synapse_task_end` MCP tools + HTTP routes have E2E coverage
- [ ] `rename_project` / `merge_projects` MCP tools + HTTP routes have E2E coverage
- [ ] SG1 scheduler gap probe replaced with real assertions of the dashboard surface
- [ ] COVERAGE.md suite map updated to reflect new coverage

## Out of Scope

| Feature | Reason |
| --- | --- |
| Scheduler job firing (periodic consolidation/decay) | Boot-gated, non-deterministic; only observable via side-effects on a shared stack |
| Offline embeddings provider toggle | No per-request override surface; boot-time only |
| OS-level sandbox wrapper (seatbelt/Docker) | Platform-dependent; covered by unit tests in `apps/tools-api/src/__tests__/` |
| Auth-on 401 path | Requires server restart with API key; covered by `23.owned-destructive.test.ts` |
| Web UI markdown rendering / write-mode | Covered by `apps/tools-api/src/__tests__/dashboard-views.test.ts` unit tests |
| Tarjan SCC cycle detection via `?aspects=cycles` | Graph-density dependent; tested as additive field assertion, not deep SCC validation |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| New tests live in existing files where the feature domain matches (e.g., synapse task in `10.synapse.test.ts`), or a new file for disjoint features | Mixed: update existing files for same-domain features, new file `24.dashboard-architecture.test.ts` for dashboard+architecture+rename/merge | Minimizes file churn; groups related features | y |
| `rename_project` / `merge_projects` use dryRun:true (preview) for E2E; apply path needs a real indexed project | dryRun-only for standard E2E; apply path covered by `23.owned-destructive.test.ts` (N1/N3) | Apply mutates project identity — destructive on shared stack | y |
| `get_architecture` reuses `SHARED_PID` (shared index) like `18.graph-phase4.test.ts` | Reuse shared index | Architecture map needs a richly connected graph; shared monorepo index provides it | y |
| `synapse_task_begin` requires a `projectId` + `query` for the embedded search; use `SHARED_PID` | Reuse shared index with a known searchable query | Task envelope collapses create→prime→search→prefetch→access; needs searchable index | y |
| Dashboard routes degrade gracefully when subsystem unavailable | Assert graceful degradation shape (running:false, unavailable:true on error) | Route handler catches and returns error envelope, not 500 | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: MCP Smoke Test Roster Parity ⭐ MVP

**User Story**: As a developer running E2E, I want the smoke test to assert
exactly the 52 tools declared in `CANONICAL_ORDER` so that a missing or
phantom tool fails CI immediately.

**Why P1**: The smoke test is the first gate; a stale roster count hides
missing tools silently.

**Acceptance Criteria**:

1. WHEN the MCP server lists tools THEN the smoke test SHALL assert exactly 52 tools matching `CANONICAL_ORDER` from `tool-definitions.ts`
2. WHEN a tool is missing from the MCP `tools/list` response THEN the smoke test SHALL fail with the missing tool name
3. WHEN a phantom tool is advertised but not in `CANONICAL_ORDER` THEN the smoke test SHALL fail with the phantom tool name

**Independent Test**: Run `00.harness.smoke.test.ts` and verify 52 tools asserted.

---

### P1: Dashboard Route E2E Coverage ⭐ MVP

**User Story**: As a developer, I want E2E tests covering
`/api/v1/scheduler/status` and `/api/v1/hooks/queue-status` so that the
dashboard observability surface is contract-tested.

**Why P1**: These routes shipped in Wave 6 N28 and have no E2E coverage; the
SG1 gap probe wrongly asserts they don't exist.

**Acceptance Criteria**:

1. WHEN GET `/api/v1/scheduler/status` THEN the response SHALL return `{running, tickIntervalMs, jobs[]}` with valid types
2. WHEN GET `/api/v1/hooks/queue-status` THEN the response SHALL return `{pendingCount, maxPending, saturated}` with valid types
3. WHEN the scheduler is disabled (default) THEN `running` SHALL be `false` and `jobs` SHALL be an array (may be empty)
4. WHEN the hook queue is empty THEN `pendingCount` SHALL be `0` and `saturated` SHALL be `false`
5. WHEN GET `/api/v1/scheduler/status` is called via MCP tool `get_architecture` is NOT the scheduler tool; scheduler has no MCP tool — assert no scheduler MCP tool is advertised (gap probe inverted)

**Independent Test**: Run dashboard tests against a live API and verify shapes.

---

### P1: get_architecture E2E Coverage ⭐ MVP

**User Story**: As a developer, I want E2E tests covering the
`get_architecture` MCP tool and `GET /api/v1/project/:id/architecture` HTTP
route so that the architecture-specific deep map is contract-tested.

**Why P1**: `get_architecture` is distinct from `project_map` (architecture-
specific vs general overview) and has no E2E coverage.

**Acceptance Criteria**:

1. WHEN MCP `get_architecture` is called with a valid `projectId` THEN the response SHALL return `{success, data}` with architecture fields (packages, entryPoints, routes, hotspots, communities, layers)
2. WHEN HTTP `GET /api/v1/project/:id/architecture` is called THEN the response SHALL match the MCP response shape (parity)
3. WHEN `?aspects=cycles` is passed THEN the response SHALL include SCC cycle data if the graph has cycles, or an empty cycles array
4. WHEN an unknown aspect value is passed THEN the response SHALL return a 400 teaching error listing valid aspects
5. WHEN `GET /api/v1/project/architecture/_aspects` is called THEN the response SHALL return `{success, data:{aspects: VALID_ARCHITECTURE_ASPECTS}}`

**Independent Test**: Run architecture tests against shared index and verify.

---

### P2: synapse_task_begin / synapse_task_end E2E Coverage

**User Story**: As a developer, I want E2E tests covering the task envelope
lifecycle (`synapse_task_begin` / `synapse_task_end`) so that the 5-in-1
collapse + summary + end contract is tested.

**Why P2**: Task envelopes are Wave 5 FR-14/FR-15 with no E2E coverage.

**Acceptance Criteria**:

1. WHEN MCP `synapse_task_begin` is called with `agentId`, `query`, `projectId` THEN the response SHALL return `{success, data:{sessionId, search, partial}}` where `sessionId` is a string and `search` may be null if the search sub-step failed
2. WHEN HTTP `POST /api/v1/synapse/task/begin` is called THEN the response SHALL match the MCP shape (parity)
3. WHEN MCP `synapse_task_end` is called with a valid `id` THEN the response SHALL return `{success, data}` with a summary
4. WHEN `synapse_task_end` is called on a missing/ended session THEN the response SHALL return `{success:false, error:"Session not found or already ended"}`
5. WHEN `synapse_task_begin` is called and the search sub-step fails THEN `partial` SHALL be `true` and `errors[]` SHALL be non-empty, but `sessionId` SHALL still be present

**Independent Test**: Run task envelope tests and verify lifecycle.

---

### P2: rename_project / merge_projects E2E Coverage (dryRun only)

**User Story**: As a developer, I want E2E tests covering the
`rename_project` and `merge_projects` MCP tools and HTTP routes in dryRun
(preview) mode so that the identity preview contract is tested without
mutating real data.

**Why P2**: Apply path is destructive (covered by owned-destructive); preview
path is safe for standard E2E.

**Acceptance Criteria**:

1. WHEN MCP `rename_project` is called with `sourceProjectId`, `targetProjectId`, `dryRun:true` THEN the response SHALL return `{success, data:{planHash, ...}}` with a plan envelope
2. WHEN HTTP `POST /api/v1/project/rename` is called with `dryRun:true` (default) THEN the response SHALL match the MCP shape (parity)
3. WHEN `merge_projects` is called with `dryRun:true` THEN the response SHALL return a preview with per-store counts
4. WHEN `rename_project` is called with a non-existent `sourceProjectId` THEN the response SHALL return `{success:false, error:{code, message}}` with a non-200 status
5. WHEN `rename_project` is called with `dryRun:false` but missing `operationId` / `expectedPlanHash` THEN the response SHALL return `{success:false, error:{code, message}}`

**Independent Test**: Run rename/merge preview tests against e2e-prefixed project IDs.

---

### P3: COVERAGE.md Update

**User Story**: As a developer, I want COVERAGE.md updated to reflect the
new test coverage so the suite map stays authoritative.

**Why P3**: Documentation hygiene; COVERAGE.md is the E2E contract reference.

**Acceptance Criteria**:

1. WHEN COVERAGE.md is updated THEN the suite map SHALL include the new/modified test files and their coverage responsibilities
2. WHEN COVERAGE.md is updated THEN the "Tests updated" section SHALL list the changes

---

## Edge Cases

- WHEN `get_architecture` is called on a project with no symbol graph THEN the response SHALL degrade gracefully (empty arrays, not error)
- WHEN `synapse_task_begin` is called with an unindexed `projectId` THEN the search sub-step SHALL fail gracefully (partial:true, errors non-empty, sessionId present)
- WHEN `rename_project` dryRun is called with identical source and target THEN the response SHALL return an appropriate error code
- WHEN `/api/v1/scheduler/status` is called on a server where the scheduler threw an init error THEN the response SHALL return `{running:false, unavailable:true, error}` (not HTTP 500)
- WHEN `/api/v1/hooks/queue-status` is called on a server where the hook service is unavailable THEN the response SHALL return `{unavailable:true, error}` (not HTTP 500)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| E2E-01 | P1: Smoke Roster | Execute | ✅ Verified |
| E2E-02 | P1: Dashboard Routes | Execute | ✅ Verified |
| E2E-03 | P1: get_architecture | Execute | ✅ Verified |
| E2E-04 | P2: synapse_task_begin/end | Execute | ✅ Verified |
| E2E-05 | P2: rename/merge | Execute | ✅ Verified |
| E2E-06 | P3: COVERAGE.md | Execute | ✅ Verified |

**Coverage:** 6 total, 6 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Smoke test asserts exactly 52 tools (no missing, no phantom)
- [ ] Dashboard routes contract-tested with graceful degradation assertions
- [ ] `get_architecture` MCP + HTTP parity verified
- [ ] Task envelope lifecycle (begin/end) contract-tested with partial-failure path
- [ ] rename/merge preview path contract-tested (dryRun only)
- [ ] SG1 gap probe replaced with real assertions
- [ ] COVERAGE.md updated
- [ ] All existing tests still pass (no regressions)
- [ ] `bun run type-check` passes (6/6)