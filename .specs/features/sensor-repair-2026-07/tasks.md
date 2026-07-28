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

| Task | Cost | Why |
| --- | --- | --- |
| T3 | ~15 min × 2 | `bun run test:coverage` is a full instrumented suite run against the dedicated DB. Needs one run to measure and one to confirm. |
| T7 | **~90 min × 2** | SEN-04 AC-4's equivalence baseline. qwen3-embedding:8b is ~60 s/embed and the fixture has 14 needles across ~6 files; `needles-gate.yml`'s own header sizes the fixture at ~90 min on a 2-core runner. Requires a **local Ollama with the model pulled**. |
| T9 | ~15 min | Full gate including `test:coverage`. |

**Roughly 3.5 hours of the PR is waiting.** Start T5/T6 before T7 so the long runs are the last thing blocking.

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
- [ ] Truncation is guarded by the **existing** `assertDedicatedDatabase()` (`check-coverage.ts:359-382`), not a second condition — two conditions drift apart, one cannot
- [ ] `_prisma_migrations` explicitly excluded
- [ ] `bunx prisma migrate status` reports **up to date** after a gate run
- [ ] Discriminating sensor: a non-dedicated `DATABASE_URL` makes the truncation refuse

**Tests**: `scripts/__tests__/check-coverage.test.ts` extended — refusal path, exclusion set · **Gate**: `bun run test:scripts`
**Commit**: `fix(tooling): reset the dedicated test database before the coverage gate`

---

### T3 / SEN-01: Re-measure and lower the `architecture-map` budgets

**What**: Measure `getProjectMap`'s three cases against a freshly-reset database and lower the `300_000` stopgap to the measured value plus headroom.
**Where**: `packages/core/src/__tests__/architecture-map.test.ts:583,601,618`
**Depends on**: T2
**Requirement**: SEN-01 (AC-3)
**Why it is a separate task**: lowering the budget is the **only** observable evidence that T2 worked. Leaving it at `300_000` makes the reset unfalsifiable.

**Done when**:
- [ ] Measured value recorded in this file (prior readings: **1213 ms** fresh / **16.59 s** post-gate / **>120 s** mid-gate)
- [ ] Budgets lowered to the measurement plus stated headroom; `bunfig.toml`'s global 5 s default untouched
- [ ] Full `test:coverage` passes twice with the new budgets — once is not evidence for a budget that already flapped between gate runs

**Tests**: existing · **Gate**: `bun run test:coverage` ×2 (~30 min)
**Commit**: `test(core): size the architecture-map budgets against a reset database`

---

### T4 / SEN-02: Wire the coverage gate into CI

**What**: New `.github/workflows/coverage.yml`, blocking, with its own pgvector service.
**Where**: `.github/workflows/coverage.yml` (new), `CLAUDE.md` CI-gates section
**Depends on**: T3
**Requirement**: SEN-02 (AC-1..AC-4)

**Three details it will fail on if guessed**: `assertDedicatedDatabase()` matches `/127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/`, so the URL must use literal **`127.0.0.1`** — every other job in `ci.yml:13` uses `localhost`, which fails the regex. Port must be **5433**, not the `5432:5432` at `ci.yml:23,159`. Database is `massa_ai_test`. Copy the service block from `ci.yml:15-23` and change all three.

**Done when**:
- [ ] Runs `bun run test:coverage` with `MASSA_AI_DEDICATED=1`
- [ ] **No `continue-on-error`** — a gate that reports and never enforces is the failure mode this repo already rejected once (oxlint's 15 firing rules kept at `error`)
- [ ] Not inside `ci.yml`, so it does not extend the `workflow_run` chain `release.yml` keys off — releases must keep firing on CI alone
- [ ] `CLAUDE.md`'s CI-gates section names it and its separate-workflow count is corrected

**Tests**: none (CI config) · **Gate**: green run on the PR itself
**Commit**: `ci: run the coverage gate on its own blocking workflow`

---

### T5 / SEN-04: Content-anchor the needles fixture, and fail loudly

**What**: Replace positional needle targeting with content anchors resolved at run time; convert the silent skip into a hard failure.
**Where**: `benchmarks/needles/run.ts` (`:233-236`, `:85-96`), `benchmarks/needles/scorer.ts` (`:94-104`), `benchmarks/needles/fixtures/massa-ai.json`
**Depends on**: None (parallel with Phase 1/2)
**Requirement**: SEN-04 (AC-1, AC-2, AC-3, AC-5, AC-6, AC-8, AC-9)

**The loud-failure half matters more than the anchoring half.** The silent skip is what made the gate untrustworthy: `run.ts:233-236` skips a missing target with a `[warn]`, and `scorer.ts:111,124,135` average that zero over the full needle count rather than dropping it.

**Done when**:
- [ ] Each needle carries a content anchor; `filePath`/`lineStart`/`lineEnd` are resolved from it before file collection
- [ ] Zero matches **or** two-or-more matches → non-zero exit naming the needle id and anchor. Never proceeds to scoring
- [ ] Resolution tolerates: verbatim move to another file; file rename; **and a within-file move beyond `lineTolerance` (5)** — the last is why the split breaks needles even where no file is renamed
- [ ] **AC-8 cheap check, run before T7's expensive one**: resolving the unchanged tree at `a6216cd` reproduces every needle's existing `lineStart`/`lineEnd` **exactly**. A non-zero diff falsifies "representation-only" for ~1 min of compute instead of 3 hours
- [ ] AC-9: every anchor verified to resolve to exactly one location repo-wide
- [ ] All 14 needles keep identical target spans; none added, removed, retargeted or re-queried
- [ ] Discriminating sensor: a fixture with a deliberately unresolvable anchor exits non-zero — and does **not** require an embedding provider, so it exercises resolution, not retrieval

**Tests**: new `benchmarks/needles/__tests__/` (or `scripts/__tests__/`) resolution suite, provider-free · **Gate**: `bun run test:scripts`
**Commit**: `fix(bench): identify needles by content and fail loudly on a stale fixture`

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

**Done when**:
- [ ] Pre-change and post-change runs recorded verbatim, per-needle ranks compared
- [ ] Ranks **identical**; any divergence is investigated and explained before proceeding, not averaged away
- [ ] Both floors still clear (`hit@1 ≥ 0.5`, `MRR ≥ 0.65`)
- [ ] If T5's AC-8 span check was clean and ranks still moved, **stop** — that is an unmodelled mechanism, not a tolerance to widen

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
- [ ] `CHANGELOG.md` `[Unreleased]` entries present — the CI merge gate fails a PR without them. Also fix the stale "nine documented exclusions" (actual: **11**) — validation-pr2 gap #2, still open
- [ ] Full gate green: `lint`, `type-check`, `build`, `test`, `test:scripts`, `test:plugins`, `test:coverage`
- [ ] **No new exclusion** added to `scripts/check-coverage.ts`
- [ ] `git log --format='%B' | grep -ci 'skip.ci'` → **0**. A squash merge folds every commit body into the merge message; that killed the v1.3.0 release
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
