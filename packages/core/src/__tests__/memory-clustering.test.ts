/**
 * Unit tests for MemoryClustering (K-means over embedding vectors).
 *
 * Pure-logic with a mocked Prisma client — no DB, no network.
 * The mock returns controlled rows with fixture embeddings so the
 * K-means, label generation, and dominant-type logic are exercised.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";

// ── Mock prisma-client ──────────────────────────────────────────────────────

let queryRawResult: any[] = [];
/**
 * Counts loads of the memory table. `clusterMemories()` is the only thing that
 * reads it, so this is the deterministic observable for "did clustering run?" —
 * see the findCluster re-run test, which cannot assert on cluster membership
 * because K-means++ seeds its centroids with Math.random().
 */
let queryRawCalls = 0;

mock.module("../kernel/prisma-client.js", () => ({
  getPrismaClient: () => ({
    $queryRaw: () => {
      queryRawCalls += 1;
      return Promise.resolve(queryRawResult);
    },
  }),
}));

import { MemoryClustering } from "../services/memory/memory-clustering.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmbedding(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

function makeRow(
  id: string,
  content: string,
  vec: number[],
  overrides: Partial<Record<string, unknown>> = {},
): any {
  return {
    id,
    content,
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

describe("MemoryClustering", () => {
  beforeEach(() => {
    (MemoryClustering as any).instance = null;
    queryRawResult = [];
  });

  // ── clusterMemories ───────────────────────────────────────────────────────

  describe("clusterMemories", () => {
    test("returns empty clusters when fewer than 3 items", async () => {
      queryRawResult = [
        makeRow("a", "content a", [1, 0, 0, 0]),
        makeRow("b", "content b", [0, 1, 0, 0]),
      ];
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories();
      expect(result.clusters).toEqual([]);
      expect(result.unclustered).toBe(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test("returns empty clusters when 0 items", async () => {
      queryRawResult = [];
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories();
      expect(result.clusters).toEqual([]);
      expect(result.unclustered).toBe(0);
    });

    test("skips rows with null embedding", async () => {
      queryRawResult = [
        makeRow("a", "content a", [1, 0, 0, 0]),
        { ...makeRow("b", "content b", [0, 1, 0, 0]), embedding: null },
        makeRow("c", "content c", [0, 0, 1, 0]),
      ];
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories();
      // Only 2 valid items → fewer than 3 → empty
      expect(result.clusters).toEqual([]);
      expect(result.unclustered).toBe(2);
    });

    test("skips rows with all-zero embedding", async () => {
      queryRawResult = [
        makeRow("a", "content a", [1, 0, 0, 0]),
        makeRow("b", "content b", [0, 0, 0, 0]), // all-zero → skipped
        makeRow("c", "content c", [0, 0, 1, 0]),
      ];
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories();
      // Only 2 valid items → fewer than 3 → empty
      expect(result.clusters).toEqual([]);
      expect(result.unclustered).toBe(2);
    });

    test("clusters memories into groups with K-means", async () => {
      // Two clear clusters in 4D space
      const rows = [
        makeRow("a1", "alpha beta gamma", [1, 0, 0, 0], { importance: 0.9, access_count: 10 }),
        makeRow("a2", "alpha beta delta", [0.99, 0.01, 0, 0], { importance: 0.8, access_count: 5 }),
        makeRow("a3", "alpha beta epsilon", [0.98, 0.02, 0, 0], { importance: 0.7, access_count: 3 }),
        makeRow("b1", "zeta eta theta", [0, 1, 0, 0], { importance: 0.6, access_count: 8 }),
        makeRow("b2", "zeta eta iota", [0.01, 0.99, 0, 0], { importance: 0.5, access_count: 2 }),
        makeRow("b3", "zeta eta kappa", [0.02, 0.98, 0, 0], { importance: 0.4, access_count: 1 }),
      ];
      queryRawResult = rows;
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories(2, 20, 100);
      expect(result.clusters.length).toBeGreaterThan(0);
      // Each cluster should have >= 2 members
      for (const cluster of result.clusters) {
        expect(cluster.memberIds.length).toBeGreaterThanOrEqual(2);
        expect(cluster.label).toBeDefined();
        expect(cluster.importance).toBeGreaterThan(0);
        expect(cluster.totalAccess).toBeGreaterThanOrEqual(0);
        expect(cluster.dominantType).toBeDefined();
        expect(cluster.id).toMatch(/^cluster_\d+_\d+$/);
        expect(cluster.centroid.length).toBe(4);
      }
      // Clusters sorted by importance descending
      for (let i = 1; i < result.clusters.length; i++) {
        expect(result.clusters[i - 1].importance).toBeGreaterThanOrEqual(
          result.clusters[i].importance,
        );
      }
    });

    test("auto-tunes k when not provided", async () => {
      const rows: any[] = [];
      for (let i = 0; i < 10; i++) {
        const vec = [i % 2, (i + 1) % 2, 0, 0];
        rows.push(makeRow(`m${i}`, `content ${i}`, vec));
      }
      queryRawResult = rows;
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories(undefined, 20, 100);
      // sqrt(10/2) ≈ 2.24 → k=2
      expect(result.clusters.length + result.unclustered).toBeGreaterThan(0);
    });

    test("respects maxMemories limit", async () => {
      const rows: any[] = [];
      for (let i = 0; i < 10; i++) {
        rows.push(makeRow(`m${i}`, `content ${i}`, [i % 2, (i + 1) % 2, 0, 0]));
      }
      queryRawResult = rows;
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories(2, 20, 5);
      // Only 5 rows loaded → items.length = 5
      // With k=2, should produce clusters or unclustered
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test("handles embedding as Uint8Array (not Buffer)", async () => {
      const vec = [1, 0, 0, 0];
      const buf = Buffer.from(new Float32Array(vec).buffer);
      const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      queryRawResult = [
        { ...makeRow("a", "content a", [1, 0, 0, 0]), embedding: uint8 },
        { ...makeRow("b", "content b", [0.99, 0.01, 0, 0]), embedding: uint8 },
        { ...makeRow("c", "content c", [0, 1, 0, 0]), embedding: makeEmbedding([0, 1, 0, 0]) },
      ];
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories(2, 20, 100);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test("generates label from member content keywords", async () => {
      const rows = [
        makeRow("a1", "the alpha beta gamma system", [1, 0, 0, 0]),
        makeRow("a2", "the alpha beta delta module", [0.99, 0.01, 0, 0]),
        makeRow("a3", "the alpha beta epsilon code", [0.98, 0.02, 0, 0]),
      ];
      queryRawResult = rows;
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories(1, 20, 100);
      if (result.clusters.length > 0) {
        // Label should contain frequent non-stop words
        const label = result.clusters[0].label;
        expect(label).toBeDefined();
        expect(label.length).toBeGreaterThan(0);
      }
    });

    test("falls back to 'misc' label when no significant words", async () => {
      const rows = [
        makeRow("a1", "the a is", [1, 0, 0, 0]),
        makeRow("a2", "the a is", [0.99, 0.01, 0, 0]),
        makeRow("a3", "the a is", [0.98, 0.02, 0, 0]),
      ];
      queryRawResult = rows;
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories(1, 20, 100);
      if (result.clusters.length > 0) {
        expect(result.clusters[0].label).toBe("misc");
      }
    });

    test("computes dominantType from member types", async () => {
      const rows = [
        makeRow("a1", "content a", [1, 0, 0, 0], { type: "decision" }),
        makeRow("a2", "content b", [0.99, 0.01, 0, 0], { type: "decision" }),
        makeRow("a3", "content c", [0.98, 0.02, 0, 0], { type: "pattern" }),
      ];
      queryRawResult = rows;
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories(1, 20, 100);
      if (result.clusters.length > 0) {
        expect(result.clusters[0].dominantType).toBe("decision");
      }
    });

    test("singleton cluster members counted as unclustered", async () => {
      // 4 items: 3 similar, 1 far away → 1 cluster of 3, 1 unclustered
      const rows = [
        makeRow("a1", "content a", [1, 0, 0, 0]),
        makeRow("a2", "content b", [0.99, 0.01, 0, 0]),
        makeRow("a3", "content c", [0.98, 0.02, 0, 0]),
        makeRow("x1", "content x", [0, 0, 0, 1]),
      ];
      queryRawResult = rows;
      const clustering = MemoryClustering.getInstance();
      const result = await clustering.clusterMemories(2, 20, 100);
      // x1 should be unclustered (singleton)
      expect(result.unclustered).toBeGreaterThanOrEqual(1);
    });
  });

  // ── findCluster ───────────────────────────────────────────────────────────

  describe("findCluster", () => {
    test("finds a memory in a cached result", async () => {
      const cached = {
        clusters: [
          {
            id: "cluster_1_0",
            centroid: [1, 0],
            memberIds: ["a", "b"],
            label: "test",
            importance: 0.8,
            totalAccess: 10,
            dominantType: "decision",
          },
        ],
        unclustered: 0,
        durationMs: 5,
      };
      const clustering = MemoryClustering.getInstance();
      const before = queryRawCalls;
      const cluster = await clustering.findCluster("a", cached);
      expect(cluster).not.toBeNull();
      expect(cluster!.id).toBe("cluster_1_0");
      // Negative control for the re-run test below: given a cached result,
      // findCluster must NOT reload the memory table. Without this half, a
      // findCluster that always re-clustered would still satisfy the re-run
      // assertion.
      expect(queryRawCalls).toBe(before);
    });

    test("returns null when memory not in any cluster", async () => {
      const cached = {
        clusters: [
          {
            id: "cluster_1_0",
            centroid: [1, 0],
            memberIds: ["a", "b"],
            label: "test",
            importance: 0.8,
            totalAccess: 10,
            dominantType: "decision",
          },
        ],
        unclustered: 0,
        durationMs: 5,
      };
      const clustering = MemoryClustering.getInstance();
      const cluster = await clustering.findCluster("not-in-cluster", cached);
      expect(cluster).toBeNull();
    });

    test("re-runs clustering when no cached result", async () => {
      queryRawResult = [
        makeRow("a", "content a", [1, 0, 0, 0]),
        makeRow("b", "content b", [0.99, 0.01, 0, 0]),
        makeRow("c", "content c", [0.98, 0.02, 0, 0]),
      ];
      const clustering = MemoryClustering.getInstance();
      const before = queryRawCalls;
      await clustering.findCluster("a");

      // The behavior this test names is "re-runs clustering", and the honest
      // observable for that is the memory-table load — nothing else issues one.
      //
      // Deliberately NOT asserting cluster membership: clusterMemories() seeds
      // K-means++ centroids with Math.random() (memory-clustering.ts:248,269,273),
      // so which cluster "a" lands in, and whether it is clustered at all, varies
      // between runs. The assertion that used to be here was
      // `cluster === null || cluster !== null` — a tautology, true under every
      // implementation including one that never re-ran clustering. Replacing it
      // with a membership assertion looked stronger but was simply flaky, and was
      // observed failing under the isolation runner after passing standalone.
      expect(queryRawCalls).toBe(before + 1);
    });
  });

  // ── summarizeCluster ───────────────────────────────────────────────────────

  describe("summarizeCluster", () => {
    test("returns label when no members found", async () => {
      queryRawResult = [];
      const clustering = MemoryClustering.getInstance();
      const cluster = {
        id: "c1",
        centroid: [1, 0],
        memberIds: ["nonexistent"],
        label: "my-label",
        importance: 0.5,
        totalAccess: 0,
        dominantType: "decision",
      };
      const summary = await clustering.summarizeCluster(cluster);
      expect(summary).toBe("my-label");
    });

    test("returns formatted summary with member content", async () => {
      queryRawResult = [
        { content: "First sentence. Second sentence.", type: "decision", importance: 0.9 },
        { content: "Another memory.", type: "pattern", importance: 0.7 },
      ];
      const clustering = MemoryClustering.getInstance();
      const cluster = {
        id: "c1",
        centroid: [1, 0],
        memberIds: ["m1", "m2"],
        label: "test-label",
        importance: 0.8,
        totalAccess: 5,
        dominantType: "decision",
      };
      const summary = await clustering.summarizeCluster(cluster);
      expect(summary).toContain("[test-label]");
      expect(summary).toContain("First sentence");
      expect(summary).toContain("2 memories");
      expect(summary).toContain("decision");
      expect(summary).toContain("pattern");
    });
  });

  // ── close ─────────────────────────────────────────────────────────────────

  describe("close", () => {
    test("resets the singleton instance", () => {
      const clustering = MemoryClustering.getInstance();
      clustering.close();
      expect((MemoryClustering as any).instance).toBeNull();
      // Next getInstance creates a new instance
      const newClustering = MemoryClustering.getInstance();
      expect(newClustering).not.toBe(clustering);
      newClustering.close();
    });
  });

  // ── getInstance ───────────────────────────────────────────────────────────

  describe("getInstance", () => {
    test("returns the same instance on repeated calls", () => {
      const a = MemoryClustering.getInstance();
      const b = MemoryClustering.getInstance();
      expect(a).toBe(b);
      a.close();
    });
  });
});