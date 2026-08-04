# TLC 3.3.0 Harness Update Validation

**Date**: 2026-08-04
**Spec**: `.specs/features/tlc-330-harness-update/spec.md`
**Diff range**: `e6b282c4..98f76d0f` (HEAD, includes iteration-2 fix commits 19ebe0cd, 98f76d0f)
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

**Overall**: ❌ Needs Fix (iteration 3 — Phase 5 amendment)
**Result**: FAIL

**Spec-anchored check**: 30/33 ACs matched spec outcome (iterations 1-2 base: 27/29; Phase 5 amendment adds ALLWF-01/02/03 + PYTS-01 = 4 more ACs, 3 PASS) — 1 open gap (PYTS-01 AC1, iteration 3)
**Sensor**: 6/6 mutations killed (4 from iterations 1-2 + 2 new in iteration 3)
**Gate**: isolated suites all green (100/100 across 3 files run separately in iterations 1-2); combined invocation matching the real `bun run test:scripts` shape: 99/100 in iteration 1 (1 failure, closed by FT1); iteration 3's scoped gate re-run (validators + both parity suites + both generator `--check` + lint + 3 python validators, run individually, own exit codes, no pipes) is 10/10 green, no regression

**What works**: All 4 ported validator scripts (with 2 documented, evidenced, contract-strengthening deviations from upstream), the new `check_specs_delivered.py`, the `lessons.py` Unicode fix, 12 of 13 prose-wiring requirements (SYNC-02 through SYNC-11, SYNC-13), the batch-trigger lowering (BATCH-01), the deliver-specs-before-PR gate (GATE-01/02/03), and the verification-agent deep-tier pin with correctly-scoped regenerated artifacts (SYNC-11, deviation c). The discrimination sensor confirms all four subject classes (validator core-check, cross-file bundle-drift, template-conformance, and — implicitly, via the T2 test suite — the phase-membership fix) are real regressions the test suite can detect.

**Issues found (iteration 1, now resolved)**: two gaps were opened at iteration 1 review, both closed at iteration 2 with reproduced evidence, a killed discrimination mutation, and a new regression fixture — see the "Iteration 2" section below for the closure evidence. One new non-blocking informational finding (IT2-01, a task-header ID-recognition quirk in validate_tasks.py) surfaced during iteration 2's no-regression sweep and is recorded there.

**Next steps (iteration 3)**: route a fix task to correct `python-to-typescript-scripts/spec.md`'s Problem Statement and PTS-04 wiring-ripple population (currently "24 prose sites across 12 skill files", measured 41 sites / 25 files by raw sweep — see Iteration 3 section below) before that spec is treated as authoritative scope for Design. IT2-01 remains a future minor fix task at the team's discretion; it does not block this feature.

---

## Iteration 2 (re-verification)

**Fix commits audited**: `19ebe0cd` (FT1), `98f76d0f` (FT2). Full diff range `e6b282c4..98f76d0f`.
**Porcelain baseline**: `git status --porcelain` empty before and after all work (0 lines both checks).

### Gap 1 (GEN-01 AC1, blocker) — CLOSED

`spec-driven-validators.test.ts`'s two `python3` spawn sites (`runPy` helper line 48, `normOf` helper line ~597) both pass `-B` — confirmed by direct grep of the file (`grep -n "spawnSync\|python3"`). `generate-skill-artifacts.ts:105-110` `walkFiles` now skips any directory literally named `__pycache__` before recursing, as defense-in-depth.

Reproduced the original failure shape twice, own exit codes:

| Command | Run 1 | Run 2 |
| --- | --- | --- |
| `bun test scripts/__tests__/spec-driven-validators.test.ts scripts/__tests__/subagent-parity.test.ts scripts/__tests__/skill-artifact-parity.test.ts` | exit 0, 101/101 pass | exit 0, 101/101 pass |
| `find skills -iname "__pycache__"` (post-run) | no output | no output |
| `bun run scripts/generate-skill-artifacts.ts --check` (immediately after) | exit 0, "No drift" | — |

**Judgment on the generator skip**: `walkFiles`'s new guard is an exact string match on the directory name `__pycache__` (`entry.name === "__pycache__"`), applied at any recursion depth. It cannot mask any other drift class — a renamed, moved, or content-changed real bundle file still has a different `entry.name` or content hash and is still walked and diffed normally. The skip only ever suppresses the one ephemeral CPython artifact class it names. Confirmed by reading `generate-skill-artifacts.ts:105-119` directly.

**Verdict: closed, no residual risk.**

### Gap 2 (SYNC-12 AC1, major) — CLOSED

`validate_state.py`'s `_verdict()` now scopes its `**Result**:` search to the `## Summary` section's own lines when that section carries a `**Result**:` line of its own, falling back to whole-document scan only when the Summary section has no such line (`skills/massa-ai/scripts/validate_state.py:53-72`).

Three fixtures built independently in temp roots (not reusing the test file's fixtures), run via `python3 -B skills/massa-ai/scripts/validate_state.py --root <tmp>`:

| Fixture | Shape | Expected | Observed | Exit |
| --- | --- | --- | --- | --- |
| (a) diverging | Summary `**Result**: FAIL` + Discrimination Sensor `**Result**: 3/3 killed — PASS ✅` | diagnose "verdict is FAIL" | `ERROR my-feature: validation.md verdict is FAIL - route the ranked gaps to fix tasks...` | 1 |
| (b) genuine unfilled | Summary `**Result**: [PASS \| FAIL]` (literal template placeholder) | diagnose "template placeholder" | `ERROR my-feature: validation.md verdict is still the template placeholder '[PASS \| FAIL]' - not filled` | 1 |
| (c) clean PASS+evidence | Summary `**Result**: PASS` + one `file:line` citation | exit 0 | `validate_state: 0 error(s) across [my-feature]` | 0 |

All three diagnose correctly — the diverging fixture (the exact regression shape) no longer collapses into the wrong "unfilled" branch.

**Bundle parity**: `diff -q` confirms `skills/massa-ai/scripts/validate_state.py` is byte-identical to all 4 `apps/*-plugin/skills/massa-ai/scripts/validate_state.py` copies; `bun run scripts/generate-skill-artifacts.ts --check` exits 0 ("No drift").

**Verdict: closed, no residual risk.**

### No-regression full gate set

| Command | Exit | Notes |
| --- | --- | --- |
| `bun test scripts/__tests__/{spec-driven-validators,subagent-parity,skill-artifact-parity}.test.ts` (combined, ×2) | 0, 0 | 101/101 pass both runs |
| `bun run scripts/generate-skill-artifacts.ts --check` | 0 | "No drift" |
| `bun run scripts/generate-subagent-artifacts.ts --check` | 0 | "No drift: generated files match checked-in files." |
| `python3 -B skills/massa-ai/scripts/validate_tasks.py tlc-330-harness-update` | 0 | 0 errors, 1 warning — see finding IT2-01 below |
| `python3 -B skills/massa-ai/scripts/check_specs_delivered.py tlc-330-harness-update` | 0 (mid-session), then 1 (final) | Ran clean (0 errors, 7 paths checked) against the `98f76d0f` HEAD state before this report's own iteration-2 edits landed. After writing this report's Iteration 2 / IT2-01 / IT2-02 sections (this file is the one artifact this verifier is permitted to write), the check correctly flags `M .specs/features/tlc-330-harness-update/validation.md` as uncommitted — this is the documented expected-at-this-stage case: the orchestrator commits `validation.md` after a PASS verdict is returned, and this is a real, distinct-from-defect uncommitted-report state, not a new gap |

### New finding (informational, non-blocking): IT2-01

`validate_tasks.py`'s `TASK_RE = r"^#{2,4}\s+(T\d+)\s*:"` requires the digit group to start immediately after the heading whitespace, so `### FT1: ...` / `### FT2: ...` (the two fix-task headers this very iteration's tasks.md added under "Phase 4") do **not** match — confirmed directly: `TASK_RE.match("### FT1: ...")` returns `None`. Because `parse_tasks()` only advances its `current` task pointer on a `TASK_RE` match, both FT1's and FT2's `Where`/`Depends on`/`Tests`/`Gate` lines are silently folded into the *previous* recognized task's record (`T18`, the last real `### T\d+:` header before Phase 4), last-line-wins. This is why the one WARN observed above (`T18: 'Where' names multiple files [...]`) actually quotes FT2's `Where` field content, not T18's real one (`CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/project/FEATURES.json`) — reproduced with a standalone regex check (`EDGE_RE = r"\bT\d+\b"` also cannot extract `T1`/`T2` from `FT1`/`FT2` since there is no word boundary between `F` and `T`, so `FT2`'s `Depends on: FT1` line contributes zero edges to the graph either).

**Impact assessed as non-blocking**: exit code stays 0 either way (this is a WARN, not an ERROR); no AC in the 29-row acceptance table names an `FT`-prefixed task ID convention or requires `validate_tasks.py` to recognize one; SYNC-01 AC2's forward-phase-dependency behavior is proven independently by the isolated T2 test suite using `T`-prefixed fixtures, which is unaffected. FT1 and FT2 are simply invisible to the task-graph checks (no phase-membership check, no dependency-edge check, no per-task Gate-field-presence check applies to them), and the one WARN that does fire is misattributed to T18 rather than absent — mechanically the same class of "content leaking across an unrecognized section boundary" as the original SYNC-12 gap, but in a different script, on a different subject (task headers, not verdict lines), and not named by any AC. Recommend routing as a future minor fix task (`parse_tasks()` should either recognize an `FT\d+` prefix as its own task-graph member, or `TASK_RE` should require the `#{2,4}\s+` prefix followed by a heading that is *either* `T\d+` or `FT\d+`), not part of this iteration's gap closure.

### Discrimination mutation (item 4)

Isolated scratch: `git worktree add /tmp/scratch-tlc330-iter2 HEAD` (never `git stash`). Reverse-applied exactly FT2's diff to `skills/massa-ai/scripts/validate_state.py` only (test file untouched, keeping the new regression fixture live), then ran the new regression test against the reverted subject:

```
bun test scripts/__tests__/spec-driven-validators.test.ts -t "diverging sensor PASS sub-line reads as FAIL"
```

Result: exit 1, 0 pass / 1 fail — `expect(r.stdout).toContain("verdict is FAIL")` received the pre-fix `"...still the template placeholder '[PASS | FAIL]' - not filled"` text instead. **Mutation killed** — the new regression fixture is discriminating against exactly the reverted defect, not vacuously green.

Cleanup: `git worktree remove --force /tmp/scratch-tlc330-iter2`; `git status --porcelain` re-verified empty (0 lines) — matches the pre-work baseline.

### New finding (informational, non-blocking): IT2-02

Dogfooding this very report against `validate_state.py` (after writing the Iteration 2 sections above but before this note) initially misdiagnosed a genuinely-PASS `## Summary` as "template placeholder" — not via the sensor-sub-line mechanism FT2 fixes (that regression fixture passes), but because the Summary section's own body still carried iteration-1 prose that quoted the literal `` `**Result**:` `` string and the word "FAIL" while narrating the (by-then-resolved) SYNC-12 bug. `_verdict()`'s Summary-scoped candidate filter matches `result_re` via unanchored `re.search` against every line in the Summary section, not only lines that themselves declare a verdict, so a prose sentence quoting the trigger phrase as documentation reads as a second, conflicting candidate line — the classic "the docblock disclaiming a scanner's trigger literal is what the scanner matches" shape. This is a distinct case from what SYNC-12 AC1 names (an actual dedicated sensor sub-line elsewhere in the document) and does not reopen SYNC-12 AC1's closure — the regression fixture for that exact case still passes. Resolved here by editing this report's own stale iteration-1 "Issues found" prose to stop quoting the trigger phrase (see the Summary section above); re-ran the dogfood check after the edit — exit 0. Recommend, as a future minor robustness improvement (not blocking, not part of this iteration's gap closure): anchor `result_re`'s candidate match to lines that consist essentially of the verdict declaration itself (e.g. `^\*{0,2}result\*{0,2}\s*:`, matching at line start after stripping), rather than `re.search` anywhere in a full prose line.

### Iteration 2 verdict

Both prior gaps (GEN-01 AC1 blocker, SYNC-12 AC1 major) are closed with reproduced evidence and a killed discrimination mutation for the SYNC-12 fix. One new non-blocking informational finding (IT2-01) surfaced during the mandated no-regression gate re-run; it does not defeat any spec-anchored AC and does not affect the closed gaps' evidence. **Overall verdict: PASS.**

---

## Iteration 3 (re-verification — Phase 5 amendment)

**Role**: independent verifier (author ≠ verifier), deep tier. **Scope**: T19-T22 only (ALLWF-01, ALLWF-02, ALLWF-03, PYTS-01). Iterations 1-2's PASS verdict for T1-T18 + FT1/FT2 is not re-litigated; only no-regression is re-confirmed via the gate re-runs below.

**Commits audited**: T19 `e751c777`, T20 `277ec7a5`, T21 `b291b0fb`, T22 `11747f27`. Range `4efa7013..11747f27`.
**Porcelain baseline**: `git status --porcelain` empty before all work (0 lines) and empty after cleanup (0 lines) — matched.

### ALLWF-01 (Verify, don't assume; documentation is a lead, not truth) — PASS

`skills/massa-ai/SKILL.md` Core Contract carries both bullets once (`SKILL.md:65-73`): "Verify, don't assume" + "Ask when in doubt", each stated exactly once (`grep -c` confirmed 1 occurrence of each trigger phrase in source). Independent sweep of every "Project docs" KVC site in `skills/massa-ai/` (not inherited from the 4-site count in spec.md/design.md D10 — re-derived from scratch via `/usr/bin/grep -rn "Project docs" skills/`): exactly 4 sites, all 4 carry the `(leads, not truth)` / `verify against current source before relying` qualifier, 0 without it:

- `skills/massa-ai/references/spec-driven/design.md:47`
- `skills/massa-ai/references/spec-driven/design.md:113`
- `skills/massa-ai/workflows/spec-driven.md:154`
- `skills/massa-ai/workflows/exploration.md:25`

Also swept every file that mentions "Knowledge Verification Chain" by name (`discuss.md`, `design.md`, `specify.md`, `workflows/spec-driven.md`, `workflows/exploration.md`) to confirm no additional KVC step definition exists outside the swept 4 sites — `discuss.md` and `specify.md` only reference the chain, they do not restate its steps, so they carry no independent "Project docs" site. Population confirmed closed at 4/4, matching D10's count independently.

Bundle parity: `diff skills/massa-ai/SKILL.md apps/{claude,codex,cursor,opencode}-plugin/skills/massa-ai/SKILL.md` — byte-identical, all 4 hosts.

### ALLWF-02 (In doubt, ask the user) — PASS

Core Contract's "Ask when in doubt" bullet (`SKILL.md:71-74`) contains the facts-vs-decisions boundary verbatim: "Facts are looked up; decisions are asked." Present once, correctly placed beside the verify-don't-assume rule.

### ALLWF-03 (Read-only and verification subagents always use the heaviest tier) — PASS

Independent tier census of all 17 charters under `skills/agents/*/SKILL.md` (re-derived from scratch, not inherited from spec.md's claim):

| Tier | Count | Roles |
| --- | --- | --- |
| `deep` | 14 | architecture-specialist, audit-specialist, context-curator, furps-analyst, investigator, judge, meta-judge, mobile-specialist, navigator, plan-critic, planner, requirements-analyst, reviewer, verification-agent |
| `standard` | 2 | builder, test-engineer |
| `light` | 1 | documentation-agent |

14 + 2 + 1 = 17, matches the expected "14 deep + builder/test-engineer standard + documentation-agent light" shape exactly. All 8 ALLWF-03-named charters (audit-specialist, context-curator, furps-analyst, investigator, mobile-specialist, navigator, requirements-analyst, reviewer) confirmed `deep`.

Regenerated per-host artifact resolution spot-checked for 2+ of the 8 bumped roles against `skills/model-profiles.json`'s `balanced` profile (own re-derivation, not assumed):

- `apps/claude-plugin/agents/massa-ai-audit-specialist.md:5` → `model: opus` — matches `profiles.balanced.hosts.claude.deep.model = "opus"`.
- `apps/codex-plugin/agents/massa-ai-audit-specialist.toml:4` → `model = "gpt-5.6-sol"` — matches `profiles.balanced.hosts.codex.deep.model = "gpt-5.6-sol"`.
- `apps/claude-plugin/agents/massa-ai-navigator.md:5` → `model: opus` — matches deep tier.
- `apps/opencode-plugin/agents/massa-ai-requirements-analyst.md:4` → `model: opencode-go/minimax-m3` — matches `profiles.balanced.hosts.opencode.deep.model`.

`sub-agents.md` D5 rubric extension confirmed present (`sub-agents.md:171,176`): new "Read-only specialist" row + "Read-only specialists always run on the deepest tier" rule-of-thumb bullet, generalizing the existing Verifier rule.

`FEATURES.md` role→tier table (`FEATURES.md:401-417`) confirmed to list all 8 bumped roles as `deep`, no stale `standard`/`light` row remaining for any of the 8.

### PYTS-01 (New python-to-typescript-scripts spec) — GAP (AC1)

**8-script population**: independently re-enumerated via `find` (not inherited from spec.md's claim): `skills/massa-ai/scripts/{check_commit,check_specs_delivered,lessons,validate_spec,validate_state,validate_tasks}.py` (6) + `scripts/{synapse-bench-analyze-v2,update-fixture-hashes}.py` (2) = 8, matching spec.md's Problem Statement and Requirement Traceability table exactly. `packages/core/src/__tests__/e2e/fixtures/polyglot/indent-method.py` correctly excluded as a parser fixture, not a script — confirmed it is real test data (referenced by e2e tests, not invoked as a CLI tool). `.specs/project/FEATURES.json` entry: `slug: "python-to-typescript-scripts"`, `status: "planned"`, valid JSON (60 total features in the array, `python3 -c "import json; json.load(open('.specs/project/FEATURES.json'))"` parses clean). PTS-01 through PTS-06 requirement IDs present with SHALL-bearing, EARS-tagged ACs; `python3 -B skills/massa-ai/scripts/validate_spec.py python-to-typescript-scripts` exits 0 (0 errors, 0 warnings) — structural checks pass.

**Wiring-ripple accuracy — FAILS AC1's literal wording.** PYTS-01 AC1 requires the spec to "name the wiring ripple (every `python3` invocation in skill prose + tests + this feature's validators)". The spec's Problem Statement and PTS-04 both state: *"`python3` invoked at 24 prose sites across 12 skill files"*. Independently re-measured (own sweep, `/usr/bin/grep`, never rtk, population printed):

```
/usr/bin/grep -rn "python3" skills/massa-ai/ --include="*.md" | wc -l   → 41 lines
/usr/bin/grep -rl "python3" skills/massa-ai/ --include="*.md" | wc -l   → 25 files
```

Even narrowing to only sites that name one of the 8 target scripts (excluding `evidence-gate.md:41`'s unrelated `skill-architect/scripts/validate_skill.py` reference and the 3 ad-hoc `python3 -c` JSON-mutation snippets in `artifact-store.md`/`mcp-tools.md` that don't name a target script) still yields **36 sites across 23 files** — the bulk of the undercount is the "distill after writing → lessons.py add" boilerplate line, which recurs identically in 11 separate `workflows/*-fix.md` files (`debug.md`, `security-fix.md`, `maestro-fix.md`, `general.md` ×2, `tests-fix.md`, `bugs-fix.md`, `mobile-figma-fix.md`, `requirements-fix.md`, `architecture-fix.md`, `refactor.md`, `implementation-fix.md`, `code-quality-fix.md`, `feature.md`) plus `lessons.md` (×4) and `workflows/spec-driven.md` (×2), none of which spec.md's stated count appears to have swept. There is also at least one wiring site the literal `python3` grep itself cannot see: `execute.md:311`'s `ln -sf skills/massa-ai/scripts/check_commit.py .git/hooks/commit-msg` commit-msg-hook symlink target — a real rewiring site PTS-04 names in prose ("the commit-msg-hook prose") but which contributes zero to a `python3`-keyed count, meaning even 41/25 is a floor, not a ceiling.

The `python3` count in `scripts/__tests__/spec-driven-validators.test.ts` (3 sites) and the single `package.json:42` site are both independently confirmed accurate.

**Population comparison**:

| Metric | spec.md claim | Measured (raw) | Measured (target-script-scoped) |
| --- | --- | --- | --- |
| Prose sites | 24 | 41 | 36 (+ ≥1 non-`python3`-literal hook site) |
| Skill files | 12 | 25 | 23 |

This is not a rounding difference — the claimed figure undercounts sites by ~40-70% and files by over half. Per this same PR's own new ALLWF-01 rule ("every factual claim that drives a decision is verified against current codebase/command evidence... unverifiable claims become explicit assumptions the user confirms or accepts"), a wiring-ripple count that drives a future feature's scope estimate is exactly the class of claim that rule exists to police, and this specific claim was not verified against source before being written twice into the same spec (Problem Statement + PTS-04) and repeated a third time in `FEATURES.json`'s title field for the entry.

**Impact**: `validate_spec.py`'s structural check (SHALL presence, EARS shape, required sections) cannot and does not catch this — it has no way to verify a prose-embedded numeric claim against the live repo, so PYTS-01's clean `validate_spec.py` exit is correctly orthogonal to this finding, not contradicted by it. The gap does not affect PTS-04 AC1's own execution-time correctness (that AC requires "the repo is swept after migration" with "population printed beside the verdict" — a fresh, live sweep at Design/Execute time of the future feature, not a reliance on this stale Specify-phase number), so it is not a blocker for this PR's mergeability and does not reopen any of iterations 1-2's closed gaps. It is a genuine AC1 defect in the delivered Specify artifact.

**Fix task recommendation**: before `python-to-typescript-scripts` proceeds to Design, correct the Problem Statement and PTS-04 body text with an accurate, scripted-sweep-derived population (41 sites / 25 files raw, or 36/23 target-scoped plus the named non-literal hook site — Design should pick and state the scoping rule), printed beside the requirement per this feature's own established "population printed beside the verdict" discipline (BATCH-01 AC2, D6).

### Deviation Audit — T20 `subagent-parity.test.ts` changes

Diff-scoped review of `scripts/__tests__/subagent-parity.test.ts` (`git diff --stat e751c777..277ec7a5` → 64 insertions, 2 deletions):

- **`ALLOWED_MODEL_CHANGES` set**: 22 new entries added, comment-annotated as ALLWF-03/T20. Verified against the authorized population: 8 bumped charters × 3 hosts (claude/codex/opencode) = 24 combinations; `claude/navigator` and `opencode/requirements-analyst` were already present in the set from an earlier, unrelated change and are correctly *not* re-added (comment confirms this); Cursor is excepted wholesale by the surrounding test's own pre-existing `if (host === "cursor") continue` line (cursor always resolves `inherit` — no charter tier change ever produces a cursor diff). 24 − 2 = 22 new entries — exact match, 0 missing, 0 extra, 0 for an unauthorized role.
- **"every enumerated change actually happened" test**: exactly 2 pre-existing assertions updated (not deleted) — `claude/navigator`: `"haiku"` → `"opus"` (navigator was `light`→`deep`; claude balanced light=haiku, deep=opus — both values independently confirmed against `model-profiles.json`); `opencode/requirements-analyst`: `"opencode-go/glm-5.2"` → `"opencode-go/minimax-m3"` (requirements-analyst was `standard`→`deep`; opencode balanced standard=glm-5.2, deep=minimax-m3 — both confirmed). 6 new sanity-check pairs added (audit-specialist/claude, context-curator/codex, furps-analyst/opencode, investigator/claude, mobile-specialist/codex, reviewer/claude), each independently re-derived against `model-profiles.json` and confirmed correct in this session (see ALLWF-03 spot-checks above, which reuse 2 of these 6).
- **No assertion weakened or deleted**: the only deletions in the diff (2 of the reported "2 deletions") are the two stale literal values replaced above; every other line in the diff is a pure addition. `FEATURES.md`'s role→tier table diff is exactly the 8 authorized rows (`investigator`, `reviewer`, `context-curator`, `requirements-analyst`, `audit-specialist`, `mobile-specialist`, `furps-analyst`, `navigator`), confirmed no other row touched.

**Verdict: correctly scoped, no weakening, no deletion.**

### Discrimination sensor (scratch state, `git worktree`, never `git stash`)

Porcelain baseline: 0 lines before, 0 lines after (matched, confirmed twice — before scratch worktree creation and after removal).

**Mutation 1 — revert one bumped charter's tier.** In `/tmp/verif-iter3/scratch` (git worktree at HEAD, node_modules symlinked from the real workspace root for test execution only, never committed): reverted `skills/agents/navigator/SKILL.md`'s `model_tier: deep` back to `standard`. Ran `bun test scripts/__tests__/subagent-parity.test.ts` → **exit 1**, 35 pass / 5 fail (Claude/Codex/OpenCode model-pin mismatches + `FEATURES.md` doc-drift test, all correctly attributing the failure to the reverted navigator tier). **Killed.**

**Mutation 2 — strip the leads-not-truth qualifier from one KVC site in a scratch bundle copy only (source untouched).** Edited `apps/claude-plugin/skills/massa-ai/workflows/exploration.md` in the scratch worktree to remove `(leads, not truth)`, leaving `skills/massa-ai/workflows/exploration.md` (source) unchanged — a deliberate source-vs-bundle divergence. Two independent gates both caught it:

- `bun run scripts/generate-skill-artifacts.ts --check` → **exit 1**, correctly reports `[claude-plugin/skills/massa-ai] drift detected: M workflows/exploration.md (content differs from source)`.
- `bun test scripts/__tests__/skill-artifact-parity.test.ts` → **exit 1**, 18 pass / 1 fail on the "generator --check exits 0" assertion.

**Killed** by both gates independently.

Both mutations reverted in scratch (`.bak` files restored / worktree discarded); `git worktree remove --force`; main worktree `git status --porcelain` re-verified empty (0 lines) post-cleanup, matching the pre-work baseline exactly.

**Sensor result: 2/2 mutations killed.**

### Gate re-runs (own exit codes, no pipes; full `test:scripts` not run per the documented native-grammar provisioning gap, unrelated to this diff)

| Command | Exit | Result |
| --- | --- | --- |
| `bun test scripts/__tests__/spec-driven-validators.test.ts` | 0 | 42 pass, 0 fail |
| `bun test scripts/__tests__/subagent-parity.test.ts` | 0 | 40 pass, 0 fail |
| `bun test scripts/__tests__/skill-artifact-parity.test.ts` | 0 | 19 pass, 0 fail |
| `bun run scripts/generate-skill-artifacts.ts --check` | 0 | "No drift" |
| `bun run scripts/generate-subagent-artifacts.ts --check` | 0 | "No drift" |
| `bun run lint` | 0 | oxlint clean |
| `python3 -B skills/massa-ai/scripts/validate_spec.py tlc-330-harness-update` | 0 | 0 errors, 0 warnings |
| `python3 -B skills/massa-ai/scripts/validate_spec.py python-to-typescript-scripts` | 0 | 0 errors, 0 warnings |
| `python3 -B skills/massa-ai/scripts/validate_tasks.py tlc-330-harness-update` | 0 | 0 errors, 3 warnings — same pre-existing IT2-01 shape (FT1/FT2 header-recognition folding), no new warning introduced by T19-T22 (all four are `T\d+`-shaped and parse correctly; confirmed T21/T22's own WARN rows quote their own true `Where` fields, not a neighbor's) |
| `python3 -B skills/massa-ai/scripts/check_specs_delivered.py tlc-330-harness-update` | 0 | 0 errors, 7 paths checked |

No regression against iterations 1-2's closed gaps (GEN-01 AC1, SYNC-12 AC1 both remain closed — re-exercised implicitly by the clean parity + generator runs above).

### Secondary observation (informational, non-blocking, pre-existing, not introduced by Phase 5)

`.specs/project/FEATURES.json`'s `tlc-330-harness-update` entry (`status: "in_progress"`) still carries T18-era notes text ("Not yet independently validated -- validation.md intentionally absent at this commit") that predates iterations 1-2 (last touched at `7ab4fbcb`, before FT1/FT2 and both prior validation iterations). T22's own `tasks.md` `Where` field scopes it to `CHANGELOG.md`, `STATE.md`, `HANDOFF.md`, `validation.md` only — `FEATURES.json` was never in T22's contract, so this is not a Phase-5 regression and not scored against ALLWF-01/02/03/PYTS-01. Flagged for awareness only; does not affect this iteration's verdict.

### Iteration 3 verdict

ALLWF-01, ALLWF-02, ALLWF-03 all independently re-verified PASS with fresh, from-scratch population sweeps (not inherited from spec.md's own counts) — all three matched exactly. The T20 deviation audit found the `subagent-parity.test.ts` change correctly scoped, with no weakened or deleted assertion. Both discrimination mutations were killed. All 10 gate re-runs are green with no regression against iterations 1-2.

One genuine gap: **PYTS-01 AC1's wiring-ripple population claim ("24 prose sites across 12 skill files") is measurably wrong** — independently re-derived at 41 sites / 25 files (raw) or 36/23 (target-script-scoped), a ~40-70% undercount, plus at least one non-`python3`-literal wiring site the claimed methodology cannot see. This does not break any gate, does not block this PR's mergeability, and does not reopen iterations 1-2's closed findings — but it is a real, AC-anchored defect in the delivered Specify artifact, and per this PR's own newly-added ALLWF-01 rule, an unverified factual claim driving future scope is exactly what must not ship silently. Route as a fix task before `python-to-typescript-scripts` proceeds to Design.

**Overall verdict (iteration 3): FAIL — 1 open gap (PYTS-01 AC1).**
