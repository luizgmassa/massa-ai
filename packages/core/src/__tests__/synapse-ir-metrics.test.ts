/**
 * IR metric primitives — pin the math so the benchmark and the unit tests
 * always agree on what precision@k / recall@k / MRR / nDCG mean.
 */

import { describe, test, expect } from "bun:test";
import {
  precisionAtK,
  recallAtK,
  mrrAtK,
  ndcgAtK,
  jaccard,
} from "./fixtures/ir-metrics.js";

const rel = new Set(["a", "b", "c"]);

describe("IR metrics", () => {
  test("precision@k counts hits in the first k retrieved", () => {
    expect(precisionAtK(["a", "b", "x"], rel, 3)).toBeCloseTo(2 / 3, 5);
    expect(precisionAtK(["a", "b", "c"], rel, 3)).toBe(1);
    expect(precisionAtK(["x", "y", "z"], rel, 3)).toBe(0);
    expect(precisionAtK([], rel, 5)).toBe(0);
    expect(Number.isNaN(precisionAtK(["a"], rel, 0))).toBe(true);
  });

  test("recall@k counts hits out of relevant", () => {
    expect(recallAtK(["a", "b"], rel, 5)).toBeCloseTo(2 / 3, 5);
    expect(recallAtK(["a", "b", "c", "x"], rel, 4)).toBe(1);
    expect(recallAtK(["x"], rel, 5)).toBe(0);
    expect(Number.isNaN(recallAtK(["a"], new Set(), 5))).toBe(true);
  });

  test("MRR@k uses position of first relevant hit", () => {
    expect(mrrAtK(["x", "a", "y"], rel, 10)).toBeCloseTo(1 / 2, 5);
    expect(mrrAtK(["a", "x", "y"], rel, 10)).toBe(1);
    expect(mrrAtK(["x", "y", "z"], rel, 10)).toBe(0);
    expect(mrrAtK(["x", "y", "a"], rel, 2)).toBe(0); // a is past k
  });

  test("nDCG@k normalizes DCG against the ideal ordering", () => {
    // perfect order
    expect(ndcgAtK(["a", "b", "c"], rel, 3)).toBeCloseTo(1, 5);
    // reverse-perfect — same hits, different positions, lower DCG
    const reversed = ndcgAtK(["c", "b", "a"], rel, 3);
    expect(reversed).toBeCloseTo(1, 5); // still all in top-3, ideal is hit set, position doesn't matter for full overlap
    // partial
    const partial = ndcgAtK(["x", "a", "y"], rel, 3);
    expect(partial).toBeLessThan(1);
    expect(partial).toBeGreaterThan(0);
    // no hits
    expect(ndcgAtK(["x", "y", "z"], rel, 3)).toBe(0);
  });

  test("jaccard symmetric and bounded", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a", "b"], ["c", "d"])).toBe(0);
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3, 5);
    expect(jaccard([], [])).toBe(1);
  });
});
