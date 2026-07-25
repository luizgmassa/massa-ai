/**
 * File route coverage. POST /api/v1/file/read delegates to ReadFileTool, which
 * is constructed with SymbolGraphService.getInstance().
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const readHandle = mock((_b?: any): unknown => ({ success: true, data: { content: "x" } }));

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    SymbolGraphService: Object.assign(
      class {
        static getInstance() {
          return {};
        }
      },
      {},
    ),
    ReadFileTool: class {
      handle = readHandle;
    },
  };
});

import { fileRoutes } from "./file.js";
const app = new Elysia().use(fileRoutes);

async function post(body: unknown) {
  const res = await app.handle(
    new Request("http://localhost/api/v1/file/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/file/read", () => {
  test("delegates to the read tool", async () => {
    readHandle.mockImplementationOnce(() => ({ success: true, data: { lines: 3 } }));
    const res = await post({ filePath: "src/a.ts" });
    expect(res.status).toBe(200);
    expect(res.json.data.lines).toBe(3);
  });

  test("accepts optional projection + compression flags", async () => {
    readHandle.mockImplementationOnce((b: any) => ({ success: true, data: b }));
    const res = await post({
      filePath: "src/a.ts",
      projectId: "p",
      offset: 1,
      limit: 5,
      compress: false,
      includeSymbols: false,
      includeImports: false,
    });
    expect(res.status).toBe(200);
    expect(res.json.data.compress).toBe(false);
  });

  test("rejects missing filePath", async () => {
    const res = await post({ projectId: "p" });
    expect(res.status).toBe(422);
  });
});
