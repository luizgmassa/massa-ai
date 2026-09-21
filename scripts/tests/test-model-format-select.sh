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
# Asserted in two halves on purpose. `grep -c ... | sed 's/^0$//'` alone also
# yields "" when run_lib produced no output at all, so a sourcing failure would
# have read as a pass.
gguf_out="$(MASSA_AI_LMSTUDIO_MODEL_FORMAT=gguf run_lib "$DARWIN_SHIM" \
  'installer_select_model_format; echo "SENTINEL:${LMSTUDIO_MODEL_FORMAT}"')"
check_contains "the gguf run actually executed" "SENTINEL:gguf" "$gguf_out"
case "$gguf_out" in
  *"No models loaded"*) fail "a GGUF choice printed the MLX embedding warning" ;;
  *) ok "a GGUF choice prints no embedding warning" ;;
esac

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

echo "── installer_resolve_lmstudio_models: the id/fetch split ──"

# The id written to config.json and the spec handed to `lms get` are NOT the
# same string on the MLX path, and each MLX substitution is gated on its own
# override variable. The first version of that block gated only the id: an
# explicit LMSTUDIO_EMBEDDING_MODEL wrote the user's id into config.json while
# `lms get` still pulled the MLX repo, and the progress line then named a model
# that was never fetched. Nothing in the suite could see it, because nothing
# exercised the third argument at all.
#
# That combination is the documented recovery from the MLX embedding defect —
# installer_warn_mlx_embedding tells the user to make exactly this change — so
# it is the case that must not regress.
resolve() {
  local vars="$1"
  run_lib "$DARWIN_SHIM" "${vars}
    installer_resolve_lmstudio_models
    echo \"E=\${EMBEDDING_MODEL}|EF=\${EMBEDDING_FETCH}|L=\${LLM_MODEL}|LF=\${LLM_FETCH}|C=\${CODE_MODEL}|CF=\${CODE_FETCH}\"" | tail -1
}

# GGUF fetches by repo URL too. It used to hand `lms get` the catalog ids, and
# that path could never have worked on a machine without the models already on
# disk: `lms get <catalog id>` answers "No staff picks found with the specified
# search criteria" in every format. The assertion this replaces pinned the
# defect as the contract.
check_eq "gguf: the ids stay ids and all three fetch by repo URL" \
  "E=text-embedding-qwen3-embedding-0.6b|EF=https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF|L=qwen3-vl-8b-instruct|LF=https://huggingface.co/lmstudio-community/Qwen3-VL-8B-Instruct-GGUF|C=qwen2.5-coder-7b-instruct|CF=https://huggingface.co/lmstudio-community/Qwen2.5-Coder-7B-Instruct-GGUF" \
  "$(resolve 'LMSTUDIO_MODEL_FORMAT=gguf')"

# Each GGUF substitution is gated on its own override, exactly as the MLX ones
# are — the B1 defect, one format over.
gguf_emb_override="$(resolve 'LMSTUDIO_MODEL_FORMAT=gguf; LMSTUDIO_EMBEDDING_MODEL=my-embedder')"
check_contains "gguf + LMSTUDIO_EMBEDDING_MODEL fetches the named model" \
  "EF=my-embedder|" "$gguf_emb_override"
check_contains "and leaves the instruct fetch on the GGUF repo" \
  "LF=https://huggingface.co/lmstudio-community/Qwen3-VL-8B-Instruct-GGUF" "$gguf_emb_override"
check_contains "gguf + MASSA_AI_LLM_CODE_MODEL fetches the named model" \
  "CF=my-coder" "$(resolve 'LMSTUDIO_MODEL_FORMAT=gguf; MASSA_AI_LLM_CODE_MODEL=my-coder')"

check_eq "mlx with no overrides: embedding id changes, all three fetch by repo URL" \
  "E=qwen3-embedding-0.6b-dwq|EF=https://huggingface.co/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ|L=qwen3-vl-8b-instruct|LF=https://huggingface.co/mlx-community/Qwen3-VL-8B-Instruct-4bit|C=qwen2.5-coder-7b-instruct|CF=https://huggingface.co/mlx-community/Qwen2.5-Coder-7B-Instruct-4bit" \
  "$(resolve 'LMSTUDIO_MODEL_FORMAT=mlx')"

emb_override="$(resolve 'LMSTUDIO_MODEL_FORMAT=mlx; LMSTUDIO_EMBEDDING_MODEL=text-embedding-qwen3-embedding-0.6b')"
check_contains "mlx + LMSTUDIO_EMBEDDING_MODEL keeps the user's id" \
  "E=text-embedding-qwen3-embedding-0.6b|" "$emb_override"
check_contains "mlx + LMSTUDIO_EMBEDDING_MODEL DOWNLOADS the user's model, not the MLX repo" \
  "EF=text-embedding-qwen3-embedding-0.6b|" "$emb_override"
case "$emb_override" in
  *"EF=https://"*) fail "the embedding override was overruled by the MLX repo URL" ;;
  *) ok "no MLX repo URL survives an explicit embedding override" ;;
esac
# The other two roles are untouched by an embedding override.
check_contains "an embedding override leaves the instruct fetch on MLX" \
  "LF=https://huggingface.co/mlx-community/Qwen3-VL-8B-Instruct-4bit" "$emb_override"

llm_override="$(resolve 'LMSTUDIO_MODEL_FORMAT=mlx; MASSA_AI_LLM_MODEL=my-instruct')"
check_contains "mlx + MASSA_AI_LLM_MODEL fetches the named model" "LF=my-instruct|" "$llm_override"
check_contains "and leaves the embedding fetch on MLX" \
  "EF=https://huggingface.co/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ" "$llm_override"

code_override="$(resolve 'LMSTUDIO_MODEL_FORMAT=mlx; MASSA_AI_LLM_CODE_MODEL=my-coder')"
check_contains "mlx + MASSA_AI_LLM_CODE_MODEL fetches the named model" "CF=my-coder" "$code_override"

# The default is gguf, not "whatever was last set" — the wizard calls this
# after installer_select_model_format, but a re-entry must not inherit.
check_contains "an unset format resolves as gguf" \
  "EF=https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF|" "$(resolve ':')"

echo "── installer_lmstudio_model_key: the id comes back from LM Studio ──"

# A stub `lms ls --json` returning a two-entry catalog in LM Studio's real
# shape: MLX keeps the repo verbatim in `path`, GGUF appends the weight file.
# Both forms are measured (2026-09-21, `lms ls --json` on a live install), and
# both must resolve, which is why the fixture carries one of each.
make_lms_catalog_stub() {
  local path="${TMP_ROOT}/lms-cat-$$-${RANDOM}"
  cat > "$path" <<'CATEOF'
#!/usr/bin/env bash
if [ "${1:-}" = "ls" ] && [ "${2:-}" = "--json" ]; then
  cat <<'JSONEOF'
[{"type":"llm","modelKey":"the-mlx-key","path":"mlx-community/Qwen3-VL-8B-Instruct-4bit"},
 {"type":"embedding","modelKey":"the-gguf-key","path":"Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"}]
JSONEOF
  exit 0
fi
exit 0
CATEOF
  chmod +x "$path"
  printf '%s' "$path"
}

CAT_STUB="$(make_lms_catalog_stub)"
key() { run_lib "$DARWIN_SHIM" "installer_lmstudio_model_key '${CAT_STUB}' '$1' '$2'" | tail -1; }

# The whole point: the literal fallback is WRONG here and must lose. If this
# returned the fallback the function would be indistinguishable from the
# hardcoded ids it replaces.
check_eq "an exact repo path resolves to LM Studio's own modelKey" \
  "the-mlx-key" "$(key 'https://huggingface.co/mlx-community/Qwen3-VL-8B-Instruct-4bit' 'stale-literal')"
check_eq "a GGUF repo resolves through the weight-file suffix in path" \
  "the-gguf-key" "$(key 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF' 'stale-literal')"
check_eq "a repo the catalog does not carry keeps the fallback" \
  "stale-literal" "$(key 'https://huggingface.co/someone/Not-Installed' 'stale-literal')"
# A user override is already an id, not a URL — there is nothing to reconcile.
check_eq "a non-URL fetch spec is returned as the fallback untouched" \
  "my-own-model" "$(key 'my-own-model' 'my-own-model')"
check_eq "no lms CLI keeps the fallback instead of echoing nothing" \
  "stale-literal" \
  "$(run_lib "$DARWIN_SHIM" "installer_lmstudio_model_key '' 'https://huggingface.co/a/b' 'stale-literal'" | tail -1)"
# A prefix that is not a path SEGMENT must not match: `.../Qwen3-Embedding-0.6B`
# is a real repo and a string prefix of the installed one.
check_eq "a partial repo name does not match a longer installed repo" \
  "stale-literal" "$(key 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B' 'stale-literal')"

echo "── installer_unload_loaded_models ──"

# A stub `lms ps --json` plus a log. The gate is what matters: an idle runtime
# prints `[]` (measured) and must cost no unload and no output line.
make_lms_ps_stub() {
  local loaded="$1" log="$2"
  local path="${TMP_ROOT}/lms-ps-$$-${RANDOM}"
  cat > "$path" <<PSEOF
#!/usr/bin/env bash
echo "\$*" >> '${log}'
if [ "\${1:-}" = "ps" ]; then printf '%s\n' '${loaded}'; fi
exit 0
PSEOF
  chmod +x "$path"
  printf '%s' "$path"
}

# The Ollama half of the sweep runs whichever provider was chosen, so without a
# shim these cases would reach the developer's REAL ollama and stop the models
# they have loaded. Shimming it on PATH makes that impossible AND turns the
# sweep into something observable — there is no other way to see it.
make_ollama_shim() {
  local ps_body="$1"
  local log="$2"
  local dir="${TMP_ROOT}/ollama-shim-$$-${RANDOM}"
  mkdir -p "$dir"
  cat > "${dir}/ollama" <<OLEOF
#!/usr/bin/env bash
echo "\$*" >> '${log}'
if [ "\${1:-}" = "ps" ]; then printf '%s\n' '${ps_body}'; fi
exit 0
OLEOF
  chmod +x "${dir}/ollama"
  printf '%s' "$dir"
}

OL_HEADER='NAME    ID    SIZE    PROCESSOR    CONTEXT    UNTIL'

LOG_OL_IDLE="${TMP_ROOT}/log-ollama-idle"; : > "$LOG_OL_IDLE"
OL_IDLE="$(make_ollama_shim "$OL_HEADER" "$LOG_OL_IDLE")"
run_lib "${OL_IDLE}:${DARWIN_SHIM}" "installer_unload_loaded_models ''" >/dev/null
case "$(cat "$LOG_OL_IDLE")" in
  *"stop"*) fail "an idle Ollama (header-only ps) was still asked to stop something" ;;
  *) ok "an idle Ollama costs no stop" ;;
esac

LOG_OL_BUSY="${TMP_ROOT}/log-ollama-busy"; : > "$LOG_OL_BUSY"
OL_BUSY="$(make_ollama_shim "${OL_HEADER}
qwen3-vl:8b    abc123    6 GB    100% GPU    16384    4 minutes from now" "$LOG_OL_BUSY")"
out_ol="$(run_lib "${OL_BUSY}:${DARWIN_SHIM}" "installer_unload_loaded_models ''")"
check_contains "a resident Ollama model is stopped by name" \
  "stop qwen3-vl:8b" "$(cat "$LOG_OL_BUSY")"
check_contains "and the user is told which one" "qwen3-vl:8b" "$out_ol"

LOG_U="${TMP_ROOT}/log-unload"; : > "$LOG_U"
PS_IDLE="$(make_lms_ps_stub '[]' "$LOG_U")"
out_idle="$(run_lib "${OL_IDLE}:${DARWIN_SHIM}" "installer_unload_loaded_models '${PS_IDLE}'")"
case "$(cat "$LOG_U")" in
  *"unload"*) fail "an idle LM Studio was still asked to unload" ;;
  *) ok "an idle LM Studio ([] from ps --json) costs no unload" ;;
esac
case "$out_idle" in
  *"Unloading"*) fail "an idle LM Studio announced work it did not do" ;;
  *) ok "and prints no line about it" ;;
esac

LOG_V="${TMP_ROOT}/log-unload-busy"; : > "$LOG_V"
PS_BUSY="$(make_lms_ps_stub '[{"modelKey":"qwen3-vl-8b-instruct"}]' "$LOG_V")"
out_busy="$(run_lib "${OL_IDLE}:${DARWIN_SHIM}" "installer_unload_loaded_models '${PS_BUSY}'")"
check_contains "a resident model is unloaded before the installer loads its own" \
  "unload --all" "$(cat "$LOG_V")"
check_contains "and the user is told why the pause happened" \
  "already resident in LM Studio" "$out_busy"

# No CLI is the OpenCode/remote case: the Ollama sweep must still run, and the
# function must not abort an install under `set -e`.
check_eq "no lms CLI is survivable" "0" \
  "$(run_lib "${OL_IDLE}:${DARWIN_SHIM}" "installer_unload_loaded_models ''; echo \$?" | tail -1)"

echo "── installer_ensure_mlx_runtime ──"

# A stub lms: `runtime ls` reports whichever engine list the scenario sets, and
# every invocation is appended to a log so "did it try to install?" is an
# observation rather than an inference.
make_lms_stub() {
  local engines="$1"
  local log="$2"
  local get_exit="${3:-0}"
  local path="${TMP_ROOT}/lms-stub-$$-${RANDOM}"
  cat > "$path" <<STUBEOF
#!/usr/bin/env bash
echo "\$*" >> '${log}'
if [ "\${1:-}" = "runtime" ] && [ "\${2:-}" = "ls" ]; then
  printf '%s\n' '${engines}'
  exit 0
fi
if [ "\${1:-}" = "runtime" ] && [ "\${2:-}" = "get" ]; then
  exit ${get_exit}
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
# An empty log is only evidence because the MLX cases below write to theirs
# through the same stub — that pair is the positive control for this assertion.
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

# The failure branch. A `runtime get` that exits non-zero must name the manual
# command and must NOT abort the install — the wizard runs under `set -e`, and
# a missing engine is recoverable from LM Studio's own Runtimes page.
LOG_D="${TMP_ROOT}/log-d"; : > "$LOG_D"
STUB_D="$(make_lms_stub "llama.cpp-mac-arm64-apple-metal-advsimd@2.41.0" "$LOG_D" 1)"
out_d="$(run_lib "$DARWIN_SHIM" \
  "set -e; LMSTUDIO_MODEL_FORMAT=mlx; installer_ensure_mlx_runtime '${STUB_D}'; echo 'SURVIVED'")"
check_contains "a failed engine install names the manual command" "runtime get mlx-llm" "$out_d"
check_contains "and the install keeps going under set -e" "SURVIVED" "$out_d"
case "$out_d" in
  *"MLX engine installed"*) fail "a failed runtime get still reported success" ;;
  *) ok "a failed runtime get does not report success" ;;
esac

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
