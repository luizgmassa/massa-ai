/**
 * PgSynapseSessionStore — PostgreSQL parity tests.
 *
 * Runs against the dedicated maintenance DB (127.0.0.1:5433/massa_ai_test)
 * with pgvector + migrations. Skips unless MASSA_AI_DEDICATED=1 and the
 * DATABASE_URL points at the dedicated test DB. Every fixture is scoped by a
 * unique session id prefix and removed after the test.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { PgSynapseSessionStore } from "../services/synapse/session/session-store-pg.js";
import { resetSessionStore } from "../services/synapse/session/session-store.js";
import { WorkingMemoryBuffer, DEFAULT_BUFFER_CONFIG } from "../services/synapse/buffer/working-memory-buffer.js";
import type { AgentSession } from "../services/synapse/types.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1"
  && /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);
const RUN_PG = process.env.RUN_POSTGRES_TESTS === "1";
const TEST_PREFIX = "pgsyn-test-";

let prisma: any;
let store: PgSynapseSessionStore;

function sid(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID()}`;
}

function mkSession(overrides: Partial<AgentSession> & { sessionId: string } = { sessionId: sid("base") }): AgentSession {
  const now = Date.now();
  return {
    sessionId: overrides.sessionId,
    agentId: overrides.agentId ?? "claude",
    workspaceId: overrides.workspaceId,
    taskContext: overrides.taskContext,
    taskTokens: overrides.taskTokens,
    taskEmbedding: overrides.taskEmbedding,
    ttlMs: overrides.ttlMs ?? 3600_000,
    createdAt: overrides.createdAt ?? now,
    expiresAt: overrides.expiresAt ?? now + 3600_000,
    accessHistory: overrides.accessHistory ?? new Map(),
    accessHistoryLimit: overrides.accessHistoryLimit ?? 1000,
    buffer: overrides.buffer,
  };
}

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM synapse_access_history WHERE session_id LIKE ${TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM synapse_sessions WHERE session_id LIKE ${TEST_PREFIX + "%"}`;
}

describe.skipIf(!(DEDICATED_DB && RUN_PG))("PgSynapseSessionStore — PostgreSQL parity", () => {
  beforeAll(async () => {
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
    await cleanup();
  });

  beforeEach(() => {
    store = new PgSynapseSessionStore();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    resetSessionStore();
  });

  test("save + load round-trips a minimal session via the in-memory mirror", async () => {
    const id = sid("roundtrip");
    const session = mkSession({ sessionId: id, agentId: "claude", taskContext: "debug auth" });
    store.save(session);
    await store.__drain();
    // sync load reads from the in-memory mirror
    const loaded = store.load(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.sessionId).toBe(id);
    expect(loaded!.agentId).toBe("claude");
    expect(loaded!.taskContext).toBe("debug auth");
  });

  test("save persists to PG and a fresh store hydrates it from PG", async () => {
    const id = sid("hydrate");
    const session = mkSession({
      sessionId: id,
      agentId: "claude",
      taskContext: "hydrate test",
      ttlMs: 7200_000,
    });
    store.save(session);
    await store.__drain();

    // Verify the row landed in PG.
    const rows = await prisma.$queryRaw<{ session_id: string }[]>`
      SELECT session_id FROM synapse_sessions WHERE session_id = ${id}
    `;
    expect(rows.length).toBe(1);

    // A fresh store instance hydrates from PG on first use.
    const fresh = new PgSynapseSessionStore();
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.agentId).toBe("claude");
    expect(loaded!.taskContext).toBe("hydrate test");
    expect(loaded!.ttlMs).toBe(7200_000);
  });

  test("save with taskTokens persists and restores them", async () => {
    const id = sid("tokens");
    const session = mkSession({
      sessionId: id,
      taskContext: "auth middleware",
      taskTokens: new Set(["auth", "middleware"]),
    });
    store.save(session);
    await store.__drain();

    const fresh = new PgSynapseSessionStore();
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.taskTokens).toBeInstanceOf(Set);
    expect(loaded!.taskTokens!.has("auth")).toBe(true);
    expect(loaded!.taskTokens!.has("middleware")).toBe(true);
  });

  test("save with taskEmbedding (Float32Array→Buffer) round-trips", async () => {
    const id = sid("emb");
    const embedding = [0.1, 0.2, 0.3, 0.4];
    const session = mkSession({
      sessionId: id,
      taskEmbedding: embedding,
    });
    store.save(session);
    await store.__drain();

    const fresh = new PgSynapseSessionStore();
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.taskEmbedding).toBeDefined();
    expect(Array.from(loaded!.taskEmbedding as number[])).toHaveLength(4);
    // Float32 precision: values should be close to original
    const arr = Array.from(loaded!.taskEmbedding as number[]);
    expect(arr[0]).toBeCloseTo(0.1, 5);
    expect(arr[3]).toBeCloseTo(0.4, 5);
  });

  test("save with workspaceId persists it", async () => {
    const id = sid("ws");
    const session = mkSession({ sessionId: id, workspaceId: "ws-123" });
    store.save(session);
    await store.__drain();

    const fresh = new PgSynapseSessionStore();
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded?.workspaceId).toBe("ws-123");
  });

  test("save with accessHistory persists and hydrates", async () => {
    const id = sid("acc");
    const session = mkSession({
      sessionId: id,
      accessHistory: new Map([["mem-1", 3], ["mem-2", 1]]),
    });
    store.save(session);
    await store.__drain();

    const fresh = new PgSynapseSessionStore();
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded?.accessHistory.get("mem-1")).toBe(3);
    expect(loaded?.accessHistory.get("mem-2")).toBe(1);
  });

  test("save with a buffer (config + snapshot) round-trips", async () => {
    const id = sid("buf");
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    const session = mkSession({ sessionId: id, buffer: buf });
    store.save(session);
    await store.__drain();

    const fresh = new PgSynapseSessionStore();
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded?.buffer).toBeDefined();
    expect(loaded!.buffer!.config.maxSize).toBe(DEFAULT_BUFFER_CONFIG.maxSize);
  });

  test("upsert (ON CONFLICT) updates an existing row instead of duplicating", async () => {
    const id = sid("upsert");
    const s1 = mkSession({ sessionId: id, agentId: "claude", taskContext: "v1" });
    store.save(s1);
    await store.__drain();

    const s2 = mkSession({ sessionId: id, agentId: "claude", taskContext: "v2" });
    store.save(s2);
    await store.__drain();

    const rows = await prisma.$queryRaw<{ task_context: string }[]>`
      SELECT task_context FROM synapse_sessions WHERE session_id = ${id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].task_context).toBe("v2");
  });

  test("load returns null for unknown session", () => {
    expect(store.load("definitely-not-here-" + randomUUID())).toBeNull();
  });

  test("delete removes from the mirror and PG", async () => {
    const id = sid("del");
    const session = mkSession({ sessionId: id });
    store.save(session);
    await store.__drain();
    expect(store.load(id)).not.toBeNull();

    store.delete(id);
    await store.__drain();

    expect(store.load(id)).toBeNull();
    const rows = await prisma.$queryRaw<{ session_id: string }[]>`
      SELECT session_id FROM synapse_sessions WHERE session_id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  test("delete also clears access history from PG", async () => {
    const id = sid("delacc");
    const session = mkSession({
      sessionId: id,
      accessHistory: new Map([["m1", 5]]),
    });
    store.save(session);
    await store.__drain();

    store.delete(id);
    await store.__drain();

    const accRows = await prisma.$queryRaw<{ session_id: string }[]>`
      SELECT session_id FROM synapse_access_history WHERE session_id = ${id}
    `;
    expect(accRows.length).toBe(0);
  });

  test("recordAccess updates the mirror synchronously and persists to PG", async () => {
    const id = sid("ra");
    const session = mkSession({ sessionId: id });
    store.save(session);
    await store.__drain();

    store.recordAccess(id, "mem-x", 2);
    // mirror updated synchronously
    const mirrored = store.load(id);
    expect(mirrored?.accessHistory.get("mem-x")).toBe(2);

    await store.__drain();

    const accRows = await prisma.$queryRaw<{ memory_id: string; access_count: number }[]>`
      SELECT memory_id, access_count FROM synapse_access_history WHERE session_id = ${id}
    `;
    expect(accRows.length).toBe(1);
    expect(accRows[0].memory_id).toBe("mem-x");
    expect(Number(accRows[0].access_count)).toBe(2);
  });

  test("recordAccess upserts (ON CONFLICT) on repeated calls", async () => {
    const id = sid("raup");
    const session = mkSession({ sessionId: id });
    store.save(session);
    await store.__drain();

    store.recordAccess(id, "mem-y", 1);
    await store.__drain();
    store.recordAccess(id, "mem-y", 4);
    await store.__drain();

    const accRows = await prisma.$queryRaw<{ memory_id: string; access_count: number }[]>`
      SELECT memory_id, access_count FROM synapse_access_history WHERE session_id = ${id} AND memory_id = ${"mem-y"}
    `;
    expect(accRows.length).toBe(1);
    expect(Number(accRows[0].access_count)).toBe(4);
  });

  test("recordAccess on unknown session does not throw (best-effort fire-and-forget)", async () => {
    const id = sid("raghost");
    expect(() => store.recordAccess(id, "mem-z", 1)).not.toThrow();
    await store.__drain();
    // The store is fire-and-forget: it persists the access row regardless of
    // whether the session exists in the mirror (best-effort). The contract is
    // "never throw", not "never persist for unknown sessions".
    const accRows = await prisma.$queryRaw<{ session_id: string }[]>`
      SELECT session_id FROM synapse_access_history WHERE session_id = ${id}
    `;
    expect(accRows.length).toBe(1);
    // cleanup
    await prisma.$executeRaw`DELETE FROM synapse_access_history WHERE session_id = ${id}`;
  });

  test("ensureReady resolves after hydration", async () => {
    await expect(store.ensureReady()).resolves.toBeUndefined();
  });

  test("__drain settles in-flight writes without hanging", async () => {
    const id = sid("drain");
    store.save(mkSession({ sessionId: id }));
    await expect(store.__drain()).resolves.toBeUndefined();
  });

  test("hydrate is idempotent (second call is a no-op)", async () => {
    await store.__hydrate();
    await store.__hydrate();
    // no throw means idempotent
  });

  test("in-flight save not in DB snapshot is re-applied after hydration", async () => {
    const id = sid("inflight");
    // Save to mirror but DON'T drain yet.
    store.save(mkSession({ sessionId: id, taskContext: "pre-hydrate" }));
    // Trigger a fresh hydration (snapshot won't have this row yet).
    const fresh = new PgSynapseSessionStore();
    // Copy the in-flight mirror entry by saving to fresh before hydrate.
    fresh.save(mkSession({ sessionId: id, taskContext: "pre-hydrate" }));
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded?.taskContext).toBe("pre-hydrate");
    await fresh.__drain();
  });

  test("chained writes for the same session land in call order", async () => {
    const id = sid("chain");
    store.save(mkSession({ sessionId: id, taskContext: "first" }));
    store.save(mkSession({ sessionId: id, taskContext: "second" }));
    store.save(mkSession({ sessionId: id, taskContext: "third" }));
    await store.__drain();

    const fresh = new PgSynapseSessionStore();
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded?.taskContext).toBe("third");
  });

  test("save with null taskContext/taskTokens/taskEmbedding persists nulls", async () => {
    const id = sid("nulls");
    const session = mkSession({ sessionId: id });
    store.save(session);
    await store.__drain();

    const rows = await prisma.$queryRaw<{ task_context: string | null; task_tokens: string | null; task_embedding: Buffer | null }[]>`
      SELECT task_context, task_tokens, task_embedding FROM synapse_sessions WHERE session_id = ${id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].task_context).toBeNull();
    expect(rows[0].task_tokens).toBeNull();
    expect(rows[0].task_embedding).toBeNull();
  });

  test("save with empty accessHistory clears existing PG access rows (replace strategy)", async () => {
    const id = sid("replace");
    const s1 = mkSession({
      sessionId: id,
      accessHistory: new Map([["m1", 1], ["m2", 2]]),
    });
    store.save(s1);
    await store.__drain();

    // Now save with an empty accessHistory — should clear m1/m2.
    const s2 = mkSession({ sessionId: id, accessHistory: new Map() });
    store.save(s2);
    await store.__drain();

    const accRows = await prisma.$queryRaw<{ memory_id: string }[]>`
      SELECT memory_id FROM synapse_access_history WHERE session_id = ${id}
    `;
    expect(accRows.length).toBe(0);
  });

  test("chainWrite swallows write failures (best-effort, logged)", async () => {
    // Trigger a SQL failure: NaN cannot be cast to BIGINT, so the upsert
    // rejects and the chainWrite catch fires without throwing to the caller.
    const id = sid("fail");
    const bad = mkSession({ sessionId: id });
    bad.createdAt = NaN; // NaN::bigint -> SQL error
    expect(() => store.save(bad)).not.toThrow();
    await store.__drain();
    // The row should NOT have persisted.
    const rows = await prisma.$queryRaw<{ session_id: string }[]>`
      SELECT session_id FROM synapse_sessions WHERE session_id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  test("delete chainWrite swallows failures (best-effort)", async () => {
    // delete on a non-existent session is a no-op SQL-wise but should not throw.
    const id = sid("delghost");
    expect(() => store.delete(id)).not.toThrow();
    await store.__drain();
  });

  test("BigInt columns hydrate correctly (PG returns bigint for BIGINT)", async () => {
    const id = sid("bigint");
    const now = Date.now();
    const session = mkSession({
      sessionId: id,
      createdAt: now,
      expiresAt: now + 3_600_000,
      ttlMs: 3_600_000,
    });
    store.save(session);
    await store.__drain();

    const fresh = new PgSynapseSessionStore();
    await fresh.__hydrate();
    const loaded = fresh.load(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.createdAt).toBe(now);
    expect(loaded!.expiresAt).toBe(now + 3_600_000);
    expect(loaded!.ttlMs).toBe(3_600_000);
  });
});