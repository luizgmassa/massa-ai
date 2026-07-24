/**
 * Benchmark utility unit tests.
 * Pure-logic: timing + percentile + compare + format. No DB/network.
 */

import { describe, test, expect } from "bun:test";
import { Benchmark, type BenchmarkResult } from "../utils/benchmark";

function makeResult(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    name: "test",
    iterations: 100,
    avg: 1.5,
    min: 1.0,
    max: 2.0,
    p50: 1.4,
    p95: 1.9,
    p99: 2.0,
    totalTime: 150,
    ...overrides,
  };
}

describe("Benchmark.measure (async)", () => {
  test("returns well-formed result with percentiles for default iterations", async () => {
    const result = await Benchmark.measure("async-noop", async () => 1, 5);
    expect(result.name).toBe("async-noop");
    expect(result.iterations).toBe(5);
    expect(result.min).toBeLessThanOrEqual(result.max);
    expect(result.p50).toBeGreaterThanOrEqual(result.min);
    expect(result.p50).toBeLessThanOrEqual(result.max);
    expect(result.p95).toBeGreaterThanOrEqual(result.p50);
    expect(result.p99).toBeGreaterThanOrEqual(result.p95);
    expect(result.avg).toBeGreaterThan(0);
    expect(result.totalTime).toBeGreaterThan(0);
  });

  test("warm-up run is not counted (iterations exact)", async () => {
    let calls = 0;
    await Benchmark.measure("count", async () => { calls++; }, 10);
    // 1 warm-up + 10 measured
    expect(calls).toBe(11);
  });

  test("honors custom iterations argument", async () => {
    const r = await Benchmark.measure("x", async () => 0, 3);
    expect(r.iterations).toBe(3);
  });
});

describe("Benchmark.measureSync", () => {
  test("returns well-formed result", () => {
    const r = Benchmark.measureSync("sync-noop", () => 42, 5);
    expect(r.name).toBe("sync-noop");
    expect(r.iterations).toBe(5);
    expect(r.min).toBeLessThanOrEqual(r.max);
    expect(r.p50).toBeGreaterThanOrEqual(r.min);
    expect(r.p95).toBeGreaterThanOrEqual(r.p50);
    expect(r.p99).toBeGreaterThanOrEqual(r.p95);
    expect(r.avg).toBeGreaterThanOrEqual(0);
  });

  test("warm-up run not counted (iterations exact)", () => {
    let calls = 0;
    Benchmark.measureSync("c", () => { calls++; }, 8);
    expect(calls).toBe(9);
  });

  test("honors custom iterations argument", () => {
    const r = Benchmark.measureSync("y", () => 0, 2);
    expect(r.iterations).toBe(2);
  });
});

describe("Benchmark.compare", () => {
  test("faster: positive improvement and faster=true, summary includes % faster", () => {
    const baseline = makeResult({ avg: 10 });
    const optimized = makeResult({ avg: 5 });
    const c = Benchmark.compare(baseline, optimized);
    expect(c.improvement).toBeCloseTo(50, 1);
    expect(c.faster).toBe(true);
    expect(c.summary).toContain("50.0% faster");
    expect(c.summary).toContain("10.00ms");
    expect(c.summary).toContain("5.00ms");
  });

  test("slower: negative improvement and faster=false, summary includes % slower", () => {
    const baseline = makeResult({ avg: 4 });
    const optimized = makeResult({ avg: 8 });
    const c = Benchmark.compare(baseline, optimized);
    expect(c.improvement).toBeCloseTo(-100, 1);
    expect(c.faster).toBe(false);
    expect(c.summary).toContain("100.0% slower");
  });

  test("equal: zero improvement, faster=false, summary % slower", () => {
    const baseline = makeResult({ avg: 5 });
    const optimized = makeResult({ avg: 5 });
    const c = Benchmark.compare(baseline, optimized);
    expect(c.improvement).toBe(0);
    expect(c.faster).toBe(false);
    expect(c.summary).toContain("0.0% slower");
  });
});

describe("Benchmark.format", () => {
  test("renders all fields with labels and trims leading/trailing whitespace", () => {
    const r = makeResult({
      name: "my-bench",
      iterations: 7,
      avg: 1.234,
      min: 0.5,
      max: 2.5,
      p50: 1.1,
      p95: 2.0,
      p99: 2.4,
      totalTime: 8.64,
    });
    const out = Benchmark.format(r);
    expect(out.startsWith("Benchmark: my-bench")).toBe(true);
    expect(out).toContain("Iterations: 7");
    expect(out).toContain("Average: 1.23ms");
    expect(out).toContain("Min: 0.50ms");
    expect(out).toContain("Max: 2.50ms");
    expect(out).toContain("P50: 1.10ms");
    expect(out).toContain("P95: 2.00ms");
    expect(out).toContain("P99: 2.40ms");
    expect(out).toContain("Total: 8.64ms");
    expect(out.endsWith("ms")).toBe(true);
  });
});