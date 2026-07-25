/**
 * Hook route coverage (Phase 3). / and /batch with disabled (423), admission
 * (202), QueueSaturated (429+Retry-After), ValidationError (code), generic
 * (500). /compact-snapshot delegates to CompactSnapshotTool.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

let ValidationError: any;
let QueueSaturatedError: any;

const ingestOne = mock(async (): Promise<string> => "obs-1");
const ingestBatch = mock(async (): Promise<string[]> => ["obs-1"]);
const snapshotHandle = mock((): unknown => ({ success: true, data: { snapshot: "x" } }));
let hooksConfig: any = undefined;

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  ValidationError = actual.ValidationError;
  QueueSaturatedError = actual.QueueSaturatedError;
  return {
    ...actual,
    getHookService: () => ({
      ingestOne,
      ingestBatch,
      queue: { pendingCount: 0, maxPendingCount: 256, saturated: false },
    }),
    CompactSnapshotTool: class {
      handle = snapshotHandle;
    },
    ValidationError: actual.ValidationError,
    QueueSaturatedError: actual.QueueSaturatedError,
  };
});

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    config: { get: (k: string) => (k === "hooks" ? hooksConfig : undefined) },
    logger: { ...actual.logger, error: () => {} },
  };
});

import { hookRoutes } from "./hooks.js";
const app = new Elysia().use(hookRoutes);

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

const oneEvent = { event: "user-prompt", projectId: "p", payload: { x: 1 } };

describe("POST /api/v1/hook/", () => {
  test("admits an event and returns 202 + id", async () => {
    hooksConfig = undefined;
    ingestOne.mockImplementationOnce(async () => "obs-9");
    const res = await post("/api/v1/hook/", oneEvent);
    expect(res.status).toBe(202);
    expect(res.json).toEqual({ status: 202, id: "obs-9" });
  });

  test("429 + Retry-After when queue saturated", async () => {
    hooksConfig = undefined;
    ingestOne.mockImplementationOnce(async () => {
      throw new QueueSaturatedError(7);
    });
    const res = await post("/api/v1/hook/", oneEvent);
    expect(res.status).toBe(429);
    expect(res.json.retryAfter).toBe(7);
  });

  test("maps ValidationError code 400", async () => {
    hooksConfig = undefined;
    ingestOne.mockImplementationOnce(async () => {
      throw new ValidationError(400, "bad");
    });
    const res = await post("/api/v1/hook/", oneEvent);
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("bad");
  });

  test("maps ValidationError code 413", async () => {
    hooksConfig = undefined;
    ingestOne.mockImplementationOnce(async () => {
      throw new ValidationError(413, "too big");
    });
    const res = await post("/api/v1/hook/", oneEvent);
    expect(res.status).toBe(413);
  });

  test("500 on generic error", async () => {
    hooksConfig = undefined;
    ingestOne.mockImplementationOnce(async () => {
      throw new Error("nope");
    });
    const res = await post("/api/v1/hook/", oneEvent);
    expect(res.status).toBe(500);
    expect(res.json.error).toContain("hook service unavailable");
  });

  test("423 when hooks disabled", async () => {
    hooksConfig = { enabled: false };
    const res = await post("/api/v1/hook/", oneEvent);
    expect(res.status).toBe(423);
  });
});

describe("POST /api/v1/hook/batch", () => {
  const batchBody = { events: [oneEvent, { ...oneEvent, event: "session-end" }] };

  test("admits a batch and returns 202 + ids", async () => {
    hooksConfig = undefined;
    ingestBatch.mockImplementationOnce(async () => ["a", "b"]);
    const res = await post("/api/v1/hook/batch", batchBody);
    expect(res.status).toBe(202);
    expect(res.json).toEqual({ status: 202, ids: ["a", "b"] });
  });

  test("429 when saturated", async () => {
    hooksConfig = undefined;
    ingestBatch.mockImplementationOnce(async () => {
      throw new QueueSaturatedError(3);
    });
    const res = await post("/api/v1/hook/batch", batchBody);
    expect(res.status).toBe(429);
  });

  test("maps ValidationError", async () => {
    hooksConfig = undefined;
    ingestBatch.mockImplementationOnce(async () => {
      throw new ValidationError(413, "oversize");
    });
    const res = await post("/api/v1/hook/batch", batchBody);
    expect(res.status).toBe(413);
  });

  test("500 on generic error", async () => {
    hooksConfig = undefined;
    ingestBatch.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await post("/api/v1/hook/batch", batchBody);
    expect(res.status).toBe(500);
  });

  test("423 when disabled", async () => {
    hooksConfig = { enabled: false };
    const res = await post("/api/v1/hook/batch", batchBody);
    expect(res.status).toBe(423);
  });
});

describe("POST /api/v1/hook/compact-snapshot", () => {
  test("delegates to CompactSnapshotTool", async () => {
    snapshotHandle.mockImplementationOnce(() => ({ success: true, data: { size: 2 } }));
    const res = await post("/api/v1/hook/compact-snapshot", { sessionId: "s1", projectId: "p", persist: true });
    expect(res.status).toBe(200);
    expect(res.json.data.size).toBe(2);
  });
});
