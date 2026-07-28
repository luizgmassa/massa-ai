/**
 * rlm-admin delegate tests — clearProjectIndex, getProjectStats, warmupCache,
 * getAnalytics.
 *
 * Uses the injected-deps constructor seam (same as
 * contextual-search-rlm.characterization.test.ts) so no factories are called.
 * Mocks the heavy infrastructure so the test file stays in the shared process
 * group.
 */

import { describe, test, expect, mock } from "bun:test";

// Restore stale mocks before importing.
mock.restore();

// Mock heavy infrastructure (same set as characterization test).
mock.module("../data/keyword/keyword-search-factory.js", () => ({
  getKeywordSearch: mock(async () => ({})),
}));
mock.module("../services/search/cache-factory.js", () => ({
  getSearchCache: mock(async () => ({})),
}));
mock.module("../services/search/analytics-factory.js", () => ({
  getSearchAnalytics: mock(async () => ({})),
}));
mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: mock(async () => ({})),
}));
mock.module("../services/search/index-manager.js", () => ({
  IndexManager: class MockIndexManager {},
}));
mock.module("../services/search/ignore-patterns.js", () => ({
  loadProjectIgnore: mock(() => null),
}));
mock.module("../services/search/file-filter-cache.js", () => ({
  FileFilterCache: class MockFileFilterCache {
    shouldInclude() { return true; }
    clear() {}
    invalidateProject() {}
  },
}));
mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    config: {
      get: () => ({
        queryUnderstanding: { enabled: false },
      }),
    },
    estimateTokens: (s: string) => Math.ceil(s.length / 4),
  };
});

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";

function makeRlm(deps: Record<string, unknown> = {}): ContextualSearchRLM {
  return new ContextualSearchRLM(deps as any);
}

describe("rlm-admin — clearProjectIndex", () => {
  test("deletes vector + keyword + caches, returns deleted count", async () => {
    const rlm = makeRlm({
      vectorStore: { deleteByProject: async () => 5 },
      keywordSearch: { deleteByProject: async () => 3 },
      searchCache: { invalidateProject: async () => {} },
    });
    (rlm as any).fileFilterCache = { invalidateProject: () => {} };
    const result = await rlm.clearProjectIndex("proj-1");
    expect(result).toEqual({ deleted: 5 });
  });

  test("error → returns deleted: 0 (catches)", async () => {
    const rlm = makeRlm({
      vectorStore: { deleteByProject: async () => { throw new Error("boom"); } },
      keywordSearch: { deleteByProject: async () => 0 },
      searchCache: { invalidateProject: async () => {} },
    });
    (rlm as any).fileFilterCache = { invalidateProject: () => {} };
    const result = await rlm.clearProjectIndex("proj-err");
    expect(result).toEqual({ deleted: 0 });
  });
});

describe("rlm-admin — getProjectStats", () => {
  test("returns vectorStore.getStats", async () => {
    const rlm = makeRlm({
      vectorStore: { getStats: async () => ({ totalDocuments: 10, totalSize: 500 }) },
    });
    const stats = await rlm.getProjectStats("proj-1");
    expect(stats).toEqual({ totalDocuments: 10, totalSize: 500 });
  });
});

describe("rlm-admin — warmupCache", () => {
  test("runs default queries and returns counts", async () => {
    let searchCalls = 0;
    const rlm = makeRlm({
      vectorStore: { search: async () => [], searchByEmbedding: async () => [] },
      keywordSearch: { searchWithFilter: async () => [] },
      searchCache: { get: async () => null, set: async () => {} },
      analytics: { trackSearch: () => {} },
    });
    (rlm as any).queryUnderstanding = { understand: async () => null };
    (rlm as any).buildGraphStream = async () => [];
    (rlm as any).addContextToResults = async (r: any[]) => r;
    rlm.search = async () => {
      searchCalls++;
      return [];
    };
    const result = await rlm.warmupCache("proj-warm", "/path");
    expect(searchCalls).toBe(15); // 15 default queries
    expect(result.queriesWarmed).toBe(15);
    expect(result.errors).toBe(0);
  });

  test("custom queries override defaults", async () => {
    const rlm = makeRlm({});
    let searchCalls = 0;
    rlm.search = async () => {
      searchCalls++;
      return [];
    };
    const result = await rlm.warmupCache("proj", "/path", ["a", "b"]);
    expect(searchCalls).toBe(2);
    expect(result.queriesWarmed).toBe(2);
  });

  test("search errors are counted", async () => {
    const rlm = makeRlm({});
    rlm.search = async () => { throw new Error("search failed"); };
    const result = await rlm.warmupCache("proj", "/path", ["x"]);
    expect(result.queriesWarmed).toBe(0);
    expect(result.errors).toBe(1);
  });
});

describe("rlm-admin — getAnalytics", () => {
  test("returns the analytics instance", () => {
    const fakeAnalytics = { trackSearch: () => {} };
    const rlm = makeRlm({ analytics: fakeAnalytics });
    (rlm as any).analytics = fakeAnalytics; // ensureInitialized would set this
    const result = rlm.getAnalytics();
    expect(result).toBe(fakeAnalytics);
  });
});