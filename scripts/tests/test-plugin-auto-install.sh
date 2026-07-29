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

# ================================================================
echo ""
echo "Section 2: harness plugin phase gate (PAI-01..10)"
# ================================================================

# Shadow repo: the REAL install-harness.sh + banner + installer-shared.sh, but
# stub plugin installers that only record their argv — the only way to assert
# "the gate ran exactly these installers" without re-testing what the real
# installers do (test-install-harness-cli.sh precedent). Bundle version 2.0.0
# keeps seed versions (1.0.0 older, 9.9.9 newer, 2.0.0 current) unambiguous.
SHADOW="$ROOT/shadow"
CALL_LOG="$ROOT/calls.log"
mkdir -p "$SHADOW/scripts/lib"
cp "$PROJECT_ROOT/scripts/install-harness.sh" "$SHADOW/scripts/install-harness.sh"
cp "$PROJECT_ROOT/scripts/banner.sh" "$SHADOW/scripts/banner.sh"
cp "$PROJECT_ROOT/scripts/lib/installer-shared.sh" "$SHADOW/scripts/lib/installer-shared.sh"
printf '{\n  "name": "shadow",\n  "version": "2.0.0"\n}\n' > "$SHADOW/package.json"

make_plugin_stub() { # make_plugin_stub HOST [EXIT_CODE]
  mkdir -p "$SHADOW/apps/$1-plugin"
  cat > "$SHADOW/apps/$1-plugin/install.sh" <<STUB
#!/usr/bin/env bash
printf '%s|%s\n' "$1" "\$*" >> "$CALL_LOG"
exit ${2:-0}
STUB
  chmod +x "$SHADOW/apps/$1-plugin/install.sh"
}
for host in claude codex cursor opencode; do make_plugin_stub "$host"; done

# The scrubbed PATH for harness runs: the runner must stay resolvable (the
# gate reads state through it), so it is BASE_PATH plus the runner's own dir.
SAFE_PATH="$(dirname "$RUNNER"):$BASE_PATH"

run_shadow() { # run_shadow PATH HOME [extra harness args...] → OUT, RC
  local path="$1" home="$2"; shift 2
  : > "$CALL_LOG"
  OUT="$(PATH="$path" bash "$SHADOW/scripts/install-harness.sh" --plugins --target "$home" --yes "$@" 2>&1)"
  RC=$?
}

called_hosts() { cut -d'|' -f1 "$CALL_LOG" 2>/dev/null | tr '\n' ' '; }
argv_for_host() { grep "^$1|" "$CALL_LOG" 2>/dev/null | head -n1 | cut -d'|' -f2-; }

seed_state() { # seed_state HOME — writes stdin as the install state
  mkdir -p "$1/.config/massa-ai"
  cat > "$1/.config/massa-ai/install-state.json"
}

echo ""
echo "2.1 detection matrix via harness: dir-only ×4 hosts (PAI-01, AC-1)"
for host in claude codex cursor opencode; do
  H="$ROOT/m21-$host"
  mkdir -p "$H/$(installer_host_config_dir "$host")"
  run_shadow "$SAFE_PATH" "$H"
  assert_eq "$host dir-only → exit 0" "$RC" "0"
  assert_eq "$host dir-only → only its installer ran" "$(called_hosts)" "$host "
  assert_contains "$host dir-only → --user scope" "$(argv_for_host "$host")" "--user"
done

echo ""
echo "2.2 binary-only detection via harness, cursor through cursor-agent (AC-2)"
H="$ROOT/m22"; mkdir -p "$H"
run_shadow "$MOCK_CURSOR_AGENT:$SAFE_PATH" "$H"
assert_eq "cursor binary-only → exit 0" "$RC" "0"
assert_eq "cursor binary-only → its installer ran" "$(called_hosts)" "cursor "
assert_contains "absent hosts logged skips" "$OUT" "skip claude: host not detected"

echo ""
echo "2.3 absent-host skip: one log line, zero writes, exit unaffected (PAI-02)"
H="$ROOT/m23"; mkdir -p "$H/.cursor"
run_shadow "$SAFE_PATH" "$H"
assert_eq "absent hosts → exit 0" "$RC" "0"
assert_contains "skip line names host + reason" "$OUT" "skip codex: host not detected"
assert_no_file "no config dir fabricated for claude" "$H/.claude"
assert_no_file "no config dir fabricated for codex" "$H/.codex"
assert_no_file "no config dir fabricated for opencode" "$H/.config/opencode"

echo ""
echo "2.4 same-version no-op: seeded equal version skips the installer (PAI-05)"
H="$ROOT/m24"; mkdir -p "$H/.cursor"
seed_state "$H" <<'JSON'
{ "version": 2, "repository": "/x",
  "platforms": { "cursor": { "root": "/x/.cursor", "skills": ["massa-ai"], "skillsOwner": "plugin",
                             "plugin": { "version": "2.0.0", "installedAt": "2026-07-29T12:00:00Z" } } } }
JSON
run_shadow "$SAFE_PATH" "$H"
assert_eq "skip-current → exit 0" "$RC" "0"
assert_eq "skip-current → installer NOT run" "$(called_hosts)" ""
assert_contains "skip-current log line" "$OUT" "skip cursor: already at 2.0.0"

echo ""
echo "2.5 downgrade skip: seeded newer version never downgrades (AC-6)"
H="$ROOT/m25"; mkdir -p "$H/.cursor"
seed_state "$H" <<'JSON'
{ "version": 2, "repository": "/x",
  "platforms": { "cursor": { "root": "/x/.cursor", "skills": ["massa-ai"], "skillsOwner": "plugin",
                             "plugin": { "version": "9.9.9", "installedAt": "2026-07-29T12:00:00Z" } } } }
JSON
run_shadow "$SAFE_PATH" "$H"
assert_eq "downgrade → exit 0" "$RC" "0"
assert_eq "downgrade → installer NOT run" "$(called_hosts)" ""
assert_contains "downgrade log line" "$OUT" "skip cursor: installed 9.9.9 newer than bundle 2.0.0"

echo ""
echo "2.6 upgrade: seeded older version re-runs the installer (PAI-04)"
H="$ROOT/m26"; mkdir -p "$H/.cursor"
seed_state "$H" <<'JSON'
{ "version": 2, "repository": "/x",
  "platforms": { "cursor": { "root": "/x/.cursor", "skills": ["massa-ai"], "skillsOwner": "plugin",
                             "plugin": { "version": "1.0.0", "installedAt": "2026-07-29T12:00:00Z" } } } }
JSON
run_shadow "$SAFE_PATH" "$H"
assert_eq "upgrade → exit 0" "$RC" "0"
assert_eq "upgrade → installer ran" "$(called_hosts)" "cursor "
assert_contains "upgrade log line" "$OUT" "upgrade cursor: 1.0.0 → 2.0.0"

echo ""
echo "2.7 install: detected host with no record installs (PAI-01/PAI-04)"
H="$ROOT/m27"; mkdir -p "$H/.cursor"
run_shadow "$SAFE_PATH" "$H"
assert_eq "install → exit 0" "$RC" "0"
assert_eq "install → installer ran" "$(called_hosts)" "cursor "
assert_contains "install log line" "$OUT" "install cursor@2.0.0"

echo ""
echo "2.8 dry-run: per-host decision lines, nothing written (PAI-09, AC-10)"
H="$ROOT/m28"; mkdir -p "$H/.claude" "$H/.cursor"
seed_state "$H" <<'JSON'
{ "version": 2, "repository": "/x",
  "platforms": {
    "cursor": { "root": "/x/.cursor", "skills": ["massa-ai"], "skillsOwner": "plugin",
                "plugin": { "version": "1.0.0", "installedAt": "2026-07-29T12:00:00Z" } },
    "opencode": { "root": "/x/.config/opencode", "skills": ["massa-ai"], "skillsOwner": "plugin",
                  "plugin": { "version": "2.0.0", "installedAt": "2026-07-29T12:00:00Z" } } } }
JSON
MOCK_OPENCODE="$ROOT/mock-opencode"; make_mock_agents "$MOCK_OPENCODE" opencode >/dev/null
BEFORE="$(tree_fingerprint "$H")"
run_shadow "$MOCK_OPENCODE:$SAFE_PATH" "$H" --dry-run
AFTER="$(tree_fingerprint "$H")"
assert_eq "dry-run → exit 0" "$RC" "0"
assert_contains "dry-run names install" "$OUT" "install claude@2.0.0"
assert_contains "dry-run names upgrade" "$OUT" "upgrade cursor: 1.0.0 → 2.0.0"
assert_contains "dry-run names skip-current" "$OUT" "skip-current opencode: already at 2.0.0"
assert_contains "dry-run names skip-absent" "$OUT" "skip-absent codex: host not detected"
assert_eq "dry-run → no installer ran" "$(called_hosts)" ""
assert_eq "dry-run → nothing under HOME modified" "$AFTER" "$BEFORE"
assert_no_file "dry-run → no marketplace copy" "$H/.config/massa-ai/marketplace"

echo ""
echo "2.9 failure isolation: a failing host never aborts the rest (PAI-10, AC-9)"
H="$ROOT/m29"; mkdir -p "$H/.claude" "$H/.codex"
make_plugin_stub claude 7
make_plugin_stub codex 3
run_shadow "$SAFE_PATH" "$H"
assert_eq "first failing exit code propagates" "$RC" "7"
assert_eq "later hosts still processed" "$(called_hosts)" "claude codex "
assert_contains "failure reported" "$OUT" "claude-plugin/install.sh failed (exit 7)"
make_plugin_stub claude
make_plugin_stub codex

echo ""
echo "2.10 OpenCode detected without a build fails; other hosts processed (PAI-10, AC-12)"
H="$ROOT/m210"
mkdir -p "$H/.claude" "$H/.codex" "$H/.cursor" "$H/.config/opencode"
MOCK_ALL="$ROOT/mock-all"; make_mock_agents "$MOCK_ALL" claude codex cursor-agent opencode >/dev/null
OUT="$(PATH="$MOCK_ALL:$SAFE_PATH" bash "$PROJECT_ROOT/scripts/install-harness.sh" --plugins --target "$H" --yes 2>&1)"; RC=$?
assert_eq "opencode build-missing → exit 1" "$RC" "1"
assert_contains "documented build error" "$OUT" "plugin bundle not found"
assert_contains "failure names the installer" "$OUT" "opencode-plugin/install.sh failed (exit 1)"
assert_file "claude plugin installed before the failure" "$H/.claude/settings.json"
assert_file "cursor plugin installed before the failure" "$H/.cursor/plugins/local/massa-ai/.cursor-plugin/plugin.json"

echo ""
echo "2.11 --uninstall is ungated: all four run even with nothing detected (PAI-07)"
H="$ROOT/m211"; mkdir -p "$H"
run_shadow "$SAFE_PATH" "$H" --uninstall
assert_eq "uninstall → exit 0" "$RC" "0"
assert_eq "all four uninstallers ran" "$(called_hosts)" "claude codex cursor opencode "
assert_contains "uninstallers get --uninstall" "$(argv_for_host cursor)" "--uninstall"

echo ""
echo "2.12 marketplace resolution is gated on real installs (C-3, R6)"
H="$ROOT/m212a"; mkdir -p "$H"
run_shadow "$SAFE_PATH" "$H"
assert_eq "0 detected hosts → exit 0" "$RC" "0"
assert_eq "0 detected hosts → nothing installed" "$(called_hosts)" ""
assert_no_file "0 detected hosts → no marketplace dir" "$H/.config/massa-ai/marketplace"
H="$ROOT/m212b"; mkdir -p "$H/.cursor"
run_shadow "$SAFE_PATH" "$H"
assert_eq "install run → exit 0" "$RC" "0"
assert_file "install run → marketplace copy materialised" "$H/.config/massa-ai/marketplace/apps/cursor-plugin/install.sh"

echo ""
echo "2.13 detected host with a missing installer warns and continues (edge case)"
H="$ROOT/m213"; mkdir -p "$H/.claude" "$H/.cursor"
rm "$SHADOW/apps/cursor-plugin/install.sh"
run_shadow "$SAFE_PATH" "$H"
assert_eq "missing installer → exit 0 (warn-and-continue)" "$RC" "0"
assert_contains "missing installer warning" "$OUT" "cursor plugin installer not found"
assert_eq "remaining detected host still installed" "$(called_hosts)" "claude "
make_plugin_stub cursor

summary "plugin-auto-install"
