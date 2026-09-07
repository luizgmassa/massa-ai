#!/usr/bin/env bash
#
# massa-ai unified skills installer
#
# Copies every repo-local skill (skills/<name>/SKILL.md and its directory) into
# each supported coding agent's config directory and writes the bootstrap
# contract block into that agent's AGENTS.md. Supports install (--apply),
# uninstall, dry-run, and drift check (--check) across Claude Code, Codex,
# Cursor, and OpenCode.
#
# Real copies, not symlinks (PDO-08): a symlinked install depends on this repo
# checkout staying in place at the path it was installed from. Ownership of an
# installed skill is tracked in install-state.json (v2, skillsOwner: "repo"),
# not by "is this path a symlink" — a plugin tarball install (apps/<host>-plugin/
# install.sh) writes the same target path when this installer has not already
# claimed it (D3, PDO-09), and the two must never fight over the same files.
#
# Usage:
#   scripts/install-skills.sh --apply --platform all            # install
#   scripts/install-skills.sh --uninstall --platform all        # remove
#   scripts/install-skills.sh --dry-run --platform all          # preview
#   scripts/install-skills.sh --check --platform all            # drift check
#   scripts/install-skills.sh --apply --platform claude         # one platform
#   scripts/install-skills.sh --apply --target /tmp/fakehome --yes   # tests
#
# Flags:
#   --apply                 Install skills (symlinks + bootstrap block) (default)
#   --uninstall             Remove massa-ai-owned symlinks + bootstrap block
#   --dry-run               Preview changes, write nothing; forces --verbose
#   --check                 Report drift, exit 1 if found; forces --verbose
#   --quiet                 Suppress per-item detail (default)
#   --verbose               Show detailed per-item changes
#   --platform <name>       claude, codex, cursor, opencode, all (default: all)
#   --target <dir>          Override home directory (for tests)
#   --repo-root <dir>       Override repo root detection
#   --yes, -y               Consent to writing real $HOME
#   --json                  Machine-readable output
#   -h, --help              Show this help
#
# Platforms install to:
#   claude     ~/.claude/skills/<name>            + ~/.claude/AGENTS.md
#   codex      ~/.codex/skills/<name>             + ~/.codex/AGENTS.md
#   cursor     ~/.cursor/skills/<name>            + ~/.cursor/AGENTS.md
#   opencode   ~/.config/opencode/skills/<name>   + ~/.config/opencode/AGENTS.md
#
# Safety:
#   - Aborts on a foreign (not massa-ai-owned) conflict at a target path — never
#     overwrites user files or directories. The conflict scan is a pre-pass: an
#     abort happens before the first copy. Ownership is decided by the state
#     file (a skill this installer already tracks for the platform), a
#     per-skill marker file (`.massa-ai-owned-<name>`, the safety net for a
#     lost/reset state file), or — for migration off the old symlink-based
#     install — any existing symlink at the target, which is always safe to
#     replace since removing a symlink never touches what it pointed to.
#   - --dry-run and --check write nothing.
#   - Uninstall removes only copies (or legacy symlinks) this installer owns.
#   - State persisted to ~/.config/massa-ai/install-state.json (v2; v1 migrated).
#   - Idempotent: re-running --apply is a no-op when the copies already match.
#
# Exit codes:
#   0  success, or --check with no drift
#   1  real $HOME without --yes; --check found drift; symlink conflict
#   2  unknown platform/flag; no agent tools on PATH; integration error
#   3  neither node nor bun on PATH

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/installer-shared.sh
source "$SCRIPT_DIR/lib/installer-shared.sh"
# shellcheck source=scripts/banner.sh
source "$SCRIPT_DIR/banner.sh"

BOOTSTRAP_START="<!-- massa-ai:bootstrap:start -->"
BOOTSTRAP_END="<!-- massa-ai:bootstrap:end -->"

TAB=$'\t'
ALL_PLATFORMS="claude codex cursor opencode"

ACTION="apply"
PLATFORMS="$ALL_PLATFORMS"
TARGET_HOME="${HOME:-}"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSUME_YES=0
JSON_OUT=0
MASSA_AI_VERBOSE="${MASSA_AI_VERBOSE:-0}"

usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }

# ── Arg parsing ─────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) ACTION="apply" ;;
    --uninstall) ACTION="uninstall" ;;
    --dry-run) ACTION="dry-run"; MASSA_AI_VERBOSE=1 ;;
    --check) ACTION="check"; MASSA_AI_VERBOSE=1 ;;
    --quiet) MASSA_AI_VERBOSE=0 ;;
    --verbose) MASSA_AI_VERBOSE=1 ;;
    --platform)
      shift
      case "${1:-}" in
        all) PLATFORMS="$ALL_PLATFORMS" ;;
        claude|codex|cursor|opencode) PLATFORMS="$1" ;;
        *)
          echo "Unknown platform: ${1:-}. Valid: claude, codex, cursor, opencode, all" >&2
          exit 2
          ;;
      esac
      ;;
    --target) shift; TARGET_HOME="${1:-}" ;;
    --repo-root) shift; REPO_ROOT="${1:-}" ;;
    --yes|-y) ASSUME_YES=1 ;;
    --json) JSON_OUT=1 ;;
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
REPO_ROOT="$(installer_resolve_path "$REPO_ROOT")"

DRY_RUN=0
[ "$ACTION" = "dry-run" ] && DRY_RUN=1

# ── Consent gate ────────────────────────────────────────────────────────────
if [ "$ACTION" != "dry-run" ] && [ "$ACTION" != "check" ]; then
  installer_consent_gate "$TARGET_HOME" "$ASSUME_YES" 1 "install-skills"
fi

RUNNER="$(installer_require_runner "installer state")"

# The bootstrap render runs under bun when bun exists, and under $RUNNER
# otherwise. Keyed on `command -v bun` directly and never on
# installer_detect_runner: that helper returns "node" first whenever node is on
# PATH (scripts/lib/installer-shared.sh:23-33), and node is always on PATH in
# this repository as the node-gyp build helper — so a $RUNNER-keyed choice would
# start the renderer under node on every machine, including the ones that have
# bun, and take the ladder's dist branch there. render-bootstrap.ts's own ladder
# reads the same fact from the runtime it was started with, so the two halves
# cannot disagree (design.md R1, scripts/render-bootstrap.ts:100-130).
if command -v bun >/dev/null 2>&1; then
  RENDER_RUNNER="bun"
else
  RENDER_RUNNER="$RUNNER"
fi

# ── Codex home resolution (~/.codex preferred, ~/.config/codex fallback) ────
if [ -d "$TARGET_HOME/.codex" ]; then
  CODEX_HOME="$TARGET_HOME/.codex"
elif [ -d "$TARGET_HOME/.config/codex" ]; then
  CODEX_HOME="$TARGET_HOME/.config/codex"
else
  CODEX_HOME="$TARGET_HOME/.codex"
fi

platform_root() {
  case "$1" in
    claude) echo "$TARGET_HOME/.claude" ;;
    codex) echo "$CODEX_HOME" ;;
    cursor) echo "$TARGET_HOME/.cursor" ;;
    opencode) echo "$TARGET_HOME/.config/opencode" ;;
  esac
}

platform_label() {
  case "$1" in
    claude) echo "Claude Code" ;;
    codex) echo "Codex" ;;
    cursor) echo "Cursor" ;;
    opencode) echo "OpenCode" ;;
  esac
}

platform_executables() {
  case "$1" in
    claude) echo "claude" ;;
    codex) echo "codex" ;;
    cursor) echo "cursor-agent cursor" ;;
    opencode) echo "opencode" ;;
  esac
}

STATE_PATH="$TARGET_HOME/.config/massa-ai/install-state.json"

# ── Scratch space ───────────────────────────────────────────────────────────
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-skills.XXXXXX")"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

RESULTS_FILE="$WORK_DIR/results.tsv"   # status<TAB>platform<TAB>target<TAB>message
: > "$RESULTS_FILE"
BOOTSTRAP_FILE="$WORK_DIR/bootstrap.md"
STATE_IN="$WORK_DIR/state-in.tsv"      # platform<TAB>root<TAB>csv-skills<TAB>owner<TAB>plugin-version<TAB>plugin-installed-at<TAB>install-route<TAB>model-profile<TAB>model-profile-switched-at
STATE_OUT="$WORK_DIR/state-out.tsv"

record() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$RESULTS_FILE"; }

integration_error() {
  local msg="$1"
  echo "ERROR: $msg" >&2
  if [ "$JSON_OUT" = "1" ]; then
    "$RUNNER" - "$msg" <<'NODE'
console.log(JSON.stringify({ status: "error", error: process.argv[2] }, null, 2));
NODE
  fi
  exit 2
}

# ── Skill discovery ─────────────────────────────────────────────────────────
SKILL_NAMES=""
SKILLS_ROOT="$REPO_ROOT/skills"
[ -d "$SKILLS_ROOT" ] || integration_error "Missing skills directory: $SKILLS_ROOT"
for dir in "$SKILLS_ROOT"/*/; do
  [ -d "$dir" ] || continue
  [ -f "${dir}SKILL.md" ] || continue
  name="$(basename "$dir")"
  SKILL_NAMES="${SKILL_NAMES}${SKILL_NAMES:+ }${name}"
done
[ -n "$SKILL_NAMES" ] || integration_error "No installable skills found in $SKILLS_ROOT"

# ── Bootstrap block extraction ──────────────────────────────────────────────
AGENTS_SOURCE="$SKILLS_ROOT/AGENTS.md"
[ -f "$AGENTS_SOURCE" ] || integration_error "Missing canonical agents file: $AGENTS_SOURCE"

# markers <file> — emits the block on stdout, or an ERROR: line on stderr + exit 2
if ! "$RUNNER" - "extract" "$AGENTS_SOURCE" "$BOOTSTRAP_START" "$BOOTSTRAP_END" > "$BOOTSTRAP_FILE" <<'NODE'
const fs = require("fs");
const [, , mode, file, START, END] = process.argv;
const text = fs.readFileSync(file, "utf8");
const starts = text.split(START).length - 1;
const ends = text.split(END).length - 1;
if (starts !== ends || starts > 1) {
  console.error("Managed markers are incomplete or duplicated");
  process.exit(2);
}
if (starts === 0) {
  console.error("Bootstrap block not found in skills/AGENTS.md");
  process.exit(2);
}
const s = text.indexOf(START);
const e = text.indexOf(END, s) + END.length;
process.stdout.write(text.slice(s, e));
NODE
then
  integration_error "Bootstrap block could not be extracted from $AGENTS_SOURCE"
fi

# ── Tool detection ──────────────────────────────────────────────────────────
# Emits "<platform>\t<executable>\t<abs path>" for each detected tool.
TOOLS_FILE="$WORK_DIR/tools.tsv"
: > "$TOOLS_FILE"
for p in $PLATFORMS; do
  for exe in $(platform_executables "$p"); do
    if resolved="$(command -v "$exe" 2>/dev/null)"; then
      [ -n "$resolved" ] || continue
      printf '%s\t%s\t%s\n' "$p" "$exe" "$(installer_resolve_path "$resolved")" >> "$TOOLS_FILE"
      break
    fi
  done
done

tool_installed() { grep -q "^$1$TAB" "$TOOLS_FILE"; }

# ── Active platform selection ───────────────────────────────────────────────
ACTIVE_PLATFORMS=""
if [ "$ACTION" = "uninstall" ] || [ "$ACTION" = "check" ]; then
  ACTIVE_PLATFORMS="$PLATFORMS"
else
  for p in $PLATFORMS; do
    if tool_installed "$p"; then
      ACTIVE_PLATFORMS="${ACTIVE_PLATFORMS}${ACTIVE_PLATFORMS:+ }${p}"
    else
      # Always visible (except JSON): skip notifications are errors/warnings, not verbose detail
      [ "$JSON_OUT" = "1" ] || warn "$(platform_label "$p")  skipped — tool not on PATH"
    fi
  done
  if [ -z "$ACTIVE_PLATFORMS" ]; then
    echo "No requested agent tools are installed." >&2
    exit 2
  fi
fi

# ── State: load ─────────────────────────────────────────────────────────────
# Why: plugin auto-install (PAI-03/06) extends v2 state with an optional
#      per-platform `plugin` record ({version, installedAt}) that skills runs
#      must round-trip byte-identically but never write — the TSV intermediate
#      carries it as fields 5-6 (design C5). Model-profile-switching (T10,
#      MPS-03) extends v2 further with `installRoute` (installer-owned) and
#      `modelProfile` ({profile, switchedAt}, engine-owned) — fields 7-9,
#      same pass-through discipline: a skills run must round-trip both
#      byte-identically and never write either.
# Impacts: PAI-06 state compatibility, AC-7; plugin records survive skills
#      runs; MPS-03 installRoute/modelProfile survive skills runs.
# Test: bun test scripts/__tests__/install-state-plugin-version.test.ts
: > "$STATE_IN"
if ! "$RUNNER" - "$STATE_PATH" "$TARGET_HOME" "$CODEX_HOME" > "$STATE_IN" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , file, home, codexHome] = process.argv;
const PLATFORMS = ["claude", "codex", "cursor", "opencode"];

function rootFor(p) {
  if (p === "claude") return path.join(home, ".claude");
  if (p === "codex") return codexHome;
  if (p === "cursor") return path.join(home, ".cursor");
  return path.join(home, ".config", "opencode");
}

let raw;
try {
  raw = fs.readFileSync(file, "utf8");
} catch {
  process.exit(0); // no state yet — empty
}

let data;
try {
  data = JSON.parse(raw);
} catch {
  console.error(`Malformed JSON in installer state: ${file}`);
  process.exit(2);
}
if (typeof data !== "object" || data === null || Array.isArray(data)) {
  console.error(`Expected a JSON object in ${file}`);
  process.exit(2);
}

const version = data.version ?? 1;
const out = [];

if (version === 1) {
  // v1: platforms was a flat array of platform names. Migrate in memory only —
  // nothing is persisted until the run succeeds.
  if (!Array.isArray(data.platforms)) {
    console.error(`Invalid platform list in installer state: ${file}`);
    process.exit(2);
  }
  for (const p of data.platforms) {
    if (typeof p !== "string" || !PLATFORMS.includes(p)) {
      console.error(`Invalid platform in installer state: ${file}`);
      process.exit(2);
    }
    // v1 predates the plugin-writer concept — everything it recorded was a
    // repo-owned symlink install. Plugin fields (5-6) and the model-profile-
    // switching fields (7-9) are always empty.
    out.push([p, rootFor(p), "", "repo", "", "", "", "", ""]);
  }
} else if (version === 2) {
  const platforms = data.platforms;
  if (typeof platforms !== "object" || platforms === null || Array.isArray(platforms)) {
    console.error(`Invalid platform records in installer state: ${file}`);
    process.exit(2);
  }
  for (const [p, rec] of Object.entries(platforms)) {
    if (!PLATFORMS.includes(p) || typeof rec !== "object" || rec === null) {
      console.error(`Invalid platform record in installer state: ${file}`);
      process.exit(2);
    }
    if (typeof rec.root !== "string" || !rec.root) {
      console.error(`Invalid platform root in installer state: ${file}`);
      process.exit(2);
    }
    const skills = rec.skills;
    const bad = !Array.isArray(skills) || skills.some(
      (s) => typeof s !== "string" || !s || s === "." || s === ".." || s.includes("/"),
    );
    if (bad) {
      console.error(`Invalid skill list in installer state: ${file}`);
      process.exit(2);
    }
    // skillsOwner is new (D3/PDO-08): a state file written before this field
    // existed recorded only repo-owned symlink installs, so a missing/invalid
    // value defaults to "repo" rather than failing closed on every prior
    // install-state.json on disk.
    const owner = rec.skillsOwner === "plugin" ? "plugin" : "repo";
    // plugin (PAI-03) is optional pass-through: skills runs never write it,
    // but the TSV must carry it so the state rewrite round-trips the records
    // the plugin installers write. Absent stays absent — never empty strings
    // re-materialised as an object downstream (design C5).
    const plugin = rec.plugin && typeof rec.plugin === "object" && !Array.isArray(rec.plugin) ? rec.plugin : null;
    const pluginVersion = plugin && typeof plugin.version === "string" ? plugin.version : "";
    const pluginInstalledAt = plugin && typeof plugin.installedAt === "string" ? plugin.installedAt : "";
    // installRoute + modelProfile (T10, MPS-03): the same optional
    // pass-through discipline as plugin above — a skills run is not their
    // writer (installRoute is installer-owned, modelProfile is engine-owned),
    // but it must round-trip whatever is already there byte-identically.
    const installRoute = typeof rec.installRoute === "string" ? rec.installRoute : "";
    const modelProfile =
      rec.modelProfile && typeof rec.modelProfile === "object" && !Array.isArray(rec.modelProfile)
        ? rec.modelProfile
        : null;
    const modelProfileProfile = modelProfile && typeof modelProfile.profile === "string" ? modelProfile.profile : "";
    const modelProfileSwitchedAt =
      modelProfile && typeof modelProfile.switchedAt === "string" ? modelProfile.switchedAt : "";
    out.push([
      p,
      rec.root,
      [...new Set(skills)].join(","),
      owner,
      pluginVersion,
      pluginInstalledAt,
      installRoute,
      modelProfileProfile,
      modelProfileSwitchedAt,
    ]);
  }
} else {
  console.error(`Unsupported installer state version in ${file}`);
  process.exit(2);
}

process.stdout.write(out.map((r) => r.join("\t")).join("\n") + (out.length ? "\n" : ""));
NODE
then
  integration_error "Installer state at $STATE_PATH is invalid"
fi

state_skills_for() {
  local p="$1" line
  line="$(grep "^$p$TAB" "$STATE_IN" 2>/dev/null | head -n1 || true)"
  [ -n "$line" ] || return 0
  printf '%s' "$line" | cut -f3 | tr ',' ' '
}

# state_owner_for PLATFORM — "repo" | "plugin" | "" (no prior record).
state_owner_for() {
  local p="$1" line
  line="$(grep "^$p$TAB" "$STATE_IN" 2>/dev/null | head -n1 || true)"
  [ -n "$line" ] || return 0
  printf '%s' "$line" | cut -f4
}

# Seed the outgoing state with everything we are not touching this run.
cp "$STATE_IN" "$STATE_OUT"

# state_replace PLATFORM ROOT CSV [OWNER]
# Rewrites the platform's outgoing row. Plugin-version fields (5-6) and the
# model-profile-switching fields (7-9: installRoute, modelProfile.profile,
# modelProfile.switchedAt — T10, MPS-03) are all pass-through: preserved from
# the existing row, never written here — a skills run must not create,
# destroy, or edit a plugin record, an installer-recorded route, or an
# engine-recorded profile (design C5, extended).
state_replace() {
  local p="$1" root="$2" csv="$3" owner="${4:-repo}" tmp="$WORK_DIR/state.tmp"
  local existing plugin_version="" plugin_installed_at=""
  local install_route="" model_profile="" model_profile_switched_at=""
  existing="$(grep "^$p$TAB" "$STATE_OUT" 2>/dev/null | head -n1 || true)"
  if [ -n "$existing" ]; then
    plugin_version="$(printf '%s' "$existing" | cut -f5)"
    plugin_installed_at="$(printf '%s' "$existing" | cut -f6)"
    install_route="$(printf '%s' "$existing" | cut -f7)"
    model_profile="$(printf '%s' "$existing" | cut -f8)"
    model_profile_switched_at="$(printf '%s' "$existing" | cut -f9)"
  fi
  grep -v "^$p$TAB" "$STATE_OUT" > "$tmp" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$p" "$root" "$csv" "$owner" "$plugin_version" "$plugin_installed_at" \
    "$install_route" "$model_profile" "$model_profile_switched_at" >> "$tmp"
  mv "$tmp" "$STATE_OUT"
}

state_delete() {
  local p="$1" tmp="$WORK_DIR/state.tmp"
  grep -v "^$p$TAB" "$STATE_OUT" > "$tmp" 2>/dev/null || true
  mv "$tmp" "$STATE_OUT"
}

# ── Bootstrap block edit (plan | apply | remove-plan | remove-apply) ────────
#
# bootstrap_engine MODE TARGET BODY_FILE
#   plan          — would the block change? touches no file
#   apply         — write the block, creating or amending TARGET
#   remove-plan   — is the block present? touches no file
#   remove-apply  — drop the block, unlinking TARGET when nothing else remains
#
# The block body is a positional argument rather than the global
# $BOOTSTRAP_FILE, so one engine serves AGENTS.md, CLAUDE.md and the whole-file
# MASSA-AI.md instead of three copies of the marker arithmetic (design.md:268).
#
# stdout is "change" or "nochange". Exit 2 = duplicated or incomplete markers;
# exit 4 = refused to write through a foreign symlink. bootstrap_op_error maps
# both, so the two are never reported as each other.
bootstrap_engine() {
  "$RUNNER" - "$1" "$2" "$3" "$BOOTSTRAP_START" "$BOOTSTRAP_END" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , mode, target, blockFile, START, END] = process.argv;
// Trailing newlines are stripped so the block on disk is always
// START + "\n" + body + "\n" + END + "\n" whatever the body file ended with.
// That is the exact form wrapBootstrapBlock produces
// (packages/shared/src/bootstrap/render.ts:95-97), and the two writers must
// stay byte-identical or a file written by one reads as drift to the other.
// The final newline sits outside the block, which is why the idempotency
// comparison below can compare marker-to-marker slices directly.
const desired = fs.readFileSync(blockFile, "utf8").replace(/\n+$/, "");

// lstat, not stat: the symlink node itself is the subject of the write-through
// policy below, and readFileSync would silently resolve it away.
let isLink = false;
try { isLink = fs.lstatSync(target).isSymbolicLink(); } catch { /* no file yet */ }

let text = "";
try {
  text = fs.readFileSync(target, "utf8");
} catch { /* no file yet, or a dangling link */ }

const starts = text.split(START).length - 1;
const ends = text.split(END).length - 1;
if (starts !== ends || starts > 1) {
  console.error("Managed markers are incomplete or duplicated");
  process.exit(2);
}

// Write-through policy (design.md:453, :478). The common shape here is
// ~/.claude/CLAUDE.md -> ~/dotfiles/claude/CLAUDE.md, and writing through it
// edits a file the user manages elsewhere, usually under git. The resolved
// target counts as massa-ai-owned only once it already carries our marker pair
// — the ownership proof this feature chose for these files (design.md
// "Ownership proof for MASSA-AI.md"). This is the opposite of is_owned_target's
// rule for skill directories, deliberately: see the comment there
// (scripts/install-skills.sh:665-680). Removal is exempt because a link with no
// block of ours is already "nochange" below, and refusing there would break
// uninstall on a machine that merely symlinks its AGENTS.md.
if (isLink && starts === 0 && (mode === "plan" || mode === "apply")) {
  console.error(`Refusing to write through symlink: ${target}`);
  process.exit(4);
}

// Where the bytes actually land. Renaming onto the link node would replace it
// with a regular file and silently break the user's dotfiles indirection, so a
// symlink we do own is followed to its resolved path.
const writeTarget = isLink ? fs.realpathSync(target) : target;

// fs.writeFileSync truncates in place: a kill or ENOSPC mid-write leaves the
// file holding a start marker with no end marker, which the check above turns
// into a hard exit 2 on every later run for every host (design.md:454). Temp
// file plus rename makes the swap atomic — the same discipline
// writeFileAtomically applies to config.json.
function writeAtomic(file, contents) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.massa-ai.tmp-${process.pid}`);
  fs.writeFileSync(tmp, contents);
  // rename() installs the temp file's inode, so an existing file's mode would
  // be lost — carry it forward rather than widening a 0600 CLAUDE.md to 0644.
  try { fs.chmodSync(tmp, fs.statSync(file).mode & 0o777); } catch { /* new file */ }
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw err;
  }
}

function replaceBlock() {
  const s = text.indexOf(START);
  const e = text.indexOf(END, s) + END.length;
  return text.slice(0, s) + desired + text.slice(e);
}

// Append-only: every byte the file already holds survives verbatim. The old
// `text.trimEnd()` rewrote the user's trailing whitespace, which is exactly
// what BST-02 AC-4's byte-identical criterion forbids.
//
// No blank separator line is inserted, and that is a decision rather than an
// omission. A separator has to be taken back on removal, and no rule can tell
// our separator from a blank line the user already had: the migration fixture
// (BST-05 AC-8) hands this engine a file whose user text ends in a blank line
// with the block placed directly after it, and a `before.endsWith("\n\n")` trim
// on removal eats that blank line — one byte the user wrote. Keeping the
// separator therefore costs a real user byte on every migration, while dropping
// it costs one blank line of markdown cosmetics in a generated section. The
// byte wins. What remains is exactly invertible: this function adds a
// terminator only when the last line lacks one, and removeBlock takes back only
// the newline the block itself owns.
function appendBlock() {
  if (text === "") return desired + "\n";
  let head = text;
  if (!head.endsWith("\n")) head += "\n";  // terminate an unterminated last line
  return head + desired + "\n";
}

// The exact inverse of appendBlock: the block owns its own trailing line
// terminator and nothing else. Every byte before the start marker is the
// caller's and survives untouched, so a hand-placed block sitting against user
// text — the migration case — costs the user nothing. The old `.trim()` instead
// ate every leading and trailing blank line in the whole file.
function removeBlock() {
  const s = text.indexOf(START);
  const e = text.indexOf(END, s) + END.length;
  const before = text.slice(0, s);
  let after = text.slice(e);
  if (after.startsWith("\n")) after = after.slice(1);
  return before + after;
}

if (mode === "plan" || mode === "apply") {
  const current = starts === 1
    ? text.slice(text.indexOf(START), text.indexOf(END, text.indexOf(START)) + END.length)
    : null;
  if (current === desired) {
    process.stdout.write("nochange");
    process.exit(0);
  }
  if (mode === "plan") {
    process.stdout.write("change");
    process.exit(0);
  }
  writeAtomic(writeTarget, starts === 1 ? replaceBlock() : appendBlock());
  process.stdout.write("change");
  process.exit(0);
}

// remove-plan | remove-apply
if (starts === 0) {
  process.stdout.write("nochange");
  process.exit(0);
}
if (mode === "remove-plan") {
  process.stdout.write("change");
  process.exit(0);
}
const remaining = removeBlock();
if (remaining === "" && !isLink) {
  // BST-05 AC-9a/AC-9b: the managed block was the file's entire content, so
  // writing "" would leave a 0-byte MASSA-AI.md — or a wiring file this
  // installer created — as uninstall residue. Unlink instead. A symlink is
  // excluded: dropping the node would strand our block inside the file it
  // points at, and deleting that file is deleting a path the user chose to
  // manage elsewhere.
  fs.unlinkSync(target);
} else {
  writeAtomic(writeTarget, remaining);
}
process.stdout.write("change");
NODE
}

# bootstrap_op MODE TARGET BODY_FILE [BACKUP_ON_CHANGE]
# Policy layer over bootstrap_engine. With BACKUP_ON_CHANGE=1 an existing TARGET
# is copied to TARGET.massa-ai.bak-<ts> before a mutating mode that would really
# change it — a hand-edited MASSA-AI.md must survive the --apply that overwrites
# it (design.md:452). The would-change guard is load-bearing: an unguarded
# backup drops a second copy on every re-apply, including the ones that change
# nothing. installer_backup_file (scripts/lib/installer-shared.sh:56) had no
# production call site before this one.
bootstrap_op() {
  local mode="$1" target="$2" body_file="$3" backup="${4:-0}"
  local plan_mode="" plan_verdict=""
  if [ "$backup" = "1" ] && [ -f "$target" ]; then
    case "$mode" in
      apply) plan_mode="plan" ;;
      remove-apply) plan_mode="remove-plan" ;;
    esac
    if [ -n "$plan_mode" ]; then
      plan_verdict="$(bootstrap_engine "$plan_mode" "$target" "$body_file")" || return $?
      if [ "$plan_verdict" = "change" ]; then
        installer_backup_file "$target" >/dev/null
      fi
    fi
  fi
  bootstrap_engine "$mode" "$target" "$body_file"
}

# bootstrap_op_error RC TARGET — the engine's two failure modes read as
# themselves. Mapping both onto the marker message would report a refused
# symlink write as a corrupted file.
bootstrap_op_error() {
  case "$1" in
    4) integration_error "Refusing to write through symlink: $2 — its target carries no massa-ai managed block" ;;
    *) integration_error "Managed markers are incomplete or duplicated in $2" ;;
  esac
}

# ── Bootstrap contract delivery ─────────────────────────────────────────────
#
# The contract body moved out of AGENTS.md and into a first-class per-host
# MASSA-AI.md (BST-01), and each host is wired to load it through its own real
# mechanism (BST-02..BST-04, design.md:204-209):
#
#   claude    ~/.claude/MASSA-AI.md            + an @MASSA-AI.md managed block
#                                                in ~/.claude/CLAUDE.md, because
#                                                Claude Code reads CLAUDE.md and
#                                                never AGENTS.md
#   codex     $CODEX_HOME/MASSA-AI.md          + a pointer block in AGENTS.md
#   cursor    ~/.cursor/MASSA-AI.md            + a pointer block in AGENTS.md
#   opencode  ~/.config/opencode/MASSA-AI.md   + the absolute path in the
#                                                config's `instructions` array
#
# The destination is platform_root (:147-154), not installer_host_config_dir:
# `git grep -c installer_host_config_dir -- scripts/install-skills.sh` returns
# zero, this script has always carried its own map, and the two disagree on
# Codex — installer-shared.sh:195 hardcodes a home-relative .codex while
# platform_root returns the $CODEX_HOME resolved at :139-145, which prefers
# ~/.codex but falls back to ~/.config/codex. Following the other one would
# write the contract to ~/.codex on a ~/.config/codex machine: a silently
# unwired host, the exact class the toggle engine's wiring probe exists to
# detect.
contract_path() { printf '%s/MASSA-AI.md' "$(platform_root "$1")"; }

# bootstrap_render PLATFORM CONTRACT_OUT POINTER_OUT
# Renders both documents for one host, each already wrapped in the managed
# marker pair so bootstrap_op can take the file as its body argument. Warnings
# (an unreadable config.json degrading to registry defaults, BST-10 AC-10b) and
# errors reach stderr from the renderer itself, already named.
bootstrap_render() {
  "$RENDER_RUNNER" "$REPO_ROOT/scripts/render-bootstrap.ts" \
    --target-home "$TARGET_HOME" \
    --host "$1" \
    --source "$AGENTS_SOURCE" \
    --repo-root "$REPO_ROOT" \
    --contract-out "$2" \
    --pointer-out "$3"
}

# The CLAUDE.md wiring block. Claude resolves `@` imports relative to the
# containing file, so the bare relative form is what loads ~/.claude/MASSA-AI.md
# from ~/.claude/CLAUDE.md — and it is the token the engine's wiring probe looks
# for (packages/shared/src/bootstrap/engine.ts:369-373). Deliberately three
# lines of wiring and no policy: the contract lives in MASSA-AI.md, and a second
# copy here is what BST-04 AC-7 forbids for the pointer hosts for the same
# reason.
CLAUDE_IMPORT_FILE="$WORK_DIR/claude-import.md"
{
  printf '%s\n' "$BOOTSTRAP_START"
  printf '## massa-ai Startup Contract\n\n'
  printf '@MASSA-AI.md\n'
  printf '%s\n' "$BOOTSTRAP_END"
} > "$CLAUDE_IMPORT_FILE"

# opencode_instructions_op MODE ROOT ENTRY
# The `instructions` half of OpenCode's wiring, layered over
# scripts/lib/opencode-config.cjs's instructionsOp (:268). instructionsOp, never
# writeConfig: writeConfig takes exactly (targetPath, cfg) (:174), so a third
# `mode` argument would be silently ignored by JS and the config written
# unconditionally — defeating the plan modes with every gate green.
#
# stdout is "change" or "nochange", the same vocabulary bootstrap_engine uses.
# Line 2 onward of stdout carries the notes instructionsOp returned, so the
# caller can put the orphan-entry limitation into its report. Exit 5 = the
# config is not parseable (BST-03 AC-11): the caller records that host and
# returns, so sibling hosts still run and no partial change is written.
opencode_instructions_op() {
  "$RUNNER" - "$SCRIPT_DIR/lib/opencode-config.cjs" "$1" "$2" "$3" <<'NODE'
const fs = require("fs");
const [, , modulePath, mode, dir, entry] = process.argv;
const { resolveConfigPath, parseJsonc, instructionsOp } = require(modulePath);

const resolved = resolveConfigPath(dir);
if (resolved.both) {
  // spec.md edge case: OpenCode core merges opencode.json OVER opencode.jsonc,
  // so editing the losing file would be a silent no-op. Edit the winner and say
  // which one is shadowed.
  console.error(`WARNING: both opencode.json and opencode.jsonc exist in ${dir}; editing ${resolved.path} — the other is shadowed`);
}

let cfg = {};
if (!resolved.created && fs.existsSync(resolved.path)) {
  try {
    cfg = parseJsonc(fs.readFileSync(resolved.path, "utf8"));
  } catch (err) {
    console.error(`${resolved.path} is ${err.message}; refusing to overwrite it`);
    process.exit(5);
  }
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
    console.error(`${resolved.path} is not a JSON object; refusing to overwrite it`);
    process.exit(5);
  }
}

const out = instructionsOp(mode, resolved.path, cfg, entry);
process.stdout.write(out.result);
for (const note of out.notes) process.stdout.write(`\n${note}`);
NODE
}

# bootstrap_note PLATFORM VERDICT TARGET DONE_MSG WOULD_MSG
# Turns one engine verdict into the run's record, and raises BOOTSTRAP_CHANGED
# for the summary line. Always returns 0: a `verdict && flag=1` idiom would make
# an unchanged last step the function's exit status, and under `set -e` that
# aborts the whole run for every remaining host.
BOOTSTRAP_CHANGED=0
bootstrap_note() {
  local p="$1" verdict="$2" target="$3" done_msg="$4" would_msg="$5"
  [ "$verdict" = "change" ] || return 0
  BOOTSTRAP_CHANGED=1
  if [ "$DRY_RUN" = "1" ]; then
    vinfo "$would_msg"
    record "would-change" "$p" "$target" "$would_msg"
  else
    vinfo "$done_msg"
    record "changed" "$p" "$target" "$done_msg"
  fi
  return 0
}

# Marker file for a copied skill: "$skills_dir/.massa-ai-owned-<name>". Lives
# beside the skill directory, never inside it, so the copied tree stays a
# byte-perfect mirror of $SKILLS_ROOT/$name (no injected file to exclude from
# drift/idempotency comparisons). It is the safety net D3 calls for: ownership
# is decided primarily by the state file, but a lost or hand-edited state file
# must not turn every subsequent run into a false "foreign conflict" abort.
skill_marker_path() { # skill_marker_path SKILLS_DIR NAME
  printf '%s/.massa-ai-owned-%s' "$1" "$2"
}

# is_owned_target PLATFORM NAME TARGET SKILLS_DIR — 0 if massa-ai already owns
# whatever currently occupies TARGET, 1 if it is foreign (never overwritten).
# Scope: skill *directories* under $root/skills/, and nothing else.
#   - a symlink is always ours to replace, in this scope only: the caller's
#     only action on an owned target is `rm -rf` of the node (:731), and
#     removing a symlink node never touches whatever it pointed to, so the
#     user's data is unreachable from here. A symlink at a skill path is also
#     exactly the pre-copy (pre-migration) install shape.
#   - bootstrap_engine holds the opposite rule and is not a contradiction of
#     this one, because it does the one thing this scope never does: write
#     through the link into the target's own bytes. There it refuses any
#     symlink whose resolved target does not already carry our marker pair
#     (:504-517, design.md:453/:478). Two policies, two subjects — replacing a
#     node versus editing a file.
#   - a name this run's state already tracks for the platform is ours.
#   - a marker file for NAME is ours (state-loss safety net).
is_owned_target() {
  local p="$1" name="$2" target="$3" skills_dir="$4"
  [ -L "$target" ] && return 0
  case " $(state_skills_for "$p") " in
    *" $name "*) return 0 ;;
  esac
  [ -f "$(skill_marker_path "$skills_dir" "$name")" ] && return 0
  return 1
}

# ── Per-platform: apply ─────────────────────────────────────────────────────
apply_platform() {
  local p="$1"
  local root skills_dir agents_md owner
  root="$(platform_root "$p")"
  skills_dir="$root/skills"
  agents_md="$root/AGENTS.md"
  owner="$(state_owner_for "$p")"

  # Pre-pass: a foreign (not massa-ai-owned) file or directory where a copy
  # belongs aborts the whole platform BEFORE any mutation. Never overwrite
  # user data.
  local name target
  for name in $SKILL_NAMES; do
    target="$skills_dir/$name"
    if { [ -e "$target" ] || [ -L "$target" ]; } && ! is_owned_target "$p" "$name" "$target" "$skills_dir"; then
      record "error" "$p" "$target" "Conflict: $target exists and is not massa-ai-owned. Aborting to avoid overwriting user data."
      state_replace "$p" "$root" "" "repo"
      return 0
    fi
  done

  local installed="" copy_count=0 marker
  for name in $SKILL_NAMES; do
    target="$skills_dir/$name"
    local source="$SKILLS_ROOT/$name"
    marker="$(skill_marker_path "$skills_dir" "$name")"
    installed="${installed}${installed:+,}${name}"

    if [ -d "$target" ] && [ ! -L "$target" ] && diff -rq "$source" "$target" >/dev/null 2>&1; then
      continue   # already correct — idempotent
    fi

    copy_count=$((copy_count + 1))
    if [ "$DRY_RUN" = "1" ]; then
      vinfo "Would copy: $source -> $target"
      record "would-change" "$p" "$target" "Would copy: $source -> $target"
      continue
    fi
    mkdir -p "$skills_dir"
    rm -rf "$target"
    cp -R "$source" "$target"
    : > "$marker"
    vinfo "Copied: $source -> $target"
    record "changed" "$p" "$target" "Copied: $source -> $target"
  done

  # D3/PDO-09: a "plugin"-owned record means a plugin tarball install claimed
  # this platform's skills directory, not this repo installer — never remove
  # or otherwise touch what we do not own, and never drop that record either.
  # Stale: tracked in state, no longer a repo skill (SKILL_NAMES), still
  # massa-ai-owned — the --apply counterpart to check_platform's drift report
  # and uninstall_platform's removal loop (IPT-04, AC-04.1/AC-04.4/AC-04.4a).
  if [ "$owner" != "plugin" ]; then
    local stale_name stale_target stale_current stale_marker
    for stale_name in $(state_skills_for "$p"); do
      case " $SKILL_NAMES " in
        *" $stale_name "*) continue ;;
      esac
      stale_target="$skills_dir/$stale_name"
      stale_marker="$(skill_marker_path "$skills_dir" "$stale_name")"
      if [ -L "$stale_target" ]; then
        # Legacy symlink install: only remove links that resolve inside the
        # repo root (the same ownership test uninstall_platform uses).
        stale_current="$(cd "$(dirname "$stale_target")" 2>/dev/null && installer_resolve_path "$(readlink "$stale_target")")"
        case "$stale_current" in
          "$REPO_ROOT"/*|"$REPO_ROOT") ;;
          *) continue ;;
        esac
        if [ "$DRY_RUN" = "1" ]; then
          vinfo "Would remove stale symlink: $stale_target"
          record "would-change" "$p" "$stale_target" "Would remove stale symlink: $stale_target"
          continue
        fi
        rm -f "$stale_target"
        vinfo "Removed stale symlink: $stale_target"
        record "changed" "$p" "$stale_target" "Removed stale symlink: $stale_target"
      elif [ -d "$stale_target" ] && [ -f "$stale_marker" ]; then
        # Copy-based install: the per-skill marker is the ownership proof.
        if [ "$DRY_RUN" = "1" ]; then
          vinfo "Would remove stale copy: $stale_target"
          record "would-change" "$p" "$stale_target" "Would remove stale copy: $stale_target"
          continue
        fi
        rm -rf "$stale_target"
        rm -f "$stale_marker"
        vinfo "Removed stale copy: $stale_target"
        record "changed" "$p" "$stale_target" "Removed stale copy: $stale_target"
      fi
    done
  fi

  # ── Bootstrap contract and this host's load wiring ────────────────────────
  # Two writes per host, never one. The contract file is the same on every host
  # (assumption A4: one global rule state); the wiring is host-specific, and a
  # contract written without it is a file no session ever loads — the
  # `written-not-wired` state the toggle engine reports and this branch exists
  # to avoid producing.
  local mode="apply" remove_mode="remove-apply" bootstrap_changed=0
  if [ "$DRY_RUN" = "1" ]; then mode="plan"; remove_mode="remove-plan"; fi
  BOOTSTRAP_CHANGED=0

  local verdict massa_ai_md contract_file pointer_file claude_md instr_out instr_verdict
  massa_ai_md="$(contract_path "$p")"
  contract_file="$WORK_DIR/contract-$p.md"
  pointer_file="$WORK_DIR/pointer-$p.md"

  # A render failure is this host's failure, not the run's: the per-host abort
  # shape (:571-579) keeps sibling hosts running. It is never a default render —
  # render-bootstrap.ts refuses by name rather than falling back to the registry
  # defaults, because a contract that silently ignored every toggle would look
  # exactly like a working install.
  if ! bootstrap_render "$p" "$contract_file" "$pointer_file"; then
    record "error" "$p" "$massa_ai_md" "Could not render the bootstrap contract — see the named error above"
    state_replace "$p" "$root" "$installed" "repo"
    return 0
  fi

  # 1. The contract file (BST-01 AC-1, AC-2). Backed up first when an overwrite
  #    would really differ, so a hand-edited MASSA-AI.md survives the --apply
  #    that replaces it (design.md:452).
  #    The record keeps the installer's existing "bootstrap block" vocabulary
  #    rather than inventing a new one: MASSA-AI.md *is* the bootstrap block, it
  #    is simply no longer a section of AGENTS.md, and
  #    scripts/tests/test-install-skills-check.sh:135 reads that phrase as the
  #    dry-run preview's sensor.
  verdict="$(bootstrap_op "$mode" "$massa_ai_md" "$contract_file" 1)" || bootstrap_op_error $? "$massa_ai_md"
  bootstrap_note "$p" "$verdict" "$massa_ai_md" "Bootstrap block written: $massa_ai_md" "Would write bootstrap block: $massa_ai_md"

  # 2. The wiring, plus the migration of the pre-migration full block out of
  #    AGENTS.md on the two hosts whose wiring lives elsewhere (BST-05 AC-8).
  case "$p" in
    claude)
      # Claude Code reads CLAUDE.md and never AGENTS.md, which is why the
      # contract has never loaded there at all (BST-02 AC-3).
      claude_md="$root/CLAUDE.md"
      verdict="$(bootstrap_op "$mode" "$claude_md" "$CLAUDE_IMPORT_FILE")" || bootstrap_op_error $? "$claude_md"
      bootstrap_note "$p" "$verdict" "$claude_md" "Wired the contract into $claude_md" "Would wire the contract into $claude_md"
      verdict="$(bootstrap_op "$remove_mode" "$agents_md" "$BOOTSTRAP_FILE")" || bootstrap_op_error $? "$agents_md"
      bootstrap_note "$p" "$verdict" "$agents_md" "Migrated the legacy block out of $agents_md" "Would migrate the legacy block out of $agents_md"
      ;;
    codex|cursor)
      # Neither host has an import directive, so the pointer block replaces the
      # full block in place (BST-04 AC-6, AC-7; assumption A1).
      verdict="$(bootstrap_op "$mode" "$agents_md" "$pointer_file")" || bootstrap_op_error $? "$agents_md"
      bootstrap_note "$p" "$verdict" "$agents_md" "Wrote the contract pointer: $agents_md" "Would write the contract pointer: $agents_md"
      ;;
    opencode)
      # BST-03 AC-11: an unparseable config aborts this host with a named error
      # and writes no partial change to it. `record` and return, never `exit` —
      # sibling hosts still run.
      if ! instr_out="$(opencode_instructions_op "$mode" "$root" "$massa_ai_md")"; then
        record "error" "$p" "$root" "OpenCode config could not be parsed — no change was written to it"
        state_replace "$p" "$root" "$installed" "repo"
        return 0
      fi
      instr_verdict="$(printf '%s' "$instr_out" | head -n1)"
      bootstrap_note "$p" "$instr_verdict" "$root" "Wired the contract into the OpenCode instructions array" "Would wire the contract into the OpenCode instructions array"
      verdict="$(bootstrap_op "$remove_mode" "$agents_md" "$BOOTSTRAP_FILE")" || bootstrap_op_error $? "$agents_md"
      bootstrap_note "$p" "$verdict" "$agents_md" "Migrated the legacy block out of $agents_md" "Would migrate the legacy block out of $agents_md"
      ;;
  esac
  bootstrap_changed="$BOOTSTRAP_CHANGED"

  state_replace "$p" "$root" "$installed" "repo"

  # Cursor reads no global rules file: ~/.cursor/MASSA-AI.md and the pointer
  # block in ~/.cursor/AGENTS.md are written for forward-compatibility (a global
  # AGENTS.md is an open Cursor feature request), but Cursor 3.x applies global
  # rules only from Cursor Settings → Rules, and auto-reads AGENTS.md per
  # project root. Without this warning the contract silently never reaches any
  # Cursor session. Out of scope for this feature per the spec; the warning is
  # the whole mitigation, so it has to name the file that now holds the
  # contract.
  if [ "$p" = "cursor" ] && [ "$DRY_RUN" != "1" ] && [ "$JSON_OUT" = "0" ]; then
    warn "Cursor does not read ~/.cursor/AGENTS.md — it has no global rules file."
    warn "  Global: paste the contract from ~/.cursor/MASSA-AI.md into Cursor Settings → Rules."
    warn "  Per project: Cursor auto-reads AGENTS.md at the project root."
  fi

  # Summary line (quiet mode only; verbose mode prints the per-item detail)
  # Never printed in JSON mode.
  if [ "$MASSA_AI_VERBOSE" = "0" ] && [ "$JSON_OUT" = "0" ]; then
    local summary="$copy_count skills"
    if [ "$copy_count" = "0" ]; then
      [ "$bootstrap_changed" = "1" ] && summary="AGENTS.md updated" || summary="up to date"
    elif [ "$bootstrap_changed" = "1" ]; then
      summary="$copy_count skills copied, AGENTS.md bootstrap written"
    else
      summary="$copy_count skills copied"
    fi
    if [ "$DRY_RUN" = "1" ]; then
      info "$(platform_label "$p")  would: $summary"
    else
      ok "$(platform_label "$p")  $summary"
    fi
  fi
}

# ── Per-platform: uninstall ─────────────────────────────────────────────────
uninstall_platform() {
  local p="$1"
  local root skills_dir agents_md owner
  root="$(platform_root "$p")"
  skills_dir="$root/skills"
  agents_md="$root/AGENTS.md"
  owner="$(state_owner_for "$p")"

  # D3/PDO-09: a "plugin"-owned record means a plugin tarball install claimed
  # this platform's skills directory, not this repo installer — never remove
  # or otherwise touch what we do not own, and never drop that record either.
  local name target current marker remove_count=0
  if [ "$owner" != "plugin" ]; then
    for name in $(state_skills_for "$p"); do
      target="$skills_dir/$name"
      marker="$(skill_marker_path "$skills_dir" "$name")"
      if [ -L "$target" ]; then
        # Legacy symlink install: only remove links that resolve inside the
        # repo root (the same ownership test the pre-copy installer used).
        current="$(cd "$(dirname "$target")" 2>/dev/null && installer_resolve_path "$(readlink "$target")")"
        case "$current" in
          "$REPO_ROOT"/*|"$REPO_ROOT") ;;
          *) continue ;;
        esac
        remove_count=$((remove_count + 1))
        if [ "$DRY_RUN" = "1" ]; then
          vinfo "Would remove symlink: $target"
          record "would-change" "$p" "$target" "Would remove symlink: $target"
          continue
        fi
        rm -f "$target"
        vinfo "Removed symlink: $target"
        record "changed" "$p" "$target" "Removed symlink: $target"
      elif [ -d "$target" ] && [ -f "$marker" ]; then
        # Copy-based install: the per-skill marker is the ownership proof.
        remove_count=$((remove_count + 1))
        if [ "$DRY_RUN" = "1" ]; then
          vinfo "Would remove copy: $target"
          record "would-change" "$p" "$target" "Would remove copy: $target"
          continue
        fi
        rm -rf "$target"
        rm -f "$marker"
        vinfo "Removed copy: $target"
        record "changed" "$p" "$target" "Removed copy: $target"
      fi
    done
    [ "$DRY_RUN" = "1" ] || rmdir "$skills_dir" 2>/dev/null || true
  fi

  # ── Bootstrap contract and wiring: the exact inverse of apply ─────────────
  # Every artifact this feature can create is removed, and every other line of
  # the files holding them is left alone (BST-05 AC-9). Where the managed block
  # was a file's entire content the engine unlinks it rather than writing "",
  # which is what keeps a 0-byte MASSA-AI.md — or a CLAUDE.md this installer
  # created — off the uninstall residue (AC-9a, AC-9b).
  local bootstrap_changed=0
  local mode="remove-apply"
  [ "$DRY_RUN" = "1" ] && mode="remove-plan"
  BOOTSTRAP_CHANGED=0

  local verdict massa_ai_md claude_md instr_out instr_verdict instr_notes
  massa_ai_md="$(contract_path "$p")"

  # One removal covers both AGENTS.md shapes: the pre-migration full block on
  # claude/opencode and the pointer block on codex/cursor use the same pair.
  if [ -f "$agents_md" ] || [ -L "$agents_md" ]; then
    verdict="$(bootstrap_op "$mode" "$agents_md" "$BOOTSTRAP_FILE")" || bootstrap_op_error $? "$agents_md"
    bootstrap_note "$p" "$verdict" "$agents_md" "Removed the managed block from $agents_md" "Would remove the managed block from $agents_md"
  fi

  if [ -f "$massa_ai_md" ] || [ -L "$massa_ai_md" ]; then
    verdict="$(bootstrap_op "$mode" "$massa_ai_md" "$BOOTSTRAP_FILE")" || bootstrap_op_error $? "$massa_ai_md"
    bootstrap_note "$p" "$verdict" "$massa_ai_md" "Bootstrap block removed: $massa_ai_md" "Would remove bootstrap block: $massa_ai_md"
  fi

  if [ "$p" = "claude" ]; then
    claude_md="$root/CLAUDE.md"
    if [ -f "$claude_md" ] || [ -L "$claude_md" ]; then
      verdict="$(bootstrap_op "$mode" "$claude_md" "$CLAUDE_IMPORT_FILE")" || bootstrap_op_error $? "$claude_md"
      bootstrap_note "$p" "$verdict" "$claude_md" "Removed the contract import from $claude_md" "Would remove the contract import from $claude_md"
    fi
  fi

  if [ "$p" = "opencode" ]; then
    # An `instructions` entry is a bare string with nowhere to carry an
    # ownership marker, so removal matches the exact absolute path this install
    # wrote and says so — instructionsOp returns that limitation as a note and
    # it is carried into the report rather than left implicit (design.md:440).
    if instr_out="$(opencode_instructions_op "$mode" "$root" "$massa_ai_md")"; then
      instr_verdict="$(printf '%s' "$instr_out" | head -n1)"
      instr_notes="$(printf '%s' "$instr_out" | tail -n +2 | tr '\n' ';')"
      bootstrap_note "$p" "$instr_verdict" "$root" \
        "Removed the contract from the OpenCode instructions array — $instr_notes" \
        "Would remove the contract from the OpenCode instructions array — $instr_notes"
    else
      record "error" "$p" "$root" "OpenCode config could not be parsed — its instructions entry was left in place"
    fi
  fi
  bootstrap_changed="$BOOTSTRAP_CHANGED"

  # Only drop the platform record when this installer actually owns it —
  # dropping a plugin-owned record here would let a subsequent apply overwrite
  # a tarball install this run never touched.
  [ "$owner" = "plugin" ] || state_delete "$p"

  # Summary line (quiet mode only; verbose mode prints the per-item detail)
  # Never printed in JSON mode.
  if [ "$MASSA_AI_VERBOSE" = "0" ] && [ "$JSON_OUT" = "0" ]; then
    local summary="$remove_count skills"
    if [ "$remove_count" = "0" ]; then
      [ "$bootstrap_changed" = "1" ] && summary="AGENTS.md updated" || summary="nothing to remove"
    elif [ "$bootstrap_changed" = "1" ]; then
      summary="$remove_count skills removed, AGENTS.md bootstrap removed"
    else
      summary="$remove_count skills removed"
    fi
    if [ "$DRY_RUN" = "1" ]; then
      info "$(platform_label "$p")  would: $summary"
    else
      ok "$(platform_label "$p")  $summary"
    fi
  fi
}

# ── Per-platform: check ─────────────────────────────────────────────────────
check_platform() {
  local p="$1"
  local root skills_dir owner
  root="$(platform_root "$p")"
  skills_dir="$root/skills"
  owner="$(state_owner_for "$p")"

  local drift_count=0
  # A "plugin"-owned platform is not this installer's to check — its skills
  # directory belongs to a plugin tarball install, so an absent repo copy
  # there is correct, not drift.
  if [ "$owner" != "plugin" ]; then
    local name target source current marker
    for name in $SKILL_NAMES; do
      target="$skills_dir/$name"
      source="$SKILLS_ROOT/$name"
      if [ ! -L "$target" ] && [ ! -e "$target" ]; then
        vinfo "Missing skill copy: $name"
        drift_count=$((drift_count + 1))
        record "drift" "$p" "$target" "Missing skill copy: $name"
        continue
      fi
      if [ -L "$target" ]; then
        vinfo "$name is a symlink (legacy install) — expected a real copy"
        drift_count=$((drift_count + 1))
        record "drift" "$p" "$target" "$name is a symlink (legacy install) — expected a real copy"
        continue
      fi
      if [ ! -d "$target" ]; then
        vinfo "$name exists but is not a directory"
        drift_count=$((drift_count + 1))
        record "drift" "$p" "$target" "$name exists but is not a directory"
        continue
      fi
      if ! diff -rq "$source" "$target" >/dev/null 2>&1; then
        vinfo "$name copy differs from $source"
        drift_count=$((drift_count + 1))
        record "drift" "$p" "$target" "$name copy differs from $source"
      fi
    done

    # Stale: tracked in state, no longer a repo skill, still massa-ai-owned.
    for name in $(state_skills_for "$p"); do
      case " $SKILL_NAMES " in
        *" $name "*) continue ;;
      esac
      target="$skills_dir/$name"
      marker="$(skill_marker_path "$skills_dir" "$name")"
      if [ -L "$target" ]; then
        current="$(cd "$(dirname "$target")" 2>/dev/null && installer_resolve_path "$(readlink "$target")")"
        case "$current" in
          "$REPO_ROOT"/*|"$REPO_ROOT")
            vinfo "Stale symlink: $name (skill no longer exists)"
            drift_count=$((drift_count + 1))
            record "drift" "$p" "$target" "Stale symlink: $name (skill no longer exists)"
            ;;
        esac
      elif [ -d "$target" ] && [ -f "$marker" ]; then
        vinfo "Stale copy: $name (skill no longer exists)"
        drift_count=$((drift_count + 1))
        record "drift" "$p" "$target" "Stale copy: $name (skill no longer exists)"
      fi
    done
  fi

  # Double-surface probe (PRT-08, claude only): a repo-owned skills install
  # ("$owner" = "repo") plus an enabled massa-ai@massa-ai plugin in
  # settings.json registers every skill/agent/command twice. Read-only — the
  # probe only reads state already loaded plus settings.json. An absent state
  # record (owner "") or absent/malformed settings.json is not a double
  # surface: unknown owner ≠ double surface (spec edge cases).
  if [ "$p" = "claude" ] && [ "$owner" = "repo" ]; then
    local settings_file plugin_enabled
    settings_file="$root/settings.json"
    plugin_enabled="$("$RUNNER" - "$settings_file" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
let enabled = "0";
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    data && typeof data === "object" && !Array.isArray(data) &&
    data.enabledPlugins && typeof data.enabledPlugins === "object" &&
    data.enabledPlugins["massa-ai@massa-ai"] === true
  ) {
    enabled = "1";
  }
} catch { /* missing or malformed settings.json → not enabled */ }
process.stdout.write(enabled);
NODE
)"
    if [ "$plugin_enabled" = "1" ]; then
      vinfo "Double registration surface: install-state.json records skillsOwner \"repo\" and $settings_file enables massa-ai@massa-ai"
      drift_count=$((drift_count + 1))
      record "drift" "$p" "$settings_file" "Double registration surface: install-state.json records skillsOwner \"repo\" and settings.json enables massa-ai@massa-ai"
    fi
  fi

  # Summary line (quiet mode only; verbose mode prints the per-item detail)
  # Never printed in JSON mode.
  if [ "$MASSA_AI_VERBOSE" = "0" ] && [ "$JSON_OUT" = "0" ]; then
    if [ "$drift_count" = "0" ]; then
      ok "$(platform_label "$p")  up to date"
    else
      warn "$(platform_label "$p")  $drift_count issues found"
    fi
  fi
}

# ── Run ─────────────────────────────────────────────────────────────────────
for p in $ACTIVE_PLATFORMS; do
  case "$ACTION" in
    apply|dry-run) apply_platform "$p" ;;
    uninstall) uninstall_platform "$p" ;;
    check) check_platform "$p" ;;
  esac
done

# ── State: save (never on dry-run or check) ─────────────────────────────────
if [ "$ACTION" = "apply" ] || [ "$ACTION" = "uninstall" ]; then
  mkdir -p "$(dirname "$STATE_PATH")"
  "$RUNNER" - "$STATE_PATH" "$REPO_ROOT" "$STATE_OUT" <<'NODE'
const fs = require("fs");
const [, , file, repoRoot, tsvFile] = process.argv;
// stdin carries this script (node -), so the TSV arrives as a file path.
const raw = fs.readFileSync(tsvFile, "utf8");
const platforms = {};
for (const line of raw.split("\n")) {
  if (!line.trim()) continue;
  const [p, root, csv, owner, pluginVersion, pluginInstalledAt, installRoute, modelProfileProfile, modelProfileSwitchedAt] =
    line.split("\t");
  const rec = {
    root,
    skills: csv ? csv.split(",").filter(Boolean) : [],
    skillsOwner: owner === "plugin" ? "plugin" : "repo",
  };
  // Plugin records are pass-through (design C5): re-attach only a complete
  // record. An absent subfield must round-trip as absent — never as
  // {version: "", installedAt: ""}.
  if (pluginVersion && pluginInstalledAt) {
    rec.plugin = { version: pluginVersion, installedAt: pluginInstalledAt };
  }
  // installRoute + modelProfile (T10, MPS-03): same pass-through discipline.
  // An absent modelProfile must round-trip as absent — never as
  // {profile: "", switchedAt: ""}.
  if (installRoute) {
    rec.installRoute = installRoute;
  }
  if (modelProfileProfile && modelProfileSwitchedAt) {
    rec.modelProfile = { profile: modelProfileProfile, switchedAt: modelProfileSwitchedAt };
  }
  platforms[p] = rec;
}
fs.writeFileSync(file, JSON.stringify({ version: 2, repository: repoRoot, platforms }, null, 2) + "\n");
NODE
fi

# ── Output ──────────────────────────────────────────────────────────────────
if [ "$JSON_OUT" = "1" ]; then
  "$RUNNER" - "$ACTION" "$DRY_RUN" "$ACTIVE_PLATFORMS" "$RESULTS_FILE" "$TOOLS_FILE" <<'NODE'
const fs = require("fs");
const [, , action, dryRun, platformList, resultsFile, toolsFile] = process.argv;

function rows(file) {
  let raw = "";
  try { raw = fs.readFileSync(file, "utf8"); } catch { /* empty */ }
  return raw.split("\n").filter((l) => l.trim()).map((l) => l.split("\t"));
}

const results = rows(resultsFile).map(([status, platform, target, ...rest]) => ({
  platform, target, status, message: rest.join("\t"),
}));
const installed = rows(toolsFile).map(([platform, executable, p]) => ({ platform, executable, path: p }));

const hasError = results.some((r) => r.status === "error");
const hasDrift = results.some((r) => r.status === "drift");
const changed = results.some((r) => r.status === "changed" || r.status === "would-change");
const status = hasError ? "error" : hasDrift ? "drift" : changed ? (dryRun === "1" ? "would-change" : "changed") : "ok";

console.log(JSON.stringify({
  status,
  action,
  platforms: platformList.split(" ").filter(Boolean),
  installed_tools: installed,
  results,
}, null, 2));
NODE
else
  # Verbose mode: print the original detailed output
  if [ "$MASSA_AI_VERBOSE" = "1" ]; then
    installed_desc=""
    while IFS=$'\t' read -r _p exe abs; do
      [ -n "${exe:-}" ] || continue
      installed_desc="${installed_desc}${installed_desc:+, }${exe} (${abs})"
    done < "$TOOLS_FILE"
    vecho "Installed tools: ${installed_desc:-none}"
    while IFS=$'\t' read -r status plat target message; do
      [ -n "${status:-}" ] || continue
      vinfo "[${status}] $(platform_label "$plat") ${target} — ${message}"
    done < "$RESULTS_FILE"
  fi
fi

# ── Exit codes ──────────────────────────────────────────────────────────────
if cut -f1 "$RESULTS_FILE" | grep -qx "error"; then
  exit 1
fi
if [ "$ACTION" = "check" ] && cut -f1 "$RESULTS_FILE" | grep -qx "drift"; then
  exit 1
fi
exit 0
