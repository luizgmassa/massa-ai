# PostgreSQL Parity Evidence

PostgreSQL/pgvector is the acceptance backend. This file adds evidence for the new behavior only and references, without modifying, `.specs/features/repository-maintenance-2026-07-12/parity-matrix.md`.

| ID | Behavior | Required PostgreSQL evidence | Status |
| --- | --- | --- | --- |
| NPAR-01 | Session-aware search scoping/ranking | Live PostgreSQL F24 plus project/session matrix | PENDING |
| NPAR-02 | Filtered bounded retrieval/cache | PostgreSQL search/cache assertions for include/exclude/combined and cap behavior | PENDING |
| NPAR-03 | Retrieval outage envelope | Required PostgreSQL/vector dependency outage differs from zero-hit success | PENDING |
| NPAR-04 | Embedding cache dimension identity | Mismatched cached dimension rejected under qwen profile | PENDING |
| NPAR-05 | Workspace/profile/path identity | Direct vector/symbol metadata sentinels and wrong-root guarded rebuild | PENDING |
| NPAR-06 | Destructive restart recovery | Owned PostgreSQL outage/restart and post-recovery identity/data-plane checks | PENDING |
