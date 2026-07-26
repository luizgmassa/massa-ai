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

summary "install-skills --uninstall"
