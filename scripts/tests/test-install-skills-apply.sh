#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-skills-apply.sh
#
# scripts/install-skills.sh --apply: symlink creation, idempotence, the
# AGENTS.md bootstrap block, and the non-symlink conflict abort.
#
# Everything runs against a mktemp fake home; the real $HOME is never touched.
#
# Usage: bash scripts/tests/test-install-skills-apply.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-skills.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-skills-apply.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

MOCK_BIN="$(make_mock_agents "$ROOT/bin")"
export PATH="$MOCK_BIN:$PATH"

BOOTSTRAP_START="$(grep -m1 '^BOOTSTRAP_START=' "$INSTALLER" | cut -d'"' -f2)"

run_apply() { # run_apply HOME [extra args...]
  local home="$1"; shift
  bash "$INSTALLER" --apply --platform claude --target "$home" \
    --repo-root "$PROJECT_ROOT" --yes "$@" 2>&1
}

echo "Scenario 1: fresh apply creates one symlink per skill + the bootstrap block"
H1="$ROOT/h1"; mkdir -p "$H1"
OUT="$(run_apply "$H1")"; RC=$?
assert_eq "exit 0" "$RC" "0"

SKILL_COUNT=0
for d in "$PROJECT_ROOT"/skills/*/; do
  [ -f "${d}SKILL.md" ] || continue
  name="$(basename "$d")"
  SKILL_COUNT=$((SKILL_COUNT + 1))
  assert_symlink_to "symlink for $name" "$H1/.claude/skills/$name" "$PROJECT_ROOT/skills/$name"
done
check "at least one skill was discovered" "$([ "$SKILL_COUNT" -gt 0 ] && echo 0 || echo 1)"
assert_file "AGENTS.md written" "$H1/.claude/AGENTS.md"
assert_contains "AGENTS.md carries the bootstrap marker" "$(cat "$H1/.claude/AGENTS.md")" "$BOOTSTRAP_START"

echo ""
echo "Scenario 2: re-running is a byte-for-byte no-op"
BEFORE="$(tree_fingerprint "$H1")"
OUT2="$(run_apply "$H1")"
AFTER="$(tree_fingerprint "$H1")"
assert_eq "second apply changes nothing on disk" "$AFTER" "$BEFORE"
assert_not_contains "second apply reports no new symlinks" "$OUT2" "Symlinked:"

echo ""
echo "Scenario 3: an existing AGENTS.md keeps its user content"
H2="$ROOT/h2"; mkdir -p "$H2/.claude"
printf '# My notes\n\nkeep me\n' > "$H2/.claude/AGENTS.md"
run_apply "$H2" >/dev/null
CONTENT="$(cat "$H2/.claude/AGENTS.md")"
assert_contains "user heading survives" "$CONTENT" "# My notes"
assert_contains "user body survives" "$CONTENT" "keep me"
assert_contains "bootstrap block appended" "$CONTENT" "$BOOTSTRAP_START"

echo ""
echo "Scenario 4: a stale bootstrap block is replaced, not duplicated"
MARKS="$(grep -c -- "$BOOTSTRAP_START" "$H2/.claude/AGENTS.md")"
run_apply "$H2" >/dev/null
MARKS2="$(grep -c -- "$BOOTSTRAP_START" "$H2/.claude/AGENTS.md")"
assert_eq "exactly one start marker before" "$MARKS" "1"
assert_eq "exactly one start marker after" "$MARKS2" "1"

echo ""
echo "Scenario 5: a symlink pointing elsewhere is repointed at the repo"
H3="$ROOT/h3"; mkdir -p "$H3/.claude/skills" "$ROOT/decoy"
FIRST_SKILL=""
for d in "$PROJECT_ROOT"/skills/*/; do
  [ -f "${d}SKILL.md" ] || continue
  FIRST_SKILL="$(basename "$d")"; break
done
ln -s "$ROOT/decoy" "$H3/.claude/skills/$FIRST_SKILL"
run_apply "$H3" >/dev/null
assert_symlink_to "wrong-target symlink repointed" \
  "$H3/.claude/skills/$FIRST_SKILL" "$PROJECT_ROOT/skills/$FIRST_SKILL"

echo ""
echo "Scenario 6: a regular file at a target aborts BEFORE any mutation"
H4="$ROOT/h4"; mkdir -p "$H4/.claude/skills"
# Pick the LAST skill so a naive mid-loop abort would already have created the
# earlier symlinks — that is exactly what this asserts against.
LAST_SKILL=""
for d in "$PROJECT_ROOT"/skills/*/; do
  [ -f "${d}SKILL.md" ] || continue
  LAST_SKILL="$(basename "$d")"
done
printf 'USER DATA\n' > "$H4/.claude/skills/$LAST_SKILL"
# The abort is scoped to the conflicting platform: its skills tree must come
# out untouched. (Other platforms in the same run are unaffected, and the
# installer still records state — only this tree is guaranteed frozen.)
BEFORE4="$(tree_fingerprint "$H4/.claude")"
OUT4="$(run_apply "$H4")"; RC4=$?
AFTER4="$(tree_fingerprint "$H4/.claude")"
assert_eq "conflict exits 1" "$RC4" "1"
assert_contains "conflict is reported" "$OUT4" "Conflict:"
assert_eq "the platform's config tree is unchanged" "$AFTER4" "$BEFORE4"
assert_eq "user file is byte-identical" "$(cat "$H4/.claude/skills/$LAST_SKILL")" "USER DATA"
assert_no_file "no AGENTS.md was written" "$H4/.claude/AGENTS.md"
assert_eq "not one symlink was created" \
  "$(find "$H4/.claude/skills" -type l | wc -l | tr -d ' ')" "0"

summary "install-skills --apply"
