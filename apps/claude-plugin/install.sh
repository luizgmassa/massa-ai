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
# Plugin-registry registration is delegated to the `claude` CLI, which owns the
# format of known_marketplaces.json / installed_plugins.json / settings.json's
# enabledPlugins. Writing those files by hand is what this installer used to
# omit entirely, which is why the plugin never appeared in /plugin despite the
# files above all being written correctly.
#
# The two routes are mutually exclusive by construction. When the CLI route
# succeeds, the plugin bundle supplies commands, agents and hooks/hooks.json
# itself, so this script removes its own loose copies instead of adding them —
# otherwise every lifecycle event fires twice and every command appears twice.
# When the CLI is absent or too old, the file route runs exactly as before.
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
# shellcheck source=scripts/lib/installer-shared.sh
source "$REPO_ROOT/scripts/lib/installer-shared.sh"
SCOPE="user"
UNINSTALL=0
DRY_RUN=0
# The marketplace root to register. install-harness.sh resolves this once for
# the whole run (--plugin-source local|copy|auto); a direct invocation of this
# script defaults to the checkout it lives in.
PLUGIN_SOURCE_ROOT="${MASSA_AI_PLUGIN_SOURCE_ROOT:-$REPO_ROOT}"

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

# ── Skills bundling (PDO-08, 09 / D3 two-writer ownership) ──────────────────
# scripts/install-skills.sh remains the single writer once it has already
# claimed this platform (skillsOwner: "repo" in the shared install-state.json).
# This plugin installs its bundled massa-ai/persona-router skills into the
# SAME harness skills directory (~/.claude/skills, not this plugin's cache)
# only when that has not happened, mirroring the MCP single-writer precedent
# (test-mcp-single-writer.sh). A repo checkout's own --apply always takes
# precedence over a prior plugin install — see install-skills.sh.
HARNESS_STATE_FILE="$HOME/.config/massa-ai/install-state.json"
HARNESS_SKILLS_DIR="$TARGET/skills"
HARNESS_HOST="claude"

harness_skills_owner() {
  local runner="$1"
  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" <<'NODE'
const fs = require("fs");
const [, , file, host] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const rec = data && data.platforms && data.platforms[host];
  process.stdout.write(rec && rec.skillsOwner === "repo" ? "repo" : "none");
} catch {
  process.stdout.write("none");
}
NODE
}

install_bundled_skills() {
  local runner=""
  if command -v node &>/dev/null; then runner="node"
  elif command -v bun &>/dev/null; then runner="bun"
  else
    echo "  ⚠ node or bun required to install bundled skills — skipping" >&2
    return 0
  fi

  if [[ "$(harness_skills_owner "$runner")" == "repo" ]]; then
    vecho "  ↷ skills already installed by scripts/install-skills.sh (repo-owned) — skipping bundled copy"
    return 0
  fi

  local installed=0 name src dest
  for name in massa-ai persona-router; do
    src="$SCRIPT_DIR/skills/$name"
    [[ -d "$src" ]] || continue
    dest="$HARNESS_SKILLS_DIR/$name"
    if [[ -e "$dest" && ! -d "$dest" ]]; then
      echo "  ⚠ $dest exists and is not a directory — skipping" >&2
      continue
    fi
    mkdir -p "$HARNESS_SKILLS_DIR"
    rm -rf "$dest"
    cp -R "$src" "$dest"
    installed=$((installed + 1))
  done
  vecho "  + ${installed} harness skills installed to $HARNESS_SKILLS_DIR (plugin-owned)"

  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" "$TARGET" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , file, host, root] = process.argv;
let data = { version: 2, platforms: {} };
try {
  const existing = JSON.parse(fs.readFileSync(file, "utf8"));
  if (existing && typeof existing === "object" && !Array.isArray(existing)) data = existing;
} catch { /* fresh */ }
if (typeof data.platforms !== "object" || data.platforms === null || Array.isArray(data.platforms)) {
  data.platforms = {};
}
data.version = 2;
data.platforms[host] = { root, skillsOwner: "plugin", skills: ["massa-ai", "persona-router"] };
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
NODE
}

uninstall_bundled_skills() {
  local runner=""
  if command -v node &>/dev/null; then runner="node"
  elif command -v bun &>/dev/null; then runner="bun"
  else return 0
  fi

  # harness_skills_owner collapses to "repo" | "none"; uninstall only ever
  # acts on an exact "plugin" record, so query the raw value directly.
  local raw_owner
  raw_owner="$("$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" <<'NODE'
const fs = require("fs");
const [, , file, host] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const rec = data && data.platforms && data.platforms[host];
  process.stdout.write(rec ? String(rec.skillsOwner) : "none");
} catch {
  process.stdout.write("none");
}
NODE
  )"
  [[ "$raw_owner" == "plugin" ]] || return 0

  local name
  for name in massa-ai persona-router; do
    rm -rf "$HARNESS_SKILLS_DIR/$name"
  done
  rmdir "$HARNESS_SKILLS_DIR" 2>/dev/null || true
  echo "  - removed plugin-owned harness skills from $HARNESS_SKILLS_DIR"

  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" <<'NODE'
const fs = require("fs");
const [, , file, host] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (data && data.platforms && data.platforms[host] && data.platforms[host].skillsOwner === "plugin") {
    delete data.platforms[host];
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
} catch { /* nothing to clean up */ }
NODE
}

# ── Plugin-registry registration (delegated to the claude CLI) ──────────────
# The CLI owns the registry format, so it is the only supported way to make the
# plugin appear in /plugin. Every failure path returns non-zero and the caller
# falls back to the file route: a missing CLI, a build too old for
# `plugin marketplace add`, or an unrelated binary named `claude` must degrade,
# never abort. Scope is deliberately absent — Claude Code records plugin
# installs at user scope even for --project, the same reason PLUGIN_REGISTRY
# resolves from $HOME.
PLUGIN_MARKETPLACE="massa-ai"
PLUGIN_ID="massa-ai@massa-ai"

claude_plugin_registered() {
  [[ -f "$PLUGIN_REGISTRY" ]] || return 1
  grep -q '"massa-ai@' "$PLUGIN_REGISTRY" 2>/dev/null
}

register_claude_plugin() {
  # Explicit opt-out. Also what pins the file-route tests to the file route:
  # without it the suite's outcome would depend on whether the machine running
  # it happens to have the claude CLI installed.
  [[ "${MASSA_AI_SKIP_PLUGIN_REGISTRY:-0}" == "1" ]] && return 1
  installer_host_cli_supports claude plugin marketplace || return 1
  if [[ ! -f "$PLUGIN_SOURCE_ROOT/.claude-plugin/marketplace.json" ]]; then
    vecho "  – no marketplace manifest under $PLUGIN_SOURCE_ROOT — keeping file route"
    return 1
  fi
  # Both subcommands are idempotent: a second run reports "already on disk" /
  # "already installed" and exits 0, leaving the registry files byte-identical.
  claude plugin marketplace add "$PLUGIN_SOURCE_ROOT" </dev/null >/dev/null 2>&1 || return 1
  claude plugin install "$PLUGIN_ID" </dev/null >/dev/null 2>&1 || return 1
  claude_plugin_registered
}

unregister_claude_plugin() {
  installer_host_cli_supports claude plugin marketplace || return 0
  claude plugin uninstall "$PLUGIN_ID" </dev/null >/dev/null 2>&1 || true
  claude plugin marketplace remove "$PLUGIN_MARKETPLACE" </dev/null >/dev/null 2>&1 || true
}

# Strip artifacts a previous file-route install left behind. Called on the
# plugin route, where the bundle supplies all three itself. Without this an
# upgrading user keeps their old loose commands and merged hooks *and* gains
# the plugin's copies — double-firing every lifecycle event, which is the exact
# bug the guard inside merge_settings_hooks exists to prevent.
remove_file_route_artifacts() {
  if [[ -f "$SETTINGS_JSON" ]]; then
    merge_settings_hooks "$SETTINGS_JSON" "uninstall"
  fi
  if [[ -d "$TARGET/commands" ]]; then
    for src in "$SCRIPT_DIR/commands/"*.md; do
      [[ -f "$src" ]] || continue
      rm -f "$TARGET/commands/massa-ai-$(basename "$src" .md).md"
    done
  fi
  if [[ -d "$TARGET/agents" ]]; then
    for src in "$TARGET/agents/"massa-ai-*.md; do
      [[ -f "$src" ]] || continue
      rm -f "$src"
    done
  fi
}

# ── Uninstall ───────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" -eq 1 ]]; then
  echo "Uninstalling massa-ai Claude Code plugin (scope: $SCOPE)..."
  unregister_claude_plugin
  uninstall_bundled_skills
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

# Route selection. The plugin route is preferred because it is the only one
# that puts massa-ai in /plugin; the file route remains the fallback so a host
# without a usable `claude` CLI still gets a working install.
PLUGIN_ROUTE=0
if register_claude_plugin; then
  PLUGIN_ROUTE=1
fi

command_count=0
specialist_count=0

if [[ "$PLUGIN_ROUTE" -eq 1 ]]; then
  # The bundle at $PLUGIN_SOURCE_ROOT/apps/claude-plugin already carries these,
  # so counting them keeps the summary honest without copying anything.
  for src in "$SCRIPT_DIR/commands/"*.md; do
    [[ -f "$src" ]] && command_count=$((command_count + 1))
  done
  for src in "$SCRIPT_DIR/agents/"massa-ai-*.md; do
    [[ -f "$src" ]] && specialist_count=$((specialist_count + 1))
  done
  remove_file_route_artifacts
  vecho "  + registered ${PLUGIN_ID} (marketplace root: ${PLUGIN_SOURCE_ROOT})"
  vecho "  + commands, subagents and hooks now served by the plugin bundle"
else
  mkdir -p "$TARGET/commands" "$TARGET/agents"

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
  for src in "$SCRIPT_DIR/agents/"massa-ai-*.md; do
    [[ -f "$src" ]] || continue
    name="$(basename "$src")"
    cp "$src" "$TARGET/agents/$name"
    vecho "  + $name"
    specialist_count=$((specialist_count + 1))
  done
  vecho "  + ${specialist_count} subagent specialists (generated from skills/agents/*/SKILL.md)"
fi

# Skills bundling (PDO-08, 09): install massa-ai/persona-router into the
# shared harness skills directory, unless scripts/install-skills.sh already
# owns it for this platform.
vecho ""
install_bundled_skills

# Merge hooks into settings.json (array-append, backup, idempotent).
# Skipped on the plugin route, where hooks/hooks.json inside the bundle is
# already wired by Claude Code itself.
if [[ "$PLUGIN_ROUTE" -eq 0 ]]; then
  vecho ""
  vecho "Merging hooks into $SETTINGS_JSON..."
  if [[ ! -f "$HOOK_BIN" ]]; then
    echo "  ⚠ Warning: hook binary not found at $HOOK_BIN" >&2
    echo "    Hooks will not fire until the binary is available." >&2
  fi
  merge_settings_hooks "$SETTINGS_JSON" "install"
  vecho "  + 5 massa-ai hook events wired (array-append, user hooks preserved)"
fi

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
  if [[ "$PLUGIN_ROUTE" -eq 1 ]]; then
    ok "claude plugin registered (${command_count} commands, ${specialist_count} specialists, 5 hooks) — shows in /plugin"
  else
    ok "claude plugin installed (${command_count} commands, ${specialist_count} specialists, 5 hooks)"
    warn "claude CLI unavailable — not registered in /plugin. Register it with:"
    warn "  claude plugin marketplace add \"$PLUGIN_SOURCE_ROOT\" && claude plugin install $PLUGIN_ID"
  fi
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