# massa-ai E2E Coverage

Current E2E contract for `packages/core/src/__tests__/e2e/`.

Last updated: 2026-09-07. Acceptance backend: PostgreSQL 17 + pgvector 0.8.4.

The figures under "Latest real verification data" below predate the six Phase-1 suites and the
three product fixes of 2026-09-07; `.specs/features/e2e-feature-battery/validation.md` carries
the current per-profile measurements and is the one to read first. Nothing in this file is
evidence — it is a map of what exists and how to run it.

## Coverage decisions

- Standard E2E runs sequentially against a dedicated Tools API, PostgreSQL database, MCP build,
  and Ollama instance. The shared developer API on `:3333` is never a test target.
- `MASSA_AI_DEDICATED=1`, explicit `DATABASE_URL`/`DATABASE_URL`, and
  `DATABASE_URL=postgres` are required. Backend attestation must fail closed rather than infer
  PostgreSQL from API-local cache files.
- Commit-locked fixture recovery additionally requires an explicit fixture path, API origin
  `http://127.0.0.1:3334`, and both database URLs at
  `127.0.0.1:5433/massa_ai_test`; a partial dedicated declaration fails closed before
  availability probes, HTTP calls, or shared-index work.
- All mutable project IDs use the E2E prefix guard. Destructive scenarios run only in the
  dedicated destructive gate.
- The suite reuses `e2e-ai-shared` to avoid concurrent full-repository indexing and Ollama OOM.
  Cleanup verification stays last and checks for leaked prefixed data.
- Index readiness requires both stable non-zero document counts and the originating job's
  terminal `completed` status. A failed job aborts immediately with its recorded error.
- HTTP/MCP matrices compare stable contract fields. Volatile IDs/timestamps are normalized.
  Memory recall scores are validated independently because the first recall reinforces access
  counts before the second transport runs.
- Relevance thresholds are embedding-profile contracts. A faster provider may not reuse qwen's
  raw-score or hit@1 thresholds without an explicit calibration design.
- Live E2E is excluded from root/unit discovery. `RUN_E2E` must be `1` to enable it; leave it unset
  or empty to disable it, never the truthy string `0`.

## Suite map

| File | Coverage responsibility |
| --- | --- |
| `00.harness.smoke.test.ts` | API/MCP availability, basic transport contract, and 59-tool roster parity |
| `02.indexing.test.ts` | index, status, reindex/reset, lifecycle, terminal job consistency |
| `05.memory.test.ts` | remember/recall/update/delete/list and HTTP/MCP parity |
| `06.checkpoints.test.ts` | checkpoint create/list/restore |
| `08.search.test.ts` | hybrid search, response tiers, compression, file/symbol tools |
| `09.symbol-graph.test.ts` | definitions, references, project map, navigation |
| `10.synapse.test.ts` | session create/prime/access/persistence, task envelope lifecycle, and transport parity |
| `11.lifecycle.test.ts` | hooks, bootstrap, handoffs, and proposals |
| `13.cli.test.ts` | CLI flags and isolated configuration operations |
| `14.needles.test.ts` | deterministic relevance hit@1, hit@5, and MRR floors |
| `15.nfr.test.ts` | concurrency, performance, isolation, and resilience properties |
| `16.destructive.test.ts` | dedicated-only saturation/outage/configuration scenarios |
| `17.cleanup-verify.test.ts` | final prefixed-data leak check |
| `18.graph-phase4.test.ts` | typed edges, trace paths, impact analysis, architecture maps |
| `19.web-exec.test.ts` | web controller and execution-tool behavior |
| `20.new-features.test.ts` | observations, compact snapshots, proposals, Synapse PG persistence, dashboard route surface confirmation |
| `22.path-identity.test.ts` | same-process wrong-root rebuild and non-force reuse rejection |
| `23.owned-destructive.test.ts` | owned N1/N3/E25/F88 outage, restart, configuration, and recovery orchestration |
| `24.dashboard-architecture.test.ts` | dashboard routes (scheduler/hooks), get_architecture MCP+HTTP, rename/merge dryRun preview |
| `25.observability.test.ts` | `EB-OBS-1..7` — recovers the scope of the deleted `12.observability.test.ts`. Profile `default` |
| `26.scheduler.test.ts` | `EB-SCH-1..6` + `3b` — a two-profile matrix, `scheduler-on` and `scheduler-fast` |
| `27.auth-config-cache.test.ts` | `EB-AUTH-1..6`, `EB-CFG-1..3`, `EB-CACHE-1..4`. Profile `auth` |
| `28.hooks-handoffs-proposals.test.ts` | `EB-HOOK-1..3`, `EB-HO-1..3`, `EB-AI-1..3` — runs under `default` and again under `hooks-off` |
| `29.audit-repairs.test.ts` | `EB-SRCH`, `EB-MEM`, `EB-SYN`, `EB-EXEC`, `EB-MCP`, `EB-IDX`, `EB-TOOL` — scenarios an audit found missing behind rows already marked OK. Profile `default` |
| `30.llm-features.test.ts` | `EB-LLM-1..6` + `3b`. Profile `llm-on`, double-gated on `RUN_E2E=1` **and** `RUN_E2E_LLM=1`; never in the default aggregate |

The MCP surface is defined by `apps/mcp-client/src/tool-definitions.ts`; coverage should follow
that source rather than duplicating a tool count here. When a tool or endpoint is added, update
the responsible suite row and add HTTP/MCP equivalence where both transports exist.

**Deleted files this table used to list.** `12.observability.test.ts` (550 lines),
`21.qwen-fixture.test.ts`, and `backend-attestation.test.ts` (28 lines) were all removed in
commit `5d43a96f` ("feat(storage): require PostgreSQL and remove SQLite runtime"). The first two
rows survived the deletion and were still listed here — including inside the runnable command
block below, which meant the documented standard sequence could not execute as written.
`25.observability.test.ts` now owns that surface again; the row above is its replacement.

**A pass/fail/skip triple from these suites is not a property of the branch.** They decide what
executes from runtime probes over ambient machine state, not from code — `READY` is an async
probe, and the rest are conjunctions of it with `OLLAMA_UP`, `MCP_BIN`, `CONFIG_OK`, `OWNED`
and `STACK_PROFILE`. Stack state lives at the machine-global path `/tmp/massa-ai-e2e-stack`.
So a figure quoted without the gate vector that produced it cannot distinguish a real change
from a differently provisioned stack, and two of the scenarios are visible under exactly one
profile each: `EB-SCH-3b` only under `scheduler-fast`, and `EB-SCH-6` only under
`scheduler-on` (under `scheduler-fast` the suite sets `RESTART_READY=false`, because
`restart-api` re-derives the profile from `state.env`).

## Tests updated in the 2026-07-13 maintenance pass

- `backend-attestation.test.ts`: 4 assertions cover authoritative dedicated PostgreSQL/PostgreSQL
  declarations, remote non-dedicated behavior, and unknown fallback.
- `02.indexing.test.ts`: readiness now waits for stable documents plus the exact job's terminal
  completion and reports terminal failures directly.
- `05.memory.test.ts`: recall matrices compare stable transport data while enforcing numeric,
  finite, `[0, 1]` scores on both responses.
- `15.nfr.test.ts`: concurrent-project fixtures use distinct IDs and include searchable fixture
  metadata files, removing accidental cross-project aliasing and empty-probe ambiguity.
- `20.new-features.test.ts`: Synapse prime fixtures use the current memory shape and assert both
  `primed` and reconstructed buffer size.
- `_helpers.ts`: dedicated backend attestation uses the explicit vector-store declaration; API
  cache-file listings no longer misclassify a PostgreSQL data plane as PostgreSQL.
- `_helpers.ts`: shared-index checks coalesce only while in flight, then revalidate canonical
  workspace identity before every later reuse in the same Bun process.
- `read_file.ts`: the process-lifetime read-file tool refreshes an affected cached project root
  when the existing canonical `indexing:started` lifecycle event announces a rebuild.

## Tests updated in the E2E coverage expansion pass (2026-07-24)

> The entries below are a dated record of that pass, not a statement of today's
> contract. `EXPECTED_TOOLS` has since grown again: `00.harness.smoke.test.ts`
> asserts **59** tools at HEAD. Read `CANONICAL_ORDER` in
> `apps/mcp-client/src/tool-definitions.ts` for the current number, never a
> figure quoted in this file.

- `00.harness.smoke.test.ts`: EXPECTED_TOOLS updated from 47 to 52, matching
  `CANONICAL_ORDER` in `tool-definitions.ts`. Five new tools added:
  `get_architecture`, `synapse_task_begin`, `synapse_task_end`,
  `rename_project`, `merge_projects`.
- `20.new-features.test.ts`: SG1 gap probe replaced with real assertions of
  `/api/v1/scheduler/status` and `/api/v1/hooks/queue-status` (routes shipped
  in Wave 6 N28). The old probe wrongly asserted no surface existed. The
  inverted gap probe (no scheduler MCP tool) remains valid.
- `10.synapse.test.ts`: TE1-TE5 added for `synapse_task_begin` /
  `synapse_task_end` task envelope lifecycle (begin shape, HTTP parity, end
  summary, missing-session error, partial-failure on unindexed projectId).
- `24.dashboard-architecture.test.ts`: new file covering dashboard routes
  (DB1-DB5: scheduler/status, hooks/queue-status, graceful degradation,
  no-scheduler-MCP-tool), `get_architecture` MCP+HTTP (AR1-AR5: shape, parity,
  cycles aspect, unknown-aspect teaching error, _aspects list), and
  `rename_project`/`merge_projects` dryRun preview (RN1-RN5: plan envelope,
  HTTP parity, merge per-store counts, nonexistent-source error,
  missing-operationId error).

## Latest real verification data

### Baseline on the scripted stack (2026-09-06)

The first run on a stack brought up by `scripts/e2e-stack.sh` rather than by hand, against a
fixture built by `scripts/prepare-e2e-fixture.ts` (70 tracked files, commit
`788facbd87a568e4e3354cb541ef0d019fa5aaaf`, 35 discoverable sources) and the embedding
profile that is actually installed — **`qwen3-embedding:4b` at 2560 dimensions**, not the
`qwen3-embedding:8b`/4096 the 2026-07-13 ledger below pins.

**Before repairs: 223 pass / 5 fail / 4 skip, 232 tests across 16 files, 641.19 s, exit 1.**
**After test repairs: 231 pass / 1 fail / 3 skip, 235 tests across 16 files, 360.69 s, exit 1.**
**After the product fix: 232 pass / 0 fail / 3 skip, 235 tests, 361.14 s, exit 0.**
`17.cleanup-verify` passes 2/0 as its own final command.
(The later runs are faster because the shared index was already warm; the test count grew by
three because two repairs split a premise into its own case.)

The after-repairs figure is from a run in a dedicated worktree with **no other session
holding the checkout or the stack**. That qualifier is load-bearing, not ceremony: an interim
`232 pass / 0 fail / 3 skip` was measured across an overlapping window and is withdrawn. A
concurrent session's `22.path-identity` `beforeAll` force-reindexes `SHARED_PID` onto a
deliberately wrong root, and that mutation lands on the shared index every other suite reads.
Never quote a number from a run that shared its stack.

The last failure to fall was a **product defect this battery exists to find**, not a stale
test — and it is now fixed. `T9 N6` fires three concurrent `index()` calls on three
*distinct*, brand-new projectIds and got `failed, completed, failed`; both losers died in
under 15 ms with `graph_generation_workspace_missing`. `workspace-manager.ts:155-158` creates
the `workspaces` row from an **unawaited** `indexing:started` handler, while `pipeline.ts`
reached `lockWorkspace` (`graph-generation-repository-pg.ts`) immediately after Discover —
which on this sparse fixture finishes faster than that upsert commits. The pipeline now
awaits `markIndexing` before opening the generation.

It was intermittent, so a green `N6` alone proves little: the same case passed 3/3 on an
earlier run, and eight concurrent fresh projects on an idle stack reproduced it zero times.
The evidence for the fix is therefore the **absence measured the same way the defect was
found** — `graph_generation_workspace_missing` occurred against three distinct projects in
the pre-fix run and **zero** times across the full post-fix suite. Detail in
`.specs/features/e2e-feature-battery/validation.md`; the deterministic guard is
`packages/core/src/__tests__/etl-workspace-row-ordering.test.ts`.

The five failures are the value of the run: none of them was reachable before, because the
suite had never been executed against a *different* embedding profile with auth on. A sixth,
`T15`, surfaced only once the first five were fixed and the shared index reached a genuinely
warm state.

| Test | Cause |
| --- | --- |
| `T9 N15` vector dimension integrity | Queries `vector_documents_4096d` by name. That table is empty under a 2560-dimension profile — the test hardcodes an embedding profile the harness is supposed to vary. |
| `T9 N19` auth-off returns 200 | Asserts `AUTH_REQUIRED === false`. AD-011 deleted the no-key pass-through and made it non-configurable, so this asserts removed behaviour. |
| `T9 N5` concurrent same-project index | Three concurrent `index()` calls on one projectId finished `failed, completed, failed`. Root cause: a `managed_runs` lease replaced the queue mutex the test cited and *refuses* the losers with `indexing_busy`. `N6` (distinct projectIds) passed 3/3 in this run — but it is intermittent and fails for an unrelated reason, so it does not narrow `N5` to the same-projectId path as first recorded here. |
| `T11b D2` trace_path outbound | Reached `nodeCount=1`, expected `>= 2`. Corpus density: the sparse fixture has a thinner call graph than the whole repository. The same file already reports the *inbound* case as "a graph-density limitation, not worked around" — only the outbound side is unguarded. |
| `T11b D4` project_map enriched fields | `Array.isArray(map.routes)` is false. The comment two lines above says routes "may be empty. Assert shape only when present", and then the assertion runs unconditionally — so an absent field on a corpus with no HTTP routes fails a test that documents itself as tolerant. |
| `T15` shared-index identity *(surfaced after the other five)* | The `beforeAll` seeds SHARED_PID at a deliberately wrong root, then asserts warmth with `isSharedIndexWarm`, whose probes name canonical-corpus symbols absent from that root. It could only pass when the reindex failed to clear the previous corpus. |

All six are repaired; see the CHANGELOG entry for what each now asserts instead. The three
remaining skips **in that 16-file sequence** are the pre-existing self-reported ones
(search-internals with no public introspection, graph density on the inbound BFS,
`impact_analysis` with no committed diff in the fixture) — none is a silent skip.

That count is scoped to the sequence above and is **not** a repository-wide skip census. The
six Phase-1 suites added on 2026-09-07 carry many more declared skips, most of them
profile-conditional by design: `28` reports a different skip count under `default` than under
`hooks-off`, and `26` a different one under `scheduler-on` than under `scheduler-fast`. Each
is a stated, reasoned line naming either a measurement or a source location. Read the
per-profile table in `.specs/features/e2e-feature-battery/validation.md` rather than
extrapolating this number.

Relevance held on the new corpus: `14.needles.test.ts` passed, with N01 @1, N03 @1, N07 @1,
N04/N06/N08 @2, N02 @3, N05 @5.

### The 2026-07-13 ledger

Superseded by the run above for pass/fail counts, kept for the destructive and cleanup gates
it is still the only record of. The authoritative command ledger is
`.specs/features/close-maintenance-next-steps-2026-07-13/gate-manifest.md`. Note that its
fixture is not reproducible as documented: it was produced by
`scripts/prepare-qwen-e2e-fixture.ts`, a file with no history in any revision.

| Gate | Latest measured result |
| --- | --- |
| Build | 5/5 tasks passed |
| Type-check | 6/6 tasks passed |
| Root aggregate | Uncached 10/10 Turbo tasks passed; core ran 80/80 isolated groups; exit 0 |
| Focused maintenance | 61/61 passed, 191 assertions, 0 skip |
| Destructive E2E | Owned N1/N3/E25/F88: 4/4 passed, 79 assertions, 0 skip; every outage recovered |
| Standard qwen G10 | Clean PostgreSQL/qwen stack at fixture HEAD `02b7475`: 243 pass, 6 explained skips, 0 fail across 17 sequential files; cleanup-last 2/0/0 |
| Relevance | Two identical sweeps: hit@1 .643, hit@3 .786, hit@5 .929, hit@10 .929, MRR .746; floors unchanged |
| Cleanup/path | Zero unexpected E2E workspaces and zero invalid vector/symbol paths; 34+34 manifest-contained distinct paths |

### Standard E2E result sequence

The accepted 2026-07-13 run started from an empty PostgreSQL 17/pgvector database and a local
46-file sparse clone locked to commit `02b7475`. Cold qwen indexed 34 discoverable sources into
468 chunks and 1,070 symbols in 369.091 seconds, within the unchanged 420-second gate. The 17
standard files then completed with 243 passes and six explained skips in 781.80 seconds. Cleanup
ran as its own final command and passed 2/2. Direct SQL verified the sole shared workspace,
manifest-contained paths, and no `adsads/`, absolute, traversal, or prefixed-project leak.

The six skips are deliberate: one internal Synapse effect; F87/F88 destructive variants covered
by the separate owned gate; shared-workspace deletion; deep vector internals without an API
surface; and auth-on restart outside the auth-off standard stack. No unexplained skip remains.

After the accepted run, commit `2e5ad3d` added the final fail-closed guard for incomplete
dedicated intent. Its fixture/backend matrix passed 12/12 with 38 assertions, including a
zero-fetch negative test, and type-check passed 6/6. The user explicitly waived repeating the
full qwen G10 for this test-helper-only delta; no partial rerun is counted above.

## Commands

Bring the stack up first — it is scripted now, not a manual runbook:

```bash
bun scripts/prepare-e2e-fixture.ts --out /tmp/massa-ai-e2e-fixture
bash scripts/e2e-stack.sh up --profile default
eval "$(bash scripts/e2e-stack.sh env)"     # emits all four fail-closed pins + the API key
```

Then, from `packages/core`:

```bash
bun test --max-concurrency 1 \
  src/__tests__/e2e/00.harness.smoke.test.ts \
  src/__tests__/e2e/02.indexing.test.ts \
  src/__tests__/e2e/05.memory.test.ts \
  src/__tests__/e2e/06.checkpoints.test.ts \
  src/__tests__/e2e/08.search.test.ts \
  src/__tests__/e2e/09.symbol-graph.test.ts \
  src/__tests__/e2e/10.synapse.test.ts \
  src/__tests__/e2e/11.lifecycle.test.ts \
  src/__tests__/e2e/13.cli.test.ts \
  src/__tests__/e2e/14.needles.test.ts \
  src/__tests__/e2e/15.nfr.test.ts \
  src/__tests__/e2e/18.graph-phase4.test.ts \
  src/__tests__/e2e/19.web-exec.test.ts \
  src/__tests__/e2e/20.new-features.test.ts \
  src/__tests__/e2e/22.path-identity.test.ts \
  src/__tests__/e2e/24.dashboard-architecture.test.ts
bun test --max-concurrency 1 src/__tests__/e2e/17.cleanup-verify.test.ts
RUN_E2E_DESTRUCTIVE=1 bun test src/__tests__/e2e/16.destructive.test.ts
RUN_OWNED_DESTRUCTIVE=1 bun test --max-concurrency 1 src/__tests__/e2e/23.owned-destructive.test.ts
```

### The Phase-1 suites are a profile matrix, not one run

Suites `25`–`30` each declare a profile, and four of them cannot be measured under `default`.
Run **one file per invocation and one profile per invocation**; bring the stack to each
profile with `up --profile <p>` and re-`eval` the env between them, because `restart-api`
re-derives the profile from `state.env` rather than taking it as an argument.

```bash
# from the repo root, once per profile
bash scripts/e2e-stack.sh up --profile default        # then: 25, 28, 29, 10, 11
bash scripts/e2e-stack.sh up --profile scheduler-on   # then: 26   (EB-SCH-6 lives here)
bash scripts/e2e-stack.sh up --profile scheduler-fast # then: 26   (EB-SCH-3b lives here)
bash scripts/e2e-stack.sh up --profile auth           # then: 27
bash scripts/e2e-stack.sh up --profile hooks-off      # then: 28   (second reading)
bash scripts/e2e-stack.sh up --profile llm-on         # then: 30   (needs RUN_E2E_LLM=1)

# after each `up`, from packages/core
eval "$(bash ../../scripts/e2e-stack.sh env)"
bun test --max-concurrency 1 src/__tests__/e2e/26.scheduler.test.ts

# the llm-on suite is double-gated and never enters the default aggregate
RUN_E2E_LLM=1 bun test --max-concurrency 1 src/__tests__/e2e/30.llm-features.test.ts
```

Quote every result as `gate vector + triple`, never a bare triple, and hold the skip
population constant when comparing two runs — a failure that became a skip is a regression
wearing a fix's clothes, and the aggregate alone cannot tell the two apart.

`RUN_E2E=1` is already exported by `e2e-stack.sh env`, which is why the commands above no
longer repeat it. When you are done:

```bash
bash scripts/e2e-stack.sh down
```

Never rely on Bun's root `.env` for the acceptance database — `env` above sets a scratch
`XDG_CONFIG_HOME` precisely so the developer's own `~/.config/massa-ai/config.json`, which
commonly has `llm.enabled: true`, cannot leak live LLM calls into an LLM-off run.

`23.owned-destructive.test.ts` still provisions its own stack and must therefore run with
`e2e-stack.sh down` first — it refuses to start while any dedicated port has a listener. Note
that its `startPostgres` invokes `packages/core/node_modules/.bin/prisma`, a path bun's
hoisting does not create in this checkout; `e2e-stack.sh` falls back to the hoisted root
binary, that suite does not.
