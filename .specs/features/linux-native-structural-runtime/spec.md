# Linux Native Structural Runtime Specification

**Slug:** `linux-native-structural-runtime`
**Source:** Wave 3 M21 (P0); native runtime contract frozen by AD-004/005/006 from `multi-language-tree-sitter-breadth`.
**Workflow session:** `spec-m21`
**Status:** Draft for confirmation
**Scope:** Large; Specify, Tasks, Execute, and independent validation required. Design skipped (recorded below).

## Problem Statement

The native Tree-sitter structural runtime is COMPLETE on macOS arm64 (multi-language-tree-sitter-breadth, verdict PASS 2026-07-17) but every platform gate is hardcoded to `darwin`/`arm64`. The runtime throws on Linux, the native verifier rejects non-Darwin hosts, the linkage check uses Mach-O `otool` instead of ELF tooling, native-structural tests skip via `describeNative`, and CI has no Linux native job. M21 brings the frozen native structural runtime to Linux glibc x64 without re-specifying any structural contract.

## Goals

- [ ] The frozen native runtime (Bun 1.3.11, Node 25.9.0, patched tree-sitter SHA `e79aec7b…`, ABI 137, 16 MiB disposal-stress gate) SHALL load, build, parse, and verify on Linux glibc x64 exactly as it does on macOS arm64.
- [ ] Platform gates, linkage checks, test skip predicates, E2E guards, CI, and docs SHALL accept both `darwin/arm64` and `linux/x64` as supported native targets.
- [ ] If a Linux gate cannot run in the current environment, the feature SHALL be Blocked with evidence — never silently skipped or weakened.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Linux arm64 (aarch64) | Frozen contract is glibc x64 only (M19 precedent: Ubuntu/glibc-x64 user-approved 2026-07-20). |
| musl / Alpine Linux | Frozen contract is glibc only. |
| FreeBSD, Windows, other non-glibc-x64 Linux | Not in the frozen contract. |
| Re-spec of structural contracts (33-language manifest, versioned FQN codec, query packs, resolvers, graph generations, embedded Vue/Markdown, diagnostics, transport parity) | Frozen and COMPLETE from `multi-language-tree-sitter-breadth`. M21 adds the Linux native build + verification, not a re-spec. |
| Changing Bun 1.3.11 / Node 25.9.0 / npm 11.14.1 / patch SHA `e79aec7b…` / ABI 137 pins | Frozen by AD-004/005/006. Node 22 LTS is permitted as build-only helper on Linux if Node 25.9.0 headers reject (documented AD-004 amendment, ci.yml:162 precedent). |
| Changing any pinned grammar version to make it Linux-compatible | Frozen contract. If a grammar won't build/load on Linux at its pinned version, M21 is Blocked with that package as the blocker — no version change. Pre-mortem finding #2. |
| Fixing the pre-existing `native-macos-arm64-workflow.test.ts` failure (3/3 fail: missing `.github/workflows/native-macos-arm64.yml` + baseline-non-touch sensor) | Pre-existing, not task-owned. The workflow was merged inline into `ci.yml:137-175` but the static test still expects a separate file. Never chase pre-existing failures. |
| WASM grammars, runtime downloads, raw CST persistence, compiler/LSP resolution, semantic-search changes | Excluded by the parent feature contract. |

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Linux gate environment | Ubuntu Codespace | M19 precedent — Ubuntu/glibc-x64 was an explicit user-approved substitution for Debian 12, 2026-07-20. Pre-decided; do not re-ask, do not substitute. | y (prompt) |
| Codespace accessibility this session | If the Ubuntu Codespace is not accessible from this session, code changes (platform branches, ELF logic, CI yaml, docs, static tests) proceed on macOS; the Linux build + parse + RSS + ELF verification gates are marked Blocked with evidence | Frozen contract: "Mandatory unavailable gates block the feature." Code is platform-conditional and compilable on macOS; only the Linux runtime verification requires the Codespace. | y (contract) |
| Node 25.9.0 V8 headers compile on Ubuntu glibc x64 (AD-004 amendment) | Attempt Node 25.9.0 first (frozen contract). If Ubuntu's clang/gcc rejects the C++20 braced-init-list template arg (as macos-14's Apple clang did, ci.yml:156-161), fall back to Node 22 LTS as the build-only helper. The addon is N-API (ABI-stable), so the Node major is irrelevant to runtime loading under Bun. **This fallback is a documented AD-004 amendment consistent with ci.yml:162 (macOS already uses Node 22 LTS as build helper for the same clang-rejection reason), not a contract violation.** The exact Node version used on Linux is recorded in validation.md. | The frozen contract pins Node 25.9.0; ci.yml:162 already uses Node 22 LTS for macOS CI as a documented clang-rejection workaround. Pre-mortem finding #1: this must be pre-decided, not discovered at T5 gate time. | n — verify in Codespace |
| 33 grammar packages ship linux-x64 prebuilds or build from source | The install-guard.js no-ops when the prebuilt addon is present (TASK-023 fix). If a grammar lacks a linux-x64 prebuild, node-gyp builds from source under Node 25.9.0 (or 22 LTS fallback) + C++20. **If a pinned grammar version fails to build/load on Linux and cannot be resolved without a version change, T5 marks that package as the blocker and M21 is Blocked — no version change (frozen contract).** | The macOS path uses a mix of prebuilds and from-source builds; the same install-guard logic applies on Linux. Pre-mortem finding #2: grammar source Linux-compatibility is unverified. | n — verify in Codespace |
| 16 MiB disposal-stress bound is platform-independent | The bound guards native binding disposal semantics (idempotent cursor/tree deletion, stale-object guards), not OS-specific memory behavior. Expected to hold on Linux as on macOS. | The patch operates at the N-API binding level (C++ + JS), not the OS level. | n — verify in Codespace |
| Design phase skipped | No new architecture, interfaces, data model, migration, security/privacy, or public-contract decisions. The design is "mirror the macOS implementation for Linux x64 with ELF instead of Mach-O." | Spec-driven auto-sizing: the code changes are platform-condition widening + an ELF linkage branch. The structural contracts are frozen. | y |
| E2E platform guards (02/09/15, graph-generation 2 files) | Guards SHALL accept `linux/x64` where the test doesn't require an owned macOS stack. The graph-generation PG tests require an owned PostgreSQL instance (env `GRAPH_GENERATION_TEST_ADMIN_URL`); they are platform-agnostic once the native runtime loads. The E2E tests (02/09/15) require an owned API+Ollama+PostgreSQL stack; they are platform-agnostic once native parsing works. | The guards were frozen to macOS arm64 because that was the only supported native target. M21 adds Linux x64 as a supported target, so the guards widen. | y |
| Pre-existing `native-macos-arm64-workflow.test.ts` (3/3 fail) | Not touched. The test expects a separate `.github/workflows/native-macos-arm64.yml` that was merged into `ci.yml`. M21 may add a parallel `native-linux-x64.yml` or a `structural-native-linux` ci.yml job. | Pre-existing failure, not task-owned. Never chase. | y |

**Open questions:** none — all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Linux native runtime loads and parses ⭐ MVP

**User Story**: As a developer on Linux glibc x64, I want the native Tree-sitter structural runtime to load, build, and parse all 33 manifest extensions so that I can use the structural indexer on Linux without falling back to regex.

**Why P1**: The frozen native runtime contract (AD-004/005/006) is the production parser. Without Linux support, the runtime throws on `assertRuntimeTarget` and the entire structural pipeline is unavailable on Linux.

**Acceptance Criteria**:

1. WHEN `assertRuntimeTarget` runs on `linux`/`x64` with Bun 1.3.11 and ABI 137 THEN it SHALL accept the target without throwing (LNLSR-001).
2. WHEN the patched tree-sitter@0.25.0 addon builds from source on Ubuntu glibc x64 under Node 25.9.0 THEN the C++20 `binding.gyp` SHALL compile and produce a loadable ELF addon (LNLSR-004).
3. WHEN `verify:tree-sitter-source-dist` runs on Ubuntu Codespace THEN 33+33 source/dist parses, 27+27 native modules, 10 behavior sensors, 100-cycle disposal stress < 16 MiB, ELF x86-64 system-only linkage, missing/incompatible sensors SHALL pass (LNLSR-005).
4. WHEN `isNativeTarget` evaluates on `linux`/`x64` THEN it SHALL return true so `describeNative` suites execute instead of skipping (LNLSR-003).

**Independent Test**: Run `bun run verify:tree-sitter-source-dist` on Ubuntu Codespace under Bun 1.3.11; confirm status PASS with `target linux-x64`.

---

### P1: ELF linkage verification ⭐ MVP

**User Story**: As a verifier, I want the native linkage check to assert ELF x86-64 system-only linkage on Linux so that non-system or foreign-arch addons are caught.

**Why P1**: The macOS verifier uses `file` + `otool -L` for Mach-O arm64. Linux requires `file` + `ldd`/`readelf -d` for ELF x86-64. Without the ELF branch, the verifier cannot validate Linux native modules.

**Acceptance Criteria**:

1. WHEN `verifyNativeLinkage` runs on Linux THEN every loaded `.node` module SHALL be asserted as ELF 64-bit LSB shared object x86-64 via `file` (LNLSR-002).
2. WHEN `verifyNativeLinkage` runs on Linux THEN every loaded `.node` module's dynamic dependencies SHALL be system-only (glibc, libstdc++, libpthread, libdl, libm, ld-linux) via `ldd` or `readelf -d` (LNLSR-002).
3. WHEN `verifyNativeLinkage` runs on macOS THEN the existing Mach-O arm64 + `otool -L` branch SHALL remain unchanged (LNLSR-002).

**Independent Test**: Inject a non-system `.node` on Linux; confirm `verifyNativeLinkage` rejects it.

---

### P1: Linux packed-package verifier ⭐ MVP

**User Story**: As a Linux consumer, I want to install the packed core tarball and get the nested patched runtime with a loadable ELF addon so that packed consumers cannot resolve an unpatched runtime.

**Why P1**: The macOS packed-package verifier (TASK-023) proves the core tarball bundles the exact patched runtime. Linux consumers need the same guarantee with ELF linkage.

**Acceptance Criteria**:

1. WHEN `verify:tree-sitter-package` runs on Ubuntu Codespace THEN a cold empty-cache consumer install of packed shared/core tarballs SHALL resolve the nested patched runtime, parse 33 extensions, load 27 modules, run 10 sensors, and confirm ELF x86-64 system-only linkage (LNLSR-006).

**Independent Test**: Run `bun run verify:tree-sitter-package` on Ubuntu Codespace; confirm `target linux-x64`, `bundled runtime addon` present, ELF linkage.

---

### P1: Linux CI gate ⭐ MVP

**User Story**: As a maintainer, I want CI to run the native verifier on ubuntu-latest so that Linux native regressions are caught before merge.

**Why P1**: The macOS CI job (`ci.yml:137-175`, `runs-on: macos-14`) gates macOS native. Linux needs a parallel job.

**Acceptance Criteria**:

1. WHEN CI runs on `ubuntu-latest` THEN a `structural-native-linux` job SHALL pin Bun 1.3.11 + Node 25.9.0 (or documented fallback), run `bun install --frozen-lockfile`, `bun run build`, and `bun run verify:tree-sitter-native`, and upload provenance artifacts (LNLSR-007).
2. WHEN the Linux CI job is added THEN existing macOS and Docker CI jobs SHALL remain unchanged (LNLSR-007).

**Independent Test**: Static workflow test asserts exact pins, `runs-on: ubuntu-latest`, verifier invocation, artifact upload.

---

### P2: Docs and E2E platform parity

**User Story**: As a developer, I want docs and E2E tests to reflect Linux glibc x64 as a supported native target so that the dual-platform contract is visible and tested.

**Why P2**: The README and docs tests currently assert "macOS arm64 only" and "no Linux." E2E guards throw on Linux. These must widen to reflect M21.

**Acceptance Criteria**:

1. WHEN docs tests run THEN README SHALL document macOS arm64 + Linux glibc x64 as supported native targets and ELF linkage (LNLSR-008).
2. WHEN E2E tests (02/09/15) run on `linux`/`x64` THEN platform guards SHALL accept the target where the owned stack is available (LNLSR-009).
3. WHEN graph-generation PG tests run on `linux`/`x64` THEN platform guards SHALL accept the target where the owned PostgreSQL is available (LNLSR-009).

**Independent Test**: Run docs tests + E2E on Linux; confirm no "frozen to macOS arm64" throw.

---

## Edge Cases

- WHEN the Ubuntu Codespace is unavailable this session THEN the feature SHALL mark Linux verification gates Blocked with evidence (code changes proceed on macOS) (LNLSR-010).
- WHEN Node 25.9.0 headers fail to compile on Ubuntu's clang/gcc THEN the build SHALL fall back to Node 22 LTS as the build-only helper (N-API ABI-stable; ci.yml:156-161 precedent) and record the fallback reason.
- WHEN a grammar package lacks a linux-x64 prebuild THEN node-gyp SHALL build from source under Node 25.9.0 + C++20 via the install-guard fallback path.
- WHEN a Linux native module links a non-system library THEN `verifyNativeLinkage` SHALL reject it with the library name.
- WHEN `process.platform` or `process.arch` is neither darwin/arm64 nor linux/x64 THEN `assertRuntimeTarget` SHALL throw with the received platform/arch.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| LNLSR-001 | P1: Linux native runtime loads | Tasks | Pending |
| LNLSR-002 | P1: ELF linkage verification | Tasks | Pending |
| LNLSR-003 | P1: Linux native runtime loads | Tasks | Pending |
| LNLSR-004 | P1: Linux native runtime loads | Tasks (Codespace) | Pending |
| LNLSR-005 | P1: Linux native runtime loads | Tasks (Codespace) | Pending |
| LNLSR-006 | P1: Linux packed-package verifier | Tasks (Codespace) | Pending |
| LNLSR-007 | P1: Linux CI gate | Tasks | Pending |
| LNLSR-008 | P2: Docs and E2E parity | Tasks | Pending |
| LNLSR-009 | P2: Docs and E2E parity | Tasks | Pending |
| LNLSR-010 | All | Execute | Pending |

**ID format:** `LNLSR-[NUMBER]` (Linux Native Language Structural Runtime)

**Status values:** Pending → In Tasks → Implementing → Verified

**Coverage:** 10 total, 10 mapped to tasks, 0 unmapped.

---

## Success Criteria

How we know the feature is successful:

- [ ] `bun run verify:tree-sitter-source-dist` passes on Ubuntu Codespace with `target linux-x64`, 33+33 parses, 27+27 modules, 10 sensors, RSS < 16 MiB, ELF linkage.
- [ ] `bun run verify:tree-sitter-package` passes on Ubuntu Codespace with cold consumer install + ELF linkage.
- [ ] `bun run type-check` 6/6 and `bun run build` 5/5 on macOS (code changes compile on both platforms).
- [ ] `bun run test` on macOS shows only the pre-existing failure set (no new failures from platform widening).
- [ ] CI has a `structural-native-linux` job on `ubuntu-latest` pinning Bun 1.3.11.
- [ ] Docs reflect dual-platform support.
- [ ] If Codespace is unavailable, Linux verification gates are Blocked with evidence (not silently skipped).

---

## Verification Approach

- **macOS-side gates** (run this session under Bun 1.3.11): type-check 6/6, build 5/5, `bun run test` (only pre-existing failures), focused static tests for the new CI workflow + docs parity.
- **Linux-side gates** (run in Ubuntu Codespace): `verify:tree-sitter-source-dist` (33+33 parses, 27+27 modules, 10 sensors, RSS < 16 MiB, ELF linkage), `verify:tree-sitter-package` (cold consumer install, ELF linkage), `bun run test` (native suites run, not skipped).
- **Discrimination sensor**: inject a non-system ELF dependency or a foreign-arch `.node`; confirm `verifyNativeLinkage` rejects it.
- **Independent verifier**: spec-anchored outcome check + discrimination sensor; writes `validation.md`.

## Artifact Store Evidence

- Active key: `.specs/features/linux-native-structural-runtime/spec.md`
- Version: 1 (initial Specify for M21)
- Checksum: recorded after artifact freeze.