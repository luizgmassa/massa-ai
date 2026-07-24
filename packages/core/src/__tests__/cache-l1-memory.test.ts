/**
 * L1MemoryCache unit tests — pure in-process Map cache, no DB.
 * Covers get/set/delete/clear/invalidatePattern/preWarm/getStats + LRU eviction +
 * adaptive TTL promotion + expired cleanup + intelligent TTL from access patterns.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { config } from "@massa-ai/shared";
import { L1MemoryCache } from "../services/cache/l1-memory-cache.js";

function setL1Config(maxSize: number, defaultTTL: number): void {
  (config as unknown as { set: (key: string, value: unknown) => void }).set("cache", {
    l1: { maxSize, defaultTTL },
    l2: { maxSize: 1024, defaultTTL: 3600 },
    embedding: { maxAgeHours: 168 },
  });
}

afterEach(() => {
  setL1Config(100 * 1024 * 1024, 300);
});

describe("L1MemoryCache", () => {
  test("set/get round-trips a value and records stats", async () => {
    const cache = new L1MemoryCache();
    await cache.set("k1", { hello: "world" });
    const got = await cache.get<{ hello: string }>("k1");
    expect(got).not.toBeNull();
    expect(got!.hello).toBe("world");
    const stats = await cache.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.size).toBeGreaterThan(0);
  });

  test("get returns null for missing key", async () => {
    const cache = new L1MemoryCache();
    expect(await cache.get("missing")).toBeNull();
  });

  test("get returns null and deletes expired entry", async () => {
    const cache = new L1MemoryCache();
    await cache.set("exp", "v", 1); // 1s TTL
    // Wait past the TTL so isExpired() returns true.
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache.get("exp")).toBeNull();
    // Entry should be removed from the cache.
    const stats = await cache.getStats();
    expect(stats.entries).toBe(0);
  });

  test("delete removes an entry and returns true; false when absent", async () => {
    const cache = new L1MemoryCache();
    await cache.set("del", "v");
    expect(await cache.delete("del")).toBe(true);
    expect(await cache.delete("del")).toBe(false);
  });

  test("clear empties the cache", async () => {
    const cache = new L1MemoryCache();
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.clear();
    const stats = await cache.getStats();
    expect(stats.entries).toBe(0);
  });

  test("invalidatePattern removes matching prefix entries and returns count", async () => {
    const cache = new L1MemoryCache();
    await cache.set("proj:file1", 1);
    await cache.set("proj:file2", 2);
    await cache.set("other:file3", 3);
    const removed = cache.invalidatePattern("proj:");
    expect(removed).toBe(2);
    expect(await cache.get("proj:file1")).toBeNull();
    expect(await cache.get("other:file3")).not.toBeNull();
  });

  test("invalidatePattern returns 0 when nothing matches", async () => {
    const cache = new L1MemoryCache();
    await cache.set("a", 1);
    expect(cache.invalidatePattern("nope:")).toBe(0);
  });

  test("preWarm sets multiple entries", async () => {
    const cache = new L1MemoryCache();
    await cache.preWarm([
      { key: "w1", value: 1 },
      { key: "w2", value: 2, ttl: 60 },
    ]);
    expect(await cache.get("w1")).toBe(1);
    expect(await cache.get("w2")).toBe(2);
  });

  test("LRU eviction fires when maxSize exceeded", async () => {
    // Tiny maxSize so eviction triggers quickly. JSON-serialized strings are
    // at least a few bytes each, so even small values exceed 1 byte.
    setL1Config(1, 300);
    const cache = new L1MemoryCache();
    // First entry fills the cache; second entry is larger → evicts first.
    await cache.set("first", "x");
    await cache.set("second", "y");
    // The first (LRU) should have been evicted.
    expect(await cache.get("first")).toBeNull();
    expect(await cache.get("second")).toBe("y");
  });

  test("adaptive TTL extends frequently-accessed entries on get", async () => {
    // Use a default TTL large enough that promotion (shouldPromote) can fire
    // after enough accesses within the remaining TTL window.
    setL1Config(100 * 1024 * 1024, 300);
    const cache = new L1MemoryCache();
    await cache.set("hot", "v");
    // Access several times rapidly so accessFrequency > threshold and remaining
    // TTL ratio > 0.3 (shouldPromote). Each get records an access.
    for (let i = 0; i < 5; i++) {
      await cache.get("hot");
    }
    // After promotion, the entry still returns the same value.
    expect(await cache.get("hot")).toBe("v");
  });

  test("intelligent TTL: infrequent access returns default TTL", async () => {
    setL1Config(100 * 1024 * 1024, 300);
    const cache = new L1MemoryCache();
    await cache.set("cold", "v");
    // A single access → pattern length < 2 → default TTL used on re-set.
    await cache.get("cold");
    // Re-set without explicit TTL; should not throw and value preserved.
    await cache.set("cold", "v2");
    expect(await cache.get("cold")).toBe("v2");
  });

  test("get moves entry to most-recently-used (Map insertion order)", async () => {
    // Use a maxSize that holds exactly 2 entries but not 3. Each JSON-serialized
    // single-char string value is ~3 bytes, so 2 entries ≈ 6 bytes (fits) and
    // 3 entries ≈ 9 bytes (evicts). maxSize=7 gives that window.
    setL1Config(7, 300);
    const cache = new L1MemoryCache();
    await cache.set("a", "x");
    await cache.set("b", "y");
    // Access "a" so it becomes MRU; "b" is now LRU.
    await cache.get("a");
    // Insert "c" which exceeds maxSize → evicts LRU ("b").
    await cache.set("c", "z");
    expect(await cache.get("b")).toBeNull();
    expect(await cache.get("a")).toBe("x");
    expect(await cache.get("c")).toBe("z");
  });

  test("getStats reports current size and entry count", async () => {
    const cache = new L1MemoryCache();
    await cache.set("s1", "value1");
    await cache.set("s2", "value2");
    const stats = await cache.getStats();
    expect(stats.entries).toBe(2);
    expect(stats.size).toBeGreaterThan(0);
  });

  test("intelligent TTL: frequent access (< 5 min avg) doubles TTL on re-set", async () => {
    setL1Config(100 * 1024 * 1024, 300);
    const cache = new L1MemoryCache();
    await cache.set("freq", "v");
    // Access several times in rapid succession with small delays so the
    // average interval is < 300000ms (5 min) → calculateIntelligentTTL
    // returns defaultTTL * 2.
    for (let i = 0; i < 3; i++) {
      await cache.get("freq");
      await new Promise((r) => setTimeout(r, 5));
    }
    // Re-set without explicit TTL: the intelligent TTL path fires.
    await cache.set("freq", "v2");
    expect(await cache.get("freq")).toBe("v2");
  });

  test("intelligent TTL: rare access (> 1 hour avg) halves TTL on re-set", async () => {
    setL1Config(100 * 1024 * 1024, 300);
    const cache = new L1MemoryCache();
    await cache.set("rare", "v");
    // Simulate two accesses > 1 hour apart by backdating the access pattern.
    // We access twice so the pattern has length >= 2, then manipulate the
    // internal accessPatterns map to fake a large interval.
    await cache.get("rare");
    await cache.get("rare");
    const accessPatterns = (cache as unknown as { accessPatterns: Map<string, number[]> }).accessPatterns;
    const now = Date.now();
    // Two accesses 2 hours apart → avgInterval > 3600000 → shorter TTL.
    accessPatterns.set("rare", [now - 7_200_000, now]);
    await cache.set("rare", "v2");
    expect(await cache.get("rare")).toBe("v2");
  });

  test("cleanup removes expired entries (private method invoked directly)", async () => {
    const cache = new L1MemoryCache();
    await cache.set("clean1", "v", 1); // 1s TTL
    await cache.set("clean2", "keep"); // default TTL
    // Wait for clean1 to expire.
    await new Promise((r) => setTimeout(r, 1100));
    // Invoke the private cleanup method directly.
    (cache as unknown as { cleanup: () => void }).cleanup();
    expect(await cache.get("clean1")).toBeNull();
    expect(await cache.get("clean2")).toBe("keep");
  });
});