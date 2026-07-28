/**
 * Unit tests for CacheEntry model.
 *
 * Direct model tests — no DB, no mocks. Exercises constructor, TTL math,
 * access tracking, promotion/eviction heuristics, update, toJSON/fromJSON
 * round-trip, and getDefaultTTL per level.
 */

import { describe, test, expect } from "bun:test";
import { CacheLevel } from "@massa-ai/shared";
import { CacheEntry } from "../models/CacheEntry.js";

describe("CacheEntry", () => {
  describe("constructor", () => {
    test("initializes fields with defaults", () => {
      const entry = new CacheEntry("k1", { a: 1 }, CacheLevel.L1, 60);
      expect(entry.key).toBe("k1");
      expect(entry.value).toEqual({ a: 1 });
      expect(entry.level).toBe(CacheLevel.L1);
      expect(entry.ttl).toBe(60);
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.accessCount).toBe(0);
      expect(entry.lastAccessed).toBeInstanceOf(Date);
      expect(entry.size).toBeGreaterThan(0);
    });

    test("size approximates byte length of JSON-serialized value", () => {
      const entry = new CacheEntry("k", "hello world", CacheLevel.L2, 30);
      // Blob fallback is ~2x char count; either way it must be positive and
      // roughly proportional to the serialized payload.
      expect(entry.size).toBeGreaterThan(0);
      const bigger = new CacheEntry("k", "x".repeat(1000), CacheLevel.L2, 30);
      expect(bigger.size).toBeGreaterThan(entry.size);
    });
  });

  describe("isExpired / getRemainingTTL", () => {
    test("fresh entry is not expired", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      expect(entry.isExpired()).toBe(false);
      expect(entry.getRemainingTTL()).toBeGreaterThan(55);
      expect(entry.getRemainingTTL()).toBeLessThanOrEqual(60);
    });

    test("expired after TTL elapses", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 1);
      // Backdate createdAt to 2 seconds ago.
      entry.createdAt = new Date(Date.now() - 2000);
      expect(entry.isExpired()).toBe(true);
      expect(entry.getRemainingTTL()).toBe(0);
    });

    test("zero ttl expires immediately", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 0);
      // createdAt + 0 = now-ish; with any time passing it's expired.
      // Force it to be expired by backdating slightly.
      entry.createdAt = new Date(Date.now() - 1);
      expect(entry.isExpired()).toBe(true);
      expect(entry.getRemainingTTL()).toBe(0);
    });
  });

  describe("recordAccess", () => {
    test("increments count and updates lastAccessed", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      const before = entry.lastAccessed.getTime();
      // small delay so lastAccessed advances
      const start = Date.now();
      while (Date.now() === start) { /* spin briefly */ }
      entry.recordAccess();
      expect(entry.accessCount).toBe(1);
      expect(entry.lastAccessed.getTime()).toBeGreaterThanOrEqual(before);
      entry.recordAccess();
      expect(entry.accessCount).toBe(2);
    });
  });

  describe("getAge", () => {
    test("returns elapsed seconds since creation", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      entry.createdAt = new Date(Date.now() - 5000);
      const age = entry.getAge();
      expect(age).toBeGreaterThanOrEqual(4);
      expect(age).toBeLessThanOrEqual(6);
    });
  });

  describe("getAccessFrequency", () => {
    test("returns accessCount when age is zero", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      entry.recordAccess();
      entry.recordAccess();
      // age ~0 → returns accessCount to avoid div-by-zero
      expect(entry.getAccessFrequency()).toBe(2);
    });

    test("returns accesses per second for aged entry", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      entry.createdAt = new Date(Date.now() - 10_000); // 10s
      entry.recordAccess();
      entry.recordAccess();
      entry.recordAccess();
      const freq = entry.getAccessFrequency();
      expect(freq).toBeGreaterThan(0);
      expect(freq).toBeLessThanOrEqual(0.3); // ~3/10
    });
  });

  describe("shouldPromote", () => {
    test("promotes when frequency exceeds threshold and TTL ratio > 0.3", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      entry.createdAt = new Date(Date.now() - 1000); // age 1s
      entry.recordAccess();
      entry.recordAccess();
      // frequency ~2/s, remaining ratio ~ (59/60) > 0.3 → promote
      expect(entry.shouldPromote(0.1)).toBe(true);
    });

    test("does not promote when TTL ratio drops below 0.3", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 10);
      // Backdate so remaining TTL ratio is < 0.3 (e.g. 9s elapsed of 10s)
      entry.createdAt = new Date(Date.now() - 8000);
      entry.recordAccess();
      entry.recordAccess();
      expect(entry.shouldPromote(0.1)).toBe(false);
    });

    test("does not promote when frequency below threshold", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      // no accesses → frequency 0 (or accessCount 0) → not promoted
      expect(entry.shouldPromote(0.5)).toBe(false);
    });

    test("default threshold is 0.1", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      entry.createdAt = new Date(Date.now() - 1000);
      entry.recordAccess();
      // frequency ~1/s with default 0.1 → promote
      expect(entry.shouldPromote()).toBe(true);
    });
  });

  describe("shouldEvict", () => {
    test("evicts when expired", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 1);
      entry.createdAt = new Date(Date.now() - 2000);
      expect(entry.shouldEvict()).toBe(true);
    });

    test("evicts when not accessed in more than half TTL", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 10);
      // lastAccessed 6s ago, ttl/2 = 5s → evict
      entry.lastAccessed = new Date(Date.now() - 6000);
      expect(entry.shouldEvict()).toBe(true);
    });

    test("does not evict when recently accessed", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      entry.recordAccess();
      expect(entry.shouldEvict()).toBe(false);
    });
  });

  describe("update", () => {
    test("updates value and resets createdAt", () => {
      const entry = new CacheEntry("k", "old", CacheLevel.L1, 60);
      const oldCreated = entry.createdAt;
      const start = Date.now();
      while (Date.now() === start) { /* spin */ }
      entry.update("new-value");
      expect(entry.value).toBe("new-value");
      expect(entry.createdAt.getTime()).toBeGreaterThan(oldCreated.getTime());
      expect(entry.size).toBeGreaterThan(0);
    });

    test("updates ttl when provided", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      entry.update("v2", 120);
      expect(entry.ttl).toBe(120);
    });

    test("keeps ttl when not provided", () => {
      const entry = new CacheEntry("k", "v", CacheLevel.L1, 60);
      entry.update("v2");
      expect(entry.ttl).toBe(60);
    });
  });

  describe("toJSON / fromJSON round-trip", () => {
    test("toJSON produces a plain object with all fields", () => {
      const entry = new CacheEntry("k1", { a: 1 }, CacheLevel.L2, 30);
      entry.recordAccess();
      entry.recordAccess();
      const json = entry.toJSON();
      expect(json.key).toBe("k1");
      expect(json.value).toEqual({ a: 1 });
      expect(json.level).toBe(CacheLevel.L2);
      expect(json.ttl).toBe(30);
      expect(json.createdAt).toBeInstanceOf(Date);
      expect(json.accessCount).toBe(2);
      expect(json.lastAccessed).toBeInstanceOf(Date);
      expect(typeof json.size).toBe("number");
    });

    test("fromJSON restores an equivalent entry", () => {
      const original = new CacheEntry("k1", [1, 2, 3], CacheLevel.L1, 45);
      original.recordAccess();
      original.recordAccess();
      const json = original.toJSON();
      const restored = CacheEntry.fromJSON(json);
      expect(restored.key).toBe(original.key);
      expect(restored.value).toEqual(original.value);
      expect(restored.level).toBe(original.level);
      expect(restored.ttl).toBe(original.ttl);
      expect(restored.createdAt.getTime()).toBe(original.createdAt.getTime());
      expect(restored.accessCount).toBe(original.accessCount);
      expect(restored.lastAccessed.getTime()).toBe(original.lastAccessed.getTime());
      expect(restored.size).toBe(original.size);
    });

    test("fromJSON preserves createdAt from data (not constructor default)", () => {
      const past = new Date(Date.now() - 100_000);
      const restored = CacheEntry.fromJSON({
        key: "k",
        value: "v",
        level: CacheLevel.L2,
        ttl: 10,
        createdAt: past,
        accessCount: 5,
        lastAccessed: past,
        size: 42,
      });
      expect(restored.createdAt.getTime()).toBe(past.getTime());
      expect(restored.accessCount).toBe(5);
      expect(restored.size).toBe(42);
    });
  });

  describe("getDefaultTTL", () => {
    test("L1 → 300 (5 minutes)", () => {
      expect(CacheEntry.getDefaultTTL(CacheLevel.L1)).toBe(300);
    });

    test("L2 → 3600 (1 hour)", () => {
      expect(CacheEntry.getDefaultTTL(CacheLevel.L2)).toBe(3600);
    });

    test("unknown level → 1800 (30 minutes default)", () => {
      expect(CacheEntry.getDefaultTTL(99 as any)).toBe(1800);
    });
  });
});