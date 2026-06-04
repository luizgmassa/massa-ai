import { describe, test, expect } from "bun:test";
import { SessionRegistry } from "../services/synapse/session/session-registry.js";

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
