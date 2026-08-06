# Plugin Architecture Unification Design

**Spec**: `.specs/features/plugin-architecture-unification/spec.md`
**Status**: Draft

## Design Summary

One architecture across all four host plugins — **AD-017: plugins deliver, MCP serves tools, hooks observe**. Four coordinated changes: (1) OpenCode's installer stops removing the MCP entry and delegates registration to `scripts/install-agents.sh` exactly like Codex does, and `install-agents.sh` drops its plugin-presence skip rule; (2) the harness plugin phase gates `skip-current` on a per-host presence probe (sentinel) keyed on the recorded `installRoute`, so an external wipe triggers reinstall instead of permanent skip; (3) the Cursor installer prefers the Claude-bridge load path when the Claude marketplace registry lists massa-ai — skipping the local plugin copy and its hook wiring so hooks fire once — with the local install preserved as fallback and `installRoute: "bridge"|"local"` recorded; (4) the OpenCode plugin drops its 14 in-process tools and keeps only event handlers, closing the gap the MCP registration opened. Prior uncommitted installer fixes (Cursor flat agents, OpenCode real copy, install-skills warning) are the committed baseline everything builds on.

## Requirements Traceability

| Req | Design element |
| --- | --- |
| PAU-01 | Component 2 (opencode install.sh delegation, mirrors codex `install.sh:699-715`) |
| PAU-02 | Component 1 (remove `opencode_plugin_present` + skip at `install-agents.sh:573-597,641-642`) |
| PAU-03 | Component 2 (uninstall stops calling `install-agents.sh --uninstall` at `install.sh:467-476`) |
| PAU-04 | Component 7 (single-writer suite: opencode joins Scenarios 2-4 pattern + new registration scenario) |
| PAU-05/06 | Component 3 (sentinel probe in `installer-shared.sh`, plan-phase gating in `install-harness.sh:240-253`) |
| PAU-07 | Component 7 (PAI-11 wiped-artifact scenario; PAI-05 no-op amended: skip requires sentinel) |
| PAU-08/09/10 | Component 4 (bridge probe + branch split in `apps/cursor-plugin/install.sh`) |
| PAU-11 | Component 4 (uninstall covers both shapes; already removes owned hooks + local dir + flat agents) |
| PAU-12 | Component 5 (hooks-only `apps/opencode-plugin/src/index.ts`) |
| PAU-13 | Component 6 (`docs/adr/0002-*.md` + STATE.md `## Decisions` AD-017) |
| PAU-14 | Component 6 (scripted doc sweep; skills/ source edits regenerate bundles) |
| PAU-15 | Baseline (fold uncommitted diff as first commits; suites in that diff already amended) |
| PAU-16 | CHANGELOG entry extends the folded one |
| PAU-17 | Delivery: staged user-run repair commands in final report, never executed |

## Current Codebase Evidence (inspected this session)

- `apps/mcp-client/src/tool-defs/tool-defs-*.ts` — measured 54 tool defs (14+11+12+7+10).
- `apps/opencode-plugin/src/index.ts` (812 lines) — 14 `tool({...})` at 221–580; event handlers 582–810 (`session.created`, `experimental.session.compacting`, generic `event` dispatcher → user-prompt/post-tool-use/session-end/diagnostics).
- `apps/opencode-plugin/install.sh` — MCP removal at 605–620 (install) and 467–476 (uninstall); real-copy install (folded baseline).
- `scripts/install-agents.sh` — `opencode_plugin_present()` at 573–597, skip at 641–642; opencode entry style `opencode-local` (array command, `environment`, `_massaAiOwned`); resolves `.jsonc`/`.json` via `lib/opencode-config.cjs`.
- `apps/codex-plugin/install.sh:699-715` — the delegation pattern to mirror (register via single writer, warn + recovery command on failure).
- `scripts/install-harness.sh:169-330` — plugin phase: detect → version-compare → plan (`install|upgrade|skip-current|skip-newer|skip-absent|uninstall`) → dry-run report or execute; uninstall deliberately ungated.
- `scripts/lib/installer-shared.sh:217-…` — `installer_host_detected`; the natural home for the sentinel helper.
- `apps/claude-plugin/install.sh:420-470` — records `platforms[host].plugin = {version, installedAt}` **and `installRoute: "marketplace"|"file"`** in `install-state.json` (v2); marketplace route serves agents in place, file route copies to `$TARGET/agents/`; `PLUGIN_REGISTRY="$HOME/.claude/plugins/installed_plugins.json"`.
- `apps/codex-plugin/install.sh:651` — specialist TOMLs written to `~/.codex/agents/` on every route.
- Folded baseline — Cursor flat agents at `~/.cursor/agents/massa-ai-*.md` (both future branches write them); OpenCode plugin real copy at `~/.config/opencode/plugins/massa-ai/index.js`.
- `scripts/tests/test-mcp-single-writer.sh` — Scenarios 1–10, claude/codex/cursor only; opencode absent.
- STATE.md `## Decisions` — AD-001..AD-016; **two `## Decisions` headings exist (lines 3120, 3230)** — canonical one verified before append (risk R5).

## Approach Exploration (Large — recommendation first)

**Sentinel mechanism (PAU-05/06):**

- **A1 (recommended): per-host presence probe keyed on recorded `installRoute`.** New `installer_plugin_sentinel_present <host> <target_home> <state_file>` in `installer-shared.sh`; one read-only existence check per host against a surface the host actually reads (table below). Reuses the `installRoute` field Claude already writes. Cheap, no schema change, probes only verified discovery surfaces.
- **A2 (rejected): installed-file inventory in `install-state.json`.** Installer records every written path; harness verifies all exist. Strictly stronger, but a schema extension every installer must write, a big diff on all four installers, and partial-inventory staleness becomes a new failure class. Overkill for the observed failure (wholesale wipe).
- **A3 (rejected): per-plugin `install.sh --check` mode.** Delegates presence to each installer. Cleanest ownership, but adds a public CLI surface to four installers (compat-breaking review each) and forks four subprocesses on every harness run to answer a yes/no the harness can read directly.

**Sentinel table (A1):**

| Host | Route(s) | Sentinel probe |
| --- | --- | --- |
| claude | `marketplace` | `~/.claude/plugins/installed_plugins.json` exists and lists massa-ai |
| claude | `file` (or no recorded route) | glob `~/.claude/agents/massa-ai-*.md` non-empty |
| codex | single | glob `~/.codex/agents/massa-ai-*.toml` non-empty (exact glob confirmed against installer in Tasks) |
| cursor | `bridge` \| `local` (or none) | glob `~/.cursor/agents/massa-ai-*.md` non-empty — written by both branches |
| opencode | single | `~/.config/opencode/plugins/massa-ai/index.js` is a regular file |

Unknown/unparsable route or state → sentinel reported absent → one reinstall converges and records the route. Probe failure mode is always "reinstall", never "skip" — self-healing bias.

**Cursor dedupe (PAU-08/09/10):** single approach — probe `~/.claude/plugins/installed_plugins.json` for the massa-ai plugin id (the registry the Claude CLI writes and the Cursor bridge reads; observed bridged load `massa-ai@massa-ai`). Bridge detected → skip `PLUGIN_DIR` copy + `merge_hooks_json`, remove any existing local copy + owned hook entries (converge), record `installRoute: "bridge"`. Not detected (file-route Claude install, no Claude at all, or registry unparsable) → current local install, `installRoute: "local"`. Flat agents, harness skills, and the summary output write in **both** branches. Rejected alternative: preferring the local copy and asking users to disable the bridge — rejected because the bridge is host behavior we cannot suppress from an installer, while the local copy is fully ours to withhold.

**OpenCode hooks-only (PAU-12):** single approach — delete the `tool` map entries (221–580) and their now-unused imports/helpers; keep `PluginInput` wiring, HTTP client, and every event handler. The in-process `profile` tool's capability is preserved by MCP `profile_list`/`profile_set` (in the 54) plus both CLIs; the OpenCode `skills/profile` flow follows MCP after item 1.

## Components

### Component 1 — `scripts/install-agents.sh`: opencode always written

- Remove `opencode_plugin_present()` (573–597), its call site (641–642), and the header claim (42–43).
- Everything else (entry style, `.jsonc` resolution, ownership marker, uninstall path) unchanged. Harness `--uninstall` still removes the opencode entry via this script (`ALL_AGENTS` includes opencode).

### Component 2 — `apps/opencode-plugin/install.sh`: register, don't remove

- Install path: replace the removal block (605–620) with delegation mirroring `apps/codex-plugin/install.sh:699-715`: `bash scripts/install-agents.sh --agent opencode --yes` (target/scope flags preserved), warn + exact recovery command on failure, no success claim when it fails (PAU-01 AC5).
- Ordering note: the harness runs MCP before plugins, so this call is usually a semantic no-op re-write; standalone plugin installs get registration for the first time. Idempotent by the single writer's own merge.
- Uninstall path (467–476): drop the `install-agents.sh --uninstall` delegation; remove only plugin file + owned config entry (PAU-03, user-confirmed).
- Header comment (10–12) updated.

### Component 3 — harness sentinel gating

- New `installer_plugin_sentinel_present <host> <target_home> <state_file>` in `scripts/lib/installer-shared.sh` (beside `installer_host_detected`), implementing the sentinel table; reads `installRoute` via the same runner heredoc pattern as `installer_plugin_versions`.
- `install-harness.sh` plan phase (240–253): the `skip-current` branch becomes `skip-current` only when the sentinel is present; absent → action `reinstall` (executes exactly like `install`), one log line naming the missing sentinel path (PAU-06). Dry-run reports `reinstall` without writing. `skip-newer`, `skip-absent`, `uninstall` untouched.

### Component 4 — Cursor bridge preference

- New `claude_bridge_detected()` in `apps/cursor-plugin/install.sh`: `$HOME/.claude/plugins/installed_plugins.json` parsed with the existing node/bun heredoc pattern; true when the massa-ai plugin id is listed.
- Bridge branch: skip manifest/hook-binary/skills copy into `PLUGIN_DIR` and skip `merge_hooks_json`; remove pre-existing `PLUGIN_DIR` and strip `_massaAiOwned` hook entries from `hooks.json` (reuse the existing owned-entry filter); still write flat agents, harness skills, `mcp.json` delegation, and the version record with `installRoute: "bridge"`.
- Local branch: current behavior + `installRoute: "local"`.
- Version record write: extend the existing state-write heredoc (same shape as Claude's `install.sh:420-470`).
- Uninstall: current path already removes local dir, owned hooks, flat agents — shape-independent (PAU-11).

### Component 5 — OpenCode plugin hooks-only

- `apps/opencode-plugin/src/index.ts`: delete tool map (221–580); keep event handlers (582–810) and the client/config they use; remove imports/helpers only tools used (importer enumeration in Tasks before edit).
- `apps/opencode-plugin/__tests__/`: tool-registration tests removed/replaced with a hooks-only contract test (plugin exports zero tools; named event handlers present); installer suite keeps folded real-copy tests.
- `config-cli.ts` agents-uninstall marker: unaffected (marker lives in agent files, not the plugin).

### Component 6 — ADR + docs

- `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md` (format of `0001-*`): context (14-vs-54 OpenCode defect, Cursor double load, wipe incident), decision, consequences (in-process tools never a coverage mechanism; OpenCode event handlers stay — no external hook surface exists there).
- STATE.md `## Decisions`: append AD-017 row (canonical section verified first — R5).
- Scripted sweep (population printed before rows): `52 tools`, `13 tools`, `14 in-process`, `registers tools in-process`, `registers 14 tools`, opencode-MCP-skip claims — across CLAUDE.md, README.md, FEATURES.md, `docs/`, `skills/` (router SKILL.md + `references/mcp-tools.md` say 52), plugin READMEs, installer comments. skills/ edits → `bun run generate:artifacts` + parity suites.

### Component 7 — test amendments

- `scripts/tests/test-mcp-single-writer.sh`: opencode added to the delegation scenario set (asserts `--agent opencode` registration call in install path); new scenario: install source contains no `--agent opencode --uninstall` in the install path; sandboxed run asserts plugin install produces exactly one `mcp.massa-ai` entry and `--uninstall` leaves it.
- `scripts/tests/test-plugin-auto-install.sh`: PAI-11 — install → wipe sentinel artifacts, keep state file → re-run → reinstall observed; plus PAI-05 no-op amended (skip now also requires sentinel). Observed red against pre-change harness before green.
- `apps/cursor-plugin/__tests__/install.test.ts`: bridge-detected and fallback branches, hook-once assertion (zero owned entries in bridge branch), converge-from-double scenario.
- `apps/opencode-plugin/__tests__/install.test.ts`: MCP-entry-present after install, MCP-entry-preserved after uninstall (replacing the removal assertions).

## Data Models

`install-state.json` v2, no schema bump: `platforms.cursor.installRoute: "bridge" | "local"` joins Claude's existing `"marketplace" | "file"` — installer-owned, read by the sentinel probe; all readers tolerate absent fields (existing contract).

## Error Handling Strategy

| Error scenario | Handling | User impact |
| --- | --- | --- |
| `install-agents.sh` missing/fails during opencode plugin install | Warn + print exact recovery command; overall success not reported | One command to run manually |
| Sentinel/state file unparsable | Sentinel absent → reinstall (self-healing bias) | One extra install run, then converged |
| `installed_plugins.json` absent/unparsable during Cursor install | Local-fallback branch | Plugin works via local copy |
| Bridge disappears after bridge-route install (Claude plugin uninstalled) | Cursor sentinel (flat agents) still present so no false reinstall; hooks lost until next harness run reinstalls local — documented in ADR consequences | Re-run installer to restore hooks |
| Wipe recurs after reinstall | Every harness run re-probes; reinstall repeats | Converges each run |

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| ------- | -------------------- | ------ | ---------- |
| Bridge probe may key on the wrong registry surface (installed vs enabled; pre-mortem F1) | `apps/cursor-plugin/install.sh` (probe) | Installed-but-disabled Claude plugin → bridge falsely detected → zero hooks anywhere | T6: pin probe against read-only live-machine capture of `installed_plugins.json` + `settings.json` `enabledPlugins`; require installed AND enabled where determinable; ADR records residual uncertainty |
| CI fixtures can diverge from real registry shapes (pre-mortem F2) | cursor/opencode installer suites | Green tests against a shape the host never produces | T4/T6 fixture source = live-machine capture, never invented |
| Stale local-path MCP command if plugin uninstalled standalone and checkout later deleted (pre-mortem F4) | `install-agents.sh` local mode | Dead MCP command until re-registered | Accepted risk (pre-existing class for every host); ADR consequence + recovery `bash scripts/install-agents.sh --agent <host>` |
| Cursor bridge hook delivery is host-internal; CI cannot observe it | `apps/cursor-plugin/install.sh` (bridge branch) | Wrong assumption → zero or double hook firing in the field | ACs pin *our wiring* (owned entries count); live once-only verification staged as a user-run check in delivery; brief's exthost-log evidence recorded in ADR |
| Bridge-route leaves hooks dead if Claude plugin is later removed | Component 4 | Silent hook loss | Error-handling row above; ADR consequence + README note; harness re-run converges to local |
| `index.ts` tool deletion may break importers (tests, types, config-cli) | `apps/opencode-plugin/src/index.ts:221-580` | Red suites / dead exports | Tasks step enumerates importers by resolved path before edit (lesson: resolve specifiers, don't match them) |
| skills/ source counts (52→54) ripple into 4 bundles + installed routers | `skills/massa-ai/SKILL.md`, `references/mcp-tools.md` | Parity suites red; installed machines stale | `bun run generate:artifacts` + parity suites in gate; installed-machine refresh in staged repair commands |
| Duplicate `## Decisions` headings in STATE.md | `.specs/project/STATE.md:3120,3230` | AD-017 appended to a non-canonical section | Task verifies which section carries AD-016 and appends there; other heading flagged |
| PAI suite baseline (brief says 174 tests; anchored assert-count measures 94) | `scripts/tests/test-plugin-auto-install.sh` | Amending "deliberately" needs a true baseline | Re-baseline from the suite's own summary line before and after amendment; print both |
| `skip-current` semantics change is itself a public harness surface | `scripts/install-harness.sh:240-253` | Downstream automation expecting old strings | Log lines keep existing `skip ... already at` shape for true skips; new `reinstall` line is additive; CHANGELOG documents |
| Sentinel probe on codex glob unverified (`massa-ai-*.toml` assumed) | `apps/codex-plugin/install.sh:651` | Probe never matches → permanent reinstall loop | Task T-gate: read the writer, assert glob matches a sandbox install before wiring |

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Sentinel mechanism | A1 route-keyed presence probe | Matches observed failure (wholesale wipe); zero schema change; probes only host-read surfaces (A2/A3 rejected above) |
| Sentinel failure bias | Absent/unparsable → reinstall | A wrong "skip" is the standing defect; a wrong "reinstall" is an idempotent no-op-cost run |
| Cursor load preference | Bridge over local | Bridge is host behavior an installer cannot suppress; the local copy is ours to withhold (rejected: prefer-local) |
| Route recording | Reuse `installRoute` field | Claude already writes it; switch engine already reads it; no new schema |
| OpenCode uninstall leaves MCP | Plugin lifecycle ≠ tool-surface lifecycle | AD-017; user-confirmed PAU-03; harness uninstall still cleans via agents phase |
| ADR placement | `docs/adr/0002-*.md` + STATE.md AD-017 row | Both existing conventions (AD-009 pairs the same way) |

> Project-level: AD-017 appended to STATE.md `## Decisions` in Execute (Component 6).

## Verification Design

- Every high-risk requirement has a deterministic sensor: PAU-02 (single-writer suite opencode scenarios, red against pre-change installer), PAU-05 (PAI-11 wiped-artifact red against pre-change harness), PAU-10 (owned-hook-entry count per branch), PAU-12 (hooks-only contract test), PAU-14 (scripted sweep, population printed).
- New sensors observed red before green (lesson).
- Gates: `bun run test:plugins`, `bun run test:scripts`, `bun run lint`, targeted shell suites, generators `--check`.
- Author ≠ verifier: verification-agent per validate.md writes `validation.md`.

## Artifact-Store Evidence

Written to `.specs/features/plugin-architecture-unification/design.md` (this file); checksum recorded in STATE.md at Execute start.
