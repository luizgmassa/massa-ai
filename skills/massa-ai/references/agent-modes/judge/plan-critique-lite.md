# Judge — Mode: `plan-critique` (depth: `lite`)

Output for `depth: lite`:
- Status: Complete | Partial | Blocked
- Strongest low-risk challenges
- Assumption most likely to fail
- Deterministic check that would falsify success
- High-risk or broad-scope trigger found, if any
- `escalate_to_full: true|false`
- Escalation reason
- Exact next step

Validation sensors: lite output always carries an explicit `escalate_to_full` boolean and reason.
