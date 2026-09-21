#!/usr/bin/env bash
# ============================================================
#  massa-ai — feature toggle prompts for the installers
#  Source this file; do not run it directly.
#
#  Usage:
#    source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-feature-prompts.sh"
#    installer_feature_defaults "$CONFIG_FILE"
#    installer_prompt_features "$llm_available"
#
#  Bash 3.2 compatible (macOS ships bash 3.2): no associative arrays,
#  no ${var^^}, no readarray. Function-only — no side effects at source time.
# ============================================================
#
#  Why this file exists.
#
#  The installers used to offer exactly two toggles — query understanding and
#  rerank — while `installer_write_config` hardcoded `true` for LLM, memory
#  bootstrap, auto-improve, auto-importance, hooks and the hook bridge, and
#  wrote no scheduler or capture policy at all. Nine of the Admin Portal's
#  Config sections were therefore decided for the user and never shown.
#
#  Worse, setup-local-first.sh wrapped its prompt in `if [ "$ENV_FILE_EXISTED"
#  = false ]`, so re-running the installer skipped every question. There was no
#  supported way to change an answer from the installer once .env existed.
#
#  So: every answer is prefilled from the config.json already on disk and
#  pressing Enter keeps it. Re-running is a safe no-op that also lets you
#  change your mind — the two properties the old first-run-only gate traded
#  against each other.
#
#  Both installers source this one copy. The previous arrangement had the same
#  prompt text pasted into install.sh and setup-local-first.sh, which had
#  already drifted apart in their tty redirection.
# ============================================================

# ── Toggle defaults ──────────────────────────────────────────
# Each default matches the literal `installer_write_config` falls back to, so
# sourcing this file and prompting nothing writes today's config.json.
installer_feature_defaults_builtin() {
  LLM_ENABLED=true
  SEARCH_QU_ENABLED=false
  SEARCH_RERANK_ENABLED=false
  IMPACT_BFS_CTE_ENABLED=false
  SYNAPSE_ENABLED=true
  MEMORY_BOOTSTRAP_ENABLED=true
  MEMORY_AUTO_IMPROVE_ENABLED=true
  MEMORY_AUTO_IMPORTANCE_ENABLED=true
  HOOKS_ENABLED=true
  HOOKS_BRIDGE_ENABLED=true
  HANDOFFS_ENABLED=true
  SCHEDULER_ENABLED=true
  SCHEDULER_CONSOLIDATION_ENABLED=true
  SCHEDULER_DECAY_ENABLED=true
  SCHEDULER_AUTO_IMPROVE_ENABLED=false
  SCHEDULER_OBSERVATION_BRIDGE_ENABLED=false
  SCHEDULER_CHECKPOINT_PURGE_ENABLED=false
  CAPTURE_POLICY_ENABLED=true
}

# installer_feature_defaults <config_file>
#
# Seeds every toggle global: built-in defaults first, then whatever the given
# config.json already stores. A key the file does not carry keeps its built-in
# value, so an upgrade never silently flips a feature the user chose.
#
# Reading is delegated to node/bun because bash cannot parse JSON safely. When
# neither is on PATH the built-in defaults stand — a missing runtime must not
# fail an install, it just means nothing to prefill from.
installer_feature_defaults() {
  local config_file="$1"
  installer_feature_defaults_builtin

  [ -f "$config_file" ] || return 0

  local runner
  runner="$(installer_detect_runner)" || return 0

  local stored
  stored="$("$runner" -e '
    const fs = require("fs");
    let c;
    try { c = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { process.exit(0); }
    const jobs = (c.scheduler && c.scheduler.jobs) || {};
    // Only emit an assignment for a key the file actually carries: an absent
    // key must fall through to the built-in default, and `undefined` printed
    // into a shell assignment would read as the empty string instead.
    const out = [];
    const put = (name, value) => {
      if (typeof value === "boolean") out.push(name + "=" + String(value));
    };
    put("LLM_ENABLED", c.llm && c.llm.enabled);
    put("SEARCH_QU_ENABLED", c.search && c.search.queryUnderstanding && c.search.queryUnderstanding.enabled);
    put("SEARCH_RERANK_ENABLED", c.search && c.search.rerank && c.search.rerank.enabled);
    put("IMPACT_BFS_CTE_ENABLED", c.impact && c.impact.bfsCteEnabled);
    put("SYNAPSE_ENABLED", c.synapse && c.synapse.enabled);
    put("MEMORY_BOOTSTRAP_ENABLED", c.memory && c.memory.bootstrap && c.memory.bootstrap.enabled);
    put("MEMORY_AUTO_IMPROVE_ENABLED", c.memory && c.memory.autoImprove && c.memory.autoImprove.enabled);
    put("MEMORY_AUTO_IMPORTANCE_ENABLED", c.memory && c.memory.autoImportance && c.memory.autoImportance.enabled);
    put("HOOKS_ENABLED", c.hooks && c.hooks.enabled);
    put("HOOKS_BRIDGE_ENABLED", c.hooks && c.hooks.bridge && c.hooks.bridge.enabled);
    put("HANDOFFS_ENABLED", c.handoffs && c.handoffs.enabled);
    put("SCHEDULER_ENABLED", c.scheduler && c.scheduler.enabled);
    put("SCHEDULER_CONSOLIDATION_ENABLED", jobs["memory-consolidation"] && jobs["memory-consolidation"].enabled);
    put("SCHEDULER_DECAY_ENABLED", jobs["decay-sweep"] && jobs["decay-sweep"].enabled);
    put("SCHEDULER_AUTO_IMPROVE_ENABLED", jobs["auto-improve"] && jobs["auto-improve"].enabled);
    put("SCHEDULER_OBSERVATION_BRIDGE_ENABLED", jobs["observation-bridge"] && jobs["observation-bridge"].enabled);
    put("SCHEDULER_CHECKPOINT_PURGE_ENABLED", jobs["checkpoint-purge"] && jobs["checkpoint-purge"].enabled);
    if (c.capturePolicy) out.push("CAPTURE_POLICY_ENABLED=true");
    process.stdout.write(out.join("\n"));
  ' "$config_file" 2>/dev/null)" || return 0

  # Every emitted line is `NAME=true|false` produced by the reader above, not
  # by the config file — a hostile config.json cannot inject a command here.
  local line
  while IFS= read -r line; do
    case "$line" in
      *_ENABLED=true) eval "${line}" ;;
      *_ENABLED=false) eval "${line}" ;;
    esac
  done <<< "$stored"
}

# ── Prompting ────────────────────────────────────────────────

# installer_can_prompt
# True only for a genuinely interactive install. NO_START=1 is the installers'
# own non-interactive flag; /dev/tty is the real test, because install runs
# under `curl | bash` where stdin is the pipe and reading it would consume the
# script itself.
installer_can_prompt() {
  [ "${NO_START:-0}" = "1" ] && return 1
  [ "${MASSA_AI_NONINTERACTIVE:-0}" = "1" ] && return 1
  [ -e /dev/tty ] || return 1
  return 0
}

# installer_ask <var-name> <question>
# Asks a yes/no question defaulted to the variable's CURRENT value, and writes
# the answer back to it. Enter keeps what is already there, which is what makes
# re-running the installer safe.
installer_ask() {
  local var="$1" question="$2"
  local current hint reply
  eval "current=\${$var}"

  if [ "$current" = "true" ]; then hint="[Y/n]"; else hint="[y/N]"; fi

  reply=""
  read -r -p "  ${question} ${hint}: " reply <>/dev/tty || reply=""

  case "$reply" in
    y|Y|yes|YES) eval "$var=true" ;;
    n|N|no|NO) eval "$var=false" ;;
    *) : ;;  # Enter, or anything unrecognized — keep the current value.
  esac
}

# ── Local inference provider (LIP-12, LIP-13, LIP-16) ────────

# installer_detect_provider <config_file>
#
# Echoes which local inference provider an install is already on:
#   ollama | lmstudio | other | fresh
#
# The key is `embedding.provider` in config.json — the literal
# installer_write_config writes. NOT install-state.json, which records
# agent-harness state and names no provider at all. `other` means an API
# provider (mistral, openai, …): that is not a local inference install and
# LIP-13 leaves it alone. An absent, unreadable or malformed file is `fresh`,
# the same graceful degradation installer_feature_defaults uses.
installer_detect_provider() {
  local config_file="$1" runner stored
  [ -f "$config_file" ] || { echo fresh; return 0; }
  runner="$(installer_detect_runner)" || { echo fresh; return 0; }

  stored="$("$runner" -e '
    const fs = require("fs");
    let c;
    try { c = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { process.exit(0); }
    const p = c.embedding && c.embedding.provider;
    if (typeof p === "string") process.stdout.write(p);
  ' "$config_file" 2>/dev/null)" || { echo fresh; return 0; }

  case "$stored" in
    ollama|lmstudio) echo "$stored" ;;
    "") echo fresh ;;
    *) echo other ;;
  esac
}

# migrate_provider <from> <to>
#
# Announces a provider switch. One function for both directions on purpose
# (LIP-13): the rule is uniform — the installer always offers the provider you
# are not currently using — so the body and its tests are written once rather
# than as a second, untested half.
#
# It deliberately does not touch the index. LIP-15's fingerprint gate already
# makes a stale index fail loudly with the reindex command on the next search,
# so starting a multi-GB reindex from an installer would be a heavy action the
# user never asked for.
migrate_provider() {
  local from="$1" to="$2"
  echo ""
  echo "  Migrating local inference provider: ${from} → ${to}"
  echo "  The existing embedding index was built by ${from} and cannot be reused."
  echo "  Search will refuse to return stale rows until you re-index:"
  echo "      massa-ai index --force"
}

# installer_select_provider <detected>
#
# Resolves the provider to install with, and sets two globals rather than
# echoing: a `die` inside a $(...) capture only kills the subshell, which would
# turn LIP-16's fatal unknown value into a silent empty string.
#
#   INFERENCE_PROVIDER       ollama | lmstudio | "" (API provider, left alone)
#   INFERENCE_PROVIDER_FROM  the provider being migrated away from, else ""
#
# MASSA_AI_INFERENCE_PROVIDER follows MASSA_AI_MODE / MASSA_AI_DB_BACKEND: an
# unrecognised value is fatal and names itself, never a silent default. `die`
# is supplied by whichever installer sources this file.
installer_select_provider() {
  local detected="$1" reply target
  INFERENCE_PROVIDER=""
  INFERENCE_PROVIDER_FROM=""

  case "${MASSA_AI_INFERENCE_PROVIDER:-}" in
    "") ;;
    ollama|lmstudio)
      INFERENCE_PROVIDER="$MASSA_AI_INFERENCE_PROVIDER"
      case "$detected" in
        ollama|lmstudio)
          if [ "$detected" != "$INFERENCE_PROVIDER" ]; then
            INFERENCE_PROVIDER_FROM="$detected"
          fi
          ;;
      esac
      return 0
      ;;
    *)
      die "Invalid MASSA_AI_INFERENCE_PROVIDER: '${MASSA_AI_INFERENCE_PROVIDER}'. Choose ollama or lmstudio."
      ;;
  esac

  if [ "$detected" = "other" ]; then
    echo "  Existing install uses an API embedding provider — leaving it unchanged."
    return 0
  fi

  case "$detected" in
    ollama)   target="lmstudio" ;;
    lmstudio) target="ollama" ;;
    *)        target="" ;;
  esac

  if ! installer_can_prompt; then
    case "$detected" in
      ollama|lmstudio) INFERENCE_PROVIDER="$detected" ;;
      *) INFERENCE_PROVIDER="ollama" ;;
    esac
    echo "  Non-interactive install — keeping inference provider: ${INFERENCE_PROVIDER}"
    return 0
  fi

  # No shared menu helper exists in this repo; this is the inline
  # echo + read <>/dev/tty + case shape install.sh:147-166 uses.
  echo ""
  if [ -z "$target" ]; then
    echo "  Local inference provider:"
    echo ""
    echo "    1) Ollama     (default)"
    echo "    2) LM Studio"
    echo ""
    reply=""
    read -r -p "  Enter your choice [1]: " reply <>/dev/tty || reply=""
    case "$reply" in
      2) INFERENCE_PROVIDER="lmstudio" ;;
      *) INFERENCE_PROVIDER="ollama" ;;
    esac
    return 0
  fi

  echo "  This install already uses ${detected}."
  echo ""
  echo "    1) Keep ${detected}     (default)"
  echo "    2) Migrate to ${target}  (re-index required)"
  echo ""
  reply=""
  read -r -p "  Enter your choice [1]: " reply <>/dev/tty || reply=""
  case "$reply" in
    2) INFERENCE_PROVIDER="$target"; INFERENCE_PROVIDER_FROM="$detected" ;;
    *) INFERENCE_PROVIDER="$detected" ;;
  esac
}

# installer_select_model_format
#
# Resolves which weight format the LM Studio models are pulled in, and sets one
# global rather than echoing, for the same reason installer_select_provider
# does: a `die` inside a $(...) capture only kills the subshell.
#
#   LMSTUDIO_MODEL_FORMAT   gguf | mlx
#
# A no-op on Ollama, which serves GGUF only — `INFERENCE_PROVIDERS.ollama`
# declares no `mlxModels` at all — so the global stays "gguf" for the writer.
#
# The menu ORDER is OS-dependent, because the MLX engine is Apple-silicon only:
# on macOS MLX is rung 1 and the default, everywhere else GGUF is. `uname -s`
# rather than `$OSTYPE`: this file is sourced by both installers and by the
# shell test suites, and $OSTYPE is a bashism that does not survive `sh`.
#
# The NON-INTERACTIVE default is gguf on every OS, deliberately not the
# platform's rung 1. An install with nobody at the terminal has no offer to
# make, and MLX is the branch whose embedding role is measured broken (see
# below) — picking it silently would turn a CI or scripted install into a
# config that cannot embed, with no one there to read the warning.
#
# MASSA_AI_LMSTUDIO_MODEL_FORMAT follows MASSA_AI_INFERENCE_PROVIDER: an
# unrecognised value is fatal and names itself, never a silent default.
installer_select_model_format() {
  local reply first second
  LMSTUDIO_MODEL_FORMAT="gguf"

  [ "${INFERENCE_PROVIDER:-ollama}" = "lmstudio" ] || return 0

  case "${MASSA_AI_LMSTUDIO_MODEL_FORMAT:-}" in
    "") ;;
    gguf|mlx)
      LMSTUDIO_MODEL_FORMAT="$MASSA_AI_LMSTUDIO_MODEL_FORMAT"
      [ "$LMSTUDIO_MODEL_FORMAT" = "mlx" ] && installer_warn_mlx_embedding
      return 0
      ;;
    *)
      die "Invalid MASSA_AI_LMSTUDIO_MODEL_FORMAT: '${MASSA_AI_LMSTUDIO_MODEL_FORMAT}'. Choose gguf or mlx."
      ;;
  esac

  if [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then
    first="mlx"; second="gguf"
  else
    first="gguf"; second="mlx"
  fi

  if ! installer_can_prompt; then
    echo "  Non-interactive install — LM Studio model format: ${LMSTUDIO_MODEL_FORMAT}"
    return 0
  fi

  echo ""
  echo "  LM Studio model format:"
  echo ""
  echo "    1) $(installer_model_format_label "$first")  (default)"
  echo "    2) $(installer_model_format_label "$second")"
  echo ""
  reply=""
  read -r -p "  Enter your choice [1]: " reply <>/dev/tty || reply=""
  case "$reply" in
    2) LMSTUDIO_MODEL_FORMAT="$second" ;;
    *) LMSTUDIO_MODEL_FORMAT="$first" ;;
  esac

  [ "$LMSTUDIO_MODEL_FORMAT" = "mlx" ] && installer_warn_mlx_embedding
  return 0
}

# installer_model_format_label <gguf|mlx>
installer_model_format_label() {
  case "$1" in
    mlx) echo "MLX   (Apple Silicon only — Metal-native weights)" ;;
    *)   echo "GGUF  (portable — llama.cpp, every platform)" ;;
  esac
}

# installer_warn_mlx_embedding
#
# The MLX branch is measured broken for ONE of the three roles, and silence
# here would leave the user with a config that indexes nothing and no clue why.
# LM Studio types a model by architecture and only prefixes `text-embedding-`
# onto what it types EMBEDDING; the MLX build of Qwen3-Embedding is
# Qwen3ForCausalLM, so it is typed LLM and /v1/embeddings refuses it. There is
# no MLX embedding engine to route to either — `lms runtime get -l` lists
# exactly one MLX entry, mlx-llm. Measured 2026-09-21; originally spec A-01.
installer_warn_mlx_embedding() {
  echo ""
  echo "  ⚠  MLX selected. Instruct and coding run natively on Metal."
  echo "     The embedding role does NOT: LM Studio types the MLX build of"
  echo "     Qwen3-Embedding as an LLM, so /v1/embeddings answers"
  echo "     'No models loaded' for it and indexing will fail."
  echo "     To embed, switch embedding.model back to the GGUF build:"
  echo "         text-embedding-qwen3-embedding-0.6b"
  echo "     (Admin Portal -> Config -> Embedding, or config.json directly.)"
}

# installer_resolve_lmstudio_models
#
# Resolves the three LM Studio model ids AND the three specs `lms get` is
# handed, from LMSTUDIO_MODEL_FORMAT plus the three override env vars. Sets six
# globals rather than echoing, like every other function in this file:
#
#   EMBEDDING_MODEL / LLM_MODEL / CODE_MODEL     what config.json records
#   EMBEDDING_FETCH / LLM_FETCH / CODE_FETCH     what `lms get` downloads
#
# The id and the fetch spec are NOT the same string on EITHER path. A build is
# pinnable only by Hugging Face repo URL: measured 2026-09-21, `lms get`
# against a catalog id answers "No staff picks found with the specified search
# criteria" in every format, and against a bare search term resolves to whatever
# staff pick ranks first (`--mlx qwen3-vl` picked the 4B, `--mlx qwen2.5-coder`
# the 32B). The ids stay literals only as the pre-fetch existence check and as a
# fallback; `installer_lmstudio_model_key` reconciles them afterwards.
#
# Each MLX substitution is gated on ITS OWN override variable, never on the
# format alone. The first version of this block set all three fetch specs
# unconditionally inside `if format = mlx`, so
# `LMSTUDIO_EMBEDDING_MODEL=<gguf id> MASSA_AI_LMSTUDIO_MODEL_FORMAT=mlx` wrote
# the GGUF id into config.json while `lms get` pulled the MLX repo — and then
# printed "Model <gguf id> pulled" for a model that was never fetched. That
# combination is not a corner: it is the exact recovery
# `installer_warn_mlx_embedding` tells the user to perform.
#
# Lives here rather than inline in the wizard so the override matrix can be
# executed by scripts/tests/test-model-format-select.sh. A grep over the
# wizard's source cannot observe which string reaches `lms get`.
installer_resolve_lmstudio_models() {
  EMBEDDING_MODEL="${LMSTUDIO_EMBEDDING_MODEL:-text-embedding-qwen3-embedding-0.6b}"
  LLM_MODEL="${MASSA_AI_LLM_MODEL:-qwen3-vl-8b-instruct}"
  CODE_MODEL="${MASSA_AI_LLM_CODE_MODEL:-qwen2.5-coder-7b-instruct}"
  EMBEDDING_FETCH="$EMBEDDING_MODEL"
  LLM_FETCH="$LLM_MODEL"
  CODE_FETCH="$CODE_MODEL"

  # Nested `if` rather than `[ ... ] && VAR=...`: the wizard runs under
  # `set -e`, and a trailing false test would leak exit 1 out of this function.
  if [ "${LMSTUDIO_MODEL_FORMAT:-gguf}" = "mlx" ]; then
    # Only the EMBEDDING id is known to change with the format, and the reason
    # is the reason the role does not work on MLX at all: `lms ls --json`
    # reports `"type":"llm"` for the MLX build where the GGUF build of the same
    # model reports `"type":"embedding"`, so LM Studio never applies its
    # `text-embedding-` prefix. The instruct and coding ids are the same
    # literals on both paths — an assumption, not a measurement, and one the
    # post-fetch reconciliation below makes harmless.
    if [ -z "${LMSTUDIO_EMBEDDING_MODEL:-}" ]; then
      EMBEDDING_MODEL="qwen3-embedding-0.6b-dwq"
      EMBEDDING_FETCH="https://huggingface.co/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ"
    fi
    if [ -z "${MASSA_AI_LLM_MODEL:-}" ]; then
      LLM_FETCH="https://huggingface.co/mlx-community/Qwen3-VL-8B-Instruct-4bit"
    fi
    if [ -z "${MASSA_AI_LLM_CODE_MODEL:-}" ]; then
      CODE_FETCH="https://huggingface.co/mlx-community/Qwen2.5-Coder-7B-Instruct-4bit"
    fi
    return 0
  fi

  # GGUF fetches by repo URL for the same reason MLX does, and this half was
  # broken from the day the trio shipped: `lms get` cannot fetch by catalog id
  # in ANY format. Measured 2026-09-21,
  # `lms get text-embedding-qwen3-embedding-0.6b` answers "Error: No staff
  # picks found with the specified search criteria" with `--gguf`, with `--mlx`,
  # and with no flag at all. The GGUF path passed exactly those ids, so a fresh
  # machine died on `die "LM Studio could not fetch ..."`. It never showed up on
  # a developer box because `inference_model_exists` short-circuits every model
  # already on disk.
  if [ -z "${LMSTUDIO_EMBEDDING_MODEL:-}" ]; then
    EMBEDDING_FETCH="https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF"
  fi
  if [ -z "${MASSA_AI_LLM_MODEL:-}" ]; then
    LLM_FETCH="https://huggingface.co/lmstudio-community/Qwen3-VL-8B-Instruct-GGUF"
  fi
  if [ -z "${MASSA_AI_LLM_CODE_MODEL:-}" ]; then
    CODE_FETCH="https://huggingface.co/lmstudio-community/Qwen2.5-Coder-7B-Instruct-GGUF"
  fi
  return 0
}

# installer_lmstudio_model_key <lms_cli> <fetch_spec> <fallback_id>
#
# Echoes the catalog id LM Studio actually assigned to the build at
# <fetch_spec>, or <fallback_id> when it cannot be read back.
#
# Every id this installer writes into config.json used to be a hardcoded
# literal, and only one of the six is measured. `lms ls --json` removes the
# guess: each entry carries both `modelKey` (the id `/v1/models` serves and
# `lms load` takes) and `path` (the Hugging Face repo it came from, plus the
# weight file for GGUF — `Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-…-Q8_0.gguf`),
# so the repo just fetched maps back to the id LM Studio chose for it.
#
# Falls back rather than failing, at every step: a non-URL fetch spec is a user
# override that is already an id, and a missing CLI or JS runtime is not a
# reason to abort an otherwise complete install. The literal is then exactly as
# good as it was before this function existed.
installer_lmstudio_model_key() {
  local cli="$1" spec="$2" fallback="$3" repo runner key

  case "$spec" in
    https://huggingface.co/*/*) repo="${spec#https://huggingface.co/}" ;;
    *) echo "$fallback"; return 0 ;;
  esac
  [ -n "$cli" ] || { echo "$fallback"; return 0; }
  runner="$(installer_detect_runner)" || { echo "$fallback"; return 0; }

  # The repo is passed as argv, never interpolated into the program text.
  key="$("$cli" ls --json 2>/dev/null | "$runner" -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      let models;
      try { models = JSON.parse(raw); } catch { return; }
      if (!Array.isArray(models)) return;
      const repo = process.argv[1];
      const hit = models.find(
        (m) =>
          m && typeof m.path === "string" &&
          (m.path === repo || m.path.startsWith(repo + "/")),
      );
      if (hit && typeof hit.modelKey === "string") process.stdout.write(hit.modelKey);
    });
  ' "$repo" 2>/dev/null)" || key=""

  if [ -n "$key" ]; then echo "$key"; else echo "$fallback"; fi
}

# installer_unload_loaded_models <lms_cli>
#
# Evicts every model already resident in LM Studio and Ollama before the
# installer loads its own three. Both runtimes are swept whichever provider was
# chosen, because what runs out is one shared pool of RAM/VRAM — an Ollama model
# still resident from an earlier session costs the same gigabytes whether or not
# this install talks to Ollama.
#
# `lms ps --json` prints `[]` when nothing is loaded (measured 2026-09-21), so
# the unload is skipped rather than printing a line about work it did not do.
# `ollama ps` has no such flag and no `stop --all`: its table is header-only
# when idle, hence NR>1, and each name is stopped individually.
installer_unload_loaded_models() {
  local cli="${1:-}" loaded model

  if [ -n "$cli" ]; then
    loaded="$("$cli" ps --json 2>/dev/null | tr -d '[:space:]' || true)"
    if [ -n "$loaded" ] && [ "$loaded" != "[]" ]; then
      echo "  Unloading models already resident in LM Studio..."
      "$cli" unload --all >/dev/null 2>&1 || true
    fi
  fi

  if command -v ollama >/dev/null 2>&1; then
    while IFS= read -r model; do
      [ -n "$model" ] || continue
      echo "  Stopping resident Ollama model ${model}..."
      ollama stop "$model" >/dev/null 2>&1 || true
    done <<EOF
$(ollama ps 2>/dev/null | awk 'NR > 1 && NF > 0 { print $1 }' || true)
EOF
  fi
  return 0
}

# installer_ensure_mlx_runtime <lms_cli>
#
# Installs LM Studio's MLX engine when the MLX format was chosen and the engine
# is absent. `lms runtime get mlx-llm` is idempotent — it answers
# "<engine>@<version> is already installed." and exits 0 — but it is still
# gated on `runtime ls` so an install that needs nothing prints nothing and
# spends no network round trip.
#
# Non-fatal by design: a missing engine surfaces as an LM Studio load error the
# user can act on, and a hard `die` here would strand an install that is
# otherwise complete. The failure is announced, never swallowed.
installer_ensure_mlx_runtime() {
  local cli="$1"

  [ "${LMSTUDIO_MODEL_FORMAT:-gguf}" = "mlx" ] || return 0
  if [ -z "$cli" ]; then
    echo "  ⚠  MLX selected but no lms CLI resolved — cannot verify the MLX engine."
    return 0
  fi

  if "$cli" runtime ls 2>/dev/null | grep -q "mlx-llm"; then
    echo "  ✓ MLX engine already installed"
    return 0
  fi

  echo "  ⚠  MLX engine not installed. Installing..."
  if "$cli" runtime get mlx-llm >/dev/null 2>&1; then
    echo "  ✓ MLX engine installed"
  else
    echo "  ⚠  Could not install the MLX engine. Install it from LM Studio's"
    echo "     Runtimes page, or run: ${cli} runtime get mlx-llm"
  fi
  return 0
}

# installer_prompt_features <llm_available>
#
# Walks every Config-tab feature section. <llm_available> is "true" when an LLM
# model is actually pulled — the LLM-gated toggles are skipped otherwise rather
# than offering a feature that cannot run.
#
# Sets the same globals `installer_write_config` reads. Call
# `installer_feature_defaults` first so the prompts start from what is stored.
installer_prompt_features() {
  local llm_available="${1:-false}"

  if ! installer_can_prompt; then
    echo "  Non-interactive install — keeping the current feature configuration."
    return 0
  fi

  echo ""
  echo "Feature configuration — Enter keeps the value shown in brackets."
  echo ""

  echo "  Impact Analysis"
  echo "    A graph CTE that ranks what a diff touches. Off by default: it is a"
  echo "    recursive query whose cost grows with the symbol graph."
  installer_ask IMPACT_BFS_CTE_ENABLED "Enable impact-analysis BFS CTE?"
  echo ""

  echo "  Synapse"
  echo "    Retrieval modulation — diversity penalties, temporal inhibition, a"
  echo "    confidence gate and the prefetch buffer. Local computation, no LLM."
  installer_ask SYNAPSE_ENABLED "Enable Synapse?"
  echo ""

  echo "  Memory"
  echo "    Bootstrap seeds a new project from its git history. Auto-improve"
  echo "    rewrites memories from observed usage. Auto-importance scores new"
  echo "    memories as they are written."
  installer_ask MEMORY_BOOTSTRAP_ENABLED "Enable memory bootstrap?"
  installer_ask MEMORY_AUTO_IMPROVE_ENABLED "Enable memory auto-improve?"
  installer_ask MEMORY_AUTO_IMPORTANCE_ENABLED "Enable memory auto-importance?"
  echo ""

  echo "  Hooks"
  echo "    Ingests host events (tool calls, edits) so retrieval learns from"
  echo "    what you actually do. The bridge turns those observations into"
  echo "    memory candidates."
  installer_ask HOOKS_ENABLED "Enable hooks?"
  installer_ask HOOKS_BRIDGE_ENABLED "Enable the hook observation bridge?"
  echo ""

  echo "  Handoffs"
  echo "    Cross-session handoff packages. No LLM dependency."
  installer_ask HANDOFFS_ENABLED "Enable handoffs?"
  echo ""

  echo "  Scheduler"
  echo "    Background jobs. The safe preset runs memory consolidation every"
  echo "    30 minutes and a decay sweep hourly; auto-improve,"
  echo "    observation-bridge and checkpoint-purge stay off unless asked for."
  installer_ask SCHEDULER_ENABLED "Enable the background scheduler?"
  if [ "$SCHEDULER_ENABLED" = "true" ]; then
    installer_ask SCHEDULER_CONSOLIDATION_ENABLED "  Run memory consolidation (30 min)?"
    installer_ask SCHEDULER_DECAY_ENABLED "  Run the decay sweep (hourly)?"
    installer_ask SCHEDULER_AUTO_IMPROVE_ENABLED "  Run auto-improve (30 min)?"
    installer_ask SCHEDULER_OBSERVATION_BRIDGE_ENABLED "  Run the observation bridge (30 min)?"
    installer_ask SCHEDULER_CHECKPOINT_PURGE_ENABLED "  Run checkpoint purge (hourly, deletes old checkpoints)?"
  fi
  echo ""

  echo "  Capture Policy"
  echo "    The rules deciding which files reach the index. Writing them into"
  echo "    config.json makes them visible and editable in the Admin Portal;"
  echo "    declining leaves the same rules in force as a built-in default."
  installer_ask CAPTURE_POLICY_ENABLED "Write the default capture policy into config.json?"
  echo ""

  echo "  LLM"
  if [ "$llm_available" = "true" ]; then
    echo "    Powers compression, reranking, query understanding and memory"
    echo "    synthesis. Every LLM feature degrades to a rule-based path when off."
    installer_ask LLM_ENABLED "Enable LLM-backed features?"
    echo ""

    echo "  Search quality (LLM-backed, both add latency to every search)"
    echo "    Query understanding rewrites the query (+ HyDE) before retrieval:"
    echo "    +1-2 LLM calls per unique query, 2-10s on a local CPU, cached"
    echo "    5 min / 256 entries. A bad rewrite can reduce recall."
    installer_ask SEARCH_QU_ENABLED "Enable query understanding?"
    echo "    Rerank re-orders the top 50 results by LLM relevance after"
    echo "    retrieval: +1 LLM call per search, ~1-5s local, subjective"
    echo "    reorder of the same result set (tail preserved)."
    installer_ask SEARCH_RERANK_ENABLED "Enable rerank?"
  else
    # Offering a toggle for a model that is not pulled produces a config that
    # looks enabled and silently degrades on every call.
    LLM_ENABLED=false
    SEARCH_QU_ENABLED=false
    SEARCH_RERANK_ENABLED=false
    echo "    No LLM model reachable — LLM, query understanding and rerank left off."
  fi
  echo ""
}

## installer_export_features
# Exports every toggle so a nested installer stage inherits the answers.
# install.sh (source mode) runs setup-local-first.sh as a separate bash
# process; without this the wizard would ask the same nine questions again and
# write whichever answer came second.
installer_export_features() {
  export LLM_ENABLED SEARCH_QU_ENABLED SEARCH_RERANK_ENABLED \
    IMPACT_BFS_CTE_ENABLED SYNAPSE_ENABLED \
    MEMORY_BOOTSTRAP_ENABLED MEMORY_AUTO_IMPROVE_ENABLED MEMORY_AUTO_IMPORTANCE_ENABLED \
    HOOKS_ENABLED HOOKS_BRIDGE_ENABLED HANDOFFS_ENABLED \
    SCHEDULER_ENABLED SCHEDULER_CONSOLIDATION_ENABLED SCHEDULER_DECAY_ENABLED \
    SCHEDULER_AUTO_IMPROVE_ENABLED SCHEDULER_OBSERVATION_BRIDGE_ENABLED \
    SCHEDULER_CHECKPOINT_PURGE_ENABLED CAPTURE_POLICY_ENABLED
}

# installer_feature_flow <config_file> <llm_available>
#
# The entry point both installers call: seed from disk, ask once, export.
#
# The once-per-install guard is what replaces setup-local-first.sh's old
# `if [ "$ENV_FILE_EXISTED" = false ]`. That gate suppressed the prompt on
# every re-install — the property it was reaching for was "do not ask twice in
# one run", and it bought that by never asking again at all.
installer_feature_flow() {
  local config_file="$1"
  local llm_available="${2:-false}"

  if [ "${MASSA_AI_FEATURES_PROMPTED:-0}" = "1" ]; then
    echo "  Feature configuration already chosen earlier in this install — keeping it."
    return 0
  fi

  installer_feature_defaults "$config_file"
  installer_prompt_features "$llm_available"
  installer_export_features
  MASSA_AI_FEATURES_PROMPTED=1
  export MASSA_AI_FEATURES_PROMPTED
}

# installer_feature_summary
# One line per section, for the installer's closing report.
installer_feature_summary() {
  echo "    Impact analysis: ${IMPACT_BFS_CTE_ENABLED}"
  echo "    Synapse: ${SYNAPSE_ENABLED}"
  echo "    Memory: bootstrap ${MEMORY_BOOTSTRAP_ENABLED}, auto-improve ${MEMORY_AUTO_IMPROVE_ENABLED}, auto-importance ${MEMORY_AUTO_IMPORTANCE_ENABLED}"
  echo "    Hooks: ${HOOKS_ENABLED}, bridge ${HOOKS_BRIDGE_ENABLED}"
  echo "    Handoffs: ${HANDOFFS_ENABLED}"
  echo "    Scheduler: ${SCHEDULER_ENABLED} (consolidation ${SCHEDULER_CONSOLIDATION_ENABLED}, decay ${SCHEDULER_DECAY_ENABLED}, auto-improve ${SCHEDULER_AUTO_IMPROVE_ENABLED}, observation-bridge ${SCHEDULER_OBSERVATION_BRIDGE_ENABLED}, checkpoint-purge ${SCHEDULER_CHECKPOINT_PURGE_ENABLED})"
  echo "    Capture policy in config.json: ${CAPTURE_POLICY_ENABLED}"
  echo "    LLM: ${LLM_ENABLED}"
  echo "    Search: query understanding ${SEARCH_QU_ENABLED}, rerank ${SEARCH_RERANK_ENABLED}"
}
