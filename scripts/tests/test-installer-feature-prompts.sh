#!/usr/bin/env bash
# ============================================================
#  massa-ai — installer feature prompt contract
#
#  Runs the real prompt library against real temp config files. A grep over
#  install.sh cannot observe whether a re-run actually re-asks, whether Enter
#  keeps the stored answer, or whether a nested installer stage inherits the
#  answers instead of asking twice — and every one of those was wrong before.
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

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "${TMP_ROOT}"' EXIT

# Each scenario runs in its own bash so a global set by one cannot leak into
# the next — the toggles are globals by design, which makes cross-test bleed
# the obvious failure mode.
run_scenario() {
  local script="$1"
  shift
  env -i \
    PATH="$PATH" HOME="$TMP_ROOT" \
    NO_START="${NO_START:-0}" \
    MASSA_AI_NONINTERACTIVE="${MASSA_AI_NONINTERACTIVE:-0}" \
    MASSA_AI_FEATURES_PROMPTED="${MASSA_AI_FEATURES_PROMPTED:-0}" \
    "$@" \
    bash -c "
      . '${LIB_DIR}/installer-shared.sh'
      . '${LIB_DIR}/installer-feature-prompts.sh'
      ${script}
    " 2>/dev/null | tail -1
}

echo "installer feature prompts"

# ── Built-in defaults ────────────────────────────────────────
out="$(run_scenario 'installer_feature_defaults_builtin; echo "${LLM_ENABLED}|${SCHEDULER_ENABLED}|${SEARCH_QU_ENABLED}|${CAPTURE_POLICY_ENABLED}"')"
check_eq "built-in defaults match the config template's literals" "true|true|false|true" "$out"

# ── Prefill from an existing config.json ─────────────────────
CFG="${TMP_ROOT}/prefill.json"
cat > "$CFG" <<'JSON'
{
  "llm": { "enabled": false },
  "search": { "queryUnderstanding": { "enabled": true }, "rerank": { "enabled": true } },
  "synapse": { "enabled": false },
  "hooks": { "enabled": false, "bridge": { "enabled": false } },
  "handoffs": { "enabled": false },
  "impact": { "bfsCteEnabled": true },
  "scheduler": { "enabled": false, "jobs": { "auto-improve": { "enabled": true } } }
}
JSON

out="$(run_scenario "installer_feature_defaults '${CFG}'; echo \"\${LLM_ENABLED}|\${SEARCH_QU_ENABLED}|\${SYNAPSE_ENABLED}|\${HOOKS_ENABLED}|\${HANDOFFS_ENABLED}|\${IMPACT_BFS_CTE_ENABLED}|\${SCHEDULER_ENABLED}|\${SCHEDULER_AUTO_IMPROVE_ENABLED}\"")"
check_eq "every stored answer is read back" "false|true|false|false|false|true|false|true" "$out"

# A key the file does not carry must keep its built-in value, not become "".
out="$(run_scenario "installer_feature_defaults '${CFG}'; echo \"\${MEMORY_BOOTSTRAP_ENABLED}|\${SCHEDULER_DECAY_ENABLED}\"")"
check_eq "an absent key keeps the built-in default" "true|true" "$out"

# ── Missing / corrupt config.json ────────────────────────────
out="$(run_scenario "installer_feature_defaults '${TMP_ROOT}/absent.json'; echo \"\${LLM_ENABLED}|\${SCHEDULER_ENABLED}\"")"
check_eq "an absent config.json falls back to defaults" "true|true" "$out"

echo 'not json at all {{{' > "${TMP_ROOT}/broken.json"
out="$(run_scenario "installer_feature_defaults '${TMP_ROOT}/broken.json'; echo \"\${LLM_ENABLED}|\${SCHEDULER_ENABLED}\"")"
check_eq "a corrupt config.json falls back to defaults rather than failing" "true|true" "$out"

# A config.json cannot smuggle shell into the installer through a value.
cat > "${TMP_ROOT}/hostile.json" <<'JSON'
{ "llm": { "enabled": "true; touch /tmp/massa-ai-prompt-pwned" } }
JSON
rm -f /tmp/massa-ai-prompt-pwned
out="$(run_scenario "installer_feature_defaults '${TMP_ROOT}/hostile.json'; echo \"\${LLM_ENABLED}\"")"
check_eq "a non-boolean value is ignored, not evaluated" "true" "$out"
if [ -e /tmp/massa-ai-prompt-pwned ]; then
  fail "a config.json value reached the shell"
  rm -f /tmp/massa-ai-prompt-pwned
else
  ok "a config.json value never reaches the shell"
fi

# ── Non-interactive installs never block ─────────────────────
out="$(NO_START=1 run_scenario "installer_feature_defaults '${CFG}'; installer_prompt_features true; echo \"\${LLM_ENABLED}|\${SEARCH_QU_ENABLED}\"")"
check_eq "NO_START=1 keeps the stored answers and asks nothing" "false|true" "$out"

out="$(MASSA_AI_NONINTERACTIVE=1 run_scenario "installer_feature_defaults '${CFG}'; installer_prompt_features true; echo \"\${SYNAPSE_ENABLED}\"")"
check_eq "MASSA_AI_NONINTERACTIVE=1 keeps the stored answers" "false" "$out"

# ── LLM gating ───────────────────────────────────────────────
# Offering an LLM toggle for a model that is not pulled produces a config that
# reads as enabled and silently degrades on every call.
out="$(NO_START=0 MASSA_AI_NONINTERACTIVE=1 run_scenario "installer_feature_defaults_builtin; installer_prompt_features false; echo \"\${LLM_ENABLED}|\${SEARCH_QU_ENABLED}|\${SEARCH_RERANK_ENABLED}\"")"
check_eq "no LLM model reachable leaves the LLM toggles off (non-interactive)" "true|false|false" "$out"

# ── Ask-once-per-install ─────────────────────────────────────
out="$(MASSA_AI_FEATURES_PROMPTED=1 run_scenario "installer_feature_defaults_builtin; SYNAPSE_ENABLED=false; installer_feature_flow '${CFG}' true >/dev/null; echo \"\${SYNAPSE_ENABLED}\"")"
check_eq "an already-prompted install keeps the inherited answer" "false" "$out"

out="$(MASSA_AI_NONINTERACTIVE=1 run_scenario "installer_feature_flow '${CFG}' true >/dev/null; echo \"\${MASSA_AI_FEATURES_PROMPTED}|\${LLM_ENABLED}\"")"
check_eq "the flow marks the prompt done and exports the answers" "1|false" "$out"

# ── Interactive answers, on a real terminal ──────────────────
# `installer_ask` reads from /dev/tty, so a pipe proves nothing about it —
# every assertion above exercises only the paths that skip the prompt. `script`
# allocates a pty; its flags differ between BSD and GNU, and a box with neither
# form skips rather than reporting a pass it did not measure.
pty_run() {
  local input_script="$1" probe="$2"
  if script -q /dev/null true >/dev/null 2>&1; then
    eval "$input_script" | script -q /dev/null bash "$probe" 2>/dev/null
  elif script -qec true /dev/null >/dev/null 2>&1; then
    eval "$input_script" | script -qec "bash ${probe}" /dev/null 2>/dev/null
  else
    return 1
  fi
}

PROBE="${TMP_ROOT}/ask-probe.sh"
cat > "$PROBE" <<PROBEEOF
set -u
. '${LIB_DIR}/installer-shared.sh'
. '${LIB_DIR}/installer-feature-prompts.sh'
installer_feature_defaults_builtin
SYNAPSE_ENABLED=false
HOOKS_ENABLED=true
installer_ask SYNAPSE_ENABLED "Synapse?"
installer_ask HOOKS_ENABLED "Hooks?"
echo "RESULT:\${SYNAPSE_ENABLED}|\${HOOKS_ENABLED}"
PROBEEOF

# The sleeps are not padding: without a settling delay the pty drops the first
# line and every answer lands one question late, which reads exactly like the
# library ignoring input.
TYPE_YN="sleep 1; printf 'y\n'; sleep 0.4; printf 'n\n'; sleep 0.4"
TYPE_ENTER="sleep 1; printf '\n'; sleep 0.4; printf '\n'; sleep 0.4"

if out="$(pty_run "$TYPE_YN" "$PROBE" | tr -d '\r' | grep -o 'RESULT:.*')"; then
  check_eq "typed answers take, in both directions" "RESULT:true|false" "$out"

  out="$(pty_run "$TYPE_ENTER" "$PROBE" | tr -d '\r' | grep -o 'RESULT:.*')"
  check_eq "Enter keeps the current value" "RESULT:false|true" "$out"
else
  echo "  skip - no usable script(1) for a pty; interactive answers unmeasured"
fi

# ── The re-install regression itself ─────────────────────────
# setup-local-first.sh used to gate the whole prompt on `.env` not existing,
# so a second install could never re-ask. Nothing about a pre-existing .env
# may reach the prompt decision now.
# The exact shape that suppressed it: a conditional branching on the flag
# being false. Its only surviving use is the "backed up your .env" message,
# which tests for `= true`. Comment lines are stripped so the note recording
# the removal does not read as the thing itself.
if sed 's/#.*//' "${REPO_ROOT}/scripts/setup-local-first.sh" \
   | grep -qE '\[[[:space:]]*"\$ENV_FILE_EXISTED"[[:space:]]*=[[:space:]]*false'; then
  fail "the feature prompt is gated on .env existing again"
else
  ok "no conditional branches on .env being absent"
fi

# Ordering: the prompt must run before .env is even inspected, or a future
# edit can reintroduce the coupling without restoring the conditional.
flow_line="$(grep -n 'installer_feature_flow' "${REPO_ROOT}/scripts/setup-local-first.sh" | grep -v '^[0-9]*:#' | head -1 | cut -d: -f1)"
env_line="$(grep -n '^ENV_FILE_EXISTED=false' "${REPO_ROOT}/scripts/setup-local-first.sh" | head -1 | cut -d: -f1)"
if [ -n "$flow_line" ] && [ -n "$env_line" ] && [ "$flow_line" -lt "$env_line" ]; then
  ok "the feature prompt runs before .env is inspected"
else
  fail "the feature prompt runs before .env is inspected (flow=${flow_line:-none}, env=${env_line:-none})"
fi

if grep -q 'installer_feature_flow' "${REPO_ROOT}/scripts/setup-local-first.sh"; then
  ok "setup-local-first.sh runs the shared feature flow"
else
  fail "setup-local-first.sh runs the shared feature flow"
fi

if grep -q 'installer_feature_flow' "${REPO_ROOT}/install.sh"; then
  ok "install.sh runs the shared feature flow"
else
  fail "install.sh runs the shared feature flow"
fi

# The duplicated prompt block is what drifted; neither installer may grow its
# own copy back.
for f in "${REPO_ROOT}/install.sh" "${REPO_ROOT}/scripts/setup-local-first.sh"; do
  if grep -q 'Enable query understanding?' "$f"; then
    fail "$(basename "$f") carries its own copy of a prompt"
  else
    ok "$(basename "$f") has no inline prompt copy"
  fi
done

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
