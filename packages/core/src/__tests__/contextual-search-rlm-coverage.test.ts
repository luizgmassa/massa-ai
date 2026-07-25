/**
 * Coverage test for ContextualSearchRLM delegate methods (lines 439-475).
 *
 * Targets the 4 thin-instance-method delegates that the rlm-*.test.ts files
 * test only through the impl functions directly, leaving the instance wrapper
 * lines uncovered:
 *   - filterByPatterns          (rlm-search.ts)
 *   - clearProjectIndex         (rlm-admin.ts)
 *   - getProjectStats           (rlm-admin.ts)
 *   - warmupCache               (rlm-admin.ts)
 *
 * Uses the injected-deps constructor seam so no factory calls are made, and
 * mocks the heavy infrastructure to stay in the shared process group.
 */

import { describe, test, expect, mock } from "bun:test";
import { SearchSource, type SearchResult } from "@massa-ai/shared";

mock.restore();

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
      get: () => ({ queryUnderstanding: { enabled: false } }),
    },
    estimateTokens: (s: string) => Math.ceil(s.length / 4),
  };
});

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";

function makeResult(id: string, score = 0.5, filePath = `src/${id}.ts`): SearchResult {
  return {
    id,
    content: `${id} content with query terms`,
    score,
    source: SearchSource.HYBRID,
    metadata: { projectId: "p", filePath },
  };
}

function makeRlm(deps: Record<string, unknown> = {}): ContextualSearchRLM {
  return new ContextualSearchRLM(deps as any);
}

describe("ContextualSearchRLM.filterByPatterns (instance delegate)", () => {
  test("no include/exclude → returns results unchanged", () => {
    const rlm = makeRlm();
    const results = [makeResult("a"), makeResult("b")];
    const out = rlm.filterByPatterns(results);
    expect(out).toBe(results);
    expect(out.length).toBe(2);
  });

  test("include whitelist keeps matching files only", () => {
    const rlm = makeRlm();
    const results = [
      makeResult("a", 0.9, "src/a.ts"),
      makeResult("b", 0.8, "test/b.test.ts"),
    ];
    const out = rlm.filterByPatterns(results, ["src/*"]);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("a");
  });

  test("exclude blacklist drops matching files", () => {
    const rlm = makeRlm();
    const results = [
      makeResult("a", 0.9, "src/a.ts"),
      makeResult("b", 0.8, "test/b.test.ts"),
    ];
    const out = rlm.filterByPatterns(results, undefined, ["test/*"]);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("a");
  });

  test("both include and exclude apply (exclude wins)", () => {
    const rlm = makeRlm();
    const results = [
      makeResult("a", 0.9, "src/a.ts"),
      makeResult("b", 0.8, "src/b.ts"),
    ];
    const out = rlm.filterByPatterns(results, ["src/*"], ["**/b.ts"]);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("a");
  });

  test("empty include array → include by default (unless excluded)", () => {
    const rlm = makeRlm();
    const results = [
      makeResult("a", 0.9, "src/a.ts"),
      makeResult("b", 0.8, "src/b.ts"),
    ];
    const out = rlm.filterByPatterns(results, []);
    expect(out.length).toBe(2);
  });

  test("result without filePath + no include → kept", () => {
    const rlm = makeRlm();
    const results = [{ ...makeResult("a"), metadata: {} }];
    const out = rlm.filterByPatterns(results, undefined, ["x"]);
    expect(out.length).toBe(1);
  });

  test("result without filePath + include present → dropped", () => {
    const rlm = makeRlm();
    const results = [{ ...makeResult("a"), metadata: {} }];
    const out = rlm.filterByPatterns(results, ["src/*"]);
    expect(out.length).toBe(0);
  });
});

describe("ContextualSearchRLM.clearProjectIndex (instance delegate)", () => {
  test("deletes vector + keyword + caches, returns deleted count", async () => {
    const rlm = makeRlm({
      vectorStore: { deleteByProject: async () => 7 },
      keywordSearch: { deleteByProject: async () => 4 },
      searchCache: { invalidateProject: async () => {} },
    });
    (rlm as any).fileFilterCache = { invalidateProject: () => {} };
    const result = await rlm.clearProjectIndex("proj-clear");
    expect(result).toEqual({ deleted: 7 });
  });

  test("vector delete error → returns deleted: 0", async () => {
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

describe("ContextualSearchRLM.getProjectStats (instance delegate)", () => {
  test("returns vectorStore.getStats", async () => {
    const rlm = makeRlm({
      vectorStore: { getStats: async () => ({ totalDocuments: 42, totalSize: 1024 }) },
    });
    const stats = await rlm.getProjectStats("proj-stats");
    expect(stats).toEqual({ totalDocuments: 42, totalSize: 1024 });
  });
});

describe("ContextualSearchRLM.warmupCache (instance delegate)", () => {
  test("runs default 15 queries, returns counts", async () => {
    let calls = 0;
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
      calls++;
      return [];
    };
    const result = await rlm.warmupCache("proj-warm", "/path");
    expect(calls).toBe(15);
    expect(result.queriesWarmed).toBe(15);
    expect(result.errors).toBe(0);
  });

  test("custom queries override defaults", async () => {
    let calls = 0;
    const rlm = makeRlm({});
    rlm.search = async () => {
      calls++;
      return [];
    };
    const result = await rlm.warmupCache("proj", "/path", ["alpha", "beta"]);
    expect(calls).toBe(2);
    expect(result.queriesWarmed).toBe(2);
    expect(result.errors).toBe(0);
  });

  test("search error is counted in errors", async () => {
    const rlm = makeRlm({});
    rlm.search = async () => { throw new Error("search failed"); };
    const result = await rlm.warmupCache("proj", "/path", ["x"]);
    expect(result.queriesWarmed).toBe(0);
    expect(result.errors).toBe(1);
  });

  test("empty custom queries array → runs 0 queries (not defaults)", async () => {
    let calls = 0;
    const rlm = makeRlm({});
    rlm.search = async () => {
      calls++;
      return [];
    };
    const result = await rlm.warmupCache("proj", "/path", []);
    expect(calls).toBe(0);
    expect(result.queriesWarmed).toBe(0);
    expect(result.errors).toBe(0);
  });
});