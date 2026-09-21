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
total=0

for f in scripts/tests/*.sh; do
  total=$((total + 1))
  if ! bash "$f"; then
    failed+=("$f")
  fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo ""
  echo "FAILED SHELL SUITES (${#failed[@]} of ${total}):"
  for f in "${failed[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

# Report the population on success too: a gate that prints nothing when it
# passes is indistinguishable from one that ran nothing at all.
echo ""
echo "SHELL SUITES: ${total} of ${total} passed"
exit 0
