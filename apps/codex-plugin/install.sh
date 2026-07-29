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
# This script now drives BOTH halves. `codex plugin marketplace add` +
# `codex plugin add massa-ai@massa-ai` supply the skills and the /plugins entry;
# they CANNOT supply hooks, because a Codex plugin manifest has no hooks key
# (none of the 203 manifests shipped by the bundled/curated/runtime marketplaces
# declares one). Hooks reach Codex only through ~/.codex/hooks.json, which this
# script writes. The two halves are therefore additive, not exclusive — unlike
# apps/claude-plugin/install.sh, whose plugin does ship hooks/hooks.json and so
# has to pick one route or double-fire.
#
# Skills are likewise not duplicated: the marketplace route populates Codex's
# own plugin skill cache, while the harness skills go to $CODEX_DIR/skills under
# the skillsOwner coordination described further down. Separate mechanisms.
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
# shellcheck source=scripts/lib/installer-shared.sh
source "$REPO_ROOT/scripts/lib/installer-shared.sh"
# Marketplace root to register; install-harness.sh resolves it once per run
# (--plugin-source local|copy|auto). Direct invocation uses this checkout.
PLUGIN_SOURCE_ROOT="${MASSA_AI_PLUGIN_SOURCE_ROOT:-$REPO_ROOT}"

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

# Array-append merge (F5 mitigation): for each of the 6 events, append the
# massa-ai hook entry to the event's array if no entry with
# _massaAiOwned: true already exists. Backup before first write. Uses node
# (preferred) or bun for safe JSON manipulation — bash cannot do JSON safely.
#
# Entry shape is Codex's matcher-group form — an outer object whose "hooks" is
# an ARRAY of { type, command }:
#   { "hooks": [{ "type": "command", "command": "<bin> <sub>" }],
#     "_massaAiOwned": true }
# Codex addresses hook state as "<file>:<event>:<group>:<hook>", so a flat entry
# (type/command at the top level, no inner array) has no ":<hook>" index, is
# never enumerated, and never appears in /hooks. Releases before this one wrote
# the flat form; the install path migrates them (see MIGRATION below).
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

function isOwned(e) {
  return Boolean(e) && e._massaAiOwned === true;
}

// A correctly-shaped owned entry is a matcher group: its "hooks" is an array.
// Anything owned that fails this is a pre-fix flat entry Codex cannot enumerate.
function isOwnedMatcherGroup(e) {
  return isOwned(e) && Array.isArray(e.hooks);
}

function hasOwned(arr) {
  return Array.isArray(arr) && arr.some(isOwnedMatcherGroup);
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

  // MIGRATION: drop owned entries written in the pre-fix flat shape. They are
  // invisible to Codex, so leaving them would both keep /hooks empty and make
  // hasOwned() below treat the event as already wired. Only owned entries are
  // touched — user entries are never marked.
  for (const [evt] of EVENTS) {
    if (Array.isArray(cfg.hooks[evt])) {
      cfg.hooks[evt] = cfg.hooks[evt].filter(
        (e) => !(isOwned(e) && !isOwnedMatcherGroup(e)),
      );
    }
  }

  // Now write to the correct nested location
  for (const [evt, sub] of EVENTS) {
    if (!Array.isArray(cfg.hooks[evt])) cfg.hooks[evt] = [];
    if (!hasOwned(cfg.hooks[evt])) {
      cfg.hooks[evt].push({
        hooks: [
          {
            type: "command",
            command: `${pluginDir}/hooks/massa-ai-hook ${sub}`,
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
# SAME harness skills directory ($CODEX_DIR/skills — NOT $PLUGIN_DIR/skills,
# which is Codex's own marketplace-plugin skill cache, a separate mechanism)
# only when that has not happened, mirroring the MCP single-writer precedent
# (test-mcp-single-writer.sh). A repo checkout's own --apply always takes
# precedence over a prior plugin install — see install-skills.sh.
HARNESS_STATE_FILE="$HOME/.config/massa-ai/install-state.json"
HARNESS_SKILLS_DIR="$CODEX_DIR/skills"
HARNESS_HOST="codex"

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

  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" "$CODEX_DIR" <<'NODE'
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
const prev = data.platforms[host];
data.platforms[host] = { root, skillsOwner: "plugin", skills: ["massa-ai", "persona-router"] };
// The whole-record replace must not drop the plugin version record a previous
// successful install wrote (R2) — re-attach it.
if (prev && typeof prev === "object" && !Array.isArray(prev) && prev.plugin && typeof prev.plugin === "object") {
  data.platforms[host].plugin = prev.plugin;
}
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
  [[ "$raw_owner" == "plugin" ]] && {
    local name
    for name in massa-ai persona-router; do
      rm -rf "$HARNESS_SKILLS_DIR/$name"
    done
    rmdir "$HARNESS_SKILLS_DIR" 2>/dev/null || true
    echo "  - removed plugin-owned harness skills from $HARNESS_SKILLS_DIR"
  }

  # AC-15: a plugin-owned platform keeps the whole-record delete (clean-slate
  # semantics unchanged); any other platform loses only its plugin version
  # record while root/skills/skillsOwner survive (Plan Challenge C-4).
  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" <<'NODE'
const fs = require("fs");
const [, , file, host] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const rec = data && data.platforms && data.platforms[host];
  if (rec && typeof rec === "object") {
    if (rec.skillsOwner === "plugin") {
      delete data.platforms[host];
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    } else if (rec.plugin && typeof rec.plugin === "object") {
      delete rec.plugin;
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    }
  }
} catch { /* nothing to clean up */ }
NODE
}

# ── Plugin version recording (PAI-03/04/07) ─────────────────────────────────
# Why: the harness gates re-runs on the recorded bundle version, so a
#      successful install records it — but ONLY as the final step of the
#      install path. A version written before a later step fails would mark a
#      broken install "current" and skip it forever (AC-16, Plan Challenge C-1).
# Impacts: PAI-03 record, PAI-04 upgrade trigger, PAI-07 uninstall, AC-3/16.
# Test: bash scripts/tests/test-plugin-auto-install.sh (Section 3 e2e chain)
record_plugin_version() {
  local runner=""
  if command -v node &>/dev/null; then runner="node"
  elif command -v bun &>/dev/null; then runner="bun"
  else
    echo "  ⚠ node or bun required to record the plugin version — next run will reinstall" >&2
    return 0
  fi

  local version installed_at
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SCRIPT_DIR/package.json" | head -n 1)"
  installed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # Tolerant of a corrupt/missing state file (rewrites a minimal valid one —
  # AC-8). A record-write failure warns but never fails the install: the next
  # run treats the host as unknown-version and reinstalls.
  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" "$CODEX_DIR" "$version" "$installed_at" <<'NODE' || \
    echo "  ⚠ could not record the plugin version — next run will reinstall (unknown version)" >&2
const fs = require("fs");
const path = require("path");
const [, , file, host, root, version, installedAt] = process.argv;
let data = { version: 2, platforms: {} };
try {
  const existing = JSON.parse(fs.readFileSync(file, "utf8"));
  if (existing && typeof existing === "object" && !Array.isArray(existing)) data = existing;
} catch { /* fresh */ }
if (typeof data.platforms !== "object" || data.platforms === null || Array.isArray(data.platforms)) {
  data.platforms = {};
}
data.version = 2;
// Preserve every unrelated field; a missing record gets the minimal shape the
// strict skills reader accepts (non-empty root + a skills list).
const rec =
  data.platforms[host] && typeof data.platforms[host] === "object" && !Array.isArray(data.platforms[host])
    ? data.platforms[host]
    : { root, skillsOwner: "plugin", skills: [] };
rec.plugin = { version, installedAt };
data.platforms[host] = rec;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
NODE
}

# ── Plugin-registry registration (delegated to the codex CLI) ───────────────
# The CLI owns config.toml's [marketplaces.*] / [plugins."x@y"] tables and the
# plugins/cache layout, so it is the only supported way to reach /plugins.
# Failure is never fatal: without this the rest of the install (hooks, agents,
# MCP) is still fully functional, it just does not show in the plugins screen.
CODEX_MARKETPLACE="massa-ai"
CODEX_PLUGIN_ID="massa-ai@massa-ai"

# Where the CLI is allowed to write. Pinned explicitly, and not left to the
# CLI's own resolution, for two reasons:
#
#  1. The codex CLI resolves its config root from $CODEX_HOME before falling
#     back to $HOME/.codex — and the Codex app exports CODEX_HOME into every
#     shell it spawns. This script resolves CODEX_DIR from $HOME alone, so an
#     install running against an overridden $HOME (tests, --target) would write
#     its files into the sandbox while registering the marketplace into the
#     developer's real ~/.codex. That is not hypothetical: it silently removed
#     a live [marketplaces.massa-ai] table during development of this change.
#  2. Codex records plugin installs at user scope, so this stays $HOME-derived
#     even for --project, mirroring PLUGIN_REGISTRY in apps/claude-plugin.
#
# Note the pre-existing divergence left untouched here: the file-copy half of
# this installer still ignores CODEX_HOME entirely. Making both halves honour
# it is a separate change with a much wider blast radius.
CODEX_CLI_HOME="$HOME/.codex"

register_codex_plugin() {
  # Explicit opt-out; see the same knob in apps/claude-plugin/install.sh.
  [[ "${MASSA_AI_SKIP_PLUGIN_REGISTRY:-0}" == "1" ]] && return 1
  installer_host_cli_supports codex plugin marketplace || return 1
  if [[ ! -f "$PLUGIN_SOURCE_ROOT/.agents/plugins/marketplace.json" ]]; then
    vecho "  – no marketplace manifest under $PLUGIN_SOURCE_ROOT — skipping /plugins registration"
    return 1
  fi
  # Idempotent: a second run reports "already added" and leaves config.toml
  # byte-identical.
  CODEX_HOME="$CODEX_CLI_HOME" codex plugin marketplace add "$PLUGIN_SOURCE_ROOT" </dev/null >/dev/null 2>&1 || return 1
  CODEX_HOME="$CODEX_CLI_HOME" codex plugin add "$CODEX_PLUGIN_ID" </dev/null >/dev/null 2>&1 || return 1
}

unregister_codex_plugin() {
  installer_host_cli_supports codex plugin marketplace || return 0
  CODEX_HOME="$CODEX_CLI_HOME" codex plugin remove "$CODEX_PLUGIN_ID" </dev/null >/dev/null 2>&1 || true
  # Order matters: the marketplace entry must go last, because removing it
  # first leaves `codex plugin list` unable to resolve the plugin it still has
  # registered — the same cache-miss failure a deleted checkout produces.
  CODEX_HOME="$CODEX_CLI_HOME" codex plugin marketplace remove "$CODEX_MARKETPLACE" </dev/null >/dev/null 2>&1 || true
}

# ── Uninstall ───────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" -eq 1 ]]; then
  echo "Uninstalling massa-ai Codex plugin (scope: $SCOPE)..."
  unregister_codex_plugin
  uninstall_bundled_skills
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

# Copy the real hooks/massa-ai-hook this plugin already ships (T14/PDO-14: a
# generated real file, no longer a symlink into apps/claude-plugin/ — that
# path does not exist in a registry tarball install, where $REPO_ROOT is not
# this monorepo. $CLAUDE_PLUGIN_BIN is kept only as a repo-checkout fallback.
if [[ -f "$SCRIPT_DIR/hooks/massa-ai-hook" ]]; then
  cp "$SCRIPT_DIR/hooks/massa-ai-hook" "$PLUGIN_DIR/hooks/massa-ai-hook"
  chmod +x "$PLUGIN_DIR/hooks/massa-ai-hook"
  vecho "  + hooks/massa-ai-hook"
elif [[ -f "$CLAUDE_PLUGIN_BIN" ]]; then
  ln -sfn "$CLAUDE_PLUGIN_BIN" "$PLUGIN_DIR/hooks/massa-ai-hook"
  vecho "  + hooks/massa-ai-hook → $CLAUDE_PLUGIN_BIN"
else
  echo "  ⚠ Warning: no massa-ai-hook binary found" >&2
  echo "    Hooks will not fire until the binary is available." >&2
fi

# Merge hooks.json (array-append, backup, idempotent)
vecho ""
vecho "Merging hooks into $HOOKS_JSON..."
merge_hooks_json "$HOOKS_JSON" "install"
vecho "  + 6 massa-ai hook events wired (array-append, user hooks preserved)"

# Write the generated subagent specialist TOML files to ~/.codex/agents/ (OUTSIDE the
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
vecho "  + ${specialist_count} subagent specialists (generated from skills/agents/*/SKILL.md)"

# Skills bundling (PDO-08, 09): install massa-ai/persona-router into the
# shared harness skills directory, unless scripts/install-skills.sh already
# owns it for this platform.
vecho ""
install_bundled_skills

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

# ── Plugin-registry registration ─────────────────────────────────────────────
# Runs after the file writes above because it is additive here: hooks and agent
# TOMLs stay owned by this script either way.
CODEX_PLUGIN_ROUTE=0
if register_codex_plugin; then
  CODEX_PLUGIN_ROUTE=1
  vecho "  + registered ${CODEX_PLUGIN_ID} (marketplace root: ${PLUGIN_SOURCE_ROOT})"
fi

# Summary line in quiet mode
if [ "${MASSA_AI_VERBOSE:-0}" != "1" ]; then
  if [[ "$CODEX_PLUGIN_ROUTE" -eq 1 ]]; then
    ok "codex plugin installed (${skill_count} skills, ${specialist_count} specialists, 6 hooks) — shows in /plugins"
  else
    ok "codex plugin installed (${skill_count} skills, ${specialist_count} specialists, 6 hooks)"
    warn "codex CLI unavailable — not registered in /plugins. Register it with:"
    warn "  codex plugin marketplace add \"$PLUGIN_SOURCE_ROOT\" && codex plugin add $CODEX_PLUGIN_ID"
  fi
else
  vecho ""
  vecho "Done. Restart Codex to pick up the plugin."
  vecho ""
  vecho "⚠ Run /hooks in Codex to trust massa-ai hooks, or no observations will be captured."
  vecho "💡 MCP is registered in ~/.codex/config.toml by scripts/install-agents.sh (single writer)."
fi

# Final step of the install path: record the bundle version. Reached only when
# every fallible step succeeded (AC-16) — never on --uninstall (exits above).
record_plugin_version