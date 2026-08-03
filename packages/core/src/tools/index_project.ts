/**
 * Index Project Tool
 *
 * Indexes an entire project for optimized contextual search (ASYNC).
 * Creates embeddings and FTS5 indexes for all relevant files.
 *
 * Returns a jobId immediately and processes indexing in background.
 * Use get_index_status(jobId) to check progress.
 *
 * Now powered by the 4-stage ETL Pipeline:
 *   discover → parse → resolve → load
 */

import { IToolHandler } from "@massa-ai/shared";
import { ToolResponse } from "@massa-ai/shared";
import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";
import { logger } from "@massa-ai/shared";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";
import { executeIndexing } from "../services/indexing/execute-indexing.js";
import { acquireIndexingLease } from "../services/indexing/acquire-indexing-lease.js";
import { workspaceManager } from "../services/workspace/workspace-manager.js";
import { realpath } from "node:fs/promises";
import path from "path";
import { assertParserReadyForIndexing } from "../services/structural/parser-readiness.js";

interface IndexProjectParams {
  projectPath: string;
  projectId?: string;
  forceReindex?: boolean;
  warmCache?: boolean;
  warmupQueries?: string[];
  /** Include test/benchmark files so typed edges from `.test.ts` etc. are indexed. */
  include_tests?: boolean;
}

type CanonicalizePath = (projectPath: string) => Promise<string>;

export async function canonicalizeProjectRoot(
  projectPath: string,
  canonicalize: CanonicalizePath = realpath,
): Promise<string> {
  return canonicalize(path.resolve(projectPath));
}

export async function assertProjectRootReuse(options: {
  projectId: string;
  canonicalProjectPath: string;
  storedProjectPath?: string | null;
  forceReindex: boolean;
  canonicalize?: CanonicalizePath;
}): Promise<void> {
  if (!options.storedProjectPath || options.forceReindex) return;
  const canonicalize = options.canonicalize ?? realpath;
  let storedCanonical: string;
  try {
    storedCanonical = await canonicalize(path.resolve(options.storedProjectPath));
  } catch {
    storedCanonical = path.resolve(options.storedProjectPath);
  }
  if (storedCanonical !== options.canonicalProjectPath) {
    throw new Error(
      `Project ID "${options.projectId}" already indexes canonical root ` +
        `"${storedCanonical}", not "${options.canonicalProjectPath}"; ` +
        "use forceReindex only after verifying ownership of the existing project",
    );
  }
}

export class IndexProjectTool implements IToolHandler {
  name = "index_project";
  description =
    "Index a project directory for contextual code search with semantic embeddings";
  inputSchema = {
    type: "object",
    properties: {
      projectPath: {
        type: "string",
        description: "Absolute path to the project directory to index",
      },
      projectId: {
        type: "string",
        description:
          "Unique identifier for the project (defaults to directory name)",
      },
      forceReindex: {
        type: "boolean",
        description: "Force reindex even if project already exists",
        default: false,
      },
      warmCache: {
        type: "boolean",
        description: "Pre-cache common queries after indexing for faster initial searches",
        default: false,
      },
      warmupQueries: {
        type: "array",
        items: { type: "string" },
        description: "Custom queries to pre-cache (uses defaults if not provided)",
      },
      include_tests: {
        type: "boolean",
        description:
          "Index test/benchmark files too so typed edges from .test.ts files are captured (default false)",
        default: false,
      },
    },
    required: ["projectPath"],
  };

  private contextualSearch: ContextualSearchRLM;

  constructor() {
    this.contextualSearch = new ContextualSearchRLM();
  }

  async handle(params: unknown): Promise<ToolResponse> {
    const {
      projectPath,
      projectId,
      forceReindex = false,
      warmCache = false,
      warmupQueries,
      include_tests = false,
    } = params as IndexProjectParams;

    try {
      // Do not create or return an accepted job while native parsing is down.
      await assertParserReadyForIndexing();
      const canonicalProjectPath = await canonicalizeProjectRoot(projectPath);
      // Gera projectId se não fornecido
      const finalProjectId =
        projectId || path.basename(canonicalProjectPath) || "default";
      const existing = await workspaceManager.getWorkspace(finalProjectId);
      await assertProjectRootReuse({
        projectId: finalProjectId,
        canonicalProjectPath,
        storedProjectPath: existing?.project_path,
        forceReindex,
      });

      // Cria job de indexação
      const job = indexJobTracker.createJob(finalProjectId, canonicalProjectPath);

      logger.info("Indexing job created", {
        jobId: job.jobId,
        projectPath: canonicalProjectPath,
        projectId: finalProjectId,
      });

      // ── Wave 5 FR-09: the lease is acquired synchronously so the caller gets
      // 202 (acquired) or 409 (busy) before the background ETL starts. Only the
      // ToolResponse shaping stays here — a `services/` module that shapes a
      // ToolResponse is the boundary RFS-03 AC-2 forbids (PR-D T14b).
      const leaseOutcome = await acquireIndexingLease({
        jobId: job.jobId,
        projectId: finalProjectId,
      });
      if (leaseOutcome.status === "busy") {
        return {
          success: false,
          error: `indexing_busy:${leaseOutcome.activeRunId}`,
          data: {
            jobId: job.jobId,
            projectId: finalProjectId,
            status: "busy",
            activeRunId: leaseOutcome.activeRunId,
            leaseExpiresAt: leaseOutcome.leaseExpiresAt,
            message: "Another indexing run is active for this project. Poll get_index_status(activeRunId).",
          },
        };
      }
      if (leaseOutcome.status === "failed") {
        return {
          success: false,
          error: `Failed to acquire indexing lease: ${leaseOutcome.message}`,
        };
      }
      const lease = leaseOutcome.lease;

      // Executa indexação em background (não await)
      executeIndexing({
        jobId: job.jobId,
        projectId: finalProjectId,
        projectPath: canonicalProjectPath,
        forceReindex,
        warmCache,
        warmupQueries,
        include_tests,
        managedRunLease: lease,
        warmupCache: this.contextualSearch.warmupCache.bind(this.contextualSearch),
      }).catch((error) => {
        logger.error("Background indexing failed", error as Error, {
          jobId: job.jobId,
        });
      });

      // Return immediately with jobId
      return {
        success: true,
        data: {
          jobId: job.jobId,
          projectId: finalProjectId,
          projectPath: canonicalProjectPath,
          status: "started",
          runId: lease.runId,
          message:
            "Indexing started in background. Use get_index_status(jobId) to check progress.",
        },
      };
    } catch (error) {
      logger.error("Failed to start indexing job", error as Error, {
        projectPath,
        projectId,
      });

      return {
        success: false,
        error: `Failed to start indexing: ${(error as Error).message}`,
      };
    }
  }
}
