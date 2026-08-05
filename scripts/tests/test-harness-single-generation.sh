#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-harness-single-generation.sh
#
# T9 (design Component 4 / UGB-08): scripts/install-harness.sh must generate
# plugin bundles AT MOST ONCE per invocation, even though every per-host
# apps/*-plugin/install.sh (T5-T8) independently regenerates in checkout
# context. The harness's fix is to generate once up front and export
# MASSA_AI_SKIP_ARTIFACT_GENERATION=1 so each downstream installer call skips
# its own inline generation.
#
# Shadow repo (mirrors test-plugin-auto-install.sh Section 2): the REAL
# install-harness.sh + banner.sh + installer-shared.sh, but the two generator
# scripts and the four per-host install.sh are stand-ins:
#   - the generator stand-ins print one "Emitted (stub) ..." marker line and
#     exit 0 — proving INVOCATION COUNT, not generator correctness (that is
#     scripts/__tests__/generate-*.test.ts's job)
#   - the per-host stand-in reproduces the exact T5-T8 contract (call the two
#     generator paths unless MASSA_AI_SKIP_ARTIFACT_GENERATION=1), so this
#     test exercises the real end-to-end contract between the harness and
#     every installer, not just the harness in isolation.
#
# Usage: bash scripts/tests/test-harness-single-generation.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-hsg.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

SHADOW="$ROOT/shadow"
CALL_LOG="$ROOT/calls.log"
mkdir -p "$SHADOW/scripts/lib"
cp "$PROJECT_ROOT/scripts/install-harness.sh" "$SHADOW/scripts/install-harness.sh"
cp "$PROJECT_ROOT/scripts/banner.sh" "$SHADOW/scripts/banner.sh"
cp "$PROJECT_ROOT/scripts/lib/installer-shared.sh" "$SHADOW/scripts/lib/installer-shared.sh"
printf '{\n  "name": "shadow",\n  "version": "2.0.0"\n}\n' > "$SHADOW/package.json"

# Generator stand-ins: real bun scripts (so `command -v bun` + the real
# invocation path are exercised) that only print a marker and exit.
cat > "$SHADOW/scripts/generate-skill-artifacts.ts" <<'TS'
console.log("Emitted (stub) skill-bundle files.");
TS
cat > "$SHADOW/scripts/generate-subagent-artifacts.ts" <<'TS'
console.log("Emitted (stub) agent files.");
TS

# Per-host stand-in: reproduces the T5-T8 contract exactly (generate unless
# the skip env is already 1), so this test proves the REAL contract between
# install-harness.sh and every installer, not just the harness alone.
make_plugin_stub() { # make_plugin_stub HOST
  mkdir -p "$SHADOW/apps/$1-plugin"
  cat > "$SHADOW/apps/$1-plugin/install.sh" <<STUB
#!/usr/bin/env bash
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="\$(cd "\$SCRIPT_DIR/../.." && pwd)"
printf '%s|%s\n' "$1" "\$*" >> "$CALL_LOG"
if [ "\${MASSA_AI_SKIP_ARTIFACT_GENERATION:-0}" != "1" ]; then
  bun "\$REPO_ROOT/scripts/generate-skill-artifacts.ts"
  bun "\$REPO_ROOT/scripts/generate-subagent-artifacts.ts"
fi
exit 0
STUB
  chmod +x "$SHADOW/apps/$1-plugin/install.sh"
}
for host in claude codex cursor opencode; do make_plugin_stub "$host"; done

RUNNER="$(command -v node || command -v bun)"
BUN_BIN="$(command -v bun)"
BASE_PATH="/usr/bin:/bin"
# The scrubbed PATH keeps host-detection deterministic (no real claude/codex/
# cursor/opencode binaries on a dev box) while keeping bun + the runner
# resolvable — both the harness and every stand-in need bun on PATH.
SAFE_PATH="$(dirname "$BUN_BIN"):$(dirname "$RUNNER"):$BASE_PATH"

run_shadow() { # run_shadow HOME [extra harness args...] → OUT, RC
  local home="$1"; shift
  : > "$CALL_LOG"
  OUT="$(PATH="$SAFE_PATH" bash "$SHADOW/scripts/install-harness.sh" --plugins --target "$home" --yes "$@" 2>&1)"
  RC=$?
}

count_marker() { # count_marker OUTPUT MARKER
  printf '%s\n' "$1" | grep -c -F "$2"
}

echo ""
echo "T9/UGB-08: harness generates plugin bundles at most once per run"

# Two hosts detected (claude, cursor) — enough to prove "once, not once per
# installed host" without paying for all four.
H1="$ROOT/multi-host"
mkdir -p "$H1/.claude" "$H1/.cursor"
run_shadow "$H1"
assert_eq "multi-host run → exit 0" "$RC" "0"
assert_eq "multi-host run → both installers ran" \
  "$(cut -d'|' -f1 "$CALL_LOG" | sort | tr '\n' ' ')" "claude cursor "
assert_eq "skill generator invoked exactly once across 2 installed hosts" \
  "$(count_marker "$OUT" "Emitted (stub) skill-bundle files.")" "1"
assert_eq "subagent generator invoked exactly once across 2 installed hosts" \
  "$(count_marker "$OUT" "Emitted (stub) agent files.")" "1"

# All four hosts detected — the full harness shape.
H2="$ROOT/all-hosts"
mkdir -p "$H2/.claude" "$H2/.codex" "$H2/.cursor" "$H2/.config/opencode"
run_shadow "$H2"
assert_eq "all-hosts run → exit 0" "$RC" "0"
assert_eq "all-hosts run → all four installers ran" \
  "$(cut -d'|' -f1 "$CALL_LOG" | sort | tr '\n' ' ')" "claude codex cursor opencode "
assert_eq "skill generator invoked exactly once across 4 installed hosts" \
  "$(count_marker "$OUT" "Emitted (stub) skill-bundle files.")" "1"
assert_eq "subagent generator invoked exactly once across 4 installed hosts" \
  "$(count_marker "$OUT" "Emitted (stub) agent files.")" "1"

echo ""
echo "T9/UGB-08: an externally pre-set skip env is honored (no double-generation)"
H3="$ROOT/preskip"
mkdir -p "$H3/.claude" "$H3/.cursor"
: > "$CALL_LOG"
OUT="$(PATH="$SAFE_PATH" MASSA_AI_SKIP_ARTIFACT_GENERATION=1 bash "$SHADOW/scripts/install-harness.sh" --plugins --target "$H3" --yes 2>&1)"
RC=$?
assert_eq "pre-skipped run → exit 0" "$RC" "0"
assert_eq "pre-skipped run → generator never invoked" \
  "$(count_marker "$OUT" "Emitted (stub)")" "0"

echo ""
echo "T9/UGB-08: dry-run never generates (no installer call at all)"
H4="$ROOT/dryrun"
mkdir -p "$H4/.claude"
: > "$CALL_LOG"
OUT="$(PATH="$SAFE_PATH" bash "$SHADOW/scripts/install-harness.sh" --plugins --target "$H4" --dry-run 2>&1)"
RC=$?
assert_eq "dry-run → exit 0" "$RC" "0"
assert_eq "dry-run → no installer invoked" "$(cat "$CALL_LOG" 2>/dev/null)" ""
assert_eq "dry-run → generator never invoked" \
  "$(count_marker "$OUT" "Emitted (stub)")" "0"

summary "install-harness.sh single-generation (T9, UGB-08)"
