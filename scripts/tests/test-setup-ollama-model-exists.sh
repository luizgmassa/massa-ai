#!/usr/bin/env bash
set -euo pipefail

# Regression suite for ollama_model_exists in setup-local-first.sh.
#
# The original implementation stripped the tag before matching
# (search="${1%%:*}"), so any installed sibling tag satisfied the check:
# an installed qwen3-embedding:8b made the script report qwen3-embedding:4b
# as "already available" and skip the pull entirely. Matching must be exact
# on name:tag, with a bare name normalizing to :latest (mirroring Ollama).
#
# The suite extracts the real function from the setup script and runs it
# against stubbed `ollama` / `curl` / `python3` binaries, one test per
# detection branch (CLI, python3 JSON parse, grep fallback).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SETUP_SCRIPT="${PROJECT_ROOT}/scripts/setup-local-first.sh"

PASS=0
FAIL=0

ok() { echo "  ok - $*"; PASS=$((PASS + 1)); }
fail() { echo "  not ok - $*"; FAIL=$((FAIL + 1)); }

FUNC_SRC="$(sed -n '/^ollama_model_exists()/,/^}/p' "$SETUP_SCRIPT")"
if [ -z "$FUNC_SRC" ]; then
    fail "ollama_model_exists function extracted from setup script"
    echo "Results: ${PASS} passed, 1 failed"
    exit 1
fi
# Guard against a silently truncated/corrupted sed extraction (e.g. a future
# column-0 `}` inside the body): the extracted text must parse on its own.
if printf '%s\n' "$FUNC_SRC" | bash -n 2>/dev/null; then
    ok "ollama_model_exists function extracted from setup script"
else
    fail "extracted ollama_model_exists is not valid bash (sed extraction broke)"
    echo "Results: ${PASS} passed, ${FAIL} failed"
    exit 1
fi

# The python3-labeled cases below only exercise the python3 branch when a real
# python3 exists; without this assert they would silently test the grep
# fallback twice while reporting "python3: ... ok".
if command -v python3 >/dev/null 2>&1; then
    ok "python3 available (python3-branch labels are honest)"
else
    fail "python3 not on PATH - python3-branch cases would silently test the grep fallback"
fi

STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

# Installed inventory used by every stub: sibling tags of the wanted models,
# plus one exact match and one bare-name-as-:latest case.
cat > "${STUB_DIR}/ollama" << 'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "list" ]; then
    cat << 'LIST'
NAME                       ID              SIZE      MODIFIED
qwen3-embedding:8b         64b933495768    4.7 GB    4 weeks ago
qwen2.5-coder:7b           dae161e27b0e    4.7 GB    3 weeks ago
bge-m3:latest              790764642607    1.2 GB    2 months ago
LIST
fi
EOF
cat > "${STUB_DIR}/curl" << 'EOF'
#!/usr/bin/env bash
printf '%s' '{"models":[{"name":"qwen3-embedding:8b"},{"name":"qwen2.5-coder:7b"},{"name":"bge-m3:latest"}]}'
EOF
chmod +x "${STUB_DIR}/ollama" "${STUB_DIR}/curl"

# run_case <expected yes|no> <model> <has_cli true|false> <break_python3 0|1> <label>
run_case() {
    local expected="$1" model="$2" has_cli="$3" break_python3="$4" label="$5"
    local case_path="${STUB_DIR}:${PATH}"
    if [ "$break_python3" = "1" ]; then
        # Force the grep fallback: python3 resolves but always fails.
        printf '#!/usr/bin/env bash\nexit 1\n' > "${STUB_DIR}/python3"
        chmod +x "${STUB_DIR}/python3"
    else
        rm -f "${STUB_DIR}/python3"
    fi
    local got
    got="$(
        PATH="$case_path" bash -c '
            OLLAMA_URL="http://stubbed"
            OLLAMA_HAS_CLI="'"$has_cli"'"
            eval "$1"
            ollama_model_exists "'"$model"'"
        ' _ "$FUNC_SRC"
    )"
    if [ "$got" = "$expected" ]; then
        ok "$label"
    else
        fail "$label (expected ${expected}, got ${got:-<empty>})"
    fi
}

echo "ollama_model_exists exact-tag matching tests"

# CLI branch (falls through to API stubs when the CLI misses)
run_case yes "qwen3-embedding:8b"  true 0 "CLI: exact installed tag matches"
run_case no  "qwen3-embedding:4b"  true 0 "CLI: sibling tag does not satisfy a missing tag (regression)"
run_case no  "qwen2.5:7b-instruct" true 0 "CLI: base-name prefix of another model does not match (regression)"
run_case yes "bge-m3"              true 0 "CLI: bare name matches its :latest tag"

# python3 JSON branch (no CLI)
run_case yes "qwen3-embedding:8b"  false 0 "python3: exact installed tag matches"
run_case no  "qwen3-embedding:4b"  false 0 "python3: sibling tag does not satisfy a missing tag (regression)"
run_case no  "qwen2.5:7b-instruct" false 0 "python3: substring of another model name does not match (regression)"
run_case yes "bge-m3"              false 0 "python3: bare name matches its :latest tag"

# grep fallback branch (no CLI, python3 broken)
run_case yes "qwen3-embedding:8b"  false 1 "grep fallback: exact installed tag matches"
run_case no  "qwen3-embedding:4b"  false 1 "grep fallback: sibling tag does not satisfy a missing tag (regression)"
run_case no  "qwen2.5:7b-instruct" false 1 "grep fallback: name-prefix of another model does not match (regression)"
run_case yes "bge-m3"              false 1 "grep fallback: bare name matches its :latest tag"

# Sibling site: validate-vscode-integration.sh had the identical defect shape
# (tag-stripped substring match). Keep it on exact argv-passed membership.
VALIDATE_SCRIPT="${PROJECT_ROOT}/scripts/validate-vscode-integration.sh"
if grep -q 'any(search in m' "$VALIDATE_SCRIPT"; then
    fail "validate-vscode-integration.sh still uses tag-stripped substring match"
else
    ok "validate-vscode-integration.sh dropped the tag-stripped substring match"
fi
if grep -q 'sys.argv\[1\] in models' "$VALIDATE_SCRIPT"; then
    ok "validate-vscode-integration.sh uses exact argv-passed membership"
else
    fail "validate-vscode-integration.sh missing exact argv-passed membership check"
fi

echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
