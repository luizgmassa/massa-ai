/**
 * Table-driven coverage for the two cheap classifiers Synapse owns:
 *   - classifyQuery  (broad / focused / specific)   — used by the gate
 *   - detectIntent   (decision / debug / pattern / symbol / general) — chain inhibition
 *
 * Each case is tagged with a category from the benchmark v2 taxonomy so a
 * failing test points directly at which query bucket regressed.
 */

import { describe, test, expect } from "bun:test";
import { classifyQuery } from "../services/synapse/inhibition/confidence-gate.js";
import { detectIntent } from "../services/synapse/inhibition/chain-inhibition.js";

interface ClassRow {
  category: string;
  query: string;
  expectedClass: "specific" | "focused" | "broad";
}

const CLASS_CASES: ClassRow[] = [
  // specific — paths, CamelCase, function calls, snake_case, quoted symbols
  { category: "implementation", query: "src/auth/middleware.ts behavior", expectedClass: "specific" },
  { category: "implementation", query: "ContextualSearchRLM hybrid search", expectedClass: "specific" },
  { category: "implementation", query: "MemoryConsolidationJob decay fields", expectedClass: "specific" },
  { category: "ranking", query: "applyDiversityPenalty MMR Jaccard tokens", expectedClass: "specific" },
  { category: "ranking", query: "RedundancyFilter cosine similarity 0.95", expectedClass: "specific" },
  { category: "configuration", query: "EmbeddingService configuration defaults", expectedClass: "specific" },
  { category: "implementation", query: "verify_token snake_case query", expectedClass: "specific" },
  { category: "implementation", query: "find references to `useStore` in code", expectedClass: "specific" },
  // focused — technical keywords, no symbol-like tokens
  { category: "configuration", query: "middleware ordering", expectedClass: "focused" },
  { category: "tradeoff", query: "schema migration approach", expectedClass: "focused" },
  // broad — exploratory / natural language
  { category: "decision", query: "why did we choose pgvector over chromadb", expectedClass: "broad" },
  { category: "best_practice", query: "best practice for caching queries layer", expectedClass: "broad" },
  { category: "troubleshooting", query: "the build is broken cannot connect to db", expectedClass: "broad" },
  // "provider" is a technical keyword, so this resolves to focused (not broad).
  { category: "troubleshooting", query: "how to resolve embedding provider error", expectedClass: "focused" },
];

describe("classifyQuery — categorical coverage", () => {
  for (const row of CLASS_CASES) {
    test(`[${row.category}] "${row.query}" → ${row.expectedClass}`, () => {
      expect(classifyQuery(row.query)).toBe(row.expectedClass);
    });
  }
});

interface IntentRow {
  category: string;
  query: string;
  expectedIntent: "decision" | "debug" | "pattern" | "symbol" | "general";
}

const INTENT_CASES: IntentRow[] = [
  // decision intent
  { category: "decision", query: "why did we choose pgvector over chromadb", expectedIntent: "decision" },
  { category: "decision", query: "why did we decide RRF over pure cosine", expectedIntent: "decision" },
  { category: "decision", query: "rationale for hybrid vector keyword search", expectedIntent: "decision" },
  { category: "tradeoff", query: "trade-off between recency and importance", expectedIntent: "decision" },
  { category: "decision", query: "por que decidimos usar HNSW", expectedIntent: "decision" },
  // debug intent
  { category: "troubleshooting", query: "how to fix ECONNREFUSED postgres connection", expectedIntent: "debug" },
  { category: "troubleshooting", query: "how to resolve embedding provider error", expectedIntent: "debug" },
  { category: "troubleshooting", query: "the build is broken cannot connect to db", expectedIntent: "debug" },
  { category: "troubleshooting", query: "como resolver erro de timeout", expectedIntent: "debug" },
  // pattern intent (must win over debug when the word "pattern" is present even if "error" appears)
  { category: "best_practice", query: "best practice for caching queries layer", expectedIntent: "pattern" },
  { category: "best_practice", query: "pattern for memory invalidation on git change", expectedIntent: "pattern" },
  { category: "best_practice", query: "idiomatic way to handle retry with backoff", expectedIntent: "pattern" },
  { category: "best_practice", query: "pattern for handling errors gracefully", expectedIntent: "pattern" },
  // symbol intent
  { category: "implementation", query: "definition of computeStrengthenUpdates", expectedIntent: "symbol" },
  { category: "implementation", query: "signature of applyAttentionScore", expectedIntent: "symbol" },
  { category: "implementation", query: "what is the MemoryConsolidationJob class", expectedIntent: "symbol" },
  // general / no clear intent
  { category: "implementation", query: "embedding provider configuration ollama setup", expectedIntent: "general" },
  { category: "storage", query: "vector store HNSW index initialization", expectedIntent: "general" },
  { category: "architecture", query: "memory consolidation job decay rate strategy", expectedIntent: "general" },
];

describe("detectIntent — categorical coverage", () => {
  for (const row of INTENT_CASES) {
    test(`[${row.category}] "${row.query}" → ${row.expectedIntent}`, () => {
      expect(detectIntent(row.query)).toBe(row.expectedIntent);
    });
  }
});

describe("classification stays deterministic over repeated calls", () => {
  // Same input must always classify identically. This protects against the
  // accidental use of mutable state (Date.now, Math.random, captured Maps).
  test("classifyQuery is stable", () => {
    for (const row of CLASS_CASES) {
      const a = classifyQuery(row.query);
      const b = classifyQuery(row.query);
      const c = classifyQuery(row.query);
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });

  test("detectIntent is stable", () => {
    for (const row of INTENT_CASES) {
      const a = detectIntent(row.query);
      const b = detectIntent(row.query);
      const c = detectIntent(row.query);
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });
});
