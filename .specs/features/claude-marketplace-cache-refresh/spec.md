# Spec — Claude marketplace cache refresh (CMR)

**Feature slug:** `claude-marketplace-cache-refresh`
**Workflow:** spec-driven (Medium) · session `spec-installer-marketplace-update`
**Status:** Approved (plan-challenge gate run; revisions applied below)

## Problem (measured 2026-08-09)

On the marketplace route, `apps/claude-plugin/install.sh` registers via
`claude plugin marketplace add` + `claude plugin install` — both idempotent
no-ops when the plugin is already installed (`install.sh:536-539`). The Claude
CLI serves a **version-pinned cache snapshot**
(`~/.claude/plugins/cache/massa-ai/massa-ai/<version>`), so an already-installed
host never picks up a newer bundle. Observed: cache pinned at 1.28.0 since
2026-08-05 while the repo walked to 1.44.0 through multiple harness re-runs.

Compounding defect: `record_plugin_version` (`install.sh:419-471`) writes the
**bundle** version (`$SCRIPT_DIR/package.json`) into
`install-state.json` `platforms.claude.plugin.version` regardless of what the
CLI actually serves. The harness version gate ("skip hosts already at bundle
version", `scripts/lib/installer-shared.sh` PAI-03..06) reads that record —
it believes Claude is current forever and never repairs the cache.

## Requirements

- **CMR-01 (update-on-mismatch):** On the marketplace route, after successful
  registration, when the CLI-served version is **older** than the bundle
  version (`installer_compare_versions` → -1), the installer runs
  `claude plugin update massa-ai@massa-ai` before recording state.
- **CMR-02 (truthful record):** On the marketplace route,
  `record_plugin_version` records the version the CLI actually serves —
  re-read from `~/.claude/plugins/installed_plugins.json`
  (`plugins["massa-ai@massa-ai"][*].version`) after any update attempt —
  never the bundle version blindly. File route unchanged: bundle version is
  what was copied, so recording it stays correct.
- **CMR-03 (unknown stays unclaimed):** When the served version cannot be read
  after successful registration (missing/corrupt registry, entry absent), the
  installer warns on stderr and does **not** write `plugin.version` for this
  run (prior record left untouched); install still exits 0. Next harness run
  treats the host as unknown-version and retries (existing AC-8 semantics).
- **CMR-04 (update failure degrades loud):** A failed or unsupported
  `claude plugin update` (old CLI without the subcommand, transient failure)
  warns on stderr, never aborts the install, and the **served** (stale)
  version is what gets recorded — so the harness gate keeps re-triggering
  until an update succeeds (self-healing restored).
- **CMR-05 (never downgrade):** `plugin update` is invoked only when
  served < bundle. Served == bundle or served > bundle → no update call
  (mirrors the harness "upgrades older records, never downgrades" policy).
- **CMR-06 (discriminating tests):** Shell suite covers, via a mock `claude`
  CLI + fixture `installed_plugins.json` (pattern:
  `scripts/tests/test-plugin-auto-install.sh` `make_mock_agents`), all five
  behaviors: mismatch→update invoked; equal→no update; newer-served→no
  update; update-fails→warn + served version recorded; registry
  unreadable→warn + no version written. Runs on CI (no real CLI needed).
- **CMR-07 (release):** CHANGELOG entry under `### Fixed` in `[Unreleased]`.

## Invariants (CONTRIBUTING step 1/6)

- **I1:** No registry/update failure ever hard-fails the install — degrade
  with a loud stderr warning (existing installer contract).
- **I2:** On the marketplace route, a written `plugin.version` equals the
  version present in Claude's `installed_plugins.json` at record time.
- **I3:** File-route behavior is byte-identical to today (guarded by existing
  suites: `test-plugin-auto-install.sh`, `test-install-agents-claude-hooks.sh`,
  `test-model-profile-installer-reapply.sh` stay green unmodified).
- **I4:** No downgrade: update never invoked when served ≥ bundle.

## Edge cases

- CLI supports `plugin marketplace` but not `plugin update` (older build):
  probe `installer_host_cli_supports claude plugin update` first; unsupported
  → CMR-04 path.
- `installed_plugins.json` holds multiple scope entries for the plugin id
  (array): take the `user`-scope entry; absent → first entry.
- Registry entry appears only after `plugin install` on a fresh machine:
  fresh install path serves bundle version already — CMR-02 read returns it;
  no update needed (equal).
- Claude CLI absent entirely: file route as today (out of CMR scope).

## Out of scope

- Codex marketplace analog (different registry format; codex on this machine
  uses file route). Noted for a future feature.
- Web UI / switch-engine changes (message text stays; it is correct).
- The machine-level migration of this developer's Claude host to the file
  route — delivered as a user-run runbook in HANDOFF, not repo code
  (permission classifier blocks live `~/.claude` writes; prior session
  decision made marketplace route deliberate).

## Plan-challenge revisions (critic verdict: revise → applied 2026-08-09)

- **R1 (verified, closes critic F1):** `claude plugin update <id>` against a
  directory-source (`local`-mode) marketplace **does** re-materialize the
  version-pinned cache. Verified against the real CLI in an isolated temp
  HOME/CLAUDE_CONFIG_DIR: bump plugin.json 0.0.1→0.0.2 in the source dir →
  `plugin update` created `cache/<mkt>/<plugin>/0.0.2/`, registry version
  0.0.2, re-run reported "already at the latest version" (idempotent). No
  `plugin marketplace update` needed. Evidence recorded in validation.md.
- **R2 (accepted risk, critic F2):** post-merge, `install-harness.sh`'s
  skip-current gate (recorded == bundle version) means the refresh does not
  run until the **next** version bump on machines whose record is already
  poisoned (says bundle, serves older). Self-heal engages one release later.
  The one affected known machine is handled by the file-route migration
  runbook (HANDOFF); no state-repair code shipped for it.
- **R3 (critic F5):** `PLUGIN_SERVED_VERSION=""` declared at top level beside
  `SCOPE`/`UNINSTALL` — `set -u` safety; a route that never calls
  `refresh_marketplace_cache` must not trip unbound-variable.
- **R4 (critic F3/F4):** the served-version reader treats any non-array entry
  shape (e.g. the legacy flat-boolean fixture in
  `apps/claude-plugin/__tests__/install.test.ts:577`) as unknown → empty
  string; multi-entry arrays prefer `scope=="user"`, else first.
  `bun run test:plugins` added to the gate list.

## Acceptance criteria

- AC-1: Mock-CLI scenario "served 1.28.0, bundle 1.44.0" → mock records one
  `plugin update massa-ai@massa-ai` invocation; recorded
  `plugin.version == served-after-update`.
- AC-2: Scenario "served == bundle" → zero `plugin update` invocations;
  recorded version unchanged semantics (bundle == served).
- AC-3: Scenario "served > bundle" → zero `plugin update` invocations;
  recorded version == served (truthful, no downgrade).
- AC-4: Scenario "update exits non-zero" → installer exits 0, stderr contains
  a warning naming the update failure, recorded version == stale served.
- AC-5: Scenario "registry unreadable" → installer exits 0, stderr warning,
  `plugin.version` absent/unchanged in `install-state.json`.
- AC-6: All existing installer shell suites pass unmodified (I3).
- AC-7: `CHANGELOG.md` `[Unreleased]` gains a `### Fixed` bullet.
