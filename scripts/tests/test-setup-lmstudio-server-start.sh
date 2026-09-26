#!/usr/bin/env bash
# ============================================================
#  massa-ai — setup-local-first.sh starts a stopped LM Studio server
#
#    - `lmstudio_ensure_server`      runs `lms server start` (never
#                                    `lms daemon up`, which leaves the HTTP
#                                    server down) and waits for /v1/models
#    - `mlx_sidecar_ensure_running`  kickstarts the launchd sidecar when its
#                                    /health does not answer
#
#  The functions are extracted from the wizard by literal sed and run against
#  stubbed curl, lms, launchctl and sleep binaries; a stub flips a state file
#  so each case proves the start command is what brought the endpoint up.
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SETUP_SCRIPT="${REPO_ROOT}/scripts/setup-local-first.sh"

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

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "${TMP_ROOT}"' EXIT

extract() {
  local name="$1" src
  src="$(sed -n "/^${name}()/,/^}/p" "$SETUP_SCRIPT")"
  if [ -z "$src" ]; then
    fail "${name} extracted from setup-local-first.sh (found nothing)"
    return 1
  fi
  if ! printf '%s\n' "$src" | bash -n 2>/dev/null; then
    fail "${name} extracted from setup-local-first.sh (not valid bash)"
    return 1
  fi
  printf '%s\n' "$src"
}

echo "LM Studio server start"

PROBE_SRC="$(extract massa_ai_probe_provider)" || { echo "Results: ${PASS} passed, ${FAIL} failed"; exit 1; }
ENSURE_SRC="$(extract lmstudio_ensure_server)" || { echo "Results: ${PASS} passed, ${FAIL} failed"; exit 1; }
SIDECAR_SRC="$(extract mlx_sidecar_ensure_running)" || { echo "Results: ${PASS} passed, ${FAIL} failed"; exit 1; }
ok "massa_ai_probe_provider, lmstudio_ensure_server and mlx_sidecar_ensure_running extract and parse"

if grep -q 'daemon up' "$SETUP_SCRIPT"; then
  fail "setup-local-first.sh no longer uses 'lms daemon up'"
else
  ok "setup-local-first.sh no longer uses 'lms daemon up'"
fi

STUB_DIR="${TMP_ROOT}/stubs"
STATE="${TMP_ROOT}/state"
mkdir -p "$STUB_DIR" "$STATE"

cat > "${STUB_DIR}/curl" << 'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
  case "$arg" in
    *"/v1/models")
      [ -f "${STUB_STATE}/lms-up" ] || exit 7
      printf '%s' '{"object":"list","data":[{"id":"qwen3-vl-8b-instruct"}]}'
      exit 0 ;;
    *"/health")
      [ -f "${STUB_STATE}/sidecar-up" ] || exit 7
      printf '%s' '{"status": "ok"}'
      exit 0 ;;
  esac
done
exit 7
EOF
cat > "${STUB_DIR}/lms" << 'EOF'
#!/usr/bin/env bash
echo "$*" >> "${STUB_STATE}/lms-calls"
if [ "$1 $2" = "server start" ] && [ "${STUB_LMS_STARTS:-1}" = "1" ]; then
  touch "${STUB_STATE}/lms-up"
fi
exit 0
EOF
cat > "${STUB_DIR}/launchctl" << 'EOF'
#!/usr/bin/env bash
echo "$*" >> "${STUB_STATE}/launchctl-calls"
if [ "$1" = "kickstart" ] && [ "${STUB_SIDECAR_STARTS:-1}" = "1" ]; then
  touch "${STUB_STATE}/sidecar-up"
fi
exit 0
EOF
printf '#!/usr/bin/env bash\nexit 0\n' > "${STUB_DIR}/sleep"
chmod +x "${STUB_DIR}/curl" "${STUB_DIR}/lms" "${STUB_DIR}/launchctl" "${STUB_DIR}/sleep"

reset_state() {
  rm -f "${STATE}"/*
}

# run_ensure <url> [lms_starts 0|1] [cli]
run_ensure() {
  local url="$1" starts="${2:-1}" cli="${3-${STUB_DIR}/lms}"
  PATH="${STUB_DIR}:${PATH}" STUB_STATE="$STATE" STUB_LMS_STARTS="$starts" \
    LMS_SERVER_START_WAIT_SECONDS=3 bash -c '
    YELLOW="" NC=""
    eval "$1"
    eval "$2"
    if lmstudio_ensure_server "$3" "$4" >/dev/null; then echo up; else echo down; fi
  ' _ "$PROBE_SRC" "$ENSURE_SRC" "$cli" "$url" 2>/dev/null
}

run_sidecar() {
  local url="$1" starts="${2:-1}"
  PATH="${STUB_DIR}:${PATH}" STUB_STATE="$STATE" STUB_SIDECAR_STARTS="$starts" \
    MLX_SIDECAR_START_WAIT_SECONDS=3 bash -c '
    YELLOW="" NC=""
    eval "$1"
    if mlx_sidecar_ensure_running "$2" >/dev/null; then echo up; else echo down; fi
  ' _ "$SIDECAR_SRC" "$url" 2>/dev/null
}

# ── lmstudio_ensure_server ───────────────────────────────────
reset_state
touch "${STATE}/lms-up"
check_eq "a running server is left alone" "up" "$(run_ensure "http://localhost:1234/v1")"
[ ! -f "${STATE}/lms-calls" ] && ok "no lms call when the server already answers" \
  || fail "no lms call when the server already answers (got: $(cat "${STATE}/lms-calls"))"

reset_state
check_eq "a stopped server is started" "up" "$(run_ensure "http://localhost:1234/v1")"
check_eq "the start command is 'lms server start' on the configured port" \
  "server start --port 1234" "$(cat "${STATE}/lms-calls" 2>/dev/null)"

reset_state
run_ensure "http://127.0.0.1:4321/v1" >/dev/null
check_eq "a non-default port is passed through" "server start --port 4321" "$(cat "${STATE}/lms-calls" 2>/dev/null)"

reset_state
run_ensure "http://lmstudio.local/v1" >/dev/null
check_eq "a URL without a port starts on LM Studio's default" "server start" "$(cat "${STATE}/lms-calls" 2>/dev/null)"

reset_state
check_eq "a server that never comes up reports down" "down" "$(run_ensure "http://localhost:1234/v1" 0)"

reset_state
check_eq "no CLI and no server reports down" "down" "$(run_ensure "http://localhost:1234/v1" 1 "")"

# ── mlx_sidecar_ensure_running ───────────────────────────────
reset_state
touch "${STATE}/sidecar-up"
check_eq "a healthy sidecar is left alone" "up" "$(run_sidecar "http://127.0.0.1:1235/v1")"
[ ! -f "${STATE}/launchctl-calls" ] && ok "no launchctl call when the sidecar answers" \
  || fail "no launchctl call when the sidecar answers (got: $(cat "${STATE}/launchctl-calls"))"

reset_state
check_eq "a stopped sidecar is kickstarted" "up" "$(run_sidecar "http://127.0.0.1:1235/v1")"
case "$(cat "${STATE}/launchctl-calls" 2>/dev/null)" in
  "kickstart -k gui/"*"/ai.massa.mlx-embed") ok "kickstart targets the ai.massa.mlx-embed agent" ;;
  *) fail "kickstart targets the ai.massa.mlx-embed agent (got: $(cat "${STATE}/launchctl-calls" 2>/dev/null))" ;;
esac

reset_state
check_eq "a sidecar that never comes up reports down" "down" "$(run_sidecar "http://127.0.0.1:1235/v1" 0)"

echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
