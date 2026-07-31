/**
 * Coverage for GraphStorePg — exercises the methods not reached by the parity
 * suite: findEdges filter branches, getOutgoing/Incoming, bfsNeighbors,
 * deleteEdge / deleteEdgesForMemory / deleteEdgesByMemory, getDegree,
 * getHubMemories, findPaths, clear, and the createEdge FK-failure path.
 *
 * Hard-gated to the dedicated maintenance DB; fixtures use a unique prefix and
 * cleanup relies on the memory_edges foreign-key cascade.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { MemoryRelationType } from "@massa-ai/shared";
import { GraphStorePg } from "../services/graph/graph-store-pg.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1" &&
  /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);
const TEST_PREFIX = "gspg-cov-";

let prisma: any;
let store: GraphStorePg;
let ids: Record<string, string>;

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM memories WHERE id LIKE ${TEST_PREFIX + "%"}`;
}

async function createMemory(label: string): Promise<string> {
  const id = `${TEST_PREFIX}${label}-${randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO memories (id, content, type, level, project_id, importance, tags, updated_at)
    VALUES (${id}, ${`node ${label}`}, 'decision', 2, ${TEST_PREFIX}, 0.5, ARRAY[]::text[], NOW())
  `;
  return id;
}

describe.skipIf(!DEDICATED_DB)("GraphStorePg — full method coverage", () => {
  beforeAll(async () => {
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    prisma = getPrismaClient();
    store = new GraphStorePg();
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    ids = {
      a: await createMemory("a"),
      b: await createMemory("b"),
      c: await createMemory("c"),
      d: await createMemory("d"),
      e: await createMemory("e"),
    };
  });

  afterEach(cleanup);
  afterAll(cleanup);

  test("getEdge returns null for an absent triple", async () => {
    const miss = await store.getEdge(ids.a, ids.b, MemoryRelationType.SUPPORTS);
    expect(miss).toBeNull();
  });

  test("findEdges applies source/target/relation/minWeight/limit filters", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.9 });
    await store.createEdge({ sourceId: ids.a, targetId: ids.c, relationType: MemoryRelationType.DERIVED_FROM, weight: 0.4 });
    await store.createEdge({ sourceId: ids.d, targetId: ids.a, relationType: MemoryRelationType.RELATES_TO, weight: 0.7 });

    const bySource = await store.findEdges({ sourceId: ids.a });
    expect(bySource.length).toBe(2);
    expect(bySource.every((e) => e.sourceId === ids.a)).toBe(true);

    const byTarget = await store.findEdges({ targetId: ids.a });
    expect(byTarget.map((e) => e.sourceId)).toEqual([ids.d]);

    const byRelation = await store.findEdges({ relationTypes: [MemoryRelationType.SUPPORTS] });
    expect(byRelation.every((e) => e.relationType === MemoryRelationType.SUPPORTS)).toBe(true);

    const heavy = await store.findEdges({ sourceId: ids.a, minWeight: 0.5 });
    expect(heavy.map((e) => e.targetId)).toEqual([ids.b]);

    const limited = await store.findEdges({ sourceId: ids.a, limit: 1 });
    expect(limited).toHaveLength(1);
  });

  test("getOutgoingEdges + getIncomingEdges return directional slices", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.6 });
    await store.createEdge({ sourceId: ids.a, targetId: ids.c, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });
    await store.createEdge({ sourceId: ids.d, targetId: ids.a, relationType: MemoryRelationType.CONTRADICTS, weight: 0.8 });

    const out = await store.getOutgoingEdges(ids.a);
    expect(out.length).toBe(2);
    const inc = await store.getIncomingEdges(ids.a);
    expect(inc.map((e) => e.sourceId)).toEqual([ids.d]);
  });

  test("bfsNeighbors walks outgoing edges up to depth, skipping cycles", async () => {
    // a -> b -> c -> e, plus b -> a (cycle) which must be pruned.
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.RELATES_TO, weight: 0.7 });
    await store.createEdge({ sourceId: ids.b, targetId: ids.c, relationType: MemoryRelationType.RELATES_TO, weight: 0.7 });
    await store.createEdge({ sourceId: ids.c, targetId: ids.e, relationType: MemoryRelationType.RELATES_TO, weight: 0.7 });
    await store.createEdge({ sourceId: ids.b, targetId: ids.a, relationType: MemoryRelationType.RELATES_TO, weight: 0.7 });

    const depth1 = await store.bfsNeighbors([ids.a], 1);
    expect(depth1).toEqual([ids.b]);

    const depth3 = await store.bfsNeighbors([ids.a], 3);
    expect(depth3.sort()).toEqual([ids.b, ids.c, ids.e].sort());
    expect(depth3).not.toContain(ids.a); // cycle pruned
  });

  test("bfsNeighbors filters empty/null seeds and clamps depth >= 1", async () => {
    const none = await store.bfsNeighbors([], 3);
    expect(none).toEqual([]);
    const blank = await store.bfsNeighbors(["", ids.a as string], 1);
    expect(blank).toEqual([]);
  });

  test("deleteEdge removes by id and returns false for unknown id", async () => {
    const edge = await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.5 });
    expect(edge).not.toBeNull();
    expect(await store.deleteEdge(edge!.id)).toBe(true);
    // Second delete of the same id returns false (already gone).
    expect(await store.deleteEdge(edge!.id)).toBe(false);
    // Non-numeric id also returns false.
    expect(await store.deleteEdge("not-a-number")).toBe(false);
  });

  test("deleteEdgesForMemory removes both incoming and outgoing edges", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.5 });
    await store.createEdge({ sourceId: ids.c, targetId: ids.a, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });
    await store.createEdge({ sourceId: ids.d, targetId: ids.e, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });

    const removed = await store.deleteEdgesForMemory(ids.a);
    expect(removed).toBe(2);
    // deleteEdgesByMemory is the legacy alias for the same behavior.
    const removed2 = await store.deleteEdgesByMemory(ids.a);
    expect(removed2).toBe(0);
  });

  test("getDegree reports in/out/total centrality", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.5 });
    await store.createEdge({ sourceId: ids.a, targetId: ids.c, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });
    await store.createEdge({ sourceId: ids.d, targetId: ids.a, relationType: MemoryRelationType.CONTRADICTS, weight: 0.5 });

    const deg = await store.getDegree(ids.a);
    expect(deg.out).toBe(2);
    expect(deg.in).toBe(1);
    expect(deg.total).toBe(3);
  });

  test("getHubMemories ranks nodes by combined degree", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.5 });
    await store.createEdge({ sourceId: ids.a, targetId: ids.c, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });
    await store.createEdge({ sourceId: ids.a, targetId: ids.d, relationType: MemoryRelationType.CONTRADICTS, weight: 0.5 });
    await store.createEdge({ sourceId: ids.e, targetId: ids.a, relationType: MemoryRelationType.DERIVED_FROM, weight: 0.5 });

    const hubs = await store.getHubMemories(10);
    // `a` is connected on all 4 edges → highest degree.
    expect(hubs[0].memoryId).toBe(ids.a);
    expect(hubs[0].degree).toBe(4);
    // limit honored.
    const top1 = await store.getHubMemories(1);
    expect(top1).toHaveLength(1);
  });

  test("findPaths returns the direct + transitive path between two memories", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.RELATES_TO, weight: 0.9 });
    await store.createEdge({ sourceId: ids.b, targetId: ids.c, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });

    const paths = await store.findPaths(ids.a, ids.c, 3);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    // The discovered path must start at a and end at c.
    for (const p of paths) {
      expect(p.path[0]).toBe(ids.a);
      expect(p.path[p.path.length - 1]).toBe(ids.c);
    }
    // A direct a->c path does not exist → empty when maxDepth prevents the hop.
    const none = await store.findPaths(ids.a, ids.e, 1);
    expect(none).toEqual([]);
  });

  test("updateEdgeWeight returns false for non-numeric id", async () => {
    expect(await store.updateEdgeWeight("abc", 0.5)).toBe(false);
  });

  test("getAllEdges applies relation/minWeight/autoExtracted/limit filters (both directions)", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.9 });
    await store.createEdge({ sourceId: ids.a, targetId: ids.c, relationType: MemoryRelationType.DERIVED_FROM, weight: 0.4, autoExtracted: true });
    await store.createEdge({ sourceId: ids.d, targetId: ids.a, relationType: MemoryRelationType.CONTRADICTS, weight: 0.95, autoExtracted: true });

    // No filter: every connected edge (both incoming + outgoing), ordered by weight desc.
    const all = await store.getAllEdges(ids.a);
    expect(all.length).toBe(3);
    expect(all[0].weight).toBe(0.95);

    const supports = await store.getAllEdges(ids.a, { relationTypes: [MemoryRelationType.SUPPORTS] });
    expect(supports.map((e) => e.relationType)).toEqual([MemoryRelationType.SUPPORTS]);

    const heavy = await store.getAllEdges(ids.a, { minWeight: 0.92 });
    expect(heavy.map((e) => e.relationType)).toEqual([MemoryRelationType.CONTRADICTS]);

    const auto = await store.getAllEdges(ids.a, { autoExtractedOnly: true });
    expect(auto.length).toBe(2);
    expect(auto.every((e) => e.autoExtracted)).toBe(true);

    const limited = await store.getAllEdges(ids.a, { limit: 1 });
    expect(limited).toHaveLength(1);
  });

  test("updateEdgeWeight clamps + succeeds and updateWeight alias matches", async () => {
    const edge = await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });
    expect(await store.updateEdgeWeight(edge!.id, 5)).toBe(true);
    expect((await store.getEdge(ids.a, ids.b, MemoryRelationType.RELATES_TO))?.weight).toBe(1);
    // updateWeight is the contract alias delegating to updateEdgeWeight.
    expect(await store.updateWeight(edge!.id, -5)).toBe(true);
    expect((await store.getEdge(ids.a, ids.b, MemoryRelationType.RELATES_TO))?.weight).toBe(0);
  });

  test("incrementEdgeWeight atomically increments and caps at maxWeight", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.RELATES_TO, weight: 0.2 });
    expect(await store.incrementEdgeWeight(ids.a, ids.b, MemoryRelationType.RELATES_TO, 0.5, 0.5)).toBe(true);
    expect((await store.getEdge(ids.a, ids.b, MemoryRelationType.RELATES_TO))?.weight).toBeCloseTo(0.5, 5);
    // Unknown triple → no row updated → false.
    expect(await store.incrementEdgeWeight(ids.a, ids.c, MemoryRelationType.RELATES_TO, 0.1)).toBe(false);
  });

  test("deleteEdgesByMemory (legacy alias) removes connected edges", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.5 });
    await store.createEdge({ sourceId: ids.c, targetId: ids.a, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });
    const removed = await store.deleteEdgesByMemory(ids.a);
    expect(removed).toBe(2);
  });

  test("batchCreateEdges counts only successful inserts", async () => {
    const count = await store.batchCreateEdges([
      { sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.5 },
      { sourceId: ids.a, targetId: ids.a, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 }, // self-ref → null
      { sourceId: ids.c, targetId: ids.d, relationType: MemoryRelationType.CONTRADICTS, weight: 0.5 },
    ]);
    expect(count).toBe(2);
  });

  test("createEdge returns null when a referenced memory is missing (FK violation)", async () => {
    const edge = await store.createEdge({
      sourceId: ids.a,
      targetId: `${TEST_PREFIX}no-such-memory`,
      relationType: MemoryRelationType.SUPPORTS,
      weight: 0.5,
    });
    expect(edge).toBeNull();
  });

  test("clear removes every edge in the graph", async () => {
    await store.createEdge({ sourceId: ids.a, targetId: ids.b, relationType: MemoryRelationType.SUPPORTS, weight: 0.5 });
    await store.createEdge({ sourceId: ids.c, targetId: ids.d, relationType: MemoryRelationType.RELATES_TO, weight: 0.5 });
    await store.clear();
    const stats = await store.getStats();
    expect(stats.totalEdges).toBe(0);
  });
});
