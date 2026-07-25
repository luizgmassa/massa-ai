/**
 * GraphGenerationRepositoryPg coverage — dedicated PostgreSQL (coverage-90pct).
 *
 * The existing graph-generation PG suites spin up an owned database via an
 * admin `test@` client and are gated behind RUN_GRAPH_GENERATION_LIFECYCLE /
 * RUN_GRAPH_GENERATION_SYMBOL_REPOSITORY, so they never run in the default
 * unit gate. This file exercises the repository against the shared dedicated
 * test database so the lease lifecycle (begin/heartbeat/complete/activate/
 * abort/cleanupSuperseded) and the validation helpers reach >=90% line
 * coverage in the default suite.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { GraphGenerationRepositoryPg } from "../data/graph-generation/graph-generation-repository-pg.js";
import type { GraphGenerationLease } from "../data/graph-generation/graph-generation-contract.js";

const DB_AVAILABLE = /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");
const TEST_PREFIX = "cov-graphgen-";

const projectId = () => `${TEST_PREFIX}${randomUUID()}`;
const genId = () => `gen-${randomUUID()}`;

let prisma: any;
let repository: GraphGenerationRepositoryPg;

beforeAll(async () => {
  if (!DB_AVAILABLE) return;
  const { getPrismaClient } = await import("../services/query/prisma-client.js");
  prisma = getPrismaClient();
  repository = GraphGenerationRepositoryPg.getInstance();
});

async function cleanup(p: string): Promise<void> {
  if (!DB_AVAILABLE) return;
  // FK order: children first, then graph_generations, then workspaces.
  await prisma.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${p}`;
  await prisma.$executeRaw`DELETE FROM symbol_imports WHERE project_id = ${p}`;
  await prisma.$executeRaw`DELETE FROM symbol_centrality WHERE project_id = ${p}`;
  await prisma.$executeRaw`DELETE FROM symbol_definitions WHERE project_id = ${p}`;
  await prisma.$executeRaw`DELETE FROM symbol_files WHERE project_id = ${p}`;
  await prisma.$executeRaw`DELETE FROM graph_generations WHERE project_id = ${p}`;
  await prisma.$executeRaw`DELETE FROM workspaces WHERE project_id = ${p}`;
}

afterEach(async () => {
  if (!DB_AVAILABLE) return;
  await prisma.$executeRaw`DELETE FROM symbol_references WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM symbol_imports WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM symbol_centrality WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM symbol_definitions WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM symbol_files WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM graph_generations WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM workspaces WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
});

afterAll(async () => {
  if (!DB_AVAILABLE) return;
});

async function seedActiveWorkspace(p: string, activeId: string): Promise<void> {
  // Insert the workspace first WITHOUT the active pointer (the FK
  // workspaces_active_graph_generation_fkey requires the generation row to
  // exist before it can be referenced), then seed the generation, then set it.
  await prisma.$executeRaw`
    INSERT INTO workspaces (project_id, project_path, status, updated_at)
    VALUES (${p}, ${"/tmp/" + p}, 'indexed', NOW())
  `;
  await seedGeneration(p, activeId, "active");
  await prisma.$executeRaw`UPDATE workspaces SET active_graph_generation_id = ${activeId} WHERE project_id = ${p}`;
}

async function seedGeneration(
  p: string,
  id: string,
  status: "active" | "pending" | "superseded" | "failed",
  opts: { expectedActiveId?: string | null; leaseToken?: string | null; leaseExpiresInSec?: number; fingerprint?: string; snapshot?: string; expectedFiles?: number } = {},
): Promise<void> {
  // Compute a real JS Date so Prisma sends a typed timestamp parameter (casting
  // a parameterized "NOW() + INTERVAL" string is rejected by PG as 22007).
  const leaseExpires = opts.leaseExpiresInSec === undefined
    ? null
    : new Date(Date.now() + opts.leaseExpiresInSec * 1000);
  await prisma.$executeRaw`
    INSERT INTO graph_generations (
      id, project_id, status, fingerprint, input_snapshot_hash, expected_active_id,
      lease_token, lease_expires_at, expected_files_count, started_at
    ) VALUES (
      ${id}, ${p}, ${status}, ${opts.fingerprint ?? "fp"}, ${opts.snapshot ?? "sh"},
      ${opts.expectedActiveId ?? null}, ${opts.leaseToken ?? null},
      ${leaseExpires}, ${opts.expectedFiles ?? 1}, NOW()
    )
  `;
}

async function seedFile(p: string, generationId: string, path: string, status = "ok", stale = false): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO symbol_files (
      project_id, generation_id, relative_path, content_hash, mtime, size, indexed_at,
      symbol_count, chunk_count, language, parser_status, parser_error_count, diagnostics, is_stale
    ) VALUES (
      ${p}, ${generationId}, ${path}, ${randomUUID()}, 1, 1, NOW(), 0, 0, 'typescript',
      ${status}, 0, '[]'::jsonb, ${stale}
    )
  `;
}

function beginInput(p: string, activeId: string | null, expectedFiles = 1) {
  return {
    projectId: p,
    expectedActiveGenerationId: activeId,
    fingerprint: "fp:v2",
    inputSnapshotHash: `snap:${randomUUID()}`,
    expectedFilesCount: expectedFiles,
    leaseTtlMs: 60_000,
  };
}

describe.skipIf(!DB_AVAILABLE)("GraphGenerationRepositoryPg (dedicated PostgreSQL)", () => {
  describe("begin()", () => {
    test("acquires when there is no pending generation", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);

      const outcome = await repository.begin(beginInput(p, activeId));
      expect(outcome.status).toBe("acquired");
      if (outcome.status === "acquired") {
        expect(outcome.lease.projectId).toBe(p);
        expect(outcome.lease.expectedActiveGenerationId).toBe(activeId);
      }
      await cleanup(p);
    });

    test("returns stale_active when the active pointer moved", async () => {
      const p = projectId();
      const realActive = genId();
      await seedActiveWorkspace(p, realActive);

      const outcome = await repository.begin(beginInput(p, "stale-active-id"));
      expect(outcome.status).toBe("stale_active");
      if (outcome.status === "stale_active") expect(outcome.activeGenerationId).toBe(realActive);
      await cleanup(p);
    });

    test("returns busy when a live pending generation is held", async () => {
      const p = projectId();
      const activeId = genId();
      const pendingId = genId();
      await seedActiveWorkspace(p, activeId);
      await seedGeneration(p, pendingId, "pending", { expectedActiveId: activeId, leaseToken: "owner", leaseExpiresInSec: 300 });
      // Wire the workspace to the live pending lease.
      await prisma.$executeRaw`
        UPDATE workspaces SET pending_graph_generation_id = ${pendingId},
          graph_lease_token = 'owner', graph_lease_expires_at = NOW() + INTERVAL '300 seconds',
          graph_lease_heartbeat_at = NOW()
        WHERE project_id = ${p}
      `;

      const outcome = await repository.begin(beginInput(p, activeId));
      expect(outcome.status).toBe("busy");
      if (outcome.status === "busy") expect(outcome.generationId).toBe(pendingId);
      await cleanup(p);
    });

    test("takes over an expired pending generation (clears + acquires)", async () => {
      const p = projectId();
      const activeId = genId();
      const expiredPending = genId();
      await seedActiveWorkspace(p, activeId);
      await seedGeneration(p, expiredPending, "pending", { expectedActiveId: activeId, leaseToken: "old-owner", leaseExpiresInSec: -10 });
      await prisma.$executeRaw`
        UPDATE workspaces SET pending_graph_generation_id = ${expiredPending},
          graph_lease_token = 'old-owner', graph_lease_expires_at = NOW() - INTERVAL '10 seconds',
          graph_lease_heartbeat_at = NOW()
        WHERE project_id = ${p}
      `;

      const outcome = await repository.begin(beginInput(p, activeId));
      expect(outcome.status).toBe("acquired");
      // The expired prior generation is flipped to 'failed'.
      const failed = await prisma.$queryRaw<Array<{ s: string }>>`SELECT status::text s FROM graph_generations WHERE id = ${expiredPending}`;
      expect(failed[0]!.s).toBe("failed");
      await cleanup(p);
    });

    test("throws pending_invariant when the pending pointer points at a non-pending row", async () => {
      const p = projectId();
      const activeId = genId();
      const bogusPending = genId();
      await seedActiveWorkspace(p, activeId);
      // pending pointer set, but the target row is 'failed' (not pending) → invariant.
      // (Seeding as a second 'active' would violate the partial unique; 'failed' is FK-valid.)
      await seedGeneration(p, bogusPending, "failed");
      await prisma.$executeRaw`
        UPDATE workspaces SET pending_graph_generation_id = ${bogusPending},
          graph_lease_token = 'owner', graph_lease_expires_at = NOW() + INTERVAL '300 seconds'
        WHERE project_id = ${p}
      `;

      await expect(repository.begin(beginInput(p, activeId))).rejects.toThrow(/graph_generation_pending_invariant/);
      await cleanup(p);
    });

    test("throws when the workspace row is missing (lockWorkspace)", async () => {
      const p = projectId();
      await expect(repository.begin(beginInput(p, null))).rejects.toThrow(/graph_generation_workspace_missing/);
      await cleanup(p);
    });
  });

  describe("heartbeat()", () => {
    test("renews a live lease and returns a later expiry", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin({ ...beginInput(p, activeId), leaseTtlMs: 5_000 });
      if (acquired.status !== "acquired") throw new Error("expected acquired");

      const renewed = await repository.heartbeat(acquired.lease, 90_000);
      expect(renewed.status).toBe("renewed");
      if (renewed.status === "renewed") expect(renewed.leaseExpiresAt).toBeGreaterThan(acquired.lease.leaseExpiresAt);
      await cleanup(p);
    });

    test("returns lease_lost for a wrong token", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId));
      if (acquired.status !== "acquired") throw new Error("expected acquired");

      const wrong = { ...acquired.lease, leaseToken: `wrong-${acquired.lease.leaseToken}` };
      expect((await repository.heartbeat(wrong, 60_000)).status).toBe("lease_lost");
      await cleanup(p);
    });
  });

  describe("complete()", () => {
    test("completes when the file set matches expectedFilesCount", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await seedFile(p, acquired.lease.generationId, "src/a.ts", "ok");

      const outcome = await repository.complete(acquired.lease);
      expect(outcome.status).toBe("complete");
      if (outcome.status === "complete") expect(typeof outcome.completedAt).toBe("number");
      await cleanup(p);
    });

    test("reports incomplete on file_count_mismatch", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 2));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await seedFile(p, acquired.lease.generationId, "src/a.ts", "ok");

      const outcome = await repository.complete(acquired.lease);
      expect(outcome.status).toBe("incomplete");
      if (outcome.status === "incomplete") expect(outcome.reasons).toContain("file_count_mismatch");
      await cleanup(p);
    });

    test("reports incomplete when a hard-failure file is present", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await seedFile(p, acquired.lease.generationId, "src/broken.ts", "failed");

      const outcome = await repository.complete(acquired.lease);
      expect(outcome.status).toBe("incomplete");
      if (outcome.status === "incomplete") expect(outcome.reasons).toContain("hard_failures");
      await cleanup(p);
    });

    test("returns lease_lost for a wrong token", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      const wrong = { ...acquired.lease, leaseToken: "wrong" };
      expect((await repository.complete(wrong)).status).toBe("lease_lost");
      await cleanup(p);
    });

    test("returns stale_active when the active pointer moved under the lease", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await seedFile(p, acquired.lease.generationId, "src/a.ts", "ok");
      // Another owner activated a different generation under us. The FK requires
      // the referenced id to exist, so seed a real (non-active) row and point to it.
      const otherGen = genId();
      await seedGeneration(p, otherGen, "superseded");
      await prisma.$executeRaw`UPDATE workspaces SET active_graph_generation_id = ${otherGen} WHERE project_id = ${p}`;

      const outcome = await repository.complete(acquired.lease);
      expect(outcome.status).toBe("stale_active");
      await cleanup(p);
    });
  });

  describe("activate()", () => {
    test("activates a complete generation and supersedes the old active", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await seedFile(p, acquired.lease.generationId, "src/a.ts", "ok");

      const outcome = await repository.activate(acquired.lease);
      expect(outcome.status).toBe("activated");
      if (outcome.status === "activated") {
        expect(outcome.supersededGenerationId).toBe(activeId);
        expect(outcome.generationId).toBe(acquired.lease.generationId);
      }
      // The new generation is now active; the old one is superseded.
      const rows = await prisma.$queryRaw<Array<{ a: string; b: string }>>`
        SELECT (SELECT status::text FROM graph_generations WHERE id = ${acquired.lease.generationId}) a,
               (SELECT status::text FROM graph_generations WHERE id = ${activeId}) b
      `;
      expect(rows[0]).toEqual({ a: "active", b: "superseded" });
      await cleanup(p);
    });

    test("returns incomplete when counts mismatch", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 2));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await seedFile(p, acquired.lease.generationId, "src/a.ts", "ok");

      expect((await repository.activate(acquired.lease)).status).toBe("incomplete");
      await cleanup(p);
    });

    test("returns lease_lost for a wrong token", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      const wrong = { ...acquired.lease, leaseToken: "wrong" };
      expect((await repository.activate(wrong)).status).toBe("lease_lost");
      await cleanup(p);
    });

    test("returns stale_active when the active pointer moved", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await seedFile(p, acquired.lease.generationId, "src/a.ts", "ok");
      const otherGen = genId();
      await seedGeneration(p, otherGen, "superseded");
      await prisma.$executeRaw`UPDATE workspaces SET active_graph_generation_id = ${otherGen} WHERE project_id = ${p}`;

      expect((await repository.activate(acquired.lease)).status).toBe("stale_active");
      await cleanup(p);
    });
  });

  describe("abort()", () => {
    test("aborts a pending generation and clears the lease", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await seedFile(p, acquired.lease.generationId, "src/a.ts", "ok");

      const outcome = await repository.abort(acquired.lease, "test_abort_reason");
      expect(outcome.status).toBe("aborted");
      if (outcome.status === "aborted") expect(outcome.generationId).toBe(acquired.lease.generationId);
      const rows = await prisma.$queryRaw<Array<{ s: string; r: string | null }>>`
        SELECT status::text s, failure_reason r FROM graph_generations WHERE id = ${acquired.lease.generationId}
      `;
      expect(rows[0]!.s).toBe("failed");
      expect(rows[0]!.r).toBe("test_abort_reason");
      // Children are deleted by abort.
      const files = await prisma.$queryRaw<Array<{ c: number }>>`SELECT count(*)::int c FROM symbol_files WHERE project_id = ${p} AND generation_id = ${acquired.lease.generationId}`;
      expect(files[0]!.c).toBe(0);
      await cleanup(p);
    });

    test("returns lease_lost for a wrong token", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      const wrong = { ...acquired.lease, leaseToken: "wrong" };
      expect((await repository.abort(wrong, "x")).status).toBe("lease_lost");
      await cleanup(p);
    });
  });

  describe("cleanupSuperseded()", () => {
    test("deletes superseded generations not referenced by active/pending/files, honoring retained ids", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const sup1 = genId();
      const sup2 = genId();
      const sup3 = genId();
      await seedGeneration(p, sup1, "superseded");
      await seedGeneration(p, sup2, "superseded");
      await seedGeneration(p, sup3, "superseded");

      // Default options: delete all superseded.
      const deletedAll = await repository.cleanupSuperseded(p);
      expect(deletedAll).toBe(3);

      // Re-seed and retain sup2.
      await seedGeneration(p, sup1, "superseded");
      await seedGeneration(p, sup2, "superseded");
      const deletedRetained = await repository.cleanupSuperseded(p, { retainedGenerationIds: [sup2] });
      expect(deletedRetained).toBe(1);
      const left = await prisma.$queryRaw<Array<{ c: number }>>`SELECT count(*)::int c FROM graph_generations WHERE project_id = ${p} AND status = 'superseded'`;
      expect(left[0]!.c).toBe(1);
      await cleanup(p);
    });

    test("does not delete a superseded generation still referenced by a symbol_file last_known_good", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const lkg = genId();
      await seedGeneration(p, lkg, "superseded");
      await seedFile(p, activeId, "src/a.ts", "ok");
      await prisma.$executeRaw`UPDATE symbol_files SET last_known_good_generation_id = ${lkg} WHERE project_id = ${p} AND relative_path = 'src/a.ts'`;

      expect(await repository.cleanupSuperseded(p)).toBe(0);
      await cleanup(p);
    });
  });

  describe("validateBegin (input validation)", () => {
    test("rejects expectedFilesCount out of range or non-integer", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      await expect(repository.begin({ ...beginInput(p, activeId), expectedFilesCount: -1 })).rejects.toThrow(RangeError);
      await expect(repository.begin({ ...beginInput(p, activeId), expectedFilesCount: 1.5 })).rejects.toThrow(RangeError);
      await expect(repository.begin({ ...beginInput(p, activeId), expectedFilesCount: 1_000_001 })).rejects.toThrow(RangeError);
      await cleanup(p);
    });

    test("rejects leaseTtlMs out of range", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      await expect(repository.begin({ ...beginInput(p, activeId), leaseTtlMs: 10 })).rejects.toThrow(RangeError);
      await expect(repository.begin({ ...beginInput(p, activeId), leaseTtlMs: 300_001 })).rejects.toThrow(RangeError);
      await expect(repository.begin({ ...beginInput(p, activeId), leaseTtlMs: 1.5 })).rejects.toThrow(RangeError);
      await cleanup(p);
    });

    test("rejects malformed projectId / fingerprint / inputSnapshotHash", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      await expect(repository.begin({ ...beginInput(p, activeId), projectId: "   " })).rejects.toThrow(TypeError);
      await expect(repository.begin({ ...beginInput(p, activeId), projectId: "bad\u0000id" })).rejects.toThrow(TypeError);
      await expect(repository.begin({ ...beginInput(p, activeId), fingerprint: "x".repeat(2_001) })).rejects.toThrow(TypeError);
      await expect(repository.begin({ ...beginInput(p, activeId), inputSnapshotHash: "x".repeat(2_001) })).rejects.toThrow(TypeError);
      await cleanup(p);
    });

    test("rejects an over-long reason in abort", async () => {
      const p = projectId();
      const activeId = genId();
      await seedActiveWorkspace(p, activeId);
      const acquired = await repository.begin(beginInput(p, activeId, 1));
      if (acquired.status !== "acquired") throw new Error("expected acquired");
      await expect(repository.abort(acquired.lease, "x".repeat(2_001))).rejects.toThrow(TypeError);
      await cleanup(p);
    });
  });
});
