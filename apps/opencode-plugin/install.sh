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
const prev = data.platforms[host];
data.platforms[host] = { root, skillsOwner: "plugin", skills: ["massa-ai", "persona-router"] };
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

# Final step of the install path: record the bundle version. Reached only when
# every fallible step succeeded (AC-16) — never on --uninstall (exits above).
record_plugin_version
