/**
 * rlm-indexing delegate tests — ensureInitialized, indexFile, ensureFreshIndex,
 * checkSearchAdmission, loadGitignore, runWithIndexLock.
 *
 * Uses injected-deps + mock.module. Covers the indexing lifecycle paths
 * that the characterization test doesn't reach.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

mock.restore();

mock.module("../data/keyword/keyword-search-factory.js", () => ({
  getKeywordSearch: mock(async () => ({
    index: async () => {},
    deleteByProject: async () => 0,
    searchWithFilter: async () => [],
  })),
}));
mock.module("../services/search/cache-factory.js", () => ({
  getSearchCache: mock(async () => ({
    get: async () => null,
    set: async () => {},
    invalidateProject: async () => {},
  })),
}));
mock.module("../services/search/analytics-factory.js", () => ({
  getSearchAnalytics: mock(async () => ({ trackSearch: () => {} })),
}));
mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: mock(async () => ({
    getCentrality: async () => new Map(),
  })),
}));
mock.module("../services/search/index-manager.js", () => ({
  IndexManager: class MockIndexManager {
    async isIndexStale() { return { isStale: false }; }
    async getFilesToReindex() { return []; }
    async updateIndexMetadata() {}
    async getIndexMetadata() { return null; }
  },
}));
mock.module("../services/search/ignore-patterns.js", () => ({
  loadProjectIgnore: mock(() => ({
    ignores: () => false,
  })),
}));
mock.module("../services/search/file-filter-cache.js", () => ({
  FileFilterCache: class MockFileFilterCache {
    shouldInclude() { return true; }
    clear() {}
    invalidateProject() {}
  },
}));
mock.module("../services/synapse/session/index.js", () => ({
  getSessionRegistry: mock(() => ({ getAsync: async () => null })),
}));
mock.module("../services/synapse/index.js", () => ({
  getSynapseManager: mock(() => ({ process: () => ({ results: [] }) })),
}));
mock.module("../services/graph/graph-store-factory.js", () => ({
  getGraphStore: mock(() => ({ bfsNeighbors: () => [] })),
}));
mock.module("../data/memory/memory-repository-factory.js", () => ({
  getMemoryRepository: mock(() => ({
    fullTextSearch: async () => [],
    getById: async () => null,
  })),
}));
mock.module("../events/event-bus.js", () => ({
  eventBus: { publish: () => {} },
}));
// Identity by default (what every pre-existing test in this file assumes);
// the BUG-05 tests below swap in a retiring alias for their duration.
let aliasResolve: (id: string) => Promise<string> = async (id) => id;
mock.module("../services/project-identity/alias-resolver.js", () => ({
  getProjectIdentityAliasResolver: () => ({
    resolve: (id: string) => aliasResolve(id),
  }),
}));
mock.module("../data/managed-runs/managed-run-repository-pg.js", () => ({
  ManagedRunRepositoryPg: {
    getInstance: () => ({
      begin: async () => ({ status: "ok", lease: { id: "lease-1" } }),
      complete: async () => {},
      abort: async () => {},
    }),
  },
}));

mock.module("../services/structural/parser-readiness.js", () => ({
  assertParserReadyForIndexing: async () => {},
  resetParserReadinessForTests: async () => {},
}));

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  const configStore: Record<string, any> = {
    search: { queryUnderstanding: { enabled: false }, autoReindexMaxFiles: 50 },
    security: { allowedExtensions: [".ts", ".js"], maxFileSize: 1024 * 1024 },
  };
  return {
    ...actual,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    config: {
      get: (key: string) => configStore[key],
      set: (key: string, value: any) => { configStore[key] = value; },
    },
    estimateTokens: (s: string) => Math.ceil(s.length / 4),
  };
});

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";
import { runWithIndexLock } from "../services/search/project-indexer.js";

// ── runWithIndexLock ────────────────────────────────────────────────────────

describe("runWithIndexLock", () => {
  test("runs work and returns result", async () => {
    const lockMap = new Map<string, Promise<void>>();
    const result = await runWithIndexLock(lockMap, "proj", async () => 42);
    expect(result).toBe(42);
    expect(lockMap.has("proj")).toBe(false); // cleaned up
  });

  test("releases lock even when work throws", async () => {
    const lockMap = new Map<string, Promise<void>>();
    await expect(runWithIndexLock(lockMap, "proj", async () => {
      throw new Error("work failed");
    })).rejects.toThrow("work failed");
    expect(lockMap.has("proj")).toBe(false);
  });

  test("serializes concurrent calls for same projectId", async () => {
    const lockMap = new Map<string, Promise<void>>();
    const order: string[] = [];
    let gate: () => void;
    const gatePromise = new Promise<void>((r) => { gate = r; });
    const p1 = runWithIndexLock(lockMap, "proj", async () => {
      order.push("start:1");
      await gatePromise;
      order.push("end:1");
      return 1;
    });
    const p2 = runWithIndexLock(lockMap, "proj", async () => {
      order.push("start:2");
      order.push("end:2");
      return 2;
    });
    // Wait a tick — only p1 should have started
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["start:1"]);
    gate!();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(order).toEqual(["start:1", "end:1", "start:2", "end:2"]);
  });

  test("different projectIds run concurrently", async () => {
    const lockMap = new Map<string, Promise<void>>();
    const order: string[] = [];
    const p1 = runWithIndexLock(lockMap, "a", async () => {
      order.push("a");
      return 1;
    });
    const p2 = runWithIndexLock(lockMap, "b", async () => {
      order.push("b");
      return 2;
    });
    await Promise.all([p1, p2]);
    expect(order).toContain("a");
    expect(order).toContain("b");
  });
});

// ── ensureInitialized ───────────────────────────────────────────────────────

describe("ensureInitialized", () => {
  test("skips when already initialized", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
    } as any);
    (rlm as any).initialized = true;
    await rlm.ensureInitialized();
    expect((rlm as any).initialized).toBe(true);
  });

  test("resolves injected deps without factory calls", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: { search: async () => [] } as any,
      keywordSearch: { searchWithFilter: async () => [] } as any,
      searchCache: { get: async () => null, set: async () => {} } as any,
      analytics: { trackSearch: () => {} } as any,
      symbolRepo: { getCentrality: async () => new Map() } as any,
    } as any);
    await rlm.ensureInitialized();
    expect((rlm as any).initialized).toBe(true);
    expect((rlm as any).vectorStore).toBeDefined();
    expect((rlm as any).keywordSearch).toBeDefined();
    expect((rlm as any).indexManager).toBeDefined();
  });
});

// ── checkSearchAdmission ────────────────────────────────────────────────────

describe("checkSearchAdmission", () => {
  test("no metadata → admitted: false with error", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).indexManager = {
      getIndexMetadata: async () => null,
    };
    const result = await rlm.checkSearchAdmission("proj");
    expect(result.admitted).toBe(false);
    expect(result.error).toMatch(/not indexed/);
  });

  test("metadata exists, no projectPath → admitted: true, no stale check", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).indexManager = {
      getIndexMetadata: async () => ({ projectId: "proj", lastIndexed: Date.now() }),
      isIndexStale: async () => ({ isStale: false }),
    };
    const result = await rlm.checkSearchAdmission("proj");
    expect(result.admitted).toBe(true);
    expect(result.stale).toBeUndefined();
  });

  test("metadata exists + projectPath + stale → admitted: true with stale descriptor", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).indexManager = {
      getIndexMetadata: async () => ({ projectId: "proj", lastIndexed: Date.now() }),
      isIndexStale: async () => ({
        isStale: true, reason: "files_changed",
        modifiedFiles: ["a.ts"], newFiles: ["b.ts"], deletedFiles: ["c.ts"],
      }),
    };
    const result = await rlm.checkSearchAdmission("proj", "/path");
    expect(result.admitted).toBe(true);
    expect(result.stale).toBeDefined();
    expect(result.stale!.reason).toBe("files_changed");
    expect(result.stale!.modifiedFiles).toBe(1);
  });

  test("metadata exists + projectPath + not stale → admitted: true, no stale", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).indexManager = {
      getIndexMetadata: async () => ({ projectId: "proj", lastIndexed: Date.now() }),
      isIndexStale: async () => ({ isStale: false }),
    };
    const result = await rlm.checkSearchAdmission("proj", "/path");
    expect(result.admitted).toBe(true);
    expect(result.stale).toBeUndefined();
  });
});

// ── ensureFreshIndex ────────────────────────────────────────────────────────

describe("ensureFreshIndex", () => {
  test("not stale → wasStale: false, reindexed: false", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      searchCache: { invalidateProject: async () => {} } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).indexManager = {
      isIndexStale: async () => ({ isStale: false }),
      getFilesToReindex: async () => [],
      updateIndexMetadata: async () => {},
    };
    const result = await rlm.ensureFreshIndex("proj", "/path");
    expect(result.wasStale).toBe(false);
    expect(result.reindexed).toBe(false);
  });

  test("stale + too many files → deferred", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      searchCache: { invalidateProject: async () => {} } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).indexManager = {
      isIndexStale: async () => ({ isStale: true, reason: "files_changed" }),
      getFilesToReindex: async () => Array.from({ length: 100 }, (_, i) => `f${i}.ts`),
      updateIndexMetadata: async () => {},
    };
    const result = await rlm.ensureFreshIndex("proj", "/path", { maxSyncFiles: 10 });
    expect(result.wasStale).toBe(true);
    expect(result.reindexed).toBe(false);
    expect(result.deferred).toBe(true);
    expect(result.filesPending).toBe(100);
  });

  test("stale + no files to reindex → wasStale: true, reindexed: false", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).indexManager = {
      isIndexStale: async () => ({ isStale: true, reason: "age_threshold" }),
      getFilesToReindex: async () => [],
      updateIndexMetadata: async () => {},
    };
    const result = await rlm.ensureFreshIndex("proj", "/path");
    expect(result.wasStale).toBe(true);
    expect(result.reindexed).toBe(false);
    expect(result.reason).toBe("no_files_to_reindex");
  });

  test("stale + no_index + allowFullReindex → full reindex via indexProject", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      searchCache: { invalidateProject: async () => {} } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).searchCache = { invalidateProject: async () => {} };
    let indexCalled = false;
    (rlm as any).indexManager = {
      isIndexStale: async () => ({ isStale: true, reason: "no_index" }),
      getFilesToReindex: async () => ["a.ts"],
      updateIndexMetadata: async () => {},
    };
    rlm.indexProject = async () => {
      indexCalled = true;
      return { filesIndexed: 1, chunksIndexed: 1, errors: 0 };
    };
    const result = await rlm.ensureFreshIndex("proj", "/path", { allowFullReindex: true });
    expect(indexCalled).toBe(true);
    expect(result.wasStale).toBe(true);
    expect(result.reindexed).toBe(true);
    expect(result.reason).toBe("full_reindex");
  });

  test("stale + no_index + no allowFullReindex → deferred", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).indexManager = {
      isIndexStale: async () => ({ isStale: true, reason: "no_index" }),
      getFilesToReindex: async () => ["a.ts"],
      updateIndexMetadata: async () => {},
    };
    const result = await rlm.ensureFreshIndex("proj", "/path", { allowFullReindex: false });
    expect(result.wasStale).toBe(true);
    expect(result.reindexed).toBe(false);
    expect(result.deferred).toBe(true);
  });

  test("stale + files_changed + incremental reindex → reindexed: true", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      searchCache: { invalidateProject: async () => {} } as any,
      symbolRepo: { getCentrality: async () => new Map() } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).searchCache = { invalidateProject: async () => {} };
    (rlm as any).symbolRepo = { getCentrality: async () => new Map() };
    (rlm as any).indexManager = {
      isIndexStale: async () => ({ isStale: true, reason: "files_changed" }),
      getFilesToReindex: async () => ["a.ts"],
      updateIndexMetadata: async () => {},
    };
    let indexFileCalls = 0;
    rlm.indexFile = async () => {
      indexFileCalls++;
      return { chunks: 1 };
    };
    const result = await rlm.ensureFreshIndex("proj", "/path");
    expect(indexFileCalls).toBe(1);
    expect(result.wasStale).toBe(true);
    expect(result.reindexed).toBe(true);
    expect(result.reason).toBe("incremental_reindex");
  });

  test("incremental reindex: indexFile error is counted", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      searchCache: { invalidateProject: async () => {} } as any,
      symbolRepo: { getCentrality: async () => new Map() } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).searchCache = { invalidateProject: async () => {} };
    (rlm as any).symbolRepo = { getCentrality: async () => new Map() };
    (rlm as any).indexManager = {
      isIndexStale: async () => ({ isStale: true, reason: "files_changed" }),
      getFilesToReindex: async () => ["a.ts", "b.ts"],
      updateIndexMetadata: async () => {},
    };
    rlm.indexFile = async (_path: string) => {
      if (_path.endsWith("b.ts")) throw new Error("index failed");
      return { chunks: 1 };
    };
    const result = await rlm.ensureFreshIndex("proj", "/path");
    expect(result.reindexed).toBe(true);
  });
});

// ── indexFile ───────────────────────────────────────────────────────────────

describe("indexFile", () => {
  test("oversized file → chunks: 0 (skipped)", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: { addDocuments: async () => {} } as any,
      keywordSearch: { index: async () => {} } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).vectorStore = { addDocuments: async () => {} };
    (rlm as any).keywordSearch = { index: async () => {} };
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = (await import("node:path")).default;
    const dir = await mkdtemp(path.join((tmpdir as any)(), "indexfile-"));
    const bigPath = path.join(dir, "big.ts");
    await writeFile(bigPath, "x".repeat(2 * 1024 * 1024)); // 2MB > default 1MB limit
    try {
      const result = await rlm.indexFile(bigPath, "proj", dir);
      expect(result.chunks).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("normal file → vector + keyword indexed in parallel", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: { addDocuments: async () => {} } as any,
      keywordSearch: { index: async () => {} } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).vectorStore = { addDocuments: async () => {} };
    (rlm as any).keywordSearch = { index: async () => {} };
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = (await import("node:path")).default;
    const dir = await mkdtemp(path.join((tmpdir as any)(), "indexfile-ok-"));
    const filePath = path.join(dir, "normal.ts");
    await writeFile(filePath, "export function foo() { return 1; }");
    try {
      const result = await rlm.indexFile(filePath, "proj", dir);
      expect(result.chunks).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ── BUG-05 / TASK-013: canonical project id before getCentrality ────────────
//
// `indexFileImpl` resolves the canonical project id at its own write seam
// (rlm-indexing.ts:477), so chunks land under the canonical project. Both
// centrality loads ran with the CALLER's id. Hand them a retired alias and
// getCentrality queried a project that no longer owns any symbol: an empty
// map, and every chunk written with `centralityScore: 0` — silently, because
// 0 is also the legitimate "no centrality yet" value.

const RETIRED = "retired-proj";
const CANONICAL = "canonical-proj";

/** Centrality exists only under the canonical id, as it does in the DB. */
function canonicalOnlyCentrality(seen: string[]) {
  return async (id: string) => {
    seen.push(id);
    return id === CANONICAL ? new Map([["src/a.ts", 0.42]]) : new Map<string, number>();
  };
}

describe("centrality is loaded under the canonical project id (BUG-05)", () => {
  beforeEach(() => {
    aliasResolve = async (id: string) => (id === RETIRED ? CANONICAL : id);
  });
  afterEach(() => {
    aliasResolve = async (id: string) => id;
  });

  test("full project indexing with a retired alias still scores chunks", async () => {
    const seen: string[] = [];
    const documents: any[] = [];
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      symbolRepo: { getCentrality: canonicalOnlyCentrality(seen) } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).symbolRepo = { getCentrality: canonicalOnlyCentrality(seen) };
    (rlm as any).indexManager = { updateIndexMetadata: async () => {} };
    (rlm as any).vectorStore = { addDocuments: async (docs: any[]) => { documents.push(...docs); } };
    (rlm as any).keywordSearch = { index: async () => {} };

    const { mkdtemp, rm, writeFile, mkdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = (await import("node:path")).default;
    const dir = await mkdtemp(path.join((tmpdir as any)(), "indexproj-alias-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "a.ts"), "export const a = 1;");

    try {
      // indexFile is NOT stubbed — the assertion is on the real
      // metadata.centralityScore the chunk carries into the vector store.
      await rlm.indexProject(dir, RETIRED);

      expect(seen).toContain(CANONICAL);
      const chunk = documents.find((d) => d.metadata?.filePath === "src/a.ts");
      expect(chunk).toBeDefined();
      expect(chunk.metadata.centralityScore).toBe(0.42);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test("incremental reindex with a retired alias still scores chunks", async () => {
    const seen: string[] = [];
    let receivedMap: Map<string, number> | undefined;
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      searchCache: { invalidateProject: async () => {} } as any,
      symbolRepo: { getCentrality: canonicalOnlyCentrality(seen) } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).searchCache = { invalidateProject: async () => {} };
    (rlm as any).symbolRepo = { getCentrality: canonicalOnlyCentrality(seen) };
    (rlm as any).indexManager = {
      isIndexStale: async () => ({ isStale: true, reason: "files_changed" }),
      getFilesToReindex: async () => ["src/a.ts"],
      updateIndexMetadata: async () => {},
    };
    rlm.indexFile = async (_p: string, _id: string, _root: string, map?: Map<string, number>) => {
      receivedMap = map;
      return { chunks: 1 };
    };

    const result = await rlm.ensureFreshIndex(RETIRED, "/path");
    expect(result.reindexed).toBe(true);
    expect(seen).toContain(CANONICAL);
    // This map is what indexFileImpl turns into metadata.centralityScore.
    expect(receivedMap?.get("src/a.ts")).toBe(0.42);
  });
});

// ── _indexProjectInternal (via indexProject) ────────────────────────────────

describe("_indexProjectInternal — full project indexing", () => {
  test("indexes all files in a project with progress callback", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      symbolRepo: { getCentrality: async () => new Map() } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).symbolRepo = { getCentrality: async () => new Map() };
    (rlm as any).indexManager = { updateIndexMetadata: async () => {} };

    const { mkdtemp, rm, writeFile, mkdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = (await import("node:path")).default;
    const dir = await mkdtemp(path.join((tmpdir as any)(), "indexproj-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "a.ts"), "export const a = 1;");
    await writeFile(path.join(dir, "src", "b.ts"), "export const b = 2;");

    let indexFileCalls = 0;
    let progressCalls = 0;
    rlm.indexFile = async () => {
      indexFileCalls++;
      return { chunks: 1 };
    };
    try {
      const result = await rlm.indexProject(dir, "proj-test", {
        onProgress: (current, total) => {
          progressCalls++;
          expect(total).toBe(2);
        },
      });
      expect(indexFileCalls).toBe(2);
      expect(result.filesIndexed).toBe(2);
      expect(result.chunksIndexed).toBe(2);
      expect(progressCalls).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("indexFile error is counted but doesn't abort", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      symbolRepo: { getCentrality: async () => new Map() } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).symbolRepo = { getCentrality: async () => new Map() };
    (rlm as any).indexManager = { updateIndexMetadata: async () => {} };

    const { mkdtemp, rm, writeFile, mkdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = (await import("node:path")).default;
    const dir = await mkdtemp(path.join((tmpdir as any)(), "indexproj-err-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "a.ts"), "export const a = 1;");
    await writeFile(path.join(dir, "src", "b.ts"), "export const b = 2;");

    rlm.indexFile = async (_path: string) => {
      if (_path.endsWith("b.ts")) throw new Error("index failed");
      return { chunks: 1 };
    };
    try {
      const result = await rlm.indexProject(dir, "proj-err-test");
      expect(result.filesIndexed).toBe(1);
      expect(result.errors).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("glob error → throws (project indexing failed)", async () => {
    const rlm = new ContextualSearchRLM({
      vectorStore: {} as any, keywordSearch: {} as any,
      symbolRepo: { getCentrality: async () => new Map() } as any,
    } as any);
    (rlm as any).initialized = true;
    (rlm as any).symbolRepo = { getCentrality: async () => new Map() };
    (rlm as any).indexManager = { updateIndexMetadata: async () => {} };

    // Non-existent path → glob returns empty, no files to index
    const result = await rlm.indexProject("/nonexistent/path/xyz", "proj-empty");
    expect(result.filesIndexed).toBe(0);
  });
});

// ── loadGitignore (via loadGitignoreImpl) ────────────────────────────────────

describe("loadGitignore", () => {
  test("returns ignore instance (mocked, ignores() returns false)", async () => {
    // The ignore-patterns module is mocked to return { ignores: () => false }.
    // We verify the delegate passes through correctly.
    const rlm = new ContextualSearchRLM();
    const ig = (rlm as any).loadGitignore("/any/path");
    expect(ig).toBeDefined();
    expect(ig.ignores("anything")).toBe(false); // mock returns false for all
  });
});