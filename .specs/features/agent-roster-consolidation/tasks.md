# Agent Roster Consolidation Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

Worker rules (every task): work only in `~/Projects/massa-ai-wt-roster` on branch
`feat/agent-roster-consolidation`; check `git branch --show-current` before committing; never
run `skills/massa-ai/scripts/lessons.ts` (its `list` rewrites `.specs/lessons.json`); never
restore files with `git checkout`; one atomic commit per task.

---

**Design**: `.specs/features/agent-roster-consolidation/design.md`
**Status**: Draft

---

## Test Coverage Matrix

| Code layer | Test type | Location / runner | Sensor for this feature |
| --- | --- | --- | --- |
| Skills prose (charters, workflows, references, AGENTS.md) | content/contract | `scripts/__tests__/*.test.ts` via `bun run test:scripts` | skills-harness-integrity, validate-repository, workflow-harness-contract, agent-era-guidance-content, workflow-anchors, workflow-metadata-headers, bootstrap-source-contract |
| Generators | unit + parity | `scripts/__tests__/generate-*.test.ts`, `subagent-parity.test.ts`, `skill-artifact-parity.test.ts` | exact roster set per host, markers, unprefixed names, no persona-router bundle |
| Plugin installers (bash) | integration (sandbox HOME) | `apps/*-plugin/__tests__/*.test.ts` via `bun run test:plugins`; `scripts/tests/*.sh` via `test:scripts` | planted foreign `builder.md` survives; legacy `massa-ai-*` pruned; retired `persona-router` skill pruned |
| `packages/shared` bootstrap + profile-switch | unit | `bun test packages/shared/src/...` | 8 rule ids; retired id silent; marker-owned selection; foreign dest untouched |
| `packages/core` observation extractor | unit | `bun test packages/core/src/__tests__/observation-extractor.test.ts` | `/persona` no longer a role trigger |
| config CLIs | unit | `apps/mcp-client`, `apps/opencode-plugin` `config-cli-*.test.ts` | 8 rules; agents install/uninstall by marker |
| Web UI | unit + golden | `apps/web-ui/src/__tests__/` | `WORKFLOW_STEMS` = 36 stems |

## Gate Check Commands

| Gate | Command |
| --- | --- |
| quick | `bun test <the test files the task touched>` |
| scripts | `bun run test:scripts` (runs `generate:artifacts` first) |
| plugins | `bun run test:plugins` |
| shared | `cd packages/shared && bun test` |
| full (phase end) | `bun run build && bun run type-check && bun run lint && bun run test && bun run test:scripts && bun run test:plugins && bun run generate:artifacts --check && bun scripts/check-stale-pointers.ts` |

If a suite fails only at 5001 ms, re-run it with `XDG_CONFIG_HOME=$(mktemp -d)` before
touching budgets (CLAUDE.md "A 5001 ms failure is not automatically a load problem").

---

## Execution Plan

Phases run sequentially; tasks inside a phase run in order (they share test files). Order
revised after the pre-mortem (C3): ownership and the prefix drop land on the **current** 18
agents first, so every commit is green on its own; the roster swap is one atomic task
because the dispatch-target test couples charters, generator, and dispatch blocks.
`5 Phases = 13 Tasks`.

### Phase 1: Workflow inventory (1 Phase = 3 Tasks)

T1 → T2 → T3

### Phase 2: Marker ownership + unprefixed names on the current roster (1 Phase = 3 Tasks)

T4 → T5 → T6

### Phase 3: Seven-agent roster (1 Phase = 2 Tasks)

T7 → T8

### Phase 4: Persona removal (1 Phase = 3 Tasks)

T9 → T10 → T11

### Phase 5: Docs and close-out (1 Phase = 2 Tasks)

T12 → T13

---

## Task Breakdown

### T1: Remove `general` and the three `maestro` workflows

**What**: Delete `workflows/general.md`, `workflows/maestro/*.md`, `references/maestro.md`, `references/maestro/`, `docs/massa-ai-maestro.md`; rewrite router precedence rule 6 to the no-workflow fallback; drop maestro routing, report family (`audit-report-io.md`, `validate_audit_report.ts` FAMILIES), hook-enforcement rows, mobile-context bullets, KVC pointer; drop `general` from light-workflow lists.
**Where**: `skills/massa-ai/**`, `skills/AGENTS.md`, `docs/`, tests pinning counts/lists
**Depends on**: None
**Requirement**: WFL-02, WFL-04

**Done when**:

- [x] 36 workflow files remain (with T2's renames still pending, stems unchanged)
- [x] `EXPECTED_WORKFLOW_COUNT`, `IMPLEMENTATION_WORKFLOWS`, read-only complement, designer block count, reviewer-block counts, anchors entries updated to measured values
- [x] `validate-repository` "general fallback preflight" test replaced by a no-workflow-fallback assertion
- [x] Gate: scripts green

**Tests**: content/contract
**Gate**: scripts

---

### T2: Rename six workflows

**What**: `git mv` discovery→product-discovery, adr→create-adr, to-prd→create-prd, rfc→create-rfc, tdd→create-tdd, ticket→create-ticket; update frontmatter `name`, session-id prefixes, `workflow:` tags, router rows and precedence text, Plan Challenge policy sentence in `skills/AGENTS.md`, every `workflows/<old>.md` pointer and backticked stem mention (not document-type mentions); `git mv` the owned references (`references/{tdd,rfc,ticket}/` → `references/create-{tdd,rfc,ticket}/`, `references/adr-authoring.md` → `references/create-adr.md`) and docs guides (`docs/massa-ai-{rfc,tdd,ticket}.md` → `docs/massa-ai-create-{rfc,tdd,ticket}.md`) and repoint every pointer, including the router's Shared References list and tests pinning those paths (`validate-repository.test.ts` guide and reference lists).
**Where**: `skills/**`, `docs/**`, tests reading those paths
**Depends on**: T1
**Requirement**: WFL-03, WFL-04

**Done when**:

- [x] `git grep -n -F "workflows/adr.md"` (and each old stem path) returns 0 outside `.specs/`, `.ua/`, CHANGELOG
- [x] Same zero-hit check for `references/tdd/`, `references/rfc/`, `references/ticket/`, `adr-authoring.md`, `docs/massa-ai-rfc.md`, `docs/massa-ai-tdd.md`, `docs/massa-ai-ticket.md`
- [x] Plan Challenge sentence names `create-adr`, `create-rfc`, `create-tdd`; its parse test updated
- [x] Generated commands contain the 6 new stems and none of the old ones (assert in `workflow-command-entries.test.ts`)
- [x] Gate: scripts green

**Tests**: content/contract, generator
**Gate**: scripts

---

### T3: Web UI stems and workflow counts

**What**: Update `apps/web-ui/src/static/views/registry.ts` `WORKFLOW_STEMS` and its 3 test mirrors to the 36 stems; regenerate `render-golden.json`; fix prose counts "40 workflows" in README/FEATURES/plugin READMEs.
**Where**: `apps/web-ui/**`, `README.md`, `FEATURES.md`, `apps/*-plugin/README.md`
**Depends on**: T2
**Requirement**: WFL-03

**Done when**:

- [x] A test asserts `WORKFLOW_STEMS` equals the stems derived from `skills/massa-ai/workflows/**` (not a hand list)
- [x] web-ui tests green; Phase 1 full gate green

**Tests**: unit + golden
**Gate**: full

---

### T4: Generator emits ownership markers (names still prefixed)

**What**: Rename `OPENCODE_OWNED_MARKER` → `OWNED_MARKER_MD` and emit it as the first body line for Claude and Cursor too; `host-capabilities.ts` ownership → `body` for Claude/Cursor; parity tests assert the marker position per host.
**Where**: `scripts/generate-subagent-artifacts.ts`, `scripts/lib/host-capabilities.ts`, generator/parity tests
**Depends on**: T3
**Requirement**: NAM-01

**Done when**:

- [x] Every generated `.md` agent's first body line is the marker; Codex unchanged
- [x] Gate: scripts + plugins green (installers still glob the prefix, unaffected)

**Tests**: unit + parity
**Gate**: scripts, plugins

---

### T5: Installers, profile-switch, config-cli select by ownership

**What**: Design C3 per-host predicates across all 4 plugin installers (copy, prune, uninstall, `apply_recorded_profile_after_update`, plugin-route count, `remove_file_route_artifacts`), `installer-shared.sh`, `install-harness.sh`, root `install.sh`, `verify-harness-install.ts`; design C5 (`ownership.ts`, `hosts.ts` `activeExt`, `engine.ts`, `doctor.ts`); OpenCode `config-cli.ts` agents install/uninstall. Site list from `git grep -nE 'massa-ai-\*|startsWith\("massa-ai-'`. Rename every hand-planted `massa-ai-*` test fixture to an unprefixed name.
**Where**: installers, `scripts/lib/`, `packages/shared/src/profile-switch/`, `apps/opencode-plugin/src/config-cli.ts`, tests
**Depends on**: T4
**Requirement**: NAM-02, NAM-03

**Done when**:

- [ ] Per host: planted unmarked `builder.<ext>` is byte-identical after install and uninstall; install prints the skip warning. OpenCode: a user symlink `builder.md` → `~/dotfiles/opencode/agents/builder.md` (unmarked) keeps its target
- [ ] OpenCode cross-location: install from bundle copy A, then from copy B → all links point into B, no skip warning; profile switch then reinstall → links still follow the recorded profile; delete A, reinstall → dangling link relinked; uninstall removes it
- [ ] Claude/Cursor legacy: an unmarked `massa-ai-reviewer.md` shaped like `git show f582b602` output (not copied from a marked bundle) is pruned; unmarked `massa-ai-mine.md` survives
- [ ] Predicate parity: one fixture set (incl. marker mid-body, marker on line 1 of a no-frontmatter file) gives identical verdicts from the bash `is_owned_agent` and TS `isOwnedAgentFile`
- [ ] Codex `massa-ai-mine.toml` (unmarked) still survives (`test-installer-prune-codex.sh`)
- [ ] Legacy `massa-ai-<old>` files pruned; marked retired file pruned; re-install is a no-op
- [ ] Engine: foreign dest untouched; legacy-named or unmarked variant entries never copied (NAM AC-11)
- [ ] Observed red: with any one converted glob reverted, at least one updated suite fails (recorded in commit body)
- [ ] `installer-removal-derivation` sweep green; gate: shared + scripts + plugins green

**Tests**: integration + unit
**Gate**: shared, scripts, plugins

---

### T6: Drop the `massa-ai-` agent prefix

**What**: Generator names `name: <agent>` / `<agent>.<ext>` (design C2); every `massa-ai-<agent>` dispatch block and prose mention → `<agent>`; router `SKILL.md` one-line Claude plugin-route rule (`massa-ai:<name>`, NAM AC-10) plus `agent-orchestration.md` Name Resolution detail and glob table; hook sentinel → `reviewer.md` (moves to `code-reviewer.md` in T8); flip `skills-harness-integrity` prefix assertions; built-in collision test.
**Where**: generator, `skills/**`, `apps/claude-plugin/hooks/massa-ai-hook.ts`, tests
**Depends on**: T5
**Requirement**: NAM-01, NAM-03

**Done when**:

- [ ] No generated file under `apps/*-plugin/{agents,agent-profiles}/` starts with `massa-ai-`
- [ ] Every Dispatch target is unprefixed and exists in all 4 bundles
- [ ] Phase 2 full gate green

**Tests**: unit + parity + content
**Gate**: full

---

### T7: Freeze the output-contract fixture

**What**: Commit `.specs/features/agent-roster-consolidation/fixtures/retired-charter-outputs.json` — the role-specific output fields of the 14 retired charters read from `git show f582b602:skills/agents/<n>/SKILL.md` (judge YAML reply keys, plan-critic `escalate_to_full`, furps `FR-<letter>-<N>` + status set, verification verdict/gap list, audit-report-io finding columns, navigator/investigator answer shapes; generic wrapper fields like `Status`/`Exact next step` excluded) each tagged with its absorbing `(agent, mode)`; add a test asserting each field appears in its source charter now and, once the absorbing charter exists, **inside that charter's section for that mode**.
**Where**: fixture + `scripts/__tests__/charter-contract-preservation.test.ts`
**Depends on**: T6
**Requirement**: ROS-01 (AC-9)

**Done when**:

- [ ] Test green on the current 18 charters; observed red when one field is deleted from its source charter (then restored by file copy, not git)

**Tests**: content
**Gate**: quick

---

### T8: Roster swap

**What**: Author `code-explorer`, `code-reviewer`, `judge`, `product-manager`; update `builder`, `designer` (reads and writes UI from Figma/screenshots/other direction), `test-engineer` (`plan`/`audit`/`fix`) per design C1; delete the 14 retired charter dirs; generator `SPECIALIST_NAMES` 7 / `WRITE_AGENTS` 4, delete `AGENT_TOOLS_OVERRIDE` and `OPENCODE_BASH_OVERRIDE`; rewrite every dispatch per spec "Workflow dispatch mapping" (unconditional designer in `design`/`mobile-figma-*` with builder only for non-UI MFM wiring; test-engineer in tests-*; product-manager in furps-refinement/requirements-audit and implementation-audit REQ lens; test-engineer for its TST lens; code-reviewer in the 5 audits and for review/verify; judge for Plan Challenge + judge-with-debate); `agent-orchestration.md` roster and legacy table, `subagent-design.md`, router Plan Challenge section, `skills/AGENTS.md` Agent table + single old→new mapping table; purge old names; hook sentinel → `code-reviewer.md`; every test pinning 18/old names; frozen model-baseline comparisons mapped old→new without editing the historical fixture.
**Where**: `skills/**`, generator, hook, tests
**Depends on**: T7
**Requirement**: ROS-01, ROS-02, ROS-03, WFL-01

**Done when**:

- [ ] `ls skills/agents` = exactly the 7 names; bundles hold 7 per host and per profile
- [ ] T7 contract test green against the absorbing charters
- [ ] New content test: per-family expected agent set (Dispatch AC-1..8), each asserting its agents and the absence of retired ones
- [ ] Old-name sweep with PCRE `(?<![-\w])(planner|context-curator|...|reviewer)(?![-\w])` restricted to agent-name contexts returns only the mapping table (outside `.specs/`, `.ua/`, CHANGELOG)
- [ ] Phase 3 full gate green

**Tests**: content + parity + unit
**Gate**: full

---

### T9: Delete the persona feature from skills and bootstrap

**What**: Delete `skills/persona-router/`, `skills/massa-ai/personas/`; remove the `persona-router` span and persona sentences from `skills/AGENTS.md`; root `AGENTS.md` `## Persona Pin`; `persona` packet field and "Every role, every dispatch" default in `agent-orchestration.md`/`subagent-design.md`; `rules.ts` 9→8 + `RETIRED_RULE_IDS`; `state.ts` silent skip; `skills/bootstrap/SKILL.md`; move the `handoffInjectionPoint` evidence citation off `personas/README.md`; rewrite/delete persona tests and 9→8 counts.
**Where**: `skills/**`, `AGENTS.md`, `packages/shared/src/bootstrap/**`, `scripts/lib/host-capabilities.ts`, tests
**Depends on**: T8
**Requirement**: PER-01, PER-02

**Done when**:

- [ ] Test: persisted `{"persona-router": false}` renders 8 rules and emits no "Ignored persisted rule state" line
- [ ] `git grep -i -l -wE 'persona(s|-router|_pin)?'` outside `.specs/`, `.ua/`, CHANGELOG returns only files on this task's explicit allowlist (the files T10–T12 still own, plus `references/the-fool/`), and after T12 only `docs/removed-features.md` + `references/the-fool/`
- [ ] Gate: shared + scripts green

**Tests**: unit + content
**Gate**: shared, scripts

---

### T10: Generators and installers drop `persona-router`; retired-skill prune

**What**: `generate-skill-artifacts.ts` bundle list + managed roots + retired-root sweep; `workflow-commands.ts` `RESERVED_BUNDLE_ROOTS`; skill walkers `check-skill-doc-paths.ts:50`, `skill-protected-literals.ts:51`, `verify-model-tokens.ts:197`; `.gitignore:80`; 4 plugin installers' skill loops, state records, cursor case list; design C4 prune from previous state on install **and** uninstall; `verify-harness-install.ts` harness list (add `bootstrap`); tests and shell suites.
**Where**: `scripts/**`, `apps/*-plugin/install.sh`, `apps/*-plugin/__tests__/**`, `scripts/tests/*.sh`
**Depends on**: T9
**Requirement**: PER-03

**Done when**:

- [ ] Per host: prior state `skills` incl. `persona-router` + planted dir → removed by install and by uninstall; unrecorded `persona-router` dir → untouched
- [ ] `generate:artifacts` removes a planted `apps/cursor-plugin/skills/persona-router/`
- [ ] Gate: plugins + scripts green

**Tests**: integration
**Gate**: plugins, scripts

---

### T11: Observation extractor `/persona` trigger

**What**: Delete the `/persona` prefix branch and its test row.
**Where**: `packages/core/src/services/hooks/observation-extractor.ts`, its test
**Depends on**: T10
**Requirement**: PER-04

**Done when**:

- [ ] Test asserts `/persona x` is not classified `role`; `act as` still is
- [ ] Phase 4 full gate green

**Tests**: unit
**Gate**: full

---

### T12: Docs and counts

**What**: README, FEATURES (Agent/Tier table = charters), CLAUDE.md (incl. navigator allowlist paragraph), root AGENTS.md, CHEATSHEET, ONBOARDING, adding-a-host, plugin READMEs, manifests (`.claude-plugin`/`.cursor-plugin` marketplace descriptions), installer summary strings; `ROSTER` count scan in `workflow-harness-contract.test.ts` → 7.
**Where**: docs + manifests + installers' echo strings
**Depends on**: T11
**Requirement**: ROS-03, DOC-01

**Done when**:

- [ ] `ROSTER = 7` scan green; no "18" specialist count, "nine" rule count, or "40 workflows" left
- [ ] Gate: scripts green

**Tests**: content
**Gate**: scripts

---

### T13: CHANGELOG, removed-features, spec state

**What**: `[Unreleased]` `### Removed` + `### Changed` (with the A16 upgrade note: re-run `install-harness.sh` or `install-skills.sh --apply` to re-render `MASSA-AI.md`); `docs/removed-features.md` section; `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/project/FEATURES.json`.
**Where**: `CHANGELOG.md`, `docs/removed-features.md`, `.specs/**`
**Depends on**: T12
**Requirement**: DOC-01

**Done when**:

- [ ] Final full gate green; `check_specs_delivered.ts agent-roster-consolidation` exits 0

**Tests**: none
**Gate**: full
