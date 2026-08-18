#!/usr/bin/env bash
# ============================================================
#  massa-ai — shared installer helpers
#  Source this file; do not run it directly.
#
#  Usage:
#    source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-shared.sh"
#
#  Bash 3.2 compatible (macOS ships bash 3.2): no associative arrays,
#  no ${var^^}, no readarray. Function-only — no side effects at source time.
# ============================================================

# ── Ownership / backup conventions ───────────────────────────
# Every value massa-ai writes into a host config carries this marker so an
# uninstall can find exactly our keys without pattern matching.
MASSA_AI_OWNED_KEY="massa-ai"
MASSA_AI_OWNED_MARKER="_massaAiOwned"
MASSA_AI_BACKUP_SUFFIX=".massa-ai.bak"

# ── Runner detection ─────────────────────────────────────────
# Bash cannot manipulate JSON or TOML safely, so every structured write runs
# through an inline node/bun heredoc. Mirrors apps/claude-plugin/install.sh.
installer_detect_runner() {
  if command -v node >/dev/null 2>&1; then
    echo "node"
    return 0
  fi
  if command -v bun >/dev/null 2>&1; then
    echo "bun"
    return 0
  fi
  return 1
}

# installer_require_runner [what]
# Echoes the runner name, or exits 3 with a message naming what needed it.
installer_require_runner() {
  local what="${1:-config files}"
  local runner
  if ! runner="$(installer_detect_runner)"; then
    echo "Error: node or bun required to read/write ${what} (JSON/TOML manipulation)" >&2
    exit 3
  fi
  echo "$runner"
}

# ── Timestamps / backups ─────────────────────────────────────
installer_timestamp() {
  date -u +%Y-%m-%dT%H-%M-%S-000Z
}

# installer_backup_file <path>
# Copies <path> to <path>.massa-ai.bak-<ts>. When the file does not exist yet an
# empty marker is reserved instead, so "a backup exists before every write" holds
# on first creation too. Echoes the backup path.
installer_backup_file() {
  local target="$1"
  local bak="${target}${MASSA_AI_BACKUP_SUFFIX}-$(installer_timestamp)"
  mkdir -p "$(dirname "$target")"
  if [ -f "$target" ]; then
    cp "$target" "$bak"
  else
    : > "$bak"
  fi
  echo "$bak"
}

# ── Home resolution ──────────────────────────────────────────
# installer_resolve_path <path>
# Absolute path without requiring the directory to exist (realpath/-f is not
# portable to macOS's system coreutils).
installer_resolve_path() {
  local p="$1"
  case "$p" in
    /*) ;;
    *) p="$(pwd)/$p" ;;
  esac
  # Collapse trailing slash and "/./" segments; leave symlinks alone (lstat
  # semantics matter for the symlink-conflict checks downstream).
  p="${p%/}"
  [ -n "$p" ] || p="/"
  echo "$p"
}

# installer_is_real_home <path> → 0 when <path> resolves to $HOME
installer_is_real_home() {
  local candidate resolved_home
  candidate="$(installer_resolve_path "$1")"
  resolved_home="$(installer_resolve_path "${HOME:-/nonexistent}")"
  [ "$candidate" = "$resolved_home" ]
}

# ── Host plugin CLI probing ──────────────────────────────────
# installer_host_cli_supports <cli> <subcommand...>
# 0 only when <cli> is on PATH AND `<cli> <subcommand...> --help` succeeds.
# Both halves matter. `plugin marketplace add` is recent CLI surface, so an
# older host binary can be present and still not understand it; and the name
# `claude`/`codex`/`cursor` is not reserved, so PATH may hold an unrelated
# binary entirely. Either case must degrade to a printed manual instruction
# rather than a failed install — this probe is what makes that possible.
installer_host_cli_supports() {
  local cli="$1"
  shift
  command -v "$cli" >/dev/null 2>&1 || return 1
  "$cli" "$@" --help </dev/null >/dev/null 2>&1
}

# ── Plugin marketplace source ────────────────────────────────
# A host plugin registry stores the marketplace ROOT PATH, not a copy of its
# contents, so whatever path we register has to keep existing. Registering the
# live checkout was measured to fail two ways once that checkout is deleted:
# Claude reports `failed to load: cache-miss`, and `codex plugin list` errors
# out for EVERY configured marketplace, not just massa-ai. That is the same
# fragility the "real copies, not symlinks" rule in CLAUDE.md already exists to
# avoid for skills.
#
# Modes mirror --mcp-source:
#   local  register the live checkout — edits apply instantly, dies if it moves
#   copy   register a stable copy under <home>/.config/massa-ai/marketplace
#   auto   local when run from a checkout, copy otherwise (npx / published)
MASSA_AI_PLUGIN_SOURCE_DIRNAME=".config/massa-ai/marketplace"

# installer_plugin_source_mode <requested> <repo_root>
installer_plugin_source_mode() {
  local requested="${1:-auto}" repo_root="$2"
  case "$requested" in
    local|copy) echo "$requested"; return 0 ;;
    auto) ;;
    *)
      echo "Error: --plugin-source must be local, copy, or auto (got '${requested}')" >&2
      return 2
      ;;
  esac
  # The Claude marketplace manifest only exists in a source checkout; its
  # absence is what distinguishes an npx/published install.
  if [ -f "${repo_root}/.claude-plugin/marketplace.json" ]; then
    echo "local"
  else
    echo "copy"
  fi
}

# installer_plugin_source_root <mode> <repo_root> <target_home>
# Echoes the marketplace root to register. In copy mode the bundle is
# re-materialised first, so the registered path never points at the checkout.
installer_plugin_source_root() {
  local mode="$1" repo_root="$2" target_home="$3"

  if [ "$mode" = "local" ]; then
    echo "$repo_root"
    return 0
  fi

  local dest="${target_home}/${MASSA_AI_PLUGIN_SOURCE_DIRNAME}"
  mkdir -p "$dest"

  # Each host resolves its marketplace manifest from a different dotdir, and
  # all of them are relative to the same root, so the copy has to preserve the
  # repo's relative layout rather than flattening it.
  local rel
  for rel in .claude-plugin .agents .cursor-plugin; do
    [ -d "${repo_root}/${rel}" ] || continue
    rm -rf "${dest:?}/${rel}"
    cp -R "${repo_root}/${rel}" "${dest}/${rel}"
  done

  mkdir -p "${dest}/apps"
  local host src
  for host in claude codex cursor opencode; do
    src="${repo_root}/apps/${host}-plugin"
    [ -d "$src" ] || continue
    rm -rf "${dest:?}/apps/${host}-plugin"
    cp -R "$src" "${dest}/apps/${host}-plugin"
    # node_modules is a workspace symlink farm pointing back into the checkout;
    # copying it would reintroduce the very dependency this mode removes.
    rm -rf "${dest}/apps/${host}-plugin/node_modules"
    rm -rf "${dest}/apps/${host}-plugin/.turbo"
  done

  echo "$dest"
}

# ── Host detection / bundle-version gating ───────────────────
# Why: the harness plugin phase must install bundles only for hosts present on
#      the machine and upgrade only when the bundle version changed (approach
#      A — harness-gated; .specs/features/plugin-auto-install/design.md C1/C2).
# Impacts: PAI-01 detection, PAI-03..06 version gating, AC-6/AC-8.
# Test: bash scripts/tests/test-plugin-auto-install.sh

# installer_host_config_dir <host>
# Echoes the host's user config dir relative to home. Unknown host → return 2.
installer_host_config_dir() {
  case "$1" in
    claude) echo ".claude" ;;
    codex) echo ".codex" ;;
    cursor) echo ".cursor" ;;
    opencode) echo ".config/opencode" ;;
    *) return 2 ;;
  esac
}

# installer_host_binaries <host>
# Echoes the binary name(s) to probe for <host>, one word per binary. Unknown
# host → return 2. MUST mirror install-skills.sh's platform_executables
# exactly (cursor → "cursor-agent cursor"): plugin detection and skills
# detection must never disagree about the same machine.
installer_host_binaries() {
  case "$1" in
    claude) echo "claude" ;;
    codex) echo "codex" ;;
    cursor) echo "cursor-agent cursor" ;;
    opencode) echo "opencode" ;;
    *) return 2 ;;
  esac
}

# installer_host_detected <host> <target_home>
# Returns 0 and echoes the detection signal (`dir` or `binary`) when
# <target_home>/<config_dir> exists OR any binary from installer_host_binaries
# is on PATH; returns 1 and echoes nothing otherwise. Unknown host → return 2.
# The binary probe is a bare `command -v` (never runs the binary): detection
# must be side-effect-free and sub-second — installer_host_cli_supports stays
# the install-time probe. An empty <target_home> never dir-detects (detection
# must not fabricate a home dir).
installer_host_detected() {
  local host="$1" target_home="$2"
  local config_dir
  config_dir="$(installer_host_config_dir "$host")" || return 2
  if [ -n "$target_home" ] && [ -d "${target_home}/${config_dir}" ]; then
    echo "dir"
    return 0
  fi
  local binary
  for binary in $(installer_host_binaries "$host"); do
    if command -v "$binary" >/dev/null 2>&1; then
      echo "binary"
      return 0
    fi
  done
  return 1
}

# ── Plugin sentinel probe ────────────────────────────────────
# Why: install-harness.sh's plan phase (skip-current) trusts install-state.json's
#      recorded plugin version without checking disk — an external wipe of the
#      installed artifacts (observed live 2026-08-05: ~/.cursor/agents +
#      plugins/local/massa-ai deleted minutes after install) then reports
#      skip-current forever with zero artifacts on disk. This probe is the
#      fix: read-only existence checks against the surfaces the host actually
#      reads, keyed on the recorded installRoute wherever a host's routes point
#      at different surfaces.
# Impacts: PAU-05 (skip-current requires the sentinel), PAU-06 (absent →
#          reinstall, naming the missing sentinel).
# Test: bash scripts/tests/test-plugin-auto-install.sh — T5 wires the harness
#       gating that calls this helper; it is unreachable by any suite until
#       then (co-location rule: the helper and its caller land as sequential
#       commits, and the gap between them is the observed-red window).
#       bash scripts/tests/test-plugin-sentinel-classes.sh wipes one artifact
#       class at a time and is what keeps the probe from narrowing back to one.
#
# ONE CLASS IS NOT A PROXY FOR THE REST. The probe originally checked a single
# artifact class per host (subagents for claude/codex/cursor, index.js for
# opencode). A host that kept its subagents and lost its hooks, commands or
# plugin directory therefore satisfied the probe and was skipped forever —
# measured 2026-08-17 as 14 blind sibling wipes across the four hosts and the
# two alternate routes, and observed live on Cursor, where re-running
# setup-local-first.sh repaired nothing because ~/.cursor/agents was intact.
#
# TERMINATION IS THE DESIGN CONSTRAINT. Every class demanded below must be one
# that a plugin reinstall ON THE RECORDED ROUTE puts back; otherwise "absent"
# is permanent and the self-heal reinstalls on every run. That is why the route
# is consulted rather than assumed, and why classes owned by a different phase
# are deliberately out of scope: harness skills belong to install-skills.sh
# (and are conditional on skillsOwner), MCP registration to install-agents.sh.
# Both of those phases are ungated and repair themselves every run.

# installer_glob_present <glob>
# 0 when the unquoted glob matches at least one existing path. Callers pass the
# pattern as a single word; word-splitting it here is the point.
installer_glob_present() {
  local f
  for f in $1; do
    [ -e "$f" ] && return 0
  done
  return 1
}

# installer_hooks_wired <json_file> [runner]
# 0 when the file's top-level `hooks` map mentions massa-ai. Scoped to that
# subtree deliberately: ~/.claude/settings.json also carries enabledPlugins and
# allowedMcpServers entries naming massa-ai, so a whole-file grep would report
# wired hooks for a host that has none. No runner, unreadable or unparseable
# file → 1, matching the probe's reinstall bias.
installer_hooks_wired() {
  local file="$1" runner="${2:-}"
  [ -f "$file" ] || return 1
  if [ -z "$runner" ]; then
    runner="$(installer_detect_runner)" || return 1
  fi
  "$runner" - "$file" <<'NODE'
const fs = require("fs");
const [, , file] = process.argv;
let data;
try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(1); }
const hooks = data && typeof data === "object" && !Array.isArray(data) ? data.hooks : null;
process.exit(hooks && JSON.stringify(hooks).includes("massa-ai") ? 0 : 1);
NODE
}

# installer_claude_bundle_path <target_home> [runner]
# Echoes the installPath of a listed massa-ai marketplace entry that exists on
# disk, or nothing. Nothing also covers: no registry, unparseable registry, the
# plugin unlisted, and a registry that still lists a cache directory a `claude
# plugin update` has already moved — the last is indistinguishable from a wipe
# from the probe's side, and both want the same answer (reinstall).
installer_claude_bundle_path() {
  local target_home="$1" runner="${2:-}"
  [ -n "$target_home" ] || return 0
  if [ -z "$runner" ]; then
    runner="$(installer_detect_runner)" || return 0
  fi
  "$runner" - "${target_home}/.claude/plugins/installed_plugins.json" <<'NODE'
const fs = require("fs");
const [, , file] = process.argv;
let data;
try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(0); }
const plugins = data && typeof data === "object" && !Array.isArray(data) ? data.plugins : null;
if (!plugins || typeof plugins !== "object") process.exit(0);
const pool = [];
for (const [id, entries] of Object.entries(plugins)) {
  if (!id.startsWith("massa-ai@") || !Array.isArray(entries)) continue;
  for (const e of entries) if (e && typeof e.installPath === "string") pool.push(e.installPath);
}
for (const p of pool) {
  try { if (fs.statSync(p).isDirectory()) { process.stdout.write(p); break; } } catch { /* next */ }
}
NODE
}

# installer_plugin_route <runner> <state_file> <host>
# Echoes platforms[host].installRoute, or nothing when absent/unparsable/
# missing — tolerant reader mirroring installer_plugin_versions exactly
# (unknown route is "no route recorded", not a probe failure).
installer_plugin_route() {
  local runner="$1" state_file="$2" host="$3"
  [ -f "$state_file" ] || return 0
  "$runner" - "$state_file" "$host" <<'NODE'
const fs = require("fs");
const [, , file, host] = process.argv;
let raw = "";
try { raw = fs.readFileSync(file, "utf8"); } catch { process.exit(0); }
let data;
try {
  data = JSON.parse(raw);
} catch {
  process.exit(0);
}
const platforms = data && typeof data === "object" && !Array.isArray(data) ? data.platforms : null;
const rec = platforms && typeof platforms === "object" && !Array.isArray(platforms) ? platforms[host] : null;
const route = rec && typeof rec === "object" && typeof rec.installRoute === "string" ? rec.installRoute : "";
if (route) process.stdout.write(route);
NODE
}

# installer_plugin_sentinel_present <host> <target_home> <state_file>
# 0 = EVERY artifact class a plugin reinstall would restore is on disk; 1 = at
# least one is absent, which also covers any parse/route-lookup failure, a
# missing runner, and an empty target_home (mirrors installer_host_detected: an
# empty home never fabricates a match) — the probe's failure bias is always
# "reinstall", never a false "skip". Unknown host → 2. Read-only; no writes.
#
# Sentinel table — measured 2026-08-17 by installing each host into a scratch
# HOME and enumerating what landed, not read off the installers' prose:
#
#   claude   route=marketplace → a listed massa-ai entry whose installPath is
#                                a real directory, holding agents/massa-ai-*.md
#                                AND commands/*.md. The file-route copies are
#                                deleted on this route (remove_file_route_-
#                                artifacts) and the settings.json hook merge is
#                                skipped, so demanding either would never
#                                terminate. Measured live: 18 agents,
#                                46 commands under the 1.52.0 cache dir.
#   claude   route=file | ""   → ~/.claude/agents/massa-ai-*.md
#                              + ~/.claude/commands/massa-ai-*.md
#                              + massa-ai entries in settings.json → hooks
#                                (measured: 18 / 46 / 5 events)
#   codex    (single route)    → ~/.codex/plugins/massa-ai/ (its skills/*.md
#                                ARE the 46 workflow commands)
#                              + ~/.codex/agents/massa-ai-*.toml
#                              + massa-ai entries in ~/.codex/hooks.json
#                                (measured: 46 / 18 / 6 events)
#   cursor   route=local | ""  → ~/.cursor/plugins/local/massa-ai/ (its
#                                skills/*/SKILL.md are the 46 commands)
#                              + ~/.cursor/agents/massa-ai-*.md
#                              + massa-ai entries in ~/.cursor/hooks.json
#                                (measured: 46 / 18 / 7 events)
#   cursor   route=bridge      → as local, MINUS hooks: --prefer-bridge leaves
#                                hook wiring to ~/.claude on purpose, so a
#                                hooks demand here reinstalls on every run.
#   opencode (single route)    → plugins/massa-ai/index.js a regular file
#                                (never a symlink)
#                              + ~/.config/opencode/agents/massa-ai-*.md
#                              + ~/.config/opencode/command/massa-ai-*.md
#                                (measured: 18 / 40). AD-017: its hooks are
#                                in-process handlers inside index.js, so the
#                                plugin check already covers them.
#
# An unrecorded route ("") takes the local/file expectations. That is safe in
# the direction that matters: a bridge-route Cursor with no recorded route
# reinstalls once, the reinstall wires hooks locally and records the route it
# took, and the next run reads that record. Because the route is re-recorded on
# every install, the probe always evaluates against the last route actually
# taken — never a stale one.
installer_plugin_sentinel_present() {
  local host="$1" target_home="$2" state_file="$3"
  local runner route plugin_dir plugin_js bundle

  case "$host" in
    claude|codex|cursor|opencode) ;;
    *) return 2 ;;
  esac

  [ -n "$target_home" ] || return 1

  runner=""
  route=""
  if runner="$(installer_detect_runner)"; then
    route="$(installer_plugin_route "$runner" "$state_file" "$host" 2>/dev/null)"
  else
    runner=""
  fi

  case "$host" in
    claude)
      if [ "$route" = "marketplace" ]; then
        bundle="$(installer_claude_bundle_path "$target_home" "$runner")"
        [ -n "$bundle" ] || return 1
        installer_glob_present "${bundle}/agents/massa-ai-*.md" || return 1
        installer_glob_present "${bundle}/commands/"'*.md' || return 1
        return 0
      fi
      installer_glob_present "${target_home}/.claude/agents/massa-ai-*.md" || return 1
      installer_glob_present "${target_home}/.claude/commands/massa-ai-*.md" || return 1
      installer_hooks_wired "${target_home}/.claude/settings.json" "$runner" || return 1
      return 0
      ;;
    codex)
      plugin_dir="${target_home}/.codex/plugins/massa-ai"
      [ -d "$plugin_dir" ] || return 1
      installer_glob_present "${plugin_dir}/skills/"'*.md' || return 1
      installer_glob_present "${target_home}/.codex/agents/massa-ai-*.toml" || return 1
      installer_hooks_wired "${target_home}/.codex/hooks.json" "$runner" || return 1
      return 0
      ;;
    cursor)
      plugin_dir="${target_home}/.cursor/plugins/local/massa-ai"
      [ -d "$plugin_dir" ] || return 1
      installer_glob_present "${plugin_dir}/skills/"'*/SKILL.md' || return 1
      installer_glob_present "${target_home}/.cursor/agents/massa-ai-*.md" || return 1
      if [ "$route" != "bridge" ]; then
        installer_hooks_wired "${target_home}/.cursor/hooks.json" "$runner" || return 1
      fi
      return 0
      ;;
    opencode)
      plugin_js="${target_home}/.config/opencode/plugins/massa-ai/index.js"
      if [ ! -f "$plugin_js" ] || [ -L "$plugin_js" ]; then return 1; fi
      installer_glob_present "${target_home}/.config/opencode/agents/massa-ai-*.md" || return 1
      installer_glob_present "${target_home}/.config/opencode/command/massa-ai-*.md" || return 1
      return 0
      ;;
  esac

  return 1
}

# installer_bundle_version <package_json>
# Echoes the top-level "version" of a package.json via sed — no runner needed,
# so the harness can gate before runner-dependent work starts.
installer_bundle_version() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

# installer_plugin_versions <runner> <state_file>
# Tolerant reader: emits "host<TAB>version" per platform with a recorded
# plugin version. Missing file → empty output, exit 0. Unparseable file → one
# stderr warning, empty output, exit 0 — the plugin path treats unknown as
# "install once, then record" and self-heals on success (AC-8). The strict
# skills reader in install-skills.sh is deliberately untouched.
installer_plugin_versions() {
  local runner="$1" state_file="$2"
  [ -f "$state_file" ] || return 0
  "$runner" - "$state_file" <<'NODE'
const fs = require("fs");
const [, , file] = process.argv;
let raw = "";
try { raw = fs.readFileSync(file, "utf8"); } catch { process.exit(0); }
let data;
try {
  data = JSON.parse(raw);
} catch {
  console.error(`Warning: installer state at ${file} is unparseable; treating plugin versions as unknown`);
  process.exit(0);
}
const platforms = data && typeof data === "object" && !Array.isArray(data) ? data.platforms : null;
if (platforms && typeof platforms === "object" && !Array.isArray(platforms)) {
  const out = [];
  for (const [host, rec] of Object.entries(platforms)) {
    const version =
      rec && typeof rec === "object" && rec.plugin && typeof rec.plugin.version === "string"
        ? rec.plugin.version
        : "";
    if (version) out.push(`${host}\t${version}`);
  }
  if (out.length) process.stdout.write(out.join("\n") + "\n");
}
NODE
}

# installer_compare_versions <runner> <a> <b>
# Echoes -1, 0, or 1. Numeric dotted compare; identical strings are equal
# first (a same-version record is always a no-op). Any empty or non-numeric
# segment on either side means "unknown" and compares older (-1), so an
# unknown recorded version upgrades once and is then recorded. A pre-release
# suffix (1.9.1-rc1) has a non-numeric segment and therefore compares older
# than the plain release — correct for this project's release-only tags.
installer_compare_versions() {
  local runner="$1" a="$2" b="$3"
  "$runner" - "$a" "$b" <<'NODE'
const [, , a, b] = process.argv;
let result = -1;
if (a === b) {
  result = 0;
} else {
  const pa = a.split(".");
  const pb = b.split(".");
  const numeric = (parts) => parts.every((p) => /^[0-9]+$/.test(p));
  if (numeric(pa) && numeric(pb)) {
    result = 0;
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const x = Number(pa[i] ?? "0");
      const y = Number(pb[i] ?? "0");
      if (x < y) { result = -1; break; }
      if (x > y) { result = 1; break; }
    }
  }
}
process.stdout.write(`${result}\n`);
NODE
}

# installer_consent_gate <target_home> <yes_flag> <exit_code> [label]
# Refuses to write the real $HOME without --yes. A TTY gets an interactive
# prompt; a non-TTY refuses outright. The exit code is a parameter because
# install-skills.sh exits 1 and install-agents.sh exits 13 on refusal.
installer_consent_gate() {
  local target="$1" yes_flag="$2" code="$3" label="${4:-installer}"

  [ "$yes_flag" = "1" ] && return 0
  installer_is_real_home "$target" || return 0

  if [ -t 0 ]; then
    local reply=""
    printf '  Write massa-ai config into your real $HOME (%s)? [y/N]: ' "$target" >&2
    read -r reply || reply=""
    case "$reply" in
      y|Y|yes|YES) return 0 ;;
    esac
    echo "[consent] ${label}: refusing to write real \$HOME (${target}) without consent. Re-run with --yes, or pass --target <dir> / --dry-run." >&2
    exit "$code"
  fi

  echo "[consent] ${label}: refusing to write real \$HOME (${target}) in a non-interactive context. Re-run with --yes, --target <dir>, or --dry-run." >&2
  exit "$code"
}
