/**
 * Search route coverage. POST /api/v1/search/project + /code delegate to tools.
 * Covers normalizeArrayParam branches, success/failure mapping, validation.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const projectHandle = mock((_b?: any): unknown => ({ success: true, data: { results: [] } }));
const codeHandle = mock((): unknown => ({ success: true, data: { hits: [] } }));

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    SearchProjectTool: class {
      handle = projectHandle;
    },
    SearchCodeTool: class {
      handle = codeHandle;
    },
  };
});

import { searchRoutes } from "./search.js";
const app = new Elysia().use(searchRoutes);

async function post(path: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return { status: res.status, json };
}

describe("POST /api/v1/search/project", () => {
  test("delegates to the tool on success", async () => {
    projectHandle.mockImplementationOnce(() => ({ success: true, data: { n: 1 } }));
    const res = await post("/api/v1/search/project", { query: "q", projectId: "p" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ success: true, data: { n: 1 } });
  });

  test("throws (500) when the tool reports failure", async () => {
    projectHandle.mockImplementationOnce(() => ({ success: false, error: "boom" }));
    const res = await post("/api/v1/search/project", { query: "q", projectId: "p" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v1/search/code", () => {
  test("delegates to the code tool", async () => {
    codeHandle.mockImplementationOnce(() => ({ success: true, data: { n: 2 } }));
    const res = await post("/api/v1/search/code", { query: "fn", projectId: "p" });
    expect(res.status).toBe(200);
    expect(res.json.data.n).toBe(2);
  });
});

describe("normalizeArrayParam via include/exclude transform", () => {
  test("array value passes through", async () => {
    projectHandle.mockImplementationOnce((b: any) => ({ success: true, data: b }));
    const res = await post("/api/v1/search/project", {
      query: "q",
      projectId: "p",
      include: ["**/*.ts"],
    });
    expect(res.status).toBe(200);
    expect(res.json.data.include).toEqual(["**/*.ts"]);
  });

  test("JSON-string array is parsed", async () => {
    projectHandle.mockImplementationOnce((b: any) => ({ success: true, data: b }));
    const res = await post("/api/v1/search/project", {
      query: "q",
      projectId: "p",
      include: '["a","b"]',
    });
    expect(res.json.data.include).toEqual(["a", "b"]);
  });

  test("python-style single-quoted array is parsed", async () => {
    projectHandle.mockImplementationOnce((b: any) => ({ success: true, data: b }));
    const res = await post("/api/v1/search/project", {
      query: "q",
      projectId: "p",
      exclude: "['x','y']",
    });
    expect(res.json.data.exclude).toEqual(["x", "y"]);
  });

  test("empty python-style brackets normalize to []", async () => {
    projectHandle.mockImplementationOnce((b: any) => ({ success: true, data: b }));
    const res = await post("/api/v1/search/project", {
      query: "q",
      projectId: "p",
      include: "[]",
    });
    expect(res.json.data.include).toEqual([]);
  });

  test("plain scalar string wraps into [value]", async () => {
    projectHandle.mockImplementationOnce((b: any) => ({ success: true, data: b }));
    const res = await post("/api/v1/search/project", {
      query: "q",
      projectId: "p",
      include: "*.ts",
    });
    expect(res.json.data.include).toEqual(["*.ts"]);
  });

  test("invalid JSON string falls back to [value]", async () => {
    projectHandle.mockImplementationOnce((b: any) => ({ success: true, data: b }));
    const res = await post("/api/v1/search/project", {
      query: "q",
      projectId: "p",
      exclude: "{not json",
    });
    expect(res.json.data.exclude).toEqual(["{not json"]);
  });
});

describe("search validation", () => {
  test("missing required query is rejected", async () => {
    const res = await post("/api/v1/search/project", { projectId: "p" });
    expect(res.status).toBe(422);
  });
});
