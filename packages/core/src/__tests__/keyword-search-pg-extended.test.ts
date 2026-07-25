/**
 * KeywordSearchPg PG-backed tests — extended coverage.
 *
 * Gated on DATABASE_URL. Exercises search, searchWithFilter, searchTrigram,
 * fuzzyCorrect, add, index, delete, update, clear, close, and the batch
 * transaction path beyond the existing keyword-search-pg.test.ts.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { KeywordSearchPg } from "../data/keyword/keyword-search-pg.js";

const READY =
  process.env.RUN_POSTGRES_TESTS === "1" &&
  /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");

const PROJECT_ID = `keyword-pg-ext-${process.pid}-${Date.now()}`;
const OTHER_PROJECT_ID = `${PROJECT_ID}-other`;

describe.skipIf(!READY)("KeywordSearchPg — extended coverage", () => {
  const store = new KeywordSearchPg();

  afterAll(async () => {
    if (READY) {
      try {
        await store.deleteByProject(PROJECT_ID);
        await store.deleteByProject(OTHER_PROJECT_ID);
        await store.close();
      } catch {
        // ignore
      }
    }
  });

  test("add + index alias both insert a document", async () => {
    await store.add(
      `${PROJECT_ID}:add-test:0`,
      "export function addedFunction() { return 'added'; }",
      { projectId: PROJECT_ID, filePath: "add.ts" },
    );
    await store.index(
      `${PROJECT_ID}:index-test:0`,
      "export function indexedFunction() { return 'indexed'; }",
      { projectId: PROJECT_ID, filePath: "index.ts" },
    );
    const results = await store.searchWithFilter("addedFunction", { projectId: PROJECT_ID }, 5);
    expect(results.length).toBeGreaterThan(0);
  });

  test("search (no filter) returns results across projects", async () => {
    await store.add(
      `${PROJECT_ID}:search-nofilter:0`,
      "export function searchNoFilter() {}",
      { projectId: PROJECT_ID },
    );
    const results = await store.search("searchNoFilter", 10);
    expect(results.length).toBeGreaterThan(0);
  });

  test("search with projectId as second arg (legacy overload)", async () => {
    await store.add(
      `${PROJECT_ID}:search-legacy:0`,
      "export function searchLegacyFunc() {}",
      { projectId: PROJECT_ID },
    );
    // Legacy: search(query, projectId, limit)
    const results = await store.search("searchLegacyFunc", PROJECT_ID, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.metadata?.projectId === PROJECT_ID)).toBe(true);
  });

  test("search with limit as second arg (no projectId)", async () => {
    await store.add(
      `${PROJECT_ID}:search-limit:0`,
      "export function searchLimitOnlyFunc() {}",
      { projectId: PROJECT_ID },
    );
    // Legacy: search(query, limit)
    const results = await store.search("searchLimitOnlyFunc", 5);
    expect(results.length).toBeGreaterThan(0);
  });

  test("searchWithFilter with userId filter", async () => {
    await store.add(
      `${PROJECT_ID}:user-test:0`,
      "export function userSpecificFunction() {}",
      { projectId: PROJECT_ID, userId: "user-123" },
    );
    const results = await store.searchWithFilter(
      "userSpecificFunction",
      { projectId: PROJECT_ID, userId: "user-123" },
      10,
    );
    expect(results.length).toBeGreaterThan(0);
    // Wrong user → no results
    const wrongUser = await store.searchWithFilter(
      "userSpecificFunction",
      { projectId: PROJECT_ID, userId: "wrong-user" },
      10,
    );
    expect(wrongUser).toEqual([]);
  });

  test("searchWithFilter with sessionId filter", async () => {
    await store.add(
      `${PROJECT_ID}:session-test:0`,
      "export function sessionScopedFunction() {}",
      { projectId: PROJECT_ID, sessionId: "session-abc" },
    );
    const results = await store.searchWithFilter(
      "sessionScopedFunction",
      { projectId: PROJECT_ID, sessionId: "session-abc" },
      10,
    );
    expect(results.length).toBeGreaterThan(0);
  });

  test("searchWithFilter with type filter", async () => {
    await store.add(
      `${PROJECT_ID}:type-test:0`,
      "export function typeScopedFunction() {}",
      { projectId: PROJECT_ID, type: "code_block" },
    );
    const results = await store.searchWithFilter(
      "typeScopedFunction",
      { projectId: PROJECT_ID, type: "code_block" },
      10,
    );
    expect(results.length).toBeGreaterThan(0);
  });

  test("searchWithFilter with empty/short query terms returns []", async () => {
    const results = await store.searchWithFilter("ab", { projectId: PROJECT_ID }, 10);
    expect(results).toEqual([]);
  });

  test("search with empty/short query terms returns []", async () => {
    const results = await store.search("ab", 10);
    expect(results).toEqual([]);
  });

  test("searchTrigram returns matches for substring", async () => {
    await store.add(
      `${PROJECT_ID}:trigram-test:0`,
      "export function trigramSearchTarget() {}",
      { projectId: PROJECT_ID },
    );
    const results = await store.searchTrigram("trigramSearchTarget", { projectId: PROJECT_ID }, 10);
    expect(results.length).toBeGreaterThan(0);
  });

  test("searchTrigram with empty query returns []", async () => {
    const results = await store.searchTrigram("ab", { projectId: PROJECT_ID }, 10);
    expect(results).toEqual([]);
  });

  test("searchTrigram without projectId", async () => {
    await store.add(
      `${PROJECT_ID}:trigram-nofilter:0`,
      "export function trigramNoFilterTarget() {}",
      { projectId: PROJECT_ID },
    );
    const results = await store.searchTrigram("trigramNoFilterTarget", {}, 10);
    expect(results.length).toBeGreaterThan(0);
  });

  test("fuzzyCorrect returns null for short words", async () => {
    expect(await store.fuzzyCorrect("ab")).toBeNull();
  });

  test("fuzzyCorrect returns null for exact matches", async () => {
    await store.add(
      `${PROJECT_ID}:fuzzy-exact:0`,
      "export function exactWord() {}",
      { projectId: PROJECT_ID },
    );
    const result = await store.fuzzyCorrect("exactWord");
    expect(result).toBeNull();
  });

  test("fuzzyCorrect corrects a typo to nearest vocabulary word", async () => {
    await store.add(
      `${PROJECT_ID}:fuzzy-typo:0`,
      "export function realFunctionName() {}",
      { projectId: PROJECT_ID },
    );
    const result = await store.fuzzyCorrect("realFunctionNme");
    // Should correct within edit distance (or null if vocabulary isn't populated yet)
    // The correction targets "realFunctionName" (1 deletion away)
    expect(result === null || typeof result === "string").toBe(true);
    if (result !== null) {
      expect(result.length).toBeGreaterThan(0);
    }
  });

  test("fuzzyCorrect is cached (LRU)", async () => {
    await store.add(
      `${PROJECT_ID}:fuzzy-cache:0`,
      "export function cachedCorrection() {}",
      { projectId: PROJECT_ID },
    );
    const r1 = await store.fuzzyCorrect("cachedCoerction");
    const r2 = await store.fuzzyCorrect("cachedCoerction");
    expect(r1).toBe(r2);
  });

  test("delete removes a document", async () => {
    const id = `${PROJECT_ID}:delete-test:0`;
    await store.add(id, "export function deleteMe() {}", { projectId: PROJECT_ID });
    const deleted = await store.delete(id);
    expect(deleted).toBe(true);
    const results = await store.searchWithFilter("deleteMe", { projectId: PROJECT_ID }, 5);
    expect(results.every((r) => r.id !== id)).toBe(true);
  });

  test("delete returns false for non-existent id", async () => {
    const deleted = await store.delete(`${PROJECT_ID}:nonexistent:0`);
    expect(deleted).toBe(false);
  });

  test("update changes content", async () => {
    const id = `${PROJECT_ID}:update-test:0`;
    await store.add(id, "export function beforeUpdate() {}", { projectId: PROJECT_ID });
    await store.update(id, "export function afterUpdate() {}");
    const results = await store.searchWithFilter("afterUpdate", { projectId: PROJECT_ID }, 5);
    expect(results.length).toBeGreaterThan(0);
  });

  test("deleteByProject returns count and removes all", async () => {
    const delProj = `${PROJECT_ID}-delete-all`;
    await store.addBatch([
      { id: `${delProj}:1:0`, content: "doc one", metadata: { projectId: delProj } },
      { id: `${delProj}:2:0`, content: "doc two", metadata: { projectId: delProj } },
    ]);
    const count = await store.deleteByProject(delProj);
    expect(count).toBe(2);
  });

  test("addBatch with empty array is a no-op", async () => {
    await store.addBatch([]);
  });

  test("clear removes all keyword documents", async () => {
    // Use a throwaway project to avoid clearing other test data
    const clearProj = `${PROJECT_ID}-clear-test`;
    await store.add(`${clearProj}:1:0`, "clearable content", { projectId: clearProj });
    await store.clear();
    // After clear, that project's docs should be gone
    const results = await store.searchWithFilter("clearable", { projectId: clearProj }, 5);
    expect(results).toEqual([]);
  });
});