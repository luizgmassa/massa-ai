# Sensor Repair 2026-07 — Handoff

**Active Feature**: `sensor-repair-2026-07` — Execute in progress. **T2 of 9 committed.**
**Branch**: `fix/sensor-repair` off `origin/main` @ `a6216cd` (v1.9.0). Not pushed; no PR open.
Working in place, no worktree.
**Commits**: `e95050e` specs · `39afe59` T1 · `c33a5c1` T1 handoff · `85ff20a` T2 · `1dc59c8` SEN-04 fork
**Spec**: `.specs/features/sensor-repair-2026-07/spec.md` — SEN-01 AC-3, SEN-04 AC-2/AC-6/AC-8 now
carry recorded divergences.
**Design**: `.specs/features/sensor-repair-2026-07/design.md` — **written mid-Execute** under the
tasks.md safety valve. Read it before touching SEN-04.
**Tasks**: `.specs/features/sensor-repair-2026-07/tasks.md` — approved, Execute inline one task at
a time, user declined sub-agents.
**Downstream**: `.specs/features/core-layering-god-module-split/spec.md` — revised, blocked on
this feature.

## Progress

| Task | Req | State |
| --- | --- | --- |
| T1 | SEN-03 | **DONE** `39afe59` |
| T2 | SEN-01 truncation | **DONE** `85ff20a` — verified live; justification rewritten |
| T3 | SEN-01 `architecture-map` budgets | **BLOCKED on a seam** — premise falsified, see below. A `60_000` edit sits **uncommitted** in the working tree; supersede it |
| T4 | SEN-02 `coverage.yml` | pending — note the gate is **red** today for a pre-existing reason |
| T5a | SEN-04 anchor the 11 valid needles | pending — corpus unchanged, equivalence provable |
| T5b | SEN-04 recover N07/N08/N09 | pending — anchors already recovered and verified |
| T6 | SEN-04 third consumer `14.needles.test.ts` | pending |
| T7 | SEN-04 equivalence baseline | **pre-change run DONE** — and it is what broke the spec open |
| T8 | BEH-01 `includePersistent` | pending |
| T9 | PR close + validation agent | pending |

## The three things this session measured that the spec had wrong

Each was a named mechanism that turned out not to be the firing one — the same shape as T1.

1. **The needles gate is already red, on an untouched tree.** `MRR 0.569` against a `0.65` floor at
   `c33a5c1`. `smart-chunker.ts` was split at `56c84d1` (945 → 81 lines) *before this feature was
   specified*; the fixture was authored at `af3dab6`, the commit before. N07/N08/N09 target lines
   past EOF. **SEN-04 AC-2 targets the wrong branch** — `run.ts:233-236` is guarded by `existsSync`
   and the file exists, so not even the `[warn]` fires. Implementing AC-2 as written would not have
   caught the defect that is actually firing.
2. **SEN-01's truncation does not fix the timing it was specified to fix.** `architecture-map`'s own
   cost is flat at **0.9–2.0 s** across three gate runs; the 120 s outlier is Ollama reloading an
   evicted `qwen3-embedding:8b`. The spec's reasoning — *"strictly sequential, so this is
   accumulation, not contention"* — excludes contention and then asserts accumulation, never testing
   the third option that `CLAUDE.md` already names as the commoner cause. Truncation is kept, on a
   rewritten justification: known start state matching CI, and `postgres-vector-store.integration`
   going **8 failures → 6**.
3. **The wall-clock budget was ~20× too pessimistic.** T7 measured **~2 min**, not ~90; the 90 min
   figure is `needles-gate.yml`'s 2-core CI estimate quoted as a local cost. Full `test:coverage` is
   **~3 min**, not ~15. The "~3.5 hours of waiting" is about 10 minutes.

## What T1 taught — apply these to the rest

- **A criterion written as "the key must be absent" produced the bug it existed to prevent.**
  Deleting `MASSA_AI_LLM_ENABLED` from the child env is the intuitive fix and it does not work:
  absent is exactly what `.env` refills. Measured through the real runner — delete → child sees
  `"true"`; assign `"false"` → child sees `"false"`. The gate is now pinned, not deleted.
- **A probe that imports nothing proves nothing.** Bun's `.env` auto-load reads **cwd** (the
  package root); the leak comes from `env.ts` walking up to the **repo root**, which only happens
  once something imports `@massa-ai/shared`. The first counter-proof was inconclusive for exactly
  this reason and nearly got recorded as a pass.
- **State the runner mode with the group count.** Core reports **126 groups in `--unit`** and
  **133 by default** (19 extra e2e files). Both correct. An unqualified "126" reads as a
  regression against a default run. Verified on a stashed tree that 133 is a property of the
  checkout, not of any change.
- **There is a real `.env` in this checkout** holding `DATABASE_URL`. The spec originally claimed
  there was none. Back it up and restore it byte-identical around any probe; do not clobber it.

## Environment facts that cost time

- `timeout` is **not** available (macOS). To sample a runner's discovery line without running the
  full suite: background it writing to a log, `sleep 20-25`, `kill -9` the pid and its children,
  then read the log.
- Root `node_modules` may be absent — `bun run lint` exits **127** with `oxlint: command not
  found`. Fix with `bun install --frozen-lockfile`, not with `bunx`.
- **The dedicated test DB was re-provisioned on 2026-07-28 and now lives in a durable directory.**
  The previous cluster's data dir was `/tmp/pg5433`, which macOS purges; it was still listening but
  rejected the documented credential with `FATAL: role "massa_ai" does not exist`. It is now
  `~/.local/share/massa-ai/pg5433`, role `massa_ai`, db `massa_ai_test`, pgvector 0.8.4, 23
  migrations applied, `migrate status` clean. Start it with:
  `/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D ~/.local/share/massa-ai/pg5433 -o "-p 5433 -h 127.0.0.1 -k /tmp" start`
- **Prisma reports 23 migrations, not the 24 `CLAUDE.md` states.** Cosmetic; do not chase.
- `qwen3-embedding:8b` is pulled, so T7 runs locally in ~2 min.
- **Run any command whose output you will treat as evidence through `rtk proxy`.** The rtk filter
  rewrites numbers and paths: it returned `11` and then `0` for the same `grep -c` invocation, and
  renders `5433` as `n` and long filenames as `n.ts`. That nearly recorded a false pass on T9's
  skip-ci check.
- **`postgres-vector-store.integration.test.ts` is flaky and fails inside the coverage gate**
  (10 pass/6 fail with the reset, 8/8 without; standalone 15/1 then 16/0). It asserts absolute row
  counts and is contaminated by *other suites in the same run*, which a reset at gate start cannot
  reach. Pre-existing — identical with and without T2. **It is what makes `test:coverage` exit 1
  today**, so T4's blocking `coverage.yml` would be red on arrival.
- **`bun run test` fails one task per run, a different one each time** — `mcp-client` once,
  `core`'s `trace-path.test.ts` the next. Pre-existing and documented in STATE.md. `trace-path`
  passes 18/0 standalone both with and without the T1 changes, and there were zero 5001 ms
  timeouts, so it carries none of the live-provider signature. Re-run the package alone and say
  so; do not claim a clean parallel aggregate.

## What this is

The five findings `audit-remediation-2026-07` carried forward, plus one found while specifying
them. They are one feature because they share one property: **each is a sensor that the
`core-layering-god-module-split` refactor depends on, and each is currently unreliable.** That
refactor is behavior-preserving, so the test suite, the coverage gate and the needles gate are
its only proof. Repair the instruments, then take the measurement.

| ID | What | Decision (locked) |
| --- | --- | --- |
| SEN-01 | Coverage gate inherits accumulated DB state; `architecture-map` needed a `300_000` stopgap | Truncate tables at gate start, keep schema + migrations |
| SEN-02 | `bun run test:coverage` is in no CI workflow | Its own blocking `coverage.yml`, outside `ci.yml` |
| SEN-03 | Tests read the developer's real config and reach live providers | Scratch `XDG_CONFIG_HOME` in the shared runner |
| SEN-04 | The needles gate cannot survive code movement | Content-anchor the fixture; make a stale needle a hard failure |
| BEH-01 | `includePersistent` is advertised and never read | Implement it |

## The one thing to know before touching anything

**The needles gate is guaranteed to fail against the refactor, for reasons unrelated to quality.**

`benchmarks/needles/scorer.ts:94-104` scores a hit only when a result matches **both**
`h.filePath === needle.expected.filePath` **and** a line-range intersection. Both halves are
pinned to physical file layout. `benchmarks/needles/run.ts:233-236` handles a missing target by
skipping it with a `[warn]` and continuing — the needle scores zero, which is indistinguishable
from a genuine retrieval regression.

The fixture has 14 needles. **7 are in `services/search/`** (3 in `rlm-fusion.ts`, 1 in
`rlm-search.ts`, 3 in `smart-chunker.ts`), and 4 of those are in the exact files the refactor
renames. Move them and the arithmetic is forced:

- best `hit@1` = 7/14 = **0.50** against `NEEDLE_FLOOR_HIT1=0.5` — passes only on perfect
  retrieval across every surviving needle
- best `MRR` = (7 × 1.0 + 7 × 0)/14 = **0.50** against `NEEDLE_FLOOR_MRR=0.65` — **fails
  unconditionally**

Two more facts about this gate: `needles-gate.yml` is `workflow_dispatch`-only and
`continue-on-error: true` by design (qwen3-embedding:8b is ~60 s/embed, ~90 min for the fixture),
so in practice it runs locally against a real Ollama. Every observation costs ~90 minutes. Budget
that into Tasks rather than discovering it mid-Execute.

## Corrections to the downstream spec — do not re-derive these

Four figures in the Specify-only draft of `core-layering-god-module-split` did not hold when
re-derived at `a6216cd`. They are corrected in place; two changed the plan.

| Original | Measured | Consequence |
| --- | --- | --- |
| `rlm-*` rename owns **40+ importers** | **4** files statically import an `rlm-*` module; ~16 mention the name | R-05 retired. The rename is ~an order of magnitude cheaper. |
| **38** backward imports | **36** — `data → services` 24, `controllers → tools` 5, `services → tools` 4, `services → controllers` 3 | The dominant violation has nothing to do with controllers. Now a separate requirement (GMS-01 AC-4). |
| fan-in **22** / fan-out **26** | fan-in 24 static / 26 with dynamic; fan-out **19** | GMS-03 AC-3 was unmeasurable as written; now requires a committed measurement script run at both commits. |
| `tools → services` **34** | **34 confirmed**, but only as unique tool-file → service-module edges (raw lines: 36) | State the method whenever the number is used. |

Three findings not in that draft:

- **`trace_path` and `impact_analysis` have two parallel implementations.** REST goes
  `apps/tools-api/src/routes/workspace.ts:461,612` → `GraphController`; embedded goes
  `apps/mcp-client/src/embedded-api-client.ts:159,166` → `new TracePathTool()` →
  `tracePathService`, with its own parameter mapping. CLAUDE.md calls REST/embedded parity a
  tested contract. This is a **behavior** divergence, so it cannot be fixed inside a
  behavior-preserving refactor — see R-07.
- **`ExecuteTool`/`ExecuteFileTool`/`BatchExecuteTool` are dead** — exported at
  `tools/index.ts:40,42,44`, zero `new` sites repo-wide. Both transports call `ExecutorController`
  directly.
- **`WebController` already lives in `services/`** and both transports instantiate it, so the
  precedent for "an orchestrator outside `controllers/`" is already set.

**One sweep result was wrong and was caught before it reached the spec.** An automated pass
reported `GraphController` as dead code with zero importers. It is live —
`routes/workspace.ts:16,94-96,461,612`, plus its own 380-line test file. Verify agent findings
against source before building a plan on them.

## Coverage-gate facts carried forward from PR2 (still true)

The floor is **90% line, per file**, with **9 exclusions**, both as executable data in
`scripts/check-coverage.ts` rather than in prose here — deliberately, because this file is
rewritten every feature and a gate pinned to prose would lose its own definition.

**Correction, measured 2026-07-28: the count is 9, not 11.** `EXCLUSIONS.length` is 9 and the gate
prints `9 documented exclusions` on every run. So **`CHANGELOG.md`'s "nine documented exclusions"
is correct** and it was this file that was wrong. T9's instruction to "fix the stale nine (actual:
11)" would have introduced the error it was trying to remove — validation-pr2 gap #2 is **closed,
not open**. Verify with:
`bun -e 'import("./scripts/check-coverage.ts").then(m=>console.log(m.EXCLUSIONS.length))'`

Do not "fix" a low coverage number by touching the floor before checking whether the file is
simply widely imported. Bun emits two shapes of lcov record for one file; `check-coverage.ts`
unions the **covered** set across groups and takes the **minimum** executable set. That fix took
130 below-floor files to 3.

The gate refuses to run without `MASSA_AI_DEDICATED=1` and a `DATABASE_URL` on
`127.0.0.1:5433/massa_ai_test`, and runs suites against a scratch `XDG_CONFIG_HOME`. SEN-01
reuses that same refusal as the guard for truncation.

`packages/core` merging 122 lcov files for 126 groups is expected, not a defect.

## Traps

- **Run every local test with `XDG_CONFIG_HOME=$(mktemp -d)`** until SEN-03 lands. Otherwise tests
  read the real `~/.config/massa-ai/config.json`; with a local Ollama that is a live network call
  measured at **42030 ms cold / 690 ms warm** against a 5 s budget. It looks exactly like
  flakiness and CI never sees it.
- **Merging to `main` with green CI auto-cuts and publishes a release.** Four PRs are planned
  (A sensors → B search split + rename → C layering → D `read_file.ts`); each must be
  independently shippable.
- **Never write the skip-ci marker literally** in a commit body or PR body. A squash merge folds
  every commit body into the merge message. That killed the v1.3.0 release.
- Characterization tests come **before** the structural change. And **coverage percentage is not
  evidence** of characterization: the search facade sat at 100% line coverage while 24 of its 41
  tests asserted forwarding only and could not detect a behavior change.

## Plan Challenge — complete, 4 findings folded in

Full gate, `red_team`, `escalate_to_full: true`. Every finding was independently re-verified
against source before incorporation; none was taken on the critic's word. Its diagnosis of the
shared failure shape is the useful part: *the mechanism that was named got verified, not every
mechanism that reaches the same symptom.*

| # | Finding | Landed as |
| --- | --- | --- |
| 1 | **SEN-03 does not close the leak it claims to.** `env.ts:33-34` dotenv-loads the nearest `.env` walking up from cwd, independent of `XDG_CONFIG_HOME`; `config/index.ts:575` lets env beat `config.json`. A repo-root `.env` with `MASSA_AI_LLM_ENABLED=true` bypasses the whole fix. Latent here — no `.env` in this checkout — which is exactly why it would surface the hard way. | SEN-03 **AC-6** |
| 2 | **The fixture has three consumers.** `packages/core/src/__tests__/e2e/14.needles.test.ts:119-133` replicates the predicate verbatim; 7 moved needles cap its `hit@5` at 0.50 against a **0.64** floor. Gated behind `skipIf(!READY)`, so lower blast radius, not exempt. | SEN-04 **AC-7** |
| 3 | **SEN-01 would desync Prisma.** `_prisma_migrations` is in the same `public` schema; truncating it leaves 24 migrations' DDL applied with no record, and the next `migrate deploy` replays non-idempotent DDL and fails. | SEN-01 **AC-2** + **AC-2a** |
| 4 | **`packages/core/package.json`'s `"./controllers"` exports subpath** is published npm surface that retiring the layer strands. Zero consumers, cheap to remove, not safe to ignore. | GMS-01 **AC-6** |

Also accepted: anchor-resolution span drift and anchor uniqueness (SEN-04 **AC-8**, **AC-9**), and
**R-08** — PR-C bundles a 3-4 file controllers move with a 12-file `data → services` cleanup under
one label; Design must split it or justify one PR with the file counts compared.

Nothing was refuted. The needles arithmetic was independently confirmed twice.

## Next steps

1. **T2** — truncate the dedicated DB at gate start in `scripts/check-coverage.ts`. Guard with the
   **existing** `assertDedicatedDatabase()` (`:359-382`), not a second condition. **Exclude
   `_prisma_migrations` by name** and enumerate tables rather than sweeping the `public` schema —
   it lives in the same schema, and emptying it leaves 24 migrations' DDL applied with no record,
   so the next `migrate deploy` replays non-idempotent `ALTER TABLE ADD COLUMN` and fails. Repo
   precedent: `packages/core/src/__tests__/graph-generation-symbol-repository-pg.test.ts`.
2. **T3** — re-measure and lower `architecture-map.test.ts`'s three `300_000` budgets. Prior
   readings 1213 ms fresh / 16.59 s post-gate / >120 s mid-gate. Lowering them is the **only**
   observable evidence T2 worked; leaving `300_000` makes the reset unfalsifiable.
3. T4 → T9 per `tasks.md`. **Budget the wall clock**: `test:coverage` ~15 min per run, T7 is
   2 × ~90 min against a local Ollama. ~3.5 hours of PR-A is waiting, and no task title implies it.
4. `CHANGELOG.md` needs `[Unreleased]` entries or the CI merge gate fails. BEH-01 goes under
   `### Fixed`. Also fix the stale "nine documented exclusions" — the actual count is **11**
   (validation-pr2 gap #2, still open).
5. Close with a fresh `massa-ai-verification-agent` (author ≠ verifier) writing `validation.md`,
   then flip **AD-013** from `proposed` to `active` in STATE.md.
6. Only then write `core-layering-god-module-split/design.md`. AS-01..06 are closed. **AD-012**
   (retire the controllers layer) and **AD-013** (content-anchored needles) sit in STATE.md's
   Decisions table as `proposed … not yet implemented`.
