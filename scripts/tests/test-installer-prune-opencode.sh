#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-installer-prune-opencode.sh
#
# apps/opencode-plugin/install.sh — IPT-02 sites 4-5, IPT-03 site 7, IPT-05.
#
#   Site 4 (agent symlinks into $AGENTS_DIR, D1 copy-then-prune): ownership is
#   SYMLINK-NESS ([[ -L ]]), not a name prefix — the copy loop directly above
#   refuses to clobber a regular file at an owned path (it is the user's
#   content), so the prune must leave a regular file alone too, or it would
#   delete exactly what that loop protects (AC-02.3). Scenario (b) below is
#   the discriminating case: it catches a prune written as an unconditional
#   `rm -f massa-ai-*.md` that ignores symlink-ness.
#
#   Site 5 (workflow commands into $COMMANDS_DIR, D1 copy-then-prune):
#   ownership IS the massa-ai- name prefix (D3, opencode's own uninstall at
#   :445-456).
#
#   Site 7 (--uninstall's agent-symlink removal, IPT-03/AC-03.1/AC-03.2): the
#   removal population must be the INSTALLED directory, never the source
#   bundle — deriving it from the bundle is what left this loop removing zero
#   symlinks whenever the bundle was stale or absent at uninstall time
#   (normal under AD-016). Scenario (c) proves this with one real, previously
#   shipped agent file made genuinely absent from the source bundle
#   (AC-03.3), with MASSA_AI_SKIP_ARTIFACT_GENERATION=1 set so the top-of-script
#   generation step does not silently regenerate it back into existence before
#   the removal loop runs (AC-03.3a) — without that variable this scenario's
#   stated precondition never holds, and the test would be green for the
#   wrong reason.
#
#   IPT-05/AC-05.1: install_bundled_skills now installs three harness skills
#   (massa-ai, persona-router, profile), not two.
#
# Runs the real install.sh against scratch HOMEs. MASSA_AI_SKIP_ARTIFACT_GENERATION=1
# is set for every ordinary invocation because this checkout's
# apps/opencode-plugin/{skills,agents,command} bundle is already generated and
# shared with sibling in-flight workers in this worktree — regenerating it
# here would race their edits. Scenario (c) is the one place a *piece* of the
# real bundle is deliberately, briefly made absent; it is restored by hand
# (never via git — the bundle is gitignored generated output, git has no copy
# of it) inside a trap that fires on every exit path.
#
# Usage: bash scripts/tests/test-installer-prune-opencode.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALL_SH="${PROJECT_ROOT}/apps/opencode-plugin/install.sh"
SOURCE_AGENTS_DIR="${PROJECT_ROOT}/apps/opencode-plugin/agents"
SOURCE_COMMANDS_DIR="${PROJECT_ROOT}/apps/opencode-plugin/command"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-prune-opencode.XXXXXX")"

# One real, currently-shipped agent file this suite briefly removes from the
# source bundle for scenario (c), and always restores. Chosen because it is
# generated content (safe to touch, gitignored under AD-016) and is not a
# file any other in-flight worker in this worktree reads.
FIXTURE_AGENT_NAME="massa-ai-builder.md"
FIXTURE_AGENT_PATH="${SOURCE_AGENTS_DIR}/${FIXTURE_AGENT_NAME}"
FIXTURE_BACKUP="${ROOT}/massa-ai-builder.md.bak"

restore_fixture_agent() {
  if [[ -f "$FIXTURE_BACKUP" && ! -f "$FIXTURE_AGENT_PATH" ]]; then
    cp "$FIXTURE_BACKUP" "$FIXTURE_AGENT_PATH"
  fi
}
cleanup() {
  restore_fixture_agent
  rm -rf "$ROOT"
}
trap cleanup EXIT

# Preconditions: this test asserts real prune behaviour against a real
# generated bundle. If the bundle is missing, skip loudly rather than passing
# vacuously — see AGENTS.md guidance on gates that report nothing.
if [[ ! -f "$PROJECT_ROOT/apps/opencode-plugin/skills/massa-ai/SKILL.md" ]] \
  || [[ ! -d "$SOURCE_AGENTS_DIR" ]] \
  || [[ -z "$(ls -A "$SOURCE_AGENTS_DIR" 2>/dev/null)" ]] \
  || [[ ! -f "$FIXTURE_AGENT_PATH" ]]; then
  echo "  ⚠ SKIP: apps/opencode-plugin bundle not generated (or missing $FIXTURE_AGENT_NAME) — run 'bun run generate:artifacts' first" >&2
  echo ""
  echo "installer prune (opencode): 0 passed, 0 failed (skipped — bundle absent)"
  exit 0
fi

run_install() { # run_install HOME [extra args...]
  local home="$1"; shift
  HOME="$home" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 MASSA_AI_VERBOSE=1 \
    bash "$INSTALL_SH" --user "$@" 2>&1
}

run_uninstall() { # run_uninstall HOME
  local home="$1"
  HOME="$home" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 MASSA_AI_VERBOSE=1 \
    bash "$INSTALL_SH" --uninstall 2>&1
}

# ── Scenario (a): a retired agent SYMLINK is pruned on install (site 4) ─────
echo "Scenario (a): a retired agent planted as a real symlink is gone after install"
H1="$ROOT/h1"; mkdir -p "$H1"
AGENTS_DIR1="$H1/.config/opencode/agents"
mkdir -p "$AGENTS_DIR1"

RETIRED_LINK="$AGENTS_DIR1/massa-ai-retired-specialist.md"
ln -sfn "$FIXTURE_AGENT_PATH" "$RETIRED_LINK"
assert_symlink_to "fixture planted as a real symlink (not a regular file)" "$RETIRED_LINK" "$FIXTURE_AGENT_PATH"

OUT1="$(run_install "$H1")"; RC1=$?
assert_eq "install exits 0" "$RC1" "0"
assert_no_file "retired agent symlink is gone" "$RETIRED_LINK"
assert_contains "install reports the prune" "$OUT1" "pruned"

echo ""

# ── Scenario (b): a REGULAR FILE at an owned agent path survives (site 4) ───
# This is the discriminating case (AC-02.3/AC-02.5): a prune keyed only on
# name (or on "everything not in the bundle") would delete this. Ownership
# here is symlink-ness, and a regular file is never owned.
echo "Scenario (b): a regular file at an owned agent path survives the prune"
H2="$ROOT/h2"; mkdir -p "$H2"
AGENTS_DIR2="$H2/.config/opencode/agents"
mkdir -p "$AGENTS_DIR2"

REGULAR_FILE="$AGENTS_DIR2/massa-ai-fake-specialist.md"
echo "this is a regular file the installer must never delete" > "$REGULAR_FILE"
BEFORE_CONTENT="$(cat "$REGULAR_FILE")"

OUT2="$(run_install "$H2")"; RC2=$?
assert_eq "install exits 0" "$RC2" "0"
assert_file "regular file at an owned agent path survives" "$REGULAR_FILE"
assert_eq "regular file content is untouched" "$(cat "$REGULAR_FILE")" "$BEFORE_CONTENT"

echo ""

# ── Scenario (d), agents half: the current agent set is present ────────────
echo "Scenario (d): the current agent and command sets are present after install"
CURRENT_AGENT_COUNT=0
for src in "$SOURCE_AGENTS_DIR/"massa-ai-*.md; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  assert_file "current agent $name installed (h2)" "$AGENTS_DIR2/$name"
  CURRENT_AGENT_COUNT=$((CURRENT_AGENT_COUNT + 1))
done
check "sanity: at least one current agent was discovered" "$([ "$CURRENT_AGENT_COUNT" -gt 0 ] && echo 0 || echo 1)"

CURRENT_COMMAND_COUNT=0
COMMANDS_DIR2="$H2/.config/opencode/command"
for src in "$SOURCE_COMMANDS_DIR/"massa-ai-*.md; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  assert_file "current workflow command $name installed (h2)" "$COMMANDS_DIR2/$name"
  CURRENT_COMMAND_COUNT=$((CURRENT_COMMAND_COUNT + 1))
done
check "sanity: at least one current workflow command was discovered" "$([ "$CURRENT_COMMAND_COUNT" -gt 0 ] && echo 0 || echo 1)"

echo ""

# ── Bonus coverage: workflow-command prune (site 5, name-prefix ownership) ──
echo "Scenario: a retired workflow command is pruned; a non-prefixed user file survives (site 5)"
H3="$ROOT/h3"; mkdir -p "$H3"
COMMANDS_DIR3="$H3/.config/opencode/command"
mkdir -p "$COMMANDS_DIR3"

RETIRED_CMD="$COMMANDS_DIR3/massa-ai-retired-workflow.md"
echo "# a workflow command retired from the bundle" > "$RETIRED_CMD"
USER_CMD="$COMMANDS_DIR3/my-own-command.md"
echo "user command content" > "$USER_CMD"

OUT3="$(run_install "$H3")"; RC3=$?
assert_eq "install exits 0" "$RC3" "0"
assert_no_file "retired workflow command is gone" "$RETIRED_CMD"
assert_file "non-prefixed user command survives" "$USER_CMD"
assert_eq "user command content is untouched" "$(cat "$USER_CMD")" "user command content"

echo ""

# ── Scenario (c): --uninstall removes installed symlinks with the source ────
# bundle genuinely missing one member, and MASSA_AI_SKIP_ARTIFACT_GENERATION=1
# set so the top-of-script generation step cannot silently restore it first
# (AC-03.3/AC-03.3a).
echo "Scenario (c): --uninstall removes installed agent symlinks even when the source bundle is missing one of them"
H4="$ROOT/h4"; mkdir -p "$H4"
AGENTS_DIR4="$H4/.config/opencode/agents"

OUT4a="$(run_install "$H4")"; RC4a=$?
assert_eq "pre-step install (to populate destination) exits 0" "$RC4a" "0"
assert_symlink_to "pre-step: fixture agent installed as a symlink" \
  "$AGENTS_DIR4/$FIXTURE_AGENT_NAME" "$FIXTURE_AGENT_PATH"

INSTALLED_BEFORE_UNINSTALL=()
while IFS= read -r -d '' f; do
  INSTALLED_BEFORE_UNINSTALL+=("$(basename "$f")")
done < <(find "$AGENTS_DIR4" -maxdepth 1 -name 'massa-ai-*.md' -print0)
check "sanity: pre-step installed more than zero agent symlinks" \
  "$([ "${#INSTALLED_BEFORE_UNINSTALL[@]}" -gt 0 ] && echo 0 || echo 1)"

# Make the source bundle genuinely missing this one, currently-installed,
# member — the directory itself stays non-empty (other agents remain), so
# install.sh's own generated-bundle sentinel still passes; the sentinel is
# unconditional (runs ahead of --uninstall too) and would abort the whole
# script long before the removal loop if the entire agents/ directory were
# emptied, which would make the AC untestable through that door.
cp "$FIXTURE_AGENT_PATH" "$FIXTURE_BACKUP"
rm -f "$FIXTURE_AGENT_PATH"
assert_no_file "source bundle no longer ships the fixture agent" "$FIXTURE_AGENT_PATH"

OUT4b="$(run_uninstall "$H4")"; RC4b=$?
restore_fixture_agent
assert_file "fixture agent restored in the source bundle immediately after uninstall" "$FIXTURE_AGENT_PATH"

assert_eq "uninstall (bundle missing one member) exits 0" "$RC4b" "0"
assert_no_file "the bundle-absent fixture agent's symlink is removed" "$AGENTS_DIR4/$FIXTURE_AGENT_NAME"
for name in "${INSTALLED_BEFORE_UNINSTALL[@]}"; do
  assert_no_file "installed agent symlink $name is removed by --uninstall" "$AGENTS_DIR4/$name"
done

echo ""

# ── IPT-05/AC-05.1: three harness skills, not two ────────────────────────────
echo "Scenario: install_bundled_skills installs massa-ai, persona-router, AND profile"
H5="$ROOT/h5"; mkdir -p "$H5"
OUT5="$(run_install "$H5")"; RC5=$?
assert_eq "install exits 0" "$RC5" "0"
SKILLS_DIR5="$H5/.config/opencode/skills"
assert_file "massa-ai skill installed" "$SKILLS_DIR5/massa-ai/SKILL.md"
assert_file "persona-router skill installed" "$SKILLS_DIR5/persona-router/SKILL.md"
assert_file "profile skill installed" "$SKILLS_DIR5/profile/SKILL.md"

summary "installer prune (opencode)"
