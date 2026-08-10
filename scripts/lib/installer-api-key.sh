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

# installer_embedding_dimensions <model>
#
# The embedding width a model actually produces. This used to be the literal
# 4096 in the config.json template below while the model written beside it was
# qwen3-embedding:4b, which is 2560 — so every fresh install started with a
# dimensions value its own model could not produce. The 2026-08 parity sweep
# fixed install.sh, the Dockerfile, setup-ollama-wsl.sh and the config CLI and
# missed this template, because the sweep's completeness scan keys on the
# literal `OLLAMA_EMBEDDING_` and this file has never contained it.
#
# The pairs mirror .env.example's documented alternatives. An unrecognized
# model falls back to the reference default rather than guessing.
installer_embedding_dimensions() {
  case "$1" in
    qwen3-embedding:8b) echo 4096 ;;
    qwen3-embedding:4b) echo 2560 ;;
    qwen3-embedding:0.6b) echo 1024 ;;
    bge-m3) echo 1024 ;;
    *) echo "${OLLAMA_EMBEDDING_DIMENSIONS:-2560}" ;;
  esac
}

# installer_capture_policy_block
#
# Emits the `"capturePolicy"` member of config.json, trailing comma included.
#
# The thirty Drop rules are the ones that were already in force through
# `DEFAULT_CAPTURE_POLICY`; writing them makes the Admin Portal's Capture
# Policy tab show what the indexer is doing instead of "not configured", and
# makes the list editable without first knowing it exists.
#
# This is a second copy of a list `packages/shared` owns, which is exactly the
# shape of drift that produced the 4096/2560 defect above. It is held closed by
# `scripts/__tests__/installer-config-template.test.ts`, which compares this
# emitter's output against DEFAULT_CAPTURE_POLICY rule for rule — a shell
# installer cannot import a TypeScript module, so a gate is the available
# substitute for a shared declaration.
installer_capture_policy_block() {
  cat <<'POLICYEOF'
  "capturePolicy": {
    "rules": [
      { "pattern": "**/node_modules/**", "disposition": "Drop" },
      { "pattern": "**/.git/**", "disposition": "Drop" },
      { "pattern": "**/dist/**", "disposition": "Drop" },
      { "pattern": "**/build/**", "disposition": "Drop" },
      { "pattern": "**/coverage/**", "disposition": "Drop" },
      { "pattern": ".env", "disposition": "Drop" },
      { "pattern": ".env.*", "disposition": "Drop" },
      { "pattern": "**/generated/**", "disposition": "Drop" },
      { "pattern": "**/*.generated.*", "disposition": "Drop" },
      { "pattern": "**/*.d.ts", "disposition": "Drop" },
      { "pattern": "**/__tests__/**", "disposition": "Drop" },
      { "pattern": "**/tests/**", "disposition": "Drop" },
      { "pattern": "**/*.test.ts", "disposition": "Drop" },
      { "pattern": "**/*.test.tsx", "disposition": "Drop" },
      { "pattern": "**/*.test.js", "disposition": "Drop" },
      { "pattern": "**/*.test.jsx", "disposition": "Drop" },
      { "pattern": "**/*.spec.ts", "disposition": "Drop" },
      { "pattern": "**/*.spec.tsx", "disposition": "Drop" },
      { "pattern": "**/*.spec.js", "disposition": "Drop" },
      { "pattern": "**/*.spec.jsx", "disposition": "Drop" },
      { "pattern": "**/benchmarks/**", "disposition": "Drop" },
      { "pattern": "**/fixtures/**", "disposition": "Drop" },
      { "pattern": "**/*.wasm*", "disposition": "Drop" },
      { "pattern": "**/*.min.*", "disposition": "Drop" },
      { "pattern": "**/*.map", "disposition": "Drop" },
      { "pattern": "**/lock.yaml", "disposition": "Drop" },
      { "pattern": "**/pnpm-lock.yaml", "disposition": "Drop" },
      { "pattern": "**/package-lock.json", "disposition": "Drop" },
      { "pattern": "**/bun.lockb", "disposition": "Drop" },
      { "pattern": "**/yarn.lock", "disposition": "Drop" }
    ],
    "maxMatchWork": 100000,
    "maxIgnorePatterns": 1024
  },
POLICYEOF
}

# installer_write_config <config_file> <api_key>
#
# Write the wizard's config.json. Reads the tunables the wizard resolved as
# globals (DATABASE_URL, EMBEDDING_MODEL, OLLAMA_URL, LLM_MODEL, CODE_MODEL,
# DATA_DIR, and one *_ENABLED global per prompted feature) and takes the key
# explicitly, because the key is the one field that must survive a rewrite.
#
# Every *_ENABLED default below is the literal this template used to hardcode,
# so a caller that sets none of them writes the same config.json as before.
# The two exceptions are deliberate and new: `scheduler`, which no install had
# at all (leaving the Admin Portal's Scheduler tab blank and periodic jobs
# unreachable without setting process env vars), and `capturePolicy`, written
# explicitly so the rules dropping files from the index are visible rather
# than implicit.
#
# Lives here rather than inline in setup-local-first.sh so the provisioning
# contract can be executed by scripts/tests/test-setup-local-first-api-key.sh
# against a temp directory. A grep over the wizard's source cannot observe
# whether the key actually lands or survives a second run.
installer_write_config() {
  local config_file="$1"
  local api_key="$2"
  local dimensions
  dimensions="$(installer_embedding_dimensions "${EMBEDDING_MODEL}")"

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
    "dimensions": ${dimensions}
  },
  "llm": {
    "enabled": ${LLM_ENABLED:-true},
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
      "enabled": ${MEMORY_BOOTSTRAP_ENABLED:-true},
      "maxSeedMemories": 8,
      "centralityLimit": 10,
      "gitLogLimit": 20,
      "refreshEnabled": true
    },
    "autoImprove": {
      "enabled": ${MEMORY_AUTO_IMPROVE_ENABLED:-true},
      "reviewGate": false,
      "minObservations": 8,
      "minIntervalMs": 300000,
      "maxWindow": 16,
      "minQueryHits": 3,
      "minFileHits": 3,
      "minFixHits": 2
    },
    "autoImportance": {
      "enabled": ${MEMORY_AUTO_IMPORTANCE_ENABLED:-true}
    }
  },
  "hooks": {
    "enabled": ${HOOKS_ENABLED:-true},
    "maxPayloadBytes": 65536,
    "queue": {
      "maxPending": 256
    },
    "bridge": {
      "enabled": ${HOOKS_BRIDGE_ENABLED:-true},
      "minObservations": 8,
      "minIntervalMs": 300000,
      "maxWindow": 8
    }
  },
  "handoffs": {
    "enabled": ${HANDOFFS_ENABLED:-true}
  },
  "impact": {
    "bfsCteEnabled": ${IMPACT_BFS_CTE_ENABLED:-false}
  },
  "synapse": {
    "enabled": ${SYNAPSE_ENABLED:-true}
  },
  "scheduler": {
    "enabled": ${SCHEDULER_ENABLED:-true},
    "tickMs": 60000,
    "maxConcurrent": 2,
    "jobs": {
      "memory-consolidation": {
        "enabled": ${SCHEDULER_CONSOLIDATION_ENABLED:-true},
        "intervalMs": 1800000
      },
      "decay-sweep": {
        "enabled": ${SCHEDULER_DECAY_ENABLED:-true},
        "intervalMs": 3600000
      },
      "auto-improve": {
        "enabled": ${SCHEDULER_AUTO_IMPROVE_ENABLED:-false},
        "intervalMs": 1800000
      },
      "observation-bridge": {
        "enabled": ${SCHEDULER_OBSERVATION_BRIDGE_ENABLED:-false},
        "intervalMs": 1800000
      },
      "checkpoint-purge": {
        "enabled": ${SCHEDULER_CHECKPOINT_PURGE_ENABLED:-false},
        "intervalMs": 3600000
      }
    }
  },
$(installer_capture_policy_block)
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
