/**
 * Proposal route coverage (Phase 5). /list /approve /reject with disabled
 * (423), validation (400), success (200), domain reject (400), generic (500),
 * and SearchServiceError rethrow paths.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

let SSE: any;
const job = {
  listPending: mock(async (): Promise<any[]> => []),
  approve: mock(async (): Promise<any> => ({ ok: true })),
  reject: mock(async (): Promise<any> => ({ ok: true })),
};

let memoryConfig: any = undefined;

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  SSE = actual.SearchServiceError;
  return { ...actual, getAutoImproveJob: () => job, SearchServiceError: actual.SearchServiceError };
});

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    config: { get: (k: string) => (k === "memory" ? memoryConfig : undefined) },
    logger: { ...actual.logger, error: () => {} },
  };
});

import { proposalRoutes } from "./proposals.js";
const app = new Elysia().use(proposalRoutes);

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

function reset() {
  memoryConfig = undefined;
  job.listPending.mockImplementation(async () => []);
  job.approve.mockImplementation(async () => ({ ok: true, applied: true }));
  job.reject.mockImplementation(async () => ({ ok: true, flipped: true }));
}

describe("POST /api/v1/proposal/list", () => {
  test("returns pending proposals", async () => {
    reset();
    job.listPending.mockImplementationOnce(async () => [{ id: "p1" }, { id: "p2" }]);
    const res = await post("/api/v1/proposal/list", { projectId: "proj" });
    expect(res.status).toBe(200);
    expect(res.json.data.count).toBe(2);
  });

  // Web UI contract: renderProposals in apps/web-ui/src/static/app.js reads
  // `data.pending`. It previously read `data.proposals`, which this route has
  // never emitted, so the Proposals view was empty regardless of the data.
  test("keys the list as `pending`, which is what the Web UI renders", async () => {
    reset();
    job.listPending.mockImplementationOnce(async () => [{ id: "p1", description: "d" }]);
    const res = await post("/api/v1/proposal/list", { projectId: "proj" });
    expect(Array.isArray(res.json.data.pending)).toBe(true);
    expect(res.json.data.pending[0].id).toBe("p1");
    expect(res.json.data.proposals).toBeUndefined();
  });

  test("423 when auto-improve disabled", async () => {
    memoryConfig = { autoImprove: { enabled: false } };
    const res = await post("/api/v1/proposal/list", { projectId: "proj" });
    expect(res.status).toBe(423);
  });

  test("400 when projectId missing", async () => {
    reset();
    const res = await post("/api/v1/proposal/list", { projectId: "  " });
    expect(res.status).toBe(400);
  });

  test("500 on generic error", async () => {
    reset();
    job.listPending.mockImplementationOnce(async () => {
      throw new Error("db");
    });
    const res = await post("/api/v1/proposal/list", { projectId: "proj" });
    expect(res.status).toBe(500);
    expect(res.json.success).toBe(false);
  });

  test("rethrows SearchServiceError (propagates)", async () => {
    reset();
    job.listPending.mockImplementationOnce(async () => {
      throw new SSE("canonical", 502);
    });
    const res = await post("/api/v1/proposal/list", { projectId: "proj" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v1/proposal/approve", () => {
  test("approves and returns 200", async () => {
    reset();
    job.approve.mockImplementationOnce(async () => ({ ok: true, applied: true }));
    const res = await post("/api/v1/proposal/approve", { id: "p1", projectId: "proj", source: "llm" });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
  });

  test("domain rejection returns 400", async () => {
    reset();
    job.approve.mockImplementationOnce(async () => ({ ok: false, reason: "missing" }));
    const res = await post("/api/v1/proposal/approve", { id: "p1" });
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
  });

  test("423 when disabled", async () => {
    memoryConfig = { autoImprove: { enabled: false } };
    const res = await post("/api/v1/proposal/approve", { id: "p1" });
    expect(res.status).toBe(423);
  });

  test("400 when id missing", async () => {
    reset();
    const res = await post("/api/v1/proposal/approve", { id: "" });
    expect(res.status).toBe(400);
  });

  test("500 on generic error", async () => {
    reset();
    job.approve.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await post("/api/v1/proposal/approve", { id: "p1" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v1/proposal/reject", () => {
  test("rejects and returns 200", async () => {
    reset();
    job.reject.mockImplementationOnce(async () => ({ ok: true }));
    const res = await post("/api/v1/proposal/reject", { id: "p1", projectId: "proj", reason: "no" });
    expect(res.status).toBe(200);
  });

  test("domain rejection returns 400", async () => {
    reset();
    job.reject.mockImplementationOnce(async () => ({ ok: false, reason: "missing" }));
    const res = await post("/api/v1/proposal/reject", { id: "p1" });
    expect(res.status).toBe(400);
  });

  test("423 when disabled", async () => {
    memoryConfig = { autoImprove: { enabled: false } };
    const res = await post("/api/v1/proposal/reject", { id: "p1" });
    expect(res.status).toBe(423);
  });

  test("400 when id missing", async () => {
    reset();
    const res = await post("/api/v1/proposal/reject", { id: " " });
    expect(res.status).toBe(400);
  });

  test("500 on generic error", async () => {
    reset();
    job.reject.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await post("/api/v1/proposal/reject", { id: "p1" });
    expect(res.status).toBe(500);
  });
});
