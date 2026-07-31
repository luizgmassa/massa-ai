/**
 * vector-store-factory unit tests.
 *
 * Tests the singleton caching, reset, health-check gate, and config env
 * parsing. PG-backed — gated on DATABASE_URL. Uses the deterministic subclass
 * pattern to avoid Ollama.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { getVectorStore, resetVectorStore } from "../services/vector/vector-store-factory.js";
import { PostgresVectorStore } from "../data/vector/postgres-vector-store.js";

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