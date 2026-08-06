/**
 * Unit tests for the row-selection predicate in
 * scripts/reembed-stale-memories.ts. No database, no embedding provider —
 * only the pure function that decides which `memories` rows are stale for
 * the currently configured embedding dimensions.
 */

import { describe, expect, test } from "bun:test";
import { isEmbeddingStale, selectStaleMemoryRows } from "../reembed-stale-memories.ts";

function float32Buffer(dims: number): Buffer {
  return Buffer.from(new Float32Array(dims).buffer);
}

describe("isEmbeddingStale", () => {
  test("null embedding is never stale", () => {
    expect(isEmbeddingStale(null, 2560)).toBe(false);
  });

  test("matching dimension count is not stale", () => {
    expect(isEmbeddingStale(float32Buffer(2560), 2560)).toBe(false);
  });

  test("a shorter embedding (e.g. leftover 384d MiniLM fallback) is stale", () => {
    expect(isEmbeddingStale(float32Buffer(384), 2560)).toBe(true);
  });

  test("a longer embedding (e.g. leftover 4096d qwen3-embedding:8b) is stale", () => {
    expect(isEmbeddingStale(float32Buffer(4096), 2560)).toBe(true);
  });

  test("a byte length not divisible by 4 is flagged stale (corrupt/foreign buffer)", () => {
    expect(isEmbeddingStale(Buffer.from([1, 2, 3]), 2560)).toBe(true);
  });

  test("accepts a plain Uint8Array, not just Buffer", () => {
    const uint8 = new Uint8Array(new Float32Array(1024).buffer);
    expect(isEmbeddingStale(uint8, 1024)).toBe(false);
    expect(isEmbeddingStale(uint8, 2560)).toBe(true);
  });
});

describe("selectStaleMemoryRows", () => {
  test("selects only rows whose embedding dimension count differs from configured", () => {
    const rows = [
      { id: "matches", embedding: float32Buffer(2560) },
      { id: "stale-384", embedding: float32Buffer(384) },
      { id: "stale-4096", embedding: float32Buffer(4096) },
      { id: "no-embedding", embedding: null },
    ];

    const stale = selectStaleMemoryRows(rows, 2560);

    expect(stale.map((r) => r.id).sort()).toEqual(["stale-384", "stale-4096"]);
  });

  test("returns an empty array when every embedded row already matches", () => {
    const rows = [
      { id: "a", embedding: float32Buffer(2560) },
      { id: "b", embedding: null },
    ];

    expect(selectStaleMemoryRows(rows, 2560)).toEqual([]);
  });

  test("returns an empty array for an empty page", () => {
    expect(selectStaleMemoryRows([], 2560)).toEqual([]);
  });

  test("preserves extra fields on the row (works with the real MemoryRow shape)", () => {
    const rows = [
      { id: "x", content: "hello", embedding: float32Buffer(384), importance: 0.5 },
    ];

    const stale = selectStaleMemoryRows(rows, 2560);

    expect(stale).toHaveLength(1);
    expect(stale[0]!.content).toBe("hello");
    expect(stale[0]!.importance).toBe(0.5);
  });
});
