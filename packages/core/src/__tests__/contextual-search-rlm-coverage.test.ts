/**
 * Coverage test for four thin instance-method delegates on ContextualSearchRLM.
 * Located by symbol, not by line — the range it cited was ~180 lines stale.
 *
 * The search-facade-*.test.ts suites drive the capability modules directly,
 * which leaves these instance wrappers uncovered:
 *   - filterByPatterns          (hybrid-search.ts)
 *   - clearProjectIndex         (index-admin.ts)
 *   - getProjectStats           (index-admin.ts)
 *   - warmupCache               (index-admin.ts)
 *
 * Uses the injected-deps constructor seam so no factory calls are made, and
 * mocks the heavy infrastructure to stay in the shared process group.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SearchSource, type SearchResult } from "@massa-ai/shared";

mock.restore();

mock.module("../data/keyword/keyword-search-factory.js", () => ({
  getKeywordSearch: mock(async () => ({})),
}));
// ensureInitialized falls back to the real factory for any dependency the
// subject did not inject (`injected.vectorStore ? ... : getVectorStore()`).
// The four factories around this one were already mocked for exactly that
// reason; this one was missed, so every `makeRlm({})` subject built a real
// PostgresVectorStore and ran live embedding-provider auto-selection —
// measured at ~13.4s cold, against bunfig.toml's 5s per-test budget. The three
// warmupCache tests below are the ones that construct without deps.
mock.module("../data/vector/vector-store-factory.js", () => ({
  getVectorStore: mock(async () => ({
    search: async () => [],
    searchByEmbedding: async () => [],
    addDocuments: async () => {},
  })),
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

// ── Forwarding-contract mocks (M14 facade delegation) ───────────────────────
//
// indexFile / searchImpl / applySynapseState / correctQuery /
// buildGraphStream / fuseResults / generateScoreExplanation /
// addContextToResultsImpl / extractPreviewImpl / calculateAvgScoreImpl /
// runWithIndexLock / indexProjectInternal / ensureFreshIndex /
// checkSearchAdmission are replaced with spies below so the describe
// blocks further down can assert the facade forwards the *exact* arguments
// (including resolved defaults) to the delegate and passes its return value
// through unchanged — without needing to exercise the heavy, DB/FS-touching
// real bodies.
//
// filterByPatternsImpl / clearProjectIndexImpl / getProjectStatsImpl /
// warmupCacheImpl / loadGitignore are spread from the *real* modules and left
// untouched: the describe blocks above already assert their real, end-to-end
// behavior, which is a strictly stronger forwarding proof than a spy would
// give, and re-mocking them here would invalidate those tests (they rely on
// real filterByPatternsImpl to prove pattern logic).
//
// PR-B T10: `ensureInitialized` has left this list because it is no longer a
// module export to spread — it is the root's own method now, so nothing can
// mock it away and the tests above that depend on real injected-deps wiring are
// structurally safe rather than safe by this comment's convention.
const projectIndexerActual: typeof import("../services/search/project-indexer.js") =
  require("../services/search/project-indexer.js");
const hybridSearchActual: typeof import("../services/search/hybrid-search.js") =
  require("../services/search/hybrid-search.js");

const indexFileImplMock = mock(async () => ({ chunks: 0 }));
const runWithIndexLockMock = mock(
  async (
    _lockMap: unknown,
    _projectId: string,
    work: () => Promise<unknown>,
  ) => work(),
);
const indexProjectInternalImplMock = mock(async () => ({
  filesIndexed: 0,
  chunksIndexed: 0,
  errors: 0,
}));
const ensureFreshIndexImplMock = mock(async () => ({
  wasStale: false,
  reindexed: false,
}));
const checkSearchAdmissionImplMock = mock(async () => ({ admitted: true }));

// PR-B T10: the indexing surfaces moved to project-indexer.ts and traded the
// facade parameter for a narrow IndexerDeps record (GMS-03 AC-1). Re-pointed
// specifier, and the five spied names lost their `Impl` suffix with the move;
// `_indexProjectInternalImpl` became `indexProjectInternal` (the leading
// underscore was the facade method's, not the module function's). The local
// const names keep `Impl` deliberately — renaming them would touch fourteen
// more lines of this AC-3-pinned file for no observable gain.
mock.module("../services/search/project-indexer.js", () => ({
  ...projectIndexerActual,
  indexFile: indexFileImplMock,
  runWithIndexLock: runWithIndexLockMock,
  indexProjectInternal: indexProjectInternalImplMock,
  ensureFreshIndex: ensureFreshIndexImplMock,
  checkSearchAdmission: checkSearchAdmissionImplMock,
}));

// indexProject() calls this directly (not via project-indexer.js) before ever
// touching the lock/queue — must resolve so the delegate chain beneath it
// is reachable.
mock.module("../services/structural/parser-readiness.js", () => ({
  assertParserReadyForIndexing: mock(async () => {}),
}));

const searchImplMock = mock(async () => [] as SearchResult[]);
const addContextToResultsImplMock = mock(async () => [] as SearchResult[]);
const extractPreviewImplMock = mock((): string => "");
const calculateAvgScoreImplMock = mock((): number => 0);
const correctQueryMock = mock(async (): Promise<string | null> => null);

// PR-B T13: the five search surfaces moved to hybrid-search.ts, rlm-search.ts
// died whole, and the four spied names lost their `Impl` suffix with the move.
// This block and T9's `correctQuery` one are **merged, not re-pointed** — both
// would now name `hybrid-search.js`, and two `mock.module` registrations on one
// specifier do not compose: the later one replaces the module wholesale, so the
// root's other five imports would resolve to `undefined`. That is why the
// `mock.module` count goes 16 → **15** here, where T9's and T10's re-points held
// it at 16. The local const names keep `Impl` deliberately; renaming them would
// touch fourteen more lines of this AC-3-pinned file for no observable gain,
// exactly as at T10.
//
// `filterByPatterns` stays spread from the real module for the reason the block
// comment above gives: the describe blocks below assert its real pattern logic,
// which is a strictly stronger proof than a spy would be.
mock.module("../services/search/hybrid-search.js", () => ({
  ...hybridSearchActual,
  search: searchImplMock,
  addContextToResults: addContextToResultsImplMock,
  extractPreview: extractPreviewImplMock,
  calculateAvgScore: calculateAvgScoreImplMock,
  correctQuery: correctQueryMock,
}));

// PR-B T6: fuseResults / generateScoreExplanation moved out of rlm-search.ts's
// re-export into their own capability module, and lost the facade parameter
// (GMS-03 AC-1). Mocking them means naming the new module, so this block could
// no longer ride along on the rlm-search.js one it used to sit beside — a block
// T13 has since re-pointed to hybrid-search.js and merged with T9's.
const fuseResultsMock = mock((): SearchResult[] => []);
const generateScoreExplanationMock = mock((): unknown => ({}));

mock.module("../services/search/result-fusion.js", () => ({
  fuseResults: fuseResultsMock,
  generateScoreExplanation: generateScoreExplanationMock,
}));

// PR-B T8: applySynapseState moved to its own capability module and traded the
// facade parameter for a narrow SessionBiasDeps record (GMS-03 AC-1). Same
// reason as the T6/T7 blocks above — mocking it means naming the new module.
const applySynapseStateMock = mock(async () => [] as SearchResult[]);

mock.module("../services/search/session-bias.js", () => ({
  applySynapseState: applySynapseStateMock,
}));

// PR-B T7: buildGraphStream moved to its own capability module and lost the
// facade parameter (GMS-03 AC-1) — it was the one delegate that already read
// zero facade members, so `_rlm` was pure ceremony. Same reason as the T6
// block above: mocking it means naming the new module.
const buildGraphStreamMock = mock(async () => [] as SearchResult[]);

mock.module("../services/search/graph-stream.js", () => ({
  buildGraphStream: buildGraphStreamMock,
}));

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";
// Mocked (loadProjectIgnore returns null): imported after its mock.module
// registration above so this binding resolves to the spy.
import { loadProjectIgnore } from "../services/search/ignore-patterns.js";

beforeEach(() => {
  indexFileImplMock.mockClear();
  runWithIndexLockMock.mockClear();
  indexProjectInternalImplMock.mockClear();
  ensureFreshIndexImplMock.mockClear();
  checkSearchAdmissionImplMock.mockClear();
  searchImplMock.mockClear();
  fuseResultsMock.mockClear();
  generateScoreExplanationMock.mockClear();
  addContextToResultsImplMock.mockClear();
  extractPreviewImplMock.mockClear();
  calculateAvgScoreImplMock.mockClear();
  applySynapseStateMock.mockClear();
  correctQueryMock.mockClear();
  buildGraphStreamMock.mockClear();
  (loadProjectIgnore as unknown as ReturnType<typeof mock>).mockClear?.();
});

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

/**
 * PR-B T10: the `IndexerDeps` record the root assembles per call, in place of
 * the `rlm` first argument the four indexing delegates used to take (GMS-03
 * AC-1). Named once so each of the eight signature-tracking assertions below
 * stays a one-token substitution.
 *
 * The five stores are matched **by identity** off the subject, which is why the
 * callers await the facade method first: `ensureInitialized` is now hoisted into
 * the three methods that always ran it, so the fields are populated by the time
 * the assertion reads them. That matters — bun's `toHaveBeenCalledWith` treats
 * an undefined-valued expected key as absent, so a record of five `undefined`s
 * would also be satisfied by a facade that assembled `{}`.
 *
 * `indexFile` / `indexProject` are re-entrant seams the root supplies as arrow
 * wrappers re-created on every assembly (the only shape under which the six
 * sites that stub those methods on the instance stay effective — LATE-BIND), so
 * a fresh closure is unnameable and `expect.any(Function)` is the tightest
 * available check. These are the only two loose keys in this file and they are
 * on keys that did not exist before, so nothing was relaxed: the key set is
 * still exact in both directions (a missing or extra key fails, measured), and
 * *dispatch* through those two closures is proved by identity in
 * `project-indexer-late-bind.test.ts` rather than left to this matcher.
 */
function indexerDeps(rlm: ContextualSearchRLM) {
  return {
    indexManager: rlm.indexManager,
    symbolRepo: rlm.symbolRepo,
    keywordSearch: rlm.keywordSearch,
    vectorStore: rlm.vectorStore,
    searchCache: rlm.searchCache,
    indexFile: expect.any(Function),
    indexProject: expect.any(Function),
  };
}

/**
 * PR-B T13: the `HybridSearchDeps` record the root assembles per call, in place
 * of the `rlm` first argument `searchImpl` used to take (GMS-03 AC-1). Named once
 * so both signature-tracking assertions below stay a one-token substitution,
 * exactly as `indexerDeps` is for T10's eight.
 *
 * The five stores are matched **by identity** off the subject, and no explicit
 * init call is needed here — unlike T10's two `indexFile` cases. T13 hoists
 * `await this.ensureInitialized()` into `search()` itself (it has to: this record
 * snapshots the stores *by value*, so assembling before init would hand the
 * module five `undefined`s), so `await rlm.search(…)` has populated the fields by
 * the time the assertion reads them. That matters — bun's `toHaveBeenCalledWith`
 * treats an undefined-valued expected key as absent, so a record of five
 * `undefined`s would also be satisfied by a facade that assembled `{}`.
 *
 * The three callbacks are re-entrant seams the root supplies as arrow wrappers
 * re-created on every assembly — the only shape under which the 6
 * `buildGraphStream` and 6 `addContextToResults` instance-stub sites stay
 * effective (LATE-BIND) — so a fresh closure is unnameable and
 * `expect.any(Function)` is the tightest available check. With T10's two that
 * makes **5** loose keys in this file, every one on a key that did not exist
 * before, so nothing was relaxed: the key set is still exact in both directions
 * (a missing or extra key fails, measured), and *dispatch* through these three is
 * proved by identity in `hybrid-search-late-bind.test.ts` test 4 rather than left
 * to this matcher.
 */
function hybridDeps(rlm: ContextualSearchRLM) {
  return {
    keywordSearch: rlm.keywordSearch,
    vectorStore: rlm.vectorStore,
    searchCache: rlm.searchCache,
    analytics: rlm.analytics,
    queryUnderstanding: rlm.queryUnderstanding,
    buildGraphStream: expect.any(Function),
    addContextToResults: expect.any(Function),
    applySynapseState: expect.any(Function),
  };
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

describe("ContextualSearchRLM.getAnalytics (instance delegate)", () => {
  test("returns rlm.analytics unchanged (identity)", () => {
    const analyticsSentinel = { trackSearch: () => {} };
    const rlm = makeRlm();
    (rlm as any).analytics = analyticsSentinel;
    expect(rlm.getAnalytics()).toBe(analyticsSentinel);
  });
});

describe("ContextualSearchRLM.ensureInitialized (instance delegate)", () => {
  test("wires every injected dependency onto the instance and sets initialized=true", async () => {
    const kw = { tag: "kw" };
    const vs = { tag: "vs" };
    const cache = { tag: "cache" };
    const an = { tag: "an" };
    const sym = { tag: "sym" };
    const rlm = makeRlm({
      keywordSearch: kw,
      vectorStore: vs,
      searchCache: cache,
      analytics: an,
      symbolRepo: sym,
    });
    await rlm.ensureInitialized();
    expect(rlm.initialized).toBe(true);
    expect(rlm.keywordSearch).toBe(kw);
    expect(rlm.vectorStore).toBe(vs);
    expect(rlm.searchCache).toBe(cache);
    expect(rlm.analytics).toBe(an);
    expect(rlm.symbolRepo).toBe(sym);
  });

  test("second call is a no-op once initialized (short-circuit, deps unchanged)", async () => {
    const vs = { tag: "vs2" };
    const rlm = makeRlm({
      keywordSearch: {},
      vectorStore: vs,
      searchCache: {},
      analytics: {},
      symbolRepo: {},
    });
    await rlm.ensureInitialized();
    await rlm.ensureInitialized();
    expect(rlm.vectorStore).toBe(vs);
  });
});

describe("ContextualSearchRLM.loadGitignore (private instance delegate)", () => {
  test("forwards projectPath to loadProjectIgnore and returns its result unchanged", () => {
    const rlm = makeRlm();
    const result = (rlm as any).loadGitignore("/some/project/path");
    expect(loadProjectIgnore).toHaveBeenCalledWith("/some/project/path");
    expect(result).toBe(null);
  });
});

describe("ContextualSearchRLM.indexProject (instance delegate)", () => {
  test("forwards the static lock map + projectId to runWithIndexLock, and the work callback invokes _indexProjectInternal with exact args; return value passes through unchanged", async () => {
    const rlm = makeRlm();
    const options = { onProgress: () => {} };
    const internalResult = { filesIndexed: 3, chunksIndexed: 9, errors: 1 };
    indexProjectInternalImplMock.mockImplementationOnce(async () => internalResult);

    const result = await rlm.indexProject("/proj/path", "proj-idx", options);

    expect(runWithIndexLockMock).toHaveBeenCalledTimes(1);
    const [lockMapArg, projectIdArg, workArg] = runWithIndexLockMock.mock.calls[0];
    expect(lockMapArg).toBe((ContextualSearchRLM as any).indexingLocks);
    expect(projectIdArg).toBe("proj-idx");
    expect(typeof workArg).toBe("function");

    expect(indexProjectInternalImplMock).toHaveBeenCalledWith(
      indexerDeps(rlm),
      "/proj/path",
      "proj-idx",
      options,
    );
    expect(result).toBe(internalResult);
  });

  test("options defaults to {} when omitted", async () => {
    const rlm = makeRlm();
    indexProjectInternalImplMock.mockImplementationOnce(async () => ({
      filesIndexed: 0,
      chunksIndexed: 0,
      errors: 0,
    }));
    await rlm.indexProject("/proj/path2", "proj-idx2");
    expect(indexProjectInternalImplMock).toHaveBeenLastCalledWith(
      indexerDeps(rlm),
      "/proj/path2",
      "proj-idx2",
      {},
    );
  });
});

describe("ContextualSearchRLM.ensureFreshIndex (instance delegate)", () => {
  test("forwards projectId/projectPath/options and returns impl result unchanged", async () => {
    const rlm = makeRlm();
    const options = { allowFullReindex: true, maxSyncFiles: 77 };
    const sentinelReturn = {
      wasStale: true,
      reindexed: true,
      reason: "custom-reason",
    };
    ensureFreshIndexImplMock.mockImplementationOnce(async () => sentinelReturn);

    const result = await rlm.ensureFreshIndex("proj-efi", "/root/efi", options);

    expect(ensureFreshIndexImplMock).toHaveBeenCalledWith(
      indexerDeps(rlm),
      "proj-efi",
      "/root/efi",
      options,
    );
    expect(result).toBe(sentinelReturn);
  });

  test("options defaults to {} when omitted", async () => {
    const rlm = makeRlm();
    ensureFreshIndexImplMock.mockImplementationOnce(async () => ({
      wasStale: false,
      reindexed: false,
    }));
    await rlm.ensureFreshIndex("proj-efi2", "/root/efi2");
    expect(ensureFreshIndexImplMock).toHaveBeenLastCalledWith(
      indexerDeps(rlm),
      "proj-efi2",
      "/root/efi2",
      {},
    );
  });
});

describe("ContextualSearchRLM.checkSearchAdmission (instance delegate)", () => {
  test("forwards projectId with projectPath omitted (undefined), returns impl result unchanged", async () => {
    const rlm = makeRlm();
    const sentinelReturn = { admitted: true };
    checkSearchAdmissionImplMock.mockImplementationOnce(async () => sentinelReturn);

    const result = await rlm.checkSearchAdmission("proj-csa");

    expect(checkSearchAdmissionImplMock).toHaveBeenCalledWith(
      indexerDeps(rlm),
      "proj-csa",
      undefined,
    );
    expect(result).toBe(sentinelReturn);
  });

  test("forwards projectPath when supplied", async () => {
    const rlm = makeRlm();
    const sentinelReturn = { admitted: false, error: "not indexed" };
    checkSearchAdmissionImplMock.mockImplementationOnce(async () => sentinelReturn);

    await rlm.checkSearchAdmission("proj-csa2", "/root/csa2");

    expect(checkSearchAdmissionImplMock).toHaveBeenLastCalledWith(
      indexerDeps(rlm),
      "proj-csa2",
      "/root/csa2",
    );
  });
});

describe("ContextualSearchRLM.indexFile (instance delegate)", () => {
  // PR-B T10, declared so it is not read as drift: these two gain an explicit
  // `await rlm.ensureInitialized()`. `indexFile` is the one indexing surface
  // whose original never called it — its callers init first — so the facade
  // method deliberately still does not, and without the line the subject's five
  // store fields stay `undefined`. bun's `toHaveBeenCalledWith` treats an
  // undefined-valued expected key as absent, so an all-`undefined` record would
  // be satisfied by a facade that assembled `{}` and the assertion would prove
  // nothing. Initialising resolves the five already-mocked factories, which
  // makes every store identity-checkable. Strictly stronger than the `rlm`
  // first argument it replaces.
  test("forwards all args including centralityMap, returns impl result unchanged", async () => {
    const rlm = makeRlm();
    await rlm.ensureInitialized();
    const centralityMap = new Map([["a.ts", 0.9]]);
    const sentinelReturn = { chunks: 7 };
    indexFileImplMock.mockImplementationOnce(async () => sentinelReturn);

    const result = await rlm.indexFile("file.ts", "proj-a", "/root", centralityMap);

    expect(indexFileImplMock).toHaveBeenCalledWith(
      indexerDeps(rlm),
      "file.ts",
      "proj-a",
      "/root",
      centralityMap,
    );
    expect(result).toBe(sentinelReturn);
  });

  test("centralityMap omitted → forwarded as undefined", async () => {
    const rlm = makeRlm();
    await rlm.ensureInitialized();
    indexFileImplMock.mockImplementationOnce(async () => ({ chunks: 0 }));
    await rlm.indexFile("file2.ts", "proj-b", "/root2");
    expect(indexFileImplMock).toHaveBeenLastCalledWith(
      indexerDeps(rlm),
      "file2.ts",
      "proj-b",
      "/root2",
      undefined,
    );
  });
});

describe("ContextualSearchRLM.search (instance delegate)", () => {
  test("forwards query/projectId/options, returns impl result unchanged (identity)", async () => {
    const rlm = makeRlm();
    const options = { maxResults: 3, minScore: 0.7, sessionId: "sess-1" };
    const sentinelResults = [makeResult("s1")];
    searchImplMock.mockImplementationOnce(async () => sentinelResults);

    const result = await rlm.search("my query", "proj-s", options);

    expect(searchImplMock).toHaveBeenCalledWith(hybridDeps(rlm), "my query", "proj-s", options);
    expect(result).toBe(sentinelResults);
  });

  test("options defaults to {} when omitted", async () => {
    const rlm = makeRlm();
    searchImplMock.mockImplementationOnce(async () => []);
    await rlm.search("q2", "proj-s2");
    expect(searchImplMock).toHaveBeenLastCalledWith(hybridDeps(rlm), "q2", "proj-s2", {});
  });
});

describe("ContextualSearchRLM.applySynapseState (instance delegate)", () => {
  // PR-B T8: the facade argument is replaced by session-bias.ts's narrow
  // SessionBiasDeps record (GMS-03 AC-1). Both assertions inject *defined*
  // collaborators rather than asserting `{sessionRegistry: undefined,
  // synapseManager: undefined}`, because bun's `toHaveBeenCalledWith` treats an
  // undefined-valued key as absent — measured: `f({})` satisfies
  // `toHaveBeenCalledWith({a: undefined})`. An all-undefined record would
  // therefore also be satisfied by `{}`, i.e. by a facade that assembled
  // nothing. With defined values the check is exact on identity, and extra keys
  // still fail, so this is strictly stronger than the `rlm` first argument it
  // replaces. LATE-BIND (design.md §4.3.1): the record must be built per call.
  const sessionRegistry = { getAsync: async () => null };
  const synapseManager = { process: () => ({ results: [] as SearchResult[] }) };

  test("forwards all args in order (baseResults, query, projectId, sessionId, reportDegradation); returns impl result unchanged", async () => {
    const rlm = makeRlm({ sessionRegistry, synapseManager });
    const baseResults = [makeResult("b1")];
    const reportFn = () => {};
    const sentinelReturn = [makeResult("b2")];
    applySynapseStateMock.mockImplementationOnce(async () => sentinelReturn);

    const result = await rlm.applySynapseState(
      baseResults,
      "q-syn",
      "proj-syn",
      "sess-a",
      reportFn,
    );

    expect(applySynapseStateMock).toHaveBeenCalledWith(
      { sessionRegistry, synapseManager },
      baseResults,
      "q-syn",
      "proj-syn",
      "sess-a",
      reportFn,
    );
    expect(result).toBe(sentinelReturn);
  });

  test("sessionId and reportDegradation omitted → forwarded as undefined", async () => {
    const rlm = makeRlm({ sessionRegistry, synapseManager });
    const baseResults = [makeResult("b3")];
    applySynapseStateMock.mockImplementationOnce(async () => baseResults);
    await rlm.applySynapseState(baseResults, "q-syn2", "proj-syn2");
    expect(applySynapseStateMock).toHaveBeenLastCalledWith(
      { sessionRegistry, synapseManager },
      baseResults,
      "q-syn2",
      "proj-syn2",
      undefined,
      undefined,
    );
  });
});

describe("ContextualSearchRLM.correctQuery (instance delegate)", () => {
  // PR-B T9: the asserted first argument is the narrow HybridSearchDeps record
  // rather than `rlm` (GMS-03 AC-1). The stub is *defined* and assigned *after*
  // construction, for two separate reasons. bun's `toHaveBeenCalledWith` treats
  // an undefined-valued key as absent — measured: `f({})` satisfies
  // `toHaveBeenCalledWith({a: undefined})` — so asserting
  // `{keywordSearch: undefined}` would also be satisfied by a facade that
  // assembled nothing. And `keywordSearch` is a *field*: the constructor stores
  // its argument in `injectedDeps`, only `ensureInitialized` bridges that to the
  // field, and `correctQuery` does not await it — so `makeRlm({keywordSearch})`
  // would leave the record undefined-valued anyway. Assigning the field is both
  // the only way to get a defined record here and the LATE-BIND shape the other
  // six call sites use. Extra keys still fail, so this is strictly stronger than
  // the `rlm` first argument it replaces.
  //
  // **PR-B T13 — the fourth signature-tracking edit, and the one T12's
  // enumeration could not have found.** That sweep looked for the *facade first
  // argument* (`toHaveBeenCalledWith(rlm, …)`) and correctly returned three sites.
  // This assertion lost its facade argument back at T9; what T13 changes is the
  // *shape of the record* it asserts, as `HybridSearchDeps` widens from
  // `correctQuery`'s one key to the eight `search` needs. So the budget is **4**,
  // not 3, and the ledger total is 19 rather than 18. Nothing is relaxed — the
  // one-token substitution to `hybridDeps(rlm)` keeps every defined key exact by
  // identity and extra keys still fail. `correctQuery` deliberately still does not
  // await init, so the four stores it never reads arrive `undefined` and bun
  // treats those expected keys as absent; `keywordSearch` (assigned above) and
  // `queryUnderstanding` (constructor-built) are the two it checks by identity.
  test("forwards query, returns impl result unchanged", async () => {
    const rlm = makeRlm();
    const keywordSearch = { fuzzyCorrect: async (w: string) => w };
    (rlm as any).keywordSearch = keywordSearch;
    correctQueryMock.mockImplementationOnce(async () => "corrected query");

    const result = await rlm.correctQuery("origq");

    expect(correctQueryMock).toHaveBeenCalledWith(hybridDeps(rlm), "origq");
    expect(result).toBe("corrected query");
  });
});

describe("ContextualSearchRLM.buildGraphStream (instance delegate)", () => {
  test("forwards all args in order, returns impl result unchanged", async () => {
    const rlm = makeRlm();
    const resultSets = [[makeResult("g1")]];
    const reportFn = () => {};
    const sentinelReturn = [makeResult("g2")];
    buildGraphStreamMock.mockImplementationOnce(async () => sentinelReturn);

    const result = await rlm.buildGraphStream(resultSets, 15, "proj-graph", reportFn);

    expect(buildGraphStreamMock).toHaveBeenCalledWith(
      resultSets,
      15,
      "proj-graph",
      reportFn,
    );
    expect(result).toBe(sentinelReturn);
  });

  test("projectId and reportDegradation omitted → forwarded as undefined", async () => {
    const rlm = makeRlm();
    const resultSets = [[makeResult("g3")]];
    buildGraphStreamMock.mockImplementationOnce(async () => []);
    await rlm.buildGraphStream(resultSets, 5);
    expect(buildGraphStreamMock).toHaveBeenLastCalledWith(
      resultSets,
      5,
      undefined,
      undefined,
    );
  });
});

describe("ContextualSearchRLM.fuseResults (instance delegate)", () => {
  test("forwards resultSets/query/explainScores, returns impl result unchanged", () => {
    const rlm = makeRlm();
    const resultSets = [[makeResult("f1")]];
    const sentinelReturn = [makeResult("f2")];
    fuseResultsMock.mockImplementationOnce(() => sentinelReturn);

    const result = rlm.fuseResults(resultSets, "fq", true);

    // PR-B T6: the facade argument is gone (GMS-03 AC-1). Every parameter that
    // still exists is still asserted exactly.
    expect(fuseResultsMock).toHaveBeenCalledWith(resultSets, "fq", true);
    expect(result).toBe(sentinelReturn);
  });

  test("explainScores defaults to false when omitted", () => {
    const rlm = makeRlm();
    const resultSets = [[makeResult("f3")]];
    fuseResultsMock.mockImplementationOnce(() => []);
    rlm.fuseResults(resultSets, "fq2");
    expect(fuseResultsMock).toHaveBeenLastCalledWith(resultSets, "fq2", false);
  });
});

describe("ContextualSearchRLM.generateScoreExplanation (instance delegate)", () => {
  test("forwards all 7 params in order with distinct sentinel values (catches any swap), returns impl result unchanged", () => {
    const rlm = makeRlm();
    const sentinelReturn = { explanation: "distinct-sentinel-explanation" };
    generateScoreExplanationMock.mockImplementationOnce(() => sentinelReturn);

    const result = rlm.generateScoreExplanation(0.11, 0.22, 0.33, 0.44, 1, 2, 3);

    expect(generateScoreExplanationMock).toHaveBeenCalledWith(
      0.11,
      0.22,
      0.33,
      0.44,
      1,
      2,
      3,
    );
    expect(result).toBe(sentinelReturn);
  });

  test("optional trailing params omitted → forwarded as undefined", () => {
    const rlm = makeRlm();
    generateScoreExplanationMock.mockImplementationOnce(() => ({}));
    rlm.generateScoreExplanation(0.5, 0.6);
    expect(generateScoreExplanationMock).toHaveBeenLastCalledWith(
      0.5,
      0.6,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });
});

describe("ContextualSearchRLM.addContextToResults (instance delegate)", () => {
  test("forwards results/_projectId, returns impl result unchanged", async () => {
    const rlm = makeRlm();
    const results = [makeResult("c1")];
    const sentinelReturn = [makeResult("c2")];
    addContextToResultsImplMock.mockImplementationOnce(async () => sentinelReturn);

    const result = await rlm.addContextToResults(results, "proj-ctx");

    expect(addContextToResultsImplMock).toHaveBeenCalledWith(results, "proj-ctx");
    expect(result).toBe(sentinelReturn);
  });
});

describe("ContextualSearchRLM.extractPreview (instance delegate)", () => {
  test("forwards content with default maxLines=5, returns impl result unchanged", () => {
    const rlm = makeRlm();
    extractPreviewImplMock.mockImplementationOnce(() => "preview!");

    const result = rlm.extractPreview("some content");

    expect(extractPreviewImplMock).toHaveBeenCalledWith("some content", 5);
    expect(result).toBe("preview!");
  });

  test("forwards custom maxLines when provided", () => {
    const rlm = makeRlm();
    extractPreviewImplMock.mockImplementationOnce(() => "p2");
    rlm.extractPreview("content2", 12);
    expect(extractPreviewImplMock).toHaveBeenLastCalledWith("content2", 12);
  });
});

describe("ContextualSearchRLM.calculateAvgScore (instance delegate)", () => {
  test("forwards results, returns impl result unchanged", () => {
    const rlm = makeRlm();
    const results = [makeResult("avg1")];
    calculateAvgScoreImplMock.mockImplementationOnce(() => 0.789);

    const result = rlm.calculateAvgScore(results);

    expect(calculateAvgScoreImplMock).toHaveBeenCalledWith(results);
    expect(result).toBe(0.789);
  });
});