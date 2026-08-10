#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-plugin-marketplace-cache-refresh.sh
#
# CMR — marketplace cache refresh (spec:
# .specs/features/claude-marketplace-cache-refresh/spec.md, AC-1..5).
#
# The claude CLI serves a version-pinned cache snapshot; `plugin install` is
# an idempotent no-op on an already-installed plugin. These scenarios prove
# the installer now (a) runs `plugin update` exactly when the served version
# is OLDER than the bundle, and (b) records the version the CLI actually
# serves — or nothing when unreadable — instead of the bundle version.
#
# Every scenario runs the REAL installer against a mock `claude` CLI in a
# temp $HOME. CI has no claude binary; the mock is what makes AC-1..5
# runnable there (same strategy as test-plugin-auto-install.sh's mock
# agents). The mock's `plugin update` emulates the one behavior verified
# against the real CLI (spec R1): it re-materializes the served version to
# the marketplace source's current version.
#
# Usage: bash scripts/tests/test-plugin-marketplace-cache-refresh.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-cache-refresh.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

INSTALLER="$PROJECT_ROOT/apps/claude-plugin/install.sh"
BUNDLE_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/apps/claude-plugin/package.json" | head -n 1)"

if [[ ! -d "$PROJECT_ROOT/apps/claude-plugin/agents" ]]; then
  echo "generated bundle missing — run 'bun run generate:artifacts' first" >&2
  exit 1
fi

# Mock claude CLI. Behavior knobs are read from the environment at call time:
#   MOCK_SEED_VERSION       version `plugin install` seeds into the registry
#   MOCK_UPDATE_LOG         file receiving one line per `plugin update` call
#   MOCK_UPDATE_FAIL=1      `plugin update` exits 1 without touching the registry
#   MOCK_NO_UPDATE_SUBCOMMAND=1  `plugin update --help` exits 1 (old CLI)
#   MOCK_SOURCE_VERSION     version `plugin update` re-materializes to
MOCK_BIN="$ROOT/mockbin"
mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/claude" <<'MOCK'
#!/usr/bin/env bash
REG="$HOME/.claude/plugins/installed_plugins.json"
case "$*" in
  "plugin marketplace --help") exit 0 ;;
  "plugin update --help")
    [[ "${MOCK_NO_UPDATE_SUBCOMMAND:-0}" == "1" ]] && exit 1
    exit 0 ;;
  "plugin marketplace add"*) exit 0 ;;
  "plugin install"*)
    mkdir -p "$(dirname "$REG")"
    if [[ ! -f "$REG" ]]; then
      printf '{"version":2,"plugins":{"massa-ai@massa-ai":[{"scope":"user","version":"%s","installPath":"/mock"}]}}\n' \
        "${MOCK_SEED_VERSION}" > "$REG"
    fi
    exit 0 ;;
  "plugin update"*)
    echo "$*" >> "${MOCK_UPDATE_LOG}"
    [[ "${MOCK_UPDATE_FAIL:-0}" == "1" ]] && exit 1
    sed -i.bak "s/\"version\":\"${MOCK_SEED_VERSION}\"/\"version\":\"${MOCK_SOURCE_VERSION}\"/" "$REG"
    exit 0 ;;
  *) exit 0 ;;
esac
MOCK
chmod +x "$MOCK_BIN/claude"

# run_scenario NAME — creates a scenario HOME, runs the real installer with
# the mock claude first on PATH, captures stdout+stderr and exit code.
# Callers export MOCK_* knobs first and read $SCEN_HOME/$OUT/$CODE after.
SCEN_HOME=""; OUT=""; CODE=""
run_scenario() {
  local name="$1"
  SCEN_HOME="$ROOT/$name"
  mkdir -p "$SCEN_HOME"
  export MOCK_UPDATE_LOG="$ROOT/$name.update.log"
  : > "$MOCK_UPDATE_LOG"
  OUT="$(HOME="$SCEN_HOME" PATH="$MOCK_BIN:$PATH" MOCK_SOURCE_VERSION="${MOCK_SOURCE_VERSION:-$BUNDLE_VERSION}" \
    bash "$INSTALLER" --user 2>&1)"
  CODE=$?
}

state_field() { # state_field FIELD — prints platforms.claude.<FIELD> or ""
  local runner="node"; command -v node >/dev/null 2>&1 || runner="bun"
  "$runner" - "$SCEN_HOME/.config/massa-ai/install-state.json" "$1" <<'NODE'
const fs = require("fs");
const [, , file, field] = process.argv;
try {
  const rec = JSON.parse(fs.readFileSync(file, "utf8")).platforms.claude;
  const v = field === "plugin.version" ? rec.plugin && rec.plugin.version : rec[field];
  if (typeof v === "string") process.stdout.write(v);
} catch { /* absent */ }
NODE
}

update_calls() { wc -l < "$MOCK_UPDATE_LOG" | tr -d ' '; }

echo "Scenario 1 (AC-1): served older than bundle → one update, records post-update served"
export MOCK_SEED_VERSION="0.0.1"
unset MOCK_UPDATE_FAIL MOCK_NO_UPDATE_SUBCOMMAND 2>/dev/null || true
run_scenario ac1
assert_eq "installer exits 0" "$CODE" "0"
assert_eq "one plugin update call" "$(update_calls)" "1"
assert_contains "update targeted the plugin id" "$(cat "$MOCK_UPDATE_LOG")" "massa-ai@massa-ai"
assert_eq "recorded version is the post-update served version" "$(state_field plugin.version)" "$BUNDLE_VERSION"
assert_eq "installRoute recorded" "$(state_field installRoute)" "marketplace"

echo ""
echo "Scenario 2 (AC-2): served equals bundle → zero updates"
export MOCK_SEED_VERSION="$BUNDLE_VERSION"
run_scenario ac2
assert_eq "installer exits 0" "$CODE" "0"
assert_eq "no plugin update call" "$(update_calls)" "0"
assert_eq "recorded version equals served/bundle" "$(state_field plugin.version)" "$BUNDLE_VERSION"

echo ""
echo "Scenario 3 (AC-3): served newer than bundle → zero updates, no downgrade, truthful record"
export MOCK_SEED_VERSION="99.0.0"
run_scenario ac3
assert_eq "installer exits 0" "$CODE" "0"
assert_eq "no plugin update call (never downgrade)" "$(update_calls)" "0"
assert_eq "recorded version is the served (newer) one" "$(state_field plugin.version)" "99.0.0"

echo ""
echo "Scenario 4 (AC-4): update fails → warn, exit 0, stale served version recorded"
export MOCK_SEED_VERSION="0.0.1" MOCK_UPDATE_FAIL=1
run_scenario ac4
assert_eq "installer exits 0" "$CODE" "0"
assert_eq "update was attempted" "$(update_calls)" "1"
assert_contains "stderr names the failed update" "$OUT" "plugin update massa-ai@massa-ai' failed"
assert_eq "recorded version is the stale served one (gate keeps retrying)" "$(state_field plugin.version)" "0.0.1"
unset MOCK_UPDATE_FAIL

echo ""
echo "Scenario 4b (AC-4): CLI without plugin update → warn, no call, stale served recorded"
export MOCK_SEED_VERSION="0.0.1" MOCK_NO_UPDATE_SUBCOMMAND=1
run_scenario ac4b
assert_eq "installer exits 0" "$CODE" "0"
assert_eq "no update call (unsupported)" "$(update_calls)" "0"
assert_contains "stderr names the missing subcommand" "$OUT" "no 'plugin update'"
assert_eq "recorded version is the stale served one" "$(state_field plugin.version)" "0.0.1"
unset MOCK_NO_UPDATE_SUBCOMMAND

echo ""
echo "Scenario 5 (AC-5): entry shape unreadable → warn, exit 0, no version claim"
# Fully corrupt JSON would fail claude_plugin_registered's grep and fall back
# to the FILE route (bundle-version record is then legitimate). The CMR-03
# shape is: registration verifiable, entry unparseable — the legacy
# flat-boolean form (spec R4, mirrors install.test.ts's old fixture).
export MOCK_SEED_VERSION="0.0.1"
SCEN_HOME_PRE="$ROOT/ac5"; mkdir -p "$SCEN_HOME_PRE/.claude/plugins"
printf '{"version":2,"plugins":{"massa-ai@massa-ai":true}}\n' > "$SCEN_HOME_PRE/.claude/plugins/installed_plugins.json"
run_scenario ac5
assert_eq "installer exits 0" "$CODE" "0"
assert_eq "no update call" "$(update_calls)" "0"
assert_contains "stderr warns the served version is unreadable" "$OUT" "could not read the served plugin version"
assert_eq "no plugin.version claimed" "$(state_field plugin.version)" ""
assert_eq "installRoute still recorded" "$(state_field installRoute)" "marketplace"

summary "plugin marketplace cache refresh"
