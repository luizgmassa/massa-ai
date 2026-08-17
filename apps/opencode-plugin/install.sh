#!/usr/bin/env bash
#
# massa-ai OpenCode plugin installer
#
# Installs the massa-ai OpenCode plugin bundle (a single pre-built JS file) and
# registers it with OpenCode's plugin configuration. Also installs the 12
# subagent specialist agents.
#
# MCP registration is delegated to scripts/install-agents.sh, the single writer
# of host MCP config — same pattern as the Claude/Codex/Cursor installers
# (AD-017: plugins deliver, MCP serves tools, hooks observe). This installer no
# longer removes the MCP entry; the plugin and the MCP server are independent
# surfaces, and uninstalling the plugin does not withdraw MCP registration.
#
# Idempotent: re-running refreshes the installed plugin copy and is a no-op
# for an already-present config entry.
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
# opencode.json `plugin` array IS the registry — but the installed plugin copy
# below is sourced from a built bundle, so it honours the same root.
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

# ── Generated-bundle contract (T8, design Component 4 / UGB-05..07) ─────────
# Why: apps/*-plugin generated subtrees (skills/, agents/, agent-profiles/,
#      lib/opencode-config.cjs) are gitignored build output (UGB-01) — a repo
#      checkout must regenerate them before this installer copies, symlinks,
#      or REQUIRES any of them; a published tarball ships them pre-generated
#      and has no generator sources to run at all. Runs before any
#      host-config mutation and, critically, before the CONFIG_LIB
#      require() a few lines below — an absent lib/opencode-config.cjs would
#      otherwise surface as a bare Node/Bun MODULE_NOT_FOUND rather than this
#      actionable message.
# Impacts: UGB-05 checkout generates, UGB-06 tarball skips, UGB-07 loud
#          failure before mutation, UGB-08 (skip-env honored for harness runs).
# Test: apps/opencode-plugin/__tests__/install.test.ts (skip-branch + loud-failure cases)
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
# the bundle this installer is about to copy/register/require has to
# actually exist. opencode additionally ships a generated lib mirror
# (scripts/lib/opencode-config.cjs, D1) that no other host needs.
if [[ ! -f "$SCRIPT_DIR/skills/massa-ai/SKILL.md" ]]; then
  echo "Error: missing $SCRIPT_DIR/skills/massa-ai/SKILL.md — run 'bun run generate:artifacts' first" >&2
  exit 1
fi
if [[ ! -d "$SCRIPT_DIR/agents" ]] || [[ -z "$(ls -A "$SCRIPT_DIR/agents" 2>/dev/null)" ]]; then
  echo "Error: missing or empty $SCRIPT_DIR/agents — run 'bun run generate:artifacts' first" >&2
  exit 1
fi
if [[ ! -f "$SCRIPT_DIR/lib/opencode-config.cjs" ]]; then
  echo "Error: missing $SCRIPT_DIR/lib/opencode-config.cjs — run 'bun run generate:artifacts' first" >&2
  exit 1
fi

# Resolve target base dir
if [[ "$SCOPE" == "project" ]]; then
  TARGET="$(pwd)/.opencode"
else
  TARGET="$HOME/.config/opencode"
fi
PLUGINS_DIR="$TARGET/plugins/massa-ai"
AGENTS_DIR="$TARGET/agents"
# Generated workflow commands (T10, WFC-08/12). OpenCode's binary discovers
# both `command/` and `commands/` recursively (glob {command,commands}/**/*.md,
# probed against v1.18.14) — `command/` is the docs-canonical name and the one
# this plugin bundle ships (apps/opencode-plugin/command/massa-ai-<stem>.md,
# design Component 4). This host has no hand-authored quick commands, so
# every massa-ai-*.md delivered here is generated.
COMMANDS_DIR="$TARGET/command"
PLUGIN_JS="$REPO_ROOT/apps/opencode-plugin/dist/index.js"
# Model-profile variant tree (T9, design Component 3 / MPS-04). Source is the
# bundle's per-profile agent-profiles/<p>/ (sibling of agents/, A5); dest is
# the engine's own host path table (packages/shared/src/profile-switch/
# hosts.ts): $PLUGINS_DIR/agent-profiles/<p>/ — the switch engine's
# repointOpencodeVariant reads FROM this materialized copy and resolves an
# absolute symlink target into it, so this installer must land real files
# there, not just leave the bundle's own copy unreferenced.
VARIANTS_SRC="$SCRIPT_DIR/agent-profiles"
VARIANTS_DEST="$PLUGINS_DIR/agent-profiles"
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
  # IPT-05/AC-05.1/D6: the authoritative set of harness skills is the
  # generator's own constant (generate-skill-artifacts.ts:138) — massa-ai,
  # persona-router, profile. Do NOT derive this by scanning the bundle's
  # skills/ directory; that installs 49 skills on cursor (AC-05.2).
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
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SCRIPT_DIR/package.json" | head -n 1)"
  installed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # installRoute (T9, design F1): installer-owned, engine-read-only.
  # OpenCode has exactly one install shape — symlinks into this bundle, or
  # into the materialized variant tree — with no marketplace-vs-file
  # distinction the way Claude's plugin registration has, so this is
  # unconditionally "file". Written on EVERY install path; the switch
  # engine's detectRoute() refuses loud on an absent field regardless of host.
  route="file"

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
rec.plugin = { version, installedAt };
// installRoute is installer-owned (like plugin above); modelProfile is NEVER
// written here — the switch engine (packages/shared/src/profile-switch/) is
// its sole writer, and this installer only ever reads it (see
// recorded_profile below).
rec.installRoute = installRoute;
data.platforms[host] = rec;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
NODE
}

# ── Model-profile variant tree + recorded-profile re-apply (T9, MPS-04/F3) ──
# Read-side only: this installer never writes platforms[host].modelProfile —
# see the comment above record_plugin_version's NODE block. It only (a)
# materializes the variant tree at $VARIANTS_DEST so the switch engine's
# repointOpencodeVariant has real files to symlink into, and (b) re-applies a
# previously recorded profile's active symlink TARGETS on install/upgrade —
# actives stay symlinks (never normalized to copies): the pre-flight guard
# below only refuses a REGULAR file, so a symlink is always safely relinked
# regardless of what it currently points at, which is exactly what keeps F3
# (switch, then upgrade) updating the agent instead of freezing it.
install_variant_tree() {
  [[ -d "$VARIANTS_SRC" ]] || return 0
  rm -rf "$VARIANTS_DEST"
  mkdir -p "$VARIANTS_DEST"
  cp -R "$VARIANTS_SRC/." "$VARIANTS_DEST/"
  vecho "  + model-profile variant tree refreshed at $VARIANTS_DEST"
}

# Prints the recorded profile name (platforms[opencode].modelProfile.profile),
# or an empty string when unset/unreadable. Never throws — a corrupt or
# missing state file just means "no recorded profile", not an install failure.
recorded_profile() {
  "$RUNNER" - "$HARNESS_STATE_FILE" "$HARNESS_HOST" <<'NODE'
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

# ── Uninstall ────────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" -eq 1 ]]; then
  vecho "Uninstalling massa-ai OpenCode plugin (scope: $SCOPE)..."
  uninstall_bundled_skills

  # Remove the installed plugin file (a regular copy; pre-fix installs left a
  # symlink — remove either shape).
  if [[ -e "$PLUGINS_DIR/index.js" || -L "$PLUGINS_DIR/index.js" ]]; then
    rm -f "$PLUGINS_DIR/index.js"
    vinfo "removed plugin from $PLUGINS_DIR/"
    if [[ -d "$PLUGINS_DIR" ]]; then
      rmdir "$PLUGINS_DIR" 2>/dev/null || true
    fi
  fi

  # Remove agent symlinks (IPT-03 site 7, D2/AC-03.1/AC-03.2). The removal
  # population is the INSTALLED directory, not the source bundle — deriving it
  # from $SCRIPT_DIR/agents/*.md would miss installed copies whenever the
  # bundle is absent or stale at uninstall time (normal under AD-016), which
  # is exactly what left this loop removing zero agents before this fix. The
  # ownership test stays symlink-ness ([[ -L ]]), unchanged — only the
  # population widened.
  if [[ -d "$AGENTS_DIR" ]]; then
    removed=0
    for dest in "$AGENTS_DIR/"massa-ai-*.md; do
      [[ -e "$dest" || -L "$dest" ]] || continue
      [[ -L "$dest" ]] || continue
      rm -f "$dest"
      removed=$((removed + 1))
    done
    if [[ "$removed" -gt 0 ]]; then
      vinfo "removed $removed agent symlinks from $AGENTS_DIR/"
    fi
  fi

  # Remove owned workflow commands (T10, WFC-08/12). Prefix-glob against the
  # INSTALLED directory, not the source bundle — same reasoning as the
  # claude-plugin uninstall hardening (T7): deriving removals from
  # $SCRIPT_DIR/command/*.md would miss installed copies whenever the bundle
  # is absent or stale at uninstall time (normal under AD-016).
  if [[ -d "$COMMANDS_DIR" ]]; then
    removed=0
    for f in "$COMMANDS_DIR/"massa-ai-*.md; do
      [[ -f "$f" ]] || continue
      rm -f "$f"
      removed=$((removed + 1))
    done
    if [[ "$removed" -gt 0 ]]; then
      vinfo "removed $removed workflow commands from $COMMANDS_DIR/"
    fi
    rmdir "$COMMANDS_DIR" 2>/dev/null || true
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

  # MCP registration is NOT withdrawn here (AD-017): the plugin and the MCP
  # tool surface are independent — uninstalling the plugin must not repeat the
  # exact defect item 1 fixes (an OpenCode user silently losing MCP tools).
  # scripts/install-agents.sh --agent opencode --uninstall remains the explicit
  # opt-in to remove the MCP entry too.

  vecho ""
  vecho "Done. User plugins and top-level keys preserved. MCP registration untouched —"
  vecho "run 'bash scripts/install-agents.sh --agent opencode --uninstall' to remove it too."
  exit 0
fi

# ── Install ──────────────────────────────────────────────────────────────────
vinfo "Installing massa-ai OpenCode plugin to: $TARGET"

# Create plugin directory
mkdir -p "$PLUGINS_DIR"

# Install the plugin as a REAL COPY of the resolved dist/index.js, never a
# symlink. The symlink shape failed in the field: dist/ is gitignored build
# output (AD-016), so a worktree deletion or a checkout without a fresh
# `bun run build` leaves the link dangling — OpenCode skips an unresolvable
# local plugin without logging a load error, so the host silently loses every
# event handler this plugin registers. A copy outlives the checkout — the same
# tradeoff already taken for the hook binary (npm pack drops symlink entries)
# and by install-skills.sh's real-copy contract. Dev-loop cost: after
# `bun run build`, re-run this installer (or the harness) to refresh the
# installed copy.
resolved_plugin_js="$PLUGIN_SOURCE_ROOT/apps/opencode-plugin/dist/index.js"
if [[ ! -f "$resolved_plugin_js" ]]; then
  # The marketplace copy is made before `bun run build` has necessarily run in
  # that tree; the checkout's dist is the only other place it can come from.
  resolved_plugin_js="$REPO_ROOT/apps/opencode-plugin/dist/index.js"
fi

# A pre-fix install left a symlink here; remove it first so cp writes a new
# regular file instead of following the link back into the checkout.
if [[ -L "$PLUGINS_DIR/index.js" ]]; then
  rm -f "$PLUGINS_DIR/index.js"
  vinfo "replaced pre-fix symlink at $PLUGINS_DIR/index.js"
fi
cp "$resolved_plugin_js" "$PLUGINS_DIR/index.js"
vinfo "copy: $PLUGINS_DIR/index.js ← $resolved_plugin_js"

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

# Model-profile variant tree, materialized BEFORE the active-symlink loop
# below resolves its source — the recorded-profile check needs the fresh copy
# to exist under $VARIANTS_DEST, not the bundle's own (unreferenced) copy.
install_variant_tree

# Model-profile re-apply (T9, MPS-04, F3): default source is $SCRIPT_DIR/agents/
# (unchanged from before this feature); a recorded profile whose variant the
# bundle ships repoints each symlink at the materialized copy under
# $VARIANTS_DEST/<profile>/ instead. Recorded-but-missing-from-bundle is a
# loud fallback to the default, never a silent one.
ACTIVE_AGENTS_SRC="$SCRIPT_DIR/agents"
RECORDED_PROFILE="$(recorded_profile)"
if [[ -n "$RECORDED_PROFILE" ]]; then
  if [[ -d "$VARIANTS_DEST/$RECORDED_PROFILE" ]]; then
    ACTIVE_AGENTS_SRC="$VARIANTS_DEST/$RECORDED_PROFILE"
    echo "  ↷ re-applying recorded model profile '$RECORDED_PROFILE'"
  else
    echo "  ⚠ recorded model profile '$RECORDED_PROFILE' is not in this bundle — falling back to the default profile" >&2
  fi
fi

specialist_count=0
for src in "$ACTIVE_AGENTS_SRC/"massa-ai-*.md; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"

  # Pre-flight: refuse to clobber a regular file. A symlink is always safely
  # relinked here regardless of its current target — that is what makes an
  # upgrade re-apply a switched profile (F3) instead of freezing it.
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

# Shed retired agent symlinks (IPT-02 site 4, D1/D2/D3): copy-then-prune —
# the current set was just linked above, so an interrupted run leaves the
# user no worse off than before the upgrade (D1). The removal population is
# the destination directory; $ACTIVE_AGENTS_SRC (the same source the copy
# loop above just used) supplies only the keep-predicate (D2/AC-02.1a).
# Ownership test is symlink-ness (D3/AC-02.2), not a name prefix: the
# pre-flight check above refuses to clobber a regular file at this path
# because that is the user's own content, so this prune must leave a regular
# file alone too, or it would delete exactly what that check protects
# (AC-02.3).
if [[ -d "$AGENTS_DIR" ]]; then
  agents_pruned=0
  for dest in "$AGENTS_DIR/"massa-ai-*.md; do
    [[ -e "$dest" || -L "$dest" ]] || continue
    [[ -L "$dest" ]] || continue
    dest_name="$(basename "$dest")"
    [[ -f "$ACTIVE_AGENTS_SRC/$dest_name" ]] && continue
    rm -f "$dest"
    agents_pruned=$((agents_pruned + 1))
  done
  if [[ "$agents_pruned" -gt 0 ]]; then
    vinfo "pruned $agents_pruned retired agent symlink(s) from $AGENTS_DIR/"
  fi
fi
vecho ""

# Install generated workflow commands (T10, WFC-08/12) — copy, not symlink,
# mirroring the harness-skills copy below rather than the agent-symlink loop
# above (no per-profile variant concept for commands).
mkdir -p "$COMMANDS_DIR"
command_count=0
for src in "$SCRIPT_DIR/command/"massa-ai-*.md; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  cp "$src" "$COMMANDS_DIR/$name"
  command_count=$((command_count + 1))
done
vecho "  + ${command_count} workflow commands installed to $COMMANDS_DIR"

# Shed retired workflow commands (IPT-02 site 5, D1/D2/D3): copy-then-prune,
# same reasoning as the agent prune above. Ownership test here IS the
# massa-ai- name prefix (D3/AC-02.2, opencode's own uninstall at :445-456),
# unlike the symlink test used for agents.
commands_pruned=0
for dest in "$COMMANDS_DIR/"massa-ai-*.md; do
  [[ -f "$dest" ]] || continue
  dest_name="$(basename "$dest")"
  [[ -f "$SCRIPT_DIR/command/$dest_name" ]] && continue
  rm -f "$dest"
  commands_pruned=$((commands_pruned + 1))
done
if [[ "$commands_pruned" -gt 0 ]]; then
  vinfo "pruned $commands_pruned retired workflow command(s) from $COMMANDS_DIR/"
fi
vecho ""

# Skills bundling (PDO-08, 09): install massa-ai/persona-router into the
# shared harness skills directory, unless scripts/install-skills.sh already
# owns it for this platform.
install_bundled_skills
vecho ""

# ── MCP registration (delegated) ─────────────────────────────────────────────
# scripts/install-agents.sh is the single writer of host MCP config. It writes
# the massa-ai entry into the resolved opencode config at USER scope — a
# --project plugin install still registers MCP for the whole user (mirrors
# apps/codex-plugin/install.sh:699-715).
vecho ""
vecho "Registering MCP server (user scope) via scripts/install-agents.sh..."
MCP_ROUTE=0
if [[ -f "$REPO_ROOT/scripts/install-agents.sh" ]]; then
  # On success the delegated output is detail (usually "up to date"), so it is
  # gated. On failure it is never gated: a silently-failed MCP registration is
  # exactly the bug this change set exists to fix — every one of OpenCode's 54
  # tools is reached through this entry, unlike Codex/Cursor, whose plugins
  # never carried an in-process tool surface to begin with.
  if agents_out="$(MASSA_AI_SUPPRESS_SPECIALIST_HINT=1 bash "$REPO_ROOT/scripts/install-agents.sh" --agent opencode --yes 2>&1)"; then
    vecho "$agents_out"
    MCP_ROUTE=1
  else
    echo "$agents_out" >&2
    echo "  ⚠ MCP wiring failed — run: bash scripts/install-agents.sh --agent opencode --yes" >&2
  fi
else
  echo "  ⚠ scripts/install-agents.sh not found — register MCP with: bash scripts/install-agents.sh --agent opencode --yes" >&2
fi

# PAU-01 AC5: a failed/missing MCP registration prints the recovery command
# above and never claims overall success — the plugin file installed, but the
# feature this release exists to ship (54 tools via MCP) did not.
if [ "${MASSA_AI_VERBOSE:-0}" = "1" ]; then
  vecho ""
  vecho "Done. Restart OpenCode to pick up the plugin."
  vecho ""
  if [[ "$MCP_ROUTE" -eq 1 ]]; then
    vecho "💡 Agents are installed in $TARGET/agents/; MCP is registered by scripts/install-agents.sh (single writer)."
  else
    warn "MCP registration did not complete — tools will be unavailable until it is registered manually."
  fi
else
  if [[ "$MCP_ROUTE" -eq 1 ]]; then
    ok "opencode plugin installed (${specialist_count} specialists, ${command_count} workflow commands) — MCP registered (single writer)"
  else
    warn "opencode plugin installed (${specialist_count} specialists, ${command_count} workflow commands) — MCP registration failed, tools unavailable"
    warn "  run: bash scripts/install-agents.sh --agent opencode --yes"
  fi
fi

# Final step of the install path: record the bundle version. Reached only when
# every fallible step succeeded (AC-16) — never on --uninstall (exits above).
record_plugin_version
