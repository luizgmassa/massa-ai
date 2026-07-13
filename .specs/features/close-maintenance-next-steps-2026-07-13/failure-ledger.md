# Failure Ledger

| ID | Cluster/gate | Classification | Decisive evidence | Attempts | Status/next |
| --- | --- | --- | --- | ---: | --- |
| E-001 | G01 plan challenge delegation | Orchestration timeout | Read-only critic did not return within its bounded window and was interrupted without writes | 1 | Closed by strict local full Evidence Audit; serious revisions applied before implementation |

## Iteration Policy

- Maximum three fix/reverify iterations per failure cluster.
- Escalate after two unsuccessful local attempts.
- Partial logs and prior evidence never close a failure.
- Environment/setup failures remain invalid evidence until a clean rerun.
- Every skip requires an explicit reason; a new unexplained skip fails the gate.
