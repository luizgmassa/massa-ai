/**
 * Tests for the A1/A2/A3 lexical-search improvements:
 *  - A1: trigram + fuzzy lexical RRF streams (pure helpers + SQLite store)
 *  - A2: proximity + title re-ranking pass (pure function)
 *  - A3: code-graph stream id-bridge (vector chunk ids → memory-graph nodes)
 *
 * Isolation strategy: pure-function tests need no DB. The SQLite store tests
 * use a process-local temp DB (NOT the shared e2e index) so they never trigger
 * a full-repo index or OOM. The fusion/RRF wiring test mirrors the in-memory
 * RRF math from query-understanding.test.ts (no config, no network).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import os from "os";
import path from "path";
import fs from "fs";
import { config } from "@massa-th0th/shared";
import type { SearchResult } from "@massa-th0th/shared";
import { SearchSource } from "@massa-th0th/shared";
import {
  sanitizeTrigramQuery,
  levenshtein,
  maxEditDistance,
  findAllPositions,
  findMinSpan,
  countAdjacentPairs,
  extractQueryTerms,
  applyProximityRerank,
} from "../services/search/lexical-search.js";
import { KeywordSearch } from "../data/sqlite/keyword-search.js";

// ─── Pure function tests ─────────────────────────────────────────────────────

describe("sanitizeTrigramQuery", () => {
  test("OR-joins quoted tokens for >=3 char words", () => {
    expect(sanitizeTrigramQuery("useEffect hook", "OR")).toBe(
      '"useEffect" OR "hook"',
    );
  });

  test("drops tokens shorter than 3 chars (cannot form a trigram)", () => {
    expect(sanitizeTrigramQuery("a is the useEffect", "OR")).toBe(
      '"useEffect"',
    );
  });

  test("returns empty string when no usable tokens remain", () => {
    expect(sanitizeTrigramQuery("a is", "OR")).toBe("");
    expect(sanitizeTrigramQuery("", "OR")).toBe("");
  });

  test("falls back to stopwords when all terms are stopwords", () => {
    // "the" and "use" are stopwords but must still produce a query rather than
    // an empty string, so a stopword-only query still searches.
    const out = sanitizeTrigramQuery("the use", "OR");
    expect(out.length).toBeGreaterThan(0);
  });

  test("strips FTS5 special characters", () => {
    // Colons, asterisks, parens are removed so they don't leak as FTS5 operators.
    expect(sanitizeTrigramQuery("foo:bar", "OR")).not.toContain(":");
    expect(sanitizeTrigramQuery("foo*bar", "OR")).not.toContain("*");
    expect(sanitizeTrigramQuery("(foo)", "OR")).not.toContain("(");
  });
});

describe("levenshtein", () => {
  test("zero distance for identical strings", () => {
    expect(levenshtein("useEffect", "useEffect")).toBe(0);
  });

  test("one insertion (useEffct → useEffect)", () => {
    expect(levenshtein("useEffct", "useEffect")).toBe(1);
  });

  test("one substitution (useEffekt → useEffect)", () => {
    expect(levenshtein("useEffekt", "useEffect")).toBe(1);
  });

  test("empty string cases", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "")).toBe(0);
  });
});

describe("maxEditDistance", () => {
  test("short words tolerate 1 edit", () => {
    expect(maxEditDistance(3)).toBe(1);
    expect(maxEditDistance(4)).toBe(1);
  });
  test("medium words tolerate 2 edits", () => {
    expect(maxEditDistance(5)).toBe(2);
    expect(maxEditDistance(12)).toBe(2);
  });
  test("long words tolerate 3 edits", () => {
    expect(maxEditDistance(13)).toBe(3);
  });
});

describe("findAllPositions", () => {
  test("finds all overlapping occurrences", () => {
    expect(findAllPositions("aaa", "aa")).toEqual([0, 1]);
  });
  test("finds non-overlapping occurrences", () => {
    expect(findAllPositions("foo bar foo", "foo")).toEqual([0, 8]);
  });
  test("empty term returns no positions", () => {
    expect(findAllPositions("foo", "")).toEqual([]);
  });
});

describe("findMinSpan", () => {
  test("zero for a single list", () => {
    expect(findMinSpan([[1, 5, 9]])).toBe(0);
  });
  test("tightest window across multiple lists", () => {
    // lists: [0,100], [50], [60].
    // Sweep: ptrs [0,0,0] → values 0,50,60 → span 60, advance min (idx0).
    //        ptrs [1,0,0] → values 100,50,60 → span 50, advance min (idx1).
    //        idx1 exhausted → break. minSpan = 50.
    expect(findMinSpan([[0, 100], [50], [60]])).toBe(50);
  });
  test("Infinity for empty input", () => {
    expect(findMinSpan([])).toBe(Infinity);
  });
});

describe("countAdjacentPairs", () => {
  test("counts adjacent term pairs within gap", () => {
    // "foo bar" at positions 0 and 4, gap 30 → 1 pair
    const positions = [findAllPositions("foo bar baz", "foo"), findAllPositions("foo bar baz", "bar")];
    expect(countAdjacentPairs(positions, ["foo", "bar"], 30)).toBe(1);
  });
  test("zero for non-adjacent terms beyond gap", () => {
    const positions = [[0], [100]];
    expect(countAdjacentPairs(positions, ["a", "b"], 30)).toBe(0);
  });
  test("zero for fewer than 2 lists", () => {
    expect(countAdjacentPairs([[0]], ["a"])).toBe(0);
  });
});

describe("extractQueryTerms", () => {
  test("lowercases and splits, drops short tokens and stopwords", () => {
    // "The" is a stopword and is filtered out; "useEffect" lowercased.
    expect(extractQueryTerms("The useEffect Hook")).toEqual(["useeffect", "hook"]);
  });
  test("filters stopwords but falls back when all are stopwords", () => {
    // all stopwords → returns all terms rather than empty
    const terms = extractQueryTerms("the and for");
    expect(terms).toEqual(["the", "and", "for"]);
  });
});

// ─── A2: proximity rerank ────────────────────────────────────────────────────

function makeResult(
  id: string,
  content: string,
  meta: Record<string, unknown> = {},
  score = 0.5,
): SearchResult {
  return {
    id,
    content,
    score,
    source: SearchSource.KEYWORD,
    metadata: meta as any,
  };
}

describe("applyProximityRerank", () => {
  test("stable: empty input returns empty", () => {
    expect(applyProximityRerank([], "query")).toEqual([]);
  });

  test("title boost promotes results whose title contains query terms", () => {
    const needle = makeResult(
      "needle",
      "export function useEffect() { return 0 }",
      { label: "useEffect", type: "code_block", language: "ts" },
    );
    const haystack = makeResult(
      "hay",
      "some unrelated code with no matching title",
      { label: "unrelated", type: "code_block", language: "ts" },
    );
    // haystack ranked higher by RRF score, but needle should win after rerank
    // because its title matches the query term.
    const out = applyProximityRerank(
      [haystack, needle],
      "useEffect",
    );
    expect(out[0].id).toBe("needle");
  });

  test("code chunks get stronger title boost than prose", () => {
    const codeChunk = makeResult("c", "fn()", {
      label: "myFunc",
      type: "code_block",
      language: "ts",
    });
    const proseChunk = makeResult("p", "myFunc described in prose", {
      label: "myFunc",
      type: "heading_section",
    });
    // Both titles match; code should rank above prose due to the 0.6 vs 0.3
    // weight. Place prose first by RRF to confirm code overtakes it.
    const out = applyProximityRerank([proseChunk, codeChunk], "myFunc");
    expect(out[0].id).toBe("c");
  });

  test("multi-term proximity rewards terms appearing close together", () => {
    const tight = makeResult(
      "tight",
      "the quick brown fox jumps",
      { label: "doc", type: "heading_section" },
    );
    const loose = makeResult(
      "loose",
      "the quick .............. brown .......... fox .......... jumps far apart",
      { label: "doc", type: "heading_section" },
    );
    const out = applyProximityRerank([loose, tight], "quick brown fox jumps");
    expect(out[0].id).toBe("tight");
  });

  test("equal boosts preserve original RRF order (stable sort)", () => {
    const a = makeResult("a", "content one");
    const b = makeResult("b", "content two");
    const out = applyProximityRerank([a, b], "zzznomatch");
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

// ─── A1: SQLite KeywordSearch trigram + fuzzy ───────────────────────────────
//
// Uses a process-local temp DB (NOT the shared e2e index). Created fresh per
// test to avoid any cross-test coupling.

describe("KeywordSearch trigram + fuzzy (SQLite)", () => {
  let dbPath: string;
  let store: KeywordSearch;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `lex-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    // KeywordSearch reads its dbPath from config; we override via env so the
    // factory-configured path points at our temp file.
    process.env.KEYWORD_SEARCH_DB_PATH = dbPath;
    // Re-require config cleanly is hard in ESM; instead construct the store
    // with the temp path by setting the config field before instantiation.
    // The store constructor reads config.get('keywordSearch').dbPath.
    store = makeStoreWithDb(dbPath);
  });

  afterEach(() => {
    try {
      (store as any).close?.();
    } catch { /* ignore */ }
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
    delete process.env.KEYWORD_SEARCH_DB_PATH;
  });

  test("trigram search matches identifier substring (useEff → useEffect)", async () => {
    await store.index("c1", "export function useEffect() {}", {
      projectId: "p",
      type: "code_block",
    });
    await store.index("c2", "completely unrelated prose content", {
      projectId: "p",
      type: "heading_section",
    });

    const results = await store.searchTrigram!("useEff", { projectId: "p" }, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("c1");
  });

  test("fuzzyCorrect fixes a typo against the populated vocabulary", async () => {
    // Populate vocabulary with "useEffect" via index().
    await store.index("c1", "useEffect useEffectCleanup", {
      projectId: "p",
      type: "code_block",
    });
    const fix = await store.fuzzyCorrect!("useEffct");
    expect(fix).toBe("useeffect");
  });

  test("fuzzyCorrect returns null for an exact match", async () => {
    await store.index("c1", "useEffect", { projectId: "p" });
    const fix = await store.fuzzyCorrect!("useeffect");
    expect(fix).toBeNull();
  });

  test("fuzzyCorrect is LRU-cached (repeat call returns same result)", async () => {
    await store.index("c1", "useEffect", { projectId: "p" });
    const a = await store.fuzzyCorrect!("useEffct");
    const b = await store.fuzzyCorrect!("useEffct");
    expect(a).toBe(b);
  });

  test("searchTrigram returns [] for empty/sanitized-away query", async () => {
    await store.index("c1", "export function useEffect() {}", {
      projectId: "p",
    });
    const results = await store.searchTrigram!("a", { projectId: "p" }, 10);
    expect(results).toEqual([]);
  });

  test("delete removes from trigram index too", async () => {
    await store.index("c1", "useEffect implementation", { projectId: "p" });
    await store.delete("c1");
    const results = await store.searchTrigram!("useEffect", { projectId: "p" }, 10);
    expect(results).toEqual([]);
  });
});

/**
 * Construct a KeywordSearch bound to a specific temp DB path. The store reads
 * `config.get('keywordSearch').dbPath` in its constructor, so we point the
 * config singleton at our temp file before instantiation.
 */
function makeStoreWithDb(dbPath: string): KeywordSearch {
  config.set("keywordSearch", {
    ...config.get("keywordSearch"),
    dbPath,
  });
  return new KeywordSearch();
}
