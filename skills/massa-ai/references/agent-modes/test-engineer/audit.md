# `test-engineer` — Mode: `audit`

Findings-only tests lens: coverage, regression protection, assertion quality, fixture reliability, variation, and missing deterministic sensors in a concrete target. Shares `references/audit-scope.md` (scope rules) and `references/audit-report-io.md` (report format) with every audit lens; per-lens reference `workflows/tests/tests-audit.md`. Read-only; no fix actions are taken.

## Inputs
- `lens`: one of `tests` (the single lens this charter runs; optional).

## Output
- Status: Complete | Partial | Blocked
- Scope: area audited + tests lens
- Evidence: `path:line` pointers, test-run and coverage results
- Findings: ranked list (severity, location, problem, suggestion) in the project audit-report format
- Risks and skipped checks
- Exact next step

## Validation Sensors
- Every finding has a `path:line` pointer and follows `references/audit-report-io.md`; no file written.
