/**
 * `resolveEmbeddingDimensions` — `env > known width > configured > default`.
 *
 * The case that matters is the one that shipped: a config.json written by an
 * older installer records `qwen3-embedding:4b` beside `4096`. That is not a
 * cosmetic mismatch. `createEmbeddingProvider` refuses to fall through on a
 * dimension mismatch — on purpose, so retrieval never silently degrades — so
 * every embedding path throws `DimensionMismatchError` until someone hand-edits
 * the file. Deriving the width from a known model is what lets an existing
 * install recover on its own.
 */

import { describe, test, expect } from "bun:test";
import {
  resolveEmbeddingDimensions,
  knownEmbeddingDimensions,
  knownEmbeddingModels,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from "../embedding-dimensions";

describe("resolveEmbeddingDimensions", () => {
  test("a known model's width beats a config value that contradicts it, and reports the correction", () => {
    const r = resolveEmbeddingDimensions("qwen3-embedding:4b", 4096, undefined);
    expect(r.dimensions).toBe(2560);
    expect(r.correctedFrom).toBe(4096);
  });

  test("an agreeing config value is not reported as a correction", () => {
    // A warning that fires for every correctly-configured install is a warning
    // operators learn to ignore.
    const r = resolveEmbeddingDimensions("qwen3-embedding:4b", 2560, undefined);
    expect(r.dimensions).toBe(2560);
    expect(r.correctedFrom).toBeUndefined();
  });

  test("an explicit env value wins over both, and is never a correction", () => {
    const r = resolveEmbeddingDimensions("qwen3-embedding:4b", 4096, 1024);
    expect(r.dimensions).toBe(1024);
    expect(r.correctedFrom).toBeUndefined();
  });

  test("an unknown model keeps the configured value untouched", () => {
    // It may be a truncated or fine-tuned variant whose width only the user
    // knows; overriding it would be guessing.
    const r = resolveEmbeddingDimensions("some-org/custom-embed:v2", 1536, undefined);
    expect(r.dimensions).toBe(1536);
    expect(r.correctedFrom).toBeUndefined();
  });

  test("an unknown model with nothing configured falls back to the reference default", () => {
    const r = resolveEmbeddingDimensions("some-org/custom-embed:v2", undefined, undefined);
    expect(r.dimensions).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
  });

  test("a known model with nothing configured resolves to its native width", () => {
    const r = resolveEmbeddingDimensions("qwen3-embedding:8b", undefined, undefined);
    expect(r.dimensions).toBe(4096);
    expect(r.correctedFrom).toBeUndefined();
  });

  test("an absent model name never throws and never invents a width", () => {
    expect(resolveEmbeddingDimensions(undefined, 768, undefined).dimensions).toBe(768);
    expect(resolveEmbeddingDimensions(undefined, undefined, undefined).dimensions).toBe(
      DEFAULT_EMBEDDING_DIMENSIONS,
    );
  });
});

describe("the known-width table", () => {
  test("carries the exact model set, not merely some of it", () => {
    // An exact set, so a model silently dropped from the table is as red as a
    // changed width — the shell/TypeScript parity check in
    // scripts/__tests__/embedding-defaults-parity.test.ts asserts the same set
    // against the bash copy.
    expect(knownEmbeddingModels()).toEqual([
      "bge-m3",
      "qwen3-embedding:0.6b",
      "qwen3-embedding:4b",
      "qwen3-embedding:8b",
    ]);
  });

  test("distinguishes a model it knows from one it does not", () => {
    expect(knownEmbeddingDimensions("qwen3-embedding:4b")).toBe(2560);
    expect(knownEmbeddingDimensions("nomic-embed-text")).toBeUndefined();
    expect(knownEmbeddingDimensions(undefined)).toBeUndefined();
  });

  test("tolerates surrounding whitespace from a hand-edited config.json", () => {
    expect(knownEmbeddingDimensions("  qwen3-embedding:4b  ")).toBe(2560);
  });
});
