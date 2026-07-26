#!/usr/bin/env bash
#
# massa-ai Codex plugin installer
#
# Copies the plugin bundle (manifest, skills, hooks.json, binary symlink) into
# the user's or project's Codex config directory and merges the 6 massa-ai hook
# events into ~/.codex/hooks.json (or ./.codex/hooks.json) using an
# array-append merge that preserves existing user hooks.
#
# MCP registration is delegated to scripts/install-agents.sh, the single writer
# of host MCP config. This installer no longer ships a plugin-local .mcp.json.
#
# Idempotent: re-running is a no-op when owned entries already present.
# Uninstall removes only ownership-marked entries + the plugin directory.
#
# Usage:
#   apps/codex-plugin/install.sh             # install at user scope (~/.codex)
#   apps/codex-plugin/install.sh --user      #   (same)
#   apps/codex-plugin/install.sh --project  # install at project scope (./.codex)
#   apps/codex-plugin/install.sh --uninstall # remove owned entries + plugin dir
#   apps/codex-plugin/install.sh -h|--help   # show this help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLAUDE_PLUGIN_BIN="$REPO_ROOT/apps/claude-plugin/hooks/massa-ai-hook.ts"

SCOPE="user"
UNINSTALL=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --user) SCOPE="user" ;;
    --project) SCOPE="project" ;;
    --uninstall) UNINSTALL=1 ;;
    --quiet) MASSA_AI_VERBOSE=0 ;;
    --verbose) MASSA_AI_VERBOSE=1 ;;
    --dry-run) DRY_RUN=1; MASSA_AI_VERBOSE=1 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# Banner
source "$SCRIPT_DIR/../../scripts/banner.sh"
massa_ai_banner

# Resolve target base dir
if [[ "$SCOPE" == "project" ]]; then
  CODEX_DIR="$(pwd)/.codex"
else
  CODEX_DIR="$HOME/.codex"
fi
PLUGIN_DIR="$CODEX_DIR/plugins/massa-ai"
HOOKS_JSON="$CODEX_DIR/hooks.json"
AGENTS_DIR="$CODEX_DIR/agents"

# The 6 Codex events → binary subcommands. The command path uses the
# INSTALLED plugin dir (not the placeholder), so Codex invokes the copy.
massa_ai_event_entry() {
  local subcommand="$1"
  cat <<JSON
{ "type": "command", "command": "$PLUGIN_DIR/hooks/massa-ai-hook $subcommand", "_massaAiOwned": true }
JSON
}

# Array-append merge (F5 mitigation): for each of the 6 events, append the
# massa-ai hook entry to the event's array if no entry with
# _massaAiOwned: true already exists. Backup before first write. Uses node
# (preferred) or bun for safe JSON manipulation — bash cannot do JSON safely.
merge_hooks_json() {
  local file="$1"
  local mode="$2" # "install" or "uninstall"
  local ts
  ts="$(date +%Y%m%d%H%M%S)"

  local runner=""
  if command -v node &>/dev/null; then
    runner="node"
  elif command -v bun &>/dev/null; then
    runner="bun"
  else
    echo "Error: node or bun required to merge hooks.json (JSON manipulation)" >&2
    exit 3
  fi

  "$runner" - "$file" "$mode" "$ts" "$PLUGIN_DIR" <<'NODE'
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
const mode = process.argv[3];
const ts = process.argv[4];
const pluginDir = process.argv[5];

const EVENTS = [
  ["SessionStart", "session-start"],
  ["UserPromptSubmit", "user-prompt-submit"],
  ["PreToolUse", "pre-tool-use"],
  ["PostToolUse", "post-tool-use"],
  ["PreCompact", "pre-compact"],
  ["Stop", "stop"],
];

let cfg = {};
let existed = false;
try {
  const raw = fs.readFileSync(file, "utf8");
  if (raw.trim()) {
    cfg = JSON.parse(raw);
    existed = true;
  }
} catch (e) {
  if (e.code === "ENOENT") {
    // no file — start empty
  } else {
    throw e;
  }
}

// Ensure nested hooks object exists (Codex schema requires this structure)
if (typeof cfg.hooks !== "object" || cfg.hooks === null) {
  cfg.hooks = {};
}

function hasOwned(arr) {
  return Array.isArray(arr) && arr.some((e) => e && e._massaAiOwned === true);
}

if (mode === "uninstall") {
  // Remove owned entries from nested location + perform flat→nested migration
  const hooks = cfg.hooks;

  // First, remove owned entries from the correct nested location
  for (const [evt] of EVENTS) {
    if (Array.isArray(hooks[evt])) {
      hooks[evt] = hooks[evt].filter((e) => !(e && e._massaAiOwned === true));
      if (hooks[evt].length === 0) delete hooks[evt];
    }
  }

  // Clean up if hooks object is now empty
  if (Object.keys(hooks).length === 0) delete cfg.hooks;
} else {
  // install: backup before first write if file existed
  if (existed) {
    const bak = `${file}.massa-ai.bak-${ts}`;
    fs.copyFileSync(file, bak);
  }

  // Migration: check for broken flat-key entries at top level that should be removed
  for (const [evt] of EVENTS) {
    if (Array.isArray(cfg[evt])) {
      const ownedEntries = cfg[evt].filter((e) => e && e._massaAiOwned === true);
      // Only remove if ALL entries are owned (user entries are never marked)
      if (ownedEntries.length > 0 && ownedEntries.length === cfg[evt].length) {
        delete cfg[evt];
      }
    }
  }

  // Now write to the correct nested location
  for (const [evt, sub] of EVENTS) {
    if (!Array.isArray(cfg.hooks[evt])) cfg.hooks[evt] = [];
    if (!hasOwned(cfg.hooks[evt])) {
      cfg.hooks[evt].push({
        type: "command",
        command: `${pluginDir}/hooks/massa-ai-hook ${sub}`,
        _massaAiOwned: true,
      });
    }
  }
}

fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
NODE
}

# ── Uninstall ───────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" -eq 1 ]]; then
  echo "Uninstalling massa-ai Codex plugin (scope: $SCOPE)..."
  # Remove owned hook entries (preserves user hooks)
  if [[ -f "$HOOKS_JSON" ]]; then
    merge_hooks_json "$HOOKS_JSON" "uninstall"
    echo "  - removed massa-ai hook entries from $HOOKS_JSON"
  fi
  # Remove plugin directory
  if [[ -d "$PLUGIN_DIR" ]]; then
    rm -rf "$PLUGIN_DIR"
    echo "  - removed $PLUGIN_DIR"
  fi
  # Remove only ownership-marked agent TOML files (R3: shared agents dir, user
  # agents preserved). Marker = "# massa-ai-owned" top comment.
  if [[ -d "$AGENTS_DIR" ]]; then
    removed=0
    for f in "$AGENTS_DIR/"*.toml; do
      [[ -f "$f" ]] || continue
      if head -n1 "$f" | grep -q "^# massa-ai-owned$"; then
        rm -f "$f"
        removed=$((removed + 1))
      fi
    done
    if [[ "$removed" -gt 0 ]]; then
      echo "  - removed ${removed} massa-ai-owned agent TOML files from $AGENTS_DIR/"
    fi
  fi
  echo ""
  echo "Done. User hooks and user agents preserved."
  exit 0
fi

# ── Install ──────────────────────────────────────────────────────────────────
vecho "Installing massa-ai Codex plugin to: $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR/.codex-plugin" "$PLUGIN_DIR/skills" "$PLUGIN_DIR/hooks"

# Copy manifest
cp "$SCRIPT_DIR/.codex-plugin/plugin.json" "$PLUGIN_DIR/.codex-plugin/plugin.json"
vecho "  + .codex-plugin/plugin.json"

# Copy skills
skill_count=0
for src in "$SCRIPT_DIR/skills/"*.md; do
  name="$(basename "$src")"
  cp "$src" "$PLUGIN_DIR/skills/$name"
  vecho "  + skills/$name"
  skill_count=$((skill_count + 1))
done

# Copy hooks.json (the placeholder version — installer replaces paths)
cp "$SCRIPT_DIR/hooks/hooks.json" "$PLUGIN_DIR/hooks/hooks.json"
vecho "  + hooks/hooks.json"

# Older installs shipped a plugin-local .mcp.json here. It was never a Codex
# read path, and MCP is now owned by scripts/install-agents.sh — drop the
# residue so upgraders converge on a single registration.
if [[ -f "$PLUGIN_DIR/.mcp.json" ]]; then
  rm -f "$PLUGIN_DIR/.mcp.json"
  # Not gated by --quiet: this deletes a file in the user's home, so it is a
  # mutation notice rather than per-file chatter.
  echo -e "  - removed stale .mcp.json (MCP is now registered in ~/.codex/config.toml)"
fi

# Create the binary symlink → repo's claude-plugin binary (resolved at install
# time via SCRIPT_DIR → REPO_ROOT). This keeps a single source of truth.
if [[ -f "$CLAUDE_PLUGIN_BIN" ]]; then
  ln -sfn "$CLAUDE_PLUGIN_BIN" "$PLUGIN_DIR/hooks/massa-ai-hook"
  vecho "  + hooks/massa-ai-hook → $CLAUDE_PLUGIN_BIN"
else
  echo "  ⚠ Warning: claude-plugin binary not found at $CLAUDE_PLUGIN_BIN" >&2
  echo "    Hooks will not fire until the binary is available." >&2
fi

# Merge hooks.json (array-append, backup, idempotent)
vecho ""
vecho "Merging hooks into $HOOKS_JSON..."
merge_hooks_json "$HOOKS_JSON" "install"
vecho "  + 6 massa-ai hook events wired (array-append, user hooks preserved)"

# Write 12 subagent specialist TOML files to ~/.codex/agents/ (OUTSIDE the
# plugin dir — Codex custom agents load from the config-root agents/ dir, not
# the plugin dir). Each file carries a "# massa-ai-owned" top comment for
# scoped uninstall (R3: shared agents dir, user agents preserved).
mkdir -p "$AGENTS_DIR"
specialist_count=0
for src in "$SCRIPT_DIR/agents/"massa-ai-*.toml; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  cp "$src" "$AGENTS_DIR/$name"
  vecho "  + $name"
  specialist_count=$((specialist_count + 1))
done
vecho "  + ${specialist_count} subagent specialists: investigator, planner, builder, reviewer, context-curator, verification-agent, requirements-analyst, architecture-specialist, test-engineer, documentation-agent, audit-specialist, mobile-specialist"

# ── MCP registration (delegated) ─────────────────────────────────────────────
# scripts/install-agents.sh is the single writer of host MCP config. It writes
# [mcp_servers.massa-ai] into ~/.codex/config.toml at USER scope — a --project
# plugin install still registers MCP for the whole user.
vecho ""
vecho "Registering MCP server (user scope) via scripts/install-agents.sh..."
if [[ -f "$REPO_ROOT/scripts/install-agents.sh" ]]; then
  # On success the delegated output is detail (usually "up to date"), so it is
  # gated. On failure it is never gated: a silently-failed MCP registration is
  # exactly the bug this change set exists to fix.
  if agents_out="$(MASSA_AI_SUPPRESS_SPECIALIST_HINT=1 bash "$REPO_ROOT/scripts/install-agents.sh" --agent codex --yes 2>&1)"; then
    vecho "$agents_out"
  else
    echo "$agents_out" >&2
    echo "  ⚠ MCP wiring failed — run: bash scripts/install-agents.sh --agent codex --yes" >&2
  fi
else
  echo "  ⚠ scripts/install-agents.sh not found — register MCP with: bash scripts/install-agents.sh --agent codex --yes" >&2
fi

# Summary line in quiet mode
if [ "${MASSA_AI_VERBOSE:-0}" != "1" ]; then
  ok "codex plugin installed (${skill_count} skills, ${specialist_count} specialists, 6 hooks)"
else
  vecho ""
  vecho "Done. Restart Codex to pick up the plugin."
  vecho ""
  vecho "⚠ Run /hooks in Codex to trust massa-ai hooks, or no observations will be captured."
  vecho "💡 MCP is registered in ~/.codex/config.toml by scripts/install-agents.sh (single writer)."
fi