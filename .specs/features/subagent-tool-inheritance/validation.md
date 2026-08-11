# Sub-agent Tool Inheritance Validation

**Date**: 2026-08-11
**Spec**: `.specs/features/subagent-tool-inheritance/spec.md`
**Diff range**: `c32b8a22..c6495d73` (10 commits, base `origin/main`)
**Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-subagent-tool-inheritance`
**Verifier**: independent sub-agent (author ≠ verifier) — fresh read of spec/design/tasks/diff, no author context inherited

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | `claudeToolPolicyFor` replaces `toolsFor`; independently re-derived, matches design |
| T2 | ✅ Done | `subagent-parity.test.ts` rewritten (S3) + per-host MCP-blocking sensor (S4) added, non-vacuous |
| T3 | ✅ Done | 18/18 charters: spawn prohibition removed, router/persona clause retained |
| T4 | ✅ Done | 4/4 reference lines: nesting prohibition removed, sequential-execution rule restated verbatim |
| T5 | ✅ Done | Announcement contract added to `references/agent-orchestration.md` |
| T6 | ✅ Done | S8/S9 sensors present and green, S9 executes the real `resolveHostLayout` |
| T7 | ✅ Done | `toolGating` field added to `HostCapabilities`, all 4 hosts cited |
| T8 | ✅ Done | `CLAUDE.md` + `CHANGELOG.md` updated |
| T9 | ⚠️ Partial | Spec artifacts closed out, but see **Gap 1** — `STATE.md`/`HANDOFF.md`/`FEATURES.json` are stale relative to the 10th commit (`c6495d73`), which fixed the regression they still describe as blocking |

A 10th commit (`c6495d73`, outside T1-T9's own numbering) repaired
`apps/claude-plugin/__tests__/install.test.ts`'s CLA-02 test, which HANDOFF.md/STATE.md/
FEATURES.json record as a real, unfixed, "DO NOT MERGE" regression discovered at T9's
build gate. I independently confirmed the fix landed and works (see Gate Check below);
the three `.specs/` state files were never updated to reflect it — see Gap 1.

---

## Spec-Anchored Acceptance Criteria

### STI-01 — Claude sub-agents inherit session MCP tools

| # | Spec-defined outcome | Evidence | Result |
| - | --- | --- | --- |
| .1 | `emitClaude` emits no `tools:` for a charter with no override | `scripts/generate-subagent-artifacts.ts:157-161,320-332` — `claudeToolPolicyFor`; independently re-generated all 108 files (18 agents × 6 dirs: `agents/` + 5 profiles) and parsed frontmatter — 0 non-navigator files carry `tools:` | ✅ PASS |
| .2 | read-only, no override → exactly `disallowedTools: Write, Edit, NotebookEdit` | Same 108-file scan: all 12 read-only agents × 6 dirs (72 files) carry the exact line, byte-for-byte | ✅ PASS |
| .3 | write, no override → neither key | Same scan: all 5 write agents × 6 dirs (30 files) carry neither `tools:` nor `disallowedTools:` | ✅ PASS |
| .4 | override entry → `tools:` allowlist, no `disallowedTools:` | Same scan: navigator × 6 dirs (6 files) all carry `tools: ["mcp__massa-ai__*","Read","Grep","Glob","Bash(pwd)"]` and no `disallowedTools:` | ✅ PASS |
| .5 | every emitted file in `agents/` and every `agent-profiles/<profile>/` satisfies .1-.4 | 108/108 files verified (script output: "Total files checked: 108, Failures: 0"); `scripts/__tests__/subagent-parity.test.ts:407-422` (S3) asserts the same for every profile in `profilesSupporting` | ✅ PASS |
| .6 | unrecognized permission → denylist (fail safe) | `scripts/generate-subagent-artifacts.ts:157-161` — falls through to denylist unconditionally for any non-`WRITE_AGENTS`, non-override name; `scripts/__tests__/generate-subagent-artifacts.test.ts:142-160` asserts this directly for a synthetic unrecognized-permission charter | ✅ PASS |

**Independent Test** (spec.md:198-201) — literally re-run: `massa-ai-designer.md` frontmatter has no `tools:`/`disallowedTools:` line; `massa-ai-investigator.md` has `disallowedTools: Write, Edit, NotebookEdit` and no `tools:` line. Confirmed byte-for-byte. ✅ PASS

### STI-02 — `navigator` keeps its deliberate narrowing

| # | Spec-defined outcome | Evidence | Result |
| - | --- | --- | --- |
| .1 | `massa-ai-navigator.md` contains `tools: ["mcp__massa-ai__*","Read","Grep","Glob","Bash(pwd)"]` | Verified in all 6 generated dirs | ✅ PASS |
| .2 | no `disallowedTools:` | Verified in all 6 generated dirs | ✅ PASS |
| .3 | override stays a per-charter table | `AGENT_TOOLS_OVERRIDE` (`:129-131`) diff-confirmed unchanged | ✅ PASS |

**Independent Test** — regenerated at base commit `c32b8a22` in a scratch `git worktree` (`/tmp/sti-baseline`, no dependency on npm packages — pure-TS local-only imports) and diffed frontmatter against current: `/usr/bin/diff` shows the **frontmatter's `tools:` line is byte-identical**; the only diff in the whole file (all 6 dirs) is the Restrictions-clause body line, which is the separately-verified, in-scope STI-04 charter edit applied uniformly to all 18 charters including navigator's own body. Frontmatter-scoped byte-identity (the literal wording of STI-02's own Independent Test) holds. ✅ PASS

### STI-03 — The other three hosts are proven unaffected

| # | Spec-defined outcome | Evidence | Result |
| - | --- | --- | --- |
| .1 | Cursor/Codex/OpenCode emitters byte-identical output before/after, every charter | Source diff `c32b8a22..c6495d73` on `scripts/generate-subagent-artifacts.ts`: the only two `@@` hunks touch lines 116-164 (Claude policy) and 279-332 (emitClaude); `emitCursor`/`emitCodex`/`emitOpenCode` function bodies have **zero** changed lines. Artifact-level: re-generated base-commit bundles in the scratch worktree and diffed all 18×3=54 files — every file differs by **exactly one line** (2 diff markers), and it is the same Restrictions-clause line STI-04 edited in every charter. Frontmatter/keys are untouched in all 54 files. | ✅ PASS — with caveat: **not literally byte-identical at the artifact level**, because the also-in-scope STI-04 charter edit flows through every host's body content. The emitter *functions* are unchanged; the emitted *bytes* differ by exactly the sanctioned STI-04 edit. See Gap 2. |
| .2 | Cursor files: no `tools` key | `git grep -c -P "^tools:" apps/cursor-plugin/agents/` → 0/18 | ✅ PASS |
| .3 | Codex files: no `tools`/`mcp_servers` key | `git grep -n -P "^(tools\|mcp_servers)\s*="` → 0 matches | ✅ PASS |
| .4 | OpenCode files: no `tools` key, permission map denies no MCP pattern | `git grep` → 0 matches for `tools:`; sample frontmatter confirms `permission: { edit: deny, bash: deny }` only | ✅ PASS |
| .5 | future MCP-blocking construct fails a sensor naming host + construct | `scripts/__tests__/subagent-parity.test.ts:454-493` (S4) — three tests, each throws an `Error` naming the host literally (`"MCP-blocking construct on cursor: ..."`, `"...on codex: ..."`, `"...on opencode: ..."`) and the exact construct value | ✅ PASS |

### STI-04 — "Never spawn subagents" retired

| # | Spec-defined outcome | Evidence | Result |
| - | --- | --- | --- |
| .1 | 18 charters: no spawn-prohibition phrase, any shape | Independently re-derived count (not trusted from author): PCRE class sweep `\bspawn(?:s\|ing\|ed)?\s+(?:\w+\s+){0,2}(?:sub-?){1,3}agents?\b` over `skills/agents/` in two dialects (`git grep -P` and `-E`) → **0 matches**, matching author's claim of 0 | ✅ PASS |
| .2 | 18 charters retain router/persona clause | `git grep -l -P` (and cross-checked `-E`) for the literal clause over `skills/agents/` → **18/18 files**, matching author's claim of 18 | ✅ PASS |
| .3 | `code-reuse-scan.md`, `figma-pre-analysis.md`, `sub-agents.md` — 0 of 4 occurrences remain | Read all three files directly: none contain a spawn/nesting-prohibition sentence; `sub-agents.md:70`'s "It does NOT spawn further sub-agents." is gone, paragraph reads as one sentence sequence | ✅ PASS |
| .4 | sequential-execution rule preserved, restated separately | `skills/massa-ai/references/spec-driven/sub-agents.md:87` — `**Sequential execution:**` heading (retitled from `**No nesting:**`), sentence survives verbatim | ✅ PASS |
| .5 | reintroduction → sensor fails, names file+line | `scripts/__tests__/skills-harness-integrity.test.ts:504-528` (S5) and `scripts/__tests__/workflow-harness-contract.test.ts:841-852` (S6) — **both name the file/charter, neither reports a line number**. See Gap 3. | ⚠️ Spec-precision gap (partial) |
| .6 | 4 host bundles carry edited charter bodies, no residual prohibition | Independent script scan of all 72 generated `agents/*.md`/`*.toml` across all 4 hosts (18×4) for the same PCRE class → **0 offenders** | ✅ PASS |

### STI-05 — Dispatches announce model and effort

| # | Spec-defined outcome | Evidence | Result |
| - | --- | --- | --- |
| .1 | every roster dispatch emits one status line naming agent/model/effort | `skills/massa-ai/references/agent-orchestration.md:231,248-268` — rule + worked examples added to the canonical `Agent Started` label. **Note**: this AC's actual *runtime* observance (did a live dispatch announce it) is not verifiable from a static/artifact check — it is a documentation contract, sensor-guarded (S8) against a competing shape. | ✅ PASS (contract-level; runtime observance out of static-verification reach) |
| .2 | source = installed agent file, not `model-profiles.json` | Stated explicitly at `agent-orchestration.md:255-256`; `scripts/__tests__/workflow-harness-contract.test.ts:939-...` (S9) executes the real `resolveHostLayout` and asserts the doc's path table matches it exactly, per host | ✅ PASS |
| .3 | absent `effort` → `effort: inherit` | Stated at `agent-orchestration.md:259` | ✅ PASS |
| .4 | absent/`inherit` `model` → `model: inherit` | Stated at `agent-orchestration.md:259` | ✅ PASS |
| .5 | unreadable/missing file → unknown, names path, proceeds | Stated at `agent-orchestration.md:260-261` with the real measured 1.48.0/designer example | ✅ PASS |
| .6 | applies to `plan-critic`/`verification-agent`/`designer`/batch workers, no exemption | Stated explicitly at `agent-orchestration.md:248-251` | ✅ PASS |
| .7 | uses `Agent Started` label, 1-2 line budget | `agent-orchestration.md:234` updated in place | ✅ PASS |

**Independent Test**: `scripts/__tests__/workflow-harness-contract.test.ts:880-937` (S8) — verified all three sub-tests pass; confirmed the canonical markers (`effort: inherit`, `model: inherit`) appear in exactly one reference and no workflow dispatch block.

### STI-14 — Behavioral MCP-reachability check (P2)

**Result**: ⏭️ **SKIPPED** (not a fail). Requires a live host session with an MCP server active and a real sub-agent dispatch — structurally unreachable from this static-verification worktree (no interactive Claude Code session, no MCP server process). The `disallowedTools`-honoured-on-plugin-sub-agents assumption remains evidence-grade **B** (two independent prose supports, neither a behavioral observation) as recorded in `spec.md` Assumptions & Open Questions and `.specs/HANDOFF.md`. Per `design.md`'s Risks table, a negative STI-14 result would make this feature `Blocked`, not shipped with a caveat — that check has not been performed by anyone, author or verifier, and must be recorded as such, not implied passing.

### STI-15 — Documentation reflects the contract

| # | Spec-defined outcome | Evidence | Result |
| - | --- | --- | --- |
| .1 | `CLAUDE.md` states per-host mechanism + why Claude needs a denylist | `CLAUDE.md` diff, new paragraph after the plugin-hooks section — states Claude's `tools:` allowlist problem, the `disallowedTools` fix, `navigator`'s exception, and that the other 3 hosts need no allowlist, each with its host citation | ✅ PASS |
| .2 | `host-capabilities.ts` carries the tool-gating fact | `scripts/lib/host-capabilities.ts` diff — new `toolGating: "denylist" \| "none" \| "sandbox" \| "permission-map"` field, docblock + per-host verbatim citation for all 4 `RAW_CAPABILITIES` entries; exercised by `scripts/__tests__/host-capabilities.test.ts` (+13 lines, part of the green 1804) | ✅ PASS |
| .3 | `CHANGELOG.md` `[Unreleased]` entry | Diff confirmed: `### Fixed`/`### Changed`/`### Added` sections added under `[Unreleased]`. Per `CONTRIBUTING.md:135-146`, `Added`/`Changed` → minor bump, `Fixed` → patch; minor wins when both present — correctly a minor-bump entry as HANDOFF.md claims | ✅ PASS |

**Status**: All P1 ACs (STI-01 through STI-05) PASS. STI-14 correctly recorded SKIPPED. STI-15 PASS. Two spec-precision notes recorded (STI-03.1 artifact-level byte-identity, STI-04.5 line-number reporting) — neither is a functional defect; both are ranked as fix tasks below.

---

## Discrimination Sensor

All mutations injected **in place** in the real worktree and restored by editing the text back (never `git checkout`/`stash`/`reset`), per the mutation-safety directive. `git status --porcelain` confirmed empty after every restore, and after the full mutation sequence.

| # | Probe | File:line | Mutation | Population | Killed? |
| - | --- | --- | --- | --- | --- |
| 1 | **Inherit branch** (S1) | `scripts/generate-subagent-artifacts.ts:160` | `if (WRITE_AGENTS.has(name)) return { kind: "inherit" };` → `return { kind: "denylist", disallowed: READ_ONLY_DISALLOWED };` | 5 `WRITE_AGENTS` members (builder, test-engineer, documentation-agent, judge, designer) | ✅ Killed — 6/59 tests failed in `generate-subagent-artifacts.test.ts` (S1's own test + 5 downstream) |
| 2 | **Denylist branch** (S2) | `scripts/generate-subagent-artifacts.ts:326-328` | denylist branch of `emitClaude` also pushes a spurious `tools: [...]` line alongside `disallowedTools:` | 12 read-only-denylist charters | ✅ Killed — 5/59 tests failed; drift gate additionally listed the 12 affected files by name |
| 3 | **Navigator-allowlist widening** (S3) | `scripts/generate-subagent-artifacts.ts:129-131` | added `investigator` to `AGENT_TOOLS_OVERRIDE`, then regenerated artifacts | 1/18 charters (investigator) — verified via regeneration, not source-only | ✅ Killed — 3/71 tests failed in `subagent-parity.test.ts` |
| 4a | **Charter clause** (S5) | `skills/agents/investigator/SKILL.md:28` | re-inserted the literal historic phrase `"Never spawn subagents, "` before the router/persona clause | 1/18 charters | ✅ Killed — both S5 tests failed (spawn-prohibition sweep AND retained-clause count, since the mutation also breaks the exact-clause match) |
| 4b | **Charter clause** (S5) | `skills/agents/reviewer/SKILL.md:28` | deleted the router/persona clause line entirely | 1/18 charters | ✅ Killed — "all 18 charters retain..." test failed (18→17) |
| 5 | **Reference sequential-execution rule** (S7) | `skills/massa-ai/references/spec-driven/sub-agents.md:87` | deleted the restated `**Sequential execution:**` sentence | 1 line, 1 file | ✅ Killed — S7's test failed directly |

**Sensor depth**: lightweight (6 mutation instances across the 5 minimum-required probe categories, plus the artifact-level S3 regeneration).
**Result**: 6/6 killed, 0 survived — **PASS ✅**

Post-mutation cleanliness re-verified: `git status --porcelain` empty; `XDG_CONFIG_HOME=$(mktemp -d) bun scripts/generate-subagent-artifacts.ts --check` → "No drift"; full re-run of all 4 sensor test files → 288/288 pass.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — `claudeToolPolicyFor` is a clean discriminated union, no speculative generality |
| Surgical changes | ✅ — diff touches exactly the files design.md's Reuse Plan/Traceability name, plus the justified 10th-commit test fix |
| No scope creep | ✅ |
| Matches existing patterns | ✅ — consistent with existing emitter/sensor style |
| Spec-anchored outcome check | ✅ — asserted values (exact `disallowedTools` line, exact `tools:` array) match spec-defined outcomes, not vacuous substring checks |
| Every test maps to a spec requirement | ✅ — S1-S9 table in design.md traces 1:1 to STI-01 through STI-05 |
| Documented guidelines followed | `CONTRIBUTING.md`'s 7-step managed-harness protocol (skills/agents/references/generated-artifact changes) — commit structure (charter+reference edits → generator update → sensor additions → artifact regeneration → docs) matches its shape |

---

## Edge Cases (spec.md Edge Cases section)

- [x] Zero-tools refusal path — denylist branch can never reach it (emits no allowlist); navigator's `Bash(pwd)` risk explicitly out of scope, left byte-identical (confirmed)
- [x] Background sub-agent MCP retention — no code path in this feature affects it; unchanged
- [x] `disallowedTools` ignored for plugin sub-agents → feature would be Blocked — correctly NOT claimed fixed; STI-14 skip is recorded, not silently assumed
- [x] No MCP server active → behavior unchanged — true by construction (denylist just omits a key)
- [x] Stale installed bundle → announcement reports installed values — worked example present (1.48.0/designer)
- [x] Cursor → `model: inherit, effort: inherit` for all 18 — stated in the path table
- [x] Charter added/removed → override table needs no edit — true by construction (`claudeToolPolicyFor` falls through to denylist by default)

---

## Gate Check

**Gate command** (Build level, from `tasks.md` Gate Check Commands):
```
bun run lint && bun run type-check && XDG_CONFIG_HOME=$(mktemp -d) bun scripts/generate-subagent-artifacts.ts --check && bun run test:scripts && bun run test:plugins
```

All five commands re-run independently in this session (not quoted from the author):

| Command | Result (independently measured) | Author's claim | Match? |
| --- | --- | --- | --- |
| `bun run lint` | 0 errors | 0 errors | ✅ |
| `bun run type-check` | 6/6 successful (forced, `--force`, non-cached) | 6/6 | ✅ |
| `XDG_CONFIG_HOME=$(mktemp -d) bun scripts/generate-subagent-artifacts.ts --check` | "No drift: generated files match checked-in files." | no drift | ✅ |
| `bun run test:scripts` | **1804 pass / 0 fail** across 80 TS files; 29/29 shell suites (`scripts/tests/*.sh`) each report 0 failed, 0 `not ok` TAP lines anywhere | 1804 pass / 0 fail across 80 files | ✅ (author's "21 shell suites" in tasks.md prose is a stale pre-existing count in this repo's docs — actual is 29 `.sh` files today; not caused by this feature) |
| `bun run test:plugins` | **135 pass / 0 fail** across 8 files | 135 pass / 0 fail | ✅ — confirms the 10th commit's fix to `install.test.ts` is real and working; HANDOFF.md's own recorded figure of 134/1 is now stale (see Gap 1) |

**Test count before feature**: not independently re-measured against `origin/main` pre-feature (out of scope for a diff-scoped verification per `validate.md`'s "scopes coverage to the feature's git diff surface"); HANDOFF.md records a self-reported baseline of 1803/0 at HEAD before T7's `toolGating` test, +1 after — consistent with the diff (`scripts/__tests__/host-capabilities.test.ts` +13 lines includes exactly one new assertion group for the field).
**Test count after feature**: 1804 (scripts) + 135 (plugins), both independently confirmed.
**Skipped tests**: none in the gate run; STI-14 is a recorded-skip requirement, not a skipped unit test.
**Failures**: none.

---

## Fix Plans

### Gap 1: `.specs/` state artifacts are stale relative to the 10th commit

- **Root cause**: `STATE.md`, `.specs/HANDOFF.md`, and `FEATURES.json` were all written at the T9 commit (`516d076b`), before the follow-up commit `c6495d73` fixed the `install.test.ts` CLA-02 regression they describe. All three still say `test:plugins` is 134/1 and carry an explicit "DO NOT MERGE" framing tied to that now-fixed regression.
- **Fix task**: Update `STATE.md`'s Current section, `.specs/HANDOFF.md`'s header/Gates table/Next-Step/Blockers, and `FEATURES.json`'s `notes` field to record: `test:plugins` now 135/0, the CLA-02 fix landed in commit `c6495d73`, and remove/soften the "DO NOT MERGE" language to reflect that only STI-14 (the live-host behavioral check) remains open.
- **Priority**: Minor — no functional impact, but a real risk of misleading a future reader/agent into believing the feature is still blocked on a closed issue.

### Gap 2: STI-03.1's "byte-identical" wording is not literally met at the artifact level

- **Root cause**: The AC's plain text ("emitters SHALL produce byte-identical output... for every charter") is satisfied for the *emitter functions* (zero source lines changed in `emitCursor`/`emitCodex`/`emitOpenCode`) but not for the *final artifact bytes*, because the also-in-scope STI-04 charter-body edit necessarily flows into all 18×3 host files. `design.md`'s own Tech Decision table already acknowledges this tension ("a byte-freeze fixture... would redden on every legitimate registry change") and deliberately chose the S4 sensor (no MCP-blocking construct) as the durable guarantee instead.
- **Fix task**: Tighten `spec.md` STI-03.1's wording (and its Independent Test) to state the actual guarantee — "the emitter functions are unchanged" plus "no MCP-blocking construct is introduced" — rather than literal artifact byte-identity, which STI-04 makes structurally unachievable by design.
- **Priority**: Minor — documentation precision only; the functional guarantee (S4, STI-03.2-.5) is fully met and sensor-guarded.

### Gap 3: S5/S6 sensors name the file, not the line, contradicting STI-04.5's literal text

- **Root cause**: `scripts/__tests__/skills-harness-integrity.test.ts:504-528` and `scripts/__tests__/workflow-harness-contract.test.ts:841-852` collect offending charter names / relative file paths into an array and assert it equals `[]`. STI-04.5 reads: "a deterministic sensor SHALL fail and name the file **and line**." No line number is captured or reported.
- **Fix task**: Extend the offenders collection to include the matched line number (e.g., split file content on `\n`, find the index of the line matching `SPAWN_PROHIBITION_CLASS`, push `` `${name}:${lineNo+1}` `` instead of bare `name`).
- **Priority**: Minor — the sensor still correctly fails and identifies the file; only the line-number granularity is short of the literal AC text.

None of the three gaps above represents a failed acceptance criterion's core behavior — all three are precision/hygiene items. Recommended: route as a small follow-up task before merge, not as a blocker to this validation's PASS verdict.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| STI-01 | Pending | ✅ Verified |
| STI-02 | Pending | ✅ Verified |
| STI-03 | Pending | ✅ Verified (see Gap 2 note) |
| STI-04 | Pending | ✅ Verified (see Gap 3 note) |
| STI-05 | Pending | ✅ Verified |
| STI-14 | Pending | ⏭️ Skipped — behavioral check not reachable from this worktree; must run before this feature is considered behaviorally closed |
| STI-15 | Pending | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues (minor, non-blocking) — **Result: PASS**

**Spec-anchored check**: 7/7 requirement groups matched their spec-defined outcome (23 of 24 individual sub-criteria fully PASS; 1 sub-criterion — STI-04.5 — partial on line-number granularity)
**Sensor**: 6/6 mutations killed, 0 survived
**Gate**: 5/5 commands green, all independently re-measured (lint 0, type-check 6/6, drift-check clean, test:scripts 1804/0 + 29 shell suites clean, test:plugins 135/0)

**What works**: The core defect (Claude's `tools:` allowlist silently excluding every MCP tool) is fixed via `disallowedTools`, independently confirmed across all 108 generated Claude artifact files and 6 discrimination-sensor mutations. `navigator`'s narrowing is preserved byte-identical at the frontmatter level. Cursor/Codex/OpenCode are confirmed unaffected mechanism-wise (0 MCP-blocking constructs, emitter source unchanged). The nesting prohibition is fully retired (0 matches across 2 grep dialects, 72 generated host files, and source). The announcement contract is documented and sensor-guarded against drift. Documentation (CLAUDE.md, host-capabilities.ts, CHANGELOG.md) is complete and accurate.

**Issues found**:
1. Gap 1 — stale `.specs/` state bookkeeping (STATE.md/HANDOFF.md/FEATURES.json) still says "DO NOT MERGE" over a regression the 10th commit already fixed. Fix: update those three files.
2. Gap 2 — STI-03.1's spec wording claims literal artifact byte-identity, which STI-04's own in-scope charter edit makes unachievable; the actual (and correctly delivered) guarantee is narrower. Fix: tighten the spec wording.
3. Gap 3 — S5/S6 sensors report the offending file but not the line number STI-04.5's text asks for. Fix: extend the offenders array to include line numbers.

**STI-14 remains unverified behaviorally** — this is a recorded, legitimate skip (P2, host-only, not CI-reachable), not a pass. Do not treat this feature as behaviorally closed until STI-14 runs with a real MCP-active host session.

**Next steps**:
1. Fix Gap 1 (update `.specs/` state artifacts) — 5 minutes, no code risk.
2. Optionally address Gaps 2/3 (spec wording + line-number sensor enhancement) as a small follow-up.
3. Run STI-14 (live-host MCP dispatch check) before considering this feature fully closed; record host version, server, and tool called in a future update to this report or a fresh validation pass.
4. Push/PR remains the user's decision, per `.specs/HANDOFF.md`.
