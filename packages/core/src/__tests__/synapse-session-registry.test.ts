import { describe, test, expect, beforeEach } from "bun:test";
import {
  SessionRegistry,
  getSessionRegistry,
  resetSessionRegistry,
} from "../services/synapse/session/session-registry.js";
import type { SessionStore } from "../services/synapse/session/session-store.js";
import type { AgentSession } from "../services/synapse/types.js";
import type { WorkingMemoryBufferConfig } from "../services/synapse/buffer/working-memory-buffer.js";

const DEFAULT_BUFFER_CONFIG: WorkingMemoryBufferConfig = {
  maxSize: 20,
  ttlMs: 900_000,
  hitBoost: 1.3,
  matchThreshold: 0.4,
};

class FakeStore implements SessionStore {
  saved: AgentSession[] = [];
  loaded: Map<string, AgentSession> = new Map();
  deleted: string[] = [];
  accesses: Array<{ sessionId: string; memoryId: string; count: number }> = [];
  readyCalls = 0;
  readyError: Error | null = null;
  saveError: Error | null = null;
  loadError: Error | null = null;
  deleteError: Error | null = null;
  recordAccessError: Error | null = null;

  save(session: AgentSession): void {
    if (this.saveError) throw this.saveError;
    this.saved.push(session);
    this.loaded.set(session.sessionId, session);
  }
  load(sessionId: string): AgentSession | null {
    if (this.loadError) throw this.loadError;
    return this.loaded.get(sessionId) ?? null;
  }
  delete(sessionId: string): void {
    if (this.deleteError) throw this.deleteError;
    this.deleted.push(sessionId);
    this.loaded.delete(sessionId);
  }
  recordAccess(sessionId: string, memoryId: string, count: number): void {
    if (this.recordAccessError) throw this.recordAccessError;
    this.accesses.push({ sessionId, memoryId, count });
  }
  ensureReady(): Promise<void> {
    this.readyCalls++;
    if (this.readyError) throw this.readyError;
    return Promise.resolve();
  }
}

describe("SessionRegistry", () => {
  test("creates and retrieves a session", () => {
    const reg = new SessionRegistry();
    const s = reg.create({
      sessionId: "abc",
      agentId: "claude",
      taskContext: "debugging auth timeout",
    });
    expect(s.agentId).toBe("claude");
    expect(s.taskTokens?.has("auth")).toBe(true);
    expect(reg.get("abc")?.sessionId).toBe("abc");
  });

  test("returns null and evicts after TTL", () => {
    const reg = new SessionRegistry(1000);
    const t0 = 1_000_000;
    reg.create({ sessionId: "abc", agentId: "claude" }, t0);
    expect(reg.get("abc", t0 + 500)).not.toBeNull();
    expect(reg.get("abc", t0 + 1500)).toBeNull();
  });

  test("returns null for unknown session", () => {
    const reg = new SessionRegistry();
    expect(reg.get("missing")).toBeNull();
  });

  test("updateTaskContext refreshes tokens and TTL", () => {
    const reg = new SessionRegistry(1000);
    const t0 = 1_000_000;
    reg.create({ sessionId: "abc", agentId: "claude", taskContext: "old" }, t0);
    const updated = reg.updateTaskContext("abc", "new task about auth middleware", undefined, t0 + 500);
    expect(updated?.taskTokens?.has("middleware")).toBe(true);
    expect(reg.get("abc", t0 + 1400)).not.toBeNull(); // TTL refreshed
  });

  test("recordAccess increments per-memory counters", () => {
    const reg = new SessionRegistry();
    reg.create({ sessionId: "abc", agentId: "claude" });
    reg.recordAccess("abc", "memory-1");
    reg.recordAccess("abc", "memory-1");
    reg.recordAccess("abc", "memory-2");
    const s = reg.get("abc")!;
    expect(s.accessHistory.get("memory-1")).toBe(2);
    expect(s.accessHistory.get("memory-2")).toBe(1);
  });

  test("evictExpired sweeps stale sessions", () => {
    const reg = new SessionRegistry(1000);
    const t0 = 1_000_000;
    reg.create({ sessionId: "a", agentId: "claude" }, t0);
    reg.create({ sessionId: "b", agentId: "claude", ttlMs: 5000 }, t0);
    const evicted = reg.evictExpired(t0 + 2000);
    expect(evicted).toBe(1);
    expect(reg.size()).toBe(1);
    expect(reg.get("b", t0 + 2000)).not.toBeNull();
  });
});

// ── store integration + async paths + singleton + error swallowing ─────────

describe("SessionRegistry — store integration", () => {
  test("create write-throughs to the store", () => {
    const store = new FakeStore();
    const reg = new SessionRegistry(1000, store);
    const s = reg.create({ sessionId: "s1", agentId: "claude" });
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0].sessionId).toBe("s1");
    expect(s.accessHistoryLimit).toBe(1000); // default
  });

  test("create respects accessHistoryMaxEntries override", () => {
    const reg = new SessionRegistry();
    const s = reg.create({
      sessionId: "lim",
      agentId: "claude",
      accessHistoryMaxEntries: 3,
    });
    expect(s.accessHistoryLimit).toBe(3);
  });

  test("create throws on duplicate sessionId", () => {
    const reg = new SessionRegistry();
    reg.create({ sessionId: "dup", agentId: "claude" });
    expect(() => reg.create({ sessionId: "dup", agentId: "claude" })).toThrow(
      "Session already exists: dup",
    );
  });

  test("create swallows store.save errors (best-effort)", () => {
    const store = new FakeStore();
    store.saveError = new Error("pg down");
    const reg = new SessionRegistry(1000, store);
    // Must not throw — the session is still created in-memory.
    const s = reg.create({ sessionId: "se", agentId: "claude" });
    expect(s.sessionId).toBe("se");
    expect(reg.get("se")?.sessionId).toBe("se");
  });

  test("create with bufferConfig attaches a WorkingMemoryBuffer", () => {
    const reg = new SessionRegistry();
    const s = reg.create({
      sessionId: "buf",
      agentId: "claude",
      bufferConfig: DEFAULT_BUFFER_CONFIG,
    });
    expect(s.buffer).toBeDefined();
    expect(s.buffer?.config.maxSize).toBe(20);
  });

  test("create with taskEmbedding preserves it on the session", () => {
    const reg = new SessionRegistry();
    const emb = [0.1, 0.2, 0.3];
    const s = reg.create({
      sessionId: "emb",
      agentId: "claude",
      taskEmbedding: emb,
    });
    expect(s.taskEmbedding).toEqual(emb);
  });

  test("get lazy-loads from the store on a hot-cache miss", () => {
    const store = new FakeStore();
    const persisted: AgentSession = {
      sessionId: "lazy",
      agentId: "claude",
      ttlMs: 1000,
      createdAt: 0,
      expiresAt: Date.now() + 10_000,
      accessHistory: new Map(),
      accessHistoryLimit: 1000,
    };
    store.loaded.set("lazy", persisted);
    const reg = new SessionRegistry(1000, store);
    const loaded = reg.get("lazy");
    expect(loaded?.sessionId).toBe("lazy");
    // now in the hot cache
    expect(reg.get("lazy")?.sessionId).toBe("lazy");
  });

  test("get discards an expired persisted session on lazy-load", () => {
    const store = new FakeStore();
    const expired: AgentSession = {
      sessionId: "exp",
      agentId: "claude",
      ttlMs: 1000,
      createdAt: 0,
      expiresAt: 500,
      accessHistory: new Map(),
      accessHistoryLimit: 1000,
    };
    store.loaded.set("exp", expired);
    const reg = new SessionRegistry(1000, store);
    expect(reg.get("exp", 10_000)).toBeNull();
    expect(store.deleted).toContain("exp");
  });

  test("get swallows store.load errors", () => {
    const store = new FakeStore();
    store.loadError = new Error("load boom");
    const reg = new SessionRegistry(1000, store);
    expect(reg.get("nope")).toBeNull();
  });

  test("get on an expired session deletes from store (best-effort swallow)", () => {
    const store = new FakeStore();
    const reg = new SessionRegistry(1000, store);
    reg.create({ sessionId: "ex2", agentId: "claude" }, 0);
    // store.delete error should not throw
    store.deleteError = new Error("delete boom");
    expect(reg.get("ex2", 10_000)).toBeNull();
  });

  test("updateTaskContext returns null for unknown session", () => {
    const reg = new SessionRegistry();
    expect(reg.updateTaskContext("ghost", "task")).toBeNull();
  });

  test("updateTaskContext updates taskEmbedding when provided", () => {
    const reg = new SessionRegistry(1000);
    const t0 = 1_000_000;
    reg.create({ sessionId: "u", agentId: "claude" }, t0);
    const emb = [0.5, 0.5];
    const updated = reg.updateTaskContext("u", "task", emb, t0 + 1);
    expect(updated?.taskEmbedding).toEqual(emb);
  });

  test("updateTaskContext swallows store.save errors", () => {
    const store = new FakeStore();
    store.saveError = new Error("save boom");
    const reg = new SessionRegistry(1000, store);
    reg.create({ sessionId: "u2", agentId: "claude" });
    store.saveError = new Error("save boom 2");
    const updated = reg.updateTaskContext("u2", "new task");
    expect(updated?.taskContext).toBe("new task");
  });

  test("recordAccess on unknown session is a no-op", () => {
    const reg = new SessionRegistry();
    expect(() => reg.recordAccess("ghost", "m1")).not.toThrow();
  });

  test("recordAccess evicts LRU when accessHistory exceeds limit", () => {
    const reg = new SessionRegistry();
    reg.create({
      sessionId: "lru",
      agentId: "claude",
      accessHistoryMaxEntries: 2,
    });
    reg.recordAccess("lru", "m1");
    reg.recordAccess("lru", "m2");
    reg.recordAccess("lru", "m3"); // evicts m1 (oldest)
    const s = reg.get("lru")!;
    expect(s.accessHistory.has("m1")).toBe(false);
    expect(s.accessHistory.has("m2")).toBe(true);
    expect(s.accessHistory.has("m3")).toBe(true);
  });

  test("recordAccess re-recording refreshes recency (delete-then-set)", () => {
    const reg = new SessionRegistry();
    reg.create({
      sessionId: "rec",
      agentId: "claude",
      accessHistoryMaxEntries: 2,
    });
    reg.recordAccess("rec", "m1");
    reg.recordAccess("rec", "m2");
    reg.recordAccess("rec", "m1"); // m1 now most-recent
    reg.recordAccess("rec", "m3"); // evicts m2 (oldest now)
    const s = reg.get("rec")!;
    expect(s.accessHistory.has("m1")).toBe(true);
    expect(s.accessHistory.has("m2")).toBe(false);
    expect(s.accessHistory.get("m1")).toBe(2);
  });

  test("recordAccess swallows store.recordAccess errors", () => {
    const store = new FakeStore();
    store.recordAccessError = new Error("ra boom");
    const reg = new SessionRegistry(1000, store);
    reg.create({ sessionId: "rae", agentId: "claude" });
    expect(() => reg.recordAccess("rae", "m1")).not.toThrow();
  });

  test("delete removes from the hot cache and the store", () => {
    const store = new FakeStore();
    const reg = new SessionRegistry(1000, store);
    reg.create({ sessionId: "del", agentId: "claude" });
    expect(reg.delete("del")).toBe(true);
    expect(reg.get("del")).toBeNull();
    expect(store.deleted).toContain("del");
  });

  test("delete returns false for unknown session", () => {
    const reg = new SessionRegistry();
    expect(reg.delete("ghost")).toBe(false);
  });

  test("delete swallows store.delete errors", () => {
    const store = new FakeStore();
    store.deleteError = new Error("del boom");
    const reg = new SessionRegistry(1000, store);
    reg.create({ sessionId: "de2", agentId: "claude" });
    expect(() => reg.delete("de2")).not.toThrow();
  });

  test("clear empties the hot cache", () => {
    const reg = new SessionRegistry();
    reg.create({ sessionId: "c1", agentId: "claude" });
    reg.create({ sessionId: "c2", agentId: "claude" });
    expect(reg.size()).toBe(2);
    reg.clear();
    expect(reg.size()).toBe(0);
  });

  test("ensureReady awaits the store and swallows errors", async () => {
    const store = new FakeStore();
    store.readyError = new Error("ready boom");
    const reg = new SessionRegistry(1000, store);
    await expect(reg.ensureReady()).resolves.toBeUndefined();
    expect(store.readyCalls).toBe(1);
  });

  test("ensureReady is a no-op when no store is configured", async () => {
    const reg = new SessionRegistry();
    await expect(reg.ensureReady()).resolves.toBeUndefined();
  });

  test("getAsync awaits ensureReady then returns the session", async () => {
    const store = new FakeStore();
    const reg = new SessionRegistry(1000, store);
    reg.create({ sessionId: "ga", agentId: "claude" });
    const s = await reg.getAsync("ga");
    expect(s?.sessionId).toBe("ga");
    expect(store.readyCalls).toBe(1);
  });

  test("getAsync returns null for unknown session after ready", async () => {
    const store = new FakeStore();
    const reg = new SessionRegistry(1000, store);
    const s = await reg.getAsync("ghost");
    expect(s).toBeNull();
  });

  test("getAsync without store returns the session immediately", async () => {
    const reg = new SessionRegistry();
    reg.create({ sessionId: "gn", agentId: "claude" });
    const s = await reg.getAsync("gn");
    expect(s?.sessionId).toBe("gn");
  });

  test("get slides TTL forward but never beyond defaultTtlMs from now", () => {
    const reg = new SessionRegistry(1000);
    const t0 = 1_000_000;
    // custom ttl smaller than default so the slide is bounded by session.ttlMs
    reg.create({ sessionId: "sl", agentId: "claude", ttlMs: 200 }, t0);
    // expiresAt = t0 + 200. get at t0+100 -> refresh = 100+200=300 > 200 -> extends
    const s = reg.get("sl", t0 + 100)!;
    expect(s.expiresAt).toBe(t0 + 100 + 200);
  });

  test("get slides TTL forward when refresh exceeds expiresAt", () => {
    const reg = new SessionRegistry(5000);
    const t0 = 1_000_000;
    reg.create({ sessionId: "sl2", agentId: "claude", ttlMs: 1000 }, t0);
    // expiresAt = t0 + 1000 = 1001000. get at t0+900 -> refresh = 900+1000=1900 > 1000? yes
    const s = reg.get("sl2", t0 + 900)!;
    expect(s.expiresAt).toBe(t0 + 900 + 1000);
  });

  test("create with custom ttlMs overrides default", () => {
    const reg = new SessionRegistry(1000);
    const t0 = 1_000_000;
    const s = reg.create({ sessionId: "ct", agentId: "claude", ttlMs: 9999 }, t0);
    expect(s.ttlMs).toBe(9999);
    expect(s.expiresAt).toBe(t0 + 9999);
  });

  test("create with workspaceId preserves it", () => {
    const reg = new SessionRegistry();
    const s = reg.create({ sessionId: "w", agentId: "claude", workspaceId: "ws-1" });
    expect(s.workspaceId).toBe("ws-1");
  });
});

// ── singleton (getSessionRegistry / resetSessionRegistry) ─────────────────

describe("SessionRegistry — singleton", () => {
  beforeEach(() => {
    resetSessionRegistry();
  });

  test("getSessionRegistry returns a stable instance", () => {
    const a = getSessionRegistry();
    const b = getSessionRegistry();
    expect(a).toBe(b);
  });

  test("resetSessionRegistry drops the cached instance", () => {
    const a = getSessionRegistry();
    resetSessionRegistry();
    const b = getSessionRegistry();
    expect(a).not.toBe(b);
  });

  test("singleton has a store wired (save write-through works)", () => {
    const reg = getSessionRegistry();
    const id = `singleton-test-${Math.random()}`;
    reg.create({ sessionId: id, agentId: "claude" });
    expect(reg.get(id)?.sessionId).toBe(id);
    reg.delete(id);
  });
});
