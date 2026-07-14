/**
 * ETL Pipeline Orchestrator
 *
 * Runs the 4 stages in sequence: discover → parse → resolve → load
 *
 * Integrates with:
 * - IndexJobTracker (in-memory job status polling)
 * - EventBus (real-time SSE broadcast)
 * - SymbolRepository (centrality-based priority ordering in discover)
 * - ContextualSearchRLM (vector clear on forceReindex)
 *
 * Usage:
 *   const pipeline = EtlPipeline.getInstance();
 *   const result = await pipeline.run({ projectId, projectPath, jobId });
 */

import { logger } from "@massa-th0th/shared";
import { DiscoverStage } from "./stages/discover.js";
import { ParseStage } from "./stages/parse.js";
import { ResolveStage } from "./stages/resolve.js";
import { LoadStage } from "./stages/load.js";
import { eventBus } from "../events/event-bus.js";
import { getSymbolRepository } from "../../data/symbol/symbol-repository-factory.js";
import { indexJobTracker } from "../jobs/index-job-tracker.js";
import { getSearchCache } from "../search/cache-factory.js";
import { getVectorStore } from "../../data/vector/vector-store-factory.js";
import { getKeywordSearch } from "../../data/keyword/keyword-search-factory.js";
import type { EtlStageContext, EtlEvent, EtlResult, EtlStage } from "./stage-context.js";
import { assertParserReadyForIndexing } from "../structural/parser-readiness.js";

export interface PipelineInput {
  projectId: string;
  projectPath: string;
  jobId: string;
  forceReindex?: boolean;
  /** If provided, only process these relative paths (incremental mode). */
  filesToProcess?: string[];
  /**
   * When true, the Discover stage does NOT exclude test/benchmark files
   * (`.test.ts`, `__tests__/`, `*.spec.*`, etc.), so typed edges from test
   * files are indexed. Default false (preserve search-recall hygiene —
   * {@link loadProjectIgnore} stays unchanged for query-time callers).
   */
  include_tests?: boolean;
}

export class EtlPipeline {
  private static instance: EtlPipeline | null = null;
  private static runTails = new Map<string, Promise<void>>();

  private readonly discover = new DiscoverStage();
  private readonly parse = new ParseStage();
  private readonly resolve = new ResolveStage();
  private readonly load = new LoadStage();

  private constructor() {}

  static getInstance(): EtlPipeline {
    if (!EtlPipeline.instance) {
      EtlPipeline.instance = new EtlPipeline();
    }
    return EtlPipeline.instance;
  }

  async run(input: PipelineInput): Promise<EtlResult> {
    // Reject before queue or destructive force-reindex mutations are created.
    await assertParserReadyForIndexing();
    const previous = EtlPipeline.runTails.get(input.projectId);
    let release!: () => void;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    EtlPipeline.runTails.set(input.projectId, tail);

    if (previous) {
      logger.info("EtlPipeline: waiting for prior project run", {
        projectId: input.projectId,
        jobId: input.jobId,
      });
      await previous;
    }

    try {
      return await this.runInternal(input);
    } finally {
      if (EtlPipeline.runTails.get(input.projectId) === tail) {
        EtlPipeline.runTails.delete(input.projectId);
      }
      release();
    }
  }

  private async runInternal(input: PipelineInput): Promise<EtlResult> {
    const { projectId, projectPath, jobId, forceReindex = false, filesToProcess, include_tests = false } = input;
    const t0 = performance.now();
    const stageTimings: Record<EtlStage, number> = {
      discover: 0,
      parse: 0,
      resolve: 0,
      load: 0,
    };

    // If force, wipe every search representation for this project. Clearing
    // only symbols leaves stale vector/keyword chunks when files shrink or
    // disappear between full reindexes.
    if (forceReindex) {
      const vectorStore = await getVectorStore();
      const keywordSearch = getKeywordSearch();
      const [vectorDeleted, keywordDeleted] = await Promise.all([
        vectorStore.deleteByProject(projectId),
        keywordSearch.deleteByProject(projectId),
        getSymbolRepository().clearProject(projectId),
      ]);
      logger.info("EtlPipeline: cleared project data for full reindex", {
        projectId,
        vectorDeleted,
        keywordDeleted,
      });
    }

    // Build stage context with event emission
    const ctx: EtlStageContext = {
      projectId,
      projectPath,
      jobId,
      emit: (event: EtlEvent) => {
        // Forward ETL events to the global EventBus for SSE + job tracker
        if (event.type === "progress") {
          const p = event.payload as { current: number; total: number; percentage: number };
          indexJobTracker.updateProgress(jobId, p.current, p.total);
          eventBus.publish("indexing:progress", {
            jobId,
            projectId,
            stage: event.stage,
            current: p.current,
            total: p.total,
            percentage: p.percentage,
          });
        } else if (event.type === "file_error") {
          const p = event.payload as { filePath: string; error: string };
          eventBus.publish("indexing:file", {
            jobId,
            projectId,
            filePath: p.filePath,
            stage: event.stage,
            status: "error",
            error: p.error,
          });
        } else if (event.type === "file_processed") {
          const p = event.payload as { filePath: string };
          eventBus.publish("indexing:file", {
            jobId,
            projectId,
            filePath: p.filePath,
            stage: event.stage,
            status: "ok",
          });
        }
      },
    };

    eventBus.publish("indexing:started", { jobId, projectId, projectPath });

    try {
      // ── Stage 1: Discover ─────────────────────────────────────────────────
      const st1 = performance.now();
      const discovered = await this.discover.run(ctx, { forceReindex, filesToProcess, includeTests: include_tests });
      stageTimings.discover = Math.round(performance.now() - st1);

      eventBus.publish("indexing:started", {
        jobId,
        projectId,
        projectPath,
        totalFiles: discovered.filter((f) => f.needsReparse).length,
      });

      // ── Stage 2: Parse ────────────────────────────────────────────────────
      const st2 = performance.now();
      const parsed = await this.parse.run(ctx, discovered);
      stageTimings.parse = Math.round(performance.now() - st2);

      // ── Stage 3: Resolve ──────────────────────────────────────────────────
      const st3 = performance.now();
      const resolved = await this.resolve.run(ctx, parsed);
      stageTimings.resolve = Math.round(performance.now() - st3);

      // ── Stage 4: Load ─────────────────────────────────────────────────────
      const st4 = performance.now();
      const loadResult = await this.load.run(ctx, resolved);
      stageTimings.load = Math.round(performance.now() - st4);

      const durationMs = Math.round(performance.now() - t0);

      const result: EtlResult = {
        filesDiscovered: discovered.length,
        filesIndexed: loadResult.filesLoaded,
        filesSkipped: discovered.filter((f) => !f.needsReparse).length,
        chunksIndexed: loadResult.chunksLoaded,
        symbolsIndexed: loadResult.symbolsLoaded,
        errors: loadResult.errors,
        durationMs,
        stageTimings,
      };

      if (result.errors > 0) {
        throw new Error(
          `ETL completed with ${result.errors} file error${result.errors === 1 ? "" : "s"}`,
        );
      }

      // Index mutations invalidate every cached result for this project,
      // including cached misses created while the index was still cold. Do
      // this before publishing completion / marking the job terminal so a
      // status poller can safely query the newly materialized data as soon as
      // it observes `completed`.
      await getSearchCache().invalidateProject(projectId);

      eventBus.publish("indexing:completed", {
        jobId,
        projectId,
        filesIndexed: result.filesIndexed,
        chunksIndexed: result.chunksIndexed,
        symbolsIndexed: result.symbolsIndexed,
        durationMs,
      });

      // Belt-and-suspenders terminal signal: mark the job completed the moment
      // the pipeline resolves, independent of the caller's warmup path (which
      // may OOM or hang before reaching its own setResult). Idempotent —
      // setResult overwrites status/result. updateProgress first so percentage
      // is recorded at 100 before the terminal transition.
      indexJobTracker.updateProgress(jobId, result.filesIndexed, result.filesIndexed);
      indexJobTracker.setResult(jobId, {
        filesIndexed: result.filesIndexed,
        chunksIndexed: result.chunksIndexed,
        errors: result.errors,
        duration: durationMs,
      });

      logger.info("EtlPipeline: run completed", { projectId, jobId, ...result });
      return result;
    } catch (err) {
      const durationMs = Math.round(performance.now() - t0);
      const error = (err as Error).message;

      eventBus.publish("indexing:failed", { jobId, projectId, error, durationMs });

      // Belt-and-suspenders terminal signal on failure: mark the job failed so
      // a poller sees a terminal state rather than a stuck "running". Idempotent
      // — the caller may also call setResult with the error; last write wins.
      indexJobTracker.setResult(
        jobId,
        { filesIndexed: 0, chunksIndexed: 0, errors: 1, duration: durationMs },
        error,
      );

      logger.error("EtlPipeline: run failed", err as Error, { projectId, jobId, durationMs });
      throw err;
    }
  }
}

export const etlPipeline = EtlPipeline.getInstance();
