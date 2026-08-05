# Model Profile Switching — Specification

- **Feature slug**: `model-profile-switching`
- **workflowSessionId**: `spec-model-profile-switching`
- **Workflow**: spec-driven (Large — public compatibility surfaces, 4 hosts, MCP contract)
- **Branch / worktree**: `spec/model-profile-switching` @ `.claude/worktrees/model-profile-switching`, cut from `origin/main` @ `d18e7764`
- **Depends on**: `model-profile-registry` (complete — this feature layers on its resolver/registry; nothing here re-opens its build-time contract)
- **Environment note**: massa-ai MCP server unreachable this session; `.specs/` canonical (recorded degradation, consistent with the three prior sessions).

## Problem Statement

The model-profile registry resolves `tier + host + profile → {model, effort}` at **build time** and bakes one profile (`balanced`, every host's `hostDefaults`) into the checked-in plugin artifacts. A user who installs the plugins — especially from npm, with no repo checkout — cannot change profile without regenerating and reinstalling from source. The registry spec records "runtime model switching inside a live host session" as a non-goal because no host supports per-agent runtime indirection; that finding stands, but it left a gap between "build-time" and "in-session": **switch-time re-render**, where a command rewrites the *installed* agent files from pre-rendered variants between sessions. This feature closes that gap.

Motivating use case (agreed in conversation): one machine, two billing contexts — subscription-backed `work` profile during work hours, cheap-where-mechanical `home` profile on personal time — switched conversationally from inside any host CLI, surviving plugin upgrades, working offline, on an npm-only install.

## Goals

- [ ] A user on any supported host can switch the installed massa-ai agents to any registry profile with one command/tool call, without a repo checkout.
- [ ] The chosen profile survives plugin upgrades (no silent stomp back to `balanced`).
- [ ] The switch works offline after install (variant files already on disk).
- [ ] Exactly one switch implementation; MCP tools, CLI, and host sugar are fronts.

## Out of Scope

| Feature | Reason |
| --- | --- |
| In-session live model switching (no restart) | No host supports per-agent runtime indirection — registry spec's researched finding, unchanged. Hosts load agent definitions at session start. |
| Per-agent model overrides (single agent to a different model) | Profile is the unit of the registry; per-agent overrides would reintroduce the hand-authored cross-product the registry removed. |
| Runtime-defined custom profiles (user-authored profile JSON on the installed machine) | npm users consume pre-rendered variants; a custom profile is a registry edit + release by design (MPR-R3 keeps the profile set open *data* in one place). |
| Cursor switching | Every Cursor tier resolves to `null`/`inherit` — Cursor publishes no resolvable model IDs; switching changes nothing. Cursor is skipped with an explicit per-host reason, not silently. |
| Codex-host-specific command sugar (custom prompt file) | MCP tools cover Codex conversationally; a prompt file adds a second front with no new capability. Revisit on demand. |
| `packages/core` LLM configuration (`MASSA_AI_LLM_MODEL`, `MASSA_AI_LLM_CODE_MODEL`) | Different subsystem — retrieval-time inference, not agent dispatch. Same boundary the registry spec drew. |
| Changing which models/profiles the registry names | This feature consumes the registry; editing its values stays a registry edit under MPR rules. |
| `CLAUDE_CODE_SUBAGENT_MODEL` / `agents.default_subagent_model` integration | Documented footguns, opposite precedence directions, tierless. Documented, not wired. |

## Assumptions & Accepted Decisions

All resolved in the requesting conversation unless marked otherwise.

| # | Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- | --- |
| A1 | Mechanism: pre-rendered per-profile variants shipped in each plugin bundle; switch = file copy | Variants over switch-time resolution | No resolver/registry/emitters in the runtime path; offline; npm-clean | y (conversation) |
| A2 | Primary surface: MCP tools; CLI underneath; Claude skill + OpenCode in-process tool as sugar | As stated | One implementation, four hosts covered conversationally | y (conversation) |
| A3 | Session restart required for effect | Switch output says so explicitly | Hosts load agent defs at session start; structural floor | y (conversation) |
| A4 | Profile recorded per host in `install-state.json` | v2-compatible extension field | Solves two-writer/upgrade-stomp; mirrors `skillsOwner` pattern | y (conversation) |
| A5 | Variant directory lives **beside** `agents/`, not inside it | `agent-profiles/<profile>/` at bundle top level | Claude marketplace route reads the bundle `agents/` dir in place — variants nested inside risk hosts loading 7× duplicate agents. Exact name is a Design decision; the *sibling* constraint is the requirement. | assumption (Design measures host scan behavior) |
| A6 | Marketplace-route Claude installs (bundle = repo checkout or CLI-managed plugin dir) must not be silently corrupted | Switch fails loud or takes a documented safe path on marketplace route; never leaves a git checkout dirty without saying so | Checked-in artifacts are `balanced` and guarded by the drift gate; rewriting them in place breaks `--check` and dirties the tree | assumption (Design decides the safe path) |
| A7 | OpenCode symlinked agent files | Switch must produce correct post-switch state whether prior install used symlinks or copies; end state may normalize to copies | `install.sh` uses `ln -sfn`; rewriting a symlink target would mutate the bundle | assumption (Design decides symlink vs copy normalization) |
| A8 | Registry spec amendment | Amend the "Runtime model switching" non-goal clause in `model-profile-registry/spec.md` in place, with reason and pointer here | Repo convention: amend the losing clause with its reason (lessons; spec-contradiction rule) | y (conversation) |
| A9 | Bump/versioning | CHANGELOG entry under `[Unreleased]` `### Added` (minor) | CI CHANGELOG gate; release chain derives bump | assumption (standing convention) |
| A10 | Concurrency | Single-flight guard on switch (reuse installer race-safety pattern, M19) | Two concurrent switches interleaving copies would mix profiles | assumption |

**Open questions:** none — all resolved above or delegated to Design as named decisions (A5, A6, A7 delegate the *mechanism detail*, not the requirement).

## User Stories

### P1: Switch profile conversationally from any host ⭐ MVP

**User Story**: As a developer with one machine and two billing contexts, I want to tell my host CLI "switch massa-ai agents to the work profile" so that the next session's subagents run on the models my seat pays for.

**Why P1**: The entire feature; everything else is plumbing or sugar for this.

**Acceptance Criteria**:

1. WHEN the MCP tool `profile_set` is called with `{profile: "work"}` THEN the system SHALL replace the active installed agent files for every detected, supported host with the `work` variant's files and report per host: switched / skipped (with reason) / failed (with reason). (MPS-02, MPS-05)
2. WHEN `profile_set` completes with at least one switched host THEN the response SHALL state that a host session restart is required for the change to take effect. (MPS-10)
3. WHEN `profile_set` is called with `{profile: "work", host: "claude"}` THEN only that host SHALL be touched. (MPS-02)
4. WHEN `profile_set` is called with a profile name absent from the shipped variant set THEN the system SHALL fail with a named error listing available profiles and change no files. (MPS-09)
5. WHEN `profile_set` targets a host the profile does not support (e.g. `open_models` on claude) THEN that host SHALL be reported as unsupported-by-profile with no file changes, mirroring the registry's fail-loud rule (no silent inherit). (MPS-09)
6. WHEN Cursor is among detected hosts THEN it SHALL be reported skipped with the explicit reason that Cursor resolves all tiers to inherit. (MPS-10)
7. WHEN the MCP tool `profile_list` is called THEN the system SHALL return the shipped profile names, per-host active profile (from recorded state; `balanced` shown as the default when no record exists), and per-host bundle version. (MPS-05)
8. WHEN `profile_set` runs on a machine with no network access THEN the switch SHALL complete using only files already on disk. (MPS-02)

**Independent Test**: On a machine with plugins installed, call `profile_set {profile: "home"}` via MCP; diff an installed Claude agent file before/after (model frontmatter `opus` → `sonnet` for a deep-tier agent per registry `home` values); `profile_list` reports `home` active; new session dispatches on the new model.

### P1: Variants ship in every plugin bundle

**User Story**: As an npm-only user, I want every registry profile pre-rendered inside the plugin packages I install so that switching never needs a repo checkout, resolver, or network.

**Why P1**: The switch has nothing to copy without it.

**Acceptance Criteria**:

1. WHEN `generate-subagent-artifacts.ts` runs THEN it SHALL emit, for each host and for each registry profile supporting that host, a complete pre-rendered agent set under the bundle's variant directory (sibling of `agents/`, per A5), byte-identical to what the existing single-profile emitter produces for that (host, profile). (MPS-01)
2. WHEN the generator's `--check` mode runs THEN it SHALL diff variant directories with the same full-inventory semantics as the active `agents/` dirs (catches stale entries after a profile removal, not just changed files). (MPS-01, MPS-12)
3. WHEN a profile does not support a host (e.g. `open_models` on claude) THEN no variant directory for it SHALL exist in that host's bundle, and the switch layer SHALL treat its absence as unsupported-by-profile. (MPS-01, MPS-09)
4. WHEN `npm pack` runs for each plugin package THEN the tarball SHALL contain the variant tree (`verify-package-contents.ts` extended; it exists precisely because agent globs shipped silently-missing before). (MPS-12)
5. WHEN the active `agents/` dir is compared with the shipped default variant THEN they SHALL be byte-identical (active = default variant; one source of truth per (host, profile)). (MPS-01)

**Independent Test**: Run generator; assert `apps/claude-plugin/<variants>/work/massa-ai-planner.md` exists with `model: opus` and `apps/claude-plugin/<variants>/cheap/` shows the `cheap` mapping; run `--check` twice (clean, then after deleting one variant file → drift).

### P1: Recorded profile survives upgrades

**User Story**: As a user who switched to `home`, I want plugin upgrades to keep my profile so that models don't silently revert to `balanced` and surprise me on an invoice.

**Why P1**: Without it the feature regresses on every release — the two-writer problem named in conversation.

**Acceptance Criteria**:

1. WHEN a switch succeeds for a host THEN the system SHALL record `{profile, switchedAt}` for that host in `install-state.json` as a v2-compatible extension that every existing reader/writer round-trips unchanged (the `plugin` field precedent). *(Amended at Design C1: the original `bundleVersion` field duplicated `platforms[host].plugin.version`, which the plugin installers already own — two sources for one fact. Bundle version is reported from the existing field instead.)* (MPS-03)
2. WHEN a plugin `install.sh` installs or upgrades a host that has a recorded profile THEN it SHALL install that profile's variant as the active agent set, not `balanced`. (MPS-04)
3. WHEN the recorded profile is absent from the new bundle's variant set (profile removed upstream) THEN the installer SHALL fall back to the default variant and say so — fail-loud in output, not silent. (MPS-04, MPS-09)
4. WHEN no profile record exists (fresh install, pre-feature state file) THEN behavior SHALL be today's: default variant installed, no record written until first switch. (MPS-03)
5. WHEN `install-state.json` is corrupt or unwritable THEN the switch SHALL fail before copying any files. *(Amended at Plan Challenge F4: the state file is one shared JSON blob across hosts, so corruption is a **global** precondition failure — this case is exempt from the per-host-atomicity rule in Edge Cases, which governs per-host copy/apply failures only.)* (MPS-03, MPS-09)

**Independent Test**: Switch to `home`; run the plugin installer at a bumped version; installed deep-tier Claude agent still shows `home`'s model; state shows `modelProfile.profile = "home"` and the bumped `plugin.version`.

### P2: CLI subcommand + OpenCode in-process tool

**User Story**: As a script author (and as an OpenCode user), I want `massa-ai-config profile set|list|show` and a native OpenCode tool so that switching doesn't require an MCP round-trip.

**Why P2**: Same engine, extra fronts; MCP already covers every host conversationally.

**Acceptance Criteria**:

1. WHEN `profile set <name> [--host <h>] [--dry-run]` runs THEN it SHALL invoke the same switch engine as the MCP tool; `--dry-run` prints the per-host plan and changes nothing. (MPS-06)
2. WHEN `profile list` / `profile show` run THEN they SHALL print shipped profiles and per-host active state, matching `profile_list`'s data. (MPS-06)
3. WHEN the OpenCode plugin registers its in-process tools THEN it SHALL include a profile tool delegating to the same engine/endpoint as the other in-process tools. (MPS-07)
4. WHEN the two existing `config-cli.ts` implementations (mcp-client and opencode-plugin) both gain the subcommand THEN the switch logic SHALL exist once, in a shared published location — not pasted twice. (MPS-06)

**Independent Test**: `massa-ai-config profile set cheap --dry-run` prints plan, no diff; without `--dry-run`, files change and `profile show` reflects it.

### P3: Claude skill sugar

**User Story**: As a Claude Code user, I want `/massa-ai:profile work` so that switching is one slash command.

**Why P3**: Pure convenience over the MCP path.

**Acceptance Criteria**:

1. WHEN the skill is invoked with a profile name THEN it SHALL drive the same engine (via MCP tool or CLI) and relay the per-host report including the restart notice. (MPS-08)

## Edge Cases

- WHEN two switches run concurrently THEN the second SHALL wait or fail loud under a single-flight guard — never interleave copies. (A10)
- WHEN a host is detected but its bundle predates variants (upgrade skew: new MCP package, old plugin) THEN that host SHALL be reported "bundle has no variants — upgrade plugin", no files touched. (MPS-09)
- WHEN the switch engine cannot find any installed host THEN it SHALL say so and exit non-zero rather than reporting an empty success.
- WHEN a multi-host switch fails on one host THEN other hosts' completed switches stand; the failure is reported per host; exit is non-zero. Per-host atomicity, not global rollback.
- WHEN the Claude install is marketplace-route (bundle read in place, possibly a git checkout) THEN the switch SHALL take the Design-chosen safe path (A6) and never silently dirty a checkout.
- WHEN installed agent files contain user local edits (file route, hand-edited) THEN the switch SHALL overwrite only massa-ai-owned files (the `massa-ai-*` name contract / owned markers) and never delete non-massa-ai files in the same directory — same discipline as `--check`'s ignore rule.
- WHEN `profile_set` is called through tools-api THEN it SHALL sit behind the mandatory `x-api-key` auth like every non-public route (AD-011); no new public path.
- WHEN the profile name arrives with surrounding whitespace or case variance THEN it SHALL be treated as given (exact match, like the registry's fail-loud selection) — no fuzzy matching.

## Implicit-Requirement Sweep (Large — all dimensions)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Profile name: exact match against shipped variant set (P1-1 AC4); host: must be a known host id (`HOSTS` from model-profiles lib); no other user input. |
| Failure / partial-failure | Per-host atomicity; multi-host partial failure reported per host, non-zero exit (Edge cases); state/file ordering decided in Design under "no host ends half-switched" (P1-3 AC5). |
| Idempotency / retry | Switching to the already-active profile is a no-op copy (same bytes) and safe to repeat; record refreshed. Re-running after a failed host retries only that host safely. (MPS-02) |
| Auth boundaries & rate limits | tools-api route behind `x-api-key` (Edge cases); no rate limit — local, single-user, filesystem-bound. N/A beyond auth because the surface is localhost admin. |
| Concurrency / ordering | Single-flight guard (A10); host processing order is deterministic (fixed `HOSTS` order) for stable reports. |
| Data lifecycle / expiry | `install-state.json` record lives until overwritten by next switch or cleared by uninstall (uninstall behavior: record removed with the host's platform entry — existing uninstall owns the entry). No TTL — N/A because state is a preference, not a cache. |
| Observability | Per-host structured report (switched/skipped/failed + reason) is the observable; stderr logging only in MCP context (stdout belongs to the protocol). No metrics — N/A, local tool. |
| External-dependency failure | None at switch time by design (offline requirement, P1-1 AC8). Install-time npm failures are the installers' existing domain. |
| State-transition integrity | Valid states per host: unrecorded (default) → recorded(profile). Transitions only via switch engine (single writer for the new field); installers read it, never invent it (P1-3). |

## Requirement Traceability

| Requirement ID | Requirement | Story | Status |
| --- | --- | --- | --- |
| MPS-01 | Generator emits per-profile pre-rendered variant trees into every plugin bundle, sibling of `agents/`; active dir byte-equals default variant; `--check` covers variants with full-inventory semantics | P1: Variants ship | Verified |
| MPS-02 | One switch engine replaces active installed agent files from on-disk variants, per host, both install topologies (file-route copies, marketplace/in-place, OpenCode symlinks), offline-capable, idempotent | P1: Switch | Verified |
| MPS-03 | Per-host `{profile, switchedAt}` recorded in `install-state.json` as v2-compatible extension (bundle version reported from existing `plugin.version` — Design C1); switch engine is its only writer; all existing writers round-trip it | P1: Upgrades | Verified |
| MPS-04 | Plugin installers re-apply the recorded profile on install/upgrade; removed-profile fallback is loud | P1: Upgrades | Verified |
| MPS-05 | MCP tools `profile_list`/`profile_set` via the three-place contract (tool-defs + tools-api route + embedded mapping); tool-count assertions updated (52 → 54) | P1: Switch | Verified |
| MPS-06 | `profile` subcommand in both config-cli surfaces, switch logic in one shared published location; `--dry-run` | P2 | Verified |
| MPS-07 | OpenCode in-process profile tool | P2 | Verified |
| MPS-08 | Claude skill `/massa-ai:profile` | P3 | Verified |
| MPS-09 | Fail-loud semantics: unknown profile, unsupported host, missing variants, corrupt state — named errors, zero silent fallbacks | P1 (all) | Verified |
| MPS-10 | UX contract: restart notice, per-host skip reasons (Cursor always) | P1: Switch | Verified |
| MPS-11 | `model-profile-registry/spec.md` non-goal clause amended in place with reason + pointer (repo amendment convention) | — | Verified |
| MPS-12 | Guard extensions: subagent-parity (17-files-per-host assertions extended over variants), `verify-package-contents.ts` variant entries, new switch-engine tests observed red first | P1: Variants ship | Verified |

**Coverage:** 12 total, 0 mapped to tasks (Tasks phase pending), 0 unmapped.

## Success Criteria

- [ ] The Monday-morning use case runs end-to-end on an npm-only install: conversational switch → restart → deep-tier agent dispatches on the `work` model for that host.
- [ ] A plugin upgrade at a recorded non-default profile leaves the installed models unchanged (measured by frontmatter diff before/after upgrade).
- [ ] `bun run test:scripts`, plugin suites, parity gates, `verify-package-contents`, and `--check` all green with variants present.
- [ ] Zero new silent fallbacks: every error path in MPS-09 has a test asserting the named error.

## Verification Approach

- Tests derive from the ACs above, not from the implementation (execution contract rule 1).
- New sensors (variant `--check`, package-contents entries, state round-trip, fail-loud paths) must each be observed red on a deliberate fault before counting as gates (lesson: a new sensor needs an observed red).
- Figures quoted from the investigator packet (52 tools asserted in 2 test files; exactly-17 assertions; 13-vs-14 OpenCode tool count vs CLAUDE.md) are **leads** — re-measured in-session at Design/Execute before any test edit cites them (measurement discipline; subagent numbers need re-measuring).
- Independent validation: `massa-ai-verification-agent` (author ≠ verifier), spec-anchored outcome check + discrimination sensor, writes `validation.md`.

## Discuss Context Summary

Requirements were resolved across the requesting conversation (options survey, npm-install analysis, use-case walkthrough): mechanism B (pre-rendered variants + copy-switch) chosen over switch-time resolution and env knobs; MCP-primary surface; Cursor skipped; restart floor accepted; state recording mandated. Investigator Context Packet (this session) supplied the integration facts: single-profile `emitAll`, marketplace vs file-route topologies, OpenCode symlinks, state-file v2 writers, three-place MCP contract, two config-cli implementations, guard-test inventory.
