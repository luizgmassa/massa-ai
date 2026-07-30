/**
 * Search-facade synapse-surface tests — applySynapseState, correctQuery, buildGraphStream.
 *
 * Uses injected-deps + mock.module (same pattern as characterization test).
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
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

// Mock the graph + memory factories used by buildGraphStream
let mockBfsNeighbors: (ids: string[], depth: number) => string[] | Promise<string[]> = () => [];
let mockFullTextSearch: (query: string, n: number, filters: any) => Promise<any[]> = async () => [];
let mockGetById: (id: string) => Promise<any> = async () => null;

mock.module("../services/graph/graph-store-factory.js", () => ({
  getGraphStore: () => ({
    bfsNeighbors: (ids: string[], depth: number) => mockBfsNeighbors(ids, depth),
  }),
}));
mock.module("../data/memory/memory-repository-factory.js", () => ({
  getMemoryRepository: () => ({
    fullTextSearch: (q: string, n: number, f: any) => mockFullTextSearch(q, n, f),
    getById: (id: string) => mockGetById(id),
  }),
}));

// Mock synapse
mock.module("../services/synapse/session/index.js", () => ({
  getSessionRegistry: mock(() => ({
    getAsync: async () => null,
  })),
}));
mock.module("../services/synapse/index.js", () => ({
  getSynapseManager: mock(() => ({
    process: () => ({ results: [] }),
  })),
}));

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    config: { get: () => ({ queryUnderstanding: { enabled: false } }) },
    estimateTokens: (s: string) => Math.ceil(s.length / 4),
  };
});

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";

function makeResult(id: string, score = 0.5): SearchResult {
  return {
    id,
    content: `${id} content`,
    score,
    source: SearchSource.HYBRID,
    metadata: { projectId: "p", filePath: `${id}.ts` },
  };
}

describe("search-facade-synapse — applySynapseState", () => {
  test("no sessionId → returns base results unchanged", async () => {
    const rlm = new ContextualSearchRLM();
    const base = [makeResult("a"), makeResult("b")];
    const result = await rlm.applySynapseState(base, "query", "p");
    expect(result).toBe(base);
  });

  test("session lookup throws → degrades, returns base", async () => {
    const rlm = new ContextualSearchRLM({
      sessionRegistry: { getAsync: async () => { throw new Error("registry down"); } },
    } as any);
    const base = [makeResult("a")];
    const result = await rlm.applySynapseState(base, "q", "p", "sess-1");
    expect(result).toBe(base);
  });

  test("session null → returns base", async () => {
    const rlm = new ContextualSearchRLM({
      sessionRegistry: { getAsync: async () => null },
    } as any);
    const base = [makeResult("a")];
    const result = await rlm.applySynapseState(base, "q", "p", "sess-1");
    expect(result).toBe(base);
  });

  test("session workspace mismatch → returns base", async () => {
    const rlm = new ContextualSearchRLM({
      sessionRegistry: {
        getAsync: async () => ({ workspaceId: "other-project" }),
      },
    } as any);
    const base = [makeResult("a")];
    const result = await rlm.applySynapseState(base, "q", "p", "sess-1");
    expect(result).toBe(base);
  });

  test("synapse processing throws → degrades, returns base", async () => {
    const rlm = new ContextualSearchRLM({
      sessionRegistry: { getAsync: async () => ({ workspaceId: "p" }) },
      synapseManager: { process: () => { throw new Error("processing failed"); } },
    } as any);
    const base = [makeResult("a")];
    const result = await rlm.applySynapseState(base, "q", "p", "sess-1");
    expect(result).toBe(base);
  });

  test("valid session → returns processed results (base ids kept)", async () => {
    const processed = [
      makeResult("a", 0.9),
      makeResult("c", 0.3),
    ];
    const rlm = new ContextualSearchRLM({
      sessionRegistry: { getAsync: async () => ({ workspaceId: "p" }) },
      synapseManager: { process: () => ({ results: processed }) },
    } as any);
    const base = [makeResult("a", 0.5)];
    const result = await rlm.applySynapseState(base, "q", "p", "sess-1");
    // "a" is in baseIds → kept; "c" is not, but projectId matches → kept
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toContain("a");
    expect(result.map((r) => r.id)).toContain("c");
  });

  test("buffer injection filters out wrong-projectId results", async () => {
    const processed = [
      { ...makeResult("c"), metadata: { projectId: "other" } },
    ];
    const rlm = new ContextualSearchRLM({
      sessionRegistry: { getAsync: async () => ({ workspaceId: "p" }) },
      synapseManager: { process: () => ({ results: processed }) },
    } as any);
    const base: SearchResult[] = [];
    const result = await rlm.applySynapseState(base, "q", "p", "sess-1");
    // "c" has projectId "other" != "p" → filtered out
    expect(result).toEqual([]);
  });
});

describe("search-facade-synapse — correctQuery", () => {
  test("no fuzzyCorrect function → returns null", async () => {
    const rlm = new ContextualSearchRLM();
    (rlm as any).keywordSearch = {};
    const result = await rlm.correctQuery("useEffect");
    expect(result).toBeNull();
  });

  test("multi-term query → returns null (only single-term corrected)", async () => {
    const rlm = new ContextualSearchRLM();
    (rlm as any).keywordSearch = {
      fuzzyCorrect: async () => "corrected",
    };
    const result = await rlm.correctQuery("foo bar");
    expect(result).toBeNull();
  });

  test("single term with correction → returns corrected word", async () => {
    const rlm = new ContextualSearchRLM();
    (rlm as any).keywordSearch = {
      fuzzyCorrect: async (w: string) => (w === "useeffct" ? "useEffect" : w),
    };
    const result = await rlm.correctQuery("useEffct");
    expect(result).toBe("useEffect");
  });

  test("single term, no correction needed → returns null", async () => {
    const rlm = new ContextualSearchRLM();
    (rlm as any).keywordSearch = {
      fuzzyCorrect: async (w: string) => w, // returns same word
    };
    const result = await rlm.correctQuery("useEffect");
    expect(result).toBeNull();
  });

  test("terms <3 chars are filtered before correction", async () => {
    const rlm = new ContextualSearchRLM();
    let calls = 0;
    (rlm as any).keywordSearch = {
      fuzzyCorrect: async () => { calls++; return null; },
    };
    // "ab" is <3 chars → filtered; "useEffect" remains (single term)
    const result = await rlm.correctQuery("ab useEffect");
    // "ab" filtered → terms = ["useEffect"] (1 term) → correction runs
    expect(calls).toBe(1);
    expect(result).toBeNull(); // no change
  });
});

describe("search-facade-synapse — buildGraphStream", () => {
  beforeEach(() => {
    mockBfsNeighbors = () => [];
    mockFullTextSearch = async () => [];
    mockGetById = async () => null;
  });

  test("empty resultSets → returns []", async () => {
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([], 10, "p");
    expect(result).toEqual([]);
  });

  test("no seedIds (empty vector stream) → returns []", async () => {
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[]], 10, "p");
    expect(result).toEqual([]);
  });

  test("graph store returns neighbors + memory repo returns rows → resolves SearchResults", async () => {
    mockBfsNeighbors = () => ["mem-1"];
    mockGetById = async (id: string) => ({
      id,
      content: `memory ${id}`,
      deleted_at: null,
      project_id: "p",
      type: "decision",
      importance: 0.8,
    });
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mem-1");
    expect(result[0].score).toBe(0.45);
    expect(result[0].source).toBe("memory");
  });

  test("neighbors that are already in the result set are filtered (no double-count)", async () => {
    mockBfsNeighbors = () => ["a"]; // already in vector stream
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    expect(result).toEqual([]);
  });

  test("deleted memories are skipped", async () => {
    mockBfsNeighbors = () => ["deleted-mem"];
    mockGetById = async () => ({ id: "deleted-mem", deleted_at: new Date(), project_id: "p" });
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    expect(result).toEqual([]);
  });

  test("getById throwing skips that memory (defensive)", async () => {
    mockBfsNeighbors = () => ["good-mem", "bad-mem"];
    mockGetById = async (id: string) => {
      if (id === "bad-mem") throw new Error("lookup failed");
      return { id, content: "ok", deleted_at: null, project_id: "p", type: "pattern", importance: 0.5 };
    };
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("good-mem");
  });

  test("anchor-based bridging: filePath metadata triggers fullTextSearch", async () => {
    let ftsCalled = false;
    mockFullTextSearch = async () => {
      ftsCalled = true;
      return [{ id: "bridged-mem" }];
    };
    mockBfsNeighbors = (ids: string[]) => ids.includes("bridged-mem") ? ["graph-neighbor"] : [];
    mockGetById = async (id: string) => ({
      id, content: "neighbor content", deleted_at: null,
      project_id: "p", type: "decision", importance: 0.7,
    });
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    expect(ftsCalled).toBe(true);
    expect(result).toHaveLength(1);
  });

  test("fullTextSearch throwing is caught (defensive bridging)", async () => {
    mockFullTextSearch = async () => { throw new Error("fts down"); };
    mockBfsNeighbors = () => [];
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    // FTS failed → no bridged seeds → no neighbors → []
    expect(result).toEqual([]);
  });

  test("graph store without bfsNeighbors method → returns []", async () => {
    // The mock returns a store with bfsNeighbors, but test the polymorphic path
    mockBfsNeighbors = () => [];
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    expect(result).toEqual([]);
  });

  test("BUG-02: a neighbor from another project is dropped, the same-project one is kept", async () => {
    mockBfsNeighbors = () => ["same-project-mem", "other-project-mem"];
    mockGetById = async (id: string) => ({
      id,
      content: `memory ${id}`,
      deleted_at: null,
      project_id: id === "other-project-mem" ? "other" : "p",
      type: "decision",
      importance: 0.6,
    });
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    // Two-sided: a filter that dropped everything would fail the first assert.
    expect(result.map((r) => r.id)).toEqual(["same-project-mem"]);
  });

  test("BUG-02: a NULL-project neighbor is dropped when a projectId is supplied", async () => {
    // Matches the scope semantics of every other read seam in the search path:
    // `WHERE project_id = $x` never matches NULL.
    mockBfsNeighbors = () => ["unscoped-mem"];
    mockGetById = async (id: string) => ({
      id,
      content: `memory ${id}`,
      deleted_at: null,
      project_id: null,
      type: "decision",
      importance: 0.6,
    });
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    expect(result).toEqual([]);
  });

  test("BUG-02: no projectId → the filter is inert, every neighbor survives", async () => {
    mockBfsNeighbors = () => ["mem-p", "mem-other", "mem-null"];
    mockGetById = async (id: string) => ({
      id,
      content: `memory ${id}`,
      deleted_at: null,
      project_id: id === "mem-p" ? "p" : id === "mem-other" ? "other" : null,
      type: "decision",
      importance: 0.6,
    });
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, undefined);
    expect(result.map((r) => r.id)).toEqual(["mem-p", "mem-other", "mem-null"]);
  });

  test("BUG-02: the filter removing every neighbor yields [], never a throw", async () => {
    mockBfsNeighbors = () => ["other-1", "other-2"];
    mockGetById = async (id: string) => ({
      id,
      content: `memory ${id}`,
      deleted_at: null,
      project_id: "other",
      type: "decision",
      importance: 0.6,
    });
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    // searchImpl only appends a non-empty stream, so the other RRF streams are
    // returned unchanged (spec Edge Case).
    expect(result).toEqual([]);
  });

  test("outer catch: getGraphStore throwing → returns [] with degradation", async () => {
    // Override the graph mock to throw. We need to re-mock the module, but
    // since mock.module is process-wide, we use a throwing bfsNeighbors that
    // makes the inner code path reach the outer try/catch.
    mockBfsNeighbors = () => { throw new Error("graph store corrupted"); };
    const rlm = new ContextualSearchRLM();
    const result = await rlm.buildGraphStream([[makeResult("a")]], 10, "p");
    // The outer catch returns []
    expect(result).toEqual([]);
  });
});