# `test-engineer` — Mode: `fix`

Implement the confirmed findings of a saved tests audit report inside test files only, per `workflows/tests/tests-fix.md`.

## Output
- Status: Complete | Partial | Blocked
- Scope: test files changed, per finding ID
- Evidence: test commands and results, proof each new or changed test fails without the behavior it guards
- Findings: per-finding implementation summary
- Risks and skipped checks
- Exact next step

## Validation Sensors
- The diff stays inside test files and the assigned write set; no validation asset weakened.
