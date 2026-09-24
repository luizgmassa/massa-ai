/**
 * vector-store-factory unit tests.
 *
 * Tests the singleton caching, reset, health-check gate, and config env
 * parsing. PG-backed — gated on DATABASE_URL. Uses the deterministic subclass
 * pattern to avoid Ollama.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { randomUUID } from "crypto";
import { getVectorStore, resetVectorStore } from "../services/vector/vector-store-factory.js";
import { PostgresVectorStore, _resolveEmbedBatchSize } from "../data/vector/postgres-vector-store.js";
import type { VectorDocument } from "@massa-ai/shared";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const DB_AVAILABLE = /^(postgres|postgresql):/.test(DATABASE_URL);

describe.skipIf(!DB_AVAILABLE)("vector-store-factory", () => {
  afterEach(async () => {
    await resetVectorStore();
  });

  test("getVectorStore returns a singleton", async () => {
    const s1 = await getVectorStore();
    const s2 = await getVectorStore();
    expect(s1).toBe(s2);
  }, 30000);

  test("resetVectorStore clears + closes the instance", async () => {
    const s1 = await getVectorStore();
    await resetVectorStore();
    const s2 = await getVectorStore();
    expect(s1).not.toBe(s2);
  }, 30000);

  test("resetVectorStore when no instance cached is a no-op", async () => {
    await resetVectorStore();
    const s = await getVectorStore();
    expect(s).toBeDefined();
  }, 30000);

  test("getVectorStore returns a PostgresVectorStore instance", async () => {
    const store = await getVectorStore();
    expect(store).toBeInstanceOf(PostgresVectorStore);
  }, 30000);

  test("concurrent getVectorStore calls share the same initialization", async () => {
    const [s1, s2, s3] = await Promise.all([
      getVectorStore(),
      getVectorStore(),
      getVectorStore(),
    ]);
    expect(s1).toBe(s2);
    expect(s2).toBe(s3);
  }, 30000);
});

describe("vector-store-factory — no DB available", () => {
  test("resetVectorStore with no cached store is a no-op", async () => {
    // This runs regardless of DB availability (no store cached → returns early)
    await resetVectorStore();
    expect(true).toBe(true);
  });
});

// ─── T06: per-provider embed batch size (PDM-08..PDM-11) ───────────────────

describe("_resolveEmbedBatchSize (PDM-11, PDM-12 AC-2)", () => {
  test("falls back to the resolved provider's embedBatchSize (64) when config carries no batchSize", () => {
    expect(_resolveEmbedBatchSize(undefined)).toBe(64);
    expect(_resolveEmbedBatchSize({ provider: "ollama" })).toBe(64);
    expect(_resolveEmbedBatchSize({ provider: "lmstudio" })).toBe(64);
  });

  test("an unresolvable provider id falls back to ollama's embedBatchSize, never the literal 8", () => {
    expect(_resolveEmbedBatchSize({ provider: "mistral" })).toBe(64);
    expect(_resolveEmbedBatchSize({ provider: "mistral" })).not.toBe(8);
  });

  test("config's embedding.batchSize wins over the seam default (PDM-12 AC-2) — fails if the fallback is inverted or config ignored", () => {
    expect(_resolveEmbedBatchSize({ provider: "ollama", batchSize: 30 })).toBe(30);
    expect(_resolveEmbedBatchSize({ provider: "ollama", batchSize: 30 })).not.toBe(64);
  });
});

class BatchCountingStore extends PostgresVectorStore {
  public embedBatchCalls = 0;
  protected override async getEmbeddingDimensions(): Promise<number> {
    return 1024;
  }
  protected override async embedContent(content: string): Promise<number[]> {
    const result = Array<number>(1024).fill(0);
    result[0] = 1;
    result[1] = content.length / 1000;
    return result;
  }
  protected override async embedBatch(contents: string[]): Promise<number[][]> {
    this.embedBatchCalls++;
    return Promise.all(contents.map((content) => this.embedContent(content)));
  }
}

describe.skipIf(!DB_AVAILABLE)("PostgresVectorStore.addDocuments — batch size (T06 / spec P1 Independent Test)", () => {
  let store: BatchCountingStore | null = null;
  let projectId: string | null = null;

  afterEach(async () => {
    if (store && projectId) {
      try { await store.deleteByProject(projectId); } catch { /* table may not exist */ }
    }
    if (store) {
      try { await store.close(); } catch { /* already closed */ }
    }
    store = null;
    projectId = null;
  });

  test("addDocuments calls embedBatch 3 times for 130 documents (64/64/2)", async () => {
    store = new BatchCountingStore({ connectionString: DATABASE_URL, poolSize: 2 });
    projectId = `pvs-batch-${randomUUID()}`;
    const documents: VectorDocument[] = Array.from({ length: 130 }, (_, i) => ({
      id: `pvs-batch-${projectId}-${i}`,
      content: `batch-size test document number ${i}`,
      metadata: { projectId },
    }));

    await store.addDocuments(documents);

    expect(store.embedBatchCalls).toBe(3);
  }, 30000);
});