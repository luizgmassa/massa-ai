import { describe, expect, test } from "bun:test";
import { SearchSource, type SearchResult } from "@massa-th0th/shared";
import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";
import { SearchProjectTool } from "../tools/search_project.js";

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
}) {
  const cacheWrites: SearchResult[][] = [];
  const search = new ContextualSearchRLM({
    vectorStore: {
      search: options.vectorSearch,
    } as any,
    keywordSearch: {
      searchWithFilter: options.keywordSearch ?? (async () => []),
      searchTrigram: options.trigramSearch ?? (async () => []),
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
    analytics: { trackSearch: () => {} } as any,
    symbolRepo: {} as any,
  });
  (search as any).buildGraphStream = async () => [];
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
    const { search, cacheWrites } = createSearch({
      vectorSearch: async () => {
        throw new Error("vector backend offline");
      },
    });

    await expect(
      search.search("required retrieval", "outage-project"),
    ).rejects.toThrow("vector backend offline");
    expect(cacheWrites).toEqual([]);
  });

  test("optional keyword and trigram failures still degrade to vector-only", async () => {
    const { search } = createSearch({
      vectorSearch: async () => [HIT],
      keywordSearch: async () => {
        throw new Error("keyword backend offline");
      },
      trigramSearch: async () => {
        throw new Error("trigram backend offline");
      },
    });

    const results = await search.search("required retrieval", "outage-project");

    expect(results.map((entry) => entry.id)).toEqual(["vector-hit"]);
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
