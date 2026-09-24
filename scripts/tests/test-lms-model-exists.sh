#!/usr/bin/env bash
# ============================================================
#  massa-ai — LM Studio installer surface (LIP-05, LIP-12, LIP-13, LIP-16)
#
#  Sibling of test-setup-ollama-model-exists.sh, which keeps
#  `ollama_model_exists` byte-identical. This one covers everything added
#  beside it:
#
#    - `lms_model_exists`      exact id matching against /v1/models
#    - `inference_model_exists` the provider dispatch (a THIRD function, so
#                              neither sibling grows a provider branch)
#    - `installer_detect_provider`  LIP-12, keyed on config.json's
#                              embedding.provider — never install-state.json
#    - `installer_select_provider`  LIP-16's fatal-unknown env override and
#                              LIP-13's symmetric migration menu
#    - `migrate_provider`      one body for both directions
#
#  The model-existence cases extract the real functions from the wizard and run
#  them against stubbed binaries; the provider cases source the real library.
#  Nothing here writes to the developer's HOME — every scenario runs with HOME
#  and XDG_CONFIG_HOME pointed at a scratch directory.
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SETUP_SCRIPT="${REPO_ROOT}/scripts/setup-local-first.sh"
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

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "${TMP_ROOT}"' EXIT

# ── Extraction ───────────────────────────────────────────────
# Same literal-sed idiom test-setup-ollama-model-exists.sh uses, applied to the
# two new functions. A silently truncated extraction is caught by `bash -n`
# rather than read as an empty-but-passing subject.
extract() {
  local name="$1" src
  src="$(sed -n "/^${name}()/,/^}/p" "$SETUP_SCRIPT")"
  if [ -z "$src" ]; then
    fail "${name} extracted from setup-local-first.sh (found nothing)"
    return 1
  fi
  if ! printf '%s\n' "$src" | bash -n 2>/dev/null; then
    fail "${name} extracted from setup-local-first.sh (not valid bash)"
    return 1
  fi
  printf '%s\n' "$src"
}

echo "LM Studio installer surface"

LMS_SRC="$(extract lms_model_exists)" || { echo "Results: ${PASS} passed, $((FAIL)) failed"; exit 1; }
OLLAMA_SRC="$(extract ollama_model_exists)" || { echo "Results: ${PASS} passed, $((FAIL)) failed"; exit 1; }
DISPATCH_SRC="$(extract inference_model_exists)" || { echo "Results: ${PASS} passed, $((FAIL)) failed"; exit 1; }
ok "lms_model_exists, ollama_model_exists and inference_model_exists all extract and parse"

# ── Stubs ────────────────────────────────────────────────────
STUB_DIR="${TMP_ROOT}/stubs"
mkdir -p "$STUB_DIR"

# One stub serving both listing dialects, chosen by the requested URL, so the
# dispatch cases can prove WHICH endpoint was consulted rather than only which
# answer came back.
cat > "${STUB_DIR}/curl" << 'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
  case "$arg" in
    *"/v1/models")
      printf '%s' '{"object":"list","data":[{"id":"text-embedding-nomic-embed-text-v1.5"},{"id":"qwen/qwen3-4b-2507"}]}'
      exit 0 ;;
    *"/api/tags")
      printf '%s' '{"models":[{"name":"qwen3-embedding:8b"},{"name":"bge-m3:latest"}]}'
      exit 0 ;;
  esac
done
exit 0
EOF
cat > "${STUB_DIR}/ollama" << 'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "${STUB_DIR}/curl" "${STUB_DIR}/ollama"

# run_lms <model> <break_python3 0|1>
run_lms() {
  local model="$1" break_python3="$2"
  if [ "$break_python3" = "1" ]; then
    printf '#!/usr/bin/env bash\nexit 1\n' > "${STUB_DIR}/python3"
    chmod +x "${STUB_DIR}/python3"
  else
    rm -f "${STUB_DIR}/python3"
  fi
  PATH="${STUB_DIR}:${PATH}" bash -c '
    LMSTUDIO_URL="http://stubbed/v1"
    eval "$1"
    lms_model_exists "$2"
  ' _ "$LMS_SRC" "$model" 2>/dev/null
}

if command -v python3 >/dev/null 2>&1; then
  ok "python3 available (the python3-branch labels below are honest)"
else
  fail "python3 not on PATH - the python3-branch cases would silently test the grep fallback"
fi

# ── lms_model_exists (LIP-05) ────────────────────────────────
check_eq "python3: an installed id matches"                 "yes" "$(run_lms 'text-embedding-nomic-embed-text-v1.5' 0)"
check_eq "python3: an absent id does not match"             "no"  "$(run_lms 'text-embedding-bge-m3' 0)"
check_eq "python3: a prefix of an installed id does not match" "no" "$(run_lms 'text-embedding-nomic-embed-text-v1' 0)"
check_eq "python3: an id with a slash matches exactly"      "yes" "$(run_lms 'qwen/qwen3-4b-2507' 0)"

check_eq "grep fallback: an installed id matches"           "yes" "$(run_lms 'text-embedding-nomic-embed-text-v1.5' 1)"
check_eq "grep fallback: an absent id does not match"       "no"  "$(run_lms 'text-embedding-bge-m3' 1)"
check_eq "grep fallback: a prefix of an installed id does not match" "no" "$(run_lms 'text-embedding-nomic-embed-text-v1' 1)"
check_eq "grep fallback: an id with a slash matches exactly" "yes" "$(run_lms 'qwen/qwen3-4b-2507' 1)"

# An unreachable endpoint must answer "no", never the empty string — the caller
# compares against the literal "yes" and an empty answer would read as "absent"
# only by accident.
EMPTY_CURL="${TMP_ROOT}/empty"
mkdir -p "$EMPTY_CURL"
printf '#!/usr/bin/env bash\nexit 7\n' > "${EMPTY_CURL}/curl"
chmod +x "${EMPTY_CURL}/curl"
out="$(PATH="${EMPTY_CURL}:${PATH}" bash -c '
  LMSTUDIO_URL="http://stubbed/v1"
  eval "$1"
  lms_model_exists "$2"
' _ "$LMS_SRC" 'text-embedding-nomic-embed-text-v1.5' 2>/dev/null)"
check_eq "an unreachable LM Studio answers a literal no" "no" "$out"

# ── inference_model_exists dispatch (LIP-05) ─────────────────
run_dispatch() {
  local provider="$1" model="$2"
  rm -f "${STUB_DIR}/python3"
  PATH="${STUB_DIR}:${PATH}" bash -c '
    OLLAMA_URL="http://stubbed"
    OLLAMA_HAS_CLI=false
    LMSTUDIO_URL="http://stubbed/v1"
    INFERENCE_PROVIDER="$4"
    eval "$1"
    eval "$2"
    eval "$3"
    inference_model_exists "$5"
  ' _ "$OLLAMA_SRC" "$LMS_SRC" "$DISPATCH_SRC" "$provider" "$model" 2>/dev/null
}

check_eq "lmstudio dispatches to the /v1/models listing" "yes" "$(run_dispatch lmstudio 'text-embedding-nomic-embed-text-v1.5')"
check_eq "lmstudio does not see Ollama's tags"           "no"  "$(run_dispatch lmstudio 'qwen3-embedding:8b')"
check_eq "ollama dispatches to the /api/tags listing"    "yes" "$(run_dispatch ollama 'qwen3-embedding:8b')"
check_eq "ollama does not see LM Studio's ids"           "no"  "$(run_dispatch ollama 'text-embedding-nomic-embed-text-v1.5')"
check_eq "an empty provider falls back to Ollama"        "yes" "$(run_dispatch '' 'qwen3-embedding:8b')"

# ── The `:500` LLM-enable decision (T12, PDM-06 AC-3) ────────
# `LLM_MODEL_PRESENT` gates MASSA_AI_LLM_ENABLED via installer_feature_flow:
# when the instruct model is not actually pulled, LLM features must stay off
# rather than writing a config that 404s on every call. Extracted by content
# anchor, not by function name — this decision is inline script, not a named
# function, and its surrounding line numbers drift release to release.
DECISION_SRC="$(sed -n '/^LLM_MODEL_PRESENT=false$/,/^fi$/p' "$SETUP_SCRIPT")"
if [ -z "$DECISION_SRC" ]; then
  fail "the :500 LLM-enable decision extracted from setup-local-first.sh (found nothing)"
else
  ok "the :500 LLM-enable decision extracted from setup-local-first.sh"
  case "$DECISION_SRC" in
    *'${LLM_MODEL:-qwen3-vl:8b}'*)
      ok "the enable decision falls back to the new instruct default (qwen3-vl:8b)" ;;
    *)
      fail "the enable decision does not fall back to qwen3-vl:8b — retired literal or extractor rotted" ;;
  esac

  run_decision() {
    local exists_answer="$1" llm_model="$2"
    EXISTS_ANSWER="$exists_answer" LLM_MODEL_INPUT="$llm_model" bash -c '
      inference_model_exists() { echo "$EXISTS_ANSWER"; }
      LLM_MODEL="$LLM_MODEL_INPUT"
      eval "$1"
      echo "$LLM_MODEL_PRESENT"
    ' _ "$DECISION_SRC" 2>/dev/null
  }

  check_eq "instruct model present -> LLM_MODEL_PRESENT=true (default id)" \
    "true" "$(run_decision yes '')"
  check_eq "instruct model absent -> LLM_MODEL_PRESENT stays false (default id)" \
    "false" "$(run_decision no '')"
  check_eq "instruct model present -> LLM_MODEL_PRESENT=true (explicit id)" \
    "true" "$(run_decision yes 'custom-instruct-model')"
  check_eq "instruct model absent -> LLM_MODEL_PRESENT stays false (explicit id)" \
    "false" "$(run_decision no 'custom-instruct-model')"
fi

# ── The `:344` dedup guard flip (T12, design R-09) ───────────
# Before this feature both LM Studio chat slots defaulted to the same id
# (qwen/qwen3-4b-2507), so `[ "$CODE_MODEL" != "$LLM_MODEL" ]` skipped the
# second pull. The new trio gives LM Studio distinct instruct/coding ids, so
# the guard must now read true (pull both) on that branch — asserted on the
# actual literals the lmstudio branch resolves to, not a re-implementation of
# the guard.
LMS_LLM_DEFAULT="$(grep -oE 'LLM_MODEL="\$\{MASSA_AI_LLM_MODEL:-[^}]+\}"' "$SETUP_SCRIPT" | sed -n '1p' | sed -E 's/.*:-([^}]+)\}.*/\1/')"
LMS_CODE_DEFAULT="$(grep -oE 'CODE_MODEL="\$\{MASSA_AI_LLM_CODE_MODEL:-[^}]+\}"' "$SETUP_SCRIPT" | sed -n '1p' | sed -E 's/.*:-([^}]+)\}.*/\1/')"
if [ -n "$LMS_LLM_DEFAULT" ] && [ -n "$LMS_CODE_DEFAULT" ]; then
  if [ "$LMS_LLM_DEFAULT" != "$LMS_CODE_DEFAULT" ]; then
    ok "the LM Studio dedup guard now pulls both models (${LMS_LLM_DEFAULT} != ${LMS_CODE_DEFAULT})"
  else
    fail "the LM Studio dedup guard still skips the code model (${LMS_LLM_DEFAULT} = ${LMS_CODE_DEFAULT})"
  fi
else
  fail "could not extract the LM Studio LLM_MODEL/CODE_MODEL defaults"
fi

# ── The caller contract the byte-identity AC does not cover ──
# test-setup-ollama-model-exists.sh injects OLLAMA_URL / OLLAMA_HAS_CLI itself,
# so byte-identity stays green even if the wizard renames the globals the real
# function reads and breaks the install at runtime. These assertions read the
# wizard, not the extracted function.
for global in OLLAMA_URL OLLAMA_HAS_CLI; do
  if grep -qE "^${global}=" "$SETUP_SCRIPT"; then
    ok "setup-local-first.sh still supplies ${global} to ollama_model_exists"
  else
    fail "setup-local-first.sh no longer assigns ${global} — ollama_model_exists breaks at runtime"
  fi
done
if grep -qE '^LMSTUDIO_URL=' "$SETUP_SCRIPT"; then
  ok "setup-local-first.sh supplies LMSTUDIO_URL to lms_model_exists"
else
  fail "setup-local-first.sh does not assign LMSTUDIO_URL — lms_model_exists breaks at runtime"
fi

# ── lms_cli_path: the false negative that actually happened (LIP-14) ─────────
# `lms` is not on PATH until LM Studio has bootstrapped it, so a detection that
# asks `command -v lms` first reports absent on a machine that has it. Both
# cases run against a scratch HOME; the real LM Studio installer is never run.
# A failed extraction must FAIL, not skip — and the reason the old form did not
# is subtler than it looks. `extract` DOES call `fail` when it finds nothing
# (`:52-56`), but it is invoked inside a command substitution, so that
# `FAIL=$((FAIL + 1))` lands in a SUBSHELL and is discarded. The message reaches
# stderr while the tally and the exit code stay green: measured by renaming the
# extracted function, the pre-fix form printed
# `FAIL - lms_cli_path_RENAMED ... (found nothing)` and still reported
# `Results: 53 passed, 0 failed` — 4 assertions gone, exit 0. A `fail` called
# from inside `$( )` is cosmetic.
#
# The three sibling extractions at `:68-70` are safe for a different reason:
# each guards with `|| { echo ...; exit 1; }`, so the exit code is correct even
# though their FAIL count is lost the same way. This one alone had `|| CLI_SRC=""`,
# which swallowed it entirely. The explicit `fail` below runs in the MAIN shell,
# where the counter survives — same intent as the PTY block at `:334-341`.
CLI_SRC="$(extract lms_cli_path)" || CLI_SRC=""
if [ -z "$CLI_SRC" ]; then
  fail "lms_cli_path could not be extracted from the wizard — the 4 LIP-14 assertions below did not run"
else
  FAKE_HOME="${TMP_ROOT}/lmshome"
  mkdir -p "${FAKE_HOME}/.lmstudio/bin"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${FAKE_HOME}/.lmstudio/bin/lms"
  chmod +x "${FAKE_HOME}/.lmstudio/bin/lms"

  PATH_ONLY_HOME="${TMP_ROOT}/lmshome-empty"
  PATH_STUB="${TMP_ROOT}/lmsbin"
  mkdir -p "$PATH_ONLY_HOME" "$PATH_STUB"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${PATH_STUB}/lms"
  chmod +x "${PATH_STUB}/lms"

  cli_case() {
    env -i PATH="$1" HOME="$2" bash -c "
      $CLI_SRC
      lms_cli_path
    " 2>/dev/null
  }

  # PATH deliberately carries no `lms`: this is the machine the AC names.
  check_eq "lms is found under ~/.lmstudio/bin when it is not on PATH" \
    "${FAKE_HOME}/.lmstudio/bin/lms" "$(cli_case "/usr/bin:/bin" "$FAKE_HOME")"
  check_eq "an on-PATH lms is still found when ~/.lmstudio is absent" \
    "${PATH_STUB}/lms" "$(cli_case "${PATH_STUB}:/usr/bin:/bin" "$PATH_ONLY_HOME")"
  # The bootstrapped copy wins: it is the one that matches the running daemon.
  check_eq "~/.lmstudio/bin/lms is preferred over an on-PATH copy" \
    "${FAKE_HOME}/.lmstudio/bin/lms" "$(cli_case "${PATH_STUB}:/usr/bin:/bin" "$FAKE_HOME")"
  check_eq "no lms anywhere echoes nothing" \
    "" "$(cli_case "/usr/bin:/bin" "$PATH_ONLY_HOME")"
fi

# ── installer_detect_provider (LIP-12) ───────────────────────
# Every scenario gets its own bash and its own HOME: the selection functions
# set globals by design, which makes cross-case bleed the obvious failure mode,
# and an installer test must never reach the developer's real ~/.config.
run_lib() {
  local script="$1"
  shift
  env -i \
    PATH="$PATH" HOME="$TMP_ROOT" XDG_CONFIG_HOME="${TMP_ROOT}/xdg" \
    NO_START="${NO_START:-0}" \
    MASSA_AI_NONINTERACTIVE="${MASSA_AI_NONINTERACTIVE:-1}" \
    MASSA_AI_INFERENCE_PROVIDER="${MASSA_AI_INFERENCE_PROVIDER:-}" \
    "$@" \
    bash -c "
      die() { echo \"DIED:\$*\" >&2; exit 1; }
      . '${LIB_DIR}/installer-shared.sh'
      . '${LIB_DIR}/installer-feature-prompts.sh'
      ${script}
    " 2>&1 | tail -1
}

write_cfg() {
  local path="$1" provider="$2"
  mkdir -p "$(dirname "$path")"
  # No `dimensions` key: a literal width inside an embedding block makes this
  # fixture read as a width-writing surface to embedding-defaults-parity's
  # Tier-3 completeness scan, and installer_detect_provider reads only
  # `embedding.provider` anyway.
  printf '{ "embedding": { "provider": "%s", "model": "m" } }\n' "$provider" > "$path"
}

CFG_OLLAMA="${TMP_ROOT}/cfg-ollama.json"; write_cfg "$CFG_OLLAMA" ollama
CFG_LMS="${TMP_ROOT}/cfg-lms.json";       write_cfg "$CFG_LMS" lmstudio
CFG_API="${TMP_ROOT}/cfg-api.json";       write_cfg "$CFG_API" mistral
CFG_BAD="${TMP_ROOT}/cfg-bad.json";       echo '{ this is not json' > "$CFG_BAD"
CFG_EMPTY="${TMP_ROOT}/cfg-empty.json";   echo '{ "database": {} }' > "$CFG_EMPTY"

check_eq "a stored ollama provider is detected"        "ollama"   "$(run_lib "installer_detect_provider '${CFG_OLLAMA}'")"
check_eq "a stored lmstudio provider is detected"      "lmstudio" "$(run_lib "installer_detect_provider '${CFG_LMS}'")"
check_eq "an API provider reports 'other', not a local one" "other" "$(run_lib "installer_detect_provider '${CFG_API}'")"
check_eq "an absent config.json is a fresh install"    "fresh"    "$(run_lib "installer_detect_provider '${TMP_ROOT}/nope.json'")"
check_eq "a malformed config.json is a fresh install"  "fresh"    "$(run_lib "installer_detect_provider '${CFG_BAD}'")"
check_eq "a config.json with no embedding block is fresh" "fresh" "$(run_lib "installer_detect_provider '${CFG_EMPTY}'")"

# install-state.json names no provider; keying on it would detect nothing.
# Scoped to the function body with comments stripped: the docblock states the
# rule by naming the file, and a whole-file grep matches its own prohibition.
if sed -n '/^installer_detect_provider()/,/^}/p' "${LIB_DIR}/installer-feature-prompts.sh" \
   | sed 's/#.*//' | grep -q 'install-state'; then
  fail "installer_detect_provider reads install-state.json (LIP-12 forbids it)"
else
  ok "provider detection never reads install-state.json"
fi

# ── installer_select_provider: env override (LIP-16) ─────────
check_eq "MASSA_AI_INFERENCE_PROVIDER=lmstudio selects it" "lmstudio" \
  "$(MASSA_AI_INFERENCE_PROVIDER=lmstudio run_lib 'installer_select_provider fresh; echo "${INFERENCE_PROVIDER}"')"
check_eq "MASSA_AI_INFERENCE_PROVIDER=ollama selects it" "ollama" \
  "$(MASSA_AI_INFERENCE_PROVIDER=ollama run_lib 'installer_select_provider fresh; echo "${INFERENCE_PROVIDER}"')"
check_eq "the env override records the provider it migrates away from" "ollama" \
  "$(MASSA_AI_INFERENCE_PROVIDER=lmstudio run_lib 'installer_select_provider ollama; echo "${INFERENCE_PROVIDER_FROM}"')"
check_eq "choosing the provider already installed is not a migration" "" \
  "$(MASSA_AI_INFERENCE_PROVIDER=ollama run_lib 'installer_select_provider ollama; echo "FROM[${INFERENCE_PROVIDER_FROM}]"' | sed 's/FROM\[\(.*\)\]/\1/')"

# The whole point of LIP-16's "never default silently": a typo must be fatal
# and must name itself.
out="$(MASSA_AI_INFERENCE_PROVIDER=llamacpp run_lib 'installer_select_provider fresh; echo "REACHED:${INFERENCE_PROVIDER}"')"
case "$out" in
  *"DIED:"*llamacpp*) ok "an unrecognised MASSA_AI_INFERENCE_PROVIDER dies naming the bad value" ;;
  *) fail "an unrecognised MASSA_AI_INFERENCE_PROVIDER did not die naming the value (got '${out}')" ;;
esac
case "$out" in
  *REACHED:*) fail "execution continued past the unrecognised provider value" ;;
  *) ok "nothing runs after the unrecognised provider value" ;;
esac

# ── installer_select_provider: non-interactive (LIP-16) ──────
check_eq "non-interactive on an ollama install keeps ollama" "ollama" \
  "$(run_lib 'installer_select_provider ollama; echo "${INFERENCE_PROVIDER}"' | sed 's/.*provider: //')"
check_eq "non-interactive on a fresh install defaults to ollama" "ollama" \
  "$(run_lib 'installer_select_provider fresh; echo "${INFERENCE_PROVIDER}"' | sed 's/.*provider: //')"
check_eq "non-interactive never invents a migration" "" \
  "$(run_lib 'installer_select_provider lmstudio; echo "FROM[${INFERENCE_PROVIDER_FROM}]"' | sed 's/FROM\[\(.*\)\]/\1/')"
check_eq "an API-provider install is left alone, with no provider chosen" "" \
  "$(run_lib 'installer_select_provider other; echo "P[${INFERENCE_PROVIDER}]"' | sed 's/P\[\(.*\)\]/\1/')"

# ── migrate_provider: one body, both directions (LIP-13) ─────
fwd="$(run_lib 'migrate_provider ollama lmstudio' 2>/dev/null; true)"
rev="$(run_lib 'migrate_provider lmstudio ollama' 2>/dev/null; true)"
fwd_all="$(env -i PATH="$PATH" HOME="$TMP_ROOT" bash -c ". '${LIB_DIR}/installer-feature-prompts.sh'; migrate_provider ollama lmstudio")"
rev_all="$(env -i PATH="$PATH" HOME="$TMP_ROOT" bash -c ". '${LIB_DIR}/installer-feature-prompts.sh'; migrate_provider lmstudio ollama")"
case "$fwd_all" in *"ollama → lmstudio"*) ok "migrate_provider announces the ollama → lmstudio direction" ;; *) fail "migrate_provider lost the ollama → lmstudio direction" ;; esac
case "$rev_all" in *"lmstudio → ollama"*) ok "migrate_provider announces the lmstudio → ollama direction" ;; *) fail "migrate_provider lost the lmstudio → ollama direction" ;; esac
# Same body both ways: swapping the arguments must swap exactly the two names
# and change nothing else, or the two directions have drifted into two bodies.
check_eq "both directions are the same text with the names swapped" \
  "$(printf '%s' "$rev_all" | sed 's/lmstudio/@/g; s/ollama/#/g')" \
  "$(printf '%s' "$fwd_all" | sed 's/ollama/@/g; s/lmstudio/#/g')"
case "$fwd_all" in *"index --force"*) ok "the migration names the re-index command (LIP-15 recovery)" ;; *) fail "the migration does not name the re-index command" ;; esac

# ── The symmetric menu, on a real terminal (LIP-13) ──────────
# installer_select_provider reads from /dev/tty, so a pipe proves nothing about
# the menu. `script` allocates a pty; its flags differ between BSD and GNU, and
# a box with neither form skips rather than reporting a pass it did not measure.
#
# The skip is for a box with NO usable `script`. It is deliberately not the
# handler for an empty pty read: this block produced a silent 40-passed/0-failed
# run once during development, which is 13 assertions quietly not running and
# reading exactly like a green suite. Where a `script` form exists, an empty
# read is retried and then FAILS.
# The form probe reads </dev/null deliberately. Measured: with the harness's
# own stdin inherited, `script -q /dev/null true` returns 1 on macOS and the
# whole block took the skip branch — a silent 40-passed/0-failed run that is 13
# assertions quietly not running. Redirected, it is 0 every time.
PTY_FORM=""
for _attempt in 1 2 3; do
  if script -q /dev/null true </dev/null >/dev/null 2>&1; then PTY_FORM="bsd"; break; fi
  if script -qec true /dev/null </dev/null >/dev/null 2>&1; then PTY_FORM="gnu"; break; fi
  sleep 1
done
if [ -z "$PTY_FORM" ] && command -v script >/dev/null 2>&1; then
  fail "script(1) is installed but neither invocation form worked in 3 attempts"
fi

pty_run() {
  local input_script="$1" probe="$2"
  case "$PTY_FORM" in
    bsd) { eval "$input_script"; } 2>/dev/null | script -q /dev/null bash "$probe" 2>/dev/null ;;
    gnu) { eval "$input_script"; } 2>/dev/null | script -qec "bash ${probe}" /dev/null 2>/dev/null ;;
    *) return 1 ;;
  esac
}

make_probe() {
  local detected="$1" path="${TMP_ROOT}/probe-${1}.sh"
  cat > "$path" <<PROBEEOF
set -u
die() { echo "DIED:\$*" >&2; exit 1; }
. '${LIB_DIR}/installer-shared.sh'
. '${LIB_DIR}/installer-feature-prompts.sh'
installer_select_provider ${detected}
echo "RESULT:\${INFERENCE_PROVIDER}|\${INFERENCE_PROVIDER_FROM}"
PROBEEOF
  printf '%s' "$path"
}

# The settling sleeps are not padding: without them the pty drops the first
# line and the answer lands a prompt late, which reads exactly like the menu
# ignoring input.
TYPE_2="sleep 1; printf '2\n'; sleep 0.4"
TYPE_ENTER="sleep 1; printf '\n'; sleep 0.4"

# Retries because the pty occasionally hands back nothing under load. Three
# empty reads in a row is reported as a failure by the caller, never as a skip.
menu_out() {
  local probe="$1" keys="$2" attempt out
  for attempt in 1 2 3; do
    out="$(NO_START=0 MASSA_AI_NONINTERACTIVE=0 MASSA_AI_INFERENCE_PROVIDER="" \
      pty_run "$keys" "$probe" | tr -d '\r')"
    case "$out" in *RESULT:*) printf '%s' "$out"; return 0 ;; esac
    sleep 1
  done
  printf '%s' "$out"
  return 1
}

# require_menu <label> <probe> <keys> — echoes the pty output, failing loudly
# when the run produced no RESULT line at all.
require_menu() {
  local label="$1" probe="$2" keys="$3" out
  if out="$(menu_out "$probe" "$keys")"; then
    printf '%s' "$out"
    return 0
  fi
  fail "${label} (pty produced no RESULT line in 3 attempts; assertions not measured)"
  return 1
}

PROBE_FRESH="$(make_probe fresh)"
PROBE_OLLAMA="$(make_probe ollama)"
PROBE_LMS="$(make_probe lmstudio)"
PROBE_OTHER="$(make_probe other)"

if [ -z "$PTY_FORM" ]; then
  echo "  skip - no usable script(1) for a pty; the interactive menu is unmeasured"
elif raw="$(require_menu 'fresh install menu' "$PROBE_FRESH" "$TYPE_2")"; then
  check_eq "fresh install: both providers offered, 2 picks LM Studio" "RESULT:lmstudio|" "$(grep -o 'RESULT:.*' <<< "$raw")"
  case "$raw" in *"1) Ollama"*) ok "fresh install: Ollama is offered" ;; *) fail "fresh install: Ollama is not offered" ;; esac
  case "$raw" in *"2) LM Studio"*) ok "fresh install: LM Studio is offered" ;; *) fail "fresh install: LM Studio is not offered" ;; esac

  raw="$(require_menu 'on-ollama menu' "$PROBE_OLLAMA" "$TYPE_2")" || raw=""
  check_eq "on ollama: the only other entry is LM Studio, and choosing it is a migration" \
    "RESULT:lmstudio|ollama" "$(grep -o 'RESULT:.*' <<< "$raw")"
  case "$raw" in *"Migrate to lmstudio"*) ok "on ollama: the second entry is the LM Studio migration" ;; *) fail "on ollama: no LM Studio migration entry" ;; esac
  case "$raw" in *"Migrate to ollama"*) fail "on ollama: offered a migration to the provider already in use" ;; *) ok "on ollama: ollama is not offered as a migration target" ;; esac

  raw="$(require_menu 'on-lmstudio menu' "$PROBE_LMS" "$TYPE_2")" || raw=""
  check_eq "on lmstudio: the only other entry is Ollama, and choosing it is a migration" \
    "RESULT:ollama|lmstudio" "$(grep -o 'RESULT:.*' <<< "$raw")"
  case "$raw" in *"Migrate to ollama"*) ok "on lmstudio: the second entry is the Ollama migration" ;; *) fail "on lmstudio: no Ollama migration entry" ;; esac
  case "$raw" in *"Migrate to lmstudio"*) fail "on lmstudio: offered a migration to the provider already in use" ;; *) ok "on lmstudio: lmstudio is not offered as a migration target" ;; esac

  check_eq "on ollama: Enter keeps ollama and is not a migration" "RESULT:ollama|" \
    "$(require_menu 'on-ollama Enter' "$PROBE_OLLAMA" "$TYPE_ENTER" | grep -o 'RESULT:.*')"
  check_eq "on lmstudio: Enter keeps lmstudio and is not a migration" "RESULT:lmstudio|" \
    "$(require_menu 'on-lmstudio Enter' "$PROBE_LMS" "$TYPE_ENTER" | grep -o 'RESULT:.*')"

  # The API-provider case shows no menu at all, so its RESULT line arrives
  # without any prompt: menu_out's RESULT check still makes an empty read loud.
  raw="$(require_menu 'API-provider path' "$PROBE_OTHER" "$TYPE_2")" || raw=""
  check_eq "an API provider gets no menu and no provider" "RESULT:|" "$(grep -o 'RESULT:.*' <<< "$raw")"
  case "$raw" in *"Enter your choice"*) fail "an API-provider install was shown a menu" ;; *) ok "an API-provider install is shown no menu" ;; esac
fi

echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
