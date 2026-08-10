#!/usr/bin/env bash
# ============================================================
#  massa-ai — feature toggle prompts for the installers
#  Source this file; do not run it directly.
#
#  Usage:
#    source "$(dirname "${BASH_SOURCE[0]}")/lib/installer-feature-prompts.sh"
#    installer_feature_defaults "$CONFIG_FILE"
#    installer_prompt_features "$llm_available"
#
#  Bash 3.2 compatible (macOS ships bash 3.2): no associative arrays,
#  no ${var^^}, no readarray. Function-only — no side effects at source time.
# ============================================================
#
#  Why this file exists.
#
#  The installers used to offer exactly two toggles — query understanding and
#  rerank — while `installer_write_config` hardcoded `true` for LLM, memory
#  bootstrap, auto-improve, auto-importance, hooks and the hook bridge, and
#  wrote no scheduler or capture policy at all. Nine of the Admin Portal's
#  Config sections were therefore decided for the user and never shown.
#
#  Worse, setup-local-first.sh wrapped its prompt in `if [ "$ENV_FILE_EXISTED"
#  = false ]`, so re-running the installer skipped every question. There was no
#  supported way to change an answer from the installer once .env existed.
#
#  So: every answer is prefilled from the config.json already on disk and
#  pressing Enter keeps it. Re-running is a safe no-op that also lets you
#  change your mind — the two properties the old first-run-only gate traded
#  against each other.
#
#  Both installers source this one copy. The previous arrangement had the same
#  prompt text pasted into install.sh and setup-local-first.sh, which had
#  already drifted apart in their tty redirection.
# ============================================================

# ── Toggle defaults ──────────────────────────────────────────
# Each default matches the literal `installer_write_config` falls back to, so
# sourcing this file and prompting nothing writes today's config.json.
installer_feature_defaults_builtin() {
  LLM_ENABLED=true
  SEARCH_QU_ENABLED=false
  SEARCH_RERANK_ENABLED=false
  IMPACT_BFS_CTE_ENABLED=false
  SYNAPSE_ENABLED=true
  MEMORY_BOOTSTRAP_ENABLED=true
  MEMORY_AUTO_IMPROVE_ENABLED=true
  MEMORY_AUTO_IMPORTANCE_ENABLED=true
  HOOKS_ENABLED=true
  HOOKS_BRIDGE_ENABLED=true
  HANDOFFS_ENABLED=true
  SCHEDULER_ENABLED=true
  SCHEDULER_CONSOLIDATION_ENABLED=true
  SCHEDULER_DECAY_ENABLED=true
  SCHEDULER_AUTO_IMPROVE_ENABLED=false
  SCHEDULER_OBSERVATION_BRIDGE_ENABLED=false
  SCHEDULER_CHECKPOINT_PURGE_ENABLED=false
  CAPTURE_POLICY_ENABLED=true
}

# installer_feature_defaults <config_file>
#
# Seeds every toggle global: built-in defaults first, then whatever the given
# config.json already stores. A key the file does not carry keeps its built-in
# value, so an upgrade never silently flips a feature the user chose.
#
# Reading is delegated to node/bun because bash cannot parse JSON safely. When
# neither is on PATH the built-in defaults stand — a missing runtime must not
# fail an install, it just means nothing to prefill from.
installer_feature_defaults() {
  local config_file="$1"
  installer_feature_defaults_builtin

  [ -f "$config_file" ] || return 0

  local runner
  runner="$(installer_detect_runner)" || return 0

  local stored
  stored="$("$runner" -e '
    const fs = require("fs");
    let c;
    try { c = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { process.exit(0); }
    const jobs = (c.scheduler && c.scheduler.jobs) || {};
    // Only emit an assignment for a key the file actually carries: an absent
    // key must fall through to the built-in default, and `undefined` printed
    // into a shell assignment would read as the empty string instead.
    const out = [];
    const put = (name, value) => {
      if (typeof value === "boolean") out.push(name + "=" + String(value));
    };
    put("LLM_ENABLED", c.llm && c.llm.enabled);
    put("SEARCH_QU_ENABLED", c.search && c.search.queryUnderstanding && c.search.queryUnderstanding.enabled);
    put("SEARCH_RERANK_ENABLED", c.search && c.search.rerank && c.search.rerank.enabled);
    put("IMPACT_BFS_CTE_ENABLED", c.impact && c.impact.bfsCteEnabled);
    put("SYNAPSE_ENABLED", c.synapse && c.synapse.enabled);
    put("MEMORY_BOOTSTRAP_ENABLED", c.memory && c.memory.bootstrap && c.memory.bootstrap.enabled);
    put("MEMORY_AUTO_IMPROVE_ENABLED", c.memory && c.memory.autoImprove && c.memory.autoImprove.enabled);
    put("MEMORY_AUTO_IMPORTANCE_ENABLED", c.memory && c.memory.autoImportance && c.memory.autoImportance.enabled);
    put("HOOKS_ENABLED", c.hooks && c.hooks.enabled);
    put("HOOKS_BRIDGE_ENABLED", c.hooks && c.hooks.bridge && c.hooks.bridge.enabled);
    put("HANDOFFS_ENABLED", c.handoffs && c.handoffs.enabled);
    put("SCHEDULER_ENABLED", c.scheduler && c.scheduler.enabled);
    put("SCHEDULER_CONSOLIDATION_ENABLED", jobs["memory-consolidation"] && jobs["memory-consolidation"].enabled);
    put("SCHEDULER_DECAY_ENABLED", jobs["decay-sweep"] && jobs["decay-sweep"].enabled);
    put("SCHEDULER_AUTO_IMPROVE_ENABLED", jobs["auto-improve"] && jobs["auto-improve"].enabled);
    put("SCHEDULER_OBSERVATION_BRIDGE_ENABLED", jobs["observation-bridge"] && jobs["observation-bridge"].enabled);
    put("SCHEDULER_CHECKPOINT_PURGE_ENABLED", jobs["checkpoint-purge"] && jobs["checkpoint-purge"].enabled);
    if (c.capturePolicy) out.push("CAPTURE_POLICY_ENABLED=true");
    process.stdout.write(out.join("\n"));
  ' "$config_file" 2>/dev/null)" || return 0

  # Every emitted line is `NAME=true|false` produced by the reader above, not
  # by the config file — a hostile config.json cannot inject a command here.
  local line
  while IFS= read -r line; do
    case "$line" in
      *_ENABLED=true) eval "${line}" ;;
      *_ENABLED=false) eval "${line}" ;;
    esac
  done <<< "$stored"
}

# ── Prompting ────────────────────────────────────────────────

# installer_can_prompt
# True only for a genuinely interactive install. NO_START=1 is the installers'
# own non-interactive flag; /dev/tty is the real test, because install runs
# under `curl | bash` where stdin is the pipe and reading it would consume the
# script itself.
installer_can_prompt() {
  [ "${NO_START:-0}" = "1" ] && return 1
  [ "${MASSA_AI_NONINTERACTIVE:-0}" = "1" ] && return 1
  [ -e /dev/tty ] || return 1
  return 0
}

# installer_ask <var-name> <question>
# Asks a yes/no question defaulted to the variable's CURRENT value, and writes
# the answer back to it. Enter keeps what is already there, which is what makes
# re-running the installer safe.
installer_ask() {
  local var="$1" question="$2"
  local current hint reply
  eval "current=\${$var}"

  if [ "$current" = "true" ]; then hint="[Y/n]"; else hint="[y/N]"; fi

  reply=""
  read -r -p "  ${question} ${hint}: " reply <>/dev/tty || reply=""

  case "$reply" in
    y|Y|yes|YES) eval "$var=true" ;;
    n|N|no|NO) eval "$var=false" ;;
    *) : ;;  # Enter, or anything unrecognized — keep the current value.
  esac
}

# installer_prompt_features <llm_available>
#
# Walks every Config-tab feature section. <llm_available> is "true" when an LLM
# model is actually pulled — the LLM-gated toggles are skipped otherwise rather
# than offering a feature that cannot run.
#
# Sets the same globals `installer_write_config` reads. Call
# `installer_feature_defaults` first so the prompts start from what is stored.
installer_prompt_features() {
  local llm_available="${1:-false}"

  if ! installer_can_prompt; then
    echo "  Non-interactive install — keeping the current feature configuration."
    return 0
  fi

  echo ""
  echo "Feature configuration — Enter keeps the value shown in brackets."
  echo ""

  echo "  Impact Analysis"
  echo "    A graph CTE that ranks what a diff touches. Off by default: it is a"
  echo "    recursive query whose cost grows with the symbol graph."
  installer_ask IMPACT_BFS_CTE_ENABLED "Enable impact-analysis BFS CTE?"
  echo ""

  echo "  Synapse"
  echo "    Retrieval modulation — diversity penalties, temporal inhibition, a"
  echo "    confidence gate and the prefetch buffer. Local computation, no LLM."
  installer_ask SYNAPSE_ENABLED "Enable Synapse?"
  echo ""

  echo "  Memory"
  echo "    Bootstrap seeds a new project from its git history. Auto-improve"
  echo "    rewrites memories from observed usage. Auto-importance scores new"
  echo "    memories as they are written."
  installer_ask MEMORY_BOOTSTRAP_ENABLED "Enable memory bootstrap?"
  installer_ask MEMORY_AUTO_IMPROVE_ENABLED "Enable memory auto-improve?"
  installer_ask MEMORY_AUTO_IMPORTANCE_ENABLED "Enable memory auto-importance?"
  echo ""

  echo "  Hooks"
  echo "    Ingests host events (tool calls, edits) so retrieval learns from"
  echo "    what you actually do. The bridge turns those observations into"
  echo "    memory candidates."
  installer_ask HOOKS_ENABLED "Enable hooks?"
  installer_ask HOOKS_BRIDGE_ENABLED "Enable the hook observation bridge?"
  echo ""

  echo "  Handoffs"
  echo "    Cross-session handoff packages. No LLM dependency."
  installer_ask HANDOFFS_ENABLED "Enable handoffs?"
  echo ""

  echo "  Scheduler"
  echo "    Background jobs. The safe preset runs memory consolidation every"
  echo "    30 minutes and a decay sweep hourly; auto-improve,"
  echo "    observation-bridge and checkpoint-purge stay off unless asked for."
  installer_ask SCHEDULER_ENABLED "Enable the background scheduler?"
  if [ "$SCHEDULER_ENABLED" = "true" ]; then
    installer_ask SCHEDULER_CONSOLIDATION_ENABLED "  Run memory consolidation (30 min)?"
    installer_ask SCHEDULER_DECAY_ENABLED "  Run the decay sweep (hourly)?"
    installer_ask SCHEDULER_AUTO_IMPROVE_ENABLED "  Run auto-improve (30 min)?"
    installer_ask SCHEDULER_OBSERVATION_BRIDGE_ENABLED "  Run the observation bridge (30 min)?"
    installer_ask SCHEDULER_CHECKPOINT_PURGE_ENABLED "  Run checkpoint purge (hourly, deletes old checkpoints)?"
  fi
  echo ""

  echo "  Capture Policy"
  echo "    The rules deciding which files reach the index. Writing them into"
  echo "    config.json makes them visible and editable in the Admin Portal;"
  echo "    declining leaves the same rules in force as a built-in default."
  installer_ask CAPTURE_POLICY_ENABLED "Write the default capture policy into config.json?"
  echo ""

  echo "  LLM"
  if [ "$llm_available" = "true" ]; then
    echo "    Powers compression, reranking, query understanding and memory"
    echo "    synthesis. Every LLM feature degrades to a rule-based path when off."
    installer_ask LLM_ENABLED "Enable LLM-backed features?"
    echo ""

    echo "  Search quality (LLM-backed, both add latency to every search)"
    echo "    Query understanding rewrites the query (+ HyDE) before retrieval:"
    echo "    +1-2 LLM calls per unique query, 2-10s on a local CPU, cached"
    echo "    5 min / 256 entries. A bad rewrite can reduce recall."
    installer_ask SEARCH_QU_ENABLED "Enable query understanding?"
    echo "    Rerank re-orders the top 50 results by LLM relevance after"
    echo "    retrieval: +1 LLM call per search, ~1-5s local, subjective"
    echo "    reorder of the same result set (tail preserved)."
    installer_ask SEARCH_RERANK_ENABLED "Enable rerank?"
  else
    # Offering a toggle for a model that is not pulled produces a config that
    # looks enabled and silently degrades on every call.
    LLM_ENABLED=false
    SEARCH_QU_ENABLED=false
    SEARCH_RERANK_ENABLED=false
    echo "    No LLM model reachable — LLM, query understanding and rerank left off."
  fi
  echo ""
}

## installer_export_features
# Exports every toggle so a nested installer stage inherits the answers.
# install.sh (source mode) runs setup-local-first.sh as a separate bash
# process; without this the wizard would ask the same nine questions again and
# write whichever answer came second.
installer_export_features() {
  export LLM_ENABLED SEARCH_QU_ENABLED SEARCH_RERANK_ENABLED \
    IMPACT_BFS_CTE_ENABLED SYNAPSE_ENABLED \
    MEMORY_BOOTSTRAP_ENABLED MEMORY_AUTO_IMPROVE_ENABLED MEMORY_AUTO_IMPORTANCE_ENABLED \
    HOOKS_ENABLED HOOKS_BRIDGE_ENABLED HANDOFFS_ENABLED \
    SCHEDULER_ENABLED SCHEDULER_CONSOLIDATION_ENABLED SCHEDULER_DECAY_ENABLED \
    SCHEDULER_AUTO_IMPROVE_ENABLED SCHEDULER_OBSERVATION_BRIDGE_ENABLED \
    SCHEDULER_CHECKPOINT_PURGE_ENABLED CAPTURE_POLICY_ENABLED
}

# installer_feature_flow <config_file> <llm_available>
#
# The entry point both installers call: seed from disk, ask once, export.
#
# The once-per-install guard is what replaces setup-local-first.sh's old
# `if [ "$ENV_FILE_EXISTED" = false ]`. That gate suppressed the prompt on
# every re-install — the property it was reaching for was "do not ask twice in
# one run", and it bought that by never asking again at all.
installer_feature_flow() {
  local config_file="$1"
  local llm_available="${2:-false}"

  if [ "${MASSA_AI_FEATURES_PROMPTED:-0}" = "1" ]; then
    echo "  Feature configuration already chosen earlier in this install — keeping it."
    return 0
  fi

  installer_feature_defaults "$config_file"
  installer_prompt_features "$llm_available"
  installer_export_features
  MASSA_AI_FEATURES_PROMPTED=1
  export MASSA_AI_FEATURES_PROMPTED
}

# installer_feature_summary
# One line per section, for the installer's closing report.
installer_feature_summary() {
  echo "    Impact analysis: ${IMPACT_BFS_CTE_ENABLED}"
  echo "    Synapse: ${SYNAPSE_ENABLED}"
  echo "    Memory: bootstrap ${MEMORY_BOOTSTRAP_ENABLED}, auto-improve ${MEMORY_AUTO_IMPROVE_ENABLED}, auto-importance ${MEMORY_AUTO_IMPORTANCE_ENABLED}"
  echo "    Hooks: ${HOOKS_ENABLED}, bridge ${HOOKS_BRIDGE_ENABLED}"
  echo "    Handoffs: ${HANDOFFS_ENABLED}"
  echo "    Scheduler: ${SCHEDULER_ENABLED} (consolidation ${SCHEDULER_CONSOLIDATION_ENABLED}, decay ${SCHEDULER_DECAY_ENABLED}, auto-improve ${SCHEDULER_AUTO_IMPROVE_ENABLED}, observation-bridge ${SCHEDULER_OBSERVATION_BRIDGE_ENABLED}, checkpoint-purge ${SCHEDULER_CHECKPOINT_PURGE_ENABLED})"
  echo "    Capture policy in config.json: ${CAPTURE_POLICY_ENABLED}"
  echo "    LLM: ${LLM_ENABLED}"
  echo "    Search: query understanding ${SEARCH_QU_ENABLED}, rerank ${SEARCH_RERANK_ENABLED}"
}
