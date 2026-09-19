#!/bin/bash
# ========================================
# massa-ai - Ollama Auto-Start Script
# ========================================
# Ensures Ollama is running before dev/start.
# Used as a predev hook in package.json.
#
# Usage: bash scripts/ensure-ollama.sh
#
# Environment variables:
#   OLLAMA_BASE_URL  - Ollama API URL (default: http://localhost:11434)
# ========================================
set -e

# shellcheck source=scripts/banner.sh
source "$(dirname "${BASH_SOURCE[0]}")/banner.sh"
massa_ai_banner

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

OLLAMA_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

echo "[massa-ai] Checking Ollama service at ${OLLAMA_URL}..."

# Already running? Nothing to do.
if massa_ai_probe_provider "$OLLAMA_URL"; then
    echo "[massa-ai] Ollama is already running."
    exit 0
fi

echo "[massa-ai] Ollama is not running. Attempting to start..."

# Check if ollama binary exists
if ! command -v ollama &> /dev/null; then
    echo "[massa-ai] WARNING: Ollama executable not found in PATH."
    echo "[massa-ai] Install it: curl -fsSL https://ollama.com/install.sh | sh"
    echo "[massa-ai] Or set OLLAMA_BASE_URL to point to a remote instance."
    # Exit 0 to not block dev workflow - provider fallback will handle it
    exit 0
fi

# Start ollama in background
nohup ollama serve > /tmp/ollama-massa-ai.log 2>&1 &

# Wait for it to be ready
MAX_RETRIES=10
COUNT=0
while [ $COUNT -lt $MAX_RETRIES ]; do
    if massa_ai_probe_provider "$OLLAMA_URL"; then
        echo "[massa-ai] Ollama started successfully."
        exit 0
    fi
    sleep 1
    COUNT=$((COUNT + 1))
    echo "[massa-ai] Waiting for Ollama... ($COUNT/$MAX_RETRIES)"
done

echo "[massa-ai] WARNING: Ollama did not start within ${MAX_RETRIES}s."
echo "[massa-ai] Check logs: cat /tmp/ollama-massa-ai.log"
echo "[massa-ai] Continuing without local Ollama (remote providers may be used)."
# Exit 0 to not block dev workflow
exit 0
