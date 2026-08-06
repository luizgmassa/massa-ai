# Plugin Architecture Unification Validation

**Date**: 2026-08-05 (iteration 1); re-verified 2026-08-05 (iteration 2, gap-1 fix `8376dee6`)
**Spec**: `.specs/features/plugin-architecture-unification/spec.md`
**Diff range**: `origin/main..HEAD` (specs `f0d84a7e`, baseline `0a81f85d`, `7efd1633`,
`4f198e82`, `251621ec`, `3b1a5642`, `c9aee7c3`, `fca8e995`, `3fb8c44c`, `dc18ed30`, `186bbd12`;
iteration 2 adds fix commit `8376dee6`)
**Verifier**: independent sub-agent (author ≠ verifier)
**Final verdict**: ✅ PASS (iteration 2 of max 3) — see [Iteration 2](#iteration-2--re-verification-gap-1-fix) below. The body through "Requirement Traceability Update" is the iteration-1 record, preserved as delivered; iteration-1's own bottom-line verdict was FAIL (1 gap) — do not read the historical AC table's PAU-14 row or the old Summary section as the current verdict.

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1 (PAU-15, folded baseline) | ✅ Done | Cursor flat agents, OpenCode real copy, install-skills Cursor warning present at `0a81f85d`; amended suites green |
| T2 (PAU-02/04) | ✅ Done | `opencode_plugin_present()` fully removed from `scripts/install-agents.sh`; suite scenarios 11/12 added |
| T3 (PAU-01/03) | ✅ Done | `apps/opencode-plugin/install.sh` delegates registration on install, no delegation on uninstall |
| T4 (PAU-05/06) | ✅ Done | `installer_plugin_sentinel_present` in `scripts/lib/installer-shared.sh:305` |
| T5 (PAU-05/06/07) | ✅ Done | `install-harness.sh` gates skip-current on sentinel; PAI-11 added, red-first documented (187/14 → 201/0) |
| T6 (PAU-08..11) | ✅ Done | `claude_bridge_detected()` in `apps/cursor-plugin/install.sh:141`; both branches covered |
| T7 (PAU-12) | ✅ Done | Zero `tool({` registrations in `apps/opencode-plugin/src/index.ts`; hooks-only contract test |
| T8 (PAU-13) | ✅ Done | `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md`; AD-017 row in `.specs/project/STATE.md:3244` |
| T9 (PAU-14) | ⚠️ Partial | Scripted sweep literals all clean live; **one unswept live claim survives** — see Gap 1 |
| T10 (PAU-16/17) | ✅ Done | CHANGELOG `[Unreleased]` extended (`186bbd12`); no live-`$HOME` writes found in diff; FEATURES.json/HANDOFF.md explicitly deferred to orchestrator per commit message |

---

## Spec-Anchored Acceptance Criteria

### P1: OpenCode full tool surface

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| PAU-01: install delegates MCP registration; resolved config has exactly one entry | one `mcp.massa-ai` entry present | `apps/opencode-plugin/__tests__/install.test.ts:504-517` — `expect(mcp!["massa-ai"]).toBeDefined()` after install; `scripts/tests/test-mcp-single-writer.sh:157-163` — `Boolean(c.mcp && c.mcp["massa-ai"])` === `"true"` | ✅ PASS |
| PAU-02: install-agents.sh opencode path writes MCP entry regardless of plugin listing form | entry written for npm/local/bare forms | `scripts/tests/test-mcp-single-writer.sh:118-138` — 3-form loop asserts `Boolean(c.mcp && c.mcp["massa-ai"])` === `"true"` for each form | ✅ PASS |
| PAU-03: `--uninstall` removes only plugin entry, MCP entry survives | plugin entry gone, MCP entry present | `apps/opencode-plugin/__tests__/install.test.ts:519-533` — both assertions; `scripts/tests/test-mcp-single-writer.sh:165-180` | ✅ PASS |
| PAU-04: single-writer suite fails on any plugin-local MCP file or second registration path | suite asserts absence + delegation | `scripts/tests/test-mcp-single-writer.sh:26-56` (scenarios 1-4, all hosts incl. opencode) | ✅ PASS |
| PAU-01 AC5: install-agents.sh missing/failing → recovery command printed, no success claim | exact recovery command + no "MCP registered" in stdout | `apps/opencode-plugin/__tests__/install.test.ts:535-573` — `expect(res.stderr).toContain("register MCP with: bash scripts/install-agents.sh --agent opencode --yes")`, `expect(res.stdout).not.toContain("MCP registered")` | ✅ PASS |

### P1: Presence-validated harness skip

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| PAU-05 AC1: version-current + sentinel present → skip-current, one log line | log line `skip <host>: already at <rec>` | `scripts/install-harness.sh:261-263,326`; `scripts/tests/test-plugin-auto-install.sh:417-428` — `assert_contains ... "skip cursor: already at 2.0.0"` and `assert_eq "installer NOT run" "" ` | ✅ PASS |
| PAU-05/06 AC2: version-current + sentinel absent → reinstall, log names missing sentinel | reinstall + `sentinel missing` log line naming host | `scripts/install-harness.sh:264-267,291,337`; `scripts/tests/test-plugin-auto-install.sh:401-414` — `assert_contains "reinstall cursor: sentinel missing"`, `assert_eq "installer ran" "cursor "` | ✅ PASS |
| PAU-06 AC3: sentinel probe read-only; `--dry-run` reports would-be reinstall, writes nothing | dry-run names reinstall, nothing under HOME modified | `scripts/tests/test-plugin-auto-install.sh:323-336` — `assert_eq "no installer ran" ""`, `assert_eq "nothing under HOME modified" "$AFTER" "$BEFORE"` | ✅ PASS |
| PAU-07: suite gains PAI-11 discriminating scenario; PAI-01..10 amended deliberately | red-first population printed, before/after counts | `scripts/tests/test-plugin-auto-install.sh:401-428` (PAI-11 + counterpart); commit `3b1a5642` body: "Observed red ... 187 passed, 14 failed (201 total) ... After the fix: 201 passed, 0 failed" | ✅ PASS |

### P1: Cursor single load, hooks once

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| PAU-08: Claude-bridge detected → skip local plugin + hook wiring, remove pre-existing local copy | no `plugins/local/massa-ai`, zero owned hook entries | `apps/cursor-plugin/__tests__/install.test.ts:348-364` — `pathExists(...).toBe(false)`, `ownedHookCount(...).toBe(0)` | ✅ PASS |
| PAU-09: no bridge detected → full local install (fallback) | local plugin dir present, hooks present, `installRoute:"local"` | `apps/cursor-plugin/__tests__/install.test.ts:374-395` — `pathExists(...).toBe(true)`, `ownedHookCount(...).toBeGreaterThan(0)`, `installRoute` === `"local"` | ✅ PASS |
| PAU-08/09: both branches write flat agents + skills | agents/skills present in both branches | `apps/cursor-plugin/__tests__/install.test.ts:356-362` (bridge) and existing local-branch tests (lines 142-345) | ✅ PASS |
| PAU-10: exactly one hook wiring active per branch | bridge: 0 local hook entries; fallback: >0 | `apps/cursor-plugin/__tests__/install.test.ts:356` (bridge, `toBe(0)`), `:384-386` (local, `toBeGreaterThan(0)`) | ✅ PASS |
| PAU-11: `--uninstall` removes local copy + owned agents + owned hooks regardless of branch | agents dir empty of `massa-ai-*`, `my-own-agent.md` survives | `apps/cursor-plugin/__tests__/install.test.ts:329-345` | ✅ PASS |

### P1: Hooks-only OpenCode plugin + AD-017

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| PAU-12: zero in-process tools, event handlers preserved | `plugin.tool` undefined; 6 named handlers present + invokable | `apps/opencode-plugin/src/__tests__/index.test.ts:78-105` — `expect(plugin.tool).toBeUndefined()`; handler-presence loop | ✅ PASS |
| PAU-13: ADR AD-017 exists with context/consequences | decision, context (14-vs-54, Cursor double load, wipe), consequences | `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md` (full doc); `.specs/project/STATE.md:3244` | ✅ PASS |
| PAU-14: docs state 54 tools, no remaining in-process-tool claim | zero live stale rows | Sweep for `52 tools`/`13 tools`/`14 in-process`/`registers tools in-process` returns zero live rows outside `.specs/`/CHANGELOG (verified via `/usr/bin/grep -rEn`). **However** two live docs (`CLAUDE.md:368`, `FEATURES.md:527`) still claim "the OpenCode in-process `profile` tool" — a stale in-process-tool claim the named sweep literals did not catch (see Gap 1) | ❌ GAP |
| PAU-12: `bun run test:plugins` + opencode suite pass with registrations gone | 0 failures | `bun run test:plugins` → 119 pass/0 fail (8 files); `cd apps/opencode-plugin && bun run test` → 125 pass/0 fail (7 files) | ✅ PASS |

### P2: Fold prior uncommitted work / Delivery hygiene

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| PAU-15: folded baseline present, amended suites pass | commit `0a81f85d` present, suites green | `git log --oneline` shows `0a81f85d`; gate re-run confirms 57/201/25/27/125 all green | ✅ PASS |
| PAU-16: CHANGELOG modified under `[Unreleased]` | non-empty diff to CHANGELOG.md under that heading | `CHANGELOG.md:9-46` (`### Changed` / `### Removed` under `## [Unreleased]`) | ✅ PASS |
| PAU-17: machine repair staged as printed commands, never executed | no code path in the diff writes real `~/.cursor`/`~/.config/opencode`/`~/.claude` | Diff scan (`git diff origin/main..HEAD -- '*.sh' '*.ts'`) for unsandboxed `install.sh`/`install-harness.sh` invocations returns none; every installer invocation added by this diff runs under `HOME=`/`--target` sandboxing (test files, suite scripts) | ✅ PASS (scoped per task instruction — repair-command staging itself lives in the orchestrator's final chat report, out of this repo's diff) |

**Status**: ❌ 16/17 PAU requirements fully covered by spec-precise assertions; **1 gap** (PAU-14, doc sweep incomplete — see below).

---

## Discrimination Sensor

Scratch worktree: `git worktree add /tmp/pau-scratch HEAD` (commit `186bbd12`). `node_modules`
symlinked in from the real checkout (bun workspace, position-independent per lockfile);
`bun run build` run once for the OpenCode plugin bundle; `bun run generate:artifacts` run
once for gitignored plugin bundles. Baseline suite counts confirmed present and green in
scratch before any mutation: single-writer 57/0, plugin-auto-install 201/0, cursor
install.test.ts 25/0, opencode index.test.ts 27/0 — matching the real-tree counts exactly
(sensor presence confirmed, not assumed).

| # | File:line | Description | Suite run | Population before → after | Killed? |
| - | --------- | ------------ | --------- | --------------------------- | ------- |
| M1 | `scripts/install-agents.sh` (post `for agent in $AGENTS`) | Re-added `opencode_plugin_present()` skip-when-listed check (pre-fix behavior) | `test-mcp-single-writer.sh` | 57/0 → 52/5 fail | ✅ Killed |
| M2 | `apps/opencode-plugin/install.sh:614` | Flipped install-path delegation from `--agent opencode --yes` to `--agent opencode --uninstall --yes` | `test-mcp-single-writer.sh` + `install.test.ts` | 57/0 → 54/3 fail; 27/0 → 25/2 fail | ✅ Killed |
| M3 | `scripts/lib/installer-shared.sh:305` | `installer_plugin_sentinel_present` forced `return 0` (always present) | `test-plugin-auto-install.sh` | 201/0 → 187/14 fail | ✅ Killed |
| M4 | `scripts/install-harness.sh:261` | Sentinel-present condition replaced with `if true` (skip-current unconditional) | `test-plugin-auto-install.sh` | 201/0 → 187/14 fail | ✅ Killed |
| M5 | `apps/cursor-plugin/install.sh:168` | Removed `enabled === false` early-exit in `claude_bridge_detected()` (disabled plugin treated as enabled) | `install.test.ts` (cursor) | 25/0 → 24/1 fail | ✅ Killed |
| M6 | `apps/opencode-plugin/src/index.ts:179` | Re-registered one in-process tool (`ping`) in the returned Hooks object | `index.test.ts` (opencode) | 27/0 → 26/1 fail | ✅ Killed |

**Sensor depth**: lightweight-to-P0 (6 mutations, public compatibility surfaces — installers,
sentinel gate, hooks-only contract — all four P1 stories covered).
**Result**: 6/6 killed — PASS ✅

All mutations reverted (`git checkout --`) and the scratch worktree removed
(`git worktree remove --force /tmp/pau-scratch`) before verdict. Real-tree
`git status --porcelain` before sensor work: empty. After cleanup: empty (byte-identical,
diffed).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ (codex delegation pattern reused for opencode; existing sentinel/hint helper style) |
| Spec-anchored outcome check (asserted values match spec) | ✅ (see AC table) |
| Per-layer Coverage Expectation met | ✅ (shell suites cover installer state transitions; TS suites cover per-installer branches; unit test covers hooks-only contract) |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | CLAUDE.md (isolated-runner rules, N/A here — shell/bun test, not core), CONTRIBUTING.md 7-step managed-harness protocol (cited in tasks.md, applied per-task) |

---

## Edge Cases

- [x] `.jsonc` with comments/trailing commas — parse-tolerant behavior preserved (`opencode-plugin/__tests__/install.test.ts:445-483`)
- [x] `--uninstall` sentinel gating N/A — confirmed unaffected (`install-harness.sh` gating only intercepts skip-current branch, per T5 commit message)
- [x] `install-state.json` records host whose config dir no longer exists → `skip-absent` wins — pre-existing, unchanged (T5 commit: "skip-absent ... untouched")
- [x] `~/.claude` exists, plugin absent/disabled → Cursor local-fallback — `install.test.ts:397-431` (disabled + absent-registry cases)
- [x] Pre-fix double-install converges to one load — `install.test.ts:462+` ("one run converges")
- [x] OpenCode plugin file present, MCP entry missing → harness re-run converges — implied by PAU-02 (install-agents.sh always writes) + sentinel logic never masking a missing MCP entry (sentinel only gates plugin-file presence, not the independent MCP write)
- [ ] `MASSA_AI_PLUGIN_SOURCE_ROOT` copy mode + sentinel probes target installed host paths — **not directly evidenced** by a dedicated test in this diff; sentinel probes read `$TARGET_HOME` paths unconditionally (`installer-shared.sh:305-345`), which structurally satisfies the edge case, but no test exercises `MASSA_AI_PLUGIN_SOURCE_ROOT` + sentinel together — flagged as a minor coverage note, not a blocking gap (spec's Verification Approach does not name this edge case among the enumerated gates)

---

## Gate Check

- **Gate command**: `bun run generate:artifacts && bun run lint && bun run test:plugins && bun run test:scripts` (Build gate per tasks.md), plus the explicit per-suite commands named in the assignment
- **Results** (real tree, HEAD `186bbd12`):
  - `bash scripts/tests/test-mcp-single-writer.sh` → 57 passed, 0 failed (57 total) — matches expected
  - `bash scripts/tests/test-plugin-auto-install.sh` → 201 passed, 0 failed (201 total) — matches expected
  - `cd apps/cursor-plugin && bun test __tests__/install.test.ts` → 25 pass, 0 fail — matches expected
  - `cd apps/opencode-plugin && bun test __tests__/install.test.ts` → 27 pass, 0 fail — matches expected
  - `cd apps/opencode-plugin && bun run test` → 125 pass, 0 fail (7 files) — matches expected
  - `bun test scripts/__tests__/skill-artifact-parity.test.ts scripts/__tests__/subagent-parity.test.ts` → 88 pass, 0 fail
  - `bun run lint` → 0 violations (oxlint)
  - `bun run test:plugins` → 119 pass, 0 fail (8 files, all four hosts)
  - `bun run generate:artifacts` → exit 0, bundle counts consistent
- **Skipped tests**: none observed
- **Failures**: none

---

## Fix Plans (if issues found)

### Fix 1: Stale "OpenCode in-process `profile` tool" claim survives in two live docs (PAU-14)

- **Root cause**: T9's scripted doc sweep (`.specs/features/plugin-architecture-unification/tasks.md:293`) used a fixed literal set (`52 tools`, `13 tools`, `14 in-process`, `registers tools in-process`, `registers 14 tools`) that does not include the phrase "in-process `profile` tool" — a claim that predates this feature (added by `model-profile-switching`) and was never in the sweep's literal list, so it survived T7's removal of that tool untouched.
- **Fix task**: Update `CLAUDE.md:368` and `FEATURES.md:527` to drop "the OpenCode in-process `profile` tool" from the profile-switching front list (now: MCP `profile_list`/`profile_set`, both `massa-ai-config` CLIs, the Claude `skills/profile/` skill — OpenCode reaches profile switching only via MCP after this feature, per the spec's own confirmed assumption "Dropping the in-process `profile` tool loses no capability").
- **Priority**: Minor (doc accuracy, no functional impact; both target hosts route through the same underlying switch engine regardless of the doc wording)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ----------- |
| PAU-01 | Pending | ✅ Verified |
| PAU-02 | Pending | ✅ Verified |
| PAU-03 | Pending | ✅ Verified |
| PAU-04 | Pending | ✅ Verified |
| PAU-05 | Pending | ✅ Verified |
| PAU-06 | Pending | ✅ Verified |
| PAU-07 | Pending | ✅ Verified |
| PAU-08 | Pending | ✅ Verified |
| PAU-09 | Pending | ✅ Verified |
| PAU-10 | Pending | ✅ Verified |
| PAU-11 | Pending | ✅ Verified |
| PAU-12 | Pending | ✅ Verified |
| PAU-13 | Pending | ✅ Verified |
| PAU-14 | Pending | ❌ Needs Fix (doc sweep gap — 2 live rows) |
| PAU-15 | Pending | ✅ Verified |
| PAU-16 | Pending | ✅ Verified |
| PAU-17 | Pending | ✅ Verified (scoped per verification-agent instruction) |

Note: `.specs/project/FEATURES.json` has no entry for this feature yet (T10's commit
explicitly deferred FEATURES.json/HANDOFF.md to "the orchestrator owns spec-state
delivery" — outside this verifier's read-only + report-write scope).

---

## Iteration 1 Summary (superseded by Iteration 2 below)

**Overall**: ⚠️ Issues
**Result**: FAIL

**Spec-anchored check**: 16/17 ACs matched spec outcome; 1 gap (PAU-14)
**Sensor**: 6/6 mutations killed (population printed above) — the tests are discriminating
**Gate**: 9/9 named suites/commands passed, 0 failed

**What works**: All four P1 stories (OpenCode MCP registration, harness sentinel self-heal,
Cursor single-load, hooks-only OpenCode + ADR) have precise, spec-matching test assertions
and all pass. The discrimination sensor confirms the tests actually detect regressions
across every public compatibility surface touched (install-agents.sh, opencode installer,
sentinel helper, harness gating, cursor bridge probe, opencode hooks-only contract). No
mutant survived. Real worktree isolation held throughout (porcelain unchanged).

**Issues found**: PAU-14's doc sweep, while scripted and effective against its own named
literal set, missed a stale claim outside that set ("the OpenCode in-process `profile`
tool" in `CLAUDE.md:368` and `FEATURES.md:527`) — see Fix 1.

**Next steps (as of iteration 1)**: Route Fix 1 to an implementer (two one-line doc edits);
re-run the PAU-14 sweep with the phrase added to its literal list to prevent recurrence;
re-verify. **Superseded**: this was done — see Iteration 2.

---

## Iteration 2 — Re-verification (gap-1 fix)

**Trigger**: Coordinator reported fix commit `8376dee6` ("docs: retire the last two OpenCode
in-process profile-tool claims (validation gap 1)") — `CLAUDE.md:365-371` and
`FEATURES.md:524-531` rewritten so both profile-switching front lists describe the OpenCode
in-process `profile` tool as retired under AD-017, routing OpenCode through the MCP
`profile_list`/`profile_set` pair or the `massa-ai-config` CLI instead.

**Independent re-derivation (not trusting the coordinator's own enumeration or its claimed
population of 142):**

1. Confirmed the fix commit's actual diff via `git show 8376dee6 -- CLAUDE.md FEATURES.md` —
   both hunks replace the live "the OpenCode in-process `profile` tool," / "an OpenCode
   in-process `profile` tool," clauses with past-tense retirement language pointing at AD-017
   and the MCP pair. No other file touched by this commit.
2. Re-ran my own sweep of the PAU-14 literal set across the live docs named by the spec
   (`52 tools`, `13 tools`, `14 in-process`, `registers tools in-process`, `registers 14
   tools`) against `CLAUDE.md`, `README.md`, `FEATURES.md`,
   `skills/massa-ai/references/mcp-tools.md`, `skills/massa-ai/SKILL.md` — zero rows (all
   five greps exit 1 / no match).
3. Independently enumerated the broader `in-process` phrase class myself, not reusing the
   coordinator's count: `git ls-files -z | xargs -0 grep -In "in-process"` → **184 rows across
   88 tracked files** (my own count; differs from the coordinator's reported 142 — plausibly a
   different scope, e.g. `.md`-only or a dedup rule — the discrepancy itself is not evidence of
   a miss, since I inspected the full 184-row superset, a strict superset of any narrower
   142-row population).
4. Read every "opencode"-adjacent hit in that superset (`CLAUDE.md`, `README.md`,
   `FEATURES.md`, `docs/ONBOARDING.md`, `docs/adding-a-host.md`,
   `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md`) with file:line context.
   Classified every row:
   - Accurate current-state hooks/handler descriptions ("registers zero in-process tools,"
     "6 in-process lifecycle handlers," "OpenCode uses in-process handlers") — `README.md:85,
     104, 165, 167, 181, 257, 269, 272, 671, 674, 732, 939`; `FEATURES.md:277, 279, 329`;
     `CLAUDE.md:337`.
   - Correctly past-tensed historical/ADR narrative ("OpenCode shipped 14 in-process tools,"
     "the plugin's own in-process tool set never covered more than a subset," "drops its 14
     in-process tools") — `CLAUDE.md:421`; `docs/adr/0002-*.md:12,50,69,77,78,93,95,114`.
   - Unrelated technical prose (in-process caches, in-process scheduler, in-process
     `Map<string,CacheEntry>`, `embedded-api-client.ts` dispatching in-process,
     `hookBinaryDelivery` mechanism) — `FEATURES.md:814, 861, 866, 868, 1218, 1221`;
     `docs/ONBOARDING.md:102, 119`; `docs/adding-a-host.md:39`.
   - The two previously-stale rows, now fixed and correctly retired-tense —
     `CLAUDE.md:369` ("the OpenCode in-process `profile` tool was retired with the rest of
     the in-process tool surface — AD-017"), `FEATURES.md:528` ("The former OpenCode
     in-process `profile` tool was retired with the plugin's tool surface (AD-017)").
   - **Zero remaining rows claim the OpenCode plugin currently registers, ships, or exposes
     an in-process *tool*.**
5. Re-ran the deterministic gates touched by this fix: `bun run lint` → 0 violations;
   `bun run generate:artifacts` → exit 0 (bundle counts unchanged: 699 skill-bundle files, 68
   agent files, 374 variant files — CLAUDE.md/FEATURES.md are not skill/agent sources, so no
   drift expected or observed); `bun test
   scripts/__tests__/skill-artifact-parity.test.ts scripts/__tests__/subagent-parity.test.ts`
   → 88 pass, 0 fail (unchanged from iteration 1). No new mutation needed — the fix is a
   pure documentation edit with no behavior surface, and the 6 iteration-1 mutations already
   cover every behavioral AC.

**PAU-14 (revised)**: docs state 54 tools, no remaining in-process-tool claim — sweep for the
five spec-named literals plus my own independently-enumerated `in-process` superset (184
rows, 88 files) both return zero live rows claiming OpenCode ships an in-process tool.
`file:line`: `CLAUDE.md:369`, `FEATURES.md:528` (both now retirement-tense, verified by direct
read, not by trusting the fix commit's own message) → **✅ PASS**.

**Updated Requirement Traceability**: PAU-14 → ✅ Verified (was ❌ Needs Fix in iteration 1).
All other 16 PAU-01..17 rows unchanged from iteration 1 (✅ Verified / ✅ Verified-scoped for
PAU-17).

---

## Summary (final, iteration 2)

**Overall**: ✅ Ready
**Result**: PASS

**Spec-anchored check**: 17/17 ACs matched spec outcome (16 in iteration 1 + PAU-14 closed in
iteration 2)
**Sensor**: 6/6 mutations killed (iteration 1; no new mutation needed for a doc-only fix) —
the tests are discriminating across every behavioral public-compatibility surface
**Gate**: 9/9 named suites/commands passed in iteration 1, re-confirmed unaffected in
iteration 2 (`lint` 0 violations, `generate:artifacts` exit 0, parity 88/0)

**What works**: All four P1 stories (OpenCode MCP registration, harness sentinel self-heal,
Cursor single-load, hooks-only OpenCode + ADR) plus P2 (folded baseline, CHANGELOG hygiene,
now the doc sweep) have precise, spec-matching evidence. The discrimination sensor confirms
tests actually detect regressions across every public compatibility surface touched. No
mutant survived. Real worktree isolation held throughout both iterations (porcelain
unchanged). The one gap found in iteration 1 (two stale "OpenCode in-process `profile` tool"
doc claims, PAU-14) was fixed in commit `8376dee6` and independently re-verified — not by
re-reading the fix commit's own claims, but by an independent re-enumeration of the full
`in-process` phrase class (184 rows / 88 files) and manual classification of every
opencode-adjacent row.

**Issues found**: none outstanding.

**Next steps**: None required for this feature. Minor residual note (non-blocking, carried
from iteration 1): `.specs/project/FEATURES.json` traceability entry and `.specs/HANDOFF.md`
remain the orchestrator's responsibility per T10's commit message — outside this verifier's
scope; both were observed as in-progress working-tree edits at re-verification time, not yet
committed.
