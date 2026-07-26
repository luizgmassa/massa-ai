#!/usr/bin/env bash
#
# massa-ai multi-agent MCP installer
#
# The single writer of host MCP configuration. Merges the massa-ai MCP server
# entry into each supported agent's config file with a backup and a deep merge
# that preserves every existing user key. Idempotent: re-running after the first
# run produces no change.
#
# Usage:
#   scripts/install-agents.sh                        # all agents (prompts on real $HOME)
#   scripts/install-agents.sh --dry-run              # show the plan, write nothing
#   scripts/install-agents.sh --uninstall            # remove massa-ai-owned keys
#   scripts/install-agents.sh --agent codex          # limit to one agent
#   scripts/install-agents.sh --target /tmp/fakehome --yes   # tests / CI
#
# Flags:
#   --dry-run              Print the merge plan, write nothing (no backup either)
#   --uninstall            Remove massa-ai-owned keys, preserve user keys
#   --agent <name>         claude-code, claude-desktop, codex, cursor, opencode
#   --target <dir>         Override $HOME root (required for tests)
#   --api-base <url>       MCP API base url written into env (default http://localhost:3333)
#   --mcp-source <type>    Command source: local, npx, auto (default auto)
#   --verbose              Print per-file detail; --dry-run enables this implicitly
#   --quiet                Suppress per-file detail (default)
#   --yes, -y              Consent to writing real $HOME
#   -h, --help             Show this help
#
# Wired agents write to:
#   claude-code     ~/.claude.json                                 (mcpServers, stdio)
#   claude-desktop  ~/Library/Application Support/Claude/claude_desktop_config.json  (mcpServers, stdio, macOS)
#   codex           ~/.codex/config.toml                        ([mcp_servers.massa-ai])
#   cursor          ~/.cursor/mcp.json                           (mcpServers, stdio)
#   opencode        ~/.config/opencode/opencode.json             (mcp / environment / bunx)
#
# Safety:
#   - A backup (<config>.massa-ai.bak-<ts>) is created before any write.
#   - --dry-run writes nothing and creates no backup.
#   - Writing to real $HOME requires --yes (or an interactive "y" on a TTY).
#   - Deep merge preserves every existing user key; only the massa-ai entry is
#     written, and uninstall removes only entries carrying _massaAiOwned: true.
#   - OpenCode MCP registration is skipped when @massa-ai/opencode-plugin is
#     already listed in opencode.json — that plugin registers tools in-process,
#     so an MCP entry would duplicate the whole tool surface.
#
# Exit codes:
#   0  success
#   1  write / parse error
#   2  unknown flag or unknown agent
#   3  neither node nor bun on PATH
#   13 consent gate refused (real $HOME without --yes)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/installer-shared.sh
source "$SCRIPT_DIR/lib/installer-shared.sh"

ALL_AGENTS="claude-code claude-desktop codex cursor opencode"

AGENTS="$ALL_AGENTS"
TARGET_HOME="${HOME:-}"
API_BASE="http://localhost:3333"
MCP_SOURCE="${MASSA_AI_MCP_SOURCE:-auto}"
DRY_RUN=0
UNINSTALL=0
ASSUME_YES=0
VERBOSE=0

usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --verbose) VERBOSE=1 ;;
    --quiet) VERBOSE=0 ;;
    --agent)
      shift
      case "${1:-}" in
        claude-code|claude-desktop|codex|cursor|opencode) AGENTS="$1" ;;
        *)
          echo "Unknown agent: ${1:-}. Valid: ${ALL_AGENTS// /, }" >&2
          exit 2
          ;;
      esac
      ;;
    --target) shift; TARGET_HOME="${1:-}" ;;
    --api-base) shift; API_BASE="${1:-}" ;;
    --mcp-source)
      shift
      case "${1:-}" in
        local|npx|auto) MCP_SOURCE="$1" ;;
        *)
          echo "Unknown --mcp-source value: ${1:-}. Valid: local, npx, auto" >&2
          exit 2
          ;;
      esac
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

TARGET_HOME="$(installer_resolve_path "${TARGET_HOME:-$HOME}")"

# Resolve MCP source: auto → local (if src exists) or npx
REPO_ROOT_FOR_AGENT="${REPO_ROOT_FOR_AGENT:-}"
if [ -z "$REPO_ROOT_FOR_AGENT" ]; then
  REPO_ROOT_FOR_AGENT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
if [ "$MCP_SOURCE" = "auto" ]; then
  if [ -f "$REPO_ROOT_FOR_AGENT/apps/mcp-client/src/index.ts" ]; then
    MCP_SOURCE="local"
  else
    MCP_SOURCE="npx"
  fi
fi

# --dry-run implicitly enables verbose because the plan output *is* the result
if [ "$DRY_RUN" = "1" ]; then
  VERBOSE=1
fi

if [ "$DRY_RUN" != "1" ]; then
  installer_consent_gate "$TARGET_HOME" "$ASSUME_YES" 13 "install-agents"
fi

# Source banner.sh after consent gate
# shellcheck source=scripts/banner.sh
source "$SCRIPT_DIR/banner.sh"
export MASSA_AI_VERBOSE="$VERBOSE"

RUNNER="$(installer_require_runner "agent config files")"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-agents.XXXXXX")"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT
RESULT_FILE="$WORK_DIR/result.tsv"   # written<TAB>backupPath<TAB>changeCount
: > "$RESULT_FILE"

UNAME_S="$(uname -s)"

agent_config_path() {
  case "$1" in
    claude-code) echo "$TARGET_HOME/.claude.json" ;;
    claude-desktop)
      # macOS only — Claude Desktop ships no Linux config location.
      [ "$UNAME_S" = "Darwin" ] || return 1
      echo "$TARGET_HOME/Library/Application Support/Claude/claude_desktop_config.json"
      ;;
    codex) echo "$TARGET_HOME/.codex/config.toml" ;;
    cursor) echo "$TARGET_HOME/.cursor/mcp.json" ;;
    opencode) echo "$TARGET_HOME/.config/opencode/opencode.json" ;;
  esac
}

# serversKey / envKey / launcher differ per host. OpenCode uses "mcp" +
# "environment" + bunx; everyone else uses "mcpServers" + "env" + npx.
agent_servers_key() { [ "$1" = "opencode" ] && echo "mcp" || echo "mcpServers"; }
agent_env_key()     { [ "$1" = "opencode" ] && echo "environment" || echo "env"; }
agent_launcher()    { [ "$1" = "opencode" ] && echo "bunx" || echo "npx"; }

# Entry style determines the JSON shape written:
# - opencode-local: { type: "local", command: [...], environment, enabled, _massaAiOwned }
# - stdio-typed: { type: "stdio", command: string, args: [...], env, _massaAiOwned }  (claude-code)
# - stdio-untyped: { command: string, args: [...], env, _massaAiOwned }  (claude-desktop, cursor)
agent_entry_style() {
  case "$1" in
    opencode) echo "opencode-local" ;;
    claude-code) echo "stdio-typed" ;;
    claude-desktop|cursor) echo "stdio-untyped" ;;
    *) echo "" ;;
  esac
}

# ── JSON writer (claude-code, claude-desktop, cursor, opencode) ─────────────
json_op() {
  local mode="$1" agent="$2" cfg="$3" mcp_source="$4"
  "$RUNNER" - "$mode" "$agent" "$cfg" "$mcp_source" \
    "$(agent_servers_key "$agent")" "$(agent_env_key "$agent")" "$(agent_launcher "$agent")" \
    "$(agent_entry_style "$agent")" "$API_BASE" "$(installer_timestamp)" "$RESULT_FILE" "$REPO_ROOT_FOR_AGENT" "$VERBOSE" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , mode, agent, file, mcpSource, serversKey, envKey, launcher, entryStyle, apiBase, ts, resultFile, repoRoot, verbosity] = process.argv;
const VERBOSE = verbosity === "1";

const OWNED_KEY = "massa-ai";
const MARKER = "_massaAiOwned";

function read() {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return { cfg: {}, existed: true };
    return { cfg: JSON.parse(raw), existed: true };
  } catch (e) {
    if (e.code === "ENOENT") return { cfg: {}, existed: false };
    throw new Error(`${agent}: existing config at ${file} is not valid JSON; refusing to overwrite — fix or back up manually first.`);
  }
}

// Deep-merge src into dst. Arrays are replaced, not concatenated — same
// semantics the TypeScript installer shipped with.
function deepMerge(dst, src) {
  const out = { ...dst };
  for (const [k, v] of Object.entries(src)) {
    const bothObjects =
      v && typeof v === "object" && !Array.isArray(v) &&
      out[k] && typeof out[k] === "object" && !Array.isArray(out[k]);
    out[k] = bothObjects ? deepMerge(out[k], v) : v;
  }
  return out;
}

function ownedEntry() {
  const e = {};
  const isLocal = mcpSource === "local";
  const localPath = isLocal ? path.join(repoRoot, "apps/mcp-client/src/index.ts") : null;

  if (entryStyle === "opencode-local") {
    e.type = "local";
    if (isLocal) {
      e.command = ["bun", "run", localPath];
    } else {
      // bunx has no -y (it never prompts; it installs into a shared cache).
      // Its documented flags are --bun, -p/--package, --no-install, --verbose,
      // --silent. -p is required here because the bin name (massa-ai) differs
      // from the package name.
      e.command = ["bunx", "-p", "@massa-ai/mcp-client", "massa-ai"];
    }
    e.environment = { MASSA_AI_API_URL: apiBase };
    e.enabled = true;
  } else if (entryStyle === "stdio-typed") {
    // claude-code: type first, then command (string), args, env
    e.type = "stdio";
    if (isLocal) {
      e.command = "bun";
      e.args = ["run", localPath];
    } else {
      e.command = "npx";
      e.args = ["-y", "-p", "@massa-ai/mcp-client", "massa-ai"];
    }
    e.env = { MASSA_AI_API_URL: apiBase };
  } else if (entryStyle === "stdio-untyped") {
    // claude-desktop, cursor: command (string), args, env; no type
    if (isLocal) {
      e.command = "bun";
      e.args = ["run", localPath];
    } else {
      e.command = "npx";
      e.args = ["-y", "-p", "@massa-ai/mcp-client", "massa-ai"];
    }
    e.env = { MASSA_AI_API_URL: apiBase };
  }
  e[MARKER] = true;
  return e;
}

function hasPluginHooks(cfg) {
  const hooks = cfg && cfg.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return false;
  return Object.values(hooks).some(
    (arr) => Array.isArray(arr) && arr.some((e) => e && e[MARKER] === true),
  );
}

function backup() {
  const bak = `${file}.massa-ai.bak-${ts}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, bak);
  else fs.writeFileSync(bak, "");
  return bak;
}

function finish(written, backupPath, changes) {
  fs.appendFileSync(resultFile, `${written ? 1 : 0}\t${backupPath || "-"}\t${changes}\n`);
}

const { cfg, existed } = read();
const servers = cfg[serversKey] && typeof cfg[serversKey] === "object" ? cfg[serversKey] : {};
const existing = servers[OWNED_KEY];

if (mode === "uninstall") {
  if (existing === undefined) {
    console.log(`  [${agent}] ${file} — nothing to remove`);
    finish(false, null, 0);
    process.exit(0);
  }
  if (existing[MARKER] !== true) {
    console.log(`  [${agent}] ${file} — "massa-ai" entry is not massa-ai-owned; left untouched`);
    finish(false, null, 0);
    process.exit(0);
  }
  const nextServers = { ...servers };
  delete nextServers[OWNED_KEY];
  const merged = { ...cfg };
  if (Object.keys(nextServers).length) merged[serversKey] = nextServers;
  else delete merged[serversKey];
  const bak = backup();
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  console.log(`  [${agent}] ${file} (remove)`);
  if (VERBOSE) console.log(`      REMOVE  /${serversKey}/massa-ai`);
  finish(true, bak, 1);
  process.exit(0);
}

const after = ownedEntry();
const kind = existing === undefined ? "add" : (JSON.stringify(existing) !== JSON.stringify(after) ? "replace" : null);

if (!kind) {
  console.log(`  [${agent}] ${file} — up to date (no change)`);
  finish(false, null, 0);
  process.exit(0);
}

console.log(`  [${agent}] ${file} (${existed ? "merge" : "create"})`);
if (VERBOSE) {
  console.log(`      ${kind.toUpperCase()}  /${serversKey}/massa-ai`);
  console.log(`        + ${JSON.stringify(after)}`);
  if (existing !== undefined) console.log(`        - ${JSON.stringify(existing)}`);
}

if (mode === "plan") {
  finish(false, null, 1);
  process.exit(0);
}

const merged = deepMerge(cfg, { [serversKey]: { [OWNED_KEY]: after } });
const bak = backup();
fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");

// For claude-code, check for plugin hooks in settings.json (which is separate from .claude.json)
if (agent === "claude-code") {
  try {
    const settingsPath = file.replace(/.claude\.json$/, ".claude/settings.json");
    const settingsRaw = fs.readFileSync(settingsPath, "utf8");
    if (settingsRaw.trim()) {
      const settingsCfg = JSON.parse(settingsRaw);
      if (hasPluginHooks(settingsCfg)) {
        console.log("      massa-ai plugin hooks detected in settings.json — MCP entry in .claude.json alongside; plugin hooks preserved.");
      }
    }
  } catch (e) {
    // settings.json doesn't exist or isn't readable — skip the check
  }
}
finish(true, bak, 1);
NODE
}

# ── Legacy claude-code migration ───────────────────────────────────────────
# Removes _massaAiOwned entries from ~/.claude/settings.json if they exist,
# backing up first. This handles pre-migration installations that wrote to the
# wrong path.
migrate_claude_settings() {
  local settings_file="$TARGET_HOME/.claude/settings.json"
  [ -f "$settings_file" ] || return 0

  "$RUNNER" - "$settings_file" "$(installer_timestamp)" "$RESULT_FILE" "$VERBOSE" <<'NODE'
const fs = require("fs");
const [, , file, ts, resultFile, verbosity] = process.argv;
const VERBOSE = verbosity === "1";

(function() {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return;
    const cfg = JSON.parse(raw);
    if (!cfg.mcpServers || typeof cfg.mcpServers !== "object") return;

    const servers = cfg.mcpServers;
    if (!servers["massa-ai"]) return;
    if (servers["massa-ai"]._massaAiOwned !== true) return;

    // Found an owned entry in the wrong location — remove it
    if (VERBOSE) {
      console.log(`  [claude-code] ${file} (legacy migrate)`);
      console.log(`      REMOVE  /mcpServers/massa-ai (from pre-migration settings.json)`);
    }

    const bak = `${file}.massa-ai.bak-${ts}`;
    fs.copyFileSync(file, bak);

    const nextServers = { ...servers };
    delete nextServers["massa-ai"];
    const merged = { ...cfg };
    if (Object.keys(nextServers).length) merged.mcpServers = nextServers;
    else delete merged.mcpServers;

    fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
    fs.appendFileSync(resultFile, `1\t${bak}\t1\n`);
  } catch (e) {
    // Not valid JSON or not a file — skip silently
  }
})();
NODE
}

# ── Codex TOML writer ──────────────────────────────────────────────────────
# ~/.codex/config.toml holds [mcp_servers.<id>] tables. The parser/emitter here
# is deliberately minimal and hand-rolled: it keeps preamble, comments, blank
# lines, and user tables byte-for-byte, rewriting only the table we own. A
# general TOML library would reformat the file and drop comments.
toml_op() {
  local mode="$1" cfg="$2" mcp_source="$3"
  "$RUNNER" - "$mode" "$cfg" "$mcp_source" "$API_BASE" "$(installer_timestamp)" "$RESULT_FILE" "$REPO_ROOT_FOR_AGENT" "$VERBOSE" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , mode, file, mcpSource, apiBase, ts, resultFile, repoRoot, verbosity] = process.argv;
const VERBOSE = verbosity === "1";

const OWNED_KEY = "massa-ai";
const MARKER = "_massaAiOwned";
const HEADER = ["mcp_servers", OWNED_KEY];

function parseToml(raw) {
  const doc = { preamble: [], tables: [] };
  let cur = null;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) {
      cur = { header: m[1].split(".").map((s) => s.trim()), body: [] };
      doc.tables.push(cur);
    } else if (cur) {
      cur.body.push(line);
    } else {
      doc.preamble.push(line);
    }
  }
  return doc;
}

function stringifyToml(doc) {
  const out = [...doc.preamble];
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  for (const t of doc.tables) {
    if (out.length) out.push("");
    out.push(`[${t.header.join(".")}]`);
    for (const line of t.body) out.push(line);
  }
  return out.join("\n") + "\n";
}

function findTable(doc) {
  return doc.tables.find((t) => t.header.join(".") === HEADER.join(".")) ?? null;
}

function ownedBody() {
  const isLocal = mcpSource === "local";
  const localPath = isLocal ? path.join(repoRoot, "apps/mcp-client/src/index.ts") : null;
  const body = [];
  if (isLocal) {
    body.push('command = "bun"');
    body.push(`args = ["run", "${localPath}"]`);
  } else {
    body.push('command = "npx"');
    body.push('args = ["-y", "-p", "@massa-ai/mcp-client", "massa-ai"]');
  }
  body.push(`env = { MASSA_AI_API_URL = ${JSON.stringify(apiBase)} }`);
  body.push(`${MARKER} = true`);
  return body;
}

function finish(written, backupPath, changes) {
  fs.appendFileSync(resultFile, `${written ? 1 : 0}\t${backupPath || "-"}\t${changes}\n`);
}

function backup() {
  const bak = `${file}.massa-ai.bak-${ts}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, bak);
  else fs.writeFileSync(bak, "");
  return bak;
}

let raw = null;
try { raw = fs.readFileSync(file, "utf8"); } catch { /* no file yet */ }
const doc = raw === null ? { preamble: [], tables: [] } : parseToml(raw);
const owned = findTable(doc);

if (mode === "uninstall") {
  if (!owned) {
    console.log(`  [codex] ${file} — nothing to remove`);
    finish(false, null, 0);
    process.exit(0);
  }
  if (!owned.body.some((l) => l.trim() === `${MARKER} = true`)) {
    console.log(`  [codex] ${file} — [mcp_servers.massa-ai] is not massa-ai-owned; left untouched`);
    finish(false, null, 0);
    process.exit(0);
  }
  doc.tables = doc.tables.filter((t) => t !== owned);
  const bak = backup();
  fs.writeFileSync(file, stringifyToml(doc));
  console.log(`  [codex] ${file} (remove)`);
  if (VERBOSE) console.log("      REMOVE  /mcp_servers/massa-ai");
  finish(true, bak, 1);
  process.exit(0);
}

const after = ownedBody();
let kind = "add";
if (owned) {
  const trimmed = [...owned.body];
  while (trimmed.length && trimmed[trimmed.length - 1].trim() === "") trimmed.pop();
  const same = trimmed.map((l) => l.trim()).join("|") === after.map((l) => l.trim()).join("|");
  kind = same ? null : "replace";
}

if (!kind) {
  console.log(`  [codex] ${file} — up to date (no change)`);
  finish(false, null, 0);
  process.exit(0);
}

console.log(`  [codex] ${file} (${raw === null ? "create" : "merge"})`);
if (VERBOSE) {
  console.log(`      ${kind.toUpperCase()}  /mcp_servers/massa-ai`);
  console.log(`        + ${JSON.stringify(after)}`);
}

if (mode === "plan") {
  finish(false, null, 1);
  process.exit(0);
}

if (owned) owned.body = after;
else doc.tables.push({ header: HEADER, body: after });
const bak = backup();
fs.writeFileSync(file, stringifyToml(doc));
finish(true, bak, 1);
NODE
}

# ── OpenCode plugin detection ──────────────────────────────────────────────
# The OpenCode plugin registers massa-ai tools in-process, so an MCP entry there
# duplicates the entire tool surface. Skip the write only when the plugin is
# actually listed — users without it still need MCP for any tool access at all.
opencode_plugin_present() {
  local cfg="$1"
  [ -f "$cfg" ] || return 1
  "$RUNNER" - "$cfg" <<'NODE'
const fs = require("fs");
try {
  const raw = fs.readFileSync(process.argv[2], "utf8");
  const cfg = raw.trim() ? JSON.parse(raw) : {};
  const plugins = Array.isArray(cfg.plugin) ? cfg.plugin : [];
  // Match npm package or local symlink path or bare directory name
  process.exit(plugins.some((p) => {
    if (typeof p !== "string") return false;
    return p.includes("@massa-ai/opencode-plugin") ||
           p.includes("plugins/massa-ai/index.js") ||
           p === "massa-ai";
  }) ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
}

# ── Advisory: where the 16 subagent specialists come from ──────────────────
# Suppressed when a plugin installer is the caller (it just ran that command).
# Gated behind verbose.
specialist_hint() {
  [ "${MASSA_AI_SUPPRESS_SPECIALIST_HINT:-0}" = "1" ] && return 0
  [ "$VERBOSE" != "1" ] && return 0
  case "$1" in
    claude-code) echo "  💡 16 subagent specialists: apps/claude-plugin/install.sh --user" ;;
    codex) echo "  💡 16 subagent specialists: apps/codex-plugin/install.sh --user" ;;
    cursor) echo "  💡 16 subagent specialists: apps/cursor-plugin/install.sh --user" ;;
    opencode) echo "  💡 16 subagent specialists: massa-ai-config agents install --user" ;;
    *) echo "" ;;
  esac
}

# ── Run ─────────────────────────────────────────────────────────────────────
if [ "$UNINSTALL" = "1" ]; then
  echo "massa-ai uninstall plan:"
elif [ "$DRY_RUN" = "1" ]; then
  echo "massa-ai dry-run plan:"
else
  echo "massa-ai installer:"
fi

MODE="apply"
[ "$DRY_RUN" = "1" ] && MODE="plan"
[ "$UNINSTALL" = "1" ] && MODE="uninstall"

# Handle legacy migration for claude-code before the main loop
if [ "$MODE" = "apply" ] && [ "$UNINSTALL" != "1" ]; then
  migrate_claude_settings
fi

HINTS=""
for agent in $AGENTS; do
  cfg="$(agent_config_path "$agent")" || continue
  [ -n "$cfg" ] || continue

  if [ "$agent" = "opencode" ] && [ "$MODE" != "uninstall" ] && opencode_plugin_present "$cfg"; then
    echo "  [opencode] ${cfg} — skipped: @massa-ai/opencode-plugin registers tools in-process; an MCP entry would duplicate them"
    continue
  fi

  if [ "$agent" = "codex" ]; then
    toml_op "$MODE" "$cfg" "$MCP_SOURCE"
  else
    json_op "$MODE" "$agent" "$cfg" "$MCP_SOURCE"
  fi

  hint="$(specialist_hint "$agent")"
  if [ -n "$hint" ]; then HINTS="${HINTS}${hint}"$'\n'; fi
done

WROTE=0; BACKED=0; CHANGES=0
while IFS=$'\t' read -r w bak n; do
  [ -n "${w:-}" ] || continue
  WROTE=$((WROTE + w))
  if [ "${bak:-}" != "-" ]; then BACKED=$((BACKED + 1)); fi
  CHANGES=$((CHANGES + n))
done < "$RESULT_FILE"

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run — wrote 0 files, 0 backups. ${CHANGES} change(s) would apply."
else
  echo "Wrote ${WROTE} file(s); ${BACKED} backup(s) created."
  if [ "$UNINSTALL" != "1" ] && [ "$WROTE" -gt 0 ]; then
    echo ""
    echo "  massa-ai MCP registration is owned by this script — plugin installers delegate to it."
    printf '%s' "$HINTS"
  fi
fi
exit 0
