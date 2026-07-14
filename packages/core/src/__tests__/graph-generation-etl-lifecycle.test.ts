import { describe, expect, test } from "bun:test";
import type { GraphGenerationLease, GraphGenerationRepository } from "../data/graph-generation/graph-generation-contract.js";
import {
  buildGraphInputSnapshotHash,
  GraphGenerationCoordinator,
} from "../services/etl/graph-generation-coordinator.js";
import { IndexJobTracker } from "../services/jobs/index-job-tracker.js";

function lease(): GraphGenerationLease {
  return {
    projectId: "project-a",
    generationId: "generation-new",
    leaseToken: "lease-owner",
    expectedActiveGenerationId: "generation-old",
    fingerprint: "fingerprint:v2",
    inputSnapshotHash: "snapshot:v2",
    expectedFilesCount: 2,
    leaseExpiresAt: Date.now() + 60_000,
  };
}

function lifecycleRepository(events: string[], activationStatus: "activated" | "incomplete" = "activated"): GraphGenerationRepository {
  return {
    async begin() { events.push("begin"); return { status: "acquired", lease: lease() }; },
    async heartbeat() { events.push("heartbeat"); return { status: "renewed", leaseExpiresAt: Date.now() + 60_000 }; },
    async complete() {
      events.push("complete");
      return { status: "complete", counts: { files: 2, definitions: 1, references: 0, imports: 0, centrality: 0, diagnostics: 1, recovered: 1, hardFailures: 0, staleFiles: 0 }, completedAt: Date.now() };
    },
    async activate() {
      events.push("activate");
      const counts = { files: activationStatus === "activated" ? 2 : 1, definitions: 1, references: 0, imports: 0, centrality: 0, diagnostics: 1, recovered: 1, hardFailures: 0, staleFiles: 0 };
      return activationStatus === "activated"
        ? { status: "activated", generationId: "generation-new", supersededGenerationId: "generation-old", counts }
        : { status: "incomplete", counts, reasons: ["file_count_mismatch"] };
    },
    async abort(_lease, reason) { events.push(`abort:${reason}`); return { status: "aborted", generationId: "generation-new" }; },
    async cleanupSuperseded() { events.push("cleanup"); return 1; },
  };
}

describe("TASK-013 graph generation ETL lifecycle", () => {
  test("terminal persistence failure rejects before completion can be published", async () => {
    const events: string[] = [];
    const store = {
      save: () => {}, get: () => null, listByProject: () => [], listAll: () => [], listRunning: () => [],
      markStaleRunningFailed: () => 0,
      flush: async () => { events.push("flush_failed"); throw new Error("forced_terminal_upsert_failure"); },
    };
    const tracker = new IndexJobTracker(store);
    const job = tracker.createJob("project-a", "/tmp/project-a");
    await expect(tracker.setResultAndFlush(job.jobId, {
      filesIndexed: 1, chunksIndexed: 1, errors: 0, duration: 1, activatedGraphGenerationId: "generation-new",
    })).rejects.toThrow("forced_terminal_upsert_failure");
    // Pipeline publication is sequenced after this awaited boundary.
    expect(events).toEqual(["flush_failed"]);
  });
  test("input snapshots are immutable, path-ordered, and content-sensitive", () => {
    const first = buildGraphInputSnapshotHash([
      { relativePath: "b.ts", contentHash: "hash-b", size: 2 },
      { relativePath: "a.ts", contentHash: "hash-a", size: 1 },
    ]);
    expect(first).toBe(buildGraphInputSnapshotHash([
      { relativePath: "a.ts", contentHash: "hash-a", size: 1 },
      { relativePath: "b.ts", contentHash: "hash-b", size: 2 },
    ]));
    expect(first).not.toBe(buildGraphInputSnapshotHash([
      { relativePath: "a.ts", contentHash: "changed", size: 1 },
      { relativePath: "b.ts", contentHash: "hash-b", size: 2 },
    ]));
  });

  test("activation completes before terminal visibility and cleanup", async () => {
    const events: string[] = [];
    const coordinator = new GraphGenerationCoordinator(lifecycleRepository(events));
    const acquired = await coordinator.begin({ projectId: "project-a", expectedActiveGenerationId: "generation-old", fingerprint: "fingerprint:v2", inputSnapshotHash: "snapshot:v2", expectedFilesCount: 2 });
    const activated = await coordinator.activate(acquired);
    events.push(`terminal:${activated.generationId}`);
    await coordinator.cleanup(acquired);
    expect(events).toEqual(["begin", "complete", "activate", "terminal:generation-new", "cleanup"]);
  });

  test("interruption aborts pending state without activation", async () => {
    const events: string[] = [];
    const coordinator = new GraphGenerationCoordinator(lifecycleRepository(events));
    const acquired = await coordinator.begin({ projectId: "project-a", expectedActiveGenerationId: "generation-old", fingerprint: "fingerprint:v2", inputSnapshotHash: "snapshot:v2", expectedFilesCount: 2 });
    await coordinator.abort(acquired, "parse_interrupted");
    expect(events).toEqual(["begin", "abort:parse_interrupted"]);
  });

  test("required-file incompleteness blocks activation and becomes an abortable failure", async () => {
    const events: string[] = [];
    const coordinator = new GraphGenerationCoordinator(lifecycleRepository(events, "incomplete"));
    const acquired = await coordinator.begin({ projectId: "project-a", expectedActiveGenerationId: "generation-old", fingerprint: "fingerprint:v2", inputSnapshotHash: "snapshot:v2", expectedFilesCount: 2 });
    await expect(coordinator.activate(acquired)).rejects.toThrow("graph_generation_incomplete:file_count_mismatch");
    await coordinator.abort(acquired, "graph_generation_incomplete:file_count_mismatch");
    expect(events).toEqual(["begin", "complete", "activate", "abort:graph_generation_incomplete:file_count_mismatch"]);
  });

  test("competing same-project ownership waits and retries before entering load", async () => {
    const repository = lifecycleRepository([]);
    let attempts = 0;
    repository.begin = async () => ++attempts === 1
      ? { status: "busy", generationId: "other-generation", leaseExpiresAt: Date.now() + 60_000 }
      : { status: "acquired", lease: lease() };
    const coordinator = new GraphGenerationCoordinator(repository);
    expect((await coordinator.begin({ projectId: "project-a", expectedActiveGenerationId: "generation-old", fingerprint: "fingerprint:v2", inputSnapshotHash: "snapshot:v2", expectedFilesCount: 2 })).generationId).toBe("generation-new");
    expect(attempts).toBe(2);
  });
});
