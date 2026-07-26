#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-install-harness-cli.sh
#
# scripts/install-harness.sh selection and argv forwarding.
#
# Strategy: the sub-installers are replaced by stubs on a temp PATH... except
# the harness invokes them by absolute path, so instead we run the harness with
# a shadow scripts/ tree: a copy of install-harness.sh next to stub
# install-skills.sh / install-agents.sh that record their argv. That is the
# only way to assert "flags reach the sub-scripts verbatim" without also
# re-testing what the sub-scripts do.
#
# Usage: bash scripts/tests/test-install-harness-cli.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HARNESS="${PROJECT_ROOT}/scripts/install-harness.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-harness-cli.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

# ── Shadow repo: real harness, stubbed sub-installers ───────────────────────
SHADOW="$ROOT/shadow"
mkdir -p "$SHADOW/scripts/lib" "$SHADOW/apps/claude-plugin" "$SHADOW/apps/codex-plugin" "$SHADOW/apps/cursor-plugin"
cp "$HARNESS" "$SHADOW/scripts/install-harness.sh"
cp "${PROJECT_ROOT}/scripts/banner.sh" "$SHADOW/scripts/banner.sh"
cp "${PROJECT_ROOT}/scripts/lib/installer-shared.sh" "$SHADOW/scripts/lib/installer-shared.sh"
mkdir -p "$SHADOW/skills/demo" && printf -- '---\nname: demo\n---\n' > "$SHADOW/skills/demo/SKILL.md"

ARGV_LOG="$ROOT/argv.log"
make_stub() { # make_stub PATH LABEL [EXIT_CODE]
  cat > "$1" <<STUB
#!/usr/bin/env bash
printf '%s|%s\n' "$2" "\$*" >> "$ARGV_LOG"
exit ${3:-0}
STUB
  chmod +x "$1"
}
make_stub "$SHADOW/scripts/install-skills.sh" skills
make_stub "$SHADOW/scripts/install-agents.sh" agents
for host in claude codex cursor; do
  make_stub "$SHADOW/apps/${host}-plugin/install.sh" "plugin-${host}"
done

harness() { : > "$ARGV_LOG"; bash "$SHADOW/scripts/install-harness.sh" "$@" 2>&1; }
logged() { cut -d'|' -f1 "$ARGV_LOG" | tr '\n' ' '; }
argv_for() { grep "^$1|" "$ARGV_LOG" | head -n1 | cut -d'|' -f2-; }

H="$ROOT/home"; mkdir -p "$H"

echo "Scenario 1: --skills runs only the skills installer"
harness --skills --target "$H" --yes >/dev/null
assert_eq "only skills ran" "$(logged)" "skills "

echo ""
echo "Scenario 2: --agents runs only the MCP installer"
harness --agents --target "$H" --yes >/dev/null
assert_eq "only agents ran" "$(logged)" "agents "

echo ""
echo "Scenario 3: --plugins runs the three plugin installers"
harness --plugins --target "$H" --yes >/dev/null
assert_eq "three plugin installers ran" "$(logged)" "plugin-claude plugin-codex plugin-cursor "

echo ""
echo "Scenario 4: --all runs everything, skills → agents → plugins"
harness --all --target "$H" --yes >/dev/null
assert_eq "full ordered run" "$(logged)" "skills agents plugin-claude plugin-codex plugin-cursor "

echo ""
echo "Scenario 5: no selection flag defaults to --all"
harness --target "$H" --yes >/dev/null
assert_eq "default is --all" "$(logged)" "skills agents plugin-claude plugin-codex plugin-cursor "

echo ""
echo "Scenario 6: flags are forwarded verbatim to the sub-installers"
harness --skills --agents --platform codex --api-base "http://example.test:1234" --target "$H" --yes >/dev/null
SKILLS_ARGV="$(argv_for skills)"
AGENTS_ARGV="$(argv_for agents)"
assert_contains "skills gets --apply" "$SKILLS_ARGV" "--apply"
assert_contains "skills gets --platform codex" "$SKILLS_ARGV" "--platform codex"
assert_contains "skills gets --target" "$SKILLS_ARGV" "--target $H"
assert_contains "skills gets --repo-root" "$SKILLS_ARGV" "--repo-root"
assert_contains "skills gets --yes" "$SKILLS_ARGV" "--yes"
assert_contains "agents gets --target" "$AGENTS_ARGV" "--target $H"
assert_contains "agents gets --api-base" "$AGENTS_ARGV" "--api-base http://example.test:1234"
assert_contains "agents gets --yes" "$AGENTS_ARGV" "--yes"
assert_not_contains "agents does not get --platform" "$AGENTS_ARGV" "--platform"

echo ""
echo "Scenario 7: --uninstall is forwarded, and skills switches action"
harness --skills --agents --uninstall --target "$H" --yes >/dev/null
assert_contains "skills gets --uninstall" "$(argv_for skills)" "--uninstall"
assert_not_contains "skills does not also get --apply" "$(argv_for skills)" "--apply"
assert_contains "agents gets --uninstall" "$(argv_for agents)" "--uninstall"

echo ""
echo "Scenario 8: --dry-run reaches both and skips plugin execution"
harness --all --dry-run --target "$H" >/dev/null
assert_contains "skills runs in --dry-run mode" "$(argv_for skills)" "--dry-run"
assert_contains "agents gets --dry-run" "$(argv_for agents)" "--dry-run"
assert_not_contains "no plugin installer was executed" "$(logged)" "plugin-"

echo ""
echo "Scenario 9: a failing sub-installer's exit code propagates"
make_stub "$SHADOW/scripts/install-agents.sh" agents 7
OUT9="$(harness --agents --target "$H" --yes)"; RC9=$?
assert_eq "exit code propagated verbatim" "$RC9" "7"
assert_contains "failure is reported" "$OUT9" "install-agents.sh failed (exit 7)"
make_stub "$SHADOW/scripts/install-agents.sh" agents 0

echo ""
echo "Scenario 10: consent gate and bad input"
assert_eq "unknown flag exits 2" "$(bash "$HARNESS" --nope >/dev/null 2>&1; echo $?)" "2"
assert_eq "--help exits 0" "$(bash "$HARNESS" --help >/dev/null 2>&1; echo $?)" "0"
assert_eq "real \$HOME without --yes exits 13" \
  "$(bash "$SHADOW/scripts/install-harness.sh" --skills </dev/null >/dev/null 2>&1; echo $?)" "13"

summary "install-harness CLI"
