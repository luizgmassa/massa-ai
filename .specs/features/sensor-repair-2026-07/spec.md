# Sensor Repair 2026-07 Specification

- **Slug**: `sensor-repair-2026-07`
- **projectId**: `massa-ai`
- **workflowSessionId**: `spec-sensor-repair-2026-07`
- **Workflow**: spec-driven (Specify + Tasks + Execute; Design inline — see "Why Design is inline")
- **Sizing**: Medium. Five carried-forward findings plus one benchmark-harness change. One PR.
- **Status**: Specified. All five decisions closed by the spec owner before Execute.
- **Ships as**: PR-A, the first of the three PRs planned in
  `core-layering-god-module-split`. It must land and release before PR-B.

## Why this exists

`audit-remediation-2026-07` closed with five findings recorded as "carried forward — not
actioned" across `.specs/HANDOFF.md` and `validation-pr2.md`. They were left open because each
needed a decision the executing agent could not make unilaterally, not because they were
low-value.

They are grouped into one feature because they share a single property: **every one of them is a
sensor that the `core-layering-god-module-split` refactor depends on, and every one of them is
currently unreliable.** That refactor is behavior-preserving, which means its only proof is the
test suite, the coverage gate, and the needles retrieval gate. Repairing the instruments before
taking the measurement is the whole point of sequencing this first.

A sixth item was found while specifying this work and is the most severe of the set — see
SEN-04. It was not in the carried-forward list because nobody had looked.

## Problem Statement

| ID | Sensor | What is wrong with it | Evidence |
| --- | --- | --- | --- |
| SEN-01 | `bun run test:coverage` timing | Test budgets track accumulated shared-database state, not the fixture. `architecture-map`'s three `getProjectMap` cases needed `300_000` as an admitted stopgap. | Same command, same file: **1213 ms** fresh, **16.59 s** post-gate, **over 120 s** mid-gate. The isolation runner is strictly sequential, so this is accumulation, not contention. |
| SEN-02 | `bun run test:coverage` reach | Runs only when a human remembers. Not referenced by any CI workflow. | `rg 'test:coverage\|check-coverage' .github/workflows/*.yml` → 0 hits. Only its arithmetic is covered, by `scripts/__tests__/check-coverage.test.ts` under `test:scripts`. |
| SEN-03 | `bun run test` isolation | Tests read the developer's real `~/.config/massa-ai/config.json`, so a machine with a local Ollama makes live network calls inside unit tests. | Measured **42030 ms cold / 690 ms warm** against `bunfig.toml`'s 5 s per-test budget. 75 files under `packages/core/src/__tests__` import `@massa-ai/shared`, whose `config/index.ts` bare-imports `../env.js` and runs `migrateDataDirOnce()`/`loadConfigSafe()` against a `CONFIG_DIR` frozen at first import. CI never sees it — CI has no config file. |
| SEN-04 | `bun run bench:needles:gate` | **The gate is guaranteed to report a false regression the moment code moves between files.** See below. | `benchmarks/needles/run.ts:233-236`; `benchmarks/needles/scorer.ts:94-104`. |
| BEH-01 | `search_memories`'s `includePersistent` | Advertised in the published tool schema, destructured, and never read. The option silently does nothing. | `packages/core/src/controllers/memory-controller.ts:280` (`includePersistent: _includePersistent = true`), advertised at `packages/core/src/tools/search_memories.ts:61`. |

### SEN-04 in full — the needles gate cannot survive a search refactor

This is the finding that reorders the whole programme, so it is stated with its arithmetic.

`benchmarks/needles/scorer.ts:94-104` scores a needle as hit only when a returned result
satisfies **both** `h.filePath === needle.expected.filePath` **and** a line-range intersection
against `expected.lineStart`/`lineEnd` within `dataset.scoring.lineTolerance`. Both halves of that
predicate are pinned to physical file layout.

`benchmarks/needles/run.ts:233-236` handles a needle whose target file is absent like this:

```ts
if (!existsSync(abs)) {
  console.error(`[warn] needle file missing, skipping: ${rel}`);
  continue;
}
```

It does not fail. It does not report a stale fixture. The needle's chunks never enter the corpus,
so the needle can never be retrieved, and it scores zero — **a value indistinguishable from a
genuine retrieval-quality regression**, with a single `[warn]` line as the only clue.

The fixture has **14 needles**. Their targets:

| Target file | Needles |
| --- | --- |
| `packages/core/src/services/search/rlm-fusion.ts` | 3 |
| `packages/core/src/services/search/smart-chunker.ts` | 3 |
| `packages/core/src/data/vector/postgres-vector-store.ts` | 3 |
| `packages/core/src/services/symbol/centrality.ts` | 2 |
| `packages/core/src/services/etl/stages/discover.ts` | 2 |
| `packages/core/src/services/search/rlm-search.ts` | 1 |

**7 of 14 needles (50%) sit in `services/search/`**, and 4 of those in the exact `rlm-*` files
that `core-layering-god-module-split` renames and splits.

If those 7 targets move, the arithmetic is forced:

- best possible `hit@1` = 7/14 = **0.50**, against `NEEDLE_FLOOR_HIT1=0.5`. The comparison is
  `hitAt1 >= floorHit1` (`run.ts:372`), so this passes — on a knife edge, only if retrieval is
  perfect on every surviving needle, and failing on any single additional miss.
- best possible `MRR` = (7 × 1.0 + 7 × 0) / 14 = **0.50**, against `NEEDLE_FLOOR_MRR=0.65`.
  **This fails unconditionally**, no matter how good retrieval is.

The arithmetic was verified against the scorer rather than assumed. `scorer.ts:111` maps over
**every** entry in `dataset.needles`, not only the retrieved ones; `scorer.ts:124` gives an
unfound needle `reciprocalRank: 0`; `scorer.ts:128,135` divide by the full needle count. So a
needle whose target file has moved is not omitted from the average — it is averaged in as a zero.

**The rename is not the only trigger.** `dataset.scoring.lineTolerance` is **5**, and the hit
predicate requires the returned chunk's line range to intersect the expected range within that
tolerance. A span that stays in a file of the same name but moves more than 5 lines also breaks
its needle. The god-module split moves code by far more than 5 lines, so it would break needles
even in files that keep their names — positional pinning, not the filename, is the root defect.

So the gate does not merely risk missing a regression. It is certain to manufacture one. Risk
R-01 in `core-layering-god-module-split/spec.md` — "the needles gate is the only sensor that
would notice" — is inverted: as built, it is the sensor that cannot be read.

Two further facts about this gate, both relevant to how much can be asked of it:

- `.github/workflows/needles-gate.yml` is `workflow_dispatch`-only, `continue-on-error: true`,
  and never blocks a merge. Its own header explains why: qwen3-embedding:8b is ~60 s/embed on a
  2-core runner, roughly 90 minutes for the fixture.
- It therefore runs, in practice, locally and manually against a real Ollama. Any acceptance
  criterion that requires it is a criterion that costs ~90 minutes per observation.

## Why Design is inline

Each requirement below is a single mechanism with its decision already closed by the spec owner,
and none introduces an architectural boundary, a data-model change, or a public contract change.
SEN-04 is the only one with genuine design content, and it is specified concretely in its own
acceptance criteria rather than deferred. Per the workflow's safety valve: if implementing SEN-04
surfaces a real design fork, stop and write `design.md` before continuing.

## Goals

- [ ] Every gate the `core-layering-god-module-split` refactor will be judged by produces a
      number that is a property of the tree, not of the machine, the database's history, or the
      physical location of a function.
- [ ] A stale fixture or a missing measurement fails loudly instead of degrading into a plausible
      wrong number.
- [ ] The one advertised-but-dead option is made true.

## Out of Scope

| Item | Reason |
| --- | --- |
| Any part of the layering or god-module refactor | That is PR-B and PR-C. This PR repairs instruments only; it touches no `services/search/` or `controllers/` source. |
| Raising or lowering the 90% coverage floor, or the needles floors | The floors were never the defect. Changing them here would hide what the repaired sensors are about to reveal. |
| New coverage exclusions in `scripts/check-coverage.ts` | GMS-05 AC-2 in the downstream spec forbids new exclusions. Adding one here would launder that constraint. |
| The `GraphController` / `TracePathTool` duplication found while specifying this work | A real behavior divergence on a published-parity contract. Recorded in `core-layering-god-module-split/spec.md` as a finding; it is not a sensor, and it is not fixed here. |
| Repo-wide reformat | Still its own PR, still not this one. |
| Re-authoring needle *content* (adding needles, changing queries) | Changing what the gate measures at the same time as changing how it measures would make the before/after baseline meaningless. Anchoring is a representation change only; every needle keeps its identical target span. |

---

## Requirements

### SEN-01 — The coverage gate starts from a known database state

**Decision (locked)**: truncate tables at gate start; keep schema and migrations.

`scripts/check-coverage.ts` already hard-refuses to run unless `MASSA_AI_DEDICATED=1` **and**
`DATABASE_URL` matches `/127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/` (`check-coverage.ts:359-382`).
The developer has therefore already designated that database as scratch, which is what makes a
destructive reset acceptable here and nowhere else.

**AC-1**: The gate truncates all data tables in the dedicated database before running any suite,
and the truncation is guarded by the *same* `assertDedicatedDatabase()` check that already gates
the run — not by a second, independently-drifting condition.
**AC-2**: Schema and Prisma migration history survive the reset; the gate does not re-run
migrations. **`_prisma_migrations` is explicitly excluded from the truncation by name.** It lives
in the same `public` schema as every data table, so the obvious implementation — truncate every
table in the schema — silently empties Prisma's applied-migration bookkeeping while leaving all
24 migrations' DDL applied. The next `prisma migrate deploy` would then replay non-idempotent
`ALTER TABLE ADD COLUMN` statements against columns that already exist, and fail. The repo's
existing precedent for this kind of reset is
`packages/core/src/__tests__/graph-generation-symbol-repository-pg.test.ts`
(`TRUNCATE TABLE … CASCADE`); follow it, enumerating tables rather than sweeping the schema.
**AC-2a**: `bunx prisma migrate status` against the dedicated database reports "up to date"
after a gate run. This is the discriminating check for AC-2 — a desynced history reports
otherwise.
**AC-3**: `architecture-map.test.ts`'s three `getProjectMap` budgets are lowered from `300_000`
to a value derived from a **measurement taken after the reset lands**, and the measured number is
recorded in `tasks.md`. Lowering the budget is the discriminating evidence that the reset works;
leaving it at `300_000` would make the change unobservable.

**Divergence, recorded during Execute (T3) — the premise is falsified. The budget does not measure
the reset.** Three full gate runs, with and without truncation:

| Run | Provider init | Whole file | File − provider |
| --- | --- | --- | --- |
| with reset | 3.29 s | 5.23 s | **1.94 s** |
| no reset | 2.80 s | 3.68 s | **0.88 s** |
| with reset | **117.46 s** | **119.47 s** | **2.01 s** |

`architecture-map.test.ts`'s own cost is flat at **0.9–2.0 s** in every run. 100% of the variance is
Ollama reloading an evicted `qwen3-embedding:8b` during embedding-provider auto-selection
(`19:55:05.989` → `19:57:03.447`). Truncation cannot affect it. A `60_000` budget was set from the
measurement and **failed the very next run** at 119.47 s — correctly, but for a reason unrelated to
the database.

The Problem Statement's reasoning — *"the isolation runner is strictly sequential, so this is
accumulation, not contention"* — excludes contention and then **asserts** accumulation. It never
tested the third option, which `CLAUDE.md` already names as the commoner cause of exactly this
symptom: *"the test reached a live LLM or embedding provider… 42030 ms on a cold model load, 690 ms
warm… that is exactly why it looks like flakiness."*

**Rewritten**: the budget is lowered only after `architecture-map.test.ts` is given a deterministic
embedding seam so it stops reaching a live provider — the remedy `CLAUDE.md` prescribes (*"the test
is missing a seam, not a timeout"*). The discriminating evidence for the reset is **not** the
budget; it is `postgres-vector-store.integration.test.ts` going from **8 failures to 6** across the
same gate run when the database starts clean, plus AC-2a's migration check.

**Closed during Execute (T3).** Seam landed as
`mock.module("../data/vector/vector-store-factory.js")`, the idiom already used by
`rlm-admin.test.ts`. Confirmed before building it that all 24 assertions read the symbol graph and
none reads a vector. Whole file went **119.47 s worst → 895 ms** under the developer's real config
with a live Ollama available, with **zero** provider-init log lines. Budget `300_000` → **`30_000`**,
set above the largest undecomposed historical reading (16.59 s) and below the smallest documented
cold-provider load (42030 ms), so removing the seam fails the test instead of merely slowing it.
`test:coverage` ×2 both exit 0; group counts 126 (`--unit`) / 25 / 8 unchanged.
**AC-4**: A test proves the truncation refuses to run against a non-dedicated `DATABASE_URL`.

### SEN-02 — The coverage gate runs in CI

**Decision (locked)**: its own workflow, on the `needles-gate.yml` precedent — not a job inside
`ci.yml`.

**AC-1**: A new `.github/workflows/coverage.yml` runs `bun run test:coverage` against its own
`pgvector/pgvector:pg17` service on port **5433** with database `massa_ai_test`, with
`MASSA_AI_DEDICATED=1` set.

Three details this will fail on if they are guessed rather than read. `assertDedicatedDatabase()`
matches `/127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/` — so the workflow's `DATABASE_URL` must use
the literal **`127.0.0.1`**, not `localhost`, which every other job in `ci.yml` uses
(`ci.yml:13`). The port mapping must be **5433**, not the `5432:5432` the existing services use
(`ci.yml:23,159`). And the database name is `massa_ai_test`, not `massa_ai`. Copy the service
block from `ci.yml:15-23` and change all three.
**AC-2**: It carries no `continue-on-error`. A gate that reports and never enforces is
the exact failure mode this repo already rejected once, when oxlint's 15 firing rules were kept
at `error` rather than downgraded to `warn`.

**AC-2 was necessary and not sufficient, and the gap was found on the PR — see AC-5.** As
originally written this criterion said "It is **blocking** — no `continue-on-error`", which
equates a workflow-file property with a repository setting. Omitting `continue-on-error` only
makes the *check* red. Whether a red check can *stop a merge* is decided by the branch ruleset's
required-status-checks list, which is invisible from the workflow file. T4 satisfied AC-2 in full
and the gate still could not block anything.

**AC-3**: It does not run inside `ci.yml` and therefore does not extend the `workflow_run` chain
that `release.yml` keys off. Releases must continue to fire on CI alone.
**AC-4**: `CLAUDE.md`'s "CI gates" section names the new workflow, and the count of separate
workflows stated there is corrected.
**AC-5** (added during PR close-out): the check context `coverage` appears in the `main` branch
ruleset's `required_status_checks` list. Verify against the live setting, not against the
workflow file:

```bash
gh api repos/luizgmassa/massa-ai/rules/branches/main \
  --jq '[.[] | select(.type=="required_status_checks")
         | .parameters.required_status_checks[].context]'
```

The context string is the **job id** (`coverage`), not the workflow `name:` (`Coverage`).

### SEN-03 — No test run reads the developer's real configuration

**Decision (locked)**: point the shared runner at a scratch `XDG_CONFIG_HOME`, mirroring what
`scripts/check-coverage.ts:402` already does for its own child processes. Not 75 new isolation
groups.

**AC-1**: `scripts/lib/run-tests-isolated.ts` spawns every child with a scratch
`XDG_CONFIG_HOME`; `spawn(..., { env: process.env })` at `run-tests-isolated.ts:240` no longer
passes the ambient value through unchanged.
**AC-2**: An explicit `XDG_CONFIG_HOME` already set by the caller — as `check-coverage.ts` does —
is respected rather than overridden, so the two mechanisms compose instead of fighting.
**AC-3**: `packages/shared` and `apps/opencode-plugin` run plain `bun test` and never reach the
shared runner. Either they get the same protection by a stated second mechanism, or their
exposure is explicitly recorded as accepted with the reason. Silence is not an acceptable outcome
for this criterion.

**Closed during Execute (T1)**, each on measured exposure rather than uniformly:

| Surface | Exposure | Resolution |
| --- | --- | --- |
| `packages/shared` | Its 13 test files were audited in PR2 and drive `CONFIG_DIR` explicitly through the `runIsolated` subprocess harness, so the config-dir path is already covered. The ambient env path was not. | `test` script pins `MASSA_AI_LLM_ENABLED=false`, following the `RUN_E2E=1` precedent in `packages/core`. Safe for `llm-env-prefix.test.ts`, which asserts each var reaches its config field: `childEnv` (`config/__tests__/isolated-config.ts:70-71`) spreads `process.env` and then applies the test's `extraEnv` **last**, so an explicit per-test value still wins over the pin. |
| `apps/opencode-plugin` | **None.** Its only test file is `__tests__/install.test.ts`, which references no config loader, no `XDG_CONFIG_HOME`, no `MASSA_AI_LLM_*` and no `@massa-ai/shared`. | Accepted with reason; no change. Pinning an env var a suite never reads would be ceremony. |
| `packages/core` `test:integration` | Bypasses the runner by design — `bun test src/__tests__/integration/real-api.test.ts` is the opt-in live-API gate and *wants* a real provider. | Accepted; pinning it would defeat the suite's purpose. Never part of the default aggregate. |
| `packages/core` `test:watch` | Bypasses the runner. Developer convenience only, never a gate. | Accepted with reason. |
**AC-4**: `apps/mcp-client`'s `embedded-api-client-endpoints.test.ts` — the one visibly failing
instance, on `/search/project` and `/search/code` — passes under a plain `bun run test`, repeated
3 times consecutively. Validation-pr2 established it is *flaky*, not deterministically red
(95/0 then 92/3 at the base commit), so a single green run proves nothing.
**AC-5**: Core's isolated-group count stays exactly **126 in `--unit` mode**, tools-api **25**,
mcp-client **8**. That invariant is T20's and this work must not disturb it.

**Divergence, recorded during Execute (T1).** This criterion originally said "core **126**" with no
mode, and that omission is a trap the author walked into. Core's runner reports **two** different
counts and both are correct:

| Mode | Discovery line | Groups |
| --- | --- | --- |
| `--unit` | `224 files: 99 pure/shared, 125 stateful/isolated` | **126** |
| default (unit + e2e, 19 extra e2e files) | `245 files: 113 pure/shared, 132 stateful/isolated` | **133** |

`126` is the `--unit` figure — it is what `validation-pr2.md` measured and what T20 pinned, and it
reproduces byte-identically at `a6216cd`. A default-mode run reports 133, which looks like a
regression against an unqualified "126" and is not one. Confirmed by measuring the default mode on
a **stashed, unmodified tree** and getting the identical 245/113/132, so the count is a property of
the checkout and not of this change. **Always state the mode with the number.**
**AC-6**: **`XDG_CONFIG_HOME` is not the only leak path, and the fix must close the other one or
this requirement's own title is false.** `packages/shared/src/env.ts:33-34` dotenv-loads the
nearest `.env` by walking up from `cwd`, entirely independently of `XDG_CONFIG_HOME`, and
`packages/shared/src/config/index.ts:575` resolves
`envBool("MASSA_AI_LLM_ENABLED", fileConfig.llm?.enabled ?? false)` — **env wins over
`config.json`**. So a developer whose repo-root `.env` sets `MASSA_AI_LLM_ENABLED=true` leaks the
live-provider path straight through a scratch config dir, which is never consulted because the
env var already decided. This checkout has no `.env` today, so the leak is **latent here, not
active** — which is exactly why it would be found the hard way later. The runner therefore also
neutralizes the `MASSA_AI_LLM_*` keys in the child environment by default, and a suite that
genuinely needs them opts in explicitly. Verified by: set `MASSA_AI_LLM_ENABLED=true` in a
throwaway repo-root `.env`, run a test under the patched runner, assert the LLM branch stays off.

**Divergence, recorded during Execute (T1) — this criterion as first written would have produced
the bug it exists to prevent.** It said the `MASSA_AI_LLM_*` keys must be **absent** from the child
environment. Absent is precisely the state `.env` refills. `packages/shared/src/env.ts` walks up
from cwd, finds the repo-root `.env`, and calls `dotenvConfig`, which does not override an
existing key but *does* set a missing one — so deleting the gate hands the child back the value
that was just deleted. An explicitly assigned value outranks it and survives.

Measured through the real runner, with a repo-root `.env` setting `MASSA_AI_LLM_ENABLED=true` and
a probe importing `@massa-ai/shared` so `env.ts` actually executes:

| Child env construction | Child observes |
| --- | --- |
| delete the key (the literal reading of this AC) | `MASSA_AI_LLM_ENABLED="true"` — **leak open** |
| assign `"false"` | `MASSA_AI_LLM_ENABLED="false"` — leak closed |

A probe that imports nothing observes `undefined` under both and proves nothing: Bun's automatic
`.env` load reads cwd, which is the package root, not the repo root, so the leak only appears once
something pulls in `@massa-ai/shared`. **The corrected criterion: the gate
`MASSA_AI_LLM_ENABLED` is pinned to `"false"`, not deleted.** The other nine knobs stay deleted —
they are inert once the gate is off, and assigning them empty strings would be a worse lie than
their absence.

### SEN-04 — A needle survives code movement, and a stale fixture fails loudly

**Decision (locked)**: content-anchor the fixture, as sensor repair, before any refactor commit.

**AC-1**: A needle's expected target is identified by **content**, not by physical position. The
fixture carries an anchor for each needle that is resolved to a concrete
`filePath`/`lineStart`/`lineEnd` at run time.
**AC-2**: **An unresolvable or ambiguous anchor is a hard failure.** The
`[warn] … skipping` path at `run.ts:233-236` is replaced: zero matches or two-or-more matches
exits non-zero with the needle id and the anchor, and never proceeds to scoring. This is the
core of the requirement — the silent-skip is what made the gate untrustworthy, more than the
positional pinning did.

**Divergence, recorded during Execute (T7 pre-baseline) — this criterion targets the wrong branch.**
`run.ts:233-236` is guarded by `existsSync(abs)`. The three needles actually failing today target
`smart-chunker.ts`, which **exists** — so the branch never runs, no `[warn]` is printed, and the
needle scores zero through `scorer.ts:94-104` against a span with no chunk behind it. There are
three paths, and the criterion as written covers only the first:

| Path | Firing today | Signal | Covered as written |
| --- | --- | --- | --- |
| Target file absent | no | `[warn]`, skip | yes |
| Target file present, span past EOF | **yes, ×3** | **none at all** | **no** |
| Target present, span in range, content moved | not currently | none | partly (AC-3) |

Path 2 is quieter than the one the criterion calls "the core of the requirement". **Implementing
this AC exactly as written would not have caught the defect that is actually firing.**

**Extended**: a resolved span falling outside the target file's line count is also a hard failure,
named with the needle id, file, resolved span and file length. Discriminating check: point a needle
past EOF and assert non-zero exit — today that yields a passing run with a silently wrong number.
**AC-3**: Anchor resolution tolerates the three transformations this refactor actually performs:
moving a span verbatim to a different file, renaming the file it lives in, and **moving a span
more than `lineTolerance` (5) lines within a file of the same name** — the last is the one the
original framing missed, and it means the split breaks needles even where no file is renamed. It
is **not** required to tolerate reformatting, because the repo-wide reformat is a separate PR and
is explicitly out of scope for both this feature and the refactor.
**AC-4**: **Equivalence baseline.** The gate is run once before the anchoring change and once
after, on an unchanged tree, and the two runs produce identical per-needle ranks. A
representation change that moves a score is not a representation change. Both runs' outputs are
recorded in `tasks.md`. This is the single most important piece of evidence in this PR — without
it, the repaired sensor's own calibration is unproven.
**AC-5**: A test proves the loud-failure path: a fixture with a deliberately unresolvable anchor
exits non-zero. It must not require an embedding provider to run, so it exercises resolution, not
retrieval.
**AC-6**: All 14 needles keep their identical target span. No needle is added, removed, retargeted
or re-queried in this PR.

**Divergence, recorded during Execute (T7 pre-baseline) — unsatisfiable as written; see
`design.md`.** Three of the fourteen have no valid span to keep. `smart-chunker.ts` was split into
`services/search/chunker/` at `56c84d1` (945 lines → 81); the fixture was authored at `af3dab6`,
the commit before. N07, N08 and N09 target lines **642-674, 737-744 and 198-206** of a file that
now ends at **81**. The transformation SEN-04 predicts has already happened, to this exact file,
and the gate has been failing since.

**Rewritten**: the **11** needles whose targets resolve within their current files keep
byte-identical spans, and no needle is added, removed or **re-queried**. N07/N08/N09 are
re-targeted once, to the location their original content now occupies, **recovered from `af3dab6`
rather than re-authored against current code**. Recovery is recorded needle-by-needle with the
source commit and the pre-split span.
**AC-7**: **The fixture has three consumers, not two.**
`packages/core/src/__tests__/e2e/14.needles.test.ts:119-133` replicates `intersects` and
`findRank` **verbatim** — same `filePath` equality plus line-intersection predicate — reading
`expected.filePath`/`lineStart`/`lineEnd` straight from the same fixture JSON. It is in scope for
this requirement. Leaving it out would repair two copies of the sensor and leave a third
positionally pinned, so PR-B would break it invisibly: with the 7 `services/search/` targets
moved, its `hit@5` is capped at 7/14 = 0.50 against its own **0.64** floor (`:302`). It is gated
behind `describe.skipIf(!READY)` (`:236` — `RUN_E2E` plus a live API and Ollama), which lowers
the blast radius but does not make it exempt.
**AC-8**: Anchor resolution is **deterministic in the span it produces**, not merely in the file
it finds. Resolving the unchanged tree at `a6216cd` must reproduce each needle's existing
`lineStart`/`lineEnd` exactly; a resolver that derives the span from where the matched text
happens to sit can drift a few lines, and with `lineTolerance` at 5 that drift alone can flip a
borderline chunk from hit to miss. Diffing resolved spans against the current static values on an
unchanged tree is the check, and a non-zero diff falsifies "representation-only" before AC-4's
expensive end-to-end run is even attempted.

**Divergence, recorded during Execute (T7 pre-baseline).** Unsatisfiable for N07/N08/N09 — their
existing values are stale, so there is nothing valid to reproduce. **Rewritten**: resolution
reproduces the existing `lineStart`/`lineEnd` exactly for the **11 valid needles**, and a non-zero
diff on any of them falsifies "representation-only". For the three recovered needles the recorded
spans *are* the resolved ones; the check there is AC-9 uniqueness plus in-range-ness.

Two further findings, both in `design.md`. The Wave 6 split **stripped comments while moving code**,
so it is none of AC-3's three tolerated transformations — anchors must be authored on code, never
comments, and a span cannot be carried forward as a line-count delta. And anchors must match as
**substrings**: `netBraceDelta` gained an `export ` prefix, which a whole-line match would miss.
**AC-9**: Anchors are unique. Because AC-2 makes ambiguity a hard failure and resolution searches
beyond the declared target file, an anchor short enough to match elsewhere — a bare magic number,
say — fails the run for a reason unrelated to the refactor. Each anchor is verified to resolve to
exactly one location repo-wide at authoring time.

### BEH-01 — `includePersistent` does what the schema says

**Decision (locked)**: implement the option.

This is the one behavior change in the programme, and it is deliberately isolated here so that
neither PR-B nor PR-C — both behavior-preserving — carries one.

**Divergence — PR-A carries four behavior changes, not one.** Recorded rather than quietly
broken, and updated twice as the count grew. The isolation's actual purpose survives throughout:
PR-B and PR-C still carry none.

| Change | Where | Who is affected |
| --- | --- | --- |
| BEH-01 — `includePersistent` honoured | this requirement | callers passing `false`, who silently received persistent memories |
| T6a — indexer accepts same-name/different-kind declarations | `design.md`, Fourth fork | anyone whose repo contains such a file; today their index aborts entirely |
| T6b — `security.allowedExtensions` honoured | `design.md`, Fifth fork | only installs that **set** the key, which until now did nothing |
| T6c — `capturePolicy` honoured | `design.md`, Fifth fork | only installs that **set** the block, which until now did nothing |

T6d (the one-extension glob) is not listed as a behavior change: it is reachable only through
T6b, and the behavior it replaces was "match zero files".

The last three share a property BEH-01 and T6a do not — **no existing install can have depended
on the broken behavior, because the broken behavior was "your configuration is ignored".** An
install that never set the key sees byte-identical discovery, pinned by a default-parity test in
each case. That is why they were judged safe to land inside a sensor-repair PR.

**Divergence — "persistent" is defined, and the handoff's premise that it is not was wrong.** The
carried-forward note into this task said there is no `persistent` field on a memory. There is no
such *column*, but `MemoryLevel.PERSISTENT = 0` (`packages/shared/src/types/index.ts:19-25`) is a
first-class level, assigned by `memory-service.determineLevel` (`:91`, `:115`) to orchestrator
decisions and criticals, and written by `bootstrap-service` (`:656`). Measured distribution on the
developer database: **L0 2 · L1 32 · L2 304 · L3 138 · L4 23**.

**Decision — `includePersistent: false` excludes L0.** Taken by the spec owner against two
alternatives. The session-based reading ("memories from other sessions", per the schema string) was
rejected on measurement: `fullTextSearch` already hard-filters `session_id = sessionId`, so `false`
is *already* today's behavior under that reading and it is the `true` **default** that is unhonoured
— honouring it would widen the result set for every caller, contradicting AC-4, which scopes the
change to callers passing `false`. It is also nearly vacuous here: only **2 of 499** rows carry a
`session_id` at all. The level-based reading is well-defined whether or not a `sessionId` is passed,
which closes the open question without inventing meaning for it.

**Scope note**: `MemoryRepositoryPg.search(SearchFilters)` declared `includePersistent` as a
*required* field and ignored it too — the same unmet promise in a second method. Honoured there as
well. That method has no production callers (tests only), so this changes no live behavior; leaving
it would have left the contract type false.

**AC-1**: `MemoryController.searchMemories` honours `includePersistent`; passing `false` excludes
persistent memories from the result set.
**AC-2**: A test fails against the current `_includePersistent` code and passes after the change.
An assertion that cannot distinguish the two states does not satisfy this criterion.
**AC-3**: The published MCP tool schema at `tools/search_memories.ts:61` is **unchanged**. This
requirement makes the existing advertisement true; it does not alter the advertisement.
**AC-4**: `CHANGELOG.md` records it under `### Fixed`, since callers who set `false` today
silently receive persistent results and will see a result-set change.

---

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-01 | SEN-01's truncation runs against a developer's real database | It is gated by the *existing* `assertDedicatedDatabase()`, which requires both `MASSA_AI_DEDICATED=1` and the exact `127.0.0.1:5433/massa_ai_test` URL. AC-4 pins the refusal with a test. Reusing that one check rather than writing a second is the mitigation — two conditions drift apart, one cannot. |
| R-02 | SEN-04's anchoring silently changes what the gate measures | AC-4's before/after equivalence run on an unchanged tree is the whole defence, and it is why AC-6 forbids touching needle content in the same PR. |
| R-03 | SEN-02's blocking workflow makes CI flaky on a DB-heavy 15-minute run | It is a separate workflow, so a flake blocks a merge without blocking the release chain or the other jobs. If it proves unstable the correct response is to fix the instability, not to add `continue-on-error` — that would recreate the defect SEN-02 exists to close. |
| R-04 | SEN-03's scratch config dir hides a genuine config-dependent regression | The suites that legitimately test config behavior already drive `CONFIG_DIR` explicitly through the `runIsolated` subprocess harness (`packages/shared/src/config/__tests__/api-key.test.ts`, 18 call sites) and are unaffected by an ambient default. AC-2 keeps an explicit caller-set value winning. |
| R-05 | The needles baseline (AC-4) needs ~90 min per observation and a real Ollama | Real cost, accepted. It is two runs, once, and it is what makes every later needles observation in PR-B interpretable. Budget it explicitly rather than discovering it mid-Execute. |

---

## Evidence

Measured at `a6216cd` (v1.9.0, `main`) unless noted. Every number was read from current source.

| Claim | How it was measured |
| --- | --- |
| `test:coverage` absent from CI | `rg 'test:coverage\|check-coverage' .github/workflows/*.yml` → 0 hits |
| `check-coverage.ts` already sets a scratch `XDG_CONFIG_HOME` | `check-coverage.ts:402` |
| dedicated-DB refusal regex | `check-coverage.ts:359-382` |
| shared runner passes ambient env through | `scripts/lib/run-tests-isolated.ts:240` (`env: process.env`) |
| `architecture-map` budgets at `300_000` | `packages/core/src/__tests__/architecture-map.test.ts:583,601,618` |
| `_includePersistent` unread | `packages/core/src/controllers/memory-controller.ts:280`; advertised `tools/search_memories.ts:61` |
| needles silent-skip | `benchmarks/needles/run.ts:233-236` |
| needles hit predicate is filePath + line intersection | `benchmarks/needles/scorer.ts:94-104` |
| 14 needles; 7 in `services/search/`; per-file counts | parsed `benchmarks/needles/fixtures/massa-ai.json` |
| needles floors | `package.json:27` (`NEEDLE_FLOOR_HIT1=0.5 NEEDLE_FLOOR_MRR=0.65`) |
| needles workflow is dispatch-only and non-blocking | `.github/workflows/needles-gate.yml` header and `continue-on-error: true` |
| live-provider cost 42030 ms cold / 690 ms warm | `audit-remediation-2026-07` PR2 divergence 16 |
| `architecture-map` 1213 ms / 16.59 s / >120 s | `audit-remediation-2026-07` PR2 divergence 17 |
| group counts 126 / 25 / 8 | `validation-pr2.md`, independently reproduced there |
