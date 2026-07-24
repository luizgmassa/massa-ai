# E2E Feature Coverage Expansion — Design

## Approach

Test-only changes. No production source modified. Three categories:

### 1. Fix existing test (00.harness.smoke.test.ts)

Update `EXPECTED_TOOLS` array from 47→52 tools matching `CANONICAL_ORDER`.
Add `get_architecture`, `synapse_task_begin`, `synapse_task_end`,
`rename_project`, `merge_projects` in declaration order. Update comment
count 47→52.

### 2. Fix existing test (20.new-features.test.ts SG1)

Replace SG1 gap probe (which asserts scheduler has NO surface) with real
assertions of `/api/v1/scheduler/status` and `/api/v1/hooks/queue-status`.
The probe was wrong — the routes exist since Wave 6 N28.

### 3. New test file (24.dashboard-architecture.test.ts)

Covers disjoint feature surfaces not belonging to any existing suite:
- Dashboard routes (scheduler/status, hooks/queue-status)
- `get_architecture` MCP + HTTP route
- `rename_project` / `merge_projects` MCP + HTTP (dryRun only)

Reuses shared index for `get_architecture`. Uses e2e-prefixed project IDs for
rename/merge. MCP + HTTP parity where both transports exist.

### 4. Extend existing test (10.synapse.test.ts)

Add `synapse_task_begin` / `synapse_task_end` tests to the existing synapse
suite — same domain, same MCP handle, same gating.

## Verification

- `bun run type-check` (6/6) — catches type errors
- `RUN_E2E=1 bun test` for affected files — live stack required
- No production source changes means no build artifacts change

## Risk

Low. Test-only. No production code, no migrations, no security/auth surface.
Worst case: a tool name or route shape differs from the source — type-check
or the live E2E run catches it immediately.