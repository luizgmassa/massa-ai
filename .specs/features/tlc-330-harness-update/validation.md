# TLC 3.3.0 Harness Update Validation

**Date**: 2026-08-04
**Spec**: `.specs/features/tlc-330-harness-update/spec.md`
**Diff range**: `e6b282c4..7ab4fbcb` (HEAD)
**Verifier**: independent sub-agent (author ≠ verifier), role `verification-agent`, projectId `massa-ai`

---

## Task Completion

All 18 tasks marked `[x]` in `tasks.md`. T17 is a documented no-op (regen already covered by T16, no commit/diff — confirmed: `git log` shows no commit between `ca621e0a` (T16) and `7ab4fbcb` (T18 close-out) touching regenerated bundles, and `--check` on both generators is clean at HEAD).

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T6 (Phase 1: validator scripts) | ✅ Done | All 4 scripts + `lessons.py` Unicode fix + `check_specs_delivered.py` present, tested |
| T7–T15 (Phase 2: reference/workflow prose) | ✅ Done | Content-identity sweeps confirmed (see AC table) |
| T16 (charter → deep + full regen) | ✅ Done | Both parity suites green in isolation; regenerated artifacts resolve `deep` |
| T17 (no-op regen + threshold sweep + C3) | ✅ Done (no-op, verified) | Sweep 0; blast-radius clause byte-identical across 2 sources + 8 bundle copies; gate-invocation lead-in present in 6 sources + 24 bundle copies |
| T18 (CHANGELOG + state + delivery-gate dogfood) | ✅ Done | `check_specs_delivered.py tlc-330-harness-update` exits 0 (re-derived independently) |

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every row below is traced to `file:line`. 29 ACs total across 20 requirements.

| Criterion | Spec-defined outcome | `file:line` evidence | Result |
| --- | --- | --- | --- |
| SYNC-01 AC1 (filled spec exits 0, missing-section/no-SHALL exits 1) | exit 0 on valid, exit 1 naming the defect | `skills/massa-ai/scripts/validate_spec.py:146-246` (check logic); `scripts/__tests__/spec-driven-validators.test.ts:88-186` (T1 suite, 4 pass incl. filled/missing-section/no-SHALL fixtures); own dogfood: `python3 validate_spec.py tlc-330-harness-update` → 3 non-blocking traceability-ID warnings unrelated to this AC (multi-ID rows, not required by this AC), core check passes | ✅ PASS |
| SYNC-01 AC2 (missing-Gate/forward-dep exits 1, names task) | exit 1 naming task | `skills/massa-ai/scripts/validate_tasks.py:228-249`; `scripts/__tests__/spec-driven-validators.test.ts:222-281` (T2: missing-Gate → `"T2: missing \`Gate\` field"`; forward-dep → `"T1 (phase 1) depends on T2 (phase 2)"`); dogfood: `validate_tasks.py tlc-330-harness-update` → 0 errors, 1 warning (T18 multi-file `Where`, expected) | ✅ PASS |
| SYNC-01 AC3 (bad header exits 1, `[KEY] type(scope): subject` exits 0) | exit codes match | `skills/massa-ai/scripts/check_commit.py:43,74-99`; `scripts/__tests__/spec-driven-validators.test.ts:346-409` (11 tests incl. `[SA-142] feat(auth): reject expired tokens` → exit 0, `updated the auth module` → exit 1) | ✅ PASS |
| SYNC-01 AC4 (missing/FAIL/placeholder/no-evidence validation.md exits 1) | exit 1 each case | `skills/massa-ai/scripts/validate_state.py:96-116`; `spec-driven-validators.test.ts` T4 suite (not individually re-run in isolation this session but exercised inside the full 41-test file which passed 41/41) | ✅ PASS |
| SYNC-02 AC1 (6 files name exact invocation + non-zero blocks progression) | exact `python3 skills/massa-ai/scripts/<script>.py` + "run it, do not eyeball it" | `specify.md:138`, `execute.md:305`, `validate.md:207`, `sub-agents.md:151`, `tasks.md:160`, `workflows/spec-driven.md:120` — all 6 confirmed via `grep -rn "run it, do not eyeball it"` | ✅ PASS |
| SYNC-02 AC2 (graceful degradation when no code-exec tool) | prose directs reading the artifact | Same 6 citations above, each ends "...graceful degradation preserved" | ✅ PASS |
| SYNC-03 AC1 (stash forbidden-only + porcelain baseline required) | `git stash` appears only as forbidden mechanism; baseline capture + post-cleanup match required | `validate.md:106-107,115` (Forbidden clause + baseline capture step 2 + re-verify step 6); `sub-agents.md:124` (single clause: "never `git stash`" + "verifies... porcelain matches the pre-sensor baseline") | ✅ PASS |
| SYNC-04 AC1 (status+code one commit, crash-resume rationale stated) | tasks.md status update in same commit as code; rationale stated | `execute.md:229-234` ("§7. Status + Atomic Commit (same commit)"... "a crash between those steps is how resume redoes finished work") | ✅ PASS |
| SYNC-05 AC1 (explicit go-ahead before first push) | contract requires separate authorization before first push except the one-time delivery authorization | `execute.md:344`, `workflows/spec-driven.md:30` — byte-identical blast-radius clause (verified via diff, see Cross-file Consistency below) | ✅ PASS |
| SYNC-06 AC1 (6 EARS shapes + SHALL, `validate_spec.py` enforces) | EARS patterns present, SHALL enforced deterministically | `specify.md:207-210` (4 example patterns + comments); `validate_spec.py:115-143` (`classify_ears`, enforces SHALL) | ✅ PASS |
| SYNC-06 AC2 (no template contradicts EARS, ripple recorded) | D4 check recorded, no contradiction | `design.md:18` (D4 decision, "Before T7 lands..."); grep for `WHEN/THEN`-mandate contradiction in `design.md`/`tasks.md` templates found none — no scope extension task exists, consistent with "likely low ripple" confirmed | ✅ PASS |
| SYNC-07 AC1 (Guided caps ≤2/turn, forbids 3+ dumps) | ≤2 independent questions/turn | `discuss.md:199` ("≤2 independent questions per turn, one-at-a-time only when answers depend on each other"); `grep -c "3-4 questions"` repo-wide = 0 | ✅ PASS |
| SYNC-08 AC1 (Writing Voice present, Rules list retained) | section present, massa-ai extras intact | `coding-principles.md:84` (`## Writing Voice`); file is 96 lines (was 80 pre-diff, +16 insertions only — additive, no deletions per `git diff --stat`) | ✅ PASS |
| SYNC-09 AC1 (resume requires git reconciliation before next step) | reconciliation required before proposing next step | `memory.md:194` (Handoff = hypothesis), `memory.md:205` ("Propose the reconciled next step to the user before writing any code") | ✅ PASS |
| SYNC-10 AC1 (selftest exits 0, diacritic merge + non-Latin non-collision) | exit 0; PT diacritics merge; JP sentences distinct | `lessons.py:203-227` (`_selftest_norm`); direct re-run this session: `python3 lessons.py selftest` → exit 0 (confirmed via combined gate run of spec-driven-validators.test.ts T5 suite, part of the 41/41 pass) | ✅ PASS |
| SYNC-11 AC1 (regenerated artifacts resolve `deep`, subagent-parity passes) | every host's verification-agent → `deep` tier; parity test passes | `apps/claude-plugin/agents/massa-ai-verification-agent.md:5` (`model: opus`), `apps/codex-plugin/agents/massa-ai-verification-agent.toml` (`model = "gpt-5.6-sol"`), `apps/opencode-plugin/agents/massa-ai-verification-agent.md:4-5` (`model: opencode-go/minimax-m3`, `reasoningEffort: max`) — all match `skills/model-profiles.json:42,47,57` `"deep"` entries exactly for the `balanced` host-default profile; cursor stays `inherit` (cursor's tier table is `null` for every tier, documented CLAUDE.md quirk — no diff expected/found); `bun test scripts/__tests__/subagent-parity.test.ts` → 40/40 pass | ✅ PASS |
| SYNC-11 AC2 (rubric references model-profiles.json/charter tiers) | rubric cites the real mechanism | `sub-agents.md` — grepped for `model-profiles.json`/`metadata.model_tier` references (rubric section present per T16/T11 task scope; content sweep confirmed no free-floating table introduced) | ✅ PASS |
| SYNC-12 AC1 (`validate_state.py` detects verdict from Summary line without sensor sub-line) | literal `**Result**: PASS / FAIL` in template, detected independent of the sensor sub-line | `validate_state.py:53-72` (`_verdict()`) scans **every** line matching `**Result**:` case-insensitively, not just the Summary section — the Discrimination Sensor section (`validate.md:299` template) has its own mandated `**Result**: [N/N killed] — [PASS \| FAIL]` line. **Empirically falsified**: dogfooded against this very report (sensor genuinely `4/4 killed — PASS`, Summary genuinely `FAIL`) → `python3 validate_state.py tlc-330-harness-update` reports `"verdict is still the template placeholder [PASS \| FAIL] - not filled"` (exit 1, but wrong reason) instead of `"verdict is FAIL"`. Reproduced independently with a minimal synthetic fixture (2-line report, no extra noise) — same misclassification. See Fix 2. | ❌ **GAP** |
| SYNC-13 AC1 (facts/decisions rule, linter capture, AGENTS.md generalization all present) | each addition present, surrounding sections intact | `specify.md:85` ("Facts you look up; decisions you ask."); `tasks.md:77` (linter/formatter capture clause); `tasks.md:61` ("AGENTS.md (the vendor-neutral standard) and any tool-specific rules file") | ✅ PASS |
| BATCH-01 AC1 (4+ tasks fires offer before Execute) | offer fires at >3 tasks | `sub-agents.md:14`, `execute.md:38`, `workflows/spec-driven.md:97`, `tasks.md:355` — all state "more than 3 tasks" / ">3" as the trigger | ✅ PASS |
| BATCH-01 AC2 (zero live prose states old `>~8`, population printed) | scripted sweep, 0 matches | `/usr/bin/grep -rn '>~8\|more than one task-budgeted batch' skills/ apps/*/skills` (this session, raw grep not rtk) → **0 matches** (population printed beside verdict per AC wording) | ✅ PASS |
| GATE-01 AC1 (new stage in chain table, Propose names precondition) | stage present with command + failure behavior; Propose cites precondition | `implementation-delivery.md:25` (stage 3.5 row: command + failure behavior), `:26` (Propose row: "precondition: Stage 3.5") | ✅ PASS |
| GATE-02 AC1 (dirty/untracked/absent exits 1, names paths) | exit 1, paths named | `check_specs_delivered.py:99-112`; `spec-driven-validators.test.ts:732-775` (T6: dirty/untracked/absent-artifact fixtures all exit 1, path named e.g. `"FEATURES.json"`) | ✅ PASS |
| GATE-02 AC2 (clean+tracked exits 0, population printed) | exit 0, count+paths printed | `spec-driven-validators.test.ts:716-730` (clean fixture: exit 0, `"checked 4 path(s)"`); dogfood re-run this session: `check_specs_delivered.py tlc-330-harness-update` → exit 0, `"checked 6 path(s)"` (spec/design/tasks + STATE/HANDOFF/FEATURES.json — validation.md correctly absent from the checked set since it doesn't exist yet) | ✅ PASS |
| GATE-03 AC1 (prose requires GATE-02 green before PR) | workflow step names the gate as precondition | `workflows/spec-driven.md:120` (step 7: "committed before `gh pr create`" + names `check_specs_delivered.py`) | ✅ PASS |
| GEN-01 AC1 (`bun run test:scripts` → both parity suites pass, `--check` zero drift) | both parity suites pass in the real gate invocation | **See Gate Re-run section — this AC FAILS under the actual combined invocation.** Each suite passes in isolation (`spec-driven-validators.test.ts` 41/41, `subagent-parity.test.ts` 40/40, `skill-artifact-parity.test.ts` 19/19 alone), but when `spec-driven-validators.test.ts` and `skill-artifact-parity.test.ts` run in the **same** `bun test` invocation (exactly what `bun run test:scripts` does — one process over `scripts/__tests__`), `skill-artifact-parity.test.ts`'s internal `generate-skill-artifacts.ts --check` call fails: `scripts/__tests__/skill-artifact-parity.test.ts:28` — `expect(res.status).toBe(0)` received `1`, because `spec-driven-validators.test.ts`'s `Bun.spawnSync(["python3", ...])` calls (`spec-driven-validators.test.ts:46`) write `skills/massa-ai/scripts/__pycache__/*.pyc` into the **live source tree** as an uncontrolled side effect (no `-B` / `PYTHONDONTWRITEBYTECODE`), and `generate-skill-artifacts.ts --check`'s directory-inventory diff is not gitignore-aware, so it flags the ephemeral `.pyc` as "missing — regenerate and commit" from the 4 bundle copies. Reproduced deterministically 4/4 times across independent clean-porcelain trials (2-file and 3-file combinations, argument order irrelevant) | ❌ **GAP** |
| GEN-02 AC1 (inverting a validator's core check fails ≥1 test) | mutation kills ≥1 test | Discrimination sensor mutations 1 and 2 below — both killed | ✅ PASS |
| GEN-02 AC2 (template edit breaking validator structural expectation fails a C5 test) | template-conformance test goes red | `spec-driven-validators.test.ts:638-674` (C5 describe block); discrimination sensor mutation 4 below — killed | ✅ PASS |
| GEN-03 AC1 (CHANGELOG entry under `[Unreleased]`) | entry present | `CHANGELOG.md:8-24` (`### Changed` entry, "TLC spec-driven harness synced to 3.3.0...") | ✅ PASS |

**Status**: 27/29 ACs PASS with `file:line` evidence. 2 GAPs (GEN-01 AC1, SYNC-12 AC1) — both real, neither a spec-precision gap.

---

## Discrimination Sensor

All mutations run in an isolated `git worktree` scratch (`/tmp/scratch-tlc330`, created via `git worktree add <path> HEAD`), never `git stash`. Porcelain baseline captured before sensor work (empty) and re-verified empty after `git worktree remove --force` + cleanup — **confirmed match** (see Porcelain Baseline section).

| # | File:line | Description | Killed? |
| - | --- | --- | ------- |
| 1 | `skills/massa-ai/scripts/validate_spec.py:119` | Inverted SHALL detection: `has_shall = bool(re.search(...))` → `has_shall = True` (always true, defeats the entire AC1 check) | ✅ Killed — `spec-driven-validators.test.ts:137` ("SHALL-less acceptance criterion exits 1") went from expected 1 to received 0 |
| 2 | `skills/massa-ai/scripts/check_specs_delivered.py:108-110` | Disabled the tracked-on-HEAD conjunction: `if p not in tracked: errors.append(...)` → `pass` (defeats GATE-02's absence-must-fail requirement, the exact edge case the spec calls out) | ✅ Killed — `spec-driven-validators.test.ts:772` ("required artifact never written... exits 1") went from expected 1 to received 0 |
| 3 | `apps/claude-plugin/skills/massa-ai/references/spec-driven/validate.md:106` | Reverted the git-stash ban wording in **one bundle copy only** (source untouched): `**Forbidden:** \`git stash\`...` → `` `git stash` is fine to use here. `` | ✅ Killed — `bun run scripts/generate-skill-artifacts.ts --check` reported `[claude-plugin/skills/massa-ai] drift detected: M references/spec-driven/validate.md (content differs from source)`, exit 1 |
| 4 | `skills/massa-ai/references/spec-driven/specify.md:253` (within the fenced spec.md template block) | Renamed the template's `## Requirement Traceability` heading to `## Traceability Table` (still a valid-looking section name, breaks C5's literal-section-name assumption) | ✅ Killed — `spec-driven-validators.test.ts:642` ("specify.md's spec.md template block satisfies validate_spec.py's REQUIRED_SECTIONS") failed: expected template to contain `"## Requirement Traceability"`, not found |

**Sensor depth**: lightweight (4 targeted mutations across 4 distinct subjects — 2 validator core-check inversions, 1 cross-file bundle-drift, 1 template-conformance)
**Result**: 4/4 killed — PASS ✅

---

## Porcelain Baseline

- Captured before sensor work: `git status --porcelain` → empty (0 lines)
- Scratch: `git worktree add /tmp/scratch-tlc330 HEAD`, all 4 mutations applied and reverted/discarded there only
- Cleanup: `git worktree remove --force /tmp/scratch-tlc330`
- Re-verified after cleanup: `git status --porcelain` → empty (0 lines) — **matches baseline, run is valid**
- One incidental artifact required manual cleanup outside the scratch: `skills/massa-ai/scripts/__pycache__/*.pyc`, written into the **real worktree** by running the gate commands themselves (`bun test scripts/__tests__/spec-driven-validators.test.ts` against the live `skills/massa-ai/scripts/*.py`), not by the sensor. This is `.gitignore`d (`__pycache__/` at `.gitignore:11`) so it never appeared in `git status --porcelain`, but it is the same artifact class documented in the GEN-01 AC1 gap above. Removed with `rm -rf` before each subsequent gate command and before the final porcelain check; confirmed absent at close (`find skills/massa-ai/scripts -iname "__pycache__"` → no output).

---

## Gate Re-run (own exit codes, no pipes)

| Command | Exit code | Notes |
| --- | --- | --- |
| `bun test scripts/__tests__/spec-driven-validators.test.ts` (isolated) | 0 | 41/41 pass |
| `bun test scripts/__tests__/subagent-parity.test.ts` (isolated) | 0 | 40/40 pass |
| `bun test scripts/__tests__/skill-artifact-parity.test.ts` (isolated, clean pycache) | 0 | 19/19 pass |
| `bun test scripts/__tests__/subagent-parity.test.ts scripts/__tests__/skill-artifact-parity.test.ts` (combined, no spec-driven-validators) | 0 | 60/60 pass — confirms the parity suites don't collide with each other |
| `bun test scripts/__tests__/spec-driven-validators.test.ts scripts/__tests__/subagent-parity.test.ts scripts/__tests__/skill-artifact-parity.test.ts` (combined, matching real `test:scripts` shape) | **1** | 99/100 pass — `skill-artifact-parity.test.ts`'s `--check` subprocess assertion fails due to `__pycache__` pollution from the sibling suite (see GEN-01 AC1 gap). Reproduced 4/4 across independent trials |
| `bun run scripts/generate-skill-artifacts.ts --check` (isolated, clean pycache) | 0 | "No drift" |
| `bun run scripts/generate-skill-artifacts.ts --check` (immediately after spec-driven-validators.test.ts ran, pycache present) | 1 | Spurious drift: `scripts/__pycache__/lessons.cpython-314.pyc (missing — regenerate and commit)` in all 4 bundles — same mechanism |
| `bun run scripts/generate-subagent-artifacts.ts --check` | 0 | "No drift: generated files match checked-in files." |
| `python3 skills/massa-ai/scripts/validate_tasks.py tlc-330-harness-update` | 0 | 0 errors, 1 warning (T18 `Where` names 4 files — granularity smell warning only, not an error; T18 is a close-out/state task, not a code task, so multi-file `Where` is expected and non-blocking) |
| `python3 skills/massa-ai/scripts/check_specs_delivered.py tlc-330-harness-update` | 0 | 0 errors, 6 paths checked (spec/design/tasks + STATE/HANDOFF/FEATURES.json) |
| `python3 skills/massa-ai/scripts/validate_state.py tlc-330-harness-update` (dogfood, run against this very report after it was written) | 1 | Correctly non-zero (this report is FAIL), but with the WRONG diagnostic — reports `"template placeholder... not filled"` instead of `"verdict is FAIL"`. This is the live discovery of the SYNC-12 AC1 gap (Fix 2), not a mandated command in this checklist — recorded because it surfaced during report authoring |

**Scope limit recorded**: full `bun run test:scripts` was NOT run, per this feature's own documented native-tree-sitter-grammar provisioning gap in this worktree (unrelated to this feature's diff surface). The scoped suites above are this feature's actual gates per the workflow dispatch brief. However, the **combined 3-file run above independently reproduces the exact cross-suite interaction that the full `test:scripts` invocation would hit** (all three files load into the same `bun test scripts/__tests__ ...` process), so this scope limit does not weaken the GEN-01 AC1 finding — it is evidenced directly, not inferred.

---

## Deviation Audit

**(a) T1 — upstream AC-scanner blank-line fix.** `validate_spec.py:159-165` docstring: upstream TLC terminated the AC-SHALL scan on the first blank line after the `**Acceptance Criteria**:` header — but both massa-ai's and TLC's own templates put a blank line *between* the header and the first numbered item, making the upstream scan a silent no-op against any realistically-formatted spec (it would never read a single AC item). The port tracks `seen_item` and only lets a blank line end the block once an item has actually been seen. **Judgment: strengthens the contract.** This is a real, well-reasoned bug fix (traced to source line and template shape), not scope creep — it restores the AC's actual stated behavior ("SHALL exit 1 when... an AC lacks SHALL") which upstream's own logic could never trigger. Verified via T1's own test suite (`no-SHALL fixture exits 1` — a case that would be silently skipped under the un-patched logic given massa-ai's spec.md template shape).

**(b) T2 — phase-membership/diagram-check rework.** Two related upstream defects fixed in `validate_tasks.py`, both documented with reproduction evidence in the source docstrings (`parse_phase_membership:115-141`, `parse_diagram_order:168-186`):
  - Phase membership: upstream mapped a task header to whichever `Phase N` heading most recently preceded it while scanning the *whole file* — but massa-ai's (and TLC's own) template layout puts the Execution Plan diagram *before* the separate Task Breakdown section, so every task in Task Breakdown inherited the *last* phase seen in Execution Plan, making the forward-phase-dependency check (SYNC-01 AC2) permanently dead against the real template shape. Confirmed regression: "a template-shaped fixture then found 0/18 forward-phase violations detectable when it should catch a deliberately-introduced one."
  - Diagram-vs-definition: upstream compared the diagram to `Depends on` as an exact edge set, but the diagram documents execution *order* (`T1 → T2 → T3`), not a literal dependency graph (`T3`'s real dependency is often `T1`, not `T2`). Confirmed regression: "re-running the strict edge check against this feature's own live tasks.md... failed with 16 false positives."
  **Judgment: strengthens the contract.** Both fixes are evidenced against this feature's own live `tasks.md` as the reproduction fixture (dogfooding), and the weaker-but-correct invariant substituted (order-consistency within a phase) still catches the target defect class while not false-positiving on a template-compliant file. I independently re-derived the T2 fixture set (6 tests: dogfood, well-formed, missing-Gate, forward-dep, diagram-order-violation, unfenced-fallback) and confirmed each exercises the specific defect it claims to fix.

**(c) T16 — `subagent-parity.test.ts` `ALLOWED_MODEL_CHANGES` + `FEATURES.md` tier table edits.** Verified scope is exactly the authorized change and nothing else:
  - `scripts/__tests__/subagent-parity.test.ts` diff is **+3/-0 lines only** (`git diff --stat`): adds exactly `"claude/verification-agent"`, `"codex/verification-agent"`, `"opencode/verification-agent"` to the `ALLOWED_MODEL_CHANGES` array. `cursor/verification-agent` is correctly **absent** — cursor's model tables are `null` for every tier in `model-profiles.json` (cursor always resolves to `inherit`, documented CLAUDE.md quirk), so a `standard`→`deep` tier change produces no rendered diff on cursor and needs no allowlist entry. Confirmed: `apps/cursor-plugin/agents/massa-ai-verification-agent.md:4` still reads `model: inherit`.
  - `FEATURES.md` diff is **+1/-1 line only**: `| verification-agent | standard |` → `| verification-agent | deep |` in the role-tier table. No other row touched.
  Nothing else rode along in either file. **Judgment: correctly scoped, authorized change only.**

---

## Cross-file Consistency (C3)

- **Blast-radius clause**: extracted the full sentence (`"Approving Execute for this feature... even after that authorization."`) from `execute.md:344` and `workflows/spec-driven.md:30` — **byte-identical** (`diff` returned no output). Extended to all 4 bundle copies of both files (8 total occurrences) — all identical to source. 10 occurrences total, 0 divergent.
- **Gate-invocation lead-in** (`"run it, do not eyeball it"`): present in exactly 6 source files (`specify.md`, `execute.md`, `validate.md`, `sub-agents.md`, `tasks.md`, `workflows/spec-driven.md`) and their 24 bundle copies (6 × 4 hosts) — `grep -rl` count confirmed 24.
- **BATCH-01 old-threshold sweep**: `/usr/bin/grep -rn '>~8\|more than one task-budgeted batch' skills/ apps/*/skills` → 0 matches (population printed beside verdict, per spec wording).

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — copy-then-patch per D1, minimal deviations (each documented and evidenced above) |
| Surgical changes | ✅ — T16/T18 diffs scoped exactly to the authorized change (see Deviation Audit c) |
| No scope creep | ✅ — Out of Scope items (design.md, code-analysis.md, STATE.md single-file layout, auto-batch, parallel batches) untouched; confirmed no diff to any of those |
| Matches patterns | ✅ — validators follow `lessons.py`'s `--root` convention; new scripts are stdlib-only |
| Spec-anchored outcome check | ✅ — see AC table |
| Every test maps to a spec requirement | ✅ — Test Coverage Matrix (`tasks.md:18-32`) maps every task to a requirement + test file |
| Documented guidelines followed | `CONTRIBUTING.md` 7-step managed-harness protocol (skills change) — regeneration + `--check` gates run (D9/T16); discriminating tests present (D2, GEN-02) |

---

## Edge Cases

- [x] Multiple in-flight features → auto-detect errors listing candidates (verified: `_autodetect()` in `validate_spec.py`/`validate_tasks.py` raises `SystemExit` with the candidate list, never guesses)
- [x] `check_specs_delivered.py` on a branch where `.specs/` was never written → absence fails via tracked-on-HEAD check, not porcelain-clean pass (verified directly: discrimination mutation 2 above, and T6's "required artifact never written" fixture)
- [x] `check_commit.py` accepts massa-ai's `[JIRA-KEY] ` prefix (verified: `[SA-142] feat(auth): reject expired tokens` → exit 0)
- [ ] Fresh worktree native-grammar gap — out of scope for this feature's gates (documented, unrelated to this diff)
- [x] Generated bundles never hand-edited — all `apps/*-plugin/**` changes traced to generator runs (T16/T17), confirmed via `--check` clean except for the GEN-01 pollution gap

---

## Gate Check

- **Gate command**: `bun test scripts/__tests__/spec-driven-validators.test.ts` (per tasks.md Gate Check Commands)
- **Result**: 41 passed, 0 failed, 0 skipped (isolated); combined with both parity suites: 99 passed, 1 failed (see Gate Re-run)
- **Test count before feature**: 0 (new file, `spec-driven-validators.test.ts` did not exist at `e6b282c4`)
- **Test count after feature**: 41 (spec-driven-validators.test.ts) + 40 (subagent-parity, +3 lines but same test count) + 19 (skill-artifact-parity, unchanged)
- **Delta**: +41 new tests, all in new file
- **Skipped tests**: none
- **Failures**: 1 — `skill-artifact-parity.test.ts` "generator --check exits 0" when run in the same process as `spec-driven-validators.test.ts` (GEN-01 AC1 gap, detailed above)

---

## Fix Plans

### Fix 1: GEN-01 AC1 — `__pycache__` pollution breaks combined parity gate

- **Root cause**: `scripts/__tests__/spec-driven-validators.test.ts:46` spawns `python3 <real script path>` (not a copy) 40+ times across its test suite without disabling bytecode caching. CPython writes `skills/massa-ai/scripts/__pycache__/*.pyc` into the live source tree as a side effect. This directory is `.gitignore`'d so it never dirties `git status`, but `scripts/generate-skill-artifacts.ts --check`'s directory-inventory diff (used by `skill-artifact-parity.test.ts`) is not gitignore-aware and flags the newly-appeared `.pyc` as drift ("missing — regenerate and commit") in all 4 bundle copies. Because `bun run test:scripts` runs every file under `scripts/__tests__` in one `bun test` process, this pollution reliably occurs before `skill-artifact-parity.test.ts`'s own `--check` subprocess call executes.
- **Fix task**: Add `env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }` (or pass `-B` as the first arg after `python3`) to every `Bun.spawnSync(["python3", ...])` call in `spec-driven-validators.test.ts` (the `runPy` helper at line 42-52, plus the one other inline `git`/`python3` spawn near line 565). As defense-in-depth, also consider making `generate-skill-artifacts.ts`'s directory enumeration skip `__pycache__/` (matching `.gitignore`) so a future similarly-shaped artifact can't reproduce this class of failure.
- **Priority**: Blocker — this breaks the mandatory CI `build` job's `bun run test:scripts` step as currently written, and directly contradicts GEN-01 AC1's literal wording.

---

### Fix 2: SYNC-12 AC1 — `validate_state.py` misdetects a genuine FAIL as an unfilled template

- **Root cause**: `_verdict()` in `validate_state.py:53-72` builds its detection `hay` from **every** line in the whole document matching `**Result**:` (case-insensitive), not scoped to the `## Summary` section. The template itself (`validate.md`'s own Validation Report Template) mandates a *second*, independent `**Result**: [N/N killed] — [PASS ✅ | FAIL ❌]` line inside the Discrimination Sensor section (`validate.md:299`). Whenever a report's discrimination sensor genuinely passes (`... — PASS ✅`) while the overall Summary verdict is genuinely `FAIL` for an unrelated reason (exactly this report's own case: sensor 4/4 killed, but GEN-01 AC1 fails independently) — or the symmetric inverse — both `PASS` and `FAIL` appear among the matched candidate lines, and the `has_pass and has_fail` branch returns `"unfilled"` instead of the correct verdict. This is precisely the case SYNC-12 AC1 names as the thing to avoid ("without relying on the sensor sub-line"), and it is not scoped correctly. Confirmed independently with a 2-line minimal fixture (no other noise): sensor `**Result**: 3/3 killed — PASS ✅` + Summary `**Result**: FAIL` → tool reports `"still the template placeholder '[PASS | FAIL]' - not filled"`.
- **Impact**: the exit code still happens to be non-zero (1) for a FAIL report, so the gate does not silently pass a real FAIL — but the **diagnostic message is actively wrong**, telling the agent the report is unfilled when it is in fact a correctly-written FAIL. This corrupts the signal SYNC-12 was written to guarantee, and would recur on any future feature where the sensor passes but the overall verdict is FAIL for an unrelated gap (a very common, not edge-case, shape).
- **Fix task**: Scope `_verdict()`'s candidate-line search to the `## Summary` section only (find that heading's bounds the same way `validate_spec.py`'s `section_bounds()` does, or anchor on the literal `**Result**:` line that immediately follows a `## Summary` heading), so a sensor sub-line elsewhere in the document can never influence the detected verdict. Add a regression fixture to `spec-driven-validators.test.ts`'s T4 suite: a report with a passing sensor sub-line and a FAIL Summary line (and the symmetric case) must resolve to `"verdict is FAIL"`, not `"template placeholder"`.
- **Priority**: Major — does not defeat the gate's blocking behavior (exit code stays non-zero), but actively misleads on root cause for a realistic, non-edge-case report shape.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| SYNC-01 through SYNC-11, SYNC-13 | Implementing | ✅ Verified |
| SYNC-12 | Implementing | ❌ Needs Fix (AC1 gap — see Fix 2) |
| BATCH-01 | Implementing | ✅ Verified |
| GATE-01, GATE-02, GATE-03 | Implementing | ✅ Verified |
| GEN-01 | Implementing | ❌ Needs Fix (AC1 gap — see Fix 1) |
| GEN-02, GEN-03 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues
**Result**: FAIL

**Spec-anchored check**: 27/29 ACs matched spec outcome — 2 gaps (GEN-01 AC1, SYNC-12 AC1)
**Sensor**: 4/4 mutations killed
**Gate**: isolated suites all green (100/100 across 3 files run separately); combined invocation matching the real `bun run test:scripts` shape: 99/100 (1 failure, reproduced 4/4 across independent trials)

**What works**: All 4 ported validator scripts (with 2 documented, evidenced, contract-strengthening deviations from upstream), the new `check_specs_delivered.py`, the `lessons.py` Unicode fix, 12 of 13 prose-wiring requirements (SYNC-02 through SYNC-11, SYNC-13), the batch-trigger lowering (BATCH-01), the deliver-specs-before-PR gate (GATE-01/02/03), and the verification-agent deep-tier pin with correctly-scoped regenerated artifacts (SYNC-11, deviation c). The discrimination sensor confirms all four subject classes (validator core-check, cross-file bundle-drift, template-conformance, and — implicitly, via the T2 test suite — the phase-membership fix) are real regressions the test suite can detect.

**Issues found**:
1. GEN-01 AC1 fails under the actual `bun run test:scripts` execution shape due to `__pycache__` pollution from the new test harness's unguarded `python3` subprocess spawns colliding with the skill-bundle drift checker. Fix is narrow and localized to the test harness (Fix 1 above) — does not implicate any validator logic or prose content.
2. SYNC-12 AC1's `validate_state.py` misdetects a genuine, correctly-written FAIL report (this report, dogfooded live) as an unfilled template placeholder, because `_verdict()` scans the whole document for `**Result**:` lines instead of scoping to the `## Summary` section, and the template's own mandatory Discrimination Sensor sub-line collides with it whenever the sensor and overall verdicts diverge (Fix 2 above). This was discovered by running the closing gate against this very report, not by inspection.

**Next steps**: Route Fix 1 and Fix 2 to an implementer (both single-file, narrow, non-overlapping: `spec-driven-validators.test.ts` spawn helpers for Fix 1, `validate_state.py`'s `_verdict()` scoping plus one new T4 regression fixture for Fix 2), then re-run the combined 3-file gate and the `validate_state.py` dogfood check to confirm both fixes, then re-verify.
