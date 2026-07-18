import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

const DB_AVAILABLE = /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");
const RUN_POSTGRES_TESTS = process.env.RUN_POSTGRES_TESTS === "1";

/**
 * M8 — OperationLogRepository tests.
 *
 * Two layers:
 *   1. FAIL-SAFE (DB-FREE, always runs): a failing DB layer MUST NOT bubble
 *      back at the destructive caller. `recordOperation` resolves and the
 *      error is swallowed. This is the load-bearing guarantee that lets us
 *      audit destructive ops without ever making the audit table a
 *      single-point-of-failure for the destructive op itself.
 *   2. ROUND-TRIP (PG-gated): insert + listByProject sanity on a real DB.
 *      Skipped unless DATABASE_URL is a postgres URL AND the caller opted
 *      in via RUN_POSTGRES_TESTS=1.
 */

// ── Layer 1: fail-safe (DB-free) ────────────────────────────────────────────

describe("OperationLogRepositoryPg.recordOperation — fail-safe (DB-free)", () => {
  test("swallows an internal DB error and resolves", async () => {
    const { OperationLogRepositoryPg } = await import("../data/audit/operation-log-pg.js");

    const repo = new OperationLogRepositoryPg();
    // Force getClient to throw — simulates pool exhaustion / connection drop.
    // Access private method via cast; the contract is "never throw".
    (repo as unknown as { getClient: () => never }).getClient = () => {
      throw new Error("simulated DB outage");
    };

    // Must NOT throw — the destructive op that triggered this audit row
    // must complete regardless of audit-table health.
    await expect(
      repo.recordOperation({
        op: "project_reset",
        projectId: "fail-safe-project",
        result: "success",
      }),
    ).resolves.toBeUndefined();
  });

  test("swallows an async DB rejection and resolves", async () => {
    const { OperationLogRepositoryPg } = await import("../data/audit/operation-log-pg.js");

    const repo = new OperationLogRepositoryPg();
    (repo as unknown as {
      getClient: () => { $executeRaw: () => Promise<never> };
    }).getClient = () => ({
      $executeRaw: () => Promise.reject(new Error("async DB outage")),
    });

    await expect(
      repo.recordOperation({
        op: "memory_purge",
        projectId: "fail-safe-async",
        result: "failure",
        error: "async DB outage",
      }),
    ).resolves.toBeUndefined();
  });
});

// ── Layer 2: PG round-trip ──────────────────────────────────────────────────

describe.skipIf(!(DB_AVAILABLE && RUN_POSTGRES_TESTS))(
  "OperationLogRepositoryPg — PG round-trip (requires DATABASE_URL + RUN_POSTGRES_TESTS=1)",
  () => {
    const projectId = `oplog-test-${randomUUID()}`;
    let prisma: { $executeRaw: Function; $queryRaw: Function } = null as any;

    beforeAll(async () => {
      const { getPrismaClient } = await import("../services/query/prisma-client.js");
      prisma = getPrismaClient() as any;
    });

    afterAll(async () => {
      if (prisma) {
        try {
          await prisma.$executeRaw`DELETE FROM operation_log WHERE project_id = ${projectId}`;
        } catch {
          /* best-effort cleanup */
        }
      }
    });

    test("inserts a row and reads it back via listByProject", async () => {
      const { OperationLogRepositoryPg } = await import("../data/audit/operation-log-pg.js");
      const repo = new OperationLogRepositoryPg();
      // Wire the real prisma client back in.
      (repo as unknown as { prisma: typeof prisma }).prisma = prisma;

      await repo.recordOperation({
        op: "project_reset",
        projectId,
        actorType: "api_key",
        actorId: "round-trip-tester",
        result: "success",
        scope: { requestedScopes: { vectors: true } },
        meta: { vectorsDeleted: 42 },
      });

      const rows = await repo.listByProject(projectId, 10);
      const ours = rows.filter((r) => r.op === "project_reset");
      expect(ours.length).toBeGreaterThanOrEqual(1);
      const row = ours[0];
      expect(row.projectId).toBe(projectId);
      expect(row.actorType).toBe("api_key");
      expect(row.actorId).toBe("round-trip-tester");
      expect(row.result).toBe("success");
      expect(row.scope).toMatchObject({ requestedScopes: { vectors: true } });
      expect(row.meta).toMatchObject({ vectorsDeleted: 42 });
      expect(row.error).toBeNull();
      expect(row.occurredAt).toBeGreaterThan(0);
    });
  },
);
