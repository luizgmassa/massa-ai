/**
 * System route coverage. /info /status /metrics /health/local /ollama. The
 * health checker is stubbed so no live Postgres/Ollama is required.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const checkPostgres = mock(async (): Promise<any> => ({ details: { sizeBytes: 2048 } }));
const checkAll = mock(async (): Promise<any> => ({
  services: {
    vectorStore: { available: true, details: { pgvector: true } },
    ollama: { available: true },
    dataDirectory: { available: true },
  },
}));
const checkOllama = mock(async () => ({ available: true, baseUrl: "http://x" }));
const getOllamaModels = mock(async () => ["qwen3-embedding:4b", "qwen2.5:7b-instruct"]);
let dataDir: any = "/data";

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    getHealthChecker: () => ({ checkPostgres, checkAll, checkOllama, getOllamaModels }),
  };
});

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return { ...actual, config: { get: (k: string) => (k === "dataDir" ? dataDir : undefined) } };
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
  test("returns ollama status + models + configured model", async () => {
    const res = await get("/api/v1/system/ollama");
    expect(res.json.available).toBe(true);
    expect(res.json.models).toEqual(["qwen3-embedding:4b", "qwen2.5:7b-instruct"]);
    expect(res.json.configuredModel).toBe("qwen3-embedding:4b");
    expect(res.json.baseUrl).toBe("http://localhost:11434");
  });
});
