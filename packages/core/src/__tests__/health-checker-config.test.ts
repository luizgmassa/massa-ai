import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// `local-health-checker` reads the embedding config through TWO specifiers, and
// `mock.module` registers by RESOLVED PATH — so mocking one leaves the other
// live. `config` comes from "@massa-ai/shared" (:2), while `fileEmbedding()`
// (:39-45) calls `loadConfigSafe()` from "@massa-ai/shared/config" (:3). When
// the inference-provider seam moved that read off `config.getAll()`, this file
// went 3/0 -> 1 pass / 2 fail without being edited: both file-read cases started
// receiving the developer's real config instead of the fixture.
//
// Both specifiers are stubbed from one source of truth below so they cannot
// drift apart again. `requirePostgresDatabaseUrl` is re-exported because the
// subject imports it from the same module and a partial namespace would break
// the import, not just the assertion.
const stubShared = (model: string | undefined) => {
  mock.module("@massa-ai/shared", () => ({
    config: {
      get: (key: string) => {
        if (key === "embedding") return { model };
        if (key === "dataDir") return "/tmp/massa-ai-test";
        return undefined;
      },
      getAll: () => ({ embedding: { model } }),
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }));
  mock.module("@massa-ai/shared/config", () => ({
    loadConfigSafe: () => ({ embedding: { model } }),
    requirePostgresDatabaseUrl: () => "postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai",
  }));
};

stubShared("qwen3-embedding:8b");

import { LocalHealthChecker } from "../services/health/local-health-checker.js";

describe("health-checker embedding model config", () => {
  const originalEnv = process.env.OLLAMA_EMBEDDING_MODEL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.OLLAMA_EMBEDDING_MODEL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OLLAMA_EMBEDDING_MODEL = originalEnv;
    } else {
      delete process.env.OLLAMA_EMBEDDING_MODEL;
    }
    globalThis.fetch = originalFetch;
  });

  it("checkOllama uses config embedding model when env not set", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ models: [{ name: "qwen3-embedding:8b" }] }), {
          status: 200,
        }),
      )) as typeof fetch;

    const checker = new LocalHealthChecker();
    const result = await checker.checkOllama();
    expect(result.available).toBe(true);
    expect(result.details?.embeddingModel).toBe("qwen3-embedding:8b");
    expect(result.details?.hasEmbeddingModel).toBe(true);
  });

  it("checkOllama prefers env OLLAMA_EMBEDDING_MODEL over config", async () => {
    process.env.OLLAMA_EMBEDDING_MODEL = "custom-model:latest";
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ models: [{ name: "custom-model:latest" }] }), {
          status: 200,
        }),
      )) as typeof fetch;

    const checker = new LocalHealthChecker();
    const result = await checker.checkOllama();
    expect(result.details?.embeddingModel).toBe("custom-model:latest");
  });

  it("checkOllama falls back to nomic-embed-text:latest when config model is undefined", async () => {
    stubShared(undefined);

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ models: [{ name: "nomic-embed-text:latest" }] }), {
          status: 200,
        }),
      )) as typeof fetch;

    const checker = new LocalHealthChecker();
    const result = await checker.checkOllama();
    expect(result.details?.embeddingModel).toBe("nomic-embed-text:latest");
  });
});