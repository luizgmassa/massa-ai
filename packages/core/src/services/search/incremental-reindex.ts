import path from "path";
import { logger } from "@massa-ai/shared";
import { getProjectIdentityAliasResolver } from "../../kernel/alias-resolver.js";
import { withHeavyWorkLease } from "../jobs/heavy-work-lease.js";
import type { IndexerDeps } from "./project-indexer.js";

export type IncrementalReindexDeps = Pick<IndexerDeps, "symbolRepo" | "indexFile" | "indexManager" | "searchCache">;

export function runIncrementalReindex(
  deps: IncrementalReindexDeps,
  projectId: string,
  projectPath: string,
  filesToReindex: string[],
): Promise<{ filesIndexed: number; chunksIndexed: number; errors: number }> {
  return withHeavyWorkLease("reindex", `incremental-reindex:${projectId}`, async () => {
    // Load centrality map so chunks carry PageRank scores. Alias-resolved for
    // the same reason as the full-index path in project-indexer.ts (BUG-05).
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

    return { filesIndexed, chunksIndexed, errors };
  });
}
