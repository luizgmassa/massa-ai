#!/usr/bin/env bash
#
# massa-ai Cursor plugin installer
#
# Copies the plugin bundle (skills, hooks.json, agents, optional manifest,
# binary symlink) into the user's or project's Cursor config directory and
# merges the 7 massa-ai hook events into ~/.cursor/hooks.json (or
# ./.cursor/hooks.json) using an array-append merge that preserves existing
# user hooks.
#
# MCP registration is delegated to scripts/install-agents.sh, the single writer
# of host MCP config. This installer no longer ships a plugin-local mcp.json.
#
# Cursor 3.14 also bridges the Claude marketplace registry from ~/.claude and
# loads any plugin listed there IN ADDITION to a local install — a machine
# with both would load massa-ai twice and fire every hook twice (AD-017). At
# USER scope, this installer prefers the bridge: when ~/.claude lists massa-ai
# as installed and enabled, it skips its own local plugin copy and hook
# wiring (removing a pre-existing local copy so one run converges), while
# still writing the flat subagents, harness skills, and MCP registration this
# installer always owns. Project-scope installs are unaffected — ~/.claude is
# a user surface, never a project one.
#
# Idempotent: re-running is a no-op when owned entries already present.
# Uninstall removes only ownership-marked entries + the plugin directory,
# regardless of which route (bridge or local) installed them.
#
# Usage:
#   apps/cursor-plugin/install.sh             # install at user scope (~/.cursor)
#   apps/cursor-plugin/install.sh --user      #   (same)
#   apps/cursor-plugin/install.sh --project  # install at project scope (./.cursor)
#   apps/cursor-plugin/install.sh --uninstall # remove owned entries + plugin dir
#   apps/cursor-plugin/install.sh -h|--help   # show this help

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

# ── Generated-bundle contract (T7, design Component 4 / UGB-05..07) ─────────
# Why: apps/*-plugin generated subtrees (skills/, agents/, agent-profiles/,
#      hooks/massa-ai-hook, lib/opencode-config.cjs) are gitignored build
#      output (UGB-01) — a repo checkout must regenerate them before this
#      installer copies or registers anything; a published tarball ships them
#      pre-generated and has no generator sources to run at all. Runs before
#      any host-config mutation (before CURSOR_DIR resolution below). Cursor
#      has no PLUGIN_SOURCE_ROOT (no marketplace registration path), so
#      REPO_ROOT — already the checkout root this script lives in — is the
#      detection root, exactly mirroring $SCRIPT_DIR/../.. for the other hosts.
# Impacts: UGB-05 checkout generates, UGB-06 tarball skips, UGB-07 loud
#          failure before mutation, UGB-08 (skip-env honored for harness runs).
# Test: apps/cursor-plugin/__tests__/install.test.ts (skip-branch + loud-failure cases)
if [[ -f "$REPO_ROOT/scripts/generate-skill-artifacts.ts" ]]; then
  if [[ "${MASSA_AI_SKIP_ARTIFACT_GENERATION:-0}" != "1" ]]; then
    if ! command -v bun &>/dev/null; then
      echo "Error: bun required to generate plugin bundles in a repo checkout (scripts/generate-*.ts)" >&2
      exit 3
    fi
    bun "$REPO_ROOT/scripts/generate-skill-artifacts.ts"
    bun "$REPO_ROOT/scripts/generate-subagent-artifacts.ts"
  fi
fi
# Tarball installs (generator sources absent) skip the block above entirely
# and fall straight through to this sentinel, which every context must pass:
# the bundle this installer is about to copy/register has to actually exist.
if [[ ! -f "$SCRIPT_DIR/skills/massa-ai/SKILL.md" ]]; then
  echo "Error: missing $SCRIPT_DIR/skills/massa-ai/SKILL.md — run 'bun run generate:artifacts' first" >&2
  exit 1
fi
if [[ ! -d "$SCRIPT_DIR/agents" ]] || [[ -z "$(ls -A "$SCRIPT_DIR/agents" 2>/dev/null)" ]]; then
  echo "Error: missing or empty $SCRIPT_DIR/agents — run 'bun run generate:artifacts' first" >&2
  exit 1
fi

# Resolve target base dir
if [[ "$SCOPE" == "project" ]]; then
  CURSOR_DIR="$(pwd)/.cursor"
else
  CURSOR_DIR="$HOME/.cursor"
fi
# Two verified Cursor 3.14 load surfaces (observed live in "Cursor Plugins"
# exthost logs, 2026-08-05): user-local plugins ARE loaded from
# plugins/local/<name>/ ("loadUserLocalPlugin massa-ai loaded"), and Cursor
# additionally bridges Claude marketplace plugins from ~/.claude
# ("loadClaudePlugin massa-ai@massa-ai") — so a machine with the Claude
# plugin installed loads massa-ai twice. Subagents, however, are discovered
# only from the flat .cursor/agents/*.md directory (cursor.com/docs/subagents
# — no subdirectories), and there is no global rules file. So: PLUGIN_DIR
# carries the manifest, hook binary, and command skills; everything else
# Cursor must SEE goes to its dedicated read paths — $CURSOR_AGENTS_DIR
# (subagents), $CURSOR_DIR/skills/ (harness skills), $CURSOR_DIR/hooks.json,
# and $CURSOR_DIR/mcp.json (install-agents.sh).
PLUGIN_DIR="$CURSOR_DIR/plugins/local/massa-ai"
# The only directory Cursor discovers subagents from (project scope:
# ./.cursor/agents/). Flat .md files, real copies, massa-ai- prefix owned.
CURSOR_AGENTS_DIR="$CURSOR_DIR/agents"
# Pre-fix installs wrote here; removed on install so the two cannot both be
# discovered and register duplicate hooks.
LEGACY_PLUGIN_DIR="$CURSOR_DIR/plugins/massa-ai"
HOOKS_JSON="$CURSOR_DIR/hooks.json"

# ── Claude-bridge detection (PAU-08/09/10) ──────────────────────────────────
# Probe contract pinned against a read-only capture of this machine's live
# ~/.claude registry files (2026-08-05) — never invented:
#   - $CLAUDE_PLUGIN_REGISTRY must parse and list a non-empty
#     plugins["massa-ai@massa-ai"] array
#   - $CLAUDE_SETTINGS_JSON's enabledPlugins["massa-ai@massa-ai"] must not be
#     literal false — an absent settings.json, or an absent key, is treated
#     as enabled (matching Claude's own default)
#   - any parse failure on either file → NOT detected (local fallback)
# User-scope only: ~/.claude is a per-user surface, so a --project plugin
# install always keeps the local branch regardless of what ~/.claude holds.
CLAUDE_PLUGIN_REGISTRY="$HOME/.claude/plugins/installed_plugins.json"
CLAUDE_SETTINGS_JSON="$HOME/.claude/settings.json"

claude_bridge_detected() {
  [[ "$SCOPE" == "project" ]] && return 1
  [[ -f "$CLAUDE_PLUGIN_REGISTRY" ]] || return 1

  local runner=""
  if command -v node &>/dev/null; then runner="node"
  elif command -v bun &>/dev/null; then runner="bun"
  else return 1
  fi

  "$runner" - "$CLAUDE_PLUGIN_REGISTRY" "$CLAUDE_SETTINGS_JSON" <<'NODE'
const fs = require("fs");
const [, , registryFile, settingsFile] = process.argv;

try {
  const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
  const listed = registry && registry.plugins && registry.plugins["massa-ai@massa-ai"];
  if (!Array.isArray(listed) || listed.length === 0) process.exit(1);
} catch {
  process.exit(1);
}

try {
  const raw = fs.readFileSync(settingsFile, "utf8");
  if (raw.trim()) {
    const settings = JSON.parse(raw);
    const enabled = settings && settings.enabledPlugins && settings.enabledPlugins["massa-ai@massa-ai"];
    if (enabled === false) process.exit(1);
  }
} catch (e) {
  // Absent settings.json is treated as enabled (Claude's own default); any
  // other read/parse failure means the probe cannot trust this surface.
  if (e.code !== "ENOENT") process.exit(1);
}

process.exit(0);
NODE
}

# The 7 Cursor events → binary subcommands. The command path uses the
# INSTALLED plugin dir (not the placeholder), so Cursor invokes the copy.
# Cursor hooks.json shape: { "version": 1, "hooks": { "<event>": [...] } }
massa_ai_event_entry() {
  local subcommand="$1"
  cat <<JSON
{ "command": "$PLUGIN_DIR/hooks/massa-ai-hook $subcommand", "_massaAiOwned": true }
JSON
}

# Array-append merge (F5 mitigation): for each of the 7 events, append the
# massa-ai hook entry to the event's array inside the nested "hooks"
# object if no entry with _massaAiOwned: true already exists. Preserves
# the top-level "version" field (defaults to 1). Backup before first write.
# Uses node (preferred) or bun for safe JSON manipulation.
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
  ["sessionStart", "session-start"],
  ["sessionEnd", "stop"],
  ["beforeSubmitPrompt", "user-prompt-submit"],
  ["preToolUse", "pre-tool-use"],
  ["postToolUse", "post-tool-use"],
  ["preCompact", "pre-compact"],
  ["stop", "stop"],
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

// Ensure the nested hooks object + version field
if (typeof cfg.version !== "number") cfg.version = 1;
if (typeof cfg.hooks !== "object" || cfg.hooks === null) cfg.hooks = {};

const hooks = cfg.hooks;

function hasOwned(arr) {
  return Array.isArray(arr) && arr.some((e) => e && e._massaAiOwned === true);
}

if (mode === "uninstall") {
  for (const [evt] of EVENTS) {
    if (Array.isArray(hooks[evt])) {
      hooks[evt] = hooks[evt].filter((e) => !(e && e._massaAiOwned === true));
      if (hooks[evt].length === 0) delete hooks[evt];
    }
  }
} else {
  // install: backup before first write if file existed
  if (existed) {
    const bak = `${file}.massa-ai.bak-${ts}`;
    fs.copyFileSync(file, bak);
  }
  for (const [evt, sub] of EVENTS) {
    if (!Array.isArray(hooks[evt])) hooks[evt] = [];
    if (!hasOwned(hooks[evt])) {
      hooks[evt].push({
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

# ── Skills bundling (PDO-08, 09 / D3 two-writer ownership) ──────────────────
# scripts/install-skills.sh remains the single writer once it has already
# claimed this platform (skillsOwner: "repo" in the shared install-state.json).
# This plugin installs its bundled massa-ai/persona-router skills into the
# SAME harness skills directory ($CURSOR_DIR/skills — NOT $PLUGIN_DIR/skills,
# which is this plugin's own registerPath-discovered skill cache) only when
# that has not happened, mirroring the MCP single-writer precedent
# (test-mcp-single-writer.sh). A repo checkout's own --apply always takes
# precedence over a prior plugin install — see install-skills.sh.
HARNESS_STATE_FILE="$HOME/.config/massa-ai/install-state.json"
HARNESS_SKILLS_DIR="$CURSOR_DIR/skills"
HARNESS_HOST="cursor"

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

  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" "$CURSOR_DIR" <<'NODE'
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
// The whole-record replace must not drop fields a previous successful install
// wrote (R2) — re-attach them. installRoute (T9) is installer-owned but
// written by a LATER step of this same install (record_plugin_version), so it
// must survive this earlier whole-record replace or the recorded route
// silently vanishes on the next skills-bundling pass. modelProfile is
// preserved defensively too, though the switch engine never targets Cursor
// (every tier resolves to inherit — hosts.ts skips it unconditionally).
if (prev && typeof prev === "object" && !Array.isArray(prev)) {
  if (prev.plugin && typeof prev.plugin === "object") {
    data.platforms[host].plugin = prev.plugin;
  }
  if (prev.modelProfile && typeof prev.modelProfile === "object") {
    data.platforms[host].modelProfile = prev.modelProfile;
  }
  if (typeof prev.installRoute === "string") {
    data.platforms[host].installRoute = prev.installRoute;
  }
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

  local version installed_at route
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SCRIPT_DIR/package.json" | head -n 1)"
  installed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # installRoute (T6, design Component 4): installer-owned, engine-read-only.
  # "bridge" when ~/.claude's Claude marketplace plugin is what Cursor
  # actually loads (this run skipped its own local copy); "local" otherwise.
  # The switch engine still never reads it for Cursor (hosts.ts skips Cursor
  # unconditionally: every tier resolves to inherit) — recorded for
  # data-model consistency with the other three hosts, and now also read by
  # the harness sentinel probe (T4/T5), which treats both routes alike (same
  # flat-agents glob). Written on EVERY install path.
  if [[ "$IS_BRIDGE" -eq 1 ]]; then route="bridge"; else route="local"; fi

  # Tolerant of a corrupt/missing state file (rewrites a minimal valid one —
  # AC-8). A record-write failure warns but never fails the install: the next
  # run treats the host as unknown-version and reinstalls.
  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" "$CURSOR_DIR" "$version" "$installed_at" "$route" <<'NODE' || \
    echo "  ⚠ could not record the plugin version — next run will reinstall (unknown version)" >&2
const fs = require("fs");
const path = require("path");
const [, , file, host, root, version, installedAt, installRoute] = process.argv;
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
// installRoute is installer-owned (like plugin above); modelProfile is NEVER
// written by any installer — the switch engine (packages/shared/src/
// profile-switch/) is its sole writer (moot for Cursor in practice, since it
// is always skipped, but the invariant holds repo-wide).
rec.installRoute = installRoute;
data.platforms[host] = rec;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
NODE
}

# ── Uninstall ───────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" -eq 1 ]]; then
  echo "Uninstalling massa-ai Cursor plugin (scope: $SCOPE)..."
  uninstall_bundled_skills
  # Remove owned hook entries (preserves user hooks)
  if [[ -f "$HOOKS_JSON" ]]; then
    merge_hooks_json "$HOOKS_JSON" "uninstall"
    echo "  - removed massa-ai hook entries from $HOOKS_JSON"
  fi
  # Remove the massa-ai-owned subagents from Cursor's discovery directory.
  # Prefix glob only: user-authored agents in the same flat dir survive.
  if [[ -d "$CURSOR_AGENTS_DIR" ]]; then
    removed_agents=0
    for agent in "$CURSOR_AGENTS_DIR/"massa-ai-*.md; do
      [[ -f "$agent" ]] || continue
      rm -f "$agent"
      removed_agents=$((removed_agents + 1))
    done
    if [[ "$removed_agents" -gt 0 ]]; then
      echo "  - removed $removed_agents massa-ai subagents from $CURSOR_AGENTS_DIR"
    fi
  fi
  # Remove plugin directory
  if [[ -d "$LEGACY_PLUGIN_DIR" ]]; then
    rm -rf "$LEGACY_PLUGIN_DIR"
    echo "  - removed $LEGACY_PLUGIN_DIR (pre-fix location)"
  fi
  if [[ -d "$PLUGIN_DIR" ]]; then
    rm -rf "$PLUGIN_DIR"
    echo "  - removed $PLUGIN_DIR"
  fi
  echo ""
  echo "Done. User hooks preserved."
  exit 0
fi

# ── Install ──────────────────────────────────────────────────────────────────
# PAU-08/09: bridge-preferred, local-fallback. Computed once, used to decide
# both which artifacts this run writes and what installRoute gets recorded.
IS_BRIDGE=0
if claude_bridge_detected; then
  IS_BRIDGE=1
fi

skill_count=0
specialist_count=0

if [[ "$IS_BRIDGE" -eq 1 ]]; then
  vecho "Installing massa-ai Cursor plugin (Claude-bridge route): ~/.claude already lists massa-ai as installed and enabled, so Cursor loads it via the bridge."
  # Converge (PAU-08, spec edge case): a pre-existing local install (current
  # or pre-fix legacy location) must not double-load alongside the bridge, so
  # one run here ends with exactly one load path. Owned hook entries are
  # stripped with the SAME filter merge_hooks_json's "uninstall" mode already
  # uses — the bridge delivers hooks instead.
  if [[ -d "$LEGACY_PLUGIN_DIR" ]]; then
    rm -rf "$LEGACY_PLUGIN_DIR"
    echo -e "  - removed pre-fix plugin copy at $LEGACY_PLUGIN_DIR"
  fi
  if [[ -d "$PLUGIN_DIR" ]]; then
    rm -rf "$PLUGIN_DIR"
    echo -e "  - removed local plugin copy at $PLUGIN_DIR (Claude bridge already loads massa-ai)"
  fi
  if [[ -f "$HOOKS_JSON" ]]; then
    merge_hooks_json "$HOOKS_JSON" "uninstall"
    echo -e "  - removed massa-ai hook entries from $HOOKS_JSON (the bridge delivers hooks instead)"
  fi
else
  vecho "Installing massa-ai Cursor plugin to: $PLUGIN_DIR"
  # Migration: a pre-fix install left a copy at plugins/massa-ai. Leaving it in
  # place risks Cursor discovering both and firing every hook twice, so it goes
  # before the new location is written.
  if [[ -d "$LEGACY_PLUGIN_DIR" ]]; then
    rm -rf "$LEGACY_PLUGIN_DIR"
    echo -e "  - removed pre-fix plugin copy at $LEGACY_PLUGIN_DIR"
  fi
  mkdir -p "$PLUGIN_DIR/.cursor-plugin" "$PLUGIN_DIR/skills" "$PLUGIN_DIR/hooks"
  # Migration: pre-fix installs bundled agents inside the plugin dir, which
  # Cursor never reads. Drop that copy so upgraders converge on the one real
  # discovery surface and a future Cursor plugin scan cannot double-register.
  if [[ -d "$PLUGIN_DIR/agents" ]]; then
    rm -rf "$PLUGIN_DIR/agents"
    echo -e "  - removed pre-fix agents copy at $PLUGIN_DIR/agents (Cursor reads $CURSOR_AGENTS_DIR)"
  fi

  # Copy manifest
  cp "$SCRIPT_DIR/.cursor-plugin/plugin.json" "$PLUGIN_DIR/.cursor-plugin/plugin.json"
  vecho "  + .cursor-plugin/plugin.json"

  # Copy the 6 host-command skills (each in a subdirectory: skills/<name>/SKILL.md).
  # massa-ai/, persona-router/, and agents/ are the PDO-06 harness bundle, not a
  # Cursor command skill — they are installed separately, into the shared
  # harness skills directory (see "Skills bundling" below), not into this
  # plugin-cache skills/ tree.
  for src in "$SCRIPT_DIR/skills/"*/SKILL.md; do
    name="$(basename "$(dirname "$src")")"
    case "$name" in
      massa-ai|persona-router|agents) continue ;;
    esac
    mkdir -p "$PLUGIN_DIR/skills/$name"
    cp "$src" "$PLUGIN_DIR/skills/$name/SKILL.md"
    vecho "  + skills/$name/SKILL.md"
    skill_count=$((skill_count + 1))
  done

  # Copy hooks.json (the placeholder version — installer replaces paths)
  cp "$SCRIPT_DIR/hooks/hooks.json" "$PLUGIN_DIR/hooks/hooks.json"
  vecho "  + hooks/hooks.json"

  # Older installs shipped a plugin-local mcp.json here. Cursor reads
  # ~/.cursor/mcp.json, not the plugin dir, and MCP is now owned by
  # scripts/install-agents.sh — drop the residue so upgraders converge.
  if [[ -f "$PLUGIN_DIR/mcp.json" ]]; then
    rm -f "$PLUGIN_DIR/mcp.json"
    # Not gated by --quiet: this deletes a file in the user's home, so it is a
    # mutation notice rather than per-file chatter.
    echo -e "  - removed stale mcp.json (MCP is now registered in ~/.cursor/mcp.json)"
  fi
fi

# Flat agents and harness skills are written in BOTH branches (PAU-08/09):
# Cursor discovers subagents only from the flat directory regardless of which
# plugin-load path is active, and MCP/harness-skills ownership is independent
# of it too. Prune-then-copy so a specialist deleted from the bundle cannot
# linger installed. All of them, navigator included, are generated from
# skills/agents/*/SKILL.md and owned by the massa-ai- name prefix (CRS-04) —
# user-authored agents are untouched.
mkdir -p "$CURSOR_AGENTS_DIR"
rm -f "$CURSOR_AGENTS_DIR/"massa-ai-*.md
for src in "$SCRIPT_DIR/agents/"massa-ai-*.md; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  cp "$src" "$CURSOR_AGENTS_DIR/$name"
  vecho "  + $name"
  specialist_count=$((specialist_count + 1))
done
vecho "  + ${specialist_count} subagent specialists (generated from skills/agents/*/SKILL.md)"

# Skills bundling (PDO-08, 09): install massa-ai/persona-router into the
# shared harness skills directory, unless scripts/install-skills.sh already
# owns it for this platform. Runs in both branches (same reasoning as above).
vecho ""
install_bundled_skills

if [[ "$IS_BRIDGE" -ne 1 ]]; then
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
  vecho "  + 7 massa-ai hook events wired (array-append, user hooks preserved)"
fi

# ── MCP registration (delegated) ─────────────────────────────────────────────
# scripts/install-agents.sh is the single writer of host MCP config. It writes
# the massa-ai entry into ~/.cursor/mcp.json at USER scope — a --project plugin
# install still registers MCP for the whole user.
vecho ""
vecho "Registering MCP server (user scope) via scripts/install-agents.sh..."
if [[ -f "$REPO_ROOT/scripts/install-agents.sh" ]]; then
  # On success the delegated output is detail (usually "up to date"), so it is
  # gated. On failure it is never gated: a silently-failed MCP registration is
  # exactly the bug this change set exists to fix.
  if agents_out="$(MASSA_AI_SUPPRESS_SPECIALIST_HINT=1 bash "$REPO_ROOT/scripts/install-agents.sh" --agent cursor --yes 2>&1)"; then
    vecho "$agents_out"
  else
    echo "$agents_out" >&2
    echo "  ⚠ MCP wiring failed — run: bash scripts/install-agents.sh --agent cursor --yes" >&2
  fi
else
  echo "  ⚠ scripts/install-agents.sh not found — register MCP with: bash scripts/install-agents.sh --agent cursor --yes" >&2
fi

# Summary line in quiet mode
if [ "${MASSA_AI_VERBOSE:-0}" != "1" ]; then
  if [[ "$IS_BRIDGE" -eq 1 ]]; then
    ok "cursor plugin: using the Claude bridge (${specialist_count} specialists) — hooks delivered by the bridge, not installed locally"
  else
    ok "cursor plugin installed (${skill_count} skills, ${specialist_count} specialists, 7 hooks)"
  fi
else
  vecho ""
  vecho "Done. Restart Cursor to pick up the plugin."
  if [[ "$IS_BRIDGE" -eq 1 ]]; then
    vecho "💡 massa-ai loads via the Claude bridge (~/.claude) — local plugin/hook install skipped."
  fi
  vecho "💡 MCP is registered in ~/.cursor/mcp.json by scripts/install-agents.sh (single writer)."
fi

# Final step of the install path: record the bundle version. Reached only when
# every fallible step succeeded (AC-16) — never on --uninstall (exits above).
record_plugin_version