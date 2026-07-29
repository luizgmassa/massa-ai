#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-plugin-auto-install.sh
#
# Plugin auto-install (PAI-01..10): host detection, bundle-version gating,
# version recording. Everything runs against a scratch HOME; the real $HOME
# is never touched. Detection cases run with PATH scrubbed to a base that is
# guaranteed free of host agent binaries, plus per-case mock binaries, so the
# matrix is deterministic on any machine (CI has no hosts; a dev box may).
#
# Sections:
#   1. installer-shared.sh helper contracts (detection, versions)
#   2. harness plugin phase gate            (added with the harness rewrite)
#   3. plugin installer version records     (added with the installer changes)
#
# Usage: bash scripts/tests/test-plugin-auto-install.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"
# shellcheck source=scripts/lib/installer-shared.sh
source "${PROJECT_ROOT}/scripts/lib/installer-shared.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-pai.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

# Absolute runner path: survives the scrubbed PATH used by detection cases.
RUNNER="$(command -v node || command -v bun)"
# Guaranteed to contain no claude/codex/cursor/cursor-agent/opencode binaries.
BASE_PATH="/usr/bin:/bin"

# ================================================================
echo "Section 1: installer-shared.sh helper contracts"
# ================================================================

echo ""
echo "1.1 host config dirs (PAI-01)"
assert_eq "claude config dir"   "$(installer_host_config_dir claude)"   ".claude"
assert_eq "codex config dir"    "$(installer_host_config_dir codex)"    ".codex"
assert_eq "cursor config dir"   "$(installer_host_config_dir cursor)"   ".cursor"
assert_eq "opencode config dir" "$(installer_host_config_dir opencode)" ".config/opencode"
installer_host_config_dir bogus >/dev/null 2>&1
assert_eq "unknown host → exit 2" "$?" "2"

echo ""
echo "1.2 host binaries mirror install-skills.sh platform_executables (PAI-01)"
assert_eq "claude binaries"   "$(installer_host_binaries claude)"   "claude"
assert_eq "codex binaries"    "$(installer_host_binaries codex)"    "codex"
assert_eq "cursor binaries"   "$(installer_host_binaries cursor)"   "cursor-agent cursor"
assert_eq "opencode binaries" "$(installer_host_binaries opencode)" "opencode"
installer_host_binaries bogus >/dev/null 2>&1
assert_eq "unknown host → exit 2" "$?" "2"

echo ""
echo "1.3 detection matrix: dir-only / binary-only / both / neither (PAI-01)"
for host in claude codex cursor opencode; do
  H="$ROOT/dir-$host"
  mkdir -p "$H/$(installer_host_config_dir "$host")"
  OUT="$(PATH="$BASE_PATH" installer_host_detected "$host" "$H")"; RC=$?
  assert_eq "$host dir-only → detected" "$RC" "0"
  assert_eq "$host dir-only signal" "$OUT" "dir"
done

H_NODIR="$ROOT/no-config"; mkdir -p "$H_NODIR"
MOCK_CURSOR_AGENT="$ROOT/mock-cursor-agent"; make_mock_agents "$MOCK_CURSOR_AGENT" cursor-agent >/dev/null
OUT="$(PATH="$MOCK_CURSOR_AGENT:$BASE_PATH" installer_host_detected cursor "$H_NODIR")"; RC=$?
assert_eq "cursor binary-only via cursor-agent → detected" "$RC" "0"
assert_eq "cursor binary-only signal" "$OUT" "binary"

MOCK_CLAUDE="$ROOT/mock-claude"; make_mock_agents "$MOCK_CLAUDE" claude >/dev/null
OUT="$(PATH="$MOCK_CLAUDE:$BASE_PATH" installer_host_detected claude "$H_NODIR")"; RC=$?
assert_eq "claude binary-only → detected" "$RC" "0"
assert_eq "claude binary-only signal" "$OUT" "binary"

H_BOTH="$ROOT/both"; mkdir -p "$H_BOTH/.cursor"
OUT="$(PATH="$MOCK_CURSOR_AGENT:$BASE_PATH" installer_host_detected cursor "$H_BOTH")"; RC=$?
assert_eq "dir+binary → detected" "$RC" "0"
assert_eq "dir+binary prefers dir signal" "$OUT" "dir"

OUT="$(PATH="$BASE_PATH" installer_host_detected cursor "$H_NODIR")"; RC=$?
assert_eq "neither → not detected" "$RC" "1"
assert_eq "neither → empty output" "$OUT" ""

OUT="$(PATH="$BASE_PATH" installer_host_detected claude "")"; RC=$?
assert_eq "empty home never dir-detects" "$RC" "1"
assert_eq "empty home → empty output" "$OUT" ""

installer_host_detected bogus "$H_BOTH" >/dev/null 2>&1
assert_eq "unknown host → exit 2" "$?" "2"

echo ""
echo "1.4 bundle version extraction (PAI-03 version source)"
ROOT_VERSION="$(installer_bundle_version "$PROJECT_ROOT/package.json")"
EXPECTED_VERSION="$("$RUNNER" -e "process.stdout.write(require(process.argv[1]).version)" "$PROJECT_ROOT/package.json")"
assert_eq "sed extraction matches JSON parse of root package.json" "$ROOT_VERSION" "$EXPECTED_VERSION"
mkdir -p "$ROOT/pkg"
printf '{\n  "name": "x",\n  "version": "1.2.3",\n  "dependencies": { "y": "4.5.6" }\n}\n' > "$ROOT/pkg/package.json"
assert_eq "scratch package.json version" "$(installer_bundle_version "$ROOT/pkg/package.json")" "1.2.3"

echo ""
echo "1.5 recorded plugin versions reader (PAI-06, AC-8)"
mkdir -p "$ROOT/state"
STATE="$ROOT/state/install-state.json"
cat > "$STATE" <<'JSON'
{
  "version": 2,
  "repository": "/x",
  "platforms": {
    "cursor": { "root": "/h/.cursor", "skills": ["massa-ai"], "skillsOwner": "repo",
                "plugin": { "version": "1.9.1", "installedAt": "2026-07-29T12:00:00Z" } },
    "claude": { "root": "/h/.claude", "skills": ["massa-ai"], "skillsOwner": "plugin" }
  }
}
JSON
OUT="$(installer_plugin_versions "$RUNNER" "$STATE")"; RC=$?
assert_eq "valid state → exit 0" "$RC" "0"
assert_contains "recorded cursor version emitted" "$OUT" "$(printf 'cursor\t1.9.1')"
assert_not_contains "platform without a plugin record is omitted" "$OUT" "claude"

OUT="$(installer_plugin_versions "$RUNNER" "$ROOT/state/missing.json")"; RC=$?
assert_eq "missing file → exit 0" "$RC" "0"
assert_eq "missing file → empty output" "$OUT" ""

printf '{not json' > "$STATE"
OUT="$(installer_plugin_versions "$RUNNER" "$STATE" 2>"$ROOT/warn.txt")"; RC=$?
assert_eq "corrupt file → exit 0" "$RC" "0"
assert_eq "corrupt file → empty stdout" "$OUT" ""
assert_contains "corrupt file → one stderr warning" "$(cat "$ROOT/warn.txt")" "unparseable"

echo ""
echo "1.6 version compare table (PAI-04/PAI-05, AC-6)"
assert_eq "equal → 0"                 "$(installer_compare_versions "$RUNNER" "1.9.1" "1.9.1")"     "0"
assert_eq "recorded older → -1"       "$(installer_compare_versions "$RUNNER" "1.9.0" "1.9.1")"     "-1"
assert_eq "recorded newer → 1"        "$(installer_compare_versions "$RUNNER" "1.10.0" "1.9.1")"    "1"
assert_eq "empty recorded → -1"       "$(installer_compare_versions "$RUNNER" "" "1.9.1")"          "-1"
assert_eq "non-numeric segment → -1"  "$(installer_compare_versions "$RUNNER" "abc" "1.9.1")"       "-1"
assert_eq "pre-release vs release → -1" "$(installer_compare_versions "$RUNNER" "1.9.1-rc1" "1.9.1")" "-1"

summary "plugin-auto-install"
