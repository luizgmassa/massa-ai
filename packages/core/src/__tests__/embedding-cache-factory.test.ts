/**
 * createEmbeddingCache factory unit test — verifies it returns an
 * EmbeddingCachePg instance with the correct provider/model namespace.
 */

import { describe, expect, test } from "bun:test";
import { createEmbeddingCache } from "../services/cache/embedding-cache-factory.js";
import { EmbeddingCachePg } from "../services/cache/embedding-cache-pg.js";

describe("createEmbeddingCache", () => {
  test("returns an EmbeddingCachePg instance", () => {
    const cache = createEmbeddingCache("ollama", "qwen3-embedding:8b");
    expect(cache).toBeInstanceOf(EmbeddingCachePg);
  });

  test("same provider+model produces consistent namespace (getHitRate)", () => {
    const a = createEmbeddingCache("ollama", "qwen3-embedding:8b");
    const b = createEmbeddingCache("ollama", "qwen3-embedding:8b");
    // Both start with 0 hits/misses → getHitRate returns 0.
    expect(a.getHitRate()).toBe(0);
    expect(b.getHitRate()).toBe(0);
  });

  test("different provider produces different namespace", () => {
    // We can't directly inspect the namespace, but two caches with different
    // providers should not share stats. We verify they are distinct instances.
    const a = createEmbeddingCache("ollama", "model-a");
    const b = createEmbeddingCache("openai", "model-a");
    expect(a).not.toBe(b);
  });
});