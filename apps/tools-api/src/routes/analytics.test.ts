/**
 * Analytics route coverage. POST /api/v1/analytics delegates to GetAnalyticsTool.
 * Mocks the tool; asserts happy path + schema validation.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const handleMock = mock((): unknown => ({ success: true, data: { total: 1 } }));

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    GetAnalyticsTool: class {
      handle = handleMock;
    },
  };
});

import { analyticsRoutes } from "./analytics.js";
const app = new Elysia().use(analyticsRoutes);

async function post(body: unknown) {
  const res = await app.handle(
    new Request("http://localhost/api/v1/analytics/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/analytics", () => {
  test("delegates to the tool and returns its payload", async () => {
    handleMock.mockImplementationOnce(() => ({ success: true, data: { hit: true } }));
    const res = await post({ type: "summary" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ success: true, data: { hit: true } });
    expect(handleMock).toHaveBeenCalledTimes(1);
  });

  test("accepts all analytics types", async () => {
    for (const type of ["summary", "project", "query", "cache", "recent"] as const) {
      handleMock.mockImplementationOnce(() => ({ success: true, data: { type } }));
      const res = await post({ type, projectId: "p", query: "q", limit: 5 });
      expect(res.status).toBe(200);
      expect(res.json.data.type).toBe(type);
    }
  });

  test("rejects an invalid analytics type", async () => {
    const res = await post({ type: "nope" });
    expect(res.status).toBe(422);
  });
});
