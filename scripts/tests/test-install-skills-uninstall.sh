#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-skills-uninstall.sh
#
# scripts/install-skills.sh --uninstall ownership rules:
# only symlinks resolving inside --repo-root are removed; foreign symlinks,
# regular files, and unrelated AGENTS.md content are left alone.
#
# Usage: bash scripts/tests/test-install-skills-uninstall.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-skills.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-skills-uninstall.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
export PATH="$(make_mock_agents "$ROOT/bin"):$PATH"

RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

BOOTSTRAP_START="$(grep -m1 '^BOOTSTRAP_START=' "$INSTALLER" | cut -d'"' -f2)"
BOOTSTRAP_END="$(grep -m1 '^BOOTSTRAP_END=' "$INSTALLER" | cut -d'"' -f2)"
# The backup suffix comes from the installer's own shared library rather than
# being restated here, so a rename of the literal reddens this suite instead of
# silently making its glob match nothing.
BACKUP_SUFFIX="$(grep -m1 '^MASSA_AI_BACKUP_SUFFIX=' "${PROJECT_ROOT}/scripts/lib/installer-shared.sh" | cut -d'"' -f2)"

apply()     { bash "$INSTALLER" --apply --platform claude --target "$1" --repo-root "$PROJECT_ROOT" --yes --verbose 2>&1; }
uninstall() { bash "$INSTALLER" --uninstall --platform claude --target "$1" --repo-root "$PROJECT_ROOT" --yes --verbose 2>&1; }

echo "Scenario 1: uninstall removes every repo-owned symlink and the block"
H1="$ROOT/h1"; mkdir -p "$H1"
apply "$H1" >/dev/null
OUT="$(uninstall "$H1")"; RC=$?
assert_eq "uninstall exits 0" "$RC" "0"
assert_eq "no symlinks left" "$(find "$H1/.claude" -type l 2>/dev/null | wc -l | tr -d ' ')" "0"
assert_not_contains "bootstrap block removed" "$(cat "$H1/.claude/AGENTS.md")" "$BOOTSTRAP_START"

echo ""
echo "Scenario 2: a foreign symlink in the skills dir survives"
H2="$ROOT/h2"; mkdir -p "$H2" "$ROOT/somewhere-else"
apply "$H2" >/dev/null
ln -s "$ROOT/somewhere-else" "$H2/.claude/skills/my-own-skill"
# Track it in state so the uninstaller actually considers it — the ownership
# check (does it resolve inside --repo-root?) is what must save it.
"$RUNNER" - "$H2/.config/massa-ai/install-state.json" <<'NODE'
const fs = require("fs");
const f = process.argv[2];
const s = JSON.parse(fs.readFileSync(f, "utf8"));
s.platforms.claude.skills.push("my-own-skill");
fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
NODE
uninstall "$H2" >/dev/null
assert_symlink_to "foreign symlink untouched" "$H2/.claude/skills/my-own-skill" "$ROOT/somewhere-else"

echo ""
echo "Scenario 3: user content in AGENTS.md survives block removal"
H3="$ROOT/h3"; mkdir -p "$H3/.claude"
printf '# Team conventions\n\nAlways rebase.\n' > "$H3/.claude/AGENTS.md"
apply "$H3" >/dev/null
uninstall "$H3" >/dev/null
CONTENT="$(cat "$H3/.claude/AGENTS.md")"
assert_contains "user heading survives" "$CONTENT" "# Team conventions"
assert_contains "user body survives" "$CONTENT" "Always rebase."
assert_not_contains "managed block gone" "$CONTENT" "$BOOTSTRAP_START"

echo ""
echo "Scenario 4: a regular file in the skills dir is never deleted"
H4="$ROOT/h4"; mkdir -p "$H4"
apply "$H4" >/dev/null
printf 'notes\n' > "$H4/.claude/skills/README.txt"
uninstall "$H4" >/dev/null
assert_file "unrelated regular file survives" "$H4/.claude/skills/README.txt"
assert_eq "its contents are unchanged" "$(cat "$H4/.claude/skills/README.txt")" "notes"

echo ""
echo "Scenario 5: the platform record is dropped from state"
H5="$ROOT/h5"; mkdir -p "$H5"
apply "$H5" >/dev/null
uninstall "$H5" >/dev/null
HAS_CLAUDE="$("$RUNNER" - "$H5/.config/massa-ai/install-state.json" <<'NODE'
const fs = require("fs");
const s = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(s.platforms.claude ? "yes" : "no");
NODE
)"
assert_eq "claude record removed from state" "$HAS_CLAUDE" "no"

echo ""
echo "Scenario 6: uninstalling twice is safe"
OUT6="$(uninstall "$H5")"; RC6=$?
assert_eq "second uninstall exits 0" "$RC6" "0"

echo ""
echo "Scenario 7: uninstall with no prior install is a no-op, not an error"
H7="$ROOT/h7"; mkdir -p "$H7"
BEFORE7="$(tree_fingerprint "$H7")"
OUT7="$(uninstall "$H7")"; RC7=$?
assert_eq "no-op uninstall exits 0" "$RC7" "0"
assert_not_contains "nothing was removed" "$OUT7" "Removed symlink"

echo ""
echo "Scenario 8: a plugin-owned platform (D3/PDO-09) is never touched by this installer"
H8="$ROOT/h8"; mkdir -p "$H8/.claude/skills/massa-ai"
printf 'plugin content\n' > "$H8/.claude/skills/massa-ai/PLUGIN-OWNED.md"
mkdir -p "$H8/.config/massa-ai"
cat > "$H8/.config/massa-ai/install-state.json" <<EOF
{
  "version": 2,
  "repository": "$PROJECT_ROOT",
  "platforms": {
    "claude": { "root": "$H8/.claude", "skills": ["massa-ai"], "skillsOwner": "plugin" }
  }
}
EOF
BEFORE8="$(tree_fingerprint "$H8/.claude")"
OUT8="$(uninstall "$H8")"; RC8=$?
AFTER8="$(tree_fingerprint "$H8/.claude")"
assert_eq "uninstall against a plugin-owned platform exits 0" "$RC8" "0"
assert_eq "plugin-owned skills tree is byte-for-byte unchanged" "$AFTER8" "$BEFORE8"
HAS_CLAUDE8="$("$RUNNER" - "$H8/.config/massa-ai/install-state.json" <<'NODE'
const fs = require("fs");
const s = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(s.platforms.claude && s.platforms.claude.skillsOwner === "plugin" ? "yes" : "no");
NODE
)"
assert_eq "plugin-owned record survives (not dropped by the repo uninstaller)" "$HAS_CLAUDE8" "yes"

echo ""
echo "Scenario 9: a backup an install left behind is retained AND named (BST-05 AC-9c)"
# spec.md:106. The "leave it in place" half already holds; the "name it in the
# uninstall report" half is what this scenario senses, and it was implemented
# nowhere — a backup left silently is a backup the user never finds.
#
# A first install creates no backup at all: bootstrap_op's guard is
# `[ "$backup" = "1" ] && [ -f "$target" ]`, and MASSA-AI.md does not exist yet.
# So the fixture is the real shape the backup exists for — a hand-edited
# MASSA-AI.md that a later --apply overwrites (design.md:452).
H9="$ROOT/h9"; mkdir -p "$H9"
apply "$H9" >/dev/null
printf '%s\nhand-edited\n%s\n' "$BOOTSTRAP_START" "$BOOTSTRAP_END" > "$H9/.claude/MASSA-AI.md"
apply "$H9" >/dev/null
BAK9="$(find "$H9/.claude" -maxdepth 1 -name "*${BACKUP_SUFFIX}-*" 2>/dev/null | LC_ALL=C sort | head -n1)"
assert_ne "the overwrite really left a backup to report" "$BAK9" ""
BAK9_SHA="$(shasum -a 256 "$BAK9" 2>/dev/null | cut -d' ' -f1)"
OUT9="$(uninstall "$H9")"
assert_file "the backup is left in place (BST-05 AC-9c)" "$BAK9"
assert_eq "the retained backup keeps the bytes it saved (BST-05 AC-9c)" \
  "$(shasum -a 256 "$BAK9" 2>/dev/null | cut -d' ' -f1)" "$BAK9_SHA"
assert_contains "the uninstall report names the retained backup (BST-05 AC-9c)" \
  "$OUT9" "$BAK9"
# The machine-readable half of the same report. `record` is what puts the path
# into --json's `results`; `vinfo` prints to the console only, so a text-only
# assertion is satisfied by the vinfo alone and leaves the JSON report silent
# (observed: dropping the `record` call left this suite 22/0 without it).
# Asserted on a second uninstall of the same home, which is also the state a
# user reaches by re-running: the backup is still retained and still named.
JSON9="$(bash "$INSTALLER" --uninstall --platform claude --target "$H9" \
  --repo-root "$PROJECT_ROOT" --yes --json 2>/dev/null)"
assert_contains "the JSON uninstall report names the retained backup (BST-05 AC-9c)" \
  "$JSON9" "$BAK9"
assert_file "the backup survives a repeated uninstall (BST-05 AC-9c)" "$BAK9"

echo ""
echo "Scenario 10: an uninstall with no backup reports none"
# The complementary direction. Without it, a branch that printed a retained-backup
# line unconditionally — naming a path that does not exist — would pass scenario 9.
H10="$ROOT/h10"; mkdir -p "$H10"
apply "$H10" >/dev/null
assert_eq "a first install leaves no backup" \
  "$(find "$H10/.claude" -maxdepth 1 -name "*${BACKUP_SUFFIX}-*" 2>/dev/null | wc -l | tr -d ' ')" "0"
OUT10="$(uninstall "$H10")"
assert_not_contains "no retained-backup line without a backup (BST-05 AC-9c)" \
  "$OUT10" "$BACKUP_SUFFIX-"
# And no row at all, not merely no path. An empty `find` result still feeds one
# empty line through the reader, so a scan without its empty-line guard emits
# `"target": "", "message": "Left in place: "` on every uninstall that retained
# nothing — a report entry for an artifact that does not exist. The text
# assertion above cannot see that, because an empty path contains no suffix.
JSON10="$(bash "$INSTALLER" --uninstall --platform claude --target "$H10" \
  --repo-root "$PROJECT_ROOT" --yes --json 2>/dev/null)"
assert_not_contains "no retained row at all without a backup (BST-05 AC-9c)" \
  "$JSON10" '"status": "retained"'

summary "install-skills --uninstall"
