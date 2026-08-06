# Plugin Architecture Unification Specification

Slug: `plugin-architecture-unification` · workflowSessionId: `spec-plugin-architecture-unification` · sized **Large** (public compatibility surfaces, 4 coupled work items, cross-host, ADR).

## Problem Statement

The four host plugins diverge architecturally: OpenCode ships 14 in-process tools and its installer *removes* the host's MCP entry as "redundant" — a false premise that costs OpenCode users 40 of the 54 MCP tools (all Synapse, graph/trace, checkpoints, handoffs, execute, project admin). The harness plugin phase trusts `install-state.json` version records without checking disk, so an external wipe of installed artifacts (observed live 2026-08-05: `~/.cursor/agents` + `plugins/local/massa-ai` deleted minutes after install, marker `~/.cursor/projects/.agent-data-cleanup-2026-08-05`) leaves the harness reporting "skip-current" forever with zero artifacts. Cursor 3.14 loads massa-ai **twice** — once from `~/.cursor/plugins/local/massa-ai/` and once via its Claude-marketplace bridge from `~/.claude` (verified in "Cursor Plugins" exthost logs) — risking double hook firing. Docs claim 52 MCP tools; the measured count is 54 (`apps/mcp-client/src/tool-defs/tool-defs-*.ts`: hooks-exec 14, memory 11, project 12, search 7, synapse 10).

Decided architecture (user, 2026-08-05; recorded as **AD-017** in this feature): **"Plugins deliver, MCP serves tools, hooks observe."** A plugin is a delivery vehicle (agents, skills, hooks, host wiring); the MCP server registered by `scripts/install-agents.sh` (single writer) is the one canonical tool surface; hooks are host-native and always on; in-process tools are never a coverage mechanism.

Prior uncommitted work on branch `fix/harness-cursor-agents-opencode-plugin` (Cursor agents → flat `~/.cursor/agents/` real copies; OpenCode plugin symlink → real copy; `install-skills.sh` Cursor global-rules warning; test/doc/CHANGELOG updates) is reviewed and **folds into this delivery as its baseline** — not redone, not discarded.

## Goals

- [ ] OpenCode users get all 54 MCP tools (currently 14).
- [ ] Harness plugin phase self-heals externally wiped installs instead of skipping forever.
- [ ] massa-ai loads exactly once per Cursor session; hooks fire exactly once.
- [ ] All four host plugins share one architecture, recorded as ADR AD-017.
- [ ] Docs match measured reality (54 tools; no stale in-process-tool claims).

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Hybrid in-process hot-path tool subset on OpenCode | User decision 2026-08-05: hooks-only. Hybrid depended on unverified OpenCode per-server tool-disable config. |
| New Cursor global-rules bootstrap code | Cursor has no global rules file; existing installer warning + docs (Settings → Rules / per-project AGENTS.md) are the supported paths (user constraint). |
| Automatic machine repair of this machine's wiped `~/.cursor` / `~/.config/opencode` | Live host-config writes stay staged as user-run commands (standing constraint; permission classifier blocks live `~/.claude`-class writes). |
| Renaming/namespacing the former 14 bare OpenCode tool names on the MCP side | Overlap window exists only inside this single PR and closes at item 4; MCP names are the canonical contract. |
| Investigating what performed the 2026-08-05 wipe | Unattributable from this repo; item 2 makes the harness resilient to any wiper. |
| Split PRs per work item | User decision 2026-08-05: single PR. |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| OpenCode plugin uninstall no longer touches the MCP entry | `apps/opencode-plugin/install.sh --uninstall` removes only plugin file + config entry; MCP lifecycle belongs to `scripts/install-agents.sh` (harness uninstall already runs its agents phase) | Under AD-017 the tool surface is independent of any plugin; a plugin uninstall that deletes the tool surface repeats the exact defect item 1 fixes | y (user, 2026-08-05, spec confirmation) |
| Per-host sentinel artifact definition | Deferred to Design (one existence probe per host over files the host actually reads, e.g. Cursor `~/.cursor/agents/massa-ai-*.md`) | Sentinel choice is a design decision over verified host discovery surfaces, not a requirement | y (design owns it) |
| Claude-bridge detection probe for Cursor | Deferred to Design (probe `~/.claude` marketplace registry: `plugins/installed_plugins.json` / `settings.json` `enabledPlugins`) | Same — mechanism, not requirement | y (design owns it) |
| Dropping the in-process `profile` tool loses no capability | MCP `profile_list`/`profile_set` + both `massa-ai-config` CLIs remain; OpenCode gains the MCP pair via item 1 | Tool-defs count both in the 54; model-profile-switching spec names them | y (verified: tool-defs-project.ts includes profile_list/profile_set) |
| The 14-tool overlap between plugin and MCP never ships | Single PR: item 1 and item 4 land in the same release | User chose single PR | y (user, 2026-08-05) |
| Cursor bridged Claude plugin delivers hooks | Brief (verified live 2026-08-05): bridge loads the full plugin, so local + bridge = double hook wiring risk | Verified host fact from exthost logs; hooks-fire-once AC pins it | y (user-verified session evidence) |

**Open questions:** none — all resolved or logged above.

## User Stories

### P1: OpenCode full tool surface ⭐ MVP

**User Story**: As an OpenCode user, I want the massa-ai MCP server registered alongside the plugin so that I get all 54 tools, not 14.

**Why P1**: 40 tools silently missing today — the defect that motivated the feature.

**Acceptance Criteria**:

1. WHEN `apps/opencode-plugin/install.sh` completes a user-scope install THEN the installer SHALL have delegated MCP registration for opencode to `scripts/install-agents.sh` (single writer) and the resolved opencode config SHALL contain exactly one massa-ai MCP entry. <!-- PAU-01 -->
2. The `scripts/install-agents.sh` opencode path SHALL write the MCP entry regardless of whether `opencode.json` lists the plugin in any accepted form (npm name, local path, bare dir). <!-- PAU-02 -->
3. WHEN `apps/opencode-plugin/install.sh --uninstall` runs THEN it SHALL remove only the owned plugin file and config entry and SHALL NOT remove the massa-ai MCP entry. <!-- PAU-03 -->
4. The suite `scripts/tests/test-mcp-single-writer.sh` SHALL assert that the opencode installer delegates to `install-agents.sh --agent opencode` for registration and SHALL fail if any plugin-local MCP file or a second registration path returns. <!-- PAU-04 -->
5. IF `scripts/install-agents.sh` is missing or fails during plugin install THEN the installer SHALL report the exact recovery command and SHALL NOT report overall success. <!-- PAU-01 failure mode -->

**Independent Test**: sandbox `$HOME`, run opencode plugin install, assert one MCP entry + plugin entry both present; run `--uninstall`, assert MCP entry survives.

### P1: Presence-validated harness skip

**User Story**: As a harness user whose installed artifacts were wiped externally, I want `install-harness.sh` to reinstall instead of reporting "skip-current" forever.

**Acceptance Criteria**:

1. WHEN the recorded plugin version equals the bundle version AND the host's sentinel artifact exists on disk THEN the harness plugin phase SHALL skip that host with one `skip-current` log line. <!-- PAU-05 -->
2. IF the recorded plugin version equals the bundle version AND the host's sentinel artifact is absent THEN the harness SHALL reinstall that host and SHALL log one line naming the missing sentinel. <!-- PAU-05/06 -->
3. The sentinel probe SHALL be read-only and per-host, and on `--dry-run` the harness SHALL report the would-be reinstall without writing. <!-- PAU-06 -->
4. The suite `scripts/tests/test-plugin-auto-install.sh` SHALL gain a discriminating scenario: version-current record + wiped artifacts → reinstall (and the existing PAI-01..10 semantics SHALL be amended deliberately, not incidentally). <!-- PAU-07 -->

**Independent Test**: sandbox install → delete installed artifacts, keep `install-state.json` → re-run harness → artifacts back on disk.

### P1: Cursor single load, hooks once

**User Story**: As a Cursor user with the Claude massa-ai plugin installed, I want massa-ai loaded exactly once so hooks do not double-fire.

**Acceptance Criteria**:

1. WHEN the Cursor installer detects the massa-ai Claude marketplace plugin under `~/.claude` THEN it SHALL skip installing `~/.cursor/plugins/local/massa-ai/` and its hook wiring, and SHALL remove a pre-existing local copy + its hook wiring. <!-- PAU-08 -->
2. IF no Claude-bridge copy is detected THEN the installer SHALL install the local plugin copy and hook wiring (current behavior preserved as fallback). <!-- PAU-09 -->
3. The install SHALL write flat subagents to `~/.cursor/agents/massa-ai-*.md` and harness skills in both branches — bridge-preferred and local-fallback — because Cursor discovers subagents only from the flat directory. <!-- PAU-08/09 -->
4. WHEN install completes in either branch THEN exactly one hook wiring for massa-ai SHALL be active (bridge path: zero local massa-ai hook entries; fallback path: exactly one set). <!-- PAU-10 -->
5. WHEN `--uninstall` runs THEN it SHALL remove the local plugin copy, owned flat agents, and owned hook wiring regardless of which branch installed them. <!-- PAU-11 -->

**Independent Test**: sandbox with fake `~/.claude` marketplace registry → install → no `plugins/local/massa-ai`, no local hook entries, agents present; sandbox without → full local install.

### P1: Hooks-only OpenCode plugin + AD-017

**User Story**: As a maintainer, I want all four plugins on one architecture — delivery + hooks, zero in-process tools — recorded as an ADR.

**Acceptance Criteria**:

1. The OpenCode plugin SHALL register zero in-process tools (the 14 `tool({...})` registrations at `apps/opencode-plugin/src/index.ts:221-580` removed) and SHALL preserve its event handlers (session lifecycle, compaction, prompt/tool-use capture, diagnostics). <!-- PAU-12 -->
2. The repository SHALL contain ADR AD-017 stating "plugins deliver, MCP serves tools, hooks observe", its context (the OpenCode 14-vs-54 defect, Cursor double load), and its consequences (in-process tools are never a coverage mechanism). <!-- PAU-13 -->
3. The docs SHALL state 54 MCP tools wherever a total is claimed, and SHALL carry no remaining claim that the OpenCode plugin registers in-process tools or that its MCP write is skipped (CLAUDE.md, README.md, FEATURES.md, skills references, plugin READMEs). <!-- PAU-14 -->
4. WHEN `bun run test:plugins` and the opencode package suite run THEN they SHALL pass with the tool registrations gone (suites amended to the hooks-only contract). <!-- PAU-12 -->

**Independent Test**: build plugin, load in sandboxed OpenCode config shape, assert plugin exports no `tool` map entries; grep docs for stale counts returns zero.

### P2: Fold prior uncommitted work

**User Story**: As the user who already debugged the installers, I want that work delivered, not redone or discarded.

**Acceptance Criteria**:

1. The delivery branch SHALL contain the prior fixes as reviewed: Cursor agents to flat `~/.cursor/agents/` (prefix-owned, prune-then-copy, pre-fix in-plugin copy removed on upgrade), OpenCode plugin installed as a real copy (pre-fix symlink replaced), `install-skills.sh` Cursor warning, and their test/doc/CHANGELOG updates. <!-- PAU-15 -->
2. WHEN the amended installer suites run THEN they SHALL pass against the folded baseline before items 1–4 build on it. <!-- PAU-15 -->

### P2: Delivery hygiene

**Acceptance Criteria**:

1. The PR SHALL modify `CHANGELOG.md` under `[Unreleased]` (merge gate). <!-- PAU-16 -->
2. The delivery SHALL stage this machine's repair (harness re-run touching live `~/.cursor` / `~/.config/opencode`) as printed user-run commands and SHALL NOT execute them. <!-- PAU-17 -->

## Edge Cases

- IF `opencode.json` is `.jsonc` with comments/trailing commas THEN the MCP write path SHALL preserve the existing parse-tolerant behavior (`install-agents.sh` owns the write).
- IF the harness runs `--uninstall` THEN sentinel gating SHALL NOT apply (uninstall stays deliberately ungated, no-op safe on absent hosts).
- IF `install-state.json` records a version for a host whose config dir no longer exists THEN host detection (`skip-absent`) SHALL win before any sentinel probe runs.
- IF `~/.claude` exists but the massa-ai marketplace plugin is absent or disabled THEN the Cursor installer SHALL take the local-fallback branch.
- IF a pre-fix Cursor install left both the local plugin and the bridge active THEN one converging install run SHALL end with exactly one load path.
- IF the OpenCode plugin file is present but the MCP entry is missing (post-item-1 partial state) THEN a harness re-run SHALL converge: `install-agents.sh` writes the entry; sentinel logic does not mask it.
- WHEN `MASSA_AI_PLUGIN_SOURCE_ROOT` copy mode is active THEN sentinel probes SHALL still target the installed host paths, never the marketplace copy.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PAU-01 | P1 OpenCode tools | Execute | Verified |
| PAU-02 | P1 OpenCode tools | Execute | Verified |
| PAU-03 | P1 OpenCode tools | Execute | Verified |
| PAU-04 | P1 OpenCode tools | Execute | Verified |
| PAU-05 | P1 Harness skip | Execute | Verified |
| PAU-06 | P1 Harness skip | Execute | Verified |
| PAU-07 | P1 Harness skip | Execute | Verified |
| PAU-08 | P1 Cursor dedupe | Execute | Verified |
| PAU-09 | P1 Cursor dedupe | Execute | Verified |
| PAU-10 | P1 Cursor dedupe | Execute | Verified |
| PAU-11 | P1 Cursor dedupe | Execute | Verified |
| PAU-12 | P1 Hooks-only + ADR | Execute | Verified |
| PAU-13 | P1 Hooks-only + ADR | Execute | Verified |
| PAU-14 | P1 Hooks-only + ADR | Execute | Verified |
| PAU-15 | P2 Fold prior work | Execute | Verified |
| PAU-16 | P2 Delivery hygiene | Execute | Verified |
| PAU-17 | P2 Delivery hygiene | Execute | Verified |

**Coverage:** 17 total, 17 mapped to tasks, 0 unmapped. All Verified (validation.md PASS, iteration 2, 2026-08-05).

## Implicit-Requirement Sweep (Large — every dimension resolved)

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | Installers already validate scope flags/paths; sentinel probe validates only existence (PAU-06). N/A beyond that: no new user input surface. |
| Failure / partial-failure states | PAU-01 AC5 (install-agents failure reporting); edge cases cover partial states (plugin-without-MCP, wiped-artifacts, both-shapes-installed). |
| Idempotency / retry / duplicate handling | PAU-04 (exactly-one registration), PAU-10 (hooks once), converging-reinstall edge cases; re-running any installer stays idempotent (existing tested contract, amended suites keep it). |
| Auth boundaries & rate limits | N/A because installers touch local config only; MCP/API auth unchanged (AD-011 untouched). |
| Concurrency / ordering | Harness order skills → MCP → plugins preserved; item 1 removes the one ordering hack (post-register MCP self-uninstall). No parallel installer runs supported (unchanged). |
| Data lifecycle / expiry | `install-state.json` v2 round-trip preserved; sentinel adds read-only probe, no new fields required unless Design chooses one (then round-trip rule applies). |
| Observability | PAU-05/06: one log line per skip/reinstall decision naming the sentinel; existing absent/skip one-line contract preserved. |
| External-dependency failure | Host CLIs absent → existing capability probes; `bun`/`node` absent → existing `exit 3` contract; PAU-01 AC5 covers install-agents.sh failure. |
| State-transition integrity | install/upgrade/skip-current/skip-newer/skip-absent/uninstall transitions extended with sentinel-gated reinstall (PAU-05); PAI suite amended deliberately (PAU-07). |
| Data migration / compatibility | Public compatibility surfaces (installers, hooks, generated config): every change treated as breaking until proven; CONTRIBUTING.md 7-step managed-harness protocol applies in Execute; pre-fix shapes (symlink, in-plugin agents, local+bridge double) all have migration paths. |
| Privacy / security / auditability | N/A beyond existing: no secrets touched, no new network surface; MCP single-writer invariant holds at every step (PAU-02/04). |
| Empty/offline/unavailable states | Wiped-artifact state is the core PAU-05 case; absent host, absent installer, absent runtime all covered by existing + amended suites. |
| Performance / accessibility / localization | N/A because shell installers + docs; no perf-sensitive path changes. |
| Platform-specific behavior | Sentinel paths per host from verified discovery surfaces (Design); macOS/Linux path handling unchanged. |
| Testing & validation expectations | Every PAU maps to a deterministic gate: amended shell suites (single-writer, plugin-auto-install, per-plugin installer suites), `bun run test:plugins`, `bun run test:scripts`, doc greps; verification-agent runs the discrimination sensor per validate.md. |

## Verification Approach

- Gates: `bun run test:plugins`, `bun run test:scripts` (includes shell suites), amended `scripts/tests/test-mcp-single-writer.sh` + `test-plugin-auto-install.sh` + per-plugin `__tests__/install.test.ts`, `bun run lint`, generators `--check` clean if any `skills/` source moves (none expected).
- New sensors observed red before green (lesson: a new sensor needs an observed red): the wiped-artifact reinstall scenario must fail against pre-change `install-harness.sh`; the opencode MCP-presence assertion must fail against the pre-change installer.
- Doc sweep is scripted (repo-wide literal scan for `52 tools`, `14 in-process`, `13 tools`, "registers tools in-process"), not eyeballed; population printed before rows.
- Author ≠ verifier: verification-agent writes `validation.md` with per-AC evidence + discrimination sensor.
- CONTRIBUTING.md 7-step managed-harness protocol read and applied before first mutation (installers/hooks/plugins are managed surfaces).

## Discuss Context Summary

Two user decisions taken this session (AskUserQuestion, 2026-08-05): item 4 = hooks-only (hybrid rejected — depended on unverified OpenCode per-server tool-disable config); delivery = single PR (two-PR and per-item options rejected — coupling: item 4 depends on item 1, ADR spans all, overlap window closes in-PR). Architecture itself (AD-017) was decided by the user in the brief and is not re-litigated. PAU-03 uninstall semantics recorded as an assumption for confirmation at spec approval.

## Success Criteria

- [ ] Fresh OpenCode install: 54 tools reachable via MCP; plugin loads with hooks only.
- [ ] Wiped-artifact machine: one harness run restores all artifacts; second run reports skip-current.
- [ ] Cursor with Claude plugin: exthost logs show one massa-ai load; hook events captured once.
- [ ] `git grep` for stale counts returns zero rows outside CHANGELOG history.
- [ ] CI green including CHANGELOG gate; validation.md PASS.
