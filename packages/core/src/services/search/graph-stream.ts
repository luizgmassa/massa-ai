/**
 * graph-stream — the graph-neighbor RRF stream.
 *
 * PR-B capability module (design.md §4.1). Takes no dependency record at all:
 * it never read a single facade member. Its previous signature accepted the
 * facade as a deliberately-unused `_rlm` purely to match M14's delegate shape,
 * and dropping that parameter is what makes this an extraction rather than a
 * rename — the file has never heard of ContextualSearchRLM, so it contributes
 * nothing to the root's foreign reach (G-HUB, design.md §3.4).
 *
 * Behavior is byte-preserved from rlm-synapse.ts: the body moved verbatim.
 */

import { SearchResult, logger } from "@massa-ai/shared";
import { getMemoryRepository } from "../../data/memory/memory-repository-factory.js";
import { getGraphStore } from "../graph/graph-store-factory.js";
import type { SearchDegradationReporter } from "./search-diagnostics.js";

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
export async function buildGraphStream(
  resultSets: SearchResult[][],
  maxResults: number,
  projectId?: string,
  reportDegradation?: SearchDegradationReporter,
): Promise<SearchResult[]> {
  try {
    // Seed candidates = top-N ids + derived filePath/symbol anchors from the
    // first (vector) stream's chunk metadata.
    const vectorStream = resultSets[0] ?? [];
    const topHits = vectorStream.slice(0, Math.min(maxResults, 20));
    const rawIds = topHits
      .map((r) => r.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    // Derive anchor terms (filePath / symbol) from code-chunk metadata.
    // These are used to find MEMORY ids whose content references the same
    // code, bridging the chunk-id → memory-id gap.
    const anchors = new Set<string>();
    for (const r of topHits) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const fp = meta.filePath;
      if (typeof fp === "string" && fp.length > 0) {
        // Use the basename + the full path; basename is the most common
        // reference form in memories ("updated store.ts ...").
        anchors.add(fp);
        const base = fp.split("/").pop();
        if (base && base.length >= 3) anchors.add(base);
      }
      for (const key of ["parentSymbol", "symbolName", "label"] as const) {
        const v = meta[key];
        if (typeof v === "string" && v.length >= 3) anchors.add(v);
      }
    }

    const seedIds = new Set<string>(rawIds);
    // Bridge: resolve anchors to memory ids via fullTextSearch. Bounded to
    // the top few anchors to keep latency in check.
    if (anchors.size > 0) {
      const repo = getMemoryRepository();
      const anchorTerms = [...anchors].slice(0, 6);
      for (const term of anchorTerms) {
        try {
          // fullTextSearch(query, filters) — pass a SearchFilters object as
          // the second arg so both the number and object overloads resolve.
          const rows = await Promise.resolve(
            repo.fullTextSearch(term, 5, {
              projectId,
              minImportance: 0,
            }),
          );
          for (const row of rows) {
            if (typeof row.id === "string") seedIds.add(row.id);
          }
        } catch {
          reportDegradation?.("GRAPH_AUGMENTATION_UNAVAILABLE", "graph_anchor_lookup");
          // Defensive: a single anchor lookup never aborts bridging.
        }
      }
    }

    if (seedIds.size === 0) return [];
    const graph = getGraphStore();
    // PostgreSQL bfsNeighbors is sync; Pg is async. Normalize via Promise.resolve
    // so both backends work without an isPostgres short-circuit.
    const ns = await Promise.resolve(
      typeof (graph as { bfsNeighbors?: unknown }).bfsNeighbors === "function"
        ? (graph as { bfsNeighbors: (ids: string[], d: number) => string[] | Promise<string[]> }).bfsNeighbors([...seedIds], 2)
        : [],
    );
    if (!Array.isArray(ns) || ns.length === 0) return [];
    // Filter out ids already in the result set (avoid double-counting RRF).
    const present = new Set<string>();
    for (const set of resultSets)
      for (const r of set) present.add(r.id);
    const fresh = ns.filter((id) => !present.has(id));
    if (fresh.length === 0) return [];

    const repo = getMemoryRepository();
    const out: SearchResult[] = [];
    for (const id of fresh) {
      try {
        // Backend-polymorphic: PostgreSQL getById is sync, Pg is async. Normalize.
        const row = await Promise.resolve(repo.getById(id));
        if (!row || row.deleted_at !== null) continue;
        // BUG-02: project-scope the stream here. `memory_edges` has no
        // `project_id` (schema.prisma:335), so bfsNeighbors walks edges
        // globally and a single cross-project edge would publish another
        // project's content. Deliberately uses the caller's id unresolved and
        // skips when it is absent — the exact scope semantics of every other
        // read seam this path fuses (postgres-vector-store `WHERE project_id =
        // $2`, memory-repository-pg `fullTextSearch`). Resolving the canonical
        // alias only here would admit rows those seams reject.
        if (projectId && row.project_id !== projectId) continue;
        out.push({
          id: row.id,
          content: row.content,
          // Fixed sub-hit score: below a typical direct vector hit, above
          // the minScore 0.3 floor, so RRF surfaces neighbors mid-list.
          score: 0.45,
          source: "memory" as SearchResult["source"],
          metadata: {
            projectId: row.project_id ?? undefined,
            context: {
              memoryType: row.type,
              graphNeighbor: true,
              importance: row.importance,
            },
          },
        });
      } catch {
        // Defensive: a single missing memory never aborts the stream.
      }
    }
    return out;
  } catch (e) {
    reportDegradation?.("GRAPH_AUGMENTATION_UNAVAILABLE", "graph_augmentation");
    logger.debug("graph stream omitted", {
      err: (e as Error).message,
    });
    return [];
  }
}
