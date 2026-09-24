#!/bin/bash
set -e

# ========================================
# massa-ai - Local-First Setup Script
# ========================================
# Sets up massa-ai to work 100% offline
# with no dependency on external services.
#
# Usage: ./scripts/setup-local-first.sh
# ========================================

# shellcheck source=scripts/banner.sh
source "$(dirname "${BASH_SOURCE[0]}")/banner.sh"
# shellcheck source=scripts/lib/installer-env-transaction.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-env-transaction.sh"
# shellcheck source=scripts/lib/installer-shared.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-shared.sh"
# shellcheck source=scripts/lib/installer-api-key.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-api-key.sh"
# Sourced here rather than beside installer_feature_flow below: Step 0 needs
# installer_detect_provider before anything else runs, and this file is
# function-only with no side effects at source time.
# shellcheck source=scripts/lib/installer-feature-prompts.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-feature-prompts.sh"
massa_ai_banner

# Back up an existing config file to <file>.bak before it gets regenerated.
backup_if_exists() {
    [ -f "$1" ] || return 0
    cp "$1" "$1.bak"
    echo -e "  ${YELLOW}⚠${NC} Backed up existing $1 → $1.bak"
}

die() {
    echo -e "  ${RED}✗${NC} $*" >&2
    exit 1
}

require_postgres_database_url() {
    local database_url="$1"
    case "$database_url" in
        postgres://*|postgresql://*) ;;
        *) die "DATABASE_URL must use postgres:// or postgresql://." ;;
    esac

    local without_query="${database_url%%\?*}"
    case "$without_query" in
        *://*/*) ;;
        *) die "DATABASE_URL must include a database name." ;;
    esac
    local authority_and_path="${without_query#*://}"
    local authority="${authority_and_path%%/*}"
    local database_name="${authority_and_path#*/}"
    [ -n "$authority" ] && [ -n "$database_name" ] || die "DATABASE_URL must include a host and database name."
}

# massa_ai_probe_provider <base_url> [provider]
#
# Bash mirror of probeProvider() in packages/core/src/kernel/inference-probe.ts:
# discriminates by response BODY SHAPE, never by HTTP status. LM Studio answers
# 200 with {"error":...} for every endpoint it does not implement, so a status
# check reports a live Ollama that is not there. Byte-identical in install.sh,
# scripts/setup-local-first.sh, scripts/ensure-ollama.sh and
# scripts/validate-vscode-integration.sh; scripts/__tests__/probe-dialect-parity.test.ts
# holds the copies identical and asserts both halves agree on every fixture body.
massa_ai_probe_provider() {
  local base_url="$1" provider="${2:-ollama}" path key origin body
  case "$provider" in
    ollama)   path="/api/tags"  ; key="models" ;;
    lmstudio) path="/v1/models" ; key="data"   ;;
    *) return 1 ;;
  esac
  # probeProvider resolves with new URL(<absolute path>, baseUrl), which drops
  # any path prefix on baseUrl; keep scheme://authority only so that
  # http://localhost:1234/v1 does not become .../v1/v1/models.
  origin="$(printf '%s' "$base_url" | sed -E 's#^([a-zA-Z][a-zA-Z0-9+.-]*://[^/]*).*#\1#')"
  body="$(curl -s --max-time 3 "${origin}${path}" 2>/dev/null)" || return 1
  printf '%s' "$body" | grep -Eq "\"${key}\"[[:space:]]*:[[:space:]]*\["
}

# ---- Step 0: Local inference provider ----
# Runs before the Ollama step because it decides whether that step applies.
# installer_detect_provider / installer_select_provider / migrate_provider live
# in scripts/lib/installer-feature-prompts.sh so install.sh can reuse them and
# so scripts/tests/test-lms-model-exists.sh can execute them.
# Both providers' endpoint defaults live here rather than inside their own
# setup function: ollama_model_exists and the Step 5 verification read
# OLLAMA_URL / OLLAMA_HAS_CLI from installer scope whichever provider was
# chosen, and moving those assignments into setup_ollama would leave them
# unset on the LM Studio path.
OLLAMA_URL="${OLLAMA_HOST:-http://localhost:11434}"
OLLAMA_HAS_CLI=false
OLLAMA_API_REACHABLE=false
LMSTUDIO_URL="${LMSTUDIO_BASE_URL:-http://localhost:1234/v1}"
DETECTED_PROVIDER="$(installer_detect_provider "${HOME}/.config/massa-ai/config.json")"
installer_select_provider "$DETECTED_PROVIDER"
if [ -n "$INFERENCE_PROVIDER_FROM" ]; then
    migrate_provider "$INFERENCE_PROVIDER_FROM" "$INFERENCE_PROVIDER"
fi
# PDM-13. Runs right after the provider is settled because it is a no-op on
# every provider but LM Studio, and because Step 1's MLX-engine check and
# Step 2's `lms get` flag both read the format it sets.
installer_select_model_format

# ---- Step 1: Check the selected provider ----
# Echo the path to the lms CLI, or nothing. ~/.lmstudio/bin/lms is checked
# BEFORE `command -v lms`: the CLI is not on PATH until LM Studio has
# bootstrapped it, and that exact false negative happened during
# investigation — `command -v lms` reported absent on a machine that had it.
lms_cli_path() {
    if [ -x "${HOME}/.lmstudio/bin/lms" ]; then
        echo "${HOME}/.lmstudio/bin/lms"
        return 0
    fi
    command -v lms 2>/dev/null
}

setup_lmstudio() {
    echo -e "${BOLD}[1/6] Checking LM Studio...${NC}"
    LMSTUDIO_CLI="$(lms_cli_path)"

    if [ -z "$LMSTUDIO_CLI" ]; then
        echo -e "  ${YELLOW}⚠${NC} LM Studio CLI not found. Installing (headless)..."
        curl -fsSL https://lmstudio.ai/install.sh | bash \
            || die "LM Studio install failed. Install it manually: https://lmstudio.ai/download"
        LMSTUDIO_CLI="$(lms_cli_path)"
        [ -n "$LMSTUDIO_CLI" ] \
            || die "LM Studio installed but no lms CLI at ~/.lmstudio/bin/lms or on PATH."
    fi
    echo -e "  ${GREEN}✓${NC} LM Studio CLI: ${LMSTUDIO_CLI}"

    if ! massa_ai_probe_provider "$LMSTUDIO_URL" lmstudio; then
        echo -e "  ${YELLOW}⚠${NC} LM Studio server not responding. Starting..."
        "$LMSTUDIO_CLI" daemon up >/dev/null 2>&1 || true
        sleep 2
    fi

    # Body-shape probe, never the status code: LM Studio answers 200 with
    # {"error":...} for endpoints it does not implement.
    massa_ai_probe_provider "$LMSTUDIO_URL" lmstudio \
        || die "LM Studio API not reachable at ${LMSTUDIO_URL}. Start it: ${LMSTUDIO_CLI} daemon up"
    echo -e "  ${GREEN}✓${NC} LM Studio API reachable at ${LMSTUDIO_URL}"

    # PDM-13: MLX weights need LM Studio's MLX engine, which is a separate
    # runtime extension from llama.cpp. A no-op unless the MLX format was
    # chosen. Runs after the daemon is confirmed up — `lms runtime ls` talks to
    # it.
    installer_ensure_mlx_runtime "$LMSTUDIO_CLI"
}

setup_ollama() {
    echo -e "${BOLD}[1/6] Checking Ollama...${NC}"

    # Check if Ollama CLI is available
    if command -v ollama &> /dev/null; then
        OLLAMA_HAS_CLI=true
        echo -e "  ${GREEN}✓${NC} Ollama CLI is installed"
    fi

    # Check if Ollama API is reachable (covers WSL -> Windows host, remote, etc.)
    if massa_ai_probe_provider "$OLLAMA_URL"; then
        OLLAMA_API_REACHABLE=true
        OLLAMA_VERSION=$(curl -s "${OLLAMA_URL}/api/version" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','unknown'))" 2>/dev/null || echo "unknown")
        echo -e "  ${GREEN}✓${NC} Ollama API reachable at ${OLLAMA_URL} (v${OLLAMA_VERSION})"
    fi

    if [ "$OLLAMA_HAS_CLI" = false ] && [ "$OLLAMA_API_REACHABLE" = false ]; then
        # Neither CLI nor API available - try to install
        echo -e "  ${YELLOW}⚠${NC} Ollama not found. Installing..."
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            curl -fsSL https://ollama.com/install.sh | sh
            OLLAMA_HAS_CLI=true
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            echo -e "  ${YELLOW}⚠${NC} On macOS, install Ollama first:"
            echo -e "      brew install ollama   (then: brew services start ollama)"
            echo -e "      or download from https://ollama.com/download"
            echo -e "  ${YELLOW}⚠${NC} Then re-run this script."
            exit 1
        else
            echo -e "  ${RED}✗${NC} Unsupported OS. Install Ollama manually: https://ollama.com"
            exit 1
        fi
    elif [ "$OLLAMA_HAS_CLI" = false ] && [ "$OLLAMA_API_REACHABLE" = true ]; then
        # API reachable but no CLI (e.g. WSL with Ollama on Windows host)
        echo -e "  ${GREEN}✓${NC} Using remote Ollama API (no local CLI needed)"
    fi

    # If API is not reachable yet, try to start it
    if [ "$OLLAMA_API_REACHABLE" = false ]; then
        if [ "$OLLAMA_HAS_CLI" = true ]; then
            echo -e "  ${YELLOW}⚠${NC} Ollama API not responding. Starting..."
            nohup ollama serve > /dev/null 2>&1 &
            sleep 2

            if massa_ai_probe_provider "$OLLAMA_URL"; then
                OLLAMA_API_REACHABLE=true
                echo -e "  ${GREEN}✓${NC} Ollama started successfully"
            else
                echo -e "  ${RED}✗${NC} Failed to start Ollama. Please start it manually: ollama serve"
                exit 1
            fi
        else
            echo -e "  ${RED}✗${NC} Ollama API not reachable at ${OLLAMA_URL}"
            echo -e "      Set OLLAMA_HOST to point to your Ollama instance."
            exit 1
        fi
    fi
}

if [ "${INFERENCE_PROVIDER:-ollama}" = "lmstudio" ]; then
    setup_lmstudio
else
    setup_ollama
fi

# Detect whether a named Ollama model is already pulled, without silently
# returning "no" (which would trigger a multi-GB re-pull). Matching is exact
# on name:tag — a bare name normalizes to :latest, mirroring Ollama itself. A
# sibling tag must never satisfy the check: an installed qwen3-embedding:8b
# used to make qwen3-embedding:4b read "already available" and skip the pull.
# Preference order:
#   1. `ollama list` CLI (no python3 dependency, works offline once pulled)
#   2. /api/tags parsed with python3 (if python3 is present)
#   3. /api/tags body scanned with grep (last-resort, no python3)
# Each branch prints exactly "yes" or "no".
ollama_model_exists() {
    local model="$1" body
    case "$model" in *:*) ;; *) model="${model}:latest" ;; esac
    # 1. CLI
    if [ "$OLLAMA_HAS_CLI" = true ]; then
        if ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -Fxq "$model"; then
            echo "yes"; return 0
        fi
    fi
    # Fetch the tags payload once for the fallbacks.
    body="$(curl -s "${OLLAMA_URL}/api/tags" 2>/dev/null || true)"
    if [ -z "$body" ]; then echo "no"; return 0; fi
    # 2. python3 JSON parse (model passed via argv — never interpolated into code)
    if command -v python3 >/dev/null 2>&1; then
        printf '%s' "$body" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    print("no"); sys.exit(0)
models = [m.get("name","") for m in data.get("models", [])]
print("yes" if sys.argv[1] in models else "no")
' "$model" 2>/dev/null && return 0
    fi
    # 3. grep fallback: match \"name\":\"<model>\" exactly, closing quote included.
    local model_re
    model_re="$(printf '%s' "$model" | sed 's/[][\.*^$+?(){}|/]/\\&/g')"
    if printf '%s' "$body" | grep -Eq "\"name\"[[:space:]]*:[[:space:]]*\"${model_re}\""; then
        echo "yes"
    else
        echo "no"
    fi
}

# Sibling of ollama_model_exists for LM Studio, same "yes"/"no" contract and
# the same two fallbacks — a separate function, not a branch inside the one
# above, because scripts/tests/test-setup-ollama-model-exists.sh extracts that
# one by literal `sed -n '/^ollama_model_exists()/,/^}/p'` and must keep
# finding it byte for byte.
#
# No CLI branch, deliberately: `lms` is not on PATH until bootstrapped and its
# listing output format was never measured for this feature, while /v1/models
# was (it is the shape probeProvider's lmstudio parser reads). LM Studio model
# ids are exact — there is no :latest normalization to mirror.
lms_model_exists() {
    local model="$1" body
    body="$(curl -s "${LMSTUDIO_URL}/models" 2>/dev/null || true)"
    if [ -z "$body" ]; then echo "no"; return 0; fi
    # 1. python3 JSON parse (model passed via argv — never interpolated into code)
    if command -v python3 >/dev/null 2>&1; then
        printf '%s' "$body" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    print("no"); sys.exit(0)
ids = [m.get("id","") for m in data.get("data", [])]
print("yes" if sys.argv[1] in ids else "no")
' "$model" 2>/dev/null && return 0
    fi
    # 2. grep fallback: match \"id\":\"<model>\" exactly, closing quote included.
    local model_re
    model_re="$(printf '%s' "$model" | sed 's/[][\.*^$+?(){}|/]/\\&/g')"
    if printf '%s' "$body" | grep -Eq "\"id\"[[:space:]]*:[[:space:]]*\"${model_re}\""; then
        echo "yes"
    else
        echo "no"
    fi
}

# The provider dispatch, a third function so neither sibling above has to grow
# a provider branch. Defaults to Ollama: INFERENCE_PROVIDER is empty when the
# install is on an API embedding provider, which LIP-13 leaves untouched.
inference_model_exists() {
    case "${INFERENCE_PROVIDER:-ollama}" in
        lmstudio) lms_model_exists "$1" ;;
        *) ollama_model_exists "$1" ;;
    esac
}

# ---- Step 2: Pull models ----
echo ""
echo -e "${BOLD}[2/6] Pulling models...${NC}"

# One pull path, provider-dispatched. The three blocks this replaces were the
# same twelve lines with the model variable and a parenthetical swapped, which
# is how the Ollama-only `ollama pull` survived into a provider-neutral wizard.
#
# <fetch_spec> is what `lms get` is handed, which is NOT always the model id.
# On the MLX path it must be the Hugging Face repo URL: `lms get --mlx` run
# against a catalog id answers "No staff picks found with the specified search
# criteria", and run against a bare search term resolves to whatever staff pick
# ranks first — measured 2026-09-21, `--mlx qwen3-vl` picked the 4B and
# `--mlx qwen2.5-coder` the 32B. Only the repo URL pins a build. Defaults to
# the model id, which is what every GGUF/Ollama caller wants.
ensure_inference_model() {
    local model="$1" note="$2" fetch="${3:-$1}"
    if [ "$(inference_model_exists "$model")" = "yes" ]; then
        echo -e "  ${GREEN}✓${NC} Model ${model} already available"
        return 0
    fi
    echo -e "  Pulling ${model}${note}..."
    if [ "${INFERENCE_PROVIDER:-ollama}" = "lmstudio" ]; then
        # The format flag is always passed, never omitted: with neither flag
        # `lms get` considers "only options supported by your system", which on
        # Apple Silicon can resolve an MLX build for a GGUF install.
        "$LMSTUDIO_CLI" get -y "--${LMSTUDIO_MODEL_FORMAT:-gguf}" "$fetch" \
            || die "LM Studio could not fetch ${fetch}. Pull it from the app, then re-run this script."
    elif [ "$OLLAMA_HAS_CLI" = true ]; then
        ollama pull "$model"
    else
        # Pull via API (works for remote/WSL scenarios)
        curl -s "${OLLAMA_URL}/api/pull" -d "{\"name\": \"${model}\"}" | while IFS= read -r line; do
            STATUS=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || true)
            if [ -n "$STATUS" ]; then
                printf "\r  %s" "$STATUS"
            fi
        done
        echo ""
    fi
    echo -e "  ${GREEN}✓${NC} Model ${model} pulled"
}

# Model ids are provider-specific — an Ollama tag is not an LM Studio id — so
# the defaults are too. The LM Studio values are the ones measured for this
# feature; the env overrides keep their existing names.
if [ "${INFERENCE_PROVIDER:-ollama}" = "lmstudio" ]; then
    # PDM-13. The id/fetch split and the whole MLX override matrix live in
    # scripts/lib/installer-feature-prompts.sh so they can be executed by
    # scripts/tests/test-model-format-select.sh — a grep over this file cannot
    # observe which string reaches `lms get`.
    # scripts/__tests__/mlx-model-parity.test.ts holds that function's literals
    # identical to INFERENCE_PROVIDERS.lmstudio.mlxModels.
    installer_resolve_lmstudio_models
else
    EMBEDDING_MODEL="${OLLAMA_EMBEDDING_MODEL:-qwen3-embedding:0.6b}"
    LLM_MODEL="${MASSA_AI_LLM_MODEL:-qwen3-vl:8b}"
    CODE_MODEL="${MASSA_AI_LLM_CODE_MODEL:-qwen2.5-coder:7b}"
    # Ollama pulls by the id itself; there is no second name to resolve.
    EMBEDDING_FETCH="$EMBEDDING_MODEL"
    LLM_FETCH="$LLM_MODEL"
    CODE_FETCH="$CODE_MODEL"
fi

ensure_inference_model "$EMBEDDING_MODEL" "" "$EMBEDDING_FETCH"
ensure_inference_model "$LLM_MODEL" " (instruct model)" "$LLM_FETCH"
if [ "$CODE_MODEL" != "$LLM_MODEL" ]; then
    ensure_inference_model "$CODE_MODEL" " (code-oriented LLM)" "$CODE_FETCH"
fi

# What was fetched is a repo; what config.json has to record is the catalog id
# LM Studio assigned to it. Ask LM Studio rather than trusting the literal —
# five of the six ids in the seam were never measured, and a wrong one writes a
# config pointing at a model that does not exist, which degrades silently.
if [ "${INFERENCE_PROVIDER:-ollama}" = "lmstudio" ]; then
    EMBEDDING_MODEL="$(installer_lmstudio_model_key "${LMSTUDIO_CLI:-}" "$EMBEDDING_FETCH" "$EMBEDDING_MODEL")"
    LLM_MODEL="$(installer_lmstudio_model_key "${LMSTUDIO_CLI:-}" "$LLM_FETCH" "$LLM_MODEL")"
    CODE_MODEL="$(installer_lmstudio_model_key "${LMSTUDIO_CLI:-}" "$CODE_FETCH" "$CODE_MODEL")"
fi
# PDM-12/design R-08: LM Studio exposes no per-request context length, so the
# only way to bound a role's context window is to load the model with it.
# Ollama gets its per-request num_ctx from the runtime seam (T06); this loads
# each LM Studio model once, at the context its role needs.
#
# design R-09: the new trio makes LLM_MODEL and CODE_MODEL distinct LM Studio
# ids (8B@16k + 7B@32k, beside the 0.6B@8k embedder), so all three can now be
# asked to load at once — unsized total VRAM/RAM. Resolved by staggering
# residency rather than sizing it (sizing needs a real box, which this script
# cannot assume): --ttl evicts an idle model instead of holding all three
# loaded forever, so peak residency tracks actual usage, not the sum of all
# three roles.
# ponytail: one flat 600s TTL for every role, not sized per model footprint.
# Upgrade path: measure real VRAM per model and pick a role-specific TTL (or
# an explicit `lms unload` after each role's use) if idle memory pressure is
# reported.
LMS_LOAD_TTL_SECONDS=600
# Evict whatever is already resident before adding three more models to the same
# RAM/VRAM pool. A machine that has been serving a 32B model all afternoon has
# no room for the trio below, and LM Studio's failure mode for that is a load
# error per role rather than anything the wizard could recover from.
installer_unload_loaded_models "${LMSTUDIO_CLI:-}"
if [ "${INFERENCE_PROVIDER:-ollama}" = "lmstudio" ]; then
    # LMSTUDIO_CLI is resolved by setup_lmstudio() (lms_cli_path — checks
    # ~/.lmstudio/bin before PATH) earlier in this same run; reuse it rather
    # than a bare `command -v lms`, which misses that exact case.
    # The embedding role is loaded into LM Studio only when LM Studio is the
    # one serving it. On the MLX path the sidecar below owns that role, and
    # loading the same weights here too would hold ~335 MB resident for a model
    # LM Studio cannot answer an embedding request with — measured on a live
    # install: dropping exactly that duplicate freed 335 MB with the endpoint
    # still returning 1024 floats.
    LMS_LOADS_EMBEDDING=true
    if [ "${LMSTUDIO_MODEL_FORMAT:-gguf}" = "mlx" ] && [ -z "${LMSTUDIO_EMBEDDING_MODEL:-}" ]; then
        LMS_LOADS_EMBEDDING=false
    fi
    if [ -n "${LMSTUDIO_CLI:-}" ]; then
        if [ "$LMS_LOADS_EMBEDDING" = true ]; then
            "$LMSTUDIO_CLI" load -c 8192 --ttl "$LMS_LOAD_TTL_SECONDS" "$EMBEDDING_MODEL" || true
        fi
        "$LMSTUDIO_CLI" load -c 16384 --ttl "$LMS_LOAD_TTL_SECONDS" "$LLM_MODEL" || true
        if [ "$CODE_MODEL" != "$LLM_MODEL" ]; then
            "$LMSTUDIO_CLI" load -c 32768 --ttl "$LMS_LOAD_TTL_SECONDS" "$CODE_MODEL" || true
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} lms CLI not found — skipping per-role context load. Load manually:"
        if [ "$LMS_LOADS_EMBEDDING" = true ]; then
            echo -e "      lms load -c 8192 --ttl ${LMS_LOAD_TTL_SECONDS} ${EMBEDDING_MODEL}"
        fi
        echo -e "      lms load -c 16384 --ttl ${LMS_LOAD_TTL_SECONDS} ${LLM_MODEL}"
        if [ "$CODE_MODEL" != "$LLM_MODEL" ]; then
            echo -e "      lms load -c 32768 --ttl ${LMS_LOAD_TTL_SECONDS} ${CODE_MODEL}"
        fi
    fi

    # The MLX embedding endpoint. `installer_provider_defaults` already points
    # `embedding.baseURL` here on this path, so without this call the written
    # config names a port nothing listens on.
    installer_setup_mlx_embedding_sidecar "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi


# ---- Step 3: Database selection ----
echo ""
echo -e "${BOLD}[3/6] Database selection...${NC}"
echo ""
echo -e "  Choose your database backend:"
echo -e "    ${BLUE}1)${NC} Native PostgreSQL  (recommended, ~100MB RAM, no Docker)"
echo -e "    ${BLUE}2)${NC} Docker PostgreSQL  (colima + Docker, ~5GB RAM)"
echo ""
# Non-interactive override (mirrors MASSA_AI_MODE in install.sh)
case "${MASSA_AI_DB_BACKEND:-}" in
    native) DB_CHOICE=1 ;;
    docker) DB_CHOICE=2 ;;
    sqlite) die "MASSA_AI_DB_BACKEND=sqlite is not supported. Choose native or docker." ;;
    "")
        read -rp "  Enter your choice [1]: " DB_CHOICE </dev/tty || true
        DB_CHOICE=${DB_CHOICE:-1}
        ;;
    *)
        die "Invalid MASSA_AI_DB_BACKEND. Choose native or docker."
        ;;
esac

DATABASE_URL=""

if [ "$DB_CHOICE" = "1" ]; then
    # ---- Native PostgreSQL (macOS / Homebrew) ----
    echo ""
    NATIVE_HELPER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-native-postgres.sh"
    if [ -x "$NATIVE_HELPER" ]; then
        if NATIVE_OUTPUT="$("$NATIVE_HELPER" 2>&1)"; then
            echo "$NATIVE_OUTPUT"
            DATABASE_URL="$(printf '%s\n' "$NATIVE_OUTPUT" | sed -n 's/^DATABASE_URL=//p' | head -1)"
            echo -e "  ${GREEN}✓${NC} Native PostgreSQL ready"
        else
            echo "$NATIVE_OUTPUT" >&2
            die "Native PostgreSQL setup failed. Fix it and re-run: bash \"$NATIVE_HELPER\""
        fi
    else
        die "Native PostgreSQL helper not found: $NATIVE_HELPER"
    fi
elif [ "$DB_CHOICE" = "2" ]; then
    # ---- Docker PostgreSQL (colima + Docker) ----
    echo ""
    echo -e "  ${YELLOW}⚠${NC} Docker PostgreSQL runs via colima + Docker and reserves ~5GB RAM."
    echo -e "  ${YELLOW}⚠${NC} For a lighter native PostgreSQL (~100MB, no Docker), re-run and choose option 1."
    echo ""
    
    # Check if docker is available
    if command -v docker &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Docker is installed"
        
        # Find available port starting from 5432
        POSTGRES_PORT=5432
        while netstat -tuln 2>/dev/null | grep -q ":${POSTGRES_PORT} " || ss -tuln 2>/dev/null | grep -q ":${POSTGRES_PORT} "; do
            echo -e "  ${YELLOW}⚠${NC} Port ${POSTGRES_PORT} is already in use"
            POSTGRES_PORT=$((POSTGRES_PORT + 1))
        done
        
        if [ "$POSTGRES_PORT" != "5432" ]; then
            echo -e "  ${GREEN}✓${NC} Using alternative port: ${POSTGRES_PORT}"
        fi
        
        # Check if postgres container is running
        if docker ps --format '{{.Names}}' | grep -q "massa-ai-postgres"; then
            echo -e "  ${GREEN}✓${NC} PostgreSQL container already running"
            
            # Get the port from running container
            RUNNING_PORT=$(docker port massa-ai-postgres 5432 2>/dev/null | cut -d: -f2)
            if [ -n "$RUNNING_PORT" ]; then
                POSTGRES_PORT=$RUNNING_PORT
                echo -e "  ${GREEN}✓${NC} Using existing container port: ${POSTGRES_PORT}"
            fi
        else
            echo -e "  ${YELLOW}⚠${NC} Starting PostgreSQL with Docker..."
            
            # Get project root
            SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
            
            # Export port for docker-compose
            export MASSA_AI_POSTGRES_PORT=$POSTGRES_PORT
            
            cd "$PROJECT_ROOT"
            docker compose up -d postgres
            
            if [ $? -eq 0 ]; then
                echo -e "  ${GREEN}✓${NC} PostgreSQL started successfully on port ${POSTGRES_PORT}"
                sleep 3  # Wait for postgres to be ready
            else
                echo -e "  ${RED}✗${NC} Failed to start PostgreSQL"
                echo -e "      Try manually: cd ${PROJECT_ROOT} && MASSA_AI_POSTGRES_PORT=${POSTGRES_PORT} docker compose up -d postgres"
                exit 1
            fi
        fi
        
        DATABASE_URL="postgresql://massa_ai:massa_ai_password@localhost:${POSTGRES_PORT}/massa_ai"
        echo -e "  ${GREEN}✓${NC} Database URL: ${DATABASE_URL}"
    else
        die "Docker not found. Install/start Docker and re-run, or choose native PostgreSQL."
    fi
else
    die "Invalid database selection. Choose 1 for native PostgreSQL or 2 for Docker PostgreSQL."
fi

require_postgres_database_url "$DATABASE_URL"

# ---- Step 4: Create directories and config ----
echo ""
echo -e "${BOLD}[4/6] Creating directories and config...${NC}"

# Data directory — unified under the XDG config home so config + data live in
# one place (~/.config/massa-ai/). The legacy ~/.massa-ai-data/ location
# is migrated idempotently if present and the new path does not yet exist.
DATA_DIR="${HOME}/.config/massa-ai/data"
LEGACY_DATA_DIR="${HOME}/.massa-ai-data"
if [ -d "$LEGACY_DATA_DIR" ] && [ ! -d "$DATA_DIR" ]; then
    mkdir -p "${HOME}/.config/massa-ai"
    if mv "$LEGACY_DATA_DIR" "$DATA_DIR" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Migrated data directory: ${LEGACY_DATA_DIR} -> ${DATA_DIR}"
    else
        echo -e "  ${YELLOW}⚠${NC} Could not move ${LEGACY_DATA_DIR} -> ${DATA_DIR} (cross-volume?). Move it manually."
    fi
fi
mkdir -p "$DATA_DIR"
echo -e "  ${GREEN}✓${NC} Data directory: ${DATA_DIR}"

# Config directory
CONFIG_DIR="${HOME}/.config/massa-ai"
mkdir -p "$CONFIG_DIR"
CONFIG_FILE="${CONFIG_DIR}/config.json"

# Get project root (assuming script is in scripts/ directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

# Feature toggles. Seeded from the config.json already on disk, then asked —
# so pressing Enter through the prompt keeps exactly what is installed, and a
# re-run is both a safe no-op and the supported way to change an answer.
#
# The previous version wrapped the prompt in `if [ "$ENV_FILE_EXISTED" = false ]`.
# The property it wanted was "do not ask twice in one install"; what it bought
# was never asking again on any machine that had ever run setup. That guard now
# lives in `installer_feature_flow` as a once-per-install marker, so install.sh
# asking first suppresses this call rather than the presence of a file.
# (installer-feature-prompts.sh is sourced at the top of this file — Step 0
# needs installer_detect_provider before the Ollama step runs.)

# `inference_model_exists` echoes yes/no; the prompt only offers the LLM-gated
# toggles when the model is genuinely pulled.
LLM_MODEL_PRESENT=false
if [ "$(inference_model_exists "${LLM_MODEL:-qwen3-vl:8b}")" = "yes" ]; then
    LLM_MODEL_PRESENT=true
fi

installer_feature_flow "$CONFIG_FILE" "$LLM_MODEL_PRESENT"

# Regenerate the .env file, backing up any existing copy transactionally.
ENV_FILE_EXISTED=false
if [ -e "$ENV_FILE" ] || [ -L "$ENV_FILE" ]; then
    ENV_FILE_EXISTED=true
fi

    installer_env_publish "$ENV_FILE" << ENVEOF
# MCP MASSA_AI - Auto-generated by setup-local-first.sh
#
# NOTE: config.json (${CONFIG_FILE}) is now the RUNTIME source of truth for
# all tunables (llm, embedding, cache, search, memory, hooks, compression,
# logging) AND for DATABASE_URL. This .env is intentionally thin: it only
# keeps DATABASE_URL for tooling that reads the environment directly, and as a
# legacy override path (explicit env vars still override config.json).

# Database Configuration (also written to config.json -> database.url)
DATABASE_URL=${DATABASE_URL}
ENVEOF

    if [ "$ENV_FILE_EXISTED" = true ]; then
        echo -e "  ${YELLOW}⚠${NC} Backed up existing $ENV_FILE → $ENV_FILE.bak"
    fi
    echo -e "  ${GREEN}✓${NC} Created thin .env file: ${ENV_FILE} (config.json is the runtime source)"

# Regenerate the config file, backing up any existing copy first.
#
# The API key is resolved BEFORE the backup and rewrite. This script writes
# config.json wholesale, and SEC-01 made that key the credential every MCP
# host, .env and agent hook sends on every request — minting a fresh one on a
# re-run would silently invalidate all of them. installer_resolve_api_key
# reuses the stored key when there is one and mints a key only on a genuinely
# first install.
MASSA_AI_API_KEY_VALUE="$(installer_resolve_api_key "$CONFIG_FILE")"
backup_if_exists "$CONFIG_FILE"
installer_write_config "$CONFIG_FILE" "$MASSA_AI_API_KEY_VALUE"
echo -e "  ${GREEN}✓${NC} Created config: ${CONFIG_FILE} (chmod 600)"
installer_report_api_key "$CONFIG_FILE"

# Run Prisma migrations unconditionally. A connection, pgvector, or migration
# failure stops setup before final configuration is reported as usable.
echo ""
echo -e "  ${YELLOW}⚠${NC} Running database migrations..."
command -v bun &> /dev/null || die "Bun is required to run PostgreSQL migrations."
export DATABASE_URL
cd "${PROJECT_ROOT}/packages/core"
# Ensure pgvector exists before migrating (Prisma schema depends on it). The
# native helper already does this, but the Docker path or a reused cluster may
# not have it yet. CREATE EXTENSION is idempotent.
if command -v psql &> /dev/null; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 \
        || echo -e "  ${YELLOW}⚠${NC} Could not pre-create pgvector extension (it may already be present, or the role lacks superuser)."
fi
bunx prisma migrate deploy \
    || die "PostgreSQL migrations failed. Setup stopped.
      Verify: (1) Postgres is running and DATABASE_URL is reachable,
      (2) pgvector is installed in the target database (CREATE EXTENSION vector),
      (3) packages/core/prisma/migrations exists. Then re-run this script."

# ---- Step 5: Verify setup ----
echo ""
echo -e "${BOLD}[5/6] Verifying setup...${NC}"

# Check the selected provider's health
if [ "${INFERENCE_PROVIDER:-ollama}" = "lmstudio" ]; then
    if massa_ai_probe_provider "$LMSTUDIO_URL" lmstudio; then
        echo -e "  ${GREEN}✓${NC} LM Studio: healthy at ${LMSTUDIO_URL}"
    else
        echo -e "  ${RED}✗${NC} LM Studio: not responding"
    fi
elif massa_ai_probe_provider "$OLLAMA_URL"; then
    MODELS=$(curl -s "${OLLAMA_URL}/api/tags" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data.get('models',[])))" 2>/dev/null || echo "?")
    echo -e "  ${GREEN}✓${NC} Ollama: healthy at ${OLLAMA_URL} (${MODELS} models)"
else
    echo -e "  ${RED}✗${NC} Ollama: not responding"
fi

# Check data directory
if [ -d "$DATA_DIR" ] && [ -w "$DATA_DIR" ]; then
    echo -e "  ${GREEN}✓${NC} Data directory: ${DATA_DIR}"
else
    echo -e "  ${RED}✗${NC} Data directory: not writable"
fi

# Check config
if [ -f "$CONFIG_FILE" ]; then
    echo -e "  ${GREEN}✓${NC} Config: ${CONFIG_FILE}"
else
    echo -e "  ${RED}✗${NC} Config: not found"
fi

# Verify reachability and pgvector after migrations. Attempt to self-heal by
# (re)creating the extension before declaring failure; distinguish a connection
# problem from a missing-extension problem in the error message.
verify_pgvector() {
    local psql_cmd="$1"          # e.g. "psql \"${DATABASE_URL}\"" or "docker exec ... psql ..."
    eval "$psql_cmd -v ON_ERROR_STOP=1 -c \"CREATE EXTENSION IF NOT EXISTS vector;\"" >/dev/null 2>&1
    eval "$psql_cmd -tAc \"SELECT 1 FROM pg_extension WHERE extname = 'vector'\"" 2>/dev/null | grep -qx "1"
}
if command -v psql &> /dev/null; then
    if psql "${DATABASE_URL}" -tAc "SELECT 1" >/dev/null 2>&1; then
        verify_pgvector "psql \"${DATABASE_URL}\"" \
            || die "Connected to PostgreSQL, but pgvector is unavailable. Install it (brew install pgvector) and re-run, or run: psql \"${DATABASE_URL}\" -c \"CREATE EXTENSION vector;\""
    else
        die "Cannot connect to PostgreSQL at ${DATABASE_URL}. Ensure the server is running and the URL is correct. Setup stopped."
    fi
elif command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -qx "massa-ai-postgres"; then
    verify_pgvector "docker exec massa-ai-postgres psql -U massa_ai -d massa_ai" \
        || die "PostgreSQL container is up but pgvector verification failed. Run: docker exec massa-ai-postgres psql -U massa_ai -d massa_ai -c \"CREATE EXTENSION vector;\""
else
    die "Cannot verify PostgreSQL reachability and pgvector: neither psql nor the massa-ai-postgres container is available. Setup stopped."
fi
echo -e "  ${GREEN}✓${NC} PostgreSQL + pgvector: connected"

# ---- Step 6: Agent harness (skills + MCP registration + plugin bundles) ----
# Without this step a user who follows the documented install path ends up with
# a working stack and no skills, no MCP registration, and no plugin bundles.
# Non-interactive runs drive it with MASSA_AI_INSTALL_HARNESS, mirroring
# MASSA_AI_DB_BACKEND above. Plugins can be optionally skipped via
# MASSA_AI_INSTALL_PLUGINS.
echo ""
echo -e "${BOLD}[6/6] Agent harness (skills + MCP + plugin bundles)...${NC}"
echo ""

HARNESS_SCRIPT="${PROJECT_ROOT}/scripts/install-harness.sh"
HARNESS_CHOICE=""
INSTALL_PLUGINS="1"

if [ ! -f "$HARNESS_SCRIPT" ]; then
    echo -e "  ${YELLOW}⚠${NC} Harness installer not found at ${HARNESS_SCRIPT} — skipping."
else
    # Check plugin opt-out
    case "${MASSA_AI_INSTALL_PLUGINS:-}" in
        1|yes|true) INSTALL_PLUGINS="1" ;;
        0|no|false) INSTALL_PLUGINS="0" ;;
        "") INSTALL_PLUGINS="1" ;;
        *) die "Invalid MASSA_AI_INSTALL_PLUGINS. Use 1/yes/true or 0/no/false." ;;
    esac

    case "${MASSA_AI_INSTALL_HARNESS:-}" in
        1|yes|true) HARNESS_CHOICE="y" ;;
        0|no|false) HARNESS_CHOICE="n" ;;
        "")
            echo -e "  Installs repo skills into every detected agent, registers the"
            echo -e "  massa-ai MCP server (Claude, Claude Desktop, Codex, Cursor, OpenCode),"
            echo -e "  and installs plugin bundles for all four platforms."
            read -rp "  Install massa-ai skills, MCP, and plugin bundles? [y/N]: " HARNESS_CHOICE </dev/tty || true
            HARNESS_CHOICE=${HARNESS_CHOICE:-n}
            ;;
        *) die "Invalid MASSA_AI_INSTALL_HARNESS. Use 1/yes/true or 0/no/false." ;;
    esac

    case "$HARNESS_CHOICE" in
        y|Y|yes|YES)
            if [ "$INSTALL_PLUGINS" = "1" ]; then
                bash "$HARNESS_SCRIPT" --all --platform all --mcp-source local --yes \
                    || echo -e "  ${YELLOW}⚠${NC} Harness install reported errors — re-run: bash scripts/install-harness.sh --all --mcp-source local --yes"
            else
                bash "$HARNESS_SCRIPT" --skills --agents --platform all --mcp-source local --yes \
                    || echo -e "  ${YELLOW}⚠${NC} Harness install reported errors — re-run: bash scripts/install-harness.sh --skills --agents --mcp-source local --yes"
            fi
            ;;
        *)
            echo -e "  ${BLUE}•${NC} Skipped. Run later: ${BOLD}bash scripts/install-harness.sh --all${NC}"
            ;;
    esac
fi

# ---- Summary ----
echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                    Setup Complete                             ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Local-First Configuration:${NC}"
echo -e "    ${BLUE}•${NC} Embeddings: Ollama (${EMBEDDING_MODEL})"
echo -e "    ${BLUE}•${NC} LLM: Ollama (${LLM_MODEL}) — consolidation + auto-importance on"
installer_feature_summary
echo -e "    ${BLUE}•${NC} Cache: PostgreSQL"
echo -e "    ${BLUE}•${NC} Database: PostgreSQL + pgvector"
echo -e "    ${BLUE}•${NC} Vector DB: PostgreSQL pgvector"
echo -e "    ${BLUE}•${NC} Cost: ${GREEN}\$0${NC}"
echo ""
echo -e "  ${BOLD}Config file:${NC}     ${CONFIG_FILE}"
echo -e "  ${BOLD}Data directory:${NC}  ${DATA_DIR}"
echo -e "  ${BOLD}Database URL:${NC}    ${DATABASE_URL}"
echo ""
echo -e "  ${BOLD}To change provider:${NC}"
echo -e "    npx massa-ai-config use mistral --api-key YOUR_KEY"
echo -e "    npx massa-ai-config use openai --api-key YOUR_KEY"
echo ""
echo -e "  ${BOLD}Next steps (from source):${NC}"
echo -e "    1. ${BLUE}bun install${NC}"
echo -e "    2. ${BLUE}bun run build${NC}"
echo -e "    3. ${BLUE}bun run start:api${NC}"
echo ""

# PDM-13. The MLX embedding role is served by a sidecar, not by LM Studio, and
# the note saying so is issued at Step 0 — before six steps and several GB of
# downloads have scrolled it off the screen. It is repeated here, where the eye
# actually lands, because it is the one piece of this install that is not a
# process the user already knows about: if it is not running, indexing stops.
if [ "${LMSTUDIO_MODEL_FORMAT:-gguf}" = "mlx" ] && [ -z "${LMSTUDIO_EMBEDDING_MODEL:-}" ]; then
    echo -e "  ${BLUE}•  Embedding runs outside LM Studio on the MLX path.${NC}"
    echo -e "     LM Studio types every safetensors model as an LLM and will not"
    echo -e "     serve it on /v1/embeddings (upstream bug #808), so massa-ai"
    echo -e "     serves the same weights at ${BOLD}${EMBEDDING_BASE_URL}${NC}."
    echo -e "     Check it with: ${BLUE}curl ${EMBEDDING_BASE_URL%/v1}/health${NC}"
    echo -e "     Restart it with: ${BLUE}launchctl kickstart -k gui/\$(id -u)/ai.massa.mlx-embed${NC}"
    echo ""
fi

# ---- Run diagnose to validate the full stack ----
if command -v bun &> /dev/null && [ -f "${SCRIPT_DIR}/../scripts/diagnose.ts" 2>/dev/null ] || [ -f "${PROJECT_ROOT}/scripts/diagnose.ts" ]; then
    echo -e "  ${BOLD}Running stack validation (bun run diagnose)...${NC}"
    echo ""
    cd "${PROJECT_ROOT}"
    bun run diagnose || echo -e "  ${YELLOW}⚠${NC}  Some checks failed — review the output above before starting."
    echo ""
fi

echo -e "  ${BOLD}Or use with OpenCode:${NC}"
echo -e "    ${CYAN}bash scripts/install-agents.sh --agent opencode${NC}"
echo -e '    (or add this to ~/.config/opencode/opencode.json by hand —'
echo -e '     note OpenCode uses "mcp" / "environment" / bunx, not'
echo -e '     "mcpServers" / "env" / npx):'
echo ""
echo -e '    {'
echo -e '      "mcp": {'
echo -e '        "massa-ai": {'
echo -e '          "type": "local",'
echo -e '          "command": ["bunx", "@massa-ai/mcp-client"],'
echo -e '          "environment": { "MASSA_AI_API_URL": "http://localhost:3333" },'
echo -e '          "enabled": true'
echo -e '        }'
echo -e '      }'
echo -e '    }'
echo ""
