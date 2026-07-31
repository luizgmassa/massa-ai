/**
 * hybrid-search — the hybrid retrieval capability (design.md §4.1).
 *
 * PR-B capability module, completed at T13. T9 created it with `correctQuery`
 * alone; T13 moved `search`, `addContextToResults`, `extractPreview`,
 * `calculateAvgScore` and `filterByPatterns` here, and `rlm-search.ts` dies whole
 * in that commit — the fourth `rlm-*.ts` source to do so, and the last. This file
 * has never heard of ContextualSearchRLM, which is what takes the root's foreign
 * reach 14 → 1 and closes G-HUB (§3.4). `correctQuery` arrived from
 * rlm-synapse.ts, not rlm-search.ts: it reads `keywordSearch`, the collaborator
 * this module already owns, and its only caller is `search` (§4.2).
 * `extractQueryTerms` / `applyProximityRerank` are *imported* from
 * lexical-search.ts, never moved: that module carries a `data/` importer and is
 * PR-C's to place (§5.4, PR-C-BOUNDARY). Behavior is byte-preserved from both
 * sources — bodies verbatim, `rlm.<member>` rewritten per the disposition on
 * `HybridSearchDeps` below and in full in tasks.md.
 */

import { SearchResult, logger, config } from "@massa-ai/shared";
import { minimatch } from "minimatch";
import { buildRewrittenFTSQuery } from "./query-understanding.js";
import { applyProximityRerank, extractQueryTerms } from "../../kernel/lexical-search.js";
import { eventBus } from "../events/event-bus.js";
import { fuseResults } from "./result-fusion.js";
import type { QueryUnderstandingService } from "./query-understanding.js";
import type { getKeywordSearch } from "../../data/keyword/keyword-search-factory.js";
import type { getVectorStore } from "../vector/vector-store-factory.js";
import type { getSearchCache } from "./cache-factory.js";
import type { getSearchAnalytics } from "./analytics-factory.js";
import {
  recordSearchDegradation,
  recordSearchFailure,
  searchBackendUnavailable,
  SearchServiceError,
  storeCorruption,
  type SearchDegradation,
  type SearchDegradationCode,
  type SearchDegradationReporter,
} from "../../kernel/search-diagnostics.js";

// ── Deps ─────────────────────────────────────────────────────────────────────

/**
 * The narrow dependency record for this module (design.md §4.4) — exactly the
 * collaborators §2.1 shows these surfaces read, and nothing else. §2.1 records
 * `searchImpl` reading **13** facade members, the highest arity in the matrix;
 * each one's disposition was decided by measuring the instance-stub sites that
 * reach it, not by reading §4.1's "injected collaborators" column, which names
 * five and is a store list rather than a member list. **The disposition table,
 * the stub-site counts, the sweep method and the two-variant `queryUnderstanding`
 * simulation are in tasks.md, "T13 — the disposition of §2.1's thirteen".**
 *
 * Four invariants this file must keep, each with a measurement behind it there:
 *
 * 1. `queryUnderstanding` stays `Pick<>`-narrowed — honest typing per §4.4, and
 *    **not** a fired sensor: bare nominal reaches 1, under the ceiling of 3.
 * 2. The three callbacks stay **per-call arrow wrappers** — never `.bind(this)`,
 *    never bare method references, both of which resolve at *assembly* time.
 *    `buildGraphStream` and `addContextToResults` are each stubbed on the
 *    instance at 6 sites; a module-local call disables all twelve silently.
 * 3. `ensureInitialized` is **not** a member of this record, and `search` must
 *    not call it. The root hoists it — carrying the `searchBackendUnavailable`
 *    wrap `searchImpl` used to apply — because the five stores below are
 *    snapshotted **by value**, so a record assembled before init holds five
 *    `undefined`s. Measured: rlm-search 31 → 15/16 the other way round.
 * 4. The five stores stay required and keep the root's own field types — their
 *    originals were bare reads off definite-assigned fields with no fallback, so
 *    an absent store must keep throwing exactly where it did.
 *
 * `hybrid-search-late-bind.test.ts` test 4 is the compensating control for
 * invariant 2, and what makes the coverage file's three `expect.any(Function)`
 * keys acceptable rather than a relaxation. `correctQuery` takes this whole
 * record while reading one field of it — the `getAnalytics`/`IndexAdminDeps`
 * shape from T12; §4.4's narrowness is a property of the *module*'s record, not
 * of each surface's parameter list.
 */
export interface HybridSearchDeps {
  keywordSearch: Awaited<ReturnType<typeof getKeywordSearch>>;
  vectorStore: Awaited<ReturnType<typeof getVectorStore>>;
  searchCache: Awaited<ReturnType<typeof getSearchCache>>;
  analytics: Awaited<ReturnType<typeof getSearchAnalytics>>;
  queryUnderstanding: Pick<QueryUnderstandingService, "understand">;
  buildGraphStream: (
    resultSets: SearchResult[][],
    maxResults: number,
    projectId?: string,
    reportDegradation?: SearchDegradationReporter,
  ) => Promise<SearchResult[]>;
  addContextToResults: (
    results: SearchResult[],
    projectId: string,
  ) => Promise<SearchResult[]>;
  applySynapseState: (
    baseResults: SearchResult[],
    query: string,
    projectId: string,
    sessionId?: string,
    reportDegradation?: SearchDegradationReporter,
  ) => Promise<SearchResult[]>;
}

// ── search ───────────────────────────────────────────────────────────────────

export type SearchOptions = {
  maxResults?: number;
  minScore?: number;
  explainScores?: boolean;
  includeFilters?: string[];
  excludeFilters?: string[];
  /** Phase 2: Synapse session id forwarded for future Synapse-biased fusion. */
  sessionId?: string;
  /** Receives bounded, sanitized evidence for optional search failures. */
  onDegradations?: (degradations: readonly SearchDegradation[]) => void;
};

export async function search(
  deps: HybridSearchDeps,
  query: string,
  projectId: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const maxResults = options.maxResults ?? 10;
  const minScore = options.minScore ?? 0.3;
  const explainScores = options.explainScores || false;
  const includeFilters = options.includeFilters;
  const excludeFilters = options.excludeFilters;
  const degradations: SearchDegradation[] = [];
  const degrade = (
    code: SearchDegradationCode,
    component: string,
  ): void => {
    if (degradations.length >= 10) return;
    if (degradations.some((entry) => entry.code === code && entry.component === component)) {
      return;
    }
    degradations.push(recordSearchDegradation(code, component, projectId));
    options.onDegradations?.([...degradations]);
  };
  const hasFileFilters =
    (includeFilters?.length ?? 0) > 0 || (excludeFilters?.length ?? 0) > 0;
  const retrievalLimit = hasFileFilters
    ? Math.min(maxResults * 5, maxResults + 200)
    : maxResults * 2;

  // Honor an explicit maxResults:0 as "zero results" (previously `|| 10`
  // coerced 0 → 10). Short-circuit here, BEFORE the cache probe and vector/
  // keyword fan-out, so 0 doesn't do unnecessary work or hit a degenerate
  // `maxResults * 2 === 0` vector call. Returns the same empty shape the
  // function uses on a no-hit search / caught-error path.
  if (maxResults <= 0) {
    logger.debug("maxResults <= 0 — returning empty result set", {
      query,
      projectId,
      maxResults,
    });
    return [];
  }

  // Embedding providers such as Ollama reject an empty input. Treat a blank
  // query as the valid no-hit search the public API has historically
  // advertised, and avoid fan-out to vector/keyword dependencies entirely.
  if (!query.trim()) {
    logger.debug("Blank query — returning empty result set", {
      projectId,
    });
    return [];
  }

  const startTime = performance.now(); // Use performance.now() for sub-millisecond precision

  logger.debug("Starting contextual search", {
    query,
    projectId,
    maxResults,
    explainScores,
    includeFilters,
    excludeFilters,
    startTime, // Add startTime to logging
  });

  // Check cache first
  const cacheOptions = {
    maxResults,
    minScore,
    explainScores,
    includeFilters,
    excludeFilters,
    retrievalWindow: "bounded-v1",
  };
  let cachedResults: SearchResult[] | null;
  try {
    cachedResults = await deps.searchCache.get(query, projectId, cacheOptions);
  } catch (error) {
    const failure = searchBackendUnavailable("search_cache_read", error);
    recordSearchFailure(failure, projectId);
    throw failure;
  }

  if (cachedResults) {
    const endTime = performance.now();
    const duration = Math.max(1, Math.round(endTime - startTime)); // Minimum 1ms to avoid 0ms for sub-ms operations

    // DEBUG: Log all timing values to diagnose the issue
    logger.debug("Cache hit timing details", {
      startTime,
      endTime,
      duration,
      calculatedDuration: endTime - startTime,
      preciseMs: (endTime - startTime).toFixed(3),
    });

    // Track cache hit
    try {
      deps.analytics.trackSearch({
        timestamp: Date.now(),
        projectId,
        query,
        resultCount: cachedResults.length,
        duration,
        cacheHit: true,
        score: calculateAvgScore(cachedResults),
      });
    } catch {
      degrade("SEARCH_ANALYTICS_UNAVAILABLE", "search_analytics");
    }

    logger.info("Cache hit - returning cached results", {
      projectId,
      resultCount: cachedResults.length,
      duration,
      durationMs: `${duration}ms`,
      preciseMs: `${(endTime - startTime).toFixed(3)}ms`,
    });
    try {
      return await deps.applySynapseState(
        cachedResults,
        query,
        projectId,
        options.sessionId,
        degrade,
      );
    } catch {
      degrade("SYNAPSE_UNAVAILABLE", "synapse");
      return cachedResults;
    }
  }

  try {
    const disableKeyword = process.env.SEARCH_DISABLE_KEYWORD === "true";

    // ── Phase 2: query understanding (default-off, explicit degradation) ──
    let resultSets: SearchResult[][] = [];
    let usedQueryUnderstanding = false;
    let understood: Awaited<ReturnType<typeof deps.queryUnderstanding.understand>> = null;
    try {
      const qu = config.get("search").queryUnderstanding;
      if (qu?.enabled && query.trim()) {
        understood = await deps.queryUnderstanding.understand(
          query,
          projectId,
        );
        if (!understood) {
          degrade("QUERY_UNDERSTANDING_UNAVAILABLE", "query_understanding");
        }
      }
    } catch {
      degrade("QUERY_UNDERSTANDING_UNAVAILABLE", "query_understanding");
    }

    if (understood) {
      try {
        eventBus.publish("search:query-rewritten", {
          query,
          projectId,
          expansions: understood.expansions,
          keywords: understood.keywords,
          hydeUsed: understood.hydeVector !== null,
        });
      } catch {
        degrade("SEARCH_AUDIT_UNAVAILABLE", "search_query_rewritten_event");
      }
      const rewrittenFTS = buildRewrittenFTSQuery(query, understood.keywords);
      const vectorPromise = deps.vectorStore
        .search(query, retrievalLimit, projectId)
        .catch((error) => { throw searchBackendUnavailable("vector_search", error); });
      const keywordPromise = disableKeyword
        ? Promise.resolve([] as SearchResult[])
        : deps.keywordSearch
            .searchWithFilter(rewrittenFTS, { projectId }, retrievalLimit)
            .catch((error) => { throw searchBackendUnavailable("keyword_search", error); });
      const hydePromise = understood.hydeVector
        ? deps.vectorStore
            .searchByEmbedding(understood.hydeVector, retrievalLimit, projectId)
            .catch(() => {
              degrade("QUERY_UNDERSTANDING_UNAVAILABLE", "hyde_search");
              return [] as SearchResult[];
            })
        : Promise.resolve([] as SearchResult[]);
      const [v, k, h] = await Promise.all([vectorPromise, keywordPromise, hydePromise]);
      resultSets = understood.hydeVector && h.length > 0 ? [v, k, h] : [v, k];
      usedQueryUnderstanding = true;

      logger.debug("Query understanding fan-out", {
        vectorCount: v.length,
        keywordCount: k.length,
        hydeCount: h.length,
        hydeUsed: understood.hydeVector !== null,
      });
    }

    if (!usedQueryUnderstanding) {
      // ORIGINAL Phase-1 path, now with two additional lexical RRF streams:
      // trigram (identifier-substring recall) and fuzzy-corrected keyword
      // (Levenshtein correction over the per-store vocabulary). All four
      // streams fuse via RRF; empty streams contribute nothing.
      const fetchN = retrievalLimit;
      const [vectorResults, keywordResults, trigramResults] =
        await Promise.all([
          deps.vectorStore
            .search(query, fetchN, projectId)
            .catch((error) => { throw searchBackendUnavailable("vector_search", error); }),
          disableKeyword
            ? Promise.resolve([] as SearchResult[])
            : deps.keywordSearch
                .searchWithFilter(query, { projectId }, fetchN)
                .catch((error) => { throw searchBackendUnavailable("keyword_search", error); }),
          // Trigram stream (best-effort; [] when tokenizer unavailable).
          disableKeyword || !deps.keywordSearch.searchTrigram
            ? Promise.resolve([] as SearchResult[])
            : deps.keywordSearch
                .searchTrigram!(query, { projectId }, fetchN)
                .catch(() => {
                  degrade("TRIGRAM_UNAVAILABLE", "trigram_search");
                  return [] as SearchResult[];
                }),
        ]);

      logger.debug("Search results retrieved", {
        vectorCount: vectorResults.length,
        keywordCount: keywordResults.length,
        trigramCount: trigramResults.length,
      });
      resultSets = [vectorResults, keywordResults, trigramResults].filter(
        (s) => s.length > 0,
      );

      // Fuzzy correction stream: if any query word corrects to a different
      // vocabulary word, re-run keyword + trigram on the corrected query and
      // add both as RRF streams. This recovers typos like "useEffct" →
      // "useEffect" that porter/trigram miss. Best-effort; skipped when no
      // correction applies or fuzzyCorrect is unavailable.
      if (!disableKeyword && typeof deps.keywordSearch.fuzzyCorrect === "function") {
        let corrected: string | null = null;
        try {
          corrected = await correctQuery(deps, query);
        } catch {
          degrade("FUZZY_SEARCH_UNAVAILABLE", "fuzzy_correction");
        }
        if (corrected && corrected !== query.toLowerCase().trim()) {
          try {
            const [fuzzyKeyword, fuzzyTrigram] = await Promise.all([
              deps.keywordSearch
                .searchWithFilter(corrected, { projectId }, fetchN)
                .catch(() => {
                  degrade("FUZZY_SEARCH_UNAVAILABLE", "fuzzy_keyword_search");
                  return [] as SearchResult[];
                }),
              deps.keywordSearch.searchTrigram
                ? deps.keywordSearch
                    .searchTrigram!(corrected, { projectId }, fetchN)
                    .catch(() => {
                      degrade("FUZZY_SEARCH_UNAVAILABLE", "fuzzy_trigram_search");
                      return [] as SearchResult[];
                    })
                : Promise.resolve([] as SearchResult[]),
            ]);
            if (fuzzyKeyword.length > 0) resultSets.push(fuzzyKeyword);
            if (fuzzyTrigram.length > 0) resultSets.push(fuzzyTrigram);
            logger.debug("Fuzzy correction stream added", {
              corrected,
              fuzzyKeywordCount: fuzzyKeyword.length,
              fuzzyTrigramCount: fuzzyTrigram.length,
            });
          } catch {
            degrade("FUZZY_SEARCH_UNAVAILABLE", "fuzzy_search");
          }
        }
      }
    }

    // Phase 7c: graph-neighbor as an extra RRF stream. BFS depth-2 over
    // outgoing memory-graph edges from the top-N vector-hit ids; resolved to
    // SearchResults via the memory repo at a fixed sub-hit score (0.45) so
    // RRF surfaces them mid-list. Silent-omit when empty/unavailable (the
    // resultSets length — and thus the search:reranked streamCount — reflects
    // the actual stream count). No graph-stream throw escapes this optional path.
    let graphStream: SearchResult[] = [];
    try {
      graphStream = await deps.buildGraphStream(
        resultSets,
        maxResults,
        projectId,
        degrade,
      );
    } catch {
      degrade("GRAPH_AUGMENTATION_UNAVAILABLE", "graph_augmentation");
    }
    if (graphStream.length > 0) {
      resultSets = [...resultSets, graphStream];
    }

    // Combine results using RRF (with score explanation if requested)
    const fusedResults = fuseResults(resultSets, query, explainScores);

    // A2: proximity + title re-ranking pass (post-RRF, pre-filter). Stable
    // re-rank on top of RRF: boosts results whose title contains query terms
    // and whose body positions the terms close together; code chunks get a
    // stronger title boost. Applied to a bounded candidate pool so the cost
    // stays low; equally-boosted results keep their RRF order.
    const rerankPool = Math.max(maxResults * 3, 20);
    const rerankInput = fusedResults.slice(0, rerankPool);
    let rerankedTop = rerankInput;
    try {
      rerankedTop = applyProximityRerank(rerankInput, query);
    } catch {
      degrade("PROXIMITY_RERANK_UNAVAILABLE", "proximity_rerank");
    }
    const fusedReranked = [
      ...rerankedTop,
      ...fusedResults.slice(rerankPool),
    ];

    if (usedQueryUnderstanding) {
      try {
        eventBus.publish("search:reranked", {
          query,
          projectId,
          streamCount: resultSets.length,
          resultCount: fusedResults.length,
        });
      } catch {
        degrade("SEARCH_AUDIT_UNAVAILABLE", "search_reranked_event");
      }
    }

    // Apply file pattern filters if provided
    // Note: For maximum efficiency, filters could be applied DURING vector/keyword search
    // by pre-computing valid files. For now, we apply post-search but cache the filter computation.
    let filteredByPattern = fusedReranked;
    if (includeFilters || excludeFilters) {
      const filterStartTime = performance.now();
      filteredByPattern = filterByPatterns(
        fusedReranked,
        includeFilters,
        excludeFilters,
      );
      const filterDuration = performance.now() - filterStartTime;

      logger.debug("Applied file pattern filters", {
        beforeFilter: fusedReranked.length,
        afterFilter: filteredByPattern.length,
        includePatterns: includeFilters,
        excludePatterns: excludeFilters,
        filterDurationMs: filterDuration.toFixed(2),
      });
    }

    // Filter by minimum score and limit results.
    //
    // minScore is applied to the RAW vector similarity (cosine distance from
    // the embedding model), not the normalized RRF score.  RRF normalization
    // divides by the max score, so the top result always gets ~1.0 regardless
    // of actual semantic relevance — making a score-based filter useless for
    // noise rejection.  The raw vectorScore is an absolute measure (0–1) that
    // is meaningful across queries.
    //
    // Keyword-only results (no vectorScore) fall back to the normalized score
    // so they are still subject to some threshold.
    const aboveThreshold = filteredByPattern
      .filter((result) => {
        const meta = result.metadata as Record<string, unknown>;
        const rawVs = meta?._rrfRawVectorScore as number | undefined;
        return rawVs !== undefined ? rawVs >= minScore : result.score >= minScore;
      })
      .map((result) => {
        const { _rrfRawVectorScore, ...cleanMeta } = result.metadata as Record<string, unknown>;
        return { ...result, metadata: cleanMeta };
      });

    const maxChunksPerFile = Number(process.env.RRF_MAX_CHUNKS_PER_FILE ?? "2");
    const fileChunkCount = new Map<string, number>();
    const filtered = maxChunksPerFile > 0
      ? aboveThreshold.filter((r) => {
          const fp = (r.metadata as Record<string, unknown>)?.filePath as string ?? r.id;
          const count = fileChunkCount.get(fp) ?? 0;
          if (count >= maxChunksPerFile) return false;
          fileChunkCount.set(fp, count + 1);
          return true;
        }).slice(0, maxResults)
      : aboveThreshold.slice(0, maxResults);

    // Add context to results
    let withContext: SearchResult[];
    try {
      withContext = await deps.addContextToResults(filtered, projectId);
    } catch (error) {
      throw storeCorruption("search_result_hydration", error);
    }

    // Cache the results
    try {
      await deps.searchCache.set(query, projectId, withContext, cacheOptions);
    } catch (error) {
      throw searchBackendUnavailable("search_cache_write", error);
    }

    const duration = Math.round(performance.now() - startTime); // Use performance.now() for consistency

    // Track cache miss
    try {
      deps.analytics.trackSearch({
        timestamp: Date.now(),
        projectId,
        query,
        resultCount: withContext.length,
        duration,
        cacheHit: false,
        score: calculateAvgScore(withContext),
      });
    } catch {
      degrade("SEARCH_ANALYTICS_UNAVAILABLE", "search_analytics");
    }

    logger.info("Contextual search completed", {
      projectId,
      totalResults: withContext.length,
      avgScore: calculateAvgScore(withContext),
      duration,
    });

    try {
      return await deps.applySynapseState(
        withContext,
        query,
        projectId,
        options.sessionId,
        degrade,
      );
    } catch {
      degrade("SYNAPSE_UNAVAILABLE", "synapse");
      return withContext;
    }
  } catch (error) {
    if (error instanceof SearchServiceError) {
      recordSearchFailure(error, projectId);
    }
    logger.error("Contextual search failed", error as Error, {
      query,
      projectId,
    });
    throw error;
  }
}

// ── correctQuery ─────────────────────────────────────────────────────────────

/**
 * Fuzzy-correct each non-stopword query term via the keyword store's
 * vocabulary. Returns the corrected query string (lowercased, space-joined),
 * or null when no term corrects to a different word or fuzzyCorrect is
 * unavailable. Only words of length >= 3 are considered (shorter tokens
 * can't be reliably corrected).
 */
export async function correctQuery(
  deps: HybridSearchDeps,
  query: string,
): Promise<string | null> {
  if (typeof deps.keywordSearch.fuzzyCorrect !== "function") return null;
  const terms = extractQueryTerms(query).filter((w) => w.length >= 3);
  // Vocabulary-nearest correction is reliable for identifier typo probes
  // ("useEffct") but unsafe for natural-language sentences: ordinary
  // Portuguese words were rewritten to unrelated English code tokens and
  // added as an entire extra RRF stream.
  if (terms.length !== 1) return null;
  const corrected: string[] = [];
  let changed = false;
  for (const term of terms) {
    const fix = await deps.keywordSearch.fuzzyCorrect!(term);
    if (fix && fix !== term) {
      corrected.push(fix);
      changed = true;
    } else {
      corrected.push(term);
    }
  }
  return changed ? corrected.join(" ") : null;
}

// ── addContextToResults ──────────────────────────────────────────────────────

/**
 * Takes **no deps record** (§4.4): §2.1 shows its only facade read was
 * `extractPreview`, which now lives beside it here, so the honest parameter list
 * is the data alone — the shape `fuseResults` and `buildGraphStream` already
 * have. GMS-03 AC-1 is satisfied by the absent facade argument, not by a record.
 * `search` still reaches it through `deps.addContextToResults` rather than
 * calling it module-locally — see the 6 stub sites noted above.
 */
export async function addContextToResults(
  results: SearchResult[],
  _projectId: string,
): Promise<SearchResult[]> {
  return results.map((result) => {
    const metadata = result.metadata;
    const filePath = metadata?.filePath as string;
    const lineStart = metadata?.lineStart as number;
    const lineEnd = metadata?.lineEnd as number;

    if (filePath && lineStart && lineEnd) {
      return {
        ...result,
        highlights: [`${filePath}:${lineStart}-${lineEnd}`],
        metadata: {
          ...metadata,
          context: {
            filePath,
            lineStart,
            lineEnd,
            preview: extractPreview(result.content),
          },
        },
      };
    }

    return result;
  });
}

// ── extractPreview ───────────────────────────────────────────────────────────

export function extractPreview(content: string, maxLines: number = 5): string {
  const lines = content.split("\n");
  const preview = lines.slice(0, maxLines).join("\n");
  return lines.length > maxLines ? preview + "\n..." : preview;
}

// ── calculateAvgScore ────────────────────────────────────────────────────────

export function calculateAvgScore(results: SearchResult[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + r.score, 0);
  return sum / results.length;
}

// ── filterByPatterns ─────────────────────────────────────────────────────────

export function filterByPatterns(
  results: SearchResult[],
  include?: string[],
  exclude?: string[],
): SearchResult[] {
  if (!include && !exclude) {
    return results;
  }

  return results.filter((result) => {
    const filePath = result.metadata?.filePath as string;
    if (!filePath) return !include?.length;

    // Check exclude patterns first (blacklist)
    if (exclude && exclude.length > 0) {
      const isExcluded = exclude.some((pattern) => minimatch(filePath, pattern));
      if (isExcluded) return false;
    }

    // Check include patterns (whitelist)
    if (include && include.length > 0) {
      const isIncluded = include.some((pattern) => minimatch(filePath, pattern));
      return isIncluded;
    }

    // No include patterns specified, include by default (unless excluded above)
    return true;
  });
}
