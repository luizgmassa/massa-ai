/**
 * Unit tests for PgObservationStore + factory dispatch (#15 — SG-2).
 *
 * Mirrors observation-repository.test.ts (SQLite) cases, adapted for
 * PgObservationStore's async-mirror design:
 *   - insert() updates an in-memory mirror SYNCHRONOUSLY (sync read contract);
 *     the PG row lands fire-and-forget.
 *   - a fresh PgObservationStore hydrates its mirror from PG on first use.
 *
 * The persistence round-trip + resume-after-restart tests await the
 * fire-and-forget write by polling a direct PG query ($queryRaw via the shared
 * prisma client) and by forcing hydration. The mirror-sync-read case asserts
 * the synchronous contract directly.
 *
 * Hygiene: all test observations use a test-only projectId prefix
 * (`pg-obs-test-…`) and are deleted in afterEach + afterAll. The shared DB
 * is left clean. Tests are skipped when DATABASE_URL is not postgres.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { randomUUID } from "crypto";

// ── Mock logger only (shared, no dedicated test file) ───────────────────────
const mockLogger = {
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  metric: mock(() => {}),
};

mock.module("@massa-th0th/shared", () => {
  const actual = require("@massa-th0th/shared");
  return { ...actual, logger: mockLogger };
});

// ── Import after mock ───────────────────────────────────────────────────────
import { PgObservationStore } from "../data/memory/observation-repository-pg.js";
import {
  getObservationStore,
  resetObservationStore,
  newObservationId,
  type Observation,
} from "../data/memory/observation-repository.js";
import { getCompactionSnapshotService, resetCompactionSnapshotService } from "../services/hooks/compaction-snapshot-service.js";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const TEST_PREFIX = "pg-obs-test-";
let prisma: any;

// ── helpers ──────────────────────────────────────────────────────────────────

function testProjectId(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
}

function makeObs(over: Partial<Observation> & { projectId: string }): Observation {
  return {
    id: over.id ?? newObservationId(),
    projectId: over.projectId,
    sessionId: over.sessionId ?? null,
    source: over.source ?? "user-prompt",
    category: over.category ?? "user-prompts",
    payloadJson: over.payloadJson ?? JSON.stringify({ prompt: "hello" }),
    importance: over.importance ?? 0.5,
    createdAt: over.createdAt ?? Date.now(),
  };
}

/** Read a raw observations row straight from PG (bypasses the mirror). */
async function pgGetObservationRow(id: string): Promise<any | null> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, project_id, session_id, source, category, payload_json, importance, created_at
    FROM observations WHERE id = ${id}`;
  return rows[0] ?? null;
}

/** Wait until an observation row is visible in PG, or timeout. */
async function waitForPGObservation(
  id: string,
  timeoutMs = 3000,
): Promise<any | null> {
  const deadline = Date.now() + timeoutMs;
  let row: any | null = null;
  while (Date.now() < deadline) {
    row = await pgGetObservationRow(id);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 25));
  }
  return row;
}

async function pgCleanup() {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM observations WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
}

// ── suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)("PgObservationStore — unit tests on PostgreSQL", () => {
  beforeAll(async () => {
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
    await pgCleanup();
  });

  afterAll(async () => {
    if (prisma) {
      await pgCleanup();
      // NOTE: do NOT disconnectPrisma() — kills the shared process-wide pool
      // for sibling suites in the same bun batch. Fixture rows are already
      // removed by pgCleanup(); the singleton client stays alive.
    }
  });

  beforeEach(() => {
    mockLogger.info.mockClear();
    return pgCleanup();
  });
  afterEach(pgCleanup);

  // ── mirror sync read (the sync ObservationStore contract) ───────────────

  describe("mirror sync read", () => {
    test("insert() makes listRecent return the observation synchronously (mirror hit)", () => {
      const store = new PgObservationStore();
      const pid = testProjectId();
      const obs = makeObs({ projectId: pid });
      store.insert(obs);
      // No await: the mirror is updated synchronously inside insert().
      const recent = store.listRecent(pid, 10);
      expect(recent.length).toBe(1);
      expect(recent[0].id).toBe(obs.id);
      expect(recent[0].projectId).toBe(pid);
      expect(recent[0].source).toBe("user-prompt");
      expect(recent[0].category).toBe("user-prompts");
    });

    test("insert() makes listBySession return the observation synchronously", () => {
      const store = new PgObservationStore();
      const pid = testProjectId();
      const sid = `sess-${randomUUID()}`;
      store.insert(makeObs({ projectId: pid, sessionId: sid }));
      const bySession = store.listBySession(sid, 10);
      expect(bySession.length).toBe(1);
      expect(bySession[0].sessionId).toBe(sid);
    });

    test("countByProject reflects mirror state synchronously", () => {
      const store = new PgObservationStore();
      const pid = testProjectId();
      expect(store.countByProject(pid)).toBe(0);
      store.insert(makeObs({ projectId: pid }));
      store.insert(makeObs({ projectId: pid }));
      expect(store.countByProject(pid)).toBe(2);
    });

    test("listRecent returns newest-first and respects limit", () => {
      const store = new PgObservationStore();
      const pid = testProjectId();
      store.insert(makeObs({ projectId: pid, createdAt: 100 }));
      store.insert(makeObs({ projectId: pid, createdAt: 300 }));
      store.insert(makeObs({ projectId: pid, createdAt: 200 }));
      const recent = store.listRecent(pid, 2);
      expect(recent.length).toBe(2);
      expect(recent[0].createdAt).toBeGreaterThanOrEqual(recent[1].createdAt);
    });

    test("journalMode returns 'postgres'", () => {
      const store = new PgObservationStore();
      expect(store.journalMode()).toBe("postgres");
    });
  });

  // ── persistence round-trip (fire-and-forget write → PG row) ─────────────

  describe("persistence round-trip", () => {
    test("insert() lands the observation row in PG with all columns", async () => {
      const store = new PgObservationStore();
      await store.__hydrate();
      const pid = testProjectId();
      const obs = makeObs({
        projectId: pid,
        sessionId: `sess-${randomUUID()}`,
        source: "post-tool-use",
        category: "tool-calls",
        payloadJson: JSON.stringify({ tool: "Edit", file: "a.ts" }),
        importance: 0.8,
        createdAt: 1234567890,
      });
      store.insert(obs);

      const row = await waitForPGObservation(obs.id);
      expect(row).not.toBeNull();
      expect(row.project_id).toBe(pid);
      expect(row.source).toBe("post-tool-use");
      expect(row.category).toBe("tool-calls");
      expect(row.payload_json).toBe(JSON.stringify({ tool: "Edit", file: "a.ts" }));
      expect(Number(row.importance)).toBe(0.8);
      expect(Number(row.created_at)).toBe(1234567890);
    });

    test("null session_id and null category round-trip", async () => {
      const store = new PgObservationStore();
      await store.__hydrate();
      const pid = testProjectId();
      // Construct inline so category is genuinely undefined (the helper's `??`
      // default would otherwise fill in "user-prompts").
      const obs: Observation = {
        id: newObservationId(),
        projectId: pid,
        sessionId: null,
        source: "session-start",
        category: undefined,
        payloadJson: JSON.stringify({ start: true }),
        importance: 0.3,
        createdAt: Date.now(),
      };
      store.insert(obs);

      const row = await waitForPGObservation(obs.id);
      expect(row).not.toBeNull();
      expect(row.session_id).toBeNull();
      expect(row.category).toBeNull();
    });

    test("repeated insert() upserts the same row (ON CONFLICT update)", async () => {
      const store = new PgObservationStore();
      await store.__hydrate();
      const pid = testProjectId();
      const id = newObservationId();
      // insert()'s PG write is fire-and-forget (no ordering guarantee between
      // two concurrent same-id upserts). Serialize at the test level: let the
      // v:1 write settle before issuing v:2, then wait for v:2 to be the final
      // committed value. Otherwise the two async upserts can commit out of order
      // and leave v:1 as the last-write-wins row.
      store.insert(makeObs({ id, projectId: pid, payloadJson: JSON.stringify({ v: 1 }) }));
      await waitForPGObservation(id);
      store.insert(makeObs({ id, projectId: pid, payloadJson: JSON.stringify({ v: 2 }) }));

      const deadline = Date.now() + 3000;
      let row: any = null;
      while (Date.now() < deadline) {
        row = await pgGetObservationRow(id);
        if (row && JSON.parse(row.payload_json).v === 2) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(row).not.toBeNull();
      expect(JSON.parse(row.payload_json).v).toBe(2);
    });
  });

  // ── resume after restart (new store hydrates from PG) ───────────────────

  describe("resume after restart", () => {
    test("an observation persisted by one store is visible in a fresh store after hydration", async () => {
      const storeA = new PgObservationStore();
      await storeA.__hydrate();
      const pid = testProjectId();
      const sid = `sess-${randomUUID()}`;
      storeA.insert(makeObs({ projectId: pid, sessionId: sid, createdAt: 500 }));
      storeA.insert(makeObs({ projectId: pid, sessionId: sid, createdAt: 600 }));
      await storeA.__drain();

      // Simulate a process restart: new store instance, empty mirror.
      const storeB = new PgObservationStore();
      // Before hydration, the mirror is empty → listBySession returns [].
      expect(storeB.listBySession(sid, 10).length).toBe(0);
      // After hydration, observations load from PG.
      await storeB.__hydrate();
      const bySession = storeB.listBySession(sid, 10);
      expect(bySession.length).toBe(2);
      expect(bySession[0].createdAt).toBeGreaterThanOrEqual(bySession[1].createdAt);
      expect(storeB.countByProject(pid)).toBe(2);
    });
  });

  // ── compaction snapshot round-trip under PG ─────────────────────────────

  describe("compaction snapshot round-trip under PG", () => {
    test("snapshot built from PG-backed store reflects persisted observations", async () => {
      const store = new PgObservationStore();
      await store.__hydrate();
      const pid = testProjectId();
      const sid = `sess-${randomUUID()}`;
      // Seed a few categorized observations.
      store.insert(makeObs({ projectId: pid, sessionId: sid, category: "user-prompts", createdAt: 100 }));
      store.insert(makeObs({ projectId: pid, sessionId: sid, category: "tool-calls", createdAt: 200 }));
      store.insert(makeObs({ projectId: pid, sessionId: sid, category: "tool-calls", createdAt: 300 }));
      await store.__drain();

      // The snapshot service reads via store.listBySession (sync mirror read).
      resetCompactionSnapshotService();
      const service = getCompactionSnapshotService(store);
      const snapshot = service.build({ sessionId: sid, projectId: pid, compactCount: 1 });

      expect(snapshot.sessionId).toBe(sid);
      expect(snapshot.projectId).toBe(pid);
      expect(snapshot.eventCount).toBe(3);
      // Two categories: tool-calls (2) and user-prompts (1).
      expect(snapshot.sections.length).toBe(2);
      // tool-calls is the most active → sorted first.
      expect(snapshot.sections[0].category).toBe("tool-calls");
      expect(snapshot.sections[0].count).toBe(2);
      expect(snapshot.sections[1].category).toBe("user-prompts");
      expect(snapshot.sections[1].count).toBe(1);
      expect(snapshot.xml).toContain("session_resume");
      resetCompactionSnapshotService();
    });

    test("snapshot rebuilt after a restart reads from the PG-hydrated mirror", async () => {
      const storeA = new PgObservationStore();
      await storeA.__hydrate();
      const pid = testProjectId();
      const sid = `sess-${randomUUID()}`;
      storeA.insert(makeObs({ projectId: pid, sessionId: sid, category: "decisions", createdAt: 100 }));
      await storeA.__drain();

      // Restart: fresh store + fresh service.
      const storeB = new PgObservationStore();
      await storeB.__hydrate();
      resetCompactionSnapshotService();
      const service = getCompactionSnapshotService(storeB);
      const snapshot = service.build({ sessionId: sid, projectId: pid, compactCount: 0 });

      expect(snapshot.eventCount).toBe(1);
      expect(snapshot.sections.length).toBe(1);
      expect(snapshot.sections[0].category).toBe("decisions");
      resetCompactionSnapshotService();
    });
  });
});

// ── Factory dispatch (runs regardless of DB availability) ─────────────────────

describe("getObservationStore factory dispatch", () => {
  afterEach(() => {
    resetObservationStore();
  });

  test("selects PgObservationStore when DATABASE_URL is postgres", () => {
    const original = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      const store = getObservationStore();
      // Constructor is the PG variant (the import is lazy; check the class name).
      expect(store.constructor.name).toBe("PgObservationStore");
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      resetObservationStore();
    }
  });

  test("selects SqliteObservationStore when DATABASE_URL is not postgres", () => {
    const original = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      const store = getObservationStore();
      expect(store.constructor.name).toBe("SqliteObservationStore");
    } finally {
      if (original !== undefined) process.env.DATABASE_URL = original;
      resetObservationStore();
    }
  });
});
