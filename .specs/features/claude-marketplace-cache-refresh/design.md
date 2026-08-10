# Design — claude-marketplace-cache-refresh

## Placement decisions

- **`claude_served_plugin_version()` lives in `apps/claude-plugin/install.sh`,
  not `scripts/lib/installer-shared.sh`.** It parses Claude's
  `installed_plugins.json` (`plugins["massa-ai@massa-ai"]` array → prefer
  `scope=="user"` entry → `.version`). That format is Claude-specific; Codex's
  registry differs, and CLAUDE.md's MCP-shape lesson says never generalize one
  host's file shape. Tolerant reader: empty string on any failure, never
  throws (mirrors `recorded_profile`).
- **New `refresh_marketplace_cache()` called from the install flow right after
  `PLUGIN_ROUTE=1`**, not inside `register_claude_plugin` — register keeps its
  single job (make `/plugin` see the plugin) and its `return` codes drive route
  selection; mixing update logic in would overload its failure semantics.
- Served version handed to `record_plugin_version` via
  `PLUGIN_SERVED_VERSION` (script-scope var), matching the existing
  `PLUGIN_ROUTE` pattern.

## Flow (marketplace route only)

```
register ok → PLUGIN_ROUTE=1
refresh_marketplace_cache:
  runner ← node|bun (absent → warn, PLUGIN_SERVED_VERSION="", return 0)
  served ← claude_served_plugin_version
  bundle ← installer_bundle_version "$SCRIPT_DIR/package.json"
  served empty → warn, PLUGIN_SERVED_VERSION="", return 0        (CMR-03 feed)
  installer_compare_versions served bundle == -1:                 (CMR-05)
    installer_host_cli_supports claude plugin update || warn+skip (CMR-04)
    claude plugin update "$PLUGIN_ID" || warn                     (CMR-04)
    served ← claude_served_plugin_version   # re-read, truthful   (CMR-02)
  PLUGIN_SERVED_VERSION="$served"
record_plugin_version:
  route == marketplace → version="$PLUGIN_SERVED_VERSION"
    version empty → warn, write installRoute but NOT plugin.version,
                    preserve any prior plugin record                (CMR-03)
  route == file → bundle version (unchanged today)                  (I3)
```

`installRoute` is still written on every install path — an absent field is
what makes the switch engine refuse loud (hosts.ts detectRoute), and CMR-03
must not regress that.

## Test harness (CMR-06)

`scripts/tests/test-plugin-marketplace-cache-refresh.sh`, patterned on
`test-plugin-auto-install.sh` (mock binaries + temp `$HOME`) and
`test-plugin-registry-registration.sh` (registry assertions):

- Mock `claude` on a controlled PATH: `plugin marketplace --help` /
  `plugin update --help` exit 0; `plugin marketplace add` exit 0;
  `plugin install` seeds `$HOME/.claude/plugins/installed_plugins.json` from a
  per-scenario fixture when absent; `plugin update` appends its argv to an
  invocation log and, unless `MOCK_UPDATE_FAIL=1`, rewrites the fixture's
  version to the bundle version.
- Scenario matrix = AC-1..5. Assertions: update-invocation count from the log,
  recorded `plugin.version` from `install-state.json`, stderr warnings,
  installer exit code.
- Update-unsupported probe variant: mock rejects `plugin update --help`
  (exit 1) → CMR-04 path without calling update.
- Suite auto-discovered by the `scripts/tests/*.sh` glob in `test:scripts`
  (package.json:38) — CONTRIBUTING step-2 registration.

## Rejected alternatives

- **Always call `plugin update` (unconditional):** violates never-downgrade
  (CMR-05) — a dev checkout older than the installed cache would downgrade
  the user's plugin.
- **Record "unknown" sentinel instead of omitting `plugin.version`:** the
  tolerant readers (`installer_plugin_versions`) treat only *absent* as
  unknown; a sentinel string would flow into version compares as a
  non-numeric segment and permanently compare older — same effect, more
  states. Omission reuses existing AC-8 semantics.
- **Fix in `install-harness.sh` version gate instead:** the gate's record is
  the lie; patching the reader leaves every other reader (Web UI
  `bundleVersion`, config CLIs) deceived. Fix the writer.
