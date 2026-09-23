#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-installer-agent-ownership.sh
#
# Marker ownership in the four plugin installers (agent-roster-consolidation
# NAM AC-3, AC-4, AC-5; T5). Ownership of an installed agent is a content
# marker, never its name:
#   - a same-named agent the user owns (unmarked file, or a symlink to an
#     unmarked file elsewhere) is left byte-identical, with its symlink target
#     unchanged, by install AND uninstall, and install warns naming it;
#   - a legacy massa-ai-<one of the 18 pre-rename names> file is pruned on
#     upgrade, while an unmarked massa-ai-mine.* survives;
#   - a marked agent the bundle no longer ships is pruned;
#   - re-installing is a no-op.
# OpenCode additionally proves ownership survives a reinstall from a different
# bundle copy, a deleted bundle copy (dangling link), and a profile switch.
#
# Every scenario runs against a staged bundle (stage_plugin_bundle) whose agent
# files carry unprefixed names, so a planted senior-engineer.<ext> really collides with
# a shipped agent. HOMEs are scratch dirs; the real $HOME is never touched.
#
# Usage: bash scripts/tests/test-installer-agent-ownership.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-agent-ownership.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

for host in claude codex cursor opencode; do
  if [[ -z "$(ls -A "$PROJECT_ROOT/apps/$host-plugin/agents" 2>/dev/null)" ]] \
    || [[ ! -f "$PROJECT_ROOT/apps/$host-plugin/skills/massa-ai/SKILL.md" ]]; then
    echo "  ⚠ SKIP: apps/$host-plugin bundle not generated — run 'bun run generate:artifacts' first" >&2
    echo "installer agent ownership: 0 passed, 0 failed (skipped — bundle absent)"
    exit 0
  fi
done

MARKER='<!-- massa-ai-owned: true -->'
UNMARKED_MD=$'---\nname: senior-engineer\ndescription: my own senior-engineer\n---\nI am the user\'s senior-engineer.\n'
# Shaped like an agent a pre-marker release generated: frontmatter plus the
# charter body, no ownership marker.
LEGACY_MD=$'---\nname: massa-ai-reviewer\ndescription: Read-only diff review agent.\nmodel: inherit\n---\n# Reviewer Agent Skill\n'
MARKED_RETIRED_MD="$(printf -- '---\nname: retired-specialist\n---\n%s\nretired body' "$MARKER")"

# run_installer HOST STAGE HOME [args...] — prints combined output.
run_installer() {
  local host="$1" stage="$2" home="$3"; shift 3
  env HOME="$home" XDG_CONFIG_HOME="$home/.config" MASSA_AI_SKIP_PLUGIN_REGISTRY=1 \
    MASSA_AI_SKIP_ARTIFACT_GENERATION=1 MASSA_AI_VERBOSE=1 \
    bash "$stage/apps/$host-plugin/install.sh" --user "$@" 2>&1
}

agents_dir_for() { # agents_dir_for HOST HOME
  case "$1" in
    claude) echo "$2/.claude/agents" ;;
    codex) echo "$2/.codex/agents" ;;
    cursor) echo "$2/.cursor/agents" ;;
    opencode) echo "$2/.config/opencode/agents" ;;
  esac
}

# ── Claude, Cursor (regular-file .md) and Codex (.toml) ─────────────────────
for host in claude cursor codex; do
  echo ""
  echo "Host $host: foreign same-named agent, legacy prune, retired prune, idempotent reinstall"
  STAGE="$ROOT/stage-$host"; stage_plugin_bundle "$host" "$STAGE"
  H="$ROOT/home-$host"; mkdir -p "$H"
  AD="$(agents_dir_for "$host" "$H")"; mkdir -p "$AD"
  ext=md; [[ "$host" == codex ]] && ext=toml
  check "$host: staged bundle ships senior-engineer.$ext" "$([ -f "$STAGE/apps/$host-plugin/agents/senior-engineer.$ext" ] && echo 0 || echo 1)"

  if [[ "$ext" == md ]]; then
    printf '%s' "$UNMARKED_MD" > "$AD/senior-engineer.md"
    printf '%s' "$LEGACY_MD" > "$AD/massa-ai-reviewer.md"
    printf '%s' "$UNMARKED_MD" > "$AD/massa-ai-mine.md"
    printf '%s' "$MARKED_RETIRED_MD" > "$AD/retired-specialist.md"
  else
    printf 'name = "senior-engineer"\ndescription = "my own senior-engineer"\n' > "$AD/senior-engineer.toml"
    printf '# massa-ai-owned\nname = "massa-ai-reviewer"\n' > "$AD/massa-ai-reviewer.toml"
    printf 'name = "massa-ai-mine"\n' > "$AD/massa-ai-mine.toml"
    printf '# massa-ai-owned\nname = "retired-specialist"\n' > "$AD/retired-specialist.toml"
  fi
  # A user symlink named like a shipped agent, pointing at an unmarked file.
  mkdir -p "$H/dotfiles"
  printf '%s' "$UNMARKED_MD" > "$H/dotfiles/judge.$ext"
  ln -s "$H/dotfiles/judge.$ext" "$AD/judge.$ext"
  cp "$AD/senior-engineer.$ext" "$ROOT/senior-engineer-$host.orig"
  cp "$AD/massa-ai-mine.$ext" "$ROOT/mine-$host.orig"
  cp "$H/dotfiles/judge.$ext" "$ROOT/judge-$host.orig"

  OUT="$(run_installer "$host" "$STAGE" "$H")"; RC=$?
  assert_eq "$host install exits 0" "$RC" "0"
  check "$host: foreign senior-engineer.$ext is byte-identical after install" "$(cmp -s "$AD/senior-engineer.$ext" "$ROOT/senior-engineer-$host.orig" && echo 0 || echo 1)"
  assert_contains "$host: install warns naming the foreign file" "$OUT" "$AD/senior-engineer.$ext exists and is not massa-ai-owned — skipped"
  assert_symlink_to "$host: user symlink judge.$ext keeps its target" "$AD/judge.$ext" "$H/dotfiles/judge.$ext"
  check "$host: user symlink target is untouched" "$(cmp -s "$H/dotfiles/judge.$ext" "$ROOT/judge-$host.orig" && echo 0 || echo 1)"
  assert_contains "$host: install warns naming the foreign symlink" "$OUT" "$AD/judge.$ext exists and is not massa-ai-owned — skipped"
  assert_no_file "$host: legacy massa-ai-reviewer.$ext is pruned" "$AD/massa-ai-reviewer.$ext"
  check "$host: unmarked massa-ai-mine.$ext survives install" "$(cmp -s "$AD/massa-ai-mine.$ext" "$ROOT/mine-$host.orig" && echo 0 || echo 1)"
  assert_no_file "$host: marked retired-specialist.$ext is pruned" "$AD/retired-specialist.$ext"
  assert_file "$host: shipped code-reviewer.$ext installed" "$AD/code-reviewer.$ext"

  BEFORE="$(tree_fingerprint "$AD")"
  run_installer "$host" "$STAGE" "$H" >/dev/null; RC=$?
  assert_eq "$host reinstall exits 0" "$RC" "0"
  assert_eq "$host: reinstall is a no-op on the agents dir" "$(tree_fingerprint "$AD")" "$BEFORE"

  run_installer "$host" "$STAGE" "$H" --uninstall >/dev/null; RC=$?
  assert_eq "$host uninstall exits 0" "$RC" "0"
  check "$host: foreign senior-engineer.$ext is byte-identical after uninstall" "$(cmp -s "$AD/senior-engineer.$ext" "$ROOT/senior-engineer-$host.orig" && echo 0 || echo 1)"
  assert_symlink_to "$host: user symlink survives uninstall" "$AD/judge.$ext" "$H/dotfiles/judge.$ext"
  check "$host: unmarked massa-ai-mine.$ext survives uninstall" "$(cmp -s "$AD/massa-ai-mine.$ext" "$ROOT/mine-$host.orig" && echo 0 || echo 1)"
  assert_no_file "$host: owned code-reviewer.$ext removed by uninstall" "$AD/code-reviewer.$ext"
  assert_eq "$host: only the three user entries remain" "$(ls "$AD" | LC_ALL=C sort | tr '\n' ' ')" "judge.$ext massa-ai-mine.$ext senior-engineer.$ext "
done

# ── OpenCode (agents install as symlinks) ───────────────────────────────────
echo ""
echo "Host opencode: foreign file and symlink, legacy link prune, cross-location reinstall, profile switch"
STAGE_A="$ROOT/stage-oc-a"; stage_plugin_bundle opencode "$STAGE_A"
STAGE_B="$ROOT/stage-oc-b"; stage_plugin_bundle opencode "$STAGE_B"
H="$ROOT/home-opencode"; mkdir -p "$H"
AD="$(agents_dir_for opencode "$H")"; mkdir -p "$AD" "$H/dotfiles/opencode/agents"
printf '%s' "$UNMARKED_MD" > "$AD/senior-engineer.md"
printf '%s' "$UNMARKED_MD" > "$H/dotfiles/opencode/agents/judge.md"
ln -s "$H/dotfiles/opencode/agents/judge.md" "$AD/judge.md"
ln -s "/deleted/checkout/apps/opencode-plugin/agents/massa-ai-reviewer.md" "$AD/massa-ai-reviewer.md"
printf '%s' "$UNMARKED_MD" > "$AD/massa-ai-mine.md"
cp "$AD/senior-engineer.md" "$ROOT/senior-engineer-oc.orig"

OUT="$(run_installer opencode "$STAGE_A" "$H")"; RC=$?
assert_eq "opencode install (copy A) exits 0" "$RC" "0"
check "opencode: foreign regular senior-engineer.md is byte-identical" "$(cmp -s "$AD/senior-engineer.md" "$ROOT/senior-engineer-oc.orig" && echo 0 || echo 1)"
assert_contains "opencode: install warns naming the foreign file" "$OUT" "$AD/senior-engineer.md exists and is not massa-ai-owned — skipped"
assert_symlink_to "opencode: user symlink judge.md keeps its dotfiles target" "$AD/judge.md" "$H/dotfiles/opencode/agents/judge.md"
assert_contains "opencode: install warns naming the foreign symlink" "$OUT" "$AD/judge.md exists and is not massa-ai-owned — skipped"
assert_no_file "opencode: legacy (dangling) massa-ai-reviewer.md link is pruned" "$AD/massa-ai-reviewer.md"
assert_file "opencode: unmarked massa-ai-mine.md survives" "$AD/massa-ai-mine.md"
assert_symlink_to "opencode: code-reviewer.md links into copy A" "$AD/code-reviewer.md" "$STAGE_A/apps/opencode-plugin/agents/code-reviewer.md"

OUT="$(run_installer opencode "$STAGE_B" "$H")"; RC=$?
assert_eq "opencode install (copy B) exits 0" "$RC" "0"
assert_symlink_to "opencode: code-reviewer.md relinked into copy B" "$AD/code-reviewer.md" "$STAGE_B/apps/opencode-plugin/agents/code-reviewer.md"
assert_eq "opencode: after copy B no owned link points into copy A" \
  "$(for l in "$AD"/*.md; do [[ -L "$l" ]] && readlink "$l"; done | grep -c "$STAGE_A/")" "0"
assert_not_contains "opencode: copy B reinstall does not warn about its own links" "$OUT" "code-reviewer.md exists and is not massa-ai-owned"

# Profile switch (simulated exactly as the engine's repoint does), then reinstall.
STATE="$H/.config/massa-ai/install-state.json"
"$(command -v node || command -v bun)" -e '
  const fs = require("fs"); const f = process.argv[1];
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  s.platforms.opencode.modelProfile = { profile: "work", switchedAt: "2026-01-01T00:00:00Z" };
  fs.writeFileSync(f, JSON.stringify(s, null, 2));' "$STATE"
WORK_TARGET="$H/.config/opencode/plugins/massa-ai/agent-profiles/work/code-reviewer.md"
ln -sfn "$WORK_TARGET" "$AD/code-reviewer.md"
run_installer opencode "$STAGE_B" "$H" >/dev/null; RC=$?
assert_eq "opencode reinstall after a switch exits 0" "$RC" "0"
assert_symlink_to "opencode: code-reviewer.md still follows the recorded profile" "$AD/code-reviewer.md" "$WORK_TARGET"

# Delete copy A entirely and point one link back into it (dangling), then reinstall.
ln -sfn "$STAGE_A/apps/opencode-plugin/agents/designer.md" "$AD/designer.md"
rm -rf "$STAGE_A"
check "opencode: designer.md is now a dangling link" "$([ -L "$AD/designer.md" ] && [ ! -e "$AD/designer.md" ] && echo 0 || echo 1)"
OUT="$(run_installer opencode "$STAGE_B" "$H")"; RC=$?
assert_eq "opencode reinstall with a dangling link exits 0" "$RC" "0"
check "opencode: dangling designer.md relinked to a live target" "$([ -e "$AD/designer.md" ] && echo 0 || echo 1)"
assert_not_contains "opencode: dangling owned link is not reported as foreign" "$OUT" "designer.md exists and is not massa-ai-owned"

BEFORE="$(tree_fingerprint "$AD")"
run_installer opencode "$STAGE_B" "$H" >/dev/null
assert_eq "opencode: reinstall is a no-op on the agents dir" "$(tree_fingerprint "$AD")" "$BEFORE"

run_installer opencode "$STAGE_B" "$H" --uninstall >/dev/null; RC=$?
assert_eq "opencode uninstall exits 0" "$RC" "0"
check "opencode: foreign senior-engineer.md is byte-identical after uninstall" "$(cmp -s "$AD/senior-engineer.md" "$ROOT/senior-engineer-oc.orig" && echo 0 || echo 1)"
assert_symlink_to "opencode: user symlink survives uninstall" "$AD/judge.md" "$H/dotfiles/opencode/agents/judge.md"
assert_eq "opencode: only the three user entries remain" "$(ls "$AD" | LC_ALL=C sort | tr '\n' ' ')" "judge.md massa-ai-mine.md senior-engineer.md "

summary "installer agent ownership"
