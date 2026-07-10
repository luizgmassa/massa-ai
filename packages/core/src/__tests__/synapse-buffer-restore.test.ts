/**
 * Unit tests for Synapse buffer reconstruction (#17) + hydration race fix (#18).
 *
 * #17 — the live WorkingMemoryBuffer is reconstructed on session load/resume
 *   from the persisted bufferConfig + best-effort buffer snapshot, so a session
 *   resumed after a process restart keeps its primed working-set.
 * #18 — the registry's resume path awaits the store's async hydration so a
 *   resume immediately after a process start sees PG-persisted sessions.
 *
 * The #17 cases run against the SQLite store (sync, no PG needed) and a
 * simulated restart (fresh registry over the same store). The #18 cases assert
 * the SessionStore.ensureReady contract on the sync backends (resolves
 * instantly) and on the PG backend (awaits hydration) when DATABASE_URL is
 * postgres. The disabled/no-op behavior (MemorySessionStore) is preserved.
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
import fs from "fs";
import os from "os";
import path from "path";
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

// ── Imports after mock ──────────────────────────────────────────────────────
import { SqliteSessionStore, MemorySessionStore } from "../services/synapse/session/session-store.js";
import { SessionRegistry } from "../services/synapse/session/session-registry.js";
import {
  WorkingMemoryBuffer,
  DEFAULT_BUFFER_CONFIG,
  restoreWorkingMemoryBuffer,
  type BufferSnapshot,
} from "../services/synapse/buffer/working-memory-buffer.js";
import type { AgentSession } from "../services/synapse/types.js";
import type { SearchResult } from "@massa-th0th/shared";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const TEST_PREFIX = "pg-synapse-restore-test-";
let prisma: any;

let tmpDir: string;
let dbPath: string;

function mkResult(id: string, score = 0.8, content?: string): SearchResult {
  return {
    id,
    content: content ?? `content for ${id}`,
    score,
    source: "vector" as any,
    metadata: {} as any,
  };
}

function mkSession(over: Partial<AgentSession> = {}): AgentSession {
  const now = Date.now();
  return {
    sessionId: "s1",
    agentId: "agent-x",
    workspaceId: "ws-1",
    taskContext: "fix the auth bug",
    taskTokens: new Set(["fix", "the", "auth", "bug"]),
    ttlMs: 3_600_000,
    createdAt: now,
    expiresAt: now + 3_600_000,
    accessHistory: new Map(),
    accessHistoryLimit: 1000,
    ...over,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-th0th-buf-"));
  dbPath = path.join(tmpDir, "sessions.db");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── #17: buffer reconstruction (SQLite-backed, backend-agnostic) ────────────

describe("#17 buffer reconstruction on load/resume", () => {
  test("SqliteSessionStore.load reconstructs the live WorkingMemoryBuffer from the persisted snapshot", () => {
    const store = new SqliteSessionStore(dbPath);
    const s = mkSession({ sessionId: "buf-1" });
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.prime([mkResult("r1", 0.9), mkResult("r2", 0.7)]);
    s.buffer = buf;
    store.save(s);

    // Simulate a restart: the loaded session must carry a live buffer with the
    // primed entries preserved.
    const loaded = store.load("buf-1")!;
    expect(loaded.buffer).toBeInstanceOf(WorkingMemoryBuffer);
    expect(loaded.buffer!.size()).toBe(2);
    expect(loaded.buffer!.has("r1")).toBe(true);
    expect(loaded.buffer!.has("r2")).toBe(true);
  });

  test("a session resumed after a restart serves primed entries from the restored buffer (primed working-set survives)", () => {
    const store = new SqliteSessionStore(dbPath);
    const reg = new SessionRegistry(3_600_000, store);
    const s = reg.create({
      sessionId: "resume-1",
      agentId: "a",
      taskContext: "build the auth feature",
      bufferConfig: DEFAULT_BUFFER_CONFIG,
    });
    // Prime the buffer with always-relevant entries.
    s.buffer!.prime([
      mkResult("prime-1", 0.95, "auth middleware token validation"),
      mkResult("prime-2", 0.8, "session cookie expiry handling"),
    ]);
    // Persist the primed buffer (write-through).
    store.save(s);

    // Simulate a process restart: fresh registry over the same store.
    const reg2 = new SessionRegistry(3_600_000, store);
    const resumed = reg2.get("resume-1");
    expect(resumed).not.toBeNull();
    expect(resumed!.buffer).toBeInstanceOf(WorkingMemoryBuffer);
    // The primed entries survived the restart.
    expect(resumed!.buffer!.size()).toBe(2);
    expect(resumed!.buffer!.has("prime-1")).toBe(true);
    expect(resumed!.buffer!.has("prime-2")).toBe(true);
    // The restored buffer is LIVE: a get() that matches primed content surfaces
    // the primed entry with the hit boost applied (primed matching via content).
    const hot = resumed!.buffer!.get("auth token validation");
    expect(hot.results.some((r) => r.id === "prime-1")).toBe(true);
  });

  test("baselineScore is preserved per entry across the restart (no score drift)", () => {
    const store = new SqliteSessionStore(dbPath);
    const s = mkSession({ sessionId: "score-1" });
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.prime([mkResult("a", 0.91), mkResult("b", 0.42)]);
    s.buffer = buf;
    store.save(s);

    const loaded = store.load("score-1")!;
    const snapBefore = (loaded.buffer as any).entries as Map<string, any>;
    const beforeA = snapBefore.get("a").baselineScore;
    const beforeB = snapBefore.get("b").baselineScore;
    // The boosted score served from the buffer is derived from the persisted
    // baseline, not a previously-boosted snapshot — exercising get() does not
    // drift the baseline.
    loaded.buffer!.get("anything");
    const snapAfter = (loaded.buffer as any).entries as Map<string, any>;
    expect(snapAfter.get("a").baselineScore).toBe(beforeA);
    expect(snapAfter.get("b").baselineScore).toBe(beforeB);
  });

  test("a session without a buffer (no bufferConfig) loads with buffer === undefined (no-op preserved)", () => {
    const store = new SqliteSessionStore(dbPath);
    store.save(mkSession({ sessionId: "no-buf" })); // no buffer set
    const loaded = store.load("no-buf")!;
    expect(loaded.buffer).toBeUndefined();
  });

  test("restoreWorkingMemoryBuffer skips entries past TTL at restore time (no dead weight)", () => {
    const config = { ...DEFAULT_BUFFER_CONFIG, ttlMs: 1000 };
    const now = Date.now();
    const snapshot: BufferSnapshot = {
      config,
      entries: [
        {
          id: "fresh",
          addedAt: now,
          lastAccessedAt: now,
          baselineScore: 0.9,
          result: mkResult("fresh", 0.9),
        },
        {
          id: "stale",
          addedAt: now - 5000,
          lastAccessedAt: now - 5000, // well past ttlMs
          baselineScore: 0.8,
          result: mkResult("stale", 0.8),
        },
      ],
    };
    const buf = restoreWorkingMemoryBuffer(snapshot)!;
    expect(buf.size()).toBe(1);
    expect(buf.has("fresh")).toBe(true);
    expect(buf.has("stale")).toBe(false);
  });

  test("restoreWorkingMemoryBuffer returns undefined for a missing/malformed snapshot (degrades to fresh buffer)", () => {
    expect(restoreWorkingMemoryBuffer(null)).toBeUndefined();
    expect(restoreWorkingMemoryBuffer(undefined)).toBeUndefined();
    expect(restoreWorkingMemoryBuffer({} as BufferSnapshot)).toBeUndefined();
    expect(
      restoreWorkingMemoryBuffer({ config: DEFAULT_BUFFER_CONFIG } as BufferSnapshot),
    ).toBeUndefined();
  });
});

// ── #18: ensureReady hydration-race contract ────────────────────────────────

describe("#18 ensureReady hydration-race contract", () => {
  test("MemorySessionStore.ensureReady resolves immediately (no-op fallback preserved)", async () => {
    const store = new MemorySessionStore();
    await expect(store.ensureReady()).resolves.toBeUndefined();
  });

  test("SqliteSessionStore.ensureReady resolves immediately (sync backend)", async () => {
    const store = new SqliteSessionStore(dbPath);
    await expect(store.ensureReady()).resolves.toBeUndefined();
  });

  test("SessionRegistry.ensureReady with a sync store resolves immediately and does not throw without a store", async () => {
    const store = new SqliteSessionStore(dbPath);
    const reg = new SessionRegistry(3_600_000, store);
    await expect(reg.ensureReady()).resolves.toBeUndefined();
    // No store wired.
    const regNoStore = new SessionRegistry(3_600_000);
    await expect(regNoStore.ensureReady()).resolves.toBeUndefined();
  });

  test("SessionRegistry.getAsync awaits readiness then returns the session (resume path)", async () => {
    const store = new SqliteSessionStore(dbPath);
    const reg = new SessionRegistry(3_600_000, store);
    reg.create({ sessionId: "async-1", agentId: "a", taskContext: "x" });

    // Fresh registry over the same store simulates a restart; getAsync must
    // await readiness and then surface the persisted session.
    const reg2 = new SessionRegistry(3_600_000, store);
    const loaded = await reg2.getAsync("async-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.sessionId).toBe("async-1");
  });

  test("SessionRegistry.getAsync returns null for an unknown session after readiness", async () => {
    const store = new SqliteSessionStore(dbPath);
    const reg = new SessionRegistry(3_600_000, store);
    const loaded = await reg.getAsync("does-not-exist");
    expect(loaded).toBeNull();
  });
});

// ── #18: PG resume-immediately-after-restart (only when DATABASE_URL=postgres) ─

describe.skipIf(!DB_AVAILABLE)("#18 PG resume immediately after restart", () => {
  async function pgCleanup() {
    if (!prisma) return;
    await prisma.$executeRaw`DELETE FROM synapse_access_history WHERE session_id LIKE ${TEST_PREFIX + "%"}`;
    await prisma.$executeRaw`DELETE FROM synapse_sessions WHERE session_id LIKE ${TEST_PREFIX + "%"}`;
  }

  beforeAll(async () => {
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
    await pgCleanup();
  });

  afterAll(async () => {
    if (prisma) {
      await pgCleanup();
      const { disconnectPrisma } = await import("../services/query/prisma-client.js");
      await disconnectPrisma();
    }
  });

  afterEach(pgCleanup);

  test("PgSynapseSessionStore.ensureReady awaits hydration so a resume sees a PG-persisted session immediately", async () => {
    const { PgSynapseSessionStore } = await import("../services/synapse/session/session-store-pg.js");
    // Persist a session from storeA (warm).
    const storeA = new PgSynapseSessionStore();
    await storeA.ensureReady();
    const sid = `${TEST_PREFIX}${randomUUID()}`;
    storeA.save(mkSession({ sessionId: sid, taskContext: "resume right after restart" }));
    await storeA.__drain();

    // Simulate a process restart: fresh store, empty mirror. WITHOUT awaiting
    // readiness, load() returns null; WITH ensureReady, the session is visible.
    const storeB = new PgSynapseSessionStore();
    expect(storeB.load(sid)).toBeNull(); // pre-hydration race window
    await storeB.ensureReady();
    const loaded = storeB.load(sid);
    expect(loaded).not.toBeNull();
    expect(loaded!.taskContext).toBe("resume right after restart");
  });

  test("registry.getAsync resumes a PG session immediately after a restart (awaited hydration)", async () => {
    const { PgSynapseSessionStore } = await import("../services/synapse/session/session-store-pg.js");
    const storeA = new PgSynapseSessionStore();
    await storeA.ensureReady();
    const sid = `${TEST_PREFIX}${randomUUID()}`;
    const regA = new SessionRegistry(3_600_000, storeA);
    const s = regA.create({ sessionId: sid, agentId: "a", taskContext: "pg resume" });
    s.buffer = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    s.buffer.prime([mkResult("pg-prime-1", 0.9)]);
    storeA.save(s);
    await storeA.__drain();

    // Fresh store + registry = process restart. getAsync awaits hydration.
    const storeB = new PgSynapseSessionStore();
    const regB = new SessionRegistry(3_600_000, storeB);
    const loaded = await regB.getAsync(sid);
    expect(loaded).not.toBeNull();
    expect(loaded!.taskContext).toBe("pg resume");
    // #17 + #18 together: the restored buffer survives the PG restart.
    expect(loaded!.buffer).toBeInstanceOf(WorkingMemoryBuffer);
    expect(loaded!.buffer!.has("pg-prime-1")).toBe(true);
  });
});
