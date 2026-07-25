/**
 * Unit tests for BaseVectorStore
 *
 * Tests the abstract base class functionality:
 * - Cosine similarity calculation
 * - Distance/similarity conversion utilities
 * - Thread-safe lazy loading verification
 * 
 * NOTE: These tests focus on pure utility functions.
 * Integration tests with real embedding providers are separate.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock the embedding provider so tests don't require a running Ollama instance.
// Provider factory is controlled per-test via `currentProviderFactory`.
const fakeProvider = {
  dimensions: 384,
  async embedQuery(content: string): Promise<number[]> {
    return [content.length];
  },
  async embedBatch(contents: string[]): Promise<number[][]> {
    return contents.map((c) => [c.length]);
  },
};
const failingProvider = {
  dimensions: 128,
  async embedQuery(): Promise<number[]> { throw new Error("embed failed"); },
  async embedBatch(): Promise<number[][]> { throw new Error("batch failed"); },
};
let currentProviderFactory: () => Promise<unknown> = () => Promise.resolve(fakeProvider);
mock.module("../services/embeddings/index.js", () => ({
  createEmbeddingProvider: mock(() => currentProviderFactory()),
}));

import { SearchResult, VectorDocument, VectorStoreStats, ProjectInfo, IVectorCollection } from "@massa-ai/shared";
import { BaseVectorStore } from "../data/vector/base-vector-store.js";

/**
 * Concrete implementation for testing abstract class
 * Exposes protected methods for testing
 */
class TestableVectorStore extends BaseVectorStore {
  // Track provider promise for race condition testing
  public getProviderPromise() {
    return (this as any).embeddingProviderPromise;
  }

  // Expose protected methods for testing
  public testCosineSimilarity(a: number[], b: number[]) {
    return this.cosineSimilarity(a, b);
  }

  public testDistanceToSimilarity(distance: number) {
    return this.distanceToSimilarity(distance);
  }

  public testSimilarityToDistance(similarity: number) {
    return this.similarityToDistance(similarity);
  }

  // Expose embedding-related protected methods for coverage
  public async testGetEmbeddingDimensions() {
    return this.getEmbeddingDimensions();
  }
  public async testEmbedContent(content: string) {
    return this.embedContent(content);
  }
  public async testEmbedBatch(contents: string[]) {
    return this.embedBatch(contents);
  }

  // Stub implementations for abstract methods
  async addDocument(id: string, content: string, metadata?: Record<string, unknown>): Promise<void> {}
  async addDocuments(documents: VectorDocument[]): Promise<void> {}
  async search(query: string, limit?: number, projectId?: string): Promise<SearchResult[]> { return []; }
  async searchByEmbedding(embedding: number[], limit?: number, projectId?: string): Promise<SearchResult[]> { return []; }
  async delete(id: string): Promise<boolean> { return true; }
  async deleteByProject(projectId: string): Promise<number> { return 0; }
  async update(id: string, content: string, metadata?: Record<string, unknown>): Promise<void> {}
  async getCollection(name: string): Promise<IVectorCollection> { return {} as IVectorCollection; }
  async getStats(projectId?: string): Promise<VectorStoreStats> { return { totalDocuments: 0, totalSize: 0 }; }
  async listProjects(): Promise<ProjectInfo[]> { return []; }
  async healthCheck(): Promise<boolean> { return true; }
  async close(): Promise<void> {}
}

describe("BaseVectorStore", () => {
  // ── Cosine Similarity Tests ────────────────────────────────
  describe("cosineSimilarity", () => {
    test("returns 1 for identical vectors", () => {
      const store = new TestableVectorStore();
      const vectorA = [1, 0, 0];
      const vectorB = [1, 0, 0];
      
      const similarity = store.testCosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBeCloseTo(1, 5);
    });

    test("returns 0 for orthogonal vectors", () => {
      const store = new TestableVectorStore();
      const vectorA = [1, 0, 0];
      const vectorB = [0, 1, 0];
      
      const similarity = store.testCosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBeCloseTo(0, 5);
    });

    test("returns -1 for opposite vectors", () => {
      const store = new TestableVectorStore();
      const vectorA = [1, 0, 0];
      const vectorB = [-1, 0, 0];
      
      const similarity = store.testCosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBeCloseTo(-1, 5);
    });

    test("handles normalized vectors correctly (45 degrees)", () => {
      const store = new TestableVectorStore();
      // Two normalized vectors at 45 degrees
      const vectorA = [Math.sqrt(2) / 2, Math.sqrt(2) / 2, 0];
      const vectorB = [1, 0, 0];
      
      const similarity = store.testCosineSimilarity(vectorA, vectorB);
      
      // cos(45°) ≈ 0.707
      expect(similarity).toBeCloseTo(Math.sqrt(2) / 2, 5);
    });

    test("returns 0 for zero vector", () => {
      const store = new TestableVectorStore();
      const vectorA = [0, 0, 0];
      const vectorB = [1, 0, 0];
      
      const similarity = store.testCosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBe(0);
    });

    test("works with high-dimensional vectors (384)", () => {
      const store = new TestableVectorStore();
      const dim = 384;
      const vectorA = new Array(dim).fill(0.1);
      const vectorB = new Array(dim).fill(0.1);
      
      const similarity = store.testCosineSimilarity(vectorA, vectorB);
      
      // Identical vectors should have similarity 1
      expect(similarity).toBeCloseTo(1, 5);
    });

    test("works with high-dimensional vectors (1024)", () => {
      const store = new TestableVectorStore();
      const dim = 1024;
      const vectorA = new Array(dim).fill(0.5);
      const vectorB = new Array(dim).fill(0.5);
      
      const similarity = store.testCosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBeCloseTo(1, 5);
    });

    test("correctly differentiates similar vs dissimilar vectors", () => {
      const store = new TestableVectorStore();
      
      // Two similar vectors
      const vectorA = [0.9, 0.1, 0.05];
      const vectorB = [0.85, 0.15, 0.1];
      
      // Two dissimilar vectors  
      const vectorC = [0.1, 0.9, 0.05];
      
      const similarityAB = store.testCosineSimilarity(vectorA, vectorB);
      const similarityAC = store.testCosineSimilarity(vectorA, vectorC);
      
      // A and B should be more similar than A and C
      expect(similarityAB).toBeGreaterThan(similarityAC);
    });
  });

  // ── Distance/Similarity Conversion Tests ───────────────────
  describe("distanceToSimilarity", () => {
    test("converts distance 0 to similarity 1 (identical)", () => {
      const store = new TestableVectorStore();
      
      expect(store.testDistanceToSimilarity(0)).toBe(1);
    });

    test("converts distance 1 to similarity 0 (orthogonal)", () => {
      const store = new TestableVectorStore();
      
      expect(store.testDistanceToSimilarity(1)).toBe(0);
    });

    test("converts distance 2 to similarity 0 (clamped, opposite)", () => {
      const store = new TestableVectorStore();
      
      // Distance 2 would give -1, but we clamp to 0
      expect(store.testDistanceToSimilarity(2)).toBe(0);
    });

    test("handles intermediate values", () => {
      const store = new TestableVectorStore();
      
      expect(store.testDistanceToSimilarity(0.5)).toBe(0.5);
      expect(store.testDistanceToSimilarity(0.3)).toBeCloseTo(0.7, 5);
      expect(store.testDistanceToSimilarity(0.8)).toBeCloseTo(0.2, 5);
    });

    test("clamps negative results to 0", () => {
      const store = new TestableVectorStore();
      
      // Any distance > 1 should clamp to 0
      expect(store.testDistanceToSimilarity(1.5)).toBe(0);
      expect(store.testDistanceToSimilarity(3)).toBe(0);
    });
  });

  describe("similarityToDistance", () => {
    test("converts similarity 1 to distance 0", () => {
      const store = new TestableVectorStore();
      
      expect(store.testSimilarityToDistance(1)).toBe(0);
    });

    test("converts similarity 0 to distance 1", () => {
      const store = new TestableVectorStore();
      
      expect(store.testSimilarityToDistance(0)).toBe(1);
    });

    test("handles intermediate values", () => {
      const store = new TestableVectorStore();
      
      expect(store.testSimilarityToDistance(0.5)).toBe(0.5);
      expect(store.testSimilarityToDistance(0.7)).toBeCloseTo(0.3, 5);
    });

    test("is inverse of distanceToSimilarity", () => {
      const store = new TestableVectorStore();
      
      const testValues = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1];
      
      for (const distance of testValues) {
        const similarity = store.testDistanceToSimilarity(distance);
        const backToDistance = store.testSimilarityToDistance(similarity);
        
        expect(backToDistance).toBeCloseTo(distance, 5);
      }
    });
  });

  // ── Promise Sharing (Race Condition Prevention) ────────────
  describe("thread-safe lazy loading", () => {
    test("provider promise is null initially", () => {
      const store = new TestableVectorStore();
      
      expect(store.getProviderPromise()).toBeNull();
    });

    test("provider promise is shared across calls", async () => {
      const store = new TestableVectorStore();
      
      // Access the protected method to trigger lazy loading
      const getProvider = () => (store as any).getEmbeddingProvider();
      
      // Make concurrent calls
      const promise1 = getProvider();
      const promise2 = getProvider();
      
      // Both should return the same promise object
      expect(promise1).toBe(promise2);
    });
  });

  // ── Abstract Method Stubs ──────────────────────────────────
  describe("abstract methods", () => {
    test("subclass can implement all required methods", async () => {
      const store = new TestableVectorStore();
      
      // Verify stub implementations don't throw and return expected values
      await store.addDocument("id", "content");
      await store.addDocuments([]);
      expect(await store.search("query")).toEqual([]);
      expect(await store.searchByEmbedding([])).toEqual([]);
      expect(await store.delete("id")).toBe(true);
      expect(await store.deleteByProject("p")).toBe(0);
      await store.update("id", "content");
      expect(await store.getStats()).toEqual({ totalDocuments: 0, totalSize: 0 });
      expect(await store.listProjects()).toEqual([]);
      expect(await store.healthCheck()).toBe(true);
      await store.close();
    });
  });

  // ── Embedding helpers (success + error paths) ──────────────
  describe("embedding helpers", () => {
    beforeEach(() => {
      currentProviderFactory = () => Promise.resolve(fakeProvider);
    });

    test("getEmbeddingDimensions returns provider.dimensions", async () => {
      const store = new TestableVectorStore();
      expect(await store.testGetEmbeddingDimensions()).toBe(384);
    });

    test("embedContent returns the provider's embedding", async () => {
      const store = new TestableVectorStore();
      const vec = await store.testEmbedContent("hello world");
      expect(vec).toEqual([11]);
    });

    test("embedContent rethrows on provider failure", async () => {
      currentProviderFactory = () => Promise.resolve(failingProvider);
      const store = new TestableVectorStore();
      expect(store.testEmbedContent("boom")).rejects.toThrow("embed failed");
    });

    test("embedBatch returns the provider's batch embeddings", async () => {
      const store = new TestableVectorStore();
      const vecs = await store.testEmbedBatch(["ab", "cde"]);
      expect(vecs).toEqual([[2], [3]]);
    });

    test("embedBatch rethrows on provider failure", async () => {
      currentProviderFactory = () => Promise.resolve(failingProvider);
      const store = new TestableVectorStore();
      expect(store.testEmbedBatch(["x"])).rejects.toThrow("batch failed");
    });
  });
});
