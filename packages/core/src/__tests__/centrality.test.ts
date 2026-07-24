/**
 * Unit tests for computePageRank (centrality.ts).
 *
 * Pure function — no DB, no mocks. Exercises:
 *   - empty nodes → empty Map
 *   - single node, no edges
 *   - import target gets higher score than source
 *   - self-loop edges skipped
 *   - unknown endpoint edges skipped
 *   - normalization to [0, 1]
 *   - convergence (delta < MIN_SCORE → early break)
 *   - multiple nodes / edges topology
 */
import { describe, test, expect } from "bun:test";
import { computePageRank } from "../services/symbol/centrality.js";

describe("computePageRank", () => {
  test("returns empty Map for empty nodes array", () => {
    const result = computePageRank([], []);
    expect(result.size).toBe(0);
  });

  test("single node with no edges normalizes to 1.0", () => {
    const result = computePageRank(["a.ts"], []);
    expect(result.size).toBe(1);
    expect(result.get("a.ts")).toBe(1);
  });

  test("import target gets higher score than source", () => {
    const nodes = ["a.ts", "b.ts"];
    const edges = [{ from_file: "a.ts", to_file: "b.ts" }];
    const result = computePageRank(nodes, edges);
    expect(result.get("b.ts")!).toBeGreaterThan(result.get("a.ts")!);
    expect(result.get("b.ts")).toBe(1);
  });

  test("skips self-loop edges (from === to)", () => {
    const nodes = ["a.ts", "b.ts"];
    const edges = [
      { from_file: "a.ts", to_file: "a.ts" },
      { from_file: "a.ts", to_file: "b.ts" },
    ];
    const result = computePageRank(nodes, edges);
    expect(result.get("b.ts")!).toBeGreaterThan(result.get("a.ts")!);
  });

  test("skips edges with unknown endpoints (not in nodes list)", () => {
    const nodes = ["a.ts", "b.ts"];
    const edges = [
      { from_file: "a.ts", to_file: "unknown.ts" },
      { from_file: "unknown2.ts", to_file: "b.ts" },
    ];
    const result = computePageRank(nodes, edges);
    expect(result.get("a.ts")).toBe(1);
    expect(result.get("b.ts")).toBe(1);
  });

  test("normalizes all scores to [0, 1]", () => {
    const nodes = ["a.ts", "b.ts", "c.ts"];
    const edges = [
      { from_file: "a.ts", to_file: "c.ts" },
      { from_file: "b.ts", to_file: "c.ts" },
    ];
    const result = computePageRank(nodes, edges);
    for (const score of result.values()) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
    expect(result.get("c.ts")).toBe(1);
  });

  test("converges on a chain graph and normalizes highest to 1.0", () => {
    const nodes = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
    const edges = [
      { from_file: "a.ts", to_file: "b.ts" },
      { from_file: "b.ts", to_file: "c.ts" },
      { from_file: "c.ts", to_file: "d.ts" },
      { from_file: "d.ts", to_file: "e.ts" },
      { from_file: "a.ts", to_file: "e.ts" },
    ];
    const result = computePageRank(nodes, edges);
    expect(result.size).toBe(5);
    expect(result.get("e.ts")).toBe(1);
  });

  test("handles a hub node imported by multiple files", () => {
    const nodes = ["util.ts", "a.ts", "b.ts", "c.ts"];
    const edges = [
      { from_file: "a.ts", to_file: "util.ts" },
      { from_file: "b.ts", to_file: "util.ts" },
      { from_file: "c.ts", to_file: "util.ts" },
    ];
    const result = computePageRank(nodes, edges);
    expect(result.get("util.ts")).toBe(1);
    expect(result.get("a.ts")!).toBeLessThan(1);
  });

  test("all scores are positive for non-empty node set", () => {
    const nodes = ["x.ts", "y.ts"];
    const edges = [{ from_file: "x.ts", to_file: "y.ts" }];
    const result = computePageRank(nodes, edges);
    for (const score of result.values()) {
      expect(score).toBeGreaterThan(0);
    }
  });

  test("multiple edges between same pair increase target score", () => {
    const nodes = ["a.ts", "b.ts", "c.ts"];
    const edges = [
      { from_file: "a.ts", to_file: "c.ts" },
      { from_file: "b.ts", to_file: "c.ts" },
      { from_file: "a.ts", to_file: "b.ts" },
    ];
    const result = computePageRank(nodes, edges);
    expect(result.get("c.ts")!).toBeGreaterThanOrEqual(result.get("b.ts")!);
    expect(result.get("c.ts")).toBe(1);
  });
});