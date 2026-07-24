/**
 * SearchCachePg PG-backed tests — exercises the lazy getPool/initTable path
 * and end-to-end cache round-trips against the real DB.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SearchResult } from "@massa-ai/shared";
import { SearchCachePg } from "../services/search/search-cache-pg.js";

const READY =
  process.env.RUN_POSTGRES_TESTS === "1" &&
  /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");

const PROJECT_ID = `cache-pg-${process.pid}-${Date.now()}`;

const RESULT: SearchResult = {
  id: "r1",
  content: "content",
  score: 0.9,
  source: "vector",
  metadata: { projectId: PROJECT_ID, filePath: "src/a.ts" },
};

describe.skipIf(!READY)("SearchCachePg — PG-backed init + round-trip", () => {
  let cache: SearchCachePg;

  beforeAll(async () => {
    cache = new SearchCachePg();
  });

  afterAll(async () => {
    if (cache) {
      try {
        await cache.clear();
      } catch {
        // ignore
      }
      await cache.close();
    }
  });

  test("getPool lazily creates search_cache table on first access", async () => {
    // set triggers getPool → initTable → INSERT. If initTable throws, fails.
    await cache.set("init-test", PROJECT_ID, [RESULT], { maxResults: 10 });
  });

  test("set + get round-trip via L2 (clear L1 first)", async () => {
    await cache.set("roundtrip", PROJECT_ID, [RESULT], { maxResults: 10 });
    // Clear L1 so the get hits L2
    (cache as any).l1Cache.clear();
    const result = await cache.get("roundtrip", PROJECT_ID, { maxResults: 10 });
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("r1");
  });

  test("invalidateProject removes entries", async () => {
    await cache.set("invalidate-test", PROJECT_ID, [RESULT], { maxResults: 10 });
    const count = await cache.invalidateProject(PROJECT_ID);
    expect(count).toBeGreaterThan(0);
    // After invalidation, get returns null (L1 cleared, L2 deleted)
    (cache as any).l1Cache.clear();
    const result = await cache.get("invalidate-test", PROJECT_ID, { maxResults: 10 });
    expect(result).toBeNull();
  });

  test("getL2Size returns count", async () => {
    await cache.set("size-test", PROJECT_ID, [RESULT], { maxResults: 10 });
    const size = await cache.getL2Size();
    expect(size).toBeGreaterThan(0);
  });

  test("cleanup removes expired entries", async () => {
    const result = await cache.cleanup();
    expect(result).toBeDefined();
    expect(typeof result.l1Removed).toBe("number");
    expect(typeof result.l2Removed).toBe("number");
  });

  test("invalidateByFiles with empty list is a no-op", async () => {
    const result = await cache.invalidateByFiles(PROJECT_ID, []);
    expect(result.entriesInvalidated).toBe(0);
  });

  test("invalidateByFiles with matching file removes entries", async () => {
    await cache.set("file-test", PROJECT_ID, [RESULT], { maxResults: 10 });
    (cache as any).l1Cache.clear();
    const result = await cache.invalidateByFiles(PROJECT_ID, ["src/a.ts"]);
    expect(result.entriesInvalidated).toBeGreaterThanOrEqual(1);
  });

  test("clear empties both caches", async () => {
    await cache.set("clear-test", PROJECT_ID, [RESULT], { maxResults: 10 });
    await cache.clear();
    expect((cache as any).l1Cache.size).toBe(0);
    const size = await cache.getL2Size();
    expect(size).toBe(0);
  });
});