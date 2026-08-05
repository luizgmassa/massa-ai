# Plugin Architecture Unification Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. If the skill cannot be activated, STOP and tell the user.

---

**Design**: `.specs/features/plugin-architecture-unification/design.md`
**Status**: Draft

---

## Project Testing Guidelines Scan

Sources read: `CLAUDE.md` (isolated-runner rules, test:scripts vs test:plugins split, 5 s global timeout, red-first sensor discipline), `CONTRIBUTING.md` (7-step managed-harness protocol — applies to every task here; measurement discipline), `scripts/tests/lib/installer-test-helpers.sh` (shell-suite assertion helpers + `summary`), existing suites `test-mcp-single-writer.sh`, `test-plugin-auto-install.sh`, `apps/{cursor,opencode}-plugin/__tests__/install.test.ts` (sandboxed-`$HOME` bash-invocation pattern, folded baseline already amends them). Conventions: shell suites live in `scripts/tests/`, run via `bun run test:scripts`; plugin TS suites live in `apps/<host>-plugin/__tests__/`, run via `bun run test:plugins` (opencode also plain `bun test` in-package); new sensors observed red before green.

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CLAUDE.md`, `CONTRIBUTING.md`, `scripts/tests/lib/installer-test-helpers.sh`, existing installer suites.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| `scripts/install-agents.sh` (single-writer contract) | shell integration | Every PAU-02/04 AC + reinstall idempotency; red-first on new scenarios | `scripts/tests/test-mcp-single-writer.sh` | `bash scripts/tests/test-mcp-single-writer.sh` |
| `scripts/install-harness.sh` + `scripts/lib/installer-shared.sh` (plugin phase) | shell integration | PAI-01..10 preserved deliberately + PAI-11 wiped-artifact reinstall + dry-run report; red-first | `scripts/tests/test-plugin-auto-install.sh` | `bash scripts/tests/test-plugin-auto-install.sh` |
| `apps/opencode-plugin/install.sh` | integration (bun test, sandboxed $HOME) | MCP entry present after install; preserved after uninstall; recovery message on install-agents failure | `apps/opencode-plugin/__tests__/install.test.ts` | `cd apps/opencode-plugin && bun test __tests__/install.test.ts` |
| `apps/cursor-plugin/install.sh` | integration (bun test, sandboxed $HOME) | Bridge branch (no local plugin dir, zero owned hook entries, agents+skills present, route recorded), fallback branch (current behavior + route), converge-from-double, uninstall both shapes | `apps/cursor-plugin/__tests__/install.test.ts` | `cd apps/cursor-plugin && bun test __tests__/install.test.ts` |
| `apps/opencode-plugin/src/index.ts` | unit (bun test) | Zero registered tools; every event handler named in design present and invokable | `apps/opencode-plugin/__tests__/*.test.ts` | `cd apps/opencode-plugin && bun run test` |
| Docs + skills sources (counts, stale claims) | scripted sweep + parity | Sweep population printed; zero stale rows; parity suites green after regen | `scripts/__tests__/{subagent,skill-artifact}-parity.test.ts` | `bun run test:scripts` |
| ADR / STATE.md / CHANGELOG | none — build gate + validate_state | — | — | build gate |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task touching one suite's subject | the task's own suite command from the matrix row |
| Full | After tasks touching harness/installer contracts | `bun run test:plugins && bun run test:scripts` |
| Build | Phase completion / docs+ADR tasks | `bun run generate:artifacts && bun run lint && bun run test:plugins && bun run test:scripts` |

---

## Execution Plan

### Phase 1: Baseline + OpenCode MCP (PAU-15, PAU-01..04)

T1 → T2 → T3

### Phase 2: Harness sentinel (PAU-05..07)

T4 → T5

### Phase 3: Cursor dedupe (PAU-08..11)

T6

### Phase 4: Hooks-only + ADR + docs + delivery (PAU-12..14, PAU-16..17)

T7 → T8 → T9 → T10

---

## Task Breakdown

### T1: Commit folded baseline

**What**: Commit the reviewed uncommitted diff (Cursor flat agents, OpenCode real copy, install-skills Cursor warning, test/doc/CHANGELOG updates) exactly as reviewed, on a fresh `spec/plugin-architecture-unification` branch cut from `origin/main`, after running its own amended suites.
**Where**: working tree (13 files, pre-existing diff — no new edits)
**Depends on**: None
**Reuses**: the diff itself (session `debug-harness-install-cursor-opencode` output)
**Requirement**: PAU-15
**Task ID**: TASK-001

**Tools**:

- MCP: NONE (git + bash)
- Skill: NONE

**Done when**:

- [ ] Branch cut from `origin/main` (`1906a04e` or later), working tree carried over
- [ ] Spec artifacts committed first as their own `docs(specs)` commit (pre-mortem F3 — T1's fix commit must not swallow them)
- [ ] Gate check passes: `cd apps/cursor-plugin && bun test __tests__/install.test.ts && cd ../opencode-plugin && bun test __tests__/install.test.ts && cd ../.. && bash scripts/tests/test-mcp-single-writer.sh`
- [ ] One fix commit after the specs commit; porcelain clean except in-flight `.specs/` state

**Tests**: integration (already amended in the folded diff — no new tests)
**Gate**: quick

**Commit**: `fix(installers): cursor agents to flat dir, opencode real copy, cursor rules warning`

---

### T2: install-agents.sh always writes opencode + single-writer suite scenarios

**What**: Remove `opencode_plugin_present()` (lines 573–597), its call site (641–642) and header claim (42–43); add opencode scenarios to the single-writer suite (delegation asserted, registration-not-removal, exactly-one-entry sandbox run) — new scenarios observed red against the pre-change installer pair first.
**Where**: `scripts/install-agents.sh` + `scripts/tests/test-mcp-single-writer.sh`
**Depends on**: T1
**Reuses**: suite Scenarios 2–4/7–8 patterns; `installer-test-helpers.sh`
**Requirement**: PAU-02, PAU-04
**Task ID**: TASK-002

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `install-agents.sh --agent opencode` writes the entry with the plugin listed in each of the 3 accepted forms (scenario asserts all three)
- [ ] New scenarios observed red before the installer change (recorded in commit message or test comment)
- [ ] Gate check passes: `bash scripts/tests/test-mcp-single-writer.sh`
- [ ] Test count: suite summary total strictly greater than pre-change total (no silent deletions)

**Tests**: shell integration
**Gate**: quick

**Commit**: `fix(install-agents): opencode MCP entry always written — plugin presence no longer skips`

---

### T3: opencode installer registers MCP, uninstall preserves it

**What**: Replace the install-path MCP removal (605–620) with codex-pattern delegation (`--agent opencode --yes`, warn + recovery command on failure); drop the uninstall-path delegation (467–476); update header comments; amend the installer suite (entry present after install, preserved after uninstall, recovery message on forced failure).
**Where**: `apps/opencode-plugin/install.sh` + `apps/opencode-plugin/__tests__/install.test.ts`
**Depends on**: T2
**Reuses**: `apps/codex-plugin/install.sh:699-715` delegation shape
**Requirement**: PAU-01, PAU-03
**Task ID**: TASK-003

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sandboxed install → exactly one `mcp.massa-ai` entry + plugin entry; `--uninstall` → plugin entry gone, MCP entry intact
- [ ] install-agents.sh absent/failing → recovery command printed, success not claimed
- [ ] New assertions observed red against pre-change installer
- [ ] Gate check passes: `cd apps/opencode-plugin && bun test __tests__/install.test.ts && cd ../.. && bash scripts/tests/test-mcp-single-writer.sh`

**Tests**: integration
**Gate**: quick

**Commit**: `fix(opencode-plugin): installer registers MCP alongside plugin instead of removing it`

---

### T4: Sentinel helper in installer-shared.sh

**What**: Add `installer_plugin_sentinel_present <host> <target_home> <state_file>` implementing the design sentinel table (route-keyed for claude/cursor via `installRoute`; glob probes for codex/cursor/claude-file; file probe for opencode; absent/unparsable → 1=absent). Verify the codex glob against a sandboxed `apps/codex-plugin/install.sh` run before pinning it (design risk R-codex-glob).
**Where**: `scripts/lib/installer-shared.sh`
**Depends on**: T1
**Reuses**: `installer_plugin_versions` runner-heredoc pattern; `installer_host_detected` placement
**Requirement**: PAU-05, PAU-06
**Task ID**: TASK-004

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Helper returns 0 for each host against a freshly-installed sandbox; 1 after deleting that host's sentinel; 1 on corrupt/missing state file
- [ ] Codex glob confirmed against actual installer output (path recorded in helper comment)
- [ ] Fixture shapes for registry-based probes sourced from a read-only capture of this machine's live files, never invented (pre-mortem F2)
- [ ] Gate check passes: helper exercised by the T5 suite scenarios (helper + gating land as sequential commits; suite red between them is the observed-red evidence)

**Tests**: shell integration (via `test-plugin-auto-install.sh` scenarios landing in T5 — merged-forward per co-location rule: the helper is unreachable by any suite until the harness wires it)
**Gate**: quick

**Commit**: `feat(harness): per-host plugin sentinel probe in installer-shared.sh`

---

### T5: Harness presence-gated skip-current + PAI-11

**What**: Gate `skip-current` on the sentinel (absent → `reinstall` action executing like install, one log line naming the missing sentinel); dry-run reports `reinstall`; amend `test-plugin-auto-install.sh`: PAI-11 wiped-artifact scenario (install → wipe artifacts, keep state → re-run → reinstalled) + PAI-05 no-op amended (skip requires sentinel) — PAI-11 observed red against pre-change harness; suite baseline (its own summary count) printed before and after.
**Where**: `scripts/install-harness.sh` + `scripts/tests/test-plugin-auto-install.sh`
**Depends on**: T4
**Reuses**: plan-phase action strings (240–253); PAI scenario harness in the suite
**Requirement**: PAU-05, PAU-06, PAU-07
**Task ID**: TASK-005

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] PAI-11 red on pre-change harness, green after; existing `skip ... already at` log shape preserved for true skips
- [ ] `--uninstall` and `skip-absent`/`skip-newer` paths byte-unchanged in behavior (suite pins)
- [ ] Gate check passes: `bash scripts/tests/test-plugin-auto-install.sh && bash scripts/tests/test-install-harness-cli.sh && bash scripts/tests/test-harness-single-generation.sh`
- [ ] Test count: suite summary before/after printed in commit body (no silent deletions)

**Tests**: shell integration
**Gate**: quick

**Commit**: `feat(harness): skip-current requires on-disk sentinel — wiped installs self-heal`

---

### T6: Cursor bridge preference with local fallback

**What**: Add `claude_bridge_detected()` (parse `$HOME/.claude/plugins/installed_plugins.json` for the massa-ai plugin id); bridge branch skips `PLUGIN_DIR` copy + `merge_hooks_json`, removes pre-existing local dir + owned hook entries; both branches write flat agents, skills, mcp delegation; version record gains `installRoute: "bridge"|"local"`; suite covers bridge/fallback/hook-once/converge-from-double/uninstall-both-shapes.
**Where**: `apps/cursor-plugin/install.sh` + `apps/cursor-plugin/__tests__/install.test.ts`
**Depends on**: T1 (flat-agents baseline), T4 (sentinel reads the route this task records)
**Reuses**: node/bun heredoc probe pattern; owned-entry filter in `merge_hooks_json`; Claude installer's state-write heredoc (`install.sh:420-470`)
**Requirement**: PAU-08, PAU-09, PAU-10, PAU-11
**Task ID**: TASK-006

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Probe surface pinned against a read-only capture of this machine's live `~/.claude/plugins/installed_plugins.json` + `settings.json` `enabledPlugins` shapes; bridge requires installed AND enabled where determinable (pre-mortem F1); residual host-behavior uncertainty documented in the T8 ADR
- [ ] Fake `~/.claude` registry present → no `plugins/local/massa-ai`, zero `_massaAiOwned` hook entries, agents+skills present, `installRoute: "bridge"`
- [ ] Registry absent/unparsable → full local install, `installRoute: "local"`
- [ ] Pre-existing local install + registry → one run converges (local dir gone, owned hooks stripped)
- [ ] New assertions observed red against pre-change installer
- [ ] Gate check passes: `cd apps/cursor-plugin && bun test __tests__/install.test.ts && cd ../.. && bash scripts/tests/test-plugin-auto-install.sh`

**Tests**: integration
**Gate**: quick

**Commit**: `feat(cursor-plugin): prefer Claude-bridge load, install local copy only as fallback — hooks fire once`

---

### T7: OpenCode plugin hooks-only

**What**: Enumerate importers of `apps/opencode-plugin/src/index.ts` exports by resolved path first; delete the 14 `tool({...})` registrations (221–580) and their now-unused imports/helpers; keep event handlers + client; replace tool-registration tests with hooks-only contract test (zero tools exported; named event handlers present).
**Where**: `apps/opencode-plugin/src/index.ts` + `apps/opencode-plugin/__tests__/` (tool tests removed/replaced)
**Depends on**: T3 (MCP registered before in-process tools vanish — no coverage gap at any commit)
**Reuses**: existing event-handler tests as the pattern
**Requirement**: PAU-12
**Task ID**: TASK-007

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Importer enumeration recorded (resolved-path sweep, population printed) before edit; no dangling references after
- [ ] Plugin exports zero tools; all design-named event handlers present
- [ ] Gate check passes: `cd apps/opencode-plugin && bun run build && bun run test`
- [ ] Test count: post-change suite total recorded beside pre-change (deliberate reduction: tool tests removed, hooks-only contract added)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(opencode-plugin)!: hooks-only — in-process tools removed, MCP is the tool surface (AD-017)`

---

### T8: ADR 0002 + STATE.md AD-017

**What**: Write `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md` (context: 14-vs-54 defect, Cursor double load, wipe incident; consequences incl. bridge-route hook-loss tradeoff and OpenCode event handlers staying); append AD-017 row to the canonical STATE.md `## Decisions` table (verify which of the two headings at 3120/3230 carries AD-016 first; flag the duplicate).
**Where**: `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md` + `.specs/project/STATE.md`
**Depends on**: T7 (records what shipped)
**Reuses**: `docs/adr/0001-*.md` format; AD-016 row shape
**Requirement**: PAU-13
**Task ID**: TASK-008

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] ADR states decision, context, consequences, rejected alternatives (hybrid subset, prefer-local)
- [ ] AD-017 row in the section carrying AD-001..016; duplicate heading noted in commit body
- [ ] Gate check passes: `bun skills/massa-ai/scripts/validate_state.ts --root . 2>/dev/null || true` (advisory) — build gate deferred to T10

**Tests**: none (coverage matrix: docs layer — build gate only)
**Gate**: build (at T10)

**Commit**: `docs(adr): AD-017 — plugins deliver, MCP serves tools, hooks observe`

---

### T9: Scripted doc sweep + regenerated bundles

**What**: Scripted repo-wide sweep (population printed before rows; literals: `52 tools`, `13 tools`, `14 in-process`, `registers tools in-process`, `registers 14 tools`, opencode-MCP-skip claims) across CLAUDE.md, README.md, FEATURES.md, docs/, skills/ sources (`SKILL.md` router, `references/mcp-tools.md`), plugin READMEs, installer comments; fix every live row (54 tools; hooks-only claims); `bun run generate:artifacts`; parity suites green.
**Where**: docs + skills sources per sweep output (enumerated by the sweep, not pre-listed)
**Depends on**: T7 (claims must describe shipped state), T8
**Reuses**: sweep-as-script discipline (lessons: population printed, literal filter, resolve claims per-row)
**Requirement**: PAU-14
**Task ID**: TASK-009

**Tools**:

- MCP: NONE (scripted bun/grep sweep)
- Skill: NONE

**Done when**:

- [ ] Sweep script output committed in commit body or test comment: total population, per-row verdict (fixed / historical-CHANGELOG-exempt / not-a-claim)
- [ ] Re-run sweep → zero live rows
- [ ] Gate check passes: `bun run generate:artifacts && bun test scripts/__tests__/skill-artifact-parity.test.ts scripts/__tests__/subagent-parity.test.ts`

**Tests**: scripted sweep + parity
**Gate**: quick

**Commit**: `docs: 54 MCP tools everywhere — stale in-process-tool and 52-count claims corrected`

---

### T10: CHANGELOG + full gates + spec-state delivery

**What**: Extend CHANGELOG `[Unreleased]` (items 1–4, breaking-surface notes); run Build gate; write `.specs/project/{STATE.md,FEATURES.json}` + `.specs/HANDOFF.md`; run `check_specs_delivered.ts`; stage the machine-repair commands (harness re-run for this machine's wiped `~/.cursor` + `~/.config/opencode`) as user-run text in the final report — never executed.
**Where**: `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, `.specs/HANDOFF.md`
**Depends on**: T9
**Reuses**: CHANGELOG authoring rules (CONTRIBUTING.md); HANDOFF rotation lesson (rename-to-Previous first)
**Requirement**: PAU-16, PAU-17
**Task ID**: TASK-010

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gate check passes: `bun run generate:artifacts && bun run lint && bun run test:plugins && bun run test:scripts`
- [ ] `bun skills/massa-ai/scripts/check_specs_delivered.ts plugin-architecture-unification --root .` exit 0
- [ ] Repair commands staged in final report, marked user-run
- [ ] Test count: full-suite totals recorded (test:scripts + test:plugins)

**Tests**: none new (delivery task — full gates run)
**Gate**: build

**Commit**: `docs(specs): plugin-architecture-unification delivered — state, handoff, changelog`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4 ──→ T5
Phase 3:  T6
Phase 4:  T7 ──→ T8 ──→ T9 ──→ T10
```

Execution is strictly sequential. `4 Phases = 10 Tasks`. Packing at Execute: ~7-task batches on phase boundaries → Batch 1 = Phases 1–3 (T1–T6), Batch 2 = Phase 4 (T7–T10).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: fold baseline | 1 pre-reviewed commit, no new edits | ✅ Granular |
| T2: install-agents opencode | 1 script + its guard suite | ✅ Granular |
| T3: opencode installer | 1 script + its suite | ✅ Granular |
| T4: sentinel helper | 1 function in 1 lib file | ✅ Granular |
| T5: harness gating | 1 script + its guard suite | ✅ Granular |
| T6: cursor bridge | 1 script + its suite (one branch-split concern) | ✅ Granular (cohesive) |
| T7: hooks-only | 1 source file + its tests | ✅ Granular |
| T8: ADR | 2 doc files, one decision | ✅ Granular |
| T9: doc sweep | sweep-enumerated docs, one concern | ✅ Granular (single concern) |
| T10: delivery | changelog + state files | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | phase start | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | T1 | Phase 1→Phase 2 | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T1, T4 | Phases 1,2→Phase 3 | ✅ Match |
| T7 | T3 | Phase 1→Phase 4 (backward) | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |
| T9 | T7, T8 | T8→T9 | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |

No dependency points to a later phase.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | folded installers + suites | integration (already in diff) | integration | ✅ OK |
| T2 | install-agents.sh | shell integration | shell integration | ✅ OK |
| T3 | opencode install.sh | integration | integration | ✅ OK |
| T4 | installer-shared.sh helper | shell integration (via harness) | merged-forward into T5 suite — helper unreachable until wired | ✅ OK (merge-forward rule) |
| T5 | install-harness.sh | shell integration | shell integration | ✅ OK |
| T6 | cursor install.sh | integration | integration | ✅ OK |
| T7 | opencode src/index.ts | unit | unit | ✅ OK |
| T8 | docs | none (build gate) | none | ✅ OK |
| T9 | docs + skills sources | sweep + parity | sweep + parity | ✅ OK |
| T10 | changelog + state | none (build gate) | none + build | ✅ OK |

## Requirement Coverage

PAU-01 (T3) · PAU-02 (T2) · PAU-03 (T3) · PAU-04 (T2) · PAU-05 (T4,T5) · PAU-06 (T4,T5) · PAU-07 (T5) · PAU-08..11 (T6) · PAU-12 (T7) · PAU-13 (T8) · PAU-14 (T9) · PAU-15 (T1) · PAU-16 (T10) · PAU-17 (T10). 17/17 mapped, 0 unmapped.
