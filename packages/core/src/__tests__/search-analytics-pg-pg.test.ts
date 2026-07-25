/**
 * SearchAnalyticsPg PG-backed tests.
 *
 * Requires a running PostgreSQL (gated on DATABASE_URL). Exercises the lazy
 * getPool()/initTable() chain (creates tables, installs identity guards) and
 * end-to-end record/query cycles against the real DB.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SearchAnalyticsPg, type SearchEvent } from "../services/search/search-analytics-pg.js";

const READY =
  process.env.RUN_POSTGRES_TESTS === "1" &&
  /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");

const PROJECT_ID = `analytics-pg-${process.pid}-${Date.now()}`;

describe.skipIf(!READY)("SearchAnalyticsPg — PG-backed init + round-trip", () => {
  let analytics: SearchAnalyticsPg;

  beforeAll(async () => {
    analytics = new SearchAnalyticsPg();
  });

  afterAll(async () => {
    if (analytics) {
      try {
        await analytics.clear();
      } catch {
        // ignore
      }
      await analytics.close();
    }
  });

  test("getPool lazily creates tables on first access (initTable path)", async () => {
    // recordQuery triggers getPool → initTable (CREATE TABLE IF NOT EXISTS +
    // guard install) → INSERT. If initTable throws, this fails.
    await analytics.recordQuery("init-test-query", PROJECT_ID, 3, 50, false);
  });

  test("recordQuery + getProjectAnalytics round-trip", async () => {
    await analytics.recordQuery("roundtrip-q", PROJECT_ID, 2, 30, true);
    await analytics.recordQuery("roundtrip-q", PROJECT_ID, 4, 40, false);

    const stats = await analytics.getProjectAnalytics(PROJECT_ID);
    expect(stats.totalQueries).toBeGreaterThanOrEqual(2);
    expect(stats.topQueries.length).toBeGreaterThan(0);
    const top = stats.topQueries.find((t) => t.query === "roundtrip-q");
    expect(top).toBeDefined();
    expect(top!.count).toBeGreaterThanOrEqual(2);
  });

  test("trackSearch inserts into search_events (fire-and-forget)", async () => {
    const event: SearchEvent = {
      timestamp: Date.now(),
      projectId: PROJECT_ID,
      query: "track-search-test",
      resultCount: 1,
      duration: 10,
      cacheHit: true,
      score: 0.9,
    };
    analytics.trackSearch(event);
    // Wait for fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 200));

    const summary = await analytics.getSummary(10);
    expect(summary.totalSearches).toBeGreaterThan(0);
  });

  test("getRecentQueries returns rows from search_analytics", async () => {
    await analytics.recordQuery("recent-q", PROJECT_ID, 1, 10, false);
    const recent = await analytics.getRecentQueries(50);
    expect(recent.length).toBeGreaterThan(0);
  });

  test("getTopQueries returns grouped counts", async () => {
    await analytics.recordQuery("top-q", PROJECT_ID, 1, 10, false);
    const top = await analytics.getTopQueries(PROJECT_ID, 10);
    expect(top.length).toBeGreaterThan(0);
  });

  test("getActiveProjects returns project ids", async () => {
    await analytics.recordQuery("active-q", PROJECT_ID, 1, 10, false);
    const active = await analytics.getActiveProjects();
    expect(active).toContain(PROJECT_ID);
  });

  test("getProjectStats returns from search_events", async () => {
    const stats = await analytics.getProjectStats(PROJECT_ID, 10);
    expect(stats).toBeDefined();
  });

  test("getQueryStats with projectId", async () => {
    const stats = await analytics.getQueryStats("track-search-test", PROJECT_ID);
    expect(stats).toBeDefined();
  });

  test("getQueryStats without projectId", async () => {
    const stats = await analytics.getQueryStats("track-search-test");
    expect(stats).toBeDefined();
  });

  test("getCachePerformance with projectId", async () => {
    const perf = await analytics.getCachePerformance(PROJECT_ID);
    expect(perf).toBeDefined();
    expect(typeof perf.hitRate).toBe("number");
    expect(typeof perf.speedup).toBe("number");
  });

  test("getCachePerformance without projectId", async () => {
    const perf = await analytics.getCachePerformance();
    expect(perf).toBeDefined();
    expect(typeof perf.hitRate).toBe("number");
  });

  test("getRecentSearches returns search events", async () => {
    const searches = await analytics.getRecentSearches(10, PROJECT_ID);
    expect(Array.isArray(searches)).toBe(true);
  });
});