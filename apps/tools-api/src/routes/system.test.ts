/**
 * System route coverage. /info /status /metrics /health/local /ollama. The
 * health checker is stubbed so no live Postgres/Ollama is required.
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { Elysia } from "elysia";
import { INFERENCE_PROVIDERS } from "@massa-ai/shared/inference-providers";

const checkPostgres = mock(async (): Promise<any> => ({ details: { sizeBytes: 2048 } }));
const checkAll = mock(async (): Promise<any> => ({
  services: {
    vectorStore: { available: true, details: { pgvector: true } },
    ollama: { available: true },
    inference: { available: true },
    dataDirectory: { available: true },
  },
}));
const checkOllama = mock(async () => ({ available: true, baseUrl: "http://x" }));
const checkInference = mock(async () => ({
  available: true,
  details: {
    provider: "lmstudio",
    url: "http://localhost:1234/v1",
    embeddingModel: "text-embedding-nomic-embed-text-v1.5",
    models: ["text-embedding-nomic-embed-text-v1.5"],
  },
}));
const getOllamaModels = mock(async () => ["qwen3-embedding:4b", "qwen2.5:7b-instruct"]);
let dataDir: any = "/data";
// G2/PDM-03 AC-1: undefined = "nothing set in config.json" (raw, no defaults
// folded in — see loadRawUserConfig's own contract), so /ollama falls
// through to env then the seam default.
let rawEmbeddingModel: string | undefined;

// Captured before `mock.module` registers the interception below: a nested
// `require("@massa-ai/core")` taken from *inside* that factory resolves empty
// the first time the module loads (nothing has required it yet to prime the
// cache), so `...actual` would silently spread nothing. Pre-loading it here
// keeps the spread real, which the new LocalHealthChecker test below relies on.
const realCore = require("@massa-ai/core");

mock.module("@massa-ai/core", () => {
  return {
    ...realCore,
    getHealthChecker: () => ({ checkPostgres, checkAll, checkOllama, checkInference, getOllamaModels }),
  };
});

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return { ...actual, config: { get: (k: string) => (k === "dataDir" ? dataDir : undefined) } };
});

mock.module("@massa-ai/shared/config", () => {
  const actual = require("@massa-ai/shared/config");
  return {
    ...actual,
    loadRawUserConfig: () => (rawEmbeddingModel ? { embedding: { model: rawEmbeddingModel } } : {}),
  };
});

import { systemRoutes } from "./system.js";
const app = new Elysia().use(systemRoutes);

async function get(path: string) {
  const res = await app.handle(new Request(`http://localhost${path}`));
  return { status: res.status, json: (await res.json()) as any };
}

describe("GET /api/v1/system/info", () => {
  test("returns redacted database metadata", async () => {
    const res = await get("/api/v1/system/info");
    expect(res.status).toBe(200);
    expect(res.json.service).toBe("massa-ai-tools-api");
    expect(res.json.databases.backend).toBe("postgres");
    expect(res.json.databases.sizeBytes).toBe(2048);
    expect(res.json.dataDir).toBe("/data");
  });
});

describe("GET /api/v1/system/status", () => {
  test("healthy when all services available", async () => {
    checkAll.mockImplementationOnce(async () => ({
      services: {
        vectorStore: { available: true, details: { pgvector: true } },
        ollama: { available: true },
        dataDirectory: { available: true },
      },
    }));
    const res = await get("/api/v1/system/status");
    expect(res.json.status).toBe("healthy");
    expect(res.json.services).toMatchObject({
      postgresql: true,
      pgvector: true,
      ollama: true,
      dataDirectory: true,
    });
  });

  test("degraded when pgvector missing + ollama down", async () => {
    checkAll.mockImplementationOnce(async () => ({
      services: {
        vectorStore: { available: true, details: { pgvector: false } },
        ollama: { available: false },
        dataDirectory: { available: true },
      },
    }));
    const res = await get("/api/v1/system/status");
    expect(res.json.status).toBe("degraded");
    expect(res.json.services.pgvector).toBe(false);
    expect(res.json.services.ollama).toBe(false);
  });

  test("degraded when vectorStore entirely unavailable", async () => {
    checkAll.mockImplementationOnce(async () => ({
      services: { vectorStore: { available: false }, ollama: { available: false } },
    }));
    const res = await get("/api/v1/system/status");
    expect(res.json.services.postgresql).toBe(false);
    expect(res.json.status).toBe("degraded");
  });
});

describe("GET /api/v1/system/metrics", () => {
  test("includes database size + memory formatting", async () => {
    const res = await get("/api/v1/system/metrics");
    expect(res.status).toBe(200);
    expect(res.json.system.databaseSizeBytes).toBe(2048);
    expect(typeof res.json.system.databaseSize).toBe("string");
    expect(res.json.system.memory.heapUsed).toMatch(/Bytes|KB|MB|GB/);
  });

  test("null database size when not finite", async () => {
    checkPostgres.mockImplementationOnce(async () => ({ details: { sizeBytes: "no" } }));
    const res = await get("/api/v1/system/metrics");
    expect(res.json.system.databaseSizeBytes).toBeNull();
    expect(res.json.system.databaseSize).toBeNull();
  });

  test("zero-byte database formats as 0 Bytes", async () => {
    checkPostgres.mockImplementationOnce(async () => ({ details: { sizeBytes: 0 } }));
    const res = await get("/api/v1/system/metrics");
    expect(res.json.system.databaseSize).toBe("0 Bytes");
  });
});

describe("GET /api/v1/system/health/local", () => {
  test("returns the full checkAll report", async () => {
    const res = await get("/api/v1/system/health/local");
    expect(res.status).toBe(200);
    expect(res.json.services.vectorStore.available).toBe(true);
  });
});

describe("GET /api/v1/system/ollama", () => {
  afterEach(() => {
    rawEmbeddingModel = undefined;
    delete process.env.OLLAMA_EMBEDDING_MODEL;
  });

  // G2/PDM-03 AC-1: neither config.json nor OLLAMA_EMBEDDING_MODEL is set —
  // must report the current seam default, never the retired
  // "qwen3-embedding:4b" literal this test used to pin as the contract.
  test("returns ollama status + models + the seam default when nothing is configured", async () => {
    const res = await get("/api/v1/system/ollama");
    expect(res.json.available).toBe(true);
    expect(res.json.models).toEqual(["qwen3-embedding:4b", "qwen2.5:7b-instruct"]);
    expect(res.json.configuredModel).toBe(INFERENCE_PROVIDERS.ollama.defaultModels.embedding);
    expect(res.json.configuredModel).not.toBe("qwen3-embedding:4b");
    expect(res.json.baseUrl).toBe("http://localhost:11434");
  });

  // F2b: F2 originally asserted config.json beats env here, which inverted
  // this project's documented precedence (env > config.json > seam default —
  // CLAUDE.md:321, design.md:51,268, T02). Inverted with the implementation.
  test("OLLAMA_EMBEDDING_MODEL wins over config.json's embedding.model", async () => {
    rawEmbeddingModel = "from-config-json";
    process.env.OLLAMA_EMBEDDING_MODEL = "from-env";
    const res = await get("/api/v1/system/ollama");
    expect(res.json.configuredModel).toBe("from-env");
  });

  test("config.json's embedding.model wins over the seam default when no env var is set", async () => {
    rawEmbeddingModel = "from-config-json";
    const res = await get("/api/v1/system/ollama");
    expect(res.json.configuredModel).toBe("from-config-json");
  });
});

// GET /api/v1/system/inference — neutral counterpart to /ollama (LIP-10). Beside
// the existing route/tests above, never replacing them.
describe("GET /api/v1/system/inference", () => {
  test("returns the configured provider's status + models + configured model", async () => {
    const res = await get("/api/v1/system/inference");
    expect(res.json.available).toBe(true);
    expect(res.json.provider).toBe("lmstudio");
    expect(res.json.models).toEqual(["text-embedding-nomic-embed-text-v1.5"]);
    expect(res.json.configuredModel).toBe("text-embedding-nomic-embed-text-v1.5");
    expect(res.json.baseUrl).toBe("http://localhost:1234/v1");
  });
});

// LocalHealthChecker.checkOllama — real class (not the route-level mock above),
// reached via `@massa-ai/core`'s `...actual` spread, which the module mock at
// the top of this file only overrides `getHealthChecker` on. Exercises the
// real probeProvider-backed body-shape discrimination (LIP-10): the defect
// this task fixes is `checkOllama` trusting `response.ok`, which reports
// "Ollama healthy" against a server (LM Studio) that answers HTTP 200 with an
// error body for every Ollama-shaped endpoint.
describe("LocalHealthChecker.checkOllama — provider-aware probe (LIP-10)", () => {
  test("LM Studio's 200-with-error body at the Ollama endpoint is reported unavailable, not healthy", async () => {
    const { LocalHealthChecker } = require("@massa-ai/core");
    const checker = new LocalHealthChecker();
    const origFetch = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      new Response(
        JSON.stringify({ error: "Unexpected endpoint or method. (GET /api/tags)" }),
        { status: 200 },
      );
    try {
      const status = await checker.checkOllama();
      expect(status.available).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("a genuine Ollama /api/tags body is reported available with its models", async () => {
    const { LocalHealthChecker } = require("@massa-ai/core");
    const checker = new LocalHealthChecker();
    const origFetch = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      new Response(JSON.stringify({ models: [{ name: "qwen3-embedding:4b" }] }), { status: 200 });
    try {
      const status = await checker.checkOllama();
      expect(status.available).toBe(true);
      expect(status.details?.models).toEqual(["qwen3-embedding:4b"]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
