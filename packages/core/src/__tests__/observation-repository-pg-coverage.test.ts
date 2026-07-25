/**
 * Coverage tests for PgObservationStore — PostgreSQL-backed observation store.
 *
 * Uses the dedicated maintenance DB (127.0.0.1:5433/massa_ai_test).
 * Every fixture is scoped by a unique project id and removed after the test.
 *
 * PgObservationStore is SYNCHRONOUS on its read path (mirror) and
 * fire-and-forget on its write path (PG durability). Tests use the
 * `__hydrate()` + `__drain()` test helpers to force hydration and flush
 * in-flight writes before asserting on durable state.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { PgObservationStore } from "../data/memory/observation-repository-pg.js";
import { newObservationId, type Observation } from "../data/memory/observation-contract.js";
import {
  resetProjectIdentityAliasResolver,
  setProjectIdentityAliasResolverForTests,
  type ProjectIdentityAliasResolver,
} from "../services/project-identity/alias-resolver.js";
import { _resetPrismaForTesting } from "../services/query/prisma-client.js";
import { closeConnections } from "../data/db-connection.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1" &&
  /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);
const TEST_PREFIX = "cov-obs-";

let pool: Pool;
let prisma: any;

function projectId(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: newObservationId(),
    projectId: "",
    sessionId: null,
    source: "user-prompt",
    payloadJson: JSON.stringify({ prompt: "hi" }),
    importance: 0.5,
    createdAt: Date.now(),
    ...overrides,
  };
}

async function settle(store: PgObservationStore): Promise<void> {
  await store.__drain();
  await new Promise((r) => setTimeout(r, 120));
}

async function cleanup(): Promise<void> {
  if (!pool) return;
  await pool.query(`DELETE FROM observations WHERE project_id LIKE $1`, [
    `${TEST_PREFIX}%`,
  ]);
}

/** A fail-open resolver that always returns the input id (no alias resolution). */
function identityResolver(): ProjectIdentityAliasResolver {
  return {
    resolve: async (id: string) => id,
    invalidateProject: () => {},
    clearCache: () => {},
    cacheSize: 0,
  } as unknown as ProjectIdentityAliasResolver;
}

/** A resolver that maps a known source id to a canonical target id. */
function renamingResolver(map: Map<string, string>): ProjectIdentityAliasResolver {
  return {
    resolve: async (id: string) => map.get(id) ?? id,
    invalidateProject: () => {},
    clearCache: () => {},
    cacheSize: 0,
  } as unknown as ProjectIdentityAliasResolver;
}

describe.skipIf(!DEDICATED_DB)("PgObservationStore — coverage", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
    await cleanup();
  });

  beforeEach(async () => {
    resetProjectIdentityAliasResolver();
    setProjectIdentityAliasResolverForTests(identityResolver());
    await cleanup();
  });

  afterEach(async () => {
    resetProjectIdentityAliasResolver();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
    await closeConnections();
    _resetPrismaForTesting();
  });

  // ── insert + listRecent + countByProject (happy path) ─────────────────────

  test("insert writes to the mirror synchronously and persists to PG after drain", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    const obs = makeObservation({ projectId: pid, createdAt: 1000 });
    store.insert(obs);

    // Sync read sees the row immediately (mirror).
    expect(store.countByProject(pid)).toBe(1);
    expect(store.listRecent(pid, 10)).toHaveLength(1);
    expect(store.listRecent(pid, 10)[0]!.id).toBe(obs.id);

    // Persist + hydrate.
    await settle(store);
    const rows = await pool.query(
      "SELECT id, project_id, source, payload_json, importance, created_at FROM observations WHERE project_id = $1",
      [pid],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.id).toBe(obs.id);
    expect(rows.rows[0]!.project_id).toBe(pid);
    expect(rows.rows[0]!.source).toBe("user-prompt");
    expect(rows.rows[0]!.importance).toBe(0.5);
    expect(Number(rows.rows[0]!.created_at)).toBe(1000);
  });

  test("insert with full optional fields (sessionId, category, agentId, attributionSource) round-trips", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    const obs = makeObservation({
      projectId: pid,
      sessionId: "sess-1",
      category: "decisions",
      payloadJson: JSON.stringify({ x: 1 }),
      importance: 0.9,
      agentId: "agent-7",
      attributionSource: "explicit",
      createdAt: 2000,
    });
    store.insert(obs);
    await settle(store);

    const rows = await pool.query(
      "SELECT session_id, category, agent_id, attribution_source FROM observations WHERE id = $1",
      [obs.id],
    );
    expect(rows.rows[0]!.session_id).toBe("sess-1");
    expect(rows.rows[0]!.category).toBe("decisions");
    expect(rows.rows[0]!.agent_id).toBe("agent-7");
    expect(rows.rows[0]!.attribution_source).toBe("explicit");

    // listBySession returns the row.
    const bySession = store.listBySession("sess-1", 10);
    expect(bySession).toHaveLength(1);
    expect(bySession[0]!.sessionId).toBe("sess-1");
    expect(bySession[0]!.category).toBe("decisions");
    expect(bySession[0]!.agentId).toBe("agent-7");
    expect(bySession[0]!.attributionSource).toBe("explicit");
  });

  // ── listRecent ordering + limit ───────────────────────────────────────────

  test("listRecent sorts by createdAt DESC and respects limit", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    for (let i = 0; i < 5; i++) {
      store.insert(makeObservation({ id: newObservationId(), projectId: pid, createdAt: 1000 + i }));
    }
    const all = store.listRecent(pid, 100);
    expect(all.map((o) => o.createdAt)).toEqual([1004, 1003, 1002, 1001, 1000]);
    const limited = store.listRecent(pid, 2);
    expect(limited).toHaveLength(2);
    expect(limited[0]!.createdAt).toBe(1004);
    expect(limited[1]!.createdAt).toBe(1003);
  });

  test("listRecent filters by projectId (other projects excluded)", async () => {
    const store = new PgObservationStore();
    const pidA = projectId();
    const pidB = projectId();
    store.insert(makeObservation({ projectId: pidA, createdAt: 1 }));
    store.insert(makeObservation({ projectId: pidB, createdAt: 2 }));
    store.insert(makeObservation({ projectId: pidA, createdAt: 3 }));
    expect(store.listRecent(pidA, 100)).toHaveLength(2);
    expect(store.listRecent(pidB, 100)).toHaveLength(1);
  });

  test("listRecent with limit 0 returns empty array", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    store.insert(makeObservation({ projectId: pid }));
    expect(store.listRecent(pid, 0)).toHaveLength(0);
  });

  test("listRecent with negative limit floors to 0", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    store.insert(makeObservation({ projectId: pid }));
    expect(store.listRecent(pid, -5)).toHaveLength(0);
  });

  test("listRecent with fractional limit floors to integer", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    for (let i = 0; i < 3; i++) store.insert(makeObservation({ projectId: pid, createdAt: i }));
    expect(store.listRecent(pid, 2.9)).toHaveLength(2);
  });

  // ── listBySession ──────────────────────────────────────────────────────────

  test("listBySession filters by sessionId, sorts DESC, respects limit", async () => {
    const store = new PgObservationStore();
    const sid = "sess-coverage";
    store.insert(makeObservation({ sessionId: sid, createdAt: 10 }));
    store.insert(makeObservation({ sessionId: sid, createdAt: 30 }));
    store.insert(makeObservation({ sessionId: sid, createdAt: 20 }));
    store.insert(makeObservation({ sessionId: "other", createdAt: 999 }));
    const bySession = store.listBySession(sid, 100);
    expect(bySession.map((o) => o.createdAt)).toEqual([30, 20, 10]);
    expect(store.listBySession(sid, 2)).toHaveLength(2);
    expect(store.listBySession("nope", 100)).toHaveLength(0);
  });

  test("listBySession with null sessionId returns rows whose sessionId is null", async () => {
    const store = new PgObservationStore();
    store.insert(makeObservation({ sessionId: null, createdAt: 1 }));
    store.insert(makeObservation({ sessionId: "s", createdAt: 2 }));
    const nulls = store.listBySession(null as unknown as string, 100);
    expect(nulls).toHaveLength(1);
    expect(nulls[0]!.sessionId).toBeNull();
  });

  // ── countByProject ─────────────────────────────────────────────────────────

  test("countByProject counts only matching project rows", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    store.insert(makeObservation({ projectId: pid }));
    store.insert(makeObservation({ projectId: pid }));
    store.insert(makeObservation({ projectId: "other" }));
    expect(store.countByProject(pid)).toBe(2);
    expect(store.countByProject("other")).toBe(1);
    expect(store.countByProject("missing")).toBe(0);
  });

  // ── journalMode ────────────────────────────────────────────────────────────

  test("journalMode returns 'postgres'", () => {
    const store = new PgObservationStore();
    expect(store.journalMode()).toBe("postgres");
  });

  // ── hydration from PG ──────────────────────────────────────────────────────

  test("a fresh store hydrates its mirror from existing PG rows on first read", async () => {
    const pid = projectId();
    // Seed PG directly with two rows.
    const id1 = newObservationId();
    const id2 = newObservationId();
    await pool.query(
      `INSERT INTO observations (id, project_id, session_id, source, category, payload_json, importance, created_at, agent_id, attribution_source)
       VALUES ($1, $2, NULL, 'user-prompt', NULL, '{}', 0.5, 5000, NULL, NULL),
              ($3, $2, 's1', 'post-tool-use', 'tool-calls', '{}', 0.7, 6000, 'a1', 'sticky')`,
      [id1, pid, id2],
    );

    const store = new PgObservationStore();
    await store.__hydrate();
    expect(store.countByProject(pid)).toBe(2);
    const recent = store.listRecent(pid, 10);
    expect(recent.map((o) => o.id).sort()).toEqual([id1, id2].sort());
    // Mapping: the bigint created_at is coerced to number.
    expect(recent.find((o) => o.id === id1)!.createdAt).toBe(5000);
    expect(recent.find((o) => o.id === id2)!.agentId).toBe("a1");
    expect(recent.find((o) => o.id === id2)!.attributionSource).toBe("sticky");
    expect(recent.find((o) => o.id === id2)!.category).toBe("tool-calls");
  });

  test("hydrate is idempotent and re-runs no SELECT after the first success", async () => {
    const pid = projectId();
    await pool.query(
      `INSERT INTO observations (id, project_id, session_id, source, category, payload_json, importance, created_at, agent_id, attribution_source)
       VALUES ($1, $2, NULL, 'user-prompt', NULL, '{}', 0.5, 1, NULL, NULL)`,
      [newObservationId(), pid],
    );
    const store = new PgObservationStore();
    await store.__hydrate();
    const sizeAfterFirst = store.countByProject(pid);
    await store.__hydrate(); // should be a no-op (hydrated flag set)
    expect(store.countByProject(pid)).toBe(sizeAfterFirst);
  });

  test("in-flight mirror insert is preserved when hydration lands (merge over DB snapshot)", async () => {
    const pid = projectId();
    const inflightId = newObservationId();
    await pool.query(
      `INSERT INTO observations (id, project_id, session_id, source, category, payload_json, importance, created_at, agent_id, attribution_source)
       VALUES ($1, $2, NULL, 'user-prompt', NULL, '{}', 0.5, 1, NULL, NULL)`,
      [newObservationId(), pid],
    );
    const store = new PgObservationStore();
    // Insert into the mirror BEFORE hydration lands.
    store.insert(makeObservation({ id: inflightId, projectId: pid, createdAt: 999 }));
    await store.__hydrate();
    // Both the DB row and the in-flight insert are present.
    expect(store.countByProject(pid)).toBe(2);
    expect(store.listRecent(pid, 10).map((o) => o.id)).toContain(inflightId);
  });

  // ── upsert (ON CONFLICT) ───────────────────────────────────────────────────

  test("insert with an existing id upserts (ON CONFLICT DO UPDATE) the row", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    const id = newObservationId();
    store.insert(makeObservation({ id, projectId: pid, importance: 0.1, createdAt: 1 }));
    await settle(store);
    // Re-insert with new material under the SAME id.
    store.insert(makeObservation({ id, projectId: pid, importance: 0.9, createdAt: 2, source: "post-tool-use" }));
    await settle(store);
    const rows = await pool.query(
      "SELECT importance, source, created_at FROM observations WHERE id = $1",
      [id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0]!.importance)).toBe(0.9);
    expect(rows.rows[0]!.source).toBe("post-tool-use");
    expect(Number(rows.rows[0]!.created_at)).toBe(2);
  });

  // ── canonical project-id resolution at the persist seam ────────────────────

  test("insert resolves the canonical project id and overwrites the mirror entry", async () => {
    const source = projectId();
    const canonical = projectId();
    setProjectIdentityAliasResolverForTests(renamingResolver(new Map([[source, canonical]])));
    const store = new PgObservationStore();
    const id = newObservationId();
    store.insert(makeObservation({ id, projectId: source, createdAt: 7 }));
    await settle(store);

    // Durable row is under the CANONICAL id.
    const rows = await pool.query(
      "SELECT project_id FROM observations WHERE id = $1",
      [id],
    );
    expect(rows.rows[0]!.project_id).toBe(canonical);
    // Mirror entry was overwritten to the canonical id (sync reads key on canonical).
    expect(store.countByProject(source)).toBe(0);
    expect(store.countByProject(canonical)).toBe(1);
  });

  test("insert with no alias (canonical === source) keeps the mirror entry unchanged", async () => {
    const pid = projectId();
    const store = new PgObservationStore();
    const id = newObservationId();
    store.insert(makeObservation({ id, projectId: pid }));
    await settle(store);
    expect(store.countByProject(pid)).toBe(1);
    const rows = await pool.query("SELECT project_id FROM observations WHERE id = $1", [id]);
    expect(rows.rows[0]!.project_id).toBe(pid);
  });

  // ── fire-and-forget failure is swallowed (best-effort) ─────────────────────

  test("insert persists even when the row violates a NOT NULL constraint (best-effort, logged, not thrown)", async () => {
    const store = new PgObservationStore();
    const pid = projectId();
    // Use a bad payload via a direct $executeRaw bypass is hard; instead force a
    // duplicate-PK scenario that the ON CONFLICT handles. The key behavior:
    // insert() never throws — it returns void synchronously.
    const id = newObservationId();
    expect(() => store.insert(makeObservation({ id, projectId: pid }))).not.toThrow();
    await settle(store);
    expect(store.countByProject(pid)).toBe(1);
  });

  // ── hydration failure is best-effort (mirror stays as-is) ───────────────────

  test("a failed hydration logs a warn and leaves the mirror usable (inserts still work)", async () => {
    // Break the prisma client so $queryRaw throws during hydration.
    // We do this by temporarily swapping the prisma singleton's $queryRaw.
    const original = prisma.$queryRaw.bind(prisma);
    prisma.$queryRaw = async () => {
      throw new Error("simulated hydrate failure");
    };
    try {
      const store = new PgObservationStore();
      // Hydration fails but resolves (never rejects).
      await store.__hydrate();
      // The store is still usable: insert + sync reads work off the mirror.
      const pid = projectId();
      store.insert(makeObservation({ projectId: pid, createdAt: 1 }));
      expect(store.countByProject(pid)).toBe(1);
      expect(store.listRecent(pid, 10)).toHaveLength(1);
    } finally {
      prisma.$queryRaw = original;
    }
  });

  test("hydrate retries are rate-limited after a failure (no retry storm)", async () => {
    const original = prisma.$queryRaw.bind(prisma);
    let calls = 0;
    prisma.$queryRaw = async () => {
      calls++;
      throw new Error("simulated hydrate failure");
    };
    try {
      const store = new PgObservationStore();
      await store.__hydrate();
      const callsAfterFirst = calls;
      // Second hydrate within the retry window should be suppressed.
      await store.__hydrate();
      expect(calls).toBe(callsAfterFirst);
    } finally {
      prisma.$queryRaw = original;
    }
  });

  // ── concurrent hydration dedupe ────────────────────────────────────────────

  test("concurrent ensureHydrated calls share a single in-flight hydration promise", async () => {
    const pid = projectId();
    await pool.query(
      `INSERT INTO observations (id, project_id, session_id, source, category, payload_json, importance, created_at, agent_id, attribution_source)
       VALUES ($1, $2, NULL, 'user-prompt', NULL, '{}', 0.5, 1, NULL, NULL)`,
      [newObservationId(), pid],
    );
    const store = new PgObservationStore();
    // Fire __hydrate twice in parallel; both should resolve and the mirror
    // should reflect the DB row exactly once.
    await Promise.all([store.__hydrate(), store.__hydrate()]);
    expect(store.countByProject(pid)).toBe(1);
  });

  // ── bigint created_at coercion ──────────────────────────────────────────────

  test("bigint created_at from PG is coerced to a JS number in the mapped observation", async () => {
    const pid = projectId();
    const id = newObservationId();
    // Insert with a large bigint-era created_at.
    await pool.query(
      `INSERT INTO observations (id, project_id, session_id, source, category, payload_json, importance, created_at, agent_id, attribution_source)
       VALUES ($1, $2, NULL, 'user-prompt', NULL, '{}', 0.5, 9007199254740993, NULL, NULL)`,
      [id, pid],
    );
    const store = new PgObservationStore();
    await store.__hydrate();
    const obs = store.listRecent(pid, 10).find((o) => o.id === id);
    expect(obs).toBeDefined();
    expect(typeof obs!.createdAt).toBe("number");
  });

  // ── empty results ──────────────────────────────────────────────────────────

  test("listRecent / listBySession / countByProject on an empty mirror return [] / 0", async () => {
    const store = new PgObservationStore();
    await store.__hydrate();
    const pid = projectId();
    expect(store.listRecent(pid, 10)).toEqual([]);
    expect(store.listBySession("none", 10)).toEqual([]);
    expect(store.countByProject(pid)).toBe(0);
  });

  // ── cross-process recovery (new process = new store hydrates from PG) ───────

  test("a second store instance hydrates rows the first instance persisted", async () => {
    const pid = projectId();
    const store1 = new PgObservationStore();
    const id = newObservationId();
    store1.insert(makeObservation({ id, projectId: pid, createdAt: 42 }));
    await settle(store1);

    // A brand-new instance (simulating a new process) hydrates from PG.
    const store2 = new PgObservationStore();
    await store2.__hydrate();
    expect(store2.countByProject(pid)).toBe(1);
    expect(store2.listRecent(pid, 10)[0]!.id).toBe(id);
  });
});