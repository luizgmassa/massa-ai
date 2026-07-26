#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-agents-cli.sh
#
# scripts/install-agents.sh CLI contract: flags, exit codes (2 for bad input,
# 13 for the consent gate), --agent narrowing, and --dry-run as a true
# read-only export (no writes, no backups).
#
# Usage: bash scripts/tests/test-install-agents-cli.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-agents.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-agents-cli.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

rc_of() { "$@" >/dev/null 2>&1; echo $?; }

jq_get() { # jq_get FILE EXPR
  "$RUNNER" - "$1" "$2" <<'NODE'
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const v = eval(process.argv[3]);
process.stdout.write(typeof v === "object" ? JSON.stringify(v) : String(v));
NODE
}

echo "Scenario 1: --help exits 0 and documents the flags"
HELP="$(bash "$INSTALLER" --help 2>&1)"
assert_eq "--help exits 0" "$(rc_of bash "$INSTALLER" --help)" "0"
assert_eq "-h exits 0" "$(rc_of bash "$INSTALLER" -h)" "0"
for FLAG in --dry-run --uninstall --agent --target --api-base --yes; do
  assert_contains "help documents $FLAG" "$HELP" "$FLAG"
done
for AGENT in claude-code claude-desktop codex cursor opencode; do
  assert_contains "help lists $AGENT" "$HELP" "$AGENT"
done

echo ""
echo "Scenario 2: bad input exits 2"
assert_eq "unknown flag exits 2" "$(rc_of bash "$INSTALLER" --bogus)" "2"
assert_eq "unknown agent exits 2" "$(rc_of bash "$INSTALLER" --agent windsurf)" "2"
BAD="$(bash "$INSTALLER" --agent windsurf 2>&1)"
assert_contains "unknown agent names the valid set" "$BAD" "claude-code, claude-desktop, codex, cursor, opencode"

echo ""
echo "Scenario 3: the consent gate exits 13 for the real \$HOME"
RC3="$(bash "$INSTALLER" --agent codex </dev/null >/dev/null 2>&1; echo $?)"
assert_eq "consent refusal exits 13" "$RC3" "13"
OUT3="$(bash "$INSTALLER" --agent codex </dev/null 2>&1)"
assert_contains "message is tagged [consent]" "$OUT3" "[consent]"
assert_contains "message names the escape hatch" "$OUT3" "--yes"

echo ""
echo "Scenario 4: --dry-run writes nothing, creates no backup, needs no consent"
H4="$ROOT/h4"; mkdir -p "$H4"
BEFORE="$(tree_fingerprint "$H4")"
OUT4="$(bash "$INSTALLER" --target "$H4" --dry-run 2>&1)"; RC4=$?
AFTER="$(tree_fingerprint "$H4")"
assert_eq "dry-run exits 0" "$RC4" "0"
assert_eq "dry-run wrote nothing" "$AFTER" "$BEFORE"
assert_contains "dry-run says so" "$OUT4" "Dry run — wrote 0 files, 0 backups."
assert_eq "no backup files anywhere" "$(find "$H4" -name '*.massa-ai.bak-*' | wc -l | tr -d ' ')" "0"
RC4B="$(bash "$INSTALLER" --dry-run </dev/null >/dev/null 2>&1; echo $?)"
assert_ne "dry-run on the real HOME is not a consent refusal" "$RC4B" "13"

echo ""
echo "Scenario 5: --agent narrows the run to one host"
H5="$ROOT/h5"
bash "$INSTALLER" --target "$H5" --agent codex --yes >/dev/null 2>&1
assert_file "codex config written" "$H5/.codex/config.toml"
assert_no_file "cursor config not touched" "$H5/.cursor/mcp.json"
assert_no_file "claude config not touched" "$H5/.claude/settings.json"
assert_no_file "opencode config not touched" "$H5/.config/opencode/opencode.json"

echo ""
echo "Scenario 6: with no --agent, every applicable host is written"
H6="$ROOT/h6"
bash "$INSTALLER" --target "$H6" --yes >/dev/null 2>&1
assert_file "claude-code written" "$H6/.claude.json"
assert_file "codex written" "$H6/.codex/config.toml"
assert_file "cursor written" "$H6/.cursor/mcp.json"
assert_file "opencode written" "$H6/.config/opencode/opencode.json"
if [ "$(uname -s)" = "Darwin" ]; then
  assert_file "claude-desktop written on macOS" \
    "$H6/Library/Application Support/Claude/claude_desktop_config.json"
else
  assert_no_file "claude-desktop skipped off macOS" \
    "$H6/Library/Application Support/Claude/claude_desktop_config.json"
fi

echo ""
echo "Scenario 7: the run summary counts writes and backups"
H7="$ROOT/h7"
OUT7="$(bash "$INSTALLER" --target "$H7" --agent cursor --yes 2>&1)"
assert_contains "one file written" "$OUT7" "Wrote 1 file(s); 1 backup(s) created."
OUT7B="$(bash "$INSTALLER" --target "$H7" --agent cursor --yes 2>&1)"
assert_contains "idempotent re-run writes nothing" "$OUT7B" "Wrote 0 file(s); 0 backup(s) created."

echo ""
echo "Scenario 8: the single-writer statement is printed on a real write"
assert_contains "ownership is stated" "$OUT7" "MCP registration is owned by this script"
assert_not_contains "the old 'skip this step' advice is gone" "$OUT7" "skip this install-agents step"

echo ""
echo "Scenario 9: --mcp-source validation rejects invalid values"
assert_eq "invalid source exits 2" "$(rc_of bash "$INSTALLER" --mcp-source bogus)" "2"
BAD_SOURCE="$(bash "$INSTALLER" --mcp-source bogus 2>&1)"
assert_contains "error message names valid sources" "$BAD_SOURCE" "local, npx, auto"

echo ""
echo "Scenario 10: --mcp-source is honored when specified"
H10="$ROOT/h10"
OUT10="$(bash "$INSTALLER" --target "$H10" --agent cursor --mcp-source npx --yes 2>&1)"
CFG10="$H10/.cursor/mcp.json"
assert_file "config written" "$CFG10"
# With npx source, command should be "npx"
CMD10="$(jq_get "$CFG10" 'c.mcpServers["massa-ai"].command')"
assert_eq "npx source produces npx command" "$CMD10" "npx"

echo ""
echo "Scenario 11: MASSA_AI_MCP_SOURCE env var is honored"
H11="$ROOT/h11"
OUT11="$(MASSA_AI_MCP_SOURCE=npx bash "$INSTALLER" --target "$H11" --agent cursor --yes 2>&1)"
CFG11="$H11/.cursor/mcp.json"
assert_file "config written" "$CFG11"
CMD11="$(jq_get "$CFG11" 'c.mcpServers["massa-ai"].command')"
assert_eq "env var honored" "$CMD11" "npx"

echo ""
echo "Scenario 12: flag --mcp-source overrides env var"
H12="$ROOT/h12"
OUT12="$(MASSA_AI_MCP_SOURCE=npx bash "$INSTALLER" --target "$H12" --agent cursor --mcp-source npx --yes 2>&1)"
CFG12="$H12/.cursor/mcp.json"
CMD12="$(jq_get "$CFG12" 'c.mcpServers["massa-ai"].command')"
assert_eq "flag overrides env" "$CMD12" "npx"

summary "install-agents CLI"
