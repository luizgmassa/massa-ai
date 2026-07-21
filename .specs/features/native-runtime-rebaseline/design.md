# Native Runtime Re-baseline Design

**Spec**: `.specs/features/native-runtime-rebaseline/spec.md`
**Status**: Draft

---

## Design Summary

This feature is a merge + surgical repair + cross-platform re-verification. The key insight from the Plan Challenge pre-mortem: main (`e12c4e4`) ALREADY shipped the Bun 1.3.14 bump + the strictly-stronger `record.includes(expected.gitIdentity)` lock-contract fix. Wave-3 branched from `c92e481` (before PR #6) and is behind. The right move is to merge main into wave-3 (only README.md conflicts — resolvable by combining wave-3's Linux support with main's Bun 1.3.14), which absorbs the lock-contract fix + Bun bump in one atomic merge commit. The remaining work is: rewrite the native-macos test (which main never fixed — both branches have the broken test pointing at a deleted file), classify six failing suite groups (with 3× solo runs to detect flakiness), install Bun 1.3.14 on the Codespace (currently ABSENT, not 1.3.11 as initially thought), reconcile npm (11.12.1 on Codespace vs 11.14.1 contract), re-verify the full native contract on both platforms under 1.3.14, and record the AD amendment. The frozen native runtime contract (AD-004/005/006) is amended via the merge (main already amended it); this feature records the wave-3 absorption + cross-platform evidence. Node 25.9.0 unchanged, ABI 137 unchanged, patch SHA `e79aec7b...` unchanged.

---

## Requirements Traceability

| Requirement ID | Design Component | Verification Path |
| --- | --- | --- |
| NVR-001..006 | Lock-contract index fix | `verifyLockContractText` reads `record[2]` for Git packages; `verify-tree-sitter-grammars.test.ts` 9/9; `verify:tree-sitter-source-dist` + `verify:tree-sitter-native` exit 0 |
| NVR-007..010 | Missing-workflow test rewrite | `native-macos-arm64-workflow.test.ts` reads `ci.yml`, asserts `structural-native` job; 3/3 pass |
| NVR-011..016 | Six-suite classification | Per-group solo run + failure inspection; `validation.md` records verdict + evidence; fixed groups pass solo |
| NVR-017..028 | Bun 1.3.14 pin update | `assertRuntimeTarget` (verifier + runtime) accepts 1.3.14; `package.json` packageManager; `ci.yml` both jobs; README; two test files; end-to-end verifier exit 0 on macOS + Codespace |
| NVR-029..030 | AD amendment | STATE.md Decisions table records AD-004/005/006 re-baseline with evidence |

---

## Current Codebase Evidence

Files inspected in this session (investigation phase):

| File | Lines | Role |
| --- | --- | --- |
| `scripts/verify-tree-sitter-grammars.ts` | 1-60, 330-454, 810-899, 1190-1354 | Offline verifier. `assertRuntimeTarget` (line 345-360) pins Bun + ABI. `verifyLockContractText` (line 362-424) reads lock records. `EXPECTED_BUN_VERSION` (line 26) = `"1.3.11"`. `EXPECTED_NATIVE_MODULE_ABI` (line 28) = `137`. Cold consumer spawn (line 1303-1329) uses `process.execPath` (Bun). |
| `scripts/tests/verify-tree-sitter-grammars.test.ts` | 1-222 | Verifier test. Lines 38-40 hardcode `EXPECTED_BUN_VERSION === "1.3.11"`, `EXPECTED_NODE_BUILD_VERSION === "25.9.0"`, `EXPECTED_NATIVE_MODULE_ABI === 137`. Lines 67-78 assert `NATIVE_LOCK_IDENTITIES["tree-sitter-dart"]` = `{resolved, gitIdentity, sourceIntegrity}` (no `sri`). Lines 80-100 corrupt SRI / gitIdentity / patch mapping (3 discrimination sensors). Lines 149-173 assert cold consumer `bun === "1.3.11"`. |
| `scripts/tests/native-macos-arm64-workflow.test.ts` | 1-80 | Missing-file test. `WORKFLOW_PATH` (line 10) = `.github/workflows/native-macos-arm64.yml` (deleted). `readWorkflow()` (line 31-33) reads missing file → 2/3 sub-tests fail. 3rd sub-test (line 62-79) baseline non-touch sensor is valid. |
| `packages/core/src/services/structural/native-lock-identities.ts` | 1-223 | Pinned identity data. `NATIVE_LOCK_IDENTITIES["tree-sitter-dart"]` (line 131-135) = `{resolved, gitIdentity, sourceIntegrity}` — no `sri` field (Git package). `NATIVE_LOCK_IDENTITIES["tree-sitter-erlang"]` (line 141-145) same shape. Registry packages have `sri` field. Data is correct; verifier reading is wrong. |
| `packages/core/src/services/structural/grammar-loaders.ts` | 200-289 | Runtime load. `assertRuntimeTarget` (line 206-224) pins `STRUCTURAL_BUN_VERSION` + `TREE_SITTER_NATIVE_MODULE_ABI`. `withMaskedBunVersion` (line 111+) masks `process.versions.bun` before native load → forces Node-path (`node-gyp-build` → `build/Release/`). |
| `packages/core/src/services/structural/language-manifest.ts` | 1-30 | `TREE_SITTER_NATIVE_MODULE_ABI = 137` (line 19). `STRUCTURAL_BUN_VERSION = "1.3.11"` (line 20). `TREE_SITTER_PATCH_SHA256` (line 21-22) = `e79aec7b...` (unchanged). |
| `bun.lock` | 880-899 | Lock format. Line 889 tree-sitter-dart = `[resolved, depsObj, gitIdentity, sri]` (4 elements). Line 881 tree-sitter-c-sharp = `[resolved, "", depsObj, sri]` (4 elements, SRI last). Git packages: gitIdentity at index 2, SRI at index 3. Registry: depsObj at index 2, SRI at index 3. |
| `.github/workflows/ci.yml` | 130-209 | `structural-native` (line 137, macos-14, Bun 1.3.11, Node 22 LTS). `structural-native-linux` (line 178, ubuntu-latest, Bun 1.3.11, Node 25.9.0). Both pin Bun `1.3.11` at lines 151-154 and 193-196. |
| `package.json` | 57-60 | `engines.node >= 18.0.0`, `packageManager: "bun@1.3.11"`. |
| `.node-version` | 1 | `25.9.0` (Node, unchanged). |
| `README.md` | 822-823, 937-938 | Runtime pins: Bun `1.3.11`, Node `25.9.0` (npm `11.14.1`). CI table rows. |
| `scripts/verify-tree-sitter-package-artifact.ts` | 1-60 | Package verifier. `EXPECTED_NPM_VERSION` (line 29) = `"11.14.1"`. Imports `assertRuntimeTarget`, `verifyStaticContract` from grammars script. |
| `packages/core/src/__tests__/native-target-predicate.test.ts` | 1-86 | Platform predicate test. Does NOT hardcode `1.3.11` — uses `acceptsPlatform(platform, arch)` pure boolean. Will pass after bump. |
| `packages/core/src/__tests__/{auto-improve-job,etl-cache-invalidation,etl-pipeline-queue,qwen-e2e-fixture,scheduler-store-pg,trace-path}.test.ts` | headers | 6 failing groups. `auto-improve-job`: process-global state, 2 flaky 5s timeouts (confirmed: 24 pass / 2 fail solo). `etl-cache-invalidation`: `mock.module` process-global (line 7). `etl-pipeline-queue`: `EtlPipeline.getInstance()` singleton + shared DB. `qwen-e2e-fixture`: DB/integration. `scheduler-store-pg`: `DB_AVAILABLE` env guard (line 8). `trace-path`: `describeNative` + ETL + shared DB fixture race. |

---

## Architecture Overview

No architecture change. The verifier + runtime already exist; this feature repairs a parsing bug, updates pins, and classifies failures. The existing data flow is unchanged:

```mermaid
graph TD
    A[bun run verify:tree-sitter-native] --> B[verifyStaticContract]
    B --> C[verifyLockContractText]
    C --> D{package type}
    D -->|registry| E[record.at(-1) === expected.sri]
    D -->|git| F[record[2] === expected.gitIdentity - FIX]
    E --> G[verifyTreeSitterNative]
    F --> G
    G --> H[Cold consumer spawn]
    H --> I[assertRuntimeTarget - pin update]
    I --> J[withMaskedBunVersion]
    J --> K[node-gyp-build -> build/Release/*.node]
```

The only structural change is branch `F` (Git packages read `record[2]` for gitIdentity instead of `record.at(-1)`). Everything else is a pin value update.

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --- | --- | --- |
| `verifyLockContractText` | `scripts/verify-tree-sitter-grammars.ts:362-424` | Fix the Git-package index read (line 404-414). Keep the registry SRI path. |
| `NATIVE_LOCK_IDENTITIES` | `packages/core/src/services/structural/native-lock-identities.ts` | Unchanged. Data is correct; verifier reading was wrong. |
| `native-macos-arm64-workflow.test.ts` baseline non-touch sensor | `scripts/tests/native-macos-arm64-workflow.test.ts:62-79` | Keep this sub-test as-is; only rewrite the first 2 sub-tests to read `ci.yml`. |
| `withMaskedBunVersion` | `packages/core/src/services/structural/grammar-loaders.ts:111+` | Unchanged. Masks Bun version before native load so the Node-path (`node-gyp-build`) resolves `build/Release/` regardless of Bun version. This is why 1.3.14 works without a real port. |
| `assertRuntimeTarget` (2 sites) | `scripts/verify-tree-sitter-grammars.ts:345`, `packages/core/src/services/structural/grammar-loaders.ts:206` | Update the Bun version pin in both. |

### Integration Points

| System | Integration Method |
| --- | --- |
| `bun.lock` | Read-only. The lock format is correct; the verifier must match it, not the other way. |
| CI (`ci.yml`) | Update Bun version pins in both `structural-native` and `structural-native-linux` jobs. |
| Codespace | Install Bun 1.3.14 before Linux re-verification (Codespace currently has 1.3.11 under Node v24.14.0). |

---

## Components

### Lock-Contract Verifier Fix

- **Purpose**: Read the correct record index for Git packages so `verifyLockContract` passes.
- **Location**: `scripts/verify-tree-sitter-grammars.ts:404-414`
- **Interface**: `verifyLockContractText(source, fileName?)` (unchanged signature)
- **Dependencies**: `NATIVE_LOCK_IDENTITIES` (unchanged data)
- **Reuses**: Existing `parseBunLockText`, `invariant`, `TRUSTED_NATIVE_PACKAGES`
- **Change**: For Git packages (where `"gitIdentity" in expected` and NOT `"sri" in expected`), read `record[2]` and compare to `expected.gitIdentity`. For registry packages (where `"sri" in expected`), keep `record.at(-1)` === `expected.sri`. The branch already exists at line 405 (`if ("sri" in expected) ... else ...`); only the `else` body's index read changes from `record.at(-1)` to `record[2]`.

### Missing-Workflow Test Rewrite

- **Purpose**: Assert the actual `ci.yml:137` `structural-native` job instead of a deleted file.
- **Location**: `scripts/tests/native-macos-arm64-workflow.test.ts`
- **Interface**: Unchanged test names; rewritten `readWorkflow()` to read `ci.yml` and scope assertions to the `structural-native` job block.
- **Dependencies**: `ci.yml` (source of truth), `EXPECTED_BUN_VERSION`, `EXPECTED_NODE_BUILD_VERSION`, `EXPECTED_NPM_VERSION`
- **Reuses**: Baseline non-touch sensor (3rd sub-test) unchanged.
- **Change**: `WORKFLOW_PATH` → `.github/workflows/ci.yml`. `readWorkflow()` returns the full `ci.yml`. Sub-tests 1-2 assert the `structural-native` job block (lines 137-176) pins the target Bun, Node 22 LTS, frozen install, build, native-structural unit tests, and does not target non-arm64. Sub-test 3 unchanged.

### Bun Pin Update (all sites)

- **Purpose**: Coherently move all Bun version pins from `1.3.11` to `1.3.14`.
- **Locations** (8 sites):
  1. `scripts/verify-tree-sitter-grammars.ts:26` — `EXPECTED_BUN_VERSION = "1.3.14"`
  2. `packages/core/src/services/structural/language-manifest.ts:20` — `STRUCTURAL_BUN_VERSION = "1.3.14"`
  3. `package.json:60` — `"packageManager": "bun@1.3.14"`
  4. `.github/workflows/ci.yml:151-154` — `structural-native` Bun 1.3.14
  5. `.github/workflows/ci.yml:193-196` — `structural-native-linux` Bun 1.3.14
  6. `README.md:822-823, 937-938` — runtime pins + CI table rows
  7. `scripts/tests/verify-tree-sitter-grammars.test.ts:38` — `expect(EXPECTED_BUN_VERSION).toBe("1.3.14")`; lines 154, 163, 190 cold-consumer `bun` assertions → `"1.3.14"`
  8. `scripts/tests/native-macos-arm64-workflow.test.ts:39-44` — uses `EXPECTED_BUN_VERSION` (already imported), so the rewritten assertions inherit the bump automatically.
- **Dependencies**: None (mechanical pin update). ABI `137` confirmed on 1.3.14 — `EXPECTED_NATIVE_MODULE_ABI` (line 28) and `TREE_SITTER_NATIVE_MODULE_ABI` (line 19) unchanged.
- **Reuses**: All existing pin sites.
- **Change**: Value-only edits. No logic change.

### npm Version Confirmation

- **Purpose**: Confirm actual npm on Codespace under Node 25.9.0; update `EXPECTED_NPM_VERSION` if it differs from `11.14.1`.
- **Location**: `scripts/verify-tree-sitter-package-artifact.ts:29`
- **Verification**: `gh codespace ssh -c wave3-debian-gate-wv567j4g9j35x76 -- 'nvm use 25.9.0 && npm --version'` in Execute. The prompt says Codespace npm is `11.12.1`; the contract said `11.14.1`. Update to the actual.

### AD Amendment Record

- **Purpose**: Record AD-004/005/006 re-baseline in STATE.md.
- **Location**: `.specs/project/STATE.md` `## Decisions` table
- **Change**: Append amendment rows to AD-004, AD-005, AD-006 showing re-baselined to Bun `1.3.14`, Node `25.9.0` unchanged, ABI 137 unchanged, patch SHA unchanged, with evidence (parse proven under 1.3.14 via masked-Bun Node-path; end-to-end verifier PASS on macOS + Codespace).

---

## Data Models

No new data models. `NATIVE_LOCK_IDENTITIES` interface (line 67-75) unchanged. The lock record format is read-only.

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| `verifyLockContractText` Git package `record[2]` missing | `invariant` throws `bun.lock ${packageName} Git identity drifted: undefined` | Verifier fails loud — lock is malformed |
| Bun 1.3.14 native load fails (hypothetical ABI break) | Investigation proved this does NOT happen. If Execute finds a real failure, stop and record as AD amendment blocking the bump. | Shim path remains the fallback. |
| Codespace has Bun 1.3.11 not 1.3.14 | Execute installs Bun 1.3.14 on the Codespace before Linux re-verification. | No user impact; Codespace is ephemeral. |
| 6-suite group is a real bug | Fix in-task; group passes solo after fix. | Test suite green for that group. |
| 6-suite group is test-isolation gap | Document root cause in `validation.md`; group remains failing in-suite. | CI signal documents the gap. |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| Lock-contract index fix could break the existing SRI discrimination sensor | `verify-tree-sitter-grammars.test.ts:80-86` | The corrupt-SRI test replaces the SRI string; if the fix changes the registry path, this sensor could survive (bad). | The fix only changes the `else` branch (Git packages); the `if ("sri" in expected)` registry path is unchanged. The corrupt-SRI test targets `tree-sitter` (registry package), so it still hits `record.at(-1)` === `expected.sri`. Sensor remains killed. |
| Lock-contract index fix could break the existing gitIdentity discrimination sensor | `verify-tree-sitter-grammars.test.ts:87-93` | The corrupt-gitIdentity test replaces the gitIdentity string at its position (index 2); if the fix reads a different index, the sensor could survive. | The fix reads `record[2]` for Git packages. The test corrupts the gitIdentity string in `bun.lock` at the position it appears (index 2). So `record[2]` will hold the corrupted value and the invariant throws. Sensor remains killed. |
| Bun 1.3.14 may have a subtle native behavior difference not caught by the minimal parse probe | investigation only proved one parse | Could miss a runtime regression. | The full `verify:tree-sitter-native` script (33+33 parses, 27+27 modules, 10 behavior sensors, RSS disposal stress, packed package) runs end-to-end after the bump. This is the real gate, not the one-off probe. |
| Codespace Bun 1.3.14 install may fail or drift | Codespace is ephemeral | Linux re-verification blocked. | Use `gh codespace ssh` + `curl -fsSL https://bun.sh/install | bash` or `npm i -g bun@1.3.14` under Node 25.9.0. Fallback: stay on 1.3.11 for Linux verification and document the macOS-only bump (last resort). |
| 6-suite classification could misclassify a real bug as test-isolation | all 6 files | Real bug ships. | Each group run solo + failure inspected. The classification records the specific root cause (e.g., "process-global mock.module collision with memory-crud.test.ts" per `_bun-mock-guard.ts`). A real bug has a deterministic failure mode, not a "passes solo, fails in-suite" pattern. |
| `EXPECTED_NPM_VERSION` mismatch (11.14.1 vs 11.12.1) | `verify-tree-sitter-package-artifact.ts:29` | Package verifier fails on Codespace. | Confirm actual npm in Execute; update to the real value. The `native-macos-arm64-workflow.test.ts` imports `EXPECTED_NPM_VERSION` (line 7) and asserts it (line 44) — the rewritten test must use the confirmed value. |
| Prebuilds directory not created by `bun install` under either Bun version | `node_modules/tree-sitter/` | Bun-path `require('./prebuilds/...')` would fail. | The structural runtime masks `process.versions.bun` before load (`withMaskedBunVersion`), forcing the Node-path (`node-gyp-build` → `build/Release/`). This is existing behavior, unchanged by the bump. NOT in scope to fix (would require patching the patched `index.js` — frozen contract). |

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Lock-contract fix: read `record[2]` for Git packages vs. normalize the lock | Fix the verifier | The lock format is the source of truth (`bun.lock` is generated by Bun). The verifier's expectation was wrong. Fixing the verifier's index read is the honest representation. Normalizing the lock would mean Bun is generating "wrong" locks, which is false. |
| Missing-workflow test: option (b) rewrite vs. (a) restore file vs. (c) delete | Option (b) rewrite | The inline merge into `ci.yml:137` is the actual state. A separate file would re-diverge. Deleting loses the baseline non-touch sensor. User confirmed (b). |
| Bun bump as pin update vs. real port | Pin update | Investigation proved ABI 137 matches 1.3.14, native parse works under 1.3.14 via the masked-Bun Node-path, and the only blocker is the `process.versions.bun === "1.3.11"` pin. No binding incompatibility, no parse behavior change. |
| Whether to split into two features | One combined feature | User chose one combined feature. D1 (verifier repair) is prerequisite for D2 (bump) validation, but combining keeps the artifact set simpler and the dependency is internal. |
| macOS CI Node version | Keep Node 22 LTS | `ci.yml:156-166` comment documents Node 25 V8 headers fail under macos-14 Apple clang (braced-init-list). The Bun bump does NOT change the Node build-helper. Linux uses Node 25.9.0 (compiled cleanly on Ubuntu gcc per M21). |

> **Project-level decisions:** The AD-004/005/006 amendment is recorded in `.specs/project/STATE.md` `## Decisions` table (Execute task). No new AD-NNN needed — the existing ADs are amended in-place with a re-baseline row.

---

## Active Decision Handling

AD-004 (active, re-baselined 2026-07-16): pins Bun `1.3.11`. This feature **amends** AD-004 to Bun `1.3.14` (Node `25.9.0` unchanged, ABI 137 unchanged). The amendment is recorded as a new row in STATE.md Decisions table citing the evidence. The old row stays; the amendment row is appended.

AD-005 (active, re-baselined 2026-07-16): pins patch SHA `e79aec7b...`. This feature does NOT change AD-005 (patch SHA unchanged). The amendment records that the patch is confirmed compatible with Bun 1.3.14 (same evidence: masked-Bun Node-path load).

AD-006 (active): parser pool. Unchanged. The amendment records that the pool contract holds under 1.3.14.

---

## Verification Design

| High-Risk Requirement | How Tests Prove It |
| --- | --- |
| NVR-003 (corrupt gitIdentity still kills) | `verify-tree-sitter-grammars.test.ts:87-93` corrupts the gitIdentity string in `bun.lock`; `verifyLockContractText` must throw `tree-sitter-dart Git identity drifted`. After the index fix, `record[2]` holds the corrupted value, so the invariant throws. Sensor killed. |
| NVR-004 (corrupt SRI still kills) | `verify-tree-sitter-grammars.test.ts:80-86` corrupts the SRI string; `verifyLockContractText` must throw `tree-sitter SRI drifted`. Registry path (`record.at(-1)`) unchanged. Sensor killed. |
| NVR-005..006 (end-to-end verifier exit 0) | `bun run verify:tree-sitter-source-dist` + `bun run verify:tree-sitter-native` exit 0 on macOS arm64 + Codespace. |
| NVR-010 (missing-workflow test 3/3) | `bun test scripts/tests/native-macos-arm64-workflow.test.ts` passes 3/3. |
| NVR-025 (end-to-end verifier under 1.3.14) | `bun run verify:tree-sitter-native` exits 0 on macOS arm64 under machine-default Bun 1.3.14 (no PATH shim). |
| NVR-026 (Linux re-verify under 1.3.14) | Codespace: install Bun 1.3.14, `bun run verify:tree-sitter-native` exits 0. |
| Discrimination sensor (full Fool gate) | Plan-critic subagent runs pre-mortem on the plan: what assumption fails, what check falsifies, high-risk domain, >5 files. |

---

## Rejected Alternatives

| Alternative | Rejected Because |
| --- | --- |
| Normalize `bun.lock` to put gitIdentity last | The lock is generated by Bun; its format is correct. The verifier must match the lock, not the other way. |
| Restore `.github/workflows/native-macos-arm64.yml` as a separate file | Re-diverges from the inline merge. The test should assert reality. |
| Delete `native-macos-arm64-workflow.test.ts` | Loses the baseline non-touch sensor (sub-test 3). Option (b) keeps it. |
| Stay on Bun 1.3.11 and keep the shim | The prompt explicitly asks to re-baseline to 1.3.14 so the shim is no longer needed. ABI matches; no real incompatibility. |
| Patch the patched `index.js` to add a `build/Release/` Bun-path fallback | Frozen contract (AD-005). The masked-Bun Node-path already handles this. Out of scope. |
| Split into two features | User chose one combined feature. |

---

## Artifact-Store Evidence

- Active artifact key: `.specs/features/native-runtime-rebaseline/design.md`
- Version: 1 (initial Design)
- Checksum: git-tracked (recorded by commit)