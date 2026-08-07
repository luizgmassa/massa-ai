# Quick 011 — architecture-map hook race: await the fixture DELETE

## Goal
Fix the Coverage-on-main failures of 2026-08-07 (run 31193777485, twice, a
different victim case each time): `graph_generation_workspace_missing:p4d4-arch-map`
thrown from `lockWorkspace` (`graph-generation-repository-pg.ts:113`) while an
adjacent case's pipeline run completed normally in the same window.

## Root cause (verified first-hand)
- `architecture-map.test.ts` hooks (`beforeEach`/`afterEach`) were sync arrows
  calling `repo.clearProject(TEST_PROJECT)` — an async
  `DELETE FROM workspaces WHERE project_id = …` (`symbol-repo-queries.ts:374-382`,
  the only DELETE writer of `workspaces` in the call graph) — without awaiting
  it. bun:test does not await a floating promise from a sync hook (proven by a
  minimal two-file demo pair: the defect shape observes the promise still
  pending inside the test body; the async-await shape observes it settled).
- Under READ COMMITTED the DELETE's snapshot is taken when the statement starts
  executing, not when the client submits it. On a loaded Coverage runner the
  floating DELETE stalls long enough that its scan runs after the NEXT case's
  `markIndexing` upsert commits — it then removes the fresh row, and `begin()`'s
  `SELECT … FOR UPDATE` finds nothing. Raw attempt-1 log confirms the adjacency:
  `d4-routes-1` run completed 15:42:17.867, the routes case passed at 18.004,
  and `d4-defensive-1` failed 12 ms into its run at 18.021.
- The un-awaited call also made the hooks' `try/catch` dead code — an async
  rejection could never reach it.
- Local reproduction attempts (suite ×10, and a 40-iteration mechanism script
  replaying the unawaited-DELETE → upsert → window pattern against the
  dedicated 5433 DB) lost zero rows: on an idle local server the DELETE always
  executes sub-ms, before the upsert. The loss requires CI-grade scheduling
  delay, which is why this only ever fired on Coverage runners.

## Fix
- `architecture-map.test.ts` — both hooks are now `async` and `await
  repo.clearProject(TEST_PROJECT)` inside the existing try/catch (restoring the
  intended best-effort semantics).
- `trace-path.test.ts` — the identical hook shape (it is the file
  architecture-map's own comment cites as its pattern source); same fix. A
  repo-wide sweep found no other unawaited `clearProject` hook site.

## Why no committed regression test
A sensor for this race would itself be a timing race (nondeterministic by
construction — 0/10 local reproduction pre-fix). The durable guarantees are
bun's documented hook contract (a returned promise is awaited) plus the two
suites' own CI signal; the red evidence lives in run 31193777485 and the demo
pair recorded here.

## Gate
- `architecture-map.test.ts` ×15 against the dedicated 5433 test DB
  (RUN_POSTGRES_TESTS=1): 15/15 exit 0, zero `workspace_missing` lines.
- `trace-path.test.ts` ×5: runs 2-5 green (18 pass / 0 fail, ~900 ms). Run 1
  failed on an unrelated pre-existing cold path: its first pipeline run spent
  96 s outside its stages (stage sum ≈1 s) on a vector-store 384d→2560d
  orphan-chunk scan against dirty shared test-DB state, and three queued cases
  hit their 30 s budgets behind the pipeline's per-project serialization
  ("waiting for prior project run"). Mechanically unrelated to awaiting a
  sub-ms per-project DELETE.
- `packages/core` `bun run build` (tsc emit) exit 0; `bun run lint` exit 0.
