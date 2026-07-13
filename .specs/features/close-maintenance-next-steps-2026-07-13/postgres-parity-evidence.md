# PostgreSQL Parity Evidence

PostgreSQL/pgvector is the acceptance backend. This file adds evidence for the new behavior only and references, without modifying, `.specs/features/repository-maintenance-2026-07-12/parity-matrix.md`.

| ID | Behavior | Required PostgreSQL evidence | Status |
| --- | --- | --- | --- |
| NPAR-01 | Session-aware search scoping/ranking | 82 focused tests plus live PostgreSQL/qwen F24: matching session injected same-project result, rejected malicious cross-project result, changed identity/rank, and respected `maxResults`; invalid/mismatch/unscoped unit matrix passed | FOCUSED PASS — final G10 pending |
| NPAR-02 | Filtered bounded retrieval/cache | 25 focused tests cover include/exclude/combined, old-window domination, cap/no-retry, unfiltered `2N`, pathless and recursive-glob behavior; cache-key separation passes in SQLite and dedicated PostgreSQL; live PG/qwen F18 passes | FOCUSED PASS — final G10 pending |
| NPAR-03 | Retrieval outage envelope | Deterministic RLM tests distinguish valid zero-hit from required vector rejection and verify structured tool transport; existing optional query/lexical/graph degradation remains green | FOCUSED PASS — owned PostgreSQL/Ollama outage and recovery pending TASK-007 N1/N3 |
| NPAR-04 | Embedding cache dimension identity | SQLite and dedicated PostgreSQL both reject and replace wrong-dimension query and batch cache entries; final parity file 10/10 and combined focused gate 28/28 | FOCUSED PASS — final G10 pending |
| NPAR-05 | Workspace/profile/path identity | Warm wrong-root duplicate is reset only under dedicated guarded prefix; canonical workspace path restored; direct PG checks validate 468 vectors, 34 vector paths, and 34 symbol paths against the manifest with no absolute/traversal/`adsads` entries | FOCUSED PASS — final cleanup pending |
| NPAR-06 | Destructive restart recovery | Owned PostgreSQL outage/restart and post-recovery identity/data-plane checks | PENDING |
