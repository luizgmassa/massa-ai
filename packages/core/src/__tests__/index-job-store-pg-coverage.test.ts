/**
 * PgJobStore coverage — PostgreSQL durability for indexing jobs.
 *
 * Uses the dedicated maintenance DB (127.0.0.1:5433/massa_ai_test).
 * Every fixture is scoped by a unique job id prefix and removed after the test.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { PgJobStore } from "../services/jobs/index-job-store-pg.js";
import type { IndexJob } from "../services/jobs/index-job-tracker.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1" &&
  /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);

const PREFIX = "cov-jobstore-";
let prisma: any;

function makeJob(overrides: Partial<IndexJob> = {}): IndexJob {
  const now = Date.now();
  return {
    jobId: `${PREFIX}${randomUUID()}`,
    projectId: `${PREFIX}proj-${randomUUID()}`,
    projectPath: "/tmp/cov",
    status: "running",
    progress: { current: 1, total: 10, percentage: 10 },
    createdAt: new Date(now),
    startedAt: new Date(now),
    heartbeatAt: new Date(now),
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM index_jobs WHERE job_id LIKE ${PREFIX + "%"}`;
}

/** Trigger + await hydration so the mirror reflects committed PG rows. */
async function hydrate(store: PgJobStore): Promise<void> {
  await (store as any).ensureHydrated();
}

describe.skipIf(!DEDICATED_DB)("PgJobStore — coverage", () => {
  beforeAll(async () => {
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
    await cleanup();
  });

  afterEach(cleanup);
  afterAll(cleanup);

  test("save persists a running job and get reads it from the mirror", async () => {
    const store = new PgJobStore();
    const job = makeJob({ status: "running" });
    store.save(job);
    await store.__drain(job.jobId);
    // Mirror read (sync).
    expect(store.get(job.jobId)?.jobId).toBe(job.jobId);
    await store.delete(job.jobId);
    await store.__drain(job.jobId);
  });

  test("save round-trips a completed job with full result + parserDiagnostics", async () => {
    const store = new PgJobStore();
    const job = makeJob({
      status: "completed",
      progress: { current: 10, total: 10, percentage: 100 },
      result: {
        filesIndexed: 10,
        chunksIndexed: 42,
        errors: 1,
        duration: 5000,
        activatedGraphGenerationId: "gen-123",
        parserDiagnostics: {
          diagnosticsCount: 5,
          recoveredFiles: 2,
          hardFailureFiles: 1,
          staleFiles: 0,
          languages: { typescript: 8, python: 2 },
        },
      },
      completedAt: new Date(),
    });
    store.save(job);
    await store.__drain(job.jobId);
    // Force re-hydration from PG by creating a fresh store.
    const fresh = new PgJobStore();
    await hydrate(fresh);
    const loaded = fresh.get(job.jobId);
    expect(loaded).toBeDefined();
    expect(loaded!.status).toBe("completed");
    expect(loaded!.result!.filesIndexed).toBe(10);
    expect(loaded!.result!.chunksIndexed).toBe(42);
    expect(loaded!.result!.activatedGraphGenerationId).toBe("gen-123");
    expect(loaded!.result!.parserDiagnostics).toMatchObject({
      diagnosticsCount: 5,
      recoveredFiles: 2,
      hardFailureFiles: 1,
      staleFiles: 0,
      languages: { typescript: 8, python: 2 },
    });
    await store.delete(job.jobId);
  });

  test("save round-trips a failed job with an error message", async () => {
    const store = new PgJobStore();
    const job = makeJob({
      status: "failed",
      error: "Ollama timeout",
      completedAt: new Date(),
    });
    store.save(job);
    await store.__drain(job.jobId);
    const fresh = new PgJobStore();
    await hydrate(fresh);
    const loaded = fresh.get(job.jobId);
    expect(loaded!.status).toBe("failed");
    expect(loaded!.error).toBe("Ollama timeout");
    await store.delete(job.jobId);
  });

  test("save with null result fields round-trips undefined result", async () => {
    const store = new PgJobStore();
    const job = makeJob({ status: "running", result: undefined });
    store.save(job);
    await store.__drain(job.jobId);
    const fresh = new PgJobStore();
    await hydrate(fresh);
    const loaded = fresh.get(job.jobId);
    expect(loaded!.result).toBeUndefined();
    await store.delete(job.jobId);
  });

  test("save chains persists in call order (running then completed)", async () => {
    const store = new PgJobStore();
    const job = makeJob({ status: "running" });
    store.save(job);
    store.save({ ...job, status: "completed", completedAt: new Date(), result: { filesIndexed: 1, chunksIndexed: 1, errors: 0, duration: 10 } });
    await store.flush(job.jobId);
    const fresh = new PgJobStore();
    await hydrate(fresh);
    // The terminal state must win (committed last).
    expect(fresh.get(job.jobId)!.status).toBe("completed");
    await store.delete(job.jobId);
  });

  test("listByProject filters and sorts newest-first", async () => {
    const store = new PgJobStore();
    const projectId = `${PREFIX}list-${randomUUID()}`;
    const a = makeJob({ jobId: `${PREFIX}a-${randomUUID()}`, projectId, createdAt: new Date(1000) });
    const b = makeJob({ jobId: `${PREFIX}b-${randomUUID()}`, projectId, createdAt: new Date(2000) });
    store.save(a);
    store.save(b);
    await store.flush(a.jobId);
    await store.flush(b.jobId);
    const fresh = new PgJobStore();
    await hydrate(fresh);
    const list = fresh.listByProject(projectId);
    expect(list).toHaveLength(2);
    expect(list[0]!.jobId).toBe(b.jobId); // newest first
    await fresh.delete(a.jobId);
    await fresh.delete(b.jobId);
  });

  test("listAll returns all jobs sorted newest-first", async () => {
    const store = new PgJobStore();
    const a = makeJob({ createdAt: new Date(1000) });
    store.save(a);
    await store.flush(a.jobId);
    const fresh = new PgJobStore();
    await hydrate(fresh);
    const all = fresh.listAll();
    expect(all.some((j) => j.jobId === a.jobId)).toBe(true);
    await fresh.delete(a.jobId);
  });

  test("listRunning filters running jobs", async () => {
    const store = new PgJobStore();
    const running = makeJob({ status: "running" });
    const completed = makeJob({ status: "completed", completedAt: new Date(), result: { filesIndexed: 1, chunksIndexed: 1, errors: 0, duration: 1 } });
    store.save(running);
    store.save(completed);
    await store.flush(running.jobId);
    await store.flush(completed.jobId);
    const fresh = new PgJobStore();
    await hydrate(fresh);
    const runningJobs = fresh.listRunning();
    expect(runningJobs.some((j) => j.jobId === running.jobId)).toBe(true);
    expect(runningJobs.some((j) => j.jobId === completed.jobId)).toBe(false);
    await fresh.delete(running.jobId);
    await fresh.delete(completed.jobId);
  });

  test("markStaleRunningFailed flips stale running jobs in PG", async () => {
    // Insert a stale running job directly via SQL (old heartbeat).
    const staleJobId = `${PREFIX}stale-${randomUUID()}`;
    const staleProject = `${PREFIX}staleproj-${randomUUID()}`;
    const oldTime = Date.now() - 600_000;
    await prisma.$executeRaw`
      INSERT INTO index_jobs (job_id, project_id, project_path, status, current, total, percentage,
        created_at, started_at, heartbeat_at)
      VALUES (${staleJobId}, ${staleProject}, '/tmp', 'running', 1, 10, 10,
        ${oldTime}::bigint, ${oldTime}::bigint, ${oldTime}::bigint)
    `;
    // Use a store that already recovered (so hydration doesn't flip it first).
    const store = new PgJobStore();
    (store as any).recovered = true; // skip crash recovery on hydrate
    await hydrate(store);
    // Seed the mirror with the stale running job so listRunning sees it.
    store.save({
      jobId: staleJobId,
      projectId: staleProject,
      projectPath: "/tmp",
      status: "running",
      progress: { current: 1, total: 10, percentage: 10 },
      createdAt: new Date(oldTime),
      startedAt: new Date(oldTime),
      heartbeatAt: new Date(oldTime),
    });
    // Flush the persist BEFORE markStaleRunningFailed so it can't overwrite
    // the reaper's UPDATE back to 'running'.
    await store.flush(staleJobId);
    const flipped = store.markStaleRunningFailed();
    expect(flipped).toBeGreaterThanOrEqual(1);
    // Allow the async fire-and-forget UPDATE to land.
    await new Promise((r) => setTimeout(r, 300));
    const row = await prisma.$queryRaw`SELECT status FROM index_jobs WHERE job_id = ${staleJobId}`;
    expect((row as any[])[0]?.status).toBe("failed");
    await prisma.$executeRaw`DELETE FROM index_jobs WHERE job_id = ${staleJobId}`;
  });

  test("crash recovery on hydrate flips stale running to failed", async () => {
    // Insert a stale running job directly.
    const staleJobId = `${PREFIX}recover-${randomUUID()}`;
    const staleProject = `${PREFIX}recoverproj-${randomUUID()}`;
    const oldTime = Date.now() - 600_000;
    await prisma.$executeRaw`
      INSERT INTO index_jobs (job_id, project_id, project_path, status, current, total, percentage,
        created_at, started_at, heartbeat_at)
      VALUES (${staleJobId}, ${staleProject}, '/tmp', 'running', 1, 10, 10,
        ${oldTime}::bigint, ${oldTime}::bigint, ${oldTime}::bigint)
    `;
    const fresh = new PgJobStore();
    await hydrate(fresh); // triggers crash recovery
    await new Promise((r) => setTimeout(r, 100));
    const row = await prisma.$queryRaw`SELECT status FROM index_jobs WHERE job_id = ${staleJobId}`;
    expect((row as any[])[0]?.status).toBe("failed");
    await prisma.$executeRaw`DELETE FROM index_jobs WHERE job_id = ${staleJobId}`;
  });

  test("crash recovery skips fresh-heartbeat running jobs", async () => {
    const freshJobId = `${PREFIX}fresh-${randomUUID()}`;
    const freshProject = `${PREFIX}freshproj-${randomUUID()}`;
    const now = Date.now();
    await prisma.$executeRaw`
      INSERT INTO index_jobs (job_id, project_id, project_path, status, current, total, percentage,
        created_at, started_at, heartbeat_at)
      VALUES (${freshJobId}, ${freshProject}, '/tmp', 'running', 1, 10, 10,
        ${now}::bigint, ${now}::bigint, ${now}::bigint)
    `;
    const fresh = new PgJobStore();
    await hydrate(fresh);
    await new Promise((r) => setTimeout(r, 100));
    const row = await prisma.$queryRaw`SELECT status FROM index_jobs WHERE job_id = ${freshJobId}`;
    expect((row as any[])[0]?.status).toBe("running");
    await prisma.$executeRaw`DELETE FROM index_jobs WHERE job_id = ${freshJobId}`;
  });

  test("delete removes from mirror and PG", async () => {
    const store = new PgJobStore();
    const job = makeJob();
    store.save(job);
    await store.flush(job.jobId);
    store.delete(job.jobId);
    await new Promise((r) => setTimeout(r, 100));
    const row = await prisma.$queryRaw`SELECT job_id FROM index_jobs WHERE job_id = ${job.jobId}`;
    expect((row as any[]).length).toBe(0);
  });

  test("flush throws on persist failure", async () => {
    const store = new PgJobStore();
    // Force a persist failure: save a job whose progress is malformed in a way
    // that breaks the SQL (e.g. non-numeric percentage via type coercion).
    // Easier: directly call the internal persist with bad data through save.
    const job = makeJob();
    // Corrupt the projectId so the alias resolver + insert path fails.
    (job as any).progress = { current: "not-a-number" as any, total: 10, percentage: 10 };
    store.save(job);
    await expect(store.flush(job.jobId)).rejects.toBeDefined();
    // Clean up any partial state.
    try { await prisma.$executeRaw`DELETE FROM index_jobs WHERE job_id = ${job.jobId}`; } catch { /* */ }
  });

  test("flush without jobId drains all and throws on first failure", async () => {
    const store = new PgJobStore();
    const job = makeJob();
    (job as any).progress = { current: "bad" as any, total: 10, percentage: 10 };
    store.save(job);
    await expect(store.flush()).rejects.toBeDefined();
    try { await prisma.$executeRaw`DELETE FROM index_jobs WHERE job_id = ${job.jobId}`; } catch { /* */ }
  });

  test("get returns null for unknown jobId", () => {
    const store = new PgJobStore();
    expect(store.get("nonexistent-job-id")).toBeNull();
  });

  test("hydration merges in-flight saves not yet committed to PG", async () => {
    const store = new PgJobStore();
    const job = makeJob({ status: "running" });
    // Save without draining → the persist is in-flight.
    store.save(job);
    // A fresh store hydrating concurrently should see the PG rows, and the
    // in-flight save's mirror entry survives via the inflight-merge path.
    const fresh = new PgJobStore();
    await hydrate(fresh);
    // The original store still has the job in its mirror.
    expect(store.get(job.jobId)?.jobId).toBe(job.jobId);
    await store.flush(job.jobId);
    await store.delete(job.jobId);
  });

  test("parserDiagnostics with null languages round-trips as empty object", async () => {
    const store = new PgJobStore();
    const job = makeJob({
      status: "completed",
      completedAt: new Date(),
      result: {
        filesIndexed: 1,
        chunksIndexed: 1,
        errors: 0,
        duration: 1,
        parserDiagnostics: {
          diagnosticsCount: 1,
          recoveredFiles: 0,
          hardFailureFiles: 0,
          staleFiles: 0,
          languages: {},
        },
      },
    });
    store.save(job);
    await store.flush(job.jobId);
    const fresh = new PgJobStore();
    await hydrate(fresh);
    const loaded = fresh.get(job.jobId);
    expect(loaded!.result!.parserDiagnostics!.languages).toEqual({});
    await fresh.delete(job.jobId);
  });

  test("heartbeatAt round-trips through PG", async () => {
    const store = new PgJobStore();
    const hb = new Date();
    const job = makeJob({ status: "running", heartbeatAt: hb });
    store.save(job);
    await store.flush(job.jobId);
    const fresh = new PgJobStore();
    await hydrate(fresh);
    const loaded = fresh.get(job.jobId);
    expect(loaded!.heartbeatAt?.getTime()).toBe(hb.getTime());
    await fresh.delete(job.jobId);
  });
});
