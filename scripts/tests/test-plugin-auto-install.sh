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
# 2.10 moves the real opencode dist aside to force its build-missing path;
# restore_dist is a no-op unless that move happened, and the EXIT trap makes
# the restore interruption-safe (other suites need dist present).
DIST_BAK=""
restore_dist() {
  [ -n "$DIST_BAK" ] && [ -f "$DIST_BAK" ] && mv "$DIST_BAK" "$PROJECT_ROOT/apps/opencode-plugin/dist/index.js"
  DIST_BAK=""
}
trap 'restore_dist; rm -rf "$ROOT"' EXIT

# Absolute runner path: survives the scrubbed PATH used by detection cases.
RUNNER="$(command -v node || command -v bun)"
# T9/UGB-08: install-harness.sh's own once-only generation step (unlike the
# JSON-manipulation runner above) requires bun specifically — the generator
# scripts are Bun scripts. The shadow-based calls below skip generation via
# MASSA_AI_SKIP_ARTIFACT_GENERATION (run_shadow), but the two calls that run
# the REAL scripts/install-harness.sh (2.10, Section 3) generate for real and
# need bun resolvable even when RUNNER above picked node.
BUN_BIN="$(command -v bun)"
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
SAFE_PATH="$(dirname "$RUNNER"):$(dirname "$BUN_BIN"):$BASE_PATH"

run_shadow() { # run_shadow PATH HOME [extra harness args...] → OUT, RC
  local path="$1" home="$2"; shift 2
  : > "$CALL_LOG"
  # T9/UGB-08: install-harness.sh now generates plugin bundles once up front
  # (scripts/generate-*.ts) before this phase — out of scope for this shadow,
  # whose tree carries neither script. Skip it here; the once-only generation
  # contract itself is scripts/tests/test-harness-single-generation.sh's job.
  OUT="$(PATH="$path" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
    bash "$SHADOW/scripts/install-harness.sh" --plugins --target "$home" --yes "$@" 2>&1)"
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
# The build-missing premise must hold whether or not dist exists in this
# checkout (CI may not have built): move it aside, restored by the EXIT trap.
if [ -f "$PROJECT_ROOT/apps/opencode-plugin/dist/index.js" ]; then
  DIST_BAK="$ROOT/dist-index.js.bak"
  mv "$PROJECT_ROOT/apps/opencode-plugin/dist/index.js" "$DIST_BAK"
fi
OUT="$(PATH="$MOCK_ALL:$SAFE_PATH" bash "$PROJECT_ROOT/scripts/install-harness.sh" --plugins --target "$H" --yes 2>&1)"; RC=$?
restore_dist
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

# ================================================================
echo ""
echo "Section 3: plugin installer version records (PAI-03/04/05/07, AC-3/11/15/16)"
# ================================================================
# The REAL claude/codex/cursor installers against a scratch HOME, driven
# through the REAL harness. MASSA_AI_SKIP_PLUGIN_REGISTRY=1 pins claude/codex
# to their file route so no host CLI is ever invoked (a dev box may have a
# real one — the registry commands would write outside the scratch HOME).
# OpenCode's happy path lives in apps/opencode-plugin/__tests__ (dist fixture).

REAL_VERSION="$(installer_bundle_version "$PROJECT_ROOT/package.json")"
ISO_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'

state_plugin_field() { # state_plugin_field STATE_FILE HOST FIELD → plugin.<field> or ""
  "$RUNNER" - "$1" "$2" "$3" <<'NODE'
const fs = require("fs");
const [, , file, host, field] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const rec = data && data.platforms && data.platforms[host];
  process.stdout.write(rec && rec.plugin && rec.plugin[field] ? String(rec.plugin[field]) : "");
} catch { process.stdout.write(""); }
NODE
}

state_platform_field() { # state_platform_field STATE_FILE HOST FIELD → platforms[host].<field> or ""
  "$RUNNER" - "$1" "$2" "$3" <<'NODE'
const fs = require("fs");
const [, , file, host, field] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const rec = data && data.platforms && data.platforms[host];
  process.stdout.write(rec && rec[field] ? String(rec[field]) : "");
} catch { process.stdout.write(""); }
NODE
}

state_has_platform() { # state_has_platform STATE_FILE HOST → "1" | "0"
  "$RUNNER" - "$1" "$2" <<'NODE'
const fs = require("fs");
const [, , file, host] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(data && data.platforms && data.platforms[host] ? "1" : "0");
} catch { process.stdout.write("0"); }
NODE
}

run_harness() { # run_harness HOME [extra args...] → OUT, RC
  local home="$1"; shift
  OUT="$(MASSA_AI_SKIP_PLUGIN_REGISTRY=1 PATH="$SAFE_PATH" \
    bash "$PROJECT_ROOT/scripts/install-harness.sh" --plugins --target "$home" --yes "$@" 2>&1)"
  RC=$?
}

seed_older_version() { # seed_older_version STATE_FILE — rewrite every plugin version to 0.0.1
  "$RUNNER" - "$1" <<'NODE'
const fs = require("fs");
const [, , file] = process.argv;
const data = JSON.parse(fs.readFileSync(file, "utf8"));
for (const rec of Object.values(data.platforms || {})) {
  if (rec && rec.plugin) rec.plugin.version = "0.0.1";
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
NODE
}

for host in claude codex cursor; do
  cfg_dir="$(installer_host_config_dir "$host")"
  case "$host" in
    claude) hooks_file=".claude/settings.json" ;;
    codex)  hooks_file=".codex/hooks.json" ;;
    cursor) hooks_file=".cursor/hooks.json" ;;
  esac

  echo ""
  echo "3.x/$host install → record → skip-current → upgrade → uninstall"
  H="$ROOT/e2e-$host"; mkdir -p "$H/$cfg_dir"
  STATE="$H/.config/massa-ai/install-state.json"

  # (a) PAI-03/AC-3: a successful install records version + ISO-8601 timestamp
  run_harness "$H"
  assert_eq "$host install → exit 0" "$RC" "0"
  assert_eq "$host recorded version == bundle version" \
    "$(state_plugin_field "$STATE" "$host" version)" "$REAL_VERSION"
  INSTALLED_AT="$(state_plugin_field "$STATE" "$host" installedAt)"
  printf '%s' "$INSTALLED_AT" | grep -Eq "$ISO_RE"
  check "$host recorded installedAt is ISO-8601 UTC" "$?"
  assert_contains "$host install log line" "$OUT" "install ${host}@${REAL_VERSION}"

  # (b) PAI-05/AC-4: a same-version re-run skips and writes nothing in the host dir
  FP_BEFORE="$(tree_fingerprint "$H/$cfg_dir")"
  run_harness "$H"
  assert_eq "$host re-run → exit 0" "$RC" "0"
  assert_contains "$host re-run skips at same version" "$OUT" "skip ${host}: already at ${REAL_VERSION}"
  assert_eq "$host re-run left the host config dir untouched" "$(tree_fingerprint "$H/$cfg_dir")" "$FP_BEFORE"

  # (c) PAI-04/AC-5: an older recorded version upgrades and updates the record
  seed_older_version "$STATE"
  run_harness "$H"
  assert_eq "$host upgrade → exit 0" "$RC" "0"
  assert_contains "$host upgrade log line" "$OUT" "upgrade ${host}: 0.0.1 → ${REAL_VERSION}"
  assert_eq "$host record updated after upgrade" \
    "$(state_plugin_field "$STATE" "$host" version)" "$REAL_VERSION"

  # (d) PAI-07/AC-11/AC-15a: the plugin's own --uninstall removes the record;
  # a plugin-owned platform keeps the whole-record delete (clean slate)
  OUT="$(MASSA_AI_SKIP_PLUGIN_REGISTRY=1 PATH="$SAFE_PATH" HOME="$H" \
    bash "$PROJECT_ROOT/apps/${host}-plugin/install.sh" --uninstall 2>&1)"; RC=$?
  assert_eq "$host plugin --uninstall → exit 0" "$RC" "0"
  assert_eq "$host plugin-owned record fully removed" "$(state_has_platform "$STATE" "$host")" "0"

  # (e) AC-15b: any other owner loses only the plugin subfield
  mkdir -p "$(dirname "$STATE")"
  cat > "$STATE" <<JSON
{ "version": 2, "repository": "/x",
  "platforms": { "$host": { "root": "$H/$cfg_dir", "skills": ["massa-ai"], "skillsOwner": "repo",
    "plugin": { "version": "1.2.3", "installedAt": "2026-01-01T00:00:00Z" } } } }
JSON
  OUT="$(MASSA_AI_SKIP_PLUGIN_REGISTRY=1 PATH="$SAFE_PATH" HOME="$H" \
    bash "$PROJECT_ROOT/apps/${host}-plugin/install.sh" --uninstall 2>&1)"; RC=$?
  assert_eq "$host repo-owned --uninstall → exit 0" "$RC" "0"
  assert_eq "$host record survives (repo-owned)" "$(state_has_platform "$STATE" "$host")" "1"
  assert_eq "$host plugin subfield removed" "$(state_plugin_field "$STATE" "$host" version)" ""
  assert_eq "$host skillsOwner survives" "$(state_platform_field "$STATE" "$host" skillsOwner)" "repo"
  assert_contains "$host skills list survives" "$(state_platform_field "$STATE" "$host" skills)" "massa-ai"
  assert_eq "$host root survives" "$(state_platform_field "$STATE" "$host" root)" "$H/$cfg_dir"

  # (f) AC-16: a failure after the state write records NO plugin version
  H2="$ROOT/e2e-fail-$host"; mkdir -p "$H2/$cfg_dir" "$H2/$(dirname "$hooks_file")"
  mkdir -p "$H2/$hooks_file"   # the hooks target as a DIRECTORY → the merge must fail
  STATE2="$H2/.config/massa-ai/install-state.json"
  OUT="$(MASSA_AI_SKIP_PLUGIN_REGISTRY=1 PATH="$SAFE_PATH" HOME="$H2" \
    bash "$PROJECT_ROOT/apps/${host}-plugin/install.sh" --user 2>&1)"; RC=$?
  assert_ne "$host failed install → non-zero exit" "$RC" "0"
  assert_eq "$host failed install records no plugin version" \
    "$(state_plugin_field "$STATE2" "$host" version)" ""
done

echo ""
echo "3.2 corrupt state: harness warns, treats unknown, self-heals on success (AC-8)"
H="$ROOT/e2e-corrupt"; mkdir -p "$H/.cursor" "$H/.config/massa-ai"
printf '{not json' > "$H/.config/massa-ai/install-state.json"
STATE="$H/.config/massa-ai/install-state.json"
run_harness "$H"
assert_eq "corrupt state → exit 0" "$RC" "0"
assert_contains "corrupt state → one warning" "$OUT" "unparseable"
assert_eq "corrupt state → install proceeds" "$(state_has_platform "$STATE" cursor)" "1"
assert_eq "corrupt state → valid record written" "$(state_plugin_field "$STATE" cursor version)" "$REAL_VERSION"

echo ""
echo "3.3 harness --uninstall removes the record too (PAI-07, AC-11)"
H="$ROOT/e2e-h-uninstall"; mkdir -p "$H/.cursor"
STATE="$H/.config/massa-ai/install-state.json"
run_harness "$H"
assert_eq "harness install → record present" "$(state_has_platform "$STATE" cursor)" "1"
run_harness "$H" --uninstall
assert_eq "harness --uninstall → exit 0" "$RC" "0"
assert_eq "harness --uninstall → record gone" "$(state_has_platform "$STATE" cursor)" "0"

echo ""
echo "3.4 record-write failure warns but never fails the install (design C4)"
H="$ROOT/e2e-record-fail"; mkdir -p "$H/.cursor" "$H/.config/massa-ai"
STATE="$H/.config/massa-ai/install-state.json"
# Repo-owned state makes install_bundled_skills a no-op, so the record write
# is the ONLY state write of the run — a read-only state file then fails just
# that write.
cat > "$STATE" <<JSON
{ "version": 2, "repository": "/x",
  "platforms": { "cursor": { "root": "$H/.cursor", "skills": ["massa-ai"], "skillsOwner": "repo" } } }
JSON
chmod a-w "$STATE"
OUT="$(PATH="$SAFE_PATH" HOME="$H" bash "$PROJECT_ROOT/apps/cursor-plugin/install.sh" --user 2>&1)"; RC=$?
chmod u+w "$STATE"
assert_eq "record-write failure → install still exits 0" "$RC" "0"
assert_contains "record-write failure warns" "$OUT" "could not record the plugin version"
assert_eq "record-write failure leaves no version record" \
  "$(state_plugin_field "$STATE" cursor version)" ""

summary "plugin-auto-install"
