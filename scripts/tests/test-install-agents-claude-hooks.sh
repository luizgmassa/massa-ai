#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-agents-claude-hooks.sh
#
# ~/.claude/settings.json is shared: the Claude plugin writes a "hooks" block
# there and install-agents.sh writes "mcpServers". This suite pins the
# coexistence — an MCP write must never disturb the plugin's hooks, its
# permissions, or any other user key.
#
# Usage: bash scripts/tests/test-install-agents-claude-hooks.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-agents.sh"
PLUGIN_INSTALLER="${PROJECT_ROOT}/apps/claude-plugin/install.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-claude-hooks.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

jq_get() {
  "$RUNNER" - "$1" "$2" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const v = eval(process.argv[3]);
process.stdout.write(typeof v === "object" ? JSON.stringify(v) : String(v));
NODE
}

seed_settings() { # seed_settings HOME
  mkdir -p "$1/.claude"
  cat > "$1/.claude/settings.json" <<'JSON'
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "bun run hook session-start" }], "_massaAiOwned": true },
      { "hooks": [{ "type": "command", "command": "my-own-hook" }] }
    ]
  },
  "permissions": { "allow": ["mcp__massa-ai__search"] },
  "userPreference": "keep me"
}
JSON
}

echo "Scenario 1: plugin hooks survive an MCP write"
H1="$ROOT/h1"; seed_settings "$H1"
OUT="$(bash "$INSTALLER" --target "$H1" --agent claude-code --yes 2>&1)"
CFG="$H1/.claude/settings.json"
assert_eq "owned hook entry still present" \
  "$(jq_get "$CFG" 'c.hooks.SessionStart.filter(e => e._massaAiOwned === true).length')" "1"
assert_eq "user hook entry still present" \
  "$(jq_get "$CFG" 'c.hooks.SessionStart.filter(e => !e._massaAiOwned).length')" "1"
assert_eq "hook command untouched" \
  "$(jq_get "$CFG" 'c.hooks.SessionStart[0].hooks[0].command')" "bun run hook session-start"
assert_eq "permissions survive" "$(jq_get "$CFG" 'c.permissions.allow[0]')" "mcp__massa-ai__search"
assert_eq "unrelated user key survives" "$(jq_get "$CFG" 'c.userPreference')" "keep me"
assert_eq "mcpServers added" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"] ? "yes" : "no"')" "yes"

echo ""
echo "Scenario 2: the coordination notice is printed when plugin hooks exist"
assert_contains "notice printed on apply" "$OUT" "plugin hooks preserved"

echo ""
echo "Scenario 3: no notice when there are no plugin hooks"
H3="$ROOT/h3"; mkdir -p "$H3/.claude"
printf '{"userPreference":"x"}\n' > "$H3/.claude/settings.json"
OUT3="$(bash "$INSTALLER" --target "$H3" --agent claude-code --yes 2>&1)"
assert_not_contains "no false coordination claim" "$OUT3" "plugin hooks preserved"

echo ""
echo "Scenario 4: --dry-run prints no coordination notice and writes nothing"
H4="$ROOT/h4"; seed_settings "$H4"
BEFORE="$(shasum -a 256 "$H4/.claude/settings.json" | cut -d' ' -f1)"
OUT4="$(bash "$INSTALLER" --target "$H4" --agent claude-code --dry-run 2>&1)"
AFTER="$(shasum -a 256 "$H4/.claude/settings.json" | cut -d' ' -f1)"
assert_eq "settings.json untouched" "$AFTER" "$BEFORE"
assert_not_contains "no notice on dry-run" "$OUT4" "plugin hooks preserved"

echo ""
echo "Scenario 5: real plugin install then MCP write — both blocks coexist"
H5="$ROOT/h5"; mkdir -p "$H5"
HOME="$H5" bash "$PLUGIN_INSTALLER" --user >/dev/null 2>&1
CFG5="$H5/.claude/settings.json"
assert_file "plugin wrote settings.json" "$CFG5"
assert_eq "5 owned hook events wired" \
  "$(jq_get "$CFG5" 'Object.keys(c.hooks).length')" "5"
assert_eq "plugin install also registered MCP (delegated)" \
  "$(jq_get "$CFG5" 'c.mcpServers["massa-ai"] ? "yes" : "no"')" "yes"

echo ""
echo "Scenario 6: MCP uninstall leaves the plugin's hooks alone"
bash "$INSTALLER" --target "$H5" --agent claude-code --yes --uninstall >/dev/null 2>&1
assert_eq "mcpServers gone" "$(jq_get "$CFG5" 'c.mcpServers === undefined ? "gone" : "present"')" "gone"
assert_eq "hooks still wired" "$(jq_get "$CFG5" 'Object.keys(c.hooks).length')" "5"

summary "install-agents claude-code hooks coexistence"
