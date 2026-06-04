import { describe, test, expect } from "bun:test";
import {
  selectCompressionCandidates,
  compressBatch,
  DEFAULT_COMPRESS_CONFIG,
  type CompressionCandidate,
} from "../services/synapse/plasticity/compress.js";

const NOW = 2_000_000_000;
const DAY = 86_400_000;

const CONFIG = { ...DEFAULT_COMPRESS_CONFIG, enabled: true };

function candidate(
  id: string,
  importance: number,
  ageDays: number,
  contentLen = 500,
): CompressionCandidate {
  return {
    id,
    importance,
    content: "x".repeat(contentLen),
    createdAt: NOW - ageDays * DAY,
  };
}

describe("selectCompressionCandidates", () => {
  test("disabled returns empty", () => {
    const out = selectCompressionCandidates(
      [candidate("a", 0.4, 30)],
      { ...CONFIG, enabled: false },
      NOW,
    );
    expect(out).toEqual([]);
  });

  test("selects mid-importance aging memories", () => {
    const out = selectCompressionCandidates(
      [
        candidate("a", 0.4, 30), // ✓
        candidate("b", 0.9, 30), // too important
        candidate("c", 0.1, 30), // too unimportant
        candidate("d", 0.4, 5),  // too fresh
        candidate("e", 0.4, 30, 50), // too short
      ],
      CONFIG,
      NOW,
    );
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  test("respects maxBatchSize", () => {
    const candidates = Array.from({ length: 100 }, (_, i) =>
      candidate(`c${i}`, 0.4, 30),
    );
    const out = selectCompressionCandidates(
      candidates,
      { ...CONFIG, maxBatchSize: 10 },
      NOW,
    );
    expect(out).toHaveLength(10);
  });
});

describe("compressBatch", () => {
  test("returns updates for valid summaries", async () => {
    const summarize = async ({ content }: { id: string; content: string }) =>
      content.slice(0, 100);
    const out = await compressBatch(
      [candidate("a", 0.4, 30, 500)],
      summarize,
      CONFIG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
    expect(out[0].charsAfter).toBe(100);
    expect(out[0].charsBefore).toBe(500);
    expect(out[0].originalHash).toBeTruthy();
  });

  test("drops summary if longer than 50% of original (quality gate)", async () => {
    const summarize = async ({ content }: { id: string; content: string }) =>
      content.slice(0, 400); // 80% of original
    const out = await compressBatch(
      [candidate("a", 0.4, 30, 500)],
      summarize,
      CONFIG,
    );
    expect(out).toHaveLength(0);
  });

  test("skips empty summaries", async () => {
    const summarize = async () => "";
    const out = await compressBatch(
      [candidate("a", 0.4, 30, 500)],
      summarize,
      CONFIG,
    );
    expect(out).toHaveLength(0);
  });

  test("a failure in one summary does not abort the batch", async () => {
    let count = 0;
    const summarize = async ({ content }: { id: string; content: string }) => {
      count++;
      if (count === 1) throw new Error("boom");
      return content.slice(0, 100);
    };
    const out = await compressBatch(
      [candidate("a", 0.4, 30), candidate("b", 0.4, 30)],
      summarize,
      CONFIG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });

  test("disabled returns empty without calling summarize", async () => {
    let called = false;
    const summarize = async () => {
      called = true;
      return "x";
    };
    const out = await compressBatch(
      [candidate("a", 0.4, 30)],
      summarize,
      { ...CONFIG, enabled: false },
    );
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });
});
