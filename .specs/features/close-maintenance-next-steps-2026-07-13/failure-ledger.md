# Failure Ledger

| ID | Cluster/gate | Classification | Decisive evidence | Attempts | Status/next |
| --- | --- | --- | --- | ---: | --- |
| E-001 | G01 plan challenge delegation | Orchestration timeout | Read-only critic did not return within its bounded window and was interrupted without writes | 1 | Closed by strict local full Evidence Audit; serious revisions applied before implementation |
| E-002 | TASK-002 analysis delegation | Orchestration timeout | Read-only mapper did not return within its bounded window and was interrupted without writes | 1 | Closed by focused local source reads; no implementation assumption remained unverified |
| E-003 | TASK-002 first unit red run | Environment/setup defect | Command omitted explicit DB/vector env; Bun loaded root `.env` and attempted PG session-store writes, which failed | 1 | Invalid evidence; shared `:3333` was not contacted; all later commands pinned dedicated `:5433/:3334/:11435` and passed |
| E-004 | TASK-002 diagnostic runner | Orchestration timeout | Read-only Test Runner did not return within its bounded window and was interrupted without edits/service control | 1 | Main rerun is measured evidence: focused 82/0/0, F24 1/0 with 35 filtered, type-check 6/6 |
| E-005 | TASK-003 first green run | Implementation defect | `retrievalWindow` was added to logging instead of the cache options; two focused assertions remained red | 1 | Closed by moving the field to the cache identity; final focused gate 25/0/0 |
| E-006 | TASK-003 live F18 | Implementation defect | Pathless graph candidates passed an include whitelist and serialized without `filePath` | 1 | Closed by making an include pattern reject pathless candidates in RLM and controller; regression assertions added |
| E-007 | TASK-003 live F18 | Implementation defect | The RLM's ad-hoc glob conversion made `**/` require a subdirectory, so a direct child under `services/` underfilled | 1 | Closed by using the existing `minimatch` semantics at both search layers; direct-child regression and final live F18 pass |
| E-008 | TASK-004 analysis delegation | Orchestration timeout | Read-only outage mapper did not return within its bounded window and was interrupted without writes or service control | 1 | Closed by local source-backed path inspection from RLM through tool, API route, and MCP proxy |
| E-009 | TASK-004 red gate | Expected implementation defect | Required vector error was logged but resolved as `[]`; zero-hit, optional lexical degradation, and tool envelope already passed | 1 | Closed by rethrowing the outer required retrieval failure; focused green gate 52/0/0 |
| E-010 | TASK-005 analysis delegation | Orchestration timeout | Read-only qwen mapper did not return within its bounded window and was interrupted without writes or service control | 1 | Closed by local source-backed mapping and measured focused gates |
| E-011 | TASK-005 fixture manifest unit | Fixture authoring defect | One copied Prisma source digest had 62 characters, so manifest validation rejected it | 1 | Closed with the measured 64-character SHA-256; fixture unit 4/4 |
| E-012 | TASK-005 sparse clone unit | Fixture authoring defect | Unrooted no-cone sparse patterns materialized parent README/package files outside the manifest | 1 | Closed by root-anchoring every exact sparse path; materialized file set equals manifest |
| E-013 | TASK-005 live search | Production relevance defects | F19 returned graph-only memory at normalized 0.7 for nonsense; E1 sent blank input to Ollama and returned `success:false` | 1 | Closed by explicit graph-only zero relevance and blank-query short circuit; unit 14/14 and rebuilt live search 36/36; prerequisite commit `e995ea6` |
| E-014 | TASK-005 first live rerun | Build-state defect | API imports `@massa-th0th/core/dist`; source-only restart still ran old search code | 1 | Invalid rerun; rebuilt core, recycled only owned `:3334`, cleared only run-owned search cache, then 36/36 passed |
| E-015 | TASK-005 qwen needles | Stale sensor metadata | Four unchanged rules had moved outside captured line spans, yielding hit@5 .571 despite top chunks containing the rules | 1 | Closed by source-verified span refresh only; unchanged queries/floors yield .643/.857/.732 twice; prerequisite commit `66607d3` |
| E-016 | TASK-005 graph fixture | Fixture coverage gap | Sparse profile omitted the typed-edge extractor, so `project_map.routes` was absent and D4 failed | 1 | Closed by adding tracked production `typed-edges.ts` as support; warm reindex 34 files/468 chunks; graph 9/9 |
| E-017 | TASK-006 first direct SQL sentinel | Test/schema mismatch | Sentinel queried `symbol_files.file_path`; PostgreSQL schema exposes `relative_path` | 1 | Closed by aliasing the verified `relative_path` column; complete wrong-root/path gate 3/3 with 351 assertions |
| E-018 | TASK-007 first owned destructive run | Harness setup defects | N1 recall initialized only after Ollama stopped and entered dev fallback; F88 wrote JSON although the documented server runtime control is `HOOKS_ENABLED` | 1 | Closed by warming search/recall/remember before outage and passing the explicit env on owned API restart; final gate 4/0/0 with 73 assertions |
| E-019 | TASK-007 executable-attestation hardening | Environment portability defect | `/usr/bin/proc_pidpath` is absent on this host, so the hardened harness failed during initial PostgreSQL ownership capture | 1 | Closed by using the already-required portable `lsof -d txt` executable set; failed run left all dedicated ports free and shared PID 9754 healthy |

## Iteration Policy

- Maximum three fix/reverify iterations per failure cluster.
- Escalate after two unsuccessful local attempts.
- Partial logs and prior evidence never close a failure.
- Environment/setup failures remain invalid evidence until a clean rerun.
- Every skip requires an explicit reason; a new unexplained skip fails the gate.
