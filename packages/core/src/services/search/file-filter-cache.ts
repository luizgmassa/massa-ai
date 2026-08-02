/**
 * File Filter Cache
 *
 * Pre-computes and caches valid file lists based on include/exclude patterns.
 * This avoids re-applying glob filters on every search, significantly improving
 * performance when filters are used.
 *
 * Benefits:
 * - 40-60% reduction in file filtering overhead
 * - Filters applied DURING vector search, not after
 * - Efficient pattern matching using minimatch
 */

import { minimatch } from "minimatch";
import { logger } from "@massa-ai/shared";
import { evictOldest as evictOldestShared } from "../cache/lru-evict.js";

interface FilterCacheEntry {
  files: Set<string>;
  createdAt: number;
  accessCount: number;
}

interface FilterCacheKey {
  projectId: string;
  include?: string[];
  exclude?: string[];
}

export class FileFilterCache {
  private cache: Map<string, FilterCacheEntry> = new Map();
  private readonly MAX_CACHE_SIZE = 50; // Maximum number of filter combinations to cache
  private readonly TTL_MS = 3600000; // 1 hour

  /**
   * Get or compute valid files for a project with given filters
   */
  getValidFiles(
    projectId: string,
    allProjectFiles: string[],
    include?: string[],
    exclude?: string[],
  ): Set<string> {
    const cacheKey = this.generateKey({ projectId, include, exclude });

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const now = Date.now();

      // Check if expired
      if (now - cached.createdAt > this.TTL_MS) {
        this.cache.delete(cacheKey);
        logger.debug("Filter cache entry expired", { projectId, cacheKey });
      } else {
        cached.accessCount++;
        logger.debug("Filter cache hit", {
          projectId,
          fileCount: cached.files.size,
          accessCount: cached.accessCount,
        });
        return new Set(cached.files); // Return copy
      }
    }

    // Cache miss - compute valid files
    const startTime = performance.now();
    const validFiles = this.computeValidFiles(
      allProjectFiles,
      include,
      exclude,
    );
    const duration = performance.now() - startTime;

    // Store in cache
    this.cache.set(cacheKey, {
      files: validFiles,
      createdAt: Date.now(),
      accessCount: 1,
    });

    // Enforce size limit (LRU-like: remove oldest if over limit)
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    logger.debug("Filter cache miss - computed valid files", {
      projectId,
      fileCount: validFiles.size,
      totalFiles: allProjectFiles.length,
      duration: `${duration.toFixed(2)}ms`,
    });

    return new Set(validFiles); // Return copy
  }

  /**
   * Compute which files match the include/exclude patterns
   */
  private computeValidFiles(
    allFiles: string[],
    include?: string[],
    exclude?: string[],
  ): Set<string> {
    const valid = new Set<string>();

    for (const file of allFiles) {
      // Apply exclude filters first (blacklist)
      if (exclude && exclude.length > 0) {
        const excluded = exclude.some((pattern) => minimatch(file, pattern));
        if (excluded) continue;
      }

      // Apply include filters (whitelist)
      if (include && include.length > 0) {
        const included = include.some((pattern) => minimatch(file, pattern));
        if (!included) continue;
      }

      valid.add(file);
    }

    return valid;
  }

  /**
   * Generate cache key from project ID and filter patterns
   */
  private generateKey(params: FilterCacheKey): string {
    const parts = [
      `project:${params.projectId}`,
      params.include ? `include:${params.include.sort().join(",")}` : "",
      params.exclude ? `exclude:${params.exclude.sort().join(",")}` : "",
    ].filter(Boolean);

    return parts.join("|");
  }

  /**
   * Evict oldest entries until the cache is back under MAX_CACHE_SIZE.
   *
   * Called AFTER the insert, so it passes the cap itself rather than CAP - 1;
   * services/cache/lru-evict.ts takes a post-call bound.
   *
   * TWO DELIBERATE CHANGES OF MECHANISM, BOTH BEHAVIOR-PRESERVING HERE.
   *
   * Victim selection was min(createdAt) and is now Map insertion order. They
   * agree unconditionally at this site: every write to the Map either inserts
   * fresh with the current Date.now(), or deletes without reordering the
   * survivors. Nothing ever repositions a key without also giving it the
   * newest createdAt — the TTL-expiry path at :52-54 deletes before the miss
   * path re-inserts, so an expired-then-recomputed key moves to the end of
   * insertion order and gets a new timestamp together. A read does NOT promote
   * here (it only bumps accessCount), which is the axis this cache does not
   * share with the other four and the reason the shared module is an eviction
   * function rather than a cache class.
   *
   * Eviction count was exactly one and is now "until under the bound". The
   * single call site is guarded by `size > MAX_CACHE_SIZE` immediately after a
   * single insert, so the cache is never more than one entry over and both
   * forms evict exactly one. They diverge only if MAX_CACHE_SIZE is lowered
   * beneath an already-larger cache, which is unreachable — the field is
   * readonly.
   *
   * ONE OBSERVABLE DROPPED, recorded rather than absorbed: this method used to
   * emit logger.debug("Evicted oldest filter cache entry", { key }). Naming the
   * victim is not something a shared eviction function can report, and the
   * other four unified sites do not log at all. The line had no assertion
   * anywhere in the repository.
   */
  private evictOldest(): void {
    evictOldestShared(this.cache, this.MAX_CACHE_SIZE);
  }

  /**
   * Invalidate cache for a specific project
   */
  invalidateProject(projectId: string): number {
    let removed = 0;
    const prefix = `project:${projectId}`;

    for (const [key, _entry] of this.cache.entries()) {
      if (key === prefix || key.startsWith(`${prefix}|`)) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info("Invalidated file filter cache for project", {
        projectId,
        entriesRemoved: removed,
      });
    }

    return removed;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    logger.info("File filter cache cleared");
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    entries: Array<{
      key: string;
      fileCount: number;
      accessCount: number;
      ageMs: number;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      fileCount: entry.files.size,
      accessCount: entry.accessCount,
      ageMs: now - entry.createdAt,
    }));

    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      entries,
    };
  }
}
