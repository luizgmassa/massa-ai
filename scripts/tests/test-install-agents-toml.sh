#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-agents-toml.sh
#
# scripts/install-agents.sh Codex TOML writer. The parser/emitter is
# hand-rolled precisely so user comments, preamble, and unrelated tables come
# through untouched — a general TOML library would reformat them away. These
# scenarios are the reason it stays hand-rolled.
#
# Usage: bash scripts/tests/test-install-agents-toml.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-agents.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-agents-toml.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

run() { bash "$INSTALLER" --target "$1" --agent codex --yes "${@:2}" 2>&1; }

echo "Scenario 1: a fresh config.toml is created with the owned table"
H1="$ROOT/h1"
run "$H1" >/dev/null
CFG="$H1/.codex/config.toml"
assert_file "config.toml created" "$CFG"
assert_eq "exactly one owned table" "$(grep -c '^\[mcp_servers.massa-ai\]$' "$CFG")" "1"
assert_contains "command written" "$(cat "$CFG")" 'command = "npx"'
assert_contains "args written" "$(cat "$CFG")" 'args = ["@massa-ai/mcp-client"]'
assert_contains "env written" "$(cat "$CFG")" 'MASSA_AI_API_URL = "http://localhost:3333"'
assert_contains "ownership marker written" "$(cat "$CFG")" '_massaAiOwned = true'

echo ""
echo "Scenario 2: preamble, comments, and user tables survive"
H2="$ROOT/h2"; mkdir -p "$H2/.codex"
cat > "$H2/.codex/config.toml" <<'TOML'
model = "gpt-5"
approval_policy = "on-request"

# keep me — a user comment
[user_settings]
theme = "dark"
# an inline comment inside a user table
font = "Berkeley Mono"

[mcp_servers.someone-elses-server]
command = "their-binary"
TOML
ORIGINAL="$(cat "$H2/.codex/config.toml")"
run "$H2" >/dev/null
CFG2="$H2/.codex/config.toml"
assert_contains "top-level key survives" "$(cat "$CFG2")" 'model = "gpt-5"'
assert_contains "second top-level key survives" "$(cat "$CFG2")" 'approval_policy = "on-request"'
assert_contains "preamble comment survives" "$(cat "$CFG2")" '# keep me — a user comment'
assert_contains "user table survives" "$(cat "$CFG2")" '[user_settings]'
assert_contains "user table value survives" "$(cat "$CFG2")" 'theme = "dark"'
assert_contains "in-table comment survives" "$(cat "$CFG2")" '# an inline comment inside a user table'
assert_contains "foreign mcp server survives" "$(cat "$CFG2")" '[mcp_servers.someone-elses-server]'
assert_contains "foreign server body survives" "$(cat "$CFG2")" 'command = "their-binary"'
assert_contains "our table added" "$(cat "$CFG2")" '[mcp_servers.massa-ai]'

echo ""
echo "Scenario 3: re-running adds no second table and changes no bytes"
BEFORE="$(shasum -a 256 "$CFG2" | cut -d' ' -f1)"
OUT3="$(run "$H2")"
AFTER="$(shasum -a 256 "$CFG2" | cut -d' ' -f1)"
assert_eq "file unchanged" "$AFTER" "$BEFORE"
assert_eq "still exactly one owned table" "$(grep -c '^\[mcp_servers.massa-ai\]$' "$CFG2")" "1"
assert_contains "reported as up to date" "$OUT3" "up to date (no change)"

echo ""
echo "Scenario 4: a changed --api-base rewrites only our table"
run "$H2" --api-base "http://127.0.0.1:4444" >/dev/null
assert_contains "new api base written" "$(cat "$CFG2")" 'MASSA_AI_API_URL = "http://127.0.0.1:4444"'
assert_eq "still exactly one owned table" "$(grep -c '^\[mcp_servers.massa-ai\]$' "$CFG2")" "1"
assert_contains "user comment still there" "$(cat "$CFG2")" '# keep me — a user comment'

echo ""
echo "Scenario 5: uninstall restores the user's content"
run "$H2" --uninstall >/dev/null
assert_eq "owned table removed" "$(grep -c '^\[mcp_servers.massa-ai\]$' "$CFG2")" "0"
assert_contains "user comment survives uninstall" "$(cat "$CFG2")" '# keep me — a user comment'
assert_contains "user table survives uninstall" "$(cat "$CFG2")" '[user_settings]'
assert_contains "foreign mcp server survives uninstall" "$(cat "$CFG2")" '[mcp_servers.someone-elses-server]'
assert_contains "preamble survives uninstall" "$(cat "$CFG2")" 'model = "gpt-5"'

echo ""
echo "Scenario 6: an unmarked [mcp_servers.massa-ai] table is left alone"
H6="$ROOT/h6"; mkdir -p "$H6/.codex"
cat > "$H6/.codex/config.toml" <<'TOML'
[mcp_servers.massa-ai]
command = "my-own-build"
TOML
OUT6="$(run "$H6" --uninstall)"
assert_contains "refusal is explained" "$OUT6" "not massa-ai-owned"
assert_contains "hand-written table survives" "$(cat "$H6/.codex/config.toml")" 'command = "my-own-build"'

echo ""
echo "Scenario 7: a backup exists before the first write"
BAK="$(find "$H2/.codex" -name 'config.toml.massa-ai.bak-*' | head -n1)"
assert_ne "backup file created" "$BAK" ""

summary "install-agents TOML writer"
