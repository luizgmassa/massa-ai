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

  // BUG-01: this case used to assert the defect -- that a missing provider
  // yields 384 random numbers outside production. It is rewritten, not
  // deleted, because it is the exact regression that must never come back.
  test("embed throws when no provider is available, outside production too", async () => {
    initShouldThrow = true;
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const service = new EmbeddingService();
      await expect(service.embed("test")).rejects.toThrow(
        /No embedding provider available/,
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // BUG-01: likewise rewritten from "falls back to random embeddings".
  test("embedBatch throws when no provider is available, outside production too", async () => {
    initShouldThrow = true;
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const service = new EmbeddingService();
      await expect(service.embedBatch(["a", "b"])).rejects.toThrow(
        /No embedding provider available/,
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
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

  // BUG-01: the 384 fallback went with the random vectors. Reporting a
  // plausible width for a provider that does not exist is the same class of
  // lie -- and the real default (OLLAMA_EMBEDDING_DIMENSIONS) is 4096, so the
  // fallback was not even the right number.
  test("getDimensions throws when no provider is available", async () => {
    initShouldThrow = true;
    const service = new EmbeddingService();
    await expect(service.embed("init")).rejects.toThrow();
    expect(() => service.getDimensions()).toThrow(
      /No embedding provider available/,
    );
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
    // embed() was only the init trigger here; after BUG-01 it throws instead
    // of fabricating, so the rejection is awaited rather than the value. The
    // assertion below is unchanged — getProviderInfo still reports null, and
    // unlike getDimensions() that stays honest: null IS "there is no
    // provider", not a plausible stand-in for one.
    await expect(service.embed("init")).rejects.toThrow();
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