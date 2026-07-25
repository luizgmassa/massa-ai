/**
 * analytics-factory + cache-factory unit tests.
 *
 * Tests the singleton caching, reset, and close behavior. The factories
 * create PG-backed instances, so we mock the pool on the created instances
 * to avoid requiring a real DB for the reset/close paths.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { getSearchAnalytics, resetSearchAnalytics } from "../services/search/analytics-factory.js";
import { getSearchCache, resetSearchCache } from "../services/search/cache-factory.js";

describe("analytics-factory", () => {
  afterEach(async () => {
    await resetSearchAnalytics();
  });

  test("getSearchAnalytics returns a singleton", () => {
    const a1 = getSearchAnalytics();
    const a2 = getSearchAnalytics();
    expect(a1).toBe(a2);
  });

  test("resetSearchAnalytics clears the cache + closes the instance", async () => {
    const a1 = getSearchAnalytics();
    // Mock close so it doesn't try to end a real pool
    (a1 as any).pool = { end: async () => {} };
    await resetSearchAnalytics();
    const a2 = getSearchAnalytics();
    expect(a1).not.toBe(a2);
  });

  test("resetSearchAnalytics when no instance cached is a no-op", async () => {
    await resetSearchAnalytics();
    expect(getSearchAnalytics()).toBeDefined();
  });
});

describe("cache-factory", () => {
  afterEach(async () => {
    await resetSearchCache();
  });

  test("getSearchCache returns a singleton", () => {
    const c1 = getSearchCache();
    const c2 = getSearchCache();
    expect(c1).toBe(c2);
  });

  test("resetSearchCache clears + closes the instance", async () => {
    const c1 = getSearchCache();
    // Mock pool so clear/close don't hit a real DB
    (c1 as any).pool = { query: async () => ({ rows: [] }), end: async () => {} };
    await resetSearchCache();
    const c2 = getSearchCache();
    expect(c1).not.toBe(c2);
  });

  test("resetSearchCache when no instance cached is a no-op", async () => {
    await resetSearchCache();
    expect(getSearchCache()).toBeDefined();
  });
});