# SQLite to PostgreSQL Assertion Parity

This inventory freezes behavior groups before diagnostic execution. Exact assertion evidence
is added during focused PG gate review; a group remains blocking until every listed behavior
has equivalent evidence.

| ID | Preconditions / operation | Expected outcome and edge dimensions | SQLite source | PostgreSQL evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| PAR-01 Vector collection | create/query/add/default project/metadata | same collection lifecycle, project isolation, empty results, distance semantics | `sqlite-vector-store.test.ts:104-151,259-267,296-343` | `postgres-vector-store-pg.test.ts` covers default/empty/precomputed plus project-scoped collection/count/query/delete | Equivalent — closed |
| PAR-02 Memory FTS/CRUD | blank/special query; update/no-op; tags; delete/soft-delete | no invalid SQL; exact tag merge/clear; hard-delete edge cascade; idempotent tombstone; supersedes hidden | `memory-crud.test.ts:123-294`, `memory-repository-fts.test.ts:188-233` | `memory-repository-pg-parity.test.ts`: 7 PG scenarios / 28 assertions; punctuation normalization and blank-token SQL fixed | Equivalent — closed |
| PAR-03 Memory graph | create/upsert/filter/increment/batch/BFS/path | preserve weight 0; honor relation/min-weight/limit; atomic capped increment; count only successes; persist metadata flags | `graph-store.test.ts` | `graph-store-pg-parity.test.ts`: 6 PG cases including 25 concurrent increments; SQLite graph 32/32 | Equivalent — closed |
| PAR-04 ETL/index | concurrent same-project, partial embedding failure, fingerprint, force/incremental | serialize project; failure truth reflected; fingerprint only after durable writes; stale vectors removed | `etl-pipeline.test.ts:86-161,253` | regression suites + PG E2E + `etl-pipeline-pg.test.ts` real-workspace unchanged fingerprint assertion | Equivalent — closed |
| PAR-05 Checkpoints | expiry/cleanup/metadata-only/lazy state/stats/delete/auto thresholds | same TTL, integrity, cleanup, ordering, and thresholds | `checkpoint.test.ts:197,273-319,382-434,489-527` | expanded `checkpoint-pg.test.ts` covers expiry/purge, stats, missing delete, lazy state, and durable auto-checkpoint threshold | Equivalent — closed |
| PAR-06 Scheduler | persist/hydrate/order/failure/recovery | durable identical ordering and retry/failure semantics | `scheduler.test.ts` | `scheduler-store-pg.test.ts`: FIFO latest-wins, real drain, save/delete ordering, retry/recovery; 5/5 twice plus 34/34 regressions | Equivalent — closed |
| PAR-07 Handoffs | begin/list/accept/cancel/project/agent/dual-write | `open→accepted|expired`, project filters, deterministic terminal no-op, durable restart behavior | `handoff-repository.test.ts`, `handoff-service.test.ts` | additive migration + `PgHandoffStore`; `handoff-proposal-pg.test.ts` covers SQLite assertions, JSON/NULL, filters/order, restart, concurrent terminal CAS, direct PG rows | Equivalent — closed |
| PAR-08 Proposals | create/list/approve/reject/dedup/apply | pending terminal transitions, project filters, atomic status guard, durable restart behavior | `proposal-repository.test.ts`, `auto-improve-job.test.ts` | additive migration + `PgProposalStore`; same PG suite covers state transitions, filters/order, restart, concurrent CAS, direct PG rows | Equivalent — closed |
| PAR-09 Search cache | same query with threshold/explain/filter variants; response formatting | cache identity includes result-shaping options; presentation-only mode can share | SQLite/cache tests | `search-cache-key-parity.test.ts`: pre-fix collision sensor, SQLite+PG keys, RLM option propagation; 3 tests / 14 assertions | Equivalent — closed |
| PAR-10 Embedding cache | store/get/expiry/eviction under PG config | production factory uses PG implementation and preserves cache semantics | embedding cache tests | `embedding-cache-parity.test.ts`: exact provider/model/content identity, batch, TTL, scoped cleanup/stats, restart, factory; 8 PG + 4 SQLite + 16 provider regressions | Equivalent — closed |
| PAR-11 Observation/session/jobs | PG config, restart/hydration/write-through | PG selected; persistence survives restart; expiry equivalent | SQLite counterparts | observation/jobs exceed parity; expanded session PG suite rejects expired persisted sessions after fresh hydration | Equivalent — closed |

## Implementation Clusters

1. Tests-only closure: PAR-01, PAR-04, PAR-05, PAR-11.
2. Small production fixes and PG suites: PAR-02, then PAR-09.
3. Substantive single-module fixes: PAR-03, then PAR-06.
4. Factory/interface normalization: PAR-10.
5. Cross-boundary migration/runtime stores: PAR-07 and PAR-08 closed under the approved additive amendment.

## PostgreSQL-Native Dimensions

PG evidence must additionally cover transaction/concurrency behavior, JSON and array
round-trips, `NULL` ordering, unique/FK constraints, pool lifecycle, pgvector index/distance
behavior, and extension availability. A mapped test with weaker assertions remains a gap.
