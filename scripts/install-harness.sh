#!/usr/bin/env bash
#
# massa-ai agent-harness installer (orchestrator)
#
# One entry point for the three things a user has to install by hand today:
# skills (symlinks + AGENTS.md bootstrap), MCP registration, and the per-host
# plugin bundles. Both install.sh and scripts/setup-local-first.sh call this.
#
# Usage:
#   scripts/install-harness.sh                       # --all
#   scripts/install-harness.sh --skills --agents     # skip plugin bundles
#   scripts/install-harness.sh --plugins             # plugin bundles only
#   scripts/install-harness.sh --all --target /tmp/fakehome --yes   # tests
#
# Flags:
#   --skills               Install repo skills into every detected agent
#   --agents               Register the massa-ai MCP server (install-agents.sh)
#   --plugins              Install the Claude / Codex / Cursor plugin bundles
#   --all                  All three (default when no selection flag is given)
#   --platform <name>      claude, codex, cursor, opencode, all (skills scope)
#   --api-base <url>       MCP API base url (default http://localhost:3333)
#   --target <dir>         Override $HOME root (tests / CI)
#   --dry-run              Preview; writes nothing
#   --uninstall            Remove skills + MCP entries + plugin bundles
#   --yes, -y              Consent to writing real $HOME
#   -h, --help             Show this help
#
# Ordering matters: skills, then MCP, then plugins. The plugin installers
# delegate MCP back to install-agents.sh, so registering first makes that
# delegated call a verified no-op instead of the first write.
#
# Exit codes:
#   0   every requested step completed
#   n   the first failing step's exit code, propagated verbatim (13 = consent)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=scripts/lib/installer-shared.sh
source "$SCRIPT_DIR/lib/installer-shared.sh"

DO_SKILLS=0
DO_AGENTS=0
DO_PLUGINS=0
SELECTED=0
PLATFORM="all"
API_BASE="http://localhost:3333"
TARGET_HOME="${HOME:-}"
DRY_RUN=0
UNINSTALL=0
ASSUME_YES=0

usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --skills) DO_SKILLS=1; SELECTED=1 ;;
    --agents) DO_AGENTS=1; SELECTED=1 ;;
    --plugins) DO_PLUGINS=1; SELECTED=1 ;;
    --all) DO_SKILLS=1; DO_AGENTS=1; DO_PLUGINS=1; SELECTED=1 ;;
    --platform) shift; PLATFORM="${1:-all}" ;;
    --api-base) shift; API_BASE="${1:-}" ;;
    --target) shift; TARGET_HOME="${1:-}" ;;
    --dry-run) DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$SELECTED" = "0" ]; then
  DO_SKILLS=1; DO_AGENTS=1; DO_PLUGINS=1
fi

TARGET_HOME="$(installer_resolve_path "${TARGET_HOME:-$HOME}")"

# One consent decision for the whole run rather than one per sub-script.
if [ "$DRY_RUN" != "1" ]; then
  installer_consent_gate "$TARGET_HOME" "$ASSUME_YES" 13 "install-harness"
  ASSUME_YES=1
fi

source "$SCRIPT_DIR/banner.sh"
massa_ai_banner

common_flags() {
  local out=""
  [ "$DRY_RUN" = "1" ] && out="$out --dry-run"
  [ "$ASSUME_YES" = "1" ] && out="$out --yes"
  echo "$out"
}

STATUS=0
note_failure() {
  local code="$1" what="$2"
  if [ "$STATUS" = "0" ]; then STATUS="$code"; fi
  err "${what} failed (exit ${code})"
}

# ── Skills ──────────────────────────────────────────────────────────────────
if [ "$DO_SKILLS" = "1" ]; then
  echo ""
  info "Installing massa-ai skills (platform: ${PLATFORM})..."
  skills_action="--apply"
  [ "$UNINSTALL" = "1" ] && skills_action="--uninstall"
  # --dry-run is its own action in install-skills.sh, not a modifier.
  if [ "$DRY_RUN" = "1" ]; then skills_action="--dry-run"; fi
  set +e
  bash "$SCRIPT_DIR/install-skills.sh" "$skills_action" \
    --platform "$PLATFORM" --target "$TARGET_HOME" --repo-root "$REPO_ROOT" \
    $([ "$ASSUME_YES" = "1" ] && echo "--yes")
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || note_failure "$rc" "install-skills.sh"
fi

# ── MCP registration ────────────────────────────────────────────────────────
if [ "$DO_AGENTS" = "1" ]; then
  echo ""
  info "Registering the massa-ai MCP server..."
  set +e
  # shellcheck disable=SC2046
  bash "$SCRIPT_DIR/install-agents.sh" \
    --target "$TARGET_HOME" --api-base "$API_BASE" \
    $([ "$UNINSTALL" = "1" ] && echo "--uninstall") $(common_flags)
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || note_failure "$rc" "install-agents.sh"
fi

# ── Plugin bundles ──────────────────────────────────────────────────────────
# The three script-based plugins read $HOME directly, so scope the child
# environment rather than passing a flag they do not have. OpenCode ships as an
# npm package and has no install.sh — print its instructions instead.
if [ "$DO_PLUGINS" = "1" ]; then
  echo ""
  if [ "$DRY_RUN" = "1" ]; then
    info "Would install plugin bundles: claude, codex, cursor (dry-run)"
  else
    for host in claude codex cursor; do
      installer="$REPO_ROOT/apps/${host}-plugin/install.sh"
      if [ ! -f "$installer" ]; then
        warn "${host} plugin installer not found at ${installer}"
        continue
      fi
      info "Installing the ${host} plugin bundle..."
      set +e
      if [ "$UNINSTALL" = "1" ]; then
        HOME="$TARGET_HOME" bash "$installer" --uninstall
      else
        HOME="$TARGET_HOME" bash "$installer" --user
      fi
      rc=$?
      set -e
      [ "$rc" -eq 0 ] || note_failure "$rc" "${host}-plugin/install.sh"
    done
  fi
  echo ""
  info "OpenCode plugin is an npm package — install it with:"
  echo "    npm install @massa-ai/opencode-plugin"
  echo "    then add \"plugin\": [\"@massa-ai/opencode-plugin\"] to ~/.config/opencode/opencode.json"
fi

echo ""
if [ "$STATUS" = "0" ]; then
  ok "massa-ai harness install complete."
else
  err "massa-ai harness install finished with errors."
fi
exit "$STATUS"
