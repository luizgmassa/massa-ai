/**
 * EmbeddingService unit tests — mocks createEmbeddingProvider to avoid real
 * provider initialization. Covers init success/fallback, embed (provider/null/
 * production-throw), embedBatch, getDimensions, getProviderInfo, getSimilarity.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import type { EmbeddingProvider } from "../services/embeddings/provider.js";

// Mock the embeddings index module so createEmbeddingProvider returns a stub.
let mockProvider: EmbeddingProvider | null = null;
let initShouldThrow = false;

mock.module("../services/embeddings/index.js", () => ({
  createEmbeddingProvider: async () => {
    if (initShouldThrow) throw new Error("no providers available");
    return mockProvider;
  },
}));

// Import AFTER mock.module so the service sees the mocked factory.
const { EmbeddingService } = await import("../services/embeddings/embedding-service.js");

function makeProvider(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    id: "test-provider",
    model: "test-model",
    dimensions: 8,
    async embedQuery(text: string): Promise<number[]> {
      return Array(8).fill(text.length);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return texts.map((t) => Array(8).fill(t.length));
    },
    async isAvailable(): Promise<boolean> {
      return true;
    },
    getConfig(): any {
      return { provider: "test", model: "test-model", priority: 1, dimensions: 8 };
    },
    ...overrides,
  };
}

afterEach(() => {
  mockProvider = null;
  initShouldThrow = false;
  mock.restore();
});

describe("EmbeddingService", () => {
  test("embed uses provider when initialized successfully", async () => {
    mockProvider = makeProvider();
    const service = new EmbeddingService();
    const result = await service.embed("hello");
    expect(result).toEqual(Array(8).fill(5));
  });

  test("embedBatch uses provider when initialized successfully", async () => {
    mockProvider = makeProvider();
    const service = new EmbeddingService();
    const results = await service.embedBatch(["a", "bb"]);
    expect(results).toEqual([Array(8).fill(1), Array(8).fill(2)]);
  });

  test("embed falls back to random embeddings in non-production when init fails", async () => {
    initShouldThrow = true;
    const service = new EmbeddingService();
    const result = await service.embed("test");
    expect(result).toHaveLength(384);
    // Random values should not all be the same.
    const allSame = result.every((v) => v === result[0]);
    expect(allSame).toBe(false);
  });

  test("embedBatch falls back to random embeddings in non-production when init fails", async () => {
    initShouldThrow = true;
    const service = new EmbeddingService();
    const results = await service.embedBatch(["a", "b"]);
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveLength(384);
    expect(results[1]).toHaveLength(384);
  });

  test("embed throws in production when no provider available", async () => {
    initShouldThrow = true;
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const service = new EmbeddingService();
      await expect(service.embed("test")).rejects.toThrow("No embedding provider available");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test("embedBatch throws in production when no provider available", async () => {
    initShouldThrow = true;
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const service = new EmbeddingService();
      await expect(service.embedBatch(["a"])).rejects.toThrow("No embedding provider available");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test("embed rethrows provider errors", async () => {
    mockProvider = makeProvider({
      embedQuery: async () => { throw new Error("provider down"); },
    });
    const service = new EmbeddingService();
    await expect(service.embed("x")).rejects.toThrow("provider down");
  });

  test("embedBatch rethrows provider errors", async () => {
    mockProvider = makeProvider({
      embedBatch: async () => { throw new Error("batch down"); },
    });
    const service = new EmbeddingService();
    await expect(service.embedBatch(["x"])).rejects.toThrow("batch down");
  });

  test("getDimensions returns provider dimensions when initialized", async () => {
    mockProvider = makeProvider({ dimensions: 1536 });
    const service = new EmbeddingService();
    await service.embed("init"); // Trigger init.
    expect(service.getDimensions()).toBe(1536);
  });

  test("getDimensions returns 384 fallback when no provider", async () => {
    initShouldThrow = true;
    const service = new EmbeddingService();
    await service.embed("init"); // Trigger fallback init.
    expect(service.getDimensions()).toBe(384);
  });

  test("getProviderInfo returns id/model when initialized", async () => {
    mockProvider = makeProvider({ id: "ollama", model: "qwen3" });
    const service = new EmbeddingService();
    await service.embed("init");
    const info = service.getProviderInfo();
    expect(info).not.toBeNull();
    expect(info!.id).toBe("ollama");
    expect(info!.model).toBe("qwen3");
  });

  test("getProviderInfo returns null when no provider", async () => {
    initShouldThrow = true;
    const service = new EmbeddingService();
    await service.embed("init");
    expect(service.getProviderInfo()).toBeNull();
  });

  test("getSimilarity computes cosine similarity correctly", () => {
    const service = new EmbeddingService();
    // Identical vectors → similarity 1.
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(service.getSimilarity(a, b)).toBeCloseTo(1, 5);
    // Orthogonal vectors → similarity 0.
    const c = [1, 0, 0];
    const d = [0, 1, 0];
    expect(service.getSimilarity(c, d)).toBeCloseTo(0, 5);
    // Opposite vectors → similarity -1.
    const e = [1, 0];
    const f = [-1, 0];
    expect(service.getSimilarity(e, f)).toBeCloseTo(-1, 5);
  });
});