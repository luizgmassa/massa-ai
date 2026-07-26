#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-skills-check.sh
#
# scripts/install-skills.sh --check and --dry-run: the two read-only exports.
# Both must report accurately AND mutate nothing — asserted with a recursive
# fingerprint of the fake home taken before and after, not just an exit code.
#
# Usage: bash scripts/tests/test-install-skills-check.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-skills.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-skills-check.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
export PATH="$(make_mock_agents "$ROOT/bin"):$PATH"

RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

FIRST_SKILL=""
for d in "$PROJECT_ROOT"/skills/*/; do
  [ -f "${d}SKILL.md" ] || continue
  FIRST_SKILL="$(basename "$d")"; break
done

apply()     { bash "$INSTALLER" --apply --platform claude --target "$1" --repo-root "$PROJECT_ROOT" --yes 2>&1; }
check()     { bash "$INSTALLER" --check --platform claude --target "$1" --repo-root "$PROJECT_ROOT" "${@:2}" 2>&1; }
dryrun()    { bash "$INSTALLER" --dry-run --platform claude --target "$1" --repo-root "$PROJECT_ROOT" 2>&1; }

echo "Scenario 1: a clean install reports no drift and writes nothing"
H1="$ROOT/h1"; mkdir -p "$H1"
apply "$H1" >/dev/null
BEFORE="$(tree_fingerprint "$H1")"
OUT="$(check "$H1")"; RC=$?
AFTER="$(tree_fingerprint "$H1")"
assert_eq "clean check exits 0" "$RC" "0"
assert_eq "check wrote nothing" "$AFTER" "$BEFORE"
assert_not_contains "no drift reported" "$OUT" "[drift]"

echo ""
echo "Scenario 2: a missing symlink is drift (exit 1), still read-only"
H2="$ROOT/h2"; mkdir -p "$H2"
apply "$H2" >/dev/null
rm "$H2/.claude/skills/$FIRST_SKILL"
BEFORE2="$(tree_fingerprint "$H2")"
OUT2="$(check "$H2")"; RC2=$?
AFTER2="$(tree_fingerprint "$H2")"
assert_eq "missing symlink exits 1" "$RC2" "1"
assert_contains "missing symlink named" "$OUT2" "Missing symlink: $FIRST_SKILL"
assert_eq "drifted check still wrote nothing" "$AFTER2" "$BEFORE2"

echo ""
echo "Scenario 3: a symlink pointing elsewhere is drift"
H3="$ROOT/h3"; mkdir -p "$H3" "$ROOT/decoy"
apply "$H3" >/dev/null
rm "$H3/.claude/skills/$FIRST_SKILL"
ln -s "$ROOT/decoy" "$H3/.claude/skills/$FIRST_SKILL"
OUT3="$(check "$H3")"; RC3=$?
assert_eq "wrong target exits 1" "$RC3" "1"
assert_contains "wrong target described" "$OUT3" "points to"

echo ""
echo "Scenario 4: a regular file where a symlink belongs is drift"
H4="$ROOT/h4"; mkdir -p "$H4"
apply "$H4" >/dev/null
rm "$H4/.claude/skills/$FIRST_SKILL"
printf 'not a symlink\n' > "$H4/.claude/skills/$FIRST_SKILL"
OUT4="$(check "$H4")"; RC4=$?
assert_eq "regular file exits 1" "$RC4" "1"
assert_contains "reported as not-a-symlink" "$OUT4" "is not a symlink"

echo ""
echo "Scenario 5: a stale tracked skill that no longer exists is drift"
H5="$ROOT/h5"; mkdir -p "$H5"
apply "$H5" >/dev/null
# Track a skill that is no longer in the repo, and leave a repo-pointing link.
ln -s "$PROJECT_ROOT/skills" "$H5/.claude/skills/ghost-skill"
"$RUNNER" - "$H5/.config/massa-ai/install-state.json" <<'NODE'
const fs = require("fs");
const f = process.argv[2];
const s = JSON.parse(fs.readFileSync(f, "utf8"));
s.platforms.claude.skills.push("ghost-skill");
fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
NODE
OUT5="$(check "$H5")"; RC5=$?
assert_eq "stale symlink exits 1" "$RC5" "1"
assert_contains "stale symlink named" "$OUT5" "Stale symlink: ghost-skill"

echo ""
echo "Scenario 6: --check --json emits a machine-readable drift status"
OUT6="$(check "$H2" --json)"
assert_contains "json status is drift" "$OUT6" '"status": "drift"'
assert_contains "json action is check" "$OUT6" '"action": "check"'

echo ""
echo "Scenario 7: --dry-run previews without touching disk"
H7="$ROOT/h7"; mkdir -p "$H7"
BEFORE7="$(tree_fingerprint "$H7")"
OUT7="$(dryrun "$H7")"; RC7=$?
AFTER7="$(tree_fingerprint "$H7")"
assert_eq "dry-run exits 0" "$RC7" "0"
assert_contains "dry-run previews the symlink" "$OUT7" "Would symlink:"
assert_contains "dry-run previews the bootstrap write" "$OUT7" "Would write bootstrap block"
assert_eq "dry-run wrote nothing" "$AFTER7" "$BEFORE7"
assert_no_file "dry-run created no state file" "$H7/.config/massa-ai/install-state.json"

summary "install-skills --check / --dry-run"
