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

## The workspace aggregate, measured with the dedicated pins unset

This was Phase 0's one outstanding gate: the only prior attempt ran with the dedicated
stack's variables still exported, so `apps/tools-api/src/routes/system.test.ts` saw
`http://127.0.0.1:11435` where it asserts the default `http://localhost:11434`. Re-measured
here from this worktree, no concurrent session on the checkout, the stack, or the shared
database.

**The recorded command does not run as written, and the reason is provisioning, not
product.** It unsets the dedicated pins but never restores `DATABASE_URL`, and a
`git worktree` does not carry a gitignored `.env` — the primary checkout has one
(`~/Projects/massa-ai/.env`, a single variable, `postgresql://massa_ai@localhost:5432/massa_ai`)
and this worktree has none. The first attempt therefore died in 15.9 s with
`error: DATABASE_URL is required and must be a PostgreSQL URL`, thrown from
`requirePostgresDatabaseUrl`. The prior session got further only because its shell still held
the stack's `eval`. `DATABASE_URL` is exported from the primary checkout's `.env` for the run
rather than copied into the worktree, so there is only ever one definition in play.

Two flags were added, and both make the measurement stricter:

- `--force`. `test` is `turbo run test`, and turbo replays cached task results — a green line
  can be a replay rather than an execution. The run reports `Cached: 0 cached, 12 total`.
- `--continue`. Turbo cancels sibling tasks when one fails. The first attempt closed at
  `8 successful, 12 total`: three tasks never ran at all, which is indistinguishable from
  three tasks passing if only the tail is read.

```
env -u OLLAMA_BASE_URL -u MASSA_AI_API_URL -u MASSA_AI_DEDICATED \
    -u MASSA_AI_E2E_PROJECT_PATH -u RUN_E2E -u XDG_CONFIG_HOME \
    -u OLLAMA_EMBEDDING_MODEL -u OLLAMA_EMBEDDING_DIMENSIONS \
    MASSA_AI_EXECUTOR_SANDBOX=none bun run test --force --continue

package                    pass  fail  skip  files  bun-invocations
@massa-ai/core             3877     0   688    285  158
@massa-ai/mcp-client        311     0     0     25   12
@massa-ai/opencode-plugin   138     0     0      8    1
@massa-ai/shared            498     0     0     29    1
@massa-ai/tools-api         767     0     0     63   34
@massa-ai/web-ui            778     0     0     15    1
TOTAL                      6369     0   688    425  207

Tasks:    12 successful, 12 total
Cached:    0 cached, 12 total
Time:     1m16.843s        exit 0
```

The per-package figures are parsed from the log by script into a file, not read through a
shell filter. Zero `(fail)` lines and zero `ERROR` lines; the task count closes. A peer
session was running `bun test` in `packages/shared` from a different worktree during the
window — CPU only, no PostgreSQL, no Ollama, no network — so the counts are unaffected and
the 1m16.843s wall clock may be slightly inflated.

## The two runners `bun run test` never reaches

- `bun run test:plugins` — **142 pass / 0 fail**, 10 files, 108.2 s.
- `bun run test:scripts` — **1820 pass / 3 fail**, exit 1. One of the three was ours.

### EDC-06: Phase 0 shipped an unlisted embedding surface

```
(fail) embedding defaults parity (EDC-06) > no unlisted tracked file assigns an
       OLLAMA_EMBEDDING_* default
+   "scripts/e2e-stack.sh: OLLAMA_EMBEDDING_MODEL=${EMBED_MODEL}"
```

`scripts/e2e-stack.sh` is this feature's own file — `git log main -- scripts/e2e-stack.sh` is
empty — and EDC-06's Tier-3 completeness scan exists precisely to fail by name when a new
surface ships unlisted. `bun run test` cannot see it: turbo only reaches `packages/*` and
`apps/*`, and `scripts/` is neither.

Repaired by enrolling the surface in `PAIR_SURFACES`, not by widening the allowlist, so the
script's model and width are now both checked against the runtime reference on every run.
That is strictly stricter than the silence it replaces, and it guards the failure this
feature's own `design.md` calls out as invisible: a wrong width does not fail, it silently
routes the run into a different `vector_documents_<n>d` table. The extractors anchor on the
two `${VAR:-default}` definitions rather than the `OLLAMA_EMBEDDING_*` assignments that
expand them; `extractOne` demands exactly one match, so a rotted anchor fails loudly.

Verified red before trusted, each mutation reverted by editing the literal back — never by
`git checkout`, which would have taken the uncommitted files with it:

| mutation | observed |
| --- | --- |
| width `2560` → `4096` | red — `scripts/e2e-stack.sh: dims=4096 (want 2560)` |
| model `4b` → `8b` | red — `scripts/e2e-stack.sh: model=qwen3-embedding:8b (want qwen3-embedding:4b)` |
| unmutated | 7 pass / 0 fail, 8 pair surfaces against `qwen3-embedding:4b/2560` |

`test:scripts` after the repair: **1821 pass / 2 fail**.

### The remaining two failures are `main`'s, and the first attribution was wrong

`pyts golden: lessons > list --status all` and `> list --query filter` both fail with
`Expected - 4 / Received + 0`, the four missing lines being `L-002`…`L-005`. The working tree
carries an uncommitted `.specs/lessons.json` that removes exactly those four, which makes the
attribution look settled. It is wrong. Restoring `git show HEAD:.specs/lessons.json` in place
and re-running reproduces both failures unchanged; the working copy was then restored and
verified byte-identical by `shasum -a 256` before and after. Running the same suite in the
primary checkout on clean `main` (`d32fce58`) gives the same **44 pass / 2 fail**.

So `bun run test:scripts` is red on `main` today, from a `lessons list` golden that no longer
matches what the tool emits. Pre-existing, outside this feature, and recorded rather than
fixed. After the EDC-06 repair this branch has exactly `main`'s two failures and no others.

## Bring-up budget, measured

`up --profile default` aborted with `timed out after 30s waiting for postgres :5433` on a host
at load 5.17; `status` immediately afterwards reported that same PID healthy, so the postmaster
was starting, not stuck. Because `up` dies at the first failed wait, ollama and the API were
never attempted and the status table showed three services down when one was slow. The
listener budget is now 90 s (matching the API wait) and the query-readiness budget 60 s. Both
are startup budgets, not assertions; a genuinely dead postmaster still fails.

Environment contract re-verified against the running stack after the change:
`dedicated? true`, no throw, `PROJECT_PATH: /tmp/massa-ai-e2e-fixture`,
`SHARED_PID: e2e-ai-shared-1f0530f72b887cbe`, API `http://127.0.0.1:3334`. Fixture at
`788facbd87a568e4e3354cb541ef0d019fa5aaaf`, the expected SHA; the generator refused to
overwrite it without `--force`, which is the intended behaviour.

## Verdict

**Phase 0: PASS with one recorded product defect.** Every Phase-0 acceptance criterion holds.
AC-03 is met in form — the sequence ran from the feature's own worktree against a stack it
started, with no concurrent session — and the single non-green result is a defect in the
product the battery was built to find, not a failure of the battery.

The one gate left unverified at the previous handoff is now closed: the workspace aggregate
is **6369 pass / 0 fail / 688 skip, 12 of 12 turbo tasks, 0 cached**, measured with the
dedicated pins unset. Two Phase-0 residuals surfaced only because the two runners outside
`bun run test` were run for the first time in this feature, and both are repaired here — the
unlisted embedding surface (`3224c795`) and the postgres bring-up budget (`7d7973d5`). They
are repairs to T0.2's deliverable, recorded the same way T0.5's six repairs were, and do not
change the plan's `6 Phases = 21 Tasks` accounting.
