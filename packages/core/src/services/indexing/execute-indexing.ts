/**
 * @massa-ai/core - Background indexing execution
 *
 * Module 8 of the `tools/index_project.ts` extraction (PR-D, T13). Owns the
 * background half of `index_project`: the 4-stage ETL run, the optional search
 * cache warmup, and the job-tracker transitions on both the success and the
 * failure path. `IndexProjectTool.handle()` keeps only the synchronous half —
 * validation, job creation, the managed-run lease, and the immediate response.
 *
 * THE BODY IS MOVED VERBATIM apart from one line. `:306` used to read
 * `this.contextualSearch.warmupCache(...)`; it now calls the injected
 * `warmupCache` parameter. Every other statement, log key and argument order is
 * byte-for-byte what shipped, because this extraction is behavior-preserving by
 * contract (RFS-02 AC-1) and the only sensor that could catch a silent change
 * here is the suite written alongside it.
 *
 * IT NEVER NAMES ContextualSearchRLM, and that is `tasks.md` §4.2's decision
 * rather than a preference. The extracted span held exactly ONE `this.`
 * reference — `this.contextualSearch.warmupCache` — so a free function could not
 * compile as scoped. The rejected option was letting this module construct its
 * own `new ContextualSearchRLM()`, and it was rejected for a subtler reason than
 * the obvious one: `searchCache`, `vectorStore`, `keywordSearch`, `analytics`
 * and `symbolRepo` all resolve through factories, so a second instance would
 * share them and the warmup would land in the same place. Only `fileFilterCache`
 * and `queryUnderstanding` are per-instance, and nothing in the tree reads
 * either. The two readings are indistinguishable by static reading; the
 * parameter costs one argument and preserves identity by construction, so PR-D
 * does not have to find out.
 *
 * THE REQUEST IS AN OPTIONS OBJECT, on two precedents rather than taste. The
 * method took 8 positional parameters, three of them optional, and a REQUIRED
 * callback cannot follow an optional parameter in TypeScript — so threading
 * `warmupCache` positionally would have forced the existing parameters to be
 * reordered, which is a larger change to the call site than the object is.
 * `assertProjectRootReuse` in the very file this module leaves already takes
 * `options: { ... }`, and sibling module 6 takes `calculateRange(params:
 * LineRangeRequest)`.
 *
 * THE CATCH SWALLOWS, AND THAT IS THE PIN THAT MATTERS. On a thrown ETL this
 * function records the failure through `indexJobTracker.setResult(..., errors: 1,
 * message)` and returns normally — it never rejects. `handle()` attaches a
 * `.catch()` to the call precisely because that outer handler is meant to fire
 * only if the tracker itself throws before the inner `try`. No pre-existing
 * suite asserted any of this: the three tests that drive the background path
 * call `handle()`, sleep 300 ms, and assert only the handler's SYNCHRONOUS
 * return value, so every behaviour in this file was unpinned before its suite
 * was written.
 */
import { logger } from "@massa-ai/shared";
import { indexJobTracker } from "../jobs/index-job-tracker.js";
import { EtlPipeline } from "../etl/pipeline.js";
import type { ManagedRunLease } from "../../data/managed-runs/managed-run-contract.js";

/**
 * The warmup surface, injected rather than imported (§4.2). Matches
 * `ContextualSearchRLM.warmupCache`'s shipped signature exactly so the caller
 * can pass the bound method with no adapter.
 */
export type WarmupCache = (
  projectId: string,
  projectPath: string,
  customQueries?: string[],
) => Promise<{ queriesWarmed: number; errors: number }>;

export interface ExecuteIndexingRequest {
  jobId: string;
  projectId: string;
  projectPath: string;
  forceReindex: boolean;
  warmCache: boolean;
  warmupQueries?: string[];
  include_tests?: boolean;
  managedRunLease?: ManagedRunLease;
  /** Bound by the caller from the instance it already holds (§4.2). */
  warmupCache: WarmupCache;
}

/**
 * Executa indexação em background usando o ETL Pipeline de 4 estágios.
 *
 * O pipeline substitui o monobloco contextualSearch.indexProject() anterior:
 *   discover → parse → resolve → load
 *
 * Mantém compatibilidade: warmCache continua funcionando via o callback
 * `warmupCache` que o handler injeta.
 */
export async function executeIndexing(
  request: ExecuteIndexingRequest,
): Promise<void> {
  const {
    jobId,
    projectId,
    projectPath,
    forceReindex,
    warmCache,
    warmupQueries,
    include_tests = false,
    managedRunLease,
    warmupCache,
  } = request;

  const startTime = Date.now();

  try {
    indexJobTracker.updateStatus(jobId, "running");

    logger.info("Starting project indexing via ETL Pipeline", {
      jobId,
      projectPath,
      projectId,
      forceReindex,
      warmCache,
      include_tests,
    });

    // ETL Pipeline: discover → parse → resolve → load
    // EventBus integration handles progress updates and WorkspaceManager status
    const etlResult = await EtlPipeline.getInstance().run({
      projectId,
      projectPath,
      jobId,
      forceReindex,
      include_tests,
      managedRunLease,
    });

    const duration = Date.now() - startTime;

    logger.info("ETL Pipeline completed", {
      jobId,
      projectId,
      duration,
      filesIndexed: etlResult.filesIndexed,
      filesSkipped: etlResult.filesSkipped,
      chunksIndexed: etlResult.chunksIndexed,
      symbolsIndexed: etlResult.symbolsIndexed,
      errors: etlResult.errors,
      stageTimings: etlResult.stageTimings,
    });

    // Warmup semantic search cache if requested (unchanged from before)
    if (warmCache) {
      logger.info("Starting cache warmup", { jobId, projectId });
      const warmupStats = await warmupCache(
        projectId,
        projectPath,
        warmupQueries
      );
      logger.info("Cache warmup completed", { jobId, projectId, ...warmupStats });
    }

    // Mark job complete. Emit 100% progress immediately before the terminal
    // transition so any poller that reads progress atomically with status sees
    // a consistent completed+100% shape (the pipeline also emits this; this is
    // belt-and-suspenders in case the pipeline path changes).
    indexJobTracker.updateProgress(
      jobId,
      etlResult.filesIndexed,
      etlResult.filesIndexed,
    );
    await indexJobTracker.setResultAndFlush(jobId, {
      filesIndexed: etlResult.filesIndexed,
      chunksIndexed: etlResult.chunksIndexed,
      errors: etlResult.errors,
      duration,
      activatedGraphGenerationId: etlResult.activatedGraphGenerationId,
      parserDiagnostics: etlResult.parserDiagnostics,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error("Project indexing failed", error as Error, {
      jobId,
      projectPath,
      projectId,
      duration,
    });

    indexJobTracker.setResult(
      jobId,
      {
        filesIndexed: 0,
        chunksIndexed: 0,
        errors: 1,
        duration,
      },
      (error as Error).message
    );
  }
}
