/**
 * Embedding provider (AISDKEmbeddingProvider) unit tests — mocks fetch and
 * the AI SDK to avoid real API calls. Covers sanitizeText, truncateText,
 * getEmbeddingModel branches, ollama direct API, retry/timeout, isAvailable,
 * getConfig, getRateLimitStatus, createProvider.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  AISDKEmbeddingProvider,
  DimensionMismatchError,
  createProvider,
} from "../services/embeddings/provider.js";
import type { EmbeddingProviderConfig } from "../services/embeddings/config.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

function makeConfig(overrides: Partial<EmbeddingProviderConfig> = {}): EmbeddingProviderConfig {
  return {
    provider: "ollama",
    model: "test-model",
    baseURL: "http://localhost:11434",
    dimensions: 4,
    priority: 1,
    timeout: 50000,
    maxRetries: 1,
    ...overrides,
  };
}

describe("AISDKEmbeddingProvider", () => {
  test("constructor sets properties from config", () => {
    const provider = new AISDKEmbeddingProvider(makeConfig({ model: "qwen", dimensions: 8 }), "ollama-test");
    expect(provider.id).toBe("ollama-test");
    expect(provider.model).toBe("qwen");
    expect(provider.dimensions).toBe(8);
  });

  test("constructor initializes rate limiter when rateLimits configured", () => {
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ rateLimits: { requestsPerMinute: 60 } }),
      "rate-limited",
    );
    expect(provider.getRateLimitStatus()).not.toBeNull();
    expect(provider.getRateLimitStatus()!.rpm.limit).toBe(60);
  });

  test("getRateLimitStatus returns null when no rate limiter", () => {
    const provider = new AISDKEmbeddingProvider(makeConfig(), "no-rate");
    expect(provider.getRateLimitStatus()).toBeNull();
  });

  test("getConfig returns the original config", () => {
    const config = makeConfig({ model: "config-test" });
    const provider = new AISDKEmbeddingProvider(config, "cfg");
    expect(provider.getConfig().model).toBe("config-test");
  });

  test("embedQuery via Ollama direct API returns embedding", async () => {
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ embeddings: [[1.0, 2.0, 3.0, 4.0]] }), { status: 200 }),
        ),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", baseURL: "http://localhost:11434", dimensions: 4, maxRetries: 0 }),
      "ollama",
    );
    const result = await provider.embedQuery("hello");
    expect(result).toEqual([1.0, 2.0, 3.0, 4.0]);
  });

  test("embedQuery via Ollama throws on HTTP error", async () => {
    globalThis.fetch = mock(
      () => Promise.resolve(new Response("error", { status: 500 })),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 1, timeout: 50000 }),
      "ollama-err",
    );
    await expect(provider.embedQuery("hello")).rejects.toThrow();
  });

  test("embedQuery via Ollama throws on invalid embedding (missing array)", async () => {
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ embeddings: "not-an-array" }), { status: 200 }),
        ),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 1, timeout: 50000 }),
      "ollama-nan",
    );
    await expect(provider.embedQuery("hello")).rejects.toThrow("missing or invalid");
  });

  test("embedQuery via Ollama throws on all-zero vector", async () => {
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ embeddings: [[0, 0, 0, 0]] }), { status: 200 }),
        ),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 1, timeout: 50000 }),
      "ollama-zero",
    );
    await expect(provider.embedQuery("hello")).rejects.toThrow("all-zero");
  });

  test("embedQuery via Ollama throws on missing embedding array", async () => {
    globalThis.fetch = mock(
      () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "ollama-missing",
    );
    await expect(provider.embedQuery("hello")).rejects.toThrow("missing");
  });

  test("embedQuery via Ollama uses data.embedding (singular) format", async () => {
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ embedding: [1, 2, 3, 4] }), { status: 200 }),
        ),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "ollama-singular",
    );
    const result = await provider.embedQuery("hello");
    expect(result).toEqual([1, 2, 3, 4]);
  });

  test("embedBatch via Ollama direct batch endpoint", async () => {
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ embeddings: [[1, 2, 3, 4], [5, 6, 7, 8]] }), { status: 200 }),
        ),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "ollama-batch",
    );
    const results = await provider.embedBatch(["a", "b"]);
    expect(results).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]]);
  });

  test("embedBatch empty array returns empty", async () => {
    const provider = new AISDKEmbeddingProvider(makeConfig(), "empty-batch");
    expect(await provider.embedBatch([])).toEqual([]);
  });

  test("embedBatch falls back to sequential on batch endpoint failure", async () => {
    // First call (batch) fails, subsequent calls (single) succeed.
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("error", { status: 500 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ embeddings: [[1, 2, 3, 4]] }), { status: 200 }),
      );
    }) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "ollama-fallback",
    );
    const results = await provider.embedBatch(["a"]);
    expect(results.length).toBe(1);
    expect(results[0].length).toBe(4);
  });

  test("embedBatch with rate limiting processes in sub-batches", async () => {
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ embeddings: [[1, 2, 3, 4]] }), { status: 200 }),
        ),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({
        provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000,
        rateLimits: { batchSize: 1, batchDelayMs: 0 },
      }),
      "rate-batch",
    );
    const results = await provider.embedBatch(["a", "b"]);
    expect(results.length).toBe(2);
  });

  test("isAvailable returns false when Ollama is unreachable", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "unreachable",
    );
    expect(await provider.isAvailable()).toBe(false);
  });

  test("isAvailable returns false on non-200 from /api/tags", async () => {
    globalThis.fetch = mock(
      () => Promise.resolve(new Response("error", { status: 404 })),
    ) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "tags-404",
    );
    expect(await provider.isAvailable()).toBe(false);
  });

  test("isAvailable returns true when Ollama responds with valid embedding", async () => {
    // First call: /api/tags (200), second: /api/embed (valid embedding).
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(new Response("ok", { status: 200 }));
      return Promise.resolve(
        new Response(JSON.stringify({ embeddings: [[1, 2, 3, 4]] }), { status: 200 }),
      );
    }) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "available",
    );
    expect(await provider.isAvailable()).toBe(true);
  });

  test("isAvailable returns false on wrong dimensions", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(new Response("ok", { status: 200 }));
      return Promise.resolve(
        new Response(JSON.stringify({ embeddings: [[1, 2, 3]] }), { status: 200 }),
      );
    }) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "wrong-dims",
    );
    expect(await provider.isAvailable()).toBe(false);
  });

  test("isAvailable on wrong dimensions tags lastDimensionMismatch with expected/got", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(new Response("ok", { status: 200 }));
      // Configured for 2560 (qwen3-embedding:4b) but a stale-config model
      // returns 4096 — the exact repro shape for the silent-fallback defect.
      return Promise.resolve(
        new Response(JSON.stringify({ embeddings: [Array(4096).fill(0.5)] }), { status: 200 }),
      );
    }) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 2560, maxRetries: 0, timeout: 5000 }),
      "dim-mismatch",
    );
    expect(await provider.isAvailable()).toBe(false);
    expect(provider.lastDimensionMismatch).toBeInstanceOf(DimensionMismatchError);
    expect(provider.lastDimensionMismatch?.providerId).toBe("dim-mismatch");
    expect(provider.lastDimensionMismatch?.expected).toBe(2560);
    expect(provider.lastDimensionMismatch?.got).toBe(4096);
  });

  test("isAvailable clears a stale lastDimensionMismatch once the model responds correctly", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount <= 2) return Promise.resolve(new Response("ok", { status: 200 }));
      return Promise.resolve(
        new Response(JSON.stringify({ embeddings: [[1, 2, 3, 4]] }), { status: 200 }),
      );
    }) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "recovers",
    );
    // Manually seed a stale mismatch from a hypothetical earlier call.
    (provider as unknown as { lastDimensionMismatch: unknown }).lastDimensionMismatch =
      new DimensionMismatchError("recovers", 4, 3);
    expect(await provider.isAvailable()).toBe(true);
    expect(provider.lastDimensionMismatch).toBeUndefined();
  });

  test("isAvailable does not tag lastDimensionMismatch when Ollama is unreachable", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "ollama", dimensions: 4, maxRetries: 0, timeout: 5000 }),
      "unreachable-untagged",
    );
    expect(await provider.isAvailable()).toBe(false);
    expect(provider.lastDimensionMismatch).toBeUndefined();
  });

  test("truncateText truncates long text", () => {
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ maxChars: 10 }),
      "truncate",
    );
    const longText = "a".repeat(100);
    const result = (provider as unknown as { truncateText: (t: string) => string }).truncateText(longText);
    expect(result.length).toBe(10);
  });

  test("truncateText returns short text unchanged", () => {
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ maxChars: 100 }),
      "no-truncate",
    );
    const short = "hello";
    const result = (provider as unknown as { truncateText: (t: string) => string }).truncateText(short);
    expect(result).toBe(short);
  });

  test("truncateText falls back to 4000 chars when maxChars not set", () => {
    const provider = new AISDKEmbeddingProvider(makeConfig({}), "default-chars");
    const longText = "a".repeat(5000);
    const result = (provider as unknown as { truncateText: (t: string) => string }).truncateText(longText);
    expect(result.length).toBe(4000);
  });

  test("sanitizeText removes control characters and replacement char", () => {
    const provider = new AISDKEmbeddingProvider(makeConfig(), "sanitize");
    const input = "hello\u0000world\u007F";
    const result = (provider as unknown as { sanitizeText: (t: string) => string }).sanitizeText(input);
    expect(result).not.toContain("\u0000");
    expect(result).not.toContain("\u007F");
    expect(result).toContain("hello");
    expect(result).toContain("world");
  });

  test("sanitizeText removes zero-width characters", () => {
    const provider = new AISDKEmbeddingProvider(makeConfig(), "sanitize-zw");
    const input = "hello\u200Bworld\uFEFF";
    const result = (provider as unknown as { sanitizeText: (t: string) => string }).sanitizeText(input);
    expect(result).not.toContain("\u200B");
    expect(result).not.toContain("\uFEFF");
  });

  test("sanitizeText converts non-breaking space to normal space", () => {
    const provider = new AISDKEmbeddingProvider(makeConfig(), "sanitize-nbsp");
    const input = "hello\u00A0world";
    const result = (provider as unknown as { sanitizeText: (t: string) => string }).sanitizeText(input);
    expect(result).toContain(" ");
    expect(result).not.toContain("\u00A0");
  });

  test("sanitizeText preserves valid emoji (surrogate pairs)", () => {
    const provider = new AISDKEmbeddingProvider(makeConfig(), "sanitize-emoji");
    const input = "hello 🎉 world";
    const result = (provider as unknown as { sanitizeText: (t: string) => string }).sanitizeText(input);
    expect(result).toContain("🎉");
  });

  test("sanitizeText removes unpaired surrogate halves", () => {
    const provider = new AISDKEmbeddingProvider(makeConfig(), "sanitize-surrogate");
    // Unpaired high surrogate (not followed by low surrogate).
    const input = "hello\uD800world";
    const result = (provider as unknown as { sanitizeText: (t: string) => string }).sanitizeText(input);
    expect(result).not.toContain("\uD800");
    expect(result).toContain("hello");
    expect(result).toContain("world");
  });

  test("createProvider returns AISDKEmbeddingProvider for non-transformers", () => {
    const provider = createProvider(makeConfig({ provider: "ollama" }), "factory-test");
    expect(provider).toBeInstanceOf(AISDKEmbeddingProvider);
  });

  test("getEmbeddingModel throws for unsupported provider", () => {
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "unknown" as any }),
      "unsupported",
    );
    expect(() => (provider as unknown as { getEmbeddingModel: () => any }).getEmbeddingModel()).toThrow("Unsupported provider");
  });

  test("getEmbeddingModel throws for custom without baseURL", () => {
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "custom", baseURL: undefined }),
      "custom-no-base",
    );
    expect(() => (provider as unknown as { getEmbeddingModel: () => any }).getEmbeddingModel()).toThrow("CUSTOM_EMBEDDING_BASE_URL");
  });

  test("getEmbeddingModel throws for litellm without baseURL", () => {
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ provider: "litellm", baseURL: undefined }),
      "litellm-no-base",
    );
    expect(() => (provider as unknown as { getEmbeddingModel: () => any }).getEmbeddingModel()).toThrow("LITELLM_BASE_URL");
  });

  test("getProviderOptions returns apiKey and baseURL when set", () => {
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ apiKey: "key-123", baseURL: "http://custom" }),
      "opts",
    );
    const opts = (provider as unknown as { getProviderOptions: () => Record<string, any> }).getProviderOptions();
    expect(opts.apiKey).toBe("key-123");
    expect(opts.baseURL).toBe("http://custom");
  });

  test("getProviderOptions returns empty object when no apiKey/baseURL", () => {
    const provider = new AISDKEmbeddingProvider(
      makeConfig({ apiKey: undefined, baseURL: undefined }),
      "empty-opts",
    );
    const opts = (provider as unknown as { getProviderOptions: () => Record<string, any> }).getProviderOptions();
    expect(Object.keys(opts).length).toBe(0);
  });
});