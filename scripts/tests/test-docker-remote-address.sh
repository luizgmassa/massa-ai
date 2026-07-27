#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  T7 / SEC-06 — the Docker bridge address, measured not assumed
#
#  Plan Challenge finding 3, as narrowed by TASK-000, left one open item: the
#  loopback trust check reads the TRUE peer address (`ctx.request.ip`), and
#  docker-compose publishes the API through a bridge port mapping, so a
#  host-originated request should arrive as a bridge-gateway address and fail
#  the check. Every part of that except the address itself was verified. This
#  suite observes the value.
#
#  Two layers:
#
#    1. Static preconditions — always run. They pin the two facts that make the
#       measurement meaningful: compose really is bridge-mapped (not
#       `network_mode: host`, where the question would not arise), and the API
#       image really does ship the trust override that keeps /ui usable once
#       the check fails.
#
#    2. The live measurement — needs a container runtime, so it is opt-in via
#       MASSA_AI_DOCKER_PROBE=1 (the RUN_E2E precedent). Without the flag it is
#       reported as NOT RUN. With the flag and no runtime it FAILS, because the
#       one place that sets the flag is CI, where a silent skip would be
#       indistinguishable from a passing measurement.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
ROOT_DOCKERFILE="${PROJECT_ROOT}/Dockerfile"
PROBE_DIR="${PROJECT_ROOT}/scripts/docker"
PROBE_DOCKERFILE="${PROBE_DIR}/remote-address-probe.Dockerfile"

PASS=0
FAIL=0

ok() { echo "  ok - $*"; PASS=$((PASS + 1)); }
fail() { echo "  not ok - $*"; FAIL=$((FAIL + 1)); }

echo "Docker remote-address measurement (SEC-06)"

# ---- Layer 1: static preconditions -----------------------------------------

if grep -Eq '^\s*-\s*"\$\{MASSA_AI_API_PORT:-3333\}:3333"' "$COMPOSE_FILE"; then
    ok "compose publishes the API through a port mapping"
else
    fail "compose publishes the API through a port mapping"
fi

if grep -Eq 'network_mode:\s*host' "$COMPOSE_FILE"; then
    fail "compose does not use host networking (a bridge address is the case under test)"
else
    ok "compose does not use host networking (a bridge address is the case under test)"
fi

if grep -Eq '^ENV MASSA_AI_WEB_UI_TRUST_LOCAL=true' "$ROOT_DOCKERFILE"; then
    ok "API image opts in to the web-ui trust override"
else
    fail "API image opts in to the web-ui trust override"
fi

if grep -Eq '^ENV XDG_CONFIG_HOME=/data' "$ROOT_DOCKERFILE"; then
    ok "API image stores config.json inside the mounted volume"
else
    fail "API image stores config.json inside the mounted volume"
fi

if [ -f "$PROBE_DOCKERFILE" ] && [ -f "${PROBE_DIR}/remote-address-probe.ts" ]; then
    ok "probe image sources are present"
else
    fail "probe image sources are present"
fi

# ---- Layer 2: the live measurement -----------------------------------------

RUNTIME=""
if command -v docker >/dev/null 2>&1; then
    RUNTIME="docker"
elif command -v podman >/dev/null 2>&1; then
    RUNTIME="podman"
fi

if [ "${MASSA_AI_DOCKER_PROBE:-0}" != "1" ]; then
    echo "  # NOT RUN - live bridge measurement is opt-in; set MASSA_AI_DOCKER_PROBE=1 (needs a container runtime)"
    echo "Results: ${PASS} passed, ${FAIL} failed"
    [ "$FAIL" -eq 0 ]
    exit $?
fi

if [ -z "$RUNTIME" ]; then
    fail "MASSA_AI_DOCKER_PROBE=1 was set but no container runtime (docker/podman) is on PATH — measurement NOT taken"
    echo "Results: ${PASS} passed, ${FAIL} failed"
    exit 1
fi

echo "  # running live measurement with ${RUNTIME}"

IMAGE="massa-ai-remote-address-probe:test"
CONTAINER="massa-ai-remote-address-probe"
HOST_PORT="${MASSA_AI_DOCKER_PROBE_PORT:-3333}"

cleanup_container() {
    "$RUNTIME" rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup_container EXIT
cleanup_container

if ! "$RUNTIME" build -f "$PROBE_DOCKERFILE" -t "$IMAGE" "$PROBE_DIR" >/tmp/probe-build.log 2>&1; then
    fail "probe image builds"
    tail -30 /tmp/probe-build.log
    echo "Results: ${PASS} passed, ${FAIL} failed"
    exit 1
fi
ok "probe image builds"

# Bridge networking with an explicit published port — deliberately NOT
# --network host, which would short-circuit the bridge and report loopback,
# measuring the wrong thing. This is the shape docker-compose.yml uses.
"$RUNTIME" run -d --name "$CONTAINER" -p "${HOST_PORT}:3333" "$IMAGE" >/dev/null

READY=0
for _ in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${HOST_PORT}/whoami" >/dev/null 2>&1; then READY=1; break; fi
    sleep 1
done

if [ "$READY" -ne 1 ]; then
    fail "probe container became reachable on the published port"
    "$RUNTIME" logs "$CONTAINER" 2>&1 | tail -20
    echo "Results: ${PASS} passed, ${FAIL} failed"
    exit 1
fi
ok "probe container became reachable on the published port"

RESPONSE="$(curl -sf "http://127.0.0.1:${HOST_PORT}/whoami")"
OBSERVED_IP="$(printf '%s' "$RESPONSE" | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p')"

echo ""
echo "  ===== OBSERVED (record this verbatim in design.md) ====="
echo "  host request -> ${RUNTIME} -p ${HOST_PORT}:3333 (bridge)"
echo "  raw response: ${RESPONSE}"
echo "  ctx.request.ip = ${OBSERVED_IP:-<absent>}"
echo "  ======================================================="
echo ""

if [ -n "$OBSERVED_IP" ]; then
    ok "the probe reported an address at all (request.ip survives this elysia/@elysiajs/node)"
else
    fail "the probe reported an address at all (request.ip survives this elysia/@elysiajs/node)"
fi

# The load-bearing assertion. If a bridge-mapped container DID see loopback,
# the whole reason MASSA_AI_WEB_UI_TRUST_LOCAL exists would be wrong, and T6's
# accepted exposure would be unnecessary. Uses the same three loopback
# spellings TASK-000 recorded and apps/tools-api/src/web-ui-trust.ts accepts.
case "$OBSERVED_IP" in
    ::1|::ffff:127.*|127.*)
        fail "a bridge-mapped container does NOT see loopback (observed '${OBSERVED_IP}' — revisit SEC-05/T6)"
        ;;
    "")
        fail "a bridge-mapped container does NOT see loopback (no address observed)"
        ;;
    *)
        ok "a bridge-mapped container does NOT see loopback (observed '${OBSERVED_IP}')"
        ;;
esac

echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
