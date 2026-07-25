/**
 * Keyword search factory coverage.
 *
 * Exercises getKeywordSearch caching + resetKeywordSearch lifecycle against
 * the dedicated PG DB. The factory module holds a module-level cached
 * singleton; these tests drive both the cache-hit and reset branches.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  getKeywordSearch,
  resetKeywordSearch,
} from "../data/keyword/keyword-search-factory.js";
import { KeywordSearchPg } from "../data/keyword/keyword-search-pg.js";

const READY =
  process.env.RUN_POSTGRES_TESTS === "1" &&
  /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!READY)("keyword-search-factory", () => {
  afterEach(async () => {
    await resetKeywordSearch();
  });

  test("getKeywordSearch returns a KeywordSearchPg instance", () => {
    const search = getKeywordSearch();
    expect(search).toBeInstanceOf(KeywordSearchPg);
  });

  test("getKeywordSearch caches the singleton (same reference on repeat calls)", () => {
    const first = getKeywordSearch();
    const second = getKeywordSearch();
    expect(second).toBe(first);
  });

  test("resetKeywordSearch clears the cache so the next call yields a new instance", async () => {
    const first = getKeywordSearch();
    await resetKeywordSearch();
    const second = getKeywordSearch();
    expect(second).not.toBe(first);
    expect(second).toBeInstanceOf(KeywordSearchPg);
  });

  test("resetKeywordSearch is a no-op when nothing is cached", async () => {
    await resetKeywordSearch();
    // Calling again must not throw (cache already null → guard branch).
    await expect(resetKeywordSearch()).resolves.toBeUndefined();
  });

  test("cached search can be used for a real add/search round-trip", async () => {
    const search = getKeywordSearch();
    const projectId = `factory-${process.pid}-${Date.now()}`;
    try {
      await search.add(
        `${projectId}:src/sample.ts:0`,
        "export function factoryCoverageTarget() { return 42; }",
        { projectId, filePath: "src/sample.ts" },
      );
      const results = await search.searchWithFilter(
        "factoryCoverageTarget",
        { projectId },
        5,
      );
      expect(results.length).toBeGreaterThan(0);
    } finally {
      await search.deleteByProject(projectId);
    }
  });
});
