# Plugin Auto-Install Specification

- slug: `plugin-auto-install`
- workflowSessionId: `spec-plugin-auto-install`
- size: Large (public installer contract, >5 modules, state-format change)
- phases: Specify + Design + Tasks + Execute

## Problem Statement

Installing the massa-ai plugin bundles is a manual, host-blind step:
`scripts/install-harness.sh --plugins` loops `claude codex cursor opencode`
unconditionally, and each `apps/<host>-plugin/install.sh` writes into the host
config dir (`~/.cursor`, `~/.claude`, …) whether or not that host exists on the
machine. Users who never installed a host still get its config tree created, and
users re-running the installer get a full rewrite with no notion of "already
current". The installer should detect which agent hosts are present, install
only those, and upgrade only when the bundle version changed.

## Goals

- [ ] Harness plugin phase installs bundles only for detected hosts; absent hosts produce one log line and no filesystem writes.
- [ ] Every successful plugin install records the bundle version in `install-state.json`; re-runs at the same version are no-ops, older versions upgrade.
- [ ] No behavior change for manual per-host installs (`apps/<host>-plugin/install.sh --user` keeps working exactly as today, plus version recording).

## User decisions (Specify closure)

| Question | Decision |
| --- | --- |
| Trigger | Auto-detect at install time (harness/root install path), not npm postinstall |
| Host scope | All four hosts (claude, codex, cursor, opencode) — parity |
| Absent host | Skip with a log line; no error, no exit-code effect |
| Re-run | Auto-upgrade on version change; same version is a no-op |

## Requirements

| ID | Requirement |
| --- | --- |
| PAI-01 | Host detection contract: the harness plugin phase SHALL detect each host (`claude`, `codex`, `cursor`, `opencode`) and attempt a plugin install only for detected hosts. Detection signal: the host's user config dir exists (`~/.claude`, `~/.codex`, `~/.cursor`, `~/.config/opencode`) OR the host binary is on `PATH` (`claude`, `codex`, `cursor`, `opencode`). |
| PAI-02 | Absent-host skip: WHEN a host is not detected THEN the system SHALL skip its plugin install, emit exactly one log line naming the host and the skip reason, perform no writes for that host, and SHALL NOT affect the run's exit code. |
| PAI-03 | Version recording: WHEN a plugin bundle install completes successfully THEN the system SHALL record the bundle version (the repo root `package.json` `version` at install time) and an ISO-8601 timestamp for that platform in `~/.config/massa-ai/install-state.json`. |
| PAI-04 | Auto-upgrade: WHEN a detected host's recorded plugin version differs from the current bundle version THEN the system SHALL run that host's plugin installer and update the recorded version on success. |
| PAI-05 | Same-version no-op: WHEN a detected host's recorded plugin version equals the current bundle version THEN the system SHALL skip that host's installer, emit one log line, and perform no writes for that host. |
| PAI-06 | State compatibility: the `install-state.json` extension SHALL preserve every existing v2 reader/writer behavior (`skillsOwner` semantics, v1→v2 migration, `repository`, per-platform entries). A platform entry with no recorded plugin version SHALL be treated as "unknown version" and upgraded once, then recorded. |
| PAI-07 | Uninstall: WHEN a plugin bundle is uninstalled through the harness or the plugin's own `install.sh --uninstall` THEN the system SHALL remove that platform's plugin-version record from `install-state.json`. |
| PAI-08 | Single code path: host detection and version gating SHALL live in one shared place (`scripts/lib/installer-shared.sh` or the harness) so the root `install.sh` menus, `scripts/setup-local-first.sh`, and direct `install-harness.sh` runs all get identical behavior. The pinned root-install menu strings SHALL NOT change. |
| PAI-09 | Dry-run: `install-harness.sh --plugins --dry-run` SHALL report, per host, whether it would install, upgrade, skip (same version), or skip (host absent) — and write nothing. |
| PAI-10 | Failure isolation: a host whose installer fails SHALL record no version, SHALL NOT abort remaining hosts, and the run SHALL propagate the first failing step's exit code (existing `note_failure` semantics preserved). |

## Acceptance criteria (WHEN/THEN/SHALL)

1. WHEN `install-harness.sh --plugins` runs on a machine with only `~/.cursor` present and no host binaries on `PATH` THEN only the Cursor plugin SHALL be installed and the other three hosts SHALL each produce one skip log line and zero writes.
2. WHEN a host binary is on `PATH` but its config dir does not exist THEN the host SHALL be treated as detected and its plugin SHALL be installed.
3. WHEN a plugin install succeeds THEN `install-state.json` SHALL contain that platform's plugin version equal to the repo root `package.json` version and a valid timestamp.
4. WHEN the recorded version equals the bundle version THEN a re-run SHALL NOT invoke that host's installer (observable via `--verbose` log and unchanged file mtimes in the host config dir).
5. WHEN the recorded version is older than the bundle version THEN a re-run SHALL invoke that host's installer and update the record.
6. WHEN the recorded version is newer than the bundle version (repo downgrade) THEN the system SHALL skip with a log line and SHALL NOT downgrade files.
7. WHEN `install-state.json` predates this feature (v2, no version fields) THEN the first run SHALL treat all detected hosts as unknown-version, install/upgrade them, and write the extended record without altering `skillsOwner` or dropping existing platform entries.
8. WHEN `install-state.json` is corrupt (unparseable) THEN the system SHALL warn, treat all detected hosts as unknown-version, and rewrite a valid file on success — without crashing on the parse.
9. WHEN one host's installer exits non-zero THEN remaining detected hosts SHALL still be processed and the harness SHALL exit with the first failing code.
10. WHEN `--dry-run` is passed THEN the output SHALL name each host's would-be action (install / upgrade / skip-current / skip-absent) and no file under `$HOME` SHALL be modified.
11. WHEN `--uninstall` runs for a host THEN that platform's plugin-version record SHALL be absent from `install-state.json` afterwards.
12. WHEN the OpenCode host is detected but `apps/opencode-plugin/dist/index.js` is missing THEN the existing refuse-without-build behavior SHALL apply (host fails with its documented error, other hosts continue, exit code propagates) — detection does not bypass the build requirement.
13. WHEN the root `install.sh` `k)`/`p)` menus or `setup-local-first.sh` reach the plugin phase THEN the identical detection + version gating SHALL apply (single shared implementation).
14. Existing suites SHALL pass unchanged in behavior: `root-install-menu` grep-pins, `test-mcp-single-writer.sh`, plugin `__tests__`, and the install shell suites (update only where the new skip/upgrade behavior is itself the subject).

## Edge cases

- `$HOME` unset or empty → existing consent-gate/target handling applies; detection never fabricates a home dir.
- Docker-mode root install (no `apps/` tree) → existing warn-and-skip behavior unchanged.
- Partial/interrupted install (files written, version not recorded) → next run treats host as unknown-version and reinstalls (recovery by construction).
- Config dir exists but is not writable → installer fails per PAI-10; no version recorded.
- Two hosts detected, one installer missing from `apps/` → existing "installer not found" warn-and-continue unchanged.

## Out of scope

| Item | Reason |
| --- | --- |
| npm `postinstall` auto-registration | User decision: trigger is install-time auto-detect |
| Changes to plugin bundle contents (skills, agents, hooks, manifests) | Separate surface; parity generators own it |
| MCP registration changes | `install-agents.sh` single-writer contract untouched |
| Claude Desktop / VSCode integration | Not an agent-host plugin target here |
| Auto-update of already-installed plugins in the background (daemon/cron) | Install-time only |
| Windows-native (non-WSL) host detection | No existing installer support to extend |

## Assumptions & Open Questions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Detection signal | config-dir existence OR binary on `PATH` | Both are observable without writes; either alone misses real installs | y (user may override at confirm) |
| Version source | repo root `package.json` `version` | Single release version for the whole bundle set; already the release unit | y |
| Downgrade | skip with log, never auto-downgrade | Reinstalling older over newer destroys data silently | y |
| Unknown/corrupt version record | treat as unknown → install once, then record | Self-healing; matches PAI-06 | y |
| OpenCode build-missing | remains a failure, not a silent skip | Host IS detected; missing build is an error the user must see | y |

**Open questions:** none.

## Implicit-requirement sweep (Large — all dimensions)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Flag parsing unchanged; detection handles missing `$HOME`, spaces in paths (quoted) |
| Failure / partial-failure | PAI-10 isolation; corrupt-state recovery AC-8 |
| Idempotency / retry / duplicate | PAI-05 no-op; interrupted install recovers via unknown-version |
| Auth boundaries & rate limits | N/A — local installer behind existing consent gate |
| Concurrency / ordering | Sequential per-host loop unchanged; state writes reuse the existing atomic write pattern from `installer-race-safety` |
| Data lifecycle / expiry | PAI-07 uninstall removes record; no TTL |
| Observability | One log line per host decision; `--verbose` detail; `--quiet` one-liners preserved |
| External-dependency failure | Docker-mode missing `apps/` tree: existing warn path; OpenCode missing build: AC-12 |
| State-transition integrity | PAI-06 v2 extension; v1→v2 migration untouched |

## Verification approach

- New shell suites under `scripts/tests/` (pattern of `test-mcp-single-writer.sh`) driving `install-harness.sh`/`installer-shared.sh` against a scratch `--target` HOME: detection matrix (dir-only, binary-only, both, neither), skip logging, version record, same-version no-op, upgrade, downgrade-skip, corrupt-state recovery, dry-run, uninstall.
- TS suites under `scripts/__tests__/` for the state-file extension (v2 read/write, migration, corrupt parse).
- Gates: `bun run test:scripts`, `bun run test:plugins`, `bun run lint`, `bun run type-check`.
- CHANGELOG: `[Unreleased] → ### Added` (minor bump).

## Artifact-store evidence

- spec written: `.specs/features/plugin-auto-install/spec.md` (this file), v1, 2026-07-29.
