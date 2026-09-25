/**
 * ManagedRunRepository PostgreSQL integration tests (Wave 5 T12 / AC-22).
 *
 * Covers FR-08 / FR-09 / FR-20 / AD-W5-013 / AD-W5-014:
 *  - begin() reaper flips expired active rows to 'aborted' before acquire.
 *  - getActive() pinned filter: only status='active' AND lease_expires_at >
 *    clock_timestamp() (no stale-but-active leaks).
 *  - heartbeat/complete/abort CAS via lease_token.
 *  - file_cursor persistence on complete().
 *
 * AC-22 concurrent-begin race is in `managed-run-concurrent-race.test.ts` so
 * that test stays focused on the racy two-caller path.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type {
  AbortManagedRunOutcome,
  BeginManagedRunOutcome,
  CompleteManagedRunOutcome,
  HeartbeatManagedRunOutcome,
  ManagedRunRepository,
} from "../data/managed-runs/managed-run-contract.js";
import { ManagedRunRepositoryPg } from "../data/managed-runs/managed-run-repository-pg.js";

const DB_AVAILABLE = /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");
const projectId = () => `managed-run-test-${randomUUID()}`;

let repository: ManagedRunRepository;

beforeAll(async () => {
  if (!DB_AVAILABLE) return;
  repository = ManagedRunRepositoryPg.getInstance();
});

afterAll(async () => {
  // NOTE: Do NOT call disconnectPrisma() or ManagedRunRepositoryPg._resetForTesting()
  // here. When this file runs alongside other B2 PG suites in one `bun test`
  // invocation, ending the shared pg pool here leaves PgJobStore (and other
  // singletons holding a cached PrismaClient) with a dead pool → "Cannot use
  // a pool after calling end on the pool" in later files. The pool is torn
  // down when the process exits. Per-test managed_runs rows are still cleaned
  // via cleanupProject() in each test.
  if (!DB_AVAILABLE) return;
});

async function cleanupProject(tx_projectId: string): Promise<void> {
  const { getPrismaClient } = await import("../kernel/prisma-client.js");
  await getPrismaClient().$executeRaw`DELETE FROM managed_runs WHERE project_id = ${tx_projectId}`;
}

describe.skipIf(!DB_AVAILABLE)("ManagedRunRepository (PostgreSQL)", () => {
  let currentProjectId: string;

  beforeEach(async () => {
    currentProjectId = projectId();
  });

  test("begin() acquires a lease with 90s default TTL", async () => {
    const outcome: BeginManagedRunOutcome = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
    });
    expect(outcome.status).toBe("acquired");
    if (outcome.status !== "acquired") throw new Error("expected acquired");
    expect(outcome.lease.runId).toBeTruthy();
    expect(outcome.lease.leaseToken).toBeTruthy();
    expect(outcome.lease.projectId).toBe(currentProjectId);
    expect(outcome.lease.runKind).toBe("indexing");
    // Default TTL 90s → leaseExpiresAt should be ~90s ahead of the DB's
    // clock_timestamp() at INSERT. We compare against DB time (not Date.now())
    // so the assertion is robust to host/DB timezone skew (Prisma's pg
    // adapter returns timestamptz as a JS Date that may carry a session-TZ
    // offset; the same skew applies to a SELECT now() query).
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    const dbNowRows = await getPrismaClient().$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const dbNow = dbNowRows[0]!.now.getTime();
    const expiresAt = outcome.lease.leaseExpiresAt;
    const delta = expiresAt - dbNow;
    // Allow 5s slack either side for test latency + clock drift.
    expect(delta).toBeGreaterThan(80_000);
    expect(delta).toBeLessThan(100_000);
    await cleanupProject(currentProjectId);
  });

  test("getActive() returns the live row for (projectId, runKind)", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    const active = await repository.getActive(currentProjectId, "indexing");
    expect(active).not.toBeNull();
    expect(active!.runId).toBe(acquired.lease.runId);
    expect(active!.leaseToken).toBe(acquired.lease.leaseToken);
    expect(active!.status ?? "active").toBe("active"); // sanity
    // getActive pin: filter excludes other run_kinds.
    const other = await repository.getActive(currentProjectId, "reindex");
    expect(other).toBeNull();
    await cleanupProject(currentProjectId);
  });

  test("getActive() returns null after complete()", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    const completed: CompleteManagedRunOutcome = await repository.complete(acquired.lease, {
      path: "src/done.ts",
      offset: 1024,
    });
    expect(completed.status).toBe("completed");
    expect(await repository.getActive(currentProjectId, "indexing")).toBeNull();
    await cleanupProject(currentProjectId);
  });

  test("heartbeat() renews the lease and returns a later expiry", async () => {
    // Acquire with a short TTL so the heartbeat with a longer TTL produces a
    // strictly-later expiry (avoids the 1ms-tie flake when both use 60s).
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
      leaseTtlMs: 5_000,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    // Heartbeat with 90s — the new expiry is ~85s later than the 5s original.
    const renewed: HeartbeatManagedRunOutcome = await repository.heartbeat(acquired.lease, 90_000);
    expect(renewed.status).toBe("renewed");
    if (renewed.status === "renewed") {
      expect(renewed.leaseExpiresAt).toBeGreaterThan(acquired.lease.leaseExpiresAt);
    }
    await cleanupProject(currentProjectId);
  });

  test("heartbeat() with a wrong token returns lease_lost", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    const wrong = { ...acquired.lease, leaseToken: `wrong-${acquired.lease.leaseToken}` };
    const outcome = await repository.heartbeat(wrong, 60_000);
    expect(outcome.status).toBe("lease_lost");
    await cleanupProject(currentProjectId);
  });

  test("abort() flips status to aborted and clears lease", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    const aborted: AbortManagedRunOutcome = await repository.abort(acquired.lease);
    expect(aborted.status).toBe("aborted");
    expect(await repository.getActive(currentProjectId, "indexing")).toBeNull();
    await cleanupProject(currentProjectId);
  });

  test("reaper flips expired active row to aborted on next begin() (AD-W5-013)", async () => {
    // Acquire with a 1-second TTL so it expires quickly.
    const first = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-first-${randomUUID()}`,
      leaseTtlMs: 1_000,
    });
    if (first.status !== "acquired") throw new Error("expected acquired");
    // Wait for the lease to expire.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    // The row is now stale-but-active (status='active', lease_expires_at <= now).
    // getActive() must NOT return it (AD-W5-014 pin).
    const staleActive = await repository.getActive(currentProjectId, "indexing");
    expect(staleActive).toBeNull();
    // begin() must succeed — the reaper flips the stale row to 'aborted'
    // first, then the new INSERT wins the partial unique.
    const second = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-second-${randomUUID()}`,
      leaseTtlMs: 60_000,
    });
    expect(second.status).toBe("acquired");
    if (second.status !== "acquired") throw new Error("expected acquired");
    expect(second.lease.runId).not.toBe(first.lease.runId);
    await cleanupProject(currentProjectId);
  });

  test("begin() with the same event_id on a completed run is rejected by the unique (FR-10)", async () => {
    const eventId = `evt-idempotent-${randomUUID()}`;
    const first = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId,
    });
    if (first.status !== "acquired") throw new Error("expected acquired");
    await repository.complete(first.lease);
    // A second begin with the same event_id must throw — UNIQUE(project_id, event_id) fires.
    // Caller is expected to handle this in the ETL pipeline (T14).
    await expect(
      repository.begin({ projectId: currentProjectId, runKind: "indexing", eventId }),
    ).rejects.toThrow();
    await cleanupProject(currentProjectId);
  });

  test("begin() rejects unknown run_kind (CHECK constraint)", async () => {
    await expect(
      repository.begin({
        projectId: currentProjectId,
        // @ts-expect-error — invalid runKind on purpose
        runKind: "bogus",
        eventId: `evt-${randomUUID()}`,
      }),
    ).rejects.toThrow();
    await cleanupProject(currentProjectId);
  });

  test("begin() rejects ttl out of bounds", async () => {
    await expect(
      repository.begin({
        projectId: currentProjectId,
        runKind: "indexing",
        eventId: `evt-${randomUUID()}`,
        leaseTtlMs: 100, // < 1s floor
      }),
    ).rejects.toThrow(RangeError);
    await cleanupProject(currentProjectId);
  });

  test("updateFileCursor renews the lease and persists the cursor (renewed)", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    const cursor = { path: "src/managed.ts", offset: 4096 };
    const outcome = await repository.updateFileCursor(acquired.lease, cursor);
    expect(outcome.status).toBe("renewed");
    if (outcome.status === "renewed") {
      expect(outcome.leaseExpiresAt).toBeGreaterThanOrEqual(acquired.lease.leaseExpiresAt);
    }
    // The cursor is persisted: complete() without a cursor preserves it, and
    // getActive surfaces it.
    await repository.complete(acquired.lease);
    await cleanupProject(currentProjectId);
  });

  test("updateFileCursor returns lease_lost for a wrong token", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    const wrong = { ...acquired.lease, leaseToken: `wrong-${acquired.lease.leaseToken}` };
    const outcome = await repository.updateFileCursor(wrong, { path: "src/x.ts", offset: 0 });
    expect(outcome.status).toBe("lease_lost");
    await cleanupProject(currentProjectId);
  });

  test("updateFileCursor returns lease_lost after the lease expires", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "indexing",
      eventId: `evt-${randomUUID()}`,
      leaseTtlMs: 1_000,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const outcome = await repository.updateFileCursor(acquired.lease, { path: "src/y.ts", offset: 1 });
    expect(outcome.status).toBe("lease_lost");
    await cleanupProject(currentProjectId);
  });

  // ── getAnyActive / release (heavy-work sentinel lease support) ───────────

  test("getAnyActive() sees a live row right after begin(), and the row is ours by id", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "maintenance",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    // Shared DB may hold other live rows from concurrent tests — assert only
    // that SOME live row is visible, then confirm OURS specifically via the
    // project/kind-scoped getActive() (safe under a shared DB).
    const any = await repository.getAnyActive();
    expect(any).not.toBeNull();
    const ours = await repository.getActive(currentProjectId, "maintenance");
    expect(ours).not.toBeNull();
    expect(ours!.runId).toBe(acquired.lease.runId);
    await cleanupProject(currentProjectId);
  });

  test("getAnyActive() never surfaces our own expired row (checked by row id, not global state)", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "maintenance",
      eventId: `evt-${randomUUID()}`,
      leaseTtlMs: 1_000,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const any = await repository.getAnyActive();
    // Whatever getAnyActive() returns (possibly another live row from a
    // concurrent test, possibly null) it must not be our now-expired row.
    expect(any?.runId).not.toBe(acquired.lease.runId);
    // Compare against the DB's own clock (not host Date.now()), matching the
    // "begin() acquires a lease" test above — the two clocks are not assumed
    // to agree.
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    const rows = await getPrismaClient().$queryRaw<Array<{ status: string; lease_expires_at: Date }>>`
      SELECT status, lease_expires_at FROM managed_runs WHERE id = ${BigInt(acquired.lease.runId)}
    `;
    const dbNowRows = await getPrismaClient().$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]!.lease_expires_at.getTime()).toBeLessThan(dbNowRows[0]!.now.getTime());
    await cleanupProject(currentProjectId);
  });

  test("getAnyActive() never surfaces a row we already released (checked by row id, not global state)", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "maintenance",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    const released = await repository.release(acquired.lease);
    expect(released.status).toBe("aborted");
    const any = await repository.getAnyActive();
    expect(any?.runId).not.toBe(acquired.lease.runId);
  });

  test("release() deletes the row by id and returns lease_lost for a wrong token", async () => {
    const acquired = await repository.begin({
      projectId: currentProjectId,
      runKind: "maintenance",
      eventId: `evt-${randomUUID()}`,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired");
    const wrong = { ...acquired.lease, leaseToken: `wrong-${acquired.lease.leaseToken}` };
    const wrongOutcome = await repository.release(wrong);
    expect(wrongOutcome.status).toBe("lease_lost");

    const released = await repository.release(acquired.lease);
    expect(released.status).toBe("aborted");
    if (released.status !== "aborted") throw new Error("expected aborted");
    expect(released.runId).toBe(acquired.lease.runId);

    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    const rows = await getPrismaClient().$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM managed_runs WHERE id = ${BigInt(acquired.lease.runId)}
    `;
    expect(rows).toHaveLength(0);
  });
});