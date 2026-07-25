/**
 * CachedEmbeddingProvider unit tests — pure cache wrapper, no DB.
 * Covers embedQuery (hit/miss), embedBatch (partial hits, all cached, all miss),
 * isAvailable, getConfig, getStats, resetStats, getCacheInfo, cleanup, withCache.
 */

import { describe, expect, test } from "bun:test";
import {
  CachedEmbeddingProvider,
  withCache,
} from "../services/embeddings/cached-provider.js";
import type { EmbeddingProvider } from "../services/embeddings/provider.js";
import type { EmbeddingProviderConfig } from "../services/embeddings/config.js";
import type { EmbeddingCacheStore, EmbeddingCacheStats } from "../services/cache/embedding-cache-contract.js";

function makeBaseProvider(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    id: "test",
    model: "test-model",
    dimensions: 4,
    async embedQuery(text: string): Promise<number[]> {
      return [text.length, 2, 3, 4];
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return texts.map((t) => [t.length, 2, 3, 4]);
    },
    async isAvailable(): Promise<boolean> {
      return true;
    },
    getConfig(): EmbeddingProviderConfig {
      return {
        provider: "test",
        model: "test-model",
        priority: 1,
        dimensions: 4,
      };
    },
    ...overrides,
  };
}

function makeMemoryCache(): EmbeddingCacheStore & {
  _store: Map<string, number[]>;
  _gets: number;
  _sets: number;
  _batchGets: number;
  _batchSets: number;
} {
  const store = new Map<string, number[]>();
  const counts = { _gets: 0, _sets: 0, _batchGets: 0, _batchSets: 0 };
  const cache = {
    _store: store,
    get _gets() { return counts._gets; },
    get _sets() { return counts._sets; },
    get _batchGets() { return counts._batchGets; },
    get _batchSets() { return counts._batchSets; },
    async get(text: string): Promise<number[] | null> {
      counts._gets++;
      return store.get(text) ?? null;
    },
    async set(text: string, embedding: number[]): Promise<void> {
      counts._sets++;
      store.set(text, embedding);
    },
    async getBatch(texts: string[]): Promise<(number[] | null)[]> {
      counts._batchGets++;
      return texts.map((t) => store.get(t) ?? null);
    },
    async setBatch(texts: string[], embeddings: number[][]): Promise<void> {
      counts._batchSets++;
      texts.forEach((t, i) => store.set(t, embeddings[i]!));
    },
    async getStats(): Promise<EmbeddingCacheStats> {
      return {
        totalEntries: store.size,
        cacheSize: store.size * 16,
        hitRate: 0.5,
        avgDimensions: 4,
      };
    },
    async cleanup(): Promise<number> {
      return 0;
    },
  };
  return cache as EmbeddingCacheStore & { _store: Map<string, number[]>; _gets: number; _sets: number; _batchGets: number; _batchSets: number };
}

describe("CachedEmbeddingProvider", () => {
  test("constructor sets id/model/dimensions from base provider", () => {
    const base = makeBaseProvider({ id: "ollama", model: "qwen" });
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    expect(cached.id).toBe("ollama-cached");
    expect(cached.model).toBe("qwen");
    expect(cached.dimensions).toBe(4);
  });

  test("embedQuery: cache miss calls base and stores result", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);

    const result = await cached.embedQuery("hello");
    expect(result).toEqual([5, 2, 3, 4]);
    expect(cache._gets).toBe(1);
    expect(cache._sets).toBe(1);
    expect(cached.getStats().misses).toBe(1);
    expect(cached.getStats().hits).toBe(0);
  });

  test("embedQuery: cache hit returns cached without calling base", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    // Pre-populate cache (this counts as 1 set).
    await cache.set("hello", [99, 99, 99, 99]);
    const setsBefore = cache._sets;
    const cached = new CachedEmbeddingProvider(base, cache);

    const result = await cached.embedQuery("hello");
    expect(result).toEqual([99, 99, 99, 99]);
    expect(cache._gets).toBe(1);
    expect(cache._sets).toBe(setsBefore); // No new set on hit.
    expect(cached.getStats().hits).toBe(1);
    expect(cached.getStats().misses).toBe(0);
  });

  test("embedQuery: dimension mismatch on cached entry triggers base call", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    // Pre-populate cache with WRONG dimensions (3 instead of 4).
    await cache.set("hello", [1, 2, 3]);
    const cached = new CachedEmbeddingProvider(base, cache);

    const result = await cached.embedQuery("hello");
    // Should call base because cached entry dimensions don't match.
    expect(result).toEqual([5, 2, 3, 4]);
    expect(cached.getStats().misses).toBe(1);
  });

  test("embedBatch: empty input returns empty array", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    expect(await cached.embedBatch([])).toEqual([]);
  });

  test("embedBatch: all cached → no base call", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    await cache.set("a", [1, 2, 3, 4]);
    await cache.set("b", [5, 6, 7, 8]);
    const cached = new CachedEmbeddingProvider(base, cache);

    const results = await cached.embedBatch(["a", "b"]);
    expect(results).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect(cached.getStats().hits).toBe(2);
    expect(cached.getStats().misses).toBe(0);
  });

  test("embedBatch: all miss → calls base and caches all", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);

    const results = await cached.embedBatch(["x", "y"]);
    expect(results).toEqual([
      [1, 2, 3, 4],
      [1, 2, 3, 4],
    ]);
    expect(cached.getStats().misses).toBe(2);
    expect(cache._sets).toBe(0); // setBatch is used, not set.
    expect(cache._batchSets).toBe(1);
  });

  test("embedBatch: partial cache hit → only misses go to base", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    await cache.set("a", [10, 20, 30, 40]);
    const cached = new CachedEmbeddingProvider(base, cache);

    const results = await cached.embedBatch(["a", "b"]);
    expect(results).toEqual([
      [10, 20, 30, 40],
      [1, 2, 3, 4],
    ]);
    expect(cached.getStats().hits).toBe(1);
    expect(cached.getStats().misses).toBe(1);
  });

  test("embedBatch: dimension mismatch on cached entry counts as miss", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    await cache.set("a", [1, 2, 3]); // Wrong dims (3 instead of 4).
    const cached = new CachedEmbeddingProvider(base, cache);

    const results = await cached.embedBatch(["a"]);
    expect(results).toEqual([[1, 2, 3, 4]]);
    expect(cached.getStats().misses).toBe(1);
  });

  test("isAvailable delegates to base provider", async () => {
    const base = makeBaseProvider({ isAvailable: async () => false });
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    expect(await cached.isAvailable()).toBe(false);
  });

  test("getConfig delegates to base provider", () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    expect(cached.getConfig().model).toBe("test-model");
  });

  test("getStats returns hits/misses/hitRate/totalRequests", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    await cached.embedQuery("x"); // miss
    await cached.embedQuery("x"); // hit
    const stats = cached.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.totalRequests).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });

  test("getStats hitRate is 0 when no requests", () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    const stats = cached.getStats();
    expect(stats.hitRate).toBe(0);
    expect(stats.totalRequests).toBe(0);
  });

  test("resetStats zeroes the counters", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    await cached.embedQuery("x");
    cached.resetStats();
    expect(cached.getStats().totalRequests).toBe(0);
  });

  test("getCacheInfo delegates to cache.getStats", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    const info = await cached.getCacheInfo();
    expect(info.totalEntries).toBe(0);
  });

  test("cleanup delegates to cache.cleanup with default maxAge", async () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const cached = new CachedEmbeddingProvider(base, cache);
    await cached.cleanup();
    // Default is 7 days — cache.cleanup returned 0.
    expect(await cached.cleanup(1000)).toBe(0);
  });

  test("withCache factory wraps a provider", () => {
    const base = makeBaseProvider();
    const cache = makeMemoryCache();
    const wrapped = withCache(base, cache);
    expect(wrapped).toBeInstanceOf(CachedEmbeddingProvider);
    expect(wrapped.id).toBe("test-cached");
  });
});