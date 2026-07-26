#!/usr/bin/env bash
#
# massa-ai OpenCode plugin installer
#
# Installs the massa-ai OpenCode plugin bundle (a single pre-built JS file) and
# registers it with OpenCode's plugin configuration. Also installs the 12
# subagent specialist agents.
#
# The plugin registers massa-ai tools in-process, so this installer delegates to
# scripts/install-agents.sh to UNINSTALL the now-redundant MCP entry (if it was
# previously written).
#
# Idempotent: re-running is a no-op when the plugin symlink and config entry are
# already present.
# Uninstall removes only ownership-marked entries, preserving user plugins and
# user top-level keys.
#
# Usage:
#   apps/opencode-plugin/install.sh             # install at user scope (~/.config/opencode)
#   apps/opencode-plugin/install.sh --user      #   (same)
#   apps/opencode-plugin/install.sh --project   # install at project scope (./.opencode)
#   apps/opencode-plugin/install.sh --uninstall # remove owned plugin entry + agents
#   apps/opencode-plugin/install.sh -h|--help   # show this help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCOPE="user"
UNINSTALL=0
DRY_RUN=0
# Inherit the harness's verbosity by default; --quiet / --verbose override it.
MASSA_AI_VERBOSE="${MASSA_AI_VERBOSE:-0}"

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
  TARGET="$(pwd)/.opencode"
else
  TARGET="$HOME/.config/opencode"
fi
CONFIG_JSON="$TARGET/opencode.json"
PLUGINS_DIR="$TARGET/plugins/massa-ai"
AGENTS_DIR="$TARGET/agents"
PLUGIN_JS="$REPO_ROOT/apps/opencode-plugin/dist/index.js"

# vecho / vinfo / ok / warn / err / die come from scripts/banner.sh — do not
# redefine them here, or --quiet stops matching the other three installers.

# ── Build guard ──────────────────────────────────────────────────────────────
if [[ ! -f "$PLUGIN_JS" ]]; then
  echo "Error: plugin bundle not found at $PLUGIN_JS" >&2
  echo "  Run: bun run build" >&2
  exit 1
fi

# ── Uninstall ────────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" -eq 1 ]]; then
  vecho "Uninstalling massa-ai OpenCode plugin (scope: $SCOPE)..."

  # Remove plugin symlink
  if [[ -L "$PLUGINS_DIR/index.js" ]]; then
    rm -f "$PLUGINS_DIR/index.js"
    vinfo "removed plugin symlink from $PLUGINS_DIR/"
    if [[ -d "$PLUGINS_DIR" ]]; then
      rmdir "$PLUGINS_DIR" 2>/dev/null || true
    fi
  fi

  # Remove agent symlinks
  if [[ -d "$AGENTS_DIR" ]]; then
    removed=0
    for agent in "$SCRIPT_DIR/agents/"massa-ai-*.md; do
      [[ -f "$agent" ]] || continue
      name="$(basename "$agent")"
      if [[ -L "$AGENTS_DIR/$name" ]]; then
        rm -f "$AGENTS_DIR/$name"
        removed=$((removed + 1))
      fi
    done
    if [[ "$removed" -gt 0 ]]; then
      vinfo "removed $removed agent symlinks from $AGENTS_DIR/"
    fi
  fi

  # Remove plugin entry from opencode.json
  if [[ -f "$CONFIG_JSON" ]]; then
    ts="$(date +%Y%m%d%H%M%S)"
    runner=""
    if command -v node &>/dev/null; then
      runner="node"
    elif command -v bun &>/dev/null; then
      runner="bun"
    else
      echo "Error: node or bun required to edit opencode.json" >&2
      exit 3
    fi

    "$runner" - "$CONFIG_JSON" "$ts" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const ts = process.argv[3];

let cfg = {};
try {
  const raw = fs.readFileSync(file, "utf8");
  if (raw.trim()) cfg = JSON.parse(raw);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

if (Array.isArray(cfg.plugin)) {
  cfg.plugin = cfg.plugin.filter((p) => p !== "./plugins/massa-ai/index.js");
  if (cfg.plugin.length === 0) delete cfg.plugin;
}

fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
NODE
    vinfo "removed plugin entry from $CONFIG_JSON"
  fi

  # Delegate to install-agents.sh to remove the MCP entry (if it exists). No
  # --target override: MCP is always registered at user scope, and --target
  # takes a $HOME root rather than a config dir.
  if [[ -f "$REPO_ROOT/scripts/install-agents.sh" ]]; then
    if agents_out="$(bash "$REPO_ROOT/scripts/install-agents.sh" \
      --agent opencode --uninstall --yes 2>&1)"; then
      vecho "$agents_out"
    else
      echo "$agents_out" >&2
      echo "  ⚠ MCP cleanup failed — run: bash scripts/install-agents.sh --agent opencode --uninstall --yes" >&2
    fi
  fi

  vecho ""
  vecho "Done. User plugins and top-level keys preserved."
  exit 0
fi

# ── Install ──────────────────────────────────────────────────────────────────
vinfo "Installing massa-ai OpenCode plugin to: $TARGET"

# Create plugin directory
mkdir -p "$PLUGINS_DIR"

# Symlink the plugin bundle (resolve to repo's dist/index.js)
resolved_plugin_js="$(cd "$REPO_ROOT" && pwd)/apps/opencode-plugin/dist/index.js"

# Pre-flight check: refuse to clobber a regular file
if [[ -e "$PLUGINS_DIR/index.js" && ! -L "$PLUGINS_DIR/index.js" ]]; then
  echo "Warning: $PLUGINS_DIR/index.js exists as a regular file (not a symlink)" >&2
  echo "  Refusing to overwrite. Remove it manually if you want to proceed." >&2
  exit 1
fi

ln -sfn "$resolved_plugin_js" "$PLUGINS_DIR/index.js"
vinfo "symlink: $PLUGINS_DIR/index.js → $resolved_plugin_js"

# Merge into opencode.json
mkdir -p "$TARGET"

if [[ -f "$CONFIG_JSON" ]]; then
  # Backup before modifying
  ts="$(date +%Y%m%d%H%M%S)"
  cp "$CONFIG_JSON" "$CONFIG_JSON.massa-ai.bak-${ts}"
  vinfo "backup: $CONFIG_JSON.massa-ai.bak-${ts}"
fi

runner=""
if command -v node &>/dev/null; then
  runner="node"
elif command -v bun &>/dev/null; then
  runner="bun"
else
  echo "Error: node or bun required to edit opencode.json" >&2
  exit 3
fi

"$runner" - "$CONFIG_JSON" <<'NODE'
const fs = require("fs");
const file = process.argv[2];

let cfg = {};
try {
  const raw = fs.readFileSync(file, "utf8");
  if (raw.trim()) cfg = JSON.parse(raw);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

if (!Array.isArray(cfg.plugin)) cfg.plugin = [];

const entry = "./plugins/massa-ai/index.js";
if (!cfg.plugin.includes(entry)) {
  cfg.plugin.push(entry);
}

fs.mkdirSync(require("path").dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
NODE

vinfo "plugin entry added to $CONFIG_JSON"

# Install agent symlinks
mkdir -p "$AGENTS_DIR"
specialist_count=0
for src in "$SCRIPT_DIR/agents/"massa-ai-*.md; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"

  # Pre-flight: refuse to clobber a regular file
  if [[ -e "$AGENTS_DIR/$name" && ! -L "$AGENTS_DIR/$name" ]]; then
    echo "Warning: $AGENTS_DIR/$name exists as a regular file (not a symlink)" >&2
    echo "  Skipping to avoid overwriting user content." >&2
    continue
  fi

  resolved_src="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
  ln -sfn "$resolved_src" "$AGENTS_DIR/$name"
  specialist_count=$((specialist_count + 1))
done

vecho "  + ${specialist_count} subagent specialists: investigator, planner, builder, reviewer, context-curator, verification-agent, requirements-analyst, architecture-specialist, test-engineer, documentation-agent, audit-specialist, mobile-specialist"
vecho ""

# Delegate to install-agents.sh to REMOVE the MCP entry (since the plugin registers tools in-process)
if [[ -f "$REPO_ROOT/scripts/install-agents.sh" ]]; then
  vecho "Removing redundant MCP entry (plugin registers tools in-process) via scripts/install-agents.sh..."

  # No --target override: MCP is always registered at *user* scope, even for a
  # --project plugin install, so the entry to withdraw is always the user one.
  # install-agents.sh --target takes a $HOME root, not a config dir.
  # Never gated on failure: leaving the MCP entry in place would double the
  # entire 14-tool surface, since the plugin also registers them in-process.
  if agents_out="$(bash "$REPO_ROOT/scripts/install-agents.sh" \
    --agent opencode --uninstall --yes 2>&1)"; then
    vecho "$agents_out"
  else
    echo "$agents_out" >&2
    echo "  ⚠ Could not withdraw the redundant OpenCode MCP entry — tools may be" >&2
    echo "    registered twice. Run: bash scripts/install-agents.sh --agent opencode --uninstall --yes" >&2
  fi
fi

if [ "${MASSA_AI_VERBOSE:-0}" = "1" ]; then
  vecho ""
  vecho "Done. Restart OpenCode to pick up the plugin."
  vecho ""
  vecho "💡 Agents are installed in $TARGET/agents/; plugin tools are registered in-process."
else
  ok "opencode plugin installed (${specialist_count} specialists, 14 in-process tools)"
fi
