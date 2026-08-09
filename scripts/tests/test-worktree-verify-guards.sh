#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-worktree-verify-guards.sh
#
# Guards the refusal surface of scripts/worktree-verify.sh — the parts that
# must stay true no matter how the gate list evolves. Deliberately does NOT
# run the gates themselves: those need a provisioned worktree, a database and
# several minutes, and exercising them here would make this suite the slowest
# thing in `bun run test:scripts` while testing bun and turbo rather than this
# script.
#
# What is guarded, and why each one is load-bearing:
#   1. --help exits 0 and names the flags. A usage screen that exits non-zero
#      breaks `cmd --help || true` habits and reads as a broken script.
#   2. An unknown flag exits 2, not 0 and not 1. Exit 1 means "a gate failed";
#      conflating a typo with a red gate is how a typo gets read as a
#      regression.
#   3. A non-git or missing path exits 2 rather than proceeding.
#   4. A dirty worktree is refused by default. This is the one that actually
#      matters: a gate run over uncommitted changes is not a reading of the
#      branch being merged, and this script exists to be trusted before a merge.
#   5. --allow-dirty overrides #4 — the escape hatch has to keep working, or
#      people stop using the script instead of stopping to commit.
#   6. The script never contains a destructive git verb. It runs against a tree
#      a developer is about to merge; `git checkout .` / `reset --hard` /
#      `clean -fd` / `stash` in here would be able to delete uncommitted work.
#
# Usage: bash scripts/tests/test-worktree-verify-guards.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SUBJECT="$PROJECT_ROOT/scripts/worktree-verify.sh"

PASS=0
FAIL=0

ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
nope() { printf '  \033[0;31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }

# Run the subject, capture only its exit code. Output is discarded: this suite
# asserts on the contract, not on wording that is expected to change.
exit_of() {
  bash "$SUBJECT" "$@" >/dev/null 2>&1
  echo $?
}

echo "Checking scripts/worktree-verify.sh guard surface..."
echo ""

[ -f "$SUBJECT" ] || { nope "subject not found at $SUBJECT"; exit 1; }

# 0. It must at least parse. A syntax error would make every exit-code
#    assertion below pass for the wrong reason (bash exits 2 on a parse error,
#    which is exactly the code cases 2-4 expect).
if bash -n "$SUBJECT" 2>/dev/null; then
  ok "parses under bash -n"
else
  nope "does not parse under bash -n — every exit-code assertion below would be meaningless"
  exit 1
fi

# 1. --help
code="$(exit_of --help)"
[ "$code" = "0" ] && ok "--help exits 0" || nope "--help exited $code, expected 0"

if bash "$SUBJECT" --help 2>/dev/null | grep -q -- "--allow-dirty"; then
  ok "--help documents --allow-dirty"
else
  nope "--help does not mention --allow-dirty"
fi

# 2. unknown flag → 2 (usage), never 1 (gate failure)
code="$(exit_of --definitely-not-a-flag)"
[ "$code" = "2" ] && ok "unknown flag exits 2 (usage), not 1 (gate failure)" \
                  || nope "unknown flag exited $code, expected 2"

# 3. a path that is not a directory / not a repo
code="$(exit_of /nonexistent-path-for-this-test)"
[ "$code" = "2" ] && ok "missing path exits 2" || nope "missing path exited $code, expected 2"

TMP_NONGIT="$(mktemp -d)"
code="$(exit_of "$TMP_NONGIT")"
[ "$code" = "2" ] && ok "non-git directory exits 2" || nope "non-git directory exited $code, expected 2"
rm -rf "$TMP_NONGIT"

# 4 & 5. Dirty-tree refusal, and its override.
#
# Built as a real linked worktree so the subject's own main-checkout resolution
# (git rev-parse --git-common-dir) runs for real. It is left UNPROVISIONED on
# purpose: with no node_modules the subject must still reach its provisioning
# refusal (exit 2) rather than a gate run — which is what makes the dirty check
# observable here without paying for a full gate pass.
DIRTY_WT="$(mktemp -d)/wt"
if git -C "$PROJECT_ROOT" worktree add --detach "$DIRTY_WT" HEAD >/dev/null 2>&1; then
  echo "scratch" > "$DIRTY_WT/DIRTY-MARKER.txt"

  out="$(bash "$SUBJECT" "$DIRTY_WT" 2>&1)"
  if printf '%s' "$out" | grep -qi "uncommitted changes"; then
    ok "dirty worktree is refused by default"
  else
    nope "dirty worktree was not refused (no 'uncommitted changes' in output)"
  fi

  # With --allow-dirty the dirty check must no longer be the thing that stops
  # it. The run still fails (unprovisioned), but for a different, later reason.
  out="$(bash "$SUBJECT" "$DIRTY_WT" --allow-dirty 2>&1)"
  if printf '%s' "$out" | grep -qi "uncommitted changes"; then
    nope "--allow-dirty did not suppress the dirty-tree refusal"
  else
    ok "--allow-dirty suppresses the dirty-tree refusal"
  fi

  git -C "$PROJECT_ROOT" worktree remove --force "$DIRTY_WT" >/dev/null 2>&1 || rm -rf "$DIRTY_WT"
  git -C "$PROJECT_ROOT" worktree prune >/dev/null 2>&1 || true
else
  nope "could not create a scratch worktree — dirty-tree guards not exercised"
fi

# 6. No destructive git verb anywhere in the subject.
#    Comments are source: a docblock that merely NAMES one of these would match,
#    which is intentional — it forces the prose to say "reset --hard" rather
#    than paste a runnable command into a file that runs against a real tree.
DESTRUCTIVE=0
while IFS= read -r pattern; do
  if grep -nE "$pattern" "$SUBJECT" >/dev/null 2>&1; then
    nope "subject contains a destructive git verb matching: $pattern"
    grep -nE "$pattern" "$SUBJECT" | sed 's/^/      /'
    DESTRUCTIVE=1
  fi
done <<'PATTERNS'
git[[:space:]]+reset[[:space:]]+--hard
git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f
git[[:space:]]+stash
git[[:space:]]+checkout[[:space:]]+\.
git[[:space:]]+push
PATTERNS
[ "$DESTRUCTIVE" -eq 0 ] && ok "contains no destructive git verb (reset --hard / clean -f / stash / checkout . / push)"

echo ""
echo "  Results: $PASS passed, $FAIL failed  ($((PASS + FAIL)) total)"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
