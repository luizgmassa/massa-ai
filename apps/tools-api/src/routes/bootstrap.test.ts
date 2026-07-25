/**
 * Bootstrap route coverage (Phase 4). POST /api/v1/bootstrap with disabled
 * (423), validation (400), success (200), and generic error (500) paths.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const bootstrap = mock(async (): Promise<any> => ({ memoriesCreated: 3, mode: "rule-based" }));
let memoryConfig: any = undefined;

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return { ...actual, getBootstrapService: () => ({ bootstrap }) };
});

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    config: { get: (k: string) => (k === "memory" ? memoryConfig : undefined) },
    logger: { ...actual.logger, error: () => {} },
  };
});

import { bootstrapRoutes } from "./bootstrap.js";
const app = new Elysia().use(bootstrapRoutes);

async function post(body: unknown) {
  const res = await app.handle(
    new Request("http://localhost/api/v1/bootstrap/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/bootstrap", () => {
  test("bootstraps seed memories", async () => {
    memoryConfig = undefined;
    bootstrap.mockImplementationOnce(async () => ({ memoriesCreated: 5, mode: "llm" }));
    const res = await post({ projectId: "proj", projectPath: "/x", force: true });
    expect(res.status).toBe(200);
    expect(res.json.data.memoriesCreated).toBe(5);
    expect((bootstrap.mock.calls[0] as any[])[0]).toBe("proj");
    expect((bootstrap.mock.calls[0] as any[])[1]).toMatchObject({ projectPath: "/x", force: true });
  });

  test("423 when bootstrap disabled", async () => {
    memoryConfig = { bootstrap: { enabled: false } };
    const res = await post({ projectId: "proj" });
    expect(res.status).toBe(423);
  });

  test("400 when projectId missing", async () => {
    memoryConfig = undefined;
    const res = await post({ projectId: "  " });
    expect(res.status).toBe(400);
  });

  test("500 on generic error", async () => {
    memoryConfig = undefined;
    bootstrap.mockImplementationOnce(async () => {
      throw new Error("scan failed");
    });
    const res = await post({ projectId: "proj" });
    expect(res.status).toBe(500);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("bootstrap failed");
  });
});
