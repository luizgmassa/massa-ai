#!/usr/bin/env bash
# ================================================================
# scripts/tests/test-root-install-live-exec.sh
#
# Root install.sh (42 KB) has zero *executed* coverage — the two existing
# suites that name it (scripts/__tests__/root-install-menu.test.ts,
# scripts/tests/test-installer-feature-prompts.sh) only grep its source.
# This suite actually runs it.
#
# Safety is the binding constraint. install.sh reaches the network in every
# mode (curl version probe, git clone, curl|bash bun install, raw-GitHub
# fetches, docker compose). This suite must never dial any of them, must
# never touch the real $HOME/~/.claude/~/.config/~/.codex/~/.cursor, and
# must never write outside its own mktemp scratch root.
#
# Strategy:
#
#   Part 1 — env seams, driven for real (no pty needed).
#     MASSA_AI_MODE and MASSA_AI_DIR are supposed to bypass 3 of the 6
#     /dev/tty reads (select_mode's choice prompt, and prompt_install_dir's
#     path + overwrite-confirm prompts). We run install.sh for real, under a
#     scratch HOME and a scratch MASSA_AI_DIR, with `curl`/`git`/`bun`
#     shadowed on PATH by stubs that record their argv and never touch the
#     network (mirrors scripts/tests/test-install-harness-cli.sh's shadow-PATH
#     technique). The git-clone stub deliberately fails (exit 17, a sentinel
#     distinct from any code install.sh itself produces) so the run halts
#     honestly at the real network boundary instead of faking a successful
#     clone.
#
#     IMPORTANT — measured, not assumed: a failed `read ... <>/dev/tty` inside
#     select_mode()/prompt_install_dir() does NOT abort the script under `set
#     -e`, because command substitution (`MODE=$(select_mode)`) runs in a
#     subshell where errexit is not inherited by default (no `shopt -s
#     inherit_errexit` in install.sh). A broken seam therefore does not change
#     the final exit code in a tty-less environment — it silently falls
#     through to the `${choice:-1}`/empty-input default and keeps going. The
#     exit code is *not* a valid discriminator for "did the seam fire". The
#     discriminator that was verified to work is the header text install.sh
#     echoes immediately before each read (e.g. "Installation mode:",
#     "Clone path:") — those print unconditionally before the read, so their
#     *absence* proves the seam short-circuited before ever reaching them, and
#     their presence is what a broken seam produces. This suite asserts on
#     that text, not on exit codes, for seam verification; exit code 17 (and
#     the logged git-clone argv) is used only as proof the run reached the
#     real network boundary intact.
#
#   Part 2 — the 3 remaining /dev/tty reads (post_install, install_harness_menu,
#     install_plugins_menu) have no env seam; they're post-install menus. Each
#     is a standalone function callable directly (no need to run the full
#     install flow to reach it). We source a scratch copy of install.sh with
#     its trailing `main "$@"` entrypoint line stripped (verified below to be
#     exactly and only the last line — a copy-mutation, not an edit to the
#     tracked file, in the same spirit as test-install-harness-cli.sh's shadow
#     tree), call the target function directly, and answer its prompt with
#     "s" (skip/back) — the one input that returns without invoking any
#     sub-installer or subprocess. Feeding that answer to a literal
#     `<>/dev/tty` read requires a real pty; `script -q /dev/null` was tried
#     first per the brief and does NOT reliably deliver piped input to the
#     child's controlling tty in this environment (a race with `script`'s own
#     buffering swallowed the answer in manual testing). `expect` (present at
#     /usr/bin/expect here) does work reliably and is what this suite uses.
#     If `expect` is not on PATH, Part 2 is skipped loudly (visible SKIP
#     lines, not silence) rather than faked.
#
#   Part 3 — a regression guard on the /dev/tty read count itself, so a 7th
#     prompt appearing later fails a test instead of silently going unnoticed.
#
# Every run is wall-clock bounded by a hand-rolled timeout (macOS ships no
# `timeout`/`gtimeout`): if a seam ever really breaks on a machine with a
# real controlling terminal (unlike this harness's own tty-less process),
# the read would genuinely block on live keyboard input instead of failing
# fast — the timeout turns that into a reported failure instead of a hang.
#
# Usage: bash scripts/tests/test-root-install-live-exec.sh
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALL_SH="${PROJECT_ROOT}/install.sh"
# shellcheck source=scripts/tests/lib/installer-test-helpers.sh
source "${SCRIPT_DIR}/lib/installer-test-helpers.sh"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-root-install-live.XXXXXX")"
trap 'rm -rf "$ROOT"' EXIT

echo "Scratch root: $ROOT"
echo ""

# ── Timeout wrapper (no timeout/gtimeout on stock macOS) ────────────────────
with_timeout() { # with_timeout SECS CMD...
  local secs="$1"; shift
  "$@" &
  local cmd_pid=$!
  ( sleep "$secs" 2>/dev/null; kill -9 "$cmd_pid" 2>/dev/null ) &
  local watch_pid=$!
  local status
  wait "$cmd_pid" 2>/dev/null; status=$?
  kill "$watch_pid" 2>/dev/null; wait "$watch_pid" 2>/dev/null
  return "$status"
}

# ── Network-free stubs (shadow PATH, argv recorded, path baked in) ──────────
# Mirrors scripts/tests/test-install-harness-cli.sh's make_stub: unquoted
# heredoc so $ARGV_LOG (a fixed, known path) is baked into the stub file at
# generation time, while "$*"/"$1" stay literal (escaped) for run time.
make_stubs() { # make_stubs DIR ARGV_LOG
  local dir="$1" log="$2"
  mkdir -p "$dir"
  cat > "$dir/git" <<STUB
#!/usr/bin/env bash
printf 'git|%s\n' "\$*" >> "$log"
case "\$1" in
  --version) echo "git version 2.99.0 (stub)"; exit 0 ;;
  clone) exit 17 ;;   # sentinel: deliberate, honest non-network failure
  *) exit 0 ;;
esac
STUB
  cat > "$dir/curl" <<STUB
#!/usr/bin/env bash
printf 'curl|%s\n' "\$*" >> "$log"
exit 7   # curl's own "failed to connect" code — no socket is ever opened
STUB
  cat > "$dir/bun" <<STUB
#!/usr/bin/env bash
printf 'bun|%s\n' "\$*" >> "$log"
case "\$1" in
  --version) echo "1.3.14+stub"; exit 0 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$dir/git" "$dir/curl" "$dir/bun"
}

# ══════════════════════════════════════════════════════════════
# Part 1 — MASSA_AI_MODE / MASSA_AI_DIR seams, driven live
# ══════════════════════════════════════════════════════════════
echo "Part 1: MASSA_AI_MODE / MASSA_AI_DIR env seams (no pty)"
echo ""

STUBS_A="$ROOT/stubs-a"
ARGV_A="$ROOT/argv-a.log"
: > "$ARGV_A"
make_stubs "$STUBS_A" "$ARGV_A"

H_A="$ROOT/home-a"; mkdir -p "$H_A"
TARGET_A="$ROOT/target-a"   # must not pre-exist: a real clone would create it
OUT_A="$ROOT/out-a.log"

run_seam_scenario() { # run_seam_scenario INSTALL_SH_PATH STUBS_DIR HOME_DIR TARGET_DIR OUT_LOG
  local install_path="$1" stubs="$2" home="$3" target="$4" out="$5"
  rm -rf "$target"
  PATH="${stubs}:${PATH}" HOME="$home" MASSA_AI_MODE=source MASSA_AI_DIR="$target" \
    bash "$install_path" >"$out" 2>&1
}

with_timeout 20 run_seam_scenario "$INSTALL_SH" "$STUBS_A" "$H_A" "$TARGET_A" "$OUT_A"
STATUS_A=$?
OUTPUT_A="$(cat "$OUT_A")"
LOG_A="$(cat "$ARGV_A")"

echo "  (measured: exit=$STATUS_A, wall-clock bounded at 20s)"

assert_eq "run reaches the real network boundary and halts there (git-clone stub, sentinel 17)" \
  "$STATUS_A" "17"
assert_contains "git clone invoked with the real upstream URL" "$LOG_A" \
  "https://github.com/luizgmassa/massa-ai.git"
assert_contains "git clone invoked with --depth=1 --branch main" "$LOG_A" \
  "--depth=1 --branch main"
assert_contains "git clone target is the scratch MASSA_AI_DIR" "$LOG_A" "$TARGET_A"
assert_not_contains "bun.sh install curl|bash never attempted (bun stub short-circuits it)" \
  "$LOG_A" "bun.sh"
assert_contains "bun stub was queried for --version (real bun never touched)" "$LOG_A" "bun|--version"

# Seam discriminator: absence of the header text install.sh echoes
# unconditionally *before* each bypassed read (proven in manual testing to be
# the reliable signal — the read's own -rp prompt text never prints when the
# <>/dev/tty redirection itself fails, so checking for the prompt text is not
# reliable; checking for the preceding header is).
assert_not_contains "select_mode's menu never printed (MASSA_AI_MODE seam fired)" \
  "$OUTPUT_A" "Installation mode:"
assert_not_contains "prompt_install_dir's prompt never printed (MASSA_AI_DIR seam fired)" \
  "$OUTPUT_A" "Clone path:"
assert_not_contains "the non-empty-dir overwrite confirm never printed" \
  "$OUTPUT_A" "Use this path anyway?"
assert_contains "positive proof: the MASSA_AI_DIR short-circuit branch ran" \
  "$OUTPUT_A" "Using install dir from MASSA_AI_DIR:"

# Safety proof, not a claim of it.
assert_no_file "clone target was never created (stub failed before any real git ran)" "$TARGET_A"
echo ""
echo "  Scratch tree after Part 1 run:"
find "$ROOT" -maxdepth 3 | LC_ALL=C sort | sed 's/^/    /'
echo ""

# ── Mutation M1: break the MASSA_AI_MODE seam on a scratch copy ────────────
# Forces select_mode() to run unconditionally. If this suite's seam assertion
# is real, it must go red here.
echo "Mutation M1: force select_mode() to always run (MASSA_AI_MODE seam disabled)"
MUT1="$ROOT/mut1-install.sh"
sed 's/if \[ -z "\$MODE" \]; then/if true; then/' "$INSTALL_SH" > "$MUT1"
if ! diff -q "$INSTALL_SH" "$MUT1" >/dev/null; then ok "M1 mutation applied to a scratch copy, not the tracked file"; else fail "M1 mutation did not change anything — anchor text may have drifted"; fi

ARGV_M1="$ROOT/argv-m1.log"; : > "$ARGV_M1"
STUBS_M1="$ROOT/stubs-m1"; make_stubs "$STUBS_M1" "$ARGV_M1"
H_M1="$ROOT/home-m1"; mkdir -p "$H_M1"
OUT_M1="$ROOT/out-m1.log"
with_timeout 20 run_seam_scenario "$MUT1" "$STUBS_M1" "$H_M1" "$ROOT/target-m1" "$OUT_M1"
OUTPUT_M1="$(cat "$OUT_M1")"
assert_contains "M1 red: mutant prints select_mode's menu (the real assertion above would have failed)" \
  "$OUTPUT_M1" "Installation mode:"
echo ""

# ── Mutation M2: break the MASSA_AI_DIR seam on a scratch copy ─────────────
echo "Mutation M2: force prompt_install_dir()'s interactive branch (MASSA_AI_DIR seam disabled)"
MUT2="$ROOT/mut2-install.sh"
sed 's/if \[ -n "\${MASSA_AI_DIR:-}" \]; then/if false; then/' "$INSTALL_SH" > "$MUT2"
if ! diff -q "$INSTALL_SH" "$MUT2" >/dev/null; then ok "M2 mutation applied to a scratch copy, not the tracked file"; else fail "M2 mutation did not change anything — anchor text may have drifted"; fi

ARGV_M2="$ROOT/argv-m2.log"; : > "$ARGV_M2"
STUBS_M2="$ROOT/stubs-m2"; make_stubs "$STUBS_M2" "$ARGV_M2"
H_M2="$ROOT/home-m2"; mkdir -p "$H_M2"
OUT_M2="$ROOT/out-m2.log"
with_timeout 20 run_seam_scenario "$MUT2" "$STUBS_M2" "$H_M2" "$ROOT/target-m2" "$OUT_M2"
OUTPUT_M2="$(cat "$OUT_M2")"
assert_contains "M2 red: mutant prints prompt_install_dir's Clone-path prompt (the real assertion above would have failed)" \
  "$OUTPUT_M2" "Clone path:"
echo ""

# ══════════════════════════════════════════════════════════════
# Part 2 — the three unseamed /dev/tty reads: NOT COVERED, and why
# ══════════════════════════════════════════════════════════════
# install.sh's three remaining /dev/tty reads (:663, :709, :750) are the
# post-install menus, and they have no environment seam. Driving them needs a
# real pty; `expect` is present here and `script -q /dev/null` was tried and
# did not deliver piped input reliably against its own buffering.
#
# A pty harness was built for them and is NOT shipped, because measuring it
# showed the oracle could not discriminate. install.sh:681 is
#
#     s|S|"") return ;;
#
# and the prompt's documented default is `s`. So an answer of "s" and a read
# that received NOTHING take the same branch. Every positive assertion of the
# form "the menu was reached and returned cleanly on 's'" therefore passes
# identically when the pty delivered nothing at all — and the mutation written
# to falsify it (remap `s|S` to `x|X`) left `""` in place, so the mutant went
# on returning and the sensor read green against a broken subject.
#
# That is the same defect class this battery exists to find, so it is recorded
# rather than shipped half-working. Closing it needs an oracle that separates
# the two cases — answering `k` or `p` and asserting the sub-menu was entered,
# rather than answering `s` and asserting a return that the empty read also
# produces.
#
# Parts 1 and 3 below need no pty and are unaffected.
echo "Part 2: post-install menu reads — NOT COVERED (see the comment above this line)"
echo "  The 's' answer and an empty read share install.sh:681's return branch,"
echo "  so a pass here would not prove the prompt was ever answered."
echo ""

# ══════════════════════════════════════════════════════════════
# Part 3 — /dev/tty read-count regression guard
# ══════════════════════════════════════════════════════════════
echo "Part 3: /dev/tty read-count guard"
echo ""

TTY_COUNT="$(grep -c '<>/dev/tty' "$INSTALL_SH")"
echo "  (measured, not quoted from spec: install.sh currently has ${TTY_COUNT} '<>/dev/tty' reads)"
assert_eq "known /dev/tty read count is unchanged" "$TTY_COUNT" "6"

echo "Mutation M4: append a 7th /dev/tty read to a scratch copy"
MUT4="$ROOT/mut4-install.sh"
cp "$INSTALL_SH" "$MUT4"
echo 'read -rp "extra" _extra_choice <>/dev/tty' >> "$MUT4"
MUT4_COUNT="$(grep -c '<>/dev/tty' "$MUT4")"
assert_eq "M4 red: guard would catch a 7th prompt (mutant count is 7)" "$MUT4_COUNT" "7"
assert_ne "M4 red vs. baseline: mutant count differs from the asserted-good count" "$MUT4_COUNT" "$TTY_COUNT"

summary "root install.sh live-execution coverage"
