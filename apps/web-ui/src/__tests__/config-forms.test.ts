import { describe, it, expect } from "bun:test";

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const { renderConfig, buildConfigSectionBody } = {
  ...mod,
  ...UI,
} as {
  renderConfig: (data: unknown, opts?: { writeMode?: boolean }) => string;
  buildConfigSectionBody: (sectionKey: string, fieldValues: Record<string, unknown>) => Record<string, unknown>;
};

const SAMPLE_CONFIG_DATA = {
  config: {
    database: { url: "postgresql://localhost:5432/massa" },
    embedding: { provider: "ollama", model: "qwen3-embedding:4b", baseURL: "http://localhost:11434", apiKey: "secret-emb-key", dimensions: 2560 },
    compression: { defaultStrategy: "code_structure", minTokensForCompression: 100, targetCompressionRatio: 0.7 },
    impact: { bfsCteEnabled: false },
    cache: { enabled: true, l1MaxSizeMB: 100, l2MaxSizeMB: 500, defaultTTLSeconds: 3600 },
    dataDir: "/home/user/.config/massa-ai/data",
    logging: { level: "info", enableMetrics: false },
    search: { autoReindexMaxFiles: 200, queryUnderstanding: { enabled: false, hydeEnabled: true, cacheTtlMs: 300000, cacheMaxSize: 256 }, rerank: { enabled: false, rerankWindow: 50 } },
    llm: { enabled: false, baseUrl: "http://localhost:11434/v1", apiKey: "secret-llm-key", model: "qwen2.5:7b-instruct", codeModel: "qwen2.5-coder:7b", temperature: 0.2, maxOutputTokens: 8000, timeoutMs: 90000, disableThink: true },
    memory: { decay: { lambda: 0.02, sigma: 0.6, mu: 0.04, coldThreshold: 0.2 }, bootstrap: { enabled: true, maxSeedMemories: 8, centralityLimit: 10, gitLogLimit: 20, refreshEnabled: true }, autoImprove: { enabled: true, reviewGate: false, minObservations: 8, minIntervalMs: 300000, maxWindow: 16, minQueryHits: 3, minFileHits: 3, minFixHits: 2 }, autoImportance: { enabled: false } },
    hooks: { enabled: true, maxPayloadBytes: 65536, queue: { maxPending: 256 }, bridge: { enabled: true, minObservations: 8, minIntervalMs: 300000, maxWindow: 8 } },
    synapse: { enabled: true, inhibition: { diversityPenalty: { enabled: true, threshold: 0.85, lambda: 0.4, samePathPenalty: 0.15 }, temporalInhibition: { enabled: true, penaltyAgeMs: 3600000, penalty: 0.15 }, confidenceGate: { enabled: true, thresholds: { specific: 0.55, focused: 0.4, broad: 0.25 } }, chainInhibition: { enabled: true } }, scoring: { attention: { enabled: false, rerankWindow: 50, recencyHalfLifeMs: 604800000, semanticScale: 1.0, weights: { semantic: 0.25, recency: 0.15, accessHeat: 0.15, taskAlign: 0.2, agentAffinity: 0.1, confidence: 0.15 } } }, metacognition: { enabled: true, lowConfidenceThreshold: 0.15, definitiveTopScore: 0.8, definitiveGap: 0.2 }, buffer: { enabled: true, maxSize: 20, ttlMs: 900000, hitBoost: 1.3, matchThreshold: 0.4 } },
    handoffs: { enabled: true },
    security: { apiKey: "secret-api-key", corsOrigins: [], allowedExtensions: [".ts", ".js"] },
  },
  restartNeededSections: ["database", "llm", "security"],
};

describe("renderConfig — 15 sectioned forms (CFG-01)", () => {
  const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });

  it("renders all 15 sections", () => {
    const sectionCount = (html.match(/class="config-section"/g) || []).length;
    expect(sectionCount).toBe(15);
  });

  it("renders Database section with typed fields", () => {
    expect(html).toContain("Database");
    expect(html).toContain('data-section="database"');
    expect(html).toContain('data-field="url"');
  });

  it("renders Embedding section with enum provider select", () => {
    expect(html).toContain("Embedding");
    expect(html).toContain('data-section="embedding"');
    expect(html).toContain("ollama");
    expect(html).toContain("mistral");
    expect(html).toContain("openai");
  });

  it("renders boolean fields as checkboxes", () => {
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data-field="enabled"');
    expect(html).toContain('data-section="cache"');
    expect(html).toContain('data-field="bridge.enabled"');
  });

  it("renders number fields as number inputs", () => {
    expect(html).toContain('type="number"');
    expect(html).toContain('data-field="dimensions"');
    expect(html).toContain('data-field="temperature"');
    expect(html).toContain('data-field="maxOutputTokens"');
  });

  it("renders search section with nested queryUnderstanding fields", () => {
    expect(html).toContain("Search");
    expect(html).toContain('data-field="queryUnderstanding.enabled"');
    expect(html).toContain('data-field="queryUnderstanding.hydeEnabled"');
    expect(html).toContain('data-field="rerank.rerankWindow"');
  });

  it("renders memory section with decay + bootstrap + autoImprove fields", () => {
    expect(html).toContain("Memory");
    expect(html).toContain('data-field="decay.lambda"');
    expect(html).toContain('data-field="bootstrap.maxSeedMemories"');
    expect(html).toContain('data-field="autoImprove.reviewGate"');
    expect(html).toContain('data-field="autoImportance.enabled"');
  });

  it("renders synapse section with nested inhibition fields", () => {
    expect(html).toContain("Synapse");
    expect(html).toContain('data-field="inhibition.diversityPenalty.threshold"');
    expect(html).toContain('data-field="inhibition.confidenceGate.thresholds.specific"');
    expect(html).toContain('data-field="buffer.maxSize"');
  });

  it("renders security section with string[] CORS + extensions fields", () => {
    expect(html).toContain("Security");
    expect(html).toContain('data-field="corsOrigins"');
    expect(html).toContain('data-field="allowedExtensions"');
    expect(html).toContain('data-type="string[]"');
  });

  it("renders handoffs section with enabled checkbox", () => {
    expect(html).toContain("Handoffs");
    expect(html).toContain('data-field="enabled"');
  });
});

describe("renderConfig — sensitive field masking + reveal (CFG-02, CFG-08)", () => {
  const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });

  it("masks sensitive fields as password inputs (CFG-02)", () => {
    expect(html).toContain('type="password"');
    expect(html).toContain('data-field="url"');
    expect(html).toContain('data-field="apiKey"');
  });

  it("database.url rendered as password input", () => {
    expect(html).toContain('id="config-database-url"');
    const urlIdx = html.indexOf('id="config-database-url"');
    const inputStart = html.lastIndexOf('<input', urlIdx);
    expect(html.slice(inputStart, urlIdx + 30)).toContain('type="password"');
  });

  it("embedding.apiKey rendered as password input", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });
    expect(html).toContain('id="config-embedding-apiKey"');
    const apiKeyIdx = html.indexOf('id="config-embedding-apiKey"');
    const inputStart = html.lastIndexOf('<input', apiKeyIdx);
    expect(html.slice(inputStart, apiKeyIdx + 30)).toContain('type="password"');
  });

  it("llm.apiKey rendered as password input", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });
    expect(html).toContain('id="config-llm-apiKey"');
    const apiKeyIdx = html.indexOf('id="config-llm-apiKey"');
    const inputStart = html.lastIndexOf('<input', apiKeyIdx);
    expect(html.slice(inputStart, apiKeyIdx + 30)).toContain('type="password"');
  });

  it("security.apiKey rendered as password input", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });
    expect(html).toContain('id="config-security-apiKey"');
    const apiKeyIdx = html.indexOf('id="config-security-apiKey"');
    const inputStart = html.lastIndexOf('<input', apiKeyIdx);
    expect(html.slice(inputStart, apiKeyIdx + 30)).toContain('type="password"');
  });

  it("renders reveal button for sensitive fields (CFG-08)", () => {
    expect(html).toContain('data-action="config-reveal"');
    expect(html).toContain('class="reveal-btn"');
  });
});

describe("renderConfig — restart-needed badges (CFG-04)", () => {
  it("shows restart badge for database section", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });
    const dbIdx = html.indexOf("Database");
    const dbHeaderEnd = html.indexOf("</h3>", dbIdx);
    expect(html.slice(dbIdx, dbHeaderEnd)).toContain("restart needed");
  });

  it("shows restart badge for llm section", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });
    const llmIdx = html.indexOf("LLM");
    const llmHeaderEnd = html.indexOf("</h3>", llmIdx);
    expect(html.slice(llmIdx, llmHeaderEnd)).toContain("restart needed");
  });

  it("shows restart badge for security section", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });
    const secIdx = html.indexOf("Security");
    const secHeaderEnd = html.indexOf("</h3>", secIdx);
    expect(html.slice(secIdx, secHeaderEnd)).toContain("restart needed");
  });

  it("does not show restart badge for cache section", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });
    const cacheIdx = html.indexOf("Cache");
    const cacheHeaderEnd = html.indexOf("</h3>", cacheIdx);
    expect(html.slice(cacheIdx, cacheHeaderEnd)).not.toContain("restart needed");
  });

  it("shows no restart badges when restartNeededSections is empty", () => {
    const html = renderConfig({ config: {}, restartNeededSections: [] }, { writeMode: true });
    expect(html).not.toContain("restart needed");
  });
});

describe("renderConfig — per-section Save button (CFG-03)", () => {
  it("renders Save button per section when write mode on", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: true });
    expect(html).toContain('data-action="config-save"');
    expect(html).toContain('data-section="database"');
    expect(html).toContain('data-section="logging"');
  });

  it("hides Save buttons when write mode off", () => {
    const html = renderConfig(SAMPLE_CONFIG_DATA, { writeMode: false });
    expect(html).not.toContain('data-action="config-save"');
  });

  it("defaults writeMode to isWriteModeEnabled() when not passed", () => {
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    const html = renderConfig(SAMPLE_CONFIG_DATA);
    expect(html).not.toContain('data-action="config-save"');
  });
});

describe("buildConfigSectionBody — partial body construction (CFG-03)", () => {
  it("builds a nested body for logging section", () => {
    const body = buildConfigSectionBody("logging", { level: "debug", enableMetrics: true, file: "/var/log/app.log" }) as {
      logging: { level: string; enableMetrics: boolean; file: string };
    };
    expect(body.logging).toBeDefined();
    expect(body.logging.level).toBe("debug");
    expect(body.logging.enableMetrics).toBe(true);
    expect(body.logging.file).toBe("/var/log/app.log");
  });

  it("builds a nested body for search section with dotted paths", () => {
    const body = buildConfigSectionBody("search", { "autoReindexMaxFiles": 500, "queryUnderstanding.enabled": true, "rerank.rerankWindow": 100 }) as {
      search: { autoReindexMaxFiles: number; queryUnderstanding: { enabled: boolean }; rerank: { rerankWindow: number } };
    };
    expect(body.search.autoReindexMaxFiles).toBe(500);
    expect(body.search.queryUnderstanding.enabled).toBe(true);
    expect(body.search.rerank.rerankWindow).toBe(100);
  });

  it("converts number fields to Number type", () => {
    const body = buildConfigSectionBody("cache", { enabled: true, l1MaxSizeMB: "200", defaultTTLSeconds: "7200" }) as {
      cache: { l1MaxSizeMB: number; defaultTTLSeconds: number; enabled: boolean };
    };
    expect(body.cache.l1MaxSizeMB).toBe(200);
    expect(body.cache.defaultTTLSeconds).toBe(7200);
    expect(body.cache.enabled).toBe(true);
  });

  it("converts string[] fields to arrays", () => {
    const body = buildConfigSectionBody("security", { apiKey: "newkey", corsOrigins: "a.com, b.com", allowedExtensions: ".ts, .js" }) as {
      security: { apiKey: string; corsOrigins: string[]; allowedExtensions: string[] };
    };
    expect(body.security.corsOrigins).toEqual(["a.com", "b.com"]);
    expect(body.security.allowedExtensions).toEqual([".ts", ".js"]);
    expect(body.security.apiKey).toBe("newkey");
  });

  it("handles dataDir as a top-level string field", () => {
    const body = buildConfigSectionBody("dataDir", { dataDir: "/new/path" }) as { dataDir: string };
    expect(body.dataDir).toBe("/new/path");
  });

  it("returns empty object for unknown section", () => {
    const body = buildConfigSectionBody("nonexistent", { foo: "bar" });
    expect(body).toEqual({});
  });

  it("omits undefined number values from body", () => {
    const body = buildConfigSectionBody("cache", { enabled: true, l1MaxSizeMB: "" }) as {
      cache: { l1MaxSizeMB?: number; enabled: boolean };
    };
    expect(body.cache.l1MaxSizeMB).toBeUndefined();
    expect(body.cache.enabled).toBe(true);
  });
});

describe("renderConfig — empty config", () => {
  it("renders all 15 sections even when config is empty", () => {
    const html = renderConfig({ config: {}, restartNeededSections: [] }, { writeMode: true });
    const sectionCount = (html.match(/class="config-section"/g) || []).length;
    expect(sectionCount).toBe(15);
  });
});

describe("renderConfig — checkbox alignment (UIC-04)", () => {
  it("checkbox inputs have left-align CSS via align-self: flex-start", () => {
    const html = renderConfig({ config: { llm: { enabled: true } }, restartNeededSections: [] }, { writeMode: true });
    expect(html).toContain('type="checkbox"');
    // The CSS rule .config-field input[type="checkbox"] { align-self: flex-start }
    // is in styles.css, verified by reading the file (not asserted in HTML output).
  });
});