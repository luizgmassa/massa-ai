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

# The notice is the whole reason the MLX branch is safe to offer: its embedding
# role is served by a process outside LM Studio, and silence would leave the
# user with one moving part they do not know exists.
#
# These three assertions used to pin the OPPOSITE advice — "switch
# embedding.model back to text-embedding-qwen3-embedding-0.6b". That advice was
# wrong. It read "LM Studio cannot serve this model" (true, measured three ways
# and upstream bug #808) as "this model cannot embed" (false: mlx_embeddings
# returns (n, 1024) on the identical weights). A test asserting the wrong cure
# is worse than no test, because it defends it.
warn="$(MASSA_AI_LMSTUDIO_MODEL_FORMAT=mlx run_lib "$DARWIN_SHIM" 'installer_select_model_format')"
check_contains "an MLX choice says embedding does not go through LM Studio" \
  "/v1/embeddings" "$warn"
check_contains "and names the endpoint that does serve it" "127.0.0.1:1235" "$warn"
case "$warn" in
  *"switch embedding.model"*|*"text-embedding-qwen3-embedding-0.6b"*)
    fail "the MLX notice still tells the user to abandon the MLX model" ;;
  *) ok "the MLX notice no longer prescribes the GGUF build" ;;
esac
# Asserted in two halves on purpose. `grep -c ... | sed 's/^0$//'` alone also
# yields "" when run_lib produced no output at all, so a sourcing failure would
# have read as a pass.
gguf_out="$(MASSA_AI_LMSTUDIO_MODEL_FORMAT=gguf run_lib "$DARWIN_SHIM" \
  'installer_select_model_format; echo "SENTINEL:${LMSTUDIO_MODEL_FORMAT}"')"
check_contains "the gguf run actually executed" "SENTINEL:gguf" "$gguf_out"
case "$gguf_out" in
  *"/v1/embeddings"*) fail "a GGUF choice printed the MLX embedding notice" ;;
  *) ok "a GGUF choice prints no embedding notice" ;;
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
  "E=text-embedding-qwen3-embedding-0.6b|EF=https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF|L=qwen3.8-9b|LF=https://huggingface.co/empero-ai/Qwen3.8-9B-Distill-GGUF|C=qwen3.8-9b|CF=https://huggingface.co/empero-ai/Qwen3.8-9B-Distill-GGUF" \
  "$(resolve 'LMSTUDIO_MODEL_FORMAT=gguf')"

# Each GGUF substitution is gated on its own override, exactly as the MLX ones
# are — the B1 defect, one format over.
gguf_emb_override="$(resolve 'LMSTUDIO_MODEL_FORMAT=gguf; LMSTUDIO_EMBEDDING_MODEL=my-embedder')"
check_contains "gguf + LMSTUDIO_EMBEDDING_MODEL fetches the named model" \
  "EF=my-embedder|" "$gguf_emb_override"
check_contains "and leaves the instruct fetch on the GGUF repo" \
  "LF=https://huggingface.co/empero-ai/Qwen3.8-9B-Distill-GGUF" "$gguf_emb_override"
check_contains "gguf + MASSA_AI_LLM_CODE_MODEL fetches the named model" \
  "CF=my-coder" "$(resolve 'LMSTUDIO_MODEL_FORMAT=gguf; MASSA_AI_LLM_CODE_MODEL=my-coder')"

check_eq "mlx with no overrides: embedding id changes, all three fetch by repo URL" \
  "E=qwen3-embedding-0.6b-dwq|EF=https://huggingface.co/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ|L=qwen3.8-9b|LF=https://huggingface.co/keXjos/Qwen3.8-9B-mlx-4Bit|C=qwen3.8-9b|CF=https://huggingface.co/keXjos/Qwen3.8-9B-mlx-4Bit" \
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
  "LF=https://huggingface.co/keXjos/Qwen3.8-9B-mlx-4Bit" "$emb_override"

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

echo "── installer_start_mlx_embedding_sidecar: launchd registration ──"

# A stub `launchctl` on PATH, plus a stub `curl` that always reports healthy so
# the 10-attempt probe does not cost the suite 10 seconds. HOME is already
# TMP_ROOT under run_lib, so the plist lands in the scratch tree and never
# touches the developer's real ~/Library/LaunchAgents.
make_launchctl_shim() {
  local bootstrap_exit="$1"
  local log="$2"
  local load_exit="${3:-0}"
  local dir="${TMP_ROOT}/lc-shim-$$-${RANDOM}"
  mkdir -p "$dir"
  cat > "${dir}/launchctl" <<LCEOF
#!/usr/bin/env bash
echo "\$*" >> '${log}'
case "\${1:-}" in
  bootstrap) exit ${bootstrap_exit} ;;
  load) exit ${load_exit} ;;
esac
exit 0
LCEOF
  cat > "${dir}/curl" <<'CURLEOF'
#!/usr/bin/env bash
echo '{"status": "ok"}'
CURLEOF
  chmod +x "${dir}/launchctl" "${dir}/curl"
  printf '%s' "$dir"
}

mkdir -p "${TMP_ROOT}/Library/LaunchAgents" "${TMP_ROOT}/.config/massa-ai"

LOG_LC="${TMP_ROOT}/log-launchctl"; : > "$LOG_LC"
LC_OK="$(make_launchctl_shim 0 "$LOG_LC")"
out_lc="$(run_lib "${LC_OK}:${DARWIN_SHIM}" \
  "installer_start_mlx_embedding_sidecar '${TMP_ROOT}/venv' '${TMP_ROOT}/srv.py' 1235")"
check_contains "a successful bootstrap reports the agent registered" \
  "launchd agent registered" "$out_lc"
check_contains "and it is bootstrap, not the deprecated load" "bootstrap gui/" "$(cat "$LOG_LC")"
case "$(cat "$LOG_LC")" in
  *"load -w"*) fail "load -w ran even though bootstrap succeeded" ;;
  *) ok "a successful bootstrap costs no legacy load" ;;
esac
check_contains "the plist is written where launchd reads it" "ai.massa.mlx-embed" \
  "$(cat "${TMP_ROOT}/Library/LaunchAgents/ai.massa.mlx-embed.plist" 2>/dev/null)"
check_contains "the health probe is what reports success" \
  "answering on port 1235" "$out_lc"

# `bootstrap` failing is the whole reason the fallback exists: it is the
# supported spelling but is refused in some session contexts, where the
# deprecated `load -w` still works.
LOG_LC2="${TMP_ROOT}/log-launchctl-fallback"; : > "$LOG_LC2"
LC_FAIL="$(make_launchctl_shim 1 "$LOG_LC2")"
out_lc2="$(run_lib "${LC_FAIL}:${DARWIN_SHIM}" \
  "installer_start_mlx_embedding_sidecar '${TMP_ROOT}/venv' '${TMP_ROOT}/srv.py' 1235")"
check_contains "a refused bootstrap falls back to the legacy load" \
  "legacy load" "$out_lc2"
check_contains "and the fallback actually ran load -w" "load -w" "$(cat "$LOG_LC2")"

MLX_PLIST="${TMP_ROOT}/Library/LaunchAgents/ai.massa.mlx-embed.plist"
MLX_STARTED="${TMP_ROOT}/mlx-started"
mkdir -p "${TMP_ROOT}/venv-ro/bin"
cat > "${TMP_ROOT}/venv-ro/bin/python" <<PYEOF
#!/usr/bin/env bash
: > '${MLX_STARTED}'
PYEOF
chmod +x "${TMP_ROOT}/venv-ro/bin/python"
rm -f "$MLX_PLIST" "$MLX_STARTED"
chmod 555 "${TMP_ROOT}/Library/LaunchAgents"
LOG_LC_RO="${TMP_ROOT}/log-launchctl-mlx-ro"; : > "$LOG_LC_RO"
LC_RO="$(make_launchctl_shim 0 "$LOG_LC_RO")"
out_lc_ro="$(run_lib "${LC_RO}:${DARWIN_SHIM}" \
  "set -e; installer_start_mlx_embedding_sidecar '${TMP_ROOT}/venv-ro' '${TMP_ROOT}/srv.py' 1235; echo rc=\$?")"
chmod 755 "${TMP_ROOT}/Library/LaunchAgents"
check_contains "an unwritable LaunchAgents dir does not abort a set -e caller" "rc=0" "$out_lc_ro"
check_contains "and says the sidecar will not come back after a reboot" "could not write" "$out_lc_ro"
[ -s "$LOG_LC_RO" ] && fail "and launchctl is never called" || ok "and launchctl is never called"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  [ -e "$MLX_STARTED" ] && break
  sleep 0.1
done
[ -e "$MLX_STARTED" ] && ok "and the sidecar is started directly instead" \
  || fail "and the sidecar is started directly instead"

echo "── installer_register_lmstudio_server_agent: launchd registration ──"

LMS_PLIST="${TMP_ROOT}/Library/LaunchAgents/ai.massa.lmstudio-server.plist"

LOG_LMS="${TMP_ROOT}/log-launchctl-lms"; : > "$LOG_LMS"
LC_LMS_OK="$(make_launchctl_shim 0 "$LOG_LMS")"
out_lms="$(run_lib "${LC_LMS_OK}:${DARWIN_SHIM}" \
  "installer_register_lmstudio_server_agent '/opt/lms/bin/lms' 'http://localhost:1234/v1'; echo rc=\$?")"
plist_lms="$(cat "$LMS_PLIST" 2>/dev/null)"
check_contains "the LM Studio agent reports registration" \
  "launchd agent registered: ai.massa.lmstudio-server" "$out_lms"
check_contains "and returns 0" "rc=0" "$out_lms"
check_contains "the plist carries the agent label" \
  "<key>Label</key><string>ai.massa.lmstudio-server</string>" "$plist_lms"
check_contains "the agent runs lms server start on the configured port" \
  "<string>/opt/lms/bin/lms</string>
        <string>server</string>
        <string>start</string>
        <string>--port</string>
        <string>1234</string>" "$plist_lms"
check_contains "the agent runs at login" "<key>RunAtLoad</key><true/>" "$plist_lms"
check_contains "a failed start is retried by launchd" \
  "<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>" "$plist_lms"
check_contains "and launchd waits 30 s between retries" \
  "<key>ThrottleInterval</key><integer>30</integer>" "$plist_lms"
check_contains "the registered agent is enabled" "enable gui/" "$(cat "$LOG_LMS")"
check_contains "a stale registration is booted out first" \
  "bootout gui/" "$(cat "$LOG_LMS")"
check_contains "and the plist is bootstrapped into the gui domain" \
  "bootstrap gui/" "$(cat "$LOG_LMS")"
if plutil -lint "$LMS_PLIST" >/dev/null 2>&1 || ! command -v plutil >/dev/null 2>&1; then
  ok "the plist is well-formed"
else
  fail "the plist is well-formed ($(plutil -lint "$LMS_PLIST" 2>&1))"
fi

rm -f "$LMS_PLIST"
LOG_LMS_NOPORT="${TMP_ROOT}/log-launchctl-lms-noport"; : > "$LOG_LMS_NOPORT"
LC_LMS_NOPORT="$(make_launchctl_shim 0 "$LOG_LMS_NOPORT")"
run_lib "${LC_LMS_NOPORT}:${DARWIN_SHIM}" \
  "installer_register_lmstudio_server_agent '/opt/lms/bin/lms' 'http://localhost/v1'" >/dev/null
case "$(cat "$LMS_PLIST" 2>/dev/null)" in
  *"<string>--port</string>"*) fail "a URL without a port adds no --port argument" ;;
  *"<string>start</string>"*) ok "a URL without a port adds no --port argument" ;;
  *) fail "a URL without a port still writes the plist" ;;
esac

rm -f "$LMS_PLIST"
LOG_LMS_FB="${TMP_ROOT}/log-launchctl-lms-fallback"; : > "$LOG_LMS_FB"
LC_LMS_FAIL="$(make_launchctl_shim 1 "$LOG_LMS_FB")"
out_lms_fb="$(run_lib "${LC_LMS_FAIL}:${DARWIN_SHIM}" \
  "installer_register_lmstudio_server_agent '/opt/lms/bin/lms' 'http://localhost:1234/v1'")"
check_contains "a refused bootstrap falls back to the legacy load" "legacy load" "$out_lms_fb"
check_contains "and the fallback actually ran load -w" "load -w" "$(cat "$LOG_LMS_FB")"

rm -f "$LMS_PLIST"
LOG_LMS_LINUX="${TMP_ROOT}/log-launchctl-lms-linux"; : > "$LOG_LMS_LINUX"
LC_LMS_LINUX="$(make_launchctl_shim 0 "$LOG_LMS_LINUX")"
out_lms_linux="$(run_lib "${LC_LMS_LINUX}:${LINUX_SHIM}" \
  "installer_register_lmstudio_server_agent '/opt/lms/bin/lms' 'http://localhost:1234/v1'; echo rc=\$?")"
check_contains "off macOS the agent step is a silent no-op" "rc=0" "$out_lms_linux"
[ -f "$LMS_PLIST" ] && fail "off macOS no plist is written" || ok "off macOS no plist is written"
[ -s "$LOG_LMS_LINUX" ] && fail "off macOS launchctl is never called" || ok "off macOS launchctl is never called"

rm -f "$LMS_PLIST"
LOG_LMS_BOTH="${TMP_ROOT}/log-launchctl-lms-both"; : > "$LOG_LMS_BOTH"
LC_LMS_BOTH="$(make_launchctl_shim 1 "$LOG_LMS_BOTH" 1)"
out_lms_both="$(run_lib "${LC_LMS_BOTH}:${DARWIN_SHIM}" \
  "installer_register_lmstudio_server_agent '/opt/lms/bin/lms' 'http://localhost:1234/v1'; echo rc=\$?")"
check_contains "when bootstrap and load both fail the manual command is printed" \
  "launchctl bootstrap gui/" "$out_lms_both"
check_contains "and the wizard is not aborted" "rc=0" "$out_lms_both"

for remote in 'http://remote-box:1234/v1' 'http://192.168.1.20:1234/v1' 'http://[fe80::1]:1234/v1'; do
  rm -f "$LMS_PLIST"
  LOG_LMS_REMOTE="${TMP_ROOT}/log-launchctl-lms-remote"; : > "$LOG_LMS_REMOTE"
  LC_LMS_REMOTE="$(make_launchctl_shim 0 "$LOG_LMS_REMOTE")"
  run_lib "${LC_LMS_REMOTE}:${DARWIN_SHIM}" \
    "installer_register_lmstudio_server_agent '/opt/lms/bin/lms' '${remote}'" >/dev/null
  if [ -f "$LMS_PLIST" ] || [ -s "$LOG_LMS_REMOTE" ]; then
    fail "a remote LM Studio URL (${remote}) registers no local agent"
  else
    ok "a remote LM Studio URL (${remote}) registers no local agent"
  fi
done

lms_port_args() {
  rm -f "$LMS_PLIST"
  run_lib "${LC_LMS_OK}:${DARWIN_SHIM}" \
    "installer_register_lmstudio_server_agent '/opt/lms/bin/lms' '$1'" >/dev/null
  tr -d ' \n' < "$LMS_PLIST" 2>/dev/null | sed -nE 's#.*<string>start</string>(<string>--port</string><string>[0-9]+</string>)?</array>.*#[\1]#p'
}
check_eq "IPv6 loopback with a port keeps the port" "[<string>--port</string><string>1234</string>]" \
  "$(lms_port_args 'http://[::1]:1234/v1')"
check_eq "IPv6 loopback without a port adds no --port" "[]" "$(lms_port_args 'http://[::1]/v1')"
check_eq "userinfo is not mistaken for a port" "[<string>--port</string><string>1234</string>]" \
  "$(lms_port_args 'http://user:123@127.0.0.1:1234/v1')"

rm -f "$LMS_PLIST"
run_lib "${LC_LMS_OK}:${DARWIN_SHIM}" \
  "installer_register_lmstudio_server_agent '/Users/R&D/<lms>/bin/lms' 'http://localhost:1234/v1'" >/dev/null
check_contains "XML-special characters in the lms path are escaped" \
  "<string>/Users/R&amp;D/&lt;lms&gt;/bin/lms</string>" "$(cat "$LMS_PLIST" 2>/dev/null)"
if ! command -v plutil >/dev/null 2>&1 || plutil -lint "$LMS_PLIST" >/dev/null 2>&1; then
  ok "and the plist stays well-formed"
else
  fail "and the plist stays well-formed ($(plutil -lint "$LMS_PLIST" 2>&1))"
fi

rm -f "$LMS_PLIST"
chmod 555 "${TMP_ROOT}/Library/LaunchAgents"
LOG_LMS_RO="${TMP_ROOT}/log-launchctl-lms-ro"; : > "$LOG_LMS_RO"
LC_LMS_RO="$(make_launchctl_shim 0 "$LOG_LMS_RO")"
out_lms_ro="$(run_lib "${LC_LMS_RO}:${DARWIN_SHIM}" \
  "set -e; installer_register_lmstudio_server_agent '/opt/lms/bin/lms' 'http://localhost:1234/v1'; echo rc=\$?")"
chmod 755 "${TMP_ROOT}/Library/LaunchAgents"
check_contains "an unwritable LaunchAgents dir does not abort a set -e caller" "rc=0" "$out_lms_ro"
check_contains "and says the server will not come back after a reboot" "could not write" "$out_lms_ro"
[ -s "$LOG_LMS_RO" ] && fail "and launchctl is never called" || ok "and launchctl is never called"

mv "${TMP_ROOT}/Library/LaunchAgents" "${TMP_ROOT}/Library/LaunchAgents.away"
LOG_LMS_NODIR="${TMP_ROOT}/log-launchctl-lms-nodir"; : > "$LOG_LMS_NODIR"
LC_LMS_NODIR="$(make_launchctl_shim 0 "$LOG_LMS_NODIR")"
out_lms_nodir="$(run_lib "${LC_LMS_NODIR}:${DARWIN_SHIM}" \
  "installer_register_lmstudio_server_agent '/opt/lms/bin/lms' 'http://localhost:1234/v1'")"
check_eq "without a LaunchAgents dir the step is silent" "" "$out_lms_nodir"
[ -e "${TMP_ROOT}/Library/LaunchAgents" ] && fail "without a LaunchAgents dir nothing is created" \
  || ok "without a LaunchAgents dir nothing is created"
[ -s "$LOG_LMS_NODIR" ] && fail "and launchctl is never called" || ok "and launchctl is never called"
mv "${TMP_ROOT}/Library/LaunchAgents.away" "${TMP_ROOT}/Library/LaunchAgents"

LOG_LMS_NOCLI="${TMP_ROOT}/log-launchctl-lms-nocli"; : > "$LOG_LMS_NOCLI"
LC_LMS_NOCLI="$(make_launchctl_shim 0 "$LOG_LMS_NOCLI")"
run_lib "${LC_LMS_NOCLI}:${DARWIN_SHIM}" \
  "installer_register_lmstudio_server_agent '' 'http://localhost:1234/v1'" >/dev/null
[ -f "$LMS_PLIST" ] && fail "without an lms CLI no plist is written" || ok "without an lms CLI no plist is written"

echo "── installer_remove_launchd_agents: uninstall ──"

AGENTS_DIR="${TMP_ROOT}/Library/LaunchAgents"
SIBLING_PLIST="${AGENTS_DIR}/ai.massa.other.plist"
MASSA_DIR="${TMP_ROOT}/.config/massa-ai"
seed_agents() {
  mkdir -p "$AGENTS_DIR" "$MASSA_DIR"
  echo plist > "$MLX_PLIST"
  echo plist > "$LMS_PLIST"
  echo plist > "$SIBLING_PLIST"
  echo log > "${MASSA_DIR}/mlx-embed.log"
  echo log > "${MASSA_DIR}/lmstudio-server.log"
  echo '{}' > "${MASSA_DIR}/config.json"
}
make_failing_launchctl() {
  local log="$1" dir="${TMP_ROOT}/lc-fail-$$-${RANDOM}"
  mkdir -p "$dir"
  cat > "${dir}/launchctl" <<LCEOF
#!/usr/bin/env bash
echo "\$*" >> '${log}'
echo "Boot-out failed: 3: No such process" >&2
exit 3
LCEOF
  chmod +x "${dir}/launchctl"
  printf '%s' "$dir"
}

seed_agents
LOG_RM="${TMP_ROOT}/log-launchctl-rm"; : > "$LOG_RM"
LC_RM="$(make_launchctl_shim 0 "$LOG_RM")"
out_rm="$(run_lib "${LC_RM}:${DARWIN_SHIM}" "set -e; installer_remove_launchd_agents; echo rc=\$?")"
check_contains "removing the agents returns 0" "rc=0" "$out_rm"
[ -e "$MLX_PLIST" ] && fail "the MLX sidecar plist is deleted" || ok "the MLX sidecar plist is deleted"
[ -e "$LMS_PLIST" ] && fail "the LM Studio server plist is deleted" || ok "the LM Studio server plist is deleted"
[ -e "$SIBLING_PLIST" ] && ok "another ai.massa.* plist is left alone" \
  || fail "another ai.massa.* plist is left alone"
if [ -e "${MASSA_DIR}/mlx-embed.log" ] && [ -e "${MASSA_DIR}/lmstudio-server.log" ] \
  && [ -e "${MASSA_DIR}/config.json" ]; then
  ok "logs and ~/.config/massa-ai data are kept"
else
  fail "logs and ~/.config/massa-ai data are kept"
fi
check_contains "the MLX agent is booted out by exact label" \
  "bootout gui/$(id -u)/ai.massa.mlx-embed" "$(cat "$LOG_RM")"
check_contains "the LM Studio agent is booted out by exact label" \
  "bootout gui/$(id -u)/ai.massa.lmstudio-server" "$(cat "$LOG_RM")"
case "$(cat "$LOG_RM")" in
  *ai.massa.other*) fail "the sibling agent is never booted out" ;;
  *) ok "the sibling agent is never booted out" ;;
esac
check_contains "each removal is reported" "ai.massa.lmstudio-server" "$out_rm"

LOG_RM2="${TMP_ROOT}/log-launchctl-rm-again"; : > "$LOG_RM2"
LC_RM2="$(make_failing_launchctl "$LOG_RM2")"
out_rm2="$(run_lib "${LC_RM2}:${DARWIN_SHIM}" "set -e; installer_remove_launchd_agents; echo rc=\$?")"
check_contains "a second run with nothing loaded still returns 0 under set -e" "rc=0" "$out_rm2"
check_contains "and still boots out, tolerating 'not loaded'" "bootout" "$(cat "$LOG_RM2")"
[ -e "$SIBLING_PLIST" ] && ok "and still leaves the sibling alone" || fail "and still leaves the sibling alone"

seed_agents
LOG_RM_LINUX="${TMP_ROOT}/log-launchctl-rm-linux"; : > "$LOG_RM_LINUX"
LC_RM_LINUX="$(make_launchctl_shim 0 "$LOG_RM_LINUX")"
out_rm_linux="$(run_lib "${LC_RM_LINUX}:${LINUX_SHIM}" "set -e; installer_remove_launchd_agents; echo rc=\$?")"
check_eq "off macOS removal is a silent no-op" "rc=0" "$out_rm_linux"
[ -s "$LOG_RM_LINUX" ] && fail "off macOS launchctl is never called" || ok "off macOS launchctl is never called"
[ -e "$MLX_PLIST" ] && [ -e "$LMS_PLIST" ] && ok "off macOS no plist is deleted" \
  || fail "off macOS no plist is deleted"

chmod 555 "$AGENTS_DIR"
LOG_RM_RO="${TMP_ROOT}/log-launchctl-rm-ro"; : > "$LOG_RM_RO"
LC_RM_RO="$(make_launchctl_shim 0 "$LOG_RM_RO")"
out_rm_ro="$(run_lib "${LC_RM_RO}:${DARWIN_SHIM}" "set -e; installer_remove_launchd_agents; echo rc=\$?")"
chmod 755 "$AGENTS_DIR"
check_contains "an unremovable plist does not abort a set -e caller" "rc=0" "$out_rm_ro"
check_contains "and says which plist is left behind" "could not remove ${LMS_PLIST}" "$out_rm_ro"

seed_agents
LOG_RM_WIZ="${TMP_ROOT}/log-launchctl-rm-wizard"; : > "$LOG_RM_WIZ"
LC_RM_WIZ="$(make_launchctl_shim 0 "$LOG_RM_WIZ")"
TRIPWIRE_DIR="${TMP_ROOT}/tripwire"
TRIPWIRE_LOG="${TMP_ROOT}/log-tripwire"; : > "$TRIPWIRE_LOG"
mkdir -p "$TRIPWIRE_DIR"
for cmd in curl brew docker ollama lms uv open psql bun npm; do
  printf '#!/usr/bin/env bash\necho "%s $*" >> %q\nexit 1\n' "$cmd" "$TRIPWIRE_LOG" > "${TRIPWIRE_DIR}/${cmd}"
  chmod +x "${TRIPWIRE_DIR}/${cmd}"
done
out_rm_wiz="$(env -i PATH="${LC_RM_WIZ}:${TRIPWIRE_DIR}:${DARWIN_SHIM}:${PATH}" HOME="$TMP_ROOT" \
  XDG_CONFIG_HOME="${TMP_ROOT}/xdg" MASSA_AI_NONINTERACTIVE=1 \
  bash "${REPO_ROOT}/scripts/setup-local-first.sh" --uninstall-services 2>&1; echo rc=$?)"
check_contains "setup-local-first.sh --uninstall-services exits 0" "rc=0" "$out_rm_wiz"
[ -e "$MLX_PLIST" ] || [ -e "$LMS_PLIST" ] && fail "and removes both agent plists" \
  || ok "and removes both agent plists"
[ -e "$SIBLING_PLIST" ] && ok "and leaves the sibling plist alone" || fail "and leaves the sibling plist alone"
case "$out_rm_wiz" in
  *"[1/6]"*) fail "and runs none of the install steps" ;;
  *) ok "and runs none of the install steps" ;;
esac
check_eq "and reaches no installer tool" "" "$(cat "$TRIPWIRE_LOG")"
rm -f "$SIBLING_PLIST"

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
  check_contains "the Linux MLX choice still notices the embedding sidecar" \
    "/v1/embeddings" "$lnx_two"
else
  echo "  skip - no usable script(1); the pty menu-order assertions did not run"
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
