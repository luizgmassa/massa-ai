/**
 * Unit tests for session-store.ts (MemorySessionStore, getSessionStore,
 * resetSessionStore, tokenize, re-exports).
 *
 * The PG-backed getSessionStore() path is covered by synapse-session-store-pg.test.ts.
 * This file pins the in-memory test double and the small pure helpers.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  MemorySessionStore,
  getSessionStore,
  resetSessionStore,
  tokenize,
  type SessionStore,
  type WorkingMemoryBufferConfig,
} from "../services/synapse/session/session-store.js";

describe("MemorySessionStore", () => {
  test("all methods are no-ops that satisfy the SessionStore contract", () => {
    const store: SessionStore = new MemorySessionStore();
    expect(() => store.save({} as any)).not.toThrow();
    expect(store.load("anything")).toBeNull();
    expect(() => store.delete("x")).not.toThrow();
    expect(() => store.recordAccess("s", "m", 1)).not.toThrow();
  });

  test("ensureReady resolves immediately", async () => {
    const store = new MemorySessionStore();
    await expect(store.ensureReady()).resolves.toBeUndefined();
  });

  test("implements SessionStore interface (structural)", () => {
    const store: SessionStore = new MemorySessionStore();
    expect(typeof store.save).toBe("function");
    expect(typeof store.load).toBe("function");
    expect(typeof store.delete).toBe("function");
    expect(typeof store.recordAccess).toBe("function");
    expect(typeof store.ensureReady).toBe("function");
  });
});

describe("tokenize", () => {
  test("lowercases and extracts tokens of length >= 2", () => {
    const tokens = tokenize("Auth Middleware Timeout");
    expect(tokens.has("auth")).toBe(true);
    expect(tokens.has("middleware")).toBe(true);
    expect(tokens.has("timeout")).toBe(true);
  });

  test("ignores single-char tokens", () => {
    const tokens = tokenize("a b cc");
    expect(tokens.has("a")).toBe(false);
    expect(tokens.has("b")).toBe(false);
    expect(tokens.has("cc")).toBe(true);
  });

  test("splits on non-alphanumeric_ boundaries", () => {
    const tokens = tokenize("foo.bar_baz qux!");
    expect(tokens.has("foo")).toBe(true);
    expect(tokens.has("bar_baz")).toBe(true);
    expect(tokens.has("qux")).toBe(true);
  });

  test("returns empty set for no matches", () => {
    expect(tokenize("...!!!???").size).toBe(0);
    expect(tokenize("").size).toBe(0);
  });

  test("deduplicates repeated tokens", () => {
    const tokens = tokenize("auth auth auth");
    expect(tokens.size).toBe(1);
    expect(tokens.has("auth")).toBe(true);
  });
});

describe("getSessionStore / resetSessionStore", () => {
  beforeEach(() => {
    resetSessionStore();
  });

  test("getSessionStore returns a stable singleton (PG-backed)", () => {
    const a = getSessionStore();
    const b = getSessionStore();
    expect(a).toBe(b);
  });

  test("resetSessionStore drops the cached instance", () => {
    const a = getSessionStore();
    resetSessionStore();
    const b = getSessionStore();
    expect(a).not.toBe(b);
  });
});

describe("session-store re-exports", () => {
  test("WorkingMemoryBufferConfig type is exported", () => {
    const cfg: WorkingMemoryBufferConfig = {
      maxSize: 10,
      ttlMs: 1000,
      hitBoost: 1.2,
      matchThreshold: 0.3,
    };
    expect(cfg.maxSize).toBe(10);
  });

  test("SessionStore interface is exported (structurally)", () => {
    const s: SessionStore = new MemorySessionStore();
    expect(s).toBeDefined();
  });
});