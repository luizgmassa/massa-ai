#!/usr/bin/env bash
# ================================================================
# scripts/tests/lib/installer-test-helpers.sh
#
# Shared harness for the installer bash suites. Source it; do not run it.
# Lives under lib/ so the `scripts/tests/*.sh` glob in package.json does not
# try to execute it as a suite.
#
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-test-helpers.sh"
#
# Provides ok/fail counters, assertions, a scratch root with EXIT cleanup, and
# mock agent binaries so install-skills.sh's PATH detection is deterministic.
# ================================================================

PASS=0
FAIL=0
ERRORS=()

GREEN='\033[0;32m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $*"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL + 1)); ERRORS+=("$*"); }

check() { # check LABEL CONDITION_EXIT_CODE
  if [ "$2" -eq 0 ]; then ok "$1"; else fail "$1"; fi
}

assert_eq() { # assert_eq LABEL ACTUAL EXPECTED
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1  →  got='$2'  want='$3'"; fi
}

assert_ne() { # assert_ne LABEL ACTUAL NOT_EXPECTED
  if [ "$2" != "$3" ]; then ok "$1"; else fail "$1  →  got '$2', expected something else"; fi
}

assert_contains() { # assert_contains LABEL HAYSTACK NEEDLE
  case "$2" in
    *"$3"*) ok "$1" ;;
    *) fail "$1  →  '$3' not found in output" ;;
  esac
}

assert_not_contains() { # assert_not_contains LABEL HAYSTACK NEEDLE
  case "$2" in
    *"$3"*) fail "$1  →  '$3' unexpectedly present" ;;
    *) ok "$1" ;;
  esac
}

assert_file() { # assert_file LABEL PATH
  if [ -f "$2" ]; then ok "$1"; else fail "$1  →  missing file: $2"; fi
}

assert_no_file() { # assert_no_file LABEL PATH
  if [ ! -e "$2" ]; then ok "$1"; else fail "$1  →  unexpected file: $2"; fi
}

assert_symlink_to() { # assert_symlink_to LABEL LINK EXPECTED_TARGET
  if [ ! -L "$2" ]; then fail "$1  →  not a symlink: $2"; return; fi
  local resolved
  resolved="$(cd "$(dirname "$2")" && readlink "$2")"
  assert_eq "$1" "$resolved" "$3"
}

# Recursive fingerprint of a tree: names + types + file contents. Used to prove
# that --check / --dry-run mutate nothing at all, which is a stronger claim than
# "the exit code was 0".
tree_fingerprint() { # tree_fingerprint DIR
  local root="$1"
  {
    find "$root" | LC_ALL=C sort | while IFS= read -r p; do
      if [ -L "$p" ]; then
        printf 'L %s -> %s\n' "${p#"$root"}" "$(readlink "$p")"
      elif [ -d "$p" ]; then
        printf 'D %s\n' "${p#"$root"}"
      else
        printf 'F %s %s\n' "${p#"$root"}" "$(shasum -a 256 "$p" | cut -d' ' -f1)"
      fi
    done
  } | shasum -a 256 | cut -d' ' -f1
}

# Mock agent executables so install-skills.sh's `command -v` detection is
# deterministic on any machine (CI has none of these installed; a dev box may
# have some). The real PATH stays appended so node/bun/mktemp still resolve.
make_mock_agents() { # make_mock_agents DIR [names...]
  local dir="$1"; shift
  local names=("$@")
  [ ${#names[@]} -gt 0 ] || names=(claude codex cursor-agent opencode)
  mkdir -p "$dir"
  local n
  for n in "${names[@]}"; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "$dir/$n"
    chmod +x "$dir/$n"
  done
  echo "$dir"
}

summary() { # summary SUITE_NAME
  echo ""
  echo -e "${BOLD}────────────────────────────────────────${NC}"
  echo -e "  ${1:-suite}: ${GREEN}${PASS}${NC} passed, ${RED}${FAIL}${NC} failed  ($((PASS + FAIL)) total)"
  if [ "${#ERRORS[@]}" -gt 0 ]; then
    echo ""
    echo -e "  ${RED}Failed:${NC}"
    local e
    for e in "${ERRORS[@]}"; do echo "    - $e"; done
    echo ""
    exit 1
  fi
  echo ""
  exit 0
}
