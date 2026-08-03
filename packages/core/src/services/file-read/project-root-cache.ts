/**
 * @massa-ai/core - Project root cache
 *
 * Module 3 of the `tools/read_file.ts` extraction (PR-D, T9). Owns the
 * projectId → canonical project-root path cache that `ReadFileTool` used to
 * carry as a private field, together with the `indexing:started` subscription
 * that refreshes it and the LRU cap that bounds it.
 *
 * INSTANTIATED PER ReadFileTool, never as a module singleton. Each tool
 * instance owned its own Map before the move — measured 41 construction sites
 * across 9 files, 39 of them in tests — so a shared instance would leak cached
 * roots between independently-constructed tools. That is a behavior change, and
 * this extraction is behavior-preserving by contract (RFS-02 AC-1).
 *
 * ROOT_CACHE_TTL IS DECLARED AND READ NOWHERE, and that is carried across
 * deliberately rather than repaired. It is the pre-existing state, measured by
 * `__tests__/read-file-project-root-rename-pin.test.ts` (RFS-02 AC-4): past
 * 300 s the project root still does not re-resolve, so this cache is
 * LRU-bounded only and a committed rename leaves it serving the pre-rename
 * root. PR-D logs that defect and does not fix it — enforcing the TTL here
 * would be a behavior change inside a behavior-preserving PR.
 */
import { logger } from "@massa-ai/shared";
import { evictOldest } from "../cache/lru-evict.js";
import { eventBus } from "../events/event-bus.js";
import { workspaceManager } from "../workspace/workspace-manager.js";

export class ProjectRootCache {
  private projectRootCache: Map<string, string> = new Map();
  private readonly ROOT_CACHE_TTL = 300000; // 5 minutes
  /**
   * Maximum entries retained in the cache. Without a cap, an adversarial caller
   * cycling distinct projectIds grows the map for the process lifetime. Map
   * preserves INSERTION order in JS; we promote a key to most-recently-used on
   * GET via delete+set, and evict the oldest key on SET while over the cap.
   *
   * Before the extraction this bound was read from `ReadFileTool`'s own
   * FILE_CACHE_MAX_ENTRIES, which belongs to the file CONTENT cache and which
   * T10 moved to `file-content-cache.ts`. Both were 512 and neither ever read
   * the other's value, so naming the bound here retains the same number at the
   * same call positions.
   * Mirrors SymbolGraphService.PROJECT_ROOT_CACHE_MAX_ENTRIES.
   */
  private readonly PROJECT_ROOT_CACHE_MAX_ENTRIES = 512;

  constructor() {
    // The API keeps one ReadFileTool instance for the process lifetime. A
    // guarded reset/reindex may legitimately move the same projectId to a new
    // canonical root, so refresh the cached root as soon as ETL announces the
    // new run. Without this, relative reads keep resolving against the prior
    // workspace path until the API restarts.
    eventBus.subscribe("indexing:started", ({ projectId, projectPath }) => {
      this.projectRootCache.delete(projectId);
      evictOldest(this.projectRootCache, this.PROJECT_ROOT_CACHE_MAX_ENTRIES - 1);
      this.projectRootCache.set(projectId, projectPath);
    });
  }

  async getProjectRoot(projectId: string): Promise<string | null> {
    const cached = this.projectRootCache.get(projectId);
    if (cached !== undefined) {
      // LRU touch: promote this key to most-recently-used.
      this.projectRootCache.delete(projectId);
      this.projectRootCache.set(projectId, cached);
      return cached;
    }

    try {
      const workspace = await workspaceManager.getWorkspace(projectId);
      if (workspace?.project_path) {
        evictOldest(this.projectRootCache, this.PROJECT_ROOT_CACHE_MAX_ENTRIES - 1);
        this.projectRootCache.set(projectId, workspace.project_path);
        return workspace.project_path;
      }
    } catch (error) {
      logger.warn("Failed to look up project root", { projectId, error: (error as Error).message });
    }
    return null;
  }
}
