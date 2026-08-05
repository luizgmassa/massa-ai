# Untracked Generated Bundles Validation

**Date**: 2026-08-05
**Spec**: `.specs/features/untracked-generated-bundles/spec.md`
**Diff range**: `main..HEAD` (17 commits, base `724ad02d`, tip `247ef8ef` after fix-loop iteration 1)
**Verifier**: independent sub-agent (author != verifier; no author context inherited — every claim below is re-derived from source, gate re-runs, and a fresh discrimination sensor pass)

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | Done | `pruneManagedRoots` in `scripts/generate-skill-artifacts.ts:251-267`, called from `emitAll:290-291` |
| T2 | Done | `emitHostProfile:472-478` prunes before both `emitAll` and `emitVariants` callers |
| T3 | Done | root `package.json` `generate:artifacts`/`pretest:scripts`/`pretest:plugins`/`pretest:coverage`; `apps/opencode-plugin/package.json:20` package-level `pretest` |
| T4 | Done | `beforeAll` guards in `scripts/__tests__/skill-artifact-parity.test.ts:35-43`, `subagent-parity.test.ts:46-57` |
| T5–T8 | Done | All four `install.sh` carry the identical generation block (verified byte-for-byte pattern match) |
| T9 | Done | `scripts/install-harness.sh:197-205`; shell suite `scripts/tests/test-harness-single-generation.sh` |
| T10 | Done | `ci.yml` "Generate plugin bundles" step at line 134-135, precedes all three named consumers |
| T11 | Done | `publish.yml` "Generate plugin bundles" step at line 81-82, precedes "Upload build artifacts" |
| T12 | Done | `.gitignore` 9 root-precise entries; `git ls-files` = 0 for every managed subtree (verified below) |
| T13 | Done | README (marketplace prerequisite + post-pull + opt-in hook + standalone-CLI note), CLAUDE.md (generated-on-demand contract), CHANGELOG `[Unreleased]` entry. CONTRIBUTING.md untouched — verified against `main` copy: it never described checked-in bundles, so "N/A, nothing to sweep" is correct, not a missed file. |
| T14 | Done | AD-016 appended to `.specs/project/STATE.md:3213` (single entry, not duplicated); cold-path evidence recorded in commit `0fe89367`'s message (fresh-clone scratch-worktree simulation, 4 entry points green, 1 deliberate red observed) |

All 14 tasks done. No blocked/partial tasks found.

---

## Spec-Anchored Acceptance Criteria

### P1: Single-source skill edits

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| UGB-01: zero tracked files under 9 managed subtrees | `git ls-files` count = 0 per path | Verified directly: `git ls-files apps/{claude,codex,cursor,opencode}-plugin/{skills/{massa-ai,persona-router,profile,agents},agents,agent-profiles}` + 2 hook copies + `opencode-plugin/lib/opencode-config.cjs` — all 27 enumerated paths return count 0 | PASS |
| UGB-02: `generate:artifacts` emits every subtree, exit 0 | exit 0, all 4 hosts' skills/agents/agent-profiles/hooks/lib emitted | Ran directly: `bun run generate:artifacts` inside `test:plugins`'s pretest — emitted 699 skill-bundle files + 68 agent files + 374 variant files across 4 hosts, exit 0 | PASS |
| UGB-03: second consecutive run = zero drift | both `--check` exit 0 immediately after emit | `bun scripts/generate-skill-artifacts.ts --check` → "No drift" exit 0; `bun scripts/generate-subagent-artifacts.ts --check` → "No drift" exit 0 (both run fresh, this session) | PASS |
| UGB-04: deleted source leaves no stale artifact | managed roots contain no leftover file from a deleted source | `scripts/generate-skill-artifacts.ts:251-267` (`pruneManagedRoots`, `fs.rm` per `managedRootsFor`) + `generate-subagent-artifacts.ts:472-478` (`emitHostProfile`'s `fs.rm(dir,{recursive,force})`); discrimination-sensor mutation (a) below empirically proves the guard is load-bearing (3/6 prune tests fail when disabled) | PASS |

### P1: Install channels preserved

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| UGB-05: checkout install.sh generates before copy/register | generation runs before any host-config mutation | `apps/claude-plugin/install.sh:82-102` (identical block in codex/cursor/opencode `install.sh`) — generation block precedes `SCOPE`/`TARGET` resolution at line 104; discrimination mutation (e) (inverted condition) fails 2/32 `install.test.ts` cases | PASS |
| UGB-06: tarball install (sources absent) skips generation, installs shipped files | `install.sh` install succeeds using pre-generated files, no generation attempted | `apps/claude-plugin/__tests__/install.test.ts:444-487` ("UGB-06: tarball-shaped install...") asserts exit 0 + navigator agent present from the shipped copy, confirmed green in gate re-run (`test:plugins` 104/0) | PASS |
| UGB-07: bun missing / generation fails → loud exit before mutation | non-zero exit, message naming prerequisite, before host-config write | `apps/claude-plugin/install.sh:84-87` (`exit 3`, "bun required..."); test `install.test.ts:489-508` asserts `res.status===3`, stderr contains "bun required", and `~/.claude` never created | PASS |
| UGB-08: harness runs generation at most once per invocation | generator invoked exactly once regardless of host count | `scripts/install-harness.sh:197-205` (generate once, `export MASSA_AI_SKIP_ARTIFACT_GENERATION=1`); `scripts/tests/test-harness-single-generation.sh` asserts exactly 1 marker across 2-host and 4-host runs — reconfirmed green (13/13) this session; mutation (f) (drop the export) fails 4/13 | PASS |
| UGB-09: published tarball top-level entry set unchanged | `verify-package-contents.ts` `EXPECTED_PACKAGES` unchanged, passing | `git diff main..HEAD -- scripts/verify-package-contents.ts` = empty (byte-identical); ran `bun scripts/verify-package-contents.ts` this session → "8/8 packages OK" | PASS |

### P1: CI and publish chain green

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| UGB-10: `ci.yml` build job generates before verify-package-contents / drift check / test:scripts / test:plugins | generation step precedes all 4 named consumers, same job | `.github/workflows/ci.yml:134-135` ("Generate plugin bundles") precedes lines 181 (verify-package-contents), 237 (drift gate), 273 (test:scripts), 279 (test:plugins); `scripts/__tests__/workflow-generation-order.test.ts:34-67` — reconfirmed green against unmutated `ci.yml`; mutation (b) (remove step) fails the file (1/4 assertions catch it explicitly, see Sensor gap note below) | PASS |
| UGB-11: `publish.yml` build job generates before Upload build artifacts, artifact list unchanged | generation step precedes upload, same enumerated dirs as before | `.github/workflows/publish.yml:81-82` precedes `Upload build artifacts` at line 116; `git diff main..HEAD` on the artifact `path:` list under Upload shows no removed directory (list unchanged, only additive prerequisite step); `workflow-generation-order.test.ts:70-83` green; mutation (c) fails this assertion directly | PASS |
| UGB-12: `test:scripts`/`test:plugins` green on fresh clone, no manual step | both suites pass with only automatic pre-script generation | Reconfirmed this session: `bun run test:scripts` → 1435 pass/0 fail (67 files) + all shell suites green, exit 0; `bun run test:plugins` → 104 pass/0 fail (8 files), exit 0 — both invoked with no manual `generate:artifacts` call beforehand (pretest chain only) | PASS |
| UGB-13: missing generation → parity test fails with actionable message, not vacuous pass | non-passing test names `bun run generate:artifacts` | `scripts/__tests__/skill-artifact-parity.test.ts:35-43`, `subagent-parity.test.ts:46-57` — `beforeAll` throws `` `Generated ... bundle missing at ${sentinel} — run 'bun run generate:artifacts' first.` `` when sentinel absent (T14's cold-path evidence recorded exactly this red: 0 pass/1 fail with the guard's message, then 23 pass/0 fail after regeneration) | PASS |
| UGB-17: `test:coverage` / turbo `test` — bundles present before any suite reads them | generated bundles exist before coverage path and opencode package test path both execute | Root `pretest:coverage` (`package.json:32`) chains `generate:artifacts`; `apps/opencode-plugin/package.json:20` package-level `pretest` covers the turbo-dispatched path. **Spec-precision note, not a behavior gap**: verified this session that `scripts/check-coverage.ts:255-269` invokes `spawnSync("bun",["test","__tests__","src/__tests__",...],{cwd:"apps/opencode-plugin"})` directly — this bypasses the opencode package's own `pretest` (which only fires for `bun run test`, not a direct `bun test`), so `pretest:coverage` at the root is the ONLY thing guaranteeing generation ahead of this exact path. The design's own "Residual accepted exposure" note (design.md line 66) already accepts this as a documented risk for direct invocation of `check-coverage.ts`; my finding narrows it further (see Discrimination Sensor mutation (d) below): **no automated test asserts `pretest:coverage`'s existence/content**, so a regression here is currently undetectable except by a full `coverage.yml` CI run reaching a real Postgres. Functionally the AC is met today (verified: script present, chain intact) — this is a discrimination-sensor gap, not an unmet AC. | PASS (AC met) — sensor gap flagged as Fix 1 |

### P2: Documentation matches the new contract

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| UGB-14: README documents marketplace prerequisite + post-pull regen + opt-in hook | all three present | `README.md:179-214` — generation prerequisite (182-185), post-pull regeneration + opt-in `post-merge` snippet (200-210), standalone `massa-ai-config agents install` note (212-214) | PASS |
| UGB-15: CLAUDE.md/CONTRIBUTING.md state generated-on-demand contract, no stale "checked in" claims | zero stale-claim hits | `CLAUDE.md:379-392,466-468` — "generated-on-demand, gitignored build output — not checked in" language present; `CONTRIBUTING.md` — confirmed against `main`'s copy that it never described checked-in bundles (`grep` for "checked in"/"committed"/bundle-count claims returns 0 relevant hits on both `main` and `HEAD`), so leaving it untouched is correct, not a missed sweep | PASS |
| UGB-16: CHANGELOG `[Unreleased]` entry present | entry present | `CHANGELOG.md:8-25` — `### Changed` entry describing the untracking, prune, and install-surface note | PASS |

**Status**: All 17 ACs covered, all matched their spec-defined outcome. 0 spec-precision gaps. 0 uncovered ACs. One discrimination-sensor gap flagged against UGB-17 (AC itself is met; the regression sensor protecting it is thin) and folded into Fix 1/Fix 2 below per the Discrimination Sensor findings.

---

## Discrimination Sensor

Scratch git worktree at `/tmp/massa-ai-verify-scratch` (`git worktree add ... HEAD`, detached at `33171311`). Sensor population confirmed present in scratch before any mutation: `generate-skill-artifacts-prune.test.ts` (136 lines), `generate-subagent-artifacts-prune.test.ts` (102 lines), `workflow-generation-order.test.ts` (83 lines), `test-harness-single-generation.sh` (143 lines), parity `beforeAll` guards (2 + 3 hits) — all present, and baseline runs of every targeted suite were green before mutating (prune tests 9/9, workflow-order 4/4, parity 88/88, harness-single-gen 13/13). `node_modules` symlinked read-only from the main checkout (no npm deps in the generators themselves; only `subagent-parity.test.ts` needed `toml`).

7 mutations across 6 distinct violation shapes (exceeds the ≥5 requirement for this P1-heavy, public-compat feature):

| # | Mutation | File:line | Description | Killed? |
| - | -------- | --------- | ------------ | ------- |
| a | Prune-disable | `scripts/generate-skill-artifacts.ts:291` | Commented out the `pruneManagedRoots(...)` call inside `emitAll` | Killed — 3/6 `generate-skill-artifacts-prune.test.ts` cases fail |
| b | Remove CI step | `.github/workflows/ci.yml:134-135` | Deleted the "Generate plugin bundles" step from the build job | Killed — `workflow-generation-order.test.ts` goes 3 pass/1 fail. **Sensor-quality note**: only the first of the 3 ci.yml sub-tests has an explicit `expect(genIndex).toBeGreaterThan(-1)` guard; the other two only assert `genIndex < consumerIndex`, which is vacuously true when `genIndex === -1` — they would not independently catch a full step removal if the first sub-test were ever deleted. File-level detection still holds today. |
| c | Remove publish step | `.github/workflows/publish.yml:81-82` | Deleted the "Generate plugin bundles" step from the publish build job | Killed — explicit existence guard at line 76 of the test fires directly |
| d | Drop `pretest:coverage` | `package.json:32` | Removed `"pretest:coverage": "bun run generate:artifacts"` | **Survived** — no test in `scripts/__tests__/` or `scripts/tests/` references `pretest:coverage` at all (confirmed via repo-wide grep in scratch). Reproduced the real failure mode by deleting `apps/opencode-plugin/agents/` and running `agents-install.test.ts` alone (no other install.sh-invoking test in the same run to self-heal): 5/7 tests fail with a raw `ENOENT` stack, not the actionable "run generate:artifacts" message UGB-13 requires elsewhere. Non-vacuous (it does fail) but only discoverable via an expensive full `coverage.yml` CI run against a real dedicated Postgres — no fast local sensor exists. |
| e | Invert checkout detection | `apps/claude-plugin/install.sh:82` | `[[ -f ... ]]` → `[[ ! -f ... ]]` | Killed — 2/32 `install.test.ts` cases fail (UGB-06's tarball case now tries and fails to run a nonexistent generator; UGB-07's bun-missing case now skips the guard entirely and wrongly exits 0) |
| f | Remove harness skip-env export | `scripts/install-harness.sh:205` | Deleted `export MASSA_AI_SKIP_ARTIFACT_GENERATION=1` | Killed — 4/13 `test-harness-single-generation.sh` assertions fail (generator invoked 3x/5x instead of once) |
| g | Delete a `.gitignore` entry | `.gitignore` (`apps/*-plugin/agent-profiles/` line) | Removed one of the 9 managed-subtree ignore patterns | **Survived** — ran the full `bun test scripts/__tests__` (1388 pass/0 fail) and every `scripts/tests/*.sh` shell suite; none references `.gitignore` content or re-derives the UGB-01 zero-count check. The now-untracked-ignore path shows as `??` in `git status` but nothing in the automated gate flags it. (One pre-existing, unrelated flake — `test-plugin-auto-install.sh`'s "harness --uninstall → exit 0" — was independently reproduced on the *unmutated* tree too, confirming it is not caused by this mutation; likely host-load-related per the elevated `uptime` readings this session.) |

**Sensor depth**: P1-full (7 mutations, ≥5 required; 6 distinct violation shapes: prune-disable, CI-step-removal, publish-step-removal, pre-script-removal, condition-inversion, skip-env-removal, gitignore-entry-removal — counting each of b/c as CI vs publish shape variants and d/g as two more).
**Result**: 5/7 killed — 2/7 survived (non-equivalent, confirmed genuine gaps, not dead/unreachable mutations) — **Needs Fix** on the sensor layer (see Fix Plans). The underlying AC-level behavior for UGB-04, UGB-08, UGB-10/11, UGB-05/06/07 is empirically discriminating; UGB-17 and UGB-01 are met in the current tree but lack a durable regression sensor.

Isolation verified: main-tree `git status --porcelain` was empty before the scratch worktree was created and empty again after `git worktree remove --force` tore it down — no mutation touched the real checkout.

---

## Interactive UAT Results

**UAT: not applicable.** This is a backend/harness/infra feature (generators, installers, CI/publish workflow wiring, git metadata) with no interactive UI surface; automated gate + discrimination sensor is the appropriate verification tier.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | PASS — prune logic reuses existing `managedRootsFor`/`hookBinaryHosts`/`HOST_DIRS` tables, no new literal lists |
| Surgical changes | PASS — each task touched exactly the files its `tasks.md` entry named |
| No scope creep | PASS — no unrelated refactors found in the diff |
| Matches patterns | PASS — new `install.sh` blocks are byte-similar across all 4 hosts; test files follow existing suite conventions (scratch tmpdirs, injectable seams) |
| Spec-anchored outcome check | PASS — see table above; every AC traced to an exact assertion, no vague "an assertion exists" passes |
| Per-layer Coverage Expectation met | PASS — generators have 1:1 prune/determinism tests; installers have integration e2e covering checkout/tarball/missing-runtime; workflow YAML has an order sensor |
| Every test maps to a spec requirement | PASS — no unclaimed tests found in the reviewed new files |
| Documented guidelines followed | `CLAUDE.md` (isolation runner conventions, 5s timeout policy — new tests use default budgets, no long-running work); `CONTRIBUTING.md` 7-step managed-harness protocol (contract → register → preserve argv → read-only export → deliver-before-ack → invariants → discriminating tests) — followed per the tasks.md-documented commit sequence |

---

## Edge Cases

- [x] `install.sh` in a checkout with no `node_modules` (generators have zero npm dependency — verified: `bun test` inside the scratch worktree ran every generator/prune test with `node_modules` absent, only symlinking it in later for the `toml`-dependent parity test)
- [x] `git rm --cached` leaves working-tree copies (gitignored) — confirmed: dev checkouts keep working immediately; T12's scripted census (1141 exact) matches current `git ls-files` = 0 counts
- [x] `/plugin marketplace add` on an ungenerated checkout — no code gate possible (documented limitation), README UGB-14 mitigation confirmed present
- [x] `npm pack --ignore-scripts` (verify-package-contents) — confirmed generation happens before staging, never inside pack; `verify-package-contents.ts` unchanged and green
- [x] Generator non-determinism — UGB-03 `--check` clean immediately after emit, confirmed this session

---

## Gate Check

- **Gate command**: `bun run lint` + `bun run test:scripts` + `bun run test:plugins` + both generators `--check` + `bun scripts/verify-package-contents.ts` (Build gate per `tasks.md`)
- **Result**:
  - `bun run lint` (oxlint) — exit 0
  - `bun scripts/generate-skill-artifacts.ts --check` — "No drift" — exit 0
  - `bun scripts/generate-subagent-artifacts.ts --check` — "No drift" — exit 0
  - `bun run test:scripts` — 1435 pass / 0 fail across 67 files + all shell suites green — exit 0
  - `bun run test:plugins` — 104 pass / 0 fail across 8 files — exit 0
  - `bun scripts/verify-package-contents.ts` — 8/8 packages OK — exit 0
- **Test count before feature**: not independently re-derivable from a pre-feature checkout in this session (author's own T14 evidence records 1435/1230+ delta); no test count decrease observed — this feature is additive (4 new test files: 2 prune suites, 1 workflow-order sensor, 1 shell suite)
- **Skipped tests**: none skipped in the reviewed runs beyond 2 pre-existing skips reported by `test:scripts` (unrelated to this feature, not investigated further — out of scope for this diff)
- **Failures**: 0 in the read-only gate re-run. One pre-existing, unrelated flake (`test-plugin-auto-install.sh`, "harness --uninstall → exit 0") was observed only inside the scratch worktree during discrimination-sensor mutation (g) and reproduced identically on the unmutated tree — confirmed unrelated to this feature (see Discrimination Sensor table)

---

## Fix-Loop Iteration 1 (re-verification)

Author committed `247ef8ef` (`test(contract): durable sensors for pre-script wiring and gitignore coverage`), adding `scripts/__tests__/generated-bundles-contract.test.ts` (119 lines, 20 tests) as the fix for both surviving mutants from the first pass. Independent re-verification (author != verifier preserved) performed in a **second, fresh** isolated scratch git worktree (`/tmp/massa-ai-verify-scratch2`, `git worktree add ... HEAD` detached at `247ef8ef`), never reusing the first pass's scratch state.

**Sensor population proven present before re-testing**: `scripts/__tests__/generated-bundles-contract.test.ts` confirmed on disk in the fresh scratch (119 lines, matching the author's commit exactly) before any mutation. Baseline run (unmutated): 20 pass / 0 fail — matches the author's own reported baseline (20/0).

| # | Re-run mutation | Result this iteration | Matches author's report? |
| - | ---------------- | ---------------------- | ------------------------- |
| d | Drop `package.json`'s `pretest:coverage` | **Killed** — 19 pass / 1 fail (`root pretest:coverage chains generate:artifacts` fails: `Expected: "bun run generate:artifacts", Received: undefined`) | Yes — author reported 19/1 |
| g | Delete the `apps/*-plugin/agent-profiles/` line from `.gitignore` | **Killed** — 19 pass / 1 fail (`ignored: apps/opencode-plugin/agent-profiles/work/massa-ai-builder.md` fails: `Expected: true, Received: false`, via `git check-ignore`) | Yes — author reported 19/1 |

Both mutations restored; sensor file re-confirmed green (20 pass / 0 fail) after each restore.

**Full `bun run test:scripts` on the unmutated fresh-scratch tree**: initial run showed 4 unrelated failures (3 "native Tree-sitter package contract" cases + 1 "macOS arm64 packed Tree-sitter artifact contract" case), traced to this throwaway worktree never having run `packages/core`'s `prisma generate` / a full `bun run build` (missing `packages/core/dist`, then missing `src/generated/prisma` after a first build attempt) — a provisioning gap in the scratch worktree itself, unrelated to this feature or to either mutation (confirmed: these are the same class of "fresh worktree missing native/build artifacts" issue CLAUDE.md documents, not a regression this feature introduced). After running `bunx prisma generate` + `bun run build` in the scratch to complete provisioning: **`bun run test:scripts` → 1455 pass / 0 fail across 68 files, all shell suites green, exit 0.**

Isolation verified: main-tree `git status --porcelain` showed only the pre-existing untracked `validation.md` before this second scratch worktree was created, and the same single line after `git worktree remove --force` tore it down — no mutation touched the real checkout.

**Verdict on the two Fix items**: Both CLOSED. Fix 1 and Fix 2 are now backed by durable, repeatable sensors (`generated-bundles-contract.test.ts`, wired into `bun run test:scripts` via the existing `scripts/__tests__` glob — no additional wiring needed). Fix 3 (the optional `genIndex > -1` cosmetic robustness note on 2 of 3 `workflow-generation-order.test.ts` ci.yml sub-tests) remains open but is accepted by the orchestrator as a non-blocking cosmetic finding — file-level detection for that scenario already works via the sibling sub-test, so no fix-loop iteration is spent on it.

## Fix Plans

### Fix 1: No automated sensor protects `pretest:coverage`'s existence/content (UGB-17 regression risk)

- **Root cause**: `scripts/check-coverage.ts:255-269` invokes `bun test` directly against `apps/opencode-plugin` via `spawnSync`, bypassing that package's own `pretest` hook. Only the root `pretest:coverage` script guards this path, and no test in `scripts/__tests__/` or `scripts/tests/` asserts that script exists or names `generate:artifacts`.
- **Fix task**: Add a unit test (e.g. `scripts/__tests__/root-package-scripts.test.ts` or extend an existing wiring test) asserting `package.json`'s `scripts["pretest:coverage"]` is defined and invokes `generate:artifacts` (mirroring the existing `pretest:scripts`/`pretest:plugins` conventions already covered by T3's own gate).
- **Priority**: Minor (the AC is currently met; this closes a silent-regression window, not a live defect)
- **Status**: CLOSED — `scripts/__tests__/generated-bundles-contract.test.ts:19-47` (`generation pre-script wiring (UGB-17)`), landed `247ef8ef`. Re-verified: mutation (d) killed 19/20 in a fresh scratch worktree, restored 20/20.

### Fix 2: No automated sensor protects the 9 `.gitignore` managed-subtree entries (UGB-01 regression risk)

- **Root cause**: The zero-tracked-file invariant (UGB-01) was verified as a one-time scripted check during T12/T14 but never committed as a repeatable test. Deleting any of the 9 `.gitignore` lines produces no red anywhere in `bun run test:scripts` or `bun run test:plugins`.
- **Fix task**: Add a small test (shell or TS) that greps `.gitignore` for the 9 literal managed-subtree patterns (or re-runs the `git ls-files <path> | wc -l == 0` check per subtree) as part of `scripts/__tests__/` or `scripts/tests/`, so a future `.gitignore` edit that drops one of these lines fails `test:scripts` immediately instead of only surfacing if/when someone runs `git add -A` and commits.
- **Priority**: Minor (current tree is correct; this is a durable-regression guard, not a live defect)
- **Status**: CLOSED — `scripts/__tests__/generated-bundles-contract.test.ts:49-119` (`managed subtrees stay gitignored (UGB-01)`), landed `247ef8ef`. Re-verified: mutation (g) killed 19/20 in a fresh scratch worktree, restored 20/20.

### Fix 3 (optional, low priority): Strengthen `workflow-generation-order.test.ts`'s ci.yml sub-tests

- **Root cause**: 2 of the 3 ci.yml sub-tests (`precedes the skill-artifact drift gate`, `precedes 'Test plugin installers'`) do not independently assert `genIndex > -1`; they rely on `-1 < realIndex` being vacuously true and on a sibling test's explicit guard to catch total step removal.
- **Fix task**: Add `expect(genIndex).toBeGreaterThan(-1)` to those two sub-tests (one line each) so each assertion is self-sufficient.
- **Priority**: Cosmetic (file-level detection already works; this is a robustness nicety in the sensor's own design)
- **Status**: OPEN, accepted-cosmetic by the orchestrator — not routed to a fix-loop iteration; does not block PASS.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| UGB-01 | Pending | Verified (behavior correct; regression sensor gap — Fix 2) |
| UGB-02 | Pending | Verified |
| UGB-03 | Pending | Verified |
| UGB-04 | Pending | Verified (discrimination-proven, mutation a killed) |
| UGB-05 | Pending | Verified (discrimination-proven, mutation e killed) |
| UGB-06 | Pending | Verified |
| UGB-07 | Pending | Verified |
| UGB-08 | Pending | Verified (discrimination-proven, mutation f killed) |
| UGB-09 | Pending | Verified |
| UGB-10 | Pending | Verified (discrimination-proven, mutation b killed; Fix 3 optional) |
| UGB-11 | Pending | Verified (discrimination-proven, mutation c killed) |
| UGB-12 | Pending | Verified |
| UGB-13 | Pending | Verified |
| UGB-14 | Pending | Verified |
| UGB-15 | Pending | Verified |
| UGB-16 | Pending | Verified |
| UGB-17 | Pending | Verified (behavior correct; regression sensor gap — Fix 1) |

`.specs/project/FEATURES.json` update: record `untracked-generated-bundles` status as **verified — PASS** after fix-loop iteration 1. Fix 1 and Fix 2 closed and re-verified; Fix 3 remains open as an accepted-cosmetic, non-blocking finding.

---

## Summary

**Overall**: Ready
**Result**: PASS

**Spec-anchored check**: 17/17 ACs matched their spec-defined outcome. 0 spec-precision gaps.
**Sensor**: Iteration 0: 5/7 mutations killed, 2/7 survived (d, g). Iteration 1 (fix-loop, after `247ef8ef`): mutations (d) and (g) re-run against `scripts/__tests__/generated-bundles-contract.test.ts` in a fresh, independent scratch worktree — **both now killed** (19/20 and 19/20 respectively, sensor population proven present beforehand, baseline and restore both confirmed 20/0). Combined: **7/7 mutations now killed**, 0 surviving. Fix 3 (cosmetic `genIndex` guard robustness) remains open, accepted by the orchestrator as non-blocking.
**Gate**: 6/6 passed, 0 failed (lint, both `--check`, test:scripts, test:plugins, verify-package-contents.ts) at iteration 0; `bun run test:scripts` reconfirmed green (1455 pass / 0 fail, 68 files) on the fresh iteration-1 scratch worktree after completing its provisioning (an unrelated, pre-existing gap in the throwaway worktree, not caused by this feature or either mutation).

**What works**: All 17 acceptance criteria are met by the current implementation, verified against exact file:line evidence. Both generators correctly prune before emit. All 4 installers correctly detect checkout vs. tarball context and fail loudly before host mutation when `bun` is missing. The harness generates exactly once per run. CI and publish workflows both generate before their respective consumers, in the correct order. `verify-package-contents.ts` passes 8/8 unchanged. UGB-01's zero-tracked-file invariant holds today and is now durably sensor-protected via `git check-ignore` + `git ls-files` checks. UGB-17's `pretest:coverage` wiring is now durably sensor-protected. Documentation (README/CLAUDE.md/CHANGELOG) correctly states the new contract; CONTRIBUTING.md correctly needed no change. AD-016 is recorded once, correctly, in STATE.md.

**Issues found**: None blocking. Fix 3 (optional/cosmetic — 2 of 3 `workflow-generation-order.test.ts` ci.yml sub-tests lack an independent `genIndex > -1` existence guard) remains open by orchestrator decision; file-level detection for that scenario already works via the sibling sub-test's explicit guard, so this does not affect the verdict.

**Next steps**: None required to close this feature. Optionally pick up Fix 3 in a future low-priority pass for sensor robustness; not part of this fix-loop.
