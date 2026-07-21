/**
 * production-wiring — composition root helpers for the project-identity
 * post-commit contract (spec req 8). T5 transports plug these factories into
 * `createProjectIdentityApplyService`; keeping them here means the wiring is
 * defined once and unit-testable with injected targets.
 *
 * The serving in-memory caches live on the SearchController singleton's
 * ContextualSearchRLM engine (the same instance MCP tools and HTTP routes
 * serve from) plus the SymbolGraphService singleton. They are resolved
 * LAZILY on first invalidation via dynamic import so importing the
 * project-identity module never pulls the search/controller graph in, and a
 * cold process that never renames pays nothing.
 */

import { eventBus } from "../events/event-bus.js";
import { getProjectIdentityAliasResolver } from "./alias-resolver.js";
import type {
  ProjectIdentityChangedPayload,
  ProjectIdentityChangedPublisher,
} from "./apply.js";
import { ProjectIdentityInvalidatorRegistry } from "./invalidator-registry.js";

/** Minimal surfaces the post-commit invalidators need. */
export interface ProductionInvalidatorTargets {
  /** QueryUnderstandingService — rewrite/HyDE cache keyed `${projectId}::${query}`. */
  readonly queryUnderstanding: { invalidateProject(projectId: string): void };
  /** FileFilterCache — key-globs `project:${projectId}|*`. */
  readonly fileFilterCache: { invalidateProject(projectId: string): unknown };
  /** IndexManager.metadataCache — keyed by projectId. Null until engine init. */
  readonly indexManager: { clearCache(projectId?: string): void } | null;
  /** SymbolGraphService.projectRootCache — keyed by projectId. */
  readonly symbolGraph: { clearProjectRoot(projectId: string): void };
}

export type ProductionInvalidatorTargetResolver =
  () => Promise<ProductionInvalidatorTargets> | ProductionInvalidatorTargets;

/**
 * Default resolver: the SERVING cache instances. Search traffic flows through
 * SearchController.getInstance().getSearchEngine() (SearchProjectTool,
 * SearchCodeTool, and context-controller all share it), so invalidating that
 * engine's caches is what prevents stale post-rename responses.
 */
async function resolveServingTargets(): Promise<ProductionInvalidatorTargets> {
  const [{ SearchController }, { symbolGraphService }] = await Promise.all([
    import("../../controllers/search-controller.js"),
    import("../symbol/symbol-graph.service.js"),
  ]);
  const engine = SearchController.getInstance().getSearchEngine();
  return {
    queryUnderstanding: engine.queryUnderstanding,
    fileFilterCache: engine.fileFilterCache,
    indexManager: engine.indexManager ?? null,
    symbolGraph: symbolGraphService,
  };
}

/**
 * Compose the production invalidator registry. Registered invalidators:
 *
 *  - `query-understanding-cache` — LLM rewrite/HyDE entries for the old ID.
 *  - `file-filter-cache` — per-project file-filter globs.
 *  - `index-manager-metadata` — index freshness metadata. Tolerates a cold
 *    engine (IndexManager is assigned during engine initialization).
 *  - `symbol-graph-project-root` — cached project-root path resolution.
 *
 * L1MemoryCache and the read_file tool cache are deliberately absent: both
 * are TTL-bounded and self-evict (see invalidator-registry.ts). Durable
 * caches (search_cache PG rows) are rewritten by apply itself (T3 stores).
 *
 * Every invalidation failure is caught by the registry and surfaced as a
 * sanitized code in the report — a committed rename/merge can NEVER be
 * flipped to failure by a cache problem (spec req 8).
 */
export function createProductionProjectIdentityInvalidatorRegistry(
  resolve: ProductionInvalidatorTargetResolver = resolveServingTargets,
): ProjectIdentityInvalidatorRegistry {
  const registry = new ProjectIdentityInvalidatorRegistry();

  registry.register({
    id: "query-understanding-cache",
    async invalidateProject(projectId) {
      const targets = await resolve();
      targets.queryUnderstanding.invalidateProject(projectId);
    },
  });
  registry.register({
    id: "file-filter-cache",
    async invalidateProject(projectId) {
      const targets = await resolve();
      await targets.fileFilterCache.invalidateProject(projectId);
    },
  });
  registry.register({
    id: "index-manager-metadata",
    async invalidateProject(projectId) {
      const targets = await resolve();
      targets.indexManager?.clearCache(projectId);
    },
  });
  registry.register({
    id: "symbol-graph-project-root",
    async invalidateProject(projectId) {
      const targets = await resolve();
      targets.symbolGraph.clearProjectRoot(projectId);
    },
  });
  // The alias resolver's own cache: a committed rename/merge must drop the
  // source→source and target mappings immediately so the NEXT scoped writer
  // resolves the post-commit alias instead of riding the TTL.
  registry.register({
    id: "project-identity-alias-resolver",
    invalidateProject(projectId) {
      getProjectIdentityAliasResolver().invalidateProject(projectId);
    },
  });

  return registry;
}

/**
 * Publisher backed by the shared TypedEventBus singleton. Emits
 * `project-identity:changed` AFTER commit; the apply service swallows any
 * listener-side throw, so this stays notification-only (spec req 8).
 */
export function createEventBusProjectIdentityChangedPublisher(): ProjectIdentityChangedPublisher {
  return {
    publish(payload: ProjectIdentityChangedPayload): void {
      eventBus.publish("project-identity:changed", payload);
    },
  };
}
