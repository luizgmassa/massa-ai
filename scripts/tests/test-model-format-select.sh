#!/usr/bin/env bash
# ============================================================
#  massa-ai — LM Studio model-format selection contract (PDM-13)
#
#  Covers `installer_select_model_format` and `installer_ensure_mlx_runtime`
#  in scripts/lib/installer-feature-prompts.sh.
#
#  Three things a grep cannot observe, and all three were the reason this
#  suite exists:
#
#   1. The menu ORDER is OS-dependent — MLX first on macOS, GGUF first
#      everywhere else. `uname` is shimmed on PATH (prepended, never scrubbed
#      out) so both branches are measured on one machine.
#   2. The prompt reads from /dev/tty, so a pipe proves nothing about which
#      rung Enter actually selects. The pty harness below mirrors the one in
#      test-lms-model-exists.sh.
#   3. `installer_ensure_mlx_runtime` must be a no-op on GGUF and idempotent
#      on MLX. A stub `lms` records what it was asked to do.
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LIB_DIR="${REPO_ROOT}/scripts/lib"

PASS=0
FAIL=0
ok()   { echo "  ok - $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL - $*" >&2; FAIL=$((FAIL + 1)); }

check_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    ok "$label"
  else
    fail "$label (expected '${expected}', got '${actual}')"
  fi
}

check_contains() {
  local label="$1" needle="$2" haystack="$3"
  case "$haystack" in
    *"$needle"*) ok "$label" ;;
    *) fail "$label (no '${needle}' in: ${haystack})" ;;
  esac
}

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "${TMP_ROOT}"' EXIT

# ── uname shim ───────────────────────────────────────────────
# Prepended to PATH, never subtracted from it: a scrubbed PATH loses the
# interpreters the library itself needs (recorded incident — three suites read
# as "pre-existing broken" after a subtractive scrub).
# The two `local` lines are deliberately not one. Bash expands a `local`
# command's whole word list BEFORE performing any of its assignments, so
# `local os="$1" dir=".../${os}"` reads an unset `os` — under `set -u` that is
# an error the suite survives, leaving both shims in one directory named
# `shim-`. The second shim then overwrites the first and every OS-ordering
# assertion measures the same platform while still reporting green.
make_uname_shim() {
  local os="$1"
  local dir="${TMP_ROOT}/shim-${os}"
  mkdir -p "$dir"
  cat > "${dir}/uname" <<SHIMEOF
#!/usr/bin/env bash
if [ "\${1:-}" = "-s" ]; then echo "${os}"; else /usr/bin/uname "\$@"; fi
SHIMEOF
  chmod +x "${dir}/uname"
  printf '%s' "$dir"
}

DARWIN_SHIM="$(make_uname_shim Darwin)"
LINUX_SHIM="$(make_uname_shim Linux)"

# Each scenario gets its own bash and its own HOME: these functions set globals
# by design, which makes cross-case bleed the obvious failure mode, and an
# installer test must never reach the developer's real ~/.config.
run_lib() {
  local shim="$1" script="$2"
  shift 2
  env -i \
    PATH="${shim}:${PATH}" HOME="$TMP_ROOT" XDG_CONFIG_HOME="${TMP_ROOT}/xdg" \
    NO_START="${NO_START:-0}" \
    MASSA_AI_NONINTERACTIVE="${MASSA_AI_NONINTERACTIVE:-1}" \
    INFERENCE_PROVIDER="${INFERENCE_PROVIDER:-lmstudio}" \
    MASSA_AI_LMSTUDIO_MODEL_FORMAT="${MASSA_AI_LMSTUDIO_MODEL_FORMAT:-}" \
    "$@" \
    bash -c "
      die() { echo \"DIED:\$*\" >&2; exit 1; }
      . '${LIB_DIR}/installer-shared.sh'
      . '${LIB_DIR}/installer-feature-prompts.sh'
      ${script}
    " 2>&1
}

echo "── installer_select_model_format: env override ──"

check_eq "MASSA_AI_LMSTUDIO_MODEL_FORMAT=mlx selects mlx" "mlx" \
  "$(MASSA_AI_LMSTUDIO_MODEL_FORMAT=mlx run_lib "$DARWIN_SHIM" \
     'installer_select_model_format >/dev/null; echo "${LMSTUDIO_MODEL_FORMAT}"' | tail -1)"

check_eq "MASSA_AI_LMSTUDIO_MODEL_FORMAT=gguf selects gguf" "gguf" \
  "$(MASSA_AI_LMSTUDIO_MODEL_FORMAT=gguf run_lib "$DARWIN_SHIM" \
     'installer_select_model_format >/dev/null; echo "${LMSTUDIO_MODEL_FORMAT}"' | tail -1)"

# LIP-16's rule, applied to the new knob: an unrecognised value is fatal and
# names itself, never a silent default.
out="$(MASSA_AI_LMSTUDIO_MODEL_FORMAT=safetensors run_lib "$DARWIN_SHIM" \
  'installer_select_model_format; echo "REACHED:${LMSTUDIO_MODEL_FORMAT}"')"
check_contains "an unrecognised format dies naming the bad value" "safetensors" "$out"
case "$out" in
  *REACHED:*) fail "an unrecognised format kept going instead of dying" ;;
  *) ok "an unrecognised format stops the install" ;;
esac

# The warning is the whole reason the MLX branch is safe to offer: its
# embedding role is measured broken, and silence would leave the user with a
# config that indexes nothing.
warn="$(MASSA_AI_LMSTUDIO_MODEL_FORMAT=mlx run_lib "$DARWIN_SHIM" 'installer_select_model_format')"
check_contains "an MLX choice warns about /v1/embeddings" "No models loaded" "$warn"
check_contains "the MLX warning names the GGUF model to switch back to" \
  "text-embedding-qwen3-embedding-0.6b" "$warn"
check_eq "a GGUF choice prints no embedding warning" "" \
  "$(MASSA_AI_LMSTUDIO_MODEL_FORMAT=gguf run_lib "$DARWIN_SHIM" 'installer_select_model_format' \
     | grep -c 'No models loaded' | tr -d ' ' | sed 's/^0$//')"

echo "── installer_select_model_format: provider gating ──"

# Ollama has no MLX path at all (INFERENCE_PROVIDERS.ollama declares no
# mlxModels), so the function must not ask and must not leave the global unset.
check_eq "ollama never gets a format menu" "gguf" \
  "$(INFERENCE_PROVIDER=ollama MASSA_AI_NONINTERACTIVE=0 NO_START=0 \
     run_lib "$DARWIN_SHIM" 'installer_select_model_format >/dev/null; echo "${LMSTUDIO_MODEL_FORMAT}"' | tail -1)"
check_eq "an ollama run prints nothing about formats" "" \
  "$(INFERENCE_PROVIDER=ollama MASSA_AI_NONINTERACTIVE=0 NO_START=0 \
     run_lib "$DARWIN_SHIM" 'installer_select_model_format')"

echo "── installer_select_model_format: non-interactive ──"

# Deliberately gguf on BOTH platforms, not the platform's rung 1: an install
# with nobody at the terminal has no offer to make, and MLX is the branch whose
# embedding role is broken. A silent MLX pick would hand a CI run a config that
# cannot embed, with no one there to read the warning.
check_eq "non-interactive on macOS stays gguf, not the menu's rung 1" "gguf" \
  "$(MASSA_AI_NONINTERACTIVE=1 run_lib "$DARWIN_SHIM" \
     'installer_select_model_format >/dev/null; echo "${LMSTUDIO_MODEL_FORMAT}"' | tail -1)"
check_eq "non-interactive on Linux stays gguf" "gguf" \
  "$(MASSA_AI_NONINTERACTIVE=1 run_lib "$LINUX_SHIM" \
     'installer_select_model_format >/dev/null; echo "${LMSTUDIO_MODEL_FORMAT}"' | tail -1)"
check_contains "a non-interactive run says which format it kept" \
  "Non-interactive install — LM Studio model format: gguf" \
  "$(MASSA_AI_NONINTERACTIVE=1 run_lib "$DARWIN_SHIM" 'installer_select_model_format')"

echo "── installer_ensure_mlx_runtime ──"

# A stub lms: `runtime ls` reports whichever engine list the scenario sets, and
# every invocation is appended to a log so "did it try to install?" is an
# observation rather than an inference.
make_lms_stub() {
  local engines="$1" log="$2" path="${TMP_ROOT}/lms-stub-$$-${RANDOM}"
  cat > "$path" <<STUBEOF
#!/usr/bin/env bash
echo "\$*" >> '${log}'
if [ "\${1:-}" = "runtime" ] && [ "\${2:-}" = "ls" ]; then
  printf '%s\n' '${engines}'
  exit 0
fi
exit 0
STUBEOF
  chmod +x "$path"
  printf '%s' "$path"
}

LOG_A="${TMP_ROOT}/log-a"; : > "$LOG_A"
STUB_A="$(make_lms_stub "llama.cpp-mac-arm64-apple-metal-advsimd@2.41.0" "$LOG_A")"
check_eq "a gguf install never touches the runtime" "" \
  "$(LMSTUDIO_MODEL_FORMAT=gguf run_lib "$DARWIN_SHIM" \
     "LMSTUDIO_MODEL_FORMAT=gguf; installer_ensure_mlx_runtime '${STUB_A}'")"
check_eq "a gguf install issues no lms call at all" "0" "$(wc -l < "$LOG_A" | tr -d ' ')"

LOG_B="${TMP_ROOT}/log-b"; : > "$LOG_B"
STUB_B="$(make_lms_stub "llama.cpp-mac-arm64-apple-metal-advsimd@2.41.0" "$LOG_B")"
out_b="$(run_lib "$DARWIN_SHIM" "LMSTUDIO_MODEL_FORMAT=mlx; installer_ensure_mlx_runtime '${STUB_B}'")"
check_contains "an MLX install with no engine installs it" "MLX engine installed" "$out_b"
check_contains "and it does so via runtime get mlx-llm" "runtime get mlx-llm" "$(cat "$LOG_B")"

LOG_C="${TMP_ROOT}/log-c"; : > "$LOG_C"
STUB_C="$(make_lms_stub "mlx-llm-mac-arm64-apple-metal-advsimd@1.11.0" "$LOG_C")"
out_c="$(run_lib "$DARWIN_SHIM" "LMSTUDIO_MODEL_FORMAT=mlx; installer_ensure_mlx_runtime '${STUB_C}'")"
check_contains "an MLX install with the engine present says so" "already installed" "$out_c"
case "$(cat "$LOG_C")" in
  *"runtime get"*) fail "the engine was already present and it still ran runtime get" ;;
  *) ok "a present engine costs no runtime get" ;;
esac

check_contains "MLX with no lms CLI warns instead of dying silently" \
  "cannot verify the MLX engine" \
  "$(run_lib "$DARWIN_SHIM" 'LMSTUDIO_MODEL_FORMAT=mlx; installer_ensure_mlx_runtime ""')"

echo "── the menu order, on a real terminal ──"

# installer_select_model_format reads from /dev/tty, so a pipe proves nothing
# about which rung Enter selects. `script` allocates a pty; its flags differ
# between BSD and GNU, and a box with neither form skips rather than reporting
# a pass it did not measure. An empty read is retried, then FAILS — a silent
# skip here would be the OS-ordering assertions quietly not running, which
# reads exactly like a green suite.
PTY_FORM=""
for _attempt in 1 2 3; do
  if script -q /dev/null true </dev/null >/dev/null 2>&1; then PTY_FORM="bsd"; break; fi
  if script -qec true /dev/null </dev/null >/dev/null 2>&1; then PTY_FORM="gnu"; break; fi
  sleep 1
done
if [ -z "$PTY_FORM" ] && command -v script >/dev/null 2>&1; then
  fail "script(1) is installed but neither invocation form worked in 3 attempts"
fi

make_probe() {
  local shim="$1"
  # Split for the same reason as make_uname_shim above: a one-line `local`
  # would expand `$(basename "$shim")` against an unset `shim` and collapse
  # both probes onto one file.
  local path="${TMP_ROOT}/probe-$(basename "$shim").sh"
  cat > "$path" <<PROBEEOF
set -u
export PATH='${shim}:${PATH}'
die() { echo "DIED:\$*" >&2; exit 1; }
. '${LIB_DIR}/installer-shared.sh'
. '${LIB_DIR}/installer-feature-prompts.sh'
INFERENCE_PROVIDER=lmstudio
installer_select_model_format
echo "RESULT:\${LMSTUDIO_MODEL_FORMAT}"
PROBEEOF
  printf '%s' "$path"
}

pty_run() {
  local input_script="$1" probe="$2"
  case "$PTY_FORM" in
    bsd) { eval "$input_script"; } 2>/dev/null | script -q /dev/null bash "$probe" 2>/dev/null ;;
    gnu) { eval "$input_script"; } 2>/dev/null | script -qec "bash ${probe}" /dev/null 2>/dev/null ;;
    *) return 1 ;;
  esac
}

# The settling sleeps are not padding: without them the pty drops the first
# line and the answer lands a prompt late, which reads exactly like the menu
# ignoring input.
TYPE_2="sleep 1; printf '2\n'; sleep 0.4"
TYPE_ENTER="sleep 1; printf '\n'; sleep 0.4"

menu_out() {
  local probe="$1" keys="$2" attempt out
  for attempt in 1 2 3; do
    out="$(NO_START=0 MASSA_AI_NONINTERACTIVE=0 MASSA_AI_LMSTUDIO_MODEL_FORMAT="" \
      pty_run "$keys" "$probe" | tr -d '\r')"
    case "$out" in *RESULT:*) printf '%s' "$out"; return 0 ;; esac
    sleep 1
  done
  printf '%s' "$out"
  return 1
}

require_menu() {
  local label="$1" probe="$2" keys="$3" out
  if out="$(menu_out "$probe" "$keys")"; then
    printf '%s' "$out"
    return 0
  fi
  fail "${label}: the pty produced no RESULT line in 3 attempts"
  printf '%s' ""
  return 1
}

result_of() { printf '%s' "$1" | sed -n 's/.*RESULT:\([a-z]*\).*/\1/p' | tail -1; }

if [ -n "$PTY_FORM" ]; then
  MAC_PROBE="$(make_probe "$DARWIN_SHIM")"
  LNX_PROBE="$(make_probe "$LINUX_SHIM")"

  mac_enter="$(require_menu "macOS Enter" "$MAC_PROBE" "$TYPE_ENTER")"
  check_eq "on macOS, Enter takes rung 1 and that rung is MLX" "mlx" "$(result_of "$mac_enter")"
  check_contains "the macOS menu prints MLX as rung 1" "1) MLX" "$mac_enter"
  check_contains "the macOS menu prints GGUF as rung 2" "2) GGUF" "$mac_enter"

  mac_two="$(require_menu "macOS choice 2" "$MAC_PROBE" "$TYPE_2")"
  check_eq "on macOS, choosing 2 takes GGUF" "gguf" "$(result_of "$mac_two")"

  lnx_enter="$(require_menu "Linux Enter" "$LNX_PROBE" "$TYPE_ENTER")"
  check_eq "off macOS, Enter takes rung 1 and that rung is GGUF" "gguf" "$(result_of "$lnx_enter")"
  check_contains "the Linux menu prints GGUF as rung 1" "1) GGUF" "$lnx_enter"
  check_contains "the Linux menu prints MLX as rung 2" "2) MLX" "$lnx_enter"

  lnx_two="$(require_menu "Linux choice 2" "$LNX_PROBE" "$TYPE_2")"
  check_eq "off macOS, choosing 2 takes MLX" "mlx" "$(result_of "$lnx_two")"
  check_contains "the Linux MLX choice still warns about embeddings" "No models loaded" "$lnx_two"
else
  echo "  skip - no usable script(1); the pty menu-order assertions did not run"
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
