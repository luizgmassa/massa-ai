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
# Marketplace/bundle root resolved once per run by install-harness.sh
# (--plugin-source local|copy|auto). OpenCode has no marketplace registry — its
# opencode.json `plugin` array IS the registry — but the symlink below still has
# to point somewhere that outlives the checkout, so it honours the same root.
PLUGIN_SOURCE_ROOT="${MASSA_AI_PLUGIN_SOURCE_ROOT:-$REPO_ROOT}"
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
PLUGINS_DIR="$TARGET/plugins/massa-ai"
AGENTS_DIR="$TARGET/agents"
PLUGIN_JS="$REPO_ROOT/apps/opencode-plugin/dist/index.js"
# Vendored, byte-identical copy of scripts/lib/opencode-config.cjs (PDO-01/03/04). This
# install.sh ships inside the npm tarball, where scripts/lib/ does not exist, so it
# cannot shell out to the repo copy — a generator adopts keeping the two in sync in a
# later PR; for now they are hand-kept identical.
CONFIG_LIB="$SCRIPT_DIR/lib/opencode-config.cjs"

# vecho / vinfo / ok / warn / err / die come from scripts/banner.sh — do not
# redefine them here, or --quiet stops matching the other three installers.

# ── Runner + config-path resolution (PDO-01/03/04) ───────────────────────────
# Both the install and uninstall branches below need CONFIG_JSON, so the runner is
# detected and the path resolved once, here, rather than twice (as this script used
# to). Resolution order (A1): opencode.jsonc -> opencode.json -> create opencode.jsonc.
RUNNER=""
if command -v node &>/dev/null; then
  RUNNER="node"
elif command -v bun &>/dev/null; then
  RUNNER="bun"
else
  echo "Error: node or bun required to read/write the opencode config (JSON/JSONC manipulation)" >&2
  exit 3
fi

resolved="$("$RUNNER" - "$CONFIG_LIB" "$TARGET" <<'NODE'
const { resolveConfigPath } = require(process.argv[2]);
const r = resolveConfigPath(process.argv[3]);
process.stdout.write(`${r.path}\t${r.both ? "1" : "0"}\n`);
NODE
)"
IFS=$'\t' read -r CONFIG_JSON CONFIG_BOTH <<<"$resolved"
if [[ "$CONFIG_BOTH" == "1" ]]; then
  echo "Warning: both opencode.jsonc and opencode.json exist in $TARGET — editing opencode.json, because OpenCode core merges .json OVER .jsonc and the .jsonc copy would be silently ignored." >&2
fi

# ── Build guard ──────────────────────────────────────────────────────────────
if [[ ! -f "$PLUGIN_JS" ]]; then
  echo "Error: plugin bundle not found at $PLUGIN_JS" >&2
  echo "  Run: bun run build" >&2
  exit 1
fi

# ── Skills bundling (PDO-08, 09 / D3 two-writer ownership) ──────────────────
# scripts/install-skills.sh remains the single writer once it has already
# claimed this platform (skillsOwner: "repo" in the shared install-state.json).
# This plugin installs its bundled massa-ai/persona-router skills into the
# SAME harness skills directory ($TARGET/skills) only when that has not
# happened, mirroring the MCP single-writer precedent
# (test-mcp-single-writer.sh). A repo checkout's own --apply always takes
# precedence over a prior plugin install — see install-skills.sh.
HARNESS_STATE_FILE="$HOME/.config/massa-ai/install-state.json"
HARNESS_SKILLS_DIR="$TARGET/skills"
HARNESS_HOST="opencode"

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

# ── Uninstall ────────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" -eq 1 ]]; then
  vecho "Uninstalling massa-ai OpenCode plugin (scope: $SCOPE)..."
  uninstall_bundled_skills

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

  # Remove plugin entry from the resolved config file (.jsonc or .json — see the
  # resolution block above). parseJsonc tolerates the comments/trailing commas a
  # .jsonc user's file may have; writeConfig backs up before writing and returns the
  # backup path so the message below can name it.
  if [[ -f "$CONFIG_JSON" ]]; then
    backup_path="$("$RUNNER" - "$CONFIG_LIB" "$CONFIG_JSON" <<'NODE'
const { parseJsonc, writeConfig } = require(process.argv[2]);
const fs = require("fs");
const file = process.argv[3];

let cfg = {};
try {
  const raw = fs.readFileSync(file, "utf8");
  if (raw.trim()) cfg = parseJsonc(raw);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

if (Array.isArray(cfg.plugin)) {
  cfg.plugin = cfg.plugin.filter((p) => p !== "./plugins/massa-ai/index.js");
  if (cfg.plugin.length === 0) delete cfg.plugin;
}

process.stdout.write(writeConfig(file, cfg));
NODE
    )"
    vinfo "removed plugin entry from $CONFIG_JSON"
    vinfo "backup: $backup_path"
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

# Symlink the plugin bundle (resolve to the bundle's dist/index.js). Under
# --plugin-source copy this points at the stable copy rather than the checkout,
# so deleting the checkout no longer breaks the plugin.
resolved_plugin_js="$PLUGIN_SOURCE_ROOT/apps/opencode-plugin/dist/index.js"
if [[ ! -f "$resolved_plugin_js" ]]; then
  # The copy is made before `bun run build` has necessarily run in that tree;
  # the checkout's dist is the only other place it can come from.
  resolved_plugin_js="$REPO_ROOT/apps/opencode-plugin/dist/index.js"
fi

# Pre-flight check: refuse to clobber a regular file
if [[ -e "$PLUGINS_DIR/index.js" && ! -L "$PLUGINS_DIR/index.js" ]]; then
  echo "Warning: $PLUGINS_DIR/index.js exists as a regular file (not a symlink)" >&2
  echo "  Refusing to overwrite. Remove it manually if you want to proceed." >&2
  exit 1
fi

ln -sfn "$resolved_plugin_js" "$PLUGINS_DIR/index.js"
vinfo "symlink: $PLUGINS_DIR/index.js → $resolved_plugin_js"

# Merge into the resolved config file (.jsonc or .json). parseJsonc tolerates an
# existing .jsonc user's comments/trailing commas; writeConfig backs up BEFORE writing
# and hands back the backup path — the message below names it, since a backup is the
# only place a .jsonc user's comments survive (this write re-serializes without them,
# per A1/the "backup-then-restringify" tradeoff — comment-preserving writes are
# explicitly out of scope).
mkdir -p "$TARGET"

backup_path="$("$RUNNER" - "$CONFIG_LIB" "$CONFIG_JSON" <<'NODE'
const { parseJsonc, writeConfig } = require(process.argv[2]);
const fs = require("fs");
const file = process.argv[3];

let cfg = {};
try {
  const raw = fs.readFileSync(file, "utf8");
  if (raw.trim()) cfg = parseJsonc(raw);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

if (!Array.isArray(cfg.plugin)) cfg.plugin = [];

const entry = "./plugins/massa-ai/index.js";
if (!cfg.plugin.includes(entry)) {
  cfg.plugin.push(entry);
}

process.stdout.write(writeConfig(file, cfg));
NODE
)"

vinfo "plugin entry added to $CONFIG_JSON"
vinfo "backup: $backup_path"

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

vecho "  + ${specialist_count} subagent specialists (generated from skills/agents/*/SKILL.md)"
vecho ""

# Skills bundling (PDO-08, 09): install massa-ai/persona-router into the
# shared harness skills directory, unless scripts/install-skills.sh already
# owns it for this platform.
install_bundled_skills
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
