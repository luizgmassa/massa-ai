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
#
# TRAILING-SLASH TMPDIR. Every suite builds its scratch root as
# `mktemp -d "${TMPDIR:-/tmp}/name.XXXXXX"`. On macOS the default TMPDIR ends in
# `/`, so that template yields `…/T//name` and `mktemp` returns the double slash
# intact. Node's `path.join` normalises it away inside rendered output, so an
# assertion comparing a path literally sees `T//…` on one side and `T/…` on the
# other and fails — 4 failures in the bootstrap-file suite, 3 in the cli suite,
# on macOS only.
#
# It stayed invisible because `bun run test:scripts` chains
# `bun test … && for f in scripts/tests/*.sh`, and two unrelated bun failures
# aborted that chain before any shell suite ran. The battery was only ever
# reached by hand, with an explicit `TMPDIR=/tmp`. With the bun phase green the
# whole battery now runs in CI, and a gate should not depend on a caller
# convention.
#
# Normalised here once rather than at 26 call sites: every suite that uses this
# template sources this helper *before* calling `mktemp`, verified by comparing
# the two line numbers across `scripts/tests/*.sh`. Two suites source no helper
# (`test-installer-env-race-safety.sh`, `test-setup-local-first-api-key.sh`);
# neither compares a path literally, and both are green either way.
# ================================================================

if [ -n "${TMPDIR:-}" ]; then
  TMPDIR="${TMPDIR%/}"
  export TMPDIR
fi

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

# A PATH that carries the JS runtimes and nothing else, for scenarios that must
# prove the "no host CLI installed" branch. Subtracting the host CLI's directory
# from the live PATH cannot do this: on a dev box `node` and `claude` commonly
# share one bin dir (~/.local/bin), so the subtraction removes the runtime too —
# and `command -v` reports only the first hit, so a CLI installed twice
# (~/.local/bin plus /opt/homebrew/bin) survives the subtraction anyway. A
# positive list of symlinks has neither failure mode.
runtime_shim_path() { # runtime_shim_path DIR → PATH value
  local dir="$1" bin src
  mkdir -p "$dir"
  for bin in node bun npm npx; do
    src="$(command -v "$bin" 2>/dev/null)" || continue
    [ -n "$src" ] && ln -sf "$src" "$dir/$bin"
  done
  echo "$dir:/usr/bin:/bin"
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

# Checkout-shaped stage of one plugin bundle for installer tests that need a
# bundle they may shape freely (never the shared, real apps/<host>-plugin):
# <stage>/scripts and every bundle entry except agents/ and agent-profiles/
# are symlinks into the real checkout; those two are real copies with any
# legacy `massa-ai-` file prefix dropped, so the stage ships unprefixed agent
# names whether or not the generator still emits the prefix. Codex and Cursor
# read the shared hook binary from apps/claude-plugin, so it is linked too.
# Callers set MASSA_AI_SKIP_ARTIFACT_GENERATION=1 (the linked scripts/ would
# otherwise regenerate the real bundle) and define PROJECT_ROOT.
stage_plugin_bundle() { # stage_plugin_bundle HOST STAGE_ROOT
  local host="$1" stage="$2"
  local src="$PROJECT_ROOT/apps/$host-plugin" dest="$2/apps/$1-plugin" entry profile
  mkdir -p "$dest"
  ln -s "$PROJECT_ROOT/scripts" "$stage/scripts"
  [ "$host" = claude ] || ln -s "$PROJECT_ROOT/apps/claude-plugin" "$stage/apps/claude-plugin"
  for entry in "$src"/* "$src"/.[!.]*; do
    [ -e "$entry" ] || continue
    case "$(basename "$entry")" in agents|agent-profiles|node_modules|.turbo) continue ;; esac
    ln -s "$entry" "$dest/$(basename "$entry")"
  done
  _copy_agents_unprefixed "$src/agents" "$dest/agents"
  for profile in "$src/agent-profiles"/*; do
    [ -d "$profile" ] || continue
    _copy_agents_unprefixed "$profile" "$dest/agent-profiles/$(basename "$profile")"
  done
}

_copy_agents_unprefixed() { # _copy_agents_unprefixed SRC_DIR DEST_DIR
  local f b
  mkdir -p "$2"
  for f in "$1"/*; do
    [ -f "$f" ] || continue
    b="$(basename "$f")"
    cp "$f" "$2/${b#massa-ai-}"
  done
}
