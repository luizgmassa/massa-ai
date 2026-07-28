/**
 * IndexManager unit tests — vector store + filesystem mocked.
 *
 * IndexManager detects staleness by comparing file mtimes/sizes against stored
 * metadata. It uses glob + fs.stat + a vector store collection for metadata
 * persistence. Tests use a temp directory + a mock IVectorStore.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { IndexManager } from "../services/search/index-manager.js";
import type { IVectorStore, SearchResult } from "@massa-ai/shared";

function makeMockVectorStore(metadataMap: Map<string, any>): IVectorStore {
  return {
    getCollection: async (projectId: string) => ({
      name: projectId,
      count: async () => 0,
      query: async (params: any) => {
        const whereId = params?.where?.id as string | undefined;
        if (whereId) {
          const meta = metadataMap.get(whereId);
          if (meta) return [{ id: whereId, content: meta, score: 1 }];
          return [];
        }
        return [];
      },
      add: async (docs: any[]) => {
        for (const doc of docs) {
          if (doc.id.startsWith("_metadata:")) {
            metadataMap.set(doc.id, doc.content);
          }
        }
      },
      delete: async () => {},
    }),
    getStats: async () => ({ totalDocuments: 0, totalSize: 0, embeddingDimensions: 768 }),
    addDocument: async () => {},
    addDocuments: async () => {},
    search: async () => [] as SearchResult[],
    searchByEmbedding: async () => [] as SearchResult[],
    delete: async () => true,
    deleteByProject: async () => 0,
    update: async () => {},
    listProjects: async () => [],
    healthCheck: async () => true,
    close: async () => {},
  } as unknown as IVectorStore;
}

let fixtureDir: string;

beforeAll(async () => {
  fixtureDir = await mkdtemp(path.join(tmpdir(), "index-mgr-"));
  await mkdir(path.join(fixtureDir, "src"), { recursive: true });
  await writeFile(path.join(fixtureDir, "src", "a.ts"), "export const a = 1;");
  await writeFile(path.join(fixtureDir, "src", "b.ts"), "export const b = 2;");
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("IndexManager — staleness detection", () => {
  test("no metadata → stale with reason 'no_index'", async () => {
    const store = makeMockVectorStore(new Map());
    const mgr = new IndexManager(store);
    const result = await mgr.isIndexStale("no-meta-proj", fixtureDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe("no_index");
  });

  test("path mismatch → stale with reason 'path_mismatch'", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    // Store metadata for a different path
    (mgr as any).metadataCache.set("proj", {
      projectId: "proj",
      projectPath: "/different/path",
      lastIndexed: Date.now(),
      fileCount: 1,
      totalSize: 10,
      files: {},
    });
    const result = await mgr.isIndexStale("proj", fixtureDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe("path_mismatch");
  });

  test("fresh index with no changes → not stale", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    // Build metadata from current files
    await mgr.updateIndexMetadata("proj-fresh", fixtureDir, ["src/a.ts", "src/b.ts"]);
    mgr.clearCache("proj-fresh"); // force reload from store
    const result = await mgr.isIndexStale("proj-fresh", fixtureDir);
    expect(result.isStale).toBe(false);
  });

  test("modified file → stale with reason 'files_changed'", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    await mgr.updateIndexMetadata("proj-mod", fixtureDir, ["src/a.ts", "src/b.ts"]);
    // Modify a.ts (bump mtime to the future in seconds)
    const newPath = path.join(fixtureDir, "src", "a.ts");
    const futureSec = Math.floor(Date.now() / 1000) + 100;
    await utimes(newPath, futureSec, futureSec);
    mgr.clearCache("proj-mod");
    const result = await mgr.isIndexStale("proj-mod", fixtureDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe("files_changed");
    expect(result.modifiedFiles).toContain("src/a.ts");
  });

  test("new file → stale with reason 'files_changed', newFiles populated", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    await mgr.updateIndexMetadata("proj-new", fixtureDir, ["src/a.ts", "src/b.ts"]);
    // Add a new file
    await writeFile(path.join(fixtureDir, "src", "c.ts"), "export const c = 3;");
    mgr.clearCache("proj-new");
    const result = await mgr.isIndexStale("proj-new", fixtureDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe("files_changed");
    expect(result.newFiles).toContain("src/c.ts");
    // cleanup
    await rm(path.join(fixtureDir, "src", "c.ts"));
  });

  test("deleted file → stale with reason 'files_changed', deletedFiles populated", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    await writeFile(path.join(fixtureDir, "src", "temp.ts"), "temp");
    await mgr.updateIndexMetadata("proj-del", fixtureDir, ["src/a.ts", "src/b.ts", "src/temp.ts"]);
    await rm(path.join(fixtureDir, "src", "temp.ts"));
    mgr.clearCache("proj-del");
    const result = await mgr.isIndexStale("proj-del", fixtureDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe("files_changed");
    expect(result.deletedFiles).toContain("src/temp.ts");
  });

  test("age > 24h → stale with reason 'age_threshold'", async () => {
    // Use a temp dir with files whose sizes match the metadata so the only
    // staleness signal is age (not size/mtime mismatch).
    const ageDir = await mkdtemp(path.join(tmpdir(), "index-age-"));
    await mkdir(path.join(ageDir, "src"), { recursive: true });
    await writeFile(path.join(ageDir, "src", "x.ts"), "const x = 1;");
    await writeFile(path.join(ageDir, "src", "y.ts"), "const y = 2;");
    try {
      const mgr = new IndexManager(makeMockVectorStore(new Map()));
      await mgr.updateIndexMetadata("proj-age", ageDir, ["src/x.ts", "src/y.ts"]);
      // Override lastIndexed to 25h ago (keep files the same)
      const meta = (mgr as any).metadataCache.get("proj-age");
      meta.lastIndexed = Date.now() - 25 * 60 * 60 * 1000;
      // Save the modified metadata to the store
      const store = (mgr as any).vectorStore;
      const col = await store.getCollection("proj-age");
      await col.add([{ id: "_metadata:proj-age", content: JSON.stringify(meta), embedding: Array.from({ length: 768 }).fill(0), metadata: {} }]);
      mgr.clearCache("proj-age");
      const result = await mgr.isIndexStale("proj-age", ageDir);
      expect(result.isStale).toBe(true);
      expect(result.reason).toBe("age_threshold");
    } finally {
      await rm(ageDir, { recursive: true, force: true });
    }
  });

  test("getIndexMetadata throwing returns null (caught internally, no check_failed)", async () => {
    // The outer try/catch in isIndexStale is defensive; getIndexMetadata and
    // scanProjectFiles both catch internally. So a throwing vector store
    // produces "no_index" (getIndexMetadata returns null), not "check_failed".
    const throwingStore: IVectorStore = {
      getCollection: async () => { throw new Error("store down"); },
      getStats: async () => ({ totalDocuments: 0, totalSize: 0 }),
      addDocument: async () => {}, addDocuments: async () => {},
      search: async () => [], searchByEmbedding: async () => [],
      delete: async () => true, deleteByProject: async () => 0,
      update: async () => {}, listProjects: async () => [],
      healthCheck: async () => true, close: async () => {},
    } as unknown as IVectorStore;
    const mgr = new IndexManager(throwingStore);
    const result = await mgr.isIndexStale("proj-throw", fixtureDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe("no_index");
  });
});

describe("IndexManager — getFilesToReindex", () => {
  test("not stale → empty list", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    const files = await mgr.getFilesToReindex("proj", fixtureDir, { isStale: false });
    expect(files).toEqual([]);
  });

  test("no_index reason → full reindex (all files)", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    const files = await mgr.getFilesToReindex("proj", fixtureDir, {
      isStale: true,
      reason: "no_index",
    });
    expect(files.length).toBeGreaterThan(0);
  });

  test("path_mismatch reason → full reindex (all files)", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    const files = await mgr.getFilesToReindex("proj", fixtureDir, {
      isStale: true,
      reason: "path_mismatch",
    });
    expect(files.length).toBeGreaterThan(0);
  });

  test("files_changed reason → incremental (modified + new files)", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    const files = await mgr.getFilesToReindex("proj", fixtureDir, {
      isStale: true,
      reason: "files_changed",
      modifiedFiles: ["src/a.ts"],
      newFiles: ["src/c.ts"],
    });
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/c.ts");
  });

  test("files_changed with only deleted files → empty (no reindex needed)", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    const files = await mgr.getFilesToReindex("proj", fixtureDir, {
      isStale: true,
      reason: "files_changed",
      deletedFiles: ["src/old.ts"],
    });
    expect(files).toEqual([]);
  });

  test("no previousStaleCheck → calls isIndexStale", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    const files = await mgr.getFilesToReindex("no-meta-proj", fixtureDir);
    expect(files.length).toBeGreaterThan(0); // no_index → full reindex
  });
});

describe("IndexManager — updateIndexMetadata", () => {
  test("stores metadata in vector store + cache", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    await mgr.updateIndexMetadata("proj-update", fixtureDir, ["src/a.ts", "src/b.ts"]);
    // Cache should have it
    expect((mgr as any).metadataCache.has("proj-update")).toBe(true);
    const meta = (mgr as any).metadataCache.get("proj-update");
    expect(meta.fileCount).toBe(2);
    expect(meta.files["src/a.ts"]).toBeDefined();
    expect(meta.files["src/a.ts"].size).toBeGreaterThan(0);
  });

  test("handles stat errors gracefully (missing file)", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    await mgr.updateIndexMetadata("proj-missing", fixtureDir, ["src/a.ts", "src/nonexistent.ts"]);
    const meta = (mgr as any).metadataCache.get("proj-missing");
    expect(meta.files["src/a.ts"]).toBeDefined();
    expect(meta.files["src/nonexistent.ts"]).toBeUndefined();
  });
});

describe("IndexManager — getIndexMetadata", () => {
  test("returns cached metadata without querying store", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    (mgr as any).metadataCache.set("proj-cached", { projectId: "proj-cached" });
    const meta = await mgr.getIndexMetadata("proj-cached");
    expect(meta).toEqual({ projectId: "proj-cached" });
  });

  test("queries store when not in cache", async () => {
    const metadataMap = new Map();
    metadataMap.set("_metadata:proj-store", JSON.stringify({
      projectId: "proj-store",
      projectPath: "/x",
      lastIndexed: 123,
      fileCount: 1,
      totalSize: 10,
      files: {},
    }));
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    const meta = await mgr.getIndexMetadata("proj-store");
    expect(meta).toBeDefined();
    expect(meta!.projectId).toBe("proj-store");
  });

  test("returns null when store has no metadata", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    const meta = await mgr.getIndexMetadata("no-meta");
    expect(meta).toBeNull();
  });

  test("returns null when metadata content is empty", async () => {
    const metadataMap = new Map();
    const mgr = new IndexManager(makeMockVectorStore(metadataMap));
    const meta = await mgr.getIndexMetadata("no-meta");
    expect(meta).toBeNull();
  });
});

describe("IndexManager — clearCache", () => {
  test("clears specific project", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    (mgr as any).metadataCache.set("a", {});
    (mgr as any).metadataCache.set("b", {});
    mgr.clearCache("a");
    expect((mgr as any).metadataCache.has("a")).toBe(false);
    expect((mgr as any).metadataCache.has("b")).toBe(true);
  });

  test("clears all when no projectId given", async () => {
    const mgr = new IndexManager(makeMockVectorStore(new Map()));
    (mgr as any).metadataCache.set("a", {});
    (mgr as any).metadataCache.set("b", {});
    mgr.clearCache();
    expect((mgr as any).metadataCache.size).toBe(0);
  });
});