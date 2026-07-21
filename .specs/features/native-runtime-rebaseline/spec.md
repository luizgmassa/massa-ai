# Native Runtime Re-baseline Specification

## Problem Statement

Wave 3 closed PR #7 with six features COMPLETE, but the `wave-3` branch is behind `main` (which merged PR #6 `e12c4e4` — the Bun 1.3.14 bump + lock-contract `record.includes` fix). Wave-3 still pins Bun `1.3.11` and has the weaker `record.at(-1)` lock-contract check. Additionally: (1) `scripts/tests/native-macos-arm64-workflow.test.ts` (on BOTH main and wave-3) reads a deleted `.github/workflows/native-macos-arm64.yml` (wave-3 merged the job inline into `ci.yml:137` as `structural-native`, but the test was never rewritten), so 2/3 sub-tests fail. (2) Six full-suite failure groups (auto-improve-job, etl-cache-invalidation, etl-pipeline-queue, qwen-e2e-fixture, scheduler-store-pg, trace-path) are documented as pre-existing but never classified fix-vs-accept with evidence. (3) The Codespace lacks Bun entirely (`bun: command not found`) and ships npm `11.12.1` under Node 25.9.0 (contract said `11.14.1`), so cross-platform re-verification under 1.3.14 requires installing Bun + reconciling npm. This follow-up merges main into wave-3 to absorb the Bun 1.3.14 bump + lock-contract fix, resolves the README merge conflict (combining wave-3's Linux support with main's Bun 1.3.14), rewrites the native-macos test to assert the actual `ci.yml` `structural-native` job, classifies the six suite groups, installs Bun 1.3.14 on the Codespace + reconciles npm, re-verifies the full native contract on both platforms, and records the AD amendment.

## Goals

- [ ] `wave-3` merged with `main` (`e12c4e4`) so the lock-contract `record.includes` fix + Bun 1.3.14 bump are absorbed; README conflict resolved (Linux support + Bun 1.3.14 combined).
- [ ] `bun run verify:tree-sitter-native` passes end-to-end on macOS arm64 + Linux glibc x64 (source/dist + packed package) under Bun 1.3.14.
- [ ] `scripts/tests/native-macos-arm64-workflow.test.ts` asserts the actual `ci.yml:137` `structural-native` job and passes 3/3.
- [ ] Each of the six full-suite failure groups is classified FIX or DOCUMENTED-ACCEPT with recorded evidence; real bugs are fixed, test-isolation gaps are documented with the specific root cause.
- [ ] Codespace has Bun 1.3.14 installed (ABI 137 confirmed) + npm reconciled to the contract value; `verify:tree-sitter-native` exits 0 on the Codespace.
- [ ] AD-004/005/006 amendment records the re-baseline (already done on main via `e12c4e4`; this feature records the wave-3 absorption + cross-platform evidence).

## Out of Scope

Explicitly excluded. The native runtime contract is FROZEN — this feature bumps the Bun version pin and repairs the verifier; it does NOT re-spec the structural contracts.

| Feature | Reason |
| --- | --- |
| Patched tree-sitter SHA `e79aec7b...` change | AD-005 patch is frozen; the native patch is not touched. The 16 MiB disposal-stress gate, immutable owners, same-tree reset, install-guard, C++20 `binding.gyp`, 33-language manifest, versioned FQN codec, lazy grammar pool, and embedded Vue/Markdown are all unchanged. |
| Node `25.9.0` change | Node stays `25.9.0` (npm version confirmed in Execute). Only the Bun pin moves. |
| ABI `137` change | ABI 137 is confirmed on Bun 1.3.14 (proven in investigation: `process.versions.modules === "137"` on 1.3.14). No ABI bump. |
| Re-architecting the 6 failing suite tests | Fix real bugs only; never weaken, skip, or delete tests. Test-isolation gaps are documented with root cause, not papered over. |
| Chasing failures outside the named 6-suite set | The handoff explicitly says "never chase failures outside this set." Any newly surfaced failure is out of scope unless the user adds it. |
| Pushing `wave-3` or merging PR #7 | Contract: no push unless explicitly asked. |
| Native runtime download, WASM fallback, raw CST persistence, compiler/LSP resolution, semantic-search changes | Same as the parent multi-language feature; the contract surface is frozen. |
| Re-introducing the separate `.github/workflows/native-macos-arm64.yml` file | Option (b) chosen: the inline merge into `ci.yml:137` `structural-native` is the actual state; restoring a separate file would re-diverge from reality. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Main (`e12c4e4`) already has the Bun 1.3.14 bump + lock-contract `record.includes` fix | Yes — verified via `git show origin/main:scripts/verify-tree-sitter-grammars.ts` | PR #6 merged to main: `EXPECTED_BUN_VERSION = "1.3.14"`, `STRUCTURAL_BUN_VERSION = "1.3.14"`, `packageManager: "bun@1.3.14"`, ci.yml Bun 1.3.14, README Bun 1.3.14, lock-contract uses `record.includes(expected.gitIdentity)` with a comment explaining Bun 1.3.14 appends `sourceIntegrity` as the 4th element. Wave-3 branched from `c92e481` (before PR #6). The right move is to merge main into wave-3, not re-implement. | y (investigation) |
| Merge conflict surface is only README.md | Yes — `git merge-tree` + dry-run confirmed | `git merge --no-commit --no-ff origin/main` auto-merges ci.yml, verify-tree-sitter-grammars.ts, polyglot-indexing-docs.test.ts; only README.md conflicts (2 blocks: line 822 runtime pin, line 941 CI table row). Resolvable by combining wave-3's "macOS arm64 and Linux glibc x64" with main's "Bun 1.3.14". | y (investigation) |
| Main's lock-contract fix (`record.includes`) is strictly stronger than my proposed `record[2]` | Yes — plan-critic finding #2 | `record.includes(expected.gitIdentity)` (membership) survives Bun appending elements (Bun 1.3.14 appends `sourceIntegrity` as 4th element). `record[2]` (exact index) breaks if Bun appends another element. Main's approach is correct; adopt it via merge. | y (plan-critic) |
| Main did NOT fix `native-macos-arm64-workflow.test.ts` | Yes — verified | Main's test still has `WORKFLOW_PATH = .github/workflows/native-macos-arm64.yml` (deleted file). Wave-3 inline-merged the job into `ci.yml:137` `structural-native` but never rewrote the test. This feature rewrites it (option b). | y (investigation) |
| Main did NOT add `structural-native-linux` CI job | Yes — verified | Main's ci.yml has only `structural-native` (macOS). Wave-3 added `structural-native-linux` via `be9c8e8`. The merge preserves wave-3's Linux job (auto-merge). | y (investigation) |
| Codespace Bun is ABSENT (not 1.3.11 as initial investigation claimed) | Yes — `gh codespace ssh` confirmed `bun: command not found` | T7 must install Bun 1.3.14 from scratch. The initial investigation evidence #6 was stale. | y (plan-critic + investigation) |
| Codespace npm is 11.12.1 under Node 25.9.0 (contract said 11.14.1) | Yes — `gh codespace ssh` confirmed | T4 confirms; T6 reconciles `EXPECTED_NPM_VERSION` — either install npm 11.14.1 on Codespace to match the contract, or amend to `npm >= 11.12.1`. The local macOS nvm Node 25.9.0 ships npm 11.14.1. Safest: install npm 11.14.1 on Codespace so both platforms match the contract literal. | y (plan-critic + investigation) |
| Pin site count is 10+, not 8 | Yes — plan-critic finding #5 | Additional sites: `native-linux-x64-workflow.test.ts:22` (test name hardcodes "Bun 1.3.11" — stale string, assertion is dynamic via `EXPECTED_BUN_VERSION`), `polyglot-indexing-docs.test.ts:99,101` (hardcode 1.3.14 + 11.14.1), `verify-tree-sitter-package-artifact.test.ts:24` (hardcodes `EXPECTED_NPM_VERSION === "11.14.1"`). The merge absorbs most; remaining are the test-name string + npm literal. | y (plan-critic) |
| Missing-workflow test decision | Option (b): rewrite test to assert `ci.yml:137` `structural-native` job | The inline merge is the actual state. A separate file would re-diverge. Keeps the baseline non-touch sensor (3rd sub-test). | y (user confirmed) |
| 6-suite classification approach | Fix real bugs, document-accept test-isolation gaps; run each solo 3× to detect flakiness | Per prompt: "Classify honestly; fix the real ones; document the accepted ones." Plan-critic finding #4: distinguish flaky-timeout (auto-improve-job, category 3) from isolation-gap (category 2) from real-bug (category 1). Cross-check prior memory for known bugs (trace-path callerFqn, scheduler resume) before classifying. | y (user + plan-critic) |
| macOS CI `structural-native` job Node version | Keep Node 22 LTS | `ci.yml:156-166` comment documents Node 25 V8 headers fail under macos-14 Apple clang. The Bun bump does NOT change the Node build-helper. Linux uses Node 25.9.0. | y (ci.yml comment) |
| Prebuilds directory population | Not in scope — masked-Bun Node-path handles native load | `bun install` under both 1.3.11 and 1.3.14 creates `build/Release/` but NOT `prebuilds/`. The structural runtime masks `process.versions.bun` before load, forcing the Node-path. Existing behavior, unchanged. | y (investigation) |
| Feature split | One combined feature (user choice) | User selected one combined feature. | y (user confirmed) |

**Open questions:** none — all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Merge main into wave-3 + resolve README conflict ⭐ MVP

**User Story**: As a maintainer, I want `wave-3` to absorb `main`'s Bun 1.3.14 bump + lock-contract `record.includes` fix so the branch is not behind and the pre-existing lock-contract failure is resolved by the already-shipped fix.

**Why P1**: Main (`e12c4e4`) already shipped the Bun 1.3.14 bump + the strictly-stronger `record.includes` lock-contract fix. Wave-3 is behind. Re-implementing would diverge from main and create a merge conflict later. The merge is clean (only README.md conflicts). This is the prerequisite for all other work.

**Acceptance Criteria**:

1. WHEN `git merge origin/main` runs on `wave-3` THEN the merge SHALL auto-merge ci.yml, verify-tree-sitter-grammars.ts, polyglot-indexing-docs.test.ts and conflict ONLY on README.md.
2. WHEN the README.md conflict is resolved THEN it SHALL combine wave-3's "macOS arm64 and Linux glibc x64" (Linux support) with main's "Bun `1.3.14`" (version bump) — both true after the merge.
3. WHEN the merge commit lands THEN `scripts/verify-tree-sitter-grammars.ts:412-414` SHALL use `record.includes(expected.gitIdentity)` (from main), NOT `record.at(-1)`.
4. WHEN the merge commit lands THEN `EXPECTED_BUN_VERSION` SHALL be `"1.3.14"`, `STRUCTURAL_BUN_VERSION` SHALL be `"1.3.14"`, `packageManager` SHALL be `"bun@1.3.14"`, ci.yml both jobs SHALL pin Bun `1.3.14`.
5. WHEN `bun test scripts/tests/verify-tree-sitter-grammars.test.ts` runs post-merge THEN it SHALL pass 9/9 (the `record.includes` fix + 1.3.14 assertions from main).
6. WHEN `bun run verify:tree-sitter-source-dist` runs post-merge under Bun 1.3.14 THEN it SHALL exit 0 (lock-contract now passes via `record.includes`; native load works via masked-Bun Node-path).

**Independent Test**: `git log --oneline wave-3 | head` shows the merge commit; `bun run verify:tree-sitter-source-dist` exits 0.

---

### P1: Missing-Workflow Test Rewrite ⭐ MVP

**User Story**: As a maintainer, I want `native-macos-arm64-workflow.test.ts` to assert the actual CI job structure so the test reflects reality and passes 3/3.

**Why P1**: The test (on BOTH main and wave-3) reads a deleted file (`.github/workflows/native-macos-arm64.yml`) and fails 2/3 sub-tests. Wave-3 inline-merged the job into `ci.yml:137` `structural-native`; the test must be rewritten to assert that. Main never fixed this.

**Acceptance Criteria**:

1. WHEN `native-macos-arm64-workflow.test.ts` reads the macOS native CI job THEN it SHALL read `.github/workflows/ci.yml` (not a deleted `native-macos-arm64.yml`).
2. WHEN the test asserts the macOS native job THEN it SHALL assert the `structural-native` job at `ci.yml:137` pins Bun `1.3.14`, Node 22 LTS, `bun install --frozen-lockfile`, `bun run build`, native-structural unit tests, and does not target a non-arm64/Linux host.
3. WHEN the test runs the baseline non-touch sensor (3rd sub-test) THEN it SHALL still assert no excluded baseline paths were modified (unchanged behavior).
4. WHEN `bun test scripts/tests/native-macos-arm64-workflow.test.ts` runs THEN it SHALL pass 3/3.
5. WHEN `native-linux-x64-workflow.test.ts:22` is inspected post-rewrite THEN the stale test-name string "Bun 1.3.11" SHALL be updated to "Bun 1.3.14" (assertion is already dynamic via `EXPECTED_BUN_VERSION`).

**Independent Test**: `bun test scripts/tests/native-macos-arm64-workflow.test.ts` passes 3/3.

---

### P1: Six-Suite Failure Classification ⭐ MVP

**User Story**: As a maintainer, I want each of the six full-suite failure groups classified FIX or DOCUMENTED-ACCEPT with recorded evidence so CI signal is trustworthy and real bugs are fixed.

**Why P1**: The handoff documents these as pre-existing but never classifies them. Plan-critic finding #4: distinguish THREE categories — (1) real bug (fix), (2) isolation/ordering gap (document + skip), (3) flaky timeout (fix the timeout or mark non-deterministic). `auto-improve-job` is category 3 (2 flaky 5s timeouts, fails SOLO), not category 2. Cross-check prior memory for known bugs before classifying.

**Acceptance Criteria**:

1. WHEN each of the six groups (auto-improve-job, etl-cache-invalidation, etl-pipeline-queue, qwen-e2e-fixture, scheduler-store-pg, trace-path) is run solo 3× THEN the classification SHALL record the solo-run results (3 runs), the failure mode, and the root cause.
2. WHEN a group has a real bug THEN the fix SHALL be implemented and the group SHALL pass solo (never by weakening, skipping, or deleting a test).
3. WHEN a group is a test-isolation gap (process-global state, module mock collision, shared-DB fixture race) THEN the classification SHALL document the specific root cause and the gap SHALL be recorded in `validation.md` with evidence (solo pass, suite fail, root cause).
4. WHEN a group is a flaky timeout (e.g., auto-improve-job 5s timeout) THEN the classification SHALL distinguish it from an isolation gap and record whether the timeout is too tight (fix) or inherently non-deterministic (document + `test.skipIf` guard if appropriate, never weaken).
5. WHEN prior memory records a known bug for a group (e.g., trace-path callerFqn, scheduler resume) THEN the classification SHALL cross-check whether wave-3 includes the fix before classifying.
6. WHEN the full suite `bun run test` runs after classification THEN the accepted groups may still fail in-suite (documented), but the fixed groups SHALL pass.

**Independent Test**: `validation.md` records per-group verdict + 3× solo evidence; full-suite failure count reduced by the fixed groups.

---

### P2: Codespace Bun 1.3.14 Install + npm Reconcile + Cross-Platform Re-verification

**User Story**: As a maintainer, I want the Codespace to have Bun 1.3.14 installed (ABI 137 confirmed) + npm reconciled to the contract value so `verify:tree-sitter-native` exits 0 on both macOS arm64 and Linux glibc x64 under Bun 1.3.14.

**Why P2**: The merge (P1) brings the Bun 1.3.14 pin. The Codespace has NO Bun installed (not 1.3.11 as initially thought) and ships npm 11.12.1 (contract said 11.14.1). T7 must install Bun 1.3.14, confirm ABI 137, reconcile npm, and re-verify the full native contract on both platforms.

**Acceptance Criteria**:

1. WHEN `bun --version` runs on the Codespace post-install THEN it SHALL return `1.3.14` (install via `curl -fsSL https://bun.sh/install | bash -s bun-v1.3.14` or `npm i -g bun@1.3.14` under Node 25.9.0).
2. WHEN `bun -e 'console.log(process.versions.modules)'` runs on the Codespace post-install THEN it SHALL return `137` (ABI gate; plan-critic finding #1 — do not assume the install delivers the same binary).
3. WHEN `npm --version` runs on the Codespace under Node 25.9.0 THEN it SHALL match `EXPECTED_NPM_VERSION` (either install npm 11.14.1 on Codespace to match the contract, or amend `EXPECTED_NPM_VERSION` to the actual — safest is install npm 11.14.1 so both platforms match).
4. WHEN `bun run verify:tree-sitter-native` runs on macOS arm64 under the machine default Bun 1.3.14 (no PATH shim) THEN the script SHALL exit 0 (source/dist + packed package).
5. WHEN `bun run verify:tree-sitter-native` runs on the Codespace (linux glibc x64) under Bun 1.3.14 THEN the script SHALL exit 0 (ELF x86-64 system-only linkage, all gates).
6. WHEN native-structural unit tests run on both platforms THEN they SHALL pass 152/152 (`cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='structural|parse-long-class'`).
7. WHEN `EXPECTED_NPM_VERSION` is updated (if Codespace npm differs) THEN `scripts/tests/verify-tree-sitter-package-artifact.test.ts:24` literal AND `scripts/tests/polyglot-indexing-docs.test.ts:101` literal SHALL be updated to match.

**Independent Test**: `bun --version` returns `1.3.14` on both platforms; `bun run verify:tree-sitter-native` exits 0 on both platforms without a PATH shim.

---

### P2: AD-004/005/006 Amendment Record

**User Story**: As a maintainer, I want the re-baseline recorded as an AD amendment so the decision is auditable.

**Why P2**: The frozen contract pins must be amended with evidence, not silently changed.

**Acceptance Criteria**:

1. WHEN the bump is complete THEN `.specs/project/STATE.md` Decisions table SHALL show AD-004, AD-005, AD-006 re-baselined to Bun `1.3.14` with the exact evidence (ABI 137 unchanged, native parse proven, patch SHA unchanged, Node 25.9.0 unchanged).
2. WHEN the amendment is recorded THEN it SHALL cite the investigation proof (parse works under 1.3.14 via masked-Bun Node-path) and the end-to-end verifier PASS.

**Independent Test**: STATE.md Decisions table shows the amendment row with evidence.

---

## Edge Cases

- WHEN `bun install` under 1.3.14 does NOT create `prebuilds/` (only `build/Release/`) THEN the structural runtime SHALL still load via the masked-Bun Node-path (`withMaskedBunVersion` → `node-gyp-build` → `build/Release/`). This is existing behavior, unchanged.
- WHEN the Codespace has Bun 1.3.11 under Node v24.14.0 (not 1.3.14) THEN Execute SHALL install Bun 1.3.14 on the Codespace before re-verifying, or confirm the Codespace default has drifted.
- WHEN a 6-suite group passes solo but fails in-suite due to process-global mock contamination (Bun `mock.module` is process-wide, oven-sh/bun#12823) THEN the classification SHALL cite the `_bun-mock-guard.ts` documentation and record the specific colliding test, not weaken the test.
- WHEN the npm version on the Codespace is `11.12.1` (not `11.14.1`) THEN `EXPECTED_NPM_VERSION` SHALL be updated to the actual version, and the `native-macos-arm64-workflow.test.ts` npm assertion (if it references `EXPECTED_NPM_VERSION`) SHALL use the updated value.
- WHEN the lock-contract fix changes the index read for Git packages THEN the existing `NATIVE_LOCK_IDENTITIES` entries SHALL remain unchanged (the data is correct; the verifier's reading was wrong).
- WHEN the Bun pin moves to 1.3.14 THEN the `bun.lock` `lockfileVersion` SHALL remain `1` (no lock format change expected, but confirm in Execute).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| NVR-001 | P1: Verifier Lock-Contract Repair | Tasks | Pending |
| NVR-002 | P1: Verifier Lock-Contract Repair | Tasks | Pending |
| NVR-003 | P1: Verifier Lock-Contract Repair | Tasks | Pending |
| NVR-004 | P1: Verifier Lock-Contract Repair | Tasks | Pending |
| NVR-005 | P1: Verifier Lock-Contract Repair | Tasks | Pending |
| NVR-006 | P1: Verifier Lock-Contract Repair | Tasks | Pending |
| NVR-007 | P1: Missing-Workflow Test Rewrite | Tasks | Pending |
| NVR-008 | P1: Missing-Workflow Test Rewrite | Tasks | Pending |
| NVR-009 | P1: Missing-Workflow Test Rewrite | Tasks | Pending |
| NVR-010 | P1: Missing-Workflow Test Rewrite | Tasks | Pending |
| NVR-011 | P1: Six-Suite Failure Classification | Tasks | Pending |
| NVR-012 | P1: Six-Suite Failure Classification | Tasks | Pending |
| NVR-013 | P1: Six-Suite Failure Classification | Tasks | Pending |
| NVR-014 | P1: Six-Suite Failure Classification | Tasks | Pending |
| NVR-015 | P1: Six-Suite Failure Classification | Tasks | Pending |
| NVR-016 | P1: Six-Suite Failure Classification | Tasks | Pending |
| NVR-017 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-018 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-019 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-020 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-021 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-022 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-023 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-024 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-025 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-026 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-027 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-028 | P2: Bun 1.3.14 Bump | Tasks | Pending |
| NVR-029 | P2: AD Amendment | Tasks | Pending |
| NVR-030 | P2: AD Amendment | Tasks | Pending |

**ID format:** `NVR-NNN` (Native Runtime Re-baseline)

**Status values:** Pending → In Tasks → Implementing → Verified

**Coverage:** 30 total, 0 mapped to tasks (Tasks phase next), 30 unmapped (will resolve in tasks.md)

---

## Success Criteria

- [ ] `bun run verify:tree-sitter-native` exits 0 on macOS arm64 under Bun 1.3.14 (no PATH shim).
- [ ] `bun run verify:tree-sitter-native` exits 0 on Ubuntu Codespace (linux glibc x64) under Bun 1.3.14.
- [ ] `bun run type-check` passes 6/6; `bun run build --force` passes 5/5.
- [ ] `scripts/tests/verify-tree-sitter-grammars.test.ts` passes 9/9; `scripts/tests/native-macos-arm64-workflow.test.ts` passes 3/3.
- [ ] Native-structural unit tests pass 152/152 on both platforms (`cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='structural|parse-long-class'`).
- [ ] Six-suite classification recorded in `validation.md` with per-group verdict + evidence; real bugs fixed, isolation gaps documented.
- [ ] Full-suite `bun run test` failure count reduced by the fixed groups; documented-accept groups remain failing in-suite with root cause recorded.
- [ ] AD-004/005/006 amendment recorded in STATE.md with evidence.
- [ ] No test weakened, skipped, or deleted. No push unless explicitly asked.

---

## Verification Approach

- **Lock-contract fix**: `bun test scripts/tests/verify-tree-sitter-grammars.test.ts` (9/9); `bun run verify:tree-sitter-source-dist` + `bun run verify:tree-sitter-package` (exit 0). Run under target Bun (1.3.14 after bump; 1.3.11 to confirm no regression during transition).
- **Missing-workflow test**: `bun test scripts/tests/native-macos-arm64-workflow.test.ts` (3/3).
- **Six-suite classification**: Each group run solo (`bun test <file>`) + in-suite; failure inspection; root cause recorded. Fixed groups pass solo; accepted groups documented.
- **Bun bump**: `bun --version` returns 1.3.14; `bun run verify:tree-sitter-native` exits 0 on macOS + Codespace; `bun run type-check` 6/6; `bun run build --force` 5/5; native-structural unit tests 152/152; `grep -rn '1\.3\.11'` returns no stale pins (except historical `.specs/` artifacts).
- **AD amendment**: STATE.md Decisions table inspection.
- **Independent verifier**: Fresh verifier (author ≠ verifier) runs the full gate matrix + discrimination sensors (corrupt SRI, corrupt gitIdentity, corrupt patch mapping, baseline non-touch) and writes `validation.md`.

## Artifact-Store Evidence

- Active artifact key: `.specs/features/native-runtime-rebaseline/spec.md`
- Version: 1 (initial Specify)
- Checksum: to be recorded after write (git-tracked)