# E2E Feature Battery — Validation

Scope: **Phase 0 only** (5 of 21 Tasks). Phases 1–5 are not started and are not validated
here.

## Isolation evidence

| Item | Value |
| --- | --- |
| Worktree | `~/Projects/massa-ai-wt-e2e-battery` |
| Branch | `test/e2e-feature-battery` @ `b6990adb` |
| Primary checkout | returned to `main`, clean |
| Stack | started by `scripts/e2e-stack.sh up --profile default` **from this worktree** |
| Fixture | `/tmp/massa-ai-e2e-fixture` @ `788facbd87a568e4e3354cb541ef0d019fa5aaaf`, 70 tracked files, clean tree |
| Concurrent sessions | none — peer session confirmed released before the run |

Provisioning sensor for the fresh worktree: `bun test ./scripts/tests/verify-tree-sitter-grammars.test.ts`
→ **9 pass / 0 fail**, matching the primary checkout. First attempt read 6 pass / 3 fail; the
error was `dist consumer entry is missing: …/packages/core/dist/index.js`, i.e. an unbuilt
`dist`, **not** the documented missing-grammar signature that the same failure count matches.
`bun run build` (6/6) cleared it. `node_modules` was cloned with `cp -Rc` (APFS
copy-on-write, 4.3 s for 1.6 GB) rather than reinstalled, which avoids the documented
node-gyp break where `bun install` exits 0 while silently skipping the native grammars.

## Measured result — the clean run

```
bun test --max-concurrency 1  <the 16-file sequence>
  231 pass / 1 fail / 3 skip, 235 tests across 16 files, 360.69 s, exit 1
bun test --max-concurrency 1 src/__tests__/e2e/17.cleanup-verify.test.ts
  2 pass / 0 fail, 69 ms, exit 0
```

All six Phase-0 repairs hold: `N5` (1 winner, 2 refused `indexing_busy:134`, final state
searchable), `N15` (`vector_documents_2560d`, 58 document rows + 1 metadata sentinel),
`N18`/`N19` (401 without a key, 401 with a whitespace-only key, 200 with the configured key,
`/health` 200 with no key), `D2` (`searchProject` → seeds=1, nodeCount=13, edgeCount=26; the
class seed → nodeCount=1, edgeCount=0), `D4` (`routes` absent, the documented empty-analyzer
case), `T15`.

## Measured result — after fixing the product defect the run exposed

The one remaining failure was the `workspaces` row race described below. It is fixed in
`services/etl/pipeline.ts`; re-measured on the same stack after `bun run build` and
`e2e-stack.sh restart-api`, no concurrent session:

```
bun test --max-concurrency 1  <the same 16-file sequence>
  232 pass / 0 fail / 3 skip, 235 tests across 16 files, 361.14 s, exit 0
bun test --max-concurrency 1 src/__tests__/e2e/17.cleanup-verify.test.ts
  2 pass / 0 fail, exit 0
```

`N6` reading green is **not** the evidence, because `N6` is intermittent — it passed 3/3 on
an earlier run with the defect present, and eight concurrent fresh projectIds on an idle
stack reproduced the failure zero times. The evidence is the absence, counted the same way
the defect was found: `graph_generation_workspace_missing` occurred against **three distinct
projects** in the pre-fix run (`e2e-ai-nfr-*-6-a`, `-6-c`, `e2e-ai-merge-tgt-*`) and **zero**
times across the entire post-fix suite, read from `/tmp/massa-ai-e2e-stack/logs/api.log`
after a restart truncated it to a clean baseline.

Deterministic guard: `packages/core/src/__tests__/etl-workspace-row-ordering.test.ts`,
4 pass. Verified red against three separate mutations — the guard deleted, its `await`
dropped, and the guard moved to after `graphGenerations.begin()` — each failing the ordering
case and only that case. It also asserts that the unawaited subscriber which makes the guard
necessary still exists, so the guard cannot outlive its own reason unnoticed.

Gates after the product change: `bun run type-check` 6/6, `bun scripts/check-core-layering.ts`
PASS (0 violations across 998 tier-to-tier edges in 1085 files — `services/etl` importing
`services/workspace` is intra-tier), `bun run lint` clean, `bun run build` 6/6.

## The one failure is a product defect, not a test defect

`T9 N6 — concurrent index DIFFERENT projectIds parallelize` fails at
`15.nfr.test.ts:351`: three concurrent `index()` calls on three *distinct*, brand-new
projectIds returned `failed, completed, failed`.

Root cause, read from `/tmp/massa-ai-e2e-stack/logs/api.log`:

```
EtlPipeline: run failed {"projectId":"e2e-ai-nfr-mtqj5czu-6-c","durationMs":9,
  "error":{"message":"graph_generation_workspace_missing:e2e-ai-nfr-mtqj5czu-6-c",
  "stack":"… at lockWorkspace (…/graph-generation-repository-pg.js:62:19)"}}
```

The mechanism is a race between an unawaited event handler and a synchronous requirement:

1. `workspace-manager.ts:154-159` subscribes to `indexing:started` and calls
   `this.markIndexing(...)` **fire-and-forget** — the promise is never awaited, only
   `.catch`-logged. `markIndexing`'s own docblock says it "Creates the row if it doesn't
   exist yet."
2. `pipeline.ts:337` calls `graphGenerations.begin(...)` immediately after Stage 1 Discover.
3. `begin` reaches `lockWorkspace` (`graph-generation-repository-pg.ts:107-114`), which does
   `SELECT … FROM workspaces WHERE project_id = $1 FOR UPDATE` and throws
   `graph_generation_workspace_missing` when the row is absent.

On a fresh projectId over the sparse fixture, Discover completes in under 10 ms — faster than
the unawaited upsert commits. `durationMs: 9` and `durationMs: 14` on the failing runs are
that window. Three-way concurrency widens it through connection-pool contention, which is why
one of the three wins and two lose.

**This is intermittent, and that matters for how it was missed.** The same case passed 3/3 in
an earlier run. `N5`, the same-projectId case, is unaffected: its losers are refused by the
`managed_runs` lease with `indexing_busy` long before this point.

The same error appears twice more in the log without failing its test — `e2e-ai-merge-tgt-*`
in `24.dashboard-architecture`, and `graph_generation_stale_snapshot` on
`e2e-ai-index-poly-*`. Those suites tolerate a failed job where `N6` asserts on it.

**Not repaired here.** The fix is a product change (await the workspace row, or have `begin`
create it) and this branch's Phase 0 is scoped to the harness and to tests that asserted
removed contracts. Recorded as an open defect; `N6` is left failing because it is reporting
the truth.

## Corrections to earlier claims in this feature

Two figures previously recorded for this work were measured while two sessions shared one
checkout and one stack, and neither is admissible:

- The `223 pass / 5 fail` baseline and the `232 pass / 0 fail / 3 skip` after-repairs figure
  in `CHANGELOG.md` and `COVERAGE.md` were measured across overlapping windows. A concurrent
  session's `22.path-identity` `beforeAll` force-reindexes `SHARED_PID` onto a deliberately
  wrong root; that mutation lands on the shared index every other suite reads.
- The observed red that motivated the `T15` repair was produced by exactly that foreign
  reindex. The repair itself still stands, on evidence that needs no stack: `grep -rl` over
  `packages/core/src/__tests__/e2e/fixtures/polyglot` returns zero files for each of
  `ContextualSearchRLM`, `computePageRank` and `addDocuments` — the three symbols
  `isSharedIndexWarm`'s probes require — so asserting all three hit against a copy of that
  fixture is unsatisfiable on corpus logic alone. The reasoning is sound; the observation was
  contaminated, and is withdrawn as evidence.
- An earlier `N6` failure was attributed to cross-file coupling, and then to the same
  contamination. Both attributions are wrong: `N6` reproduces in this clean run with the root
  cause above.

`360.69 s` and `231 pass / 1 fail / 3 skip` are the first figures in this feature measured in
the state the work ships in.

## Verdict

**Phase 0: PASS with one recorded product defect.** Every Phase-0 acceptance criterion holds.
AC-03 is met in form — the sequence ran from the feature's own worktree against a stack it
started, with no concurrent session — and the single non-green result is a defect in the
product the battery was built to find, not a failure of the battery.
