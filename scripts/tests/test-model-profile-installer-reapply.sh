#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-model-profile-installer-reapply.sh
#
# T8 (MPS-04, design Component 3, F1): claude + codex installer re-apply +
# installRoute recording. Runs the REAL apps/{claude,codex}-plugin/install.sh
# against a scratch $TARGET_HOME; the real $HOME is never touched.
# MASSA_AI_SKIP_PLUGIN_REGISTRY=1 pins both installers to their file route
# (claude: PLUGIN_ROUTE=0; codex: agents always land in $AGENTS_DIR regardless
# of registry) so the assertions never depend on a host CLI being present.
#
# Sections:
#   1. installRoute written on every install path, never modelProfile
#   2. recorded profile honored (active set comes from agent-profiles/<p>/)
#   3. recorded-but-missing profile: loud fallback line + default installed
#   4. variant tree installed/refreshed alongside the active set
#
# Usage: bash scripts/tests/test-model-profile-installer-reapply.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"
# shellcheck source=scripts/lib/installer-shared.sh
source "${PROJECT_ROOT}/scripts/lib/installer-shared.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-mps-reapply.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

RUNNER="$(command -v node || command -v bun)"
BASE_PATH="/usr/bin:/bin"
SAFE_PATH="$(dirname "$RUNNER"):$BASE_PATH"

state_field() { # state_field STATE_FILE HOST JSONPATH-ish → value or ""
  # JSONPATH-ish: dot-separated keys under platforms[host], e.g. "installRoute"
  # or "modelProfile.profile".
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

run_installer() { # run_installer HOST HOME [extra args...] → OUT, RC
  local host="$1" home="$2"; shift 2
  OUT="$(MASSA_AI_SKIP_PLUGIN_REGISTRY=1 PATH="$SAFE_PATH" HOME="$home" \
    bash "$PROJECT_ROOT/apps/${host}-plugin/install.sh" --user "$@" 2>&1)"
  RC=$?
}

for host in claude codex; do
  case "$host" in
    claude) cfg_dir=".claude"; ext="md" ;;
    codex)  cfg_dir=".codex";  ext="toml" ;;
  esac
  BUNDLE_AGENT_PROFILES="$PROJECT_ROOT/apps/${host}-plugin/agent-profiles"
  STATE_HOST="$host"

  echo ""
  echo "=== $host ==="

  # ── Section 1: installRoute on every install path, never modelProfile ────
  echo ""
  echo "1.$host installRoute written; modelProfile untouched (F1)"
  H="$ROOT/1-$host"; mkdir -p "$H/$cfg_dir"
  STATE="$H/.config/massa-ai/install-state.json"
  run_installer "$host" "$H"
  assert_eq "$host fresh install → exit 0" "$RC" "0"
  if [ "$host" = "claude" ]; then
    assert_eq "$host file-route → installRoute=file" "$(state_field "$STATE" "$STATE_HOST" installRoute)" "file"
  else
    assert_eq "$host always-file → installRoute=file" "$(state_field "$STATE" "$STATE_HOST" installRoute)" "file"
  fi
  assert_eq "$host never writes modelProfile on a fresh install" \
    "$(state_field "$STATE" "$STATE_HOST" modelProfile.profile)" ""

  # ── Section 2: recorded profile honored ───────────────────────────────────
  echo ""
  echo "2.$host recorded profile honored — active set comes from agent-profiles/work/"
  H="$ROOT/2-$host"; mkdir -p "$H/$cfg_dir"
  STATE="$H/.config/massa-ai/install-state.json"
  seed_state "$H" <<JSON
{ "version": 2, "platforms": { "$host": { "root": "$H/$cfg_dir", "skills": [], "skillsOwner": "plugin",
    "modelProfile": { "profile": "work", "switchedAt": "2026-01-01T00:00:00Z" } } } }
JSON
  run_installer "$host" "$H"
  assert_eq "$host recorded-profile install → exit 0" "$RC" "0"
  assert_contains "$host re-apply log line names the profile" "$OUT" "re-applying recorded model profile 'work'"
  INSTALLED="$H/$cfg_dir/agents/massa-ai-builder.$ext"
  WORK_VARIANT="$BUNDLE_AGENT_PROFILES/work/massa-ai-builder.$ext"
  DEFAULT_ACTIVE="$PROJECT_ROOT/apps/${host}-plugin/agents/massa-ai-builder.$ext"
  assert_file "$host installed active file exists" "$INSTALLED"
  if cmp -s "$INSTALLED" "$WORK_VARIANT"; then
    ok "$host installed content == work variant content"
  else
    fail "$host installed content == work variant content  →  differs"
  fi
  # Sanity: 'work' actually differs from the shipped default for this file —
  # otherwise the byte-match above would pass vacuously.
  if ! cmp -s "$WORK_VARIANT" "$DEFAULT_ACTIVE"; then
    ok "$host sanity: work variant differs from the shipped (balanced) default"
  else
    fail "$host sanity: work variant differs from the shipped (balanced) default  →  identical, test would be vacuous"
  fi
  assert_eq "$host installer never wrote modelProfile itself" \
    "$(state_field "$STATE" "$STATE_HOST" modelProfile.profile)" "work"
  # ^ still "work": the installer must not have TOUCHED the pre-existing
  # record (added, removed, or overwritten it) — same value it seeded with.

  # ── Section 3: recorded-but-missing profile → loud fallback ──────────────
  echo ""
  echo "3.$host recorded-but-missing profile → loud fallback line + default installed"
  H="$ROOT/3-$host"; mkdir -p "$H/$cfg_dir"
  STATE="$H/.config/massa-ai/install-state.json"
  seed_state "$H" <<JSON
{ "version": 2, "platforms": { "$host": { "root": "$H/$cfg_dir", "skills": [], "skillsOwner": "plugin",
    "modelProfile": { "profile": "does_not_exist", "switchedAt": "2026-01-01T00:00:00Z" } } } }
JSON
  run_installer "$host" "$H"
  assert_eq "$host missing-profile install → exit 0" "$RC" "0"
  assert_contains "$host missing-profile → loud fallback line" "$OUT" \
    "recorded model profile 'does_not_exist' is not in this bundle — falling back to the default profile"
  INSTALLED="$H/$cfg_dir/agents/massa-ai-builder.$ext"
  if cmp -s "$INSTALLED" "$DEFAULT_ACTIVE"; then
    ok "$host missing-profile → installed content == shipped default"
  else
    fail "$host missing-profile → installed content == shipped default  →  differs"
  fi

  # ── Section 4: variant tree installed/refreshed ───────────────────────────
  echo ""
  echo "4.$host variant tree installed alongside the active set"
  H="$ROOT/4-$host"; mkdir -p "$H/$cfg_dir"
  run_installer "$host" "$H"
  assert_eq "$host install → exit 0" "$RC" "0"
  if [ "$host" = "claude" ]; then
    VARIANT_DEST="$H/$cfg_dir/massa-ai/agent-profiles"
  else
    VARIANT_DEST="$H/$cfg_dir/massa-ai/agent-profiles"
  fi
  assert_file "$host variant tree: balanced/massa-ai-builder.$ext installed" \
    "$VARIANT_DEST/balanced/massa-ai-builder.$ext"
  assert_file "$host variant tree: work/massa-ai-builder.$ext installed" \
    "$VARIANT_DEST/work/massa-ai-builder.$ext"
  if cmp -s "$VARIANT_DEST/work/massa-ai-builder.$ext" "$BUNDLE_AGENT_PROFILES/work/massa-ai-builder.$ext"; then
    ok "$host installed work variant content == bundle work variant content"
  else
    fail "$host installed work variant content == bundle work variant content  →  differs"
  fi
done

summary "model-profile-installer-reapply"
