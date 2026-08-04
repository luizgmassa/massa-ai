# Validation Report — python-to-typescript-scripts

**Date**: 2026-08-04
**Spec path**: `.specs/features/python-to-typescript-scripts/spec.md`
**Diff range**: `e932a673..8333bb1c` (13 commits: `b4782690` activation + T1-T12)
**Verifier**: massa-ai-verification-agent (independent; author ≠ verifier — builder subagents authored, none re-used here)

## Task Completion

| Task | Status (tasks.md) | Commit | Verified |
|---|---|---|---|
| T1 | [x] | `b8ef61e5` | ✅ render path deleted from `lessons.py`, `.specs/LESSONS.md` deleted, `validate-repository.test.ts` flipped |
| T2 | [x] | `d6ca0747` | ✅ prose repoint, bundle regen `--check` 0 |
| T3 | [x] | `74a19f2c` | ✅ `pyts-dual-run.ts` self-test mechanism confirmed in commit history (deleted at T11, expected) |
| T4 | [x] | `6b4e383f` | ✅ `check_commit.ts` lands + `.py` deleted same commit; hook smoke independently re-run (below) |
| T5 | [x] | `e4931929` | ✅ `check_specs_delivered.ts` lands + `.py` deleted same commit |
| T6 | [x] | `140398ed` | ✅ `validate_state.ts` lands + `.py` deleted same commit; Summary-scoped verdict semantics confirmed |
| T7 | [x] | `109a8885` | ✅ `validate_spec.ts` lands + `.py` deleted same commit; `pyJoin` dialect fix confirmed |
| T8 | [x] | `cccaad7b` | ✅ `validate_tasks.ts` lands + `.py` deleted same commit; forward-phase nondeterminism documented and mitigated |
| T9 | [x] | `3bc677c4` | ✅ `lessons.ts` lands + `.py` deleted same commit; key parity verified (below); **confidence-boundary sensor gap found — see Finding 1** |
| T10 | [x] | `9e8ea516` | ✅ both repo scripts ported + `.py` deleted same commit; `package.json:42` rewired; exit-code parity byte-verified against recovered Python source |
| T11 | [x] | `1503995f` | ✅ golden suite materialized (44 cases, python-free), sweeps fresh, dual-run harness deleted |
| T12 | [x] | `8333bb1c` | ✅ CHANGELOG entry present, STATE/HANDOFF close-out, delivery gate green |

## Spec-Anchored Acceptance Criteria

| ID | Criterion | Evidence | Verdict |
|---|---|---|---|
| PTS-01 AC1 | Ported script = same exit/output as Python | `scripts/__tests__/pyts-golden.test.ts` re-run: 44 pass/0 fail/88 expect (exit 0); `scripts/__tests__/spec-driven-validators.test.ts` re-run: 44 pass/0 fail/107 expect (exit 0) | ✅ |
| PTS-01 AC2 | No argument/fixture regression | `--help` re-run on all 6 scripts confirms `--root`, `--message`, positional `target`/`feature`/`msgfile`/`feature` all preserved (transcript captured this session) | ✅ |
| PTS-02 AC1 | Dedup key parity | `bun skills/massa-ai/scripts/lessons.ts --root . export` vs `.specs/lessons.json`: `diff` of all 15 `id key` pairs → identical, 0 lines differ (re-run by verifier, not inherited) | ✅ (key parity proven; see Finding 1 for a related but distinct gap in the confidence-rounding sensor) |
| PTS-02 AC2 | `selftest` exists, exit 0 | `scripts/__tests__/fixtures/pyts-golden/lessons.json:1-8` (`selftest` → `exitCode: 0`), replayed green in the golden re-run above | ✅ |
| PTS-03 AC1 | `update-fixture-hashes` parity | `bun run update-fixture-hashes` re-run: `[corpus] all hashes current`, exit 1 — byte-matched against the Python original's own `overall_exit = 1  # start as "all current"` convention, recovered via `git show e932a673:scripts/update-fixture-hashes.py` — confirmed intentional parity, not a defect | ✅ |
| PTS-04 AC1 | Zero live `python3`/8-basename refs under `skills/`+`apps/*/skills/` | `/usr/bin/grep -rln python3 skills/ apps/*/skills/` → 0 lines; basename sweep → 0 lines (both re-run by verifier) | ✅ |
| PTS-04 AC2 | Design re-runs sweeps, records fresh populations | `design.md` D5: populations re-derived at `e932a673`; T11 re-runs a third time and fixes 5 stragglers (`1503995f` commit message) | ✅ |
| PTS-05 AC1 | Every commit leaves exactly one live entry point | `git show --stat` on all 9 script-touching commits: each pairs one `.py` deletion with one `.ts` addition of matching basename in the same commit, across root + all 4 bundle copies — verified for all 8 scripts | ✅ |
| PTS-06 AC1 | Dual-run divergence blocks, doesn't adjust fixture | `git show 74a19f2c:scripts/pyts-dual-run.ts` `--selftest` (lines 176-224) seeds a divergence and asserts non-zero exit — "a new sensor needs an observed red" satisfied at T3 | ✅ |
| LSN-01 AC1 | Writes only `lessons.json`, no `LESSONS.md` in tree | `/usr/bin/grep -n 'LESSONS\.md\|_render\|RENDER_REL' skills/massa-ai/scripts/lessons.ts` → 0 matches; `ls .specs/LESSONS.md` → No such file | ✅ |
| LSN-01 AC2 | Zero live `LESSONS.md` refs outside exemptions | Repo-wide sweep re-derived fresh: 34 lines total, all accounted for (3 sealed-complete other-feature specs, this feature's own artifacts, the intentional absence-sensor at `validate-repository.test.ts:660-664`) — 0 unexplained | ✅ |
| LSN-01 AC3 | `lessons list` shows status-grouped view | `bun skills/massa-ai/scripts/lessons.ts --root . list --status all` re-run: prints `L-001 (confirmed, ...)` etc. — status-grouped on-demand replacement confirmed | ✅ |

**12/12 literal ACs pass on independent re-verification.** One contract-adjacent gap (below) sits outside the literal AC text but inside the binding Plan Challenge Record.

## Discrimination Sensor

Worktree-scratch statement: mutations applied only inside `git worktree add /tmp/scratch-pyts HEAD` (never `git stash`), symlinked `node_modules` from the source worktree for speed (no tracked-tree effect), removed with `git worktree remove --force` after restore.

- Porcelain baseline before (main worktree): empty
- Porcelain baseline after (main worktree): empty (second `git status --porcelain` after scratch teardown)

| # | Mutation | Subject class | Killed? | Evidence |
|---|---|---|---|---|
| a | Invert `hasShall` detection in `validate_spec.ts` | ported-validator core check | ✅ Killed | `pyts-golden.test.ts`: 40 pass / **4 fail** (`SHALL-less acceptance criterion` and siblings) |
| b | Replace `roundHalfEven2` with naive `Math.round(x*100)/100` in `lessons.ts` (root **and** all 4 bundle copies, isolating from bundle-drift detection) | lessons round-half-even helper | ❌ **Survived** (iteration 1) | `pyts-golden.test.ts` 44/0; `spec-driven-validators.test.ts` 44/0; `validate-repository.test.ts` 182/0; `--check` exit 0. No sensor in `test:scripts` calls `lessons.ts add`/`penalize` to recompute a confidence — Finding 1 |
| c | Recreate `.specs/LESSONS.md` | LSN-01 single-store absence sensor | ✅ Killed | `validate-repository.test.ts`: 181 pass / **1 fail** (absence assertion) |
| d | Hand-edit `apps/claude-plugin/skills/massa-ai/scripts/check_commit.ts` | bundle-copy drift | ✅ Killed | `generate-skill-artifacts.ts --check`: exit **1**, `M scripts/check_commit.ts (content differs from source)` |

Depth: 4 mutations across 4 distinct subject classes, each applied, observed, and discarded individually.

**Result**: 3/4 killed — one confirmed surviving mutant (round-half-even confidence rounding) — FAIL on this axis (iteration 1; closed at iteration 2, see below)

## Gate Re-run (iteration 1, own exit codes)

| Command | Exit code | Notes |
|---|---|---|
| `bun run test:scripts` | 0 | 1321 pass / 0 fail across 57 files + 21 shell suites |
| `bun run lint` | 0 | oxlint clean |
| `bun run scripts/generate-skill-artifacts.ts --check` | 0 | No drift |
| `bun run scripts/generate-subagent-artifacts.ts --check` | 0 | No drift |
| `bun test scripts/__tests__/pyts-golden.test.ts` | 0 | 44 pass / 0 fail |
| `bun test scripts/__tests__/spec-driven-validators.test.ts` | 0 | 44 pass / 0 fail |
| `bun skills/massa-ai/scripts/validate_spec.ts python-to-typescript-scripts` | 0 | 0 error(s), 0 warning(s) |
| `bun skills/massa-ai/scripts/validate_tasks.ts python-to-typescript-scripts` | 0 | 0 error(s), 8 warning(s) (granularity smells, non-fatal) |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts python-to-typescript-scripts` | 0 | 6 paths checked, 0 error(s) |
| `bun skills/massa-ai/scripts/validate_state.ts python-to-typescript-scripts` | 1 | Expected pre-delivery state — `no validation.md` — this report is that artifact |

## Deviation Audit

- **T7 `pyJoin`** — correctly scoped. Reimplements `os.path.join`'s leading-`.`-preserving dialect because `--root "."` output is printed/matched literally; `node:path.join` would have broken PTS-01 AC1 byte parity. Contract-preserving fix.
- **T9 `pyFloatStr`/`pyJsonStringify`** — correctly scoped. Reproduce Python's whole-number-float rendering (`1.0` vs `1`) for the one float field the store writes.
- **T11's 5 unrelated `python3`→`bun` rewires** — correctly scoped, not creep: PTS-04 AC1's text is unconditional ("zero live `python3` invocations under `skills/`"); the fresh sweep found live `python3 -c` one-liners and AC1 mandates their removal.
- **T11's `validate-repository.test.ts` lessons-contract repoint** — genuine missed-site bug fix (stale reference to deleted `lessons.py`), documented in the commit body.
- **T11's `turbo.json` `MASSA_AI_MEMORY_PATH` addition** — necessary consequence of the port (AD-010): the env read existed in Python (invisible to the TS-source-scanning check) and became visible in `lessons.ts`. Confirmed `turbo.json:59` + `lessons.ts:305`.
- **T8's forward-phase iteration-order note** — genuine source-language nondeterminism (Python iterates an unsorted `set`, per-process hash-randomized): Python has no fixed canonical multi-violation output, so there is no ground truth to diverge from. TS documents its deterministic order (`validate_tasks.ts:376-382`); single-violation fixtures are the only sound response, and no asserted output line is weakened.

## Finding 1 (Critical) — round-half-even confidence sensor not durably enforced

Design D4 / Plan Challenge F1 (critical) mandated the 0.625-class confidence-boundary op be "exercised, not assumed." The T9 dual-run exercised it once, transiently; T11's goldens replay only read-only lessons invocations, `roundHalfEven2` (`lessons.ts:168`) is unexported and untested, and mutation (b) — naive rounding substituted in all 5 copies — survives the entire delivered gate set. Not a live-bug claim (implementation reviewed correct: exact-fraction arithmetic, ties-to-even); a standing-sensor claim: the regression detector F1 required ceased to exist when T11 deleted the harness.

**Fix task**: add a mutating (`add`/`penalize`) golden fixture reaching the 0.625-class confidence (expected `conf=0.62`), replayed by `pyts-golden.test.ts`; re-run mutation (b) to confirm it now kills; re-verify.

## Edge Cases

- [x] Regex dialect (`\b`, `re.I`/`re.M` vs `/i`/`/m`) — covered by validator fixture corpus, suite green
- [x] `unicodedata` `Mn` stripping vs JS `\p{Mn}` — key-parity round-trip on all 15 live lessons
- [x] `check_commit` as cwd-independent git hook — re-verified in a fresh scratch repo (bad message exit 1, good exit 0, direct + via `git commit`)
- [x] Bundle `.py`→`.ts` swap atomic per commit — verified across all 9 script-port commits × 5 copies
- [x] `lessons.json` byte-stable writes — `pyJsonStringify`/`pyFloatStr` confidence special-casing confirmed
- [x] LSN-01 AC2 self-referential sweep matches — exempted correctly (a claim of absence can be the match)
- [x] Confidence-boundary rounding regression coverage — **iteration-1 gap (Finding 1), closed at iteration 2 below**

## Requirement Traceability Update

| Requirement | Previous | New |
|---|---|---|
| PTS-01 | not started | ✅ delivered, verified |
| PTS-02 | not started | ✅ delivered, verified (Finding 1 sensor gap closed at iteration 2) |
| PTS-03 | not started | ✅ delivered, verified |
| PTS-04 | not started | ✅ delivered, verified |
| PTS-05 | not started | ✅ delivered, verified |
| PTS-06 | not started | ✅ delivered, verified |
| LSN-01 | not started | ✅ delivered, verified |

## Iteration 1 Summary (superseded by Iteration 2)

Iteration 1 — 12/12 literal ACs passed with fresh verifier-run evidence; commit discipline clean; sweeps zero; 3/4 discrimination mutations killed. The surviving mutant (naive rounding in place of `roundHalfEven2`, undetected by the whole delivered gate set) violated Plan Challenge F1's "exercised, not assumed" mandate → verdict FAIL at iteration 1, FT1 routed. Closed below.

## Iteration 2 (re-verification)

**Fix commit audited**: `67e769ca` — "test(scripts): standing golden sensor for round-half-even boundary (FT1)" — 3 files changed, **73 insertions, 0 deletions** (pure addition; no existing fixture line touched).

**What it does** (verified by inspection, not inherited): two new golden entries in `scripts/__tests__/fixtures/pyts-golden/lessons.json` — a mutating `lessons.ts add` with `--scope test-strength` against a fresh empty store, and a `list --status all` over the store that `add` produced. Math independently re-derived: `recurrence=1`, `promote_threshold=2` (default, `lessons.ts:45`) → `recCap = 0.5`; `sigWeight=0.15`; `scopeWeight=0.1` → exactly 0.625 (5/8, exactly representable — no float-approximation escape hatch). Round-half-to-even at 2 decimals ties to 0.62 — exactly what both fixtures assert. No asserted line carries a timestamp; both `buildLessonsRoot` branches (`pyts-golden.test.ts:709-716`) seed a brand-new `makeTempRoot` per replay.

### Mutation-kill re-verification (fresh scratch worktree, HEAD carries FT1)

- `git worktree add /tmp/scratch-pyts-ft1 HEAD` → `HEAD is now at 67e769ca`. Porcelain baseline (main worktree) before: only the untracked `validation.md`.
- Pre-mutation control run in scratch: `bun test scripts/__tests__/pyts-golden.test.ts` → **46 pass / 0 fail** (exit 0).
- Mutation (b) re-applied: `roundHalfEven2` → naive `Math.round(x*100)/100` in root `lessons.ts` **and** all 4 bundle copies (isolating round-logic from bundle-drift detection, per iteration-1 methodology).
- Post-mutation: **44 pass / 2 fail, exit 1** — both failures are the FT1 entries: `add at the 0.625 confidence boundary (round-half-even, F1)` (expected `confidence=0.62`, got `confidence=0.63`) and `list after the boundary add shows conf=0.62 (F1)` (expected `conf=0.62`, got `conf=0.63`). **Observed kill confirmed**, matching FT1's own claimed evidence exactly — verified independently, not inherited.
- Mutation discarded; re-run 46/0 green before teardown; `git worktree remove --force` ok; porcelain after identical to before — no residue.

### No-regression gate re-run (main worktree, HEAD = `67e769ca`)

| Command | Exit code | Result |
|---|---|---|
| `bun test scripts/__tests__/pyts-golden.test.ts` | 0 | 46 pass / 0 fail / 92 expect() calls |
| `bun run test:scripts` | 0 | 1323 pass / 0 fail across 57 files (1321 baseline + 2 FT1 cases) |
| `bun run lint` | 0 | oxlint clean |
| `bun skills/massa-ai/scripts/validate_tasks.ts python-to-typescript-scripts` | 0 | 0 error(s), 9 warning(s) — `WARN FT1: granularity smell` present, confirming FT1 parses as its own task (Phase 5, `Depends on: T12`, `Status: [x]`) |

### Sensor-quality checks

- **Determinism**: the two F1 tests run 3 consecutive times → 2 pass / 0 fail each time, identical output; no timestamp/UUID in either asserted line.
- **No weakening**: `git diff 8333bb1c..67e769ca -- scripts/__tests__/fixtures/pyts-golden/lessons.json` → 32 insertions, 0 deletions; the original 44 golden cases byte-identical to iteration 1.

### Iteration-2 verdict

**FT1 closes Finding 1. The standing sensor is real, deterministic, additive-only, and independently confirmed to kill mutation (b) with the exact predicted failure signature. No regression introduced. Iteration 2: PASS.**

## Summary

**Overall**: All 12 literal acceptance criteria from iteration 1 remain verified (not re-litigated at iteration 2 per scope). Iteration 1's Finding 1 (critical) — the round-half-even confidence-boundary rounding had no standing regression sensor after T11 deleted the dual-run harness — is closed by fix commit `67e769ca` (FT1): two additive golden fixtures exercise `lessons.ts add` at the exact reachable 0.625 boundary and assert the round-half-even outcome (0.62), independently re-verified in a fresh scratch worktree (mutation re-applied to root + all 4 bundle copies, observed 44 pass/2 fail with the exact predicted 0.63-vs-0.62 divergence, then restored). All discrimination mutations now kill. No regression: golden suite 46/46, full `test:scripts` 1323/1323, lint clean, `validate_tasks.ts` 0 errors with FT1 correctly parsed as a standing task.

**Result**: PASS

- Spec-anchored counts: 12/12 literal ACs PASS (iteration 1, evidence-or-zero, verifier-run)
- Sensor counts: 4/4 discrimination mutations killed (was 3/4 at iteration 1; the round-half-even gap closed by FT1)
- Gate verdict: all gate commands exit as expected — goldens 46/0, `test:scripts` 1323/0, lint 0, `validate_tasks.ts` 0
- What works: all 8 scripts ported with verified CLI/exit/output parity; deletion discipline clean across all 9 script-port commits; global sweeps zero; LSN-01 single-store migration complete and sensor-guarded; the commit-msg hook path independently confirmed functional; the confidence-rounding boundary now has a durable, deterministic, additive-only standing sensor
- Issues found: none outstanding
- Next steps: none — deliver (push + PR per the feature's one-time authorization; CI watch; merge decision remains the user's, minor release on merge)
