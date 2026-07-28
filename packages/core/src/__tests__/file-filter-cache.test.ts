/**
 * FileFilterCache unit tests — pure in-memory cache.
 *
 * No DB, no I/O. Covers getValidFiles (hit/miss/expiry), computeValidFiles
 * (include/exclude), evictOldest, invalidateProject, clear, getStats.
 */

import { describe, test, expect } from "bun:test";
import { FileFilterCache } from "../services/search/file-filter-cache.js";

describe("FileFilterCache — getValidFiles", () => {
  test("cache miss → computes + stores", () => {
    const cache = new FileFilterCache();
    const files = ["src/a.ts", "src/b.ts", "test/c.test.ts"];
    const result = cache.getValidFiles("proj", files);
    expect(result.size).toBe(3);
    expect(result.has("src/a.ts")).toBe(true);
  });

  test("cache hit → returns copy (not the internal set)", () => {
    const cache = new FileFilterCache();
    const files = ["src/a.ts", "src/b.ts"];
    cache.getValidFiles("proj", files);
    const result1 = cache.getValidFiles("proj", files);
    const result2 = cache.getValidFiles("proj", files);
    expect(result1).not.toBe(result2); // different objects (copies)
    expect(result1.size).toBe(result2.size);
  });

  test("include filter keeps only matching paths", () => {
    const cache = new FileFilterCache();
    const files = ["src/a.ts", "test/b.test.ts", "src/c.ts"];
    const result = cache.getValidFiles("proj", files, ["src/*.ts"]);
    expect(result.has("src/a.ts")).toBe(true);
    expect(result.has("src/c.ts")).toBe(true);
    expect(result.has("test/b.test.ts")).toBe(false);
  });

  test("exclude filter drops matching paths", () => {
    const cache = new FileFilterCache();
    const files = ["src/a.ts", "test/b.test.ts", "dist/c.ts"];
    const result = cache.getValidFiles("proj", files, undefined, ["test/*", "dist/*"]);
    expect(result.has("src/a.ts")).toBe(true);
    expect(result.has("test/b.test.ts")).toBe(false);
    expect(result.has("dist/c.ts")).toBe(false);
  });

  test("include + exclude combined (exclude takes precedence)", () => {
    const cache = new FileFilterCache();
    const files = ["src/a.ts", "src/b.ts"];
    const result = cache.getValidFiles("proj", files, ["src/*.ts"], ["**/a.ts"]);
    expect(result.has("src/a.ts")).toBe(false); // excluded
    expect(result.has("src/b.ts")).toBe(true); // included, not excluded
  });

  test("different filter combos get different cache entries", () => {
    const cache = new FileFilterCache();
    cache.getValidFiles("proj", ["a.ts"], ["src/**"]);
    cache.getValidFiles("proj", ["a.ts"], ["test/**"]);
    expect(cache.getStats().size).toBe(2);
  });

  test("different projectIds get different cache entries", () => {
    const cache = new FileFilterCache();
    cache.getValidFiles("p1", ["a.ts"]);
    cache.getValidFiles("p2", ["a.ts"]);
    expect(cache.getStats().size).toBe(2);
  });
});

describe("FileFilterCache — expiry", () => {
  test("expired entry is recomputed", () => {
    const cache = new FileFilterCache() as any;
    cache.TTL_MS = 10; // 10ms TTL
    cache.getValidFiles("proj", ["a.ts"]);
    // Wait for TTL
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = cache.getValidFiles("proj", ["a.ts", "b.ts"]);
        expect(result.has("b.ts")).toBe(true);
        resolve();
      }, 20);
    });
  });
});

describe("FileFilterCache — eviction", () => {
  test("evictOldest removes oldest when over MAX_CACHE_SIZE", () => {
    const cache = new FileFilterCache() as any;
    cache.MAX_CACHE_SIZE = 3;
    for (let i = 0; i < 4; i++) {
      cache.getValidFiles(`proj${i}`, [`file${i}.ts`]);
    }
    expect(cache.cache.size).toBeLessThanOrEqual(3);
  });
});

describe("FileFilterCache — invalidateProject", () => {
  test("removes entries for the project", () => {
    const cache = new FileFilterCache();
    cache.getValidFiles("p1", ["a.ts"]);
    cache.getValidFiles("p2", ["b.ts"]);
    const removed = cache.invalidateProject("p1");
    expect(removed).toBe(1);
    const stats = cache.getStats();
    expect(stats.size).toBe(1);
  });

  test("no match → 0 removed", () => {
    const cache = new FileFilterCache();
    cache.getValidFiles("p1", ["a.ts"]);
    const removed = cache.invalidateProject("nonexistent");
    expect(removed).toBe(0);
  });
});

describe("FileFilterCache — clear", () => {
  test("clears all entries", () => {
    const cache = new FileFilterCache();
    cache.getValidFiles("p1", ["a.ts"]);
    cache.getValidFiles("p2", ["b.ts"]);
    cache.clear();
    expect(cache.getStats().size).toBe(0);
  });
});

describe("FileFilterCache — getStats", () => {
  test("returns size, maxSize, and entries", () => {
    const cache = new FileFilterCache();
    cache.getValidFiles("proj", ["a.ts", "b.ts"]);
    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(50);
    expect(stats.entries).toHaveLength(1);
    expect(stats.entries[0].fileCount).toBe(2);
    expect(stats.entries[0].accessCount).toBe(1);
    expect(stats.entries[0].ageMs).toBeGreaterThanOrEqual(0);
  });

  test("accessCount increments on cache hit", () => {
    const cache = new FileFilterCache();
    cache.getValidFiles("proj", ["a.ts"]);
    cache.getValidFiles("proj", ["a.ts"]);
    cache.getValidFiles("proj", ["a.ts"]);
    const stats = cache.getStats();
    expect(stats.entries[0].accessCount).toBe(3);
  });
});