import { describe, expect, test } from "bun:test";
import { SearchSource, type SearchResult } from "@massa-th0th/shared";
import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";
import { SearchProjectTool } from "../tools/search_project.js";
import {
  getSearchDiagnostics,
  resetSearchDiagnosticsForTests,
  SearchServiceError,
  type SearchDegradation,
} from "../services/search/search-diagnostics.js";

const HIT: SearchResult = {
  id: "vector-hit",
  content: "required vector retrieval remains available",
  score: 0.9,
  source: SearchSource.VECTOR,
  metadata: {
    projectId: "outage-project",
    filePath: "src/vector.ts",
  },
};

function createSearch(options: {
  vectorSearch: () => Promise<SearchResult[]>;
  keywordSearch?: () => Promise<SearchResult[]>;
  trigramSearch?: () => Promise<SearchResult[]>;
  fuzzyCorrect?: () => Promise<string | null>;
  analytics?: () => void;
  graphSearch?: () => Promise<SearchResult[]>;
  synapseProcess?: () => never;
}) {
  const cacheWrites: SearchResult[][] = [];
  const search = new ContextualSearchRLM({
    vectorStore: {
      search: options.vectorSearch,
    } as any,
    keywordSearch: {
      searchWithFilter: options.keywordSearch ?? (async () => []),
      searchTrigram: options.trigramSearch ?? (async () => []),
      fuzzyCorrect: options.fuzzyCorrect,
    } as any,
    searchCache: {
      get: async () => null,
      set: async (
        _query: string,
        _projectId: string,
        results: SearchResult[],
      ) => {
        cacheWrites.push(results);
      },
    } as any,
    analytics: { trackSearch: options.analytics ?? (() => {}) } as any,
    symbolRepo: {} as any,
    sessionRegistry: { getAsync: async () => ({ workspaceId: "outage-project" }) } as any,
    synapseManager: options.synapseProcess
      ? { process: options.synapseProcess }
      : undefined,
  });
  (search as any).buildGraphStream = options.graphSearch ?? (async () => []);
  (search as any).addContextToResults = async (results: SearchResult[]) => results;
  (search as any).queryUnderstanding = { understand: async () => null };
  return { search, cacheWrites };
}

describe("ContextualSearchRLM dependency-outage transparency", () => {
  test("genuine zero-hit retrieval succeeds with an empty result", async () => {
    const { search, cacheWrites } = createSearch({
      vectorSearch: async () => [],
    });

    const results = await search.search("no matching document", "outage-project");

    expect(results).toEqual([]);
    expect(cacheWrites).toEqual([[]]);
  });

  test("required vector backend failure rejects instead of becoming a zero hit", async () => {
    resetSearchDiagnosticsForTests();
    const { search, cacheWrites } = createSearch({
      vectorSearch: async () => {
        throw new Error("vector backend offline");
      },
    });

    try {
      await search.search("required retrieval", "outage-project");
      throw new Error("expected search to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchServiceError);
      expect((error as SearchServiceError).code).toBe("SEARCH_BACKEND_UNAVAILABLE");
      expect((error as SearchServiceError).component).toBe("vector_search");
      expect((error as Error).message).not.toContain("offline");
    }
    expect(cacheWrites).toEqual([]);
    expect(getSearchDiagnostics()).toMatchObject([
      {
        kind: "failure",
        code: "SEARCH_BACKEND_UNAVAILABLE",
        component: "vector_search",
      },
    ]);
    expect(JSON.stringify(getSearchDiagnostics())).not.toContain("offline");
  });

  test("required primary keyword failure rejects instead of becoming a vector-only hit", async () => {
    const { search, cacheWrites } = createSearch({
      vectorSearch: async () => [HIT],
      keywordSearch: async () => {
        throw new Error("keyword backend offline");
      },
    });

    await expect(
      search.search("required retrieval", "outage-project"),
    ).rejects.toMatchObject({
      code: "SEARCH_BACKEND_UNAVAILABLE",
      component: "keyword_search",
    });
    expect(cacheWrites).toEqual([]);
  });

  test("optional failures succeed with bounded sanitized degradations", async () => {
    resetSearchDiagnosticsForTests();
    const { search } = createSearch({
      vectorSearch: async () => [HIT],
      trigramSearch: async () => {
        throw new Error("secret trigram connection detail");
      },
      fuzzyCorrect: async () => { throw new Error("secret vocabulary detail"); },
      graphSearch: async () => { throw new Error("secret graph detail"); },
      analytics: () => { throw new Error("secret audit detail"); },
      synapseProcess: () => { throw new Error("secret session detail"); },
    });
    let degradations: readonly SearchDegradation[] = [];

    const results = await search.search("required", "outage-project", {
      sessionId: "session-1",
      onDegradations: (entries) => { degradations = entries; },
    });

    expect(results.map((entry) => entry.id)).toEqual(["vector-hit"]);
    expect(degradations.map((entry) => entry.code)).toEqual([
      "TRIGRAM_UNAVAILABLE",
      "FUZZY_SEARCH_UNAVAILABLE",
      "GRAPH_AUGMENTATION_UNAVAILABLE",
      "SEARCH_ANALYTICS_UNAVAILABLE",
      "SYNAPSE_UNAVAILABLE",
    ]);
    expect(JSON.stringify(degradations)).not.toContain("secret");
  });

  test("diagnostic history retains only the newest 100 sanitized entries", async () => {
    resetSearchDiagnosticsForTests();
    for (let index = 0; index < 105; index += 1) {
      const { search } = createSearch({
        vectorSearch: async () => [HIT],
        trigramSearch: async () => { throw new Error(`secret-${index}`); },
      });
      await search.search(`required-${index}`, "outage-project");
    }

    const diagnostics = getSearchDiagnostics();
    expect(diagnostics).toHaveLength(100);
    expect(diagnostics.every((entry) => entry.code === "TRIGRAM_UNAVAILABLE")).toBe(true);
    expect(JSON.stringify(diagnostics)).not.toContain("secret-");
  });
});

describe("SearchProjectTool outage envelope", () => {
  test("required retrieval rejection becomes the existing success:false envelope", async () => {
    const tool = Object.create(SearchProjectTool.prototype) as SearchProjectTool;
    (tool as any).controller = {
      searchProject: async () => {
        throw new Error("vector backend offline");
      },
    };

    const response = await tool.handle({
      query: "required retrieval",
      projectId: "outage-project",
      format: "json",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("Failed to search project");
    expect(response.error).toContain("vector backend offline");
  });
});
