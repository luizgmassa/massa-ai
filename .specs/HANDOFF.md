# Audit Remediation 2026-07 — Handoff

**Active Feature**: `audit-remediation-2026-07` — PR1 shipped as v1.8.0; PR2 execute complete
**Branch**: `feat/audit-remediation-debt`, off `origin/main` @ `c992ae9` (v1.8.0). Not pushed; no PR open.
**Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-audit-remediation-debt`
**Spec**: `.specs/features/audit-remediation-2026-07/spec.md`
**Design**: `.specs/features/audit-remediation-2026-07/design.md`
**Tasks**: `.specs/features/audit-remediation-2026-07/tasks.md`
**Validation**: `validation.md` (PR1) · `validation-pr2.md` (PR2)

## Where things stand

PR1 (SEC-01..06, BUG-01..06 — T0..T15, T23) merged as `af16ea2` and released as **v1.8.0**.

PR2 (DEBT-01..05 — T16..T22) is complete on this branch:

| Commit | Task | What |
| --- | --- | --- |
| `2380615` | T16 | AD-010 recorded; prior `RLM_` exclusions annotated superseded |
| `2e6c16d` | T17 | `RLM_LLM_*` -> `MASSA_AI_LLM_*` hard rename; all 10 in `passThroughEnv` (was 4) |
| `17f345a` | T18 | oxlint adopted, all 337 violations fixed, every correctness rule at `error`, CI wired |
| `7199d27` | T20 | One shared isolated-test-runner + 3 thin wrappers |
| `469fa4f` | T19 | Coverage gate implemented |
| `32a647a` | T21 | `bunfig.toml` header; one-off core scripts relocated |
| `dc7fee3` | (scope add) | Unit tests no longer reach live providers; instrumented suites budgeted |
| `341a9a5` | T19 | Coverage merge corrected; **passing path verified** |
| `6cf97ae` | follow-on | Specify-only spec for the core layering / god-module split |

T20 ran before T19 on purpose: T19's gate needs the `--coverage` passthrough T20 added
to the shared runner.

## The one thing to know before touching the coverage gate

The gate was reporting **130 of 314 files below the 90% floor**. The floor was never
wrong — the merge was.

Bun emits two shapes of lcov record for the same file. A group that genuinely instruments
a module reports its real executable lines; a group that only pulls the module in as a
transitive import emits a degenerate record marking *every physical line* uncovered,
blank lines and JSDoc included. On `graph-queries.ts` the instrumenting group reported 220
executable lines and covered all 220; seven shallow groups each reported 377 and covered
14. Unioning the denominators scored a fully covered file at 58.4%.

`scripts/check-coverage.ts` now unions the **covered** set across groups (so a file split
across several test files keeps credit) and takes the **minimum** executable set (so the
denominator stays on Bun's real executable lines). 130 below floor became 3.

Do not "fix" a low coverage number by touching the floor before checking whether the file
is simply widely imported.

## Gate state at HEAD

Run with the dedicated test database:

```
DATABASE_URL=postgresql://massa_th0th:massa_th0th_password@127.0.0.1:5433/massa_ai_test \
MASSA_AI_DEDICATED=1 RUN_POSTGRES_TESTS=1 bun run test:coverage
```

`bun run test:coverage` **PASS**, exit 0 — 314 source files measured, 9 exclusions, every
measured file at or above 90%, 0 test failures. Group counts: core **126**, tools-api **25**,
mcp-client **8**, all PASS.

lint 0 · type-check 6/6 · build 5/5 · `test:scripts` 584 pass / 0 fail exit 0.

`bun run test` is **green except for one pre-existing failure**: mcp-client's
`embedded-api-client-endpoints.test.ts`, which passes under the coverage gate and fails under a
plain run. See the carried-forward findings below — it is a config leak, not contention, and it
is not caused by this branch.

The 2 Dart timeouts that were pre-existing at `origin/main` @ `c992ae9` are gone — see below.
Core's group count is still exactly **126**; the new facade tests extended an already-forked
file rather than adding one, which would have made it 127.

## Coverage floor and exclusions

Both live in `scripts/check-coverage.ts` as executable data, not in this file. That is
deliberate: this file gets rewritten at the start of every feature, and a gate pinned to
prose here would silently lose its own definition.

Floor: **90% line**, per file. **9 exclusions**, each carrying the justification that
earned it. Two were added by DEBT-02 once the gate could actually be run, and both are
measurement blind spots rather than coverage gaps:

- `packages/shared/src/config/api-key.ts` (13.79%) — 373 lines of dedicated tests, but all
  21 call sites go through the `runIsolated` subprocess harness because `CONFIG_DIR` is
  frozen at first import. Bun coverage does not cross a process boundary.
- `packages/shared/src/env.ts` (88.89%) — three of the four uncovered lines are the
  config-to-env seeding branches; the fourth is `findEnvFile()`'s loop exit, reached only
  when the walk up from cwd finds no `.env` anywhere, which cannot happen in a checkout that
  has one. In-process coverage was attempted and does not work: `CONFIG_DIR`
  freezes at first import, `packages/shared` runs as a single `bun test` process so no test
  can guarantee it loads `env.ts` first, and `env.ts` dotenv-loads the nearest `.env`
  walking up from cwd before consulting config.json. Cache-busting the import re-evaluates
  `env.ts` but reuses the cached loader, so the config dir cannot be re-pointed.

`contextual-search-rlm.ts` was the third file below floor at 63.55% and is **not** excluded —
it was a real gap and is now at 100%, covered by 27 new facade-forwarding tests.

The gate **refuses to run** without `MASSA_AI_DEDICATED=1` and a `DATABASE_URL` on
`127.0.0.1:5433/massa_ai_test`. 50 core suites sit behind `describe.skipIf(!DEDICATED_DB)`;
without them their subjects measure near zero and the report looks like a catastrophe that
has nothing to do with how well they are tested.

The gate also runs the suites against a scratch `XDG_CONFIG_HOME`. Without it the numbers
are a property of the machine rather than of the tree, and the developer's real
`~/.config/massa-ai/` is writable by the run.

`packages/core` merging **122** lcov files for **126** groups is expected, not a defect.
Bun writes no lcov when a run's coverage record set is empty; four groups either skip
entirely behind their own opt-in flags (`RUN_GRAPH_GENERATION_LIFECYCLE`,
`RUN_GRAPH_GENERATION_SYMBOL_REPOSITORY`) or import no product source at all.

## Tests that reach live providers — the recurring failure mode

This bit the project twice, so it is written down rather than rediscovered.

A unit test that constructs a subject without pinning its seams can reach a **real LLM or
embedding provider**, because the config layer reads the developer's own
`~/.config/massa-ai/config.json`. On a machine with a local Ollama that means a live network
call: measured at **42030 ms cold / 690 ms warm** against `bunfig.toml`'s 5 s per-test
budget. It passes on a warm model and hangs on a cold one, so it reads as flakiness. **CI
never sees it**, because CI has no config file and every LLM feature defaults off.

Fixed in `dc7fee3`: `dart-support.test.ts` and `code-compressor.test.ts` (LLM seam),
`rlm-admin.test.ts` (missing `vector-store-factory` mock — the identical omission
`48d0f39` fixed in `contextual-search-rlm-coverage.test.ts`).

Raising the timeout is not the fix. 42 s exceeds any sane per-test budget, and a unit test
asserting a regex result should not be on the network.

The genuinely-slow suites are a separate class and *are* budgeted, each sized from a
measurement rather than a guess: `etl-cache-invalidation` at `180_000` (measured **66.42 s**
standalone under `--coverage`; `30_000` passed one gate run and failed the next at 30001 ms),
`etl-idempotent` at `30_000` (670 ms instrumented — its 5 s failures were pure contention, so
the budget is headroom, not cost), and `architecture-map`'s three `getProjectMap` cases at
`120_000` (they pass standalone even with coverage, and hit exactly 60 s only inside the
gate's 126-group contention). Always raise the per-test value; never `bunfig.toml`'s global
default.

## Open findings carried forward — not actioned

- **`memory-controller.ts:274`** destructures `includePersistent` and never reads it, so the
  option `search_memories` advertises in its tool schema (`tools/search_memories.ts:61`)
  silently does nothing. Renamed `_includePersistent` with a comment so it stays visible.
  Closing it is a behavior decision, not a cleanup.
- **`mcp-client`'s `embedded-api-client-endpoints.test.ts` still leaks to a live provider.**
  "routes without 404" for `/search/project` and `/search/code` fails at 5001 ms under a real
  user config and passes with `XDG_CONFIG_HOME` set to an empty dir — `DATABASE_URL` is
  identical in both, so this is config, not contention. CLAUDE.md previously attributed it to
  Postgres/Ollama contention; that note is corrected. It has no one-line fix: the file is
  deliberately unmocked integration, and `@massa-ai/core` does not export
  `_setLlmEnabledForTesting` to `apps/`, so pinning the seam would mean a deep import into core
  internals. Pre-existing at `c992ae9`. It passes inside the coverage gate, which sets the
  scratch config dir.
- **`packages/core`'s runner has no isolation rule for `@massa-ai/shared`.** 75 files under
  `packages/core/src/__tests__` import it, `packages/shared/src/config/index.ts`
  bare-imports `../env.js`, and that runs `migrateDataDirOnce()` and `loadConfigSafe()`
  against the real `CONFIG_DIR` at module load. The coverage gate's scratch
  `XDG_CONFIG_HOME` contains this for the gate's own run; a plain `bun run test` is still
  unprotected. `packages/shared`'s own 13 test files were checked and are all correctly
  isolated — the exposure is in core.

## Next steps

1. Open the PR for this branch. `CHANGELOG.md` has the `[Unreleased]` entries; the CI merge
   gate requires them. The rename entry is `### Changed` and breaking, so this cuts a
   **minor** release.
2. **Never write the skip-ci marker literally in any commit body or PR body.** GitHub scans
   the whole message and a squash merge folds every commit body into it. That is what
   killed the v1.3.0 release.
3. `core-layering-god-module-split` is specified and registered with `execute: false`. All
   six of its assumptions are open questions; it needs Design before anything else.
