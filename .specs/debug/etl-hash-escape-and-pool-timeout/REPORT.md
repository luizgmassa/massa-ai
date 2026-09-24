# Debug Report — etl-hash-escape-and-pool-timeout

- **projectId**: `massa-ai` · **workflowSessionId**: `debug-etl-hash-escape-and-pool-timeout`
- **workflow**: debug · **fix size**: Standard (11 files touched, 2 unrelated root causes)
- **branch**: `fix/etl-hash-escape-and-pool-timeout` from `main` @ `44c887a1` (v1.63.0)
- **worktree**: `/Users/luizmassa/Projects/massa-ai-fix-etl-hash-escape-and-pool-timeout`
- **Isolation Gate**: satisfied — dedicated worktree + branch, recorded above.

## Issue Summary

Two independent failures surfaced while onboarding this repo:

| # | Symptom | Impact | Frequency | Environment |
|---|---|---|---|---|
| 1 | `EtlPipeline: run failed` — `TypeError: name contains reserved #` (from a separate project's log, `driver-app-mobile`, 2995 files) | Aborts indexing for the **whole project** over one symbol | Any project with a markdown heading containing `#` not at the start (e.g. "Fixes issue #456") | Any |
| 2 | `Connection terminated due to connection timeout` — `forceReindex` jobs on this repo (`massa-ai`) and a concurrent session's (`evolvai`) both failed at 97-98% completion after ~30 min | Full reindex never completes | Two large concurrent `forceReindex` jobs sharing one local Postgres pool | Local dev, shared massa-ai server process |

## Feedback Loop

| # | Loop | Before | After |
|---|---|---|---|
| 1 | `bun test packages/core/src/__tests__/structural-etl.test.ts -t "resolves a #-bearing"` — real native parse → resolve → `generationDefinitionIdentityColumns` | not present; manually confirmed the throw via `createStructuralIdentity({ name: "Fixes issue #456", ... })` reproducing the exact original stack | 15/0, including the new case |
| 2 | `bun test packages/core/src/__tests__/db-connection.test.ts / prisma-client.test.ts / postgres-vector-store-pool.test.ts` — asserts the constructed pool's actual `options.connectionTimeoutMillis` | not present; server logs showed the failure at the exact 5000ms `pg-pool` ceiling | 10/0, 3/0, 8/0 |

## Hypothesis Board

| # | Hypothesis | Evidence | Probe | Result |
|---|---|---|---|---|
| H1 | Issue 2 is a dead/overloaded Postgres server | `pg_isready` responded immediately when checked | `psql` `pg_stat_activity`, `max_connections`, `shared_buffers` | **Refuted as "down".** `max_connections=100` (5-20 in use), but `shared_buffers=128MB` against a ~734MB hot working set is undersized for two concurrent full-repo reindexes plus routine background traffic |
| H2 | Issue 2 is specific to the ETL pipeline's own code | Server log showed the same "Connection terminated due to connection timeout" text on unrelated subsystems (project-identity resolution, hook-attribution, observation store, scheduled-job persistence) starting *before* this session's reindex even began | Grep the full incident window in `~/.config/massa-ai/data/logs/massa-ai.log` | **Refuted.** System-wide contention, not an ETL-specific bug — confirmed by a concurrent peer session (`evolvai-b4`) hitting the identical signature on an unrelated project's reindex at the same time |
| H3 | Issue 1 is fully closed by escaping `#` in the FQN codec alone | `normalizeSymbolText` is the only place `#` was rejected | Independent verification ran the real native parser end-to-end through `generationDefinitionIdentityColumns` | **Disproven, then fixed.** The identity's escaped name and the *persisted* row's raw name diverged, moving the crash from the resolve stage to the load stage (`definition_fqn_name_mismatch`) instead of closing it |
| H4 | Issue 2 is fully closed by raising `db-connection.ts`'s pool timeout | That pool's `logger.info("PostgreSQL pool initialized"...)` line matched the failing job's log window | Independent verification searched for every `new Pool(...)`/`new pg.Pool(...)` call site in `packages/core` | **Disproven, then fixed.** Two more hardcoded 5000ms pools existed: `kernel/prisma-client.ts` (the Prisma adapter pool — the most likely actual failing pool, since ETL generation writes and lease heartbeats run through it) and `data/vector/postgres-vector-store.ts` |

## Root Cause

### Issue 1 — `#` in a symbol name aborts the whole project's indexing

`packages/core/src/kernel/fqn-codec.ts`'s `normalizeSymbolText()` threw `TypeError: name
contains reserved #` on any `#` in a symbol's `name`/`qualifiedName`, because `#` is the
FQN's own delimiter (`file#name`, enforced by `parseStructuralFqn` requiring exactly one
`#` in the whole string). The codebase already escaped a **leading** `#` to `%23` in two
places (`native-node-helpers.ts:44-45`, `resolver.ts:226-231`) — covering JS/TS private
class members (`#foo`) — but markdown headings (`query-packs/data-document.ts`'s
`@symbol.heading` capture) return raw heading text with no escaping at all, and export
specifiers had the same gap. Any heading like `## Fixes issue #456` or `## C# interop
notes` produced a name with a mid-string `#`, uncaught by the leading-only escapes, and the
uncaught throw aborted the entire ETL **resolve** stage for the whole project.

**Divergence point 1 — the codec:** `normalizeSymbolText` threw instead of escaping.
**Divergence point 2 — found only by independent verification:** `resolveStructuralFile`
(`services/etl/stages/resolve.ts`) persisted the symbol's **raw** name alongside the
**escaped** fqn. Any name with a `#` not already pre-escaped at extraction (i.e. every
heading) reached `generationDefinitionIdentityColumns` with a mismatched `id`/`name` pair
and was rejected downstream at the **load** stage instead — the crash moved, it did not
close.

### Issue 2 — Postgres connection-timeout ceiling too tight for legitimate load

`connectionTimeoutMillis` was hardcoded to 5000ms across three independently-constructed
`pg.Pool` instances (`kernel/db-connection.ts`, `kernel/prisma-client.ts`,
`data/vector/postgres-vector-store.ts`). Two concurrent full-repository `forceReindex` jobs
against one shared local Postgres — each ~30 minutes of sustained bulk writes (structural
symbols, embeddings, keyword documents) — pushed the server's effective connection/query
latency past that ceiling under normal contention, not an outage. Both jobs failed at
97-98% completion, essentially done, killed by a transient connection drop in the final
stretch. A concurrent peer session's `project_map` call independently hit the same 5000ms
ceiling from Prisma's interactive-transaction timeout, observed at 7.3-12s.

## Fix + Validation

| Commit | Issue | Files |
|---|---|---|
| `21722bbf` | 1 | `kernel/fqn-codec.ts`, `__tests__/structural-identity.test.ts` |
| `107b2b5e` | 2 | `kernel/db-connection.ts`, `__tests__/db-connection.test.ts` |
| `668fec7f` | 1 | `services/etl/stages/resolve.ts`, `__tests__/structural-etl.test.ts`, `__tests__/symbol-repository-pg-coverage.test.ts` — closes divergence point 2 found by independent verification |
| `74b50b96` | 2 | `kernel/prisma-client.ts`, `data/vector/postgres-vector-store.ts`, `__tests__/prisma-client.test.ts`, `__tests__/postgres-vector-store-pool.test.ts`, `__tests__/db-connection.test.ts` — closes the two additional hardcoded pools found by independent verification |
| `e9c11734` | 1 | `__tests__/structural-identity.test.ts` — strengthens the single-`#` test (couldn't discriminate a regex missing the `g` flag) |
| `543e38eb` | both | `CHANGELOG.md` |
| `358df862` | 1 | `__tests__/structural-etl.test.ts` — makes the new test DB-independent (found via the isolated test runner) |
| `d29f30b4` | both | `services/etl/stages/resolve.ts`, `__tests__/structural-etl.test.ts`, `__tests__/db-connection.test.ts` — drops a dead field propagation, decouples two tests from `DATABASE_URL` |

### Verification recipe

```bash
cd /Users/luizmassa/Projects/massa-ai-fix-etl-hash-escape-and-pool-timeout
bun run build            # packages/core type-check (tsc), exit 0
bun run lint              # oxlint, exit 0 on all changed files
bun test packages/core/src/__tests__/structural-identity.test.ts       # 28/0
bun test packages/core/src/__tests__/structural-etl.test.ts            # 15/0
bun test packages/core/src/__tests__/symbol-repository-pg-coverage.test.ts  # 82/0
bun test packages/core/src/__tests__/db-connection.test.ts             # 10/0
bun test packages/core/src/__tests__/prisma-client.test.ts             # 3/0
bun test packages/core/src/__tests__/postgres-vector-store-pool.test.ts    # 8/0
cd packages/core && bun scripts/run-tests-isolated.ts --unit \
  --filter='structural|resolve|fqn|db-connection|prisma-client|postgres-vector-store|etl-stages'
```

### Discrimination evidence

Both worktree-based sensor rounds ran in a scratch `git worktree add <path> HEAD` (never
`git stash`), mutated a copy, ran the covering test, then removed the worktree and
confirmed `git status --porcelain` on the real worktree matched the pre-sensor baseline.

| Sensor | Mutation | Observed |
|---|---|---|
| `structural-identity.test.ts` | `normalizeSymbolText` reverted to `throw` (the original bug) | 0 pass / **1 fail**, exact original crash signature reproduced |
| `structural-identity.test.ts` | escape changed to strip `#` instead of `%23`-substituting | 0 pass / **1 fail** on the exact-value assertion |
| `structural-etl.test.ts` | `resolveStructuralFile`'s `name: identities[index]!.name` line removed (pre-fix spread) | 0 pass / **1 fail**, reproduces the divergence-point-2 symptom independent verification found |
| `db-connection.test.ts` | `getPgPool`'s `connectionTimeoutMillis` reverted to `5_000` | 0 pass / **1 fail** |
| `prisma-client.test.ts` | adapter pool's `connectionTimeoutMillis` reverted to `5_000` | 0 pass / **1 fail** |
| `postgres-vector-store-pool.test.ts` | `createPool`'s `connectionTimeoutMillis` reverted to `5000` | 0 pass / **1 fail** |

## Prevention

| Risk | Guard |
|---|---|
| A symbol name with `#` anywhere breaks indexing again | `structural-identity.test.ts` (codec unit level, two-`#` case) + `structural-etl.test.ts` (real parse → resolve → persistence-validator level) |
| The persisted name and the fqn diverge again | `symbol-repository-pg-coverage.test.ts`'s explicit escaped-vs-raw-name pair against `generationDefinitionIdentityColumns` |
| A pool's `connectionTimeoutMillis` regresses to a hardcoded literal | Each of the three pools now has a test asserting the *constructed pool's* actual option value, not just the config function's return value |
| A fourth pool is added later without the shared timeout | `resolveConnectionTimeoutMs()` is the one place `DB_CONNECTION_TIMEOUT_MS` is read; grep for `connectionTimeoutMillis:` literals as a manual check until a repo-wide sensor exists (not added here — no precedent for that kind of lint rule in this codebase) |

**Not guarded, deliberately:** the two concurrent-`forceReindex`-jobs scenario that
triggered issue 2 (no server-side serialization/queueing of unrelated-project reindex jobs
sharing one pool) and the ~91% of registered workspace rows that are ephemeral test/upload
artifacts left in the developer's real database by prior test runs. Both are real findings
from this session but are separate, larger design questions — not fixed here.

## Residual Risk

1. **Issue 2's underlying contention is mitigated, not eliminated.** 15s gives real headroom
   but two sufficiently large concurrent reindexes could still exceed it; no
   backpressure/queueing was added.
2. **Test-database hygiene debt.** 422 of 462 registered workspaces in this developer's real
   `~/.config/massa-ai` database are ephemeral test/upload artifacts (`etl-lease-*`,
   `cov-symgen-*`, `embed-upload-*`, etc.) — not this session's root cause, but a real,
   separate finding surfaced while investigating issue 2's server logs.
3. **`callerSymbol` on resolved edges still carries the raw (unescaped) name** for `#`-bearing
   symbols (independent verification advisory 2) — `callerFqn` is escaped and edges resolve
   correctly, but the *display* name on such an edge differs from the definition's name.
   Same trade-off private `#member` names already had before this fix; not changed here.

## Independent Verification

One `code-reviewer` agent (`verify` mode) ran two rounds against the committed branch, both
read-only, both re-derived from source rather than taken on report.

### Round 1 — root-cause closure, initial pass

Verdict: neither fix closed its root cause. Two blocking findings:

1. **Fix 1 incomplete.** The escaped identity and the persisted symbol row's raw name
   diverged, moving the crash from the resolve stage to `definition_fqn_name_mismatch` at
   the load stage. Reproduced with a real native `.md` parse in a scratch probe, traced
   through `symbol-repo-identity.ts`'s validators. Also flagged the single-`#` test
   couldn't discriminate a regex missing the global flag.
2. **Fix 2 incomplete.** Only one of three hardcoded 5000ms `pg.Pool` instances was fixed;
   `kernel/prisma-client.ts` (the most likely actual failing pool, per the commit's own
   cited Prisma-timeout evidence) and `data/vector/postgres-vector-store.ts` were untouched.
   Also flagged the new tests asserted `getDbConfig()`'s return value, not the constructed
   pool's actual option — a call-site regression would have survived both.

Both fixed in `668fec7f` and `74b50b96`; both closures independently re-verified against
the real native parser and a fresh mutation of each pool's call site.

### Round 2 — re-verification, final pass

Verdict: **both root causes closed.** Ran `tsc --noEmit`, every affected test file directly
(no failures), and the isolated runner over the full affected surface plus every suite that
mocks `db-connection`/`prisma-client` (`project-identity-guard-invalidator.test.ts` — still
green, the new `resolveConnectionTimeoutMs` export doesn't break its partial mock). Traced
the next-run path (repository-seed round-trip through `materializeRepositorySeed`) for both
a top-level and a nested `#`-bearing heading, confirming no follow-on crash. Confirmed the
two `db-connection.test.ts`/`prisma-client.test.ts` `DATABASE_URL`-dependent test failures
under the isolated runner are pre-existing on `origin/main`, unrelated to this branch.

Five advisories, two acted on in `d29f30b4` (dead `qualifiedName` field propagation with no
`RawSymbol` field to hold it, and two tests needlessly coupled to `DATABASE_URL` when a
decoupled path already existed); three recorded as residual risk above rather than fixed
(`callerSymbol` raw-name display, the name-search UX trade-off already accepted for private
`#member` names, `.env.example` documentation for the new knob — consistent with the
pre-existing `DB_POOL_SIZE` convention, so not added).

### One lesson this produced

**An escape at the identity layer is not automatically an escape at the persistence
layer.** Two structures (the FQN's `name` and the symbol row's `name`) are built from the
same source value at different points in the pipeline; fixing the invariant where it's
*checked* (the codec) does not guarantee it holds where the value is *stored* (resolve.ts's
symbol map) unless something explicitly keeps them in sync. Verify the fix's effect at
every consumer of the fixed value, not only at the site that raised the original error.
