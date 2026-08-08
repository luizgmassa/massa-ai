/**
 * F3 sensor (APCR-03) — one connection pool per store instance.
 *
 * `getPool()` (dimension-agnostic queries) and `ensureInitialized()` (the
 * normal write/read path) each used to construct their own `new Pool(...)`
 * whenever `this.initialized` was still false, so calling `getPool()` first
 * and `ensureInitialized()` second orphaned the first pool — never `close()`d
 * — and, more subtly, let `getPool()` satisfy `ensureInitialized()`'s
 * `this.pool && this.initialized` gate and skip the dimension setup at
 * `postgres-vector-store.ts:125-131` (APCR-03.5's own regression to guard).
 *
 * A fake `pg` module lets these tests exercise pool construction / connection
 * counting without a real PostgreSQL instance. `mock.module("pg", ...)`
 * registers by resolved path — a bare specifier, so it is stable across every
 * caller regardless of how `postgres-vector-store.ts` imports it.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { VectorEmbeddingProviderFactory } from "@massa-ai/shared";

let poolConstructCount = 0;
let connectCallCount = 0;
let endCallCount = 0;
let connectShouldThrow = false;

type QueryImpl = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

let queryImpl: QueryImpl = async (sql: string) => {
  if (sql.includes("pg_tables")) return { rows: [{ tablename: "vector_documents_768d" }] };
  if (sql.includes("pg_indexes")) return { rows: [{ indexname: "idx_vector_documents_768d_embedding" }] };
  return { rows: [] };
};

class FakeClient {
  async query(sql: string, params?: unknown[]) {
    return queryImpl(sql, params);
  }
  release() {
    // no-op
  }
}

class FakePool {
  constructor(_config: unknown) {
    poolConstructCount++;
  }
  async connect() {
    connectCallCount++;
    if (connectShouldThrow) throw new Error("connection refused");
    return new FakeClient();
  }
  async query(sql: string, params?: unknown[]) {
    return queryImpl(sql, params);
  }
  async end() {
    endCallCount++;
  }
}

mock.module("pg", () => ({
  default: { Pool: FakePool },
  Pool: FakePool,
}));

const { PostgresVectorStore } = await import("../data/vector/postgres-vector-store.js");

const fakeEmbeddingFactory: VectorEmbeddingProviderFactory = async () => ({
  dimensions: 768,
  embedQuery: async () => [],
  embedBatch: async () => [],
});

function makeStore() {
  return new PostgresVectorStore({
    connectionString: "postgresql://test@localhost/test",
    embeddingProviderFactory: fakeEmbeddingFactory,
  });
}

beforeEach(() => {
  poolConstructCount = 0;
  connectCallCount = 0;
  endCallCount = 0;
  connectShouldThrow = false;
  queryImpl = async (sql: string) => {
    if (sql.includes("pg_tables")) return { rows: [{ tablename: "vector_documents_768d" }] };
    if (sql.includes("pg_indexes")) return { rows: [{ indexname: "idx_vector_documents_768d_embedding" }] };
    return { rows: [] };
  };
});

describe("PostgresVectorStore — one pool per store instance (APCR-03)", () => {
  test("getPool() then ensureInitialized() constructs exactly one Pool (APCR-03.1)", async () => {
    const store = makeStore();
    // listAllProjectsAcrossDimensions() is the only public entry point onto the
    // private getPool() path.
    await store.listAllProjectsAcrossDimensions();
    expect(poolConstructCount).toBe(1);

    await store.ensureInitialized();
    expect(poolConstructCount).toBe(1);
  });

  test("ensureInitialized() after getPool() still populates tableName/schemaDimensions (APCR-03.5)", async () => {
    const store = makeStore();
    await store.listAllProjectsAcrossDimensions();
    expect(store.getSchemaDimensions()).toBeNull();

    await store.ensureInitialized();
    expect(store.getSchemaDimensions()).toBe(768);
  });

  test("a throwing ensureInitialized() does not leak a pool on retry (APCR-03.2)", async () => {
    connectShouldThrow = true;
    const store = makeStore();
    await expect(store.ensureInitialized()).rejects.toThrow();
    expect(poolConstructCount).toBe(1);

    connectShouldThrow = false;
    await store.ensureInitialized();
    // The retry reused the pool constructed by the first, failed attempt.
    expect(poolConstructCount).toBe(1);
    expect(connectCallCount).toBe(2);
  });

  test("close() ends the pool the store constructed (APCR-03.3)", async () => {
    const store = makeStore();
    await store.ensureInitialized();
    expect(poolConstructCount).toBe(1);
    await store.close();
    expect(endCallCount).toBe(1);
  });

  test("a DB-down listProjects() still throws — not a silent empty result (APCR-03.4 / Amendment A3)", async () => {
    connectShouldThrow = true;
    const store = makeStore();
    await expect(store.listProjects()).rejects.toThrow("connection refused");
  });
});
