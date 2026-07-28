#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-plugin-registry-registration.sh
#
# Host plugin-registry registration: the step that makes massa-ai appear in
# each host's plugins screen, as opposed to merely writing its files.
#
# Strategy: the source-resolution helpers and the CLI-absent fallback are pure
# and always run. The CLI-present scenarios shell out to the real `claude` /
# `codex` binaries and are SKIPPED when those are not installed — which is the
# case on every CI runner. That gap is deliberate and documented: the probe
# `installer_host_cli_supports` is what makes absence safe, and it is exercised
# here directly. Treat the CLI-present paths as manually verified only.
#
# Isolation: every host CLI is pinned to the temp root via CLAUDE_CONFIG_DIR /
# CODEX_HOME as well as HOME, so a bug in HOME handling cannot reach the real
# config. The suite asserts that the developer's own config is untouched.
#
# Usage: bash scripts/tests/test-plugin-registry-registration.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"
# shellcheck source=scripts/lib/installer-shared.sh
source "${PROJECT_ROOT}/scripts/lib/installer-shared.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-plugin-registry.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

skip() { echo -e "  ↷ SKIP $*"; }

# A PATH with node/bun but deliberately without the host CLIs, used to prove
# the fallback. Derived from the live PATH minus the dir holding each CLI.
path_without() { # path_without <cli>...
  local out="$PATH" cli dir
  for cli in "$@"; do
    dir="$(dirname "$(command -v "$cli" 2>/dev/null || echo /nonexistent/x)")"
    out="$(echo "$out" | tr ':' '\n' | grep -vx "$dir" | paste -sd: -)"
  done
  echo "$out"
}

echo "Scenario 1: --plugin-source mode resolution"
assert_eq "auto in a checkout resolves to local" \
  "$(installer_plugin_source_mode auto "$PROJECT_ROOT")" "local"
assert_eq "auto outside a checkout resolves to copy" \
  "$(installer_plugin_source_mode auto "$ROOT")" "copy"
assert_eq "explicit local passes through" \
  "$(installer_plugin_source_mode local "$PROJECT_ROOT")" "local"
assert_eq "explicit copy passes through" \
  "$(installer_plugin_source_mode copy "$PROJECT_ROOT")" "copy"
assert_eq "unknown mode exits 2" \
  "$(installer_plugin_source_mode bogus "$PROJECT_ROOT" >/dev/null 2>&1; echo $?)" "2"

echo ""
echo "Scenario 2: copy mode materialises a checkout-independent marketplace root"
COPY_HOME="$ROOT/copyhome"; mkdir -p "$COPY_HOME"
COPY_ROOT="$(installer_plugin_source_root copy "$PROJECT_ROOT" "$COPY_HOME")"
assert_eq "root is under the target home" \
  "$COPY_ROOT" "$COPY_HOME/.config/massa-ai/marketplace"
assert_file "claude marketplace manifest copied" "$COPY_ROOT/.claude-plugin/marketplace.json"
assert_file "codex marketplace manifest copied" "$COPY_ROOT/.agents/plugins/marketplace.json"
assert_file "cursor marketplace manifest copied" "$COPY_ROOT/.cursor-plugin/marketplace.json"
for host in claude codex cursor opencode; do
  assert_file "${host} bundle copied" "$COPY_ROOT/apps/${host}-plugin/package.json"
done
# node_modules is a workspace symlink farm pointing back into the checkout;
# shipping it would defeat the entire point of copy mode.
assert_eq "no node_modules leaked into the copy" \
  "$(find "$COPY_ROOT" -maxdepth 3 -name node_modules | wc -l | tr -d ' ')" "0"
assert_eq "local mode echoes the checkout unchanged" \
  "$(installer_plugin_source_root local "$PROJECT_ROOT" "$COPY_HOME")" "$PROJECT_ROOT"

echo ""
echo "Scenario 3: host CLI capability probe"
assert_ne "absent binary is unsupported" \
  "$(installer_host_cli_supports massa-ai-definitely-not-a-real-cli plugin; echo $?)" "0"
STUB_DIR="$ROOT/stubbin"; mkdir -p "$STUB_DIR"
# A binary that exists but does not understand the subcommand — the version-skew
# case, indistinguishable from absence as far as the installer should care.
printf '#!/bin/sh\nexit 1\n' > "$STUB_DIR/oldcli"; chmod +x "$STUB_DIR/oldcli"
assert_ne "present but failing --help is unsupported" \
  "$(PATH="$STUB_DIR:$PATH" installer_host_cli_supports oldcli plugin marketplace; echo $?)" "0"
printf '#!/bin/sh\nexit 0\n' > "$STUB_DIR/newcli"; chmod +x "$STUB_DIR/newcli"
assert_eq "present and accepting --help is supported" \
  "$(PATH="$STUB_DIR:$PATH" installer_host_cli_supports newcli plugin marketplace; echo $?)" "0"

echo ""
echo "Scenario 4: Claude falls back to the file route when the CLI is missing"
FB="$ROOT/fallback"; mkdir -p "$FB"
FB_OUT="$(env -i HOME="$FB" PATH="$(path_without claude)" MASSA_AI_VERBOSE=0 \
  bash "$PROJECT_ROOT/apps/claude-plugin/install.sh" --user 2>&1)"
assert_file "file-route settings.json written" "$FB/.claude/settings.json"
assert_eq "loose commands installed" \
  "$(find "$FB/.claude/commands" -name 'massa-ai-*.md' 2>/dev/null | wc -l | tr -d ' ')" "6"
assert_contains "prints the manual registration command" "$FB_OUT" "claude plugin marketplace add"
assert_no_file "no registry written without the CLI" "$FB/.claude/plugins/installed_plugins.json"

echo ""
echo "Scenario 5: Cursor installs to plugins/local and migrates the pre-fix copy"
CU="$ROOT/cursor"; mkdir -p "$CU/.cursor/plugins/massa-ai/hooks"
: > "$CU/.cursor/plugins/massa-ai/hooks/massa-ai-hook"
env HOME="$CU" MASSA_AI_VERBOSE=0 \
  bash "$PROJECT_ROOT/apps/cursor-plugin/install.sh" --user >/dev/null 2>&1
assert_file "installed under plugins/local" "$CU/.cursor/plugins/local/massa-ai/.cursor-plugin/plugin.json"
assert_eq "pre-fix plugins/<name> copy removed" \
  "$([ -d "$CU/.cursor/plugins/massa-ai" ] && echo present || echo absent)" "absent"
assert_contains "hooks point at the new location" \
  "$(cat "$CU/.cursor/hooks.json")" "/plugins/local/massa-ai/hooks"

echo ""
echo "Scenario 6: Claude CLI route registers, is idempotent, and reverses"
if ! command -v claude >/dev/null 2>&1; then
  skip "claude CLI not installed — plugin-registry path unverified here"
else
  CL="$ROOT/claude"; mkdir -p "$CL"
  claude_run() {
    env HOME="$CL" CLAUDE_CONFIG_DIR="$CL/.claude" MASSA_AI_VERBOSE=0 \
      bash "$PROJECT_ROOT/apps/claude-plugin/install.sh" "$@" >/dev/null 2>&1
  }
  claude_run --user
  SETTINGS="$CL/.claude/settings.json"
  assert_contains "enabledPlugins carries massa-ai" "$(cat "$SETTINGS")" '"massa-ai@massa-ai": true'
  assert_contains "marketplace declared" "$(cat "$SETTINGS")" '"extraKnownMarketplaces"'
  assert_file "installed_plugins.json written" "$CL/.claude/plugins/installed_plugins.json"
  # The plugin bundle supplies commands and hooks itself; duplicating them here
  # is what would double-fire every lifecycle event.
  assert_eq "no loose commands on the plugin route" \
    "$(find "$CL/.claude/commands" -name 'massa-ai-*.md' 2>/dev/null | wc -l | tr -d ' ')" "0"
  assert_eq "no owned hooks merged on the plugin route" \
    "$(grep -c '_massaAiOwned' "$SETTINGS" || true)" "0"

  # NOT byte-identity: the claude CLI rewrites settings.json with a
  # non-deterministic top-level key order, so the file legitimately differs
  # between runs while carrying the same content. Idempotency here means no
  # duplicated or drifted entries.
  BEFORE="$(node -e 'const o=require(process.argv[1]);console.log(JSON.stringify(o,Object.keys(o).sort()))' "$SETTINGS")"
  claude_run --user
  AFTER="$(node -e 'const o=require(process.argv[1]);console.log(JSON.stringify(o,Object.keys(o).sort()))' "$SETTINGS")"
  assert_eq "rerun leaves settings.json semantically identical" "$AFTER" "$BEFORE"

  claude_run --uninstall
  assert_not_contains "uninstall clears enabledPlugins" "$(cat "$SETTINGS")" "massa-ai@massa-ai"
fi

echo ""
echo "Scenario 7: Claude migrates a pre-existing file-route install"
if ! command -v claude >/dev/null 2>&1; then
  skip "claude CLI not installed — migration path unverified here"
else
  MIG="$ROOT/migrate"; mkdir -p "$MIG"
  env -i HOME="$MIG" PATH="$(path_without claude)" MASSA_AI_VERBOSE=0 \
    bash "$PROJECT_ROOT/apps/claude-plugin/install.sh" --user >/dev/null 2>&1
  assert_eq "seeded file-route commands" \
    "$(find "$MIG/.claude/commands" -name 'massa-ai-*.md' | wc -l | tr -d ' ')" "6"
  env HOME="$MIG" CLAUDE_CONFIG_DIR="$MIG/.claude" MASSA_AI_VERBOSE=0 \
    bash "$PROJECT_ROOT/apps/claude-plugin/install.sh" --user >/dev/null 2>&1
  assert_eq "upgrade removes orphaned loose commands" \
    "$(find "$MIG/.claude/commands" -name 'massa-ai-*.md' 2>/dev/null | wc -l | tr -d ' ')" "0"
  assert_eq "upgrade removes orphaned loose agents" \
    "$(find "$MIG/.claude/agents" -name 'massa-ai-*.md' 2>/dev/null | wc -l | tr -d ' ')" "0"
  assert_eq "upgrade strips the file-route hooks" \
    "$(grep -c '_massaAiOwned' "$MIG/.claude/settings.json" || true)" "0"
  assert_contains "and registers the plugin" \
    "$(cat "$MIG/.claude/settings.json")" '"massa-ai@massa-ai": true'
fi

echo ""
echo "Scenario 8: Codex CLI route registers exactly once and reverses"
if ! command -v codex >/dev/null 2>&1; then
  skip "codex CLI not installed — plugin-registry path unverified here"
else
  CX="$ROOT/codex"; mkdir -p "$CX"
  codex_run() {
    env HOME="$CX" CODEX_HOME="$CX/.codex" MASSA_AI_VERBOSE=0 \
      bash "$PROJECT_ROOT/apps/codex-plugin/install.sh" "$@" >/dev/null 2>&1
  }
  codex_run --user
  CFG="$CX/.codex/config.toml"
  assert_eq "marketplace table written once" \
    "$(grep -c '^\[marketplaces.massa-ai\]' "$CFG")" "1"
  assert_eq "plugin table written once" \
    "$(grep -c '^\[plugins."massa-ai@massa-ai"\]' "$CFG")" "1"
  # Codex hooks are additive: a Codex plugin manifest has no hooks key, so the
  # marketplace route cannot supply them and the file route must still run.
  assert_contains "hooks.json still merged" "$(cat "$CX/.codex/hooks.json")" "massa-ai"

  codex_run --user
  # NOT byte-identity: `codex plugin marketplace add` refreshes last_updated on
  # every call. Idempotency here means no duplicate tables, not an unchanged file.
  assert_eq "rerun does not duplicate the marketplace table" \
    "$(grep -c '^\[marketplaces.massa-ai\]' "$CFG")" "1"
  assert_eq "rerun does not duplicate the plugin table" \
    "$(grep -c '^\[plugins."massa-ai@massa-ai"\]' "$CFG")" "1"

  codex_run --uninstall
  assert_eq "uninstall removes the marketplace table" \
    "$(grep -c '^\[marketplaces.massa-ai\]' "$CFG" || true)" "0"
  assert_eq "uninstall removes the plugin table" \
    "$(grep -c '^\[plugins."massa-ai@massa-ai"\]' "$CFG" || true)" "0"
fi

echo ""
echo "Scenario 9: an ambient CODEX_HOME cannot escape a sandboxed install"
# Regression guard. The Codex app exports CODEX_HOME into every shell it spawns,
# and the codex CLI prefers it over $HOME. Before CODEX_CLI_HOME was pinned in
# apps/codex-plugin/install.sh, a sandboxed run wrote its files to the sandbox
# but registered the marketplace into the real ~/.codex — and an --uninstall in
# a test suite silently removed a live [marketplaces.massa-ai] table.
if ! command -v codex >/dev/null 2>&1; then
  skip "codex CLI not installed — CODEX_HOME escape unverified here"
else
  DECOY="$ROOT/decoy-codex-home"; mkdir -p "$DECOY"
  printf '[marketplaces.sentinel]\nsource = "keep-me"\n' > "$DECOY/config.toml"
  DECOY_BEFORE="$(cat "$DECOY/config.toml")"
  SBX="$ROOT/sandboxed"; mkdir -p "$SBX"
  env CODEX_HOME="$DECOY" HOME="$SBX" MASSA_AI_VERBOSE=0 \
    bash "$PROJECT_ROOT/apps/codex-plugin/install.sh" --user >/dev/null 2>&1
  assert_eq "ambient CODEX_HOME left untouched" "$(cat "$DECOY/config.toml")" "$DECOY_BEFORE"
  assert_eq "registration landed in the sandbox instead" \
    "$(grep -c '^\[marketplaces.massa-ai\]' "$SBX/.codex/config.toml" 2>/dev/null || echo 0)" "1"
  env CODEX_HOME="$DECOY" HOME="$SBX" MASSA_AI_VERBOSE=0 \
    bash "$PROJECT_ROOT/apps/codex-plugin/install.sh" --uninstall >/dev/null 2>&1
  assert_eq "uninstall also stays out of ambient CODEX_HOME" \
    "$(cat "$DECOY/config.toml")" "$DECOY_BEFORE"
fi

echo ""
echo "Scenario 10: the developer's real config was never touched"
# Every scenario above pins HOME plus the host-specific config env var. If any
# of them leaked, these files would carry a massa-ai entry from this run.
if [ -f "$HOME/.claude/plugins/installed_plugins.json" ]; then
  REAL_BEFORE="${MASSA_AI_TEST_REAL_CLAUDE_MD5:-}"
  if [ -n "$REAL_BEFORE" ]; then
    assert_eq "real installed_plugins.json unchanged" \
      "$(md5 -q "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null || md5sum "$HOME/.claude/plugins/installed_plugins.json" | cut -d' ' -f1)" \
      "$REAL_BEFORE"
  else
    skip "set MASSA_AI_TEST_REAL_CLAUDE_MD5 to assert real-config integrity"
  fi
else
  skip "no real Claude plugin registry on this machine"
fi

summary "plugin registry registration"
