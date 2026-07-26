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
STATE_IN="$WORK_DIR/state-in.tsv"      # platform<TAB>root<TAB>csv-skills
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
    // repo-owned symlink install.
    out.push([p, rootFor(p), "", "repo"]);
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
    out.push([p, rec.root, [...new Set(skills)].join(","), owner]);
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

state_replace() {
  local p="$1" root="$2" csv="$3" owner="${4:-repo}" tmp="$WORK_DIR/state.tmp"
  grep -v "^$p$TAB" "$STATE_OUT" > "$tmp" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\n' "$p" "$root" "$csv" "$owner" >> "$tmp"
  mv "$tmp" "$STATE_OUT"
}

state_delete() {
  local p="$1" tmp="$WORK_DIR/state.tmp"
  grep -v "^$p$TAB" "$STATE_OUT" > "$tmp" 2>/dev/null || true
  mv "$tmp" "$STATE_OUT"
}

# ── Bootstrap block edit (plan | apply | remove-plan | remove-apply) ────────
bootstrap_op() {
  "$RUNNER" - "$1" "$2" "$BOOTSTRAP_FILE" "$BOOTSTRAP_START" "$BOOTSTRAP_END" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , mode, target, blockFile, START, END] = process.argv;
const desired = fs.readFileSync(blockFile, "utf8");

let text = "";
try {
  text = fs.readFileSync(target, "utf8");
} catch { /* no file yet */ }

const starts = text.split(START).length - 1;
const ends = text.split(END).length - 1;
if (starts !== ends || starts > 1) {
  console.error("Managed markers are incomplete or duplicated");
  process.exit(2);
}

function replaceBlock() {
  if (starts === 1) {
    const s = text.indexOf(START);
    const e = text.indexOf(END, s) + END.length;
    return text.slice(0, s) + desired + text.slice(e);
  }
  if (!text.trim()) return desired + "\n";
  return text.trimEnd() + "\n\n" + desired + "\n";
}

function removeBlock() {
  if (starts === 0) return text;
  const s = text.indexOf(START);
  const e = text.indexOf(END, s) + END.length;
  const before = text.slice(0, s);
  let after = text.slice(e);
  if (before.endsWith("\n\n") && after.startsWith("\n")) after = after.slice(1);
  const result = (before + after).trim();
  return result ? result + "\n" : "";
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
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, replaceBlock());
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
fs.writeFileSync(target, removeBlock());
process.stdout.write("change");
NODE
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
#   - a symlink is always ours to replace: removing a symlink node never
#     touches whatever it pointed to, and a symlink here is exactly the
#     pre-copy (pre-migration) install shape.
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
  local root skills_dir agents_md
  root="$(platform_root "$p")"
  skills_dir="$root/skills"
  agents_md="$root/AGENTS.md"

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

  local mode="apply" bootstrap_changed=0
  [ "$DRY_RUN" = "1" ] && mode="plan"
  local verdict
  verdict="$(bootstrap_op "$mode" "$agents_md")" || integration_error "Managed markers are incomplete or duplicated in $agents_md"
  if [ "$verdict" = "change" ]; then
    bootstrap_changed=1
    if [ "$DRY_RUN" = "1" ]; then
      vinfo "Would write bootstrap block"
      record "would-change" "$p" "$agents_md" "Would write bootstrap block"
    else
      vinfo "Bootstrap block written"
      record "changed" "$p" "$agents_md" "Bootstrap block written"
    fi
  fi

  state_replace "$p" "$root" "$installed" "repo"

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

  local bootstrap_changed=0
  if [ -f "$agents_md" ]; then
    local mode="remove-apply"
    [ "$DRY_RUN" = "1" ] && mode="remove-plan"
    local verdict
    verdict="$(bootstrap_op "$mode" "$agents_md")" || integration_error "Managed markers are incomplete or duplicated in $agents_md"
    if [ "$verdict" = "change" ]; then
      bootstrap_changed=1
      if [ "$DRY_RUN" = "1" ]; then
        vinfo "Would remove bootstrap block"
        record "would-change" "$p" "$agents_md" "Would remove bootstrap block"
      else
        vinfo "Bootstrap block removed"
        record "changed" "$p" "$agents_md" "Bootstrap block removed"
      fi
    fi
  fi

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
  const [p, root, csv, owner] = line.split("\t");
  platforms[p] = {
    root,
    skills: csv ? csv.split(",").filter(Boolean) : [],
    skillsOwner: owner === "plugin" ? "plugin" : "repo",
  };
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
