# Sensor Repair 2026-07 — Tasks

## Execution Protocol (MANDATORY — do not skip)

1. Tests derive from the spec's acceptance criteria and assert spec-defined outcomes — never mirror the implementation.
2. The gate must pass before a task is done — the test runner decides, not self-assessment.
3. One atomic commit per task. Never batch tasks; never weaken, skip, or delete a test to make it pass.
4. After the last task, a fresh `massa-ai-verification-agent` runs (author ≠ verifier) and writes `validation.md`.

**Spec**: `.specs/features/sensor-repair-2026-07/spec.md`
**Design**: inline (see spec "Why Design is inline"). If a design fork appears mid-Execute, stop and write `design.md`.
**Status**: Approved 2026-07-28 — Execute inline, one task at a time
**Branch**: `fix/sensor-repair` off `origin/main` @ `a6216cd` (v1.9.0)
**Ships as**: PR-A. Must land and release before `core-layering-god-module-split` PR-B.

---

## Wall-clock budget — read before scheduling

Three tasks are dominated by machine time, not edit time. No task title implies this.

| Task | Estimated | **Measured 2026-07-28** | Why |
| --- | --- | --- | --- |
| T3 | ~15 min × 2 | **~3 min** per run | `bun run test:coverage` end to end on this machine. The 15 min figure did not hold. |
| T7 | ~90 min × 2 | **~2 min** per run | The 90 min figure is `needles-gate.yml`'s **2-core CI** estimate, carried into this file as if it were the local cost. The fixture is 6 files / 68 chunks + 14 queries against a local Ollama. |
| T9 | ~15 min | ~3 min | Full gate including `test:coverage`. |

**The ~3.5 hours of waiting does not exist on this machine — it is closer to 10 minutes.** The
ordering advice still holds for a different reason: T7's pre-change baseline must run on a tree
where `benchmarks/` is untouched, so it goes before T5 regardless of cost.

---

## Project Testing Guidelines Scan

- `packages/core`, `apps/tools-api`, `apps/mcp-client` do **not** run plain `bun test` — their `test` script is a wrapper over `scripts/lib/run-tests-isolated.ts`. Running `bun test` over a directory cross-contaminates module and process state and produces false failures. Target one file, or use the runner.
- `bunfig.toml` sets a global **5 s** per-test timeout. Raise the per-test value (third arg to `test()`), never the global.
- Until **T1** lands, prefix every local run with `XDG_CONFIG_HOME=$(mktemp -d)`. A 5001 ms failure is more often a live-provider leak than contention.
- Turbo sandboxes env: any var a test reads must be in `turbo.json` → `tasks.test.passThroughEnv`, or it arrives `undefined` under `bun run test` while working under a direct `bun test`.
- `scripts/` and `benchmarks/` are **not** workspace packages — turbo cannot reach them. Their suites run via `bun run test:scripts`.

## Test Coverage Matrix

| Req | Unit | Integration | Discriminating sensor |
| --- | --- | --- | --- |
| SEN-01 | truncation refuses a non-dedicated `DATABASE_URL`; `_prisma_migrations` is not in the truncation set | `prisma migrate status` reports up-to-date after a gate run | point `DATABASE_URL` at a non-dedicated DB → truncation must refuse |
| SEN-02 | — | `coverage.yml` runs green on a real PR | flip a file below the floor → the workflow must go red |
| SEN-03 | child env has no `MASSA_AI_LLM_*`; explicit caller `XDG_CONFIG_HOME` wins | group counts 126/25/8; `embedded-api-client-endpoints.test.ts` green ×3 | throwaway repo-root `.env` with `MASSA_AI_LLM_ENABLED=true` → LLM branch must stay off |
| SEN-04 | unresolvable anchor exits non-zero; ambiguous anchor exits non-zero; resolved spans match static values byte-for-byte on an unchanged tree | before/after equivalence run, identical per-needle ranks | delete a needle's target file → run must **fail**, not `[warn]`-and-continue |
| BEH-01 | `includePersistent: false` excludes persistent memories | — | revert to `_includePersistent` → the new test must fail |

## Gate Check Commands

```bash
bun run lint                 # oxlint, root, correctness at error
bun run type-check           # 4 packages
bun run build                # 5 packages
bun run test                 # turbo — 6 packages
bun run test:scripts         # scripts/__tests__ + scripts/tests
bun run test:plugins         # all four plugin __tests__/

DATABASE_URL=postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test \
  MASSA_AI_DEDICATED=1 RUN_POSTGRES_TESTS=1 bun run test:coverage

bun run bench:needles:gate   # NEEDLE_FLOOR_HIT1=0.5 NEEDLE_FLOOR_MRR=0.65 — needs local Ollama
```

---

## Execution Plan

**Phase 1: Make local measurement trustworthy** — nothing measured before T1 is a property of the tree.

T1 → T2 → T3

**Phase 2: Make the gate reach CI** — only after the gate is stable, or the required check is flaky on arrival.

T4

**Phase 3: Repair the retrieval sensor** — independent of Phase 1/2; the long runs go last.

T5 → T6 → T7

**Phase 4: The one behavior change, and close.**

T8 → T9

---

## Task Breakdown

### T1 / SEN-03: Stop test runs reading real developer state

**What**: Point every child process the shared runner spawns at a scratch `XDG_CONFIG_HOME`, **and** neutralize `MASSA_AI_LLM_*` in that child environment.
**Where**: `scripts/lib/run-tests-isolated.ts` (`spawn(..., { env: process.env })` at `:240`)
**Depends on**: None — PR entry point
**Requirement**: SEN-03 (AC-1..AC-6)
**Why first**: every measurement in T2/T3 is otherwise a property of the developer's machine. Measured cost of the leak: **42030 ms cold / 690 ms warm** against a 5 s budget.

**Why the obvious fix is not enough (Plan Challenge finding 1)**: a scratch config dir closes the `config.json` path only. `packages/shared/src/env.ts:33-34` dotenv-loads the nearest `.env` walking up from cwd, **independent of `XDG_CONFIG_HOME`**, and `packages/shared/src/config/index.ts:575` resolves `envBool("MASSA_AI_LLM_ENABLED", fileConfig.llm?.enabled ?? false)` — env beats `config.json`. A repo-root `.env` setting it true bypasses the whole fix. This checkout has no `.env`, so the leak is **latent, not active** — verify against a throwaway one.

**Done when**:
- [ ] Children get a scratch `XDG_CONFIG_HOME`; an explicit caller-set value (as `check-coverage.ts:402` sets) still wins
- [ ] `MASSA_AI_LLM_*` keys are absent from the child env by default; a suite needing them opts in explicitly
- [ ] `DATABASE_URL` and the rest of the env still reach children unchanged
- [ ] Group counts unchanged: core **126**, tools-api **25**, mcp-client **8**
- [ ] `apps/mcp-client` `embedded-api-client-endpoints.test.ts` green under plain `bun run test`, **3 consecutive runs** (it is flaky, not deterministically red — one green run proves nothing)
- [ ] `packages/shared` / `apps/opencode-plugin` run plain `bun test` and bypass the runner: either covered by a stated second mechanism, or their exposure recorded as accepted with the reason (AC-3 — silence fails this)
- [ ] Discriminating sensor: throwaway repo-root `.env` with `MASSA_AI_LLM_ENABLED=true`, run a test, assert the LLM branch stays off

**Tests**: new unit tests on the runner's env construction · **Gate**: `bun run test`, `bun run test:scripts`
**Commit**: `fix(tests): stop the isolated runner inheriting real developer config`

---

### T2 / SEN-01: Reset the coverage gate's database

**What**: Truncate data tables in the dedicated test database at gate start.
**Where**: `scripts/check-coverage.ts`
**Depends on**: T1
**Requirement**: SEN-01 (AC-1, AC-2, AC-2a, AC-4)

**The trap (Plan Challenge finding 3)**: `_prisma_migrations` lives in the same `public` schema as every data table. "Truncate every table in the schema" empties Prisma's applied-migration bookkeeping while leaving all 24 migrations' DDL applied — the next `migrate deploy` replays non-idempotent `ALTER TABLE ADD COLUMN` and fails. **Enumerate tables; exclude `_prisma_migrations` by name.** Repo precedent for the reset shape: `packages/core/src/__tests__/graph-generation-symbol-repository-pg.test.ts` (`TRUNCATE TABLE … CASCADE`).

**Done when**:
- [x] Truncation is guarded by the **existing** `assertDedicatedDatabase()` — extracted as `isDedicatedDatabase()` and used by both call sites, so it is one predicate, not two
- [x] `_prisma_migrations` explicitly excluded, and the row count compared before/after because `CASCADE` follows foreign keys out of the listed set
- [x] `bunx prisma migrate status` reports **up to date** after a gate run
- [x] Discriminating sensor: a non-dedicated `DATABASE_URL` makes the truncation refuse

**DONE** — `85ff20a`. Verified live: **36 tables truncated, `_prisma_migrations` intact at 23
rows**, migrate status clean. `lint` 0, `test:scripts` 0 (616 pass). Removing the exclusion turns
2 tests red.

**Divergence — the table list must be read from the catalog, not hardcoded.** A fresh database has
**31** data tables; after two gate runs it has **36**, because `vector_documents_<n>d` tables are
created per embedding dimension at run time. A hardcoded list would already have missed five.

**Divergence — the justification does not survive measurement.** Truncation does *not* stabilise
`architecture-map`'s timing, which was SEN-01's stated motivation (see T3). What it does buy:
a known starting state matching CI's, and `postgres-vector-store.integration.test.ts` going from
**8 failures to 6** across the same gate run. Both `spec.md` and the script header are rewritten.

**Tests**: `scripts/__tests__/check-coverage.test.ts` extended — refusal path, exclusion set · **Gate**: `bun run test:scripts`
**Commit**: `fix(tooling): reset the dedicated test database before the coverage gate`

---

### T3 / SEN-01: Re-measure and lower the `architecture-map` budgets

**What**: Measure `getProjectMap`'s three cases against a freshly-reset database and lower the `300_000` stopgap to the measured value plus headroom.
**Where**: `packages/core/src/__tests__/architecture-map.test.ts:583,601,618`
**Depends on**: T2
**Requirement**: SEN-01 (AC-3)
**Why it is a separate task**: lowering the budget is the **only** observable evidence that T2 worked. Leaving it at `300_000` makes the reset unfalsifiable.

**BLOCKED on a seam — the premise was falsified during Execute. Do the seam first.**

Three full gate runs, with and without truncation:

| Run | Provider init | Whole file | **File − provider** |
| --- | --- | --- | --- |
| with reset | 3.29 s | 5.23 s | **1.94 s** |
| no reset | 2.80 s | 3.68 s | **0.88 s** |
| with reset | **117.46 s** | **119.47 s** | **2.01 s** |

The test's own cost is flat at **0.9–2.0 s**. Every second of variance is Ollama reloading an
evicted `qwen3-embedding:8b` during embedding-provider auto-selection. **Truncation cannot affect
it, so the budget is not evidence that the reset works.** A `60_000` budget was set from the
measurement and failed the very next run at 119.47 s — correctly, and for a reason unrelated to
the database.

`architecture-map.test.ts` has **no mocks and no seam**: it runs the real ETL, which auto-selects a
live embedding provider. This is the recurring omission `CLAUDE.md` documents — *"the test is
missing a seam, not a timeout."*

**Done when**:
- [x] `architecture-map.test.ts` gets a deterministic embedding seam so it never reaches a live provider. Its assertions are on the **symbol graph** (layers, routes, centrality, cycles) which comes from tree-sitter structural parsing, not from vectors — so a fake provider does not weaken what it tests. Confirm that before building it
- [x] Adding `mock.module(` keeps the file in the isolation runner's forked-process set; core's `--unit` group count must stay **126**
- [x] Budgets then lowered to the measured value plus stated headroom, and the number recorded here
- [x] Full `test:coverage` passes **twice** with the new budgets — once is not evidence for a budget that already flapped
- [x] The uncommitted `60_000` edit in the working tree is superseded by this; do not ship it as-is

**DONE.** Seam is `mock.module("../data/vector/vector-store-factory.js")`, the repo idiom already used
by `rlm-admin.test.ts` and `contextual-search-rlm-coverage.test.ts`. The faked surface is exactly what
the ETL exercises: `deleteByProject` (`pipeline.ts:222`, reached because these tests pass
`forceReindex: true`), `addDocuments` (`stages/load.ts:344`), and `getCollection`/`getStats` for the
best-effort admission marker (`pipeline.ts:506`).

**The assertion check was run before building the seam, not assumed.** All 24 tests read
`projectId`/`stats`/`topCentralFiles`/`symbolsByKind`/`filesByLanguage`/`recentFiles`/`packages`/
`entryPoints`/`hotspots`/`communities`/`layers`/`routes`. None touches a vector, a similarity score
or a chunk embedding. Discover, parse, resolve and symbol persistence still run for real.

| Measurement | Before | After |
| --- | --- | --- |
| Whole file, real developer config, live Ollama available | 119.47 s worst | **895 ms** |
| Same file under `--coverage` | — | **1008 ms** (1.13× instrumentation) |
| `vector store initialized` log lines | ≥1 | **0** |
| ollama / embedding-provider / qwen3 log lines | ≥1 | **0** |
| admission-marker warn lines | — | **0** |

**Budget: `300_000` → `30_000`**, chosen against two anchors rather than as a round number. Above the
largest historical reading that was never decomposed (**16.59 s**), so genuine accumulation cannot make
it flap; below the smallest documented cold-provider load (**42030 ms**, `CLAUDE.md`), so deleting the
seam makes the test **fail** rather than merely slow down. The prior `60_000` had neither property —
it passed a 42 s cold load.

**Gate evidence.** `test:coverage` ×2, both **exit 0**, `[coverage] PASS — every measured source file
is at or above 90%`, `314 source files measured · 9 documented exclusions`. Group counts byte-identical
in both runs: core `224 files: 99 pure/shared, 125 stateful/isolated` = **126** (`--unit`), tools-api
**25**, mcp-client **8**. T2's reset fired both runs: `truncated 36 data table(s); _prisma_migrations
intact at 23 row(s)`. **0** FAIL lines, **0** timeouts. `lint` 0, `type-check` 0.

**Divergence — the gate is not red, and the stated reason for its redness is falsified.** Both runs
exited **0**, including `postgres-vector-store.integration.test.ts`. `HANDOFF.md` attributes that
suite's flakiness to being *"contaminated by other suites in the same run, which a reset at gate start
cannot reach."* That mechanism does not hold: every count assertion in the file is **project-scoped**
(`store.getStats("integration-test")`, `:79,92,106,123,137,138`) behind a `beforeEach` that deletes
that project (`:51-54`). Rows written by other suites under other project ids cannot reach those
numbers. The file's own header states the actual mechanism — *"These tests need real embeddings, so we
don't mock the embedding service. Make sure OLLAMA_URL is set"* — and the gate log shows
`Auto-selecting embedding provider… Selected provider: ollama, qwen3-embedding:8b, dimensions 4096`.
It is the **cold/warm model against the 5 s budget**, the same root cause as T3 and the same class
`CLAUDE.md` documents. It passes here because the model is warm. See T4.

**Tests**: existing · **Gate**: `bun run test:coverage` ×2 (measured ~3 min each, not ~15)
**Commit**: `test(core): give the architecture-map budgets a deterministic embedding seam`

---

### T4 / SEN-02: Wire the coverage gate into CI

**What**: New `.github/workflows/coverage.yml`, blocking, with its own pgvector service.
**Where**: `.github/workflows/coverage.yml` (new), `CLAUDE.md` CI-gates section
**Depends on**: T3
**Requirement**: SEN-02 (AC-1..AC-4)

**Three details it will fail on if guessed**: `assertDedicatedDatabase()` matches `/127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/`, so the URL must use literal **`127.0.0.1`** — every other job in `ci.yml:13` uses `localhost`, which fails the regex. Port must be **5433**, not the `5432:5432` at `ci.yml:23,159`. Database is `massa_ai_test`. Copy the service block from `ci.yml:15-23` and change all three.

**Done when**:
- [x] Runs `bun run test:coverage` with `MASSA_AI_DEDICATED=1`
- [x] **No `continue-on-error`** — a gate that reports and never enforces is the failure mode this repo already rejected once (oxlint's 15 firing rules kept at `error`)
- [x] Not inside `ci.yml`, so it does not extend the `workflow_run` chain `release.yml` keys off — releases must keep firing on CI alone
- [x] `CLAUDE.md`'s CI-gates section names it and its separate-workflow count is corrected

**DONE.** `.github/workflows/coverage.yml`, name **`Coverage`**, `ubuntu-latest`, own
`pgvector/pgvector:pg17` service, push-to-`main` + every PR, `timeout-minutes: 60`.

**AC-3 holds by construction, and the mechanism is worth stating.** `release.yml` triggers on
`workflow_run: workflows: [CI]` — the coupling is by workflow **name**, not by file. A separate
workflow named anything but `CI` cannot extend the release chain. That is now written into
`CLAUDE.md` as a rename hazard, because the property is invisible from this file alone.

**The three URL details were verified against the real predicate, not eyeballed.** Running
`isDedicatedDatabase()` from `scripts/check-coverage.ts` against the workflow's literal env:

| Input | Result |
| --- | --- |
| `127.0.0.1:5433/massa_ai_test` + `MASSA_AI_DEDICATED=1` (what the workflow sets) | **accepted** |
| `localhost:5433/massa_ai_test` (the shape every `ci.yml` job uses) | rejected |
| `127.0.0.1:5432/massa_ai_test` (the port `ci.yml` services use) | rejected |
| `127.0.0.1:5433/massa_ai` (the db name `ci.yml` uses) | rejected |
| `MASSA_AI_DEDICATED` absent | rejected |

**A fourth detail the task list did not carry, and it would have failed the gate.**
`RUN_POSTGRES_TESTS=1` is **not** vestigial and is not implied by `DATABASE_URL`. Ten-plus core
suites still gate on `process.env.RUN_POSTGRES_TESTS === "1"` — `attribution-resolver`,
`keyword-search-pg`, `keyword-search-factory`, `search-analytics-pg-pg`,
`synapse-session-store-pg`, `operation-log-repository` among them. Without it they report
`0 pass / N skip`, their subjects measure near zero, and the gate fails with a flood of phantom
below-floor files instead of the truth — the exact confusion `check-coverage.ts`'s own header
describes. The workflow sets it, with that reason recorded inline.

`MASSA_AI_EXECUTOR_SANDBOX: none` mirrors `ci.yml`'s Test step. A `Build` step precedes the gate,
mirroring `ci.yml`'s ordering: core's `prebuild` runs `bunx prisma generate`, which the suites need.
Coverage measures `src` and `isMeasuredSource()` excludes `/dist/`, so building cannot move the
numbers.

**No suite fix was needed, and the reason the task list expected one is falsified — see T3.** The
gate exits **0** locally, twice. `test:scripts` **616 pass / 0 fail**, so
`workflow-harness-contract.test.ts` and `validate-repository.test.ts` accept the new file.

**Not verifiable locally**: AC-1's green run on the PR itself. Confirm on the PR before merge.

**Tests**: none (CI config) · **Gate**: green run on the PR itself (pending push)
**Commit**: `ci: run the coverage gate on its own blocking workflow`

---

### T5 / SEN-04: Content-anchor the needles fixture, and fail loudly

**What**: Replace positional needle targeting with content anchors resolved at run time; convert the silent skip into a hard failure.
**Where**: `benchmarks/needles/run.ts` (`:233-236`, `:85-96`), `benchmarks/needles/scorer.ts` (`:94-104`), `benchmarks/needles/fixtures/massa-ai.json`
**Depends on**: None (parallel with Phase 1/2)
**Requirement**: SEN-04 (AC-1, AC-2, AC-3, AC-5, AC-6, AC-8, AC-9)

**The loud-failure half matters more than the anchoring half.** The silent skip is what made the gate untrustworthy: `run.ts:233-236` skips a missing target with a `[warn]`, and `scorer.ts:111,124,135` average that zero over the full needle count rather than dropping it.

**SPLIT INTO T5a / T5b — see `design.md`.** Recovering N07/N08/N09 pulls `chunker-*.ts` into the
corpus (**6 files → 8**), which changes rank competition for **all 14** needles. T7's "identical
ranks" then cannot hold, and would fail for a reason unrelated to whether the anchoring is correct
— the exact failure mode that criterion exists to detect.

| Step | Change | Corpus | T7 equivalence |
| --- | --- | --- | --- |
| **T5a** | Anchor the 11 valid needles; leave N07/N08/N09 pointing at `smart-chunker.ts` as they are. Both loud-failure paths land here | **unchanged** — 6 files, 68 chunks | **provable and required**: ranks byte-identical, MRR stays **0.569** |
| **T5b** | Recover N07/N08/N09 from `af3dab6`, anchor into `chunker/*.ts` | 6 → 8 files | not applicable; a **new baseline** is recorded |

**The anchors are already recovered and verified unique repo-wide:**

| Needle | Anchor (substring, code only — never a comment) | Resolves to |
| --- | --- | --- |
| N07 | `function netBraceDelta(line: string): number {` | `chunker/chunker-code.ts:168` |
| N08 | `if (chunk.label && chunk.type === "code_block") {` | `chunker/chunker-post.ts:33` |
| N09 | `const hasHeading = /^\s*#{1,6}\s+/m.test(content);` | `chunker/chunker-markdown.ts:11` |

Two traps found while recovering them. The Wave 6 split **stripped comments while moving code**, so
anchors must sit on code lines — N07's original span *starts* on a comment that no longer exists
anywhere, and a span cannot be carried forward as a line-count delta because the regions are
shorter now. And anchors must match as **substrings**: `netBraceDelta` gained an `export ` prefix,
which a whole-line match would miss.

### T5a — anchor the 11 valid needles + land both loud-failure paths — **DONE**

- [x] Each anchored needle carries a content anchor; `filePath`/`lineStart`/`lineEnd` resolved before file collection
- [x] Zero matches **or** two-or-more matches → non-zero exit naming the needle id and anchor. Never proceeds to scoring
- [x] Resolution tolerates verbatim move to another file, file rename, and a within-file move beyond `lineTolerance` (5)
- [x] **AC-8 cheap check, run before T7's expensive one** — clean, zero diff
- [x] AC-9: every anchor resolves to exactly one location repo-wide
- [x] All 14 needles keep identical target spans; none added, removed, retargeted or re-queried
- [x] Discriminating sensor: unresolvable anchor exits non-zero without an embedding provider

**Second design fork — `{anchor, endAnchor}` was unbuildable. See `design.md`.** Measured every
boundary's repo-wide uniqueness: **only 3 of 11** (N01, N02, N04) have both boundaries on a unique
code line. N06 starts on `    }` (**11130** occurrences), N10 on a 4-occurrence line ending on a
16-occurrence one, N11 on an 11-occurrence line. N05/N12/N14 start on comments. **N03 ends on a
blank line and N13 starts on one** — not merely hard, impossible, since a blank line can never be a
unique anchor.

**Resolved as `anchor` + signed `startOffset`/`endOffset`**, anchoring on a unique code substring
*inside* the span. Keeps AC-8 exact, keeps every anchor on code, and still survives AC-3's three
transformations (all preserve internal line structure). Not the rejected `anchor + spanLines`: that
carried an **old** length onto **new** content; this measures the length that is there.

**AC-8 calibration — all 11 resolve `n = 1` repo-wide and reproduce their previous spans exactly:**

| Needle | anchor line | resolved | previous | |
| --- | --- | --- | --- | --- |
| N01 | `const DAMPING = 0.85;` | centrality.ts:14-14 | 14-14 | exact |
| N02 | `const ITERATIONS = 20;` | centrality.ts:15-15 | 15-15 | exact |
| N03 | `const KEYWORD_BOOST = isCodeQuery ? …` | rlm-fusion.ts:57-66 | 57-66 | exact |
| N04 | `const rrfNormalized = rrfScore / maxRrfScore;` | rlm-fusion.ts:170-175 | 170-175 | exact |
| N05 | `const normalizedScore = Math.min(1, …` | rlm-fusion.ts:177-184 | 177-184 | exact |
| N06 | `rerankedTop = applyProximityRerank(…)` | rlm-search.ts:340-354 | 340-354 | exact |
| N10 | `batch.map((rel) => this.processFile(…)` | discover.ts:125-132 | 125-132 | exact |
| N11 | `return discovered;` | discover.ts:168-174 | 168-174 | exact |
| N12 | `` return `vector_documents_${dimensions}d`; `` | postgres-vector-store.ts:60-63 | 60-63 | exact |
| N13 | `` GROUP BY project_id`, `` | postgres-vector-store.ts:137-181 | 137-181 | exact |
| N14 | `private normalizeScore(raw: unknown): number {` | postgres-vector-store.ts:67-74 | 67-74 | exact |

**Zero diff across all 11.** 815 source files scanned.

**Third fork — loud failure scoped to anchored needles.** Applying the out-of-range check to
N07/N08/N09 would abort the T5a run before scoring and make the equivalence baseline
unmeasurable. Hard failure is therefore a property of **anchor resolution**; the three are
grandfathered by an explicit `scoring.staleNeedles` id list, checked in **both** directions:
no-anchor-and-not-listed → `NEEDLE_ANCHOR_MISSING`; has-anchor-and-listed →
`NEEDLE_STALE_ENTRY_OBSOLETE`. So a positional needle cannot creep back, and T5b cannot anchor
the three without deleting their entries. The run prints the grandfathered ids to stderr every
time, stating their scores are not trustworthy.

**Loud-failure paths verified end-to-end with `OLLAMA_HOST=http://127.0.0.1:1`** — proving
resolution runs before any embedding, so a stale fixture costs seconds instead of a wrong number:

| Injected defect | Exit | Message |
| --- | --- | --- |
| anchor matching nothing | **1** | `NEEDLE_ANCHOR_UNRESOLVED` naming needle + anchor |
| `endOffset` past EOF | **1** | `NEEDLE_SPAN_OUT_OF_RANGE`, `file length: 79 lines` |

The second is the path that previously produced **no signal at all** — the one actually firing.

**AC-8 is calibration, not a permanent test — deliberately.** A test asserting absolute
`lineStart`/`lineEnd` forever would fail the moment code legitimately moves, rebuilding the exact
positional pinning SEN-04 deletes, inside the suite meant to prevent it. The permanent suite
asserts properties that hold wherever code lives: resolves, unique repo-wide, span in range, no
comment anchors, grandfather list consistent both ways, every failure path loud.

**Gate**: `test:scripts` **634 pass / 0 fail** (was 616 — 18 new). `lint` 0, `type-check` 0.

**Files**: `benchmarks/needles/resolve.ts` (new, shared — T6 consumes it),
`benchmarks/needles/run.ts`, `benchmarks/needles/fixtures/massa-ai.json`,
`scripts/__tests__/needle-resolution.test.ts` (new; placed under `scripts/` so `test:scripts`
reaches it — `benchmarks/` is not a workspace package and turbo cannot see it).

**Tests**: `scripts/__tests__/needle-resolution.test.ts`, provider-free · **Gate**: `bun run test:scripts`
**Commit**: `fix(bench): identify needles by content and fail loudly on a stale fixture`

---

### T5b — recover N07/N08/N09 and anchor them into `chunker/*.ts` — **DONE**

Recovered from `af3dab6` (the commit that authored the fixture, before the split at `56c84d1`) and
re-anchored into the modules that received the code. `scoring.staleNeedles` is now **empty**;
leaving an entry would have hard-failed the run, which is what forced this step to complete itself.

| Needle | Anchor | Recovered from | Now resolves to | Span |
| --- | --- | --- | --- | --- |
| N07 | `export function netBraceDelta(line: string): number {` | `smart-chunker.ts:642-674` | `chunker/chunker-code.ts:155-176` | 33 → **22** lines |
| N08 | `if (chunk.label && chunk.type === "code_block") {` | `smart-chunker.ts:737-744` | `chunker/chunker-post.ts:33-36` | 8 → **4** lines |
| N09 | `const hasHeading = /^\s*#{1,6}\s+/m.test(content);` | `smart-chunker.ts:198-206` | `chunker/chunker-markdown.ts:10-12` | 9 → **3** lines |

Every span is shorter because the split stripped comments while moving the code. **That measurement
is the concrete proof of design.md's claim that a span cannot be carried forward as a line-count
delta** — an `anchor + spanLines` scheme would have reproduced 33/8/9 lines against regions that are
22/4/3, silently over-running each one. Queries unchanged; content recovered, never re-authored.

**The uniqueness guard caught a self-inflicted collision, which is worth recording.** N07's first
anchor resolved to **3** locations: `chunker-code.ts:168` plus two copies in
`scripts/__tests__/needle-resolution.test.ts`, where the test quoted the real symbol verbatim to
illustrate the `export ` prefix case. Fixed in the test — a synthetic symbol name — rather than by
narrowing the scan, because narrowing it would have hidden exactly the class of ambiguity AC-9
exists to catch. The tool built in T5a found the defect in its own test fixture on first use.

---

### T6a / SEN-04 prerequisite: Stop a full index aborting on a same-name/different-kind declaration — **DONE**

**Unplanned.** Discovered while trying to run T6's gate. T6's `bun run test:e2e` reaches
`ensureSharedIndex`, which indexes the whole repo and blocks on probe queries — and that index
aborted at **1219/1219 files in ~4 s** with
`fqn_identity_collision: apps/tools-api/scripts/coverage-by-file.ts#total`, twice, deterministically
(`index_jobs` rows `16b38fd0`, `07862bf3`). Not slow — throwing. **Every** E2E suite in the repo was
unrunnable, which is why T6's gate had never been run at any point in this feature.

Offered as a decision with the evidence — record T6 not-run, force the index locally, or repair the
defect. Spec owner chose repair. Full mechanism, blast-radius argument and the divergence it creates
are in `design.md`, **Fourth fork**.

**The fix**: `declarationGroupKey(file, qualifiedName)` in
`packages/core/src/services/structural/resolver.ts` — the uniqueness count was keyed on
`(file, qualifiedName, kind)`, finer than the `(file, name)` namespace the simple FQN occupies, so
two top-level declarations sharing a name but differing in kind each believed themselves unique and
both claimed `file#name`.

**Measured before the fix was written, not after**:

| Symbol | kinds | classified | outcome |
| --- | --- | --- | --- |
| `total` | `variable` + `constant` | `unique`, `unique` | **abort** |
| `pct` | `constant` ×2 | `overloaded` ×2 | disambiguated correctly |
| `i` | nested | — | unaffected (nested always takes the modern FQN) |

`pct` is the control that made the diagnosis exact: same-name/**same**-kind already worked.

- [x] `total` reclassifies to `overloaded`/`overloaded`; registry no longer throws on the real file
- [x] The pre-existing test asserting this **should** throw is rewritten, not deleted — `class Same` +
      `interface Same` is declaration merging, legal source. It now asserts two distinct identities,
      neither claiming bare `file#Same`, both resolvable
- [x] Discriminating sensor: restoring `kind` to the group key turns the two new tests **red**
      (measured: `54 pass / 2 fail`, vs `56 pass / 0 fail` with the fix). A same-name/**same**-kind
      test cannot discriminate — it passed before the fix too — so the sensor had to use a
      different-kind pair
- [x] Uncontested names in the same file keep the simple FQN — the key widens, the legacy shape is
      not disabled
- [x] Full index gets past the abort: `running`, 1219 files discovered, symbols and vectors written
      (previously 0 rows, dead at 4 s)

**Gate**: `bun test structural-resolver.test.ts` **56 pass / 0 fail**; isolation runner
`--unit --filter='structural|fqn|identity'` **PASS: all 4 groups**; `lint` 0; `type-check` 6/6;
`build` 5/5.

**Tests**: `packages/core/src/__tests__/structural-resolver.test.ts` (1 rewritten, 1 added)
**Commit**: `fix(structural): stop a same-name different-kind declaration aborting the index`

---

### T6 / SEN-04: Repair the third fixture consumer

**What**: Point `14.needles.test.ts` at the shared resolution path instead of its own copied predicate.
**Where**: `packages/core/src/__tests__/e2e/14.needles.test.ts:119-133`
**Depends on**: T5
**Requirement**: SEN-04 (AC-7)
**Why it exists (Plan Challenge finding 2)**: it replicates `intersects` and `findRank` **verbatim** against the same fixture JSON. Repairing `run.ts` and `scorer.ts` while leaving this pinned would let PR-B break it invisibly — with the 7 `services/search/` targets moved, its `hit@5` caps at 7/14 = 0.50 against its own **0.64** floor (`:302`). Gated behind `describe.skipIf(!READY)` (`:236` — `RUN_E2E` + live API + Ollama), which lowers blast radius but does not make it exempt.

**Done when**:
- [ ] No third copy of the predicate remains; it consumes the shared resolver
- [ ] Its documented floors (`hit@1 ≥ 0.36`, `hit@5 ≥ 0.64`) and its determinism assertions (`:273-276`) are unchanged
- [ ] A repo-wide search finds no fourth consumer of `expected.filePath`

**Tests**: existing e2e · **Gate**: `cd packages/core && bun run test:e2e`
**Commit**: `test(e2e): consume the shared needle resolver instead of a copied predicate`

---

### T7 / SEN-04: Equivalence baseline — the calibration evidence

**What**: Run the needles gate before and after the anchoring change on an unchanged tree; prove per-needle ranks are identical.
**Where**: evidence recorded in this file
**Depends on**: T5, T6
**Requirement**: SEN-04 (AC-4)
**Cost**: **~90 min × 2**, local Ollama with qwen3-embedding:8b pulled.
**Why it is the most important evidence in this PR**: without it the repaired sensor's own calibration is unproven, and every needles observation in PR-B is uninterpretable. A representation change that moves a score is not a representation change.

**Pre-change baseline is DONE** — captured at `c33a5c1` before any T5 work, per the ordering
constraint. `benchmarks/needles/reports/massa-ai-before-anchoring-results.json`.

```
hit@1 = 0.500 >= 0.5  → PASS   (exact knife edge)
MRR   = 0.569 >= 0.65 → FAIL
N07, N08, N09 MISS — all three top-hit smart-chunker.ts:30-82
N01 @1  N02 @1  N03 @1  N04 @1  N05 @5  N06 @3  N10 @1  N11 @1  N12 @10  N13 @1  N14 @3
```

**Done when**:
- [x] Pre-change run recorded verbatim, per-needle ranks captured
- [x] **After T5a**: ranks byte-identical to the above, MRR **0.569**, hit@1 **0.500**

  **PASSED, and more strongly than the criterion asked.** Compared the two results JSONs
  programmatically rather than reading the printed table: for all **14** needles the full top-10
  **hit lists** and the **cosine score vectors** are identical, not merely the ranks.

  ```
  before: 14 needles, totalChunks=68
  after : 14 needles, totalChunks=68
  per-needle hit lists differing   : 0
  per-needle score vectors differing: 0
  hit@1 = 50.0%   hit@3 = 64.3%   hit@5 = 71.4%   hit@10 = 78.6%   MRR = 0.569
  N01 @1  N02 @1  N03 @1  N04 @1  N05 @5  N06 @3  N10 @1  N11 @1  N12 @10  N13 @1  N14 @3
  N07, N08, N09 MISS — all three still top-hit smart-chunker.ts:30-82
  ```

  Corpus stayed **6 files / 68 chunks**, which is the precondition that made this provable.
  Report: `benchmarks/needles/reports/massa-ai-after-t5a-anchoring-results.json`.
- [x] **After T5b**: a new baseline recorded and explained needle by needle

  **The repaired sensor changed the answer, and it changed it upward.** Corpus 6 → **8 files**,
  68 → **86 chunks**: `smart-chunker.ts` left (no needle targets it any more) and the three
  `chunker/*.ts` modules entered, exactly as `design.md` predicted.

  ```
  hit@1  = 64.3%   hit@3 = 85.7%   hit@5 = 92.9%   hit@10 = 100.0%   MRR = 0.736
  ```

  | | before (stale fixture) | after T5b | |
  | --- | --- | --- | --- |
  | hit@1 | 0.500 | **0.643** | floor 0.5 — was a knife edge, now clears by 2 needles |
  | MRR | 0.569 | **0.736** | floor 0.65 — **was failing, now clears** |

  Needle by needle, the only changes are the three that were broken:

  | Needle | before | after | why |
  | --- | --- | --- | --- |
  | N07 | MISS | **@1** | target recovered into `chunker-code.ts` |
  | N08 | MISS | **@3** | target recovered into `chunker-post.ts` |
  | N09 | MISS | **@1** | target recovered into `chunker-markdown.ts` |
  | N01–N06, N10–N14 | @1 @1 @1 @1 @5 @3 @1 @1 @10 @1 @3 | **identical** | 11 unchanged, despite 18 new chunks competing |

  All eleven untouched needles held their exact ranks even though the corpus grew by 18 chunks —
  so the movement is entirely attributable to the three repairs, not to corpus churn.

  **This is the finding of the feature.** The gate was red because the fixture was stale, not
  because retrieval had regressed. Repairing the instrument — touching no floor, no chunker
  parameter and no retrieval code — took MRR from a failing 0.569 to a passing 0.736. Every
  needles number read between `56c84d1` and this commit was measuring the fixture, not the
  search.

  Report: `benchmarks/needles/reports/massa-ai-after-t5b-recovery-results.json`.
- [ ] ~~Both floors still clear~~ — **struck. The floors fail on the tree this PR starts from**, for a reason that predates it. SEN-04's Out of Scope already forbids touching the floors here; the same logic forbids adopting them as this PR's bar. What this PR owes is a sensor that reports the truth loudly. Whether the truth clears 0.65 is a retrieval-quality question and belongs to whoever answers it with retrieval work, not fixture edits

  **Confirmed by the spec owner, and then made moot by the measurement: both floors now clear
  anyway** — hit@1 0.643 ≥ 0.5, MRR 0.736 ≥ 0.65. The strike stands as reasoning even though the
  outcome is green, and it is worth keeping for that reason. Had the floors been adopted as this
  PR's completion bar, the pressure at T5a — where the honest interim number was still 0.569 —
  would have been to reach for the fixture. The number moved because the sensor was repaired, which
  is the only reason it was ever allowed to move
- [ ] If T5's AC-8 span check was clean and T5a's ranks still moved, **stop** — that is an unmodelled mechanism, not a tolerance to widen

**Tests**: none (measurement is the deliverable) · **Gate**: `bun run bench:needles:gate` ×2
**Commit**: `docs(specs): record the needle-anchoring equivalence baseline`

---

### T8 / BEH-01: Honour `includePersistent`

**What**: Make the advertised option do what the schema says.
**Where**: `packages/core/src/controllers/memory-controller.ts:280`
**Depends on**: None
**Requirement**: BEH-01 (AC-1..AC-4)
**Why it is isolated here**: it is the one behavior change in the four-PR programme. PR-B and PR-C are behavior-preserving; a behavior change riding along in either would make them validatable as neither.

**Done when**:
- [ ] `includePersistent: false` excludes persistent memories from the result set
- [ ] The published MCP schema at `tools/search_memories.ts:61` is **unchanged** — this makes the existing advertisement true, it does not alter it
- [ ] Discriminating sensor: reverting to `_includePersistent` makes the new test fail
- [ ] `CHANGELOG.md` `### Fixed` — callers passing `false` today silently receive persistent results and will see a result-set change

**Tests**: new unit test on `MemoryController.searchMemories` · **Gate**: `bun run test`
**Commit**: `fix(memory): honour includePersistent in search_memories`

---

### T9 / PR close

**What**: CHANGELOG, full gate, independent validation.
**Depends on**: T1–T8
**Requirement**: all

**Done when**:
- [ ] `CHANGELOG.md` `[Unreleased]` entries present — the CI merge gate fails a PR without them
- [x] ~~fix the stale "nine documented exclusions" (actual: 11)~~ — **struck. Measured: `EXCLUSIONS.length` is 9 and the gate prints `9 documented exclusions`. `CHANGELOG.md` was right; `HANDOFF.md` was wrong.** Making this "fix" would have introduced the error it meant to remove. validation-pr2 gap #2 is closed
- [ ] Full gate green: `lint`, `type-check`, `build`, `test`, `test:scripts`, `test:plugins`, `test:coverage`
- [ ] **No new exclusion** added to `scripts/check-coverage.ts`
- [x] **No commit carries a marker GitHub acts on.** A squash merge folds every commit body into the merge message; that killed the v1.3.0 release. Verified **0** in the PR range:

      ```bash
      git log --format=%B origin/main..HEAD | grep -ciE '\[(skip ci|ci skip|no ci|skip actions|actions skip)\]'
      ```

      **Corrected twice during Execute.** As written the AC was
      `git log --format='%B' | grep -ci 'skip.ci'` → 0, which is wrong in two independent ways:

      1. **Unscoped**, it scans the whole history and can never return 0 — the repo's own
         `chore(release): vX.Y.Z` commits legitimately carry the marker (**10** bracketed matches).
      2. **`skip.ci` is too broad.** GitHub only acts on the *bracketed* forms. The loose pattern
         also flags the phrase `skip-ci` in ordinary prose — which `CLAUDE.md` **explicitly
         instructs** you to write (*"Call it 'the skip-ci marker' in prose"*). The guard as written
         fails the guidance the repo gives. It matches **1** here, on a commit body explaining this
         very correction, and that commit is harmless.

      Run it through `rtk proxy`. Under rtk's filter the same `grep -c` returned `11` and then `0`,
      which would have recorded a false pass
- [ ] `massa-ai-verification-agent` (author ≠ verifier) writes `validation.md`
- [ ] STATE.md: flip **AD-013** from `proposed` to `active`

**Tests**: full gate · **Gate**: all of the above
**Commit**: `docs: record the sensor-repair changes and close PR-A`

---

## Phase Execution Map

| Phase | Tasks | Parallelizable? |
| --- | --- | --- |
| 1 — trustworthy measurement | T1 → T2 → T3 | No — strictly sequential; each measures what the prior fixed |
| 2 — CI reach | T4 | After T3 |
| 3 — retrieval sensor | T5 → T6 → T7 | Independent of 1/2; **start early**, T7 is the long pole |
| 4 — behavior + close | T8, T9 | T8 anytime; T9 last |

**9 tasks** — over the ~8-task batch budget, so the sub-agent offer applies. Offer-then-confirm; never auto-spawn.
