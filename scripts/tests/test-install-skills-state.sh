#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-skills-state.sh
#
# scripts/install-skills.sh state file handling:
# ~/.config/massa-ai/install-state.json — v1→v2 migration, malformed input,
# path-traversal skill names, de-duplication, and "persist only after the run".
#
# Usage: bash scripts/tests/test-install-skills-state.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${PROJECT_ROOT}/scripts/install-skills.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-skills-state.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
export PATH="$(make_mock_agents "$ROOT/bin"):$PATH"

RUNNER="node"; command -v node >/dev/null 2>&1 || RUNNER="bun"

seed_state() { # seed_state HOME JSON
  mkdir -p "$1/.config/massa-ai"
  printf '%s\n' "$2" > "$1/.config/massa-ai/install-state.json"
}

state_json() { # state_json HOME EXPR   (EXPR evaluated with `s` bound to the doc)
  "$RUNNER" - "$1/.config/massa-ai/install-state.json" "$2" <<'NODE'
const fs = require("fs");
const s = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(String(eval(process.argv[3])));
NODE
}

apply() { # apply HOME [args...]
  local home="$1"; shift
  bash "$INSTALLER" --apply --platform claude --target "$home" \
    --repo-root "$PROJECT_ROOT" --yes "$@" --verbose 2>&1
}

echo "Scenario 1: no state file — a fresh v2 document is written"
H1="$ROOT/h1"; mkdir -p "$H1"
apply "$H1" >/dev/null
assert_file "state file created" "$H1/.config/massa-ai/install-state.json"
assert_eq "version is 2" "$(state_json "$H1" 's.version')" "2"
assert_eq "repository recorded" "$(state_json "$H1" 's.repository')" "$PROJECT_ROOT"
assert_ne "claude platform recorded" "$(state_json "$H1" 's.platforms.claude ? 1 : 0')" "0"

echo ""
echo "Scenario 2: v1 state migrates to v2"
H2="$ROOT/h2"
seed_state "$H2" '{"version":1,"repository":"/old/repo","platforms":["claude","codex"]}'
OUT="$(apply "$H2")"; RC=$?
assert_eq "migration run exits 0" "$RC" "0"
assert_eq "migrated to version 2" "$(state_json "$H2" 's.version')" "2"
assert_eq "platforms became an object" "$(state_json "$H2" 'Array.isArray(s.platforms) ? "array" : typeof s.platforms')" "object"
assert_eq "legacy codex record survives the migration" \
  "$(state_json "$H2" 's.platforms.codex ? "yes" : "no"')" "yes"
assert_eq "codex record carries a root" \
  "$(state_json "$H2" 'typeof s.platforms.codex.root')" "string"

echo ""
echo "Scenario 3: malformed JSON is rejected, exit 2, and nothing is written"
H3="$ROOT/h3"
seed_state "$H3" '{ not json'
BEFORE="$(tree_fingerprint "$H3")"
OUT3="$(apply "$H3")"; RC3=$?
AFTER="$(tree_fingerprint "$H3")"
assert_eq "malformed state exits 2" "$RC3" "2"
assert_contains "reason is reported" "$OUT3" "Malformed JSON in installer state"
assert_eq "nothing on disk changed" "$AFTER" "$BEFORE"

echo ""
echo "Scenario 4: path-traversal skill names are rejected"
H4="$ROOT/h4"
seed_state "$H4" '{"version":2,"repository":"/r","platforms":{"claude":{"root":"/r","skills":["../../etc/passwd"]}}}'
OUT4="$(apply "$H4")"; RC4=$?
assert_eq "traversal exits 2" "$RC4" "2"
assert_contains "reason is reported" "$OUT4" "Invalid skill list"

for BAD in '"."' '".."' '""'; do
  H="$ROOT/h4-$(echo "$BAD" | tr -d '".')x"
  seed_state "$H" "{\"version\":2,\"repository\":\"/r\",\"platforms\":{\"claude\":{\"root\":\"/r\",\"skills\":[$BAD]}}}"
  apply "$H" >/dev/null 2>&1
  assert_eq "skill name $BAD rejected with exit 2" "$?" "2"
done

echo ""
echo "Scenario 5: duplicate skill names are collapsed"
H5="$ROOT/h5"
seed_state "$H5" '{"version":2,"repository":"/r","platforms":{"cursor":{"root":"/r","skills":["a","a","b"]}}}'
# --platform claude leaves the cursor record untouched, so the loaded (deduped)
# value is what gets written back.
apply "$H5" >/dev/null
assert_eq "duplicates removed on round-trip" \
  "$(state_json "$H5" 's.platforms.cursor.skills.join(",")')" "a,b"

echo ""
echo "Scenario 6: an unsupported version is rejected"
H6="$ROOT/h6"
seed_state "$H6" '{"version":99,"platforms":{}}'
OUT6="$(apply "$H6")"; RC6=$?
assert_eq "unknown version exits 2" "$RC6" "2"
assert_contains "reason is reported" "$OUT6" "Unsupported installer state version"

echo ""
echo "Scenario 7: a JSON array (not an object) is rejected"
H7="$ROOT/h7"
seed_state "$H7" '[1,2,3]'
apply "$H7" >/dev/null 2>&1
assert_eq "array state exits 2" "$?" "2"

summary "install-skills state"
