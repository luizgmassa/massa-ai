#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-agents-json.sh
#
# scripts/install-agents.sh JSON writers (claude-code, claude-desktop, cursor,
# opencode): deep merge preserves user keys, OpenCode gets its own entry shape,
# re-running is a no-op, and a backup exists before every write.
#
# Usage: bash scripts/tests/test-install-agents-json.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-agents.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-agents-json.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

jq_get() { # jq_get FILE EXPR   (EXPR evaluated with `c` bound to the parsed doc)
  "$RUNNER" - "$1" "$2" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const v = eval(process.argv[3]);
process.stdout.write(typeof v === "object" ? JSON.stringify(v) : String(v));
NODE
}

run() { bash "$INSTALLER" --target "$1" --agent "$2" --mcp-source npx --yes "${@:3}" 2>&1; }

echo "Scenario 1: cursor — creates ~/.cursor/mcp.json with an owned entry"
H1="$ROOT/h1"
run "$H1" cursor >/dev/null
CFG="$H1/.cursor/mcp.json"
assert_file "config created" "$CFG"
assert_eq "entry lives under mcpServers" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"] ? "yes" : "no"')" "yes"
assert_eq "ownership marker present" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"]._massaAiOwned')" "true"
assert_eq "command is string npx" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"].command')" "npx"
assert_eq "args[0] is -y flag" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"].args[0]')" "-y"
assert_eq "args[1] is -p flag" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"].args[1]')" "-p"
assert_eq "args[2] is package name" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"].args[2]')" "@massa-ai/mcp-client"
assert_eq "args[3] is bin name" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"].args[3]')" "massa-ai"
assert_eq "no type key for cursor" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"].type === undefined ? "absent" : "present"')" "absent"
assert_eq "env key is env" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"].env.MASSA_AI_API_URL')" "http://localhost:3333"

echo ""
echo "Scenario 2: re-running is a byte-for-byte no-op"
BEFORE="$(shasum -a 256 "$CFG" | cut -d' ' -f1)"
OUT2="$(run "$H1" cursor)"
AFTER="$(shasum -a 256 "$CFG" | cut -d' ' -f1)"
assert_eq "config unchanged" "$AFTER" "$BEFORE"
assert_contains "reported as up to date" "$OUT2" "up to date (no change)"
assert_contains "no file written" "$OUT2" "Wrote 0 file(s)"

echo ""
echo "Scenario 3: existing user keys survive the merge"
H3="$ROOT/h3"; mkdir -p "$H3/.cursor"
cat > "$H3/.cursor/mcp.json" <<'JSON'
{
  "mcpServers": {
    "other-server": { "command": ["other"], "enabled": true }
  },
  "userTopLevel": { "nested": { "deep": 42 } },
  "userArray": [1, 2, 3]
}
JSON
run "$H3" cursor >/dev/null
CFG3="$H3/.cursor/mcp.json"
assert_eq "sibling server survives" "$(jq_get "$CFG3" 'c.mcpServers["other-server"].command[0]')" "other"
assert_eq "massa-ai added alongside" "$(jq_get "$CFG3" 'c.mcpServers["massa-ai"] ? "yes" : "no"')" "yes"
assert_eq "unrelated nested key survives" "$(jq_get "$CFG3" 'c.userTopLevel.nested.deep')" "42"
assert_eq "unrelated array survives intact" "$(jq_get "$CFG3" 'c.userArray.join(",")')" "1,2,3"

echo ""
echo "Scenario 4: a backup is written before the merge"
BAK="$(find "$H3/.cursor" -name 'mcp.json.massa-ai.bak-*' | head -n1)"
assert_ne "backup file exists" "$BAK" ""
assert_contains "backup holds the pre-merge content" "$(cat "$BAK")" "other-server"
assert_not_contains "backup predates the massa-ai entry" "$(cat "$BAK")" "_massaAiOwned"

echo ""
echo "Scenario 5: opencode uses mcp / environment / bunx with explicit bin name"
H5="$ROOT/h5"
run "$H5" opencode >/dev/null
CFG5="$H5/.config/opencode/opencode.json"
assert_file "opencode config created" "$CFG5"
assert_eq "top-level key is mcp (not mcpServers)" "$(jq_get "$CFG5" 'c.mcp ? "mcp" : (c.mcpServers ? "mcpServers" : "none")')" "mcp"
# Asserted as the whole argv rather than by index, so the shape is readable and
# a stray flag cannot hide between two passing index checks. bunx has no -y —
# its flags are --bun, -p/--package, --no-install, --verbose, --silent — and -p
# is required because the bin name (massa-ai) differs from the package name.
assert_eq "opencode argv is the bunx -p form" \
  "$(jq_get "$CFG5" 'c.mcp["massa-ai"].command.join(" ")')" \
  "bunx -p @massa-ai/mcp-client massa-ai"
assert_eq "no npm-only -y flag passed to bunx" \
  "$(jq_get "$CFG5" 'c.mcp["massa-ai"].command.includes("-y") ? "present" : "absent"')" "absent"
assert_eq "env key is environment" "$(jq_get "$CFG5" 'c.mcp["massa-ai"].environment.MASSA_AI_API_URL')" "http://localhost:3333"
assert_eq "no env key present" "$(jq_get "$CFG5" 'c.mcp["massa-ai"].env === undefined ? "absent" : "present"')" "absent"

echo ""
echo "Scenario 6: opencode is skipped when the plugin is installed"
H6="$ROOT/h6"; mkdir -p "$H6/.config/opencode"
printf '{"plugin":["@massa-ai/opencode-plugin"]}\n' > "$H6/.config/opencode/opencode.json"
BEFORE6="$(shasum -a 256 "$H6/.config/opencode/opencode.json" | cut -d' ' -f1)"
OUT6="$(run "$H6" opencode)"
AFTER6="$(shasum -a 256 "$H6/.config/opencode/opencode.json" | cut -d' ' -f1)"
assert_contains "skip is explained" "$OUT6" "registers tools in-process"
assert_eq "config untouched" "$AFTER6" "$BEFORE6"

echo ""
echo "Scenario 7: opencode is NOT skipped without the plugin"
H7="$ROOT/h7"; mkdir -p "$H7/.config/opencode"
printf '{"plugin":["some-other-plugin"]}\n' > "$H7/.config/opencode/opencode.json"
run "$H7" opencode >/dev/null
assert_eq "non-plugin user still gets MCP" \
  "$(jq_get "$H7/.config/opencode/opencode.json" 'c.mcp["massa-ai"] ? "yes" : "no"')" "yes"
assert_eq "their plugin list survives" \
  "$(jq_get "$H7/.config/opencode/opencode.json" 'c.plugin.join(",")')" "some-other-plugin"

echo ""
echo "Scenario 8: --api-base lands in the entry"
H8="$ROOT/h8"
run "$H8" cursor --api-base "http://example.test:9999" >/dev/null
assert_eq "custom api base written" \
  "$(jq_get "$H8/.cursor/mcp.json" 'c.mcpServers["massa-ai"].env.MASSA_AI_API_URL')" \
  "http://example.test:9999"

echo ""
echo "Scenario 9: invalid JSON is refused rather than overwritten"
H9="$ROOT/h9"; mkdir -p "$H9/.cursor"
printf '{ this is not json\n' > "$H9/.cursor/mcp.json"
BEFORE9="$(cat "$H9/.cursor/mcp.json")"
OUT9="$(run "$H9" cursor)"; RC9=$?
assert_ne "invalid JSON is not a success" "$RC9" "0"
assert_eq "the broken file is left as-is" "$(cat "$H9/.cursor/mcp.json")" "$BEFORE9"

echo ""
echo "Scenario 10: claude-code writes to ~/.claude.json with stdio type"
H10="$ROOT/h10"
run "$H10" claude-code >/dev/null
CFG10="$H10/.claude.json"
assert_file "claude.json created" "$CFG10"
assert_eq "entry in mcpServers" "$(jq_get "$CFG10" 'c.mcpServers["massa-ai"] ? "yes" : "no"')" "yes"
assert_eq "command is string" "$(jq_get "$CFG10" 'c.mcpServers["massa-ai"].command')" "npx"
assert_eq "args has explicit bin name" "$(jq_get "$CFG10" 'c.mcpServers["massa-ai"].args[3]')" "massa-ai"
assert_eq "type is stdio" "$(jq_get "$CFG10" 'c.mcpServers["massa-ai"].type')" "stdio"

echo ""
echo "Scenario 11: claude-desktop has no type key"
H11="$ROOT/h11"
run "$H11" claude-desktop >/dev/null
CFG11="$H11/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$CFG11" ]; then
  assert_eq "command is string" "$(jq_get "$CFG11" 'c.mcpServers["massa-ai"].command')" "npx"
  assert_eq "args has explicit bin name" "$(jq_get "$CFG11" 'c.mcpServers["massa-ai"].args[3]')" "massa-ai"
  assert_eq "no type key" "$(jq_get "$CFG11" 'c.mcpServers["massa-ai"].type === undefined ? "absent" : "present"')" "absent"
else
  ok "claude-desktop skipped on non-macOS"
fi

echo ""
echo "Scenario 12: a pre-existing ~/.claude.json with other entries survives"
H12="$ROOT/h12"; mkdir -p "$H12"
printf '{"mcpServers":{"other-server":{"command":"x"}},"projects":{"key":"value"}}\n' > "$H12/.claude.json"
run "$H12" claude-code >/dev/null
CFG12="$H12/.claude.json"
assert_eq "other server survives" "$(jq_get "$CFG12" 'c.mcpServers["other-server"].command')" "x"
assert_eq "projects key survives" "$(jq_get "$CFG12" 'c.projects.key')" "value"
assert_eq "massa-ai added" "$(jq_get "$CFG12" 'c.mcpServers["massa-ai"] ? "yes" : "no"')" "yes"

echo ""
echo "Scenario 13: opencode with local symlink registration skips MCP"
H13="$ROOT/h13"; mkdir -p "$H13/.config/opencode"
printf '{"plugin":["./plugins/massa-ai/index.js"]}\n' > "$H13/.config/opencode/opencode.json"
BEFORE13="$(shasum -a 256 "$H13/.config/opencode/opencode.json" | cut -d' ' -f1)"
OUT13="$(run "$H13" opencode)"
AFTER13="$(shasum -a 256 "$H13/.config/opencode/opencode.json" | cut -d' ' -f1)"
assert_contains "skip is explained" "$OUT13" "registers tools in-process"
assert_eq "config untouched" "$AFTER13" "$BEFORE13"

summary "install-agents JSON writers"
