#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  T7 / SEC-06 — setup-local-first.sh provisions an API key
#
#  SEC-01 made the Tools API refuse every unauthenticated request, so the
#  documented install path has to leave a usable key behind or the security
#  fix becomes an onboarding failure. These cases EXECUTE the installer's key
#  helper against real temp files rather than grepping the wizard's source:
#  "the key lands" and "a re-run is idempotent" are behaviors, and a source
#  pattern cannot observe either one.
#
#  The idempotency cases are the load-bearing ones. setup-local-first.sh
#  regenerates config.json wholesale (`backup_if_exists` + `cat >`), so the
#  naive implementation mints a fresh key on every run and silently
#  invalidates the key every already-configured MCP host, .env and agent
#  harness is still sending.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SETUP_SCRIPT="${PROJECT_ROOT}/scripts/setup-local-first.sh"
API_KEY_LIB="${PROJECT_ROOT}/scripts/lib/installer-api-key.sh"

PASS=0
FAIL=0

ok() { echo "  ok - $*"; PASS=$((PASS + 1)); }
fail() { echo "  not ok - $*"; FAIL=$((FAIL + 1)); }

assert_eq() {
    local label="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then ok "$label"; else
        fail "$label (expected '${expected}', got '${actual}')"
    fi
}

assert_match() {
    local label="$1" pattern="$2" actual="$3"
    if printf '%s' "$actual" | grep -Eq "$pattern"; then ok "$label"; else
        fail "$label (value '${actual}' does not match /${pattern}/)"
    fi
}

assert_script_contains() {
    local label="$1" pattern="$2"
    if grep -Eq "$pattern" "$SETUP_SCRIPT"; then ok "$label"; else fail "$label"; fi
}

echo "setup-local-first.sh API key provisioning tests"

# ---- The helper must exist before anything can be executed against it ----
if [ -f "$API_KEY_LIB" ]; then
    ok "installer API key helper exists at scripts/lib/installer-api-key.sh"
else
    fail "installer API key helper exists at scripts/lib/installer-api-key.sh"
    echo "Results: ${PASS} passed, ${FAIL} failed"
    exit 1
fi

if bash -n "$API_KEY_LIB"; then ok "helper has valid bash syntax"; else fail "helper has valid bash syntax"; fi
if bash -n "$SETUP_SCRIPT"; then ok "setup script has valid bash syntax"; else fail "setup script has valid bash syntax"; fi

# shellcheck source=scripts/lib/installer-shared.sh
source "${PROJECT_ROOT}/scripts/lib/installer-shared.sh"
# shellcheck source=scripts/lib/installer-api-key.sh
source "$API_KEY_LIB"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/massa-ai-apikey-test.XXXXXX")"
cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

# ---- Minting ----------------------------------------------------------------

MISSING_CFG="${TMP_ROOT}/absent/config.json"
KEY_A="$(installer_resolve_api_key "$MISSING_CFG")"
assert_match "mints a key when no config.json exists" '^[0-9a-f]{64}$' "$KEY_A"

KEY_B="$(installer_resolve_api_key "$MISSING_CFG")"
# Discriminates against a hardcoded constant: a stub returning a fixed string
# would satisfy every "is it 64 hex chars" assertion above.
if [ "$KEY_A" != "$KEY_B" ]; then
    ok "each mint is random, not a constant"
else
    fail "each mint is random, not a constant (got '${KEY_A}' twice)"
fi

# ---- Reuse (the re-run idempotency contract) --------------------------------

EXISTING_CFG="${TMP_ROOT}/existing.json"
STORED_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
cat > "$EXISTING_CFG" <<JSON
{ "database": { "url": "postgresql://x/y" }, "security": { "apiKey": "${STORED_KEY}" } }
JSON
assert_eq "reuses the stored key verbatim" "$STORED_KEY" "$(installer_resolve_api_key "$EXISTING_CFG")"

NO_SECTION_CFG="${TMP_ROOT}/no-security.json"
echo '{ "database": { "url": "postgresql://x/y" } }' > "$NO_SECTION_CFG"
assert_match "mints when config.json has no security section" '^[0-9a-f]{64}$' \
    "$(installer_resolve_api_key "$NO_SECTION_CFG")"

EMPTY_KEY_CFG="${TMP_ROOT}/empty-key.json"
echo '{ "security": { "apiKey": "   " } }' > "$EMPTY_KEY_CFG"
# Matches resolveApiKey()'s trim semantics in packages/shared/src/config/api-key.ts:
# a whitespace-only value counts as unset on both sides, or the installer and the
# API would disagree about whether a key is configured.
assert_match "treats a whitespace-only stored key as unset" '^[0-9a-f]{64}$' \
    "$(installer_resolve_api_key "$EMPTY_KEY_CFG")"

MALFORMED_CFG="${TMP_ROOT}/malformed.json"
echo '{ this is not json' > "$MALFORMED_CFG"
if MALFORMED_KEY="$(installer_resolve_api_key "$MALFORMED_CFG")"; then
    assert_match "mints (and does not abort) on a malformed config.json" '^[0-9a-f]{64}$' "$MALFORMED_KEY"
else
    fail "mints (and does not abort) on a malformed config.json (helper exited non-zero)"
fi

# ---- Writing ----------------------------------------------------------------

DATABASE_URL="postgresql://massa_ai:pw@localhost:5432/massa_ai"
EMBEDDING_MODEL="qwen3-embedding:4b"
OLLAMA_URL="http://localhost:11434"
LLM_MODEL="qwen3:8b"
CODE_MODEL="qwen3-coder:30b"
SEARCH_QU_ENABLED=false
SEARCH_RERANK_ENABLED=false
DATA_DIR="${TMP_ROOT}/data"
export DATABASE_URL EMBEDDING_MODEL OLLAMA_URL LLM_MODEL CODE_MODEL DATA_DIR

WRITTEN_CFG="${TMP_ROOT}/written/config.json"
mkdir -p "$(dirname "$WRITTEN_CFG")"

FIRST_KEY="$(installer_resolve_api_key "$WRITTEN_CFG")"
installer_write_config "$WRITTEN_CFG" "$FIRST_KEY"

json_field() {
    local file="$1" expr="$2" runner
    runner="$(installer_require_runner "config.json")"
    "$runner" - "$file" "$expr" <<'NODE'
const fs = require("fs");
const [, , file, expr] = process.argv;
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const read = new Function("c", "return " + expr + " ?? '';");
process.stdout.write(String(read(cfg)));
NODE
}

if [ -f "$WRITTEN_CFG" ]; then ok "installer_write_config creates config.json"; else fail "installer_write_config creates config.json"; fi
assert_eq "written config carries the resolved key at security.apiKey" \
    "$FIRST_KEY" "$(json_field "$WRITTEN_CFG" 'c.security.apiKey')"
assert_eq "written config keeps database.url" \
    "$DATABASE_URL" "$(json_field "$WRITTEN_CFG" 'c.database.url')"
assert_eq "written config keeps embedding.model" \
    "$EMBEDDING_MODEL" "$(json_field "$WRITTEN_CFG" 'c.embedding.model')"
assert_eq "written config keeps llm.codeModel" \
    "$CODE_MODEL" "$(json_field "$WRITTEN_CFG" 'c.llm.codeModel')"
assert_eq "written config keeps dataDir" \
    "$DATA_DIR" "$(json_field "$WRITTEN_CFG" 'c.dataDir')"

PERMS="$(ls -l "$WRITTEN_CFG" | cut -c2-10)"
assert_eq "written config is owner-only (holds DATABASE_URL and the API key)" "rw-------" "$PERMS"

# ---- The Ollama block is no longer three hardcoded literals (LIP-06) --------
# Every case above drives the write with OLLAMA_URL alone, exactly as the
# wizard does, so the defaults must still produce today's file. The llm.baseUrl
# assertion is the one that used to be unconditionally true: the template
# hardcoded http://localhost:11434/v1 regardless of OLLAMA_URL.
assert_eq "written config still names ollama as the embedding provider" \
    "ollama" "$(json_field "$WRITTEN_CFG" 'c.embedding.provider')"
assert_eq "written config takes embedding.baseURL from OLLAMA_URL" \
    "$OLLAMA_URL" "$(json_field "$WRITTEN_CFG" 'c.embedding.baseURL')"
assert_eq "written config derives llm.baseUrl from OLLAMA_URL" \
    "${OLLAMA_URL}/v1" "$(json_field "$WRITTEN_CFG" 'c.llm.baseUrl')"
assert_eq "written config keeps the ollama llm.apiKey" \
    "ollama" "$(json_field "$WRITTEN_CFG" 'c.llm.apiKey')"
assert_eq "written config keeps disableThink on for ollama" \
    "true" "$(json_field "$WRITTEN_CFG" 'c.llm.disableThink')"
assert_eq "written config resolves the known width for qwen3-embedding:4b" \
    "2560" "$(json_field "$WRITTEN_CFG" 'c.embedding.dimensions')"

# A remote/WSL Ollama is the case the hardcoded literal got wrong.
REMOTE_CFG="${TMP_ROOT}/remote/config.json"
mkdir -p "$(dirname "$REMOTE_CFG")"
(
    OLLAMA_URL="http://192.168.1.50:11434"
    export OLLAMA_URL
    installer_write_config "$REMOTE_CFG" "$FIRST_KEY"
)
assert_eq "a remote OLLAMA_URL reaches llm.baseUrl too" \
    "http://192.168.1.50:11434/v1" "$(json_field "$REMOTE_CFG" 'c.llm.baseUrl')"

# ---- An LM Studio write (LIP-06) -------------------------------------------
# Same writer, different provider globals. The model is one LM Studio's own
# knownDimensions table carries, so this resolves 768 without a live probe —
# the suite stays offline.
LMS_CFG="${TMP_ROOT}/lmstudio/config.json"
mkdir -p "$(dirname "$LMS_CFG")"
(
    INFERENCE_PROVIDER="lmstudio"
    EMBEDDING_MODEL="text-embedding-nomic-embed-text-v1.5"
    LLM_MODEL="qwen/qwen3-4b-2507"
    CODE_MODEL="qwen/qwen3-4b-2507"
    export INFERENCE_PROVIDER EMBEDDING_MODEL LLM_MODEL CODE_MODEL
    installer_write_config "$LMS_CFG" "$FIRST_KEY"
)
assert_eq "an LM Studio write records provider lmstudio" \
    "lmstudio" "$(json_field "$LMS_CFG" 'c.embedding.provider')"
assert_eq "an LM Studio write points embedding.baseURL at :1234/v1" \
    "http://localhost:1234/v1" "$(json_field "$LMS_CFG" 'c.embedding.baseURL')"
assert_eq "an LM Studio write points llm.baseUrl at :1234/v1" \
    "http://localhost:1234/v1" "$(json_field "$LMS_CFG" 'c.llm.baseUrl')"
assert_eq "an LM Studio write keeps the embedding model it was given" \
    "text-embedding-nomic-embed-text-v1.5" "$(json_field "$LMS_CFG" 'c.embedding.model')"
assert_eq "an LM Studio write resolves 768, not the retired 2560 catch-all" \
    "768" "$(json_field "$LMS_CFG" 'c.embedding.dimensions')"
assert_eq "an LM Studio write does not ask for Ollama's think:false" \
    "false" "$(json_field "$LMS_CFG" 'c.llm.disableThink')"
if [ "$(json_field "$LMS_CFG" 'c.llm.apiKey')" = "ollama" ]; then
    fail "an LM Studio write still carries the hardcoded ollama llm.apiKey"
else
    ok "an LM Studio write does not carry the hardcoded ollama llm.apiKey"
fi

# ---- Re-run idempotency: the whole point of the task ------------------------

SECOND_KEY="$(installer_resolve_api_key "$WRITTEN_CFG")"
assert_eq "a re-run resolves the key already on disk" "$FIRST_KEY" "$SECOND_KEY"

installer_write_config "$WRITTEN_CFG" "$SECOND_KEY"
assert_eq "a re-run leaves the same key in config.json" \
    "$FIRST_KEY" "$(json_field "$WRITTEN_CFG" 'c.security.apiKey')"
assert_eq "a re-run preserves the rest of the config" \
    "$DATABASE_URL" "$(json_field "$WRITTEN_CFG" 'c.database.url')"

# ---- Reporting: the path, never the secret ----------------------------------

REPORT="$(installer_report_api_key "$WRITTEN_CFG" 2>&1)"
if printf '%s' "$REPORT" | grep -Fq "$WRITTEN_CFG"; then
    ok "report names the config file the key was written to"
else
    fail "report names the config file the key was written to (got: ${REPORT})"
fi
if printf '%s' "$REPORT" | grep -Fq "security.apiKey"; then
    ok "report names the field to read"
else
    fail "report names the field to read (got: ${REPORT})"
fi
if printf '%s' "$REPORT" | grep -Fq "$FIRST_KEY"; then
    fail "report must never print the key value itself"
else
    ok "report never prints the key value itself"
fi

# ---- Wiring: a perfect helper is worthless if the wizard never calls it -----

assert_script_contains "setup script sources the API key helper" \
    'lib/installer-api-key\.sh'
assert_script_contains "setup script resolves a key before writing config" \
    'installer_resolve_api_key'
assert_script_contains "setup script writes config through the shared writer" \
    'installer_write_config'
assert_script_contains "setup script reports where the key lives" \
    'installer_report_api_key'

echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
