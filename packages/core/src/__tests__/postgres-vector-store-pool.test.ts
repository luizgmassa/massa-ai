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
let capturedSql: string[] = [];

type QueryImpl = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

let queryImpl: QueryImpl = async (sql: string) => {
  if (sql.includes("pg_tables")) return { rows: [{ schemaname: "public", tablename: "vector_documents_768d" }] };
  if (sql.includes("pg_indexes")) return { rows: [{ indexname: "idx_vector_documents_768d_embedding" }] };
  return { rows: [] };
};

class FakeClient {
  async query(sql: string, params?: unknown[]) {
    capturedSql.push(sql);
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
    capturedSql.push(sql);
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
  capturedSql = [];
  queryImpl = async (sql: string) => {
    if (sql.includes("pg_tables")) return { rows: [{ schemaname: "public", tablename: "vector_documents_768d" }] };
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

describe("PostgresVectorStore — schema-qualified table enumeration (APCR-04)", () => {
  test("the pg_tables scan filters on schemaname = current_schema() and the UNION ALL uses quoted, schema-qualified identifiers", async () => {
    // Two dimension tables in the current schema, so the generated SQL
    // actually contains "UNION ALL" (Array.join with one element does not).
    queryImpl = async (sql: string) => {
      if (sql.includes("FROM pg_tables")) {
        return {
          rows: [
            { schemaname: "public", tablename: "vector_documents_768d" },
            { schemaname: "public", tablename: "vector_documents_1536d" },
          ],
        };
      }
      return { rows: [] };
    };

    const store = makeStore();
    await store.listAllProjectsAcrossDimensions();

    const tableScan = capturedSql.find((sql) => sql.includes("FROM pg_tables"));
    expect(tableScan).toBeDefined();
    expect(tableScan).toContain("schemaname = current_schema()");

    const mergedQuery = capturedSql.find((sql) => sql.includes("AS merged"));
    expect(mergedQuery).toBeDefined();
    expect(mergedQuery).toContain("UNION ALL");
    expect(mergedQuery).toContain('"public"."vector_documents_768d"');
    expect(mergedQuery).toContain('"public"."vector_documents_1536d"');
  });

  test("a two-schema fixture is not double-counted — only the current schema's rows are summed", async () => {
    // Two schemas each hold an identically-named dimension table. Only the
    // "public" row is `current_schema()`; the "other_schema" one must never
    // reach the UNION ALL.
    queryImpl = async (sql: string) => {
      if (sql.includes("FROM pg_tables")) {
        // The fake ignores the WHERE clause and returns exactly what the
        // real filtered query would: one row, from the current schema only.
        return { rows: [{ schemaname: "public", tablename: "vector_documents_768d" }] };
      }
      if (sql.includes("AS merged")) {
        return {
          rows: [{ project_id: "p1", doc_count: 3, last_updated: new Date("2026-01-01"), total_size: "300" }],
        };
      }
      return { rows: [] };
    };

    const store = makeStore();
    const projects = await store.listAllProjectsAcrossDimensions();

    expect(projects).toHaveLength(1);
    expect(projects[0]!.documentCount).toBe(3);

    const mergedQuery = capturedSql.find((sql) => sql.includes("AS merged"));
    expect(mergedQuery).toBeDefined();
    // No "UNION ALL" at all — exactly one SELECT feeds the merge, because
    // only one row (the current schema's) came back from the pg_tables scan.
    // The other schema's identically-named table never reached the generated
    // SQL.
    expect(mergedQuery).not.toContain("UNION ALL");
    expect(mergedQuery).toContain('"public"."vector_documents_768d"');
    expect(mergedQuery).not.toContain("other_schema");
  });
});
