import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { PostgresVectorStore } from "../data/vector/postgres-vector-store.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const DB_AVAILABLE = /^(postgres|postgresql):/.test(DATABASE_URL);
const PREFIX = "pg-vector-parity-";

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

describe.skipIf(!DB_AVAILABLE)("PostgresVectorStore — SQLite assertion parity", () => {
  const stores: DeterministicStore[] = [];
  const projects = new Set<string>();
  const ids = new Set<string>();
  const makeStore = () => {
    const store = new DeterministicStore({ connectionString: DATABASE_URL, poolSize: 2 });
    stores.push(store);
    return store;
  };
  const project = () => {
    const id = `${PREFIX}${randomUUID()}`;
    projects.add(id);
    return id;
  };

  afterEach(async () => {
    for (const store of stores) {
      for (const projectId of projects) await store.deleteByProject(projectId);
      for (const id of ids) await store.delete(id);
      await store.close();
    }
    stores.length = 0;
    projects.clear();
    ids.clear();
  });

  test("uses the default project when metadata omits projectId", async () => {
    const store = makeStore();
    const id = `${PREFIX}default-${randomUUID()}`;
    ids.add(id);
    const before = await store.getStats("default");
    await store.addDocument(id, "default project document");
    expect((await store.getStats("default")).totalDocuments).toBe(before.totalDocuments + 1);
  });

  test("an empty batch is a no-op", async () => {
    const store = makeStore();
    const projectId = project();
    const before = await store.getStats(projectId);
    await store.addDocuments([]);
    expect(await store.getStats(projectId)).toMatchObject({ totalDocuments: before.totalDocuments, totalSize: before.totalSize });
  });

  test("searchByEmbedding accepts a precomputed embedding", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `${PREFIX}precomputed-${randomUUID()}`;
    const collection = await store.getCollection(projectId);
    await collection.add([{ id, content: "precomputed vector", metadata: { projectId }, embedding: vector(7) }]);
    const results = await store.searchByEmbedding(vector(7), 10, projectId);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(id);
    expect(results[0].score).toBeGreaterThan(0.99);
  });

  test("getCollection is project-scoped and supports count/query/delete", async () => {
    const store = makeStore();
    const projectId = project();
    const id = `${PREFIX}collection-${randomUUID()}`;
    const collection = await store.getCollection(projectId);
    expect(collection.name).toBe(projectId);
    expect(await collection.count()).toBe(0);
    expect(await collection.query({ nResults: 10 })).toEqual([]);
    await collection.add([{ id, content: "collection document", metadata: { marker: "pg-parity" }, embedding: vector(3) }]);
    expect(await collection.count()).toBe(1);
    expect(await collection.query({ where: { id }, nResults: 1 })).toEqual([
      expect.objectContaining({ id, content: "collection document", score: 1 }),
    ]);
    await collection.delete([id]);
    expect(await collection.count()).toBe(0);
  });
});
