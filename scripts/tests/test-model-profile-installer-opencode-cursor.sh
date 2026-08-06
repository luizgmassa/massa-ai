#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-model-profile-installer-opencode-cursor.sh
#
# T9 (MPS-04, design Component 3, F3): OpenCode installer re-apply
# (materialized variant tree + recorded-profile SYMLINK TARGETS — actives
# stay symlinks) and Cursor installRoute-only recording (switch always skips
# Cursor). Runs the REAL apps/{opencode,cursor}-plugin/install.sh against a
# scratch $TARGET_HOME; the real $HOME is never touched.
#
# Sections:
#   1. opencode: installRoute written; modelProfile never written by the installer
#   2. opencode: recorded profile honored via symlink repoint (not a copy)
#   3. opencode: recorded-but-missing profile → loud fallback + default symlink
#   4. opencode: variant tree materialized under plugins/massa-ai/agent-profiles/
#   5. opencode F3: switch (simulated repoint) -> re-run install.sh -> agent updates
#   6. cursor: installRoute written; modelProfile never written; no variant tree
#
# Usage: bash scripts/tests/test-model-profile-installer-opencode-cursor.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"
# shellcheck source=scripts/lib/installer-shared.sh
source "${PROJECT_ROOT}/scripts/lib/installer-shared.sh"

# Normalized (no double slash — macOS's $TMPDIR already ends in "/", and the
# installer's own path resolution goes through `cd && pwd`, which collapses
# that; a raw string-concatenated expectation built from an un-normalized
# $ROOT would mismatch on bytes that are the same real path).
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-mps-oc-cursor.XXXXXX")"
ROOT="$(cd "$ROOT" && pwd)"

# Section 5 (F3) mutates the REAL, checked-in bundle file
# apps/opencode-plugin/agent-profiles/work/massa-ai-builder.md in place (to
# prove content really flows through an install.sh re-run, not a synthetic
# scratch copy that would also have to fake this script's own REPO_ROOT
# resolution). WORK_VARIANT_BAK is set once section 5 is reached; the trap is
# a no-op restore until then, and unconditional after — including on any
# earlier failure in this file.
WORK_VARIANT_BAK=""
WORK_VARIANT="$PROJECT_ROOT/apps/opencode-plugin/agent-profiles/work/massa-ai-builder.md"
restore_work_variant() {
  [ -n "$WORK_VARIANT_BAK" ] && [ -f "$WORK_VARIANT_BAK" ] && cp "$WORK_VARIANT_BAK" "$WORK_VARIANT"
}
trap 'restore_work_variant; rm -rf "$ROOT"' EXIT

RUNNER="$(command -v node || command -v bun)"
# T5-T8/UGB-05: both installers now regenerate their bundle in checkout
# context before anything else runs, and that step requires bun specifically
# (the generator scripts are Bun scripts) regardless of which runner the line
# above picked for JSON manipulation.
BUN_BIN="$(command -v bun)"
BASE_PATH="/usr/bin:/bin"
SAFE_PATH="$(dirname "$RUNNER"):$(dirname "$BUN_BIN"):$BASE_PATH"

if [[ ! -f "$PROJECT_ROOT/apps/opencode-plugin/dist/index.js" ]]; then
  echo "SKIP: apps/opencode-plugin/dist/index.js not built — run 'bun run build' first"
  exit 0
fi

state_field() { # state_field STATE_FILE HOST JSONPATH-ish → value or ""
  "$RUNNER" - "$1" "$2" "$3" <<'NODE'
const fs = require("fs");
const [, , file, host, path] = process.argv;
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let cur = data && data.platforms && data.platforms[host];
  for (const seg of path.split(".")) {
    if (cur == null) break;
    cur = cur[seg];
  }
  process.stdout.write(cur === undefined || cur === null ? "" : String(cur));
} catch {
  process.stdout.write("");
}
NODE
}

seed_state() { # seed_state HOME — writes stdin as the install state
  mkdir -p "$1/.config/massa-ai"
  cat > "$1/.config/massa-ai/install-state.json"
}

# T5-T8/UGB-05: both installers now regenerate their bundle in checkout
# context before anything else runs. This suite deliberately mutates the
# REAL, checked-in apps/opencode-plugin/agent-profiles/work/massa-ai-builder.md
# in Section 5 to prove content flows through install.sh's OWN copy logic
# (F3) — an unconditional regeneration would immediately overwrite that
# mutation with the deterministic generator output before the copy step ever
# ran, silently turning the "not frozen" assertion vacuous (both sides would
# reflect the same regenerated content regardless of the injected marker).
# This suite's concern is installer re-apply behavior on an assumed-fresh
# bundle, not UGB-05..08 generation-on-demand, so skip it here.
run_opencode() { # run_opencode HOME [extra args...] → OUT, RC
  local home="$1"; shift
  OUT="$(PATH="$SAFE_PATH" HOME="$home" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
    bash "$PROJECT_ROOT/apps/opencode-plugin/install.sh" --user "$@" 2>&1)"
  RC=$?
}

run_cursor() { # run_cursor HOME [extra args...] → OUT, RC
  local home="$1"; shift
  OUT="$(PATH="$SAFE_PATH" HOME="$home" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 \
    bash "$PROJECT_ROOT/apps/cursor-plugin/install.sh" --user "$@" 2>&1)"
  RC=$?
}

DEFAULT_ACTIVE="$PROJECT_ROOT/apps/opencode-plugin/agents/massa-ai-builder.md"
# WORK_VARIANT is set once, above, before the restore trap is installed.

echo ""
echo "=== opencode ==="

# ── Section 1: installRoute written; never modelProfile ──────────────────
echo ""
echo "1. installRoute written; modelProfile untouched (F1)"
H="$ROOT/1"; mkdir -p "$H/.config/opencode"
STATE="$H/.config/massa-ai/install-state.json"
run_opencode "$H"
assert_eq "opencode fresh install → exit 0" "$RC" "0"
assert_eq "opencode always-file → installRoute=file" "$(state_field "$STATE" opencode installRoute)" "file"
assert_eq "opencode never writes modelProfile on a fresh install" \
  "$(state_field "$STATE" opencode modelProfile.profile)" ""

# ── Section 2: recorded profile honored via symlink repoint ──────────────
echo ""
echo "2. recorded profile honored — active symlink repoints into agent-profiles/work/"
H="$ROOT/2"; mkdir -p "$H/.config/opencode"
STATE="$H/.config/massa-ai/install-state.json"
seed_state "$H" <<JSON
{ "version": 2, "platforms": { "opencode": { "root": "$H/.config/opencode", "skills": [], "skillsOwner": "plugin",
    "modelProfile": { "profile": "work", "switchedAt": "2026-01-01T00:00:00Z" } } } }
JSON
run_opencode "$H"
assert_eq "opencode recorded-profile install → exit 0" "$RC" "0"
assert_contains "opencode re-apply log line names the profile" "$OUT" "re-applying recorded model profile 'work'"
LINK="$H/.config/opencode/agents/massa-ai-builder.md"
if [ -L "$LINK" ]; then ok "opencode active agent is a symlink"; else fail "opencode active agent is a symlink  →  not a symlink"; fi
TARGET_PATH="$(readlink "$LINK")"
assert_eq "opencode symlink target is the materialized work variant" \
  "$TARGET_PATH" "$H/.config/opencode/plugins/massa-ai/agent-profiles/work/massa-ai-builder.md"
if [ -f "$LINK" ] && cmp -s "$LINK" "$WORK_VARIANT"; then
  ok "opencode symlink dereferences to work variant content"
else
  fail "opencode symlink dereferences to work variant content  →  differs or missing"
fi
if ! cmp -s "$WORK_VARIANT" "$DEFAULT_ACTIVE"; then
  ok "opencode sanity: work variant differs from the shipped (balanced) default"
else
  fail "opencode sanity: work variant differs from the shipped (balanced) default  →  identical, test would be vacuous"
fi
assert_eq "opencode installer never wrote modelProfile itself" \
  "$(state_field "$STATE" opencode modelProfile.profile)" "work"

# ── Section 3: recorded-but-missing profile → loud fallback ──────────────
echo ""
echo "3. recorded-but-missing profile → loud fallback line + default symlink"
H="$ROOT/3"; mkdir -p "$H/.config/opencode"
STATE="$H/.config/massa-ai/install-state.json"
seed_state "$H" <<JSON
{ "version": 2, "platforms": { "opencode": { "root": "$H/.config/opencode", "skills": [], "skillsOwner": "plugin",
    "modelProfile": { "profile": "does_not_exist", "switchedAt": "2026-01-01T00:00:00Z" } } } }
JSON
run_opencode "$H"
assert_eq "opencode missing-profile install → exit 0" "$RC" "0"
assert_contains "opencode missing-profile → loud fallback line" "$OUT" \
  "recorded model profile 'does_not_exist' is not in this bundle — falling back to the default profile"
LINK="$H/.config/opencode/agents/massa-ai-builder.md"
resolved_default="$(cd "$(dirname "$DEFAULT_ACTIVE")" && pwd)/$(basename "$DEFAULT_ACTIVE")"
assert_eq "opencode missing-profile → symlink target is the shipped default" \
  "$(readlink "$LINK")" "$resolved_default"

# ── Section 4: variant tree materialized ──────────────────────────────────
echo ""
echo "4. variant tree materialized under plugins/massa-ai/agent-profiles/"
H="$ROOT/4"; mkdir -p "$H/.config/opencode"
run_opencode "$H"
assert_eq "opencode install → exit 0" "$RC" "0"
VARIANT_DEST="$H/.config/opencode/plugins/massa-ai/agent-profiles"
assert_file "opencode variant tree: balanced/massa-ai-builder.md materialized" "$VARIANT_DEST/balanced/massa-ai-builder.md"
assert_file "opencode variant tree: work/massa-ai-builder.md materialized" "$VARIANT_DEST/work/massa-ai-builder.md"
if cmp -s "$VARIANT_DEST/work/massa-ai-builder.md" "$WORK_VARIANT"; then
  ok "opencode materialized work variant content == bundle work variant content"
else
  fail "opencode materialized work variant content == bundle work variant content  →  differs"
fi

# ── Section 5: F3 — switch (simulated repoint) -> upgrade -> agent updates ─
echo ""
echo "5. F3: switch (simulate: repoint symlink to a variant file) -> re-run install.sh -> agent still updates"
H="$ROOT/5"; mkdir -p "$H/.config/opencode"
STATE="$H/.config/massa-ai/install-state.json"
# (a) Fresh install with the default profile — active symlinks point at the
#     bundle's agents/ dir, matching pre-existing behavior.
run_opencode "$H"
assert_eq "F3 fresh install → exit 0" "$RC" "0"
LINK="$H/.config/opencode/agents/massa-ai-builder.md"
DEFAULT_RESOLVED="$(cd "$(dirname "$DEFAULT_ACTIVE")" && pwd)/$(basename "$DEFAULT_ACTIVE")"
assert_eq "F3 pre-switch: symlink targets the shipped default" "$(readlink "$LINK")" "$DEFAULT_RESOLVED"

# (b) Simulate a switch exactly as the engine's repointOpencodeVariant would:
#     repoint the symlink at the materialized variant file (already refreshed
#     under plugins/massa-ai/agent-profiles/work/ by step (a)'s install), and
#     record the profile — the two effects a real `profile_set` produces.
WORK_MATERIALIZED="$H/.config/opencode/plugins/massa-ai/agent-profiles/work/massa-ai-builder.md"
assert_file "F3: materialized work variant exists to repoint into" "$WORK_MATERIALIZED"
ln -sfn "$WORK_MATERIALIZED" "$LINK"
seed_state "$H" <<JSON
{ "version": 2, "platforms": { "opencode": { "root": "$H/.config/opencode", "skills": [], "skillsOwner": "plugin",
    "installRoute": "file",
    "modelProfile": { "profile": "work", "switchedAt": "2026-01-01T00:00:01Z" } } } }
JSON
assert_eq "F3: simulated switch — symlink now targets the work variant" "$(readlink "$LINK")" "$WORK_MATERIALIZED"

# (c) Mutate the REAL, checked-in bundle file in place — to prove content
#     genuinely flows through a re-run rather than the assertion passing
#     vacuously on unchanged bytes. A scratch COPY of the plugin dir cannot be
#     used here: install.sh resolves REPO_ROOT as $SCRIPT_DIR/../.., and a
#     copy elsewhere on disk breaks that resolution (the build guard, hooks
#     path, etc. would all point at a nonexistent tree). Restored
#     unconditionally by the trap installed at the top of this file.
WORK_VARIANT_BAK="$ROOT/work-variant-original.md"
cp "$WORK_VARIANT" "$WORK_VARIANT_BAK"
printf '\n<!-- F3 upgrade marker -->\n' >> "$WORK_VARIANT"
if ! cmp -s "$WORK_VARIANT" "$WORK_VARIANT_BAK"; then
  ok "F3 sanity: bundle content actually changed"
else
  fail "F3 sanity: bundle content actually changed  →  mutation had no effect"
fi

# (d) Re-run the REAL install.sh (upgrade), now reading the mutated bundle
#     content. The pre-flight guard must treat the existing entry as owned
#     (it is a symlink, regardless of its current target) and refresh it —
#     this is the exact property F3 exists to prove: no normalize-to-copy
#     froze it.
run_opencode "$H"
assert_eq "F3 upgrade re-run → exit 0" "$RC" "0"
assert_contains "F3 upgrade re-applies the recorded profile" "$OUT" "re-applying recorded model profile 'work'"
if [ -L "$LINK" ]; then ok "F3 upgrade: agent is still a symlink (not normalized to a copy)"; else fail "F3 upgrade: agent is still a symlink (not normalized to a copy)  →  became a regular file"; fi
NEW_WORK_MATERIALIZED="$H/.config/opencode/plugins/massa-ai/agent-profiles/work/massa-ai-builder.md"
if cmp -s "$LINK" "$WORK_VARIANT"; then
  ok "F3 upgrade: agent file content reflects the newer bundle's work variant (not frozen)"
else
  fail "F3 upgrade: agent file content reflects the newer bundle's work variant (not frozen)  →  stale content"
fi
assert_file "F3 upgrade: materialized variant tree itself was refreshed" "$NEW_WORK_MATERIALIZED"

# (e) Restore the real bundle file immediately — do not rely solely on the
#     EXIT trap, so the rest of this suite (and any suite run after it in the
#     same process) never observes the mutated content.
restore_work_variant
WORK_VARIANT_BAK=""

echo ""
echo "=== cursor ==="

# ── Section 6: installRoute written; never modelProfile; no variant tree ──
echo ""
echo "6. installRoute written; modelProfile untouched; no agent-profiles variant tree (switch always skips cursor)"
H="$ROOT/6"; mkdir -p "$H/.cursor"
STATE="$H/.config/massa-ai/install-state.json"
run_cursor "$H"
assert_eq "cursor fresh install → exit 0" "$RC" "0"
# AD-017/T6 (plugin-architecture-unification): cursor's installRoute is its
# own "bridge" | "local" vocabulary, not claude's "file" | "marketplace". No
# ~/.claude/plugins/installed_plugins.json exists in this sandboxed HOME, so
# the bridge probe reports absent and the installer falls back to "local".
assert_eq "cursor local-fallback → installRoute=local" "$(state_field "$STATE" cursor installRoute)" "local"
assert_eq "cursor never writes modelProfile on a fresh install" \
  "$(state_field "$STATE" cursor modelProfile.profile)" ""
assert_no_file "cursor: no agent-profiles variant tree is installed" \
  "$H/.cursor/plugins/local/massa-ai/agent-profiles"

# installRoute survives a second install (skills-bundling whole-record
# replace does not clobber it) — the same round-trip property T8 fixed for
# claude/codex, exercised here for cursor's own writer.
run_cursor "$H"
assert_eq "cursor re-run → exit 0" "$RC" "0"
assert_eq "cursor installRoute survives a second install" "$(state_field "$STATE" cursor installRoute)" "local"

summary "model-profile-installer-opencode-cursor"
