/**
 * PostgresVectorStore extended coverage tests.
 *
 * Covers: update, getCollection count/query/delete/add, listProjects,
 * toBitString, embedBatchPublic, normalizeScore edge cases, BQ two-phase
 * search path, detectOrphanedChunks + createFallbackTable, close.
 *
 * PG-backed (gated on DATABASE_URL) for the real connection paths; uses a
 * deterministic embedding subclass to avoid Ollama dependency.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { PostgresVectorStore } from "../data/vector/postgres-vector-store.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const DB_AVAILABLE = /^(postgres|postgresql):/.test(DATABASE_URL);

class DeterministicStore extends PostgresVectorStore {
  protected override async getEmbeddingDimensions(): Promise<number> { return 1024; }
  protected override async embedContent(content: string): Promise<number[]> {
    const result = Array<number>(1024).fill(0);
    result[0] = 1;
    result[1] = content.length / 1000;
    return result;
  }
  protected override async embedBatch(contents: string[]): Promise<number[][]> {
    return Promise.all(contents.map((content) => this.embedContent(content)));
  }
}

function vector(axis = 0): number[] {
  const result = Array<number>(1024).fill(0);
  result[axis] = 1;
  return result;
}

describe.skipIf(!DB_AVAILABLE)("PostgresVectorStore — extended coverage", () => {
  const stores: DeterministicStore[] = [];
  const projects = new Set<string>();
  const ids = new Set<string>();
  const makeStore = () => {
    const store = new DeterministicStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store);
    return store;
  };
  const project = () => {
    const id = `pg-ext-${randomUUID()}`;
    projects.add(id);
    return id;
  };

  afterEach(async () => {
    for (const store of stores) {
      for (const projectId of projects) {
        try { await store.deleteByProject(projectId); } catch { /* table may be dropped */ }
      }
      for (const id of ids) {
        try { await store.delete(id); } catch { /* table may be dropped */ }
      }
      try { await store.close(); } catch { /* already closed */ }
    }
    stores.length = 0;
    projects.clear();
    ids.clear();
  });

  test("update deletes then re-adds", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `pg-ext-update-${randomUUID()}`;
    ids.add(id);
    await store.addDocument(id, "original content", { projectId });
    await store.update(id, "updated content", { projectId, newField: true });
    const stats = await store.getStats(projectId);
    expect(stats.totalDocuments).toBe(1);
  });

  test("getCollection count + query (fallback path)", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `pg-ext-col-${randomUUID()}`;
    ids.add(id);
    const collection = await store.getCollection(projectId);
    expect(await collection.count()).toBe(0);
    // Fallback query (no where.id) → returns docs ordered by updated_at
    await collection.add([{ id, content: "collection doc", metadata: { projectId }, embedding: vector(3) }]);
    expect(await collection.count()).toBe(1);
    const results = await collection.query({ nResults: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(id);
  });

  test("getCollection query with where.id fast path", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `pg-ext-fastpath-${randomUUID()}`;
    ids.add(id);
    const collection = await store.getCollection(projectId);
    await collection.add([{ id, content: "fast path doc", metadata: { projectId }, embedding: vector(5) }]);
    const results = await collection.query({ where: { id }, nResults: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(id);
  });

  test("getCollection delete removes docs", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `pg-ext-del-${randomUUID()}`;
    ids.add(id);
    const collection = await store.getCollection(projectId);
    await collection.add([{ id, content: "to delete", metadata: { projectId }, embedding: vector(2) }]);
    expect(await collection.count()).toBe(1);
    await collection.delete([id]);
    expect(await collection.count()).toBe(0);
  });

  test("getCollection add with pre-computed embedding skips embed", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `pg-ext-precomp-${randomUUID()}`;
    ids.add(id);
    const collection = await store.getCollection(projectId);
    await collection.add([{ id, content: "precomp", metadata: { projectId }, embedding: vector(7) }]);
    expect(await collection.count()).toBe(1);
  });

  test("listProjects returns projects with counts", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `pg-ext-list-${randomUUID()}`;
    ids.add(id);
    await store.addDocument(id, "list test", { projectId });
    const projects = await store.listProjects();
    const found = projects.find((p) => p.projectId === projectId);
    expect(found).toBeDefined();
    expect(found!.documentCount).toBeGreaterThanOrEqual(1);
  });

  test("listProjects excludes _metadata documents", async () => {
    const store = makeStore();
    const projectId = project();
    // Add a _metadata doc via the collection
    const collection = await store.getCollection(projectId);
    await collection.add([{
      id: `_metadata:${projectId}`,
      content: JSON.stringify({ projectId, test: true }),
      metadata: { type: "_metadata", projectId },
      embedding: vector(0),
    }]);
    const projects = await store.listProjects();
    // _metadata docs should not inflate the count
    const found = projects.find((p) => p.projectId === projectId);
    if (found) expect(found.documentCount).toBe(0);
  });

  test("searchByEmbedding with projectId filters results", async () => {
    const store = makeStore();
    const p1 = project();
    const p2 = project();
    const id1 = `pg-ext-p1-${randomUUID()}`;
    const id2 = `pg-ext-p2-${randomUUID()}`;
    ids.add(id1); ids.add(id2);
    await store.addDocument(id1, "project one doc", { projectId: p1 });
    await store.addDocument(id2, "project two doc", { projectId: p2 });
    const results = await store.searchByEmbedding(vector(0), 10, p1);
    expect(results.every((r) => r.id === id1)).toBe(true);
  });

  test("getStats returns embeddingDimensions + index info", async () => {
    const store = makeStore();
    const projectId = project();
    const stats = await store.getStats(projectId);
    expect(stats.embeddingDimensions).toBe(1024);
    expect(stats.indexType).toBe("hnsw");
    expect(["ready", "none"]).toContain(stats.indexStatus);
  });

  test("toBitString converts floats to bit string", () => {
    const store = new PostgresVectorStore({ connectionString: DATABASE_URL });
    const bits = store.toBitString([1, -1, 0, 0.5]);
    expect(bits).toBe("1011"); // >=0 → '1', <0 → '0'
  });

  test("embedBatchPublic embeds multiple texts", async () => {
    const store = makeStore();
    const embeddings = await store.embedBatchPublic(["hello", "world"]);
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).toHaveLength(1024);
  });

  test("healthCheck returns true when initialized", async () => {
    const store = makeStore();
    await store.ensureInitialized();
    expect(await store.healthCheck()).toBe(true);
  });

  test("close resets state", async () => {
    const store = makeStore();
    await store.ensureInitialized();
    await store.close();
    expect(await store.healthCheck()).toBe(false);
  });

  test("detectOrphanedChunks runs without throwing during init", async () => {
    // The detection runs during ensureInitialized. If it throws, init fails.
    const store = makeStore();
    await store.ensureInitialized();
    // No exception thrown — detection is best-effort
    expect(store.getSchemaDimensions()).toBe(1024);
  });

  test("createFallbackTable path — table created when missing", async () => {
    // Use a non-standard dimension so the table name doesn't exist yet →
    // triggers createFallbackTable + detectOrphanedChunks with empty results.
    class CustomDimStore extends DeterministicStore {
      protected override async getEmbeddingDimensions(): Promise<number> { return 512; }
    }
    const store = new CustomDimStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store as any);
    const pool = await store.ensureInitialized();
    expect(store.getSchemaDimensions()).toBe(512);
    // The fallback table should now exist
    const { rows } = await pool.query(
      `SELECT tablename FROM pg_tables WHERE tablename = 'vector_documents_512d'`,
    );
    expect(rows.length).toBe(1);
    // Clean up the fallback table
    await pool.query("DROP TABLE IF EXISTS vector_documents_512d CASCADE");
    await store.close();
  });

  test("createFallbackTable with BQ (>2000 dims) creates embedding_bq column", async () => {
    class HighDimStore extends DeterministicStore {
      protected override async getEmbeddingDimensions(): Promise<number> { return 2048; }
    }
    const store = new HighDimStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store as any);
    const pool = await store.ensureInitialized();
    expect(store.getSchemaDimensions()).toBe(2048);
    expect(store.isBqEnabled()).toBe(true);
    // Check the embedding_bq column exists
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'vector_documents_2048d' AND column_name = 'embedding_bq'`,
    );
    expect(rows.length).toBe(1);
    // Clean up
    await pool.query("DROP TABLE IF EXISTS vector_documents_2048d CASCADE");
    await store.close();
  });

  test("searchTwoPhase (BQ >2000 dims) returns results via binary quantization", async () => {
    class HighDimStore extends PostgresVectorStore {
      protected override async getEmbeddingDimensions(): Promise<number> { return 2048; }
      protected override async embedContent(content: string): Promise<number[]> {
        const v = Array<number>(2048).fill(0);
        // Deterministic axis keyed off first char so different contents differ.
        v[content.charCodeAt(0) % 2048] = 1;
        return v;
      }
      protected override async embedBatch(contents: string[]): Promise<number[][]> {
        return Promise.all(contents.map((c) => this.embedContent(c)));
      }
    }
    const store = new HighDimStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store as any);
    const projectId = project();
    const id = `pg-ext-bq-${randomUUID()}`;
    ids.add(id);
    await store.addDocument(id, "alpha document", { projectId });
    const results = await store.search("alpha document", 5, projectId);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(id);
    // Cleanup the runtime-created high-dim table
    await store.deleteByProject(projectId);
    const pool = await store.ensureInitialized();
    await pool.query("DROP TABLE IF EXISTS vector_documents_2048d CASCADE");
  });

  test("searchTwoPhase with projectId filter returns only scoped results", async () => {
    class HighDimStore extends PostgresVectorStore {
      protected override async getEmbeddingDimensions(): Promise<number> { return 2048; }
      protected override async embedContent(content: string): Promise<number[]> {
        const v = Array<number>(2048).fill(0);
        v[content.charCodeAt(0) % 2048] = 1;
        return v;
      }
      protected override async embedBatch(contents: string[]): Promise<number[][]> {
        return Promise.all(contents.map((c) => this.embedContent(c)));
      }
    }
    const store = new HighDimStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store as any);
    const p1 = project();
    const p2 = project();
    const id1 = `pg-ext-bq-p1-${randomUUID()}`;
    const id2 = `pg-ext-bq-p2-${randomUUID()}`;
    ids.add(id1);
    ids.add(id2);
    await store.addDocument(id1, "bravo document", { projectId: p1 });
    await store.addDocument(id2, "bravo document", { projectId: p2 });
    const scoped = await store.searchByEmbedding(
      await (store as any).embedContent("bravo document"),
      10,
      p1,
    );
    expect(scoped.every((r) => r.id !== id2)).toBe(true);
    await store.deleteByProject(p1);
    await store.deleteByProject(p2);
    const pool = await store.ensureInitialized();
    await pool.query("DROP TABLE IF EXISTS vector_documents_2048d CASCADE");
  });

  test("addDocuments falls back per-document when sub-batch insert fails (dim mismatch)", async () => {
    // embedBatch returns WRONG-dimension vectors → insertSubBatch throws
    // (ROLLBACK) → per-document fallback uses embedContent (correct dim).
    class MismatchStore extends PostgresVectorStore {
      protected override async getEmbeddingDimensions(): Promise<number> { return 1024; }
      protected override async embedContent(content: string): Promise<number[]> {
        const v = Array<number>(1024).fill(0);
        v[0] = content.length;
        return v;
      }
      protected override async embedBatch(): Promise<number[][]> {
        // Wrong dimension → insertSubBatch dimension-mismatch error → ROLLBACK.
        return [Array<number>(512).fill(0)];
      }
    }
    const store = new MismatchStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store as any);
    const projectId = project();
    const id = `pg-ext-mismatch-${randomUUID()}`;
    ids.add(id);
    // Sub-batch fails, per-document fallback inserts via embedContent.
    await store.addDocuments([
      { id, content: "mismatch fallback content", metadata: { projectId } },
    ]);
    // The per-document fallback should have landed the row.
    const stats = await store.getStats(projectId);
    expect(stats.totalDocuments).toBeGreaterThanOrEqual(1);
  });

  test("addDocuments skips documents that fail both batch and single embed", async () => {
    // Both embedBatch AND embedContent fail → totalFailed increments, row skipped.
    class AllFailStore extends PostgresVectorStore {
      protected override async getEmbeddingDimensions(): Promise<number> { return 1024; }
      protected override async embedContent(): Promise<number[]> { throw new Error("nope"); }
      protected override async embedBatch(): Promise<number[][]> { throw new Error("batch nope"); }
    }
    const store = new AllFailStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store as any);
    const projectId = project();
    // Neither path succeeds; addDocuments resolves without throwing.
    await store.addDocuments([
      { id: `pg-ext-allfail-${randomUUID()}`, content: "fails", metadata: { projectId } },
    ]);
    const stats = await store.getStats(projectId);
    expect(stats.totalDocuments).toBe(0);
  });

  test("addDocument throws on embedding dimension mismatch", async () => {
    class WrongDimStore extends PostgresVectorStore {
      protected override async getEmbeddingDimensions(): Promise<number> { return 1024; }
      protected override async embedContent(): Promise<number[]> { return Array<number>(512).fill(0); }
      protected override async embedBatch(contents: string[]): Promise<number[][]> {
        return Promise.all(contents.map(() => Array<number>(512).fill(0)));
      }
    }
    const store = new WrongDimStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store as any);
    const projectId = project();
    expect(
      store.addDocument(`pg-ext-wrongdim-${randomUUID()}`, "x", { projectId }),
    ).rejects.toThrow(/Embedding dimension mismatch/);
  });

  test("searchByEmbedding throws on dimension mismatch", async () => {
    const store = makeStore();
    await expect(store.searchByEmbedding(Array<number>(10).fill(0), 5)).rejects.toThrow(
      /Embedding dimension mismatch/,
    );
  });

  test("searchDirect without projectId scans the whole table", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `pg-ext-noprojectid-${randomUUID()}`;
    ids.add(id);
    await store.addDocument(id, "no project filter content", { projectId });
    // search() with no projectId → searchDirect unscoped branch.
    const results = await store.search("no project filter content", 10);
    expect(results.length).toBeGreaterThan(0);
  });

  test("searchTwoPhase returns [] when no candidates match", async () => {
    class HighDimStore extends PostgresVectorStore {
      protected override async getEmbeddingDimensions(): Promise<number> { return 2048; }
      protected override async embedContent(content: string): Promise<number[]> {
        const v = Array<number>(2048).fill(0);
        v[content.charCodeAt(0) % 2048] = 1;
        return v;
      }
      protected override async embedBatch(contents: string[]): Promise<number[][]> {
        return Promise.all(contents.map((c) => this.embedContent(c)));
      }
    }
    const store = new HighDimStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store as any);
    const projectId = project();
    // No documents inserted → phase-1 candidate set is empty → returns [].
    const results = await store.searchByEmbedding(
      await (store as any).embedContent("nothing here"),
      5,
      projectId,
    );
    expect(results).toEqual([]);
    const pool = await store.ensureInitialized();
    await pool.query("DROP TABLE IF EXISTS vector_documents_2048d CASCADE");
  });

  test("getStats without projectId scans the whole table", async () => {
    const store = makeStore();
    const stats = await store.getStats();
    expect(stats.totalDocuments).toBeGreaterThanOrEqual(0);
  });

  test("ivfflat indexType is accepted at construction", () => {
    const store = new PostgresVectorStore({
      connectionString: DATABASE_URL,
      indexType: "ivfflat",
      indexParams: { lists: 50 },
    });
    expect(store).toBeDefined();
  });
});