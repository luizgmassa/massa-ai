/**
 * Context route coverage. POST /api/v1/context/compress + /optimized delegate.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const compressHandle = mock((_b?: any): unknown => ({ success: true, data: { compressed: true } }));
const optimizedHandle = mock((): unknown => ({ success: true, data: { ctx: [] } }));

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    CompressContextTool: class {
      handle = compressHandle;
    },
    GetOptimizedContextTool: class {
      handle = optimizedHandle;
    },
  };
});

import { contextRoutes } from "./context.js";
const app = new Elysia().use(contextRoutes);

async function post(path: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/context/compress", () => {
  test("delegates to the compress tool", async () => {
    compressHandle.mockImplementationOnce(() => ({ success: true, data: { ratio: 0.5 } }));
    const res = await post("/api/v1/context/compress", { content: "x" });
    expect(res.status).toBe(200);
    expect(res.json.data.ratio).toBe(0.5);
  });

  test("accepts strategy + targetRatio + language", async () => {
    compressHandle.mockImplementationOnce((b: any) => ({ success: true, data: b }));
    const res = await post("/api/v1/context/compress", {
      content: "x",
      strategy: "semantic_dedup",
      targetRatio: 0.4,
      language: "typescript",
    });
    expect(res.status).toBe(200);
    expect(res.json.data.strategy).toBe("semantic_dedup");
  });

  test("rejects invalid strategy", async () => {
    const res = await post("/api/v1/context/compress", { content: "x", strategy: "nope" });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/context/optimized", () => {
  test("delegates to the optimized tool", async () => {
    optimizedHandle.mockImplementationOnce(() => ({ success: true, data: { tokens: 10 } }));
    const res = await post("/api/v1/context/optimized", { query: "q", projectId: "p" });
    expect(res.status).toBe(200);
    expect(res.json.data.tokens).toBe(10);
  });

  test("rejects missing projectId", async () => {
    const res = await post("/api/v1/context/optimized", { query: "q" });
    expect(res.status).toBe(422);
  });
});
