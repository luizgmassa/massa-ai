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

run() { bash "$INSTALLER" --target "$1" --agent "$2" --yes "${@:3}" 2>&1; }

echo "Scenario 1: cursor — creates ~/.cursor/mcp.json with an owned entry"
H1="$ROOT/h1"
run "$H1" cursor >/dev/null
CFG="$H1/.cursor/mcp.json"
assert_file "config created" "$CFG"
assert_eq "entry lives under mcpServers" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"] ? "yes" : "no"')" "yes"
assert_eq "ownership marker present" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"]._massaAiOwned')" "true"
assert_eq "launcher is npx" "$(jq_get "$CFG" 'c.mcpServers["massa-ai"].command[0]')" "npx"
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
echo "Scenario 5: opencode uses mcp / environment / bunx"
H5="$ROOT/h5"
run "$H5" opencode >/dev/null
CFG5="$H5/.config/opencode/opencode.json"
assert_file "opencode config created" "$CFG5"
assert_eq "top-level key is mcp (not mcpServers)" "$(jq_get "$CFG5" 'c.mcp ? "mcp" : (c.mcpServers ? "mcpServers" : "none")')" "mcp"
assert_eq "launcher is bunx" "$(jq_get "$CFG5" 'c.mcp["massa-ai"].command[0]')" "bunx"
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

summary "install-agents JSON writers"
