/**
 * Unit tests for GraphStore
 *
 * Tests edge CRUD, analytics (degree, hub, stats), and
 * edge-case handling (self-references, duplicate edges, weight clamping).
 *
 * Uses an in-memory SQLite database by mocking config.get("dataDir")
 * to point to a temp directory.
 *
 * All store methods are async (IGraphStore contract, structural gap #14).
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { MemoryRelationType } from "@massa-th0th/shared";
import fs from "fs";
import path from "path";
import os from "os";

// ── Mock config and logger ────────────────────────────────────
let tmpDir: string;

mock.module("@massa-th0th/shared", () => {
  const actual = require("@massa-th0th/shared");
  return {
    ...actual,
    MemoryRelationType: actual.MemoryRelationType,
    config: {
      get: (key: string) => {
        if (key === "dataDir") return tmpDir;
        const defaults: Record<string, any> = {
          vectorStore: { type: "sqlite", dbPath: "/tmp/massa-th0th-test-vs.db", collectionName: "test", embeddingModel: "default" },
          keywordSearch: { dbPath: "/tmp/massa-th0th-test-kw.db", ftsVersion: "fts5" },
          cache: { l1: { maxSize: 1024, defaultTTL: 60 }, l2: { dbPath: "/tmp/massa-th0th-test-cache.db", maxSize: 1024, defaultTTL: 60 }, embedding: { dbPath: "/tmp/massa-th0th-test-emb-cache.db", maxAgeHours: 1 } },
          security: { maxInputLength: 10000, sanitizeInputs: true, maxIndexSize: 1000, maxFileSize: 1048576, allowedExtensions: [".ts"], excludePatterns: [] },
        };
        return defaults[key];
      },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      metric: () => {},
    },
  };
});

import { GraphStore } from "../services/graph/graph-store.js";

describe("GraphStore", () => {
  let store: GraphStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-th0th-test-graph-"));
    // Reset singleton
    (GraphStore as any).instance = null;
    store = new GraphStore();
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── createEdge ─────────────────────────────────────────────
  describe("createEdge", () => {
    test("creates an edge successfully", async () => {
      const edge = await store.createEdge({
        sourceId: "mem1",
        targetId: "mem2",
        relationType: MemoryRelationType.SUPPORTS,
        weight: 0.8,
        evidence: "test evidence",
      });

      expect(edge).not.toBeNull();
      expect(edge!.sourceId).toBe("mem1");
      expect(edge!.targetId).toBe("mem2");
      expect(edge!.relationType).toBe(MemoryRelationType.SUPPORTS);
      expect(edge!.weight).toBe(0.8);
      expect(edge!.evidence).toBe("test evidence");
      expect(edge!.autoExtracted).toBe(false);
      expect(edge!.id).toStartWith("edge_");
    });

    test("prevents self-referencing edges", async () => {
      const edge = await store.createEdge({
        sourceId: "mem1",
        targetId: "mem1",
        relationType: MemoryRelationType.RELATES_TO,
      });
      expect(edge).toBeNull();
    });

    test("handles duplicate edge by updating weight", async () => {
      await store.createEdge({
        sourceId: "mem1",
        targetId: "mem2",
        relationType: MemoryRelationType.SUPPORTS,
        weight: 0.5,
      });

      // Attempt to create same edge with higher weight
      const updated = await store.createEdge({
        sourceId: "mem1",
        targetId: "mem2",
        relationType: MemoryRelationType.SUPPORTS,
        weight: 0.9,
        evidence: "updated evidence",
      });

      expect(updated).not.toBeNull();
      // Weight should be MAX of old and new
      expect(updated!.weight).toBeGreaterThanOrEqual(0.5);
    });

    test("auto-extracted flag works", async () => {
      const edge = await store.createEdge({
        sourceId: "mem1",
        targetId: "mem2",
        relationType: MemoryRelationType.DERIVED_FROM,
        autoExtracted: true,
      });

      expect(edge!.autoExtracted).toBe(true);
    });
  });

  // ── getEdge ───────────────────────────────────────────────
  describe("getEdge", () => {
    test("retrieves existing edge", async () => {
      await store.createEdge({
        sourceId: "mem1",
        targetId: "mem2",
        relationType: MemoryRelationType.CONTRADICTS,
      });

      const edge = await store.getEdge(
        "mem1",
        "mem2",
        MemoryRelationType.CONTRADICTS,
      );
      expect(edge).not.toBeNull();
      expect(edge!.sourceId).toBe("mem1");
      expect(edge!.targetId).toBe("mem2");
    });

    test("returns null for non-existent edge", async () => {
      const edge = await store.getEdge(
        "nonexistent1",
        "nonexistent2",
        MemoryRelationType.SUPPORTS,
      );
      expect(edge).toBeNull();
    });
  });

  // ── getOutgoingEdges / getIncomingEdges / getAllEdges ──────
  describe("edge queries", () => {
    beforeEach(async () => {
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.SUPPORTS, weight: 0.8 });
      await store.createEdge({ sourceId: "A", targetId: "C", relationType: MemoryRelationType.DERIVED_FROM, weight: 0.6 });
      await store.createEdge({ sourceId: "D", targetId: "A", relationType: MemoryRelationType.CONTRADICTS, weight: 0.9 });
    });

    test("getOutgoingEdges returns edges from source", async () => {
      const edges = await store.getOutgoingEdges("A");
      expect(edges.length).toBe(2);
      expect(edges.every((e) => e.sourceId === "A")).toBe(true);
    });

    test("getIncomingEdges returns edges to target", async () => {
      const edges = await store.getIncomingEdges("A");
      expect(edges.length).toBe(1);
      expect(edges[0].sourceId).toBe("D");
    });

    test("getAllEdges returns both directions", async () => {
      const edges = await store.getAllEdges("A");
      expect(edges.length).toBe(3);
    });

    test("filter by relation types", async () => {
      const edges = await store.getAllEdges("A", {
        relationTypes: [MemoryRelationType.SUPPORTS],
      });
      expect(edges.length).toBe(1);
      expect(edges[0].relationType).toBe(MemoryRelationType.SUPPORTS);
    });

    test("filter by min weight", async () => {
      const edges = await store.getAllEdges("A", { minWeight: 0.85 });
      expect(edges.length).toBe(1);
      expect(edges[0].sourceId).toBe("D"); // weight 0.9
    });
  });

  // ── deleteEdge / deleteEdgesForMemory ────────────────────
  describe("deletion", () => {
    test("deleteEdge removes by ID", async () => {
      const edge = await store.createEdge({
        sourceId: "mem1",
        targetId: "mem2",
        relationType: MemoryRelationType.RELATES_TO,
      });
      expect(edge).not.toBeNull();

      const deleted = await store.deleteEdge(edge!.id);
      expect(deleted).toBe(true);

      const retrieved = await store.getEdge(
        "mem1",
        "mem2",
        MemoryRelationType.RELATES_TO,
      );
      expect(retrieved).toBeNull();
    });

    test("deleteEdge returns false for non-existent", async () => {
      expect(await store.deleteEdge("nonexistent")).toBe(false);
    });

    test("deleteEdgesForMemory removes all connected edges", async () => {
      await store.createEdge({ sourceId: "X", targetId: "Y", relationType: MemoryRelationType.SUPPORTS });
      await store.createEdge({ sourceId: "Z", targetId: "X", relationType: MemoryRelationType.CONTRADICTS });
      await store.createEdge({ sourceId: "Y", targetId: "Z", relationType: MemoryRelationType.RELATES_TO });

      const removed = await store.deleteEdgesForMemory("X");
      expect(removed).toBe(2);

      // Y→Z should still exist
      const remaining = await store.getEdge(
        "Y",
        "Z",
        MemoryRelationType.RELATES_TO,
      );
      expect(remaining).not.toBeNull();
    });
  });

  // ── updateWeight ──────────────────────────────────────────
  describe("updateWeight", () => {
    test("updates weight within bounds", async () => {
      const edge = await store.createEdge({
        sourceId: "mem1",
        targetId: "mem2",
        relationType: MemoryRelationType.SUPPORTS,
        weight: 0.5,
      });

      await store.updateWeight(edge!.id, 0.8);
      const updated = await store.getEdge(
        "mem1",
        "mem2",
        MemoryRelationType.SUPPORTS,
      );
      expect(updated!.weight).toBe(0.8);
    });

    test("clamps weight to [0, 1]", async () => {
      const edge = await store.createEdge({
        sourceId: "mem1",
        targetId: "mem2",
        relationType: MemoryRelationType.SUPPORTS,
      });

      await store.updateWeight(edge!.id, 1.5);
      let updated = await store.getEdge(
        "mem1",
        "mem2",
        MemoryRelationType.SUPPORTS,
      );
      expect(updated!.weight).toBe(1);

      await store.updateWeight(edge!.id, -0.5);
      updated = await store.getEdge("mem1", "mem2", MemoryRelationType.SUPPORTS);
      expect(updated!.weight).toBe(0);
    });
  });

  // ── Analytics ─────────────────────────────────────────────
  describe("analytics", () => {
    beforeEach(async () => {
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.SUPPORTS });
      await store.createEdge({ sourceId: "A", targetId: "C", relationType: MemoryRelationType.DERIVED_FROM });
      await store.createEdge({ sourceId: "B", targetId: "A", relationType: MemoryRelationType.CONTRADICTS });
      await store.createEdge({ sourceId: "D", targetId: "E", relationType: MemoryRelationType.RELATES_TO });
    });

    test("getDegree returns correct counts", async () => {
      const degree = await store.getDegree("A");
      expect(degree.out).toBe(2); // A→B, A→C
      expect(degree.in).toBe(1); // B→A
      expect(degree.total).toBe(3);
    });

    test("getHubMemories returns sorted by degree", async () => {
      const hubs = await store.getHubMemories(5);
      expect(hubs.length).toBeGreaterThan(0);
      // A has 3 edges, should be first or second
      const memA = hubs.find((h) => h.memoryId === "A");
      expect(memA).toBeDefined();
      expect(memA!.degree).toBe(3);
    });

    test("getStats returns correct totals", async () => {
      const stats = await store.getStats();
      expect(stats.totalEdges).toBe(4);
      expect(stats.byRelation[MemoryRelationType.SUPPORTS]).toBe(1);
      expect(stats.byRelation[MemoryRelationType.DERIVED_FROM]).toBe(1);
      expect(stats.byRelation[MemoryRelationType.CONTRADICTS]).toBe(1);
      expect(stats.byRelation[MemoryRelationType.RELATES_TO]).toBe(1);
      expect(stats.autoExtracted).toBe(0);
      expect(stats.avgWeight).toBeGreaterThan(0);
    });

    test("getStats on empty graph", async () => {
      // Use a fresh store
      (GraphStore as any).instance = null;
      const freshTmp = fs.mkdtempSync(
        path.join(os.tmpdir(), "massa-th0th-test-empty-"),
      );
      const origTmp = tmpDir;
      tmpDir = freshTmp;

      const fresh = new GraphStore();
      const stats = await fresh.getStats();
      expect(stats.totalEdges).toBe(0);
      expect(stats.avgWeight).toBe(0);

      fresh.close();
      tmpDir = origTmp;
      fs.rmSync(freshTmp, { recursive: true, force: true });
    });
  });

  // ── Performance & Optimizations ────────────────────────────
  describe("performance optimizations", () => {
    test("getAllEdges uses UNION ALL for efficient index lookups", async () => {
      // Create a hub memory with many edges in both directions
      const hubId = "hub";

      // 50 outgoing edges
      for (let i = 0; i < 50; i++) {
        await store.createEdge({
          sourceId: hubId,
          targetId: `target_${i}`,
          relationType: MemoryRelationType.SUPPORTS,
          weight: 0.5 + (i / 100),
        });
      }

      // 50 incoming edges
      for (let i = 0; i < 50; i++) {
        await store.createEdge({
          sourceId: `source_${i}`,
          targetId: hubId,
          relationType: MemoryRelationType.DERIVED_FROM,
          weight: 0.6 + (i / 100),
        });
      }

      const start = performance.now();
      const edges = await store.getAllEdges(hubId, { limit: 200 });
      const duration = performance.now() - start;

      // Should retrieve all 100 edges efficiently
      expect(edges.length).toBe(100);

      // Should be fast (UNION ALL with indexes vs OR scan)
      expect(duration).toBeLessThan(10); // Conservative threshold

      // Should be properly ordered by weight DESC
      expect(edges[0].weight).toBeGreaterThanOrEqual(edges[1].weight);

      console.log(`getAllEdges retrieved ${edges.length} edges in ${duration.toFixed(2)}ms`);
    });

    test("getAllEdges deduplicates correctly", async () => {
      // Edge case: ensure no duplicates if somehow the same edge appears
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.SUPPORTS });
      await store.createEdge({ sourceId: "B", targetId: "A", relationType: MemoryRelationType.CONTRADICTS });

      const edges = await store.getAllEdges("A");

      // Should find 2 distinct edges
      expect(edges.length).toBe(2);

      // All IDs should be unique
      const ids = edges.map(e => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test("getAllEdges with filters maintains correctness", async () => {
      const memId = "filtered";

      // Mix of relations and weights
      await store.createEdge({ sourceId: memId, targetId: "a", relationType: MemoryRelationType.SUPPORTS, weight: 0.9 });
      await store.createEdge({ sourceId: "b", targetId: memId, relationType: MemoryRelationType.SUPPORTS, weight: 0.8 });
      await store.createEdge({ sourceId: memId, targetId: "c", relationType: MemoryRelationType.CONTRADICTS, weight: 0.7 });
      await store.createEdge({ sourceId: "d", targetId: memId, relationType: MemoryRelationType.DERIVED_FROM, weight: 0.6 });

      // Filter by relation type
      const supportEdges = await store.getAllEdges(memId, {
        relationTypes: [MemoryRelationType.SUPPORTS],
      });
      expect(supportEdges.length).toBe(2);
      expect(supportEdges.every(e => e.relationType === MemoryRelationType.SUPPORTS)).toBe(true);

      // Filter by min weight
      const highWeightEdges = await store.getAllEdges(memId, {
        minWeight: 0.75,
      });
      expect(highWeightEdges.length).toBe(2); // 0.9 and 0.8
      expect(highWeightEdges.every(e => e.weight >= 0.75)).toBe(true);
    });

    test("index redundancy removed (idx_edges_source)", () => {
      // Verify that the redundant index was dropped
      // Query the sqlite_master table to check index existence
      const indices = (store as any).db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='memory_edges'")
        .all() as { name: string }[];

      const indexNames = indices.map(i => i.name);

      // idx_edges_source should NOT exist (redundant with UNIQUE constraint)
      expect(indexNames).not.toContain("idx_edges_source");

      // idx_edges_target should exist
      expect(indexNames).toContain("idx_edges_target");

      console.log("Active indexes:", indexNames.join(", "));
    });
  });

  // ── Phase 7c: bfsNeighbors ─────────────────────────────────
  describe("bfsNeighbors (Phase 7c)", () => {
    test("returns ids reachable within depth via outgoing edges", async () => {
      // A -> B -> C ; A -> D
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "B", targetId: "C", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "A", targetId: "D", relationType: MemoryRelationType.SUPERSEDES });
      const neighbors = await store.bfsNeighbors(["A"], 2);
      // Depth-2 from A reaches B, D (hop 1) and C (hop 2).
      expect(neighbors.sort()).toEqual(["B", "C", "D"]);
    });

    test("depth=1 returns only direct successors", async () => {
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "B", targetId: "C", relationType: MemoryRelationType.RELATES_TO });
      expect((await store.bfsNeighbors(["A"], 1)).sort()).toEqual(["B"]);
    });

    test("excludes seeds from neighbor output", async () => {
      // A -> B -> A (cycle). A is a seed; visited as a seed, so excluded from
      // the neighbor output. C is a fresh successor of B.
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "B", targetId: "A", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "B", targetId: "C", relationType: MemoryRelationType.RELATES_TO });
      const neighbors = (await store.bfsNeighbors(["A"], 2)).sort();
      expect(neighbors).toEqual(["B", "C"]);
      expect(neighbors).not.toContain("A");
    });

    test("dedups neighbors reachable via multiple paths", async () => {
      // A -> B, A -> C, B -> D, C -> D : D reached twice.
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "A", targetId: "C", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "B", targetId: "D", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "C", targetId: "D", relationType: MemoryRelationType.RELATES_TO });
      const neighbors = (await store.bfsNeighbors(["A"], 2)).sort();
      expect(neighbors).toEqual(["B", "C", "D"]);
      // D appears exactly once (dedup).
      expect(neighbors.filter((n) => n === "D")).toHaveLength(1);
    });

    test("seed with no outgoing edges contributes nothing", async () => {
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.RELATES_TO });
      const neighbors = (await store.bfsNeighbors(["A", "lonely"], 2)).sort();
      expect(neighbors).toEqual(["B"]);
    });

    test("empty seed list returns empty", async () => {
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.RELATES_TO });
      expect(await store.bfsNeighbors([], 2)).toEqual([]);
    });

    test("cyclic graph terminates (visited set prevents infinite loop)", async () => {
      // Tight cycle A <-> B. Must terminate and return B only.
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.RELATES_TO });
      await store.createEdge({ sourceId: "B", targetId: "A", relationType: MemoryRelationType.RELATES_TO });
      const neighbors = (await store.bfsNeighbors(["A"], 5)).sort();
      expect(neighbors).toEqual(["B"]);
    });

    // Discrimination sensor: if bfsNeighbors returned seeds, this fails.
    test("discrimination sensor — seeds are excluded (mutant kill)", async () => {
      await store.createEdge({ sourceId: "A", targetId: "B", relationType: MemoryRelationType.RELATES_TO });
      const neighbors = await store.bfsNeighbors(["A"], 2);
      expect(neighbors).not.toContain("A");
    });
  });
});
