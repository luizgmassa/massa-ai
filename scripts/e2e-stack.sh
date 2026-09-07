#!/usr/bin/env bash
# e2e-stack.sh — bring up, inspect and tear down the dedicated live-stack E2E
# environment (PostgreSQL :5433, Ollama :11435, Tools API :3334).
#
# Why this exists: the only automated provisioning of this stack lived inside
# `packages/core/src/__tests__/e2e/23.owned-destructive.test.ts`, reachable
# only by running that one suite. Every other E2E file assumed a stack somebody
# had already started by hand from a runbook. This script is that runbook, made
# executable and reusable.
#
# Two contracts it must not break:
#
#   1. The developer-owned shared stack on :3333 / :5432 / :11434 is never a
#      test target and is never touched. Every port this script manages is a
#      dedicated one, and `down` refuses to kill a PID it did not start.
#
#   2. `packages/core/src/__tests__/e2e/_helpers.ts` fails closed unless FOUR
#      environment pins are present together: MASSA_AI_DEDICATED=1, a non-empty
#      MASSA_AI_E2E_PROJECT_PATH, MASSA_AI_API_URL with origin exactly
#      http://127.0.0.1:3334, and a DATABASE_URL matching
#      127.0.0.1:5433/massa_ai_test. `env` emits all four; emitting a subset
#      makes every guarded suite throw before its first HTTP call.
#
# Usage:
#   bash scripts/e2e-stack.sh up [--profile <name>]
#   bash scripts/e2e-stack.sh status
#   bash scripts/e2e-stack.sh restart-api [--profile <name>] [--env K=V]...
#   bash scripts/e2e-stack.sh env
#   bash scripts/e2e-stack.sh down
#
# Profiles (they differ only in the Tools API environment):
#   default       auth off, hooks on, scheduler off, LLM off
#   auth          auth on with a generated key, exported by `env`
#   hooks-off     HOOKS_ENABLED=false, for the 423 Locked scenarios
#   scheduler-on  scheduler master switch + safe defaults on
#   scheduler-fast  scheduler on with a 1 s tick and two SIDE-EFFECT-SAFE jobs on
#                   a 5 s interval, so a real fire happens inside a suite run
#                   (EB-SCH-3 / EB-SCH-4). Overridable with
#                   MASSA_AI_E2E_SCHED_TICK_MS / MASSA_AI_E2E_SCHED_INTERVAL_MS.
#   llm-on        MASSA_AI_LLM_ENABLED=true with the locally installed models
#
# Exit codes: 0 success; 1 runtime failure or a refused unsafe action;
#             2 unknown flag, command or profile; 3 a required binary is absent.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${MASSA_AI_E2E_STATE_DIR:-/tmp/massa-ai-e2e-stack}"
PG_DATA="${STATE_DIR}/pgdata"
FAKE_HOME="${STATE_DIR}/home"
CONFIG_HOME="${STATE_DIR}/config"
LOG_DIR="${STATE_DIR}/logs"
STATE_FILE="${STATE_DIR}/state.env"

API_PORT=3334
PG_PORT=5433
OLLAMA_PORT=11435

API_ORIGIN="http://127.0.0.1:${API_PORT}"
DB_URL="postgresql://test:test@127.0.0.1:${PG_PORT}/massa_ai_test"
OLLAMA_ORIGIN="http://127.0.0.1:${OLLAMA_PORT}"

# The embedding model that is actually installed locally. The historical runbook
# pins qwen3-embedding:8b at 4096 dimensions; that model is not present, and a
# dimension mismatch degrades silently to a different vector table rather than
# failing, so the pin is corrected here rather than inherited.
EMBED_MODEL="${MASSA_AI_E2E_EMBED_MODEL:-qwen3-embedding:4b}"
EMBED_DIMS="${MASSA_AI_E2E_EMBED_DIMS:-2560}"
LLM_MODEL="${MASSA_AI_E2E_LLM_MODEL:-qwen2.5:7b-instruct}"
LLM_CODE_MODEL="${MASSA_AI_E2E_LLM_CODE_MODEL:-qwen2.5-coder:7b}"

FIXTURE_PATH="${MASSA_AI_E2E_PROJECT_PATH:-/tmp/massa-ai-e2e-fixture}"

# Ports belonging to the developer's own stack. Named so the refusal messages
# can say which one was about to be touched.
SHARED_PORTS=(3333 5432 11434)

die() { printf 'e2e-stack: %s\n' "$1" >&2; exit "${2:-1}"; }
log() { printf '  %s\n' "$1" >&2; }

# ── binaries ────────────────────────────────────────────────────────────────
# Resolved once, with the Homebrew paths as the documented fallback (that is
# where 23.owned-destructive.test.ts hardcodes them).
resolve_bin() {
  local name="$1" fallback="$2" found
  if found="$(command -v "$name" 2>/dev/null)"; then printf '%s' "$found"; return 0; fi
  if [[ -x "$fallback" ]]; then printf '%s' "$fallback"; return 0; fi
  return 1
}

require_bins() {
  INITDB_BIN="$(resolve_bin initdb /opt/homebrew/bin/initdb)" || die "initdb not found (PostgreSQL client tools)" 3
  POSTGRES_BIN="$(resolve_bin postgres /opt/homebrew/bin/postgres)" || die "postgres not found" 3
  CREATEDB_BIN="$(resolve_bin createdb /opt/homebrew/bin/createdb)" || die "createdb not found" 3
  PSQL_BIN="$(resolve_bin psql /opt/homebrew/bin/psql)" || die "psql not found" 3
  PG_CTL_BIN="$(resolve_bin pg_ctl /opt/homebrew/bin/pg_ctl)" || die "pg_ctl not found" 3
  OLLAMA_BIN="$(resolve_bin ollama /usr/local/bin/ollama)" || die "ollama not found" 3
  BUN_BIN="$(resolve_bin bun "$HOME/.bun/bin/bun")" || die "bun not found" 3
}

# ── port / PID attestation ──────────────────────────────────────────────────
listener_pid() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
}

assert_shared_untouched() {
  # Read-only: proves the developer stack is still where it was. Called before
  # and after every mutating action so a mistake is visible immediately.
  local port pid
  for port in "${SHARED_PORTS[@]}"; do
    pid="$(listener_pid "$port")"
    printf '%s=%s\n' "$port" "${pid:-none}"
  done
}

refuse_if_foreign_listener() {
  local port="$1" name="$2" pid
  pid="$(listener_pid "$port")"
  [[ -z "$pid" ]] && return 0
  local owned=""
  [[ -f "$STATE_FILE" ]] && owned="$(state_get "${name}_pid")"
  if [[ -n "$owned" && "$pid" == "$owned" ]]; then return 0; fi
  die "port ${port} already has a listener (PID ${pid}) that this script does not own — refusing to start ${name}"
}

# ── state file ──────────────────────────────────────────────────────────────
state_get() {
  [[ -f "$STATE_FILE" ]] || return 0
  local key="$1" line
  line="$(grep -E "^${key}=" "$STATE_FILE" 2>/dev/null | tail -1 || true)"
  printf '%s' "${line#*=}"
}

state_set() {
  local key="$1" value="$2" tmp
  mkdir -p "$STATE_DIR"
  touch "$STATE_FILE"
  tmp="${STATE_FILE}.tmp"
  grep -vE "^${key}=" "$STATE_FILE" > "$tmp" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$STATE_FILE"
}

# ── profile → Tools API environment ─────────────────────────────────────────
profile_is_known() {
  case "$1" in default|auth|hooks-off|scheduler-on|scheduler-fast|llm-on) return 0 ;; *) return 1 ;; esac
}

# Emits `KEY=VALUE` lines for the extra environment a profile needs on top of
# the common service environment. Printed, not exported, so `restart-api` can
# re-derive it without re-entering `up`.
profile_env() {
  local profile="$1"
  case "$profile" in
    default)
      printf 'MASSA_AI_API_KEY=\n'
      ;;
    auth)
      local key
      key="$(state_get api_key)"
      if [[ -z "$key" ]]; then
        key="$(openssl rand -hex 32)"
        state_set api_key "$key"
      fi
      printf 'MASSA_AI_API_KEY=%s\n' "$key"
      ;;
    hooks-off)
      printf 'MASSA_AI_API_KEY=\nHOOKS_ENABLED=false\n'
      ;;
    scheduler-on)
      # The preset alone is not enough here, and the reason is measured rather
      # than defensive. `registerDefaultJobs` resolves each job as
      # `envBool(perJobEnv, configJson.scheduler.jobs[kind].enabled,
      # presetDefault)` (scheduler-defaults.ts:296), so config.json outranks the
      # preset by design. The API materializes a COMPLETE config.json on boot —
      # the minimal file `write_config_json` writes came back with all 17
      # sections, including `scheduler.jobs.*.enabled=false` for all five kinds —
      # and it does so before `registerDefaultJobs` reads the file. Result,
      # observed: `MASSA_AI_SCHEDULER_ENABLED=true` +
      # `MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true` produced `running:true` with
      # every job `enabled:false`, i.e. a scheduler that ticks and does nothing,
      # and three scenarios that cannot be measured against it.
      #
      # The per-job envs are the top of the documented precedence chain, so they
      # hold regardless of what the API writes into the scratch config. They name
      # exactly the two kinds the preset itself enables (consolidation + decay,
      # scheduler-defaults.ts:195-216) — auto-improve, observation-bridge and
      # checkpoint-purge stay off, which keeps the profile's shape identical to
      # the preset's. The preset's own wiring keeps its unit sensor at
      # packages/core/src/__tests__/scheduler-safe-defaults.test.ts.
      printf 'MASSA_AI_API_KEY=\nMASSA_AI_SCHEDULER_ENABLED=true\nMASSA_AI_SCHEDULER_SAFE_DEFAULTS=true\n'
      printf 'MASSA_AI_SCHEDULER_CONSOLIDATION_ENABLED=true\nMASSA_AI_SCHEDULER_DECAY_ENABLED=true\n'
      ;;
    scheduler-fast)
      # ADDITIVE (added for EB-SCH-3 / EB-SCH-4). `scheduler-on` deliberately
      # keeps production intervals, so no job ever executes inside a suite run
      # and the concurrency guard and the catch-up missed-job branch have no
      # black-box sensor at all. This profile is the smallest change that makes
      # a REAL fire observable; it does not replace `scheduler-on` and does not
      # relax anything it asserts.
      #
      # Why these two kinds and not the preset's two. The handlers decide it:
      #   checkpoint-purge   → CheckpointManager.purgeExpired()
      #                        (scheduler-defaults.ts:271-279) — a bounded DELETE
      #                        of ALREADY-EXPIRED rows only.
      #   observation-bridge → observationConsolidationJob.runOnce()
      #                        (:262-269), which returns `noop` at its first
      #                        gate when the LLM is off
      #                        (observation-consolidation-job.ts:157-163) — and
      #                        this profile leaves the LLM off.
      # Both are side-effect-safe against the acceptance database. The preset's
      # own pair (memory-consolidation, decay-sweep) both run the FULL
      # `memoryConsolidationJob.consolidate()` decay+prune+merge cycle over every
      # memory in `massa_ai_test`; firing those every few seconds would destroy
      # the fixture data other suites read. They stay off here, which is also
      # what keeps this profile from colliding with EB-SCH-2's preset table.
      #
      # The per-job INTERVAL env var is the top of the same documented
      # precedence chain as the ENABLED one: registerDefaultJobs resolves
      # `envNum(def.intervalEnvVar, fileJob?.intervalMs, def.schedule.intervalMs)`
      # (scheduler-defaults.ts:297-301), so it outranks both the config.json the
      # API materializes on boot and the >=30 min clamp `applySafeDefaults`
      # writes into `def.schedule` (:195-216) — the clamp only supplies the
      # FALLBACK. SAFE_DEFAULTS is therefore deliberately NOT set here.
      #
      # MAX_CONCURRENT=1 is what turns the cap at scheduler.ts:429-432 into an
      # observable: `fireJob` adds to `running` synchronously (:460) and the
      # tick loop never awaits between jobs, so with two jobs due in the same
      # tick the second is skipped deterministically rather than racily.
      printf 'MASSA_AI_API_KEY=\nMASSA_AI_SCHEDULER_ENABLED=true\n'
      printf 'MASSA_AI_SCHEDULER_TICK_MS=%s\n' "${MASSA_AI_E2E_SCHED_TICK_MS:-1000}"
      printf 'MASSA_AI_SCHEDULER_MAX_CONCURRENT=1\n'
      printf 'MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED=true\n'
      printf 'MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS=%s\n' "${MASSA_AI_E2E_SCHED_INTERVAL_MS:-5000}"
      printf 'MASSA_AI_SCHEDULER_OBSERVATION_BRIDGE_ENABLED=true\n'
      printf 'MASSA_AI_SCHEDULER_OBSERVATION_BRIDGE_INTERVAL_MS=%s\n' "${MASSA_AI_E2E_SCHED_INTERVAL_MS:-5000}"
      ;;
    llm-on)
      printf 'MASSA_AI_API_KEY=\nMASSA_AI_LLM_ENABLED=true\n'
      printf 'MASSA_AI_LLM_BASE_URL=%s/v1\nMASSA_AI_LLM_API_KEY=ollama\n' "$OLLAMA_ORIGIN"
      printf 'MASSA_AI_LLM_MODEL=%s\nMASSA_AI_LLM_CODE_MODEL=%s\n' "$LLM_MODEL" "$LLM_CODE_MODEL"
      ;;
  esac
}

# The environment every dedicated service shares. HOME and XDG_CONFIG_HOME are
# redirected into the state dir so the API never reads the developer's own
# ~/.config/massa-ai/config.json — which on this machine has llm.enabled=true
# and would silently pull live LLM calls into an LLM-off run.
common_service_env() {
  cat <<EOF
HOME=${FAKE_HOME}
XDG_CONFIG_HOME=${CONFIG_HOME}
DATABASE_URL=${DB_URL}
POSTGRES_VECTOR_URL=${DB_URL}
VECTOR_STORE_TYPE=postgres
MASSA_AI_DEDICATED=1
MASSA_AI_API_URL=${API_ORIGIN}
MASSA_AI_API_PORT=${API_PORT}
MASSA_AI_SCHEDULER_ENABLED=false
MASSA_AI_JOB_STALE_MS=300000
MASSA_AI_JOB_REAPER_INTERVAL_MS=60000
OLLAMA_BASE_URL=${OLLAMA_ORIGIN}
OLLAMA_HOST=127.0.0.1:${OLLAMA_PORT}
OLLAMA_MODELS=${HOME}/.ollama/models
EMBEDDING_PROVIDER=ollama
OLLAMA_EMBEDDING_MODEL=${EMBED_MODEL}
OLLAMA_EMBEDDING_DIMENSIONS=${EMBED_DIMS}
EOF
}

write_config_json() {
  # Structured-data work goes through an inline bun/node heredoc, the same
  # pattern every other installer in this repo uses. There is no jq dependency.
  local target="${CONFIG_HOME}/massa-ai/config.json"
  mkdir -p "$(dirname "$target")"
  local runtime
  runtime="$(command -v bun || command -v node || true)"
  [[ -n "$runtime" ]] || die "neither bun nor node on PATH" 3
  "$runtime" -e '
    const fs = require("node:fs");
    const [, , target, dbUrl, model, dims, base] = process.argv;
    fs.writeFileSync(target, JSON.stringify({
      database: { url: dbUrl },
      embedding: { provider: "ollama", model, dimensions: Number(dims), baseURL: base },
      llm: { enabled: false },
    }, null, 2) + "\n");
  ' "$target" "$DB_URL" "$EMBED_MODEL" "$EMBED_DIMS" "$OLLAMA_ORIGIN"
}

# ── waiting ─────────────────────────────────────────────────────────────────
wait_for() {
  local description="$1" timeout="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  die "timed out after ${timeout}s waiting for ${description}"
}

api_healthy() { curl -fsS -m 3 "${API_ORIGIN}/health" >/dev/null; }
ollama_healthy() { curl -fsS -m 3 "${OLLAMA_ORIGIN}/api/tags" >/dev/null; }
pg_healthy() { "$PSQL_BIN" "$DB_URL" -c 'SELECT 1' >/dev/null 2>&1; }

# ── service start ───────────────────────────────────────────────────────────
start_postgres() {
  refuse_if_foreign_listener "$PG_PORT" postgres

  if [[ -n "$(listener_pid "$PG_PORT")" ]]; then
    log "postgres already listening"
  else
    if [[ ! -f "${PG_DATA}/PG_VERSION" ]]; then
      mkdir -p "$PG_DATA"
      log "initdb ${PG_DATA}"
      "$INITDB_BIN" -D "$PG_DATA" -U test --auth=trust --no-locale --encoding=UTF8 >"${LOG_DIR}/initdb.log" 2>&1
    fi

    # LC_ALL=C is load-bearing, not hygiene. Homebrew PostgreSQL 17 on macOS
    # aborts at startup with "postmaster became multithreaded during startup"
    # when the inherited locale is unset or invalid — the hint it prints names
    # LC_ALL directly. `initdb` above already ran with --no-locale, so C is the
    # matching choice rather than an arbitrary one.
    env LC_ALL=C LANG=C "$POSTGRES_BIN" -D "$PG_DATA" -h 127.0.0.1 -p "$PG_PORT" \
      >"${LOG_DIR}/postgres.log" 2>&1 &
    local pid=$!
    state_set postgres_pid "$pid"
    # 90s, not 30s, and the number is measured rather than padded. A cold start
    # on a box at load 5.17 aborted here with "timed out after 30s waiting for
    # postgres :5433" while the postmaster was in fact starting: `status` run
    # immediately afterwards reported that same PID healthy. A budget that
    # expires while the service is coming up turns a slow machine into a
    # bring-up failure, and the failure lands three services early — ollama and
    # the API never start, so the operator sees "down" for services that were
    # never attempted. The API below already waits 90s for the same reason.
    wait_for "postgres :${PG_PORT}" 90 test -n "$(listener_pid "$PG_PORT")"
  fi

  # Provisioning runs on every `up`, including when the server was already
  # listening. An earlier run that started the cluster and then died before
  # `createdb` leaves a listening postgres with no `massa_ai_test`; an
  # already-listening early return would inherit that state forever.

  # Provisioning is keyed on the database actually existing, not on whether
  # initdb ran in this invocation. A previous run that created the cluster and
  # then died before `createdb` would otherwise be seen as fully provisioned,
  # and every later `up` would fail at the health check with no explanation.
  if ! "$PSQL_BIN" "$DB_URL" -c 'SELECT 1' >/dev/null 2>&1; then
    log "createdb massa_ai_test"
    "$CREATEDB_BIN" -h 127.0.0.1 -p "$PG_PORT" -U test massa_ai_test >>"${LOG_DIR}/postgres.log" 2>&1 || true
    "$PSQL_BIN" "$DB_URL" -c 'CREATE EXTENSION IF NOT EXISTS vector' >>"${LOG_DIR}/postgres.log" 2>&1
  fi
  wait_for "postgres accepting queries" 60 pg_healthy

  # `migrate deploy` is idempotent: it applies only migrations the database has
  # not recorded, so running it on every `up` costs one query on a warm cluster
  # and repairs a half-provisioned one.
  # Bun hoists prisma to the workspace root, so the per-package path that
  # 23.owned-destructive.test.ts hardcodes does not exist in this checkout.
  # Prefer package-local, fall back to the hoisted root binary, then to bunx.
  local prisma_bin=""
  if [[ -x "${REPO_ROOT}/packages/core/node_modules/.bin/prisma" ]]; then
    prisma_bin="${REPO_ROOT}/packages/core/node_modules/.bin/prisma"
  elif [[ -x "${REPO_ROOT}/node_modules/.bin/prisma" ]]; then
    prisma_bin="${REPO_ROOT}/node_modules/.bin/prisma"
  fi

  log "prisma migrate deploy"
  if [[ -n "$prisma_bin" ]]; then
    ( cd "${REPO_ROOT}/packages/core" && DATABASE_URL="$DB_URL" "$prisma_bin" migrate deploy ) \
      >>"${LOG_DIR}/prisma.log" 2>&1 || die "prisma migrate deploy failed — see ${LOG_DIR}/prisma.log"
  else
    ( cd "${REPO_ROOT}/packages/core" && DATABASE_URL="$DB_URL" bunx prisma migrate deploy ) \
      >>"${LOG_DIR}/prisma.log" 2>&1 || die "prisma migrate deploy failed — see ${LOG_DIR}/prisma.log"
  fi
}

start_ollama() {
  refuse_if_foreign_listener "$OLLAMA_PORT" ollama
  if [[ -n "$(listener_pid "$OLLAMA_PORT")" ]]; then log "ollama already up"; return 0; fi

  env OLLAMA_HOST="127.0.0.1:${OLLAMA_PORT}" OLLAMA_MODELS="${HOME}/.ollama/models" \
    "$OLLAMA_BIN" serve >"${LOG_DIR}/ollama.log" 2>&1 &
  state_set ollama_pid "$!"
  wait_for "ollama :${OLLAMA_PORT}" 60 ollama_healthy
}

# The embedding provider must be PROVEN to answer at the pinned width before the
# API boots, and the reason is a measured silent-degradation path rather than
# caution.
#
# Observed on this stack while the llm-on profile had all three models resident
# (qwen3-embedding:4b + qwen2.5:7b-instruct + qwen2.5-coder:7b, 13.8 GB on a
# 24 GB box): Ollama answered `500 Internal Server Error` to embedQuery three
# times, the API's provider auto-selection fell back to
# `transformers / Xenova/all-MiniLM-L6-v2` at 384 dimensions, and the vector
# store bound `vector_documents_384d` — which is EMPTY. Every project then reads
# as unindexed. The API's own log names it exactly: "Orphaned chunks detected:
# vector_documents_2560d has data for projects not in vector_documents_384d.
# Embedding model likely changed from 2560d → 384d."
#
# Nothing about that is loud. `/health` stays ok, `status` stays green, and the
# suite reports PROJECT_NOT_INDEXED as if it were product behaviour — three
# scenarios in 30.llm-features.test.ts were misread as product defects before
# this was traced. EMBEDDING_PROVIDER=ollama is already pinned in
# common_service_env and did not prevent the fallback.
#
# The probe both warms the model and fails closed on the wrong width, so a boot
# that would have degraded silently now refuses loudly instead.
embedding_width_ok() {
  local got
  got="$(curl -fsS -m 120 "${OLLAMA_ORIGIN}/api/embeddings" \
    -H 'content-type: application/json' \
    -d "{\"model\":\"${EMBED_MODEL}\",\"prompt\":\"e2e-stack embedding width probe\"}" \
    | "$BUN_BIN" -e 'const j=await Bun.stdin.json();process.stdout.write(String((j.embedding||[]).length));' 2>/dev/null)" || return 1
  [[ "$got" == "$EMBED_DIMS" ]]
}

assert_embedding_width() {
  wait_for "${EMBED_MODEL} to answer at ${EMBED_DIMS}d on :${OLLAMA_PORT}" 300 embedding_width_ok
  log "embedding width verified: ${EMBED_MODEL} → ${EMBED_DIMS}d"
}

start_api() {
  local profile="$1"; shift
  refuse_if_foreign_listener "$API_PORT" api
  # An "already up" early return that ignores the requested profile is the worst
  # failure this script can have, because it is silent and it inverts the whole
  # point of Tier A being a profile matrix. Measured: with the stack on
  # `default`, `up --profile scheduler-on` exited 0 and printed
  # "e2e-stack up (profile: scheduler-on)" while `status` still read
  # `profile default` and /api/v1/scheduler/status still reported
  # `running:false`. Every profile-gated suite then skips itself with a
  # reasoned line naming the profile it wanted — so a five-profile matrix
  # reports green having executed one profile five times.
  #
  # The early return is kept for the case it exists for (a repeated `up` under
  # the same profile must not restart the server), and only for that case.
  # Per-invocation overrides always force a restart: they cannot be applied to
  # a process that is already running.
  if [[ -n "$(listener_pid "$API_PORT")" ]]; then
    local running_profile; running_profile="$(state_get profile)"
    if [[ "$running_profile" == "$profile" && $# -eq 0 ]]; then
      log "api already up (profile: ${profile})"
      return 0
    fi
    log "api is up under profile '${running_profile:-unknown}'; restarting into '${profile}'"
    stop_one api "$API_PORT"
  fi

  local -a env_args=()
  local line
  while IFS= read -r line; do [[ -n "$line" ]] && env_args+=("$line"); done < <(common_service_env)
  while IFS= read -r line; do [[ -n "$line" ]] && env_args+=("$line"); done < <(profile_env "$profile")
  # Explicit per-invocation overrides win over the profile's own values.
  for line in "$@"; do env_args+=("$line"); done

  # `exec` matters: without it `$!` is the subshell's PID, not the server's, and
  # every later ownership check compares the recorded PID against the real
  # listener and refuses to act. Observed once as
  # "port 3334 moved from owned PID 65066 to PID 65068".
  ( cd "${REPO_ROOT}/apps/tools-api" && exec env "${env_args[@]}" "$BUN_BIN" src/index.ts ) \
    >"${LOG_DIR}/api.log" 2>&1 &
  state_set api_pid "$!"
  state_set profile "$profile"
  wait_for "tools-api :${API_PORT}" 90 api_healthy
  capture_api_key
  assert_isolation
}

# Auth is mandatory (AD-011): there is no supported way to run the API open, so
# a profile that sets no key does not get an unauthenticated API — it gets one
# that provisioned a key into the scratch config on first boot. Read it back so
# `env` can export a key that actually works; without this every httpGet in the
# suite 401s under every profile.
capture_api_key() {
  local config_file="${CONFIG_HOME}/massa-ai/config.json" runtime key
  [[ -f "$config_file" ]] || return 0
  runtime="$(command -v bun || command -v node || true)"
  [[ -n "$runtime" ]] || return 0
  # The path travels in the environment, not in argv: `bun -e` and `node -e`
  # disagree about where the first user argument lands (measured — under bun,
  # `bun -e '…' -- file` yields argv = ["bun", "file"], so process.argv[2] is
  # undefined), and this script must work under either runtime.
  key="$(MASSA_AI_CONFIG_FILE="$config_file" "$runtime" -e '
    const fs = require("node:fs");
    try {
      const parsed = JSON.parse(fs.readFileSync(process.env.MASSA_AI_CONFIG_FILE, "utf8"));
      process.stdout.write(parsed?.security?.apiKey ?? "");
    } catch { process.stdout.write(""); }
  ')"
  [[ -n "$key" ]] && state_set api_key "$key"
}

# The whole battery is worthless if the dedicated API is quietly talking to the
# developer's own Postgres or Ollama. Assert it, do not assume it: the config
# layer merges file and environment, and `config-loader.ts:301` assigns
# OLLAMA_BASE_URL *from the file*, so a stale scratch config can point a
# "dedicated" API at :11434 while every other signal still looks right.
assert_isolation() {
  local key; key="$(state_get api_key)"
  local ollama_view info_view
  ollama_view="$(curl -fsS -m 5 -H "x-api-key: ${key}" "${API_ORIGIN}/api/v1/system/ollama" || true)"
  info_view="$(curl -fsS -m 5 -H "x-api-key: ${key}" "${API_ORIGIN}/api/v1/system/info" || true)"

  [[ "$ollama_view" == *"127.0.0.1:${OLLAMA_PORT}"* ]] || die \
    "isolation check failed: the dedicated API is not pointed at Ollama :${OLLAMA_PORT}
  /api/v1/system/ollama said: ${ollama_view:0:200}"
  [[ "$info_view" == *"\"port\":${PG_PORT}"* && "$info_view" == *"massa_ai_test"* ]] || die \
    "isolation check failed: the dedicated API is not pointed at massa_ai_test on :${PG_PORT}
  /api/v1/system/info said: ${info_view:0:200}"
  log "isolation verified: ollama :${OLLAMA_PORT}, postgres :${PG_PORT}/massa_ai_test"
}

# ── service stop ────────────────────────────────────────────────────────────
stop_one() {
  local name="$1" port="$2" pid
  pid="$(state_get "${name}_pid")"
  [[ -z "$pid" ]] && return 0

  local listener; listener="$(listener_pid "$port")"
  if [[ -n "$listener" && "$listener" != "$pid" ]]; then
    die "refusing to stop ${name}: port ${port} moved from owned PID ${pid} to PID ${listener}"
  fi

  if [[ "$name" == "postgres" ]]; then
    "$PG_CTL_BIN" -D "$PG_DATA" stop -m fast -w >>"${LOG_DIR}/postgres.log" 2>&1 || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi

  local deadline=$(( $(date +%s) + 20 ))
  while (( $(date +%s) < deadline )); do
    [[ -z "$(listener_pid "$port")" ]] && break
    sleep 1
  done
  [[ -z "$(listener_pid "$port")" ]] || die "${name} still holds port ${port} after SIGTERM"
  state_set "${name}_pid" ""
  log "${name} stopped (was PID ${pid})"
}

# ── commands ────────────────────────────────────────────────────────────────
cmd_up() {
  local profile="default"
  while (( $# )); do
    case "$1" in
      --profile) profile="${2:-}"; shift 2 ;;
      *) die "unknown flag for up: $1" 2 ;;
    esac
  done
  profile_is_known "$profile" || die "unknown profile: ${profile}" 2

  require_bins
  mkdir -p "$STATE_DIR" "$FAKE_HOME" "$CONFIG_HOME" "$LOG_DIR"

  [[ -d "${FIXTURE_PATH}/.git" ]] || die \
    "fixture is missing or is not a git repository: ${FIXTURE_PATH}
  Build it first:  bun scripts/prepare-e2e-fixture.ts --out ${FIXTURE_PATH}"

  log "shared stack before: $(assert_shared_untouched | tr '\n' ' ')"
  write_config_json
  start_postgres
  start_ollama
  assert_embedding_width
  start_api "$profile"
  log "shared stack after:  $(assert_shared_untouched | tr '\n' ' ')"

  printf 'e2e-stack up (profile: %s)\n' "$profile"
  cmd_status

  # A stack that reports "up" while a service is unhealthy is worse than one
  # that refuses: the suite then fails deep inside a test for a reason that
  # reads like a product bug.
  local unhealthy=()
  pg_healthy || unhealthy+=("postgres")
  ollama_healthy || unhealthy+=("ollama")
  api_healthy || unhealthy+=("api")
  (( ${#unhealthy[@]} == 0 )) || die "stack came up unhealthy: ${unhealthy[*]} — see ${LOG_DIR}/"
}

cmd_status() {
  require_bins
  local name port pid
  printf '%-10s %-8s %-10s %s\n' SERVICE PORT PID HEALTH
  for entry in "postgres ${PG_PORT}" "ollama ${OLLAMA_PORT}" "api ${API_PORT}"; do
    read -r name port <<<"$entry"
    pid="$(listener_pid "$port")"
    local health="down"
    case "$name" in
      postgres) pg_healthy && health="ok" ;;
      ollama)   ollama_healthy && health="ok" ;;
      api)      api_healthy && health="ok" ;;
    esac
    printf '%-10s %-8s %-10s %s\n' "$name" "$port" "${pid:-–}" "$health"
  done
  printf 'profile    %s\n' "$(state_get profile)"
  printf 'fixture    %s\n' "$FIXTURE_PATH"
}

cmd_restart_api() {
  local profile; profile="$(state_get profile)"
  local -a overrides=()
  while (( $# )); do
    case "$1" in
      --profile) profile="${2:-}"; shift 2 ;;
      --env) overrides+=("${2:-}"); shift 2 ;;
      *) die "unknown flag for restart-api: $1" 2 ;;
    esac
  done
  [[ -n "$profile" ]] || profile="default"
  profile_is_known "$profile" || die "unknown profile: ${profile}" 2

  require_bins
  stop_one api "$API_PORT"
  start_api "$profile" "${overrides[@]+"${overrides[@]}"}"
  printf 'tools-api restarted (profile: %s)\n' "$profile"
}

cmd_env() {
  # All four pins together. A subset makes assertSafeE2eEnvironment throw.
  local key; key="$(state_get api_key)"
  local profile; profile="$(state_get profile)"
  cat <<EOF
export RUN_E2E=1
export MASSA_AI_DEDICATED=1
export MASSA_AI_E2E_PROJECT_PATH=${FIXTURE_PATH}
export MASSA_AI_API_URL=${API_ORIGIN}
export DATABASE_URL=${DB_URL}
export POSTGRES_VECTOR_URL=${DB_URL}
export VECTOR_STORE_TYPE=postgres
export XDG_CONFIG_HOME=${CONFIG_HOME}
export OLLAMA_BASE_URL=${OLLAMA_ORIGIN}
export EMBEDDING_PROVIDER=ollama
export OLLAMA_EMBEDDING_MODEL=${EMBED_MODEL}
export OLLAMA_EMBEDDING_DIMENSIONS=${EMBED_DIMS}
EOF
  # Always export a key. Auth is mandatory under AD-011, so even the "default"
  # profile runs authenticated — against a key the API provisioned into the
  # scratch config on first boot. Exporting an empty value here would 401 every
  # request in the suite while every service reported healthy.
  if [[ -n "$key" ]]; then
    printf 'export MASSA_AI_API_KEY=%s\n' "$key"
  else
    printf 'export MASSA_AI_API_KEY=\n'
    printf '# warning: no API key recorded yet — run `e2e-stack.sh up` first\n'
  fi
  [[ -n "$profile" ]] && printf '# profile: %s\n' "$profile"
}

cmd_down() {
  require_bins
  log "shared stack before: $(assert_shared_untouched | tr '\n' ' ')"
  stop_one api "$API_PORT"
  stop_one ollama "$OLLAMA_PORT"
  stop_one postgres "$PG_PORT"
  log "shared stack after:  $(assert_shared_untouched | tr '\n' ' ')"
  printf 'e2e-stack down\n'
}

main() {
  local command="${1:-}"
  [[ -n "$command" ]] || die "usage: e2e-stack.sh up|status|restart-api|env|down" 2
  shift
  case "$command" in
    up) cmd_up "$@" ;;
    status) cmd_status "$@" ;;
    restart-api) cmd_restart_api "$@" ;;
    env) cmd_env "$@" ;;
    down) cmd_down "$@" ;;
    *) die "unknown command: ${command}" 2 ;;
  esac
}

main "$@"
