# Validation Report

- Status: IN PROGRESS
- Acceptance backend: PostgreSQL 17 + pgvector on `127.0.0.1:5433/massa_th0th_test`
- Shared service boundary: `:3333` PID/health probe only

## Acceptance Evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| CMT-01 Synapse search | 82 focused pass; type-check 6/6; live dedicated PG/qwen F24 1 pass with same-project injection, cross-project rejection, material result change, and cap | FOCUSED PASS — final G10 pending |
| CMT-02 bounded filters | 25 focused pass; SQLite/PG cache-key parity; live dedicated PG/qwen F18 1 pass; type-check 6/6 | FOCUSED PASS — final G10 pending |
| CMT-03 outage transparency | 52 focused pass: zero-hit `[]`, required vector rejection, optional-stream degradation, structured tool envelope; type-check 6/6 | FOCUSED PASS — destructive N1/N3 pending TASK-007 |
| CMT-04 cold-qwen G10 | 10-file cold sample at .193 files/s; commit-locked sparse fixture; dimension-mismatch rejection in SQLite/PG; focused live qwen sequence 66/66 file-level tests plus 1 needle benchmark and 1 negative sensor; unchanged floors .643/.857/.732 twice | FOCUSED PASS — final reprovisioned G10 pending |
| CMT-05 destructive recovery | pending | PENDING |
| CMT-06 identity/path hygiene | canonical-root production refusal; five-field hashed shared ID; warm wrong-root guarded rebuild; direct PG validation of 468 vectors/34 vector paths/34 symbol paths against the manifest | FOCUSED PASS — final cleanup sentinel pending |

Independent validation, discrimination sensors, diff range, skip audit, cleanup status, and shared before/after identity are required before this report can become PASS.

## TASK-002 Test Adequacy Review

| CMT-01 criterion | Assertion evidence | Spec outcome | Verdict |
| --- | --- | --- | --- |
| Missing session is exact stateless fallback | `search-synapse-integration.test.ts:70` — `expect(actual).toBe(base)`; `:71` — manager call count 0 | Same base array; no modulation | Covered |
| Unknown/expired session is exact stateless fallback | `search-synapse-integration.test.ts:85-86` — base identity and 0 manager calls | Same base array; no modulation | Covered |
| Workspace mismatch is exact stateless fallback | `search-synapse-integration.test.ts:100-101` — base identity and 0 manager calls | Same base array; no modulation | Covered |
| Matching session changes results and rejects cross-project candidates | `search-synapse-integration.test.ts:134-140`; `synapse-buffer-integration.test.ts:162-163` | Same-project injection allowed; cross-project ID absent; scoped options passed | Covered |
| Valid unscoped session modulates base only | `search-synapse-integration.test.ts:172-177`; `synapse-buffer-integration.test.ts:189-191` | Base rank changes; buffer read/write absent | Covered |
| Public request accepted; response shape unchanged | `search-controller.test.ts:277-279` | `sessionId` forwarded internally and absent from response | Covered |
| Live PostgreSQL/qwen behavior is observable and capped | `e2e/08.search.test.ts:414,427-431` | Two entries primed; same-project ID present, malicious ID absent, order/identity differs, length <= 3 | Covered |

Non-shallow check: each assertion fails under a plausible wrong implementation (ignored session, injected cross-project result, buffer use for unscoped session, public response leak, or missing final cap). Reverse mapping: all nine added test cases map only to CMT-01; no speculative tests. Guideline conformance: co-located Bun tests, dedicated PG live E2E, no assertion weakening/skips/deletions. Verdict: PASS.

## TASK-003 Test Adequacy Review

| CMT-02 criterion | Assertion evidence | Spec outcome | Verdict |
| --- | --- | --- | --- |
| Include-only fills beyond the former `2N` window with one call per fixed stream | `search-filter-overfetch.test.ts:71` | Five eligible results after twenty excluded candidates; each stream receives 25 once | Covered |
| Exclude-only and combined filters run before the final slice | `search-filter-overfetch.test.ts:96,120` | Five surviving runtime paths returned in each profile | Covered |
| Include whitelist cannot leak pathless graph candidates | `search-filter-overfetch.test.ts:145`; `search-controller.test.ts:142` | Pathless entry is rejected when include is present at both layers | Covered |
| Recursive glob uses standard zero-directory semantics | `search-filter-overfetch.test.ts:162` | `services/**/*.ts` matches `services/mutex.ts` | Covered |
| Candidate cap and no retry | `search-filter-overfetch.test.ts:181` | `N=100` requests exactly 300 from each fixed stream once and permits underfill | Covered |
| Unfiltered behavior remains `2N` | `search-filter-overfetch.test.ts:200` | Each fixed stream receives 10 for `N=5` | Covered |
| Cache identity separates bounded semantics without mutation | `search-filter-overfetch.test.ts:215`; `search-cache-key-parity.test.ts:23,49,123` | `bounded-v1` propagates; legacy misses in SQLite and PostgreSQL; arrays unchanged | Covered |
| Controller and live PostgreSQL behavior | `search-controller.test.ts:286`; `e2e/08.search.test.ts:175` | Filters forwarded; live F18 returns only matching paths | Covered |

Non-shallow check: the red gate failed 8 assertions before implementation; live F18 then exposed pathless and recursive-glob defects that focused tests were expanded to discriminate. No retry, timeout, threshold, response-tier, ranking, minimum-score, deduplication, or per-file-limit behavior was weakened. Verdict: PASS.

## TASK-004 Test Adequacy Review

| CMT-03 criterion | Assertion evidence | Spec outcome | Verdict |
| --- | --- | --- | --- |
| Genuine zero hit remains successful empty search | `search-dependency-outage.test.ts:51` | Resolves `[]` and caches the valid empty result | Covered |
| Required vector/backend failure is not a zero hit | `search-dependency-outage.test.ts:62` | Rejects with the original backend error and performs no cache write | Covered |
| Optional keyword/trigram failures remain vector-only | `search-dependency-outage.test.ts:75` | Vector hit is returned despite both lexical failures | Covered |
| Optional query-understanding/HyDE and graph behavior remains graceful | `query-understanding.test.ts` P2-DEGRADE/FANOUT matrix; `lexical-rrf-wiring.test.ts` A1/A3 | Existing optional paths remain green in the focused gate | Covered |
| Surfaced failure uses structured public envelope | `search-dependency-outage.test.ts:93`; `search_project.ts:110-129`; MCP proxy `apps/mcp-client/src/index.ts:219-230` | Tool returns `success:false` with dependency message; API delegates the tool response; MCP serializes it | Covered |

Non-shallow check: the red gate distinguished a zero-hit resolution from a dependency rejection while the adjacent success and degradation sensors stayed green. The production patch changes only the outer catch from `return []` to `throw`; optional catches remain intact. Actual owned-service outage and recovery are intentionally not inferred here and remain mandatory in TASK-007. Verdict: PASS.

## TASK-005 Test Adequacy Review

| CMT-04 criterion | Assertion evidence | Spec outcome | Verdict |
| --- | --- | --- | --- |
| Bounded full-repository calibration | Empty dedicated PG; stop at 10 durable files/97 chunks/97 cache rows after 51.795 s | Establishes .193 files/s without waiting for the known full-repo run | Covered |
| Commit and content identity | `qwen-e2e-fixture.test.ts` validates HEAD, exact materialized set, hashes, five targets, twenty distractors, and forbidden paths | Local/no-network fixture cannot silently drift or import secrets/generated paths | Covered |
| Dedicated-only selection | `_helpers.ts` resolver matrix | Explicit fixture path is ignored outside a dedicated run | Covered |
| Wrong embedding dimension | `embedding-cache-parity.test.ts` on SQLite and dedicated PostgreSQL | Wrong-length query and batch entries miss and are replaced | Covered |
| Unchanged qwen relevance | `14.needles.test.ts` two identical sweeps | hit@1 .643, hit@5 .857, hit@10 .929, MRR .732; original floors retained | Covered |
| Negative discrimination | `21.qwen-fixture.test.ts` omits rank-1 `centrality.ts` target | Positive sensor passes; non-empty negative search cannot surface omitted path | Covered |
| Representative production/E2E surface | Indexing 19/19; search 36/36; graph 9/9 | Fixture supports lifecycle, transport, relevance, and graph assertions | Covered |

Non-shallow check: the initial dimension sensors failed before implementation; the initial needle sweep failed its unchanged hit@5 floor; the graph suite failed when a required tracked production source was absent; and the negative profile physically omits its positive rank-1 target. No threshold or timeout increased, and no public contract was weakened. Verdict: PASS.

## TASK-006 Test Adequacy Review

| CMT-06 criterion | Assertion evidence | Spec outcome | Verdict |
| --- | --- | --- | --- |
| Canonical production roots | `index-project-identity.test.ts` plus live non-force API case | Symlink aliases converge; different root fails before job creation unless force is explicit | Covered |
| Profile-derived shared ID | `_helpers.ts` identity sensitivity test | Commit, manifest, provider, model, and dimensions each alter the 16-hex identity | Covered |
| Warm wrong-root rejection | `22.path-identity.test.ts` seeds a fully searchable duplicate clone under the target ID | Warm probes cannot bypass identity; guarded dedicated reset rebuilds expected canonical path | Covered |
| Mutation boundary | pure decision matrix plus live project-prefix path | Non-dedicated mismatch throws; only dedicated `e2e-th0th-*` target can rebuild | Covered |
| PostgreSQL path containment | direct vector metadata and `symbol_files.relative_path` queries | 34+34 distinct path sets are relative, traversal/`adsads`-free, and manifest-contained | Covered |
| Existing shared consumers | live search 36/36 and symbol/workspace 23/23 | Hashed ID remains transparent to E2E transports and shared-index consumers | Covered |

Non-shallow check: the wrong-root seed was confirmed richly searchable before `ensureSharedIndex`, so a probe-only implementation would have reused the wrong clone and failed the canonical-path assertion. The live non-force API test verifies the production seam rather than only the helper. Direct SQL checks do not infer metadata from API responses. Verdict: PASS.
