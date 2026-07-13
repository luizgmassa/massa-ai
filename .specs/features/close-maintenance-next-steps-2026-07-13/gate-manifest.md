# Gate Manifest

Frozen before implementation. Rows may gain measured evidence; they may not be removed. Prior evidence under `repository-maintenance-2026-07-12/` is referenced, never rewritten.

## Verified Baseline

- HEAD/origin: `cc985905fae3495a31a16aaf0fbd75435a2e63df`; branch `main`; worktree clean.
- Bun `1.3.11`; Node `v25.9.0`; Turbo `2.10.2`; PostgreSQL tools `17.10`; Ollama client `0.31.2`; RTK available.
- Shared `:3333`: PID `9754`, start `2026-07-12 20:39:53 -0300`, command `bun src/index.ts`, health `ok`, service `massa-th0th-tools-api`, version `1.0.0`.
- Dedicated ports `3334`, `5433`, and `11435`: free.
- Required env: `DATABASE_URL=postgresql://test:test@127.0.0.1:5433/massa_th0th_test`, same `POSTGRES_VECTOR_URL`, `VECTOR_STORE_TYPE=postgres`, `MASSA_TH0TH_DEDICATED=1`.

## Sequential Gates

| ID | Gate | Required result | Status |
| --- | --- | --- | --- |
| G01 | Spec artifact validation and plan challenge | All artifacts active; full Evidence Audit serious findings incorporated; JSON and diff checks pass | PASS — delegated critic timed out read-only; strict local fallback completed |
| G02 | Build | `bun run build`, all tasks pass | PENDING |
| G03 | Type-check | `bun run type-check`, all tasks pass | PENDING |
| G04 | Focused unit/PG gates | Synapse, filters/cache, outage, embedding cache, workspace/index identity all pass | PENDING |
| G05 | Uncached root aggregate | Explicit dedicated env, `TURBO_FORCE=true`, `RUN_E2E=`; all tasks pass | PENDING |
| G06 | Test-owned destructive suite | N1/N3/E25/F88 execute, pass, recover, no unexplained skip | PENDING |
| G07 | Clean reprovision | Dedicated PostgreSQL/API/Ollama rebuilt; exact identity/version/provider/model/dimension | PENDING |
| G08 | Standard qwen G10 | Commit-locked fixture; all sequential groups and cleanup pass within unchanged gates | PENDING |
| G09 | PostgreSQL path/cleanup sentinels | No prefixed leaks, `adsads/`, absolute, traversal, or out-of-manifest paths | PENDING |
| G10 | Final cleanup/shared sentinel/reviewer | Dedicated ports free; shared before/after PID/start/health recorded without mutation (independent drift reported, not repaired); read-only review accepts evidence | PENDING |

## Evidence Fields

Every measured row records exact command, exit code, duration, pass/fail/skip counts, backend/database identity, provider/model/dimension, owned PIDs, skip reasons, and artifact/log pointer. Raw secrets and root `.env` values are never recorded.

## TASK-002 Measured Evidence

- Focused unit/Synapse gate: explicit dedicated env; 8 files; 82 pass, 0 fail, 0 skip; Bun-reported 181 ms, command wall 4.9 s; exit 0.
- Live F24: explicit PostgreSQL `127.0.0.1:5433/massa_th0th_test`, API `:3334`, Ollama `:11435`, qwen3-embedding:8b/4096; 1 pass, 0 fail, 0 skip, 35 filtered; 1.66 s; exit 0.
- Type-check: latest 6/6 Turbo tasks; 3.741 s; exit 0.
- Owned listeners: PostgreSQL PID 23481/data directory `/tmp/massa-th0th-close-20260713-1424/postgres`; Ollama PID 24780; API PID 25391. Shared `:3333` remained PID 9754 and healthy.
- Temporary F24 index: 4 files/4 chunks, 0 errors, 3.517 s; project `e2e-th0th-shared` inside the dedicated DB only. This stack is disposable and will be reprovisioned before fixture/G10 acceptance.

## TASK-003 Measured Evidence

- Focused filter/controller/cache gate: explicit dedicated env; 3 files; 25 pass, 0 fail, 0 skip; Bun-reported 148 ms, command wall 5.3 s; exit 0. Includes assertion-equivalent SQLite and dedicated PostgreSQL cache-key checks.
- Live F18: explicit PostgreSQL `127.0.0.1:5433/massa_th0th_test`, API `:3334`, Ollama `:11435`, qwen3-embedding:8b/4096; 1 pass, 0 fail, 0 skip, 35 filtered; Bun-reported 160 ms; exit 0.
- Type-check after the final implementation: 6/6 Turbo tasks; 3.217 s; exit 0.
- Disposable live fixture refresh: 5 files/7 chunks, 0 errors, 185 ms; project `e2e-th0th-shared` in the dedicated DB. API PID 35336; PostgreSQL PID 23481; Ollama PID 24780.
- Shared `:3333` remained PID 9754 and healthy after TASK-003. No shared process or data was mutated.
- Skip ledger: none. The 35 F18 entries reported as filtered are non-selected tests, not runtime skips.

## TASK-004 Measured Evidence

- Red sensor: 4 new zero-hit/outage/tool-envelope tests; 3 pass and the required-vector rejection assertion fails because the promise resolves `[]`; 1 fail; Bun-reported 106 ms, command wall 4.0 s; exit 1.
- Focused green gate: explicit dedicated env; 5 files covering outage transparency plus existing query-understanding/HyDE, lexical/graph, filters, and controller behavior; 52 pass, 0 fail, 0 skip; Bun-reported 1.75 s, command wall 6.3 s; exit 0.
- Type-check: 6/6 Turbo tasks; 3.221 s; exit 0.
- Structured transport seam: `SearchProjectTool` converts the surfaced required-vector rejection into the existing `{success:false,error}` response consumed unchanged by Tools API and MCP proxy. Live owned PostgreSQL/Ollama outage execution remains assigned to TASK-007 N1/N3.
- Shared `:3333` remained PID 9754 and healthy after TASK-004. No shared process or data was mutated. Skip ledger: none.

## TASK-005 Measured Evidence

- Bounded full-repository cold-qwen sample: empty dedicated PostgreSQL database; qwen3-embedding:8b/4096; stopped at 10 distinct completed files before the 180-second cap; 97 chunks and 97 embedding-cache rows; indexing job active for 51.795 s, measured throughput 0.193 files/s.
- Commit-locked fixture: local sparse clone at tested HEAD; 5 unique needle targets, 20 tracked source distractors, and 21 explicitly required support files; SHA-256 validation rejects changed, missing, secret, generated, `adsads/`, absolute, and traversal paths. Fixture selection requires both `MASSA_TH0TH_DEDICATED=1` and an explicit path.
- Cache dimension red/green: 8 pass/2 expected fail before dimension enforcement; final SQLite/PostgreSQL parity 10 pass, 0 fail. Final combined fixture/cache/search regression gate: 28 pass, 0 fail, 0 skip; Bun 1.468 s; exit 0.
- Focused live qwen/PostgreSQL sequence: `02.indexing` 19/19 in 401.15 s; `08.search` 36/36 in 24.84 s; `14.needles` 1/1 in 171 ms with identical sweeps at hit@1 .643, hit@5 .857, hit@10 .929, MRR .732; `18.graph-phase4` 9/9 in 896 ms; disposable negative fixture 1/1 in 3.63 s. No Bun test was skipped.
- Search relevance prerequisite exposed by the live fixture is independently committed as `e995ea6`; stale needle source spans are independently committed as `66607d3`. Neither qwen threshold, query, nor timeout changed.
- Type-check after final implementation: 6/6 Turbo tasks; 3.804 s; exit 0. Current owned listeners: PostgreSQL PID 23481, Ollama PID 24780, API PID 53768. Shared `:3333` remains PID 9754 and healthy.
- Conditional skip ledger from `08.search`: F21 stale auto-reindex path not isolated because the shared fixture was fresh; E5 cache internals lack public introspection; E6 keyword-only score breakdown is not publicly isolatable; E7 would require stopping Ollama and belongs to TASK-007; E29 is an internal fusion detail without a public toggle. Each test executed and passed its documented contract; Bun reported zero skips.

## TASK-006 Measured Evidence

- Canonical/profile unit gate: 10 pass, 0 fail, 0 skip; 27 assertions; latest Bun 1.404 s; exit 0. Covers symlink realpath, same-root alias reuse, non-force wrong-root refusal, force-owned replacement, five-field profile identity sensitivity, invalid-dimension fail-closed behavior, and dedicated-only guarded rebuild.
- Live wrong-root/path gate: seeded a fully warm duplicate fixture under the derived shared ID, proved all three warm probes hit, then `ensureSharedIndex` reset only the guarded dedicated prefix and rebuilt the canonical root. Final 3 pass, 0 fail, 0 skip; 351 assertions; Bun 8.63 s; exit 0. A live non-force API request for the wrong root returned structured `success:false` without changing the workspace.
- Derived identity `e2e-th0th-shared-cf1a4754d3e50a0f` binds fixture commit `7d680fd329578dfaec60e73cbfd3ae88224989c7`, manifest hash, provider `ollama`, model `qwen3-embedding:8b`, and dimension `4096`. Stored canonical root is `/private/tmp/massa-th0th-close-20260713-1424/qwen-fixture-t6`.
- Direct dedicated PostgreSQL sentinel: 468 vectors across 34 distinct metadata paths and 34 symbol-file paths; every path is relative, traversal-free, excludes `adsads/`, and belongs to the checked manifest. Search regression 36/36 in 35.33 s; symbol/workspace regression 23/23 in 6.48 s.
- Type-check: 6/6 Turbo tasks; latest 3.963 s; exit 0. Owned listeners: PostgreSQL PID 23481, Ollama PID 24780, API PID 64524. Shared `:3333` remains PID 9754 and healthy; it was not otherwise contacted or mutated.
- Conditional skip ledger: search reasons are unchanged from TASK-005. Symbol F46 and F49 lacked duplicate/FQN ambiguity in the sparse index and executed their documented best-effort assertions; Bun reported zero skips.

## Artifact Checksums

Initial SHA-256 freeze (before plan challenge):

| Artifact | SHA-256 |
| --- | --- |
| `spec.md` | `994951b5ff9b6f9fc682efc4790df29b41860ef6b2613b8a8be4e5ffd16460cb` |
| `context.md` | `a74e9390ce6c50dd5acfda1f1d91ee9717635f48e49fef23d7d0b5b12135d36f` |
| `design.md` | `91600195268c26cbdebbbe9dc933ef5ef664ba26293793ca14ee806315e0d053` |
| `tasks.md` | `c1113162d2e6054c0689a6caaa21bd619546c925ad77d236673823514f4cf050` |
| `failure-ledger.md` | `e066e84dfd1b72a2fb972303e34474a5bf1711e61756d50dcdb2549334d2622b` |
| `validation.md` | `f5488233cdcbc4afc8c3f3e6b75c3e7ac38b6909c4be65de5d9604cb0301ad59` |
| `postgres-parity-evidence.md` | `d38cc49bf8b012931d9c2c0205d1745e024d91ff9bc82bc6fb1678e3873da2c5` |

Final documentation records the post-execution hashes. `gate-manifest.md` uses its Git blob ID at each committed freeze because a file cannot embed its own stable cryptographic checksum.
