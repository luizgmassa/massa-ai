#!/usr/bin/env bash
# ============================================================
#  massa-ai - Shared CLI utilities
#  Source this file from other scripts — do not run directly.
#
#  Usage:
#    source "$(dirname "${BASH_SOURCE[0]}")/banner.sh"
#    massa_ai_banner
# ============================================================

# ── Colours ──────────────────────────────────────────────────
BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "  ${RED}✗${NC} $*" >&2; }
info() { echo -e "  ${BLUE}•${NC} $*"; }
die()  { err "$*"; exit 1; }

# ── Verbosity ─────────────────────────────────────────────────
# Quiet is the default: an installer prints one line per changed
# thing plus a summary. --verbose (or MASSA_AI_VERBOSE=1) adds the
# per-file / per-key detail. --dry-run and --check force verbose,
# because the detail *is* the output in those modes.
# Errors and warnings are never gated — err() and warn() stay loud.
MASSA_AI_VERBOSE="${MASSA_AI_VERBOSE:-0}"
export MASSA_AI_VERBOSE

vinfo() { [ "${MASSA_AI_VERBOSE:-0}" = "1" ] && info "$@"; return 0; }
vecho() { [ "${MASSA_AI_VERBOSE:-0}" = "1" ] && echo -e "$@"; return 0; }

# ── Version detection ─────────────────────────────────────────
# Resolves project root from the location of this file (scripts/).
_MASSA_AI_BANNER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd 2>/dev/null)"

_massa_ai_detect_version() {
  [ -n "${MASSA_AI_VERSION:-}" ] && return
  local pkg="${_MASSA_AI_BANNER_ROOT}/package.json"
  if [ -f "$pkg" ]; then
    if command -v node &>/dev/null; then
      MASSA_AI_VERSION="$(node -e "process.stdout.write(require('${pkg}').version)" 2>/dev/null)"
    elif command -v python3 &>/dev/null; then
      MASSA_AI_VERSION="$(python3 -c "import json; print(json.load(open('${pkg}'))['version'],end='')" 2>/dev/null)"
    elif command -v jq &>/dev/null; then
      MASSA_AI_VERSION="$(jq -r .version "${pkg}" 2>/dev/null)"
    fi
  fi
  MASSA_AI_VERSION="${MASSA_AI_VERSION:-?}"
}

# ── Banner ────────────────────────────────────────────────────
# Printed at most once per process tree. install-harness.sh and each
# plugin installer all call this; without the guard a single --all run
# prints the glyph four times.
massa_ai_banner() {
  [ "${MASSA_AI_BANNER_SHOWN:-0}" = "1" ] && return 0
  MASSA_AI_BANNER_SHOWN=1
  export MASSA_AI_BANNER_SHOWN
  _massa_ai_detect_version
  cat << EOF

   ██     ██      ████       ██████      ██████       ████
   ███   ███     ██  ██     ██    ██    ██    ██     ██  ██
   ████ ████    ██    ██    ██          ██          ██    ██
   ██ ███ ██    ████████     ██████      ██████     ████████
   ██  █  ██    ██    ██          ██          ██    ██    ██
   ██     ██    ██    ██    ██    ██    ██    ██    ██    ██
   ██     ██ ██ ██    ██ ██  ██████  ██  ██████  ██ ██    ██ ██

   Memory-Augmented Semantic Search Agent
   Context, memory and cross-agent management.  v${MASSA_AI_VERSION}
   https://github.com/luizgmassa/massa-ai

EOF
}
