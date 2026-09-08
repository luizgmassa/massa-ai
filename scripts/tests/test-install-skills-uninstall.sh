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

# Scenario 11's runners. Kept separate from the two above rather than adding a
# platform argument to them, for two reasons: the claude scenarios' environment
# is part of what they measure and must not move, and these two additionally
# redirect HOME and XDG_CONFIG_HOME at a scratch dir so a --target regression
# still could not reach the developer's real ~/.config/opencode.
OC_SCRATCH="$ROOT/oc-scratch-home"; mkdir -p "$OC_SCRATCH/.config"
oc_apply() {
  env HOME="$OC_SCRATCH" XDG_CONFIG_HOME="$OC_SCRATCH/.config" \
    bash "$INSTALLER" --apply --platform opencode --target "$1" --repo-root "$PROJECT_ROOT" --yes 2>&1
}
oc_uninstall() {
  env HOME="$OC_SCRATCH" XDG_CONFIG_HOME="$OC_SCRATCH/.config" \
    bash "$INSTALLER" --uninstall --platform opencode --target "$1" --repo-root "$PROJECT_ROOT" --yes 2>&1
}

# Read the resolved OpenCode config through the installer's own resolution and
# JSONC parser. Guessing between `opencode.json` and `opencode.jsonc` here would
# make the assertions below depend on which name the installer happens to pick;
# resolveConfigPath is the only thing that knows. Shape shared with
# test-install-skills-bootstrap-file.sh:239-248.
opencode_cfg() { # opencode_cfg HOME EXPR   (EXPR evaluated with `s` bound to the doc)
  "$RUNNER" - "$PROJECT_ROOT/scripts/lib/opencode-config.cjs" "$1/.config/opencode" "$2" <<'NODE'
const fs = require("fs");
const [, , modulePath, dir, expr] = process.argv;
const { resolveConfigPath, parseJsonc } = require(modulePath);
const resolved = resolveConfigPath(dir);
const s = fs.existsSync(resolved.path) ? parseJsonc(fs.readFileSync(resolved.path, "utf8")) : {};
process.stdout.write(String(eval(expr)));
NODE
}

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

echo ""
echo "Scenario 11: uninstall removes the OpenCode instructions entry (BST-05 AC-9)"
# BST-05 AC-9 names three things uninstall must remove: the host's MASSA-AI.md,
# its managed block in AGENTS.md/CLAUDE.md, and its `instructions` entry. The
# first two were strongly sensed; the third was sensed nowhere, and the verifier
# proved it by changing the guard at scripts/install-skills.sh:1149 from
# `[ "$p" = "opencode" ]` to a never-matching literal — disabling the removal
# outright — with this suite at 25/0, test-install-skills-bootstrap-file.sh at
# 124/0, test-install-skills-apply.sh at 42/0 and
# scripts/__tests__/opencode-config.test.ts at 42/0 (validation.md, ranked gap 4).
# That last suite is why the hole is easy to miss: it exercises
# `instructionsOp("remove-apply", …)` directly and never reaches the installer
# branch that calls it, so the module is covered while its only caller is not.
#
# Structurally this is iteration 1's gap 4 on the sibling branch of the same
# `if`: the CLAUDE.md unlink case got scenario 14 in the bootstrap-file suite,
# the instructions case got nothing.
H11="$ROOT/h11"; mkdir -p "$H11/.config/opencode"
cat > "$H11/.config/opencode/opencode.jsonc" <<'JSONC'
{
  // a user comment, so the fixture exercises the jsonc path
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["~/my-notes.md", "~/team-conventions.md"]
}
JSONC
oc_apply "$H11" >/dev/null
CONTRACT11="$H11/.config/opencode/MASSA-AI.md"
# Precondition, asserted rather than assumed: without it a removal assertion
# reading 0 would pass just as happily against an install that never wrote.
assert_eq "the install put the contract into instructions (fixture precondition)" \
  "$(opencode_cfg "$H11" "(s.instructions||[]).filter(x => x === '$CONTRACT11').length")" "1"
oc_uninstall "$H11" >/dev/null
assert_eq "uninstall removed the contract from instructions (BST-05 AC-9)" \
  "$(opencode_cfg "$H11" "(s.instructions||[]).filter(x => x === '$CONTRACT11').length")" "0"
assert_eq "both of the user's own instructions entries survive (BST-05 AC-9)" \
  "$(opencode_cfg "$H11" "['~/my-notes.md','~/team-conventions.md'].filter(x => (s.instructions||[]).includes(x)).length")" "2"

# The other half of the same clause: when the removal empties the array, the key
# is deleted rather than left as `"instructions": []`. A config carrying an empty
# array is residue of an uninstall, and the assertion above cannot see it — an
# empty array filters to 0 exactly like an absent key.
H12="$ROOT/h12"; mkdir -p "$H12/.config/opencode"
cat > "$H12/.config/opencode/opencode.jsonc" <<'JSONC'
{
  "$schema": "https://opencode.ai/config.json"
}
JSONC
oc_apply "$H12" >/dev/null
CONTRACT12="$H12/.config/opencode/MASSA-AI.md"
assert_eq "the contract is the sole instructions entry (fixture precondition)" \
  "$(opencode_cfg "$H12" "JSON.stringify(s.instructions||[])")" "[\"$CONTRACT12\"]"
oc_uninstall "$H12" >/dev/null
assert_eq "the emptied instructions array is deleted, not left as [] (BST-05 AC-9)" \
  "$(opencode_cfg "$H12" "'instructions' in s ? 'present' : 'absent'")" "absent"
assert_eq "the rest of the user's config survives the key deletion (BST-05 AC-9)" \
  "$(opencode_cfg "$H12" "s['\$schema'] || 'gone'")" "https://opencode.ai/config.json"

echo ""
echo "Scenario 12: uninstall leaves no stale pointer block on codex or cursor (BST-05 AC-9)"
# Disabling the AGENTS.md removal at scripts/install-skills.sh:1131 outright —
# `if [ -f "$agents_md" ] || [ -L "$agents_md" ]` rewritten to `if false` —
# leaves a live stale pointer block in codex's and cursor's AGENTS.md. This
# suite, the one anyone changing uninstall actually runs, stayed **31/0**
# through that mutation before this scenario existed.
#
# It stayed green for a specific reason worth writing down, because it is not
# obvious from reading it: scenarios 1 and 3 do assert `$BOOTSTRAP_START` is
# absent from an AGENTS.md, but they run against **claude**, and claude has no
# AGENTS.md pointer block to remove. Claude is wired through
# `~/.claude/CLAUDE.md`'s `@MASSA-AI.md` import instead — measured: after
# `--apply --platform claude`, `~/.claude/AGENTS.md` does not exist at all and
# CLAUDE.md carries the marker. So both of those rows are true of a file the
# removal branch never had to touch, and they hold whether it works or not.
# Codex and cursor are the only hosts whose AGENTS.md carries the block, and
# neither was exercised here.
PTR_SCRATCH="$ROOT/ptr-scratch-home"; mkdir -p "$PTR_SCRATCH/.config"
# Same scratch-HOME reasoning as scenario 11's runners: a --target regression
# still could not reach the developer's real ~/.codex or ~/.cursor.
ptr_run() { # ptr_run MODE PLATFORM TARGET
  env HOME="$PTR_SCRATCH" XDG_CONFIG_HOME="$PTR_SCRATCH/.config" \
    bash "$INSTALLER" "$1" --platform "$2" --target "$3" --repo-root "$PROJECT_ROOT" --yes 2>&1
}
# `grep -c` exits 1 on zero matches, so the `|| true` is what keeps a legitimate
# "0" from being swallowed; the absent-file arm returns 0 explicitly rather than
# letting grep's exit-2 produce an empty string that no numeric assertion could
# read.
marker_hits() { # marker_hits FILE MARKER
  [ -f "$1" ] || { echo 0; return 0; }
  grep -cF -- "$2" "$1" 2>/dev/null || true
}
for pair in "codex:.codex" "cursor:.cursor"; do
  HOST="${pair%%:*}"; HOST_DIR="${pair#*:}"
  HP="$ROOT/h-ptr-$HOST"; mkdir -p "$HP/$HOST_DIR"
  # Pre-existing user content, so the removal is proven surgical rather than
  # satisfied by the whole file being deleted.
  printf '# Team conventions\n\nAlways rebase.\n' > "$HP/$HOST_DIR/AGENTS.md"
  ptr_run --apply "$HOST" "$HP" >/dev/null
  PTR_AGENTS="$HP/$HOST_DIR/AGENTS.md"
  # Precondition, asserted and not assumed: every "it is gone" check below
  # reads 0 just as happily against an install that never wrote a block.
  assert_file "$HOST AGENTS.md exists after apply (fixture precondition)" "$PTR_AGENTS"
  assert_eq "$HOST AGENTS.md carries a pointer block before uninstall (fixture precondition)" \
    "$(marker_hits "$PTR_AGENTS" "$BOOTSTRAP_START")" "1"
  ptr_run --uninstall "$HOST" "$HP" >/dev/null
  # The assertion the hole needed. On the marker itself, not on the file having
  # changed: a removal that rewrote the block into a different shape, or left
  # one half of the pair behind, still leaves an agent reading a dead pointer.
  assert_eq "$HOST AGENTS.md keeps no bootstrap start marker after uninstall (BST-05 AC-9)" \
    "$(marker_hits "$PTR_AGENTS" "$BOOTSTRAP_START")" "0"
  assert_eq "$HOST AGENTS.md keeps no bootstrap end marker after uninstall (BST-05 AC-9)" \
    "$(marker_hits "$PTR_AGENTS" "$BOOTSTRAP_END")" "0"
  # Wider than the one file, so a pointer left in a path this scenario did not
  # think to name is still caught.
  assert_eq "no start marker survives anywhere under the $HOST home (BST-05 AC-9)" \
    "$(grep -rlF "$BOOTSTRAP_START" "$HP" 2>/dev/null | wc -l | tr -d ' ')" "0"
  # Surgical, not wholesale.
  assert_contains "$HOST AGENTS.md user content survives the removal (BST-05 AC-9)" \
    "$(cat "$PTR_AGENTS" 2>/dev/null)" "Always rebase."
done

summary "install-skills --uninstall"
