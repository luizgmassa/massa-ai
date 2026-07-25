/**
 * Unit tests for RedundancyFilter (PostgreSQL-backed duplicate detection).
 *
 * Mocks the Prisma client to exercise findDuplicates, mergeDuplicates,
 * and runCleanup without a real DB. Also mocks TokenMetrics to avoid
 * side effects.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";

// ── Mocks ───────────────────────────────────────────────────────────────────

let queryRawResult: any[] = [];
let executeRawCalls: any[] = [];
let executeRawResults: number[] = [];
let transactionFn: ((tx: any) => Promise<void>) | null = null;

mock.module("../services/query/prisma-client.js", () => ({
  getPrismaClient: () => ({
    $queryRaw: () => Promise.resolve(queryRawResult),
    $executeRaw: (sql: any) => {
      executeRawCalls.push(sql);
      return Promise.resolve(executeRawResults.shift() ?? 1);
    },
    $transaction: async (fn: (tx: any) => Promise<void>) => {
      transactionFn = fn;
      const tx = {
        $queryRaw: () => Promise.resolve(queryRawResult),
        $executeRaw: (sql: any) => {
          executeRawCalls.push(sql);
          return Promise.resolve(executeRawResults.shift() ?? 1);
        },
      };
      await fn(tx);
    },
  }),
}));

mock.module("../metrics/token-metrics.js", () => ({
  TokenMetrics: {
    getInstance: () => ({
      recordRedundancyFilterSavings: () => {},
    }),
  },
}));

import { RedundancyFilter } from "../services/memory/redundancy-filter.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmbedding(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

function makeRow(
  id: string,
  vec: number[],
  overrides: Partial<Record<string, unknown>> = {},
): any {
  return {
    id,
    content: `content ${id}`,
    type: "decision",
    level: 1,
    importance: 0.7,
    tags: '["tag"]',
    embedding: makeEmbedding(vec),
    created_at: new Date(),
    updated_at: new Date(),
    access_count: 5,
    user_id: null,
    session_id: null,
    project_id: "proj-1",
    agent_id: null,
    ...overrides,
  };
}

describe("RedundancyFilter", () => {
  beforeEach(() => {
    (RedundancyFilter as any).instance = null;
    queryRawResult = [];
    executeRawCalls = [];
    executeRawResults = [];
  });

  // ── findDuplicates ────────────────────────────────────────────────────────

  describe("findDuplicates", () => {
    test("returns empty when no rows", async () => {
      queryRawResult = [];
      const filter = RedundancyFilter.getInstance();
      const pairs = await filter.findDuplicates();
      expect(pairs).toEqual([]);
    });

    test("skips rows with null embedding", async () => {
      queryRawResult = [
        { ...makeRow("a", [1, 0, 0, 0]), embedding: null },
        makeRow("b", [0, 1, 0, 0]),
      ];
      const filter = RedundancyFilter.getInstance();
      const pairs = await filter.findDuplicates();
      expect(pairs).toEqual([]);
    });

    test("skips rows with zero-norm embedding", async () => {
      queryRawResult = [
        makeRow("a", [0, 0, 0, 0]), // zero norm
        makeRow("b", [1, 0, 0, 0]),
      ];
      const filter = RedundancyFilter.getInstance();
      const pairs = await filter.findDuplicates();
      expect(pairs).toEqual([]);
    });

    test("finds near-duplicate pairs above threshold", async () => {
      const vec = [1, 0, 0, 0];
      queryRawResult = [
        makeRow("a", vec, { importance: 0.9, access_count: 10 }),
        makeRow("b", vec, { importance: 0.5, access_count: 5 }),
      ];
      const filter = RedundancyFilter.getInstance();
      const pairs = await filter.findDuplicates(0.95);
      expect(pairs.length).toBe(1);
      expect(pairs[0].keepId).toBe("a"); // higher importance
      expect(pairs[0].removeId).toBe("b");
      expect(pairs[0].similarity).toBeCloseTo(1.0, 2);
      expect(pairs[0].reason).toBe("Higher importance");
    });

    test("uses access count when importance is equal", async () => {
      const vec = [1, 0, 0, 0];
      queryRawResult = [
        makeRow("a", vec, { importance: 0.7, access_count: 20 }),
        makeRow("b", vec, { importance: 0.7, access_count: 5 }),
      ];
      const filter = RedundancyFilter.getInstance();
      const pairs = await filter.findDuplicates(0.95);
      expect(pairs.length).toBe(1);
      expect(pairs[0].keepId).toBe("a"); // higher access
      expect(pairs[0].removeId).toBe("b");
      expect(pairs[0].reason).toBe("Higher access count");
    });

    test("skips pairs with mismatched vector lengths", async () => {
      queryRawResult = [
        makeRow("a", [1, 0, 0, 0]),
        makeRow("b", [1, 0, 0, 0, 0, 0, 0, 0]), // different length
      ];
      const filter = RedundancyFilter.getInstance();
      const pairs = await filter.findDuplicates(0.95);
      expect(pairs).toEqual([]);
    });

    test("groups by type (only compares same type)", async () => {
      const vec = [1, 0, 0, 0];
      queryRawResult = [
        makeRow("a", vec, { type: "decision" }),
        makeRow("b", vec, { type: "pattern" }), // different type
      ];
      const filter = RedundancyFilter.getInstance();
      const pairs = await filter.findDuplicates(0.95);
      expect(pairs).toEqual([]);
    });

    test("removes already-removed ids from subsequent pairs", async () => {
      const vec = [1, 0, 0, 0];
      queryRawResult = [
        makeRow("a", vec, { importance: 0.9 }),
        makeRow("b", vec, { importance: 0.8 }),
        makeRow("c", vec, { importance: 0.7 }),
      ];
      const filter = RedundancyFilter.getInstance();
      const pairs = await filter.findDuplicates(0.95);
      // a vs b → b removed; a vs c → c removed
      expect(pairs.length).toBe(2);
      expect(pairs[0].removeId).toBe("b");
      expect(pairs[1].removeId).toBe("c");
    });

    test("respects threshold (low threshold finds more)", async () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [0.9, 0.1, 0, 0]; // cosine ~0.99
      queryRawResult = [
        makeRow("a", vec1, { importance: 0.9 }),
        makeRow("b", vec2, { importance: 0.8 }),
      ];
      const filter = RedundancyFilter.getInstance();
      const pairsHigh = await filter.findDuplicates(0.999);
      const pairsLow = await filter.findDuplicates(0.95);
      expect(pairsHigh.length).toBe(0);
      expect(pairsLow.length).toBe(1);
    });
  });

  // ── mergeDuplicates ───────────────────────────────────────────────────────

  describe("mergeDuplicates", () => {
    test("returns zero results when pairs is empty", async () => {
      const filter = RedundancyFilter.getInstance();
      const result = await filter.mergeDuplicates([]);
      expect(result).toEqual({ merged: 0, edgesTransferred: 0, accessCountsBoosted: 0 });
    });

    test("merges pairs and returns counts", async () => {
      queryRawResult = [{ content: "content b", access_count: 5 }];
      executeRawResults = [3, 1, 1, 1]; // moved edges, delete edges, update, delete mem
      const filter = RedundancyFilter.getInstance();
      const result = await filter.mergeDuplicates([
        { keepId: "a", removeId: "b", similarity: 0.99, reason: "test" },
      ]);
      expect(result.merged).toBe(1);
      expect(result.edgesTransferred).toBe(3);
      expect(result.accessCountsBoosted).toBe(1);
    });

    test("skips pair when removeId not found in DB", async () => {
      queryRawResult = []; // no row found
      const filter = RedundancyFilter.getInstance();
      const result = await filter.mergeDuplicates([
        { keepId: "a", removeId: "missing", similarity: 0.99, reason: "test" },
      ]);
      expect(result.merged).toBe(0);
      expect(result.edgesTransferred).toBe(0);
      expect(result.accessCountsBoosted).toBe(0);
    });

    test("does not boost access count when removed row had 0 access", async () => {
      queryRawResult = [{ content: "content b", access_count: 0 }];
      executeRawResults = [0, 1, 1, 1];
      const filter = RedundancyFilter.getInstance();
      const result = await filter.mergeDuplicates([
        { keepId: "a", removeId: "b", similarity: 0.99, reason: "test" },
      ]);
      expect(result.merged).toBe(1);
      expect(result.accessCountsBoosted).toBe(0);
    });
  });

  // ── runCleanup ─────────────────────────────────────────────────────────────

  describe("runCleanup", () => {
    test("returns cleanup stats with duration", async () => {
      queryRawResult = []; // no duplicates found
      const filter = RedundancyFilter.getInstance();
      const stats = await filter.runCleanup();
      expect(stats.duplicatesFound).toBe(0);
      expect(stats.merged).toBe(0);
      expect(stats.edgesTransferred).toBe(0);
      expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    });

    test("finds and merges duplicates in one call", async () => {
      const vec = [1, 0, 0, 0];
      queryRawResult = [
        makeRow("a", vec, { importance: 0.9 }),
        makeRow("b", vec, { importance: 0.8 }),
      ];
      executeRawResults = [2, 1, 1, 1];
      const filter = RedundancyFilter.getInstance();
      const stats = await filter.runCleanup(0.95);
      expect(stats.duplicatesFound).toBe(1);
      expect(stats.merged).toBe(1);
      expect(stats.edgesTransferred).toBe(2);
    });
  });

  // ── close ─────────────────────────────────────────────────────────────────

  describe("close", () => {
    test("resets the singleton instance", () => {
      const filter = RedundancyFilter.getInstance();
      filter.close();
      expect((RedundancyFilter as any).instance).toBeNull();
    });
  });

  // ── getInstance ───────────────────────────────────────────────────────────

  describe("getInstance", () => {
    test("returns the same instance on repeated calls", () => {
      const a = RedundancyFilter.getInstance();
      const b = RedundancyFilter.getInstance();
      expect(a).toBe(b);
      a.close();
    });
  });
});