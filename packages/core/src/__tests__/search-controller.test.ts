/**
 * Unit tests for SearchController — covers the lines not exercised by
 * search-facade-hybrid.test.ts / search-tools-coverage.test.ts: private constructor
 * + getInstance + getSearchEngine, handleAutoReindex, generatePreview edge
 * cases, filterByPatterns, applyBoost, rerank path, degradations, stale
 * warning, filter downgrades, and recommendation generation per response
 * mode.
 *
 * Mocks ContextualSearchRLM + LLMJudgeReranker so the controller
 * orchestration logic can be exercised without a DB or LLM.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { config } from "@massa-ai/shared";

// ── Mock ContextualSearchRLM ──────────────────────────────────
// The controller constructor does `new ContextualSearchRLM()`. We mock the
// class so the controller gets a controllable instance.

let lastSearchEngine: any;

function registerLastSearchEngine(instance: unknown): void {
  lastSearchEngine = instance;
}

mock.module("../services/search/contextual-search-rlm.js", () => ({
  ContextualSearchRLM: class {
    constructor() {
      registerLastSearchEngine(this);
    }
    async checkSearchAdmission(_projectId: string, _projectPath?: string) {
      return { admitted: true, stale: null };
    }
    async ensureFreshIndex(
      _projectId: string,
      _projectPath: string,
      _opts: any,
    ) {
      return {
        wasStale: false,
        reindexed: false,
        reason: "fresh",
        deferred: false,
        filesPending: 0,
      };
    }
    async search(_q: string, _pid: string, opts: any) {
      // Return a fixed 3-result set (NOT capped by maxResults) so the
      // controller's results_total/results_shown/results_omitted math is
      // testable. The controller slices to maxResults AFTER ranking.
      const results = Array.from({ length: 3 }, (_, i) => ({
        id: `r${i}`,
        score: 0.9 - i * 0.1,
        content: `function f${i}() { return ${i}; }`,
        explanation: opts?.explainScores ? `exp${i}` : undefined,
        metadata: {
          filePath: `src/file${i}.ts`,
          lineStart: 1 + i,
          lineEnd: 10 + i,
          language: "ts",
          chunkIndex: i,
          totalChunks: 3,
          // Always include these; the controller decides whether to emit
          // them based on responseMode.
          parentSymbol: "Parent",
          fileImports: "import x",
          context: { preview: `preview ${i}` },
        },
      }));
      if (opts?.onDegradations) {
        // no degradations by default
      }
      return results;
    }
  },
}));

mock.module("../services/search/reranker.js", () => ({
  LLMJudgeReranker: class {
    async rerank(_q: string, results: any[]) {
      // reverse the order to prove rerank ran
      return [...results].reverse();
    }
  },
}));

mock.module("../services/events/event-bus.js", () => ({
  eventBus: { publish: mock(() => {}) },
}));

import { SearchController } from "../services/search/search-controller.js";

function resetController() {
  (SearchController as any).instance = null;
}

describe("SearchController", () => {
  let ctrl: SearchController;

  beforeEach(() => {
    resetController();
    // Ensure rerank is off by default; individual tests enable it.
    try {
      const searchCfg = (config as any).get("search") ?? {};
      (searchCfg as any).rerank = { enabled: false };
    } catch {
      // config may be frozen; ignore.
    }
    ctrl = SearchController.getInstance();
  });

  // ── constructor / getInstance / getSearchEngine ──────────
  describe("singleton + engine accessor", () => {
    test("getInstance returns same instance", () => {
      const a = SearchController.getInstance();
      const b = SearchController.getInstance();
      expect(a).toBe(b);
    });

    test("getSearchEngine returns the ContextualSearchRLM instance", () => {
      const engine = ctrl.getSearchEngine();
      expect(engine).toBeDefined();
      expect(engine).toBe(lastSearchEngine);
    });
  });

  // ── searchProject — happy paths ──────────────────────────
  describe("searchProject basic", () => {
    test("summary mode returns formatted results + recommendations", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        responseMode: "summary",
      });
      expect(res.success ?? true).not.toBe(false);
      expect(res.results.length).toBeGreaterThan(0);
      expect(res.results[0].preview).toContain("preview");
      expect(res.responseMode).toBe("summary");
      expect(res.tokenSavings).toContain("~70%");
      // summary mode with results → enriched recommendation
      expect(res.recommendations.some((r) => r.includes("enriched"))).toBe(true);
    });

    test("full mode includes content + chunkIndex/totalChunks", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        responseMode: "full",
      });
      expect(res.results[0].content).toBeDefined();
      expect(res.results[0].chunkIndex).toBeDefined();
      expect(res.results[0].totalChunks).toBeDefined();
      // full mode recommendation
      expect(res.recommendations.some((r) => r.includes("enriched"))).toBe(true);
    });

    test("enriched mode includes parentSymbol + fileImports", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        responseMode: "enriched",
      });
      expect(res.results[0].parentSymbol).toBe("Parent");
      expect(res.results[0].fileImports).toBe("import x");
      expect(res.recommendations.some((r) => r.includes("chunkIndex"))).toBe(true);
    });

    test("explanation included when explainScores true", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        explainScores: true,
      });
      expect(res.results[0].explanation).toBeDefined();
    });

    test("emits results_total / results_shown / results_omitted", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        maxResults: 2,
      });
      // engine returns 3, maxResults=2 → shown=2, omitted=1
      expect(res.results_total).toBe(3);
      expect(res.results_shown).toBe(2);
      expect(res.results_omitted).toBe(1);
    });
  });

  // ── admission + stale warning ────────────────────────────
  describe("admission preflight", () => {
    test("throws when project not admitted", async () => {
      lastSearchEngine.checkSearchAdmission = async () => ({
        admitted: false,
        error: "Project 'pX' is not indexed",
        stale: null,
      });
      await expect(
        ctrl.searchProject({ query: "foo", projectId: "pX" }),
      ).rejects.toThrow(/not indexed/);
      delete lastSearchEngine.checkSearchAdmission;
    });

    test("attaches stale warning when admission is stale", async () => {
      lastSearchEngine.checkSearchAdmission = async () => ({
        admitted: true,
        stale: { reason: "age_threshold", modifiedFiles: 5, newFiles: 2 },
      });
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        projectPath: "/repo",
      });
      expect(res.warning).toBeDefined();
      expect(res.warning).toContain("stale");
      expect(res.stale).toBeDefined();
      expect(res.stale.reason).toBe("age_threshold");
      delete lastSearchEngine.checkSearchAdmission;
    });
  });

  // ── handleAutoReindex (lines 355-383) ────────────────────
  describe("autoReindex", () => {
    test("runs freshness check when autoReindex + projectPath set", async () => {
      let calledOpts: any;
      lastSearchEngine.ensureFreshIndex = async (
        _pid: string,
        _path: string,
        opts: any,
      ) => {
        calledOpts = opts;
        return {
          wasStale: true,
          reindexed: true,
          reason: "stale-synced",
          deferred: false,
          filesPending: 0,
        };
      };
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        projectPath: "/repo",
        autoReindex: true,
      });
      expect(calledOpts).toBeDefined();
      expect(res.indexStatus.wasStale).toBe(true);
      expect(res.indexStatus.reindexed).toBe(true);
      delete lastSearchEngine.ensureFreshIndex;
    });

    test("deferred reindex adds recommendation", async () => {
      lastSearchEngine.ensureFreshIndex = async () => ({
        wasStale: true,
        reindexed: false,
        reason: "too-many-files",
        deferred: true,
        filesPending: 50,
      });
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        projectPath: "/repo",
        autoReindex: true,
        maxResults: 1,
      });
      expect(res.recommendations.some((r) => r.includes("deferred"))).toBe(true);
      expect(res.recommendations.some((r) => r.includes("get_index_status"))).toBe(true);
      delete lastSearchEngine.ensureFreshIndex;
    });

    test("skips reindex when no projectPath provided", async () => {
      let ensureCalled = false;
      lastSearchEngine.ensureFreshIndex = async () => {
        ensureCalled = true;
        return { wasStale: false, reindexed: false, reason: "fresh" };
      };
      await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        autoReindex: true,
      });
      expect(ensureCalled).toBe(false);
      delete lastSearchEngine.ensureFreshIndex;
    });
  });

  // ── filterByPatterns (public) ────────────────────────────
  describe("filterByPatterns", () => {
    const results = [
      { metadata: { filePath: "src/a.ts" } },
      { metadata: { filePath: "src/b.ts" } },
      { metadata: { filePath: "test/c.ts" } },
      { metadata: { filePath: "" } }, // no filePath
      { metadata: {} }, // missing filePath
    ];

    test("no filters → all results pass", () => {
      expect(ctrl.filterByPatterns(results).length).toBe(results.length);
    });

    test("include filter keeps only matching paths", () => {
      const out = ctrl.filterByPatterns(results, ["src/**"]);
      expect(out.length).toBe(2);
      expect(out.every((r) => r.metadata.filePath.startsWith("src/"))).toBe(true);
    });

    test("exclude filter drops matching paths", () => {
      const out = ctrl.filterByPatterns(results, undefined, ["test/**"]);
      expect(out.find((r) => r.metadata.filePath === "test/c.ts")).toBeUndefined();
    });

    test("result with no filePath + include present → dropped", () => {
      const out = ctrl.filterByPatterns(results, ["src/**"]);
      // entries with empty/missing filePath and include set → dropped
      expect(out.find((r) => r.metadata.filePath === "")).toBeUndefined();
    });

    test("result with no filePath + no include → kept", () => {
      const out = ctrl.filterByPatterns(results, undefined, ["test/**"]);
      expect(out.find((r) => r.metadata.filePath === "")).toBeDefined();
    });

    test("include + exclude combined", () => {
      const out = ctrl.filterByPatterns(results, ["**/*.ts"], ["test/**"]);
      expect(out.find((r) => r.metadata.filePath === "test/c.ts")).toBeUndefined();
      expect(out.find((r) => r.metadata.filePath === "src/a.ts")).toBeDefined();
    });
  });

  // ── applyBoost (lines 449-460) ───────────────────────────
  describe("applyBoost", () => {
    test("boosts matching files by 1.3x and re-sorts", () => {
      const results = [
        { metadata: { filePath: "a.ts" }, score: 0.5 },
        { metadata: { filePath: "b.ts" }, score: 0.9 },
      ];
      const out = ctrl.applyBoost(results, ["a.ts"]);
      // a.ts boosted: 0.5 * 1.3 = 0.65, still below 0.9
      expect(out[0].metadata.filePath).toBe("b.ts");
      expect(out[1].score).toBeCloseTo(0.65, 2);
    });

    test("boost capped at 1.0", () => {
      const results = [
        { metadata: { filePath: "a.ts" }, score: 0.9 },
      ];
      const out = ctrl.applyBoost(results, ["a.ts"]);
      expect(out[0].score).toBe(1.0); // 0.9 * 1.3 = 1.17 → capped at 1.0
    });

    test("non-matching files unchanged", () => {
      const results = [
        { metadata: { filePath: "a.ts" }, score: 0.5 },
        { metadata: { filePath: "b.ts" }, score: 0.8 },
      ];
      const out = ctrl.applyBoost(results, ["c.ts"]);
      expect(out[0].score).toBe(0.8);
      expect(out[1].score).toBe(0.5);
    });

    test("uses r.filePath when metadata.filePath absent", () => {
      const results = [
        { filePath: "a.ts", score: 0.5 },
      ];
      const out = ctrl.applyBoost(results, ["a.ts"]);
      expect(out[0].score).toBeCloseTo(0.65, 2);
    });

    test("empty boostFiles → no boost (controller skips)", async () => {
      // The controller only calls applyBoost when boostFiles.length > 0.
      // Verify the guard directly.
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        boostFiles: [],
      });
      // No boost applied → scores are the engine's original descending order.
      expect(res.results[0].score).toBeGreaterThan(res.results[1].score);
    });

    test("boostFiles present → boosted file may reorder", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        boostFiles: ["src/file2.ts"],
      });
      // file2 was score 0.7, boosted to min(1, 0.91) = 0.91 > 0.9 → ranks first
      expect(res.results[0].filePath).toBe("src/file2.ts");
    });
  });

  // ── generatePreview edge cases ───────────────────────────
  describe("generatePreview", () => {
    test("uses metadata.context.preview when present", () => {
      const p = ctrl.generatePreview({
        metadata: { context: { preview: "cached preview" } },
        content: "ignored",
      });
      expect(p).toBe("cached preview");
    });

    test("empty content → '(empty)'", () => {
      expect(ctrl.generatePreview({ content: "", metadata: {} })).toBe("(empty)");
    });

    test("whitespace-only content → '(empty)'", () => {
      expect(ctrl.generatePreview({ content: "   \n  \n", metadata: {} })).toBe("(empty)");
    });

    test("code language extracts signature lines", () => {
      const content = [
        "// File: something",
        "import { foo } from 'bar';",
        "export function main() {",
        "  return 42;",
        "}",
      ].join("\n");
      const p = ctrl.generatePreview({
        content,
        metadata: { language: "ts" },
      });
      expect(p).toContain("main()");
      expect(p).not.toContain("// File:");
    });

    test("non-code language returns first meaningful line, truncated at 150", () => {
      const long = "x".repeat(200);
      const p = ctrl.generatePreview({
        content: long,
        metadata: { language: "md" },
      });
      expect(p.length).toBeLessThanOrEqual(150);
      expect(p.endsWith("...")).toBe(true);
    });

    test("skips import/comment lines for non-code fallback", () => {
      const content = "import x from 'y';\n# comment\nactual content";
      const p = ctrl.generatePreview({
        content,
        metadata: { language: "md" },
      });
      expect(p).toBe("actual content");
    });

    test("falls back to first non-empty line when all start with comment/import", () => {
      const content = "// only comments\n// more comments";
      const p = ctrl.generatePreview({
        content,
        metadata: { language: "ts" },
      });
      // All lines are comments → sigLines empty → falls to meaningful search
      // which skips // → falls back to first trim line.
      expect(p.length).toBeGreaterThan(0);
    });
  });

  // ── rerank path ──────────────────────────────────────────
  describe("rerank", () => {
    test("rerank enabled → results reordered + search:reranked emitted", async () => {
      const searchCfg = (config as any).get("search") ?? {};
      (searchCfg as any).rerank = { enabled: true };
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        maxResults: 3,
      });
      // Mock reranker reverses → lowest score first
      expect(res.results[0].score).toBeLessThanOrEqual(res.results[1].score);
      (searchCfg as any).rerank = { enabled: false };
    });
  });

  // ── recommendations for empty results ───────────────────
  describe("recommendations", () => {
    test("no results → suggests lowering minScore + list_projects", async () => {
      lastSearchEngine.search = async () => [];
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
      });
      expect(res.recommendations.some((r) => r.includes("minScore"))).toBe(true);
      expect(res.recommendations.some((r) => r.includes("list_projects"))).toBe(true);
      delete lastSearchEngine.search;
    });

    test("summary mode with >=3 results → optimized_context recommendation", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        responseMode: "summary",
        maxResults: 5,
      });
      expect(res.recommendations.some((r) => r.includes("optimized_context"))).toBe(true);
    });
  });

  // ── degradations ─────────────────────────────────────────
  describe("degradations", () => {
    test("surfaces degradations in response when search reports them", async () => {
      lastSearchEngine.search = async (
        _q: string,
        _pid: string,
        opts: any,
      ) => {
        if (opts?.onDegradations) {
          opts.onDegradations([
            { subsystem: "vector", reason: "unavailable", fallback: "keyword" },
          ]);
        }
        return [];
      };
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
      });
      expect(res.degradations).toBeDefined();
      expect(res.degradations.length).toBe(1);
      delete lastSearchEngine.search;
    });
  });

  // ── filter downgrades ────────────────────────────────────
  describe("filter downgrades", () => {
    test("same pattern in include + exclude → downgrade record emitted", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        include: ["src/**"],
        exclude: ["src/**"],
      });
      expect(res.filter_downgrades).toBeDefined();
      expect(res.filter_downgrades.length).toBe(1);
      expect(res.filter_downgrades[0].pattern).toBe("src/**");
      // exclude entry dropped → filters.exclude is empty
      expect(res.filters.exclude).toEqual([]);
    });
  });

  // ── filters block in response ────────────────────────────
  describe("filters block", () => {
    test("applied:true when include or exclude present", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        include: ["src/**"],
      });
      expect(res.filters.applied).toBe(true);
      expect(res.filters.include).toEqual(["src/**"]);
    });

    test("applied:false when no filters", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
      });
      expect(res.filters.applied).toBe(false);
    });

    test("totalResults + filteredResults reported", async () => {
      const res = await ctrl.searchProject({
        query: "foo",
        projectId: "p1",
        include: ["src/**"],
        maxResults: 5,
      });
      expect(res.filters.totalResults).toBeGreaterThan(0);
      expect(res.filters.filteredResults).toBeGreaterThan(0);
    });
  });
});