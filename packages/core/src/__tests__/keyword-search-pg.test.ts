import { afterAll, describe, expect, test } from "bun:test";
import { KeywordSearchPg } from "../data/sqlite/keyword-search-pg.js";

const READY =
  process.env.RUN_POSTGRES_TESTS === "1" &&
  /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");
const PROJECT_ID = `keyword-pg-${process.pid}-${Date.now()}`;
const OTHER_PROJECT_ID = `${PROJECT_ID}-other`;
const store = new KeywordSearchPg();

afterAll(async () => {
  if (READY) {
    await store.deleteByProject(PROJECT_ID);
    await store.deleteByProject(OTHER_PROJECT_ID);
  }
});

describe.skipIf(!READY)("PostgreSQL keyword batch indexing", () => {
  test("batch insert materializes FTS, project filtering, trigram, and fuzzy vocabulary", async () => {
    // LoadStage indexes up to ten files concurrently. Two first-use calls also
    // prove the adapter serializes its one-time trigger/index initialization.
    await Promise.all([
      store.addBatch([
        {
          id: `${PROJECT_ID}:src/needle.ts:0`,
          content: "export function uniquelyNamedNeedle() { return 'found'; }",
          metadata: { projectId: PROJECT_ID, filePath: "src/needle.ts" },
        },
      ]),
      store.addBatch([
        {
          id: `${PROJECT_ID}:src/other.ts:0`,
          content: "export const unrelatedValue = 1;",
          metadata: { projectId: PROJECT_ID, filePath: "src/other.ts" },
        },
      ]),
    ]);

    const exact = await store.searchWithFilter(
      "uniquelyNamedNeedle",
      { projectId: PROJECT_ID },
      5,
    );
    expect(exact.map((result) => result.id)).toContain(
      `${PROJECT_ID}:src/needle.ts:0`,
    );
    expect(exact[0]?.metadata?.filePath).toBe("src/needle.ts");

    const wrongProject = await store.searchWithFilter(
      "uniquelyNamedNeedle",
      { projectId: OTHER_PROJECT_ID },
      5,
    );
    expect(wrongProject).toEqual([]);

    await store.addBatch([
      {
        id: `${OTHER_PROJECT_ID}:foreign.ts:0`,
        content: "uniquelyNamedNeedle belongs to the other project",
        metadata: { projectId: OTHER_PROJECT_ID, filePath: "foreign.ts" },
      },
    ]);
    const scopedFts = await store.searchWithFilter(
      "uniquelyNamedNeedle",
      { projectId: PROJECT_ID },
      10,
    );
    expect(scopedFts.every((result) => result.metadata?.projectId === PROJECT_ID)).toBe(true);

    const trigram = await store.searchTrigram(
      "uniquelyNamedNeedle",
      { projectId: PROJECT_ID },
      5,
    );
    expect(trigram.map((result) => result.id)).toContain(
      `${PROJECT_ID}:src/needle.ts:0`,
    );
    expect(trigram.every((result) => result.metadata?.projectId === PROJECT_ID)).toBe(true);

    const multiTermTrigram = await store.searchTrigram(
      "uniquelyNamedNeedle missingFragment",
      { projectId: PROJECT_ID },
      5,
    );
    expect(multiTermTrigram.map((result) => result.id)).toContain(
      `${PROJECT_ID}:src/needle.ts:0`,
    );

    expect(await store.fuzzyCorrect("uniquelyNamedNeedl")).toBe(
      "uniquelynamedneedle",
    );

    expect(await store.deleteByProject(PROJECT_ID)).toBe(2);
    expect(
      await store.searchWithFilter("uniquelyNamedNeedle", { projectId: PROJECT_ID }, 5),
    ).toEqual([]);
  });
});
