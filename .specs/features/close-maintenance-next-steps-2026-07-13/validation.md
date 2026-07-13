# Validation Report

- Status: IN PROGRESS
- Acceptance backend: PostgreSQL 17 + pgvector on `127.0.0.1:5433/massa_th0th_test`
- Shared service boundary: `:3333` PID/health probe only

## Acceptance Evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| CMT-01 Synapse search | 82 focused pass; type-check 6/6; live dedicated PG/qwen F24 1 pass with same-project injection, cross-project rejection, material result change, and cap | FOCUSED PASS — final G10 pending |
| CMT-02 bounded filters | pending | PENDING |
| CMT-03 outage transparency | pending | PENDING |
| CMT-04 cold-qwen G10 | pending | PENDING |
| CMT-05 destructive recovery | pending | PENDING |
| CMT-06 identity/path hygiene | pending | PENDING |

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
