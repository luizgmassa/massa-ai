#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-installer-prune-claude.sh
#
# apps/claude-plugin/install.sh: IPT-02 sites 1-2 (agents + commands
# copy-then-prune) and IPT-03 site 6 (remove_file_route_artifacts's commands
# removal loop must read the INSTALLED directory, not the source bundle).
# See .specs/features/installer-prune-and-test-scoping/{spec,design}.md:
#   D1 — copy-then-prune order (an interrupted run must never leave the user
#        with fewer agents/commands than before)
#   D2 — the removal population is always the destination directory; the
#        bundle supplies only a keep-predicate
#   D3 — claude's ownership test is the massa-ai- name prefix
#        (install.sh:765, :775-777)
#
# Every scenario PLANTS a retired member in the destination first — a test
# that only asserts the current set is present would pass identically before
# and after the fix (AC-02.4).
#
# MASSA_AI_SKIP_ARTIFACT_GENERATION=1 is set for every install.sh invocation
# here: this worktree has other workers regenerating the same gitignored
# apps/*-plugin bundles concurrently (AD-016), and this suite only needs the
# bundle that is already on disk.
#
# Usage: bash scripts/tests/test-installer-prune-claude.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/apps/claude-plugin/install.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-prune-claude.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

# run_install HOME [extra args...] — file route forced (no real claude CLI
# dependency), no regeneration (see header).
run_install() {
  local home="$1"; shift
  env HOME="$home" MASSA_AI_SKIP_PLUGIN_REGISTRY=1 MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
    MASSA_AI_VERBOSE=0 bash "$INSTALLER" "$@" >/dev/null 2>&1
}

CURRENT_COMMAND_COUNT="$(find "$PROJECT_ROOT/apps/claude-plugin/commands" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"

echo "Scenario 1: agents copy-then-prune sheds a retired specialist (IPT-02 site 1)"
H1="$ROOT/h1"; mkdir -p "$H1/.claude/agents"
: > "$H1/.claude/agents/massa-ai-retired-specialist.md"
: > "$H1/.claude/agents/user-owned-agent.md"   # no massa-ai- prefix — must survive
run_install "$H1" --user
RC1=$?
check "install exits 0" "$RC1"
assert_no_file "retired specialist removed" "$H1/.claude/agents/massa-ai-retired-specialist.md"
assert_file "current specialist (navigator) present" "$H1/.claude/agents/massa-ai-navigator.md"
assert_eq "every current specialist installed" \
  "$(find "$H1/.claude/agents" -maxdepth 1 -name 'massa-ai-*.md' | wc -l | tr -d ' ')" \
  "$(find "$PROJECT_ROOT/apps/claude-plugin/agents" -maxdepth 1 -name 'massa-ai-*.md' | wc -l | tr -d ' ')"
assert_file "non-massa-ai file untouched" "$H1/.claude/agents/user-owned-agent.md"

echo ""
echo "Scenario 2: commands copy-then-prune sheds a retired command (IPT-02 site 2)"
H2="$ROOT/h2"; mkdir -p "$H2/.claude/commands"
: > "$H2/.claude/commands/massa-ai-retired-command.md"
: > "$H2/.claude/commands/user-owned-command.md"
run_install "$H2" --user
RC2=$?
check "install exits 0" "$RC2"
assert_no_file "retired command removed" "$H2/.claude/commands/massa-ai-retired-command.md"
assert_eq "every current command installed" \
  "$(find "$H2/.claude/commands" -maxdepth 1 -name 'massa-ai-*.md' | wc -l | tr -d ' ')" \
  "$CURRENT_COMMAND_COUNT"
assert_file "non-massa-ai file untouched" "$H2/.claude/commands/user-owned-command.md"

echo ""
echo "Scenario 3: remove_file_route_artifacts clears installed commands with the source bundle absent (IPT-03 site 6)"
# The pre-fix loop derived its removals from "$SCRIPT_DIR/commands/"*.md — the
# SOURCE bundle — so an absent/stale bundle at uninstall/route-switch time
# (the normal state under AD-016) meant nothing was removed at all. Proving
# that requires the bundle to actually be absent while the loop runs, which
# means running a install.sh whose own directory we can freely mutate — never
# the real, shared apps/claude-plugin/commands (other workers depend on it).
# So this scenario mirrors the plugin dir into scratch first.
MIRROR="$ROOT/mirror"
mkdir -p "$MIRROR/scripts/lib" "$MIRROR/.claude-plugin" "$MIRROR/apps"
cp "$PROJECT_ROOT/scripts/lib/installer-shared.sh" "$MIRROR/scripts/lib/installer-shared.sh"
cp "$PROJECT_ROOT/scripts/banner.sh" "$MIRROR/scripts/banner.sh"
cp -R "$PROJECT_ROOT/.claude-plugin/." "$MIRROR/.claude-plugin/"
cp -R "$PROJECT_ROOT/apps/claude-plugin" "$MIRROR/apps/claude-plugin"
rm -rf "$MIRROR/apps/claude-plugin/node_modules" "$MIRROR/apps/claude-plugin/.turbo"
MIRROR_INSTALLER="$MIRROR/apps/claude-plugin/install.sh"

INSTALL_HOME="$ROOT/h3"; mkdir -p "$INSTALL_HOME"

# Seed run: file route, mirror's bundle still intact — installs loose commands.
env HOME="$INSTALL_HOME" MASSA_AI_SKIP_PLUGIN_REGISTRY=1 MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
  MASSA_AI_VERBOSE=0 bash "$MIRROR_INSTALLER" --user >/dev/null 2>&1
SEED_RC=$?
check "seed (file-route) install exits 0" "$SEED_RC"
BEFORE_COUNT="$(find "$INSTALL_HOME/.claude/commands" -maxdepth 1 -name 'massa-ai-*.md' 2>/dev/null | wc -l | tr -d ' ')"
check "seed run installed loose commands" "$([ "$BEFORE_COUNT" -gt 0 ] && echo 0 || echo 1)"

# The bundle is now "absent" — remove the MIRROR's own copy, never the real one.
rm -rf "$MIRROR/apps/claude-plugin/commands"

# Stub `claude` so register_claude_plugin succeeds without a real host
# install, forcing the marketplace route that calls remove_file_route_artifacts.
STUB_DIR="$ROOT/stubbin"; mkdir -p "$STUB_DIR"
cat > "$STUB_DIR/claude" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "plugin marketplace")
    exit 0
    ;;
  "plugin install")
    reg="$HOME/.claude/plugins/installed_plugins.json"
    mkdir -p "$(dirname "$reg")"
    printf '{"plugins":{"%s":[{"scope":"user","installPath":"%s"}]}}\n' "$3" "$HOME/mock-install" > "$reg"
    exit 0
    ;;
  "plugin uninstall")
    rm -f "$HOME/.claude/plugins/installed_plugins.json"
    exit 0
    ;;
  "plugin update")
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
STUB
chmod +x "$STUB_DIR/claude"

env HOME="$INSTALL_HOME" PATH="$STUB_DIR:$PATH" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
  MASSA_AI_VERBOSE=0 bash "$MIRROR_INSTALLER" --user >"$ROOT/run2.log" 2>&1
RUN2_RC=$?
check "plugin-route run exits 0" "$RUN2_RC"
assert_eq "loose commands cleared with the bundle absent" \
  "$(find "$INSTALL_HOME/.claude/commands" -maxdepth 1 -name 'massa-ai-*.md' 2>/dev/null | wc -l | tr -d ' ')" \
  "0"

summary "claude-plugin installer prune"
