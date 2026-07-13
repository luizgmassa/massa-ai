import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { EmbeddingCache } from "../services/cache/embedding-cache.js";
import { EmbeddingCachePg } from "../services/cache/embedding-cache-pg.js";
import { createEmbeddingCache } from "../services/cache/embedding-cache-factory.js";
import type { EmbeddingCacheStore } from "../services/cache/embedding-cache-contract.js";
import { CachedEmbeddingProvider } from "../services/embeddings/cached-provider.js";
import type { EmbeddingProvider } from "../services/embeddings/provider.js";
import { disconnectPrisma, getPrismaClient } from "../services/query/prisma-client.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_TH0TH_DEDICATED === "1"
  && /127\.0\.0\.1:5433\/massa_th0th_test(?:\?|$)/.test(databaseUrl);

async function expectCommonContract(cache: EmbeddingCacheStore): Promise<void> {
  expect(await cache.get(" exact ")).toBeNull();
  await cache.set(" exact ", [0.25, -0.5]);
  expect(await cache.get(" exact ")).toEqual([0.25, -0.5]);
  expect(await cache.get("exact")).toBeNull();

  await cache.setBatch(["batch-a", "batch-b"], [[1, 2], [3, 4]]);
  expect(await cache.getBatch(["batch-b", "missing", "batch-a"])).toEqual([
    [3, 4],
    null,
    [1, 2],
  ]);
  await expect(cache.setBatch(["one"], [])).rejects.toThrow(
    "Texts and embeddings arrays must have same length",
  );

  const stats = await cache.getStats();
  expect(stats.totalEntries).toBe(3);
  expect(stats.cacheSize).toBe(24);
  expect(stats.avgDimensions).toBe(2);
  expect(stats.hitRate).toBeCloseTo(3 / 6);
}

async function expectDimensionMismatchRejected(
  cache: EmbeddingCacheStore,
  providerId: string,
  model: string,
): Promise<void> {
  await cache.set("dimension-query", [9, 9]);
  await cache.setBatch(
    ["dimension-batch-bad", "dimension-batch-good"],
    [[8, 8], [1, 2, 3, 4]],
  );

  let queryCalls = 0;
  const batchCalls: string[][] = [];
  const base: EmbeddingProvider = {
    id: providerId,
    model,
    dimensions: 4,
    embedQuery: async () => {
      queryCalls++;
      return [1, 2, 3, 4];
    },
    embedBatch: async (texts) => {
      batchCalls.push(texts);
      return texts.map(() => [4, 3, 2, 1]);
    },
    isAvailable: async () => true,
    getConfig: () => ({
      provider: "ollama",
      model,
      dimensions: 4,
      priority: 1,
    }),
  };
  const provider = new CachedEmbeddingProvider(base, cache);

  expect(await provider.embedQuery("dimension-query")).toEqual([1, 2, 3, 4]);
  expect(queryCalls).toBe(1);
  expect(await cache.get("dimension-query")).toEqual([1, 2, 3, 4]);

  expect(await provider.embedBatch([
    "dimension-batch-bad",
    "dimension-batch-good",
  ])).toEqual([
    [4, 3, 2, 1],
    [1, 2, 3, 4],
  ]);
  expect(batchCalls).toEqual([["dimension-batch-bad"]]);
  expect(await cache.get("dimension-batch-bad")).toEqual([4, 3, 2, 1]);
}

describe("Embedding cache — SQLite contract regression", () => {
  const suffix = `${process.pid}-${randomUUID()}`;
  const provider = `sqlite-provider-${suffix}`;
  const model = `sqlite-model-${suffix}`;
  const caches: EmbeddingCache[] = [];

  afterAll(async () => {
    for (const cache of caches) await cache.close();
  });

  test("preserves exact content, batch, statistics, and restart behavior", async () => {
    const first = new EmbeddingCache(provider, model);
    caches.push(first);
    await expectCommonContract(first);

    const restarted = new EmbeddingCache(provider, model);
    caches.push(restarted);
    expect(await restarted.get(" exact ")).toEqual([0.25, -0.5]);
  });

  test("provider and model are independent cache-key dimensions", async () => {
    const providerPeer = new EmbeddingCache(`${provider}-peer`, model);
    const modelPeer = new EmbeddingCache(provider, `${model}-peer`);
    caches.push(providerPeer, modelPeer);
    expect(await providerPeer.get(" exact ")).toBeNull();
    expect(await modelPeer.get(" exact ")).toBeNull();
  });

  test("configured dimensions reject and replace mismatched cached vectors", async () => {
    const cache = new EmbeddingCache(`${provider}-dimension`, `${model}-dimension`);
    caches.push(cache);
    await expectDimensionMismatchRejected(
      cache,
      `${provider}-dimension`,
      `${model}-dimension`,
    );
  });

  test("cleanup uses millisecond creation age", async () => {
    const cache = new EmbeddingCache(`${provider}-ttl`, model);
    caches.push(cache);
    await cache.set("old", [1]);
    await cache.set("fresh", [2]);
    const oldHash = (cache as any).hashContent("old") as string;
    (cache as any).db.prepare(
      "UPDATE embedding_cache SET created_at = ? WHERE provider = ? AND model = ? AND content_hash = ?",
    ).run(Date.now() - 60_000, `${provider}-ttl`, model, oldHash);

    expect(await cache.cleanup(30_000)).toBe(1);
    expect(await cache.get("old")).toBeNull();
    expect(await cache.get("fresh")).toEqual([2]);
  });

  test("factory keeps SQLite when DATABASE_URL is not PostgreSQL", async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const selected = createEmbeddingCache(`${provider}-factory`, model);
      expect(selected).toBeInstanceOf(EmbeddingCache);
      await selected.close?.();
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});

describe.skipIf(!DEDICATED_DB)("Embedding cache — exact dedicated PostgreSQL parity", () => {
  const suffix = `${process.pid}-${randomUUID()}`;
  const provider = `pg-provider-${suffix}`;
  const model = `pg-model-${suffix}`;
  const caches: EmbeddingCachePg[] = [];

  afterEach(async () => {
    for (const cache of caches.splice(0)) await cache.clear();
  });

  afterAll(disconnectPrisma);

  test("matches exact-content, batch, statistics, and restart semantics", async () => {
    const first = new EmbeddingCachePg(provider, model);
    caches.push(first);
    await expectCommonContract(first);

    const restarted = new EmbeddingCachePg(provider, model);
    caches.push(restarted);
    expect(await restarted.get(" exact ")).toEqual([0.25, -0.5]);
  });

  test("provider and model namespace the key without a schema migration", async () => {
    const base = new EmbeddingCachePg(provider, model);
    const providerPeer = new EmbeddingCachePg(`${provider}-peer`, model);
    const modelPeer = new EmbeddingCachePg(provider, `${model}-peer`);
    caches.push(base, providerPeer, modelPeer);

    await base.set("same-content", [1]);
    await providerPeer.set("same-content", [2]);
    await modelPeer.set("same-content", [3]);

    expect(await base.get("same-content")).toEqual([1]);
    expect(await providerPeer.get("same-content")).toEqual([2]);
    expect(await modelPeer.get("same-content")).toEqual([3]);
    expect((await base.getStats()).totalEntries).toBe(1);
    expect((await providerPeer.getStats()).totalEntries).toBe(1);
  });

  test("configured dimensions reject and replace mismatched cached vectors", async () => {
    const cache = new EmbeddingCachePg(`${provider}-dimension`, `${model}-dimension`);
    caches.push(cache);
    await expectDimensionMismatchRejected(
      cache,
      `${provider}-dimension`,
      `${model}-dimension`,
    );
  });

  test("cleanup accepts milliseconds and uses creation age like SQLite", async () => {
    const cache = new EmbeddingCachePg(provider, model);
    caches.push(cache);
    await cache.set("old", [1]);
    await cache.set("fresh", [2]);

    const oldHash = (cache as any).hashContent("old") as string;
    await getPrismaClient().embeddingCache.update({
      where: { textHash: oldHash },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });

    expect(await cache.cleanup(30_000)).toBe(1);
    expect(await cache.get("old")).toBeNull();
    expect(await cache.get("fresh")).toEqual([2]);
  });

  test("factory selects PostgreSQL and data survives a fresh cache instance", async () => {
    const selected = createEmbeddingCache(provider, model);
    expect(selected).toBeInstanceOf(EmbeddingCachePg);
    await selected.set("factory-restart", [0.125]);

    const restarted = createEmbeddingCache(provider, model);
    expect(restarted).toBeInstanceOf(EmbeddingCachePg);
    expect(await restarted.get("factory-restart")).toEqual([0.125]);
    caches.push(selected as EmbeddingCachePg, restarted as EmbeddingCachePg);
  });
});
