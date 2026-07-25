/**
 * Checkpoint route error-path coverage. The happy paths are covered by
 * checkpoints.test.ts (real tools). This file mocks the three tools to throw,
 * exercising each route's catch block + sanitized error envelope.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const listThrow = () => {
  throw new Error("list down");
};
const createThrow = () => {
  throw new Error("create down");
};
const restoreThrow = () => {
  throw new Error("restore down");
};

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    ListCheckpointsTool: class {
      handle = listThrow;
    },
    CreateCheckpointTool: class {
      handle = createThrow;
    },
    RestoreCheckpointTool: class {
      handle = restoreThrow;
    },
  };
});

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return { ...actual, logger: { ...actual.logger, error: () => {} } };
});

import { checkpointRoutes } from "./checkpoints.js";
const app = new Elysia().use(checkpointRoutes);

async function post(p: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${p}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("checkpoint route error envelopes", () => {
  test("POST /list returns a service-unavailable envelope on throw", async () => {
    const res = await post("/api/v1/checkpoints/list", { format: "json" });
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("Checkpoint service unavailable");
    expect(res.json.error).toContain("list down");
  });

  test("POST /create returns a service-unavailable envelope on throw", async () => {
    const res = await post("/api/v1/checkpoints/create", {
      taskId: "t",
      description: "d",
      format: "json",
    });
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("create down");
  });

  test("POST /restore returns a service-unavailable envelope on throw", async () => {
    const res = await post("/api/v1/checkpoints/restore", { taskId: "t", format: "json" });
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("restore down");
  });
});
