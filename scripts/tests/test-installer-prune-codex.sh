#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-installer-prune-codex.sh
#
# IPT-02 site 3 (apps/codex-plugin/install.sh, the agent copy loop into
# $AGENTS_DIR): proves the copy-then-prune shedding behaviour (D1) and, most
# importantly, proves the ownership test used to decide what may be pruned is
# the "# massa-ai-owned" first-line marker (D3/AC-02.2) — NOT a massa-ai-
# name prefix. $AGENTS_DIR (~/.codex/agents) is a directory shared with
# user-authored agents, so a blind `rm -f massa-ai-*.toml` would delete a
# user's own file that happens to share the name prefix but carries no
# marker (AC-02.3, AC-02.5).
#
# Runs the real install.sh against a scratch HOME. MASSA_AI_SKIP_ARTIFACT_GENERATION=1
# is set because this checkout's apps/codex-plugin/{skills,agents} bundle is
# already generated and shared with sibling in-flight workers in this
# worktree — regenerating it here would race their edits.
#
# Usage: bash scripts/tests/test-installer-prune-codex.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALL_SH="${PROJECT_ROOT}/apps/codex-plugin/install.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-prune-codex.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

# Preconditions: this test asserts real prune behaviour against a real
# generated bundle. If the bundle is missing, skip loudly rather than passing
# vacuously — see AGENTS.md guidance on gates that report nothing.
if [[ ! -f "$PROJECT_ROOT/apps/codex-plugin/skills/massa-ai/SKILL.md" ]] \
  || [[ ! -d "$PROJECT_ROOT/apps/codex-plugin/agents" ]] \
  || [[ -z "$(ls -A "$PROJECT_ROOT/apps/codex-plugin/agents" 2>/dev/null)" ]]; then
  echo "  ⚠ SKIP: apps/codex-plugin bundle not generated — run 'bun run generate:artifacts' first" >&2
  echo ""
  echo "installer prune (codex): 0 passed, 0 failed (skipped — bundle absent)"
  exit 0
fi

SOURCE_AGENTS_DIR="$PROJECT_ROOT/apps/codex-plugin/agents"

run_install() { # run_install HOME
  local home="$1"
  HOME="$home" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 MASSA_AI_VERBOSE=0 \
    bash "$INSTALL_SH" --user >/dev/null 2>&1
}

echo "Scenario 1: fresh install writes the current agent set with the ownership marker"
H1="$ROOT/fresh"; mkdir -p "$H1"
run_install "$H1"
AGENTS_DIR="$H1/.codex/agents"
CURRENT_COUNT=0
for src in "$SOURCE_AGENTS_DIR/"massa-ai-*.toml; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  assert_file "current agent $name installed" "$AGENTS_DIR/$name"
  CURRENT_COUNT=$((CURRENT_COUNT + 1))
done
check "at least one current agent was discovered" "$([ "$CURRENT_COUNT" -gt 0 ] && echo 0 || echo 1)"

echo ""
echo "Scenario 2: a retired massa-ai-owned agent is pruned on the next install (D1 copy-then-prune)"
H2="$ROOT/prune"; mkdir -p "$H2"
run_install "$H2"
AGENTS_DIR2="$H2/.codex/agents"

RETIRED="$AGENTS_DIR2/massa-ai-retired-specialist.toml"
printf '# massa-ai-owned\nname = "massa-ai-retired-specialist"\ndescription = "no longer shipped"\n' > "$RETIRED"
assert_file "retired fixture planted with the ownership marker" "$RETIRED"
assert_eq "retired fixture carries the exact marker first line" \
  "$(head -n1 "$RETIRED")" "# massa-ai-owned"

MINE="$AGENTS_DIR2/massa-ai-mine.toml"
printf 'name = "massa-ai-mine"\ndescription = "a user agent that happens to share the name prefix, no marker"\n' > "$MINE"
MINE_BEFORE="$(cat "$MINE")"

run_install "$H2"

assert_no_file "retired massa-ai-owned agent is gone after the next install" "$RETIRED"
assert_file "user-owned unmarked file survives (AC-02.5 — the uniform-rm catcher)" "$MINE"
assert_eq "user-owned file content is untouched" "$(cat "$MINE")" "$MINE_BEFORE"

for src in "$SOURCE_AGENTS_DIR/"massa-ai-*.toml; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  assert_file "current agent $name still present after the prune run" "$AGENTS_DIR2/$name"
done

echo ""
echo "Scenario 3: an interrupted-looking mid-copy state is not worse off (copy-then-prune ordering, D1)"
# Not a literal SIGKILL simulation (out of scope for a black-box installer
# test) — this asserts the durable property the ordering exists to protect:
# every currently-shipped agent is present, and pruning only ever removes
# entries the new copy pass did not just (re)write.
for src in "$SOURCE_AGENTS_DIR/"massa-ai-*.toml; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  assert_file "post-prune: $name is the freshly copied bundle file" "$AGENTS_DIR2/$name"
done

summary "installer prune (codex)"
