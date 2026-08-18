#!/usr/bin/env bash
# The harness self-heal sentinel must watch EVERY artifact class the plugin
# installer restores — not one class as a proxy for the rest.
#
# install-harness.sh skips a host whose recorded plugin version equals the
# bundle version. PAU-05/06 added a self-heal escape: skip only when the host's
# installed artifacts are still on disk. That check consulted a SINGLE sentinel
# per host (subagents for claude/codex/cursor, index.js for opencode), so a
# host that kept its subagents but lost its hooks, commands or plugin directory
# read as fully installed and was skipped forever.
#
# Observed live 2026-08-17: Cursor had ~/.cursor/agents/massa-ai-*.md and
# neither plugins/local/massa-ai nor a single massa-ai hook entry. Re-running
# scripts/setup-local-first.sh repaired nothing, because the sentinel was
# satisfied by the agents alone.
#
# Method: install each host for real into a scratch HOME, snapshot it, then
# wipe exactly ONE artifact class at a time and assert the sentinel reports
# absent. A sentinel that watches only its old class passes the baseline and
# the subagent case, and fails every sibling — which is the observed red this
# suite was written against.
#
# The two route cases are the counterweight. A sentinel that demanded hooks
# unconditionally would loop forever on Cursor's bridge route (where the
# installer deliberately writes none) and on Claude's marketplace route (where
# the bundle serves commands, subagents and hooks in place, and the file-route
# copies are deleted on purpose). Every class this suite demands must be one a
# reinstall on the RECORDED route puts back, or the self-heal never terminates.

set -uo pipefail
SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SUITE_DIR/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
. "$SUITE_DIR/lib/installer-test-helpers.sh"
# shellcheck source=scripts/lib/installer-shared.sh
. "$PROJECT_ROOT/scripts/lib/installer-shared.sh"

RUNNER="$(installer_detect_runner)" || { echo "node or bun required" >&2; exit 3; }
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT

# sentinel <host> <home> — echoes the probe's exit code (0 present, 1 absent).
sentinel() {
  installer_plugin_sentinel_present "$1" "$2" "$2/.config/massa-ai/install-state.json"
  echo $?
}

# install_host <host> <home> [extra installer args...]
install_host() {
  local host="$1" home="$2"; shift 2
  mkdir -p "$home"
  MASSA_AI_SKIP_PLUGIN_REGISTRY=1 MASSA_AI_SKIP_ARTIFACT_GENERATION=1 HOME="$home" \
    bash "$PROJECT_ROOT/apps/${host}-plugin/install.sh" --user --quiet "$@" >/dev/null 2>&1
}

# drop_hooks <json_file> — empty the hooks map, leaving every sibling key.
# Surgical on purpose: deleting the file would also take Claude's
# enabledPlugins with it, and this suite is about one class at a time.
drop_hooks() {
  "$RUNNER" - "$1" <<'NODE'
const fs = require("fs");
const [, , file] = process.argv;
let data = {};
try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* absent → write a bare shell */ }
data.hooks = {};
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
NODE
}

# ── Per-host, per-class wipes ────────────────────────────────────────────────
# Each entry is "<class>|<shell wiping exactly that class from $H>".
classes_for() {
  case "$1" in
    claude)
      echo 'subagents|rm -f "$H/.claude/agents/"massa-ai-*.md'
      echo 'commands|rm -f "$H/.claude/commands/"massa-ai-*.md'
      echo 'hooks|drop_hooks "$H/.claude/settings.json"'
      ;;
    codex)
      echo 'subagents|rm -f "$H/.codex/agents/"massa-ai-*.toml'
      echo 'commands|rm -rf "$H/.codex/plugins/massa-ai/skills"'
      echo 'plugin|rm -rf "$H/.codex/plugins/massa-ai"'
      echo 'hooks|drop_hooks "$H/.codex/hooks.json"'
      ;;
    cursor)
      echo 'subagents|rm -f "$H/.cursor/agents/"massa-ai-*.md'
      echo 'commands|rm -rf "$H/.cursor/plugins/local/massa-ai/skills"'
      echo 'plugin|rm -rf "$H/.cursor/plugins/local/massa-ai"'
      echo 'hooks|drop_hooks "$H/.cursor/hooks.json"'
      ;;
    opencode)
      echo 'subagents|rm -f "$H/.config/opencode/agents/"massa-ai-*.md'
      echo 'commands|rm -f "$H/.config/opencode/command/"massa-ai-*.md'
      echo 'plugin|rm -f "$H/.config/opencode/plugins/massa-ai/index.js"'
      ;;
  esac
}

for host in claude codex cursor opencode; do
  echo ""
  echo "Host ${host}: every installed artifact class is watched"

  PRISTINE="$ROOT/${host}.pristine"
  install_host "$host" "$PRISTINE"

  H="$ROOT/${host}.work"
  rm -rf "$H"; cp -a "$PRISTINE" "$H"
  assert_eq "${host} fresh install → sentinel present" "$(sentinel "$host" "$H")" "0"

  while IFS='|' read -r cls wipe; do
    [ -n "$cls" ] || continue
    rm -rf "$H"; cp -a "$PRISTINE" "$H"
    eval "$wipe"
    assert_eq "${host} ${cls} wiped → sentinel absent (reinstall)" "$(sentinel "$host" "$H")" "1"
  done < <(classes_for "$host")
done

# ── Route case 1: Cursor's bridge route legitimately has no local hooks ──────
# Demanding them here would reinstall on every single harness run.
echo ""
echo "Cursor --prefer-bridge: no local hooks is the correct state, not a wipe"
HB="$ROOT/cursor-bridge"
mkdir -p "$HB/.claude/plugins"
printf '{"version":2,"plugins":{"massa-ai@massa-ai":[{"scope":"user","installPath":"/x","version":"9.9.9"}]}}' \
  > "$HB/.claude/plugins/installed_plugins.json"
printf '{"enabledPlugins":{"massa-ai@massa-ai":true}}' > "$HB/.claude/settings.json"
install_host cursor "$HB" --prefer-bridge
assert_eq "recorded route is bridge" \
  "$(installer_plugin_route "$RUNNER" "$HB/.config/massa-ai/install-state.json" cursor)" "bridge"
HOOK_ENTRIES="$("$RUNNER" -e '
  const fs=require("fs");
  let j={}; try{ j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); }catch{}
  process.stdout.write(JSON.stringify(j.hooks||{}).includes("massa-ai") ? "yes" : "no");
' "$HB/.cursor/hooks.json" 2>/dev/null)"
assert_eq "bridge route wired no local hooks" "$HOOK_ENTRIES" "no"
assert_eq "bridge route → sentinel present despite empty hooks" "$(sentinel cursor "$HB")" "0"
# The classes the bridge route DOES deliver are still watched.
rm -rf "$HB/.cursor/plugins/local/massa-ai"
assert_eq "bridge route + plugin wiped → sentinel absent" "$(sentinel cursor "$HB")" "1"

# ── Route case 2: Claude's marketplace route serves from the bundle ──────────
# The installer deletes ~/.claude/{agents,commands}/massa-ai-* on this route and
# skips the settings.json hook merge, so file-route expectations would loop
# forever. Fixture-built: registering for real needs the claude CLI.
echo ""
echo "Claude marketplace route: the bundle is the artifact, not ~/.claude/{agents,commands}"
HM="$ROOT/claude-marketplace"
CACHE="$HM/.claude/plugins/cache/massa-ai/massa-ai/1.0.0"
mkdir -p "$HM/.claude/plugins" "$CACHE/agents" "$CACHE/commands" "$HM/.config/massa-ai"
printf '{"version":2,"plugins":{"massa-ai@massa-ai":[{"scope":"user","installPath":"%s","version":"1.0.0"}]}}' \
  "$CACHE" > "$HM/.claude/plugins/installed_plugins.json"
printf '{"version":2,"repository":"/x","platforms":{"claude":{"installRoute":"marketplace"}}}' \
  > "$HM/.config/massa-ai/install-state.json"
touch "$CACHE/agents/massa-ai-builder.md" "$CACHE/commands/spec-driven.md"
assert_eq "marketplace bundle intact → sentinel present" "$(sentinel claude "$HM")" "0"
assert_eq "marketplace route ignores absent ~/.claude/agents" "$(sentinel claude "$HM")" "0"
rm -f "$CACHE/commands/spec-driven.md"
assert_eq "marketplace bundle lost its commands → sentinel absent" "$(sentinel claude "$HM")" "1"
touch "$CACHE/commands/spec-driven.md"
rm -f "$CACHE/agents/massa-ai-builder.md"
assert_eq "marketplace bundle lost its subagents → sentinel absent" "$(sentinel claude "$HM")" "1"
rm -rf "$CACHE"
assert_eq "marketplace installPath gone entirely → sentinel absent" "$(sentinel claude "$HM")" "1"

# ── Termination: a repaired host goes back to skipping ──────────────────────
# The failure mode a wider probe invites is the mirror of the one it fixes — a
# class the reinstall never restores makes "absent" permanent and reinstalls on
# every run, forever. test-plugin-auto-install.sh section 3 proves install →
# re-run → skip-current with the real installers for claude, codex and cursor;
# opencode is absent from that loop, so it is proven here.
echo ""
echo "Termination: opencode install → harness re-run → skip-current, not a reinstall loop"
if [ ! -f "$PROJECT_ROOT/apps/opencode-plugin/dist/index.js" ]; then
  echo "  ! SKIPPED: apps/opencode-plugin/dist/index.js is not built — run 'bun run build' first."
  echo "    (CI builds before test:scripts, so this path is exercised there.)"
else
  HT="$ROOT/opencode-terminate"; mkdir -p "$HT/.config/opencode"
  harness_run() {
    MASSA_AI_SKIP_PLUGIN_REGISTRY=1 MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
      bash "$PROJECT_ROOT/scripts/install-harness.sh" --plugins --target "$HT" --yes 2>&1
  }
  OUT_A="$(harness_run)"
  assert_contains "first harness run installs opencode" "$OUT_A" "install opencode@"
  assert_eq "after a real install → sentinel present" "$(sentinel opencode "$HT")" "0"
  OUT_B="$(harness_run)"
  assert_contains "second harness run skips at the same version" "$OUT_B" "skip opencode: already at"
  assert_not_contains "second harness run does not reinstall" "$OUT_B" "reinstall opencode"
fi

# ── Contract edges preserved from the single-class probe ────────────────────
echo ""
echo "Probe contract: unknown host, empty home, and the reinstall failure bias"
assert_eq "unknown host → 2" "$(sentinel bogus "$ROOT/claude.pristine")" "2"
assert_eq "empty target home → absent, never a fabricated match" \
  "$(installer_plugin_sentinel_present claude "" "" ; echo $?)" "1"

summary "plugin sentinel artifact classes"
