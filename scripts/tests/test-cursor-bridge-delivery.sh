#!/usr/bin/env bash
# Cursor Claude-bridge route: what the bridge delivers, and what it does not.
#
# The bridge premise ("~/.claude lists massa-ai, therefore Cursor loads it")
# was pinned against a 2026-08-05 capture and treated as all-or-nothing: on
# detection the installer deleted the local plugin directory AND stripped the
# hook wiring.
#
# Measured against Cursor 3.16.17 on 2026-08-17 it is HALF true — hooks fire,
# the plugin and its 46 workflow commands do not appear at all. So the old
# branch deleted a working bundle and nothing replaced it.
#
# These cases pin the routes:
# LOCAL IS THE DEFAULT; the bridge is opt-in via --prefer-bridge.
#   no bridge                  -> bundle INSTALLED, hooks wired locally
#   bridge present, default    -> bundle INSTALLED, hooks wired locally + warning
#   bridge + --prefer-bridge   -> bundle INSTALLED, hooks left to the bridge
#   --prefer-bridge, no bridge -> falls back to local rather than no hooks
#
# The bundle column is the regression guard: it was 0 before the fix in the
# bridge case, and a test that only checked hooks would have stayed green.

set -uo pipefail
SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SUITE_DIR/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
. "$SUITE_DIR/lib/installer-test-helpers.sh"

INSTALLER="$PROJECT_ROOT/apps/cursor-plugin/install.sh"

# seed_home <dir> <bridge:yes|no>
seed_home() {
  local h="$1" bridge="$2"
  mkdir -p "$h/.cursor"
  if [ "$bridge" = "yes" ]; then
    mkdir -p "$h/.claude/plugins"
    printf '{"version":2,"plugins":{"massa-ai@massa-ai":[{"scope":"user","installPath":"/x","version":"9.9.9"}]}}' \
      > "$h/.claude/plugins/installed_plugins.json"
    printf '{"enabledPlugins":{"massa-ai@massa-ai":true}}' > "$h/.claude/settings.json"
  fi
}

run_install() { # run_install <home> [extra args...]
  local h="$1"; shift
  MASSA_AI_SKIP_PLUGIN_REGISTRY=1 MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
    HOME="$h" bash "$INSTALLER" --user --quiet "$@" 2>&1
}

command_count() { # command_count <home>
  local d="$1/.cursor/plugins/local/massa-ai/skills"
  [ -d "$d" ] || { echo 0; return; }
  find "$d" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' '
}

hook_event_count() { # hook_event_count <home>
  local f="$1/.cursor/hooks.json"
  [ -f "$f" ] || { echo 0; return; }
  "${RUNNER:-bun}" -e '
    try {
      const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      console.log(Object.keys(j.hooks || {}).length);
    } catch { console.log(0); }
  ' "$f" 2>/dev/null || echo 0
}

echo ""
echo "Scenario 1: no bridge — bundle installed AND hooks wired locally"
H1="$(mktemp -d)"; seed_home "$H1" no
OUT1="$(run_install "$H1")"; RC1=$?
assert_eq "install exits 0" "$RC1" "0"
C1="$(command_count "$H1")"; K1="$(hook_event_count "$H1")"
check "workflow commands installed (got $C1)" "$([ "$C1" -gt 0 ] && echo 0 || echo 1)"
assert_eq "hook events wired locally" "$K1" "7"
rm -rf "$H1"

echo ""
echo "Scenario 2: bridge present, DEFAULT route — local wins, warning emitted"
H2="$(mktemp -d)"; seed_home "$H2" yes
OUT2="$(run_install "$H2")"; RC2=$?
assert_eq "install exits 0" "$RC2" "0"
C2="$(command_count "$H2")"; K2="$(hook_event_count "$H2")"
# THE regression guard: this was 0 before the fix.
check "workflow commands installed despite the bridge (got $C2)" "$([ "$C2" -gt 0 ] && echo 0 || echo 1)"
check "plugin directory present despite the bridge" \
  "$([ -d "$H2/.cursor/plugins/local/massa-ai" ] && echo 0 || echo 1)"
assert_eq "hooks wired locally by default despite the bridge" "$K2" "7"
assert_contains "warns about the AD-017 double-fire" "$OUT2" "fire TWICE"
assert_contains "warning names the opt-in" "$OUT2" "--prefer-bridge"
rm -rf "$H2"

echo ""
echo "Scenario 3: bridge + --prefer-bridge — hooks left to the bridge"
H3="$(mktemp -d)"; seed_home "$H3" yes
OUT3="$(run_install "$H3" --prefer-bridge)"; RC3=$?
assert_eq "install exits 0" "$RC3" "0"
C3="$(command_count "$H3")"; K3="$(hook_event_count "$H3")"
check "workflow commands installed (got $C3)" "$([ "$C3" -gt 0 ] && echo 0 || echo 1)"
assert_eq "hooks left to the bridge (none wired locally)" "$K3" "0"
rm -rf "$H3"

echo ""
echo "Scenario 4: MASSA_AI_CURSOR_PREFER_BRIDGE=1 equals --prefer-bridge; and opting into an absent bridge falls back to local"
H4="$(mktemp -d)"; seed_home "$H4" yes
MASSA_AI_CURSOR_PREFER_BRIDGE=1 MASSA_AI_SKIP_PLUGIN_REGISTRY=1 MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
  HOME="$H4" bash "$INSTALLER" --user --quiet >/dev/null 2>&1
assert_eq "env var leaves hooks to the bridge" "$(hook_event_count "$H4")" "0"
rm -rf "$H4"

# Opting into a bridge that is not there must not leave the user with no hooks.
H5="$(mktemp -d)"; seed_home "$H5" no
OUT5="$(run_install "$H5" --prefer-bridge)"; RC5=$?
assert_eq "install exits 0" "$RC5" "0"
assert_eq "falls back to a local hook install" "$(hook_event_count "$H5")" "7"
assert_contains "says why it fell back" "$OUT5" "Falling back to a local hook install"
rm -rf "$H5"

summary "cursor Claude-bridge delivery"
