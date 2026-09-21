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
# model no longer guesses: it delegates to the shared resolver below.
installer_embedding_dimensions() {
  case "$1" in
    qwen3-embedding:8b) echo 4096 ;;
    qwen3-embedding:4b) echo 2560 ;;
    qwen3-embedding:0.6b) echo 1024 ;;
    bge-m3) echo 1024 ;;
    *) installer_resolve_embedding_dimensions "$1" ;;
  esac
}

# installer_resolve_embedding_dimensions <model>
#
# The unknown-model arm of the table above, which used to answer a literal
# 2560 for every model outside those four. That is wrong for LM Studio's
# measured default (768), and a wrong width is not cosmetic:
# `createEmbeddingProvider` refuses to fall through on a dimension mismatch, so
# every embedding path throws until someone hand-edits config.json.
#
# Delegates to `resolveModelDimensions`
# (packages/shared/src/config/embedding-dimensions.ts): every local provider's
# knownDimensions table first, then ONE real embed call against the configured
# endpoint, reading the returned vector's own length. Importing the module is
# possible here because the wizard runs from a checkout — install.sh's
# pre-clone probes are not, which is why `massa_ai_probe_provider` exists as
# bash instead.
#
# Degrades in two places rather than failing an install on a toolchain gap: an
# explicit OLLAMA_EMBEDDING_DIMENSIONS still wins, and a machine with no bun or
# no checkout keeps the old literal. A model the resolver cannot resolve at all
# is fatal, by design — the resolver's own message names the model and the
# endpoint it could not reach.
installer_resolve_embedding_dimensions() {
  local model="$1" repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)" || repo_root=""

  # One expression for both degradations, and the only literal width left in
  # this file: an explicit operator override wins, and is also the answer when
  # there is no bun or no checkout to run the resolver with.
  # embedding-defaults-parity.test.ts extracts this exact `${VAR:-N}` shape.
  if [ -n "${OLLAMA_EMBEDDING_DIMENSIONS:-}" ] \
     || [ -z "$repo_root" ] \
     || ! command -v bun >/dev/null 2>&1 \
     || [ ! -f "${repo_root}/packages/shared/src/config/embedding-dimensions.ts" ]; then
    echo "${OLLAMA_EMBEDDING_DIMENSIONS:-1024}"
    return 0
  fi

  bun -e '
    const [, root, model, providerId, baseUrlOverride] = process.argv;
    const { resolveModelDimensions } = await import(root + "/packages/shared/src/config/embedding-dimensions.ts");
    const { INFERENCE_PROVIDERS } = await import(root + "/packages/shared/src/config/inference-providers.ts");
    const spec = INFERENCE_PROVIDERS[providerId] || INFERENCE_PROVIDERS.ollama;
    // Merge every provider table: the installer may be resolving a width for a
    // provider other than the one it is about to write, and a known width must
    // never cost a live probe.
    const knownDimensions = {};
    for (const p of Object.values(INFERENCE_PROVIDERS)) Object.assign(knownDimensions, p.knownDimensions);
    process.stdout.write(String(await resolveModelDimensions(model, {
      knownDimensions,
      baseUrl: baseUrlOverride || spec.defaultEmbeddingBaseUrl,
      // Ollama embeds at /api/embed; an OpenAI-compatible endpoint already
      // carries its own /v1 prefix on the base URL, so the path is relative
      // to that.
      embedPath: spec.id === "ollama" ? "/api/embed" : "/embeddings",
    })));
  ' "$repo_root" "$model" "${INFERENCE_PROVIDER:-ollama}" "${EMBEDDING_BASE_URL:-}"
}

# installer_provider_defaults
#
# Derives the provider-shaped globals `installer_write_config` emits from
# whichever local inference provider was selected, so the caller keeps
# supplying only INFERENCE_PROVIDER plus that provider's endpoint variable —
# which is what lets the existing contract test drive the write with OLLAMA_URL
# alone.
#
# Every assignment is unconditional in terms of the `LLM_MODEL`/`CODE_MODEL`
# globals themselves — an earlier `${LLM_MODEL:-...}` form let a value left
# over from a PREVIOUS call win, so a second write in the same shell emitted
# the first write's provider (caught by the LM Studio case in
# test-setup-local-first-api-key.sh, which ran after an Ollama write). The
# fix for that must not reopen F3/G5 (`installer_write_config` silently
# discarding an explicit `MASSA_AI_LLM_MODEL`/`MASSA_AI_LLM_CODE_MODEL`), so
# the override signal is read from those two env vars directly — stable
# across repeated calls in the same shell, unlike the derived `LLM_MODEL`/
# `CODE_MODEL` globals — exactly like `OLLAMA_URL`/`LMSTUDIO_URL` already are
# for `EMBEDDING_BASE_URL`/`LLM_BASE_URL` below.
#
# `llm.baseUrl` used to be the literal http://localhost:11434/v1 regardless of
# OLLAMA_URL, so a remote or WSL Ollama got a config pointing the LLM client at
# the local machine. It is derived here instead.
installer_provider_defaults() {
  case "${INFERENCE_PROVIDER:-ollama}" in
    lmstudio)
      EMBEDDING_PROVIDER="lmstudio"
      EMBEDDING_BASE_URL="${LMSTUDIO_URL:-http://localhost:1234/v1}"
      LLM_BASE_URL="${LMSTUDIO_URL:-http://localhost:1234/v1}"
      # Measured: LM Studio does not enforce auth, but the OpenAI client still
      # requires the header to exist.
      LLM_API_KEY="lmstudio"
      # think:false is an Ollama-only request-body key, and `llm-client.ts`
      # already gates the injection on the resolved provider's
      # `injectsDisableThink` (LIP-07) — so `true` here is inert on LM Studio,
      # exactly as `false` was. It used to be written `false`, which made the
      # Admin Portal show the toggle off on every LM Studio install and read as
      # a deliberate opt-out of a setting whose shipped default
      # (`defaultMassaAiConfig.llm.disableThink`, and the `?? true` in
      # `config/index.ts`) is on. The written value now agrees with the default
      # on both providers; the per-provider behaviour still comes from the seam,
      # never from this literal.
      LLM_DISABLE_THINK="true"
      LLM_MODEL="${MASSA_AI_LLM_MODEL:-qwen3-vl-8b-instruct}"
      CODE_MODEL="${MASSA_AI_LLM_CODE_MODEL:-qwen2.5-coder-7b-instruct}"
      ;;
    *)
      EMBEDDING_PROVIDER="ollama"
      EMBEDDING_BASE_URL="${OLLAMA_URL:-http://localhost:11434}"
      LLM_BASE_URL="${OLLAMA_URL:-http://localhost:11434}/v1"
      LLM_API_KEY="ollama"
      LLM_DISABLE_THINK="true"
      LLM_MODEL="${MASSA_AI_LLM_MODEL:-qwen3-vl:8b}"
      CODE_MODEL="${MASSA_AI_LLM_CODE_MODEL:-qwen2.5-coder:7b}"
      ;;
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
  # Declining writes no member at all, which is a real choice rather than an
  # empty one: the same rules stay in force through the built-in default, they
  # are simply not editable from the Admin Portal. The emitted block carries
  # its own trailing comma, so omitting it leaves valid JSON.
  [ "${CAPTURE_POLICY_ENABLED:-true}" = "true" ] || return 0

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
# globals (DATABASE_URL, EMBEDDING_MODEL, OLLAMA_URL, DATA_DIR, and one
# *_ENABLED global per prompted feature) and takes the key explicitly, because
# the key is the one field that must survive a rewrite. `LLM_MODEL`/
# `CODE_MODEL` are not wizard-supplied inputs — `installer_provider_defaults`
# (called first below) derives both from `INFERENCE_PROVIDER` plus an optional
# `MASSA_AI_LLM_MODEL`/`MASSA_AI_LLM_CODE_MODEL` override (F3/G5: an explicit
# override must survive this call, the same trio `config-cli.ts`'s
# `INFERENCE_PROVIDERS[provider].defaultModels` names otherwise, so the
# written baseUrl/model/codeModel always agree (PDM-02 AC-2).
#
# Every *_ENABLED default below is the literal this template used to hardcode,
# so a caller that sets none of them writes the same config.json as before.
# Three exceptions are deliberate and new: `scheduler`, which no install had
# at all (leaving the Admin Portal's Scheduler tab blank and periodic jobs
# unreachable without setting process env vars); `capturePolicy`, written
# explicitly so the rules dropping files from the index are visible rather
# than implicit; and `bootstrap`, an empty override map — a fresh install has
# no rule overrides yet, so the bootstrap rule registry's own defaults
# (packages/shared/src/bootstrap/rules.ts) are what an absent entry resolves
# against, exactly as `defaultMassaAiConfig.bootstrap` does.
#
# Lives here rather than inline in setup-local-first.sh so the provisioning
# contract can be executed by scripts/tests/test-setup-local-first-api-key.sh
# against a temp directory. A grep over the wizard's source cannot observe
# whether the key actually lands or survives a second run.
installer_write_config() {
  local config_file="$1"
  local api_key="$2"
  local dimensions
  installer_provider_defaults
  if ! dimensions="$(installer_embedding_dimensions "${EMBEDDING_MODEL}")" || [ -z "$dimensions" ]; then
    echo "Error: could not resolve the embedding width for '${EMBEDDING_MODEL}' at ${EMBEDDING_BASE_URL}." >&2
    exit 4
  fi

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
    "provider": "${EMBEDDING_PROVIDER}",
    "model": "${EMBEDDING_MODEL}",
    "baseURL": "${EMBEDDING_BASE_URL}",
    "dimensions": ${dimensions}
  },
  "llm": {
    "enabled": ${LLM_ENABLED:-true},
    "baseUrl": "${LLM_BASE_URL}",
    "apiKey": "${LLM_API_KEY}",
    "model": "${LLM_MODEL}",
    "codeModel": "${CODE_MODEL}",
    "temperature": 0.2,
    "maxOutputTokens": 8000,
    "timeoutMs": 90000,
    "disableThink": ${LLM_DISABLE_THINK}
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
  "bootstrap": {
    "rules": {}
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
