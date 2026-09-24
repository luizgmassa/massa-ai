/**
 * LIP-15 write gate — call-site sensor for the *documented* recovery.
 *
 * embedding-fingerprint.test.ts already proves the gate logic
 * (checkSearchAdmission / ensureFreshIndex) at the unit level, by calling
 * those functions directly with mocked collaborators. That is a method test,
 * not a call-site test: it cannot see whether the recovery
 * EmbeddingIndexStaleError's own message instructs — "Run index_project with
 * forceReindex: true" — actually clears the mismatch in production.
 *
 * `index_project` (tools/index_project.ts → execute-indexing.ts) runs
 * `EtlPipeline.run({forceReindex: true, ...})`. That is a *different* full-
 * reindex mechanism from project-indexer.ts's `ensureFreshIndex` — the two
 * never call each other (measured: `ensureFreshIndex`'s `deps.indexProject`
 * is bound to `ContextualSearchRLM.indexProject` → `indexProjectInternal`,
 * which globs and re-embeds files itself and never imports `EtlPipeline`).
 * So a stamp written only from `ensureFreshIndex`'s clearing branch is dead
 * for the one recovery path production code actually offers.
 *
 * PG-backed; the four ETL stages are stubbed (as in etl-idempotent.test.ts)
 * so this file's only variable is the fingerprint stamp, not parse/resolve/
 * load correctness — that is covered elsewhere.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { EtlPipeline } from "../services/etl/pipeline.js";
import { buildGraphInputSnapshotHash } from "../services/etl/graph-generation-coordinator.js";
import { getSymbolRepository } from "../data/symbol/symbol-repository-factory.js";
import {
  getEmbeddingFingerprint,
  stampEmbeddingFingerprint,
} from "../data/symbol/symbol-repo-workspace.js";
import { currentEmbeddingFingerprint, checkSearchAdmission } from "../services/search/project-indexer.js";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";
import { resetParserReadinessForTests } from "../services/structural/parser-readiness.js";
import { LANGUAGE_MANIFEST } from "../services/structural/language-manifest.js";
import { grammarArtifactKey } from "../services/structural/grammar-loaders.js";

const DB_AVAILABLE = /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");

// Copied from etl-idempotent.test.ts's stubGrammarSet(): a stub Parser plus
// one grammar entry per LANGUAGE_MANIFEST item, which is what
// assertParserReadyForIndexing (pipeline.run's first statement) requires.
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

describe.skipIf(!DB_AVAILABLE)("EtlPipeline forceReindex — LIP-15 call-site recovery (T09 correction)", () => {
  let pipeline: EtlPipeline;
  let originalGraphGenerations: any;
  let originalDiscoverRun: any;
  let originalParseRun: any;
  let originalResolveRun: any;
  let originalLoadRun: any;
  let originalGetActiveGraphSnapshot: any;
  let symbolRepo: any;
  let projectId: string;
  let prisma: any;

  beforeEach(async () => {
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

    projectId = `etl-fp-${randomUUID()}`;
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    prisma = getPrismaClient();

    await symbolRepo.upsertWorkspace({
      project_id: projectId,
      project_path: "/tmp",
      display_name: "etl-fp",
      status: "pending",
      files_count: 0,
      chunks_count: 0,
      symbols_count: 0,
    });

    // Empty-project stubs (etl-idempotent.test.ts's shape) — this file's
    // subject is the fingerprint stamp, not stage correctness.
    (pipeline as any).graphGenerations = {
      begin: async () => ({
        generationId: "g1",
        projectId,
        expectedActiveGenerationId: null,
        leaseToken: "t1",
        leaseExpiresAt: Date.now() + 60_000,
        fingerprint: "f",
        inputSnapshotHash: buildGraphInputSnapshotHash([]),
        expectedFilesCount: 0,
      }),
      heartbeat: async () => {},
      activate: async () => ({ status: "activated", generationId: "g1", activeGenerationId: "g1" }),
      abort: async () => {},
      cleanup: async () => {},
    };
    let snapshotCall = 0;
    symbolRepo.getActiveGraphSnapshot = async () => {
      snapshotCall++;
      return snapshotCall === 1
        ? null
        : { generationId: "g1", languages: {}, diagnostics: { errors: 0, recovered: 0, hardFailures: 0, staleFiles: 0 } };
    };
    pipeline.discover.run = async () => [];
    pipeline.parse.run = async () => [];
    pipeline.resolve.run = async () => [];
    pipeline.load.run = async () => ({ filesLoaded: 0, chunksLoaded: 0, symbolsLoaded: 0, errors: 0, fileErrors: [] });
  });

  afterEach(async () => {
    (pipeline as any).graphGenerations = originalGraphGenerations;
    pipeline.discover.run = originalDiscoverRun;
    pipeline.parse.run = originalParseRun;
    pipeline.resolve.run = originalResolveRun;
    pipeline.load.run = originalLoadRun;
    symbolRepo.getActiveGraphSnapshot = originalGetActiveGraphSnapshot;
    (EtlPipeline as any).runTails = new Map();
    resetParserReadinessForTests();
    await prisma.$executeRaw`DELETE FROM workspaces WHERE project_id = ${projectId}`;
  });

  test("index_project's forceReindex (the exact recovery EmbeddingIndexStaleError instructs) clears a stale fingerprint", async () => {
    // Stamp a fingerprint that disagrees with the live one — the exact
    // precondition EmbeddingIndexStaleError is raised for.
    await stampEmbeddingFingerprint(projectId, "ollama:some-retired-model:2560");

    const live = currentEmbeddingFingerprint();
    expect(live).not.toBeNull();
    expect(await getEmbeddingFingerprint(projectId)).not.toBe(live);

    // The exact recovery the error message names: "Run index_project with
    // forceReindex: true" — index_project runs exactly this call.
    const job = indexJobTracker.createJob(projectId, "/tmp");
    await pipeline.run({
      projectId,
      projectPath: "/tmp",
      jobId: job.jobId,
      forceReindex: true,
    });

    expect(await getEmbeddingFingerprint(projectId)).toBe(live);

    // The read gate agrees: no more mismatch, admission proceeds. Dummy
    // stubs for the four members checkSearchAdmission never reads in this
    // path (no projectPath supplied → isIndexStale/getFilesToReindex are
    // never called; vectorStore/keywordSearch/indexFile/indexProject are
    // never read by this function at all).
    const admission = await checkSearchAdmission(
      {
        indexManager: {
          getIndexMetadata: async () => ({ projectId, lastIndexed: Date.now() }) as any,
          isIndexStale: async () => ({ isStale: false }),
          getFilesToReindex: async () => [],
          updateIndexMetadata: async () => {},
        },
        symbolRepo,
        keywordSearch: {} as any,
        vectorStore: {} as any,
        searchCache: { invalidateProject: async () => {} } as any,
        indexFile: async () => ({ chunks: 0 }),
        indexProject: async () => ({ filesIndexed: 0, chunksIndexed: 0, errors: 0 }),
      },
      projectId,
    );
    expect(admission.admitted).toBe(true);
    expect(admission.embeddingMismatch).toBeUndefined();
  }, 60_000);
});
