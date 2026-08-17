#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-skills-stale-apply.sh
#
# IPT-04: scripts/install-skills.sh --apply removes a stale skill.
#
# A skill recorded in install-state.json for a host, no longer present in
# skills/, and still massa-ai-owned (repo-resolving symlink, or a copy plus
# its .massa-ai-owned-<name> marker) must be removed by --apply — not merely
# reported by --check, which is all that happened before this fix.
#
# The critical case is (b): a plugin-owned stale record must survive --apply
# untouched. apply_platform() computes no `owner` variable at all before this
# fix, so a naive port of uninstall_platform()'s removal loop with no gate
# would delete a plugin tarball's skill directories the moment a name left
# SKILL_NAMES — see spec.md AC-04.4/AC-04.4b and design.md D5.
#
# Usage: bash scripts/tests/test-install-skills-stale-apply.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-skills.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-skills-stale-apply.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
export PATH="$(make_mock_agents "$ROOT/bin"):$PATH"

RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

apply()   { bash "$INSTALLER" --apply --platform claude --target "$1" --repo-root "$PROJECT_ROOT" --yes --verbose 2>&1; }
dryrun()  { bash "$INSTALLER" --dry-run --platform claude --target "$1" --repo-root "$PROJECT_ROOT" 2>&1; }
checkcmd(){ bash "$INSTALLER" --check --platform claude --target "$1" --repo-root "$PROJECT_ROOT" 2>&1; }

# plant_stale_repo_owned HOME NAME — a copy-based stale skill this installer
# owns (directory + its .massa-ai-owned-<name> marker), tracked in state with
# skillsOwner "repo".
plant_stale_repo_owned() {
  local home="$1" name="$2"
  mkdir -p "$home/.claude/skills/$name"
  printf 'stale content\n' > "$home/.claude/skills/$name/SKILL.md"
  : > "$home/.claude/skills/.massa-ai-owned-$name"
  "$RUNNER" - "$home/.config/massa-ai/install-state.json" "$name" <<'NODE'
const fs = require("fs");
const [, , f, name] = process.argv;
const s = JSON.parse(fs.readFileSync(f, "utf8"));
if (!s.platforms.claude.skills.includes(name)) s.platforms.claude.skills.push(name);
fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
NODE
}

echo "Scenario a: a repo-owned stale skill IS removed by --apply"
HA="$ROOT/ha"; mkdir -p "$HA"
apply "$HA" >/dev/null
plant_stale_repo_owned "$HA" "ghost-copy"
OUTA="$(apply "$HA")"; RCA=$?
assert_eq "apply exits 0" "$RCA" "0"
assert_contains "removal reported" "$OUTA" "Removed stale copy:"
assert_no_file "stale skill directory is gone" "$HA/.claude/skills/ghost-copy/SKILL.md"
assert_no_file "stale skill directory itself is gone" "$HA/.claude/skills/ghost-copy"
assert_no_file "ownership marker is gone" "$HA/.claude/skills/.massa-ai-owned-ghost-copy"

echo ""
echo "Scenario b (CRITICAL): a plugin-owned stale skill is NOT touched by --apply"
HB="$ROOT/hb"; mkdir -p "$HB/.claude/skills/ghost-plugin" "$HB/.config/massa-ai"
printf 'plugin content\n' > "$HB/.claude/skills/ghost-plugin/PLUGIN-OWNED.md"
: > "$HB/.claude/skills/.massa-ai-owned-ghost-plugin"
cat > "$HB/.config/massa-ai/install-state.json" <<EOF
{
  "version": 2,
  "repository": "$PROJECT_ROOT",
  "platforms": {
    "claude": { "root": "$HB/.claude", "skills": ["ghost-plugin"], "skillsOwner": "plugin" }
  }
}
EOF
BEFOREB="$(cat "$HB/.claude/skills/ghost-plugin/PLUGIN-OWNED.md")"
OUTB="$(apply "$HB")"; RCB=$?
assert_eq "apply against a plugin-owned platform exits 0" "$RCB" "0"
assert_not_contains "no stale removal reported for the plugin-owned skill" "$OUTB" "ghost-plugin"
assert_file "plugin-owned stale directory survives" "$HB/.claude/skills/ghost-plugin/PLUGIN-OWNED.md"
assert_eq "plugin-owned stale content is byte-identical" "$(cat "$HB/.claude/skills/ghost-plugin/PLUGIN-OWNED.md")" "$BEFOREB"
assert_file "plugin-owned marker survives" "$HB/.claude/skills/.massa-ai-owned-ghost-plugin"

echo ""
echo "Scenario c: a stale directory WITHOUT its ownership marker is never removed"
HC="$ROOT/hc"; mkdir -p "$HC"
apply "$HC" >/dev/null
mkdir -p "$HC/.claude/skills/ghost-unmarked"
printf 'unmarked\n' > "$HC/.claude/skills/ghost-unmarked/SKILL.md"
# Tracked in state, but no .massa-ai-owned-ghost-unmarked marker written.
"$RUNNER" - "$HC/.config/massa-ai/install-state.json" <<'NODE'
const fs = require("fs");
const f = process.argv[2];
const s = JSON.parse(fs.readFileSync(f, "utf8"));
s.platforms.claude.skills.push("ghost-unmarked");
fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
NODE
OUTC="$(apply "$HC")"; RCC=$?
assert_eq "apply exits 0" "$RCC" "0"
assert_not_contains "no removal reported for the unmarked directory" "$OUTC" "ghost-unmarked"
assert_file "unmarked stale directory survives" "$HC/.claude/skills/ghost-unmarked/SKILL.md"

echo ""
echo "Scenario d: --dry-run reports would-change and removes nothing"
HD="$ROOT/hd"; mkdir -p "$HD"
apply "$HD" >/dev/null
plant_stale_repo_owned "$HD" "ghost-copy"
BEFORED="$(tree_fingerprint "$HD/.claude")"
OUTD="$(dryrun "$HD")"; RCD=$?
AFTERD="$(tree_fingerprint "$HD/.claude")"
assert_eq "dry-run exits 0" "$RCD" "0"
assert_contains "dry-run previews the stale removal" "$OUTD" "Would remove stale copy:"
assert_eq "dry-run wrote nothing" "$AFTERD" "$BEFORED"
assert_file "target still exists after dry-run" "$HD/.claude/skills/ghost-copy/SKILL.md"

echo ""
echo "Scenario e: a second --apply is a no-op"
HE="$ROOT/he"; mkdir -p "$HE"
apply "$HE" >/dev/null
plant_stale_repo_owned "$HE" "ghost-copy"
apply "$HE" >/dev/null   # first apply removes it (scenario a's behaviour)
assert_no_file "stale skill removed by the first apply" "$HE/.claude/skills/ghost-copy"
OUTE="$(apply "$HE")"; RCE=$?
assert_eq "second apply exits 0" "$RCE" "0"
assert_not_contains "second apply reports no stale removal" "$OUTE" "Removed stale copy:"
assert_not_contains "second apply reports no would-be removal either" "$OUTE" "ghost-copy"

echo ""
echo "Scenario f: --check still reports stale drift and changes nothing"
HF="$ROOT/hf"; mkdir -p "$HF"
apply "$HF" >/dev/null
plant_stale_repo_owned "$HF" "ghost-copy"
BEFOREF="$(tree_fingerprint "$HF/.claude")"
OUTF="$(checkcmd "$HF")"; RCF=$?
AFTERF="$(tree_fingerprint "$HF/.claude")"
assert_eq "check exits 1 (drift found)" "$RCF" "1"
assert_contains "stale copy named as drift" "$OUTF" "Stale copy: ghost-copy"
assert_eq "check wrote nothing" "$AFTERF" "$BEFOREF"
assert_file "target still exists after check" "$HF/.claude/skills/ghost-copy/SKILL.md"

summary "install-skills --apply stale removal (IPT-04)"
