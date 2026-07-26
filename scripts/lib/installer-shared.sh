#!/usr/bin/env bash
# ============================================================
#  massa-ai — shared installer helpers
#  Source this file; do not run it directly.
#
#  Usage:
#    source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-shared.sh"
#
#  Bash 3.2 compatible (macOS ships bash 3.2): no associative arrays,
#  no ${var^^}, no readarray. Function-only — no side effects at source time.
# ============================================================

# ── Ownership / backup conventions ───────────────────────────
# Every value massa-ai writes into a host config carries this marker so an
# uninstall can find exactly our keys without pattern matching.
MASSA_AI_OWNED_KEY="massa-ai"
MASSA_AI_OWNED_MARKER="_massaAiOwned"
MASSA_AI_BACKUP_SUFFIX=".massa-ai.bak"

# ── Runner detection ─────────────────────────────────────────
# Bash cannot manipulate JSON or TOML safely, so every structured write runs
# through an inline node/bun heredoc. Mirrors apps/claude-plugin/install.sh.
installer_detect_runner() {
  if command -v node >/dev/null 2>&1; then
    echo "node"
    return 0
  fi
  if command -v bun >/dev/null 2>&1; then
    echo "bun"
    return 0
  fi
  return 1
}

# installer_require_runner [what]
# Echoes the runner name, or exits 3 with a message naming what needed it.
installer_require_runner() {
  local what="${1:-config files}"
  local runner
  if ! runner="$(installer_detect_runner)"; then
    echo "Error: node or bun required to read/write ${what} (JSON/TOML manipulation)" >&2
    exit 3
  fi
  echo "$runner"
}

# ── Timestamps / backups ─────────────────────────────────────
installer_timestamp() {
  date -u +%Y-%m-%dT%H-%M-%S-000Z
}

# installer_backup_file <path>
# Copies <path> to <path>.massa-ai.bak-<ts>. When the file does not exist yet an
# empty marker is reserved instead, so "a backup exists before every write" holds
# on first creation too. Echoes the backup path.
installer_backup_file() {
  local target="$1"
  local bak="${target}${MASSA_AI_BACKUP_SUFFIX}-$(installer_timestamp)"
  mkdir -p "$(dirname "$target")"
  if [ -f "$target" ]; then
    cp "$target" "$bak"
  else
    : > "$bak"
  fi
  echo "$bak"
}

# ── Home resolution ──────────────────────────────────────────
# installer_resolve_path <path>
# Absolute path without requiring the directory to exist (realpath/-f is not
# portable to macOS's system coreutils).
installer_resolve_path() {
  local p="$1"
  case "$p" in
    /*) ;;
    *) p="$(pwd)/$p" ;;
  esac
  # Collapse trailing slash and "/./" segments; leave symlinks alone (lstat
  # semantics matter for the symlink-conflict checks downstream).
  p="${p%/}"
  [ -n "$p" ] || p="/"
  echo "$p"
}

# installer_is_real_home <path> → 0 when <path> resolves to $HOME
installer_is_real_home() {
  local candidate resolved_home
  candidate="$(installer_resolve_path "$1")"
  resolved_home="$(installer_resolve_path "${HOME:-/nonexistent}")"
  [ "$candidate" = "$resolved_home" ]
}

# installer_consent_gate <target_home> <yes_flag> <exit_code> [label]
# Refuses to write the real $HOME without --yes. A TTY gets an interactive
# prompt; a non-TTY refuses outright. The exit code is a parameter because
# install-skills.sh exits 1 and install-agents.sh exits 13 on refusal.
installer_consent_gate() {
  local target="$1" yes_flag="$2" code="$3" label="${4:-installer}"

  [ "$yes_flag" = "1" ] && return 0
  installer_is_real_home "$target" || return 0

  if [ -t 0 ]; then
    local reply=""
    printf '  Write massa-ai config into your real $HOME (%s)? [y/N]: ' "$target" >&2
    read -r reply || reply=""
    case "$reply" in
      y|Y|yes|YES) return 0 ;;
    esac
    echo "[consent] ${label}: refusing to write real \$HOME (${target}) without consent. Re-run with --yes, or pass --target <dir> / --dry-run." >&2
    exit "$code"
  fi

  echo "[consent] ${label}: refusing to write real \$HOME (${target}) in a non-interactive context. Re-run with --yes, --target <dir>, or --dry-run." >&2
  exit "$code"
}
