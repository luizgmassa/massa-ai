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
#   --plugins              Install the Claude / Codex / Cursor / OpenCode plugin bundles
#   --all                  All three (default when no selection flag is given)
#   --platform <name>      claude, codex, cursor, opencode, all (skills scope)
#   --api-base <url>       MCP API base url (default http://localhost:3333)
#   --mcp-source <type>    Command source: local, npx, auto (default auto)
#   --plugin-source <type> Marketplace root: local, copy, auto (default auto)
#   --target <dir>         Override $HOME root (tests / CI)
#   --dry-run              Preview; writes nothing
#   --uninstall            Remove skills + MCP entries + plugin bundles
#   --quiet                Suppress per-phase output (errors/warnings always shown)
#   --verbose              Show per-file / per-key detail
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
MCP_SOURCE="${MASSA_AI_MCP_SOURCE:-auto}"
PLUGIN_SOURCE="${MASSA_AI_PLUGIN_SOURCE:-auto}"
TARGET_HOME="${HOME:-}"
DRY_RUN=0
UNINSTALL=0
ASSUME_YES=0
QUIET_MODE=1
VERBOSE_MODE=0

usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --skills) DO_SKILLS=1; SELECTED=1 ;;
    --agents) DO_AGENTS=1; SELECTED=1 ;;
    --plugins) DO_PLUGINS=1; SELECTED=1 ;;
    --all) DO_SKILLS=1; DO_AGENTS=1; DO_PLUGINS=1; SELECTED=1 ;;
    --platform) shift; PLATFORM="${1:-all}" ;;
    --api-base) shift; API_BASE="${1:-}" ;;
    --mcp-source) shift; MCP_SOURCE="${1:-}" ;;
    --plugin-source) shift; PLUGIN_SOURCE="${1:-}" ;;
    --target) shift; TARGET_HOME="${1:-}" ;;
    --dry-run) DRY_RUN=1; VERBOSE_MODE=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --quiet) QUIET_MODE=1; VERBOSE_MODE=0 ;;
    --verbose) QUIET_MODE=0; VERBOSE_MODE=1 ;;
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

# Set verbosity before banner so it respects the flag.
if [ "$VERBOSE_MODE" = "1" ]; then
  MASSA_AI_VERBOSE=1
  export MASSA_AI_VERBOSE
fi

massa_ai_banner

common_flags() {
  local out=""
  [ "$DRY_RUN" = "1" ] && out="$out --dry-run"
  [ "$ASSUME_YES" = "1" ] && out="$out --yes"
  [ "$VERBOSE_MODE" = "1" ] && out="$out --verbose"
  echo "$out"
}

# Compact output when quiet: one line per phase.
# Errors and warnings always show (never gated by --quiet).
compact_phase() {
  local action="$1"
  if [ "$QUIET_MODE" = "1" ] && [ "$DRY_RUN" != "1" ]; then
    info "$action"
  else
    echo ""
    info "$action"
  fi
}

STATUS=0
note_failure() {
  local code="$1" what="$2"
  if [ "$STATUS" = "0" ]; then STATUS="$code"; fi
  err "${what} failed (exit ${code})"
}

# ── Skills ──────────────────────────────────────────────────────────────────
if [ "$DO_SKILLS" = "1" ]; then
  compact_phase "Installing skills (platform: ${PLATFORM})..."
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
  compact_phase "Registering MCP server..."
  set +e
  # shellcheck disable=SC2046
  bash "$SCRIPT_DIR/install-agents.sh" \
    --target "$TARGET_HOME" --api-base "$API_BASE" --mcp-source "$MCP_SOURCE" \
    $([ "$UNINSTALL" = "1" ] && echo "--uninstall") $(common_flags)
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || note_failure "$rc" "install-agents.sh"
fi

# ── Plugin bundles ──────────────────────────────────────────────────────────
# Host-detected + version-gated (PAI-01..10, design C3): this phase is the only
# place that decides WHETHER a host's installer runs. A host is detected when
# its config dir exists under the target home OR its binary is on PATH. It
# installs with no recorded version, upgrades on an older one, is skipped at
# the same version, and is never downgraded. Absent/skip decisions are exactly
# one log line each and never affect the exit code.
#
# Why: the blind four-host loop created config trees for hosts the user never
#      installed and rewrote current bundles on every re-run.
# Impacts: PAI-01 detection, PAI-02 absent skip, PAI-04 upgrade, PAI-05 no-op,
#          PAI-09 dry-run, PAI-10 failure isolation; AC-1..6, AC-9, AC-10, AC-12.
# Test: bash scripts/tests/test-plugin-auto-install.sh
#
# The four script-based plugins read $HOME directly, so scope the child
# environment rather than passing a flag they do not have.
if [ "$DO_PLUGINS" = "1" ]; then
  runner="$(installer_require_runner "plugin version gating")"
  bundle_version="$(installer_bundle_version "$REPO_ROOT/package.json")"
  state_file="$TARGET_HOME/.config/massa-ai/install-state.json"
  recorded_versions="$(installer_plugin_versions "$runner" "$state_file")"

  # recorded_version_for <host> — echoes the recorded plugin version ("" when
  # the platform has none; unknown versions upgrade once, then get recorded).
  recorded_version_for() {
    local host="$1"
    printf '%s\n' "$recorded_versions" | while IFS="$(printf '\t')" read -r h v; do
      if [ "$h" = "$host" ]; then
        printf '%s' "$v"
        break
      fi
    done
  }

  # Phase 1: decide per host. --uninstall is deliberately ungated (covers
  # host-removed-after-install; the installers are no-op safe on absent hosts).
  plugin_plan=""
  if [ "$UNINSTALL" = "1" ]; then
    for host in claude codex cursor opencode; do
      plugin_plan="${plugin_plan}${host}|uninstall|
"
    done
  else
    for host in claude codex cursor opencode; do
      if ! signal="$(installer_host_detected "$host" "$TARGET_HOME")"; then
        plugin_plan="${plugin_plan}${host}|skip-absent|
"
        continue
      fi
      vinfo "detected ${host} (${signal})"
      rec="$(recorded_version_for "$host")"
      if [ -n "$rec" ] && [ "$rec" = "$bundle_version" ]; then
        plugin_plan="${plugin_plan}${host}|skip-current|${rec}
"
      elif [ "$(installer_compare_versions "$runner" "$rec" "$bundle_version")" = "1" ]; then
        plugin_plan="${plugin_plan}${host}|skip-newer|${rec}
"
      elif [ -z "$rec" ]; then
        plugin_plan="${plugin_plan}${host}|install|
"
      else
        plugin_plan="${plugin_plan}${host}|upgrade|${rec}
"
      fi
    done
  fi

  if [ "$DRY_RUN" = "1" ]; then
    # Steps 1-3 above are read-only; report the would-be action per host and
    # stop — no marketplace copy, no installer calls (PAI-09, AC-10).
    compact_phase "Plugin bundle decisions (dry-run):"
    while IFS='|' read -r host action rec; do
      [ -n "$host" ] || continue
      case "$action" in
        install) info "install ${host}@${bundle_version}" ;;
        upgrade) info "upgrade ${host}: ${rec} → ${bundle_version}" ;;
        skip-current) info "skip-current ${host}: already at ${rec}" ;;
        skip-absent) info "skip-absent ${host}: host not detected" ;;
        skip-newer) info "skip-newer ${host}: installed ${rec} newer than bundle ${bundle_version}" ;;
        uninstall) info "uninstall ${host}" ;;
      esac
    done <<PLUGIN_PLAN_EOF
$plugin_plan
PLUGIN_PLAN_EOF
  else
    if [ "$UNINSTALL" = "1" ]; then
      compact_phase "Uninstalling plugin bundles..."
    else
      compact_phase "Installing plugin bundles..."
    fi

    # Marketplace source resolution is a WRITE in copy mode, so it runs only
    # when at least one host will actually install/upgrade — never on dry-run
    # (above), uninstall, or all-skip runs (design C3.4 / R6). The copy stays
    # the full four-bundle set: marketplace manifests enumerate all four
    # plugins, so a per-host partial copy could strand a registered
    # marketplace on missing dirs (spec assumption, Plan Challenge C-3).
    plugin_source_root=""
    if [ "$UNINSTALL" != "1" ] && printf '%s' "$plugin_plan" | grep -q '|install\||upgrade'; then
      if ! plugin_mode="$(installer_plugin_source_mode "$PLUGIN_SOURCE" "$REPO_ROOT")"; then
        exit 2
      fi
      plugin_source_root="$(installer_plugin_source_root "$plugin_mode" "$REPO_ROOT" "$TARGET_HOME")"
      vinfo "Plugin marketplace source: ${plugin_mode} (${plugin_source_root})"
    fi

    while IFS='|' read -r host action rec; do
      [ -n "$host" ] || continue
      case "$action" in
        skip-absent) info "skip ${host}: host not detected" ;;
        skip-current) info "skip ${host}: already at ${rec}" ;;
        skip-newer) info "skip ${host}: installed ${rec} newer than bundle ${bundle_version}" ;;
        install|upgrade|uninstall)
          installer="$REPO_ROOT/apps/${host}-plugin/install.sh"
          if [ ! -f "$installer" ]; then
            warn "${host} plugin installer not found at ${installer}"
            continue
          fi
          case "$action" in
            install) info "install ${host}@${bundle_version}" ;;
            upgrade) info "upgrade ${host}: ${rec} → ${bundle_version}" ;;
          esac
          set +e
          if [ "$action" = "uninstall" ]; then
            HOME="$TARGET_HOME" MASSA_AI_MCP_SOURCE="$MCP_SOURCE" \
              MASSA_AI_PLUGIN_SOURCE_ROOT="$plugin_source_root" \
              bash "$installer" --uninstall $([ "$VERBOSE_MODE" = "1" ] && echo "--verbose")
          else
            HOME="$TARGET_HOME" MASSA_AI_MCP_SOURCE="$MCP_SOURCE" \
              MASSA_AI_PLUGIN_SOURCE_ROOT="$plugin_source_root" \
              bash "$installer" --user $([ "$VERBOSE_MODE" = "1" ] && echo "--verbose")
          fi
          rc=$?
          set -e
          # PAI-10: a failed host records nothing, never aborts the remaining
          # hosts, and the run propagates the first failing exit code.
          [ "$rc" -eq 0 ] || note_failure "$rc" "${host}-plugin/install.sh"
          ;;
      esac
    done <<PLUGIN_PLAN_EOF
$plugin_plan
PLUGIN_PLAN_EOF
  fi
fi

if [ "$QUIET_MODE" != "1" ] || [ "$STATUS" != "0" ]; then
  echo ""
fi
if [ "$STATUS" = "0" ]; then
  ok "massa-ai harness install complete."
else
  err "massa-ai harness install finished with errors."
fi
exit "$STATUS"
