/**
 * Coverage for MemoryGraphService — the orchestration layer over
 * GraphStore + RelationExtractor + GraphQueries.
 *
 * Uses the real dedicated PostgreSQL DB for the happy-path delegates, and
 * swaps in throwing stand-ins (via the instance's private fields) to reach the
 * best-effort catch blocks in onMemoryStored / onMemoryDeleted, which are
 * otherwise unreachable (every real dependency swallows its own errors).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { MemoryRelationType } from "@massa-ai/shared";
import { MemoryGraphService } from "../services/graph/memory-graph.service.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1" &&
  /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);
const TEST_PREFIX = "mgs-cov-";

let prisma: any;
let svc: MemoryGraphService;
let realStore: any;
let realExtractor: any;
let ids: Record<string, string>;

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM memories WHERE id LIKE ${TEST_PREFIX + "%"}`;
}

async function createMemory(label: string): Promise<string> {
  const id = `${TEST_PREFIX}${label}-${randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO memories (id, content, type, level, project_id, importance, tags, updated_at)
    VALUES (${id}, ${`mgs ${label}`}, 'decision', 2, ${TEST_PREFIX}, 0.5, ARRAY[]::text[], NOW())
  `;
  return id;
}

function restoreDeps() {
  (svc as any).store = realStore;
  (svc as any).extractor = realExtractor;
}

describe.skipIf(!DEDICATED_DB)("MemoryGraphService — orchestration coverage", () => {
  beforeAll(async () => {
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
    await cleanup();
    svc = MemoryGraphService.getInstance();
    realStore = (svc as any).store;
    realExtractor = (svc as any).extractor;
  });

  beforeEach(async () => {
    restoreDeps();
    await cleanup();
    ids = {
      a: await createMemory("a"),
      b: await createMemory("b"),
      c: await createMemory("c"),
    };
  });

  afterEach(async () => {
    restoreDeps();
    await cleanup();
  });
  afterAll(cleanup);

  // ── Lifecycle hooks ──────────────────────────────────────────────────────

  test("onMemoryStored creates explicit links and is best-effort safe", async () => {
    await svc.onMemoryStored(ids.a, [ids.b, ids.c]);
    // Explicit RELATES_TO edges should now exist.
    const edges = await svc.getEdges(ids.a);
    const targets = edges.map((e: any) => e.targetId);
    expect(targets).toContain(ids.b);
    expect(targets).toContain(ids.c);
  });

  test("onMemoryStored with empty linkTo is a no-op that does not throw", async () => {
    await svc.onMemoryStored(ids.a, []);
    expect(true).toBe(true);
  });

  test("onMemoryStored swallows store errors (best-effort)", async () => {
    const throwingStore = {
      ...realStore,
      createEdge: async () => {
        throw new Error("store down");
      },
    };
    (svc as any).store = throwingStore;
    // Must NOT throw — graph ops are best-effort.
    await svc.onMemoryStored(ids.a, [ids.b]);
    restoreDeps();
  });

  test("onMemoryDeleted removes connected edges", async () => {
    await svc.linkMemories(ids.a, ids.b, MemoryRelationType.RELATES_TO, { weight: 0.7 });
    await svc.onMemoryDeleted(ids.a);
    const edges = await svc.getEdges(ids.a);
    expect(edges.length).toBe(0);
  });

  test("onMemoryDeleted swallows store errors (best-effort)", async () => {
    const throwingStore = {
      ...realStore,
      deleteEdgesForMemory: async () => {
        throw new Error("delete failed");
      },
    };
    (svc as any).store = throwingStore;
    await svc.onMemoryDeleted(ids.a); // must not throw
    restoreDeps();
  });

  // ── Query delegates ──────────────────────────────────────────────────────

  test("getRelatedContext + getDecisionChain traverse the graph", async () => {
    await svc.linkMemories(ids.a, ids.b, MemoryRelationType.DERIVED_FROM, { weight: 0.8 });
    await svc.linkMemories(ids.a, ids.c, MemoryRelationType.RELATES_TO, { weight: 0.6 });

    const ctx = await svc.getRelatedContext(ids.a, { maxDepth: 1 });
    expect(ctx.length).toBe(2);

    // Decision chain only follows DERIVED_FROM / CAUSES / SUPPORTS, so the
    // RELATES_TO edge to c is excluded — only b is reachable.
    const chain = await svc.getDecisionChain(ids.a, 1);
    expect(chain.length).toBe(1);
    expect(chain[0].memory.id).toBe(ids.b);
  });

  test("findPath resolves a direct connection", async () => {
    await svc.linkMemories(ids.a, ids.b, MemoryRelationType.RELATES_TO, { weight: 0.5 });
    const path = await svc.findPath(ids.a, ids.b, 3);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(1);
  });

  test("findContradictions returns real contradiction pairs", async () => {
    await prisma.$executeRaw`
      INSERT INTO memory_edges (from_id, to_id, edge_type, weight, metadata, created_at, updated_at)
      VALUES (${ids.a}, ${ids.b}, ${MemoryRelationType.CONTRADICTS}, 0.8,
              ${JSON.stringify({ evidence: "opposed", autoExtracted: true })}::jsonb, NOW(), NOW())
    `;
    const pairs = await svc.findContradictions(10);
    expect(pairs.find((p) => p.memory1.id === ids.a)).toBeDefined();
  });

  test("getHubMemories returns degrees", async () => {
    await svc.linkMemories(ids.a, ids.b, MemoryRelationType.RELATES_TO, { weight: 0.5 });
    await svc.linkMemories(ids.a, ids.c, MemoryRelationType.RELATES_TO, { weight: 0.5 });
    const hubs = await svc.getHubMemories(10);
    const aHub = hubs.find((h) => h.memory.id === ids.a);
    expect(aHub).toBeDefined();
    expect(aHub!.degree).toBeGreaterThanOrEqual(2);
  });

  test("getNeighborhoodSummary renders related memories", async () => {
    await svc.linkMemories(ids.a, ids.b, MemoryRelationType.SUPPORTS, { weight: 0.7 });
    const summary = await svc.getNeighborhoodSummary(ids.a);
    expect(summary).toContain("Related memories");
    expect(summary).toContain("supports");
  });

  test("getNeighborhoodSummary returns empty when isolated", async () => {
    const summary = await svc.getNeighborhoodSummary(ids.c);
    expect(summary).toBe("");
  });

  // ── Direct edge operations ───────────────────────────────────────────────

  test("linkMemories creates an edge with autoExtracted=false", async () => {
    const edge = await svc.linkMemories(ids.a, ids.b, MemoryRelationType.SUPPORTS, {
      weight: 0.9,
      evidence: "manual",
    });
    expect(edge).not.toBeNull();
    expect(edge!.autoExtracted).toBe(false);
    expect(edge!.evidence).toBe("manual");
  });

  test("unlinkMemories deletes an edge by id", async () => {
    const edge = await svc.linkMemories(ids.a, ids.b, MemoryRelationType.RELATES_TO);
    expect(await svc.unlinkMemories(edge!.id)).toBe(true);
    expect(await svc.unlinkMemories(edge!.id)).toBe(false); // already gone
  });

  test("linkMemories rejects a self-reference with null", async () => {
    const edge = await svc.linkMemories(ids.a, ids.a, MemoryRelationType.RELATES_TO);
    expect(edge).toBeNull();
  });

  // ── Analytics ────────────────────────────────────────────────────────────

  test("getStats + getDegree return graph metrics", async () => {
    await svc.linkMemories(ids.a, ids.b, MemoryRelationType.RELATES_TO, { weight: 0.5 });
    await svc.linkMemories(ids.a, ids.c, MemoryRelationType.SUPPORTS, { weight: 0.7 });

    const stats = await svc.getStats();
    expect(stats.totalEdges).toBeGreaterThanOrEqual(2);
    expect(Object.keys(stats.byRelation).length).toBeGreaterThan(0);

    const deg = await svc.getDegree(ids.a);
    expect(deg.out).toBe(2);
    expect(deg.total).toBe(2);
  });
});
