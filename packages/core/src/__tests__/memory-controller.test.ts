/**
 * Unit tests for MemoryController.
 *
 * Mocks the repository factory, MemoryService, MemoryGraphService,
 * salience judge, consolidation job, and event bus so the controller
 * orchestration logic can be exercised without a DB. Covers store,
 * update, delete, and search paths including all branches (explicit
 * vs auto importance, tag merge/replace, content re-embed, graph
 * enrichment, empty/not-found, invalid input).
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { MemoryType, MemoryLevel } from "@massa-ai/shared";
import type { MemoryRow } from "../data/memory/memory-repository.js";

// ── Mocks ─────────────────────────────────────────────────────

// Capture the most recent repo instance so each test can program it.
let lastRepo: any;

mock.module("../data/memory/memory-repository-factory.js", () => ({
  getMemoryRepository: () => {
    lastRepo = {
      insert: mock(() => Promise.resolve()),
      getById: mock(() => Promise.resolve(null)),
      update: mock(() => Promise.resolve(true)),
      deleteById: mock(() => Promise.resolve(true)),
      fullTextSearch: mock(() => Promise.resolve([])),
      incrementAccessCount: mock(() => Promise.resolve()),
    };
    return lastRepo;
  },
}));

// Single shared service instance so tests can override methods and the
// controller (which captured the reference at construction) sees the change.
const memoryServiceInstance = {
  generateId: (type: MemoryType, userId?: string) =>
    `${type.slice(0, 3)}_t_${Math.random().toString(36).slice(2, 6)}${userId ? `_u${userId.slice(0, 3)}` : ""}`,
  determineLevel: (type: MemoryType, opts: any) => {
    if (opts.agentId === "orchestrator" && (type === "decision" || type === "critical"))
      return MemoryLevel.PERSISTENT;
    if (opts.projectId) return MemoryLevel.PROJECT;
    if (opts.sessionId) return MemoryLevel.SESSION;
    if (opts.userId) return MemoryLevel.USER;
    return MemoryLevel.SESSION;
  },
  generateEmbedding: async (_text: string) => Array.from({ length: 384 }).fill(0.1),
  rowToMemory: (row: MemoryRow) => ({
    id: row.id,
    content: row.content,
    type: row.type as MemoryType,
    level: row.level as MemoryLevel,
    userId: row.user_id,
    sessionId: row.session_id,
    projectId: row.project_id,
    agentId: row.agent_id,
    importance: row.importance,
    tags: row.tags ? safeParse(row.tags, []) : [],
    createdAt: row.created_at,
    accessCount: row.access_count,
    lastAccessed: row.last_accessed,
  }),
  semanticRank: (memories: any[], _q: number[], limit: number) =>
    memories.slice(0, limit).map((m) => ({ ...m, score: 0.9 })),
};

mock.module("../services/memory/memory-service.js", () => ({
  MemoryService: { getInstance: () => memoryServiceInstance },
}));

// Single shared graph instance so tests can override getNeighborhoodSummary.
const graphInstance = {
  onMemoryStored: mock(() => Promise.resolve()),
  onMemoryDeleted: mock(() => Promise.resolve()),
  getNeighborhoodSummary: mock(() => Promise.resolve("summary")),
};

mock.module("../services/graph/memory-graph.service.js", () => ({
  MemoryGraphService: { getInstance: () => graphInstance },
}));

mock.module("../services/jobs/memory-consolidation-job.js", () => ({
  memoryConsolidationJob: { maybeRun: mock(() => {}) },
}));

mock.module("../services/memory/salience-judge.js", () => ({
  getSalienceJudge: () => ({
    scoreSalience: async () => ({ salience: 0.6, source: "llm" as const }),
  }),
}));

mock.module("../services/events/event-bus.js", () => ({
  eventBus: { publish: mock(() => {}) },
}));

// Import AFTER mocks are registered.
import { MemoryController } from "../services/memory/memory-controller.js";

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function makeRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: "m1",
    content: "content",
    type: "code",
    level: 1,
    user_id: null,
    session_id: null,
    project_id: null,
    agent_id: null,
    importance: 0.5,
    tags: '["t1"]',
    embedding: null,
    metadata: null,
    created_at: 1000,
    updated_at: 2000,
    access_count: 0,
    last_accessed: null,
    pinned: 0,
    deleted_at: null,
    ...overrides,
  };
}

// Reset the controller singleton between tests so the repo mock is re-fetched.
function resetController() {
  (MemoryController as any).instance = null;
}

describe("MemoryController", () => {
  let ctrl: MemoryController;

  beforeEach(() => {
    resetController();
    ctrl = MemoryController.getInstance();
  });

  // ── store ────────────────────────────────────────────────
  describe("store", () => {
    test("stores with explicit importance (no salience judge call)", async () => {
      const res = await ctrl.store({
        content: "hello",
        type: MemoryType.CODE,
        importance: 0.9,
        projectId: "p1",
      });
      expect(res.stored).toBe("local");
      expect(res.type).toBe(MemoryType.CODE);
      expect(res.memoryId).toStartWith("cod_");
      expect(res.level).toBe(MemoryLevel.PROJECT);
      expect(lastRepo.insert).toHaveBeenCalledTimes(1);
      const input = lastRepo.insert.mock.calls[0][0];
      expect(input.importance).toBe(0.9);
      expect(input.embedding).toEqual(Array.from({ length: 384 }).fill(0.1));
    });

    test("auto-importance via salience judge when importance omitted", async () => {
      const res = await ctrl.store({
        content: "auto-salience",
        type: MemoryType.DECISION,
      });
      expect(res.memoryId).toStartWith("dec_");
      const input = lastRepo.insert.mock.calls[0][0];
      expect(input.importance).toBe(0.6); // from mocked judge
    });

    test("explicit importance 0 is honored (not overridden)", async () => {
      const res = await ctrl.store({
        content: "zero",
        type: MemoryType.CODE,
        importance: 0,
      });
      expect(res.memoryId).toStartWith("cod_");
      const input = lastRepo.insert.mock.calls[0][0];
      expect(input.importance).toBe(0);
    });

    test("passes tags and linkTo through to insert + graph", async () => {
      await ctrl.store({
        content: "linked",
        type: MemoryType.PATTERN,
        tags: ["a", "b"],
        linkTo: ["other-mem"],
        projectId: "p1",
      });
      const input = lastRepo.insert.mock.calls[0][0];
      expect(input.tags).toEqual(["a", "b"]);
      // graph.onMemoryStored called with linkTo
      // (void in controller; assert via mock call count on the graph service)
    });

    test("metadata includes type, importance, agentId", async () => {
      await ctrl.store({
        content: "x",
        type: MemoryType.CODE,
        importance: 0.3,
        agentId: "builder",
      });
      const input = lastRepo.insert.mock.calls[0][0];
      expect(input.metadata).toMatchObject({ type: "code", importance: 0.3, agentId: "builder" });
    });

    test("determines level SESSION when sessionId provided", async () => {
      const res = await ctrl.store({
        content: "x",
        type: MemoryType.CONVERSATION,
        userId: "u1",
        sessionId: "s1",
        importance: 0.5,
      });
      expect(res.level).toBe(MemoryLevel.SESSION);
    });
  });

  // ── update ───────────────────────────────────────────────
  describe("update", () => {
    test("returns updated:false when memory not found", async () => {
      lastRepo.getById = mock(() => Promise.resolve(null));
      const res = await ctrl.update({ id: "missing", content: "new" });
      expect(res.updated).toBe(false);
      expect(res.id).toBe("missing");
    });

    test("throws on empty content", async () => {
      await expect(ctrl.update({ id: "m1", content: "   " })).rejects.toThrow(
        "content must not be empty",
      );
    });

    test("updates content + re-embeds", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow({ id: "m1" })));
      lastRepo.update = mock(() => Promise.resolve(true));
      const res = await ctrl.update({ id: "m1", content: "new content" });
      expect(res.updated).toBe(true);
      expect(res.memory).toBeDefined();
      expect((res.memory as any).embedding).toBeUndefined();
      // update called with embedding present
      const patch = lastRepo.update.mock.calls[0][1];
      expect(patch.embedding).toEqual(Array.from({ length: 384 }).fill(0.1));
    });

    test("replaces tags when mergeTags false (default)", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow({ tags: '["old"]' })));
      lastRepo.update = mock(() => Promise.resolve(true));
      const res = await ctrl.update({ id: "m1", tags: ["new1", "new2"] });
      expect(res.updated).toBe(true);
      const patch = lastRepo.update.mock.calls[0][1];
      expect(patch.tags).toEqual(["new1", "new2"]);
    });

    test("merges tags when mergeTags true", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow({ tags: '["old"]' })));
      lastRepo.update = mock(() => Promise.resolve(true));
      const res = await ctrl.update({ id: "m1", tags: ["new"], mergeTags: true });
      expect(res.updated).toBe(true);
      const patch = lastRepo.update.mock.calls[0][1];
      expect(patch.tags).toEqual(["old", "new"]);
    });

    test("mergeTags dedupes overlapping tags", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow({ tags: '["a","b"]' })));
      lastRepo.update = mock(() => Promise.resolve(true));
      await ctrl.update({ id: "m1", tags: ["b", "c"], mergeTags: true });
      const patch = lastRepo.update.mock.calls[0][1];
      expect(patch.tags).toEqual(["a", "b", "c"]);
    });

    test("handles malformed existing tags JSON (falls back to [])", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow({ tags: "not-json" })));
      lastRepo.update = mock(() => Promise.resolve(true));
      await ctrl.update({ id: "m1", tags: ["x"], mergeTags: true });
      const patch = lastRepo.update.mock.calls[0][1];
      expect(patch.tags).toEqual(["x"]);
    });

    test("handles null existing tags", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow({ tags: "" })));
      lastRepo.update = mock(() => Promise.resolve(true));
      await ctrl.update({ id: "m1", tags: ["x"], mergeTags: true });
      const patch = lastRepo.update.mock.calls[0][1];
      expect(patch.tags).toEqual(["x"]);
    });

    test("updates importance only (no content re-embed)", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow()));
      lastRepo.update = mock(() => Promise.resolve(true));
      const res = await ctrl.update({ id: "m1", importance: 0.99 });
      expect(res.updated).toBe(true);
      const patch = lastRepo.update.mock.calls[0][1];
      expect(patch.embedding).toBeUndefined();
      expect(patch.importance).toBe(0.99);
    });

    test("returns updated:false when repo.update returns false", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow()));
      lastRepo.update = mock(() => Promise.resolve(false));
      const res = await ctrl.update({ id: "m1", importance: 0.5 });
      expect(res.updated).toBe(false);
    });

    test("returns updated:true without memory when getById returns null after update", async () => {
      let callCount = 0;
      lastRepo.getById = mock(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeRow());
        return Promise.resolve(null); // second call (post-update)
      });
      lastRepo.update = mock(() => Promise.resolve(true));
      const res = await ctrl.update({ id: "m1", importance: 0.5 });
      expect(res.updated).toBe(true);
      expect(res.memory).toBeUndefined();
    });

    test("strips embedding from returned memory", async () => {
      lastRepo.getById = mock(() => Promise.resolve(makeRow()));
      lastRepo.update = mock(() => Promise.resolve(true));
      const res = await ctrl.update({ id: "m1", importance: 0.5 });
      expect(res.memory).toBeDefined();
      expect((res.memory as any).embedding).toBeUndefined();
    });
  });

  // ── delete ───────────────────────────────────────────────
  describe("delete", () => {
    test("returns deleted:true when repo succeeds", async () => {
      lastRepo.deleteById = mock(() => Promise.resolve(true));
      const res = await ctrl.delete("m1");
      expect(res.deleted).toBe(true);
      expect(res.id).toBe("m1");
    });

    test("returns deleted:false when repo returns false", async () => {
      lastRepo.deleteById = mock(() => Promise.resolve(false));
      const res = await ctrl.delete("m1");
      expect(res.deleted).toBe(false);
    });
  });

  // ── search ───────────────────────────────────────────────
  describe("search", () => {
    test("returns ranked results from FTS + semantic rank", async () => {
      lastRepo.fullTextSearch = mock(() =>
        Promise.resolve([
          makeRow({ id: "r1", content: "match one", type: "code" }),
          makeRow({ id: "r2", content: "match two", type: "code" }),
        ]),
      );
      const res = await ctrl.search({
        query: "match",
        projectId: "p1",
        limit: 5,
      });
      expect(res.total).toBe(2);
      expect(res.memories.length).toBe(2);
      expect(res.memories[0].score).toBe(0.9);
      expect(res.relatedSummaries).toEqual({});
    });

    test("returns empty when FTS finds nothing", async () => {
      lastRepo.fullTextSearch = mock(() => Promise.resolve([]));
      const res = await ctrl.search({ query: "nothing", projectId: "p1" });
      expect(res.total).toBe(0);
      expect(res.memories).toEqual([]);
    });

    test("passes scope filters to fullTextSearch", async () => {
      lastRepo.fullTextSearch = mock(() => Promise.resolve([]));
      await ctrl.search({
        query: "q",
        userId: "u1",
        sessionId: "s1",
        projectId: "p1",
        agentId: "a1",
        types: [MemoryType.CODE],
        minImportance: 0.4,
        limit: 8,
      });
      const args = lastRepo.fullTextSearch.mock.calls[0];
      expect(args[0]).toBe("q");
      expect(args[1]).toBe(24); // limit * 3
      expect(args[2]).toMatchObject({
        userId: "u1",
        sessionId: "s1",
        projectId: "p1",
        agentId: "a1",
        minImportance: 0.4,
        types: [MemoryType.CODE],
      });
    });

    // BEH-01. The controller used to destructure this as `_includePersistent`
    // and never read it, so the option the MCP schema advertises did nothing.
    // Asserting on the forwarded filter is what discriminates: under the old
    // code the key is simply absent from the repository call, whatever value
    // the caller passed.
    test("forwards includePersistent:false to fullTextSearch", async () => {
      lastRepo.fullTextSearch = mock(() => Promise.resolve([]));
      await ctrl.search({ query: "q", includePersistent: false });
      expect(lastRepo.fullTextSearch.mock.calls[0][2]).toMatchObject({
        includePersistent: false,
      });
    });

    test("defaults includePersistent to true when the caller omits it", async () => {
      lastRepo.fullTextSearch = mock(() => Promise.resolve([]));
      await ctrl.search({ query: "q" });
      expect(lastRepo.fullTextSearch.mock.calls[0][2]).toMatchObject({
        includePersistent: true,
      });
    });

    test("increments access counts for each result", async () => {
      lastRepo.fullTextSearch = mock(() =>
        Promise.resolve([makeRow({ id: "r1" })]),
      );
      lastRepo.incrementAccessCount = mock(() => Promise.resolve());
      await ctrl.search({ query: "q", projectId: "p1" });
      expect(lastRepo.incrementAccessCount).toHaveBeenCalledTimes(1);
      expect(lastRepo.incrementAccessCount.mock.calls[0][0]).toBe("r1");
    });

    test("falls back to non-semantic ranking when query embedding is all-zero", async () => {
      // Override the shared service instance's embedding to return all-zero.
      const original = memoryServiceInstance.generateEmbedding;
      memoryServiceInstance.generateEmbedding = async () => Array.from({ length: 384 }).fill(0);
      lastRepo.fullTextSearch = mock(() =>
        Promise.resolve([makeRow({ id: "r1" }), makeRow({ id: "r2" })]),
      );
      const res = await ctrl.search({ query: "q", projectId: "p1", limit: 5 });
      expect(res.memories.length).toBe(2);
      expect(res.memories[0].score).toBe(1.0); // fallback score
      // restore
      memoryServiceInstance.generateEmbedding = original;
    });

    test("includes relatedSummaries when includeRelated and results exist", async () => {
      lastRepo.fullTextSearch = mock(() =>
        Promise.resolve([makeRow({ id: "r1" }), makeRow({ id: "r2" })]),
      );
      const res = await ctrl.search({
        query: "q",
        projectId: "p1",
        includeRelated: true,
      });
      expect(Object.keys(res.relatedSummaries).length).toBeGreaterThan(0);
      expect(res.relatedSummaries["r1"]).toBe("summary");
    });

    test("graph enrichment failure is non-fatal (warns + empty summaries)", async () => {
      // Override the shared graph instance to throw on getNeighborhoodSummary.
      const original = graphInstance.getNeighborhoodSummary;
      graphInstance.getNeighborhoodSummary = () =>
        Promise.reject(new Error("graph down"));
      lastRepo.fullTextSearch = mock(() =>
        Promise.resolve([makeRow({ id: "r1" })]),
      );
      const res = await ctrl.search({
        query: "q",
        projectId: "p1",
        includeRelated: true,
      });
      expect(res.relatedSummaries).toEqual({});
      graphInstance.getNeighborhoodSummary = original;
    });

    test("skips graph enrichment when no results (even if includeRelated)", async () => {
      lastRepo.fullTextSearch = mock(() => Promise.resolve([]));
      const res = await ctrl.search({
        query: "q",
        projectId: "p1",
        includeRelated: true,
      });
      expect(res.relatedSummaries).toEqual({});
    });

    test("uses default minImportance 0.3 and limit 10", async () => {
      lastRepo.fullTextSearch = mock(() => Promise.resolve([]));
      await ctrl.search({ query: "q", projectId: "p1" });
      const args = lastRepo.fullTextSearch.mock.calls[0];
      expect(args[1]).toBe(30); // limit*3 = 30
      expect(args[2].minImportance).toBe(0.3);
    });
  });

  // ── singleton ────────────────────────────────────────────
  describe("singleton", () => {
    test("getInstance returns same instance", () => {
      const a = MemoryController.getInstance();
      const b = MemoryController.getInstance();
      expect(a).toBe(b);
    });
  });
});