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

**AC-1 is now MET** — `Coverage` run `30418495440`, sha `6533900`, **success**:
`[coverage] PASS — every measured source file is at or above 90%`, 314 files measured,
**9** documented exclusions (unchanged), **0** failing tests. It took two runs; the first
(`30417371974`) was red for a defect this task uncovered rather than caused — see T10.

**REOPENED, then closed: AC-2 was necessary and not sufficient.** This task recorded
"no `continue-on-error`" as satisfying *blocking*, and that is a category error the whole
feature exists to catch. `continue-on-error` governs whether the **check** goes red. Whether a
red check can **stop a merge** is the branch ruleset's `required_status_checks` list — a
repository setting, invisible from the workflow file and not versioned with it. Measured on the
open PR:

```bash
gh api repos/luizgmassa/massa-ai/rules/branches/main \
  --jq '[.[] | select(.type=="required_status_checks")
         | .parameters.required_status_checks[].context]'
# ["build","mcp","validate",
#  "Structural native tests (darwin-arm64)","Structural native tests (linux-x64)"]
```

`coverage` **absent**. The workflow's own header read `BLOCKING BY DESIGN` and
`Coverage must be able to fail a merge` while it could do neither — a gate that reports and
never enforces, inside the deliverable written to prevent exactly that. It is the same defect
shape as the six unplanned repairs, found in the fix rather than in the subject.

Closed during close-out, **after** the check went green (adding it first would have blocked the
PR that fixes it). New live value:

```
["build","mcp","validate",
 "Structural native tests (darwin-arm64)","Structural native tests (linux-x64)","coverage"]
```

Two traps for whoever touches this again. The context string is the **job id** (`coverage`), not
the workflow `name:` (`Coverage`). And the update endpoint is **PUT** (full replace) —
`PATCH /repos/{owner}/{repo}/rulesets/{id}` returns **404**, not 405, which reads exactly like a
missing permission and is not one; the token had `repo` scope and `admin: true` throughout. The
full ruleset was diffed before and after: only `required_status_checks` changed, and the
`DeployKey` bypass that `release.yml` depends on is intact.

Recorded as **AC-5** in `spec.md`, and the workflow header is corrected.

**Tests**: none (CI config) · **Gate**: green run on the PR itself — **PASS**, run `30418495440`
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

### T6b / T6c / T6d — bounding the e2e corpus, and the three inert knobs it exposed

**Unplanned, and not the task that was handed over.** The plan carried into this session was
to bound the shared e2e index with a scratch `config.json` carrying a `capturePolicy` that
kept 81 files. That plan could not have worked, and the reason is the same defect class this
whole feature exists to remove.

**Before any of it: the premise "the API is currently DOWN" was false.** PID `47108`,
orphaned (PPID 1), had been running since 20:03 and was still indexing the full repository
48 minutes later — holding the `managed_runs` indexing lease (`id 869`, heartbeat 6 s old)
that made every new index return `indexing_busy`. It also still held port 3333, so a second
API started beside it and **both** were `LISTEN`ing; requests were being split between an
instance with the bounded config and one without. The previous session's `pgrep` patterns
(`tools-api`, `bun test`) could not match its command line, which is literally
`bun src/index.ts`. Check `lsof -nP -iTCP:3333 -sTCP:LISTEN`, not a name pattern.

**Three knobs, each documented, each enforcing nothing.** Found in the order below, each one
by trying to use the previous one:

| # | Knob | What was wrong | How it was measured |
| --- | --- | --- | --- |
| 1 | `capturePolicy` | `applyCapturePolicy` had **zero production callers**. The block was parsed, bounds-checked and `denyUnknownFields`-validated at load, then never consulted | repo-wide search: only its own doc comment refers to it |
| 2 | `security.allowedExtensions` | assembly hardcoded `[...DEFAULT_ALLOWED_EXTENSIONS]`; `MassaAiConfig.security` did not declare the field at all | scratch config set `[".ts"]`; `config.get` returned all 33 |
| 3 | one-extension glob | `**/*{.ts}` — a brace expansion with one alternative — is matched **literally** | bounded index **completed in 181 ms over 0 files** |

Knob 3 is the one worth dwelling on. It was **unreachable** while the extension list was
always the 33 defaults, and fixing knob 2 is what reached it. It was found by *using* the
fix, not by reading it — and its failure mode is the exact one this feature is about: a run
that reports success over an empty corpus, with no error anywhere.

`ignore-patterns.ts` has documented the composition as *"a path is indexed iff
`!ig.ignores(path) && applyCapturePolicy(path) !== 'Drop'`"* since the policy was added. The
second half was never performed. **A doc comment is not a sensor.**

**Decision (spec owner, this session): fix all three rather than route around them.** The
alternative — index the full repo for ~3.2 h, or record T6's gate as not-run — was offered
with costs. Consistent with the T6a precedent: a gate that cannot run is the same defect
class the feature exists to remove.

#### T6b — `security.allowedExtensions` propagates — **DONE** (`ee07326`)

Wired through `fileConfig` the way `corsOrigins` at the adjacent line already was, and the
field added to the user-facing `MassaAiConfig.security` type. An **empty array is refused at
load**, not honoured: it matches nothing, so honouring it would rebuild the silent-zero
failure inside the fix meant to remove it. Entries must be dot-prefixed.

- [x] Discriminating sensor: reverting the assembly gives **2 pass / 4 fail**; fixed, **6 / 0**.
      The two survivors are the default-fallback guards, which do not discriminate by design
- [x] Omitting the key still yields the 33 defaults — the property that keeps every existing
      install unaffected

#### T6c — `capturePolicy` reaches discovery — **DONE** (`8ea1a4d`)

Discovery applies the policy after the `.gitignore` + `DEFAULT_IGNORES` merge, in that order.

**The existing suite caught a real flaw in the naive wiring, which is the reason it is worth
having.** `DEFAULT_POLICY` carries the same test globs `DEFAULT_IGNORES` does, so the first
version re-dropped every test file and **silently neutralized `includeTests`** —
`etl-stages-coverage.test.ts` went red immediately. `loadPolicy` now mirrors `loadIgnore`,
stripping only `Drop` rules on a known test glob; an unrelated `Drop` rule keeps applying.

- [x] Discriminating sensor: **4 pass / 3 fail** unwired, **7 / 0** wired
- [x] Default parity: with no policy configured, `DEFAULT_POLICY`'s Drop set mirrors
      `DEFAULT_IGNORES`, so a default install discovers the same files. Pinned by test
- [x] Layer ordering pinned: a `Keep` rule cannot resurrect a `.gitignore`d path — AND, not
      a precedence chain. Only `Drop` excludes; `MetadataOnly` is still discovered
- [x] Core `--unit` group count **126 → 127**, entirely the new file (225 files, 99
      pure/shared + 126 stateful/isolated)

#### T6d — the one-extension glob, and the bounded corpus — **DONE** (`c3f10ec`)

`buildExtensionGlob` returns one pattern per extension instead of one combined brace
pattern. `glob` accepts the array and still performs a single traversal, so the reason the
combined form existed is preserved. Applied at all three scanners that built it — the ETL
discover stage, the index manager's staleness scan, and the RLM indexer — because it is one
defect in three copies.

- [x] Discriminating sensor: restoring the combined pattern gives **23 pass / 6 fail**;
      fixed, **29 / 0**

**Corpus actually indexed**: `.ts` only, **382 files** discovered (from 1219 across the 33
default extensions), parsed in 2.2 s.

**Honesty note on what this corpus proves — read before quoting any needle number from T6.**
This is **not** the corpus `14.needles.test.ts`'s floors (`hit@1 ≥ 0.36`, `hit@5 ≥ 0.64`)
were calibrated against; those came from a full warm shared index on this host. Less
competition makes retrieval strictly easier, so **a pass here is weaker evidence than a pass
on the full corpus**, and the floors are not comparable across the two. What the run does
prove is T6's actual subject: that the sweep, the shared resolver, `findRank` and the
determinism assertions all execute end to end against a live API and a real index.

The `bge-m3` / `qwen3-embedding:4b` option was considered and **not taken** — changing the
embedding model changes what the floors mean, and SEN-04's Out of Scope forbids touching
floors in this PR.

**Commits**: `ee07326`, `8ea1a4d`, `c3f10ec`

---

### T6 / SEN-04: Repair the third fixture consumer

**What**: Point `14.needles.test.ts` at the shared resolution path instead of its own copied predicate.
**Where**: `packages/core/src/__tests__/e2e/14.needles.test.ts:119-133`
**Depends on**: T5
**Requirement**: SEN-04 (AC-7)
**Why it exists (Plan Challenge finding 2)**: it replicates `intersects` and `findRank` **verbatim** against the same fixture JSON. Repairing `run.ts` and `scorer.ts` while leaving this pinned would let PR-B break it invisibly — with the 7 `services/search/` targets moved, its `hit@5` caps at 7/14 = 0.50 against its own **0.64** floor (`:302`). Gated behind `describe.skipIf(!READY)` (`:236` — `RUN_E2E` + live API + Ollama), which lowers blast radius but does not make it exempt.

**Done when**:
- [x] No third copy of the predicate remains; it consumes the shared resolver
- [x] Its documented floors (`hit@1 ≥ 0.36`, `hit@5 ≥ 0.64`) and its determinism assertions are unchanged
- [x] A repo-wide search finds no fourth consumer of `expected.filePath` — the remaining
      uses read a **resolved** span, or are `scorer.ts`'s documented external-corpus fallback

**DONE** — `d5b5813`, with the harness blocker in `fedc202`.

**A second blocker sat between this suite and its own gate, and it was not slow either.**
`probeAvailability` fetched `/api/v1/system/ollama` and `/api/v1/system/info` with **no
`x-api-key`**. Neither path is in `PUBLIC_PATHS`, so under AD-011 both answer **401**;
`ollama?.available` came back undefined, `OLLAMA_UP` was false, and the suite reported
**`0 pass / 2 skip / 0 fail`** — which reads like a pass. The same file detects auth two
calls later with a deliberate keyless 401 probe, so it already knew the API needed a key.

Together with T6a that is **two** blockers, neither of which failed: one aborted the index,
one skipped the suite. That is the feature's thesis holding up under its own gate.

**Gate result** — 382-file bounded corpus (T6b/T6c/T6d above; a pass here is weaker
evidence than a pass on the full corpus, and the floors are not comparable):

```
hit@1  = 50.0%   hit@3 = 71.4%   hit@5 = 78.6%   hit@10 = 78.6%   MRR = 0.610

hit@1 0.500 ≥ 0.36  → PASS
hit@5 0.786 ≥ 0.64  → PASS
MRR   0.610 ≥ 0.47  → PASS

1 pass / 0 fail
```

Run #1 and run #2 are **byte-identical across all five aggregates** — the determinism
assertions hold unchanged, which is what the criterion asked for.

**The anchoring proved itself by accident, on the commit that completes it.** T6c and T6d
edited `discover.ts` *above* both of its needle targets. N10 and N11 resolved to their new
lines — `144-151` and `187-193`, not the fixture's old values — and both still ranked **@1**,
with no fixture edit. That is exactly AC-3's "within-file move beyond `lineTolerance`",
exercised for real rather than in a constructed test.

- [x] Discriminating sensor for the harness fix: omitting the key gives `0 pass / 2 skip /
      0 fail`; sending it gives `1 pass / 0 fail`

**Tests**: existing e2e · **Gate**: `RUN_E2E=1 bun test …/e2e/14.needles.test.ts` — **PASS**
**Commits**: `fedc202` (harness), `d5b5813` (T6)

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
- [x] If T5's AC-8 span check was clean and T5a's ranks still moved, **stop** — that is an unmodelled
      mechanism, not a tolerance to widen. **Did not trigger**: the AC-8 span check was clean *and*
      T5a's ranks did not move (0 differing hit lists, 0 differing score vectors across all 14)

**Tests**: none (measurement is the deliverable) · **Gate**: `bun run bench:needles:gate` ×2

**Commit — correction.** This task planned a commit
`docs(specs): record the needle-anchoring equivalence baseline`. **No such commit exists**, and the
citation was wrong rather than the work being missing: T7's evidence is the two results JSONs under
`benchmarks/needles/reports/` plus the tables recorded in this file, which landed with the work they
describe (`27dda6c` for the T5a equivalence, `5e018e5` for the T5b baseline) and with this file's own
docs commit. Recorded here rather than fabricating the subject retroactively — flagged by the
independent verifier, `validation.md`.

---

### T8 / BEH-01: Honour `includePersistent`

**What**: Make the advertised option do what the schema says.
**Where**: `packages/core/src/controllers/memory-controller.ts:280`
**Depends on**: None
**Requirement**: BEH-01 (AC-1..AC-4)
**Why it is isolated here**: it is the one behavior change in the four-PR programme. PR-B and PR-C are behavior-preserving; a behavior change riding along in either would make them validatable as neither.

**The open question — what `false` means with no `sessionId` — was dissolved, not answered.** The
premise carried into this task was that no `persistent` concept exists. There is no such *column*,
but `MemoryLevel.PERSISTENT = 0` is a first-class level (`packages/shared/src/types/index.ts:19-25`),
assigned by `memory-service.determineLevel` at `:91`/`:115` and written by `bootstrap-service:656`.
Measured distribution: **L0 2 · L1 32 · L2 304 · L3 138 · L4 23**. The spec owner chose the
level-based reading, which is well-defined with or without a `sessionId`. Rationale and the two
rejected readings are recorded in `spec.md`.

**Done when**:
- [x] `includePersistent: false` excludes persistent memories from the result set
- [x] The published MCP schema at `tools/search_memories.ts:61` is **unchanged** — this makes the existing advertisement true, it does not alter it
- [x] Discriminating sensor: reverting to `_includePersistent` makes the new test fail
- [x] `CHANGELOG.md` `### Fixed` — callers passing `false` today silently receive persistent results and will see a result-set change

**DONE.** Filter is applied **in SQL**, not after the fact: the controller asks for a `limit * 3`
candidate pool and then re-ranks it, so dropping rows after `LIMIT` would have shrunk that pool
instead of filling it with eligible rows.

**Divergence — the same unmet promise existed in a second method.**
`MemoryRepositoryPg.search(SearchFilters)` declares `includePersistent` as a *required* field and
ignored it. Honoured there too. It has no production callers (tests only), so no live behavior
changes; leaving it would have left the contract type false while "fixing" the contract.

**Discriminating sensors, both layers, measured by reverting:**

| Reverted | Result |
| --- | --- |
| controller back to `includePersistent: _includePersistent` | `memory-controller.test.ts` **30 pass / 2 fail** |
| repository SQL predicate removed | `memory-repository-pg-coverage.test.ts` **52 pass / 1 fail** |
| both restored | **32 / 0** and **53 / 0** |

The repository test asserts a *pair* — the L0 row disappears and the non-L0 row survives — because
an assertion on the excluded row alone would also pass if the query returned nothing at all. It also
pins that omitting the filter behaves as `true`, matching the schema's documented default.

**Tests**: `memory-controller.test.ts` (forwarding + default), `memory-repository-pg-coverage.test.ts`
(behavioral L0 exclusion, dedicated DB) · **Gate**: `bun run test`
**Commit**: `fix(memory): honour includePersistent in search_memories`

---

### T9 / PR close

**What**: CHANGELOG, full gate, independent validation.
**Depends on**: T1–T8
**Requirement**: all

**Done when**:
- [x] `CHANGELOG.md` `[Unreleased]` entries present — the CI merge gate fails a PR without them.
      **Five** entries under `### Fixed`: the index abort (T6a), the one-extension glob (T6d),
      `capturePolicy` (T6c), `security.allowedExtensions` (T6b), and `includePersistent` (BEH-01)
- [x] ~~fix the stale "nine documented exclusions" (actual: 11)~~ — **struck. Measured: `EXCLUSIONS.length` is 9 and the gate prints `9 documented exclusions`. `CHANGELOG.md` was right; `HANDOFF.md` was wrong.** Making this "fix" would have introduced the error it meant to remove. validation-pr2 gap #2 is closed
- [x] Full gate green: `lint`, `type-check`, `build`, `test`, `test:scripts`, `test:plugins`, `test:coverage`

      | Gate | Result |
      | --- | --- |
      | `bun run lint` | **0** (oxlint, exit 0) |
      | `bun run type-check` | **6 / 6 successful** |
      | `bun run build` | **5 / 5 successful** |
      | `bun run test` | **11 / 11 tasks**, core `PASS: all 134 group(s)` |
      | `bun run test:scripts` | **634 pass / 0 fail** (33 files) + shell 5 / 22 / 26 / 11 / 8 |
      | `bun run test:plugins` | **94 pass / 0 fail** (8 files) |
      | `bun run test:coverage` | **PASS** — 314 files, **9** documented exclusions |
      | `RUN_E2E=1 … 14.needles.test.ts` | **1 pass / 0 fail** |

      **`bun run test` was run 6 times this session and passed 3 of them.** Reporting the tally
      rather than the best run, because "green" from one attempt would be the same overclaim this
      feature exists to remove. Both failure modes are attributed and neither is this diff:

      | Run | Result | Cause |
      | --- | --- | --- |
      | 1 | red | `mcp-client` — a **tools-api running on :3333** |
      | 2 | red | `core/trace-path` — `graph_generation_workspace_missing:p4d2-trace-path` |
      | 3, 4 | green | — |
      | 5 | red | `core/architecture-map` — `graph_generation_workspace_missing:p4d4-arch-map` |
      | 6 | green | — |

      1. **A running tools-api poisons `apps/mcp-client`.** `embedded-api-client-endpoints.test.ts`
         gave **2 fail** at 5001 ms with the API up, **6 fail** with the API up *and* a scratch
         `XDG_CONFIG_HOME`, and **95 pass / 0 fail in 4.34 s** with the API stopped. `CLAUDE.md`
         attributes this suite to a real developer config; measured here the config made it **worse**
         and the live API — sharing the Postgres pool (size 10) and Ollama — was the whole variable.
         Avoidable: stop the API before the aggregate.

      2. **Cross-package concurrency against one database.** `turbo.json`'s `test` task sets no
         concurrency limit and no cross-package ordering, so `@massa-ai/core#test`,
         `@massa-ai/tools-api#test` and `@massa-ai/mcp-client#test` run **at the same time against
         the same `DATABASE_URL`** — and `apps/mcp-client`'s deliberately-unmocked
         `embedded-api-client-endpoints.test.ts` performs project resets there while core is
         mid-file. Both failures are the same signature on different projects, and each failing
         suite passes alone (`trace-path` **18 / 0**, `architecture-map` **24 / 0** in 857 ms). The
         failing assertion in `architecture-map` is its *setup* line (`indexFixture`), not its own
         expectation — the test explicitly tolerates a missing workspace row and returns early.

         **Pre-existing and out of scope here.** Every file involved —
         `graph-generation-{lifecycle,symbol-repository}-pg.test.ts` (which `TRUNCATE TABLE
         workspaces CASCADE`), `project-reset.test.ts`, `embedded-api-client-endpoints.test.ts` — is
         untouched by this branch. Worth its own task: it is a real hazard that CI is also exposed
         to, since CI likewise runs one service database for all packages.

      Group counts moved **133 → 134** by default and **126 → 127** under `--unit`, entirely from
      `discover-capture-policy.test.ts`.
- [x] **No new exclusion** added to `scripts/check-coverage.ts` — the gate still prints
      **9 documented exclusions**. The coverage floor was met by *covering* the code instead: both
      config-load validators were only ever exercised in subprocesses, so the parent process's
      instrumentation counted them as dead. `validateCapturePolicyConfig` had been uncovered that way
      since it was written; this branch made the gap visible rather than causing it (`fcf5a02`)
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
- [x] `massa-ai-verification-agent` (author ≠ verifier) writes `validation.md` — **DONE.** Verdicts:
      SEN-01 VERIFIED · SEN-02 **PARTIAL** · SEN-03 VERIFIED · SEN-04 VERIFIED · BEH-01 VERIFIED, and
      all six unplanned repairs VERIFIED. It reasoned three discriminating sensors through the source
      and **reproduced one empirically** — confirming `glob("**/*{.ts}")` really does match 0 files —
      and re-ran seven test files live, all matching the recorded counts byte-for-byte.

      SEN-02 is PARTIAL for the reason T4 already recorded: AC-1's green run on the PR is not
      observable without a PR. Not a defect.

      **Both halves of that PARTIAL are now closed, and the verifier could not have seen either.**
      `validation.md` was written before the PR existed, so it had no CI run to read and no live
      ruleset to query. AC-1 is met by run `30418495440`; the previously-unstated AC-5 (the
      ruleset entry) was found on the PR and closed during close-out. See T10 and the AC-5 note in
      T4. The verdict stands as written for the state it was written against — the gap was in what
      was observable at the time, not in the verification.

      **It found 4 discrepancies, all documentation state, none in code. All are now fixed:**

      | # | Finding | Resolution |
      | --- | --- | --- |
      | 1 | The four-behaviour-change correction, the whole T6b/T6c/T6d narrative and — critically — **the bounded-corpus honesty caveat** existed only in the uncommitted working tree. Committed `HEAD` still said "two behaviour changes" | fixed by committing these files; the caveat is now in the PR record, which is the only place it protects a reader |
      | 2 | `FEATURES.json` still `status: specified`, `execute: false` | set to `complete`, all four phases true, `design`/`validation` paths added |
      | 3 | T9's own checklist left unticked | this section |
      | 4 | T7 cited a commit subject that does not exist | corrected in T7 above — the evidence landed in `27dda6c` / `5e018e5`, and the citation was wrong rather than the work missing |

      Finding #1 is the one worth keeping. The caveat that matters most is the one saying the
      evidence is *weaker than it looks*, and it was sitting where no reviewer would ever load it.
- [x] STATE.md: flip **AD-013** from `proposed` to `active` — done, with the implementation
      recorded in the decision cell and the commits cited (`27dda6c` / `5e018e5` / `d5b5813`)

**Not verifiable locally, carried to the PR**: SEN-02 AC-1 — the `Coverage` workflow's green run on
the PR itself. **Resolved**: red on the first run (`30417371974`, one failing test → T10), green on
the second (`30418495440`). PR #42 merged as `33efc82`, a merge commit preserving all 21 commits.

**Tests**: full gate · **Gate**: all of the above
**Commit**: `docs: record the sensor-repair changes and close PR-A`

---

### T10 / SEN-02: A port assertion that can never hold behind a Docker port map — **DONE**

**Unplanned, and the seventh of its kind.** Found by the first CI run of the very gate T4 shipped.
`Coverage` run `30417371974` failed with `[coverage] unit(s) did not complete cleanly:
packages/core` and two files below the floor — `handoff-repository-pg.ts` **61.38%**,
`proposal-repository-pg.ts` **71.60%**.

**One failing test in the entire run** (`grep -c '(fail)'` over the run log → **1**), so nothing
was hiding behind it. `packages/core/src/__tests__/handoff-proposal-pg.test.ts`'s `beforeAll`:

```
  {
    "database_name": "massa_ai_test",
-   "server_port": 5433,
+   "server_port": 5432,
  }
```

**Mechanism.** The suite asserted `inet_server_port() === 5433`. That function reports the port
PostgreSQL is bound to **inside the container**, which is 5432; the 5433 in `DATABASE_URL` is a
host-side mapping (`coverage.yml` maps `5433:5432`) and the server has no knowledge of it. The
assertion cannot hold behind *any* Docker port map. It passes locally only because this host's
5433 PostgreSQL is a **native** install, where host port and bound port coincide — measured:
`lsof -nP -iTCP:5433 -sTCP:LISTEN` shows `postgres`, not `docker`.

**Not caused by this PR, and not merely inherited either.** `git blame` puts the assertion at
`cc985905`, **2026-07-13**; only the database name moved, in the `4feca2d3` rename of 2026-07-23.
`git diff origin/main..HEAD` over the file was empty. What is new is that the suite is gated
`describe.skipIf(!DEDICATED_DB)` on a `127.0.0.1:5433/massa_ai_test` URL shape that **only
`coverage.yml` — T4's own deliverable — ever produces**. So it had never executed in CI at any
point in its life. The seventh instance of this feature's thesis: a sensor that was never running.

**The fix asserts what a client can observe.** `inet_server_port()` dropped;
`current_database() === "massa_ai_test"` kept, which is the load-bearing half — the development
database is named `massa_ai`, so the name check alone still refuses it. The CI log confirms
`database_name` was already matching, so exactly one half was wrong.

**A second finding, made while resolving it: this file was the fork.** The close-out brief
proposed adding the shared dedicated-DB predicate here and flagged a possible tautology. Measured
instead: **13** files under `packages/core/src/__tests__` define `DEDICATED_DB`. **Twelve** are
byte-identical mirrors of `isDedicatedDatabase()` from `scripts/check-coverage.ts`. This one
hand-rolled a `new URL()` variant that omitted the `MASSA_AI_DEDICATED` half entirely — so it was
neither the shared case nor a tautology, but the single outlier. Brought in line with the other
twelve. `scripts/` is not a workspace package and cannot be imported from `packages/core`, so the
shape is mirrored with a comment naming the source — the third option the spec owner allowed,
and the one the other twelve already use.

- [x] Discriminating sensor: `inet_server_port` has **zero** executable references repo-wide
      (2 remaining hits are the comment explaining the removal)
- [x] Suite runs **13 pass / 0 fail** against the local dedicated database — and *runs*, rather
      than skipping; a skipped suite also exits 0, which is this feature's whole subject
- [x] Discriminating sensor for the predicate change: with `MASSA_AI_DEDICATED` unset the suite
      now **skips** (0 pass / 15 skip). Before the change it would have **run**, because the old
      predicate ignored that variable
- [x] Pointed at the development database (`5432/massa_ai`) it **skips**
- [x] CI: **13 pass / 0 fail** in run `30418495440` — it genuinely executed, not skipped
- [x] Gate green with **no exclusion added** — still `9 documented exclusions`, floor untouched

**A local coverage run cannot discriminate this fix, and was not run as if it could.** The local
5433 is native, so the old assertion passes there too; a green local gate would have been evidence
of nothing. The discriminating evidence is the CI run, and it is cited above.

The 15-skip / 13-pass discrepancy was measured rather than waved off: the file declares **13**
`test(` calls, and bun counts the 2 nested `describe` blocks as skip entries. Reporting artifact,
not lost coverage.

**Tests**: existing suite · **Gate**: `Coverage` run `30418495440` — **PASS**
**Commit**: `6533900` — `fix(test): assert the dedicated database by name, not by server port`

---

## Phase Execution Map

| Phase | Tasks | Parallelizable? |
| --- | --- | --- |
| 1 — trustworthy measurement | T1 → T2 → T3 | No — strictly sequential; each measures what the prior fixed |
| 2 — CI reach | T4 | After T3 |
| 3 — retrieval sensor | T5 → T6 → T7 | Independent of 1/2; **start early**, T7 is the long pole |
| 4 — behavior + close | T8, T9 | T8 anytime; T9 last |

**9 tasks planned; 16 executed.** The seven unplanned ones were not scope creep — each was a blocker
discovered by trying to use the previous fix, and each was offered to the spec owner with its cost
before being taken:

| Unplanned | Blocked | Failure mode |
| --- | --- | --- |
| T6a | every E2E suite in the repo | index **aborted** at 1219/1219 files |
| T6b | bounding the corpus | config value **read then discarded** |
| T6c | bounding the corpus | policy **validated then never consulted** |
| T6d | bounding the corpus | index **succeeded over 0 files** in 181 ms |
| e2e auth probe | every E2E suite gated on `OLLAMA_UP` | suite **skipped**, reported `0 pass / 2 skip / 0 fail` |
| coverage | the coverage gate | validators covered only in **subprocesses** |
| T10 | the coverage gate's first CI run | suite **had never executed in CI**; assertion unsatisfiable behind any port map |

**Not one of the seven failed loudly.** They aborted, skipped, or reported success over an empty
result — the same defect class SEN-01..04 exist to remove, found inside the tooling meant to measure
it. That is the strongest evidence this feature produced, and none of it was in the plan.

**And the plan's own deliverable had the defect too.** T4 shipped a workflow whose header said
`BLOCKING BY DESIGN` while `coverage` was absent from the branch ruleset's required-status-checks
list, so it could report and could not enforce. That is the eighth instance and the sharpest one,
because it was written *by* this feature rather than found by it: satisfying the acceptance
criterion as literally written (`no continue-on-error`) produced a gate that blocked nothing. The
criterion, not the implementation, was the defect. Recorded as SEN-02 AC-5.

**The recurring shape, stated once.** In every one of the eight, the artifact reported success
while measuring nothing — and in six of them the *reason* was that some execution precondition was
silently unmet: an env var, a config field, a URL shape, a required-checks entry. None of those
preconditions lives next to the thing it gates. The generalisable lesson is not "test the tests"
but: **a gate's enabling condition is part of the gate, and must be asserted somewhere that fails
loudly when it drifts.**
