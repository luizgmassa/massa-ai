import { describe, test, expect } from "bun:test";
import {
  evolveEmbeddings,
  DEFAULT_EMBEDDING_EVOLUTION_CONFIG,
} from "../services/synapse/plasticity/embedding-evolution.js";

const CONFIG = { ...DEFAULT_EMBEDDING_EVOLUTION_CONFIG, enabled: true };

describe("evolveEmbeddings", () => {
  test("disabled returns empty", () => {
    const out = evolveEmbeddings(
      [{
        id: "a",
        original: [1, 0, 0, 0],
        queryEmbeddings: Array(5).fill([1, 0, 0, 0]),
      }],
      { ...CONFIG, enabled: false },
    );
    expect(out).toEqual([]);
  });

  test("skips memories below minSamples", () => {
    const out = evolveEmbeddings(
      [{
        id: "a",
        original: [1, 0, 0, 0],
        queryEmbeddings: [[1, 0, 0, 0], [1, 0, 0, 0]],
      }],
      CONFIG,
    );
    expect(out).toEqual([]);
  });

  test("computes blended embedding when samples are aligned", () => {
    const out = evolveEmbeddings(
      [{
        id: "a",
        original: [1, 0, 0, 0],
        queryEmbeddings: Array(5).fill([0, 1, 0, 0]),
      }],
      { ...CONFIG, driftThreshold: -1 }, // disable drift gate to verify math
    );
    expect(out).toHaveLength(1);
    expect(out[0].blended[0]).toBeCloseTo(0.7, 5);
    expect(out[0].blended[1]).toBeCloseTo(0.3, 5);
  });

  test("skips when drift cosine is below threshold", () => {
    // original=[1,0]; centroid=[0,1] -> cosine = 0; below default driftThreshold (0.5)
    const out = evolveEmbeddings(
      [{
        id: "a",
        original: [1, 0],
        queryEmbeddings: Array(5).fill([0, 1]),
      }],
      CONFIG,
    );
    expect(out).toEqual([]);
  });

  test("skips inputs with mismatched dimensions", () => {
    const out = evolveEmbeddings(
      [{
        id: "a",
        original: [1, 0, 0],
        queryEmbeddings: Array(5).fill([1, 0]),
      }],
      { ...CONFIG, driftThreshold: -1 },
    );
    expect(out).toEqual([]);
  });

  test("centroid is the mean of query embeddings", () => {
    const out = evolveEmbeddings(
      [{
        id: "a",
        original: [1, 0],
        queryEmbeddings: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
      }],
      { ...CONFIG, driftThreshold: -1 },
    );
    // centroid = [1, 0]; blend = 0.7*[1,0] + 0.3*[1,0] = [1, 0]
    expect(out[0].blended[0]).toBeCloseTo(1, 5);
    expect(out[0].blended[1]).toBeCloseTo(0, 5);
  });
});
