#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-skills-check-double-surface.sh
#
# install-skills.sh --check double-surface probe (PRT-08): when install-state
# records skillsOwner "repo" for claude AND ~/.claude/settings.json enables the
# massa-ai@massa-ai plugin, every skill/agent/command is registered twice —
# --check must name both surfaces and exit 1. A single active surface, a
# missing enabledPlugins key, or a missing state file must keep the current
# exit-0 behavior (spec edge cases: unknown owner ≠ double surface).
#
# Usage: bash scripts/tests/test-skills-check-double-surface.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-skills.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-double-surface.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
export PATH="$(make_mock_agents "$ROOT/bin"):$PATH"

apply() { bash "$INSTALLER" --apply --platform claude --target "$1" --repo-root "$PROJECT_ROOT" --yes 2>&1; }
check() { bash "$INSTALLER" --check --platform claude --target "$1" --repo-root "$PROJECT_ROOT" 2>&1; }

settings() { # settings HOME JSON — write ~/.claude/settings.json
  mkdir -p "$1/.claude"
  printf '%s\n' "$2" > "$1/.claude/settings.json"
}

echo "Scenario 1: both surfaces active — repo-owned skills AND enabled plugin → exit 1, both surfaces named"
H1="$ROOT/h1"; mkdir -p "$H1"
apply "$H1" >/dev/null
settings "$H1" '{"enabledPlugins": {"massa-ai@massa-ai": true}}'
BEFORE1="$(tree_fingerprint "$H1")"
OUT1="$(check "$H1")"; RC1=$?
AFTER1="$(tree_fingerprint "$H1")"
assert_eq "double surface exits 1" "$RC1" "1"
assert_contains "drift row emitted" "$OUT1" "[drift]"
assert_contains "state surface named" "$OUT1" "install-state.json"
assert_contains "settings surface named" "$OUT1" "settings.json"
assert_contains "plugin named" "$OUT1" "massa-ai@massa-ai"
assert_eq "probe wrote nothing" "$AFTER1" "$BEFORE1"

echo ""
echo "Scenario 2: single surface — plugin explicitly disabled → exit 0"
H2="$ROOT/h2"; mkdir -p "$H2"
apply "$H2" >/dev/null
settings "$H2" '{"enabledPlugins": {"massa-ai@massa-ai": false}}'
OUT2="$(check "$H2")"; RC2=$?
assert_eq "disabled plugin exits 0" "$RC2" "0"
assert_not_contains "no drift reported" "$OUT2" "[drift]"

echo ""
echo "Scenario 3: settings.json has no enabledPlugins key → treated as disabled, exit 0"
H3="$ROOT/h3"; mkdir -p "$H3"
apply "$H3" >/dev/null
settings "$H3" '{"hooks": {}}'
OUT3="$(check "$H3")"; RC3=$?
assert_eq "missing enabledPlugins key exits 0" "$RC3" "0"
assert_not_contains "no drift reported" "$OUT3" "[drift]"

echo ""
echo "Scenario 4: no settings.json at all → exit 0"
H4="$ROOT/h4"; mkdir -p "$H4"
apply "$H4" >/dev/null
OUT4="$(check "$H4")"; RC4=$?
assert_eq "missing settings.json exits 0" "$RC4" "0"
assert_not_contains "no drift reported" "$OUT4" "[drift]"

echo ""
echo "Scenario 5: missing state file — plugin enabled but owner unknown → probe skipped, exit 0"
H5="$ROOT/h5"; mkdir -p "$H5"
apply "$H5" >/dev/null
rm "$H5/.config/massa-ai/install-state.json"
settings "$H5" '{"enabledPlugins": {"massa-ai@massa-ai": true}}'
OUT5="$(check "$H5")"; RC5=$?
assert_eq "unknown owner exits 0" "$RC5" "0"
assert_not_contains "no drift reported" "$OUT5" "[drift]"

summary "install-skills --check double-surface probe"
