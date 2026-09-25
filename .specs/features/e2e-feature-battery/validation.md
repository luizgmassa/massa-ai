# E2E Feature Battery — Validation

Scope: **Phases 0, 1, 1b and 2.** Phase 3 (Tier C) and Tier D's credentialed group are
deferred and are not validated here.

Author ≠ verifier. Every figure below was re-derived by an agent that authored none of the
code it measures; no figure is copied from a commit message, a comment, or `COVERAGE.md`.
This supplies the independent gate T5.0 records as missing for Phases 1 and 1b.

## Verdict

**FAIL.** Phase 1 and Phase 1b are sound — all ten Tier-A cells reproduce, all three product
fixes are real and kill independent mutations. Phase 2's own deliverables pass. But three
regressions introduced on this branch are red, and two of them redden `ci.yml`'s first gate:

| id | severity | what |
| --- | --- | --- |
| **F1** | blocker | `72c13ad1` breaks `/api/v1/model-registry/regenerate-stream` and `/regenerate-and-install-stream` **at runtime**, not only in tests |
| **F2** | blocker | `72c13ad1` breaks `generated-bundles-contract.test.ts` UGB-17 |
| **F3** | blocker | four of this feature's own `MASSA_AI_E2E_*` vars are unlisted in `turbo.json` `passThroughEnv` (AD-010) |
| F4 | medium | a declared skip and a KNOWN RED block in `26.scheduler.test.ts` are falsified by this session's own `a83e4f5d` |
| F5 | low | `test:scripts`'s `&&` means one bun-side failure silently skips all 38 shell suites |
| F6 | info | 5 shell suites fail identically on `main`; not this branch's |

## Measured state, and the concurrency the brief predicted

| Item | Value |
| --- | --- |
| Worktree | `/Users/luizmassa/Projects/massa-ai-wt-e2e-battery`, branch `test/e2e-feature-battery` |
| HEAD at start | `0f0507a9` |
| HEAD at end | `9dcf4702` |
| Code under test across that move | **unchanged** — `git diff --name-only 0f0507a9 9dcf4702` = `CHANGELOG.md`, `packages/core/src/__tests__/e2e/COVERAGE.md`. Both documentation. |
| Working tree | `M .gitignore`, `M .specs/lessons.json` (both the user's, untouched), `M .specs/project/FEATURES.json` (parent, in flight) |
| Stack | started from **this** worktree — API process cwd read from `lsof`: `…/massa-ai-wt-e2e-battery/apps/tools-api` |
| Fixture | `/tmp/massa-ai-e2e-fixture` @ `788facbd87a568e4e3354cb541ef0d019fa5aaaf`, clean tree |
| Primary checkout | `main` @ `d32fce58`, clean but for untracked `.ralphy/` — used only for `main` baselines |
| Host 1-min load | between **1.86 and 3.24** for every Tier-A cell, recorded per run; the spec's ceiling is 6 |

No `git checkout`, `git stash`, `git restore` or `git clean` was run at any point. Every
mutation below was reverted by `cp` from a scratch copy, and `git diff` on the mutated path
was confirmed empty afterwards.

One stack mutation was observed and chased down rather than assumed: `state.env` changed to
`profile=default` at 14:40:24, the exact second the `llm-on` run ended. Cause is
`30.llm-features.test.ts`'s own `afterAll` (`:423-436`), which deliberately restores
`default` so later files do not silently exercise LLM paths. Not a foreign session.

## Phase 1 — the Tier-A profile matrix

One file per `bun test` invocation, `--max-concurrency 1`, stack brought up by
`bash scripts/e2e-stack.sh up --profile <p>` and the environment taken from
`eval "$(bash scripts/e2e-stack.sh env)"`.

**Gate vector, common to every row** (AC-07): `RUN_E2E=1`, `MASSA_AI_DEDICATED=1`,
`MASSA_AI_E2E_PROJECT_PATH=/tmp/massa-ai-e2e-fixture`, `MASSA_AI_API_URL=http://127.0.0.1:3334`,
`DATABASE_URL=…127.0.0.1:5433/massa_ai_test`, `XDG_CONFIG_HOME=/tmp/massa-ai-e2e-stack/config`,
`OLLAMA_BASE_URL=http://127.0.0.1:11435`, `EMBEDDING_PROVIDER=ollama`,
`OLLAMA_EMBEDDING_MODEL=qwen3-embedding:4b`, `OLLAMA_EMBEDDING_DIMENSIONS=2560`, plus the
per-row profile, which was read back from `/tmp/massa-ai-e2e-stack/state.env` **at run time**
and is quoted below rather than assumed from the `up` command.

| profile | file | before | **after** | state.env | load 1m | dur | exit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| default | `25.observability` | 17/0/0 | 17/0/0 | default | 2.52 | 8 s | 0 |
| default | `28.hooks-handoffs-proposals` | 17/0/5 | 17/0/5 | default | 2.87 | 20 s | 0 |
| default | `29.audit-repairs` | 14/1/0 | **15/0/0** | default | 2.91 | 12 s | 0 |
| default | `10.synapse` | 26/0/1 | 26/0/1 | default | 2.68 | 2 s | 0 |
| default | `11.lifecycle` | 21/0/2 | 21/0/2 | default | 2.87 | 121 s | 0 |
| scheduler-on | `26.scheduler` | 8/1/6 | **9/0/6** | scheduler-on | 3.24 | 14 s | 0 |
| scheduler-fast | `26.scheduler` | 7/1/7 | **8/0/7** | scheduler-fast | 2.44 | 34 s | 0 |
| auth | `27.auth-config-cache` | 34/0/0 | 34/0/0 | auth | 2.45 | 5 s | 0 |
| hooks-off | `28.hooks-handoffs-proposals` | 16/0/6 | 16/0/6 | hooks-off | 2.44 | 22 s | 0 |
| llm-on (+`RUN_E2E_LLM=1`) | `30.llm-features` | 9/0/0 | 9/0/0 | llm-on | 1.86 | 85 s | 0 |

Triples are pass/fail/skip. "before" is the pre-fix baseline recorded earlier in this
feature; "after" is this session's measurement.

**The skip population is unchanged in every one of the ten cells.** That is what makes the
three flips attributable: a fix that converted a failure into a skip would show here as a
moved skip count, and none moved. The two scheduler cells were additionally checked for skip
*identity*, not just count — both print exactly one `[EB-SCH-4:PARTIAL]` declaration and no
other declared-skip marker, before and after.

Each flip lands in the only profile where its scenario executes, confirmed from source
rather than assumed: `26.scheduler.test.ts:796` is `describe.skipIf(!SCHEDULER_FAST)`
(EB-SCH-3b) and `:898` is `describe.skipIf(!RESTART_READY)` (EB-SCH-6), and
`SCHEDULER_FAST`/`RESTART_READY` are derived from `readStackState().profile` at `:278-307`.

## Phase 1b — the three product fixes, verified adversarially

Each fix carries a deterministic sensor that runs with **no live stack**. For each I injected
a behaviour-level fault into scratch state, confirmed the sensor kills it, and restored by
file copy. The commit messages quote their own mutation figures; mine were derived
independently and are compared below.

### Controls (unmutated)

| sensor | result |
| --- | --- |
| `apps/tools-api/src/routes/dashboard.test.ts` | 5 pass / 0 fail |
| `apps/tools-api/src/routes/workspace.test.ts` | 48 pass / 0 fail |
| `packages/core/src/__tests__/list-projects-tool.test.ts` | 8 pass / 0 fail |
| `apps/tools-api/src/__tests__/scheduler-boot-order.test.ts` | 3 pass / 0 fail |
| `packages/core/src/__tests__/scheduler-boot-hydration.test.ts` | 4 pass / 0 fail |

### Mutations

| defect | mutation injected | my result | commit claims | verdict |
| --- | --- | --- | --- | --- |
| EB-SCH-3b | `dashboard.ts` returns the four fields as `null`/`0` literals again | **3 pass / 2 fail** | 3 / 2 | killed, matches |
| EB-MCP-3 | `workspace.ts` strips `status` from the passthrough (`handle({})`) | **47 pass / 1 fail** | 47 / 1 | killed, matches |
| EB-MCP-3 | `workspace.ts` deletes the `instanceof ToolError` branch | **47 pass / 1 fail** | 47 / 1 | killed, matches |
| EB-SCH-6 | `apps/tools-api/src/index.ts` moves `await scheduler.ready()` **after** `registerDefaultJobs` | **2 pass / 1 fail** | 2 / 1 | killed, matches |

Every restored file re-measured green and produced an empty `git diff`.

The EB-SCH-6 mutation is the load-bearing one and reproduces the property the commit claims:
both strings remain present and only their order changes, so a sensor that merely greps for
the two calls would stay green. It goes red.

### The `dashboard.test.ts` vacuity suspicion is resolved — the replacement is not vacuous

The old case asserted `lastSuccessAt: null, consecutiveFailures: 0` against a stub carrying
neither field, so it passed only because the route hardcoded them. The replacement cannot
pass that way: a full literal revert of `dashboard.ts:44-47` kills it at 3 pass / 2 fail,
measured above. The mechanism is a second stub job — `failing` — carrying
`lastSuccessAt: null, lastFailureAt: 9, consecutiveFailures: 5, lastError: "handler threw"`,
so every one of the four fields has at least one non-default counterpart that a literal
cannot reproduce, plus an explicit
`expect(failing.consecutiveFailures).not.toBe(healthy.consecutiveFailures)`.

Individually, several stub values are still `null`/`0` and cannot discriminate on their own
(the `healthy` job's `lastFailureAt`/`consecutiveFailures`/`lastError`, and `failing`'s
`lastSuccessAt`). The suite discriminates as a whole, not case by case.

`Scheduler.status()` was read directly and does project all four from the persisted record
(`scheduler.ts:553-556`, sourced from the `fireJob` finally block at `:489-499` and persisted
at `:505`). Its own sensor, `packages/core/src/__tests__/scheduler-status-projection.test.ts`,
guards the snapshot; `dashboard.test.ts` guards the route. Both are needed — the core sensor
stays green if only the route reverts.

## Phase 2 — Tier B

| deliverable | measured |
| --- | --- |
| `scripts/__tests__/harness-e2e.test.ts` + `scripts/__tests__/verify-harness-install-detection.test.ts` | **18 pass / 0 fail**, 3.49 s |
| `scripts/tests/test-root-install-live-exec.sh` | **pass** (run directly; see F5 for why the aggregate never reached it) |

**AC-08 holds.** `harness-e2e.test.ts:17-26` explicitly states which strategy it uses, and
names both: it SEEDS the four config directories (the
`test-install-harness-cli.sh:62-65` strategy) for the positive cases, and scrubs `PATH` (the
`test-plugin-auto-install.sh:6-9` strategy) for the negative case. It does both in code —
`scratchHome({ seedConfigDirs: true })` at `:117`, `scrubbedPath()` at `:92-95`. The
assertions cannot invert between this machine and CI because every case constructs its own
scratch `HOME`/`PATH` and asserts against what it constructed: `EB-HB-1..7` assert
per-host `detected === true` after seeding all four dirs, and `EB-HB-8` (`:197-221`) asserts
zero detected from an unseeded home plus a scrubbed `PATH`. No assertion reads the ambient
host count.

`scripts/verify-harness-install.ts` gained the `detected` field (`:52`, `:56`), computed by
`detectHost` (`:99-110`) from the same rule the installer uses — config dir under `--home`,
else a host binary on `PATH`. It is orthogonal to `status`, so an absent host
(`detected:false, status:"missing"`) is now distinguishable from a broken install
(`detected:true, status:"missing"`). The row count is still fixed at 24 (4 hosts × 6
artifacts), independently asserted at `verify-harness-install-detection.test.ts:72`. That
file is the oracle's first test and carries 5 cases.

### The dropped pty coverage was dropped for a TRUE reason

`test-root-install-live-exec.sh:231-261` records why the three unseamed `/dev/tty` reads
ship without pty coverage. The claim was checked at source rather than accepted:

```
install.sh:663    read -rp "  Choice [s]: " _post_choice <>/dev/tty
install.sh:664    case "${_post_choice:-s}" in
install.sh:681      s|S|"") return ;;
```

An empty read and a typed `s` both reach `return`, so an oracle asserting "answered `s` →
returned cleanly" cannot discriminate. The conclusion is TRUE, and it generalises to all
three reads, not just the one quoted: `:709`/`:715` and `:750`/`:794` use a byte-identical
`${VAR:-s}` + `s|S|"") return ;;` idiom. `install.sh` has 6 `/dev/tty` reads in total,
matching the suite's own `TTY_COUNT=6`.

One correction to the recorded text, which does not change its conclusion: it attributes the
convergence to the `""` alternative in the `case` pattern. That alternative is unreachable at
these three call sites, because `${_post_choice:-s}` has already rewritten an empty value to
the literal `s` before `case` runs. The convergence is real; the stated mechanism is
imprecise.

## Repo-wide gates

| gate | result |
| --- | --- |
| `npx turbo run type-check --force` | **6 successful / 6 total, 0 cached**, exit 0 |
| `bun run lint` (oxlint) | clean, exit 0 |
| `bun scripts/check-core-layering.ts` | **PASS — 0 violations across 998 tier-to-tier edges in 1100 tracked files**, exit 0 |
| `bun run generate:artifacts --check` (scratch `XDG_CONFIG_HOME`) | exit 0, **both** markers present, **0** write-mode `Emitted` lines |
| `bun run test --force --continue` | **exit 1** — `Tasks: 11 successful, 12 total`, `Cached: 0 cached, 12 total`, 1m17.105s |
| `bun run test:plugins` | **142 pass / 0 fail**, 10 files, 109.62 s, exit 0 |
| `bun run test:scripts` | **exit 1** — 1847 pass / 4 fail across 84 files; 0 of 38 shell suites reached |
| 38 shell suites, run individually | 33 pass / 5 fail (all 5 also fail on `main`) |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts e2e-feature-battery --root .` | **exit 1**, 2 errors |

`DATABASE_URL` was exported from `~/Projects/massa-ai/.env` for every non-E2E run rather than
copied into the worktree, so only one definition was ever in play. `MASSA_AI_EXECUTOR_SANDBOX=none`
was set for the aggregate, matching `ci.yml`.

### `generate:artifacts --check` now reaches both generators (`72c13ad1`, the good half)

Verified in the state it ships in, under a scratch `XDG_CONFIG_HOME` so a local profile
overlay could not manufacture drift:

```
No drift: generated skill bundles match checked-in files.
No drift: generated files match checked-in files.
```

One occurrence of each marker, zero `Emitted` lines, exit 0. Under the old `&&` form the flag
reached only the second generator and the skill half ran in write mode. That defect is closed.

### `check_specs_delivered` — exit 1, both errors external

All 7 required paths exist. The two errors are `M .specs/lessons.json` (the user's, declared
out of scope by `spec.md`) and `M .specs/project/FEATURES.json` (the parent agent's, in
flight at measurement time). Neither is a missing artifact. **This gate cannot go green until
the parent commits `.specs/`, and `.specs/lessons.json` will keep it red for as long as that
file stays uncommitted.**

## The blocking findings

### F1 — `72c13ad1` breaks two live endpoints, not just tests

`apps/tools-api/src/routes/model-registry-stream.ts` derives the generator list **at request
time** by parsing `package.json`:

- `deriveGeneratorScripts` (`:130`) splits `scripts["generate:artifacts"]` on `&&`.
- `assertGeneratorBackstop` (`:153-162`) then requires at least 2 segments **and** that the
  names include both `generate-skill-artifacts.ts` and `generate-subagent-artifacts.ts`.

`72c13ad1` changed that script from the two-command `&&` chain to
`bun scripts/generate-artifacts.ts`. The derivation now yields `["generate-artifacts.ts"]`,
and the backstop throws on every request:

```
could not derive the generator list: generator list ["generate-artifacts.ts"] does not
contain the known generators generate-skill-artifacts.ts, generate-subagent-artifacts.ts
— refusing to spawn an implausibly short list
```

`/api/v1/model-registry/regenerate-stream` and `/api/v1/model-registry/regenerate-and-install-stream`
therefore refuse to spawn anything. This is a runtime break in the Admin Portal, not a test
artifact.

Attribution is decisive, by reverse mutation on `package.json` alone, restored by file copy:

| `scripts["generate:artifacts"]` | `model-registry-stream.test.ts` |
| --- | --- |
| pre-`72c13ad1` `&&` chain | **32 pass / 0 fail** |
| HEAD | **10 pass / 22 fail** |

That is the whole of `@massa-ai/tools-api#test`'s failure and the whole of the aggregate's
`11 successful, 12 total`. `bun run test` is `ci.yml`'s first gate, so this fails CI.

The irony is load-bearing: that backstop's own docblock says it exists to catch "a
`generate:artifacts` edit that lost a segment". It worked. `72c13ad1`'s commit message
enumerates its exposed callers as `CLAUDE.md:403`/`:496` and `README.md:195/214/222` — all
documentation. It never enumerated the code consumer.

### F2 — the same commit breaks a second guard

`scripts/__tests__/generated-bundles-contract.test.ts:36` (UGB-17, "generate:artifacts runs
both generators") asserts `scripts["generate:artifacts"]` contains
`generate-skill-artifacts.ts`. It receives `bun scripts/generate-artifacts.ts` and fails.
Measured on the primary checkout at `main` @ `d32fce58`: **1 pass / 0 fail**. So it is this
branch's.

### F3 — four of this feature's own env vars violate AD-010

`scripts/__tests__/turbo-passthrough-env.test.ts` fails here and passes on `main` (3 pass /
0 fail). The missing names are all this feature's:

```
MASSA_AI_E2E_LLM_MODEL, MASSA_AI_E2E_SCHED_INTERVAL_MS,
MASSA_AI_E2E_SCHED_TICK_MS, MASSA_AI_E2E_STATE_DIR
```

They are read via literal `process.env` accessors but are absent from `turbo.json`
`tasks.test.passThroughEnv`. Under `bun run test` they arrive `undefined` while working fine
under a direct `bun test`. `FR-04` already lists `turbo.json` `passThroughEnv` as a Phase-0
repair surface; the Phase-1 profiles added new knobs without extending it.

### F4 — a declared skip and a KNOWN RED block that `a83e4f5d` falsified

`26.scheduler.test.ts:399-404` prints, unconditionally, that the EB-SCH-4 missed-job branch
cannot be asserted because "every job's `nextRunAt` is recomputed from `now` on every boot …
so a past-due job cannot exist at boot by construction."

That is no longer true, and the commit that made it untrue is in this session. Read at source:

- `apps/tools-api/src/index.ts:296-297` — `await scheduler.ready();` now precedes
  `registerDefaultJobs(scheduler);`.
- `packages/core/src/services/scheduler/scheduler.ts:216-222` — with the mirror hydrated,
  `existing` is the real persisted row and `full.nextRunAt = existing.nextRunAt` preserves it,
  with a comment stating explicitly that past-due values are kept so `catchUpMissedJobs()`
  can identify missed jobs.
- `scheduler.ts:352-356` — `catchUpMissedJobs` fires when `overdueMs > tickIntervalMs`.

So a past-due job *can* now exist at boot. The `KNOWN RED` block at `:1004-1023` is the same
problem in a sharper form: it sits above an assertion that now **passes**, and still narrates
the defect as live ("left failing … it is telling the truth").

`git log a83e4f5d..HEAD -- packages/core/src/__tests__/e2e/26.scheduler.test.ts` is empty —
neither the fix commit nor any commit after it revisited this text.

This bears on **AC-05**: the skip is declared and reasoned, but the reason is false, which is
a worse failure mode than a silent pass because it asserts a product defect that no longer
exists. It does **not** violate AC-06 — no KNOWN RED block was *widened* and no `dropKeys`
list grew. I did not measure whether the missed-job branch is now assertable in practice;
only that the stated blocker is gone.

### F5 — `test:scripts` skipped all 38 shell suites, including this branch's own deliverable

```
"test:scripts": "bun test scripts/__tests__ scripts/tests/*.test.ts && for f in scripts/tests/*.sh; do bash \"$f\" || exit 1; done"
```

The `&&` means any bun-side failure skips the entire shell loop. With F2 and F3 red, **0 of
38** shell suites executed — including `scripts/tests/test-root-install-live-exec.sh`, a
Phase-2 deliverable of this branch. Run directly, it passes.

A consequence for this feature's own record: every `test:scripts` figure previously written
down here (`1820 pass / 3 fail`, `1821 pass / 2 fail`) was **bun-only** and never included a
single shell suite, because the bun half was already failing when they were taken.

### F6 — five shell suites are red on `main` too, not this branch's

Run individually: 33 pass / 5 fail. Compared against the primary checkout at `main` @
`d32fce58` with the same environment, the per-suite pass/fail counts are identical and the
failure lists are byte-identical apart from `mktemp` path suffixes:

| suite | here | `main` |
| --- | --- | --- |
| `test-cursor-bridge-delivery.sh` | 13 / 3 | 13 / 3 |
| `test-hook-ownership-orphans.sh` | 12 / 10 | 12 / 10 |
| `test-install-skills-cli.sh` | 40 / 2 | 40 / 2 |
| `test-plugin-auto-install.sh` | 194 / 16 | 194 / 16 |
| `test-plugin-registry-registration.sh` | 43 / 4 | 43 / 4 |

Many report `got='7' want='7'` — identical values graded as failures — and
`test-plugin-auto-install` reports an extra `claude` host throughout. Both signatures point
at host-environment sensitivity on this machine rather than at a code defect, and both
predate this branch. Recorded, not fixed, and explicitly **not** this feature's to fix.

### The two pre-existing `pyts` failures — claim confirmed, not accepted

`pyts golden: lessons > list --status all` and `> list --query filter` were verified on the
primary checkout at clean `main` @ `d32fce58`, whose `.specs/lessons.json` is the committed
one carrying `L-002`…`L-005`:

```
bun test scripts/__tests__/pyts-golden.test.ts   →   44 pass / 2 fail
```

Exactly the two named cases. They are `main`'s, and the worktree's uncommitted
`.specs/lessons.json` is not the cause.

## Acceptance criteria

| AC | verdict | evidence |
| --- | --- | --- |
| AC-01 | carried from Phase 0 | not re-measured this session; fixture SHA re-confirmed at `788facbd` with a clean tree |
| AC-02 | PASS (observed) | every `up` logged `isolation verified: ollama :11435, postgres :5433/massa_ai_test` and an unchanged `shared stack before/after: 3333=… 5432=… 11434=…`; `refuse_if_foreign_listener` read at source. Not adversarially re-tested this session. |
| AC-03 | carried from Phase 0 | the 16-file sequence plus `17.cleanup-verify` was **not** re-run this session |
| AC-04 | carried from Phase 0 | not re-measured this session |
| AC-05 | **PARTIAL** | every cell's skips are declared and reasoned, and skip counts held constant across all ten cells; but one declared reason is falsified — see F4 |
| AC-06 | **PASS** | three fixes at source; each has a deterministic sensor that runs with no live stack; all four of my independent mutations were killed and match the commits' own figures; no KNOWN RED block widened and no `dropKeys` list grown |
| AC-07 | **PASS** | every triple above carries its gate vector including the `state.env` profile read at run time; after-fix figures re-derived per profile; skip population held constant in all ten cells |
| AC-08 | **PASS** | `harness-e2e.test.ts:17-26` states its strategy and names both; assertions are per-host against a self-constructed scratch `HOME`/`PATH`, so they cannot invert between this machine and CI |

## What was not measured, and why

Stated explicitly rather than omitted:

- **AC-03's 16-file sequence** was not re-run. The brief scoped this gate to the Tier-A
  profile matrix, the three fixes, and the repo-wide runners. The Phase-0 figure
  (232 pass / 0 fail / 3 skip, 361.14 s) stands as previously recorded and is **not**
  re-derived here.
- **AC-01 and AC-04** were not re-measured for the same reason.
- **`bun run build`** was not run.
- **`bun run test:coverage`** (the 90%-per-file floor) was not run; it is a separate blocking
  workflow and no coverage claim is made here.
- **Whether EB-SCH-4's missed-job branch is now assertable** after `a83e4f5d` was not
  measured. F4 establishes only that its stated blocker is gone.
- **The five `main`-red shell suites** were not root-caused beyond confirming they are
  identical on `main`.
- **`bun run test` on `main`** was not run as a whole; F1's attribution rests on the
  reverse-mutation of `package.json` in this worktree (32/0 vs 10/22), which is narrower and
  more direct.

## Retained from Phase 0

The Phase-0 evidence not restated above still stands as previously recorded: the six repairs
(`N5`, `N15`, `N18`/`N19`, `D2`, `D4`, `T15`), the `workspaces`-row race fixed in
`services/etl/pipeline.ts` with its `etl-workspace-row-ordering.test.ts` guard, the EDC-06
embedding-surface enrolment, and the postgres bring-up budget. The corrections section
recording two contaminated figures as withdrawn also stands.

The Phase-0 aggregate figure of `6369 pass / 0 fail / 688 skip, 12 of 12 turbo tasks` is
**superseded**: the same command on this branch now closes at 11 of 12 with 22 failures, for
the reason in F1.

## Exact next step

Fix F1, F2 and F3 before this branch can merge:

1. Teach `model-registry-stream.ts` to spawn the single `scripts/generate-artifacts.ts`
   entrypoint (and adjust `assertGeneratorBackstop`'s notion of a plausible list), or restore
   a parseable two-segment script. The endpoint is broken at runtime either way.
2. Update `generated-bundles-contract.test.ts` UGB-17 to assert the new single-entrypoint
   contract — that `generate-artifacts.ts` invokes both generators — rather than to grep the
   package script for two filenames.
3. Add the four `MASSA_AI_E2E_*` names to `turbo.json` `tasks.test.passThroughEnv`.
4. Then rewrite the falsified `[EB-SCH-4:PARTIAL]` reason and the stale `KNOWN RED` block in
   `26.scheduler.test.ts` (F4), and re-run `bun run test`, `bun run test:scripts` and the
   shell loop.

---

# Findings resolution — written by the implementer, 2026-09-07 (`e2199bba`)

Everything above this line is the independent verifier's report and is left unedited,
including its FAIL verdict and its next-step list. This section records what closed each
finding, and is kept separate so the verdict is not quietly overwritten by the person it was
returned to. **A re-verification pass is still owed** — see "Still owed" at the bottom.

| Finding | Status | Evidence |
| --- | --- | --- |
| F1 `model-registry-stream` throws on every regenerate request | closed | `model-registry-stream.test.ts` 32 pass / 0 fail (was 31/1) |
| F2 `generated-bundles-contract` UGB-17 | closed | 24 pass / 0 fail (was 23/1) |
| F3 four `MASSA_AI_E2E_*` unlisted (AD-010) | closed | `turbo-passthrough-env` 3 pass / 0 fail; `passThroughEnv` 70 → 74 |
| F4 falsified skip reason + stale KNOWN RED | closed | both rewritten in `26.scheduler.test.ts`; the KNOWN RED becomes a regression sensor that keeps its history |
| F5 `test:scripts` ran 0 of 38 shell suites | closed | the script runs both halves and aggregates |

**The aggregate is restored.** `bun run test --force --continue` closes at **12 of 12 tasks
successful, 0 cached, exit 0, zero `(fail)` lines** — it had been 11 of 12 with 22 failures.
That supersedes the "superseded" note above.

**F1 and F2 were one mistake with a name this repository already uses.** The consumer
inventory for the `generate:artifacts` change was taken with
`git grep "generate:artifacts" | head -20`, and the visible rows were treated as the
population. `model-registry-stream.ts` was below the cut. A truncated sweep is not a
population.

The repair keeps the wrapper — reverting it would restore the argv defect the wrapper exists
to fix — and pins the generator list on **both** sides so they cannot drift: the route keeps
its literal `KNOWN_GENERATOR_FILENAMES`, and `generate-artifacts-argv.test.ts` asserts the
wrapper's own `GENERATORS` equals it. AC-03.5's independence is preserved rather than traded
away: the route's test derives from the *wrapper's source*, the route from its *literal*, and
neither calls `deriveGeneratorScripts`.

**F5's fix cannot change CI's verdict, and that was checked rather than assumed.** The old
form was `bunHalf && loop`; the new is `bunHalf; loop; exit rc`. When the bun half fails both
exit 1; when it passes both run the loop. Coverage changes, outcome does not.

It does surface three shell suites that were already red and invisible. Attribution measured
in both places rather than inferred — identical counts on this branch and on the primary
checkout at clean `main`, and identical again under a scrubbed `HOME`, so they are not a
local-environment artifact:

| suite | this branch | primary checkout @ main |
| --- | --- | --- |
| `test-cursor-bridge-delivery.sh` | 13 passed / 3 failed | 13 passed / 3 failed |
| `test-plugin-registry-registration.sh` | 43 passed / 4 failed | 43 passed / 4 failed |
| `test-hook-ownership-orphans.sh` | 12 passed / 10 failed | 12 passed / 10 failed |

None belongs to this branch. They are recorded, not fixed, and are outside its scope — but
they are a follow-up worth opening, because `test:scripts` has been reporting on 38 suites it
never ran.

**The three flipped Tier-A cells, re-confirmed after the repairs**, because
`26.scheduler.test.ts` was edited (comments only, but the file changed):

| profile | file | result |
| --- | --- | --- |
| `default` | `29.audit-repairs` | 15 pass / 0 fail / 0 skip |
| `scheduler-on` | `26.scheduler` | 9 pass / 0 fail / 6 skip |
| `scheduler-fast` | `26.scheduler` | 8 pass / 0 fail / 7 skip |

`[EB-SCH-3b] lastRunAt=1788805612811 lastSuccessAt=1788805612811 consecutiveFailures=0` —
`lastSuccessAt` non-null over HTTP, the fix observed live rather than inferred from a passing
assertion.

**One reading was discarded here, and the rule that caught it earned its place.** The first
re-confirmation of `scheduler-fast` read **6 pass / 2 fail / 7 skip** at 1-minute load
**11.05**. The same file, same commit, same stack, re-run at load **3.36**, read **8 pass /
0 fail / 7 skip**. `spec.md` puts a figure measured above load 6 out of scope; that clause is
not bookkeeping, and this is the measurement it excluded.

## Still owed

- **Re-verification by someone who did not write these repairs.** This section is the
  implementer's account of closing the verifier's findings, not an independent confirmation
  of them, and it does not upgrade the FAIL above to a PASS.
- The three `main`-red shell suites (17 assertions) have a root cause nobody has traced.
- AC-03's 16-file sequence, AC-01 and AC-04 are carried from Phase 0 and were not re-derived
  this session.

---

# Second independent pass — verdict FAIL (narrow), and its closure (`121f0f92`)

A second verifier, who wrote none of the repairs, re-checked the five findings. Verdict
**FAIL**, explicitly narrow: nothing runtime-blocking or CI-blocking.

**Confirmed closed, adversarially rather than by observing green:**

- **F1** — seven fault injections against the wrapper, `package.json` and the route literal,
  each restored by file copy; every one caught by at least one sensor. Deleting exactly the
  21-line expansion block reproduces the reported signature, **10 pass / 22 fail**, closing
  the causal loop. `assertGeneratorBackstop` is not weakened into a tautology: its
  `scripts.length < 2` floor still fires, proven by the shortened-literal injection.
- **F3** — 3 pass / 0 fail; guard sensitivity proven by removing one of the four names
  (2 pass / 1 fail).
- **F5** — the "cannot change CI's verdict" claim was tested, not accepted: an exhaustive
  16-cell matrix over `bunHalf ∈ {0,1,2,130}` × four suite patterns found **0 verdict
  divergences**. Exit *values* change (2→1, 130→1); the sole consumer, `ci.yml:273`, tests
  zero/non-zero only.
- **The aggregate** — `Tasks: 12 successful, 12 total`, `Cached: 0 cached, 12 total`, exit 0,
  zero `(fail)` lines, at load 5.05. Non-vacuous: 7198 tests across 435 files, 213
  `[test-isolation] PASS` / 0 FAIL.

**F5's attribution came back stronger than recorded.** All three shell suites are byte-identical
between the trees and `main`'s CI is green at `d32fce58` — and the old form *does* run the loop
when the bun half passes, so those suites demonstrably pass in CI. The local redness is an
**ANSI escape leaking into the compared value** (`got='<esc>[0m<esc>[33m7<esc>[0m' want='7'`),
which is why the failure output reads as `got='7' want='7'`. They cannot redden CI.

**Two findings stood, and both are closed in `121f0f92`:**

- **F2 was vacuous.** `expect(wrapper).toContain("generate-subagent-artifacts.ts")` was
  satisfied by the wrapper's own docblock quoting the old `&&` form. Removing the real import
  *and* its `GENERATORS` entry left it 24 pass / 0 fail. It now asserts the resolved import
  list cross-checked against the wired `GENERATORS`; re-measured on the same mutation, **23
  pass / 1 fail** with the docblock mention still present.
- **F4 was not closed, and the first repair introduced a new wrong citation.**
  `scheduler-store-pg.ts:246-247` was repointed to `:246-249` by delta; `a83e4f5d` had
  inserted `ready()` above `get()`, so that range is now `ready()`'s JSDoc and the cited
  method is at `:262-265`. Re-found by content, which turned up **five** sites carrying it,
  not the one the verifier saw. Two sibling blocks in `26.scheduler.test.ts` were also still
  falsified — the named instance had been fixed and its class never enumerated.

**Three more were found by sweeping for the claim rather than the line, and neither pass named
them:** the `EB-MCP-3` block in `29.audit-repairs.test.ts` still read `KNOWN RED` and "stays
red until the product picks a side" (`34bbee58` picked one); the header's `EB-SCH-2` note still
listed the eight fields the dashboard route projects, now twelve; and two docblocks in
`model-registry-stream.ts` were falsified by `e2199bba` without being touched by it.

## What is still owed after this pass

- **A third verification is not scheduled and is not obviously worth it.** The second pass
  found no behavioural defect — every finding was a sensor or a comment. That is worth
  stating plainly rather than treating FAIL as a uniform verdict.
- 35 of 38 shell suites were unmeasured by the second pass; it ran 3.
- `bun run test:plugins`, `test:coverage` were implementer-reported and not re-run.
- The five `main`-red suites (3 shell + 2 `pyts golden`) still have no traced root cause,
  though the ANSI-leak finding above is a strong lead for the three shell ones.
- AC-03's 16-file sequence, AC-01 and AC-04 remain carried from Phase 0.

# Third session, 2026-09-24 — merge, Tier D, LM Studio, first Tier A matrix on the new stack

Written by the implementer, not a verifier. Nothing below upgrades the FAIL verdicts above.

## Merge with `main` (v1.64.0, `802b1185`)

12 conflicts resolved. Gates on the merged tree: build 6/6, type-check 6/6, lint clean,
`test:scripts` 2207 pass / 10 fail with all 10 green (253/0) under an empty
`XDG_CONFIG_HOME` (the developer's `model-profiles.json` overlay), shell suites 42/42.
`bun run test` cannot complete locally: Bun 1.3.14's exit panic (SIGTRAP after all tests
pass) aborts the isolation runner. Per-file loop over core + mcp-client instead: **292 files,
4300 pass, 0 fail**; the 9 non-zero exits are exactly the 9 files with the known panic, each 0
fail. The five `main`-red suites recorded under F6 are no longer red: shell suites 42/42.

## Tier A matrix — LM Studio provider, 2026-09-24

Stack: `MASSA_AI_E2E_PROVIDER=lmstudio`, `text-embedding-qwen3-embedding-0.6b` at 1024d
(direct HNSW branch), fixture `4bbba3b4…` (71 files). Gate vector common to every row:
`RUN_E2E=1`, `MASSA_AI_DEDICATED=1`, owned stack, `[T1] backend=postgres ollama=true
auth=true`, `[EB:29] owned=true ollama=true mcpBin=true config=true`.

**Load disclaimer.** A Gradle build in another project held the 1-minute load at 5–25 during
the first pass. Per `spec.md` Out of Scope, figures above load 6 are not quotable as
measurements; they are reported for their failure content only, and every red was re-run.

| Profile | Suite | pass / fail / skip | Notes |
| --- | --- | --- | --- |
| default | 00,02,05,06,08,09,10,11,13,14,18,19,20,22,24 | all 0 fail | skips: 10 → 1, 11 → 2 |
| default | 15.nfr | 13/1/0 → **14/0/0** | N15 fixed, see below |
| default | 25.observability | 17/0/0 | |
| default | 28.hooks-handoffs-proposals | 17/0/5 | |
| default | 29.audit-repairs ×2 | 15/0/0, 15/0/0 | stability check: identical |
| auth | 27.auth-config-cache | 33/1/0 → **34/0/0 ×3** | EB-CFG-3 fixed, see below |
| hooks-off | 28.hooks-handoffs-proposals | 16/0/6 | |
| scheduler-on | 26.scheduler | 9/0/6 | identical to the 2026-09-07 after-fix figure |
| scheduler-fast | 26.scheduler | 8/0/7 | identical to the 2026-09-07 after-fix figure |
| llm-on (`RUN_E2E_LLM=1`) | 30.llm-features | 5/4/0 → 6/3/0 at load 3–4 → **9/0/0 ×2** on the default coder model, 2026-09-25 | resolved, see below |
| default | 17.cleanup-verify | 2/0/0 | |

**N15 (`15.nfr`)** queried `embedding_bq`, which only `> 2000`-width tables carry; at 1024d
the query itself errored. It now follows the store's threshold and checks the index that
branch builds. Observed red: `POSTGRES_VECTOR_INDEX=ivfflat` → 0/1; restored → 1/0. A first
mutation (dropping the index) resolved to nothing — the test's own indexing run re-created
it — and is not counted.

**EB-CFG-3 (`27`)** — the product is correct (one key, one provisioner, one `generated` in
every run). Losers that import `@massa-ai/shared/config` after the winner's write get the key
seeded into `MASSA_AI_API_KEY` by `src/env.ts` and report `source: "env"`. Measured 4 of 4
red before the change; after it, one of three runs showed the mechanism live
(`config=2 env=2`).

**EB-LLM-3b** asserted a log literal `1692bfc2` renamed; its instruct-model check filtered on
the same literal and matched zero lines, so it passed vacuously. Fixed in `603056b8`.

**EB-LLM-3, EB-LLM-4, EB-LLM-6 — resolved 2026-09-25; two test defects and one product
defect.** At load 25 and at load 3–4 the result was the same: EB-LLM-4's bootstrap burned the 90 s budget, EB-LLM-3
expected rerank to reorder, and EB-LLM-6 expected fusion order under a 1 ms budget.

1. *Eviction hypothesis — falsified.* With LM Studio JIT auto-evict turned off by the user and
   every model resident, the reds persisted on the coder model, and the suite was 9/0/0 in 44 s
   with the instruct model in the code role.
2. *EB-LLM-3 and 6 — test defects (`b719d1b7`).* Proximity rerank and the centrality boost
   reorder results after fusion, so `combinedRank` order was never the reranker's contract.
   Both now read the reranker's own log lines from their own call.
3. *EB-LLM-4 — product defect: the bootstrap-seed schema stalls LM Studio's MLX engine.*
   Captured through a logging proxy, the request carried `summary: {maxLength: 512}` inside
   `memories: {maxItems: 8}`. Replayed against `qwen2.5-coder-7b-instruct` (MLX 4-bit,
   `batched_model_kit`, outlines-core), that schema emits zero tokens in 60 s and in 150 s even
   with a one-line prompt and `max_tokens: 40`; without `response_format` the same request
   streams in 28.7 s. The only keyword that mattered, each on a freshly loaded model:

   | Schema | Time |
   | --- | --- |
   | all bounds removed | 3.6 s |
   | `maxLength: 512` alone | 28.4 s |
   | `anyOf` const, `minimum`/`maximum`, `maxItems` alone | 1.4 s, 1.5 s, 2.2 s |
   | product schema minus `maxLength` | 6.6 s |
   | product schema minus `maxItems` | 43.5 s |
   | product schema | stall > 60 s |

   `sample` of the LM Studio worker showed one thread in a pure-Python loop (`set_issubset`,
   `list_index`) at 100% CPU for 17 minutes, holding the GIL while request threads waited in
   `take_gil`, and cancels logged `Could not cancel request_id … (id not found)`. With one
   abandoned build a reranker call still answered in 1.6 s; after about four, even an
   unconstrained "Say hi" timed out. So the reranker timeouts seen earlier were collateral.
   The reranker schema alone answers in 0.6–1.6 s. `qwen3-vl-8b-instruct` runs on the VLM
   engine and completed the full schema in 21 s.

   Fix (`8aa2a51f`): `SeedMemorySchema.summary` drops `.max(512)`; `summarizeWithLlm` already truncates to
   512 at insert. Sensor: `bootstrap-service.test.ts` asserts the schema accepts a 600-char
   summary and its JSON Schema carries no `maxLength` (red 16/1 with the bound restored), plus
   a truncate-at-insert guard. Real bootstrap prompt without the bound: 13.2 s and 11.4 s, 8
   memories. Live: `30.llm-features` on the default coder **9/0/0 in 70 s and 59 s**, load 3–4.
   The API imports `@massa-ai/core` from `dist`, so the first live re-run still sent
   `maxLength` until core was rebuilt.

   Not changed: `handoff-summary` keeps a top-level `.max(1024)` string. It runs in the NL role,
   whose default here is the VLM-engine model, and it is not nested in a bounded array.
   Measured on this machine only; LM Studio's engine and backend versions were not pinned.
