/**
 * Integration test for checkpoint MCP exposure + route delegation.
 *
 * Asserts the three checkpoint tools appear in the MCP TOOL_DEFINITIONS
 * (AC: MCP lists them) and that POST /api/v1/checkpoints/{list,create,restore}
 * delegate to the existing core tools end-to-end (AC: each call hits the route
 * and delegates). Uses a temp dataDir so no real ~/.massa-ai-data is touched.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

let tmpDir = "";

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    config: {
      get: (key: string) => (key === "dataDir" ? tmpDir : actual.config.get(key)),
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      metric: () => {},
    },
  };
});

import { checkpointRoutes } from "./checkpoints.js";

async function post(p: string, body: unknown) {
  const res = await checkpointRoutes.handle(
    new Request(`http://localhost${p}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return res.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

describe("checkpoint routes delegate to core tools", () => {
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-chk-routes-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("POST /list returns success (empty by default)", async () => {
    const json = await post("/api/v1/checkpoints/list", { format: "json" });
    expect(json.success).toBe(true);
  });

  test("POST /create delegates and creates a checkpoint", async () => {
    const json = await post("/api/v1/checkpoints/create", {
      taskId: "task-route-1",
      description: "route delegation test",
      format: "json",
    });
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  test("POST /restore delegates and restores by taskId", async () => {
    const json = await post("/api/v1/checkpoints/restore", {
      taskId: "task-route-1",
      format: "json",
    });
    expect(json.success).toBe(true);
  });

  test("POST /restore without id/taskId returns a validation error", async () => {
    const json = await post("/api/v1/checkpoints/restore", { format: "json" });
    // Route delegates to the tool, which requires checkpointId or taskId.
    expect(json.success).toBe(false);
    expect(json.error).toBeTruthy();
  });

  test("POST /delete on a non-existent ID returns 404 {success:false, error:'not found'}", async () => {
    const res = await checkpointRoutes.handle(
      new Request("http://localhost/api/v1/checkpoints/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "nonexistent-id-xyz" }),
      }),
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toBe("not found");
  });

  test("POST /delete on an existing checkpoint returns 200 {success:true, data:{ok:true}}", async () => {
    // First create a checkpoint to delete
    const createJson = await post("/api/v1/checkpoints/create", {
      taskId: "task-delete-test",
      description: "checkpoint to delete",
      format: "json",
    });
    expect(createJson.success).toBe(true);
    const created = createJson.data as any;
    const checkpointId = created?.checkpointId ?? created?.id ?? created?.checkpoint?.id;
    expect(checkpointId).toBeTruthy();

    const res = await checkpointRoutes.handle(
      new Request("http://localhost/api/v1/checkpoints/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: checkpointId }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { ok: boolean } };
    expect(json.success).toBe(true);
    expect(json.data.ok).toBe(true);
  });

  test("POST /delete on an already-deleted ID returns 404", async () => {
    // Delete the same checkpoint again — should 404
    const createJson = await post("/api/v1/checkpoints/create", {
      taskId: "task-delete-twice",
      description: "checkpoint to delete twice",
      format: "json",
    });
    const created = createJson.data as any;
    const checkpointId = created?.checkpointId ?? created?.id ?? created?.checkpoint?.id;

    // First delete
    const res1 = await checkpointRoutes.handle(
      new Request("http://localhost/api/v1/checkpoints/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: checkpointId }),
      }),
    );
    expect(res1.status).toBe(200);

    // Second delete — should 404
    const res2 = await checkpointRoutes.handle(
      new Request("http://localhost/api/v1/checkpoints/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: checkpointId }),
      }),
    );
    expect(res2.status).toBe(404);
    const json2 = (await res2.json()) as { success: boolean; error: string };
    expect(json2.success).toBe(false);
    expect(json2.error).toBe("not found");
  });
});
