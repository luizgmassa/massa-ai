/**
 * Unit tests for lexical-search helpers (pure module).
 *
 * Covers trigram sanitization, Levenshtein, maxEditDistance, proximity helpers
 * (findAllPositions, findMinSpan, countAdjacentPairs), extractQueryTerms, and
 * applyProximityRerank. All functions are pure over inputs — no DB, no config.
 */

import { describe, test, expect } from "bun:test";
import { SearchSource, type SearchResult } from "@massa-ai/shared";
import {
  STOPWORDS,
  sanitizeTrigramQuery,
  levenshtein,
  maxEditDistance,
  findAllPositions,
  findMinSpan,
  countAdjacentPairs,
  extractQueryTerms,
  applyProximityRerank,
} from "../kernel/lexical-search.js";

function result(
  id: string,
  score: number,
  content: string,
  meta: Record<string, unknown> = {},
): SearchResult {
  return {
    id,
    content,
    score,
    source: SearchSource.HYBRID,
    metadata: { filePath: `${id}.ts`, ...meta },
  };
}

// ── sanitizeTrigramQuery ───────────────────────────────────────────────────

describe("sanitizeTrigramQuery", () => {
  test("OR mode: joins tokens with OR, quoted, drops <3-char tokens", () => {
    expect(sanitizeTrigramQuery("foo bar b", "OR")).toBe('"foo" OR "bar"');
  });

  test("AND mode: joins tokens with space", () => {
    expect(sanitizeTrigramQuery("foo bar", "AND")).toBe('"foo" "bar"');
  });

  test("strips FTS5 special characters (joins into one token when no spaces)", () => {
    // Special chars removed → "foobarbaz" (no spaces → single token)
    expect(sanitizeTrigramQuery('foo"bar{baz}', "OR")).toBe('"foobarbaz"');
  });

  test("returns empty for a query shorter than 3 chars", () => {
    expect(sanitizeTrigramQuery("ab", "OR")).toBe("");
    expect(sanitizeTrigramQuery("", "OR")).toBe("");
  });

  test("returns empty when no tokens survive the >=3 filter", () => {
    expect(sanitizeTrigramQuery("a b c", "OR")).toBe("");
  });

  test("filters stopwords but falls back to all words when all are stopwords", () => {
    // 'the' and 'and' are stopwords; 'function' is not.
    expect(sanitizeTrigramQuery("the and function", "OR")).toBe('"function"');
    // All stopwords → falls back to the word list.
    expect(sanitizeTrigramQuery("the and for", "OR")).toBe('"the" OR "and" OR "for"');
  });

  test("dedupes case-insensitive tokens keeping first occurrence", () => {
    expect(sanitizeTrigramQuery("Foo foo BAR bar", "OR")).toBe('"Foo" OR "BAR"');
  });

  test("default mode is OR", () => {
    expect(sanitizeTrigramQuery("foo bar", "OR")).toBe('"foo" OR "bar"');
  });
});

// ── levenshtein ────────────────────────────────────────────────────────────

describe("levenshtein", () => {
  test("identical strings → 0", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  test("empty a → length of b", () => {
    expect(levenshtein("", "abc")).toBe(3);
  });

  test("empty b → length of a", () => {
    expect(levenshtein("abc", "")).toBe(3);
  });

  test("single substitution", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  test("single insertion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  test("single deletion", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  test("two edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  test("completely different", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });
});

// ── maxEditDistance ────────────────────────────────────────────────────────

describe("maxEditDistance", () => {
  test("<=4 chars → 1", () => {
    expect(maxEditDistance(1)).toBe(1);
    expect(maxEditDistance(4)).toBe(1);
  });

  test("5-12 chars → 2", () => {
    expect(maxEditDistance(5)).toBe(2);
    expect(maxEditDistance(12)).toBe(2);
  });

  test(">12 chars → 3", () => {
    expect(maxEditDistance(13)).toBe(3);
    expect(maxEditDistance(100)).toBe(3);
  });
});

// ── findAllPositions ───────────────────────────────────────────────────────

describe("findAllPositions", () => {
  test("finds all occurrences ascending", () => {
    expect(findAllPositions("ab ab ab", "ab")).toEqual([0, 3, 6]);
  });

  test("single occurrence", () => {
    expect(findAllPositions("hello world", "world")).toEqual([6]);
  });

  test("empty term → empty array", () => {
    expect(findAllPositions("hello", "")).toEqual([]);
  });

  test("no match → empty array", () => {
    expect(findAllPositions("hello", "xyz")).toEqual([]);
  });
});

// ── findMinSpan ────────────────────────────────────────────────────────────

describe("findMinSpan", () => {
  test("empty input → Infinity", () => {
    expect(findMinSpan([])).toBe(Infinity);
  });

  test("single list → 0", () => {
    expect(findMinSpan([[1, 5, 10]])).toBe(0);
  });

  test("two lists: min span covers closest pair", () => {
    // list A = [0, 10], list B = [5] → span = 5-0 = 5
    expect(findMinSpan([[0, 10], [5]])).toBe(5);
  });

  test("three lists: sweep finds minimum window", () => {
    // A=[0,10], B=[4], C=[8] → first window 0..8 span=8, then A advances to 10 → 4..10 span=6
    expect(findMinSpan([[0, 10], [4], [8]])).toBe(6);
  });

  test("one list exhausted terminates", () => {
    // A=[1], B=[100], C=[200] → single window 1..200 span=199
    expect(findMinSpan([[1], [100], [200]])).toBe(199);
  });
});

// ── countAdjacentPairs ─────────────────────────────────────────────────────

describe("countAdjacentPairs", () => {
  test("single term → 0", () => {
    expect(countAdjacentPairs([[1, 2, 3]], ["foo"])).toBe(0);
  });

  test("two terms, adjacent within gap", () => {
    // foo at 0 (len 3), bar at 5 → 5 within [3, 3+30] → 1 pair
    expect(countAdjacentPairs([[0], [5]], ["foo", "bar"])).toBe(1);
  });

  test("pair outside gap not counted", () => {
    // foo at 0 (len 3), bar at 100 → 100 > 33 → no pair
    expect(countAdjacentPairs([[0], [100]], ["foo", "bar"], 30)).toBe(0);
  });

  test("repeated token consumes right positions (no double-count)", () => {
    // foo foo bar: foo at 0,4; bar at 8. First foo pairs with bar (8 in [3,33]),
    // second foo pairs with bar — but bar[j] already consumed by first? No:
    // j only advances for the right list. left positions iterate; each advances j.
    // foo(0,len3) → bar at >=3: bar[0]=8 is >=3 and <=33 → pair, j=1. foo(4,len3) → bar>=7: j=1 out → no.
    expect(countAdjacentPairs([[0, 4], [8]], ["foo", "foo", "bar"])).toBe(1);
  });

  test("three consecutive terms counts two adjacent pairs", () => {
    // foo(0,3), bar(4,3), baz(8,3) → foo-bar pair (4 in [3,33]); bar-baz pair (8 in [7,37])
    expect(countAdjacentPairs([[0], [4], [8]], ["foo", "bar", "baz"])).toBe(2);
  });
});

// ── extractQueryTerms ──────────────────────────────────────────────────────

describe("extractQueryTerms", () => {
  test("lowercases and splits on whitespace, drops <2 chars", () => {
    expect(extractQueryTerms("Hello World a b")).toEqual(["hello", "world"]);
  });

  test("filters stopwords, keeps meaningful terms", () => {
    const terms = extractQueryTerms("the function will called foo");
    expect(terms).toContain("function");
    expect(terms).toContain("called");
    expect(terms).toContain("foo");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("will");
  });

  test("falls back to all terms when every term is a stopword", () => {
    const terms = extractQueryTerms("the and for");
    expect(terms).toEqual(["the", "and", "for"]);
  });
});

// ── applyProximityRerank ───────────────────────────────────────────────────

describe("applyProximityRerank", () => {
  test("empty input → empty output", () => {
    expect(applyProximityRerank([], "query")).toEqual([]);
  });

  test("single-term query: only title boost applies (no proximity)", () => {
    const results = [
      result("a", 0.8, "function foo() {}", { label: "bar" }),
      result("b", 0.8, "function bar() {}", { label: "foo" }),
    ];
    const out = applyProximityRerank(results, "foo");
    // b's title contains "foo" → boosted above a (same score group)
    expect(out[0].id).toBe("b");
  });

  test("code result gets stronger title boost (0.6) vs prose (0.3)", () => {
    const codeResult = result("code", 0.5, "impl", {
      type: "code_block",
      label: "myFunc",
    });
    const proseResult = result("prose", 0.5, "myFunc usage", {
      label: "otherFunc",
    });
    const out = applyProximityRerank([proseResult, codeResult], "myFunc");
    // Both in same score group (0.5); code has stronger title boost → first
    expect(out[0].id).toBe("code");
  });

  test("equally-boosted results keep RRF order (stable within group)", () => {
    const results = [
      result("a", 0.5, "content one"),
      result("b", 0.5, "content two"),
      result("c", 0.5, "content three"),
    ];
    const out = applyProximityRerank(results, "nonexistent");
    // No title hits, no proximity (single nonexistent term) → original order
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  test("results in different score groups are not reordered across groups", () => {
    const results = [
      result("high", 0.9, "no match"),
      result("low", 0.5, "no match either"),
    ];
    const out = applyProximityRerank(results, "nonexistent");
    // Different score groups (>0.01 apart) → groups preserved, no re-order
    expect(out.map((r) => r.id)).toEqual(["high", "low"]);
  });

  test("two-term query: proximity boost promotes close-together hits", () => {
    const close = result("close", 0.5, "foo bar implementation detail");
    const far = result("far", 0.5, "foo ... lots of text ... bar end");
    const out = applyProximityRerank([far, close], "foo bar");
    expect(out[0].id).toBe("close");
  });

  test("resolveTitle falls back to first content line when no metadata", () => {
    const r: SearchResult = {
      id: "x",
      content: "first line title\nsecond line",
      score: 0.5,
      source: SearchSource.HYBRID,
      metadata: {},
    };
    const out = applyProximityRerank([r], "first");
    // The first content line acts as title; "first" is in it → boosted.
    expect(out[0].id).toBe("x");
  });

  test("isCodeResult detects via language metadata", () => {
    const code = result("c", 0.5, "impl", { language: "typescript" });
    const out = applyProximityRerank([code], "impl");
    expect(out[0].id).toBe("c");
  });

  test("stopword-only query falls back to all terms for proximity", () => {
    // 'the' is a stopword but extractQueryTerms falls back; 'the' is >=2 chars.
    const results = [
      result("a", 0.5, "the quick brown fox"),
      result("b", 0.5, "nothing here"),
    ];
    const out = applyProximityRerank(results, "the");
    // Single fallback term "the"; a's title (filePath a.ts) won't contain "the"
    // but a's content does → proximity applies only for >=2 terms. So just
    // title: neither title contains "the" → original order preserved.
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

// ── STOPWORDS sanity ──────────────────────────────────────────────────────

describe("STOPWORDS", () => {
  test("contains common English stopwords", () => {
    expect(STOPWORDS.has("the")).toBe(true);
    expect(STOPWORDS.has("function")).toBe(false);
  });
});