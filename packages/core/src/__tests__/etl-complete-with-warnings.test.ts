/**
 * ETL complete-with-warnings semantics (Track 2).
 *
 * Per-file load errors no longer fail the run: the pipeline logs a warning,
 * proceeds to activation, marks the job completed, and surfaces the error
 * count + capped per-file detail through the job result and the
 * `indexing:completed` event. Activation incompleteness (the
 * graph_generation_incomplete gate for hard parse failures) is a separate,
 * still-fatal check — the decoupling test proves one does not imply the other.
 *
 * Scaffolding mirrors etl-pipeline-lease.test.ts (stubbed stages, stubbed
 * graph coordinator, no managedRunLease).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

// The success path writes the search-admission marker through
// `getVectorStore()`, which cold-runs live embedding-provider auto-selection
// (the documented 5001 ms trap). Mock the factory seam — the marker write only
// needs an addDocuments-shaped store.
mock.module("../services/vector/vector-store-factory.js", () => ({
  getVectorStore: async () => ({
    addDocuments: async () => {},
    deleteDocuments: async () => {},
    search: async () => [],
    getDocument: async () => null,
  }),
  resetVectorStore: async () => {},
}));

import { EtlPipeline } from "../services/etl/pipeline.js";
import { buildGraphInputSnapshotHash } from "../services/etl/graph-generation-coordinator.js";
import { getSymbolRepository } from "../data/symbol/symbol-repository-factory.js";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";
import { eventBus } from "../services/events/event-bus.js";
import { resetParserReadinessForTests } from "../services/structural/parser-readiness.js";
import { LANGUAGE_MANIFEST } from "../services/structural/language-manifest.js";
import { grammarArtifactKey } from "../services/structural/grammar-loaders.js";
import {
  ProjectIdentityAliasResolver,
  setProjectIdentityAliasResolverForTests,
} from "../kernel/alias-resolver.js";

const DB_AVAILABLE = /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");
const projectId = () => `etl-warnings-${randomUUID()}`;

function stubGrammarSet(): { Parser: any; grammars: Map<string, unknown> } {
  const grammars = new Map<string, unknown>();
  for (const entry of LANGUAGE_MANIFEST) {
    grammars.set(grammarArtifactKey(entry.grammarArtifact), { lang: entry.extension });
  }
  class StubParser {
    setLanguage() {}
    parse(source: string) {
      return {
        rootNode: { hasError: false, endIndex: Buffer.byteLength(source, "utf8"), type: "program" },
        delete() {},
      };
    }
  }
  return { Parser: StubParser as any, grammars };
}

describe.skipIf(!DB_AVAILABLE)("EtlPipeline complete-with-warnings (Track 2)", () => {
  let pipeline: EtlPipeline;
  let originalGraphGenerations: any;
  let originalDiscoverRun: any;
  let originalParseRun: any;
  let originalResolveRun: any;
  let originalLoadRun: any;
  let originalGetActiveGraphSnapshot: any;
  let symbolRepo: any;
  let currentProjectId: string;
  let activateCalls: number;

  beforeEach(() => {
    pipeline = EtlPipeline.getInstance() as any;
    originalGraphGenerations = (pipeline as any).graphGenerations;
    originalDiscoverRun = pipeline.discover.run;
    originalParseRun = pipeline.parse.run;
    originalResolveRun = pipeline.resolve.run;
    originalLoadRun = pipeline.load.run;
    symbolRepo = getSymbolRepository();
    originalGetActiveGraphSnapshot = symbolRepo.getActiveGraphSnapshot;
    (EtlPipeline as any).runTails = new Map();
    resetParserReadinessForTests(async () => stubGrammarSet());
    setProjectIdentityAliasResolverForTests(
      new ProjectIdentityAliasResolver({ querier: { async lookupCanonical() { return null; } } }),
    );
    activateCalls = 0;
    const fakeLease = {
      generationId: "g1",
      projectId: "stub",
      expectedActiveGenerationId: null,
      leaseToken: "t1",
      leaseExpiresAt: Date.now() + 60_000,
      fingerprint: "f",
      inputSnapshotHash: buildGraphInputSnapshotHash([]),
      expectedFilesCount: 0,
    };
    (pipeline as any).graphGenerations = {
      begin: async () => fakeLease,
      heartbeat: async () => {},
      activate: async () => {
        activateCalls++;
        return { status: "activated", generationId: "g1", activeGenerationId: "g1" };
      },
      abort: async () => {},
      cleanup: async () => {},
    };
    let snapshotCall = 0;
    symbolRepo.getActiveGraphSnapshot = async () => {
      snapshotCall++;
      return snapshotCall === 1
        ? null
        : {
            generationId: "g1",
            languages: {},
            diagnostics: { errors: 0, recovered: 0, hardFailures: 0, staleFiles: 0 },
          };
    };
    (pipeline as any).discover.run = async () => [];
    (pipeline as any).parse.run = async () => [];
    (pipeline as any).resolve.run = async () => [];
    currentProjectId = projectId();
  });

  afterEach(() => {
    (pipeline as any).graphGenerations = originalGraphGenerations;
    (pipeline as any).discover.run = originalDiscoverRun;
    (pipeline as any).parse.run = originalParseRun;
    (pipeline as any).resolve.run = originalResolveRun;
    (pipeline as any).load.run = originalLoadRun;
    symbolRepo.getActiveGraphSnapshot = originalGetActiveGraphSnapshot;
    (EtlPipeline as any).runTails = new Map();
    resetParserReadinessForTests();
    setProjectIdentityAliasResolverForTests(null);
  });

  test("load errors complete the run with warnings: activation runs, job completes, errors surfaced", async () => {
    const fileErrors = [
      { filePath: "src/broken-a.ts", error: "load boom a" },
      { filePath: "src/broken-b.ts", error: "load boom b" },
    ];
    (pipeline as any).load.run = async () => ({
      filesLoaded: 3,
      chunksLoaded: 3,
      symbolsLoaded: 0,
      errors: 2,
      fileErrors,
    });

    const completedEvents: Array<{ jobId: string; errors: number }> = [];
    const unsubscribe = eventBus.subscribe("indexing:completed", (event) =>
      completedEvents.push({ jobId: event.jobId, errors: event.errors }),
    );
    try {
      const job = indexJobTracker.createJob(currentProjectId, "/tmp");
      // Production (IndexProjectTool) marks the job running before the run;
      // without it the tracker's own pending→completed publish would fire a
      // second `indexing:completed` beside the pipeline's.
      indexJobTracker.updateStatus(job.jobId, "running");
      const result = await pipeline.run({
        projectId: currentProjectId,
        projectPath: "/tmp",
        jobId: job.jobId,
      });

      expect(result.errors).toBe(2);
      expect(activateCalls).toBe(1);
      const tracked = indexJobTracker.getJob(job.jobId);
      expect(tracked?.status).toBe("completed");
      expect(tracked?.error).toBeUndefined();
      expect(tracked?.result?.errors).toBe(2);
      expect(tracked?.result?.fileErrors).toEqual(fileErrors);
      expect(completedEvents).toEqual([{ jobId: job.jobId, errors: 2 }]);
    } finally {
      unsubscribe();
    }
  });

  test("decoupling: a clean load with a failing activation gate still fails the run", async () => {
    (pipeline as any).load.run = async () => ({
      filesLoaded: 1,
      chunksLoaded: 1,
      symbolsLoaded: 0,
      errors: 0,
      fileErrors: [],
    });
    (pipeline as any).graphGenerations.activate = async () => {
      throw new Error("graph_generation_incomplete:hard_failures");
    };

    const completed: string[] = [];
    const unsubscribe = eventBus.subscribe("indexing:completed", (event) => completed.push(event.jobId));
    try {
      const job = indexJobTracker.createJob(currentProjectId, "/tmp");
      await expect(
        pipeline.run({ projectId: currentProjectId, projectPath: "/tmp", jobId: job.jobId }),
      ).rejects.toThrow("graph_generation_incomplete:hard_failures");
      expect(completed).not.toContain(job.jobId);
    } finally {
      unsubscribe();
    }
  });
});
