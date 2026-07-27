#!/usr/bin/env bash
# ============================================================
#  massa-ai — installer Tools API key helpers
#  Source this file; do not run it directly.
#
#  Usage:
#    source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-shared.sh"
#    source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-api-key.sh"
#
#  SEC-01 made the Tools API reject every unauthenticated request, so an
#  install that leaves no key behind is a broken install. The API provisions
#  its own key on first start (packages/shared/src/config/api-key.ts), but the
#  wizard rewrites config.json wholesale, so it has to carry the key across
#  that rewrite itself — otherwise every re-run silently rotates the key that
#  MCP hosts, .env files and the agent harness are already sending.
#
#  Bash 3.2 compatible (macOS ships bash 3.2). Function-only — no side effects
#  at source time. JSON is read and written through the node/bun heredoc
#  pattern the rest of the installers use; there is no jq in this repo.
# ============================================================

# installer_read_api_key <config_file>
#
# Echo the `security.apiKey` already stored in <config_file>, or nothing.
#
# A missing, unreadable, or malformed file is deliberately indistinguishable
# from "no key configured": the caller mints one either way, and refusing to
# proceed would strand an operator behind a config.json they cannot repair
# without the wizard. A whitespace-only value counts as unset, matching
# resolveApiKey()'s trim semantics in packages/shared/src/config/api-key.ts —
# if the two sides disagreed about what "configured" means, the installer would
# report a key the API then regenerates.
installer_read_api_key() {
  local config_file="$1"
  local runner

  [ -f "$config_file" ] || return 0
  runner="$(installer_detect_runner)" || return 0

  "$runner" - "$config_file" <<'NODE' 2>/dev/null || true
const fs = require("fs");
const [, , file] = process.argv;
try {
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  const key = cfg && cfg.security && cfg.security.apiKey;
  if (typeof key === "string" && key.trim()) process.stdout.write(key.trim());
} catch {
  // Unreadable or malformed: report "no key" and let the caller mint one.
}
NODE
}

# installer_mint_api_key
#
# Echo a fresh 32-byte key as lowercase hex. Same generator and same width as
# resolveApiKey(), so a key minted here is indistinguishable from one the API
# would have provisioned itself.
installer_mint_api_key() {
  local runner
  runner="$(installer_require_runner "the Tools API key")"

  "$runner" - <<'NODE'
const crypto = require("crypto");
process.stdout.write(crypto.randomBytes(32).toString("hex"));
NODE
}

# installer_resolve_api_key <config_file>
#
# Echo the key the installer should persist: the stored one when <config_file>
# already carries a usable value, a freshly minted one otherwise. Reuse is the
# contract that makes re-running setup safe.
installer_resolve_api_key() {
  local config_file="$1"
  local existing

  existing="$(installer_read_api_key "$config_file")"
  if [ -n "$existing" ]; then
    printf '%s' "$existing"
    return 0
  fi

  installer_mint_api_key
}

# installer_report_api_key <config_file>
#
# Print where the key lives. Never prints the key itself: config.json is
# chmod 600 for a reason, and terminal scrollback, CI logs and screen shares
# are not. Mirrors the API's own provisioning log line, which names the path
# and withholds the value (SEC-01 AC 1).
installer_report_api_key() {
  local config_file="$1"
  echo "  Tools API key: ${config_file} -> security.apiKey"
  echo "  Every route except /health, /swagger and /ui needs it as the 'x-api-key' header."
}

# installer_write_config <config_file> <api_key>
#
# Write the wizard's config.json. Reads the tunables the wizard resolved as
# globals (DATABASE_URL, EMBEDDING_MODEL, OLLAMA_URL, LLM_MODEL, CODE_MODEL,
# SEARCH_QU_ENABLED, SEARCH_RERANK_ENABLED, DATA_DIR) and takes the key
# explicitly, because the key is the one field that must survive a rewrite.
#
# Lives here rather than inline in setup-local-first.sh so the provisioning
# contract can be executed by scripts/tests/test-setup-local-first-api-key.sh
# against a temp directory. A grep over the wizard's source cannot observe
# whether the key actually lands or survives a second run.
installer_write_config() {
  local config_file="$1"
  local api_key="$2"

  mkdir -p "$(dirname "$config_file")"

  cat > "$config_file" <<EOF
{
  "database": {
    "url": "${DATABASE_URL}"
  },
  "security": {
    "apiKey": "${api_key}"
  },
  "embedding": {
    "provider": "ollama",
    "model": "${EMBEDDING_MODEL}",
    "baseURL": "${OLLAMA_URL}",
    "dimensions": 4096
  },
  "llm": {
    "enabled": true,
    "baseUrl": "http://localhost:11434/v1",
    "apiKey": "ollama",
    "model": "${LLM_MODEL}",
    "codeModel": "${CODE_MODEL}",
    "temperature": 0.2,
    "maxOutputTokens": 8000,
    "timeoutMs": 90000,
    "disableThink": true
  },
  "compression": {
    "defaultStrategy": "code_structure",
    "minTokensForCompression": 100,
    "targetCompressionRatio": 0.7
  },
  "cache": {
    "enabled": true,
    "l1MaxSizeMB": 100,
    "l2MaxSizeMB": 500,
    "defaultTTLSeconds": 3600
  },
  "search": {
    "autoReindexMaxFiles": 200,
    "queryUnderstanding": {
      "enabled": ${SEARCH_QU_ENABLED:-false},
      "hydeEnabled": true,
      "cacheTtlMs": 300000,
      "cacheMaxSize": 256
    },
    "rerank": {
      "enabled": ${SEARCH_RERANK_ENABLED:-false},
      "rerankWindow": 50
    }
  },
  "memory": {
    "decay": {
      "lambda": 0.02,
      "sigma": 0.6,
      "mu": 0.04,
      "coldThreshold": 0.2
    },
    "bootstrap": {
      "enabled": true,
      "maxSeedMemories": 8,
      "centralityLimit": 10,
      "gitLogLimit": 20,
      "refreshEnabled": true
    },
    "autoImprove": {
      "enabled": true,
      "reviewGate": false,
      "minObservations": 8,
      "minIntervalMs": 300000,
      "maxWindow": 16,
      "minQueryHits": 3,
      "minFileHits": 3,
      "minFixHits": 2
    },
    "autoImportance": {
      "enabled": true
    }
  },
  "hooks": {
    "enabled": true,
    "maxPayloadBytes": 65536,
    "queue": {
      "maxPending": 256
    },
    "bridge": {
      "enabled": true,
      "minObservations": 8,
      "minIntervalMs": 300000,
      "maxWindow": 8
    }
  },
  "dataDir": "${DATA_DIR}",
  "logging": {
    "level": "info",
    "enableMetrics": false
  }
}
EOF

  # config.json holds DATABASE_URL and the API key — both secrets.
  chmod 600 "$config_file"
}
