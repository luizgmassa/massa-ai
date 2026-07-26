#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-agents-uninstall.sh
#
# scripts/install-agents.sh --uninstall ownership rules for the JSON writers:
# only entries carrying _massaAiOwned: true are removed, the servers object is
# dropped when it empties, and a hand-written "massa-ai" entry survives.
#
# Usage: bash scripts/tests/test-install-agents-uninstall.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-agents.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-agents-uninstall.XXXXXX")"
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

install()   { bash "$INSTALLER" --target "$1" --agent "$2" --mcp-source npx --yes 2>&1; }
uninstall() { bash "$INSTALLER" --target "$1" --agent "$2" --mcp-source npx --yes --uninstall 2>&1; }

echo "Scenario 1: our entry is removed and the empty servers object goes with it"
H1="$ROOT/h1"
install "$H1" cursor >/dev/null
OUT="$(uninstall "$H1" cursor)"; RC=$?
CFG="$H1/.cursor/mcp.json"
assert_eq "uninstall exits 0" "$RC" "0"
assert_eq "massa-ai entry gone" "$(jq_get "$CFG" 'c.mcpServers && c.mcpServers["massa-ai"] ? "present" : "gone"')" "gone"
assert_eq "empty mcpServers object dropped" "$(jq_get "$CFG" 'c.mcpServers === undefined ? "dropped" : "kept"')" "dropped"

echo ""
echo "Scenario 2: a sibling server keeps the servers object alive"
H2="$ROOT/h2"; mkdir -p "$H2/.cursor"
printf '{"mcpServers":{"other":{"command":["z"]}},"theme":"dark"}\n' > "$H2/.cursor/mcp.json"
install "$H2" cursor >/dev/null
uninstall "$H2" cursor >/dev/null
CFG2="$H2/.cursor/mcp.json"
assert_eq "sibling server survives" "$(jq_get "$CFG2" 'c.mcpServers.other.command[0]')" "z"
assert_eq "massa-ai entry gone" "$(jq_get "$CFG2" 'c.mcpServers["massa-ai"] === undefined ? "gone" : "present"')" "gone"
assert_eq "unrelated top-level key survives" "$(jq_get "$CFG2" 'c.theme')" "dark"

echo ""
echo "Scenario 3: a hand-written, unmarked massa-ai entry is NOT removed"
H3="$ROOT/h3"; mkdir -p "$H3/.cursor"
printf '{"mcpServers":{"massa-ai":{"command":["my-own-mcp-build"],"enabled":true}}}\n' > "$H3/.cursor/mcp.json"
BEFORE3="$(shasum -a 256 "$H3/.cursor/mcp.json" | cut -d' ' -f1)"
OUT3="$(uninstall "$H3" cursor)"
AFTER3="$(shasum -a 256 "$H3/.cursor/mcp.json" | cut -d' ' -f1)"
assert_contains "refusal is explained" "$OUT3" "not massa-ai-owned"
assert_eq "file untouched" "$AFTER3" "$BEFORE3"
assert_eq "their command survives" "$(jq_get "$H3/.cursor/mcp.json" 'c.mcpServers["massa-ai"].command[0]')" "my-own-mcp-build"

echo ""
echo "Scenario 4: uninstall with nothing to remove is a clean no-op"
H4="$ROOT/h4"; mkdir -p "$H4/.cursor"
printf '{"mcpServers":{"other":{"command":["z"]}}}\n' > "$H4/.cursor/mcp.json"
BEFORE4="$(shasum -a 256 "$H4/.cursor/mcp.json" | cut -d' ' -f1)"
OUT4="$(uninstall "$H4" cursor)"; RC4=$?
AFTER4="$(shasum -a 256 "$H4/.cursor/mcp.json" | cut -d' ' -f1)"
assert_eq "exits 0" "$RC4" "0"
assert_contains "nothing-to-remove reported" "$OUT4" "nothing to remove"
assert_eq "no write, no backup churn" "$AFTER4" "$BEFORE4"
assert_contains "no backup created" "$OUT4" "0 backup(s) created"

echo ""
echo "Scenario 5: opencode uninstall targets the mcp key, not mcpServers"
H5="$ROOT/h5"
install "$H5" opencode >/dev/null
uninstall "$H5" opencode >/dev/null
assert_eq "opencode entry gone" \
  "$(jq_get "$H5/.config/opencode/opencode.json" 'c.mcp === undefined ? "gone" : "present"')" "gone"

echo ""
echo "Scenario 6: a backup is taken before the removal write"
H6="$ROOT/h6"
install "$H6" cursor >/dev/null
find "$H6/.cursor" -name 'mcp.json.massa-ai.bak-*' -delete
uninstall "$H6" cursor >/dev/null
BAK="$(find "$H6/.cursor" -name 'mcp.json.massa-ai.bak-*' | head -n1)"
assert_ne "removal created a backup" "$BAK" ""
assert_contains "backup still holds the entry that was removed" "$(cat "$BAK")" "_massaAiOwned"

echo ""
echo "Scenario 7: legacy owned entry in settings.json is removed during apply"
H7="$ROOT/h7"; mkdir -p "$H7/.claude"
printf '{"mcpServers":{"massa-ai":{"command":"npx","args":["-y","-p","@massa-ai/mcp-client","massa-ai"],"env":{},"_massaAiOwned":true}},"userKey":"keep"}\n' > "$H7/.claude/settings.json"
install "$H7" claude-code >/dev/null
assert_eq "legacy settings.json entry removed" "$(jq_get "$H7/.claude/settings.json" 'c.mcpServers === undefined ? "gone" : "present"')" "gone"
assert_eq "user key survives" "$(jq_get "$H7/.claude/settings.json" 'c.userKey')" "keep"
assert_eq "new .claude.json has the entry" "$(jq_get "$H7/.claude.json" 'c.mcpServers["massa-ai"] ? "yes" : "no"')" "yes"
BAK7="$(find "$H7/.claude" -name 'settings.json.massa-ai.bak-*' | head -n1)"
assert_ne "backup created for migration" "$BAK7" ""

echo ""
echo "Scenario 8: hand-written entry in settings.json is preserved"
H8="$ROOT/h8"; mkdir -p "$H8/.claude"
printf '{"mcpServers":{"massa-ai":{"command":"my-mcp"}},"userKey":"keep"}\n' > "$H8/.claude/settings.json"
install "$H8" claude-code >/dev/null
assert_eq "hand-written entry survives" "$(jq_get "$H8/.claude/settings.json" 'c.mcpServers["massa-ai"].command')" "my-mcp"
assert_eq "new .claude.json has owned entry" "$(jq_get "$H8/.claude.json" 'c.mcpServers["massa-ai"]._massaAiOwned')" "true"

summary "install-agents --uninstall"
