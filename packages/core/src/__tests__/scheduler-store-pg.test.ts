/** PostgreSQL parity and async-ordering tests for PgScheduledJobStore. */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { PgScheduledJobStore } from "../services/scheduler/scheduler-store-pg.js";
import type { ScheduledJob } from "../services/scheduler/scheduler-types.js";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const TEST_PREFIX = "pg-scheduler-test-";
const PROBE_PREFIX = "pg-scheduler-probe-"; // AC-01.4: a second prefix this suite also owns
let prisma: any;

/**
 * Ids this suite created. A shared database may carry unrelated rows (for
 * example the production scheduler's `scheduled-*` defaults); every
 * set-valued assertion is scoped to this suite's own TEST_PREFIX rows via a
 * positive allowlist, never a denylist of what to exclude.
 */
function own(entries: ScheduledJob[]): string[] {
  return entries.filter((e) => e.id.startsWith(TEST_PREFIX)).map((e) => e.id);
}

function job(
  id: string,
  overrides: Partial<ScheduledJob> = {},
): ScheduledJob {
  return {
    id,
    name: "test schedule",
    jobKind: "memory-consolidation",
    schedule: { type: "interval", intervalMs: 60_000 },
    nextRunAt: 2_000,
    lastRunAt: 1_000,
    enabled: true,
    payload: { projectId: "scheduler-parity" },
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    lastError: null,
    ...overrides,
  };
}

function testId(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
}

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRaw`
    DELETE FROM scheduled_jobs WHERE id LIKE ${TEST_PREFIX + "%"} OR id LIKE ${PROBE_PREFIX + "%"}
  `;
}

async function row(id: string): Promise<any | null> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT * FROM scheduled_jobs WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

async function hydrate(store: PgScheduledJobStore): Promise<void> {
  await (store as any).ensureHydrated();
}

describe.skipIf(!DB_AVAILABLE)("PgScheduledJobStore — PostgreSQL parity", () => {
  beforeAll(async () => {
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    prisma = getPrismaClient();
    await cleanup();
  });

  afterEach(cleanup);
  afterAll(cleanup);

  test("persists every field and hydrates interval and cron jobs after restart", async () => {
    const intervalId = testId();
    const cronId = testId();
    const storeA = new PgScheduledJobStore();
    await hydrate(storeA);

    storeA.save(job(intervalId));
    storeA.save(job(cronId, {
      name: "cron schedule",
      jobKind: "decay-sweep",
      schedule: { type: "cron", cron: "5 * * * *" },
      nextRunAt: 1_500,
      lastRunAt: 500,
      enabled: false,
      payload: { nested: { value: 42 }, flag: true },
    }));
    await storeA.__drain();

    const raw = await row(cronId);
    expect(raw).not.toBeNull();
    expect(raw.schedule_type).toBe("cron");
    expect(raw.interval_ms).toBeNull();
    expect(raw.cron).toBe("5 * * * *");
    expect(Number(raw.enabled)).toBe(0);
    expect(JSON.parse(raw.payload)).toEqual({ nested: { value: 42 }, flag: true });

    const storeB = new PgScheduledJobStore();
    expect(storeB.get(cronId)).toBeNull();
    await hydrate(storeB);

    expect(storeB.get(intervalId)).toEqual(job(intervalId));
    expect(storeB.get(cronId)).toEqual(job(cronId, {
      name: "cron schedule",
      jobKind: "decay-sweep",
      schedule: { type: "cron", cron: "5 * * * *" },
      nextRunAt: 1_500,
      lastRunAt: 500,
      enabled: false,
      payload: { nested: { value: 42 }, flag: true },
    }));
    expect(own(storeB.listAll())).toEqual([cronId, intervalId]);
    expect(own(storeB.listEnabled())).toEqual([intervalId]);

    // AC-01.4: a foreign row — matching neither this suite's TEST_PREFIX nor
    // the production `scheduled-` prefix — must not disturb the scoped
    // assertions above. AC-01.4a: enabled: false, so it stays invisible to a
    // live Scheduler.start(), which seeds its tick loop from listEnabled()
    // (see "Risks accepted" in spec.md).
    const probeId = `${PROBE_PREFIX}${randomUUID()}`;
    storeB.save(job(probeId, { enabled: false }));
    await storeB.__drain();

    expect(own(storeB.listAll())).toEqual([cronId, intervalId]);
    expect(own(storeB.listEnabled())).toEqual([intervalId]);

    storeB.delete(probeId);
    await storeB.__drain();
    expect(await row(probeId)).toBeNull();
  });

  // AC-01.3: the seam's one durable assertion — that cleanup() leaves no
  // test-prefixed row behind — survives as a plain assertion. AC-01.8 widens
  // it to both prefixes this suite owns.
  test("cleanup leaves no row from either prefix behind", async () => {
    const store = new PgScheduledJobStore();
    await hydrate(store);
    const allIds = store.listAll().map((entry) => entry.id);
    expect(
      allIds.filter((id) => id.startsWith(TEST_PREFIX) || id.startsWith(PROBE_PREFIX)),
    ).toEqual([]);
  });

  test("rapid same-ID saves commit in call order and preserve the latest value", async () => {
    const id = testId();
    const store = new PgScheduledJobStore();
    await hydrate(store);
    const actual = (store as any).getClient();
    let calls = 0;
    (store as any).prisma = {
      $queryRaw: (...args: any[]) => actual.$queryRaw.apply(actual, args),
      $executeRaw: async (...args: any[]) => {
        calls += 1;
        if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 75));
        return actual.$executeRaw.apply(actual, args);
      },
    };

    store.save(job(id, { name: "old", nextRunAt: 100 }));
    store.save(job(id, { name: "new", nextRunAt: 200 }));
    await store.__drain();

    const persisted = await row(id);
    expect(calls).toBe(2);
    expect(persisted.name).toBe("new");
    expect(Number(persisted.next_run_at)).toBe(200);
    expect(store.get(id)?.name).toBe("new");
  });

  test("save/delete mutations for one ID retain invocation ordering", async () => {
    const deletedId = testId();
    const restoredId = testId();
    const store = new PgScheduledJobStore();
    await hydrate(store);

    store.save(job(deletedId));
    store.delete(deletedId);
    store.delete(restoredId);
    store.save(job(restoredId, { name: "restored" }));
    await store.__drain();

    expect(await row(deletedId)).toBeNull();
    expect(store.get(deletedId)).toBeNull();
    expect((await row(restoredId))?.name).toBe("restored");
    expect(store.get(restoredId)?.name).toBe("restored");
  });

  test("a failed best-effort write settles and a later save recovers", async () => {
    const id = testId();
    const store = new PgScheduledJobStore();
    await hydrate(store);
    const actual = (store as any).getClient();
    let shouldFail = true;
    (store as any).prisma = {
      $queryRaw: (...args: any[]) => actual.$queryRaw.apply(actual, args),
      $executeRaw: (...args: any[]) => {
        if (shouldFail) {
          shouldFail = false;
          return Promise.reject(new Error("injected scheduler write failure"));
        }
        return actual.$executeRaw.apply(actual, args);
      },
    };

    store.save(job(id, { name: "failed write" }));
    await store.__drain();
    expect(await row(id)).toBeNull();
    expect(store.get(id)?.name).toBe("failed write");

    store.save(job(id, { name: "recovered write" }));
    await store.__drain();
    expect((await row(id))?.name).toBe("recovered write");
  });

  test("a failed hydration is retried and recovers on the next read", async () => {
    const id = testId();
    const seed = new PgScheduledJobStore();
    await hydrate(seed);
    seed.save(job(id, { name: "hydrate recovery" }));
    await seed.__drain();

    const store = new PgScheduledJobStore();
    const actual = (store as any).getClient();
    let shouldFail = true;
    (store as any).prisma = {
      $executeRaw: (...args: any[]) => actual.$executeRaw.apply(actual, args),
      $queryRaw: (...args: any[]) => {
        if (shouldFail) {
          shouldFail = false;
          return Promise.reject(new Error("injected scheduler hydration failure"));
        }
        return actual.$queryRaw.apply(actual, args);
      },
    };

    await hydrate(store);
    expect(store.get(id)).toBeNull();
    await store.__drain();
    expect(store.get(id)?.name).toBe("hydrate recovery");
  });
});
