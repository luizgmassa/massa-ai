#!/usr/bin/env bash
# ================================================================
# scripts/run-shell-suites.sh
#
# Runs every scripts/tests/*.sh suite to completion, even when one fails, and
# reports every failing suite together. `bun run test:scripts`'s shell half
# used to be a for-loop with `|| exit 1` on each iteration, so a failure in
# suite 16 of 39 aborted the run and hid the remaining 23 suites — including
# any other failures among them. This script removes that early exit: each
# suite runs regardless of its siblings' outcome, and the aggregate exit code
# is non-zero if any suite failed.
# ================================================================
set -u

failed=()

for f in scripts/tests/*.sh; do
  if ! bash "$f"; then
    failed+=("$f")
  fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo ""
  echo "FAILED SHELL SUITES (${#failed[@]} of $(ls scripts/tests/*.sh | wc -l | tr -d ' ')):"
  for f in "${failed[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

exit 0
