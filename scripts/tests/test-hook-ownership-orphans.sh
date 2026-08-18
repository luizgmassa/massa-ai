#!/usr/bin/env bash
# Hook entries this project wrote must be recognisable as ours even without the
# _massaAiOwned marker — otherwise they are orphans that fire forever.
#
# All three hook-writing installers identified their own entries SOLELY by the
# `_massaAiOwned: true` marker, in both directions: the install path used it to
# avoid appending a duplicate, and the uninstall/route-change path used it to
# remove them. An entry that carries no marker is therefore invisible to both —
# it can never be deduped and can never be removed.
#
# That is not hypothetical. apps/claude-plugin/settings.json.template is a
# hand-merge guide that shipped WITHOUT the marker and tells the reader to
# rewrite the command to an absolute path. Measured live 2026-08-17 on a machine
# whose Claude was on the marketplace route: 5 unmarked massa-ai blocks in
# ~/.claude/settings.json beside the plugin bundle's own hooks/hooks.json, and
# every lifecycle event ingested twice. The route change had run
# remove_file_route_artifacts, which matched nothing and reported success.
#
# The fix identifies our entries by what they are — a command referencing the
# massa-ai-hook binary — with the marker kept as the primary signal. These cases
# pin both halves of that: our unmarked entries go, and the user's stay.

set -uo pipefail
SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SUITE_DIR/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
. "$SUITE_DIR/lib/installer-test-helpers.sh"

RUNNER="bun"; command -v node >/dev/null 2>&1 && RUNNER="node"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT

# A mock `claude` CLI, so the marketplace route is reachable without the real
# binary (CI has none). Same strategy as test-plugin-marketplace-cache-refresh.sh.
MOCK_BIN="$ROOT/mockbin"; mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/claude" <<'MOCK'
#!/usr/bin/env bash
REG="$HOME/.claude/plugins/installed_plugins.json"
case "$*" in
  "plugin marketplace --help"|"plugin update --help"|"plugin marketplace add"*) exit 0 ;;
  "plugin install"*)
    mkdir -p "$(dirname "$REG")"
    [[ -f "$REG" ]] || printf '{"version":2,"plugins":{"massa-ai@massa-ai":[{"scope":"user","version":"9.9.9","installPath":"/mock"}]}}\n' > "$REG"
    exit 0 ;;
  *) exit 0 ;;
esac
MOCK
chmod +x "$MOCK_BIN/claude"

# count_ours <file> — massa-ai hook commands anywhere under .hooks
count_ours() {
  [ -f "$1" ] || { echo 0; return; }
  "$RUNNER" -e '
    const fs=require("fs");
    let j={}; try{ j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); }catch{}
    console.log((JSON.stringify(j.hooks||{}).match(/massa-ai-hook/g)||[]).length);
  ' "$1" 2>/dev/null || echo 0
}

has_text() { # has_text <file> <needle>
  [ -f "$1" ] && grep -q "$2" "$1"
}

# residue <file> — hook blocks left behind holding no commands, plus event keys
# left holding no blocks. Counting massa-ai-hook occurrences alone is too weak:
# a removal that strips our COMMANDS but keeps their now-empty matcher blocks
# reads as clean by that measure while leaving junk in the user's config. This
# is what a marker-only ownership test actually degrades to, so it is what the
# mutation has to be visible in.
residue() {
  [ -f "$1" ] || { echo 0; return; }
  "$RUNNER" -e '
    const fs=require("fs");
    let j={}; try{ j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); }catch{}
    let n=0;
    for (const arr of Object.values(j.hooks||{})) {
      if (!Array.isArray(arr) || arr.length === 0) { n++; continue; }
      for (const b of arr) {
        if (b && Array.isArray(b.hooks) && b.hooks.length === 0) n++;
        else if (b && !Array.isArray(b.hooks) && !b.command) n++;
      }
    }
    console.log(n);
  ' "$1" 2>/dev/null || echo 0
}

event_present() { # event_present <file> <event> → prints yes|no
  "$RUNNER" -e '
    const fs=require("fs");
    let j={}; try{ j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); }catch{}
    console.log(Object.prototype.hasOwnProperty.call(j.hooks||{}, process.argv[2]) ? "yes" : "no");
  ' "$1" "$2" 2>/dev/null || echo no
}

backup_count() { find "$1" -maxdepth 1 -name '*.massa-ai.bak-*' 2>/dev/null | wc -l | tr -d ' '; }

run_installer() { # run_installer <host> <home> [args...]
  local host="$1" home="$2"; shift 2
  MASSA_AI_SKIP_PLUGIN_REGISTRY=1 MASSA_AI_SKIP_ARTIFACT_GENERATION=1 HOME="$home" \
    bash "$PROJECT_ROOT/apps/${host}-plugin/install.sh" --user --quiet "$@" >/dev/null 2>&1
}

# ── Claude: the measured case ───────────────────────────────────────────────
echo ""
echo "Claude marketplace route: unmarked entries are removed, user hooks are not"
H="$ROOT/claude"; mkdir -p "$H/.claude"
# Exactly the live shape: no marker, absolute path, beside a user hook — plus
# one under an event outside the 5 this release writes, and one sharing a block
# with a user command.
cat > "$H/.claude/settings.json" <<'JSON'
{
  "model": "opus",
  "hooks": {
    "PreToolUse":   [ { "matcher": "*", "hooks": [ { "type": "command", "command": "rtk hook claude" } ] } ],
    "PreCompact":   [ { "hooks": [ { "type": "command", "command": "bun run \"/repo/apps/claude-plugin/hooks/massa-ai-hook.ts\" pre-compact" } ] } ],
    "Stop":         [ { "hooks": [ { "type": "command", "command": "bun run \"/repo/apps/claude-plugin/hooks/massa-ai-hook.ts\" stop" } ] } ],
    "SessionEnd":   [ { "hooks": [ { "type": "command", "command": "bun run \"/repo/apps/claude-plugin/hooks/massa-ai-hook.ts\" session-end" } ] } ],
    "Notification": [ { "hooks": [
        { "type": "command", "command": "my-own-notifier" },
        { "type": "command", "command": "bun run \"/repo/apps/claude-plugin/hooks/massa-ai-hook.ts\" notify" } ] } ]
  }
}
JSON
assert_eq "fixture starts with 4 unmarked massa-ai entries" "$(count_ours "$H/.claude/settings.json")" "4"
MASSA_AI_SKIP_ARTIFACT_GENERATION=1 HOME="$H" PATH="$MOCK_BIN:$PATH" \
  bash "$PROJECT_ROOT/apps/claude-plugin/install.sh" --user --quiet >/dev/null 2>&1
assert_eq "marketplace install → exit 0" "$?" "0"
assert_eq "every unmarked massa-ai entry removed" "$(count_ours "$H/.claude/settings.json")" "0"
assert_eq "no empty blocks or empty events left behind" "$(residue "$H/.claude/settings.json")" "0"
assert_eq "an all-ours event key is deleted, not emptied (PreCompact)" \
  "$(event_present "$H/.claude/settings.json" PreCompact)" "no"
assert_eq "an all-ours event outside the 5 written is deleted too (SessionEnd)" \
  "$(event_present "$H/.claude/settings.json" SessionEnd)" "no"
check "user hook 'rtk hook claude' preserved" "$(has_text "$H/.claude/settings.json" 'rtk hook claude'; echo $?)"
check "user command in a SHARED block preserved" "$(has_text "$H/.claude/settings.json" 'my-own-notifier'; echo $?)"
check "unrelated settings key preserved" "$(has_text "$H/.claude/settings.json" '"model"'; echo $?)"
assert_ne "settings.json backed up before removal" "$(backup_count "$H/.claude")" "0"

echo ""
echo "Claude file route: an unmarked entry is not duplicated by a fresh install"
H="$ROOT/claude-dedupe"; mkdir -p "$H/.claude"
cat > "$H/.claude/settings.json" <<'JSON'
{ "hooks": { "PreCompact": [ { "hooks": [ { "type": "command",
    "command": "bun run \"/repo/apps/claude-plugin/hooks/massa-ai-hook.ts\" pre-compact" } ] } ] } }
JSON
run_installer claude "$H"
PRE="$("$RUNNER" -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  console.log((JSON.stringify(j.hooks.PreCompact||[]).match(/massa-ai-hook/g)||[]).length);
' "$H/.claude/settings.json")"
assert_eq "PreCompact holds exactly one massa-ai hook, not two" "$PRE" "1"

# ── Codex and Cursor: the same filter, the same gap ─────────────────────────
# Both identified our entries by the marker alone. Neither has a documented
# hand-merge template today, so no orphan has been observed in the wild — but
# the removal path is the same code shape, and an entry written by a release
# predating the marker is unremovable by exactly the same mechanism.
echo ""
echo "Codex: unmarked entries removed on uninstall, user entries kept"
H="$ROOT/codex"; mkdir -p "$H/.codex"
cat > "$H/.codex/hooks.json" <<'JSON'
{ "hooks": {
    "SessionStart": [ { "hooks": [ { "type": "command", "command": "/old/path/hooks/massa-ai-hook session-start" } ] } ],
    "SessionEnd":   [ { "hooks": [ { "type": "command", "command": "/old/path/hooks/massa-ai-hook session-end" } ] } ],
    "PreToolUse":   [ { "hooks": [ { "type": "command", "command": "user-linter" } ] } ] } }
JSON
assert_eq "codex fixture starts with 2 unmarked massa-ai entries" "$(count_ours "$H/.codex/hooks.json")" "2"
run_installer codex "$H" --uninstall
assert_eq "codex unmarked entries removed" "$(count_ours "$H/.codex/hooks.json")" "0"
check "codex user hook preserved" "$(has_text "$H/.codex/hooks.json" 'user-linter'; echo $?)"
assert_ne "codex hooks.json backed up before removal" "$(backup_count "$H/.codex")" "0"

echo ""
echo "Codex: an unmarked entry is not duplicated by a fresh install"
H="$ROOT/codex-dedupe"; mkdir -p "$H/.codex"
cat > "$H/.codex/hooks.json" <<'JSON'
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command",
    "command": "/old/path/hooks/massa-ai-hook session-start" } ] } ] } }
JSON
run_installer codex "$H"
SS="$("$RUNNER" -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  console.log((JSON.stringify(j.hooks.SessionStart||[]).match(/massa-ai-hook/g)||[]).length);
' "$H/.codex/hooks.json")"
assert_eq "codex SessionStart holds exactly one massa-ai hook" "$SS" "1"

echo ""
echo "Cursor: unmarked entries removed on uninstall, user entries kept"
H="$ROOT/cursor"; mkdir -p "$H/.cursor"
cat > "$H/.cursor/hooks.json" <<'JSON'
{ "version": 1, "hooks": {
    "beforeSubmitPrompt": [ { "command": "/old/plugins/local/massa-ai/hooks/massa-ai-hook before-submit-prompt" } ],
    "afterFileEdit":      [ { "command": "/old/plugins/local/massa-ai/hooks/massa-ai-hook after-file-edit" } ],
    "stop":               [ { "command": "user-cleanup" } ] } }
JSON
assert_eq "cursor fixture starts with 2 unmarked massa-ai entries" "$(count_ours "$H/.cursor/hooks.json")" "2"
run_installer cursor "$H" --uninstall
assert_eq "cursor unmarked entries removed" "$(count_ours "$H/.cursor/hooks.json")" "0"
check "cursor user hook preserved" "$(has_text "$H/.cursor/hooks.json" 'user-cleanup'; echo $?)"
assert_ne "cursor hooks.json backed up before removal" "$(backup_count "$H/.cursor")" "0"

echo ""
echo "Cursor: an unmarked entry is not duplicated by a fresh install"
H="$ROOT/cursor-dedupe"; mkdir -p "$H/.cursor"
cat > "$H/.cursor/hooks.json" <<'JSON'
{ "version": 1, "hooks": { "beforeSubmitPrompt": [
    { "command": "/old/plugins/local/massa-ai/hooks/massa-ai-hook before-submit-prompt" } ] } }
JSON
run_installer cursor "$H"
BSP="$("$RUNNER" -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  console.log((JSON.stringify(j.hooks.beforeSubmitPrompt||[]).match(/massa-ai-hook/g)||[]).length);
' "$H/.cursor/hooks.json")"
assert_eq "cursor beforeSubmitPrompt holds exactly one massa-ai hook" "$BSP" "1"

# ── The template that produced the orphans ──────────────────────────────────
echo ""
echo "settings.json.template carries the ownership marker it tells readers to merge"
TPL="$PROJECT_ROOT/apps/claude-plugin/settings.json.template"
MARKED="$("$RUNNER" -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const blocks=Object.values(j.hooks||{}).flat();
  console.log(`${blocks.filter(b=>b._massaAiOwned===true).length}/${blocks.length}`);
' "$TPL")"
assert_eq "every template hook block is marked" "$MARKED" "5/5"

summary "hook ownership orphans"
