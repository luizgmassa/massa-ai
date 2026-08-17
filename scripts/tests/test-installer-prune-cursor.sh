#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-installer-prune-cursor.sh
#
# IPT-02 AC-02.4 / AC-02.6 / AC-02.6a — cursor's agent-prune loop at
# apps/cursor-plugin/install.sh:625 (the massa-ai-*.md flat agents dir).
#
# Cursor is the one host that already sheds retired agents (it was the model
# for this whole feature — see design.md D1). This suite is therefore NOT a
# RED-then-GREEN sensor for the retired-member behaviour itself: that
# behaviour already works under the pre-fix prune-then-copy order. It is a
# regression guard proving that D1's reorder (copy-then-prune) preserved the
# same end state. See the report this test's runner emits for both
# observations (pass against prune-then-copy, pass against copy-then-prune).
#
# Also covers AC-02.5: a user-authored agent without the massa-ai- prefix
# must survive the prune (the ownership test is the name prefix, not "every
# file in the directory").
#
# Everything runs against a mktemp fake HOME; the real $HOME is never
# touched. MASSA_AI_SKIP_ARTIFACT_GENERATION=1 is set because this checkout's
# apps/cursor-plugin/{skills,agents} bundle is already generated and shared
# with sibling in-flight workers in this worktree — regenerating it here
# would race their edits.
#
# Usage: bash scripts/tests/test-installer-prune-cursor.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/apps/cursor-plugin/install.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-cursor-prune.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

# Preconditions: this test asserts real prune behaviour against a real
# generated bundle. If the bundle is missing, skip loudly rather than passing
# vacuously — see AGENTS.md guidance on gates that report nothing.
if [[ ! -f "$PROJECT_ROOT/apps/cursor-plugin/skills/massa-ai/SKILL.md" ]] \
  || [[ ! -d "$PROJECT_ROOT/apps/cursor-plugin/agents" ]] \
  || [[ -z "$(ls -A "$PROJECT_ROOT/apps/cursor-plugin/agents" 2>/dev/null)" ]]; then
  echo "  ⚠ SKIP: apps/cursor-plugin bundle not generated — run 'bun run generate:artifacts' first" >&2
  echo ""
  echo "installer-prune-cursor: 0 passed, 0 failed (skipped — bundle absent)"
  exit 0
fi

run_install() { # run_install HOME [extra args...]
  local home="$1"; shift
  HOME="$home" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 bash "$INSTALLER" --user "$@" 2>&1
}

echo "Scenario: a retired agent in the destination is pruned, the current set lands, and a user-authored agent survives"
H1="$ROOT/h1"; mkdir -p "$H1"
CURSOR_AGENTS_DIR="$H1/.cursor/agents"
mkdir -p "$CURSOR_AGENTS_DIR"

# Plant a retired massa-ai-owned agent — a specialist the bundle no longer
# ships (matches the ownership test: the massa-ai- name prefix, D3, same as
# cursor's own uninstall at install.sh:505-509).
RETIRED_AGENT="$CURSOR_AGENTS_DIR/massa-ai-retired-specialist.md"
echo "# retired specialist, no longer in the bundle" > "$RETIRED_AGENT"

# Plant a user-authored agent WITHOUT the massa-ai- prefix. The ownership
# test must reject this — it is not this installer's to remove (AC-02.5).
USER_AGENT="$CURSOR_AGENTS_DIR/my-own-agent.md"
echo "# a user's own cursor subagent" > "$USER_AGENT"

OUT="$(run_install "$H1")"; RC=$?
assert_eq "install exits 0" "$RC" "0"

check "retired agent (massa-ai-retired-specialist.md) is gone" "$([ ! -f "$RETIRED_AGENT" ] && echo 0 || echo 1)"
check "current set lands: massa-ai-navigator.md present" "$([ -f "$CURSOR_AGENTS_DIR/massa-ai-navigator.md" ] && echo 0 || echo 1)"
check "user-authored agent (no massa-ai- prefix) survives" "$([ -f "$USER_AGENT" ] && echo 0 || echo 1)"

# Sanity: the bundle actually ships more than zero massa-ai-owned agents, so
# "current set lands" is not vacuously true.
BUNDLE_AGENT_COUNT="$(find "$PROJECT_ROOT/apps/cursor-plugin/agents" -maxdepth 1 -name 'massa-ai-*.md' -type f 2>/dev/null | wc -l | tr -d ' ')"
check "sanity: the bundle ships at least one massa-ai-owned agent" "$([ "$BUNDLE_AGENT_COUNT" -gt 0 ] && echo 0 || echo 1)"

INSTALLED_COUNT="$(find "$CURSOR_AGENTS_DIR" -maxdepth 1 -name 'massa-ai-*.md' -type f 2>/dev/null | wc -l | tr -d ' ')"
assert_eq "installed massa-ai-owned agent count matches the bundle" "$INSTALLED_COUNT" "$BUNDLE_AGENT_COUNT"

echo ""
echo "Scenario: re-running is idempotent — no leftover retired members after a second pass"
OUT2="$(run_install "$H1")"; RC2=$?
assert_eq "second install exits 0" "$RC2" "0"
check "still no retired agent" "$([ ! -f "$RETIRED_AGENT" ] && echo 0 || echo 1)"
check "still no user agent removed" "$([ -f "$USER_AGENT" ] && echo 0 || echo 1)"

echo ""
echo "NOTE (regression guard, not RED-then-GREEN): this suite was run once against"
echo "the pre-fix prune-then-copy loop and once against the post-fix copy-then-prune"
echo "loop (D1) — both passed, since cursor's retired-member removal already worked"
echo "before this change. The reorder changes only interrupted-run behaviour"
echo "(AC-02.1), which this suite does not exercise (that would require killing the"
echo "process mid-loop, out of scope for a functional regression guard)."

summary "installer-prune-cursor"
