# Linux Native Structural Runtime — Independent Validation

**Role:** Final independent verifier (TLC v3 Validate phase). Author ≠ verifier.
**Date:** 2026-07-21
**Repo:** `/Users/luizmassa/Personal Projects/massa-th0th-wt-wave-3` (branch `wave-3`)
**Baseline:** `cc5e5e9` (M21 start)
**Diff range:** `cc5e5e9..be9c8e8` (T1–T4: 4 atomic commits)
**Runtime:** Bun `1.3.11`, Node `25.9.0` (npm `11.14.1`). macOS arm64 (this session).
**Linux gate env:** Ubuntu Codespace (pre-decided, M19 precedent) — **NOT accessible from this session.**

## Overall VERDICT: PARTIAL PASS — T5/T6 BLOCKED (Codespace unavailable)

Phase A (T1–T4) is COMPLETE and PASSING on macOS arm64. All code changes are platform-conditional, compile clean, and pass type-check/build/full-suite on macOS. Phase B (T5/T6) requires the Ubuntu Codespace to run the frozen native verifier on Linux glibc x64. Per the frozen contract: "Mandatory unavailable gates block the feature — do not silently skip." T5/T6 are Blocked with evidence; M21 status = `blocked` pending a Codespace session.

## Per-Acceptance-Criterion Table

| AC | Requirement | Verdict | Evidence |
| --- | --- | --- | --- |
| AC-001 / LNLSR-001 | assertRuntimeTarget accepts linux/x64 | PASS | T1 `40f085a`: `grammar-loaders.ts:206` + `verify-tree-sitter-grammars.ts:345` accept (darwin,arm64) OR (linux,x64). Focused test `native-target-predicate.test.ts` 9/9 pass (darwin/arm64 accept, linux/x64 accept, win32/darwin-x64/linux-arm64/linux-arm/freebsd/aix reject). |
| AC-002 / LNLSR-002 | ELF linkage verification | PASS (static) | T2 `35f8f74`: `verifyNativeLinkage` branches on platform. Linux uses `readelf -d` NEEDED entries + allowed-soname regex set. macOS keeps `file` + `otool -L` + allowedLibraries byte-identical. Focused test `verify-tree-sitter-elf-linkage.test.ts` 10/10 pass (parseElfNeeded, allow-set accept/reject, non-system rejection, foreign-arch rejection, macOS regression guard). **Linux runtime execution: BLOCKED (T5).** |
| AC-003 / LNLSR-003 | isNativeTarget + describeNative widen | PASS | T3 `2167901`: `native-skip.ts:12` accepts (darwin,arm64) OR (linux,x64). `native-target-predicate.test.ts` 13/13 pass including isNativeTarget/describeNative assertions. |
| AC-004 / LNLSR-004 | Linux addon builds from source | BLOCKED | T5: requires Ubuntu Codespace. Node 25.9.0 C++20 `binding.gyp` compile unverified on Linux toolchain (pre-mortem #1: may need Node 22 LTS fallback). No code change needed; verification requires Linux. |
| AC-005 / LNLSR-005 | Linux native verifier (33+33, 27+27, 10 sensors, RSS < 16 MiB, ELF) | BLOCKED | T5: requires Ubuntu Codespace. `bun run verify:tree-sitter-source-dist` on Linux unverified. ELF linkage runtime execution unverified (static logic PASS in AC-002). |
| AC-006 / LNLSR-006 | Linux packed-package verifier | BLOCKED | T6: requires Ubuntu Codespace. `bun run verify:tree-sitter-package` cold consumer install on Linux unverified. |
| AC-007 / LNLSR-007 | Linux CI gate | PASS (static) | T4 `be9c8e8`: `ci.yml` adds `structural-native-linux` job (ubuntu-latest, Bun 1.3.11, Node 25.9.0, frozen install, build, verify:tree-sitter-native, unit tests, provenance upload). `native-linux-x64-workflow.test.ts` 6/6 pass (pins, verifier, artifact upload, non-touch of pre-existing macOS test/other workflows). **CI execution: not run (GitHub Actions).** |
| AC-008 / LNLSR-008 | Docs dual-platform parity | PASS | T4 `be9c8e8`: README updated (macOS arm64 + Linux glibc x64, ELF x86-64, no musl/Alpine/Windows). `polyglot-indexing-docs.test.ts` 13/13 pass. |
| AC-009 / LNLSR-009 | E2E + graph-gen guards widen | PASS (static) | T3 `2167901`: E2E guards (02/09/15) + graph-gen PG guards accept linux/x64. `structural-grammar-readiness.test.ts` 6/6 pass. **Linux E2E execution: BLOCKED (T5).** |
| AC-010 / LNLSR-010 | Blocked with evidence if Codespace unavailable | PASS (by design) | This validation.md records the Blocked evidence. Code changes proceed on macOS; Linux verification gates are honestly Blocked, not silently skipped. |

## Gate Results (macOS arm64, Bun 1.3.11 — this session)

| Gate | Command | Result |
| --- | --- | --- |
| Focused T1 | `bun test packages/core/src/__tests__/native-target-predicate.test.ts` | **PASS** — 13/13 (9 T1 + 4 T3 assertions). |
| Focused T2 | `bun test scripts/tests/verify-tree-sitter-elf-linkage.test.ts` | **PASS** — 10/10. |
| Focused T3 | `bun test packages/core/src/__tests__/structural-grammar-readiness.test.ts` | **PASS** — 6/6. |
| Focused T4 (CI) | `bun test scripts/tests/native-linux-x64-workflow.test.ts` | **PASS** — 6/6. |
| Focused T4 (docs) | `bun test scripts/tests/polyglot-indexing-docs.test.ts` | **PASS** — 13/13. |
| Type-check | `bun run type-check` | **PASS** — 6/6. |
| Build | `bun run build --force` | **PASS** — 5/5. |
| Full regression | `bun run test` | **PASS** — only the documented pre-existing failure set (auto-improve-job, etl-cache-invalidation, etl-pipeline-queue, qwen-e2e-fixture, scheduler-store-pg, trace-path). No new failures from T1–T4. |
| Pre-existing test non-touch | `git diff --name-only cc5e5e9..HEAD -- scripts/tests/native-macos-arm64-workflow.test.ts` | **PASS** — empty (no changes to the pre-existing failing test). |

## Gate Results (Linux glibc x64 — BLOCKED, requires Codespace)

| Gate | Command | Result |
| --- | --- | --- |
| Native source/dist | `bun run verify:tree-sitter-source-dist` | **BLOCKED** — requires Ubuntu Codespace. |
| Native packed package | `bun run verify:tree-sitter-package` | **BLOCKED** — requires Ubuntu Codespace. |
| Full regression (Linux) | `bun run test` | **BLOCKED** — requires Ubuntu Codespace. |

## Discrimination Sensors

| Sensor | Fault injected | Test guard | Result |
| --- | --- | --- | --- |
| (a) Platform predicate | Mock `acceptsPlatform("win32","x64")` expecting false | `native-target-predicate.test.ts` rejects win32/x64, darwin/x64, linux/arm64, freebsd, aix | **KILLED:** all 5 non-native combos rejected. |
| (b) ELF non-system library | `parseElfNeeded` on readelf output with `libtree-sitter-vendor.so.1` NEEDED entry | `verify-tree-sitter-elf-linkage.test.ts` rejects non-system soname | **KILLED:** `isAllowedLinuxSoname("libtree-sitter-vendor.so.1")` = false. |
| (c) ELF foreign-arch ld-linux | `isAllowedLinuxSoname("ld-linux-aarch64.so.1")` | `verify-tree-sitter-elf-linkage.test.ts` rejects foreign-arch | **KILLED:** false (only `ld-linux-x86-64.so.2` allowed). |
| (d) macOS Mach-O regression | Source scan for `otool` + `Mach-O 64-bit bundle arm64` + `/usr/lib/libc++.1.dylib` | `verify-tree-sitter-elf-linkage.test.ts` macOS regression guard | **KILLED:** macOS branch present and unchanged. |
| (e) Pre-existing test non-touch | `git diff cc5e5e9..HEAD -- scripts/tests/native-macos-arm64-workflow.test.ts` | `native-linux-x64-workflow.test.ts` non-touch sensor | **KILLED:** empty diff (pre-existing failure not chased). |

## Pre-Mortem Findings (incorporated before Execute)

1. **HIGH — Node 25.9.0 C++20 headers on Ubuntu:** Pre-decided Node 22 LTS fallback as documented AD-004 amendment (ci.yml:162 macOS precedent). T5 steps record the exact compiler error + fallback if needed. **Status: unverified (T5 Blocked).**
2. **CRITICAL — Pinned grammar Linux-compatibility:** Out-of-Scope row added ("no version change — Blocked"). T5 sub-step records failing package as blocker. **Status: unverified (T5 Blocked).**
3. **MEDIUM — ldd parsing:** T2 uses `readelf -d` NEEDED entries (deterministic). **Status: static logic PASS; runtime unverified (T5 Blocked).**
4. **MEDIUM — Codespace unavailable:** Designed graceful degradation. **Status: ACTIVE — T5/T6 Blocked, this validation.md is the evidence.**
5. **HIGH — Pre-existing test chase:** T4 explicit non-touch + `git diff` discrimination. **Status: PASS — sensor (e) killed.**

## Residual Risk

- **T5/T6 Blocked (Codespace):** The Linux native runtime verifier and packed-package verifier cannot run in this session. The code is platform-conditional and macOS-passing, but Linux runtime behavior (addon build, 33-grammar load, ELF linkage, RSS stress) is unverified. A Codespace session is required to unblock. This is the honest outcome per the frozen contract — no silent skip, no weakening.
- **Node 25.9.0 Linux compile (pre-mortem #1):** May require Node 22 LTS fallback. The CI job pins Node 25.9.0; if it fails, the CI job will need a fallback step (not yet in ci.yml — deferred until T5 surfaces the actual compiler behavior).
- **Grammar Linux build (pre-mortem #2):** One or more pinned grammars may not build on Linux. If so, M21 remains Blocked — no version change (frozen contract).
- No other residual risk across the macOS-side code changes, CI static contract, or docs parity.

## Final Tree State

`git status` clean after T4 commit. HEAD `be9c8e8`. No tracked implementation file mutated by validation; only this `validation.md` artifact is edited.

## Artifact Store Evidence

- Active key: `.specs/features/linux-native-structural-runtime/validation.md`
- Verifier: independent (TLC v3 Validate), distinct from feature author.
- This file is the only artifact edited by this validation; no implementation file was modified.