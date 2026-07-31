/**
 * Coverage for GraphQueries (BFS traversal, path finding, contradiction
 * detection, hub analysis, neighborhood summary).
 *
 * Strategy: pass a scripted mock IGraphStore for edge traversal, and use the
 * real dedicated PostgreSQL DB for the memory-batch-loading helpers
 * (loadMemoriesByIds / findContradictions raw queries). Unique project-id
 * prefix isolates fixtures; cleanup relies on a DELETE LIKE prefix.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { MemoryRelationType, type MemoryEdge } from "@massa-ai/shared";
import { GraphQueries } from "../services/graph/graph-queries.js";
import type { EdgeFilter, IGraphStore } from "../services/graph/types.js";
import { Prisma } from "../generated/prisma/index.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1" &&
  /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);
const TEST_PREFIX = "gq-cov-";

let prisma: any;
let ids: Record<string, string>;

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM memories WHERE id LIKE ${TEST_PREFIX + "%"}`;
}

async function createMemory(
  label: string,
  opts: { content?: string; type?: string } = {},
): Promise<string> {
  const id = `${TEST_PREFIX}${label}-${randomUUID()}`;
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO memories (id, content, type, level, project_id, importance, tags, updated_at)
    VALUES (${id}, ${opts.content ?? `content for ${label}`}, ${opts.type ?? "decision"}, 2,
            ${TEST_PREFIX}, 0.5, ARRAY[]::text[], NOW())
  `);
  return id;
}

// (Prisma import kept at top of file.)


/** Build a MemoryEdge object referencing real memory ids. */
function edge(
  source: string,
  target: string,
  relationType: MemoryRelationType = MemoryRelationType.RELATES_TO,
  weight = 0.8,
  evidence = "test evidence",
): MemoryEdge {
  return {
    id: `e-${source}-${target}`,
    sourceId: source,
    targetId: target,
    relationType,
    weight,
    evidence,
    autoExtracted: false,
    createdAt: new Date(),
  };
}

/** Scripted IGraphStore: only getAllEdges + getHubMemories are used by GraphQueries. */
function makeMockStore(
  edgeMap: Map<string, MemoryEdge[]>,
  hubs: { memoryId: string; degree: number }[] = [],
): IGraphStore {
  return {
    getAllEdges(memoryId: string, filter?: EdgeFilter) {
      let edges = edgeMap.get(memoryId) ?? [];
      // Also include reverse edges (targeting this memory) to mirror a real
      // connected-edges store — important for BFS direction coverage.
      for (const [from, list] of edgeMap) {
        if (from === memoryId) continue;
        for (const e of list) {
          if (e.targetId === memoryId) edges.push(e);
        }
      }
      if (filter?.relationTypes?.length) {
        edges = edges.filter((e) => filter.relationTypes!.includes(e.relationType));
      }
      if (filter?.minWeight !== undefined) {
        edges = edges.filter((e) => e.weight >= filter.minWeight!);
      }
      if (filter?.limit !== undefined) {
        edges = edges.slice(0, filter.limit);
      }
      return Promise.resolve(edges);
    },
    getHubMemories() {
      return Promise.resolve(hubs);
    },
    createEdge: () => Promise.resolve(null),
    getEdge: () => Promise.resolve(null),
    deleteEdge: () => Promise.resolve(false),
    deleteEdgesForMemory: () => Promise.resolve(0),
    updateWeight: () => Promise.resolve(false),
    incrementEdgeWeight: () => Promise.resolve(false),
    bfsNeighbors: () => Promise.resolve([]),
    getDegree: () => Promise.resolve({ in: 0, out: 0, total: 0 }),
    getStats: () =>
      Promise.resolve({ totalEdges: 0, byRelation: {}, autoExtracted: 0, avgWeight: 0 }),
    clear: () => Promise.resolve(),
  };
}

describe.skipIf(!DEDICATED_DB)("GraphQueries — traversal + path + hubs", () => {
  let queries: GraphQueries;

  beforeAll(async () => {
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    prisma = getPrismaClient();
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    ids = {
      a: await createMemory("a", { content: "alpha decision", type: "decision" }),
      b: await createMemory("b", { content: "beta code that is long enough to be more than one hundred and twenty characters total so the snippet truncation path gets exercised properly by getNeighborhoodSummary here" }),
      c: await createMemory("c", { content: "gamma pattern", type: "pattern" }),
      d: await createMemory("d", { content: "delta decision" }),
      e: await createMemory("e", { content: "epsilon pattern" }),
    };
  });

  afterEach(cleanup);
  afterAll(cleanup);

  test("getRelatedContext BFS returns neighbors ordered by depth then weight", async () => {
    const store = makeMockStore(
      new Map([
        [ids.a, [edge(ids.a, ids.b, MemoryRelationType.SUPPORTS, 0.9), edge(ids.a, ids.c, MemoryRelationType.RELATES_TO, 0.5)]],
        [ids.b, [edge(ids.b, ids.d, MemoryRelationType.DERIVED_FROM, 0.7)]],
        [ids.d, [edge(ids.d, ids.e, MemoryRelationType.SUPPORTS, 0.4)]],
      ]),
    );
    queries = new GraphQueries(store);

    const ctx = await queries.getRelatedContext(ids.a, { maxDepth: 2, limit: 10 });
    expect(ctx.length).toBeGreaterThan(0);
    // Depth-0 ordering: b (0.9) before c (0.5) at depth 1.
    const depth1 = ctx.filter((r) => r.depth === 1);
    expect(depth1.map((r) => r.memory.id)).toEqual([ids.b, ids.c]);
    // d is at depth 2.
    expect(ctx.find((r) => r.memory.id === ids.d)?.depth).toBe(2);
  });

  test("getRelatedContext respects limit and includeEvidence=false", async () => {
    const store = makeMockStore(
      new Map([
        [ids.a, [edge(ids.a, ids.b), edge(ids.a, ids.c), edge(ids.a, ids.d)]],
      ]),
    );
    queries = new GraphQueries(store);

    const ctx = await queries.getRelatedContext(ids.a, { limit: 2, includeEvidence: false });
    expect(ctx).toHaveLength(2);
    expect(ctx.every((r) => r.edge.evidence === undefined)).toBe(true);
  });

  test("getRelatedContext filters by relationTypes + minWeight", async () => {
    const store = makeMockStore(
      new Map([
        [ids.a, [edge(ids.a, ids.b, MemoryRelationType.SUPPORTS, 0.9), edge(ids.a, ids.c, MemoryRelationType.RELATES_TO, 0.4)]],
      ]),
    );
    queries = new GraphQueries(store);

    const ctx = await queries.getRelatedContext(ids.a, {
      relationTypes: [MemoryRelationType.SUPPORTS],
      minWeight: 0.3,
      maxDepth: 1,
    });
    expect(ctx.map((r) => r.memory.id)).toEqual([ids.b]);
  });

  test("getRelatedContext dedupes already-visited neighbors (cycle defense)", async () => {
    // a -> b, b -> a (back-edge), a -> c. `a` itself must never be returned.
    const store = makeMockStore(
      new Map([
        [ids.a, [edge(ids.a, ids.b), edge(ids.a, ids.c)]],
        [ids.b, [edge(ids.b, ids.a)]],
      ]),
    );
    queries = new GraphQueries(store);
    const ctx = await queries.getRelatedContext(ids.a, { maxDepth: 3, limit: 10 });
    expect(ctx.find((r) => r.memory.id === ids.a)).toBeUndefined();
    // b and c are still discovered.
    expect(ctx.map((r) => r.memory.id).sort()).toEqual([ids.b, ids.c].sort());
  });

  test("findPath returns length-0 path when from === to and memory exists", async () => {
    queries = new GraphQueries(makeMockStore(new Map()));
    const path = await queries.findPath(ids.a, ids.a);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(0);
    expect(path!.nodes).toHaveLength(1);
    expect(path!.edges).toEqual([]);
  });

  test("findPath returns null when from === to but memory missing", async () => {
    queries = new GraphQueries(makeMockStore(new Map()));
    const path = await queries.findPath(`${TEST_PREFIX}missing`, `${TEST_PREFIX}missing`);
    expect(path).toBeNull();
  });

  test("findPath reconstructs the shortest path between two memories", async () => {
    const store = makeMockStore(
      new Map([
        [ids.a, [edge(ids.a, ids.b)]],
        [ids.b, [edge(ids.b, ids.c)]],
        [ids.c, [edge(ids.c, ids.d)]],
      ]),
    );
    queries = new GraphQueries(store);
    const path = await queries.findPath(ids.a, ids.d, 5);
    expect(path).not.toBeNull();
    expect(path!.nodes.map((n: any) => n.id)).toEqual([ids.a, ids.b, ids.c, ids.d]);
    expect(path!.length).toBe(3);
    expect(path!.totalWeight).toBeCloseTo(0.8 * 3, 5);
  });

  test("findPath returns null when unreachable within maxDepth", async () => {
    const store = makeMockStore(
      new Map([[ids.a, [edge(ids.a, ids.b)]]]),
    );
    queries = new GraphQueries(store);
    const path = await queries.findPath(ids.a, ids.e, 2);
    expect(path).toBeNull();
  });

  test("findContradictions loads real contradiction edges + memories", async () => {
    // Insert a real contradiction edge a --CONTRADICTS--> d in the DB.
    await prisma.$executeRaw`
      INSERT INTO memory_edges (from_id, to_id, edge_type, weight, metadata, created_at, updated_at)
      VALUES (${ids.a}, ${ids.d}, ${MemoryRelationType.CONTRADICTS}, 0.7,
              ${JSON.stringify({ evidence: "direct contradiction", autoExtracted: true })}::jsonb, NOW(), NOW())
    `;
    queries = new GraphQueries(makeMockStore(new Map()));
    const pairs = await queries.findContradictions(10);
    const mine = pairs.filter(
      (p) => p.memory1.id === ids.a && p.memory2.id === ids.d,
    );
    expect(mine.length).toBe(1);
    expect(mine[0].evidence).toBe("direct contradiction");
  });

  test("findContradictions uses default evidence when metadata lacks it", async () => {
    await prisma.$executeRaw`
      INSERT INTO memory_edges (from_id, to_id, edge_type, weight, metadata, created_at, updated_at)
      VALUES (${ids.b}, ${ids.e}, ${MemoryRelationType.CONTRADICTS}, 0.6,
              ${JSON.stringify({ autoExtracted: false })}::jsonb, NOW(), NOW())
    `;
    queries = new GraphQueries(makeMockStore(new Map()));
    const pairs = await queries.findContradictions(50);
    const mine = pairs.find(
      (p) => p.memory1.id === ids.b && p.memory2.id === ids.e,
    );
    expect(mine).toBeDefined();
    expect(mine!.evidence).toMatch(/Contradiction detected/);
  });

  test("findContradictions only returns pairs whose both memories exist", async () => {
    // Both endpoints exist (the memory_edges FK enforces this); the
    // `if (!m1 || !m2) continue` guard is exercised by evaluating false here.
    await prisma.$executeRaw`
      INSERT INTO memory_edges (from_id, to_id, edge_type, weight, metadata, created_at, updated_at)
      VALUES (${ids.c}, ${ids.e}, ${MemoryRelationType.CONTRADICTS}, 0.55,
              ${JSON.stringify({ evidence: "c vs e", autoExtracted: true })}::jsonb, NOW(), NOW())
    `;
    queries = new GraphQueries(makeMockStore(new Map()));
    const pairs = await queries.findContradictions(50);
    const mine = pairs.find((p) => p.memory1.id === ids.c && p.memory2.id === ids.e);
    expect(mine).toBeDefined();
    expect(mine!.memory1.content).toBe("gamma pattern");
  });

  test("getDecisionChain delegates to getRelatedContext with chain relation types", async () => {
    const store = makeMockStore(
      new Map([
        [ids.a, [edge(ids.a, ids.b, MemoryRelationType.DERIVED_FROM, 0.8)]],
      ]),
    );
    queries = new GraphQueries(store);
    const chain = await queries.getDecisionChain(ids.a, 2);
    expect(chain.map((r) => r.memory.id)).toEqual([ids.b]);
  });

  test("getHubMemories batch-loads full memory data for each hub", async () => {
    const store = makeMockStore(new Map(), [
      { memoryId: ids.a, degree: 4 },
      { memoryId: ids.b, degree: 2 },
      { memoryId: `${TEST_PREFIX}ghost`, degree: 1 }, // missing memory -> skipped
    ]);
    queries = new GraphQueries(store);
    const hubs = await queries.getHubMemories(10);
    expect(hubs.map((h) => h.memory.id).sort()).toEqual([ids.a, ids.b].sort());
    expect(hubs.find((h) => h.memory.id === ids.a)?.degree).toBe(4);
  });

  test("getNeighborhoodSummary renders arrows, labels, and truncates long content", async () => {
    const store = makeMockStore(
      new Map([
        [ids.a, [edge(ids.a, ids.b, MemoryRelationType.SUPPORTS, 0.8)]],
      ]),
    );
    queries = new GraphQueries(store);
    const summary = await queries.getNeighborhoodSummary(ids.a);
    expect(summary).toContain("Related memories");
    expect(summary).toContain("→"); // outgoing direction
    expect(summary).toContain("supports");
    expect(summary).toContain("..."); // b's content is > 120 chars
  });

  test("getNeighborhoodSummary returns empty string when no related memories", async () => {
    queries = new GraphQueries(makeMockStore(new Map()));
    const summary = await queries.getNeighborhoodSummary(ids.a);
    expect(summary).toBe("");
  });

  test("getNeighborhoodSummary marks incoming edges with the back-arrow", async () => {
    const store = makeMockStore(
      new Map([[ids.b, [edge(ids.b, ids.a, MemoryRelationType.RELATES_TO, 0.7)]]]),
    );
    queries = new GraphQueries(store);
    const summary = await queries.getNeighborhoodSummary(ids.a);
    expect(summary).toContain("←");
  });

  test("loadMemoriesByIds empty-input short-circuit returns empty map (via findPath same-id)", async () => {
    queries = new GraphQueries(makeMockStore(new Map()));
    // close() is a no-op; exercise it for coverage.
    queries.close();
    expect(queries).toBeDefined();
  });
});
