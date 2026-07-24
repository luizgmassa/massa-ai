/**
 * Unit tests for the memory consolidator (Phase 1, P1-CONSOLIDATE).
 *
 * Pure: the LLM is faked via the injectable LlmSurface. No DB, no network.
 */

import { describe, test, expect } from "bun:test";
import {
  consolidateWindow,
  pickConsolidationWindow,
  cosineSimilarity,
  ConsolidatedBatchSchema,
  rowsToCandidates,
  type ConsolidateCandidate,
  type LlmSurface,
} from "../services/memory/consolidator.js";
import type { MemoryRow } from "../data/memory/memory-repository.js";

function cand(
  id: string,
  embedding: number[],
  over: Partial<ConsolidateCandidate> = {},
): ConsolidateCandidate {
  return {
    id,
    projectId: "proj-1",
    importance: 0.7,
    embedding,
    createdAt: 1_000_000,
    ...over,
  };
}

const VEC_A = [1, 0, 0, 0];
const VEC_A_NEAR = [0.99, 0.01, 0, 0]; // cosine ~0.9999 with A
const VEC_B = [0, 1, 0, 0]; // orthogonal to A

describe("cosineSimilarity", () => {
  test("identical vectors → 1", () => {
    expect(cosineSimilarity(VEC_A, VEC_A)).toBeCloseTo(1, 6);
  });
  test("orthogonal vectors → 0", () => {
    expect(cosineSimilarity(VEC_A, VEC_B)).toBeCloseTo(0, 6);
  });
  test("mismatched length → 0", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe("pickConsolidationWindow — prefilter (rule-based)", () => {
  test("returns null when fewer than 2 candidates", () => {
    expect(pickConsolidationWindow([cand("a", VEC_A)])).toBeNull();
    expect(pickConsolidationWindow([])).toBeNull();
  });

  test("clusters near-duplicates (cosine >= 0.65) within a project", () => {
    const ws = pickConsolidationWindow([
      cand("a", VEC_A),
      cand("b", VEC_A_NEAR),
      cand("c", VEC_B),
    ]);
    expect(ws).not.toBeNull();
    const ids = ws!.map((c) => c.id).sort();
    expect(ids).toEqual(["a", "b"]);
  });

  test("separates by project_id", () => {
    const ws = pickConsolidationWindow([
      cand("a", VEC_A, { projectId: "p1" }),
      cand("b", VEC_A_NEAR, { projectId: "p2" }), // same vector, diff project
    ]);
    // Each project has only 1 member → no cluster.
    expect(ws).toBeNull();
  });

  test("bounds the window to top-N", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      cand(`m${i}`, VEC_A, { createdAt: 1000 + i }),
    );
    const ws = pickConsolidationWindow(many, { maxWindow: 4 });
    expect(ws!.length).toBeLessThanOrEqual(4);
  });

  test("excludes candidates with no embedding", () => {
    const ws = pickConsolidationWindow([
      cand("a", VEC_A),
      cand("b", null as any), // no embedding
    ]);
    expect(ws).toBeNull();
  });
});

describe("ConsolidatedBatchSchema — zod enforcement", () => {
  test("accepts a well-formed object with enum type/level", () => {
    const ok = ConsolidatedBatchSchema.safeParse({
      summary: "s", type: "pattern", level: 2, rationale: "r", sourceIds: ["a", "b"],
    });
    expect(ok.success).toBe(true);
  });

  test("rejects an invalid type enum", () => {
    const bad = ConsolidatedBatchSchema.safeParse({
      summary: "s", type: "bogus", level: 2, rationale: "r", sourceIds: ["a", "b"],
    });
    expect(bad.success).toBe(false);
  });

  test("rejects an out-of-range level", () => {
    const bad = ConsolidatedBatchSchema.safeParse({
      summary: "s", type: "decision", level: 9, rationale: "r", sourceIds: ["a", "b"],
    });
    expect(bad.success).toBe(false);
  });

  test("rejects sourceIds with fewer than 2 entries", () => {
    const bad = ConsolidatedBatchSchema.safeParse({
      summary: "s", type: "decision", level: 2, rationale: "r", sourceIds: ["a"],
    });
    expect(bad.success).toBe(false);
  });
});

describe("consolidateWindow — LLM integration", () => {
  function makeLlm(opts: {
    enabled?: boolean;
    objectOk?: boolean;
    value?: any;
  }): LlmSurface {
    return {
      isEnabled: () => opts.enabled ?? true,
      object: async (_prompt: string, _schema: any) => {
        if (opts.objectOk === false) return { ok: false, error: "boom" };
        return {
          ok: true,
          value:
            opts.value ?? {
              summary: "merged",
              type: "pattern",
              level: 2,
              rationale: "similar",
              sourceIds: ["a", "b"],
            },
        };
      },
    };
  }

  test("LLM ok → produces a ConsolidatedBatch with the source ids", async () => {
    const batch = await consolidateWindow(
      [cand("a", VEC_A), cand("b", VEC_A_NEAR)],
      makeLlm({ enabled: true }),
      { idFactory: () => "batch-x" },
    );
    expect(batch).not.toBeNull();
    expect(batch!.id).toBe("batch-x");
    expect(batch!.sourceIds).toEqual(["a", "b"]);
    expect(batch!.type).toBe("pattern");
  });

  test("LLM disabled → null (rule-based only, no batch)", async () => {
    const batch = await consolidateWindow(
      [cand("a", VEC_A), cand("b", VEC_A_NEAR)],
      makeLlm({ enabled: false }),
    );
    expect(batch).toBeNull();
  });

  test("LLM fails → null (silent degrade)", async () => {
    const batch = await consolidateWindow(
      [cand("a", VEC_A), cand("b", VEC_A_NEAR)],
      makeLlm({ enabled: true, objectOk: false }),
    );
    expect(batch).toBeNull();
  });

  test("single-memory window (no cluster) → null regardless of LLM", async () => {
    const batch = await consolidateWindow([cand("a", VEC_A)], makeLlm({ enabled: true }));
    expect(batch).toBeNull();
  });
});

// ─── vecFrom / rowsToCandidates coverage (lines 86-98, 226-232) ─────────────

describe("vecFrom embedding conversion (via pickConsolidationWindow)", () => {
  test("converts a Buffer embedding to a number[]", () => {
    const buf = Buffer.from(new Float32Array([1, 0, 0, 0]).buffer);
    const ws = pickConsolidationWindow([
      cand("a", buf),
      cand("b", buf),
    ]);
    expect(ws).not.toBeNull();
    expect(ws!.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  test("converts a Uint8Array embedding to a number[]", () => {
    const buf = Buffer.from(new Float32Array([1, 0, 0, 0]).buffer);
    const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const ws = pickConsolidationWindow([
      cand("a", uint8 as any),
      cand("b", uint8 as any),
    ]);
    expect(ws).not.toBeNull();
    expect(ws!.length).toBe(2);
  });

  test("converts a Float32Array embedding to a number[]", () => {
    const f32 = new Float32Array([1, 0, 0, 0]);
    const ws = pickConsolidationWindow([
      cand("a", f32 as any),
      cand("b", f32 as any),
    ]);
    expect(ws).not.toBeNull();
    expect(ws!.length).toBe(2);
  });

  test("returns null for empty Buffer (byteLen=0)", () => {
    const buf = Buffer.alloc(0);
    const ws = pickConsolidationWindow([
      cand("a", buf),
      cand("b", buf),
    ]);
    expect(ws).toBeNull();
  });

  test("returns null for Buffer with < 4 bytes (floatLen=0)", () => {
    const buf = Buffer.from([1, 2, 3]); // 3 bytes < 4
    const ws = pickConsolidationWindow([
      cand("a", buf),
      cand("b", buf),
    ]);
    expect(ws).toBeNull();
  });

  test("returns null for empty array embedding", () => {
    const ws = pickConsolidationWindow([
      cand("a", [] as any),
      cand("b", [] as any),
    ]);
    expect(ws).toBeNull();
  });

  test("returns null for unknown embedding type", () => {
    const ws = pickConsolidationWindow([
      cand("a", { foo: 1 } as any),
      cand("b", { foo: 1 } as any),
    ]);
    expect(ws).toBeNull();
  });
});

describe("rowsToCandidates", () => {
  test("converts MemoryRow[] to ConsolidateCandidate[]", () => {
    const rows: MemoryRow[] = [
      {
        id: "r1",
        content: "content",
        type: "decision",
        level: 1,
        user_id: null,
        session_id: null,
        project_id: "proj-1",
        agent_id: null,
        importance: 0.8,
        tags: "[]",
        embedding: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
        metadata: null,
        created_at: 1000,
        updated_at: 2000,
        access_count: 5,
        last_accessed: 3000,
        pinned: 0,
        deleted_at: null,
      },
      {
        id: "r2",
        content: "content2",
        type: "pattern",
        level: 2,
        user_id: "u1",
        session_id: "s1",
        project_id: "proj-2",
        agent_id: "architect",
        importance: 0.5,
        tags: '["t"]',
        embedding: null,
        metadata: null,
        created_at: 5000,
        updated_at: 6000,
        access_count: 0,
        last_accessed: null,
        pinned: 1,
        deleted_at: null,
      },
    ];
    const candidates = rowsToCandidates(rows);
    expect(candidates.length).toBe(2);
    expect(candidates[0].id).toBe("r1");
    expect(candidates[0].projectId).toBe("proj-1");
    expect(candidates[0].importance).toBe(0.8);
    expect(candidates[0].embedding).toBe(rows[0].embedding);
    expect(candidates[0].createdAt).toBe(1000);
    expect(candidates[1].id).toBe("r2");
    expect(candidates[1].projectId).toBe("proj-2");
    expect(candidates[1].embedding).toBeNull();
  });
});
