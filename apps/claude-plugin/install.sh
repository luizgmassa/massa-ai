#!/usr/bin/env bash
#
# massa-ai Claude Code plugin installer
#
# Copies slash commands and the generated massa-ai subagents into the user's
# Claude Code config directory AND auto-writes the 5 massa-ai hook events
# into ~/.claude/settings.json (or ./.claude/settings.json) using an
# array-append merge that preserves existing user hooks. The hooks block uses
# Claude Code's nested matcher-group + hooks[] form, each owned entry marked
# with _massaAiOwned: true.
#
# MCP registration is delegated to scripts/install-agents.sh, the single writer
# of host MCP config; it merges the massa-ai entry alongside the hooks block.
#
# Idempotent: re-running is a no-op when owned hooks already present.
# Uninstall removes only ownership-marked hook entries + commands/agents,
# preserving user keys and user hooks.
#
# Usage:
#   apps/claude-plugin/install.sh             # install at user scope (~/.claude)
#   apps/claude-plugin/install.sh --user      #   (same)
#   apps/claude-plugin/install.sh --project   # install at project scope (./.claude)
#   apps/claude-plugin/install.sh --uninstall # remove owned hooks + commands/agents
#   apps/claude-plugin/install.sh -h|--help   # show this help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
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

if [[ "$SCOPE" == "project" ]]; then
  TARGET="$(pwd)/.claude"
else
  TARGET="$HOME/.claude"
fi
SETTINGS_JSON="$TARGET/settings.json"
# The shared binary lives in the repo (not copied) — settings.json references
# its absolute path so Claude Code can invoke `bun run <path> <subcommand>`.
HOOK_BIN="$SCRIPT_DIR/hooks/massa-ai-hook.ts"
# Double-fire guard input. The plugin now ships hooks/hooks.json, so a user who
# installed massa-ai through /plugin AND ran this script would ingest every
# lifecycle event twice. Claude Code records plugin installs at USER scope even
# for --project, so this resolves from $HOME, never from $SCOPE.
PLUGIN_REGISTRY="$HOME/.claude/plugins/installed_plugins.json"

# The 5 Claude Code events → binary subcommands. The matcher-group entry shape:
#   { "hooks": [{ "type": "command", "command": "bun run \"<HOOK_BIN>\" <sub>" }],
#     "_massaAiOwned": true }
# The merge appends one owned matcher-group entry per event array, preserving
# any pre-existing user matcher-group entries (F5 mitigation).
merge_settings_hooks() {
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
    echo "Error: node or bun required to merge settings.json (JSON manipulation)" >&2
    exit 3
  fi

  "$runner" - "$file" "$mode" "$ts" "$HOOK_BIN" "$PLUGIN_REGISTRY" <<'NODE'
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
const mode = process.argv[3];
const ts = process.argv[4];
const hookBin = process.argv[5];
const pluginRegistry = process.argv[6];

const EVENTS = [
  ["SessionStart", "session-start"],
  ["UserPromptSubmit", "user-prompt-submit"],
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

function hasOwned(arr) {
  return Array.isArray(arr) && arr.some((e) => e && e._massaAiOwned === true);
}

// Double-fire guard: true when massa-ai is already installed as a Claude Code
// plugin, in which case the plugin's own hooks/hooks.json is already wired and
// appending owned entries here would ingest every event twice.
//
// Fails OPEN in every uncertain case — a missing registry is the normal fresh
// install, and a malformed one must not block installation. That is deliberately
// unlike the read at the top of this script, which only tolerates ENOENT.
function pluginAlreadyInstalled() {
  let raw;
  try {
    raw = fs.readFileSync(pluginRegistry, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error(
        `  ⚠ could not read ${pluginRegistry} (${e.code}) — wiring hooks anyway`,
      );
    }
    return false;
  }
  try {
    const plugins = JSON.parse(raw).plugins;
    if (!plugins || typeof plugins !== "object") return false;
    return Object.keys(plugins).some((k) => /^massa-ai@/.test(k));
  } catch {
    console.error(
      `  ⚠ ${pluginRegistry} is not valid JSON — wiring hooks anyway`,
    );
    return false;
  }
}

if (mode === "uninstall") {
  const hooks = cfg.hooks;
  if (hooks && typeof hooks === "object" && !Array.isArray(hooks)) {
    for (const [evt] of EVENTS) {
      if (Array.isArray(hooks[evt])) {
        hooks[evt] = hooks[evt].filter((e) => !(e && e._massaAiOwned === true));
        if (hooks[evt].length === 0) delete hooks[evt];
      }
    }
    if (Object.keys(hooks).length === 0) delete cfg.hooks;
  }
} else if (pluginAlreadyInstalled()) {
  console.error(
    "  ↷ massa-ai is installed as a Claude Code plugin — skipping settings.json" +
      " hooks (the plugin already provides them; wiring both would double-fire)",
  );
  process.exit(0);
} else {
  // install: backup before first write if file existed
  if (existed) {
    const bak = `${file}.massa-ai.bak-${ts}`;
    fs.copyFileSync(file, bak);
  }
  if (!cfg.hooks || typeof cfg.hooks !== "object" || Array.isArray(cfg.hooks)) {
    cfg.hooks = {};
  }
  for (const [evt, sub] of EVENTS) {
    if (!Array.isArray(cfg.hooks[evt])) cfg.hooks[evt] = [];
    if (!hasOwned(cfg.hooks[evt])) {
      cfg.hooks[evt].push({
        hooks: [
          {
            type: "command",
            command: `bun run "${hookBin}" ${sub}`,
          },
        ],
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
  echo "Uninstalling massa-ai Claude Code plugin (scope: $SCOPE)..."
  # Remove owned hook entries (preserves user hooks + user keys)
  if [[ -f "$SETTINGS_JSON" ]]; then
    merge_settings_hooks "$SETTINGS_JSON" "uninstall"
    echo "  - removed massa-ai hook entries from $SETTINGS_JSON"
  fi
  # Remove owned command files
  if [[ -d "$TARGET/commands" ]]; then
    for src in "$SCRIPT_DIR/commands/"*.md; do
      name="$(basename "$src" .md)"
      rm -f "$TARGET/commands/massa-ai-${name}.md"
    done
    echo "  - removed massa-ai-* commands from $TARGET/commands/"
  fi
  # Remove every massa-ai-owned subagent specialist. All of them are generated
  # from skills/agents/*/SKILL.md, so the massa-ai- name prefix is the ownership
  # marker; user agents without that prefix are untouched.
  if [[ -d "$TARGET/agents" ]]; then
    for src in "$TARGET/agents/"massa-ai-*.md; do
      [[ -f "$src" ]] || continue
      rm -f "$src"
    done
    echo "  - removed massa-ai-* subagent specialists from $TARGET/agents/"
  fi
  echo ""
  echo "Done. User hooks, keys, and non-massa-ai agents preserved."
  exit 0
fi

# ── Install ──────────────────────────────────────────────────────────────────
vecho "Installing massa-ai Claude Code plugin to: $TARGET"
mkdir -p "$TARGET/commands" "$TARGET/agents"

# Count for summary
command_count=0
# Slash commands — prefix with 'massa-ai-' to avoid collisions with user commands
for src in "$SCRIPT_DIR/commands/"*.md; do
  name="$(basename "$src" .md)"
  dest="$TARGET/commands/massa-ai-${name}.md"
  cp "$src" "$dest"
  vecho "  + /massa-ai-${name}"
  command_count=$((command_count + 1))
done

# Subagent specialists (generated from skills/agents/*/SKILL.md, navigator
# included). The massa-ai- name prefix is the ownership marker used by uninstall.
specialist_count=0
for src in "$SCRIPT_DIR/agents/"massa-ai-*.md; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  cp "$src" "$TARGET/agents/$name"
  vecho "  + $name"
  specialist_count=$((specialist_count + 1))
done
vecho "  + ${specialist_count} subagent specialists (generated from skills/agents/*/SKILL.md)"

# Merge hooks into settings.json (array-append, backup, idempotent)
vecho ""
vecho "Merging hooks into $SETTINGS_JSON..."
if [[ ! -f "$HOOK_BIN" ]]; then
  echo "  ⚠ Warning: hook binary not found at $HOOK_BIN" >&2
  echo "    Hooks will not fire until the binary is available." >&2
fi
merge_settings_hooks "$SETTINGS_JSON" "install"
vecho "  + 5 massa-ai hook events wired (array-append, user hooks preserved)"

# ── MCP registration (delegated) ─────────────────────────────────────────────
# scripts/install-agents.sh is the single writer of host MCP config. It merges
# the massa-ai entry into ~/.claude/settings.json alongside the hooks block
# written above, at USER scope — a --project plugin install still registers MCP
# for the whole user.
vecho ""
vecho "Registering MCP server (user scope) via scripts/install-agents.sh..."
if [[ -f "$REPO_ROOT/scripts/install-agents.sh" ]]; then
  # On success the delegated output is detail (usually "up to date"), so it is
  # gated. On failure it is never gated: a silently-failed MCP registration is
  # exactly the bug this change set exists to fix.
  if agents_out="$(MASSA_AI_SUPPRESS_SPECIALIST_HINT=1 bash "$REPO_ROOT/scripts/install-agents.sh" --agent claude-code --yes 2>&1)"; then
    vecho "$agents_out"
  else
    echo "$agents_out" >&2
    echo "  ⚠ MCP wiring failed — run: bash scripts/install-agents.sh --agent claude-code --yes" >&2
  fi
else
  echo "  ⚠ scripts/install-agents.sh not found — register MCP with: bash scripts/install-agents.sh --agent claude-code --yes" >&2
fi

# Summary line in quiet mode
if [ "${MASSA_AI_VERBOSE:-0}" != "1" ]; then
  ok "claude plugin installed (${command_count} commands, ${specialist_count} specialists, 5 hooks)"
else
  vecho ""
  vecho "Done. Restart Claude Code to pick up the new commands and hooks."
  vecho ""
fi
vecho "Next steps:"
vecho "  1. Try: /massa-ai-status"
vecho "  2. Try: /massa-ai-map (on an indexed project)"
# ~/.claude.json, not ~/.claude/settings.json — Claude Code reads MCP
# definitions from the former; settings.json only holds approval controls.
vecho "💡 Hooks are wired by this plugin; MCP is registered in ~/.claude.json by scripts/install-agents.sh (single writer)."