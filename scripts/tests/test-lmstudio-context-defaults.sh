#!/usr/bin/env bash
# ============================================================
#  massa-ai — LM Studio per-model default context contract
#
#  Covers `installer_set_lmstudio_context_default` and
#  `installer_lmstudio_home` in scripts/lib/installer-feature-prompts.sh.
#  Every case runs under a scratch HOME with a stub `lms`; the developer's
#  real ~/.lmstudio is never read or written.
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

LMS_STUB="${TMP_ROOT}/lms"
cat > "$LMS_STUB" <<'STUBEOF'
#!/usr/bin/env bash
if [ "${1:-}" = "ls" ] && [ "${2:-}" = "--json" ]; then
  cat <<'JSONEOF'
[{"type":"llm","modelKey":"coder","path":"mlx-community/Coder-4bit","indexedModelIdentifier":"mlx-community/Coder-4bit"},
 {"type":"llm","modelKey":"instruct","path":"lmstudio-community/Instruct-GGUF/Instruct-Q4_K_M.gguf","indexedModelIdentifier":"lmstudio-community/Instruct-GGUF/Instruct-Q4_K_M.gguf"},
 {"type":"llm","modelKey":"escape","path":"../../outside","indexedModelIdentifier":"../../outside"}]
JSONEOF
fi
exit 0
STUBEOF
chmod +x "$LMS_STUB"

new_home() {
  local home="${TMP_ROOT}/home-${RANDOM}${RANDOM}"
  mkdir -p "${home}/.lmstudio/.internal"
  printf '%s' "$home"
}

run_set() {
  local home="$1"
  shift
  env -i PATH="$PATH" HOME="$home" bash -c "
    . '${LIB_DIR}/installer-shared.sh'
    . '${LIB_DIR}/installer-feature-prompts.sh'
    installer_set_lmstudio_context_default $*
  " 2>&1
}

defaults_dir() { printf '%s' "$1/.lmstudio/.internal/user-concrete-model-default-config"; }

context_in() {
  node -e '
    const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const f = d.load.fields.find((x) => x.key === "llm.load.contextLength");
    process.stdout.write(String(f ? f.value : "none"));
  ' "$1"
}

echo "── a model with no saved defaults gets LM Studio's own shape ──"

H="$(new_home)"
out="$(run_set "$H" "'${LMS_STUB}' coder 32768")"
F="$(defaults_dir "$H")/mlx-community/Coder-4bit.json"
check_eq "the file lands at <indexedModelIdentifier>.json" "yes" "$([ -f "$F" ] && echo yes || echo no)"
check_eq "the context field carries the role's value" "32768" "$(context_in "$F")"
check_eq "the document matches the shape LM Studio writes from its UI" \
  '{"preset":"","operation":{"fields":[]},"load":{"fields":[{"key":"llm.load.contextLength","value":32768}]}}' \
  "$(node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))))' "$F")"
check_contains "the change is announced" "coder: 32768 (was unset)" "$out"

echo "── a GGUF model keys the file by its weight-file path ──"

run_set "$H" "'${LMS_STUB}' instruct 16384" >/dev/null
G="$(defaults_dir "$H")/lmstudio-community/Instruct-GGUF/Instruct-Q4_K_M.gguf.json"
check_eq "the GGUF defaults file carries the value" "16384" "$(context_in "$G")"

echo "── existing user settings survive ──"

H="$(new_home)"
D="$(defaults_dir "$H")/mlx-community"
mkdir -p "$D"
cat > "${D}/Coder-4bit.json" <<'EOF'
{"preset":"my-preset","operation":{"fields":[{"key":"llm.prediction.temperature","value":0.1}]},
 "load":{"fields":[{"key":"llm.load.flashAttention","value":true},{"key":"llm.load.contextLength","value":8192}]}}
EOF
out="$(run_set "$H" "'${LMS_STUB}' coder 32768")"
F="${D}/Coder-4bit.json"
check_eq "a smaller saved context is raised" "32768" "$(context_in "$F")"
check_eq "other load fields, operation fields and the preset are kept" \
  'my-preset|0.1|true|2' \
  "$(node -e '
    const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const fa = d.load.fields.find((x) => x.key === "llm.load.flashAttention");
    process.stdout.write([d.preset, d.operation.fields[0].value, fa.value, d.load.fields.length].join("|"));
  ' "$F")"
check_contains "the previous value is reported" "(was 8192)" "$out"

cat > "${D}/Coder-4bit.json" <<'EOF'
{"preset":"","operation":{"fields":[]},"load":{"fields":[{"key":"llm.load.contextLength","value":65536}]}}
EOF
out="$(run_set "$H" "'${LMS_STUB}' coder 32768")"
check_eq "a larger saved context is never lowered" "65536" "$(context_in "$F")"
check_contains "keeping it is announced" "65536 (kept, needs 32768)" "$out"

echo "── anything unrecognized is left alone ──"

printf '{ not json' > "${D}/Coder-4bit.json"
out="$(run_set "$H" "'${LMS_STUB}' coder 32768")"
check_eq "an unparsable file is not overwritten" "{ not json" "$(cat "${D}/Coder-4bit.json")"
check_contains "and the user is told" "Unreadable LM Studio defaults" "$out"

printf '{"load":{"fields":"weird"}}' > "${D}/Coder-4bit.json"
out="$(run_set "$H" "'${LMS_STUB}' coder 32768")"
check_eq "an unknown shape is not overwritten" '{"load":{"fields":"weird"}}' "$(cat "${D}/Coder-4bit.json")"
check_contains "and the user is told" "Unrecognized LM Studio defaults format" "$out"

H="$(new_home)"
out="$(run_set "$H" "'${LMS_STUB}' not-installed 32768")"
check_eq "a model LM Studio does not list writes nothing" "0" \
  "$(find "$(defaults_dir "$H")" -type f 2>/dev/null | wc -l | tr -d ' ')"
check_contains "and says so" "does not list not-installed" "$out"

out="$(run_set "$H" "'${LMS_STUB}' escape 32768")"
check_eq "a path escaping the defaults directory writes nothing" "no" \
  "$([ -e "${H}/.lmstudio/outside.json" ] || [ -e "${H}/outside.json" ] && echo yes || echo no)"
check_contains "and says so" "Unexpected LM Studio model path" "$out"

H="${TMP_ROOT}/no-lmstudio-home"
mkdir -p "$H"
out="$(run_set "$H" "'${LMS_STUB}' coder 32768")"
check_eq "no LM Studio home means no directory is created" "no" \
  "$([ -e "${H}/.lmstudio" ] && echo yes || echo no)"
check_contains "and says so" "No LM Studio home" "$out"

check_eq "no lms CLI is a silent no-op" "" "$(run_set "$(new_home)" "'' coder 32768")"

echo "── the home pointer LM Studio writes is honoured ──"

H="${TMP_ROOT}/pointer-home"
mkdir -p "$H" "${TMP_ROOT}/relocated/.internal"
printf '%s\n' "${TMP_ROOT}/relocated" > "${H}/.lmstudio-home-pointer"
run_set "$H" "'${LMS_STUB}' coder 32768" >/dev/null
check_eq "the defaults land under the pointed-to home" "32768" \
  "$(context_in "${TMP_ROOT}/relocated/.internal/user-concrete-model-default-config/mlx-community/Coder-4bit.json")"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
