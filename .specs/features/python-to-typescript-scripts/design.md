# Python → TypeScript Scripts Migration + Lessons Single-Store — Design

- **Feature:** `python-to-typescript-scripts` — see `spec.md` (PTS-01..06 + LSN-01 amendment).
- **Sizing:** Large. 8-script CLI-contract migration + one behavior change (lessons store) + full wiring ripple across skills prose, tests, `package.json`, and 4 host bundles.

## Design Summary

Two concern groups in one branch, ordered so nothing is ported twice: (1) LSN-01 makes `.specs/lessons.json` the only lessons store while `lessons.py` is still the implementation (small Python diff + doc repoints); (2) the 8 scripts port to TypeScript under Bun one per task — port → suite rewire → dual-run parity → prose rewire → delete `.py` — so every commit leaves exactly one live entry point per script (PTS-05).

## Decisions

**D1 — LSN-01 lands first, in Python.** Delete `RENDER_REL`/`_render_path()`/`_render()` and `_save`'s render call (`lessons.py:42,76-77,106,257-318`), update `cmd_init`'s message (:326) and the header docstring (:12), delete `.specs/LESSONS.md`, repoint the 12 live reference lines outside lessons.py (population in spec LSN-01, re-derived at `e932a673`), regenerate bundles. The later lessons port then never carries the render path. `cmd_list` (`lessons.py:437-464`) already serves the on-demand human view — LSN-01 AC3 binds to it unchanged. `validate-repository.test.ts:655-663` flips from `json OR md exists` to `json exists AND md absent` — the single-store invariant becomes a standing sensor. Rejected: dedup after the port — ports ~62 render lines only to delete them in the next commit.

**D2 — Port shape: one `.ts` per script, same basename, Bun builtins only.** `skills/massa-ai/scripts/<name>.ts` with `#!/usr/bin/env bun` + executable bit (check_commit serves as a git `commit-msg` hook — the recipe at `references/spec-driven/execute.md:311` repoints to the `.ts`). Hand-rolled argv parsing preserving the exact argparse surface (`--root`, positionals, lessons subcommands, `--message`); exit semantics 0/1/2 and asserted output lines byte-preserved (PTS-01). No new dependencies; `Bun.spawnSync` for the `git` calls `check_specs_delivered` makes.

**D3 — Characterization = existing suite + dual-run diff.** `scripts/__tests__/spec-driven-validators.test.ts`'s fixtures are the corpus. Each port task (a) flips that script's spawns from `python3 -B <x>.py` to `bun <x>.ts` — the suite green is the asserted-surface parity gate; (b) runs a dual-run harness `scripts/pyts-dual-run.ts` (new, temporary) that executes `.py` and `.ts` against the same fixture set and diffs full stdout + exit code before the `.py` deletion in the same commit (PTS-06). The harness is removed by the final sweep task — after the last deletion it has no subject. Its own sensor: a seeded divergence must report non-zero before first use (a new sensor needs an observed red). Before the harness dies (T11), its passing per-script fixture invocations and captured stdout+exit pairs are materialized as permanent golden fixtures (`scripts/__tests__/fixtures/pyts-golden/` + `scripts/__tests__/pyts-golden.test.ts`) replayed against the `.ts` scripts — the parity oracle's ground truth survives the `.py` deletion (Plan Challenge F3).

**D4 — lessons key + write parity is fixture-proven.** `_norm` (NFD + combining-mark strip + casefold + collapse) → TS `String.normalize("NFD")` + `\p{Mn}` class removal + `toLowerCase()`; dual-run over every key in `.specs/lessons.json` (15 lessons live) + the diacritic/Japanese selftest fixtures; `selftest` ported and exit 0 (PTS-02). Writes stay byte-stable: TS emits the same `indent=2, ensure_ascii=False`-shaped JSON + trailing newline; a write-parity check diffs a Python-written vs TS-written store after identical ops — any byte diff blocks. Known dialect risk: Python `casefold()` vs JS `toLowerCase()` diverge on ß/ſ-class codepoints — the live-key dual-run is the sensor; if a live key ever hits that class, the port must match `casefold` semantics for it, not relax the fixture. Second named dialect sensor (Plan Challenge F1): Python's `round()` is half-to-even on the binary float — `_confidence()`'s reachable value 0.625 (recurrence 1 + scope under default thresholds) stores 0.62 in Python and 0.63 under naive JS rounding. `lessons.ts` ports a round-faithful helper, and T9's write-parity op set MUST include at least one 0.625-class confidence-boundary input so the sensor is exercised, not assumed.

**D5 — Prose rewire is population-driven, per script.** Sweeps re-derived at `e932a673` (supersede spec authoring figures per PTS-04 AC2): 41 `python3` lines / 25 skill `.md` files (36 naming the 8 targets), 28 `.py`-without-`python3` lines (12 are LSN-01's repoint set; `references/hook-enforcement.md`'s table names 9 foreign `.py` hook scripts that are NOT among the 8 targets and stay untouched), 3 spawns in `spec-driven-validators.test.ts`, `package.json:42`. Each port task rewires only its own script's sites (`python3 …/<x>.py` → `bun …/<x>.ts`); the final task proves the global zero (PTS-04 AC1 + LSN-01 AC2, populations printed).

**D6 — Type/lint coverage follows repo precedent.** The `.ts` scripts fall under root `bun run lint` (oxlint reaches `scripts/` and `skills/`); no tsconfig gate exists for non-package scripts and none is added (matches every existing root `scripts/*.ts`). Correctness rides the suite + dual-run, not tsc.

**D7 — Bundle regeneration per skills-touching commit.** Same-commit regen + `--check` green (tlc-330 D9 rule): LSN-01's two tasks and each of the 6 skill-script ports run `generate-skill-artifacts.ts` and land the bundle diff atomically; `generate-subagent-artifacts.ts` is untouched (no `skills/agents/` change) but `--check`ed at close-out. The 24 bundle `.py` copies disappear task-by-task (6 scripts × 4 hosts), `--check` clean in each deletion commit (spec edge case).

**D8 — Repo dev scripts port to `scripts/*.ts`.** `update-fixture-hashes.ts` rewires `package.json:42` to `bun scripts/update-fixture-hashes.ts`; `synapse-bench-analyze-v2.ts` is manual-only — invocation documented in its header (PTS-03).

**D9 — python3 leaves the harness runtime, not the repo.** The polyglot parser fixture `indent-method.py` stays (spec Out of Scope); node-gyp's build-helper Python is toolchain, not harness. After the final sweep, no harness path assumes python3 — the graceful-degradation prose ("no code-execution tool → read the artifact") survives with `bun` as the named invoker.

## Verification Design

- Per-task: `bun test scripts/__tests__/spec-driven-validators.test.ts` (spawns rewired incrementally) + `bun scripts/pyts-dual-run.ts --script <name>` + `generate-skill-artifacts.ts --check` when `skills/` is touched.
- Feature gates: full `bun run test:scripts`, `bun run lint`, both generators `--check`, and the four validators + delivery gate dogfooded via their own `.ts` selves against this feature (the migration validates itself with what it migrated).
- Final sweeps with printed populations: `python3` zero + 8-basename zero under `skills/` and `apps/*/skills/`; `LESSONS.md` zero live refs (sealed `.specs` + this feature's artifacts exempt).
- Independent validation: `massa-ai-verification-agent` (deep tier) per the workflow dispatch block; discrimination mutations on ≥2 ported validators plus the LSN-01 single-store sensor.

## Plan Challenge Record (full gate, pre_mortem, 2026-08-04)

`massa-ai-plan-critic` (deep tier, read-only) returned 4 findings. Resolutions (per `serious_findings: revise_plan` — folded before Execute, decided by the main agent):

- **F1 (critical) — `round()` banker's-rounding parity unnamed:** revised — D4 gains the rounding sensor; T9's write-parity op set must include a 0.625-class confidence boundary. Rejected: trusting the live-key corpus alone — live data need not contain a boundary value.
- **F2 (high) — installed commit-msg hook symlinks are sweep-blind:** revised — T4 repoints the execute.md recipe AND checks this checkout's and its worktrees' `.git/hooks/commit-msg` for a symlink targeting the deleted `.py`, repointing it; T12's CHANGELOG entry carries the operator migration note. External machines cannot be swept — documented, not silently broken.
- **F3 (high) — oracle and ground truth die together at T11:** revised — D3/T11 materialize the harness's passing fixture+output pairs as permanent golden tests before deletion.
- **F4 (medium) — R6 mis-framed:** revised — R6 rewritten as a verified non-issue with its real consequence (no per-line floor reaches the new files), which is what makes F3 mandatory.

## Risks / Mitigations

- **R1 regex dialect drift** (`\b` on Unicode, `re.M`/`re.I` vs `/m`,`/i`, `casefold` vs `toLowerCase`): characterization corpus includes every validator fixture; divergence blocks (PTS-06); D4 names the casefold sensor.
- **R2 lessons.json reformat noise:** D4 write-parity byte-diff; any diff on identical ops blocks.
- **R3 stale bundle window:** D7 same-commit rule + `--check` in CI and per task.
- **R4 commit-msg hook breakage:** the check_commit port smoke-tests the hook path in a scratch repo (hook invoked by git from `.git/hooks`, cwd-independent).
- **R5 missed wiring site:** population-driven sweeps; the global zero is proven at the end from a fresh sweep, never from the remembered list.
- **R6 coverage floor — verified non-issue, with a consequence:** `scripts/check-coverage.ts`'s `UNITS` list covers only the six workspace packages — `scripts/` and `skills/` sit structurally outside the 90%-per-file floor (Plan Challenge F4, verified against the UNITS array). Consequence recorded: the 11 new `.ts` files carry no per-line coverage enforcement; the golden suite (D3) and the validators' test suite are their only standing sensors — which upgrades F3's golden extraction from nice-to-have to mandatory.
