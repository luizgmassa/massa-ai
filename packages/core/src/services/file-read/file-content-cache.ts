/**
 * @massa-ai/core - File content cache
 *
 * Module 4 of the `tools/read_file.ts` extraction (PR-D, T10). Owns the
 * TTL-and-LRU-bounded file CONTENT cache `ReadFileTool` used to carry as
 * private state: `readFileWithCache`, the `fileCache` Map, `CACHE_TTL`,
 * `FILE_CACHE_MAX_ENTRIES` and the `CachedFile` shape.
 *
 * `readFileWithCache`'s BODY IS MOVED VERBATIM apart from one line. The private
 * `ReadFileTool.evictOldest` wrapper it used to call no longer exists — its body
 * read `this.FILE_CACHE_MAX_ENTRIES`, which this module takes, so the wrapper
 * could not survive this task even as dead code — and the call is now the shared
 * operator directly, on module 3's exact shape:
 * `evictOldest(map, CAP - 1)`. `lru-evict.ts`'s second parameter is a POST-CALL
 * BOUND rather than the cap, so a pre-insert caller passes `CAP - 1` to reserve
 * the slot the pending `set()` takes; `size > CAP - 1` and `size >= CAP` are the
 * same predicate over the integers, so the retained count at this call position
 * is unchanged (C44).
 *
 * IT NEVER NAMES SymbolGraphService. Metadata extraction arrives as a
 * constructor callback (`tasks.md` §4.1, decided there with its rejected
 * option), and the parameter is deliberately named `extractMetadata` so the
 * moved body's two call sites — the legacy-entry repair path and the cache
 * miss — read exactly as they did before the move. The type-only import of
 * `FileMetadata` from module 5 is unavoidable and is not what §4.1 forbids:
 * `SymbolGraphService` is the database-backed collaborator the callback exists
 * to keep out of this file.
 *
 * INSTANTIATED PER ReadFileTool, on module 3's precedent — each tool owned its
 * own `fileCache` Map before the move, so a module singleton would leak cached
 * file content between independently-constructed tools. That is a behavior
 * change, and this extraction is behavior-preserving by contract (RFS-02 AC-1).
 *
 * CACHE_TTL IS ENFORCED HERE and that is the half of RFS-02 AC-4 that holds.
 * `__tests__/read-file-project-root-rename-pin.test.ts` measured it: past 60 s
 * the content re-reads. Its sibling `ROOT_CACHE_TTL` in
 * `project-root-cache.ts` is declared and read nowhere, so that cache is
 * LRU-bounded only. The two constants were never related and are now not even
 * in the same file.
 */
import { logger } from "@massa-ai/shared";
import fs from "fs/promises";
import { evictOldest } from "../cache/lru-evict.js";
import type { FileMetadata } from "./file-metadata.js";

export interface CachedFile {
  content: string;
  timestamp: number;
  metadata?: FileMetadata;
}

/**
 * The 4 → 5 edge. Module 7 (`read-file.service.ts`) binds this with the
 * `symbolGraph` forwarded to it from `ReadFileTool`'s constructor parameter.
 * Bound there since T12; `ReadFileTool` itself bound it from T10 until then.
 */
export type MetadataExtractor = (
  content: string,
  filePath: string,
  options: {
    includeSymbols: boolean;
    includeImports: boolean;
    projectId?: string;
    relativePath?: string;
  }
) => Promise<FileMetadata>;

export class FileContentCache {
  private fileCache: Map<string, CachedFile> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute
  /**
   * Maximum entries retained in the cache. Without a cap, an adversarial caller
   * cycling distinct cache keys grows the map for the process lifetime. Map
   * preserves INSERTION order in JS; we promote a key to most-recently-used on
   * GET via delete+set, and evict the oldest key on SET while over the cap.
   * Mirrors WebController's WEB_CACHE_MAX_ENTRIES.
   */
  private readonly FILE_CACHE_MAX_ENTRIES = 512;

  constructor(private readonly extractMetadata: MetadataExtractor) {}

  async readFileWithCache(
    filePath: string,
    options: {
      includeSymbols: boolean;
      includeImports: boolean;
      projectId?: string;
      relativePath?: string;
    }
  ): Promise<{ content: string; metadata: FileMetadata }> {
    // Cache key MUST include every option that changes metadata extraction.
    // Keying on filePath alone returned stale, options-baked metadata for a
    // later read of the same file with different includeSymbols/includeImports/
    // projectId/relativePath (the only e2e red — 08.search F33). Deliberately
    // exclude offset/limit/lineStart/lineEnd/compress/targetRatio/format: those
    // are applied AFTER the cache in handle(), and coalescing them across reads
    // is the cache's purpose.
    const cacheKey = JSON.stringify({
      filePath,
      includeSymbols: options.includeSymbols ?? false,
      includeImports: options.includeImports ?? false,
      projectId: options.projectId ?? null,
      relativePath: options.relativePath ?? null,
    });
    const cached = this.fileCache.get(cacheKey);

    // Check cache validity
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug("File cache hit", { filePath });
      // LRU touch: promote this key to most-recently-used so hot files survive
      // eviction. delete+set reorders the key to the end (newest).
      this.fileCache.delete(cacheKey);
      this.fileCache.set(cacheKey, cached);

      // Legacy/edge entries may have undefined metadata. Re-extract once and
      // WRITE IT BACK into the cache entry so subsequent hits are served from
      // cache instead of re-extracting on every request.
      if (!cached.metadata) {
        const metadata = await this.extractMetadata(cached.content, filePath, options);
        this.fileCache.set(cacheKey, { ...cached, metadata });
        return { content: cached.content, metadata };
      }
      return {
        content: cached.content,
        metadata: cached.metadata,
      };
    }

    // Read file
    const content = await fs.readFile(filePath, "utf-8");
    const metadata = await this.extractMetadata(content, filePath, options);

    // Update cache (evict oldest if at cap).
    evictOldest(this.fileCache, this.FILE_CACHE_MAX_ENTRIES - 1);
    this.fileCache.set(cacheKey, {
      content,
      timestamp: Date.now(),
      metadata,
    });

    logger.debug("File read and cached", { filePath });

    return { content, metadata };
  }
}
