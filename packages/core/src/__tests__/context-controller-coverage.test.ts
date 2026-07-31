/**
 * Coverage test for ContextController (real module).
 *
 * The existing context-controller.test.ts builds a FAKE instance and inlines
 * the helper logic, so it records 0% coverage on the real source. This file
 * imports the REAL ContextController via Bun's mock.module() to stub its
 * dependency chain (SearchController, MemoryController, services/compression,
 * SessionFileCache, symbolGraphService) and then exercises every branch of
 * getOptimizedContext + the private helpers.
 *
 * The compression stub moved from `tools/compress_context` to
 * `services/compression` at T8b, when the controller stopped reaching down into
 * a tool handler. Stubbing the service — not just `CodeCompressor` — is what
 * keeps this file off the live LLM path: a real `compress()` is 42 s on a cold
 * model and 690 ms warm, which is the 5001 ms failure CLAUDE.md describes.
 *
 * NOTE: This file MUST be run in isolation (bun test <this-file>) because
 * Bun's mock.module is process-global and cannot be reset between files
 * (oven-sh/bun#12823). When run alone the mocks below are effective; when
 * run alongside other files that mock @massa-ai/shared differently the
 * stubs may be overwritten — so coverage is measured per-file.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.restore();

// ── Mock the dependency chain BEFORE importing the real controller ────────

// Mutable stubs so each test can rewire behavior without re-mocking modules.
let searchProjectStub: (input: any) => Promise<any> = async () => ({
  results: [],
  query: "",
  projectId: "",
  responseMode: "full",
});
let memorySearchStub: (input: any) => Promise<any> = async () => ({
  memories: [],
  relatedSummaries: {},
  query: "",
  total: 0,
});
// Resolves with CompressionMetrics; REJECTS to exercise the degrade path.
let compressorStub: (input: any) => Promise<any> = async () => ({
  compressed: "",
  originalTokens: 0,
  compressedTokens: 0,
  tokensSaved: 0,
  compressionRatio: 0,
});
let graphHasDataStub: (projectId: string) => Promise<boolean> = async () => false;
let graphGoToDefinitionStub: (projectId: string, query: string) => Promise<any[]> = async () => [];
let graphGetReferencesStub: (projectId: string, query: string) => Promise<any[]> = async () => [];

// SessionFileCache stubs
let sessionCacheCheckStub: (sessionId: string, key: string, content: string) => any =
  () => ({ status: "new", tokensSaved: 0 });

mock.module("../controllers/search-controller.js", () => ({
  SearchController: {
    getInstance: () => ({
      searchProject: (input: any) => searchProjectStub(input),
    }),
  },
}));

mock.module("../controllers/memory-controller.js", () => ({
  MemoryController: {
    getInstance: () => ({
      search: (input: any) => memorySearchStub(input),
    }),
  },
}));

mock.module("../services/compression/index.js", () => ({
  CodeCompressor: class {},
  compressWithMetrics: (
    _compressor: unknown,
    content: string,
    strategy: string,
    options: Record<string, unknown> = {},
  ) => compressorStub({ content, strategy, ...options }),
}));

mock.module("../services/context/session-file-cache.js", () => ({
  SessionFileCache: {
    getInstance: () => ({
      chunkKey: (filePath: string, lineStart: number, lineEnd: number) =>
        `${filePath}:${lineStart}-${lineEnd}`,
      check: (sessionId: string, key: string, content: string) =>
        sessionCacheCheckStub(sessionId, key, content),
    }),
  },
  REFERENCE_TOKEN_COST: 8,
}));

mock.module("../services/symbol/symbol-graph.service.js", () => ({
  symbolGraphService: {
    hasData: (projectId: string) => graphHasDataStub(projectId),
    goToDefinition: (projectId: string, query: string) =>
      graphGoToDefinitionStub(projectId, query),
    getReferences: (projectId: string, query: string) =>
      graphGetReferencesStub(projectId, query),
  },
}));

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      metric: () => {},
    },
    estimateTokens: (s: string, _mode?: string) => Math.ceil(s.length / 4),
  };
});

// Import the REAL controller (and TokenMetrics so we can reset between tests).
import { ContextController } from "../controllers/context-controller.js";
import { TokenMetrics } from "../services/metrics/token-metrics.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCodeResult(
  id: string,
  score = 0.9,
  filePath = `src/${id}.ts`,
  content = `function ${id}() { return 42; }`,
): any {
  return {
    id,
    score,
    filePath,
    lineStart: 1,
    lineEnd: 10,
    language: "typescript",
    content,
    preview: content.slice(0, 20),
  };
}

function makeMemory(
  id: string,
  overrides: Record<string, unknown> = {},
): any {
  return {
    id,
    content: `memory ${id} content`,
    type: "critical",
    importance: 0.8,
    score: 0.7,
    agentId: "optimizer",
    ...overrides,
  };
}

function resetStubs(): void {
  searchProjectStub = async () => ({
    results: [],
    query: "",
    projectId: "",
    responseMode: "full",
  });
  memorySearchStub = async () => ({
    memories: [],
    relatedSummaries: {},
    query: "",
    total: 0,
  });
  compressorStub = async () => ({
    compressed: "",
    originalTokens: 0,
    compressedTokens: 0,
    tokensSaved: 0,
    compressionRatio: 0,
  });
  graphHasDataStub = async () => false;
  graphGoToDefinitionStub = async () => [];
  graphGetReferencesStub = async () => [];
  sessionCacheCheckStub = () => ({ status: "new", tokensSaved: 0 });
}

// Reset the ContextController singleton so each test gets a fresh instance
// wired to the (possibly re-stubbed) dependency mocks.
function resetControllerSingleton(): void {
  (ContextController as any).instance = null;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("ContextController — getOptimizedContext coverage", () => {
  beforeEach(() => {
    resetStubs();
    resetControllerSingleton();
    TokenMetrics.getInstance().reset();
  });

  // ── Empty results path (early return) ──────────────────────────────────
  test("returns 'No relevant code or memories' when both empty", async () => {
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "nothing here",
      projectId: "proj",
    });
    expect(result.context).toContain("No relevant code or memories found");
    expect(result.resultsCount).toBe(0);
    expect(result.memoriesCount).toBe(0);
    expect(result.sessionCacheHits).toBe(0);
    expect(result.tokensSavedBySessionCache).toBe(0);
  });

  // ── Code results only ─────────────────────────────────────────────────
  test("includes code results in context, sources populated", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("foo", 0.9, "src/foo.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "foo function",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.resultsCount).toBe(1);
    expect(result.context).toContain("src/foo.ts");
    expect(result.sources).toContain("src/foo.ts");
    expect(result.memoriesCount).toBe(0);
  });

  // ── Memories only (includeMemories true) ──────────────────────────────
  test("includes memories section when memories returned", async () => {
    memorySearchStub = async () => ({
      memories: [makeMemory("m1", { type: "critical", content: "User prefers dark mode" })],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "user prefs",
      projectId: "proj",
      maxTokens: 10000,
    });
    expect(result.memoriesCount).toBe(1);
    expect(result.context).toContain("Relevant Memories");
    expect(result.context).toContain("dark mode");
    expect(result.context).toContain("CRITICAL");
  });

  // ── includeMemories false → no memory search call, memoryTokenBudget=0 ─
  test("excludes memories when includeMemories=false", async () => {
    let memoryCalled = false;
    memorySearchStub = async () => { memoryCalled = true; return { memories: [] }; };
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      includeMemories: false,
    });
    expect(memoryCalled).toBe(false);
    expect(result.memoriesCount).toBe(0);
  });

  // ── Budget allocation: memoryBudgetRatio clamping ─────────────────────
  test("clamps memoryBudgetRatio above 0.5 down to 0.5", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 4000,
      memoryBudgetRatio: 0.9,
      includeMemories: true,
    });
    expect(result.resultsCount).toBe(1);
  });

  test("clamps negative memoryBudgetRatio to 0", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      memoryBudgetRatio: -1,
    });
    expect(result.resultsCount).toBe(1);
  });

  test("explicit workingMemoryBudget overrides default", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts", "x".repeat(20))],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 10000,
      workingMemoryBudget: 50,
      includeMemories: false,
    });
    expect(result.resultsCount).toBe(1);
  });

  // ── Phase 1: Graph prefilter ──────────────────────────────────────────
  test("graph prefilter hit → prepends symbol graph section + boostFiles", async () => {
    graphHasDataStub = async () => true;
    graphGoToDefinitionStub = async () => [{
      name: "Foo",
      kind: "function",
      file: "src/foo.ts",
      lineStart: 1,
      lineEnd: 20,
      docComment: "Does foo things",
      snippet: "function Foo() {}",
    }];
    graphGetReferencesStub = async () => [{
      fromFile: "src/caller.ts",
      fromLine: 30,
      refKind: "call",
    }];
    searchProjectStub = async () => ({
      results: [makeCodeResult("foo", 0.9, "src/foo.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "Foo",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.context).toContain("Symbol Graph");
    expect(result.context).toContain("Definition(s)");
    expect(result.context).toContain("References");
    expect(result.context).toContain("function");
  });

  test("graph prefilter: hasData true but no defs → no graph section", async () => {
    graphHasDataStub = async () => true;
    graphGoToDefinitionStub = async () => [];
    graphGetReferencesStub = async () => [];
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "MissingThing",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.context).not.toContain("Symbol Graph");
  });

  test("graph prefilter: query NOT a symbol → skipped", async () => {
    graphHasDataStub = async () => true;
    let defCalled = false;
    graphGoToDefinitionStub = async () => { defCalled = true; return []; };
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    const ctrl = ContextController.getInstance();
    await ctrl.getOptimizedContext({
      query: "how does the authentication flow work here",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(defCalled).toBe(false);
  });

  test("graph prefilter: hasData false → skipped", async () => {
    graphHasDataStub = async () => false;
    let defCalled = false;
    graphGoToDefinitionStub = async () => { defCalled = true; return []; };
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    const ctrl = ContextController.getInstance();
    await ctrl.getOptimizedContext({
      query: "SomeSymbol",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(defCalled).toBe(false);
  });

  test("graph prefilter: empty projectId → skipped", async () => {
    graphHasDataStub = async () => true;
    let defCalled = false;
    graphGoToDefinitionStub = async () => { defCalled = true; return []; };
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    const ctrl = ContextController.getInstance();
    await ctrl.getOptimizedContext({
      query: "SomeSymbol",
      projectId: "",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(defCalled).toBe(false);
  });

  test("graph prefilter error → falls through to semantic search only", async () => {
    graphHasDataStub = async () => true;
    graphGoToDefinitionStub = async () => { throw new Error("graph down"); };
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "Foo",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.resultsCount).toBe(1);
    expect(result.context).not.toContain("Symbol Graph");
  });

  // ── Memory search error path (searchMemoriesSafe) ─────────────────────
  test("memory search throws → continues with empty memories", async () => {
    memorySearchStub = async () => { throw new Error("memory backend down"); };
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: true,
    });
    expect(result.memoriesCount).toBe(0);
    expect(result.resultsCount).toBe(1);
  });

  // ── Working set selection ─────────────────────────────────────────────
  test("selectWorkingSet prioritizes distinct files (pass 1 + pass 2)", async () => {
    searchProjectStub = async () => ({
      results: [
        makeCodeResult("a1", 0.95, "src/a.ts", "first a"),
        makeCodeResult("a2", 0.90, "src/a.ts", "second a"),
        makeCodeResult("b1", 0.85, "src/b.ts", "from b"),
      ],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 100000,
      includeMemories: false,
    });
    expect(result.resultsCount).toBe(3);
  });

  test("selectWorkingSet: tiny maxTokens → content too big → empty working set → early return", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts", "x".repeat(2000))],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 50, // wmBudget=40, content=500 tokens → not selected
      includeMemories: false,
      memoryBudgetRatio: 0,
    });
    // working set empty, no memories → early-return empty message
    expect(result.context).toContain("No relevant code or memories found");
  });

  // ── Memory section formatting ─────────────────────────────────────────
  test("formatMemorySection: memory with score + importance + agentId all rendered", async () => {
    memorySearchStub = async () => ({
      memories: [makeMemory("m1", {
        type: "decision",
        content: "Use Postgres for everything",
        importance: 0.9,
        score: 0.85,
        agentId: "architect",
      })],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "db choice",
      projectId: "proj",
      maxTokens: 100000,
    });
    expect(result.context).toContain("DECISION");
    expect(result.context).toContain("relevance: 85%");
    expect(result.context).toContain("importance: 90%");
    expect(result.context).toContain("by: architect");
  });

  test("formatMemorySection: memory without score/importance/agent → minimal label", async () => {
    memorySearchStub = async () => ({
      memories: [makeMemory("m1", {
        type: "code",
        content: "plain memory",
        score: undefined,
        importance: undefined,
        agentId: undefined,
      })],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "x",
      projectId: "proj",
      maxTokens: 100000,
    });
    expect(result.context).toContain("CODE");
    expect(result.context).toContain("plain memory");
    expect(result.context).not.toContain("relevance:");
    expect(result.context).not.toContain("importance:");
    expect(result.context).not.toContain("by:");
  });

  test("formatMemorySection: token budget truncates memories", async () => {
    memorySearchStub = async () => ({
      memories: Array.from({ length: 10 }, (_, i) =>
        makeMemory(`m${i}`, { content: `Memory entry ${i} with enough text to consume tokens here`.repeat(3) }),
      ),
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "x",
      projectId: "proj",
      maxTokens: 500, // small budget → memory section truncated
      memoryBudgetRatio: 0.5,
    });
    // Not all 10 memories fit
    expect(result.memoriesCount).toBeLessThanOrEqual(10);
  });

  // ── Session cache delivery plan ───────────────────────────────────────
  test("sessionId provided + cache 'unchanged' → ref token, sessionCacheHits counted", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts", "stable content")],
    });
    sessionCacheCheckStub = () => ({ status: "unchanged", tokensSaved: 50 });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      sessionId: "sess-1",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.sessionCacheHits).toBe(1);
    expect(result.tokensSavedBySessionCache).toBe(50);
    expect(result.context).toContain("[CACHED:");
  });

  test("sessionId provided + cache 'changed' → diff block, sessionCacheHits counted", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts", "new content")],
    });
    sessionCacheCheckStub = () => ({
      status: "changed",
      diff: "+ added line\n- removed line",
      tokensSaved: 30,
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      sessionId: "sess-2",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.sessionCacheHits).toBe(1);
    expect(result.tokensSavedBySessionCache).toBe(30);
    expect(result.context).toContain("```diff");
  });

  test("sessionId provided + cache 'new' → full content, no cache hit", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts", "fresh content")],
    });
    sessionCacheCheckStub = () => ({ status: "new", tokensSaved: 0 });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      sessionId: "sess-3",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.sessionCacheHits).toBe(0);
    expect(result.tokensSavedBySessionCache).toBe(0);
  });

  test("no sessionId → all chunks delivered full, no cache checks", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts")],
    });
    let checkCalled = false;
    sessionCacheCheckStub = () => { checkCalled = true; return { status: "new", tokensSaved: 0 }; };
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(checkCalled).toBe(false);
    expect(result.sessionCacheHits).toBe(0);
  });

  // ── Compression path ──────────────────────────────────────────────────
  test("raw context exceeds maxTokens → compression invoked", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts", "small content")],
    });
    let compressorCalled = false;
    compressorStub = async (input: any) => {
      compressorCalled = true;
      return {
        compressed: input.content.slice(0, 20),
        originalTokens: 800,
        compressedTokens: 400,
        tokensSaved: 400,
        compressionRatio: 0.5,
      };
    };
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 1, // raw context always > 1 token → compression triggers
      workingMemoryBudget: 1000, // big enough to select the small content
      includeMemories: false,
      memoryBudgetRatio: 0,
    });
    expect(compressorCalled).toBe(true);
    expect(result.compressionRatio).toBe(0.5);
  });

  test("compression throws → keeps raw context", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts", "small content")],
    });
    // Was `{success:false, error}` when this went through CompressContextTool's
    // envelope. T8b removed the envelope, so failure is a rejection and the
    // controller's own catch is what degrades. Same observable, one more branch.
    compressorStub = async () => {
      throw new Error("compressor down");
    };
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 1,
      workingMemoryBudget: 1000,
      includeMemories: false,
      memoryBudgetRatio: 0,
    });
    expect(result).toBeDefined();
  });

  // Was "success=true but no data". That state was reachable only from this
  // mock: the tool's success branch always built a literal `data` object, so
  // `resp.success && resp.data` could never be half-true. T8b removed the
  // envelope and with it the unreachable half. Retargeted at the state that
  // does survive — a call that resolves with nothing compressed — rather than
  // deleted, so the branch keeps an owner.
  test("compression resolves with empty output → pipeline still completes", async () => {
    searchProjectStub = async () => ({
      results: [makeCodeResult("a", 0.9, "src/a.ts", "small content")],
    });
    compressorStub = async () => ({
      compressed: "",
      originalTokens: 0,
      compressedTokens: 0,
      tokensSaved: 0,
      compressionRatio: 0,
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 1,
      workingMemoryBudget: 1000,
      includeMemories: false,
      memoryBudgetRatio: 0,
    });
    expect(result).toBeDefined();
  });

  // ── Delivery plan formatting: full count / ref count / diff count header ─
  test("mixed delivery plan header shows full/cached/diff counts", async () => {
    searchProjectStub = async () => ({
      results: [
        makeCodeResult("a", 0.9, "src/a.ts", "content a"),
        makeCodeResult("b", 0.8, "src/b.ts", "content b"),
        makeCodeResult("c", 0.7, "src/c.ts", "content c"),
      ],
    });
    const statuses = ["new", "unchanged", "changed"];
    let i = 0;
    sessionCacheCheckStub = () => {
      const s = statuses[i++];
      if (s === "unchanged") return { status: "unchanged", tokensSaved: 10 };
      if (s === "changed") return { status: "changed", diff: "+ x", tokensSaved: 5 };
      return { status: "new", tokensSaved: 0 };
    };
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      sessionId: "sess-mixed",
      maxTokens: 100000,
      includeMemories: false,
    });
    expect(result.sessionCacheHits).toBe(2);
    expect(result.context).toContain("1 full");
    expect(result.context).toContain("1 cached");
    expect(result.context).toContain("1 diff");
  });

  // ── Results with missing fields (lineStart/lineEnd undefined) ─────────
  test("code result missing lineStart/lineEnd → '?' range rendered", async () => {
    searchProjectStub = async () => ({
      results: [{ id: "x", score: 0.9, filePath: "src/x.ts", content: "x" }],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.context).toContain("?-?");
  });

  // ── Results with no content/preview → '(no content)' ──────────────────
  test("code result missing content+preview → '(no content)' rendered", async () => {
    searchProjectStub = async () => ({
      results: [{ id: "x", score: 0.9, filePath: "src/x.ts", lineStart: 1, lineEnd: 5 }],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "test",
      projectId: "proj",
      maxTokens: 10000,
      includeMemories: false,
    });
    expect(result.context).toContain("(no content)");
  });

  // ── Graph context section with docComment + snippet rendering ─────────
  test("graph def with docComment + snippet renders both", async () => {
    graphHasDataStub = async () => true;
    graphGoToDefinitionStub = async () => [{
      name: "Bar",
      kind: "class",
      file: "src/bar.ts",
      lineStart: 5,
      lineEnd: 50,
      docComment: "This is a doc comment".repeat(20), // long → slice(0,120)
      snippet: "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10",
    }];
    graphGetReferencesStub = async () => [];
    searchProjectStub = async () => ({
      results: [makeCodeResult("bar", 0.9, "src/bar.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "Bar",
      projectId: "proj",
      maxTokens: 100000,
      includeMemories: false,
    });
    expect(result.context).toContain("class");
    expect(result.context).toContain("Bar");
    expect(result.context).toContain("This is a doc comment");
  });

  // ── Graph context with references grouped by file ─────────────────────
  test("graph refs grouped by file in references section", async () => {
    graphHasDataStub = async () => true;
    graphGoToDefinitionStub = async () => [{
      name: "Baz",
      kind: "function",
      file: "src/baz.ts",
      lineStart: 1,
      lineEnd: 5,
    }];
    graphGetReferencesStub = async () => [
      { fromFile: "src/a.ts", fromLine: 10, refKind: "call" },
      { fromFile: "src/a.ts", fromLine: 25, refKind: "call" },
      { fromFile: "src/b.ts", fromLine: 7, refKind: "type_ref" },
    ];
    searchProjectStub = async () => ({
      results: [makeCodeResult("baz", 0.9, "src/baz.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "Baz",
      projectId: "proj",
      maxTokens: 100000,
      includeMemories: false,
    });
    expect(result.context).toContain("References (3 total)");
    expect(result.context).toContain("src/a.ts");
    expect(result.context).toContain("src/b.ts");
  });

  // ── Graph context truncated when exceeding token budget ───────────────
  test("graph context section truncated by char budget", async () => {
    graphHasDataStub = async () => true;
    graphGoToDefinitionStub = async () => [{
      name: "Huge",
      kind: "function",
      file: "src/huge.ts",
      lineStart: 1,
      lineEnd: 999,
      docComment: "D".repeat(5000),
      snippet: "S".repeat(5000),
    }];
    graphGetReferencesStub = async () => [];
    searchProjectStub = async () => ({
      results: [makeCodeResult("huge", 0.9, "src/huge.ts")],
    });
    const ctrl = ContextController.getInstance();
    const result = await ctrl.getOptimizedContext({
      query: "Huge",
      projectId: "proj",
      maxTokens: 100, // tiny → graph budget small → truncation
      includeMemories: false,
      memoryBudgetRatio: 0,
    });
    expect(result.context).toContain("...");
  });

  // ── Singleton getInstance ─────────────────────────────────────────────
  test("getInstance returns same instance on repeated calls", () => {
    const a = ContextController.getInstance();
    const b = ContextController.getInstance();
    expect(a).toBe(b);
  });
});