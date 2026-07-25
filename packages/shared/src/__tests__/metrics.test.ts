/**
 * Metrics unit tests.
 * Mocks ./logger (metrics calls logger.metric/info/warn/debug).
 * Covers: MetricsCollector (pricing, cost sync/async, record sync/async,
 * aggregation, report, reset), PerformanceTracker (track success/fail, stats).
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";

// ── Logger mock ──
const metricCalls: Array<[string, number, string | undefined]> = [];
const warnCalls: Array<[string, unknown]> = [];
const debugCalls: Array<[string]> = [];

mock.module("../utils/logger.js", () => ({
  logger: {
    info: () => {},
    warn: (m: string, meta?: unknown) => { warnCalls.push([m, meta ?? {}]); },
    error: () => {},
    debug: (m: string) => { debugCalls.push([m]); },
    metric: (name: string, value: number, unit?: string) => { metricCalls.push([name, value, unit]); },
  },
  LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
}));

import { MetricsCollector, PerformanceTracker } from "../utils/metrics";

describe("MetricsCollector.calculateCost (sync)", () => {
  test("gpt-4 pricing: 30/M input + 60/M output", () => {
    // 1M input + 1M output = 30 + 60 = 90
    expect(MetricsCollector.calculateCost(1_000_000, 1_000_000, "gpt-4")).toBeCloseTo(90, 6);
  });

  test("gpt-4-mini: 3/M in + 6/M out", () => {
    expect(MetricsCollector.calculateCost(1_000_000, 1_000_000, "gpt-4-mini")).toBeCloseTo(9, 6);
  });

  test("zero tokens -> zero cost", () => {
    expect(MetricsCollector.calculateCost(0, 0, "claude-3-opus")).toBe(0);
  });
});

describe("MetricsCollector.getModelPricing (async)", () => {
  beforeEach(() => { warnCalls.length = 0; debugCalls.length = 0; });

  test("returns fallback pricing for known model", async () => {
    const p = await MetricsCollector.getModelPricing("gpt-4");
    expect(p).toEqual({ input: 30, output: 60 });
  });

  test("returns gpt-4 pricing as default for unknown model (warns)", async () => {
    const p = await MetricsCollector.getModelPricing("totally-unknown-model");
    expect(p).toEqual({ input: 30, output: 60 });
    expect(warnCalls.some(([m]) => m.includes("Unknown model"))).toBe(true);
  });
});

describe("MetricsCollector.calculateCostAsync", () => {
  test("uses getModelPricing result", async () => {
    const cost = await MetricsCollector.calculateCostAsync(1_000_000, 1_000_000, "gpt-4");
    expect(cost).toBeCloseTo(90, 6);
  });

  test("unknown model falls back to gpt-4 pricing", async () => {
    const cost = await MetricsCollector.calculateCostAsync(1_000_000, 1_000_000, "unknown");
    expect(cost).toBeCloseTo(90, 6);
  });
});

describe("MetricsCollector.recordCompression (sync)", () => {
  beforeEach(() => {
    MetricsCollector.reset();
    metricCalls.length = 0;
  });

  test("records metrics with correct ratios and costs", () => {
    const m = MetricsCollector.recordCompression(1000, 400, "gpt-4");
    expect(m.originalTokens).toBe(1000);
    expect(m.compressedTokens).toBe(400);
    expect(m.tokensSaved).toBe(600);
    expect(m.compressionRatio).toBeCloseTo(0.6, 6);
    expect(m.model).toBe("gpt-4");
    expect(m.costOriginal).toBeGreaterThan(m.costCompressed);
    expect(m.costSavings).toBeCloseTo(m.costOriginal - m.costCompressed, 6);
  });

  test("zero original tokens -> compressionRatio 0 (no NaN)", () => {
    const m = MetricsCollector.recordCompression(0, 0, "gpt-4");
    expect(m.compressionRatio).toBe(0);
    expect(m.tokensSaved).toBe(0);
  });

  test("emits two logger.metric calls (token_compression + cost_savings)", () => {
    MetricsCollector.recordCompression(1000, 500, "gpt-4");
    expect(metricCalls).toHaveLength(2);
    expect(metricCalls[0][0]).toBe("token_compression");
    expect(metricCalls[1][0]).toBe("cost_savings");
  });

  test("defaults model to gpt-4", () => {
    const m = MetricsCollector.recordCompression(100, 50);
    expect(m.model).toBe("gpt-4");
  });
});

describe("MetricsCollector.recordCompressionAsync", () => {
  beforeEach(() => {
    MetricsCollector.reset();
    metricCalls.length = 0;
  });

  test("records async metrics with correct ratios and costs", async () => {
    const m = await MetricsCollector.recordCompressionAsync(1000, 400, "gpt-4");
    expect(m.originalTokens).toBe(1000);
    expect(m.compressedTokens).toBe(400);
    expect(m.tokensSaved).toBe(600);
    expect(m.compressionRatio).toBeCloseTo(0.6, 6);
    expect(m.costOriginal).toBeGreaterThan(m.costCompressed);
  });

  test("zero original tokens -> compressionRatio 0 (no NaN)", async () => {
    const m = await MetricsCollector.recordCompressionAsync(0, 0, "gpt-4");
    expect(m.compressionRatio).toBe(0);
  });

  test("emits two logger.metric calls", async () => {
    await MetricsCollector.recordCompressionAsync(1000, 500, "gpt-4");
    expect(metricCalls).toHaveLength(2);
  });

  test("defaults modelId to gpt-4", async () => {
    const m = await MetricsCollector.recordCompressionAsync(100, 50);
    expect(m.model).toBe("gpt-4");
  });

  test("unknown modelId falls back to gpt-4 pricing", async () => {
    const m = await MetricsCollector.recordCompressionAsync(1000, 500, "unknown-model");
    expect(m.costOriginal).toBeGreaterThan(0);
  });
});

describe("MetricsCollector.getAggregatedMetrics", () => {
  beforeEach(() => { MetricsCollector.reset(); });

  test("empty -> all zeros, count 0", () => {
    const agg = MetricsCollector.getAggregatedMetrics();
    expect(agg).toEqual({
      totalOriginalTokens: 0,
      totalCompressedTokens: 0,
      totalTokensSaved: 0,
      avgCompressionRatio: 0,
      totalCostSavings: 0,
      count: 0,
    });
  });

  test("aggregates across multiple records", () => {
    MetricsCollector.recordCompression(1000, 400, "gpt-4");
    MetricsCollector.recordCompression(2000, 1000, "gpt-4");
    const agg = MetricsCollector.getAggregatedMetrics();
    expect(agg.count).toBe(2);
    expect(agg.totalOriginalTokens).toBe(3000);
    expect(agg.totalCompressedTokens).toBe(1400);
    expect(agg.totalTokensSaved).toBe(1600);
    expect(agg.avgCompressionRatio).toBeCloseTo((0.6 + 0.5) / 2, 6);
    expect(agg.totalCostSavings).toBeGreaterThan(0);
  });
});

describe("MetricsCollector.generateReport", () => {
  beforeEach(() => { MetricsCollector.reset(); });

  test("empty -> 'No metrics collected yet'", () => {
    expect(MetricsCollector.generateReport()).toBe("No metrics collected yet");
  });

  test("non-empty -> formatted report with counts, tokens, savings, monthly projection", () => {
    MetricsCollector.recordCompression(10000, 4000, "gpt-4");
    const report = MetricsCollector.generateReport();
    expect(report).toContain("Token Compression Report");
    expect(report).toContain("Requests Analyzed: 1");
    expect(report).toContain("Original:");
    expect(report).toContain("Compressed:");
    expect(report).toContain("Saved:");
    expect(report).toContain("Cost Savings:");
    expect(report).toContain("Total:");
    expect(report).toContain("Per Request:");
    expect(report).toContain("Monthly");
  });
});

describe("MetricsCollector.reset", () => {
  beforeEach(() => { MetricsCollector.reset(); });

  test("clears all recorded metrics", () => {
    MetricsCollector.recordCompression(1000, 500, "gpt-4");
    expect(MetricsCollector.getAggregatedMetrics().count).toBe(1);
    MetricsCollector.reset();
    expect(MetricsCollector.getAggregatedMetrics().count).toBe(0);
  });
});

describe("PerformanceTracker.track", () => {
  test("tracks successful operation and records metric", async () => {
    const result = await PerformanceTracker.track("op-success", async () => 42);
    expect(result).toBe(42);
    const stats = PerformanceTracker.getStats("op-success");
    expect(stats.count).toBe(1);
    expect(stats.successRate).toBe(1);
    expect(stats.avgDuration).toBeGreaterThanOrEqual(0);
  });

  test("tracks failed operation (success=false), rethrows, still records", async () => {
    await expect(
      PerformanceTracker.track("op-fail", async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");
    const stats = PerformanceTracker.getStats("op-fail");
    expect(stats.count).toBe(1);
    expect(stats.successRate).toBe(0);
  });

  test("multiple ops aggregate in stats", async () => {
    await PerformanceTracker.track("multi", async () => 1);
    await PerformanceTracker.track("multi", async () => 2);
    const stats = PerformanceTracker.getStats("multi");
    expect(stats.count).toBe(2);
    expect(stats.successRate).toBe(1);
  });
});

describe("PerformanceTracker.getStats", () => {
  test("unknown operation -> zeros", () => {
    const stats = PerformanceTracker.getStats("never-run");
    expect(stats).toEqual({ count: 0, avgDuration: 0, successRate: 0 });
  });
});