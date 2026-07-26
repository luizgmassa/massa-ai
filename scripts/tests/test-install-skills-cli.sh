#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-skills-cli.sh
#
# scripts/install-skills.sh CLI contract: every flag, every documented exit
# code, the --json result shape, and the real-$HOME consent gate.
#
# Usage: bash scripts/tests/test-install-skills-cli.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-skills.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-skills-cli.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

REAL_PATH="$PATH"
export PATH="$(make_mock_agents "$ROOT/bin"):$PATH"

rc_of() { "$@" >/dev/null 2>&1; echo $?; }

echo "Scenario 1: --help exits 0 and documents the flags"
HELP="$(bash "$INSTALLER" --help 2>&1)"
assert_eq "--help exits 0" "$(rc_of bash "$INSTALLER" --help)" "0"
assert_eq "-h exits 0" "$(rc_of bash "$INSTALLER" -h)" "0"
for FLAG in --apply --uninstall --dry-run --check --quiet --verbose --platform --target --repo-root --yes --json; do
  assert_contains "help documents $FLAG" "$HELP" "$FLAG"
done

echo ""
echo "Scenario 2: bad input exits 2"
assert_eq "unknown flag exits 2" "$(rc_of bash "$INSTALLER" --bogus)" "2"
assert_eq "unknown platform exits 2" "$(rc_of bash "$INSTALLER" --platform vscode)" "2"
BAD="$(bash "$INSTALLER" --platform vscode 2>&1)"
assert_contains "unknown platform names the valid set" "$BAD" "claude, codex, cursor, opencode, all"

echo ""
echo "Scenario 3: no agent tool on PATH exits 2 (apply only)"
H3="$ROOT/h3"; mkdir -p "$H3"
EMPTY_BIN="$ROOT/empty-bin"; mkdir -p "$EMPTY_BIN"
# Keep the runner reachable, drop the agent mocks.
NODE_DIR="$(dirname "$(command -v node || command -v bun)")"
OUT3="$(PATH="$EMPTY_BIN:$NODE_DIR:/usr/bin:/bin" bash "$INSTALLER" --apply --platform all \
  --target "$H3" --repo-root "$PROJECT_ROOT" --yes 2>&1)"
RC3=$?
assert_eq "no tools exits 2" "$RC3" "2"
assert_contains "reason is reported" "$OUT3" "No requested agent tools are installed."

echo ""
echo "Scenario 4: --check runs for every platform even when no tool is on PATH"
RC4="$(PATH="$EMPTY_BIN:$NODE_DIR:/usr/bin:/bin" bash "$INSTALLER" --check --platform all \
  --target "$H3" --repo-root "$PROJECT_ROOT" >/dev/null 2>&1; echo $?)"
assert_eq "check on a bare home reports drift (exit 1)" "$RC4" "1"

echo ""
echo "Scenario 5: writing the real \$HOME without --yes exits 1"
RC5="$(bash "$INSTALLER" --apply --platform claude </dev/null >/dev/null 2>&1; echo $?)"
assert_eq "consent gate exits 1" "$RC5" "1"
OUT5="$(bash "$INSTALLER" --apply --platform claude </dev/null 2>&1)"
assert_contains "consent message names the escape hatch" "$OUT5" "--yes"

echo ""
echo "Scenario 6: --dry-run and --check need no consent for the real \$HOME"
# Assert on the gate, not the exit code: a developer's real state file could
# fail for unrelated reasons, and that is not what this scenario is about.
OUT6="$(bash "$INSTALLER" --dry-run --platform claude </dev/null 2>&1)"
assert_not_contains "dry-run is not blocked by the consent gate" "$OUT6" "[consent]"
OUT6B="$(bash "$INSTALLER" --check --platform claude </dev/null 2>&1)"
assert_not_contains "check is not blocked by the consent gate" "$OUT6B" "[consent]"

echo ""
echo "Scenario 7: --json emits the documented result shape"
H7="$ROOT/h7"; mkdir -p "$H7"
JSON="$(bash "$INSTALLER" --apply --platform claude --target "$H7" \
  --repo-root "$PROJECT_ROOT" --yes --json 2>/dev/null)"
for KEY in '"status"' '"action"' '"platforms"' '"installed_tools"' '"results"'; do
  assert_contains "json has $KEY" "$JSON" "$KEY"
done
assert_contains "json status reflects the write" "$JSON" '"status": "changed"'
assert_contains "json records the platform" "$JSON" '"claude"'

echo ""
echo "Scenario 8: --repo-root and --target are honoured"
H8="$ROOT/h8"; mkdir -p "$H8"
bash "$INSTALLER" --apply --platform cursor --target "$H8" --repo-root "$PROJECT_ROOT" --yes >/dev/null 2>&1
assert_file "--target picked the fake home" "$H8/.cursor/AGENTS.md"
LINK="$(find "$H8/.cursor/skills" -type l | head -n1)"
assert_contains "symlink resolves into --repo-root" "$(readlink "$LINK")" "$PROJECT_ROOT/skills/"

echo ""
echo "Scenario 9: --platform all covers the four platform roots"
H9="$ROOT/h9"; mkdir -p "$H9"
bash "$INSTALLER" --apply --platform all --target "$H9" --repo-root "$PROJECT_ROOT" --yes >/dev/null 2>&1
assert_file "claude root" "$H9/.claude/AGENTS.md"
assert_file "codex root" "$H9/.codex/AGENTS.md"
assert_file "cursor root" "$H9/.cursor/AGENTS.md"
assert_file "opencode root" "$H9/.config/opencode/AGENTS.md"

echo ""
echo "Scenario 10: ~/.config/codex is used when ~/.codex is absent"
H10="$ROOT/h10"; mkdir -p "$H10/.config/codex"
bash "$INSTALLER" --apply --platform codex --target "$H10" --repo-root "$PROJECT_ROOT" --yes >/dev/null 2>&1
assert_file "fallback codex home used" "$H10/.config/codex/AGENTS.md"
assert_no_file "primary codex home not created" "$H10/.codex/AGENTS.md"

export PATH="$REAL_PATH"
summary "install-skills CLI"
