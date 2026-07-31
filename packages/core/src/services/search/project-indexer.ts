/**
 * project-indexer — the project indexing capability (design.md §4.1).
 *
 * PR-B capability module. Takes `IndexerDeps` — the collaborators §2.1 shows
 * these surfaces read — in place of the facade instance they used to receive as
 * `rlm` (GMS-03 AC-1). The file has never heard of ContextualSearchRLM, so it
 * contributes nothing to the root's foreign reach (G-HUB, design.md §3.4).
 *
 * `await rlm.ensureInitialized()` is **gone from every body here**. It was the
 * literal first statement of `checkSearchAdmission`, `indexProjectInternal` and
 * `ensureFreshIndex`, and it is now the literal first statement of the three
 * facade methods that call them — design.md §4.5(b) and the §4.3 sketch. Order
 * is unchanged: the root awaits init, *then* assembles the deps record, so the
 * fields this module reads are populated exactly as before. `indexFile` never
 * called it and still does not; its callers init first, as they always did.
 *
 * `ensureInitializedImpl` did **not** come here. It read 8 facade members, and
 * 8 > G-HUB's ceiling of 3, so anywhere outside the root it fails the gate
 * permanently. Its body is now the content of
 * `ContextualSearchRLM.ensureInitialized()` (tasks.md T10, design.md §4.1's
 * omission note). That is why rlm-indexing.ts dies whole rather than surviving
 * as a one-function husk.
 *
 * LATE-BIND (design.md §4.3.1): the root assembles this record per call from its
 * current field values. Nothing here captures a collaborator.
 *
 * Behavior is byte-preserved from rlm-indexing.ts: the bodies moved verbatim
 * with `rlm.` → `deps.` and the hoisted init statement removed.
 */

import { logger, config } from "@massa-ai/shared";
import { VectorDocument } from "@massa-ai/shared";
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import { randomUUID } from "node:crypto";
import { smartChunk } from "./smart-chunker.js";
import { buildExtensionGlob, loadProjectIgnore } from "./ignore-patterns.js";
import { getProjectIdentityAliasResolver } from "../../kernel/alias-resolver.js";
import { ManagedRunRepositoryPg } from "../../data/managed-runs/managed-run-repository-pg.js";
import type { ManagedRunLease } from "../../data/managed-runs/managed-run-contract.js";
import type { IndexManager } from "./index-manager.js";
import type { getKeywordSearch } from "../../data/keyword/keyword-search-factory.js";
import type { getVectorStore } from "../../data/vector/vector-store-factory.js";
import type { getSearchCache } from "./cache-factory.js";
import type { getSymbolRepository } from "../../data/symbol/symbol-repository-factory.js";

const globAsync = glob;

// ── Types (mirrors of the original inline signatures) ────────────────────────

export type IndexProjectOptions = {
  onProgress?: (current: number, total: number) => void;
};

export type IndexProjectResult = {
  filesIndexed: number;
  chunksIndexed: number;
  errors: number;
};

export type EnsureFreshIndexOptions = {
  allowFullReindex?: boolean;
  maxSyncFiles?: number;
};

export type EnsureFreshIndexResult = {
  wasStale: boolean;
  reindexed: boolean;
  reason?: string;
  deferred?: boolean;
  filesPending?: number;
};

export type SearchAdmissionResult = {
  admitted: boolean;
  error?: string;
  stale?: {
    reason: string;
    modifiedFiles?: number;
    newFiles?: number;
    deletedFiles?: number;
  };
};

// ── Deps ─────────────────────────────────────────────────────────────────────

/**
 * The narrow dependency record for this module (design.md §4.4) — exactly the
 * collaborators §2.1 shows these surfaces read, minus the three that the root
 * absorbed (`ensureInitialized` is hoisted; `initialized`, `injectedDeps` and
 * `analytics` were `ensureInitializedImpl`'s alone).
 *
 * The five stores are required and carry the root's own field types: their
 * originals were bare `rlm.<store>.<method>` reads off definite-assigned fields
 * with no fallback, so an absent store must keep throwing exactly where it did.
 * Contrast `SessionBiasDeps`, whose fields are optional because its originals
 * read `rlm.injectedDeps?.x ?? getFactory()`.
 *
 * **`indexFile` and `indexProject` are re-entrant seams, not stores, and they
 * are the part design.md §4.1's "injected collaborators" column omitted** —
 * the same class of omission as `ensureInitializedImpl`, and §2.1 lists both
 * members, so §4.4's rule already places them here. They are load-bearing:
 * `search-facade-indexing.test.ts` stubs `rlm.indexFile` at :377, :402, :537, :572, :609
 * and `rlm.indexProject` at :335 — **6 instance-method stub sites** — and every
 * one is exercised *through* `ensureFreshIndex` or `indexProjectInternal`. A
 * module-local call would make all six silently ineffective while the suite
 * stayed green, which is LATE-BIND's exact failure mode. So the root supplies
 * per-call arrow wrappers whose bodies re-read `this.<method>` at call time.
 *
 * `indexProject` is deliberately **not** the module function below. It is the
 * root's public locked path — `assertParserReadyForIndexing()` then
 * `runWithIndexLock(ContextualSearchRLM.indexingLocks, …)` — and that lock map
 * is class state the capability modules may not import. `ensureFreshIndex`'s
 * full-reindex branch needs the *locked* path, so calling an unlocked
 * module-local namesake would drop the mutex silently. Hence the module
 * function is `indexProjectInternal`, one name, one meaning, in one file.
 */
export interface IndexerDeps {
  /**
   * Narrowed to the four methods this module calls, and the narrowing is
   * load-bearing rather than tidy. `IndexManager` is declared **inside** the
   * G-HUB-gated directory, and the metric's annotation pattern is
   * `([A-Za-z0-9_]+)\s*:\s*<Type>\b` — which matches an *interface field
   * declaration*, not just a parameter. Typing this `indexManager: IndexManager`
   * therefore attributed all four `deps.indexManager.<method>` reads to
   * `IndexManager` and took its `maxForeignReach` from **0 to 4**, a second
   * G-HUB violation where the tree had exactly one, which would have made T14's
   * gate unclosable. Measured at T10, not predicted.
   *
   * `SessionBiasDeps` and `HybridSearchDeps` never hit this: their fields are
   * `Pick<…>` / `Awaited<ReturnType<…>>`, and their collaborators are declared
   * outside this directory. `IndexManager` is the first collaborator that is
   * both a bare nominal type and declared under `services/search/`.
   *
   * **The same trap is waiting at T12 (`fileFilterCache: FileFilterCache`,
   * `analytics: SearchAnalytics | SearchAnalyticsPg`) and T13
   * (`queryUnderstanding: QueryUnderstandingService`)** — all three types are
   * declared in this directory. Narrow those fields the same way.
   */
  indexManager: Pick<
    IndexManager,
    "getIndexMetadata" | "isIndexStale" | "getFilesToReindex" | "updateIndexMetadata"
  >;
  symbolRepo: Awaited<ReturnType<typeof getSymbolRepository>>;
  keywordSearch: Awaited<ReturnType<typeof getKeywordSearch>>;
  vectorStore: Awaited<ReturnType<typeof getVectorStore>>;
  searchCache: Awaited<ReturnType<typeof getSearchCache>>;
  /** The root's `indexFile` method, re-resolved through `this` on every call. */
  indexFile: (
    filePath: string,
    projectId: string,
    projectRoot: string,
    centralityMap?: Map<string, number>,
  ) => Promise<{ chunks: number }>;
  /** The root's `indexProject` method — the *locked* path, not the body below. */
  indexProject: (
    projectPath: string,
    projectId: string,
    options?: IndexProjectOptions,
  ) => Promise<IndexProjectResult>;
}

// ── Mutex ────────────────────────────────────────────────────────────────────

/**
 * Per-project queue mutex: serializes concurrent indexing for the same project.
 *
 * Pattern: each caller chains its lock after the current tail, then waits for
 * the previous lock before proceeding. This guarantees correct ordering for any
 * number of concurrent callers (3+), unlike a simple check-and-set.
 *
 *   A sets map[proj] = lock_A, awaits null  → starts immediately
 *   B sets map[proj] = lock_B, awaits lock_A → waits for A
 *   C sets map[proj] = lock_C, awaits lock_B → waits for B
 *   A finishes → releases lock_A → B starts
 *   B finishes → releases lock_B → C starts
 *   C finishes → map[proj] === lock_C, so we clean up the entry
 *
 * The `try { await work() } finally { delete-if-still-owner; releaseLock() }`
 * shape is load-bearing: `releaseLock()` MUST run even when `work` throws, or
 * the lock leaks and subsequent callers hang (BUG-SYN-4).
 *
 * `work` is `() => this._indexProjectInternal(...)` in the caller — a lambda
 * that captures virtual dispatch through `this`, so test monkey-patches on the
 * instance still route. Do NOT inline a direct call to a module function here.
 */
export async function runWithIndexLock<T>(
  lockMap: Map<string, Promise<void>>,
  projectId: string,
  work: () => Promise<T>,
): Promise<T> {
  const prevLock = lockMap.get(projectId);
  const isQueued = prevLock !== undefined;

  let releaseLock!: () => void;
  const myLock = new Promise<void>((resolve) => { releaseLock = resolve; });
  lockMap.set(projectId, myLock);

  if (isQueued) {
    logger.info("Waiting for existing indexing to complete", { projectId });
    await prevLock;
  }

  try {
    return await work();
  } finally {
    // Only remove the map entry if we are still the tail (no new waiter after us)
    if (lockMap.get(projectId) === myLock) {
      lockMap.delete(projectId);
    }
    releaseLock();
  }
}

// ── indexProjectInternal ─────────────────────────────────────────────────────

export async function indexProjectInternal(
  deps: IndexerDeps,
  projectPath: string,
  projectId: string,
  options: IndexProjectOptions = {},
): Promise<IndexProjectResult> {
  logger.info("Starting project indexing", { projectPath, projectId });

  const securityConfig = config.get("security");
  const allowedExtensions = securityConfig.allowedExtensions || [
    ".ts",
    ".js",
    ".tsx",
    ".jsx",
    ".dart",
    ".py",
  ];

  try {
    // Load .gitignore rules
    const ig = await loadGitignore(projectPath);

    // Find all relevant files
    const files = await globAsync(buildExtensionGlob(allowedExtensions), {
      cwd: projectPath,
      absolute: true,
      nodir: true,
      dot: false,
    });

    // Filter files using .gitignore rules
    const filteredFiles = files.filter((file) => {
      const relativePath = path.relative(projectPath, file);
      const shouldIgnore = ig.ignores(relativePath);

      if (shouldIgnore) {
        logger.debug("Ignoring file per .gitignore during indexing", {
          filePath: relativePath,
        });
      }

      return !shouldIgnore;
    });

    logger.info(
      `Found ${filteredFiles.length} files to index (${files.length - filteredFiles.length} ignored)`,
      {
        projectId,
      },
    );

    options.onProgress?.(0, filteredFiles.length);

    // Load centrality map once for the whole project so each chunk
    // carries its file's PageRank score in metadata.
    //
    // BUG-05: resolve the alias first. `indexFile` resolves the canonical
    // id at its own write seam, so chunks land under the canonical
    // project; querying centrality with the caller's retired id returns an
    // empty map and every chunk is written with `centralityScore: 0` — a
    // silent failure, because 0 is also the legitimate "no centrality" value.
    const centralityMap = await deps.symbolRepo.getCentrality(
      await getProjectIdentityAliasResolver().resolve(projectId),
    );

    let filesIndexed = 0;
    let chunksIndexed = 0;
    let errors = 0;

    // Process files in batches to avoid overloading
    const BATCH_SIZE = 20;
    let processedFiles = 0;
    for (let i = 0; i < filteredFiles.length; i += BATCH_SIZE) {
      const batch = filteredFiles.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (file) => {
          try {
            const result = await deps.indexFile(file, projectId, projectPath, centralityMap);
            filesIndexed++;
            chunksIndexed += result.chunks;
          } catch (error) {
            logger.error("Failed to index file", error as Error, { file });
            errors++;
          } finally {
            processedFiles++;
            options.onProgress?.(processedFiles, filteredFiles.length);
          }
        }),
      );

      // Log progress
      if (i % 50 === 0) {
        logger.info(
          `Progress: ${i}/${filteredFiles.length} files processed`,
          {
            projectId,
          },
        );
      }
    }

    // Update index metadata after successful indexing
    const indexedFilesList = filteredFiles.map((f) =>
      path.relative(projectPath, f),
    );
    await deps.indexManager.updateIndexMetadata(
      projectId,
      projectPath,
      indexedFilesList,
    );

    logger.info("Project indexing completed", {
      projectId,
      filesIndexed,
      chunksIndexed,
      errors,
    });

    return { filesIndexed, chunksIndexed, errors };
  } catch (error) {
    logger.error("Project indexing failed", error as Error, { projectId });
    throw error;
  }
}

// ── ensureFreshIndex ─────────────────────────────────────────────────────────

export async function ensureFreshIndex(
  deps: IndexerDeps,
  projectId: string,
  projectPath: string,
  options: EnsureFreshIndexOptions = {},
): Promise<EnsureFreshIndexResult> {
  const allowFullReindex = options.allowFullReindex ?? false;
  const maxSyncFiles =
    options.maxSyncFiles ?? config.get("search").autoReindexMaxFiles;

  const staleCheck = await deps.indexManager.isIndexStale(
    projectId,
    projectPath,
  );

  if (!staleCheck.isStale) {
    return { wasStale: false, reindexed: false };
  }

  logger.info("Index is stale, performing incremental reindex", {
    projectId,
    reason: staleCheck.reason,
    modifiedFiles: staleCheck.modifiedFiles?.length,
    newFiles: staleCheck.newFiles?.length,
    deletedFiles: staleCheck.deletedFiles?.length,
  });

  // Get files that need reindexing (pass staleCheck to avoid double filesystem scan)
  const filesToReindex = await deps.indexManager.getFilesToReindex(
    projectId,
    projectPath,
    staleCheck,
  );

  if (filesToReindex.length > maxSyncFiles) {
    logger.warn("Skipping sync reindex due to file limit", {
      projectId,
      reason: staleCheck.reason,
      filesToReindex: filesToReindex.length,
      maxSyncFiles,
    });

    return {
      wasStale: true,
      reindexed: false,
      deferred: true,
      reason: staleCheck.reason || "files_changed",
      filesPending: filesToReindex.length,
    };
  }

  if (filesToReindex.length === 0) {
    return {
      wasStale: true,
      reindexed: false,
      reason: "no_files_to_reindex",
    };
  }

  // For full reindex or many changes, clear and reindex
  const needsFullReindex =
    staleCheck.reason === "no_index" ||
    staleCheck.reason === "path_mismatch" ||
    filesToReindex.length > maxSyncFiles;

  if (needsFullReindex && !allowFullReindex) {
    logger.warn("Deferring full reindex in latency-sensitive path", {
      projectId,
      reason: staleCheck.reason,
      filesToReindex: filesToReindex.length,
    });

    return {
      wasStale: true,
      reindexed: false,
      deferred: true,
      reason: staleCheck.reason || "full_reindex_needed",
      filesPending: filesToReindex.length,
    };
  }

  if (needsFullReindex) {
    logger.info("Performing full reindex", { projectId });

    // ── Wave 5 FR-09: auto-reindex also goes through the managed_runs lease.
    // If a foreground indexer already holds the lease for this project, the
    // auto-reindex path defers (wasStale/reindexed=false/deferred=true) so
    // the foreground run completes unobstructed; the next stale check after
    // the foreground completes will observe a fresh index.
    const managedRunRepo = ManagedRunRepositoryPg.getInstance();
    const eventId = `reindex:${projectId}:${randomUUID()}`;
    const beginOutcome = await managedRunRepo.begin({
      projectId,
      runKind: "indexing",
      eventId,
    });
    if (beginOutcome.status === "busy") {
      logger.warn("Auto-reindex deferred: indexing lease busy", {
        projectId,
        activeRunId: beginOutcome.activeRunId,
      });
      return {
        wasStale: true,
        reindexed: false,
        deferred: true,
        reason: "indexing_lease_busy",
        filesPending: filesToReindex.length,
      };
    }
    let lease: ManagedRunLease = beginOutcome.lease;
    try {
      await deps.indexProject(projectPath, projectId);

      // Invalidate cache after reindex
      await deps.searchCache.invalidateProject(projectId);

      return {
        wasStale: true,
        reindexed: true,
        reason: "full_reindex",
      };
    } catch (err) {
      try { await managedRunRepo.abort(lease); lease = undefined as unknown as ManagedRunLease; }
      catch (abortErr) { logger.error("Auto-reindex lease abort failed", abortErr as Error, { projectId }); }
      throw err;
    } finally {
      if (lease) {
        try { await managedRunRepo.complete(lease); }
        catch (completeErr) { logger.error("Auto-reindex lease complete failed", completeErr as Error, { projectId }); }
      }
    }
  }

  // Incremental reindex
  logger.info("Performing incremental reindex", {
    projectId,
    fileCount: filesToReindex.length,
  });

  // Load centrality map so chunks carry PageRank scores. Alias-resolved for
  // the same reason as the full-index path above (BUG-05).
  const centralityMap = await deps.symbolRepo.getCentrality(
    await getProjectIdentityAliasResolver().resolve(projectId),
  );

  let filesIndexed = 0;
  let chunksIndexed = 0;
  let errors = 0;

  for (const relativeFilePath of filesToReindex) {
    try {
      const fullPath = path.join(projectPath, relativeFilePath);
      const result = await deps.indexFile(fullPath, projectId, projectPath, centralityMap);
      filesIndexed++;
      chunksIndexed += result.chunks;
    } catch (error) {
      logger.error("Failed to reindex file", error as Error, {
        file: relativeFilePath,
      });
      errors++;
    }
  }

  // Update metadata
  await deps.indexManager.updateIndexMetadata(
    projectId,
    projectPath,
    filesToReindex,
  );

  // Invalidate cache after incremental reindex
  await deps.searchCache.invalidateProject(projectId);

  logger.info("Incremental reindex completed", {
    projectId,
    filesIndexed,
    chunksIndexed,
    errors,
  });

  return {
    wasStale: true,
    reindexed: true,
    reason: "incremental_reindex",
  };
}

// ── checkSearchAdmission ─────────────────────────────────────────────────────

export async function checkSearchAdmission(
  deps: IndexerDeps,
  projectId: string,
  projectPath?: string,
): Promise<SearchAdmissionResult> {
  const metadata = await deps.indexManager.getIndexMetadata(projectId);
  if (!metadata) {
    return {
      admitted: false,
      error: `Project '${projectId}' is not indexed. Run index_project first, then retry.`,
    };
  }

  if (projectPath) {
    const staleCheck = await deps.indexManager.isIndexStale(
      projectId,
      projectPath,
    );
    if (staleCheck.isStale) {
      return {
        admitted: true,
        stale: {
          reason: staleCheck.reason ?? "unknown",
          modifiedFiles: staleCheck.modifiedFiles?.length,
          newFiles: staleCheck.newFiles?.length,
          deletedFiles: staleCheck.deletedFiles?.length,
        },
      };
    }
  }

  return { admitted: true };
}

// ── indexFile ────────────────────────────────────────────────────────────────

export async function indexFile(
  deps: IndexerDeps,
  filePath: string,
  projectId: string,
  projectRoot: string,
  centralityMap?: Map<string, number>,
): Promise<{ chunks: number }> {
  // Resolve canonical project id at the write-entry seam (spec req 3).
  projectId = await getProjectIdentityAliasResolver().resolve(projectId);
  const content = await fs.readFile(filePath, "utf-8");
  const relativePath = path.relative(projectRoot, filePath);

  // Check maximum file size
  const maxFileSize = config.get("security").maxFileSize || 1024 * 1024;
  if (content.length > maxFileSize) {
    logger.warn("File too large, skipping", {
      filePath,
      size: content.length,
    });
    return { chunks: 0 };
  }

  // Smart chunking: language/format-aware splitting
  const chunks = smartChunk(content, relativePath);

  // Look up the file's PageRank centrality score (0 if unavailable)
  const centralityScore = centralityMap?.get(relativePath) ?? 0;

  const documents: VectorDocument[] = chunks.map((chunk, i) => ({
    id: `${projectId}:${relativePath}:${i}`,
    content: chunk.content,
    metadata: {
      projectId,
      filePath: relativePath,
      chunkIndex: i,
      totalChunks: chunks.length,
      type: chunk.type,
      language: path.extname(filePath).slice(1),
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      label: chunk.label,
      centralityScore,
      ...(chunk.fileImports && { fileImports: chunk.fileImports }),
      ...(chunk.parentSymbol && { parentSymbol: chunk.parentSymbol }),
    },
  }));

  // Run vector and keyword indexing in parallel (I/O optimization)
  // Since embeddings are generated during addDocuments(), we can run
  // FTS5 keyword indexing concurrently to save ~30% total time
  await Promise.all([
    // Vector store: sub-batched embedding + insert
    deps.vectorStore.addDocuments(documents),

    // Keyword search: parallel FTS5 inserts
    Promise.all(
      documents.map((doc) =>
        deps.keywordSearch.index(doc.id, doc.content, doc.metadata),
      ),
    ),
  ]);

  return { chunks: chunks.length };
}

// ── loadGitignore ────────────────────────────────────────────────────────────

export function loadGitignore(projectPath: string) {
  return loadProjectIgnore(projectPath);
}
