/**
 * ContextualSearchRLM - Optimized Contextual Search Service
 *
 * Implementation inspired by parallel search patterns,
 * adapted for the RLM ecosystem with:
 *
 * Features:
 * - Automatic project indexing with per-projectId namespace
 * - Hybrid search (vector + keyword) with RRF (Reciprocal Rank Fusion)
 * - Parallel search across multiple files
 * - Returns only relevant excerpts with context
 * - Multi-level intelligent cache
 * - Integration with existing embedding service
 *
 * Architecture:
 * - Uses PostgreSQL as single backend (vector + keyword + cache)
 * - Per-projectId namespace for isolation
 * - Embedding reuse across projects
 */

import { SearchResult, logger } from "@massa-ai/shared";
import { IndexManager } from "./index-manager.js";
import { SearchAnalytics } from "./search-analytics.js";
import type { SearchAnalyticsPg } from "./search-analytics-pg.js";
import { FileFilterCache } from "./file-filter-cache.js";
import { QueryUnderstandingService } from "./query-understanding.js";
import type { SynapseManager } from "../synapse/synapse-manager.js";
import type { SessionRegistry } from "../synapse/session/session-registry.js";
import { assertParserReadyForIndexing } from "../structural/parser-readiness.js";
// PR-B T10: these five were `import type` while `ensureInitializedImpl` owned
// the factory calls in rlm-indexing.ts. That body is now `ensureInitialized()`
// below, so the root needs them as *values*. The five specifiers are unchanged,
// which is what keeps every `mock.module("…-factory.js")` in the suite pointing
// at the same resolved module it always did.
import { getKeywordSearch } from "../../data/keyword/keyword-search-factory.js";
import { getVectorStore } from "../../data/vector/vector-store-factory.js";
import { getSearchCache } from "./cache-factory.js";
import { getSearchAnalytics } from "./analytics-factory.js";
import { getSymbolRepository } from "../../data/symbol/symbol-repository-factory.js";
import {
  searchImpl,
  addContextToResultsImpl,
  extractPreviewImpl,
  calculateAvgScoreImpl,
  filterByPatternsImpl,
} from "./rlm-search.js";
// Capability modules (design.md §4.1). These share a name with the class
// methods that delegate to them — the shape §4.3 sketches. Class members are
// not in lexical scope, so a bare call inside a method body resolves to the
// module import, not to itself. Same arity too, so `tsc` cannot tell a correct
// delegation from a `this.`-prefixed infinite recursion; the coverage suite's
// forwarding tests are what prove it at runtime.
import { fuseResults, generateScoreExplanation } from "./result-fusion.js";
import { buildGraphStream } from "./graph-stream.js";
import { applySynapseState, type SessionBiasDeps } from "./session-bias.js";
import { correctQuery, type HybridSearchDeps } from "./hybrid-search.js";
import {
  runWithIndexLock,
  indexProjectInternal,
  ensureFreshIndex,
  indexFile,
  loadGitignore,
  checkSearchAdmission,
  type IndexerDeps,
  type IndexProjectOptions,
} from "./project-indexer.js";
import type {
  SearchDegradation,
  SearchDegradationReporter,
} from "./search-diagnostics.js";
import {
  clearProjectIndexImpl,
  getProjectStatsImpl,
  warmupCacheImpl,
  getAnalyticsImpl,
} from "./rlm-admin.js";

/**
 * ContextualSearchRLM - Main contextual search service
 */
export class ContextualSearchRLM {
  // NOTE (M14 Phase 3): fields below were `private`. Relaxed to `public`
  // (modifier dropped) so the extracted delegate modules in
  // rlm-search.ts / rlm-admin.ts can read them via the passed
  // `rlm` parameter. Runtime-identical; type-surface only. See design.md
  // "Encapsulation decision (accepted cost)".
  //
  // PR-B T10 dropped rlm-indexing.ts from that list — project-indexer.ts reads
  // these through `IndexerDeps`, never off the instance. By T14 no reader is
  // left and the whole note goes with them.
  keywordSearch!: Awaited<ReturnType<typeof getKeywordSearch>>;
  vectorStore!: Awaited<ReturnType<typeof getVectorStore>>;
  indexManager!: IndexManager;
  searchCache!: Awaited<ReturnType<typeof getSearchCache>>;
  analytics!: Awaited<ReturnType<typeof getSearchAnalytics>>;
  symbolRepo!: Awaited<ReturnType<typeof getSymbolRepository>>;
  // Visibility relaxed from `private` so rlm-admin.ts can read via rlm param.
  fileFilterCache: FileFilterCache;
  /** Phase 2: query understanding (LLM rewrite + HyDE). Default-off, silent-degrade. */
  // Visibility relaxed from `private` so rlm-search.ts can read via rlm param.
  queryUnderstanding: QueryUnderstandingService;
  // RRF_K was a public field only so rlm-fusion.ts could read it off the
  // instance. It is the literal 60 and is now a module constant in
  // result-fusion.ts (design.md §2.3 F2, §4.1). Zero post-construction
  // assignment sites, so removing it disables no test stub.
  initialized = false;

  // Per-project mutex to prevent concurrent indexing
  private static indexingLocks = new Map<string, Promise<void>>();

  /**
   * Optional test/extension seam: pre-resolved dependencies. When provided,
   * `ensureInitialized` skips the factory calls (which are process-wide
   * mock.module targets in the full test suite) and uses these instances
   * directly. Production callers pass nothing and resolve via factories.
   *
   * PR-B T11 adds `indexManager`, the F4 seam (design.md §2.3 F4, D-R5). It is
   * the one collaborator that could not be injected at all before this commit:
   * every other member arrives from a factory this record can pre-empt, while
   * `IndexManager` was built by direct construction inside `ensureInitialized`
   * with no field to override it. It is the only *added* seam in PR-B; every
   * other task moves a seam that already existed.
   *
   * **Every field here must stay optional, and for `indexManager` that is a
   * G-HUB precondition rather than a style choice.** `IndexManager` is declared
   * inside this gated directory, and `search-hub-metric.ts:139`'s annotation
   * pattern `([A-Za-z0-9_]+)\s*:\s*<Type>\b` does not distinguish an interface
   * field declaration from a parameter — that is the seventh plan defect, which
   * took `IndexManager`'s `maxForeignReach` from 0 to 4 when `IndexerDeps` typed
   * the same collaborator with a bare colon. The `?` here is what keeps the
   * binding uncaptured (`\s*` cannot match `?`, the same reason the field at
   * `indexManager!: IndexManager` above is invisible). Measured at T11: this
   * record leaves `IndexManager` at foreign 0 / reach 0. Dropping the `?` — or
   * restyling this record to `IndexerDeps`' required-field shape — reopens that
   * hole, and nothing fails until T14's gate.
   */
  readonly injectedDeps?: {
    keywordSearch?: Awaited<ReturnType<typeof getKeywordSearch>>;
    vectorStore?: Awaited<ReturnType<typeof getVectorStore>>;
    searchCache?: Awaited<ReturnType<typeof getSearchCache>>;
    analytics?: Awaited<ReturnType<typeof getSearchAnalytics>>;
    symbolRepo?: Awaited<ReturnType<typeof getSymbolRepository>>;
    /** F4 (T11). Full `IndexManager`, not `Pick<>`: the value is assigned to the
     *  public `indexManager` field, which design.md §4.3.1 keeps at the full type
     *  for its 18 post-construction stub sites, so a narrowed seam would need a
     *  cast to land there. The `?` is the G-HUB guard — see above. */
    indexManager?: IndexManager;
    sessionRegistry?: Pick<SessionRegistry, "getAsync">;
    synapseManager?: Pick<SynapseManager, "process">;
  };

  // Mirrors `injectedDeps` field-for-field, and the mirror is load-bearing: a
  // field added to only one side makes the matching object literal fail excess
  // property checking at every un-cast call site.
  constructor(deps?: {
    keywordSearch?: Awaited<ReturnType<typeof getKeywordSearch>>;
    vectorStore?: Awaited<ReturnType<typeof getVectorStore>>;
    searchCache?: Awaited<ReturnType<typeof getSearchCache>>;
    analytics?: Awaited<ReturnType<typeof getSearchAnalytics>>;
    symbolRepo?: Awaited<ReturnType<typeof getSymbolRepository>>;
    indexManager?: IndexManager;
    sessionRegistry?: Pick<SessionRegistry, "getAsync">;
    synapseManager?: Pick<SynapseManager, "process">;
  }) {
    this.fileFilterCache = new FileFilterCache();
    this.queryUnderstanding = new QueryUnderstandingService();
    this.injectedDeps = deps;
  }

  // Delegate-preservation contract: stays a public patchable instance method,
  // because concurrent-indexing.test.ts:67, the characterization test and
  // rlm-search.test.ts:156 monkey-patch `.ensureInitialized` on the instance and
  // every internal caller routes through `this.` (constraint PATCHABLE).
  //
  // PR-B T10: this body **is** the former `ensureInitializedImpl`, moved here
  // verbatim with `rlm.` → `this.` and the export deleted. It read 8 facade
  // members and 8 > G-HUB's ceiling of 3, so no capability module could hold it
  // without failing the gate permanently — design.md §4.5(b) decided lazy init
  // stays in the root, §4.1's module table never recorded the consequence, and
  // tasks.md T10 owns it. Absorbing it is what lets rlm-indexing.ts die whole in
  // one commit instead of surviving as the one-function husk GMS-04 AC-1 forbids.
  //
  // It does exactly what it did: resolve the six factories, assign the six
  // fields, set the flag. It does **not** construct capability modules — there
  // are none to construct — so the 25 test sites that set `initialized = true`
  // to skip it still skip only factory resolution, never wiring (§4.3.1).
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const injected = this.injectedDeps ?? {};
    const resolveKeyword = injected.keywordSearch
      ? Promise.resolve(injected.keywordSearch)
      : getKeywordSearch();
    const resolveVector = injected.vectorStore
      ? Promise.resolve(injected.vectorStore)
      : getVectorStore();
    const resolveCache = injected.searchCache
      ? Promise.resolve(injected.searchCache)
      : getSearchCache();
    const resolveAnalytics = injected.analytics
      ? Promise.resolve(injected.analytics)
      : getSearchAnalytics();
    const resolveSymbolRepo = injected.symbolRepo
      ? Promise.resolve(injected.symbolRepo)
      : getSymbolRepository();

    [
      this.keywordSearch,
      this.vectorStore,
      this.searchCache,
      this.analytics,
      this.symbolRepo,
    ] = await Promise.all([
      resolveKeyword,
      resolveVector,
      resolveCache,
      resolveAnalytics,
      resolveSymbolRepo,
    ]);

    // F4 seam (T11). `??` rather than the ternary the five reads above use:
    // those wrap in `Promise.resolve()` to enter the `Promise.all`, this one is
    // synchronous. Nullish and truthy coincide for a class instance, so the two
    // forms cannot differ on any input reachable here.
    //
    // Position is load-bearing, not incidental: this runs *after* the
    // `Promise.all` above, so the default construction reads an already-resolved
    // `this.vectorStore`. Hoisting it would hand `IndexManager` `undefined` while
    // still satisfying an `instanceof` check — which is why the seam's sensor
    // asserts the manager's own `vectorStore`, not just its class.
    this.indexManager = injected.indexManager ?? new IndexManager(this.vectorStore);
    this.initialized = true;
    logger.info("ContextualSearchRLM initialized", {
      via: injected.vectorStore ? "injected-seam" : "factory",
    });
  }

  /**
   * Assemble project-indexer.ts's narrow deps record — per call, from whatever
   * the fields hold right now (LATE-BIND, design.md §4.3.1). Never hoist this to
   * a constructor-time capture *or* a first-call memo: `initialized` has 25
   * post-construction assignment sites, `indexManager` 18, `symbolRepo` 7, and
   * `rlm-indexing.test.ts` alone holds 52 of the ~80 — a capture would leave
   * every one of them stubbing a field nothing reads.
   *
   * Property reads only, never a dereference. That is load-bearing:
   * `rlm-indexing.test.ts:327-339` stubs `indexManager` and `searchCache` but
   * *not* `symbolRepo`, because the full-reindex branch returns before touching
   * it. Reading an undefined field into the record is fine; dereferencing one
   * here would turn that test red on a member the original never reached.
   *
   * `indexFile` and `indexProject` are arrow wrappers, not `.bind(this)` and not
   * bare method references. Both alternatives resolve the method at *assembly*
   * time; the arrow body re-reads `this.<method>` at *call* time, which is the
   * only shape under which the 6 sites that stub those two methods on the
   * instance stay effective. See project-indexer.ts's `IndexerDeps` doc.
   */
  #indexerDeps(): IndexerDeps {
    return {
      indexManager: this.indexManager,
      symbolRepo: this.symbolRepo,
      keywordSearch: this.keywordSearch,
      vectorStore: this.vectorStore,
      searchCache: this.searchCache,
      indexFile: (filePath, projectId, projectRoot, centralityMap) =>
        this.indexFile(filePath, projectId, projectRoot, centralityMap),
      indexProject: (projectPath, projectId, options) =>
        this.indexProject(projectPath, projectId, options),
    };
  }

  /**
   * Load and parse .gitignore file (delegates to shared ignore-patterns module)
   */
  private loadGitignore(projectPath: string) {
    return loadGitignore(projectPath);
  }

  /**
   * Index an entire project
   *
   * @param projectPath - Path to the project
   * @param projectId - Unique project ID (namespace)
   * @returns Indexing statistics
   */
  async indexProject(
    projectPath: string,
    projectId: string,
    options: IndexProjectOptions = {},
  ): Promise<{
    filesIndexed: number;
    chunksIndexed: number;
    errors: number;
  }> {
    // This legacy direct indexing path must fail before mutating its queue.
    await assertParserReadyForIndexing();
    // `work` lambda captures virtual dispatch through `this` so the test's
    // `(inst as any)._indexProjectInternal` patch still routes (Challenge #1).
    return runWithIndexLock(
      ContextualSearchRLM.indexingLocks,
      projectId,
      () => this._indexProjectInternal(projectPath, projectId, options),
    );
  }

  // Delegate-preservation contract: stays an instance method (thin delegate
  // to the module function) because concurrent-indexing.test.ts:181-289 and
  // the characterization test monkey-patch `(inst as any)._indexProjectInternal`
  // on the instance; routing through a module-local function would bypass it.
  private async _indexProjectInternal(
    projectPath: string,
    projectId: string,
    options: IndexProjectOptions = {},
  ): Promise<{
    filesIndexed: number;
    chunksIndexed: number;
    errors: number;
  }> {
    await this.ensureInitialized();
    return indexProjectInternal(this.#indexerDeps(), projectPath, projectId, options);
  }

  /**
   * Check if index is stale and optionally trigger reindexing
   */
  async ensureFreshIndex(
    projectId: string,
    projectPath: string,
    options: {
      allowFullReindex?: boolean;
      maxSyncFiles?: number;
    } = {},
  ): Promise<{
    wasStale: boolean;
    reindexed: boolean;
    reason?: string;
    deferred?: boolean;
    filesPending?: number;
  }> {
    await this.ensureInitialized();
    return ensureFreshIndex(this.#indexerDeps(), projectId, projectPath, options);
  }

  /**
   * Search admission preflight — two-tier gate run before `search()`.
   *
   * Tier 1 (HARD-FAIL): pure metadata-existence check, no projectPath needed.
   *   Returns `{admitted:false, error}` when the project has no index metadata
   *   at all. Caller MUST surface the error and NOT call `search()`.
   *
   * Tier 2 (WARN): only evaluated when `projectPath` is supplied (the staleness
   *   check needs it). If metadata exists but `isIndexStale` reports any reason
   *   (files_changed / path_mismatch / age_threshold), admission still succeeds
   *   but a `stale` descriptor is attached for the caller to relay as a warning.
   *   When `projectPath` is absent the stale check is skipped gracefully.
   */
  async checkSearchAdmission(
    projectId: string,
    projectPath?: string,
  ): Promise<{
    admitted: boolean;
    error?: string;
    stale?: {
      reason: string;
      modifiedFiles?: number;
      newFiles?: number;
      deletedFiles?: number;
    };
  }> {
    await this.ensureInitialized();
    return checkSearchAdmission(this.#indexerDeps(), projectId, projectPath);
  }

  /**
   * Index a single file, splitting it into semantic chunks
   *
   * Uses the smart chunker which is language-aware:
   * - Markdown: splits by headings with hierarchy context
   * - JSON: splits by top-level keys
   * - YAML: splits by document separators or top-level keys
   * - Code: splits by functions/classes with preceding comments
   */
  // Stays public: project-indexer.ts reaches it back through
  // `IndexerDeps.indexFile`, an arrow wrapper over `this.indexFile`, so the 5
  // sites in rlm-indexing.test.ts that stub this method on the instance keep
  // taking effect (LATE-BIND).
  //
  // It deliberately does **not** `await this.ensureInitialized()`. The original
  // `indexFileImpl` never did either — its callers init first — and adding it
  // here would be a behavior change, not a tidy-up.
  async indexFile(
    filePath: string,
    projectId: string,
    projectRoot: string,
    centralityMap?: Map<string, number>,
  ): Promise<{ chunks: number }> {
    return indexFile(this.#indexerDeps(), filePath, projectId, projectRoot, centralityMap);
  }

  /**
   * Hybrid search (vector + keyword) with projectId filter
   */
  async search(
    query: string,
    projectId: string,
    options: {
      maxResults?: number;
      minScore?: number;
      explainScores?: boolean;
      includeFilters?: string[];
      excludeFilters?: string[];
      /** Phase 2: Synapse session id forwarded for future Synapse-biased fusion. */
      sessionId?: string;
      onDegradations?: (degradations: readonly SearchDegradation[]) => void;
    } = {},
  ): Promise<SearchResult[]> {
    return searchImpl(this, query, projectId, options);
  }

  /**
   * Apply session state after the session-independent base result is cached.
   * Invalid and workspace-mismatched sessions return the exact base array.
   */
  // Visibility relaxed from `private` so rlm-search.ts can call via rlm param.
  async applySynapseState(
    baseResults: SearchResult[],
    query: string,
    projectId: string,
    sessionId?: string,
    reportDegradation?: SearchDegradationReporter,
  ): Promise<SearchResult[]> {
    return applySynapseState(
      this.#sessionBiasDeps(),
      baseResults,
      query,
      projectId,
      sessionId,
      reportDegradation,
    );
  }

  /**
   * Assemble session-bias.ts's narrow deps record — per call, from whatever the
   * fields hold right now (LATE-BIND, design.md §4.3.1). Never hoist this to a
   * constructor-time capture: the ~80 test sites that stub facade state *after*
   * construction would go on passing while exercising the real collaborator,
   * which is this repository's signature defect class.
   *
   * Property reads only. Resolving the factory fallbacks here instead of inside
   * the module would call both on every search, including the no-session calls
   * that today touch neither.
   */
  #sessionBiasDeps(): SessionBiasDeps {
    return {
      sessionRegistry: this.injectedDeps?.sessionRegistry,
      synapseManager: this.injectedDeps?.synapseManager,
    };
  }

  /**
   * Fuzzy-correct each non-stopword query term via the keyword store's
   * vocabulary. Returns the corrected query string (lowercased, space-joined),
   * or null when no term corrects to a different word or fuzzyCorrect is
   * unavailable. Only words of length >= 3 are considered (shorter tokens
   * can't be reliably corrected).
   */
  /**
   * Assemble hybrid-search.ts's narrow deps record — per call, from whatever
   * the fields hold right now (LATE-BIND, design.md §4.3.1). Never hoist this to
   * a constructor-time capture: `keywordSearch` has 10 post-construction
   * assignment sites, six of which reach `correctQuery` directly
   * (`rlm-synapse.test.ts`'s five cases and `search-ranking-regression.test.ts:37`),
   * and a capture would leave every one of them stubbing a field nothing reads.
   *
   * It reads the **field**, not `injectedDeps.keywordSearch`. That is not
   * interchangeable: `ensureInitialized` is what bridges the seam to the field,
   * `correctQuery` does not await it, and those six sites assign the field
   * directly. Reading the seam instead would break all six. Contrast
   * `#sessionBiasDeps()` below, whose originals genuinely read `injectedDeps`.
   */
  #hybridSearchDeps(): HybridSearchDeps {
    return { keywordSearch: this.keywordSearch };
  }

  // Visibility relaxed from `private` so rlm-search.ts can call via rlm param.
  async correctQuery(query: string): Promise<string | null> {
    return correctQuery(this.#hybridSearchDeps(), query);
  }

  /**
   * Phase 7c: build the graph-neighbor RRF stream. BFS depth-2 over outgoing
   * memory-graph edges; resolved to SearchResults via the memory repository at
   * a fixed sub-hit score (0.45).
   *
   * Id-bridge fix (A3): graph edges connect MEMORY ids, but vector/code-search
   * results key on chunk ids (e.g. "projectId:path:0"). Seeding BFS with chunk
   * ids therefore silently omitted the stream for code queries — the primary
   * use case. We now bridge the two id spaces: collect graph seeds by (a)
   * trying the raw hit ids (preserves the original behavior for memory search
   * where memory ids already flow in), AND (b) mapping each code chunk to
   * memory ids that reference the same filePath/symbol via fullTextSearch.
   * This makes the graph stream participate for code queries while remaining
   * a silent-omit no-op when no bridged seeds resolve.
   *
   * Degradation (silent-omit): returns [] when the neighbor set is empty, the
   * graph store throws, or the memory repo returns nothing. The caller only
   * appends the stream when non-empty, so `resultSets.length` (and thus the
   * `search:reranked` streamCount) always reflects the real stream count.
   */
  // Visibility relaxed from `private` so rlm-search.ts can call via rlm param.
  async buildGraphStream(
    resultSets: SearchResult[][],
    maxResults: number,
    projectId?: string,
    reportDegradation?: SearchDegradationReporter,
  ): Promise<SearchResult[]> {
    return buildGraphStream(
      resultSets,
      maxResults,
      projectId,
      reportDegradation,
    );
  }

  /**
   * Reciprocal Rank Fusion (RRF) - Combines multiple result lists
   *
   * Now includes intelligent boosting:
   * - Keywords get higher weight when query contains function/class names
   * - Exact matches in keyword results get additional boost
   */
  // Visibility relaxed from `private` so rlm-search.ts can call via rlm param.
  fuseResults(
    resultSets: SearchResult[][],
    query: string,
    explainScores: boolean = false,
  ): SearchResult[] {
    return fuseResults(resultSets, query, explainScores);
  }

  /**
   * Generate detailed score explanation
   */
  // Visibility relaxed from `private` so rlm-search.ts (fuseResults) can call via rlm param.
  generateScoreExplanation(
    finalScore: number,
    rrfScore: number,
    vectorScore?: number,
    keywordScore?: number,
    vectorRank?: number,
    keywordRank?: number,
    combinedRank?: number,
  ): any {
    return generateScoreExplanation(
      finalScore,
      rrfScore,
      vectorScore,
      keywordScore,
      vectorRank,
      keywordRank,
      combinedRank,
    );
  }

  /**
   * Add expanded context to results
   */
  // Visibility relaxed from `private` so rlm-search.ts can call via rlm param.
  async addContextToResults(
    results: SearchResult[],
    _projectId: string,
  ): Promise<SearchResult[]> {
    return addContextToResultsImpl(this, results, _projectId);
  }

  /**
   * Extract content preview (first lines)
   */
  // Visibility relaxed from `private` so rlm-search.ts can call via rlm param.
  extractPreview(content: string, maxLines: number = 5): string {
    return extractPreviewImpl(content, maxLines);
  }

  /**
   * Calculate average score
   */
  // Visibility relaxed from `private` so rlm-search.ts can call via rlm param.
  calculateAvgScore(results: SearchResult[]): number {
    return calculateAvgScoreImpl(results);
  }

  /**
   * Filter results by glob patterns
   */
  // Visibility relaxed from `private` so rlm-search.ts can call via rlm param.
  filterByPatterns(
    results: SearchResult[],
    include?: string[],
    exclude?: string[],
  ): SearchResult[] {
    return filterByPatternsImpl(results, include, exclude);
  }

  /**
   * Clear project index
   */
  async clearProjectIndex(projectId: string): Promise<{ deleted: number }> {
    return clearProjectIndexImpl(this, projectId);
  }

  /**
   * Get project statistics
   */
  async getProjectStats(projectId: string): Promise<{
    totalDocuments: number;
    totalSize: number;
  }> {
    return getProjectStatsImpl(this, projectId);
  }

  /**
   * Warmup cache with common queries
   *
   * Pre-caches typical search patterns to improve initial search performance
   */
  async warmupCache(
    projectId: string,
    _projectPath: string,
    customQueries?: string[],
  ): Promise<{ queriesWarmed: number; errors: number }> {
    return warmupCacheImpl(this, projectId, _projectPath, customQueries);
  }

  /**
   * Get analytics instance for querying metrics
   */
  getAnalytics(): SearchAnalytics | SearchAnalyticsPg {
    return getAnalyticsImpl(this);
  }
}
