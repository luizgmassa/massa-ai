import fs from "fs";
import { loadConfig, saveConfig, getConfigPath } from "./config-loader";
import type { MassaAiConfig } from "./massa-ai-config";

const MASK_SENTINEL = "***";
const RESTART_SECTIONS = ["database", "embedding", "llm", "security"];
const VALID_EMBEDDING_PROVIDERS = ["ollama", "mistral", "openai", "google", "cohere"];
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"];

export type SavePartialConfigResult =
  | { success: true; config: MassaAiConfig; restartNeededSections: string[] }
  | { success: false; details: string[] };

export function maskSensitive(config: MassaAiConfig): MassaAiConfig {
  const masked: MassaAiConfig = JSON.parse(JSON.stringify(config));
  if (masked.security?.apiKey) masked.security.apiKey = MASK_SENTINEL;
  if (masked.llm?.apiKey) masked.llm.apiKey = MASK_SENTINEL;
  if (masked.embedding?.apiKey) masked.embedding.apiKey = MASK_SENTINEL;
  if (masked.database?.url) masked.database.url = MASK_SENTINEL;
  return masked;
}

export function restartNeededSections(config: MassaAiConfig): string[] {
  return RESTART_SECTIONS.filter((s) => {
    if (s === "database") return config.database !== undefined;
    if (s === "embedding") return config.embedding !== undefined;
    if (s === "llm") return config.llm !== undefined;
    if (s === "security") return config.security !== undefined;
    return false;
  });
}

/**
 * Restore (or drop) a `"***"` mask-sentinel submission for each of the four sensitive
 * fields, regardless of whether the currently stored value is truthy (APCR-05). The prior
 * `&& current.X` truthy guard meant a field whose stored value was empty or absent left the
 * submitted literal `"***"` untouched, which then persisted to config.json as the real
 * secret (F7). Always restoring `current.X` — even when it is `""` or `undefined` — means
 * the mask sentinel can never survive into the saved config.
 */
function applyMaskedSentinel(
  partial: Partial<MassaAiConfig>,
  current: MassaAiConfig,
): Partial<MassaAiConfig> {
  const result: Partial<MassaAiConfig> = JSON.parse(JSON.stringify(partial));
  if (result.security?.apiKey === MASK_SENTINEL) {
    result.security.apiKey = current.security?.apiKey ?? "";
  }
  if (result.llm?.apiKey === MASK_SENTINEL) {
    result.llm.apiKey = current.llm?.apiKey ?? "";
  }
  if (result.embedding?.apiKey === MASK_SENTINEL) {
    result.embedding.apiKey = current.embedding?.apiKey ?? "";
  }
  if (result.database?.url === MASK_SENTINEL) {
    result.database.url = current.database?.url ?? "";
  }
  return result;
}

function checkNumber(val: unknown, min?: number, max?: number): boolean {
  if (typeof val !== "number" || !Number.isFinite(val)) return false;
  if (min !== undefined && val < min) return false;
  if (max !== undefined && val > max) return false;
  return true;
}

function checkBoolean(val: unknown): boolean {
  return typeof val === "boolean";
}

function checkString(val: unknown): boolean {
  return typeof val === "string";
}

function validatePartial(partial: Partial<MassaAiConfig>): string[] {
  const details: string[] = [];

  if (partial.database !== undefined) {
    if (!checkString(partial.database.url))
      details.push("database.url must be a string");
  }

  if (partial.embedding !== undefined) {
    const e = partial.embedding;
    if (!VALID_EMBEDDING_PROVIDERS.includes(e.provider))
      details.push(`embedding.provider must be one of: ${VALID_EMBEDDING_PROVIDERS.join(", ")}`);
    if (!checkString(e.model))
      details.push("embedding.model must be a string");
    if (e.baseURL !== undefined && !checkString(e.baseURL))
      details.push("embedding.baseURL must be a string");
    if (e.apiKey !== undefined && !checkString(e.apiKey))
      details.push("embedding.apiKey must be a string");
    if (e.dimensions !== undefined && !checkNumber(e.dimensions, 1))
      details.push("embedding.dimensions must be a positive number");
  }

  if (partial.compression !== undefined) {
    const c = partial.compression;
    if (!checkString(c.defaultStrategy))
      details.push("compression.defaultStrategy must be a string");
    if (!checkNumber(c.minTokensForCompression, 0))
      details.push("compression.minTokensForCompression must be a non-negative number");
    if (!checkNumber(c.targetCompressionRatio, 0, 1))
      details.push("compression.targetCompressionRatio must be a number between 0 and 1");
    if (c.prompt !== undefined && !checkString(c.prompt))
      details.push("compression.prompt must be a string");
  }

  if (partial.impact !== undefined) {
    if (!checkBoolean(partial.impact.bfsCteEnabled))
      details.push("impact.bfsCteEnabled must be a boolean");
  }

  if (partial.cache !== undefined) {
    const c = partial.cache;
    if (!checkBoolean(c.enabled))
      details.push("cache.enabled must be a boolean");
    if (!checkNumber(c.l1MaxSizeMB, 0))
      details.push("cache.l1MaxSizeMB must be a non-negative number");
    if (!checkNumber(c.l2MaxSizeMB, 0))
      details.push("cache.l2MaxSizeMB must be a non-negative number");
    if (!checkNumber(c.defaultTTLSeconds, 0))
      details.push("cache.defaultTTLSeconds must be a non-negative number");
  }

  if (partial.dataDir !== undefined) {
    if (!checkString(partial.dataDir))
      details.push("dataDir must be a string");
  }

  if (partial.logging !== undefined) {
    const l = partial.logging;
    if (!VALID_LOG_LEVELS.includes(l.level))
      details.push(`logging.level must be one of: ${VALID_LOG_LEVELS.join(", ")}`);
    if (!checkBoolean(l.enableMetrics))
      details.push("logging.enableMetrics must be a boolean");
    if (l.file !== undefined && !checkString(l.file))
      details.push("logging.file must be a string");
  }

  if (partial.search !== undefined) {
    const s = partial.search;
    if (!checkNumber(s.autoReindexMaxFiles, 0))
      details.push("search.autoReindexMaxFiles must be a non-negative number");
    const qu = s.queryUnderstanding;
    if (qu !== undefined) {
      if (!checkBoolean(qu.enabled))
        details.push("search.queryUnderstanding.enabled must be a boolean");
      if (!checkBoolean(qu.hydeEnabled))
        details.push("search.queryUnderstanding.hydeEnabled must be a boolean");
      if (!checkNumber(qu.cacheTtlMs, 0))
        details.push("search.queryUnderstanding.cacheTtlMs must be a non-negative number");
      if (!checkNumber(qu.cacheMaxSize, 0))
        details.push("search.queryUnderstanding.cacheMaxSize must be a non-negative number");
    }
    const rr = s.rerank;
    if (rr !== undefined) {
      if (!checkBoolean(rr.enabled))
        details.push("search.rerank.enabled must be a boolean");
      if (!checkNumber(rr.rerankWindow, 0))
        details.push("search.rerank.rerankWindow must be a non-negative number");
    }
  }

  if (partial.llm !== undefined) {
    const l = partial.llm;
    if (!checkBoolean(l.enabled))
      details.push("llm.enabled must be a boolean");
    if (!checkString(l.baseUrl))
      details.push("llm.baseUrl must be a string");
    if (!checkString(l.apiKey))
      details.push("llm.apiKey must be a string");
    if (!checkString(l.model))
      details.push("llm.model must be a string");
    if (!checkString(l.codeModel))
      details.push("llm.codeModel must be a string");
    if (!checkNumber(l.temperature))
      details.push("llm.temperature must be a number");
    if (!checkNumber(l.maxOutputTokens, 1))
      details.push("llm.maxOutputTokens must be a positive number");
    if (!checkNumber(l.timeoutMs, 1))
      details.push("llm.timeoutMs must be a positive number");
    if (!checkBoolean(l.disableThink))
      details.push("llm.disableThink must be a boolean");
  }

  if (partial.memory !== undefined) {
    const m = partial.memory;
    if (m.decay !== undefined) {
      const d = m.decay;
      if (!checkNumber(d.lambda))
        details.push("memory.decay.lambda must be a number");
      if (!checkNumber(d.sigma))
        details.push("memory.decay.sigma must be a number");
      if (!checkNumber(d.mu))
        details.push("memory.decay.mu must be a number");
      if (!checkNumber(d.coldThreshold))
        details.push("memory.decay.coldThreshold must be a number");
    }
    if (m.bootstrap !== undefined) {
      const b = m.bootstrap;
      if (!checkBoolean(b.enabled))
        details.push("memory.bootstrap.enabled must be a boolean");
      if (!checkNumber(b.maxSeedMemories, 0))
        details.push("memory.bootstrap.maxSeedMemories must be a non-negative number");
      if (!checkNumber(b.centralityLimit, 0))
        details.push("memory.bootstrap.centralityLimit must be a non-negative number");
      if (!checkNumber(b.gitLogLimit, 0))
        details.push("memory.bootstrap.gitLogLimit must be a non-negative number");
      if (!checkBoolean(b.refreshEnabled))
        details.push("memory.bootstrap.refreshEnabled must be a boolean");
    }
    if (m.autoImprove !== undefined) {
      const a = m.autoImprove;
      if (!checkBoolean(a.enabled))
        details.push("memory.autoImprove.enabled must be a boolean");
      if (!checkBoolean(a.reviewGate))
        details.push("memory.autoImprove.reviewGate must be a boolean");
      if (!checkNumber(a.minObservations, 0))
        details.push("memory.autoImprove.minObservations must be a non-negative number");
      if (!checkNumber(a.minIntervalMs, 0))
        details.push("memory.autoImprove.minIntervalMs must be a non-negative number");
      if (!checkNumber(a.maxWindow, 0))
        details.push("memory.autoImprove.maxWindow must be a non-negative number");
      if (!checkNumber(a.minQueryHits, 0))
        details.push("memory.autoImprove.minQueryHits must be a non-negative number");
      if (!checkNumber(a.minFileHits, 0))
        details.push("memory.autoImprove.minFileHits must be a non-negative number");
      if (!checkNumber(a.minFixHits, 0))
        details.push("memory.autoImprove.minFixHits must be a non-negative number");
    }
    if (m.autoImportance !== undefined) {
      if (!checkBoolean(m.autoImportance.enabled))
        details.push("memory.autoImportance.enabled must be a boolean");
    }
  }

  if (partial.hooks !== undefined) {
    const h = partial.hooks;
    if (!checkBoolean(h.enabled))
      details.push("hooks.enabled must be a boolean");
    if (!checkNumber(h.maxPayloadBytes, 0))
      details.push("hooks.maxPayloadBytes must be a non-negative number");
    if (h.queue !== undefined) {
      if (!checkNumber(h.queue.maxPending, 0))
        details.push("hooks.queue.maxPending must be a non-negative number");
    }
    if (h.bridge !== undefined) {
      const b = h.bridge;
      if (!checkBoolean(b.enabled))
        details.push("hooks.bridge.enabled must be a boolean");
      if (!checkNumber(b.minObservations, 0))
        details.push("hooks.bridge.minObservations must be a non-negative number");
      if (!checkNumber(b.minIntervalMs, 0))
        details.push("hooks.bridge.minIntervalMs must be a non-negative number");
      if (!checkNumber(b.maxWindow, 0))
        details.push("hooks.bridge.maxWindow must be a non-negative number");
    }
  }

  if (partial.synapse !== undefined) {
    const syn = partial.synapse;
    if (!checkBoolean(syn.enabled))
      details.push("synapse.enabled must be a boolean");
  }

  if (partial.handoffs !== undefined) {
    if (!checkBoolean(partial.handoffs.enabled))
      details.push("handoffs.enabled must be a boolean");
  }

  if (partial.security !== undefined) {
    const sec = partial.security;
    if (sec.apiKey !== undefined && !checkString(sec.apiKey))
      details.push("security.apiKey must be a string");
    if (sec.corsOrigins !== undefined) {
      if (!Array.isArray(sec.corsOrigins) || !sec.corsOrigins.every(checkString))
        details.push("security.corsOrigins must be an array of strings");
    }
    if (sec.allowedExtensions !== undefined) {
      if (!Array.isArray(sec.allowedExtensions) || sec.allowedExtensions.length === 0)
        details.push("security.allowedExtensions must be a non-empty array");
      else if (!sec.allowedExtensions.every((e) => typeof e === "string" && e.startsWith(".") && e.length >= 2))
        details.push("security.allowedExtensions[] must be dot-prefixed extensions");
    }
  }

  return details;
}

export function savePartialConfig(partial: Partial<MassaAiConfig>): SavePartialConfigResult {
  const current = loadConfig();

  const mergedPartial = applyMaskedSentinel(partial, current);

  const details = validatePartial(mergedPartial);
  if (details.length > 0) {
    return { success: false, details };
  }

  const merged: MassaAiConfig = { ...current, ...mergedPartial };

  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${configPath}.bak.${timestamp}`;
    fs.copyFileSync(configPath, backupPath);
  }

  saveConfig(merged);

  return {
    success: true,
    config: merged,
    restartNeededSections: restartNeededSections(merged),
  };
}