/**
 * Unit tests for CompressedContent model.
 *
 * Direct model tests — no DB. Exercises constructor, static factories
 * (create, identity, merge), calculateRatio, estimateTokens, isEffective,
 * getQualityScore, getSummary, validate, and toJSON.
 */

import { describe, test, expect } from "bun:test";
import {
  CompressionStrategy,
  type CompressedContent as ICompressedContent,
} from "@massa-ai/shared";
import { CompressedContent } from "../models/CompressedContent.js";

function makeMetadata(overrides: Partial<ICompressedContent["metadata"]> = {}) {
  return {
    originalTokens: 100,
    compressedTokens: 40,
    preservedElements: ["fn signature"],
    timestamp: new Date(),
    ...overrides,
  };
}

describe("CompressedContent", () => {
  describe("constructor", () => {
    test("copies all fields from input data", () => {
      const meta = makeMetadata({ language: "typescript" });
      const cc = new CompressedContent({
        original: "abc",
        compressed: "ab",
        compressionRatio: 0.33,
        tokensSaved: 60,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: meta,
      });
      expect(cc.original).toBe("abc");
      expect(cc.compressed).toBe("ab");
      expect(cc.compressionRatio).toBe(0.33);
      expect(cc.tokensSaved).toBe(60);
      expect(cc.strategy).toBe(CompressionStrategy.CODE_STRUCTURE);
      expect(cc.metadata).toBe(meta);
    });
  });

  describe("calculateRatio", () => {
    test("returns (orig - comp) / orig, rounded to 3 decimals", () => {
      expect(CompressedContent.calculateRatio(100, 40)).toBe(0.6);
      expect(CompressedContent.calculateRatio(200, 50)).toBe(0.75);
      expect(CompressedContent.calculateRatio(1000, 333)).toBe(0.667);
    });

    test("returns 0 when originalTokens is 0 (avoid div-by-zero)", () => {
      expect(CompressedContent.calculateRatio(0, 0)).toBe(0);
      expect(CompressedContent.calculateRatio(0, 10)).toBe(0);
    });

    test("returns negative ratio when compressed exceeds original", () => {
      // Not clamped at the static level; validate() flags it instead.
      expect(CompressedContent.calculateRatio(10, 20)).toBe(-1);
    });
  });

  describe("estimateTokens", () => {
    test("ceil(length / 4) approximation", () => {
      expect(CompressedContent.estimateTokens("")).toBe(0);
      expect(CompressedContent.estimateTokens("abcd")).toBe(1);
      expect(CompressedContent.estimateTokens("abcde")).toBe(2);
      expect(CompressedContent.estimateTokens("abcdefgh")).toBe(2);
    });
  });

  describe("isEffective", () => {
    test("true when ratio >= default threshold (0.3)", () => {
      const cc = new CompressedContent({
        original: "x".repeat(100),
        compressed: "x".repeat(60),
        compressionRatio: 0.4,
        tokensSaved: 40,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata(),
      });
      expect(cc.isEffective()).toBe(true);
    });

    test("false when ratio below default threshold", () => {
      const cc = new CompressedContent({
        original: "x".repeat(100),
        compressed: "x".repeat(90),
        compressionRatio: 0.1,
        tokensSaved: 10,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata(),
      });
      expect(cc.isEffective()).toBe(false);
    });

    test("honors custom threshold", () => {
      const cc = new CompressedContent({
        original: "x".repeat(100),
        compressed: "x".repeat(80),
        compressionRatio: 0.2,
        tokensSaved: 20,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata(),
      });
      expect(cc.isEffective(0.15)).toBe(true);
      expect(cc.isEffective(0.25)).toBe(false);
    });
  });

  describe("getQualityScore", () => {
    test("high when ratio high and preservedElements present", () => {
      const cc = new CompressedContent({
        original: "x".repeat(400),
        compressed: "x".repeat(40),
        compressionRatio: 0.9,
        tokensSaved: 90,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ preservedElements: ["sig"] }),
      });
      // tokenSavingScore = min(0.9, 0.9) = 0.9; preservationScore = 1
      // (0.9 + 1) / 2 = 0.95
      expect(cc.getQualityScore()).toBeCloseTo(0.95, 2);
    });

    test("lower when no preserved elements", () => {
      const cc = new CompressedContent({
        original: "x".repeat(400),
        compressed: "x".repeat(40),
        compressionRatio: 0.9,
        tokensSaved: 90,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ preservedElements: [] }),
      });
      // preservationScore = 0.5 → (0.9 + 0.5)/2 = 0.7
      expect(cc.getQualityScore()).toBeCloseTo(0.7, 2);
    });

    test("caps token-saving component at 0.9", () => {
      const cc = new CompressedContent({
        original: "x".repeat(1000),
        compressed: "x".repeat(10),
        compressionRatio: 0.99,
        tokensSaved: 99,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ preservedElements: ["a"] }),
      });
      // min(0.99, 0.9) = 0.9; (0.9 + 1)/2 = 0.95
      expect(cc.getQualityScore()).toBeCloseTo(0.95, 2);
    });
  });

  describe("static create", () => {
    test("builds CompressedContent from original + compressed strings", () => {
      const cc = CompressedContent.create(
        "x".repeat(100),
        "x".repeat(30),
        CompressionStrategy.CONVERSATION_SUMMARY,
        "text",
        ["summary"],
        "llm",
      );
      expect(cc.original).toBe("x".repeat(100));
      expect(cc.compressed).toBe("x".repeat(30));
      expect(cc.strategy).toBe(CompressionStrategy.CONVERSATION_SUMMARY);
      expect(cc.metadata.language).toBe("text");
      expect(cc.metadata.preservedElements).toEqual(["summary"]);
      expect(cc.metadata.compressionSource).toBe("llm");
      expect(cc.metadata.originalTokens).toBe(25); // ceil(100/4)
      expect(cc.metadata.compressedTokens).toBe(8); // ceil(30/4) = 8
      expect(cc.compressionRatio).toBeCloseTo(
        CompressedContent.calculateRatio(25, 8),
        3,
      );
      expect(cc.tokensSaved).toBe(17);
    });

    test("defaults: no language, empty preservedElements, undefined source", () => {
      const cc = CompressedContent.create(
        "abcdef",
        "abc",
        CompressionStrategy.SEMANTIC_DEDUP,
      );
      expect(cc.metadata.language).toBeUndefined();
      expect(cc.metadata.preservedElements).toEqual([]);
      expect(cc.metadata.compressionSource).toBeUndefined();
    });
  });

  describe("static identity", () => {
    test("no compression — ratio 0, tokensSaved 0, same content", () => {
      const cc = CompressedContent.identity("hello world");
      expect(cc.original).toBe("hello world");
      expect(cc.compressed).toBe("hello world");
      expect(cc.compressionRatio).toBe(0);
      expect(cc.tokensSaved).toBe(0);
      expect(cc.metadata.originalTokens).toBe(cc.metadata.compressedTokens);
      expect(cc.metadata.preservedElements).toEqual([]);
    });

    test("empty string identity", () => {
      const cc = CompressedContent.identity("");
      expect(cc.original).toBe("");
      expect(cc.compressed).toBe("");
      expect(cc.metadata.originalTokens).toBe(0);
      expect(cc.metadata.compressedTokens).toBe(0);
    });
  });

  describe("static merge", () => {
    test("empty array → identity('')", () => {
      const merged = CompressedContent.merge([]);
      expect(merged.original).toBe("");
      expect(merged.compressed).toBe("");
      expect(merged.compressionRatio).toBe(0);
    });

    test("single element → returns it unchanged", () => {
      const one = CompressedContent.create(
        "aaaa",
        "aa",
        CompressionStrategy.CODE_STRUCTURE,
      );
      const merged = CompressedContent.merge([one]);
      expect(merged).toBe(one);
    });

    test("multiple elements join with \\n\\n and aggregate token counts", () => {
      const a = CompressedContent.create(
        "aaaa",
        "aa",
        CompressionStrategy.CODE_STRUCTURE,
        "ts",
        ["sigA"],
      );
      const b = CompressedContent.create(
        "bbbb",
        "bb",
        CompressionStrategy.HIERARCHICAL,
        "ts",
        ["sigB"],
      );
      const merged = CompressedContent.merge([a, b]);
      expect(merged.original).toBe("aaaa\n\nbbbb");
      expect(merged.compressed).toBe("aa\n\nbb");
      expect(merged.strategy).toBe(CompressionStrategy.HIERARCHICAL);
      expect(merged.metadata.originalTokens).toBe(
        a.metadata.originalTokens + b.metadata.originalTokens,
      );
      expect(merged.metadata.compressedTokens).toBe(
        a.metadata.compressedTokens + b.metadata.compressedTokens,
      );
      // dedup preservedElements via Set
      expect(merged.metadata.preservedElements.sort()).toEqual(["sigA", "sigB"]);
    });

    test("dedupes identical preservedElements across contents", () => {
      const a = CompressedContent.create("aaaa", "aa", CompressionStrategy.CODE_STRUCTURE, "ts", ["sig"]);
      const b = CompressedContent.create("bbbb", "bb", CompressionStrategy.CODE_STRUCTURE, "ts", ["sig"]);
      const merged = CompressedContent.merge([a, b]);
      expect(merged.metadata.preservedElements).toEqual(["sig"]);
    });
  });

  describe("toJSON", () => {
    test("produces a plain object with all fields", () => {
      const cc = CompressedContent.create(
        "x".repeat(40),
        "x".repeat(20),
        CompressionStrategy.CODE_STRUCTURE,
        "ts",
        ["s"],
      );
      const json = cc.toJSON();
      expect(json.original).toBe(cc.original);
      expect(json.compressed).toBe(cc.compressed);
      expect(json.compressionRatio).toBe(cc.compressionRatio);
      expect(json.tokensSaved).toBe(cc.tokensSaved);
      expect(json.strategy).toBe(cc.strategy);
      expect(json.metadata).toBe(cc.metadata);
    });
  });

  describe("getSummary", () => {
    test("produces a human-readable string with ratio + tokensSaved", () => {
      const cc = CompressedContent.create(
        "x".repeat(100),
        "x".repeat(40),
        CompressionStrategy.CODE_STRUCTURE,
      );
      const summary = cc.getSummary();
      expect(summary).toContain("code_structure");
      expect(summary).toContain("% reduction");
      expect(summary).toContain("tokens");
      // 60% reduction (100→40 tokens → ratio 0.6)
      expect(summary).toContain("60.0%");
    });

    test("includes strategy name", () => {
      const cc = CompressedContent.create(
        "x".repeat(100),
        "x".repeat(40),
        CompressionStrategy.SEMANTIC_DEDUP,
      );
      expect(cc.getSummary()).toContain("semantic_dedup");
    });
  });

  describe("validate", () => {
    test("valid when compressed <= original, ratio in [0,1], tokensSaved >= 0, non-empty", () => {
      const cc = CompressedContent.create(
        "x".repeat(100),
        "x".repeat(40),
        CompressionStrategy.CODE_STRUCTURE,
      );
      const v = cc.validate();
      expect(v.valid).toBe(true);
      expect(v.errors).toEqual([]);
    });

    test("flags compressed larger than original", () => {
      const cc = new CompressedContent({
        original: "ab",
        compressed: "abcdef",
        compressionRatio: -2,
        tokensSaved: -3,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ originalTokens: 1, compressedTokens: 2 }),
      });
      const v = cc.validate();
      expect(v.valid).toBe(false);
      expect(v.errors).toContain("Compressed version is larger than original");
    });

    test("flags invalid compression ratio (< 0 or > 1)", () => {
      const cc = new CompressedContent({
        original: "abcd",
        compressed: "ab",
        compressionRatio: -0.5,
        tokensSaved: 2,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ originalTokens: 4, compressedTokens: 2 }),
      });
      const v = cc.validate();
      expect(v.valid).toBe(false);
      expect(v.errors.some((e) => e.includes("Invalid compression ratio"))).toBe(true);
    });

    test("flags ratio > 1", () => {
      const cc = new CompressedContent({
        original: "abcd",
        compressed: "ab",
        compressionRatio: 1.5,
        tokensSaved: 2,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ originalTokens: 4, compressedTokens: 2 }),
      });
      const v = cc.validate();
      expect(v.valid).toBe(false);
      expect(v.errors.some((e) => e.includes("Invalid compression ratio"))).toBe(true);
    });

    test("flags negative tokensSaved", () => {
      const cc = new CompressedContent({
        original: "abcd",
        compressed: "ab",
        compressionRatio: 0.5,
        tokensSaved: -10,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ originalTokens: 4, compressedTokens: 2 }),
      });
      const v = cc.validate();
      expect(v.valid).toBe(false);
      expect(v.errors).toContain("Negative tokens saved");
    });

    test("flags empty compressed content", () => {
      const cc = new CompressedContent({
        original: "abcd",
        compressed: "   ",
        compressionRatio: 0.5,
        tokensSaved: 2,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ originalTokens: 4, compressedTokens: 2 }),
      });
      const v = cc.validate();
      expect(v.valid).toBe(false);
      expect(v.errors).toContain("Compressed content is empty");
    });

    test("accumulates multiple errors", () => {
      const cc = new CompressedContent({
        original: "ab",
        compressed: "",
        compressionRatio: 1.5,
        tokensSaved: -1,
        strategy: CompressionStrategy.CODE_STRUCTURE,
        metadata: makeMetadata({ originalTokens: 1, compressedTokens: 0 }),
      });
      const v = cc.validate();
      expect(v.valid).toBe(false);
      expect(v.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});