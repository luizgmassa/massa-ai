/**
 * SearchCachePg comprehensive unit tests — pool-mocked.
 *
 * Exercises L1 cache hit/miss/expiry, L2 hit/miss, eviction, stats, cleanup,
 * invalidateProject, invalidateByFiles, and the lazy getPool/initTable path.
 * Same pool-mock pattern as search-cache-persistence-order.test.ts.
 */

import { describe, test, expect } from "bun:test";
import type { SearchResult } from "@massa-ai/shared";
import { SearchCachePg } from "../services/search/search-cache-pg.js";

const RESULT: SearchResult = {
  id: "r1",
  content: "content",
  score: 0.9,
  source: "vector",
  metadata: { projectId: "proj-1", filePath: "src/a.ts" },
};

function makeCache(): { cache: any; calls: { sql: string; params: unknown[] }[]; pool: any } {
  const cache = new SearchCachePg() as any;
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return { rows: [] };
    },
    end: async () => {},
  };
  cache.pool = pool;
  return { cache, calls, pool };
}

describe("SearchCachePg — L1 cache (in-memory)", () => {
  test("set + get within TTL → L1 hit (no L2 query)", async () => {
    const { cache, calls } = makeCache();
    await cache.set("q", "proj-1", [RESULT], { maxResults: 10 });
    calls.length = 0; // clear post-set queries
    const result = await cache.get("q", "proj-1", { maxResults: 10 });
    expect(result).toEqual([RESULT]);
    // L1 hit → no SELECT query
    expect(calls.some((c) => c.sql.includes("SELECT * FROM search_cache"))).toBe(false);
  });

  test("L1 hit increments accessCount and lastAccessed", async () => {
    const { cache } = makeCache();
    const opts = { maxResults: 10 };
    await cache.set("q", "proj-1", [RESULT], opts);
    const entry = cache.l1Cache.get(cache.generateKey("q", "proj-1", opts));
    const beforeAccess = entry.accessCount;
    await cache.get("q", "proj-1", opts);
    expect(entry.accessCount).toBe(beforeAccess + 1);
  });

  test("L1 entry expired (age > TTL) is deleted and falls through to L2", async () => {
    const { cache, pool } = makeCache();
    const opts = { maxResults: 10 };
    await cache.set("q", "proj-1", [RESULT], opts);
    // Manually expire the L1 entry
    const key = cache.generateKey("q", "proj-1", opts);
    cache.l1Cache.get(key).createdAt = Date.now() - cache.DEFAULT_TTL * 1000 - 1;
    pool.query = async (sql: string) => {
      if (sql.includes("SELECT * FROM search_cache")) {
        return { rows: [] };
      }
      return { rows: [] };
    };
    const result = await cache.get("q", "proj-1", opts);
    expect(result).toBeNull();
    expect(cache.l1Cache.has(key)).toBe(false);
  });

  test("L1 miss + L2 hit → promotes to L1, returns results", async () => {
    const { cache, pool } = makeCache();
    pool.query = async (sql: string) => {
      if (sql.includes("SELECT * FROM search_cache")) {
        return {
          rows: [{
            key: "persisted",
            query: "q",
            project_id: "proj-1",
            results: [RESULT],
            options: {},
            created_at: new Date(),
            access_count: 1,
            last_accessed: new Date(),
          }],
        };
      }
      return { rows: [] };
    };
    const result = await cache.get("q", "proj-1", { maxResults: 10 });
    expect(result).toEqual([RESULT]);
    expect(cache.getL1Size()).toBe(1);
  });

  test("L1 miss + L2 miss → returns null", async () => {
    const { cache } = makeCache();
    const result = await cache.get("missing-q", "proj-1", { maxResults: 10 });
    expect(result).toBeNull();
  });

  test("stats track L1/L2 hits and misses", async () => {
    const { cache, pool } = makeCache();
    pool.query = async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT * FROM search_cache")) {
        // Return a row only for the "hit2" key; miss1 gets empty.
        const key = params?.[0];
        const hit2Key = cache.generateKey("hit2", "p", { maxResults: 10 });
        if (key === hit2Key) {
          return {
            rows: [{
              key: hit2Key,
              query: "hit2",
              project_id: "p",
              results: [RESULT],
              options: "{}",
              created_at: new Date(),
              access_count: 1,
              last_accessed: new Date(),
            }],
          };
        }
        return { rows: [] };
      }
      return { rows: [] };
    };
    // L1 miss, L2 miss (miss1)
    await cache.get("miss1", "p", { maxResults: 10 });
    // L1 hit (set then get)
    await cache.set("hit1", "p", [RESULT], { maxResults: 10 });
    await cache.get("hit1", "p", { maxResults: 10 });
    // L2 hit (hit2 — no L1 entry, but L2 returns)
    await cache.get("hit2", "p", { maxResults: 10 });
    const stats = cache.getStats();
    expect(stats.l1Hits).toBeGreaterThan(0);
    expect(stats.l1Misses).toBeGreaterThan(0);
    expect(stats.l2Hits).toBeGreaterThan(0);
    expect(stats.l2Misses).toBeGreaterThan(0);
    expect(stats.totalHits).toBeGreaterThan(0);
  });
});

describe("SearchCachePg — L1 eviction (LRU)", () => {
  test("evictL1IfNeeded removes oldest when over L1_MAX_SIZE", async () => {
    const { cache } = makeCache();
    cache.L1_MAX_SIZE = 3;
    // Use distinct projectId + query combos so all keys differ
    for (let i = 0; i < 4; i++) {
      const opts = { maxResults: 10 + i };
      await cache.set(`q${i}`, `p${i}`, [{ ...RESULT, id: `r${i}` }], opts);
    }
    expect(cache.getL1Size()).toBeLessThanOrEqual(3);
  });

  test("getL1Size reports current count", async () => {
    const { cache } = makeCache();
    expect(cache.getL1Size()).toBe(0);
    await cache.set("q", "p", [RESULT]);
    expect(cache.getL1Size()).toBe(1);
  });
});

describe("SearchCachePg — L2 eviction + size", () => {
  test("evictL2IfNeeded deletes oldest when over L2_MAX_SIZE", async () => {
    const { cache, pool, calls } = makeCache();
    let l2Size = 10001;
    pool.query = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      if (sql.includes("SELECT COUNT(*) as count FROM search_cache")) {
        return { rows: [{ count: String(l2Size) }] };
      }
      if (sql.includes("DELETE FROM search_cache") && sql.includes("last_accessed ASC")) {
        l2Size = 10000;
      }
      return { rows: [] };
    };
    // set triggers evictL2IfNeeded
    await cache.set("q", "p", [RESULT]);
    expect(calls.some((c) => c.sql.includes("last_accessed ASC"))).toBe(true);
  });

  test("getL2Size queries COUNT", async () => {
    const { cache, pool } = makeCache();
    pool.query = async (sql: string) => {
      if (sql.includes("SELECT COUNT(*) as count FROM search_cache")) {
        return { rows: [{ count: "42" }] };
      }
      return { rows: [] };
    };
    expect(await cache.getL2Size()).toBe(42);
  });

  test("getL2Size with no rows returns 0", async () => {
    const { cache, pool } = makeCache();
    pool.query = async () => ({ rows: [] });
    expect(await cache.getL2Size()).toBe(0);
  });
});

describe("SearchCachePg — invalidateProject", () => {
  test("removes L1 entries and L2 rows for the project", async () => {
    const { cache, pool, calls } = makeCache();
    await cache.set("q1", "proj-1", [RESULT]);
    await cache.set("q2", "proj-2", [RESULT]);
    pool.query = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      if (sql.includes("DELETE FROM search_cache WHERE project_id")) {
        return { rowCount: 5 };
      }
      return { rows: [] };
    };
    const count = await cache.invalidateProject("proj-1");
    // 1 L1 entry removed + 5 L2 rows = 6
    expect(count).toBe(6);
    expect(cache.getL1Size()).toBe(1); // proj-2 remains
  });

  test("invalidateProject with rowCount 0 still counts L1", async () => {
    const { cache, pool } = makeCache();
    await cache.set("q1", "proj-1", [RESULT]);
    pool.query = async () => ({ rowCount: 0 });
    const count = await cache.invalidateProject("proj-1");
    expect(count).toBe(1);
  });
});

describe("SearchCachePg — invalidateByFiles", () => {
  test("empty filePaths → no-op, zeros", async () => {
    const { cache } = makeCache();
    const result = await cache.invalidateByFiles("proj-1", []);
    expect(result.entriesInvalidated).toBe(0);
    expect(result.entriesPreserved).toBe(0);
    expect(result.affectedQueries).toEqual([]);
  });

  test("L1 entry with affected file is invalidated", async () => {
    const { cache, pool } = makeCache();
    const resultWithFile: SearchResult = {
      ...RESULT,
      metadata: { projectId: "proj-1", filePath: "src/affected.ts" },
    };
    await cache.set("q", "proj-1", [resultWithFile]);
    pool.query = async (sql: string) => {
      if (sql.includes("SELECT key, query, results FROM search_cache")) {
        return { rows: [] };
      }
      return { rows: [] };
    };
    const result = await cache.invalidateByFiles("proj-1", ["src/affected.ts"]);
    expect(result.entriesInvalidated).toBe(1);
    expect(result.affectedQueries).toContain("q");
  });

  test("L1 entry without affected file is preserved", async () => {
    const { cache, pool } = makeCache();
    await cache.set("q", "proj-1", [RESULT]); // filePath src/a.ts
    pool.query = async () => ({ rows: [] });
    const result = await cache.invalidateByFiles("proj-1", ["src/other.ts"]);
    expect(result.entriesInvalidated).toBe(0);
    expect(result.entriesPreserved).toBe(1);
  });

  test("L2 rows with affected files are deleted", async () => {
    const { cache, pool, calls } = makeCache();
    pool.query = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      if (sql.includes("SELECT key, query, results FROM search_cache")) {
        return {
          rows: [
            {
              key: "k1",
              query: "q1",
              results: [{ ...RESULT, metadata: { filePath: "src/affected.ts" } }],
            },
          ],
        };
      }
      if (sql.includes("DELETE FROM search_cache WHERE key = ANY")) {
        return { rowCount: 1 };
      }
      return { rows: [] };
    };
    const result = await cache.invalidateByFiles("proj-1", ["src/affected.ts"]);
    expect(result.entriesInvalidated).toBe(1);
    expect(result.affectedQueries).toContain("q1");
  });

  test("L2 rows that throw during parse are deleted (defensive)", async () => {
    const { cache, pool } = makeCache();
    pool.query = async (sql: string) => {
      if (sql.includes("SELECT key, query, results FROM search_cache")) {
        return {
          rows: [{ key: "bad", query: "bad-q", results: "not-an-array" }],
        };
      }
      return { rows: [] };
    };
    const result = await cache.invalidateByFiles("proj-1", ["any.ts"]);
    // The catch pushes the key to keysToDelete → deleted
    expect(result.entriesInvalidated).toBeGreaterThanOrEqual(1);
  });

  test("different project L1 entries are skipped", async () => {
    const { cache, pool } = makeCache();
    await cache.set("q", "proj-other", [RESULT]);
    pool.query = async () => ({ rows: [] });
    const result = await cache.invalidateByFiles("proj-1", ["src/a.ts"]);
    // proj-other entry is not proj-1 → skipped (not preserved, not invalidated)
    expect(result.entriesInvalidated).toBe(0);
  });
});

describe("SearchCachePg — clear + cleanup", () => {
  test("clear empties L1, deletes L2, resets stats", async () => {
    const { cache, pool, calls } = makeCache();
    await cache.set("q", "p", [RESULT]);
    pool.query = async (sql: string) => {
      calls.push({ sql });
      return { rows: [] };
    };
    await cache.clear();
    expect(cache.getL1Size()).toBe(0);
    expect(calls.some((c) => c.sql === "DELETE FROM search_cache")).toBe(true);
    const stats = cache.getStats();
    expect(stats.totalHits).toBe(0);
  });

  test("cleanup removes expired L1 + L2 entries", async () => {
    const { cache, pool, calls } = makeCache();
    // Insert an expired L1 entry directly
    const key = cache.generateKey("old-q", "p", {});
    cache.l1Cache.set(key, {
      key,
      query: "old-q",
      projectId: "p",
      results: [RESULT],
      options: "{}",
      createdAt: Date.now() - cache.DEFAULT_TTL * 1000 - 1,
      accessCount: 1,
      lastAccessed: Date.now(),
    });
    pool.query = async (sql: string) => {
      calls.push({ sql });
      if (sql.includes("DELETE FROM search_cache WHERE expires_at < NOW()")) {
        return { rowCount: 3 };
      }
      return { rows: [] };
    };
    const result = await cache.cleanup();
    expect(result.l1Removed).toBe(1);
    expect(result.l2Removed).toBe(3);
  });

  test("cleanup with no expired entries returns zeros", async () => {
    const { cache, pool } = makeCache();
    pool.query = async () => ({ rowCount: 0 });
    const result = await cache.cleanup();
    expect(result.l1Removed).toBe(0);
    expect(result.l2Removed).toBe(0);
  });
});

describe("SearchCachePg — close + getStats", () => {
  test("close ends the pool", async () => {
    const { cache, pool } = makeCache();
    let ended = false;
    pool.end = async () => { ended = true; };
    await cache.close();
    expect(ended).toBe(true);
    expect(cache.pool).toBeNull();
  });

  test("close when pool is null is a no-op", async () => {
    const { cache } = makeCache();
    cache.pool = null;
    await cache.close();
    expect(cache.pool).toBeNull();
  });

  test("getStats returns a copy (not the internal object)", async () => {
    const { cache } = makeCache();
    const stats1 = cache.getStats();
    stats1.l1Hits = 999;
    const stats2 = cache.getStats();
    expect(stats2.l1Hits).not.toBe(999);
  });
});

describe("SearchCachePg — key generation + normalizeOptions", () => {
  test("same query + projectId + options → same key", async () => {
    const { cache } = makeCache();
    const k1 = cache.generateKey("Query", "p", { maxResults: 10 });
    const k2 = cache.generateKey("query", "p", { maxResults: 10 }); // lowercased
    expect(k1).toBe(k2);
  });

  test("different options → different key", async () => {
    const { cache } = makeCache();
    const k1 = cache.generateKey("q", "p", { maxResults: 10 });
    const k2 = cache.generateKey("q", "p", { maxResults: 20 });
    expect(k1).not.toBe(k2);
  });

  test("normalizeOptions keeps only search-affecting params", async () => {
    const { cache } = makeCache();
    const norm = cache.normalizeOptions({
      maxResults: 10,
      irrelevant: "dropped",
      includeFilters: ["src/**"],
    });
    expect(norm.maxResults).toBe(10);
    expect(norm.includeFilters).toEqual(["src/**"]);
    expect(norm.irrelevant).toBeUndefined();
  });
});