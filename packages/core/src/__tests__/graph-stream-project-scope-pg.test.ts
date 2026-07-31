/**
 * BUG-02 / TASK-010 — the graph-neighbor RRF stream is project-scoped at the
 * read seam.
 *
 * `memory_edges` (prisma/schema.prisma:335) carries no `project_id`, so
 * `GraphStorePg.bfsNeighbors` walks edges globally. Before the guard,
 * `buildGraphStream` resolved every neighbor row and checked only
 * `deleted_at`, so a single cross-project edge published another project's
 * memory content into project A's result set.
 *
 * The first test is deliberately two-sided: it asserts B's content is absent
 * AND that A's own neighbor is still present. A one-sided "B is absent"
 * assertion cannot distinguish a correct cross-project drop from a filter that
 * drops every row (which is what a project-id mismatch would look like).
 *
 * Hard-gated to the disposable maintenance database. Fixtures use a unique id
 * prefix; cleanup relies on the `memory_edges` foreign-key cascade.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { SearchSource, type SearchResult } from "@massa-ai/shared";
import { buildGraphStream } from "../services/search/graph-stream.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1"
  && /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);

const TEST_PREFIX = "t10-graph-scope-";
const PROJECT_A = `${TEST_PREFIX}project-a`;
const PROJECT_B = `${TEST_PREFIX}project-b`;

let prisma: any;
let ids: Record<string, string>;

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM memories WHERE id LIKE ${TEST_PREFIX + "%"}`;
}

async function createMemory(
  label: string,
  projectId: string,
  content: string,
): Promise<string> {
  const id = `${TEST_PREFIX}${label}-${randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO memories (id, content, type, level, project_id, importance, tags, updated_at)
    VALUES (${id}, ${content}, 'decision', 2, ${projectId}, 0.5, ARRAY[]::text[], NOW())
  `;
  return id;
}

async function createEdge(fromId: string, toId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO memory_edges (from_id, to_id, edge_type, weight, updated_at)
    VALUES (${fromId}, ${toId}, 'relates_to', 1.0, NOW())
  `;
}

/**
 * A vector-stream hit carrying no filePath/symbol metadata, so the anchor
 * bridge stays inert and BFS is seeded from this id alone.
 */
function seedHit(id: string): SearchResult {
  return {
    id,
    content: "seed hit",
    score: 0.9,
    source: SearchSource.HYBRID,
    metadata: { projectId: PROJECT_A },
  };
}

describe.skipIf(!DEDICATED_DB)("buildGraphStream — project scoping (BUG-02)", () => {
  beforeAll(async () => {
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    prisma = getPrismaClient();
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    ids = {
      seedA: await createMemory("seed-a", PROJECT_A, "project A seed memory"),
      neighborA: await createMemory("neighbor-a", PROJECT_A, "PROJECT-A-NEIGHBOR-CONTENT"),
      neighborB: await createMemory("neighbor-b", PROJECT_B, "PROJECT-B-SECRET-CONTENT"),
    };
    // One same-project edge and one cross-project edge from the same seed.
    await createEdge(ids.seedA, ids.neighborA);
    await createEdge(ids.seedA, ids.neighborB);
  });

  afterEach(cleanup);
  afterAll(cleanup);

  test("excludes the cross-project neighbor and keeps the same-project one", async () => {
    const stream = await buildGraphStream(
      [[seedHit(ids.seedA)]],
      10,
      PROJECT_A,
    );

    const contents = stream.map((r) => r.content);
    // Discriminator: if the guard dropped everything (the failure mode a
    // project-id mismatch would produce), this assertion fails too.
    expect(contents).toContain("PROJECT-A-NEIGHBOR-CONTENT");
    expect(contents).not.toContain("PROJECT-B-SECRET-CONTENT");
    expect(stream.map((r) => r.id)).not.toContain(ids.neighborB);
  }, 30_000);

  test("returns an empty stream — not a throw — when every neighbor is cross-project", async () => {
    const seedB = await createMemory("seed-b", PROJECT_B, "project B seed memory");
    await createEdge(seedB, ids.neighborB);

    const stream = await buildGraphStream(
      [[{ ...seedHit(seedB), metadata: { projectId: PROJECT_A } }]],
      10,
      PROJECT_A,
    );

    expect(stream).toEqual([]);
  }, 30_000);

  test("applies no project filter when the caller supplies no projectId", async () => {
    const stream = await buildGraphStream(
      [[seedHit(ids.seedA)]],
      10,
      undefined,
    );

    const contents = stream.map((r) => r.content);
    expect(contents).toContain("PROJECT-A-NEIGHBOR-CONTENT");
    expect(contents).toContain("PROJECT-B-SECRET-CONTENT");
  }, 30_000);
});
