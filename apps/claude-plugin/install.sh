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
# Served-plugin version on the marketplace route, filled by
# refresh_marketplace_cache and read by record_plugin_version. Declared at
# top level so routes that never refresh (file route, uninstall) cannot trip
# `set -u` (CMR R3).
PLUGIN_SERVED_VERSION=""
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

# ── Generated-bundle contract (T5, design Component 4 / UGB-05..07) ─────────
# Why: apps/*-plugin generated subtrees (skills/, agents/, agent-profiles/,
#      hooks/massa-ai-hook, lib/opencode-config.cjs) are gitignored build
#      output (UGB-01) — a repo checkout must regenerate them before this
#      installer copies or registers anything; a published tarball ships them
#      pre-generated and has no generator sources to run at all. Runs before
#      any host-config mutation (before SCOPE/TARGET resolution below).
# Impacts: UGB-05 checkout generates, UGB-06 tarball skips, UGB-07 loud
#          failure before mutation, UGB-08 (skip-env honored for harness runs).
# Test: apps/claude-plugin/__tests__/install.test.ts (skip-branch + loud-failure cases)
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

# Model-profile variant tree (T8, design Component 3 / MPS-04). Source is the
# bundle's per-profile agent-profiles/<p>/ (sibling of agents/, A5); dest is
# the engine's own host path table (packages/shared/src/profile-switch/
# hosts.ts): $TARGET/massa-ai/agent-profiles/<p>/. File-route only — the
# marketplace route serves agents in place and switching is refused there
# regardless (Component 2 topology rules), so there is nothing to install to.
VARIANTS_SRC="$SCRIPT_DIR/agent-profiles"
VARIANTS_DEST="$TARGET/massa-ai/agent-profiles"

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

// Ownership test. The `_massaAiOwned` marker is the precise signal, but it is
// NOT the only way our hook entries reach settings.json: this plugin also ships
// settings.json.template, a hand-merge guide whose blocks carry no marker and
// whose command the reader is told to rewrite to an absolute path. Entries that
// arrived that way were invisible to both directions of this merge — never
// deduped on install, never removed when the marketplace route took over — so
// they fired alongside the bundle's own hooks/hooks.json. Measured live
// 2026-08-17: 5 unmarked massa-ai blocks in ~/.claude/settings.json beside a
// registered marketplace plugin, and every event ingested twice.
//
// So recognise our entries by WHAT THEY ARE as well. Referencing the
// massa-ai-hook binary is unambiguous — it is this project's own file name, in
// every shape it is documented in (`bun run "<abs>/massa-ai-hook.ts" <sub>`,
// `bun run "${CLAUDE_PLUGIN_ROOT}/hooks/massa-ai-hook.ts" <sub>`). A user hook
// that merely mentions massa-ai elsewhere (`rtk hook claude`, an MCP tool name)
// does not match and is preserved.
const OWNED_COMMAND = /massa-ai-hook/;

function commandIsOwned(h) {
  return Boolean(h) && typeof h.command === "string" && OWNED_COMMAND.test(h.command);
}

// A matcher-group block is ours when it is marked, or when every command it
// carries is ours. A block MIXING user and massa-ai commands is not owned
// wholesale — stripOwnedHooks below removes only our commands from it.
function blockIsOwned(b) {
  if (!b || typeof b !== "object") return false;
  if (b._massaAiOwned === true) return true;
  return Array.isArray(b.hooks) && b.hooks.length > 0 && b.hooks.every(commandIsOwned);
}

function hasOwned(arr) {
  return Array.isArray(arr) && arr.some(blockIsOwned);
}

// Returns the event array with our entries removed: whole blocks that are ours,
// and our individual commands out of blocks we share with the user.
function stripOwnedHooks(arr) {
  const kept = [];
  for (const b of arr) {
    if (blockIsOwned(b)) continue;
    if (b && Array.isArray(b.hooks) && b.hooks.some(commandIsOwned)) {
      kept.push({ ...b, hooks: b.hooks.filter((h) => !commandIsOwned(h)) });
      continue;
    }
    kept.push(b);
  }
  return kept;
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
    // Back up before removing. The install path has always done this; removal
    // did not, and now that it deletes unmarked entries it did not necessarily
    // write, the asymmetry is not defensible.
    if (existed) {
      fs.copyFileSync(file, `${file}.massa-ai.bak-${ts}`);
    }
    // Every event, not just the 5 we write. The predicate identifies our
    // commands rather than a location, so an entry parked under an event this
    // release does not use is still ours, and a user's is still not.
    for (const evt of Object.keys(hooks)) {
      if (Array.isArray(hooks[evt])) {
        hooks[evt] = stripOwnedHooks(hooks[evt]);
        if (hooks[evt].length === 0) delete hooks[evt];
      }
    }
    if (Object.keys(hooks).length === 0) delete cfg.hooks;
  }
} else if (pluginAlreadyInstalled()) {
  // Not writing is only half the guard. If settings.json ALREADY carries our
  // entries — from an older release, or from a hand-merge of
  // settings.json.template — declining to add more still leaves both sources
  // live. This branch is reached with the plugin registered but no usable
  // `claude` CLI, so the marketplace route (which removes them) never runs.
  // Strip them here and fall through to the write.
  const hooks = cfg.hooks;
  let removed = 0;
  if (hooks && typeof hooks === "object" && !Array.isArray(hooks)) {
    for (const evt of Object.keys(hooks)) {
      if (!Array.isArray(hooks[evt])) continue;
      const before = JSON.stringify(hooks[evt]);
      hooks[evt] = stripOwnedHooks(hooks[evt]);
      if (JSON.stringify(hooks[evt]) !== before) removed++;
      if (hooks[evt].length === 0) delete hooks[evt];
    }
    if (Object.keys(hooks).length === 0) delete cfg.hooks;
  }
  if (removed > 0) {
    if (existed) fs.copyFileSync(file, `${file}.massa-ai.bak-${ts}`);
    console.error(
      `  ↷ massa-ai is installed as a Claude Code plugin — removed ${removed} stale` +
        " settings.json hook event(s) that would have fired alongside the plugin's own",
    );
  } else {
    console.error(
      "  ↷ massa-ai is installed as a Claude Code plugin — skipping settings.json" +
        " hooks (the plugin already provides them; wiring both would double-fire)",
    );
  }
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
  for name in massa-ai persona-router profile; do
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
const prev = data.platforms[host];
data.platforms[host] = { root, skillsOwner: "plugin", skills: ["massa-ai", "persona-router", "profile"] };
// The whole-record replace must not drop fields a previous successful install
// wrote (R2) — re-attach them. modelProfile (T10, MPS-03 round-trip
// obligation) is engine-owned; installRoute is installer-owned but written by
// a LATER step of this same install (record_plugin_version) — both must
// survive this earlier whole-record replace or a switched profile / recorded
// route silently vanishes on the next skills-bundling pass.
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
  [[ "$raw_owner" == "plugin" ]] && {
    local name
    for name in massa-ai persona-router profile; do
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
  installed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # installRoute (T8, design F1): installer-owned, engine-read-only. The
  # marketplace route (register_claude_plugin succeeded) serves agents in
  # place from the bundle; the file route copies them into $TARGET/agents.
  # Written on EVERY install path — an absent field is what makes the switch
  # engine refuse loud rather than guess (hosts.ts detectRoute).
  if [[ "$PLUGIN_ROUTE" -eq 1 ]]; then route="marketplace"; else route="file"; fi
  # Version claim (CMR-02/03): the file route records the bundle version — it
  # IS what was just copied. The marketplace route records what the CLI
  # actually serves (refresh_marketplace_cache), which the version-pinned
  # cache can hold BEHIND the bundle; recording the bundle version there is
  # the lie that froze this host's harness gate at a stale cache. Empty
  # served version → record no version at all (next run retries).
  if [[ "$PLUGIN_ROUTE" -eq 1 ]]; then
    version="$PLUGIN_SERVED_VERSION"
  else
    version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SCRIPT_DIR/package.json" | head -n 1)"
  fi

  # Tolerant of a corrupt/missing state file (rewrites a minimal valid one —
  # AC-8). A record-write failure warns but never fails the install: the next
  # run treats the host as unknown-version and reinstalls.
  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" "$TARGET" "$version" "$installed_at" "$route" <<'NODE' || \
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
// An empty version means the served version was unreadable (CMR-03): keep
// any prior plugin record untouched and claim nothing new — an absent/stale
// record is what makes the next harness run retry. installRoute is still
// written below on every path.
if (version) {
  rec.plugin = { version, installedAt };
}
// installRoute is installer-owned (like plugin above); modelProfile is NEVER
// written here — the switch engine (packages/shared/src/profile-switch/) is
// its sole writer, and this installer only ever reads it (see
// apply_recorded_profile below).
rec.installRoute = installRoute;
data.platforms[host] = rec;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
NODE
}

# ── Model-profile variant tree + recorded-profile re-apply (T8, MPS-04) ─────
# Read-side only: this installer never writes platforms[host].modelProfile —
# see the comment above record_plugin_version's NODE block. It only (a)
# refreshes the on-disk variant tree so an offline switch has files to copy
# from, and (b) re-applies a previously recorded profile's active agent set on
# install/upgrade, so a plugin upgrade never silently reverts a switched
# profile back to the shipped default.
install_variant_tree() {
  [[ -d "$VARIANTS_SRC" ]] || return 0
  rm -rf "$VARIANTS_DEST"
  mkdir -p "$VARIANTS_DEST"
  cp -R "$VARIANTS_SRC/." "$VARIANTS_DEST/"
  vecho "  + model-profile variant tree refreshed at $VARIANTS_DEST"
}

# Prints the recorded profile name (platforms[claude].modelProfile.profile),
# or an empty string when unset/unreadable. Never throws — a corrupt or
# missing state file just means "no recorded profile", not an install failure.
recorded_profile() {
  local runner="$1"
  "$runner" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" <<'NODE'
const fs = require("fs");
const [, , file, host] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const rec = data && data.platforms && data.platforms[host];
  const profile =
    rec && rec.modelProfile && typeof rec.modelProfile.profile === "string"
      ? rec.modelProfile.profile
      : "";
  process.stdout.write(profile);
} catch {
  process.stdout.write("");
}
NODE
}

# ── Marketplace install-path resolution (T19, CPP-07) ───────────────────────
# Mirrors packages/shared/src/profile-switch/claude-marketplace.ts's
# resolveClaudeMarketplaceRoot exactly (same selection rule: scope:"user"
# preferred, then most recent lastUpdated, then last entry in array order;
# require the resolved installPath to exist on disk) so the shell installer
# and the TS switch engine agree on which cache directory is "current".
# Never caches — the path is version pinned and moves on every
# `claude plugin update`. Prints the resolved installPath, or "" when
# unresolvable (absent/corrupt registry, no record, or a path that doesn't
# exist on disk). Never throws.
resolve_claude_install_path() {
  local runner="$1"
  "$runner" - "$PLUGIN_REGISTRY" "$PLUGIN_ID" <<'NODE'
const fs = require("fs");
const [, , file, id] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const records = data && data.plugins ? data.plugins[id] : null;
  if (!Array.isArray(records) || records.length === 0) process.exit(0);
  const userScoped = records.filter((r) => r && r.scope === "user");
  const pool = userScoped.length > 0 ? userScoped : records;
  let best;
  let bestTime = -Infinity;
  for (const record of pool) {
    const parsed = record && record.lastUpdated ? Date.parse(record.lastUpdated) : NaN;
    if (Number.isFinite(parsed) && parsed >= bestTime) {
      best = record;
      bestTime = parsed;
    }
  }
  const selected = best || pool[pool.length - 1];
  const installPath = selected && selected.installPath;
  if (!installPath) process.exit(0);
  if (!fs.existsSync(installPath)) process.exit(0);
  process.stdout.write(installPath);
} catch { /* unresolvable — absent file, unreadable file, unparseable JSON */ }
NODE
}

# Re-applies the recorded model profile to the marketplace install root after
# a `claude plugin update` succeeds (CPP-07). AD-015 (read-only): this
# function, like recorded_profile above, NEVER writes
# platforms.claude.modelProfile — the switch engine
# (packages/shared/src/profile-switch/) is its sole writer. An update moves
# installPath to a new version-pinned cache directory, whose agents/ ships
# the bundle's DEFAULT profile; without this re-apply step a switched
# operator would silently revert to that default on every update (context.md
# finding #4). Every failure path is a logged no-op, never a failure — a
# missing recorded profile, an unresolvable install path, or a profile the
# new bundle doesn't ship under agent-profiles/ all mean "nothing to
# re-apply", not an install error.
apply_recorded_profile_after_update() {
  local runner="$1"
  local install_path profile variant_dir copied=0 f name
  install_path="$(resolve_claude_install_path "$runner")"
  if [[ -z "$install_path" ]]; then
    vecho "  ↷ no resolvable marketplace install path — skipping recorded-profile re-apply"
    return 0
  fi
  profile="$(recorded_profile "$runner")"
  if [[ -z "$profile" ]]; then
    vecho "  ↷ no recorded model profile for claude — skipping recorded-profile re-apply"
    return 0
  fi
  variant_dir="$install_path/agent-profiles/$profile"
  if [[ ! -d "$variant_dir" ]]; then
    echo "  ⚠ recorded model profile '$profile' is not available under the updated bundle at $install_path — leaving its default agents in place" >&2
    return 0
  fi
  mkdir -p "$install_path/agents"
  for f in "$variant_dir/"massa-ai-*.md; do
    [[ -f "$f" ]] || continue
    name="$(basename "$f")"
    cp "$f" "$install_path/agents/$name"
    copied=$((copied + 1))
  done
  if [[ "$copied" -gt 0 ]]; then
    vecho "  ↷ re-applied recorded model profile '$profile' (${copied} files) to $install_path/agents"
  else
    vecho "  ↷ recorded model profile '$profile' variant directory has no massa-ai-*.md files — nothing to re-apply"
  fi
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

# ── Marketplace cache refresh (CMR-01..05) ──────────────────────────────────
# `claude plugin install` is an idempotent no-op on an already-installed
# plugin, and the CLI serves a version-pinned cache snapshot — so an upgraded
# bundle never reaches an already-registered host by itself (observed: cache
# pinned at 1.28.0 while the checkout walked to 1.44.0). `claude plugin
# update` re-materializes the cache from a directory-source marketplace
# (verified against the real CLI, spec R1), so run it exactly when the served
# version is OLDER than the bundle — never on equal (no-op) or newer (that
# would downgrade; mirrors the harness "never downgrades" policy).

# Prints the version Claude actually serves for $PLUGIN_ID, or "" when it
# cannot be determined. Tolerant like recorded_profile: a missing/corrupt
# registry, a legacy non-array entry shape, or an absent entry all mean
# "unknown", never a failure. Claude-specific registry format — deliberately
# NOT in installer-shared.sh (Codex's registry differs; don't generalize one
# host's file shape).
claude_served_plugin_version() {
  local runner="$1"
  "$runner" - "$PLUGIN_REGISTRY" "$PLUGIN_ID" <<'NODE'
const fs = require("fs");
const [, , file, id] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const entries = data && data.plugins ? data.plugins[id] : null;
  if (!Array.isArray(entries) || entries.length === 0) process.exit(0);
  const rec = entries.find((e) => e && e.scope === "user") ?? entries[0];
  if (rec && typeof rec.version === "string") process.stdout.write(rec.version);
} catch { /* unknown */ }
NODE
}

# Fills PLUGIN_SERVED_VERSION. Every failure path degrades with a loud
# warning and never aborts the install (I1) — an empty result makes
# record_plugin_version skip the version claim, so the next harness run
# retries instead of trusting a lie.
refresh_marketplace_cache() {
  local runner=""
  if command -v node &>/dev/null; then runner="node"
  elif command -v bun &>/dev/null; then runner="bun"
  else
    echo "  ⚠ node or bun required to verify the served plugin version — skipping cache refresh" >&2
    return 0
  fi

  local served bundle
  served="$(claude_served_plugin_version "$runner")"
  bundle="$(installer_bundle_version "$SCRIPT_DIR/package.json")"
  if [[ -z "$served" ]]; then
    echo "  ⚠ could not read the served plugin version from $PLUGIN_REGISTRY — not recording a version claim" >&2
    return 0
  fi

  if [[ "$(installer_compare_versions "$runner" "$served" "$bundle")" == "-1" ]]; then
    if installer_host_cli_supports claude plugin update; then
      if claude plugin update "$PLUGIN_ID" </dev/null >/dev/null 2>&1; then
        vecho "  + refreshed marketplace cache: ${served} → ${bundle}"
        # CPP-07: an update just moved installPath to a new version-pinned
        # cache directory; re-apply any previously recorded model profile
        # before it silently reverts to the new bundle's default agents.
        apply_recorded_profile_after_update "$runner"
      else
        echo "  ⚠ 'claude plugin update ${PLUGIN_ID}' failed — Claude keeps serving ${served}; re-run the installer or run the update manually" >&2
      fi
    else
      echo "  ⚠ this claude CLI has no 'plugin update' — Claude keeps serving ${served}; update the CLI or reinstall the plugin" >&2
    fi
    # Re-read: record what the CLI serves NOW, whether or not the update
    # succeeded (CMR-02 truthful record; a stale record keeps the harness
    # version gate re-triggering until an update lands — self-healing).
    served="$(claude_served_plugin_version "$runner")"
  fi

  PLUGIN_SERVED_VERSION="$served"
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
  # Prefix-glob against the INSTALLED directory, not the source bundle (IPT-03
  # site 6, D2): deriving removals from $SCRIPT_DIR/commands/*.md misses
  # installed copies whenever the bundle is absent or stale (normal under
  # AD-016). Mirrors the agents loop directly below, which already does this
  # correctly. The keep-list here is empty by design — the marketplace bundle
  # serves its own commands, so every loose file-route copy is removed.
  if [[ -d "$TARGET/commands" ]]; then
    for f in "$TARGET/commands/"massa-ai-*.md; do
      [[ -f "$f" ]] || continue
      rm -f "$f"
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
  # Remove owned command files. Prefix-glob against the INSTALLED directory,
  # not the source bundle: deriving removals from $SCRIPT_DIR/commands/*.md
  # misses installed copies whenever the bundle is absent or stale at
  # uninstall time (normal under AD-016 — generated artifacts are untracked).
  # The massa-ai- prefix is the ownership marker, same as the agents loop below.
  if [[ -d "$TARGET/commands" ]]; then
    for f in "$TARGET/commands/"massa-ai-*.md; do
      [[ -f "$f" ]] || continue
      rm -f "$f"
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
  refresh_marketplace_cache
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

  # Shed commands retired from the bundle (IPT-02 site 2, D1 copy-then-prune):
  # copy the current set first, then remove owned destination entries the
  # bundle no longer ships — never the reverse, so an interrupted run never
  # leaves the user with fewer commands than before. Removal population is the
  # destination directory (D2); ownership test is the massa-ai- name prefix
  # (install.sh:765).
  for f in "$TARGET/commands/"massa-ai-*.md; do
    [[ -f "$f" ]] || continue
    prune_name="$(basename "$f" .md)"
    prune_name="${prune_name#massa-ai-}"
    [[ -f "$SCRIPT_DIR/commands/${prune_name}.md" ]] && continue
    rm -f "$f"
    vecho "  - removed retired command $(basename "$f")"
  done

  # Subagent specialists (generated from skills/agents/*/SKILL.md, navigator
  # included). The massa-ai- name prefix is the ownership marker used by uninstall.
  #
  # Model-profile re-apply (T8, MPS-04): if a switch previously recorded a
  # profile for this host, and the bundle ships that profile's variant, the
  # ACTIVE set comes from agent-profiles/<profile>/ instead of the shipped
  # default — an upgrade must never silently revert a switched profile.
  # Recorded-but-missing-from-bundle is a loud fallback to the default, never
  # a silent one.
  ACTIVE_AGENTS_SRC="$SCRIPT_DIR/agents"
  json_runner=""
  if command -v node &>/dev/null; then json_runner="node"
  elif command -v bun &>/dev/null; then json_runner="bun"
  fi
  if [[ -n "$json_runner" ]]; then
    RECORDED_PROFILE="$(recorded_profile "$json_runner")"
    if [[ -n "$RECORDED_PROFILE" ]]; then
      if [[ -d "$VARIANTS_SRC/$RECORDED_PROFILE" ]]; then
        ACTIVE_AGENTS_SRC="$VARIANTS_SRC/$RECORDED_PROFILE"
        echo "  ↷ re-applying recorded model profile '$RECORDED_PROFILE'"
      else
        echo "  ⚠ recorded model profile '$RECORDED_PROFILE' is not in this bundle — falling back to the default profile" >&2
      fi
    fi
  fi

  for src in "$ACTIVE_AGENTS_SRC/"massa-ai-*.md; do
    [[ -f "$src" ]] || continue
    name="$(basename "$src")"
    cp "$src" "$TARGET/agents/$name"
    vecho "  + $name"
    specialist_count=$((specialist_count + 1))
  done
  vecho "  + ${specialist_count} subagent specialists (generated from skills/agents/*/SKILL.md)"

  # Shed specialists retired from the bundle (IPT-02 site 1, D1
  # copy-then-prune): copy the current set first, then remove owned
  # destination entries ACTIVE_AGENTS_SRC (the bundle, or the active
  # model-profile variant) no longer ships. Never prune-then-copy — an
  # interrupted run must never leave the user with fewer agents than before.
  # Removal population is the destination directory (D2); ownership test is
  # the massa-ai- name prefix (install.sh:775-777).
  for f in "$TARGET/agents/"massa-ai-*.md; do
    [[ -f "$f" ]] || continue
    [[ -f "$ACTIVE_AGENTS_SRC/$(basename "$f")" ]] && continue
    rm -f "$f"
    vecho "  - removed retired specialist $(basename "$f")"
  done

  install_variant_tree
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

# Final step of the install path: record the bundle version. Reached only when
# every fallible step succeeded (AC-16) — never on --uninstall (exits above).
record_plugin_version