/**
 * Tokenizer unit tests.
 * Pure-logic: token estimation, batch, limit check, truncate.
 */

import { describe, test, expect } from "bun:test";
import {
  estimateTokens,
  estimateTokensBatch,
  exceedsTokenLimit,
  truncateToTokenLimit,
} from "../utils/tokenizer";

describe("estimateTokens", () => {
  test("code: ~4 chars per token (ceil)", () => {
    expect(estimateTokens("abcd")).toBe(1);     // 4/4 = 1
    expect(estimateTokens("abcde")).toBe(2);    // 5/4 = 1.25 -> 2
    expect(estimateTokens("")).toBe(0);         // 0/4 = 0
    expect(estimateTokens("a".repeat(40))).toBe(10);
    expect(estimateTokens("a".repeat(41))).toBe(11);
  });

  test("text: ~5 chars per token (ceil)", () => {
    expect(estimateTokens("abcde", "text")).toBe(1);   // 5/5 = 1
    expect(estimateTokens("abcdef", "text")).toBe(2); // 6/5 = 1.2 -> 2
    expect(estimateTokens("", "text")).toBe(0);
    expect(estimateTokens("a".repeat(50), "text")).toBe(10);
  });

  test("defaults to code type", () => {
    expect(estimateTokens("abcd")).toBe(estimateTokens("abcd", "code"));
  });
});

describe("estimateTokensBatch", () => {
  test("sums token estimates across texts", () => {
    expect(estimateTokensBatch(["abcd", "abcd"])).toBe(2); // 1 + 1
    expect(estimateTokensBatch(["abcde", "abcde"], "text")).toBe(2);
  });

  test("empty array -> 0", () => {
    expect(estimateTokensBatch([])).toBe(0);
  });

  test("respects type override", () => {
    expect(estimateTokensBatch(["abcde"], "text")).toBe(1);
    expect(estimateTokensBatch(["abcde"], "code")).toBe(2);
  });
});

describe("exceedsTokenLimit", () => {
  test("true when estimate > limit", () => {
    expect(exceedsTokenLimit("abcd", 0)).toBe(true);   // 1 > 0
    expect(exceedsTokenLimit("a".repeat(40), 9)).toBe(true); // 10 > 9
  });

  test("false when estimate <= limit", () => {
    expect(exceedsTokenLimit("abcd", 1)).toBe(false);  // 1 <= 1
    expect(exceedsTokenLimit("", 0)).toBe(false);       // 0 <= 0
    expect(exceedsTokenLimit("a".repeat(40), 10)).toBe(false);
  });

  test("respects type override", () => {
    expect(exceedsTokenLimit("abcde", 1, "text")).toBe(false); // 1 <= 1
    expect(exceedsTokenLimit("abcde", 1, "code")).toBe(true);  // 2 > 1
  });
});

describe("truncateToTokenLimit", () => {
  test("returns original when within limit", () => {
    expect(truncateToTokenLimit("abcd", 1)).toBe("abcd");      // 4 chars <= 4
    expect(truncateToTokenLimit("abcdefgh", 2)).toBe("abcdefgh"); // 8 <= 8
    expect(truncateToTokenLimit("", 5)).toBe("");
  });

  test("truncates and appends marker when over limit (code)", () => {
    const out = truncateToTokenLimit("a".repeat(20), 2);
    // maxChars = 2*4 = 8 -> slice(0,8) + marker
    expect(out).toBe("aaaaaaaa\n... (truncated)");
  });

  test("truncates with text type (5 chars/token)", () => {
    const out = truncateToTokenLimit("a".repeat(20), 2, "text");
    // maxChars = 2*5 = 10 -> slice(0,10) + marker
    expect(out).toBe("aaaaaaaaaa\n... (truncated)");
  });

  test("exact boundary not truncated", () => {
    // 8 chars, code, limit 2 -> 8 chars <= 8 -> no truncate
    expect(truncateToTokenLimit("abcdefgh", 2)).toBe("abcdefgh");
  });
});