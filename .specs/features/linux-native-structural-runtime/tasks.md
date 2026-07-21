# M21 Linux Native Structural Runtime — Tasks

**Feature:** `linux-native-structural-runtime`
**Workflow session:** `spec-m21`
**Scope:** Large; 8 atomic tasks across 3 phases. One atomic commit per task; independent verification before each commit; no push.

## Phases

- **Phase A — Platform widening (macOS-side, no Codespace required):** T1–T4. Code changes that compile and pass type-check/build/full-suite on macOS. Static tests for new CI + docs.
- **Phase B — Linux verification (Codespace required):** T5–T6. Run the frozen verifier on Ubuntu Codespace; mark Blocked with evidence if unavailable.
- **Phase C — Validation:** T7–T8. Independent verifier + bookkeeping.

---

## T1 — Widen `assertRuntimeTarget` to accept linux/x64

**Requirement:** LNLSR-001
**Where:**
- `packages/core/src/services/structural/grammar-loaders.ts:206-222` (`assertRuntimeTarget`)
- `scripts/verify-tree-sitter-grammars.ts:345-356` (`assertRuntimeTarget`)
- `packages/core/src/services/structural/language-manifest.ts:20` (`STRUCTURAL_BUN_VERSION` — confirm no change needed)

**Change:** Replace `process.platform !== "darwin" || process.arch !== "arm64"` with a predicate accepting `(darwin, arm64)` OR `(linux, x64)`. Error message lists the received platform/arch. Bun version + ABI checks remain unchanged (frozen).

**Test coverage:** Add a focused test that mocks `process.platform`/`process.arch` for linux/x64 and confirms acceptance; darwin/arm64 still accepted; win32/x64 rejected. Run under Bun 1.3.11.

**Gate check commands:**
- `bun test packages/core/src/__tests__/structural-runtime.test.ts` (focused)
- `bun run type-check` (6/6)
- `bun run build --force` (5/5)
- `bun run test` (only pre-existing failures)

**Commit:** `feat(parser): accept linux x64 as native structural target`

---

## T2 — Add ELF linkage branch to `verifyNativeLinkage`

**Requirement:** LNLSR-002
**Where:** `scripts/verify-tree-sitter-grammars.ts:681-714` (`verifyNativeLinkage`)

**Change:** Branch on `process.platform`. macOS keeps `file` (Mach-O 64-bit bundle arm64) + `otool -L` + allowedLibraries (libc++.1.dylib, libSystem.B.dylib). Linux uses `file` (ELF 64-bit LSB shared object x86-64) + **`readelf -d`** (deterministic machine-parseable `NEEDED` entries; not `ldd` which is human-readable and varies by distro — pre-mortem finding #3) + allowed-soname regex set: `^linux-vdso\.so\.1$`, `^libstdc\+\+\.so\.6($|\.)`, `^libgcc_s\.so\.1$`, `^libc\.so\.6$`, `^libpthread\.so\.0$`, `^libdl\.so\.2$`, `^libm\.so\.6$`, `^ld-linux-x86-64\.so\.2$`. Parse `NEEDED` lines from `readelf -d` output; reject non-system or foreign-arch modules. The macOS branch remains byte-identical.

**Test coverage:** Add a focused test that mocks `runCommand` output for ELF x86-64 + system libs (accept) and for a non-system lib (reject). Mock Mach-O path unchanged.

**Gate check commands:**
- `bun test scripts/tests/verify-tree-sitter-grammars.test.ts` (focused)
- `bun run type-check` (6/6)
- `bun run build --force` (5/5)
- `bun run test` (only pre-existing failures)

**Commit:** `feat(parser): add elf x86-64 linkage verification for linux`

---

## T3 — Widen test skip predicates and E2E platform guards

**Requirement:** LNLSR-003, LNLSR-009
**Where:**
- `packages/core/src/__tests__/_helpers/native-skip.ts:12-13` (`isNativeTarget`)
- `packages/core/src/__tests__/e2e/02.indexing.test.ts:69-71`
- `packages/core/src/__tests__/e2e/09.symbol-graph.test.ts:33-35`
- `packages/core/src/__tests__/e2e/15.nfr.test.ts:41-43`
- `packages/core/src/__tests__/graph-generation-symbol-repository-pg.test.ts:102-103`
- `packages/core/src/__tests__/graph-generation-lifecycle-pg.test.ts:113-114`
- `packages/core/src/__tests__/structural-grammar-readiness.test.ts:104` (test name says "macOS arm64")

**Change:** `isNativeTarget` = `(platform === "darwin" && arch === "arm64") || (platform === "linux" && arch === "x64")`. E2E guards: replace `throw new Error("...frozen to macOS arm64")` with accepting linux/x64 where the owned stack is available. Graph-generation guards: `expect(process.platform).toBe("darwin")` → accept darwin OR linux. Update the `structural-grammar-readiness` test name to "macOS arm64 or Linux x64".

**Test coverage:** Focused tests confirm `isNativeTarget` true on linux/x64; E2E guards no longer throw on linux/x64 (mock platform if needed).

**Gate check commands:**
- `bun test packages/core/src/__tests__/structural-grammar-readiness.test.ts` (focused)
- `bun run type-check` (6/6)
- `bun run build --force` (5/5)
- `bun run test` (only pre-existing failures)

**Commit:** `test(parser): widen native skip and e2e guards to linux x64`

---

## T4 — Add Linux CI job + docs parity + static workflow test

**Requirement:** LNLSR-007, LNLSR-008
**Where:**
- `.github/workflows/ci.yml:137-175` (add `structural-native-linux` job after `structural-native`)
- `scripts/tests/native-macos-arm64-workflow.test.ts` (rename/clone to assert both jobs — do NOT touch the pre-existing failing assertions on the missing `native-macos-arm64.yml`; add a new additive test file `scripts/tests/native-linux-x64-workflow.test.ts` asserting the new ci.yml job)
- `README.md:824-931` (update docs: "macOS arm64 only" → "macOS arm64 + Linux glibc x64"; add ELF linkage row)
- `scripts/tests/polyglot-indexing-docs.test.ts:43-92` (update assertions to accept dual-platform prose)

**Change:** Add `structural-native-linux` job: `runs-on: ubuntu-latest`; pin Bun 1.3.11 (oven-sh/setup-bun@v2); pin Node 25.9.0 (actions/setup-node@v4) with a documented fallback to Node 22 LTS if C++20 headers fail (pre-mortem finding #1, ci.yml:156-161 precedent); `bun install --frozen-lockfile`; `bun run build`; `bun run verify:tree-sitter-native`; upload `native-linux-x64-verification.log` via actions/upload-artifact@v4 with `if: always()` and `if-no-files-found: error`. Add exact-version inline guards matching the macOS job. Do NOT modify the existing `structural-native` (macOS) job or any other workflow.

**Pre-existing failure non-touch (pre-mortem finding #5):** `scripts/tests/native-macos-arm64-workflow.test.ts` is pre-existing failing (3/3: missing `.github/workflows/native-macos-arm64.yml` + baseline-non-touch sensor). T4 MUST NOT touch this file. After T4, run `git diff --name-only HEAD~1..HEAD` and confirm `scripts/tests/native-macos-arm64-workflow.test.ts` is NOT in the diff. The new additive test is `scripts/tests/native-linux-x64-workflow.test.ts` only.

Update README structural-indexing prose to reflect dual-platform support + ELF linkage. Update `polyglot-indexing-docs.test.ts` assertions: remove/replace "macOS arm64 only" and "no Linux" forbidden phrases with dual-platform expectations. Keep the `Mach-O arm64` mention (still true for macOS) and add `ELF x86-64` for Linux.

**Test coverage:** New `native-linux-x64-workflow.test.ts` asserts the new ci.yml job pins Bun 1.3.11, Node 25.9.0, `runs-on: ubuntu-latest`, verifier invocation, artifact upload. Baseline non-touch sensor: the new job is additive; pre-existing workflows (ci.yml macOS job, needles-gate, publish, skills, Docker) unchanged except the additive `structural-native-linux` block in ci.yml.

**Gate check commands:**
- `bun test scripts/tests/native-linux-x64-workflow.test.ts` (focused)
- `bun test scripts/tests/polyglot-indexing-docs.test.ts` (focused)
- `bun run type-check` (6/6)
- `bun run build --force` (5/5)
- `bun run test` (only pre-existing failures — `native-macos-arm64-workflow.test.ts` 3/3 fail is pre-existing, not touched)

**Commit:** `ci(parser): add linux x64 native gate and dual-platform docs`

---

## T5 — Linux native verifier run (Codespace)

**Requirement:** LNLSR-004, LNLSR-005
**Where:** Ubuntu Codespace (pre-decided environment). Run from the worktree on `wave-3` branch.

**Change:** No code change. Run the frozen verifier on Linux.

**Steps:**
1. In Codespace: `git fetch && git checkout wave-3` (or clone + checkout).
2. Verify Bun 1.3.11 + Node 25.9.0 (install if needed: `npm i bun@1.3.11` to a temp dir, prepend PATH; `nvm install 25.9.0`).
3. `bun install --frozen-lockfile` (addon builds from source under Node 25.9.0 + C++20).
   - **If Node 25.9.0 headers reject C++20** (compile errors, same braced-init-list issue as macos-14 ci.yml:156-161): switch to Node 22 LTS (`nvm use 22`), re-run `bun install --frozen-lockfile`. Record the exact compiler error + Node fallback in `validation.md` as a documented AD-004 amendment (pre-mortem finding #1). The addon is N-API ABI-stable, so runtime loading under Bun 1.3.11 is unaffected.
   - **If a pinned grammar package fails to build/load on Linux** (pre-mortem finding #2): record the exact package name + error. Do NOT change the pinned version (frozen contract). Mark T5 Blocked with that package as the blocker. This is the honest outcome per the frozen contract.
4. `bun run build`.
5. `bun run verify:tree-sitter-source-dist` — confirm: `target linux-x64`, 33+33 parses, 27+27 modules, 10 behavior sensors, 100-cycle disposal stress < 16 MiB, ELF x86-64 system-only linkage (via `readelf -d` NEEDED entries), missing/incompatible sensors, patch SHA `e79aec7b…`.
   - **Sample actual `readelf -d` output** from the built tree-sitter addon and confirm the allowed-soname set covers it (pre-mortem finding #3).
6. `bun run type-check` (6/6), `bun run build --force` (5/5).
7. `bun run test` — native suites run (not skipped); only pre-existing failures.

**Blocked handling:** If the Codespace is unavailable this session, record evidence in `validation.md` and mark T5/T6 Blocked. Code changes (T1–T4) are already committed on macOS. Do NOT silently skip.

**Gate check commands:**
- `bun run verify:tree-sitter-source-dist` (Linux)
- `bun run type-check` (6/6)
- `bun run build --force` (5/5)
- `bun run test` (only pre-existing failures)

**Commit:** `build(parser): verify linux x64 native artifacts` (with evidence; or Blocked note if Codespace unavailable)

---

## T6 — Linux packed-package verifier run (Codespace)

**Requirement:** LNLSR-006
**Where:** Ubuntu Codespace. Requires Node 25.9.0 (or 22 LTS fallback) for `npm pack`.

**Change:** No code change. Run the packed-package verifier on Linux.

**Steps:**
1. Follow T5 setup (Bun 1.3.11, Node 25.9.0/22, frozen install, build).
2. Prepend `~/.nvm/versions/node/v25.9.0/bin` (or v22) to PATH.
3. `bun run verify:tree-sitter-package` — confirm: cold empty-cache consumer install, nested patched runtime resolved, 33 parses, 27 modules, 10 sensors, ELF x86-64 system-only linkage.

**Blocked handling:** Same as T5.

**Gate check commands:**
- `bun run verify:tree-sitter-package` (Linux)

**Commit:** `build(parser): verify linux packed package artifacts` (with evidence; or Blocked note)

---

## T7 — Independent validation

**Requirement:** All
**Where:** `.specs/features/linux-native-structural-runtime/validation.md`

**Change:** Independent verifier (author ≠ verifier) runs:
1. Spec-anchored outcome check: each AC in spec.md confirmed against evidence.
2. Discrimination sensor: inject a non-system ELF dep or foreign-arch `.node`; confirm `verifyNativeLinkage` rejects it. If Codespace unavailable, run the focused static test (T2) that mocks the rejection.
3. Write `validation.md`: PASS/FAIL per AC, sensor result, diff range, Blocked evidence for any Codespace-gated AC.

**Commit:** `docs(specs): validate linux native structural runtime`

---

## T8 — Bookkeeping

**Requirement:** All
**Where:**
- `.specs/project/FEATURES.json` (set `linux-native-structural-runtime` phases specify/design/tasks/execute true; status complete or blocked)
- `.specs/project/STATE.md` (M21 progress + decisions)
- `.specs/HANDOFF.md` (M21 section: current/previous)

**Change:** Update canonical state files to reflect M21 outcome (PASS or Blocked with evidence).

**Commit:** `docs(specs): close linux native structural runtime`

---

## Test Coverage Matrix

| Requirement | Test | Gate |
| --- | --- | --- |
| LNLSR-001 | T1 focused: assertRuntimeTarget accepts linux/x64 | `bun test structural-runtime` |
| LNLSR-002 | T2 focused: ELF accept/reject + Mach-O unchanged | `bun test verify-tree-sitter-grammars` |
| LNLSR-003 | T3 focused: isNativeTarget + E2E guards | `bun test structural-grammar-readiness` |
| LNLSR-004 | T5: Linux build + parse (Codespace) | `bun run verify:tree-sitter-source-dist` |
| LNLSR-005 | T5: Linux 33+33/27+27/10/RSS/ELF (Codespace) | `bun run verify:tree-sitter-source-dist` |
| LNLSR-006 | T6: Linux packed consumer (Codespace) | `bun run verify:tree-sitter-package` |
| LNLSR-007 | T4 static: ci.yml linux job | `bun test native-linux-x64-workflow` |
| LNLSR-008 | T4 static: docs parity | `bun test polyglot-indexing-docs` |
| LNLSR-009 | T3: E2E + graph-gen guards | `bun run test` |
| LNLSR-010 | T7: Blocked evidence if Codespace unavailable | `validation.md` |

---

## Gate Check Commands (summary)

- Full regression (macOS, Bun 1.3.11): `PATH="/var/folders/2s/y7r9gt5d15s48_z4nxkhyldr0000gn/T/opencode/bun-1.3.11/node_modules/.bin:$PATH" bun run test`
- type-check: `bun run type-check` (6/6)
- build: `bun run build --force` (5/5)
- Native verifier (macOS): `bun run verify:tree-sitter-native`
- Native verifier (Linux Codespace): `bun run verify:tree-sitter-source-dist` + `bun run verify:tree-sitter-package`
- Focused static tests: `bun test scripts/tests/native-linux-x64-workflow.test.ts scripts/tests/polyglot-indexing-docs.test.ts`

---

## Sub-Agent Offer

8 tasks across 3 phases. Phase A (T1–T4) is macOS-side, no Codespace. Phase B (T5–T6) is Codespace verification. Phase C (T7–T8) is validation + bookkeeping. Per spec-driven sub-agent policy: offer-then-confirm — the user must accept before any sub-agent is dispatched. One worker per batch (~7 tasks). If accepted, a worker executes T1–T4 in order (implement → gate → atomic commit), reports compact summary, then T5–T6 run in Codespace (or Blocked), then T7–T8.

**Default (no sub-agent):** main agent executes one task at a time with independent verification before each commit.