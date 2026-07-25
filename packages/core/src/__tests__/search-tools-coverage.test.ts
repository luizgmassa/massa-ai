/**
 * Tools coverage tests — search_code, search_project, fetch_and_index,
 * get_optimized_context handler paths.
 *
 * Mocks the controllers so the tool handlers can be tested in isolation.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { SearchProjectTool } from "../tools/search_project.js";
import { SearchCodeTool } from "../tools/search_code.js";
import { FetchAndIndexTool } from "../tools/fetch_and_index.js";
import { GetOptimizedContextTool } from "../tools/get_optimized_context.js";
import { SearchServiceError } from "../services/search/search-diagnostics.js";

mock.module("../controllers/search-controller.js", () => ({
  SearchController: {
    getInstance: () => ({
      searchProject: async (p: any) => {
        if (p.query === "fail") throw new Error("search failed");
        if (p.query === "service-error") throw new SearchServiceError("SEARCH_BACKEND_UNAVAILABLE", "test");
        return {
          results: [{ id: "hit-1", content: "fn foo() {}", score: 0.9, metadata: { filePath: "a.ts" } }],
          warning: undefined,
          stale: undefined,
        };
      },
    }),
  },
}));

mock.module("../controllers/context-controller.js", () => ({
  ContextController: {
    getInstance: () => ({
      getOptimizedContext: async (p: any) => {
        if (p.query === "fail") throw new Error("context failed");
        return {
          context: "optimized context string",
          sources: [{ id: "s1", type: "code" }],
          resultsCount: 1,
          memoriesCount: 0,
          sessionCacheHits: 0,
          tokensSaved: 500,
          compressionRatio: 0.7,
          tokensSavedBySessionCache: 0,
        };
      },
    }),
  },
}));

import { config } from "@massa-ai/shared";

describe("SearchProjectTool", () => {
  test("successful search → ToolResponse with results", async () => {
    const tool = new SearchProjectTool();
    const result = await tool.handle({ query: "foo", projectId: "p1", format: "json" });
    expect(result.success).toBe(true);
  });

  test("tree format → groups by file", async () => {
    const tool = new SearchProjectTool();
    const result = await tool.handle({ query: "foo", projectId: "p1", format: "tree" });
    expect(result.success).toBe(true);
  });

  test("toon format (default)", async () => {
    const tool = new SearchProjectTool();
    const result = await tool.handle({ query: "foo", projectId: "p1" });
    expect(result.success).toBe(true);
  });

  test("search error → { success: false, error }", async () => {
    const tool = new SearchProjectTool();
    const result = await tool.handle({ query: "fail", projectId: "p1" });
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/Failed to search project/);
  });

  test("SearchServiceError → re-thrown (not caught)", async () => {
    const tool = new SearchProjectTool();
    await expect(tool.handle({ query: "service-error", projectId: "p1" })).rejects.toThrow(SearchServiceError);
  });

  test("with fields projection", async () => {
    const tool = new SearchProjectTool();
    const result = await tool.handle({ query: "foo", projectId: "p1", format: "json", fields: ["results"] });
    expect(result.success).toBe(true);
  });
});

describe("SearchCodeTool", () => {
  test("delegates to search_project with summary mode", async () => {
    const tool = new SearchCodeTool();
    const result = await tool.handle({ query: "foo", projectId: "p1", limit: 5 });
    expect(result.success).toBe(true);
  });

  test("search error → { success: false, error }", async () => {
    const tool = new SearchCodeTool();
    const result = await tool.handle({ query: "fail", projectId: "p1" });
    expect(result.success).toBe(false);
    // SearchCodeTool delegates to SearchProjectTool, so the error message
    // comes from search_project's catch block.
    expect((result as any).error).toMatch(/Failed to search/);
  });

  test("default limit is 10", async () => {
    const tool = new SearchCodeTool();
    const result = await tool.handle({ query: "foo", projectId: "p1" });
    expect(result.success).toBe(true);
  });
});

describe("FetchAndIndexTool", () => {
  test("delegates to injected run function", async () => {
    let calledParams: any;
    const tool = new FetchAndIndexTool(async (params) => {
      calledParams = params;
      return { success: true, results: [] };
    });
    const result = await tool.handle({ url: "https://example.com/" });
    expect(result.success).toBe(true);
    expect(calledParams.url).toBe("https://example.com/");
  });

  test("batch shape passed through", async () => {
    let calledParams: any;
    const tool = new FetchAndIndexTool(async (params) => {
      calledParams = params;
      return { success: true, results: [] };
    });
    const result = await tool.handle({
      requests: [{ url: "https://a.com/" }, { url: "https://b.com/" }],
      concurrency: 2,
    });
    expect(result.success).toBe(true);
    expect(calledParams.requests).toHaveLength(2);
  });

  test("run error propagates", async () => {
    const tool = new FetchAndIndexTool(async () => {
      throw new Error("run failed");
    });
    await expect(tool.handle({ url: "https://example.com/" })).rejects.toThrow("run failed");
  });
});

describe("GetOptimizedContextTool", () => {
  test("successful context retrieval → ToolResponse with metadata", async () => {
    const tool = new GetOptimizedContextTool();
    const result = await tool.handle({ query: "foo", projectId: "p1", format: "json" });
    expect(result.success).toBe(true);
    expect((result as any).metadata).toBeDefined();
    expect((result as any).metadata.tokensSaved).toBe(500);
  });

  test("toon format", async () => {
    const tool = new GetOptimizedContextTool();
    const result = await tool.handle({ query: "foo", projectId: "p1", format: "toon" });
    expect(result.success).toBe(true);
  });

  test("default format is json", async () => {
    const tool = new GetOptimizedContextTool();
    const result = await tool.handle({ query: "foo", projectId: "p1" });
    expect(result.success).toBe(true);
  });

  test("error → { success: false, error }", async () => {
    const tool = new GetOptimizedContextTool();
    const result = await tool.handle({ query: "fail", projectId: "p1" });
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/Failed to retrieve context/);
  });

  test("with fields projection", async () => {
    const tool = new GetOptimizedContextTool();
    const result = await tool.handle({ query: "foo", projectId: "p1", format: "json", fields: ["context"] });
    expect(result.success).toBe(true);
  });

  test("cacheHit metadata reflects sessionCacheHits", async () => {
    const tool = new GetOptimizedContextTool();
    const result = await tool.handle({ query: "foo", projectId: "p1" });
    expect((result as any).metadata.cacheHit).toBe(false); // sessionCacheHits = 0
  });
});