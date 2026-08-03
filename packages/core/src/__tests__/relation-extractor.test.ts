/**
 * Coverage for RelationExtractor.
 *
 * `classifyRelation` is pure heuristic logic and is exercised exhaustively
 * (every rule branch). `extractRelations` + the private helpers are reached
 * via a mocked memory repository (mock.module) and a scripted IGraphStore, so
 * no live embedding provider or graph backend is required.
 */

import { describe, test, expect, beforeEach, mock, afterEach } from "bun:test";
import { MemoryRelationType } from "@massa-ai/shared";
import type { MemoryRow } from "../services/memory-graph/types.js";

// Restore any stale mocks from sibling files sharing the module registry.
mock.restore();

// ── Mock the memory repository so RelationExtractor.loadMemory /
//    findSimilarMemories never touch a real DB or embedding provider. ────────
const fakeRepo: {
  getById: ReturnType<typeof mock>;
  findRecentWithEmbeddings: ReturnType<typeof mock>;
} = {
  getById: mock(() => null),
  findRecentWithEmbeddings: mock(() => []),
};

mock.module("../data/memory/memory-repository-factory.js", () => ({
  getMemoryRepository: () => fakeRepo,
}));

// EmbeddingService is constructed (lazy init) but never called by
// extractRelations — neutralize its async initializer to keep the test silent.
mock.module("../services/embeddings/index.js", () => ({
  createEmbeddingProvider: mock(async () => { throw new Error("no provider"); }),
}));

import { RelationExtractor } from "../services/memory-graph/relation-extractor.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pack a Float32 vector into a Buffer the way the PG bytea column stores it. */
function embed(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

function mem(partial: Partial<MemoryRow> & Pick<MemoryRow, "content" | "type">): MemoryRow {
  return {
    id: partial.id ?? "m",
    content: partial.content,
    type: partial.type,
    level: partial.level ?? 2,
    importance: partial.importance ?? 0.5,
    tags: partial.tags ?? null,
    created_at: partial.created_at ?? 1000,
    updated_at: partial.updated_at ?? 1000,
    access_count: partial.access_count ?? 0,
    user_id: partial.user_id ?? null,
    session_id: partial.session_id ?? null,
    project_id: partial.project_id ?? "proj",
    agent_id: partial.agent_id ?? null,
  };
}

/** Build a scripted IGraphStore that records createEdge calls. */
function recordingStore(createdIds: string[] = []) {
  return {
    createEdge: mock((input: any) => {
      createdIds.push(input.targetId);
      return Promise.resolve({
        id: `e-${input.targetId}`,
        sourceId: input.sourceId,
        targetId: input.targetId,
        relationType: input.relationType,
        weight: input.weight,
        evidence: input.evidence,
        autoExtracted: input.autoExtracted,
        createdAt: new Date(),
      });
    }),
    getAllEdges: mock(() => Promise.resolve([])),
    getHubMemories: mock(() => Promise.resolve([])),
    getEdge: mock(() => Promise.resolve(null)),
    deleteEdge: mock(() => Promise.resolve(false)),
    deleteEdgesForMemory: mock(() => Promise.resolve(0)),
    updateWeight: mock(() => Promise.resolve(false)),
    incrementEdgeWeight: mock(() => Promise.resolve(false)),
    bfsNeighbors: mock(() => Promise.resolve([])),
    getDegree: mock(() => Promise.resolve({ in: 0, out: 0, total: 0 })),
    getStats: mock(() => Promise.resolve({ totalEdges: 0, byRelation: {}, autoExtracted: 0, avgWeight: 0 })),
    clear: mock(() => Promise.resolve()),
  };
}

afterEach(() => {
  fakeRepo.getById.mockImplementation(() => null);
  fakeRepo.findRecentWithEmbeddings.mockImplementation(() => []);
});

// ── classifyRelation — pure heuristic coverage ───────────────────────────────

describe("RelationExtractor.classifyRelation — heuristic cascade", () => {
  const extractor = new RelationExtractor(recordingStore() as any);

  test("SUPERSEDES: same type + sim>=0.92 + newer memory", () => {
    const existing = { ...mem({ content: "old decision", type: "decision", created_at: 1000 }), similarity: 0.95 };
    const newer = mem({ content: "new decision", type: "decision", created_at: 2000 });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.SUPERSEDES);
    expect(r.confidence).toBeLessThanOrEqual(0.95);
  });

  test("SUPERSEDES does not fire when older (same sim but created_at reversed)", () => {
    const existing = { ...mem({ content: "x", type: "decision", created_at: 2000 }), similarity: 0.95 };
    const older = mem({ content: "x", type: "decision", created_at: 1000 });
    const r = extractor.classifyRelation(older as any, existing as any);
    expect(r.relation).not.toBe(MemoryRelationType.SUPERSEDES);
  });

  test("CONTRADICTS: signal + similarity>=0.5", () => {
    const existing = { ...mem({ content: "use library X", type: "decision" }), similarity: 0.6 };
    const newer = mem({ content: "instead of library X we now use Y", type: "decision" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.CONTRADICTS);
  });

  test("CONTRADICTS: signal + low similarity but shares tags", () => {
    const existing = {
      ...mem({ content: "auth approach", type: "decision", tags: JSON.stringify(["auth"]) }),
      similarity: 0.3,
    };
    const newer = mem({ content: "avoid the old auth approach", type: "decision", tags: JSON.stringify(["auth"]) });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.CONTRADICTS);
  });

  test("CONTRADICTS (pt-BR signal): 'evitar' triggers contradiction via shared tag", () => {
    const existing = {
      ...mem({ content: "firebase setup", type: "decision", tags: JSON.stringify(["firebase"]) }),
      similarity: 0.2,
    };
    const newer = mem({ content: "evitar firebase em producao", type: "note", tags: JSON.stringify(["firebase"]) });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.CONTRADICTS);
  });

  test("RESOLVES: resolution signal + existing is decision/pattern", () => {
    const existing = { ...mem({ content: "bug in parser", type: "decision" }), similarity: 0.5 };
    const newer = mem({ content: "this fixed the parser crash", type: "code" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.RESOLVES);
  });

  test("RESOLVES does not fire when existing is neither decision nor pattern", () => {
    const existing = { ...mem({ content: "random note", type: "note" }), similarity: 0.5 };
    const newer = mem({ content: "fixed the issue", type: "code" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).not.toBe(MemoryRelationType.RESOLVES);
  });

  test("DERIVED_FROM: derivation signal", () => {
    const existing = { ...mem({ content: "base design", type: "decision" }), similarity: 0.4 };
    const newer = mem({ content: "derived from the base design", type: "code" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.DERIVED_FROM);
  });

  test("DERIVED_FROM: type chain code<-decision with sim>=0.7", () => {
    const existing = { ...mem({ content: "decision text", type: "decision" }), similarity: 0.75 };
    const newer = mem({ content: "implementation", type: "code" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.DERIVED_FROM);
  });

  test("DERIVED_FROM: type chain pattern<-code with sim>=0.7", () => {
    const existing = { ...mem({ content: "some code", type: "code" }), similarity: 0.72 };
    const newer = mem({ content: "abstracted pattern", type: "pattern" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.DERIVED_FROM);
  });

  test("SUPPORTS: support signal", () => {
    const existing = { ...mem({ content: "claim X", type: "decision" }), similarity: 0.4 };
    const newer = mem({ content: "this confirms claim X", type: "note" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.SUPPORTS);
  });

  test("SUPPORTS: same type pattern/decision + sim>=0.8 implicit", () => {
    const existing = { ...mem({ content: "pattern one", type: "pattern" }), similarity: 0.85 };
    const newer = mem({ content: "pattern two", type: "pattern" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.SUPPORTS);
  });

  test("RELATES_TO: high similarity fallback (>=0.75) with no signal", () => {
    const existing = { ...mem({ content: "generic", type: "note" }), similarity: 0.8 };
    const newer = mem({ content: "generic unrelated", type: "note" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe(MemoryRelationType.RELATES_TO);
  });

  test("NONE: low similarity + no signals", () => {
    const existing = { ...mem({ content: "alpha", type: "note" }), similarity: 0.4 };
    const newer = mem({ content: "beta", type: "note" });
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).toBe("NONE");
    expect(r.confidence).toBe(0);
  });

  test("sharesTags handles invalid JSON tags gracefully (no throw)", () => {
    // Indirectly via CONTRADICTS path with broken tags JSON + shared-tag branch.
    const existing = {
      ...mem({ content: "x", type: "decision", tags: "{not-valid-json" }),
      similarity: 0.2,
    };
    const newer = mem({ content: "avoid x", type: "note", tags: "{also-broken" });
    // similarity 0.2 < 0.5 and sharesTags returns false (bad JSON) → no CONTRADICTS.
    const r = extractor.classifyRelation(newer as any, existing as any);
    expect(r.relation).not.toBe(MemoryRelationType.CONTRADICTS);
  });
});

// ── extractRelations — integration with mocked repo + store ──────────────────

describe("RelationExtractor.extractRelations — end-to-end", () => {
  beforeEach(() => {
    fakeRepo.getById.mockImplementation(() => null);
    fakeRepo.findRecentWithEmbeddings.mockImplementation(() => []);
  });

  test("returns 0 when the memory is not found", async () => {
    fakeRepo.getById.mockImplementation(() => null);
    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    const n = await ext.extractRelations("missing");
    expect(n).toBe(0);
    expect(store.createEdge).not.toHaveBeenCalled();
  });

  test("returns 0 when the memory has no embedding", async () => {
    fakeRepo.getById.mockImplementation(() =>
      mem({ content: "no embedding here", type: "decision" }),
    );
    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    const n = await ext.extractRelations("m1");
    expect(n).toBe(0);
  });

  test("returns 0 when the embedding is all zeros", async () => {
    const m: any = mem({ content: "zero vec", type: "decision" });
    m.embedding = embed([0, 0, 0, 0]);
    fakeRepo.getById.mockImplementation(() => m);
    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    const n = await ext.extractRelations("m1");
    expect(n).toBe(0);
  });

  test("returns 0 when no similar candidates cross the threshold", async () => {
    const m: any = mem({ content: "query", type: "decision" });
    m.embedding = embed([1, 0, 0]);
    fakeRepo.getById.mockImplementation(() => m);
    // Orthogonal candidate → cosine similarity 0 < 0.65.
    const cand: any = mem({ content: "candidate", type: "note" });
    cand.embedding = embed([0, 1, 0]);
    fakeRepo.findRecentWithEmbeddings.mockImplementation(() => [cand]);
    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    const n = await ext.extractRelations("m1");
    expect(n).toBe(0);
    expect(store.createEdge).not.toHaveBeenCalled();
  });

  test("creates an edge when a candidate is highly similar and confidence passes", async () => {
    const m: any = mem({ content: "important decision about caching", type: "decision" });
    m.embedding = embed([1, 0, 0]);
    fakeRepo.getById.mockImplementation(() => m);

    const cand: any = mem({
      id: "cand-1",
      content: "important decision about caching",
      type: "decision",
      created_at: 500, // older → SUPERSEDES path with sim ~1.0
    });
    cand.embedding = embed([1, 0, 0]);
    fakeRepo.findRecentWithEmbeddings.mockImplementation(() => [cand]);

    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    const n = await ext.extractRelations("m1", { confidenceThreshold: 0.9 });
    expect(n).toBe(1);
    expect(store.createEdge).toHaveBeenCalledTimes(1);
  });

  test("skips candidates whose embedding length differs from the query", async () => {
    const m: any = mem({ content: "q", type: "decision" });
    m.embedding = embed([1, 0, 0]);
    fakeRepo.getById.mockImplementation(() => m);
    const mismatched: any = mem({ id: "c2", content: "c", type: "decision" });
    mismatched.embedding = embed([1, 0]); // length 2 vs query length 3
    fakeRepo.findRecentWithEmbeddings.mockImplementation(() => [mismatched]);
    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    const n = await ext.extractRelations("m1");
    expect(n).toBe(0);
  });

  test("createEdge returning null does not increment the edge count", async () => {
    const m: any = mem({ content: "decision text", type: "decision" });
    m.embedding = embed([1, 0, 0]);
    fakeRepo.getById.mockImplementation(() => m);
    const cand: any = mem({ id: "c3", content: "decision text", type: "decision", created_at: 500 });
    cand.embedding = embed([1, 0, 0]);
    fakeRepo.findRecentWithEmbeddings.mockImplementation(() => [cand]);

    const store = recordingStore();
    (store.createEdge as any).mockImplementation(() => Promise.resolve(null));
    const ext = new RelationExtractor(store as any);
    const n = await ext.extractRelations("m1", { confidenceThreshold: 0.9 });
    expect(n).toBe(0);
  });

  test("respects candidateLimit (returns at most N candidates)", async () => {
    const m: any = mem({ content: "x", type: "decision" });
    m.embedding = embed([1, 0, 0]);
    fakeRepo.getById.mockImplementation(() => m);
    // Two identical candidates — candidateLimit=1 keeps only the first.
    const c1: any = mem({ id: "c1", content: "x", type: "decision", created_at: 500 });
    c1.embedding = embed([1, 0, 0]);
    const c2: any = mem({ id: "c2", content: "x", type: "decision", created_at: 500 });
    c2.embedding = embed([1, 0, 0]);
    fakeRepo.findRecentWithEmbeddings.mockImplementation(() => [c1, c2]);
    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    await ext.extractRelations("m1", { candidateLimit: 1, confidenceThreshold: 0.9 });
    expect(store.createEdge).toHaveBeenCalledTimes(1);
  });

  test("swallows repository errors and returns 0 (best-effort)", async () => {
    fakeRepo.getById.mockImplementation(() => {
      throw new Error("db down");
    });
    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    const n = await ext.extractRelations("m1");
    expect(n).toBe(0);
  });

  test("findRecentWithEmbeddings missing → returns [] (no candidates)", async () => {
    const m: any = mem({ content: "q", type: "decision" });
    m.embedding = embed([1, 0, 0]);
    fakeRepo.getById.mockImplementation(() => m);
    // Simulate an older repo without the method.
    fakeRepo.findRecentWithEmbeddings.mockImplementation(() => {
      const err: any = new Error("not a function");
      return err;
    });
    const store = recordingStore();
    const ext = new RelationExtractor(store as any);
    // findSimilarMemories guards `typeof repo.findRecentWithEmbeddings !== 'function'`
    // — restore a real function so the guard path is the array result, which here
    // throws inside and is caught by extractRelations.
    await expect(ext.extractRelations("m1")).resolves.toBe(0);
  });
});
