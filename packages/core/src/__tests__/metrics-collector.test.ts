/**
 * MetricsCollector unit tests — covers recordEmbedding, recordCompression,
 * recordContextOptimization, getMetrics, getSummary, save, reset, and
 * initialization paths. All IO is isolated to a per-test temp metricsPath via
 * process.cwd() override (the collector resolves metricsPath from cwd).
 */
import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const originalCwd = process.cwd();
let tempDir: string;

// MetricsCollector reads metricsPath = resolve(process.cwd(), "data", "metrics.json")
// at construction time. We isolate by changing cwd before each reset+instance.
function freshInstance() {
  tempDir = mkdtempSync(join(tmpdir(), "metrics-test-"));
  process.chdir(tempDir);
  // Force a fresh singleton by accessing the class via a dynamic import cache
  // bust. Since the module caches the singleton, we reset the static field.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("../services/monitoring/metrics.js");
  // Reset the static instance so each test gets a collector scoped to tempDir.
  (mod.MetricsCollector as any).instance = undefined;
  return mod;
}

let mod: ReturnType<typeof freshInstance>;
let MetricsCollector: typeof import("../services/monitoring/metrics.js").MetricsCollector;
let metrics: import("../services/monitoring/metrics.js").MetricsCollector;

beforeEach(() => {
  mod = freshInstance();
  MetricsCollector = mod.MetricsCollector;
  metrics = MetricsCollector.getInstance();
});

afterEach(() => {
  process.chdir(originalCwd);
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  // Clear the singleton so the next test gets a fresh cwd-scoped collector.
  (mod.MetricsCollector as any).instance = undefined;
});

describe("MetricsCollector initialization", () => {
  test("getInstance returns the same singleton within one cwd", () => {
    const a = MetricsCollector.getInstance();
    const b = MetricsCollector.getInstance();
    expect(a).toBe(b);
  });

  test("loads existing metrics from disk when metrics.json exists", () => {
    // Seed a metrics.json in the temp cwd's data/ dir.
    const dataDir = join(tempDir, "data");
    const { mkdirSync, writeFileSync } = require("node:fs");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "metrics.json"),
      JSON.stringify({
        embeddings: {
          totalCalls: 42,
          totalTokens: 1000,
          totalCost: 0.5,
          byProvider: { mistralText: { calls: 42, tokens: 1000, cost: 0.5, avgLatency: 10, errors: 0 } },
        },
        context: { totalRequests: 0, totalInputTokens: 0, totalOptimizedTokens: 0, totalSentToLLM: 0, avgReductionRatio: 0, totalCostSaved: 0, avgLatency: 0 },
        cache: { hits: 0, misses: 0, hitRate: 0, savedCost: 0, avgHitLatency: 0, avgMissLatency: 0 },
        compression: { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, avgCompressionRatio: 0, avgLatency: 0 },
        performance: { avgEmbeddingLatency: 0, p95EmbeddingLatency: 0, p99EmbeddingLatency: 0, totalRequests: 0, errorRate: 0 },
        period: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T00:00:00.000Z", durationHours: 0 },
      }),
    );
    (mod.MetricsCollector as any).instance = undefined;
    const m = MetricsCollector.getInstance();
    const data = m.getMetrics();
    expect(data.embeddings.totalCalls).toBe(42);
  });

  test("starts fresh when metrics.json is corrupted", () => {
    const dataDir = join(tempDir, "data");
    const { mkdirSync, writeFileSync } = require("node:fs");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "metrics.json"), "{ corrupted json");
    (mod.MetricsCollector as any).instance = undefined;
    const m = MetricsCollector.getInstance();
    const data = m.getMetrics();
    expect(data.embeddings.totalCalls).toBe(0);
  });
});

describe("recordEmbedding", () => {
  test("records a non-cached call with cost", () => {
    metrics.recordEmbedding({
      provider: "mistralText",
      tokens: 100_000,
      latency: 50,
      cached: false,
    });
    const m = metrics.getMetrics();
    expect(m.embeddings.totalCalls).toBe(1);
    expect(m.embeddings.totalTokens).toBe(100_000);
    // cost = (100_000 / 1_000_000) * 0.1 = 0.01
    expect(m.embeddings.totalCost).toBeCloseTo(0.01, 6);
    expect(m.embeddings.byProvider.mistralText.calls).toBe(1);
    expect(m.embeddings.byProvider.mistralText.tokens).toBe(100_000);
    expect(m.embeddings.byProvider.mistralText.avgLatency).toBe(50);
    expect(m.cache.misses).toBe(1);
    expect(m.cache.hitRate).toBe(0);
  });

  test("records a cached call — cost goes to savedCost, not totalCost", () => {
    metrics.recordEmbedding({
      provider: "mistralText",
      tokens: 100_000,
      latency: 5,
      cached: true,
    });
    const m = metrics.getMetrics();
    expect(m.embeddings.totalCalls).toBe(1); // cached still counts as a call
    expect(m.cache.hits).toBe(1);
    expect(m.cache.hitRate).toBe(1);
    // savedCost = (100_000 / 1_000_000) * 0.1 = 0.01
    expect(m.cache.savedCost).toBeCloseTo(0.01, 6);
    // totalCost does NOT increase for cached calls (cost already counted on the miss)
    expect(m.embeddings.totalCost).toBe(0);
  });

  test("records an error — increments errors, does not add tokens or cost", () => {
    metrics.recordEmbedding({
      provider: "mistralText",
      tokens: 500,
      latency: 100,
      cached: false,
      error: true,
    });
    const m = metrics.getMetrics();
    expect(m.embeddings.totalCalls).toBe(0); // errors do not count as successful calls
    expect(m.embeddings.totalTokens).toBe(0);
    expect(m.embeddings.byProvider.mistralText.errors).toBe(1);
    expect(m.embeddings.byProvider.mistralText.calls).toBe(1);
    expect(m.cache.misses).toBe(1);
  });

  test("unknown provider does not accumulate cost (no pricing entry)", () => {
    metrics.recordEmbedding({
      provider: "unknown-provider",
      tokens: 10_000,
      latency: 20,
      cached: false,
    });
    const m = metrics.getMetrics();
    expect(m.embeddings.totalCost).toBe(0);
    expect(m.embeddings.byProvider["unknown-provider"].tokens).toBe(10_000);
  });

  test("avg latency updates incrementally across multiple calls", () => {
    metrics.recordEmbedding({ provider: "mistralText", tokens: 100, latency: 10, cached: false });
    metrics.recordEmbedding({ provider: "mistralText", tokens: 100, latency: 30, cached: false });
    const m = metrics.getMetrics();
    // avg = (10 + 30) / 2 = 20
    expect(m.embeddings.byProvider.mistralText.avgLatency).toBe(20);
  });

  test("auto-saves every 10 non-error calls", () => {
    for (let i = 0; i < 9; i++) {
      metrics.recordEmbedding({ provider: "mistralText", tokens: 10, latency: 1, cached: false });
    }
    expect(existsSync(join(tempDir, "data", "metrics.json"))).toBe(false);
    metrics.recordEmbedding({ provider: "mistralText", tokens: 10, latency: 1, cached: false });
    expect(existsSync(join(tempDir, "data", "metrics.json"))).toBe(true);
  });

  test("period.durationHours updates after a record", () => {
    metrics.recordEmbedding({ provider: "mistralText", tokens: 100, latency: 5, cached: false });
    const m = metrics.getMetrics();
    expect(m.period.durationHours).toBeGreaterThanOrEqual(0);
  });

  test("performance percentiles update with latencies", () => {
    for (let i = 1; i <= 20; i++) {
      metrics.recordEmbedding({ provider: "mistralText", tokens: 10, latency: i * 10, cached: false });
    }
    const m = metrics.getMetrics();
    expect(m.performance.avgEmbeddingLatency).toBeGreaterThan(0);
    expect(m.performance.p95EmbeddingLatency).toBeGreaterThan(0);
    expect(m.performance.totalRequests).toBe(20);
  });

  test("error rate reflects errors / total requests", () => {
    metrics.recordEmbedding({ provider: "mistralText", tokens: 10, latency: 1, cached: false, error: true });
    metrics.recordEmbedding({ provider: "mistralText", tokens: 10, latency: 1, cached: false });
    const m = metrics.getMetrics();
    // 1 error / 2 total requests (latencies tracked) = 0.5
    expect(m.performance.errorRate).toBe(0.5);
  });
});

describe("recordCompression", () => {
  test("records input/output tokens, cost, ratio, latency", () => {
    metrics.recordCompression({ inputTokens: 1000, outputTokens: 200, latency: 150 });
    const m = metrics.getMetrics();
    expect(m.compression.totalCalls).toBe(1);
    expect(m.compression.totalInputTokens).toBe(1000);
    expect(m.compression.totalOutputTokens).toBe(200);
    // cost = (1000/1M)*0.2 + (200/1M)*0.6 = 0.0002 + 0.00012 = 0.00032
    expect(m.compression.totalCost).toBeCloseTo(0.00032, 8);
    expect(m.compression.avgCompressionRatio).toBeCloseTo(0.2, 4);
    expect(m.compression.avgLatency).toBe(150);
  });

  test("inputTokens=0 → ratio defaults to 1", () => {
    metrics.recordCompression({ inputTokens: 0, outputTokens: 0, latency: 10 });
    const m = metrics.getMetrics();
    expect(m.compression.avgCompressionRatio).toBe(1);
  });
});

describe("recordContextOptimization", () => {
  test("tracks input → optimized → sentToLLM with reduction ratio", () => {
    metrics.recordContextOptimization({
      inputTokens: 1000,
      optimizedTokens: 600,
      sentToLLM: 500,
      latency: 30,
      costSaved: 0.05,
    });
    const m = metrics.getMetrics();
    expect(m.context.totalRequests).toBe(1);
    expect(m.context.totalInputTokens).toBe(1000);
    expect(m.context.totalOptimizedTokens).toBe(600);
    expect(m.context.totalSentToLLM).toBe(500);
    // reduction = 1 - 500/1000 = 0.5
    expect(m.context.avgReductionRatio).toBe(0.5);
    expect(m.context.totalCostSaved).toBe(0.05);
    expect(m.context.avgLatency).toBe(30);
  });

  test("inputTokens=0 → reduction ratio is 0", () => {
    metrics.recordContextOptimization({
      inputTokens: 0,
      optimizedTokens: 0,
      sentToLLM: 0,
      latency: 5,
    });
    const m = metrics.getMetrics();
    expect(m.context.avgReductionRatio).toBe(0);
  });

  test("costSaved is optional", () => {
    metrics.recordContextOptimization({
      inputTokens: 100,
      optimizedTokens: 50,
      sentToLLM: 50,
      latency: 1,
    });
    const m = metrics.getMetrics();
    expect(m.context.totalCostSaved).toBe(0);
  });
});

describe("save + reset", () => {
  test("save writes valid JSON to disk", () => {
    metrics.recordEmbedding({ provider: "mistralText", tokens: 100, latency: 1, cached: false });
    metrics.save();
    const raw = readFileSync(join(tempDir, "data", "metrics.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.embeddings.totalCalls).toBe(1);
  });

  test("reset clears all metrics and starts a fresh period", () => {
    metrics.recordEmbedding({ provider: "mistralText", tokens: 100, latency: 1, cached: false });
    metrics.recordCompression({ inputTokens: 10, outputTokens: 5, latency: 1 });
    metrics.reset();
    const m = metrics.getMetrics();
    expect(m.embeddings.totalCalls).toBe(0);
    expect(m.compression.totalCalls).toBe(0);
    expect(m.period.start).toBeDefined();
  });
});

describe("getSummary", () => {
  test("produces a human-readable summary with all sections", () => {
    metrics.recordEmbedding({ provider: "mistralText", tokens: 1000, latency: 50, cached: false });
    metrics.recordEmbedding({ provider: "mistralText", tokens: 500, latency: 5, cached: true });
    metrics.recordCompression({ inputTokens: 1000, outputTokens: 200, latency: 150 });
    metrics.recordContextOptimization({ inputTokens: 1000, optimizedTokens: 600, sentToLLM: 500, latency: 30, costSaved: 0.01 });

    const summary = metrics.getSummary();
    expect(summary).toContain("Metrics Summary");
    expect(summary).toContain("Embeddings");
    expect(summary).toContain("Cache Efficiency");
    expect(summary).toContain("LLM Compression");
    expect(summary).toContain("Performance");
    expect(summary).toContain("Total Cost");
    expect(summary).toContain("mistralText");
  });

  test("summary omits compression section when totalCalls is 0", () => {
    const summary = metrics.getSummary();
    expect(summary).not.toContain("LLM Compression");
  });

  test("summary shows error count when errors > 0", () => {
    metrics.recordEmbedding({ provider: "mistralText", tokens: 10, latency: 1, cached: false, error: true });
    const summary = metrics.getSummary();
    expect(summary).toContain("Errors: 1");
  });
});