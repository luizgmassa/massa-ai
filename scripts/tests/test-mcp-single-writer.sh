#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-mcp-single-writer.sh
#
# Regression guard for the MCP single-writer rule.
#
# Before this change there were four sources of truth for the massa-ai MCP
# entry — two inert plugin-local files, a settings template, and the real
# installer — plus three messages telling users to skip the real one. This
# suite fails if any of that comes back.
#
# Usage: bash scripts/tests/test-mcp-single-writer.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-single-writer.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

echo "Scenario 1: no plugin ships an MCP file any more"
assert_no_file "codex plugin has no .mcp.json" "$PROJECT_ROOT/apps/codex-plugin/.mcp.json"
assert_no_file "cursor plugin has no mcp.json" "$PROJECT_ROOT/apps/cursor-plugin/mcp.json"

echo ""
echo "Scenario 2: no plugin installer copies an MCP file"
for host in claude codex cursor; do
  SRC="$(cat "$PROJECT_ROOT/apps/${host}-plugin/install.sh")"
  assert_not_contains "${host}: no \$SCRIPT_DIR/.mcp.json copy" "$SRC" 'cp "$SCRIPT_DIR/.mcp.json"'
  assert_not_contains "${host}: no \$SCRIPT_DIR/mcp.json copy" "$SRC" 'cp "$SCRIPT_DIR/mcp.json"'
done

echo ""
echo "Scenario 3: every plugin installer delegates to install-agents.sh"
for pair in "claude:claude-code" "codex:codex" "cursor:cursor" "opencode:opencode"; do
  host="${pair%%:*}"; agent="${pair##*:}"
  SRC="$(cat "$PROJECT_ROOT/apps/${host}-plugin/install.sh")"
  assert_contains "${host}: calls scripts/install-agents.sh" "$SRC" "scripts/install-agents.sh"
  assert_contains "${host}: passes --agent ${agent}" "$SRC" "--agent ${agent}"
done

echo ""
echo "Scenario 4: the old 'skip MCP' advice is gone everywhere"
for host in claude codex cursor opencode; do
  SRC="$(cat "$PROJECT_ROOT/apps/${host}-plugin/install.sh")"
  assert_not_contains "${host}: no 'skip MCP' advice" "$SRC" "skip MCP"
  assert_not_contains "${host}: no 'skip this install-agents step' advice" "$SRC" "skip this install-agents step"
  assert_not_contains "${host}: no stale install-agents.ts reference" "$SRC" "install-agents.ts"
done
AGENTS_SRC="$(cat "$PROJECT_ROOT/scripts/install-agents.sh")"
assert_not_contains "installer itself gives no skip advice" "$AGENTS_SRC" "skip this install-agents step"

echo ""
echo "Scenario 5: the codex manifest declares no mcp pointer"
HAS_MCP="$("$RUNNER" - "$PROJECT_ROOT/apps/codex-plugin/.codex-plugin/plugin.json" <<'NODE'
const fs = require("fs");
const m = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write("mcp" in m ? "yes" : "no");
NODE
)"
assert_eq "no manifest mcp pointer" "$HAS_MCP" "no"

echo ""
echo "Scenario 6: the Claude settings template declares no MCP block"
TPL="$PROJECT_ROOT/apps/claude-plugin/settings.json.template"
if [ -f "$TPL" ]; then
  assert_not_contains "template has no mcpServers block" "$(cat "$TPL")" '"mcpServers"'
else
  ok "settings.json.template not present (nothing to guard)"
fi

echo ""
echo "Scenario 7: a real codex plugin install produces exactly one registration"
H7="$ROOT/h7"; mkdir -p "$H7"
HOME="$H7" bash "$PROJECT_ROOT/apps/codex-plugin/install.sh" --user >/dev/null 2>&1
RC7=$?
assert_eq "plugin install exits 0" "$RC7" "0"
assert_no_file "no plugin-local .mcp.json written" "$H7/.codex/plugins/massa-ai/.mcp.json"
assert_file "config.toml written" "$H7/.codex/config.toml"
assert_eq "exactly one [mcp_servers.massa-ai] table" \
  "$(grep -c '^\[mcp_servers.massa-ai\]$' "$H7/.codex/config.toml")" "1"

echo ""
echo "Scenario 8: reinstalling does not add a second registration"
HOME="$H7" bash "$PROJECT_ROOT/apps/codex-plugin/install.sh" --user >/dev/null 2>&1
assert_eq "still exactly one table after reinstall" \
  "$(grep -c '^\[mcp_servers.massa-ai\]$' "$H7/.codex/config.toml")" "1"

echo ""
echo "Scenario 9: a stale plugin-local .mcp.json from an older install is cleaned up"
mkdir -p "$H7/.codex/plugins/massa-ai"
printf '{"mcpServers":{"massa-ai":{}}}\n' > "$H7/.codex/plugins/massa-ai/.mcp.json"
OUT9="$(HOME="$H7" bash "$PROJECT_ROOT/apps/codex-plugin/install.sh" --user 2>&1)"
assert_no_file "stale file removed on reinstall" "$H7/.codex/plugins/massa-ai/.mcp.json"
assert_contains "removal is reported" "$OUT9" "removed stale .mcp.json"

echo ""
echo "Scenario 10: the same holds for cursor"
H10="$ROOT/h10"; mkdir -p "$H10/.cursor/plugins/massa-ai"
printf '{"mcpServers":{"massa-ai":{}}}\n' > "$H10/.cursor/plugins/massa-ai/mcp.json"
HOME="$H10" bash "$PROJECT_ROOT/apps/cursor-plugin/install.sh" --user >/dev/null 2>&1
assert_no_file "stale cursor mcp.json removed" "$H10/.cursor/plugins/massa-ai/mcp.json"
assert_file "~/.cursor/mcp.json written instead" "$H10/.cursor/mcp.json"
assert_eq "exactly one massa-ai entry" \
  "$("$RUNNER" - "$H10/.cursor/mcp.json" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(String(Object.keys(c.mcpServers || {}).filter((k) => k === "massa-ai").length));
NODE
)" "1"

echo ""
echo "Scenario 11: install-agents.sh writes the opencode MCP entry regardless of plugin listing form (PAU-02)"
for form in npm local bare; do
  H11="$ROOT/h11-$form"; mkdir -p "$H11/.config/opencode"
  case "$form" in
    npm)   PLUGIN_LISTING='"@massa-ai/opencode-plugin"' ;;
    local) PLUGIN_LISTING='"./plugins/massa-ai/index.js"' ;;
    bare)  PLUGIN_LISTING='"massa-ai"' ;;
  esac
  printf '{"plugin": [%s]}\n' "$PLUGIN_LISTING" > "$H11/.config/opencode/opencode.json"
  OUT11="$(bash "$PROJECT_ROOT/scripts/install-agents.sh" --agent opencode --target "$H11" --yes 2>&1)"
  RC11=$?
  assert_eq "$form form: install-agents.sh exits 0" "$RC11" "0"
  assert_eq "$form form: mcp.massa-ai entry written" \
    "$("$RUNNER" - "$H11/.config/opencode/opencode.json" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(String(Boolean(c.mcp && c.mcp["massa-ai"])));
NODE
)" "true"
  assert_not_contains "$form form: no skip message printed" "$OUT11" "skipped: @massa-ai/opencode-plugin"
done

echo ""
echo "Scenario 12: install-agents.sh header no longer claims the opencode presence skip"
assert_not_contains "installer header: no opencode-skip claim" "$AGENTS_SRC" "OpenCode MCP registration is skipped when"

echo ""
echo "Scenario 13: opencode plugin install registers exactly one MCP entry; uninstall preserves it (PAU-01, PAU-03, PAU-04)"
OPENCODE_SRC="$(cat "$PROJECT_ROOT/apps/opencode-plugin/install.sh")"
# Distinguishes an actual reachable invocation (which always carried --yes) from
# printed user-facing guidance recommending the same command by hand.
assert_not_contains "opencode: install path never calls --agent opencode --uninstall" "$OPENCODE_SRC" "--agent opencode --uninstall --yes"

H13="$ROOT/h13"; mkdir -p "$H13"
OUT13="$(HOME="$H13" bash "$PROJECT_ROOT/apps/opencode-plugin/install.sh" --user 2>&1)"
RC13=$?
assert_eq "opencode plugin install exits 0" "$RC13" "0"
CFG13="$H13/.config/opencode/opencode.jsonc"
assert_file "opencode.jsonc written" "$CFG13"
assert_eq "exactly one massa-ai mcp entry after install" \
  "$("$RUNNER" - "$CFG13" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(String(Boolean(c.mcp && c.mcp["massa-ai"])));
NODE
)" "true"

HOME="$H13" bash "$PROJECT_ROOT/apps/opencode-plugin/install.sh" --uninstall >/dev/null 2>&1
assert_eq "MCP entry survives opencode plugin uninstall" \
  "$("$RUNNER" - "$CFG13" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(String(Boolean(c.mcp && c.mcp["massa-ai"])));
NODE
)" "true"
assert_eq "opencode plugin entry removed by uninstall" \
  "$("$RUNNER" - "$CFG13" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const plugins = Array.isArray(c.plugin) ? c.plugin : [];
process.stdout.write(String(plugins.includes("./plugins/massa-ai/index.js")));
NODE
)" "false"

summary "MCP single writer"
