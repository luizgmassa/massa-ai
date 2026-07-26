#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-agents-mcp-source.sh
#
# scripts/install-agents.sh --mcp-source flag: auto vs local vs npx,
# environment variable precedence, and correct command generation.
#
# Usage: bash scripts/tests/test-install-agents-mcp-source.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-agents.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-agents-mcp-source.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

jq_get() { # jq_get FILE EXPR
  "$RUNNER" - "$1" "$2" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const v = eval(process.argv[3]);
process.stdout.write(typeof v === "object" ? JSON.stringify(v) : String(v));
NODE
}

run() { bash "$INSTALLER" --target "$1" --agent "$2" --yes "${@:3}" 2>&1; }

echo "Scenario 1: --mcp-source npx produces npx command for all hosts"
H1="$ROOT/h1"
run "$H1" cursor --mcp-source npx >/dev/null
CFG1="$H1/.cursor/mcp.json"
assert_eq "cursor: command is npx" "$(jq_get "$CFG1" 'c.mcpServers["massa-ai"].command')" "npx"
assert_eq "cursor: args[3] is bin name" "$(jq_get "$CFG1" 'c.mcpServers["massa-ai"].args[3]')" "massa-ai"

H1B="$ROOT/h1b"
run "$H1B" claude-code --mcp-source npx >/dev/null
CFG1B="$H1B/.claude.json"
assert_eq "claude-code: command is npx" "$(jq_get "$CFG1B" 'c.mcpServers["massa-ai"].command')" "npx"
assert_eq "claude-code: args[3] is bin name" "$(jq_get "$CFG1B" 'c.mcpServers["massa-ai"].args[3]')" "massa-ai"

H1C="$ROOT/h1c"
run "$H1C" opencode --mcp-source npx >/dev/null
CFG1C="$H1C/.config/opencode/opencode.json"
assert_eq "opencode: launcher bunx at index 0" "$(jq_get "$CFG1C" 'c.mcp["massa-ai"].command[0]')" "bunx"
assert_eq "opencode: argv is the bunx -p form" \
  "$(jq_get "$CFG1C" 'c.mcp["massa-ai"].command.join(" ")')" \
  "bunx -p @massa-ai/mcp-client massa-ai"

echo ""
echo "Scenario 2: --mcp-source local produces local path for all hosts"
if [ -f "$PROJECT_ROOT/apps/mcp-client/src/index.ts" ]; then
  H2="$ROOT/h2"
  run "$H2" cursor --mcp-source local >/dev/null
  CFG2="$H2/.cursor/mcp.json"
  CMD2="$(jq_get "$CFG2" 'c.mcpServers["massa-ai"].command')"
  assert_eq "cursor: command is bun" "$CMD2" "bun"
  ARGS2="$(jq_get "$CFG2" 'c.mcpServers["massa-ai"].args[0]')"
  assert_eq "cursor: args[0] is run" "$ARGS2" "run"
  PATH2="$(jq_get "$CFG2" 'c.mcpServers["massa-ai"].args[1]')"
  assert_contains "cursor: args[1] contains /apps/mcp-client/src/index.ts" "$PATH2" "/apps/mcp-client/src/index.ts"

  H2B="$ROOT/h2b"
  run "$H2B" opencode --mcp-source local >/dev/null
  CFG2B="$H2B/.config/opencode/opencode.json"
  assert_eq "opencode: launcher bun at index 0" "$(jq_get "$CFG2B" 'c.mcp["massa-ai"].command[0]')" "bun"
  assert_eq "opencode: run at index 1" "$(jq_get "$CFG2B" 'c.mcp["massa-ai"].command[1]')" "run"
  PATH2B="$(jq_get "$CFG2B" 'c.mcp["massa-ai"].command[2]')"
  assert_contains "opencode: args[2] contains /apps/mcp-client/src/index.ts" "$PATH2B" "/apps/mcp-client/src/index.ts"
else
  echo "  skipped: apps/mcp-client/src/index.ts not found"
fi

echo ""
echo "Scenario 3: auto picks local when src exists, npx otherwise"
if [ -f "$PROJECT_ROOT/apps/mcp-client/src/index.ts" ]; then
  H3="$ROOT/h3"
  run "$H3" cursor --mcp-source auto >/dev/null
  CFG3="$H3/.cursor/mcp.json"
  assert_eq "auto → local: command is bun" "$(jq_get "$CFG3" 'c.mcpServers["massa-ai"].command')" "bun"
else
  echo "  skipped: apps/mcp-client/src/index.ts not found"
fi

echo ""
echo "Scenario 4: MASSA_AI_MCP_SOURCE env var is honored"
H4="$ROOT/h4"
MASSA_AI_MCP_SOURCE=npx run "$H4" cursor >/dev/null
CFG4="$H4/.cursor/mcp.json"
assert_eq "env var sets npx" "$(jq_get "$CFG4" 'c.mcpServers["massa-ai"].command')" "npx"

echo ""
echo "Scenario 5: --mcp-source flag overrides MASSA_AI_MCP_SOURCE env"
H5="$ROOT/h5"
MASSA_AI_MCP_SOURCE=npx run "$H5" cursor --mcp-source npx >/dev/null
CFG5="$H5/.cursor/mcp.json"
assert_eq "flag overrides env" "$(jq_get "$CFG5" 'c.mcpServers["massa-ai"].command')" "npx"

echo ""
echo "Scenario 6: switching from npx to local (or vice versa) rewrites the entry"
H6="$ROOT/h6"
run "$H6" cursor --mcp-source npx >/dev/null
CFG6="$H6/.cursor/mcp.json"
assert_eq "initial: npx" "$(jq_get "$CFG6" 'c.mcpServers["massa-ai"].command')" "npx"

if [ -f "$PROJECT_ROOT/apps/mcp-client/src/index.ts" ]; then
  run "$H6" cursor --mcp-source local >/dev/null
  assert_eq "after switch: bun" "$(jq_get "$CFG6" 'c.mcpServers["massa-ai"].command')" "bun"

  run "$H6" cursor --mcp-source npx >/dev/null
  assert_eq "back to npx" "$(jq_get "$CFG6" 'c.mcpServers["massa-ai"].command')" "npx"
else
  echo "  skipped local→npx part: apps/mcp-client/src/index.ts not found"
fi

echo ""
echo "Scenario 7: Codex (TOML) respects --mcp-source"
H7="$ROOT/h7"
run "$H7" codex --mcp-source npx >/dev/null
CFG7="$H7/.codex/config.toml"
assert_contains "codex: npx command written" "$(cat "$CFG7")" 'command = "npx"'

if [ -f "$PROJECT_ROOT/apps/mcp-client/src/index.ts" ]; then
  H7B="$ROOT/h7b"
  run "$H7B" codex --mcp-source local >/dev/null
  CFG7B="$H7B/.codex/config.toml"
  assert_contains "codex: bun command written" "$(cat "$CFG7B")" 'command = "bun"'
  assert_contains "codex: local path in args" "$(cat "$CFG7B")" '/apps/mcp-client/src/index.ts'
fi

echo ""
echo "Scenario 8: local path is absolute and exists"
if [ -f "$PROJECT_ROOT/apps/mcp-client/src/index.ts" ]; then
  H8="$ROOT/h8"
  run "$H8" cursor --mcp-source local >/dev/null
  CFG8="$H8/.cursor/mcp.json"
  PATH8="$(jq_get "$CFG8" 'c.mcpServers["massa-ai"].args[1]')"
  # Check it starts with /
  case "$PATH8" in
    /*) ;;
    *) err "Local path is not absolute: $PATH8"; exit 1 ;;
  esac
  # Check it contains the expected suffix
  assert_contains "path contains /apps/mcp-client/src/index.ts" "$PATH8" "/apps/mcp-client/src/index.ts"
fi

summary "install-agents --mcp-source"
