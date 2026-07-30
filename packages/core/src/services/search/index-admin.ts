/**
 * index-admin — the index administration capability (design.md §4.1).
 *
 * PR-B capability module. Takes `IndexAdminDeps` — the collaborators §2.1 shows
 * these surfaces read — in place of the facade instance they used to receive as
 * `rlm` (GMS-03 AC-1). The file has never heard of ContextualSearchRLM, so it
 * contributes nothing to the root's foreign reach (G-HUB, design.md §3.4).
 *
 * `await rlm.ensureInitialized()` is **gone from the three bodies that had it**.
 * It was the literal first statement of `clearProjectIndex`, `getProjectStats`
 * and `warmupCache`, and it is now the literal first statement of the three
 * facade methods that call them — design.md §4.5(b) and the §4.3 sketch. Order is
 * unchanged: the root awaits init, *then* assembles the deps record, so the
 * fields this module reads are populated exactly as before. `getAnalytics` never
 * called it and still does not; adding one would be a behavior change, not a
 * tidy-up, and it is also the one delegate left with no `await` ahead of it,
 * which is what makes it this task's blind-recursion mutation subject
 * (tasks.md, "The mutation shape matters").
 *
 * LATE-BIND (design.md §4.3.1): the root assembles this record per call from its
 * current field values. Nothing here captures a collaborator.
 *
 * Behavior is byte-preserved from rlm-admin.ts: the bodies moved verbatim with
 * `rlm.` → `deps.` and the hoisted init statement removed.
 */

import { logger } from "@massa-ai/shared";
import type { SearchResult } from "@massa-ai/shared";
import { SearchAnalytics } from "./search-analytics.js";
import type { SearchAnalyticsPg } from "./search-analytics-pg.js";
import type { FileFilterCache } from "./file-filter-cache.js";
import type { getKeywordSearch } from "../../data/keyword/keyword-search-factory.js";
import type { getVectorStore } from "../../data/vector/vector-store-factory.js";
import type { getSearchCache } from "./cache-factory.js";

// ── Deps ─────────────────────────────────────────────────────────────────────

/**
 * The narrow dependency record for this module (design.md §4.4) — exactly the
 * collaborators §2.1 shows these surfaces read, minus `ensureInitialized`, which
 * the root hoisted.
 *
 * The three stores are required and carry the root's own field types: their
 * originals were bare `rlm.<store>.<method>` reads off definite-assigned fields
 * with no fallback, so an absent store must keep throwing exactly where it did.
 * They are structural (`Awaited<ReturnType<typeof …>>`), which is why they never
 * touch the hub metric — see the two nominal fields below, which do not either,
 * but for reasons that had to be measured rather than assumed.
 *
 * **`search` is a re-entrant seam, not a store.** design.md §4.1's "injected
 * collaborators" column says "six stores + `fileFilterCache`", which is both an
 * over-count (three stores are read, not six) and an omission: §2.1 records
 * `warmupCacheImpl` reading the facade's `search` **method**, and §12 item 4
 * orders index-admin *before* hybrid-search, so at T12 there is no
 * `hybrid-search.search` to import — the collaborator is the root's own method,
 * reached back through a per-call arrow wrapper exactly as `IndexerDeps` reaches
 * `indexFile` / `indexProject` at T10.
 *
 * It is load-bearing, and the sensor for it is new rather than pre-existing.
 * Measured: `rlm.search` is stubbed at **7 instance-method sites** —
 * `rlm-admin.test.ts:124,137,148` and
 * `contextual-search-rlm-coverage.test.ts:382,395,407,416` — as bare assignments
 * with no `as any` cast, so the established PATCHABLE regex does not find them
 * (the same shape T10 registered for `indexFile`/`indexProject`, and `git grep
 * -E` cannot even express the sweep: POSIX ERE has no `\s`, so the first pass
 * silently reported zero). Every one of those 7 sites is exercised *through*
 * `warmupCache`, and they are also the *only* 7 calls to `warmupCache` in the
 * suite — so **no pre-existing test ever runs `warmupCache` against the real
 * `search`**, and all 7 assign before they call. That makes a bare
 * `search: this.search` reference or a `.bind(this)` at assembly time invisible
 * to the entire pre-existing suite: both would still capture the stub, because a
 * per-call assembly happens after the assignment. `index-admin-late-bind.test.ts`
 * test 4 is the only thing in the repository that can see the difference.
 *
 * **Neither nominal field fires T10's seventh defect, and both reasons are
 * measured.** That defect — a bare nominal type declared inside
 * `services/search/` being captured as a binding by `search-hub-metric.ts:139`'s
 * `([A-Za-z0-9_]+)\s*:\s*<Type>\b` — took `IndexManager`'s `maxForeignReach` from
 * 0 to 4 at T10. tasks.md T12's row predicts both fields here "will" fire because
 * they are required rather than optional (T11's `?` guard). Measured, they do not:
 *
 * - `analytics` cannot fire at all. `SearchAnalytics` is a **stripped re-export
 *   alias** (`search-analytics.ts` is one `export … from` line, and
 *   `stripNonCode` deletes exactly those), so it never enters `declaredIn` and
 *   never appears in the metric's output. `SearchAnalyticsPg` *is* declared, but
 *   only ever occurs here after `| `, never in `<name>:` position, so no binding
 *   is captured. And independently: `getAnalytics` returns `deps.analytics`
 *   **whole** and never dereferences it, so `perModule` gains nothing either way
 *   — the same route by which T11's `indexManager` and T7's `_rlm` contributed
 *   zero. It is therefore **deliberately not `Pick<>`-narrowed**, against the
 *   row's instruction: narrowing would also break `type-check`, because the value
 *   is returned through the root's public `getAnalytics(): SearchAnalytics |
 *   SearchAnalyticsPg`, a compatibility surface for 24 importers. Same reason the
 *   `Pick<>` decision did not generalise to T11's seam field.
 * - `fileFilterCache` *is* captured and *is* dereferenced once
 *   (`invalidateProject`), so un-narrowed it moves `FileFilterCache` from foreign
 *   0 / reach 0 to foreign 1 / reach **1**. That is under `MAX_FOREIGN_REACH`
 *   (3), so unlike T10's reach-4 case it produces **no second G-HUB violation**
 *   and would not have made T14's gate unclosable. The `Pick<>` below is kept
 *   because §4.4 says a record holds exactly what is read and it is the honest
 *   type — **not** because a sensor fired. Both variants were measured by scratch
 *   simulation before this file was applied.
 */
export interface IndexAdminDeps {
  vectorStore: Awaited<ReturnType<typeof getVectorStore>>;
  keywordSearch: Awaited<ReturnType<typeof getKeywordSearch>>;
  searchCache: Awaited<ReturnType<typeof getSearchCache>>;
  fileFilterCache: Pick<FileFilterCache, "invalidateProject">;
  analytics: SearchAnalytics | SearchAnalyticsPg;
  /**
   * The root's own `search`, as a per-call arrow wrapper that re-reads
   * `this.search` at **call** time. Not `.bind(this)` and not a bare method
   * reference: both resolve the method at *assembly* time, and see the 7 stub
   * sites above for why that is the failure this record exists to prevent.
   * Typed with exactly the options `warmupCache` passes (§4.4), not the facade's
   * full option bag.
   */
  search: (
    query: string,
    projectId: string,
    options?: { maxResults?: number; minScore?: number },
  ) => Promise<SearchResult[]>;
}

// ── clearProjectIndex ────────────────────────────────────────────────────────

export async function clearProjectIndex(
  deps: IndexAdminDeps,
  projectId: string,
): Promise<{ deleted: number }> {
  try {
    const [deleted, keywordDeleted] = await Promise.all([
      deps.vectorStore.deleteByProject(projectId),
      deps.keywordSearch.deleteByProject(projectId),
    ]);

    // Clear associated caches
    await deps.searchCache.invalidateProject(projectId);
    deps.fileFilterCache.invalidateProject(projectId);

    logger.info("Project index and caches cleared", {
      projectId,
      deleted,
      keywordDeleted,
    });
    return { deleted };
  } catch (error) {
    logger.error("Failed to clear project index", error as Error, {
      projectId,
    });
    return { deleted: 0 };
  }
}

// ── getProjectStats ──────────────────────────────────────────────────────────

export async function getProjectStats(
  deps: IndexAdminDeps,
  projectId: string,
): Promise<{
  totalDocuments: number;
  totalSize: number;
}> {
  return deps.vectorStore.getStats(projectId);
}

// ── warmupCache ──────────────────────────────────────────────────────────────

export async function warmupCache(
  deps: IndexAdminDeps,
  projectId: string,
  _projectPath: string,
  customQueries?: string[],
): Promise<{ queriesWarmed: number; errors: number }> {
  logger.info("Starting cache warmup", { projectId });

  // Common search patterns based on file types and structure
  const commonQueries = customQueries || [
    "authentication",
    "api endpoints",
    "database models",
    "components",
    "utils",
    "configuration",
    "routes",
    "services",
    "tests",
    "types",
    "interfaces",
    "error handling",
    "validation",
    "middleware",
    "hooks",
  ];

  let queriesWarmed = 0;
  let errors = 0;

  // Run searches in background to populate cache
  for (const query of commonQueries) {
    try {
      await deps.search(query, projectId, {
        maxResults: 10,
        minScore: 0.3,
      });
      queriesWarmed++;

      logger.debug("Warmed cache for query", { query, projectId });
    } catch (error) {
      logger.error("Failed to warm cache for query", error as Error, {
        query,
        projectId,
      });
      errors++;
    }
  }

  logger.info("Cache warmup completed", {
    projectId,
    queriesWarmed,
    errors,
    totalQueries: commonQueries.length,
  });

  return { queriesWarmed, errors };
}

// ── getAnalytics ─────────────────────────────────────────────────────────────

export function getAnalytics(
  deps: IndexAdminDeps,
): SearchAnalytics | SearchAnalyticsPg {
  return deps.analytics;
}
