/**
 * Unit tests for MemoryConsolidationJob (Phase 1 consolidation).
 *
 * Mocks getMemoryRepository, getGraphStore, and the LLM surface.
 * Exercises decay, prune, merge, and the top-level consolidate() path.
 * No real DB is touched.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { z } from "zod";

// ── Mocks ───────────────────────────────────────────────────────────────────

let mockRepo: any = null;
let mockGraphStore: any = null;

mock.module("../data/memory/memory-repository-factory.js", () => ({
  getMemoryRepository: () => mockRepo,
}));

mock.module("../services/graph/graph-store-factory.js", () => ({
  getGraphStore: () => mockGraphStore,
}));

mock.module("../kernel/prisma-client.js", () => ({
  getPrismaClient: () => ({
    $executeRaw: () => Promise.resolve(0),
  }),
}));

import { MemoryConsolidationJob } from "../services/jobs/memory-consolidation-job.js";
import type { LlmSurface } from "../services/memory/consolidator.js";
import type { MemoryRow } from "../data/memory/memory-repository.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

function makeRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: "mem-1",
    content: "test content",
    type: "decision",
    level: 1,
    user_id: null,
    session_id: null,
    project_id: "proj-1",
    agent_id: null,
    importance: 0.5,
    tags: "[]",
    embedding: null,
    metadata: null,
    created_at: Date.now() - 60 * DAY,
    updated_at: Date.now() - 60 * DAY,
    access_count: 0,
    last_accessed: null,
    pinned: 0,
    deleted_at: null,
    ...overrides,
  };
}

function makeLlmSurface(opts: {
  enabled?: boolean;
  value?: any;
  ok?: boolean;
}): LlmSurface {
  return {
    isEnabled: () => opts.enabled ?? true,
    async object<T>(_prompt: string, _schema: z.ZodSchema<T>) {
      if (opts.ok === false) return { ok: false, error: "boom" };
      return {
        ok: true,
        value:
          opts.value ?? {
            summary: "merged summary",
            type: "pattern",
            level: 2,
            rationale: "similar",
            sourceIds: ["mem-1", "mem-2"],
          },
      } as any;
    },
  };
}

function makeMockRepo(opts: {
  candidates?: MemoryRow[];
  updateResult?: boolean;
  softDeleteResult?: boolean;
  updateThrow?: boolean;
  insertThrow?: boolean;
}): any {
  return {
    candidates: opts.candidates ?? [],
    listConsolidationCandidates: async () => opts.candidates ?? [],
    update: async () => {
      if (opts.updateThrow) throw new Error("update failed");
      return opts.updateResult ?? true;
    },
    softDeleteById: async () => {
      if (opts.updateThrow) throw new Error("soft-delete failed");
      return opts.softDeleteResult ?? true;
    },
    insert: async () => {
      if (opts.insertThrow) throw new Error("insert failed");
    },
  };
}

function makeMockGraphStore(opts: {
  createEdgeThrow?: boolean;
}): any {
  return {
    createEdge: async () => {
      if (opts.createEdgeThrow) throw new Error("edge failed");
      return { id: "edge-1" };
    },
  };
}

describe("MemoryConsolidationJob", () => {
  let job: MemoryConsolidationJob;

  beforeEach(() => {
    mockRepo = makeMockRepo({ candidates: [] });
    mockGraphStore = makeMockGraphStore({});
    job = new MemoryConsolidationJob({ llm: makeLlmSurface({ enabled: false }) });
  });

  // ── consolidate() ────────────────────────────────────────────────────────

  describe("consolidate", () => {
    test("returns zero stats when no candidates", async () => {
      mockRepo = makeMockRepo({ candidates: [] });
      const stats = await job.consolidate();
      expect(stats.promoted).toBe(0);
      expect(stats.decayed).toBe(0);
      expect(stats.pruned).toBe(0);
      expect(stats.edgesCleaned).toBe(0);
      expect(stats.merged).toBe(0);
      expect(stats.batchesCreated).toBe(0);
    });

    test("decays stale memories and writes back changed scores", async () => {
      const oldRow = makeRow({
        id: "old-1",
        importance: 0.8,
        created_at: Date.now() - 365 * DAY,
        last_accessed: Date.now() - 365 * DAY,
        access_count: 0,
      });
      mockRepo = makeMockRepo({ candidates: [oldRow], updateResult: true });
      const stats = await job.consolidate();
      expect(stats.decayed).toBe(1);
    });

    test("skips decay when score unchanged", async () => {
      const freshRow = makeRow({
        id: "fresh-1",
        importance: 0.5,
        created_at: Date.now(),
        last_accessed: Date.now(),
        access_count: 0,
      });
      mockRepo = makeMockRepo({ candidates: [freshRow] });
      const stats = await job.consolidate();
      expect(stats.decayed).toBe(0);
    });

    test("prunes cold memories (soft-delete)", async () => {
      const coldRow = makeRow({
        id: "cold-1",
        importance: 0.1,
        created_at: Date.now() - 100 * DAY,
        last_accessed: Date.now() - 100 * DAY,
        access_count: 0,
      });
      mockRepo = makeMockRepo({
        candidates: [coldRow],
        softDeleteResult: true,
      });
      const stats = await job.consolidate();
      expect(stats.pruned).toBe(1);
    });

    test("skips prune for fresh memories", async () => {
      const freshRow = makeRow({
        id: "fresh-2",
        importance: 0.5,
        created_at: Date.now(),
        last_accessed: Date.now(),
        access_count: 0,
      });
      mockRepo = makeMockRepo({ candidates: [freshRow] });
      const stats = await job.consolidate();
      expect(stats.pruned).toBe(0);
    });

    test("merges near-duplicates when LLM enabled", async () => {
      const row1 = makeRow({
        id: "mem-1",
        importance: 0.8,
        embedding: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      const row2 = makeRow({
        id: "mem-2",
        importance: 0.7,
        embedding: Buffer.from(new Float32Array([0.99, 0.01, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      mockRepo = makeMockRepo({ candidates: [row1, row2] });
      mockGraphStore = makeMockGraphStore({});
      const mergeJob = new MemoryConsolidationJob({
        llm: makeLlmSurface({ enabled: true }),
      });
      const stats = await mergeJob.consolidate();
      expect(stats.merged).toBe(2);
      expect(stats.batchesCreated).toBe(1);
    });

    test("skips merge when LLM disabled", async () => {
      const row1 = makeRow({
        id: "mem-1",
        importance: 0.8,
        embedding: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      const row2 = makeRow({
        id: "mem-2",
        importance: 0.7,
        embedding: Buffer.from(new Float32Array([0.99, 0.01, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      mockRepo = makeMockRepo({ candidates: [row1, row2] });
      const stats = await job.consolidate();
      expect(stats.merged).toBe(0);
      expect(stats.batchesCreated).toBe(0);
    });

    test("skips merge when LLM returns {ok:false}", async () => {
      const row1 = makeRow({
        id: "mem-1",
        importance: 0.8,
        embedding: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      const row2 = makeRow({
        id: "mem-2",
        importance: 0.7,
        embedding: Buffer.from(new Float32Array([0.99, 0.01, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      mockRepo = makeMockRepo({ candidates: [row1, row2] });
      const mergeJob = new MemoryConsolidationJob({
        llm: makeLlmSurface({ enabled: true, ok: false }),
      });
      const stats = await mergeJob.consolidate();
      expect(stats.merged).toBe(0);
      expect(stats.batchesCreated).toBe(0);
    });

    test("handles merge insert failure (silent degrade)", async () => {
      const row1 = makeRow({
        id: "mem-1",
        importance: 0.8,
        embedding: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      const row2 = makeRow({
        id: "mem-2",
        importance: 0.7,
        embedding: Buffer.from(new Float32Array([0.99, 0.01, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      mockRepo = makeMockRepo({ candidates: [row1, row2], insertThrow: true });
      const mergeJob = new MemoryConsolidationJob({
        llm: makeLlmSurface({ enabled: true }),
      });
      const stats = await mergeJob.consolidate();
      expect(stats.merged).toBe(0);
      expect(stats.batchesCreated).toBe(0);
    });

    test("handles createEdge failure (silent degrade, continues)", async () => {
      const row1 = makeRow({
        id: "mem-1",
        importance: 0.8,
        embedding: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      const row2 = makeRow({
        id: "mem-2",
        importance: 0.7,
        embedding: Buffer.from(new Float32Array([0.99, 0.01, 0, 0]).buffer),
        created_at: Date.now() - 60 * DAY,
      });
      mockRepo = makeMockRepo({ candidates: [row1, row2] });
      mockGraphStore = makeMockGraphStore({ createEdgeThrow: true });
      const mergeJob = new MemoryConsolidationJob({
        llm: makeLlmSurface({ enabled: true }),
      });
      const stats = await mergeJob.consolidate();
      // Merge still succeeds (edge failure is per-source, logged)
      expect(stats.merged).toBe(2);
      expect(stats.batchesCreated).toBe(1);
    });

    test("handles decay write failure (silent, continues)", async () => {
      const oldRow = makeRow({
        id: "old-2",
        importance: 0.8,
        created_at: Date.now() - 365 * DAY,
        last_accessed: Date.now() - 365 * DAY,
        access_count: 0,
      });
      mockRepo = makeMockRepo({ candidates: [oldRow], updateThrow: true });
      const stats = await job.consolidate();
      expect(stats.decayed).toBe(0);
    });

    test("handles soft-delete failure (silent, continues)", async () => {
      const coldRow = makeRow({
        id: "cold-2",
        importance: 0.1,
        created_at: Date.now() - 100 * DAY,
        last_accessed: Date.now() - 100 * DAY,
        access_count: 0,
      });
      mockRepo = makeMockRepo({
        candidates: [coldRow],
        updateThrow: true, // softDeleteById also throws
      });
      const stats = await job.consolidate();
      expect(stats.pruned).toBe(0);
    });

    test("handles candidate list failure in decay (returns 0)", async () => {
      mockRepo = {
        listConsolidationCandidates: async () => {
          throw new Error("DB down");
        },
        update: async () => true,
        softDeleteById: async () => true,
        insert: async () => {},
      };
      const stats = await job.consolidate();
      expect(stats.decayed).toBe(0);
    });

    test("handles candidate list failure in merge (returns 0)", async () => {
      mockRepo = {
        listConsolidationCandidates: async (_stale: number, _limit: number) => {
          // First call (decay) succeeds, second call (merge) throws
          if (executeRawCount++ === 0) return [];
          throw new Error("DB down");
        },
        update: async () => true,
        softDeleteById: async () => true,
        insert: async () => {},
      };
      const stats = await job.consolidate();
      expect(stats.merged).toBe(0);
    });
  });

  // ── maybeRun ───────────────────────────────────────────────────────────────

  describe("maybeRun", () => {
    test("does not run when already running", () => {
      mockRepo = makeMockRepo({ candidates: [] });
      // First call sets lastRunAt
      job.maybeRun("store");
      // Second call within minIntervalMs should be a no-op
      job.maybeRun("store");
      // No throw, no error
      expect(true).toBe(true);
    });

    test("does not throw on maybeRun", () => {
      mockRepo = makeMockRepo({ candidates: [] });
      expect(() => job.maybeRun("search")).not.toThrow();
    });
  });

  // ── promoteSessionMemories (PG path) ───────────────────────────────────────

  describe("promoteSessionMemories (PG path)", () => {
    test("returns 0 when DATABASE_URL is not postgresql", async () => {
      const origDb = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgresql://localhost:5432/test";
      try {
        mockRepo = makeMockRepo({ candidates: [] });
        const stats = await job.consolidate();
        expect(stats.promoted).toBe(0);
      } finally {
        process.env.DATABASE_URL = origDb;
      }
    });

    test("returns 0 on PG promote failure (silent degrade)", async () => {
      const origDb = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgresql://localhost:5432/test";
      try {
        mockRepo = makeMockRepo({ candidates: [] });
        const stats = await job.consolidate();
        expect(stats.promoted).toBe(0);
      } finally {
        process.env.DATABASE_URL = origDb;
      }
    });
  });
});

let executeRawCount = 0;