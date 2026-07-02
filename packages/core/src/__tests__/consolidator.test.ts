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
  type ConsolidateCandidate,
  type LlmSurface,
} from "../services/memory/consolidator.js";

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
