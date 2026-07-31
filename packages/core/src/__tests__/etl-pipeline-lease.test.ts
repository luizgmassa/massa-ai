/**
 * ETL Pipeline managed_runs lease integration (Wave 5 T13 / FR-09 / AC-7).
 *
 * Two layers exercised:
 *  - IndexProjectTool.handle: synchronous 202 (acquired) / 409 (busy) before
 *    the background ETL starts.
 *  - EtlPipeline.runInternal: heartbeat spawn, complete on success, abort on
 *    failure, lease_lost aborts graph work.
 *
 * PG-backed. Uses a stubbed graph generation coordinator + project identity
 * resolver so the test stays focused on the managed_runs lease and does not
 * require a real active graph generation.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { EtlPipeline } from "../services/etl/pipeline.js";
import { buildGraphInputSnapshotHash } from "../services/etl/graph-generation-coordinator.js";
import { ManagedRunRepositoryPg } from "../data/managed-runs/managed-run-repository-pg.js";
import { getSymbolRepository } from "../data/symbol/symbol-repository-factory.js";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";
import { resetParserReadinessForTests } from "../services/structural/parser-readiness.js";
import { LANGUAGE_MANIFEST } from "../services/structural/language-manifest.js";
import { grammarArtifactKey } from "../services/structural/grammar-loaders.js";
import {
  ProjectIdentityAliasResolver,
  setProjectIdentityAliasResolverForTests,
} from "../kernel/alias-resolver.js";
import type { ManagedRunLease } from "../data/managed-runs/managed-run-contract.js";

const DB_AVAILABLE = /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");
const projectId = () => `etl-lease-${randomUUID()}`;

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

beforeAll(async () => {
  if (!DB_AVAILABLE) return;
});

afterAll(async () => {
  // NOTE: Do NOT call disconnectPrisma() or ManagedRunRepositoryPg._resetForTesting()
  // here. When this file runs alongside etl-idempotent.test.ts in the same `bun test`
  // invocation, ending the shared pg pool here causes the second file's tests to fail
  // with "Cannot use a pool after calling end on the pool". The pool teardown is owned
  // by the last file in the batch (etl-idempotent.test.ts). Per-test managed_runs rows
  // are still cleaned via cleanupProject() in each test.
  if (!DB_AVAILABLE) return;
});

async function cleanupProject(p: string): Promise<void> {
  const { getPrismaClient } = await import("../kernel/prisma-client.js");
  await getPrismaClient().$executeRaw`DELETE FROM managed_runs WHERE project_id = ${p}`;
}

describe.skipIf(!DB_AVAILABLE)("EtlPipeline managed_runs lease (T13 / AC-7)", () => {
  let pipeline: EtlPipeline;
  let originalGraphGenerations: any;
  let originalDiscoverRun: any;
  let originalParseRun: any;
  let originalResolveRun: any;
  let originalLoadRun: any;
  let originalGetActiveGraphSnapshot: any;
  let symbolRepo: any;
  let currentProjectId: string;

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
    const fakeLease = {
      generationId: "g1",
      projectId: "stub",
      expectedActiveGenerationId: null,
      leaseToken: "t1",
      leaseExpiresAt: Date.now() + 60_000,
      fingerprint: "f",
      // The pipeline re-runs discover at activation and compares the hash; the
      // stubbed discover returns [] so the hash must match the empty snapshot.
      inputSnapshotHash: buildGraphInputSnapshotHash([]),
      expectedFilesCount: 0,
    };
    (pipeline as any).graphGenerations = {
      begin: async () => fakeLease,
      heartbeat: async () => {},
      activate: async () => ({ status: "activated", generationId: "g1", activeGenerationId: "g1" }),
      abort: async () => {},
      cleanup: async () => {},
    };
    // First getActiveGraphSnapshot (before begin) returns null; second (post-
    // activation) returns a summary matching generationId "g1" so the
    // activated_graph_summary_mismatch guard passes.
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

  test("pipeline completes the managed_runs lease on success", async () => {
    const repo = ManagedRunRepositoryPg.getInstance();
    const eventId = `evt-success-${randomUUID()}`;
    const begin = await repo.begin({ projectId: currentProjectId, runKind: "indexing", eventId });
    if (begin.status !== "acquired") throw new Error("expected acquired");
    const lease: ManagedRunLease = begin.lease;

    // Stub stages to a no-op successful run.
    (pipeline as any).discover.run = async () => [];
    (pipeline as any).parse.run = async () => [];
    (pipeline as any).resolve.run = async () => [];
    (pipeline as any).load.run = async () => ({ filesLoaded: 0, chunksLoaded: 0, symbolsLoaded: 0, errors: 0 });

    const job = indexJobTracker.createJob(currentProjectId, "/tmp");
    await pipeline.run({
      projectId: currentProjectId,
      projectPath: "/tmp",
      jobId: job.jobId,
      managedRunLease: lease,
    });

    // The lease should be released (status=completed) — getActive returns null.
    const active = await repo.getActive(currentProjectId, "indexing");
    expect(active).toBeNull();
    await cleanupProject(currentProjectId);
  });

  test("pipeline aborts the managed_runs lease on ETL failure", async () => {
    const repo = ManagedRunRepositoryPg.getInstance();
    const eventId = `evt-fail-${randomUUID()}`;
    const begin = await repo.begin({ projectId: currentProjectId, runKind: "indexing", eventId });
    if (begin.status !== "acquired") throw new Error("expected acquired");
    const lease: ManagedRunLease = begin.lease;

    // Discover throws → ETL fails → pipeline catch path aborts the lease.
    (pipeline as any).discover.run = async () => { throw new Error("discover_boom"); };

    const job = indexJobTracker.createJob(currentProjectId, "/tmp");
    await expect(
      pipeline.run({
        projectId: currentProjectId,
        projectPath: "/tmp",
        jobId: job.jobId,
        managedRunLease: lease,
      }),
    ).rejects.toThrow("discover_boom");

    const active = await repo.getActive(currentProjectId, "indexing");
    expect(active).toBeNull();
    // Row is aborted, not completed — reaper will clean up; a new begin() can acquire.
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    const row = await getPrismaClient().$queryRaw<Array<{ status: string }>>`
      SELECT status FROM managed_runs WHERE id = ${BigInt(lease.runId)}
    `;
    expect(row[0]?.status).toBe("aborted");
    await cleanupProject(currentProjectId);
  });

  test("concurrent index: first acquires (202+runId), second sees 409 busy", async () => {
    const repo = ManagedRunRepositoryPg.getInstance();
    const eventIdA = `evt-concurrent-a-${randomUUID()}`;
    const eventIdB = `evt-concurrent-b-${randomUUID()}`;
    const [a, b] = await Promise.all([
      repo.begin({ projectId: currentProjectId, runKind: "indexing", eventId: eventIdA }),
      repo.begin({ projectId: currentProjectId, runKind: "indexing", eventId: eventIdB }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["acquired", "busy"]);
    const acquired = a.status === "acquired" ? a : (b.status === "acquired" ? b : null);
    const busy = a.status === "busy" ? a : (b.status === "busy" ? b : null);
    expect(acquired).not.toBeNull();
    expect(busy).not.toBeNull();
    if (acquired && acquired.status === "acquired" && busy && busy.status === "busy") {
      expect(busy.activeRunId).toBe(acquired.lease.runId);
      // Release the winner; next begin acquires (reaper not needed).
      await repo.complete(acquired.lease);
      const next = await repo.begin({
        projectId: currentProjectId,
        runKind: "indexing",
        eventId: `evt-next-${randomUUID()}`,
      });
      expect(next.status).toBe("acquired");
      if (next.status === "acquired") await repo.complete(next.lease);
    }
    await cleanupProject(currentProjectId);
  });

  // ── BUG-03 / TASK-011 ──────────────────────────────────────────────────
  //
  // `runInternal` tears the managed-run heartbeat down at three sites (the
  // pre-activation point, the success path, and the catch path). The
  // stale-generation retry is a bare `return this.runInternal(...)` from
  // inside the try, so it reaches none of them: every abandoned frame leaves
  // its `while (!stopManagedRunHeartbeat)` loop awaiting `delay(30_000)`
  // forever, heartbeating a lease its run no longer owns.
  //
  // Fake timers make the leak observable in milliseconds: no heartbeat can
  // fire during the run (nothing advances the clock), so any call counted
  // after the outer run settles came from an orphaned loop.

  /** Let each fired timer's continuation run to its next await. */
  async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  /** Advance past several heartbeat intervals, draining the loop each time. */
  async function advancePastHeartbeats(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(31_000);
      await flushMicrotasks();
    }
  }

  test("stale-generation retry does not leak the managed-run heartbeat", async () => {
    const repo = ManagedRunRepositoryPg.getInstance();
    const eventId = `evt-retry-${randomUUID()}`;
    const begin = await repo.begin({ projectId: currentProjectId, runKind: "indexing", eventId });
    if (begin.status !== "acquired") throw new Error("expected acquired");
    const lease: ManagedRunLease = begin.lease;

    const originalHeartbeat = repo.heartbeat.bind(repo);
    let heartbeats = 0;
    (repo as any).heartbeat = async () => {
      heartbeats++;
      return { status: "renewed" as const };
    };

    // First attempt hits a stale active generation; the retry succeeds.
    let beginCalls = 0;
    const succeedingBegin = (pipeline as any).graphGenerations.begin;
    (pipeline as any).graphGenerations.begin = async (...args: unknown[]) => {
      beginCalls++;
      if (beginCalls === 1) throw new Error("graph_generation_stale_active:g0");
      return succeedingBegin(...args);
    };

    (pipeline as any).discover.run = async () => [];
    (pipeline as any).parse.run = async () => [];
    (pipeline as any).resolve.run = async () => [];
    (pipeline as any).load.run = async () => ({ filesLoaded: 0, chunksLoaded: 0, symbolsLoaded: 0, errors: 0 });

    // The success path writes the search-admission marker through
    // `getVectorStore()`, which auto-selects an embedding provider (~13 s cold)
    // and races a `setTimeout`. Neither can finish once the clock is frozen, so
    // warm the cached singleton here, outside the fake-timer window.
    const { getVectorStore } = await import("../data/vector/vector-store-factory.js");
    await getVectorStore();

    jest.useFakeTimers();
    try {
      const job = indexJobTracker.createJob(currentProjectId, "/tmp");
      await pipeline.run({
        projectId: currentProjectId,
        projectPath: "/tmp",
        jobId: job.jobId,
        managedRunLease: lease,
      });

      expect(beginCalls).toBe(2);
      // Nothing advanced the clock during the run, so this is the baseline.
      expect(heartbeats).toBe(0);

      await advancePastHeartbeats();
      expect(heartbeats).toBe(0);
    } finally {
      jest.useRealTimers();
      (repo as any).heartbeat = originalHeartbeat;
    }
    await cleanupProject(currentProjectId);
  }, 60_000);

  test("exhausting all 3 stale-generation retries leaves zero running heartbeat loops", async () => {
    const repo = ManagedRunRepositoryPg.getInstance();
    const eventId = `evt-retry-exhaust-${randomUUID()}`;
    const begin = await repo.begin({ projectId: currentProjectId, runKind: "indexing", eventId });
    if (begin.status !== "acquired") throw new Error("expected acquired");
    const lease: ManagedRunLease = begin.lease;

    const originalHeartbeat = repo.heartbeat.bind(repo);
    let heartbeats = 0;
    (repo as any).heartbeat = async () => {
      heartbeats++;
      return { status: "renewed" as const };
    };

    let beginCalls = 0;
    (pipeline as any).graphGenerations.begin = async () => {
      beginCalls++;
      throw new Error("graph_generation_stale_active:g0");
    };

    (pipeline as any).discover.run = async () => [];
    (pipeline as any).parse.run = async () => [];
    (pipeline as any).resolve.run = async () => [];
    (pipeline as any).load.run = async () => ({ filesLoaded: 0, chunksLoaded: 0, symbolsLoaded: 0, errors: 0 });

    jest.useFakeTimers();
    try {
      const job = indexJobTracker.createJob(currentProjectId, "/tmp");
      await expect(
        pipeline.run({
          projectId: currentProjectId,
          projectPath: "/tmp",
          jobId: job.jobId,
          managedRunLease: lease,
        }),
      ).rejects.toThrow("graph_generation_stale_active:");

      // Attempts 0..3: three retries then the throw.
      expect(beginCalls).toBe(4);
      expect(heartbeats).toBe(0);

      await advancePastHeartbeats();
      expect(heartbeats).toBe(0);
    } finally {
      jest.useRealTimers();
      (repo as any).heartbeat = originalHeartbeat;
    }
    await cleanupProject(currentProjectId);
  });

  test("pipeline without a managedRunLease still runs (lease wiring is opt-in)", async () => {
    // Regression guard: callers that don't pass managedRunLease (legacy path,
    // tests) must still work — the heartbeat/complete/abort branches are
    // guarded by `if (managedRunLease && managedRunRepository)`.
    (pipeline as any).discover.run = async () => [];
    (pipeline as any).parse.run = async () => [];
    (pipeline as any).resolve.run = async () => [];
    (pipeline as any).load.run = async () => ({ filesLoaded: 0, chunksLoaded: 0, symbolsLoaded: 0, errors: 0 });

    const job = indexJobTracker.createJob(currentProjectId, "/tmp");
    const result = await pipeline.run({
      projectId: currentProjectId,
      projectPath: "/tmp",
      jobId: job.jobId,
      // no managedRunLease
    });
    expect(result.filesIndexed).toBe(0);
    // No managed_runs row should exist for this project.
    const repo = ManagedRunRepositoryPg.getInstance();
    expect(await repo.getActive(currentProjectId, "indexing")).toBeNull();
    await cleanupProject(currentProjectId);
  });
});