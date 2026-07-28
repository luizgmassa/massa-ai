# Sensor Repair 2026-07 — Handoff

**Active Feature**: `sensor-repair-2026-07` — Specified 2026-07-28, decisions closed, Tasks not
yet written.
**Base**: `origin/main` @ `a6216cd` (v1.9.0). No branch, no worktree, no commits yet.
**Spec**: `.specs/features/sensor-repair-2026-07/spec.md`
**Downstream**: `.specs/features/core-layering-god-module-split/spec.md` — revised in the same
session, blocked on this feature.

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

The floor is **90% line, per file**, with **11 exclusions**, both as executable data in
`scripts/check-coverage.ts` rather than in prose here — deliberately, because this file is
rewritten every feature and a gate pinned to prose would lose its own definition. (Note
`CHANGELOG.md` still says "nine documented exclusions"; that was validation-pr2 gap #2 and is
still open.)

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

1. Write `.specs/features/sensor-repair-2026-07/tasks.md`. **Budget the wall clock explicitly**:
   `test:coverage` is ~15 min per run, and SEN-04 AC-4's equivalence baseline is two needles runs
   at ~90 min each against a local Ollama. That is ~3 hours in PR-A that no task title implies.
2. Execute PR-A. `CHANGELOG.md` needs `[Unreleased]` entries or the CI merge gate fails; BEH-01
   goes under `### Fixed`.
3. Only then write `core-layering-god-module-split/design.md`. AS-01..06 are closed. **AD-012**
   (retire the controllers layer) and **AD-013** (content-anchored needles) are recorded in
   STATE.md's Decisions table as `proposed … not yet implemented`; flip them to `active` when
   their PRs land.
