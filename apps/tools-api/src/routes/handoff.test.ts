/**
 * Handoff route coverage (Phase 6). begin/accept/cancel/list with disabled
 * (423), validation (400), success (200), domain reject (400), generic (500),
 * SearchServiceError rethrow. Also covers rethrowCanonicalHandoffError export.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

let SSE: any;
const service = {
  begin: mock(async (): Promise<any> => ({ ok: true })),
  accept: mock(async (): Promise<any> => ({ ok: true })),
  cancel: mock(async (): Promise<any> => ({ ok: true })),
  listPending: mock(async (): Promise<any[]> => []),
  update: mock(async (): Promise<any> => ({ ok: true })),
  delete: mock(async (): Promise<any> => ({ ok: true })),
};
let handoffsConfig: any = undefined;

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  SSE = actual.SearchServiceError;
  return { ...actual, getHandoffService: () => service, SearchServiceError: actual.SearchServiceError };
});

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    config: { get: (k: string) => (k === "handoffs" ? handoffsConfig : undefined) },
    logger: { ...actual.logger, error: () => {} },
  };
});

import { handoffRoutes, rethrowCanonicalHandoffError } from "./handoff.js";
const app = new Elysia().use(handoffRoutes);

async function request(method: string, path: string, body?: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
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

async function post(path: string, body: unknown) {
  return request("POST", path, body);
}

async function patch(path: string, body: unknown) {
  return request("PATCH", path, body);
}

async function del(path: string) {
  return request("DELETE", path);
}

function reset() {
  handoffsConfig = undefined;
  service.begin.mockClear();
  service.accept.mockClear();
  service.cancel.mockClear();
  service.listPending.mockClear();
  service.update.mockClear();
  service.delete.mockClear();
  service.begin.mockImplementation(async () => ({ ok: true, id: "h1" }));
  service.accept.mockImplementation(async () => ({ ok: true }));
  service.cancel.mockImplementation(async () => ({ ok: true }));
  service.listPending.mockImplementation(async () => []);
  service.update.mockImplementation(async () => ({ ok: true, handoff: { id: "h1", summary: "updated" } }));
  service.delete.mockImplementation(async () => ({ ok: true, id: "h1" }));
}

describe("rethrowCanonicalHandoffError", () => {
  test("rethrows SearchServiceError and ignores others", () => {
    const sse = new SSE("canonical", 500);
    expect(() => rethrowCanonicalHandoffError(sse)).toThrow(sse);
    expect(() => rethrowCanonicalHandoffError(new Error("plain"))).not.toThrow();
  });
});

describe("POST /api/v1/handoff/begin", () => {
  test("begins a handoff and returns 200", async () => {
    reset();
    service.begin.mockImplementationOnce(async () => ({ ok: true, id: "h1" }));
    const res = await post("/api/v1/handoff/begin", {
      projectId: "p",
      sourceSessionId: "s",
      summary: "sum",
      files: ["a.ts"],
    });
    expect(res.status).toBe(200);
    expect((service.begin.mock.calls[0] as any[])[0]).toMatchObject({ projectId: "p", summary: "sum" });
  });

  test("domain rejection returns 400", async () => {
    reset();
    service.begin.mockImplementationOnce(async () => ({ ok: false, reason: "dup" }));
    const res = await post("/api/v1/handoff/begin", { projectId: "p" });
    expect(res.status).toBe(400);
  });

  test("423 when disabled", async () => {
    handoffsConfig = { enabled: false };
    const res = await post("/api/v1/handoff/begin", { projectId: "p" });
    expect(res.status).toBe(423);
  });

  test("400 when projectId missing", async () => {
    reset();
    const res = await post("/api/v1/handoff/begin", { projectId: "" });
    expect(res.status).toBe(400);
  });

  test("500 on generic error", async () => {
    reset();
    service.begin.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await post("/api/v1/handoff/begin", { projectId: "p" });
    expect(res.status).toBe(500);
  });

  test("rethrows SearchServiceError", async () => {
    reset();
    service.begin.mockImplementationOnce(async () => {
      throw new SSE("canonical", 503);
    });
    const res = await post("/api/v1/handoff/begin", { projectId: "p" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v1/handoff/accept", () => {
  test("accepts and returns 200", async () => {
    reset();
    service.accept.mockImplementationOnce(async () => ({ ok: true }));
    const res = await post("/api/v1/handoff/accept", { id: "h1", projectId: "p" });
    expect(res.status).toBe(200);
  });

  test("400 when id missing", async () => {
    reset();
    const res = await post("/api/v1/handoff/accept", { id: " " });
    expect(res.status).toBe(400);
  });

  test("423 when disabled", async () => {
    handoffsConfig = { enabled: false };
    const res = await post("/api/v1/handoff/accept", { id: "h1" });
    expect(res.status).toBe(423);
  });

  test("500 on generic error", async () => {
    reset();
    service.accept.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await post("/api/v1/handoff/accept", { id: "h1" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v1/handoff/cancel", () => {
  test("cancels and returns 200", async () => {
    reset();
    service.cancel.mockImplementationOnce(async () => ({ ok: true }));
    const res = await post("/api/v1/handoff/cancel", { id: "h1", projectId: "p" });
    expect(res.status).toBe(200);
  });

  test("400 when id missing", async () => {
    reset();
    const res = await post("/api/v1/handoff/cancel", { id: " " });
    expect(res.status).toBe(400);
  });

  test("423 when disabled", async () => {
    handoffsConfig = { enabled: false };
    const res = await post("/api/v1/handoff/cancel", { id: "h1" });
    expect(res.status).toBe(423);
  });

  test("500 on generic error", async () => {
    reset();
    service.cancel.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await post("/api/v1/handoff/cancel", { id: "h1" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v1/handoff/list", () => {
  test("lists pending handoffs", async () => {
    reset();
    service.listPending.mockImplementationOnce(async () => [{ id: "h1" }, { id: "h2" }]);
    const res = await post("/api/v1/handoff/list", { projectId: "p", targetAgent: "a" });
    expect(res.status).toBe(200);
    expect(res.json.data.count).toBe(2);
    expect((service.listPending.mock.calls[0] as any[]) ?? []).toEqual(["p", "a"]);
  });

  test("400 when projectId missing", async () => {
    reset();
    const res = await post("/api/v1/handoff/list", { projectId: "" });
    expect(res.status).toBe(400);
  });

  test("423 when disabled", async () => {
    handoffsConfig = { enabled: false };
    const res = await post("/api/v1/handoff/list", { projectId: "p" });
    expect(res.status).toBe(423);
  });

  test("500 on generic error", async () => {
    reset();
    service.listPending.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await post("/api/v1/handoff/list", { projectId: "p" });
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/v1/handoff/:id", () => {
  test("updates and returns 200 with explicit status (not the {success:false}-carrying-200 shape)", async () => {
    reset();
    const res = await patch("/api/v1/handoff/h1", { summary: "new summary" });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect((service.update.mock.calls[0] as any[])[0]).toMatchObject({
      id: "h1",
      patch: { summary: "new summary" },
    });
  });

  test("AC-01.1: an absent field is left untouched — only provided keys reach the patch", async () => {
    reset();
    await patch("/api/v1/handoff/h1", { targetAgent: "agent-x" });
    expect((service.update.mock.calls[0] as any[])[0].patch).toEqual({ targetAgent: "agent-x" });
  });

  test("AC-01.1: a body naming no editable field is 400, not a silent no-op", async () => {
    reset();
    const res = await patch("/api/v1/handoff/h1", {});
    expect(res.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  for (const field of ["status", "acceptedAt", "id", "projectId", "createdAt", "sourceSessionId"]) {
    test(`AC-01.2: rejects "${field}" with 400 naming the field`, async () => {
      reset();
      const res = await patch("/api/v1/handoff/h1", { [field]: "x" });
      expect(res.status).toBe(400);
      expect(res.json.error).toContain(field);
      expect(service.update).not.toHaveBeenCalled();
    });
  }

  test("a body naming only unknown keys is 400 naming them, not a 200 that silently changed nothing", async () => {
    reset();
    const res = await patch("/api/v1/handoff/h1", { bogusField: "x" });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("bogusField");
    expect(service.update).not.toHaveBeenCalled();
  });

  test("rejects a non-string summary with 400", async () => {
    reset();
    const res = await patch("/api/v1/handoff/h1", { summary: 123 });
    expect(res.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  test("rejects a non-string-array openQuestions with 400", async () => {
    reset();
    const res = await patch("/api/v1/handoff/h1", { openQuestions: ["ok", 1] });
    expect(res.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  test("AC-01.6: unknown id is a real 404, not a 200 carrying {success:false}", async () => {
    reset();
    service.update.mockImplementationOnce(async () => ({ ok: false, reason: "not-found" }));
    const res = await patch("/api/v1/handoff/missing", { summary: "x" });
    expect(res.status).toBe(404);
    expect(res.json.success).toBeUndefined();
  });

  test("AC-01.7: project mismatch is 404, not 403", async () => {
    reset();
    service.update.mockImplementationOnce(async () => ({ ok: false, reason: "project-mismatch" }));
    const res = await patch("/api/v1/handoff/h1?projectId=wrong-project", { summary: "x" });
    expect(res.status).toBe(404);
    expect((service.update.mock.calls[0] as any[])[0]).toMatchObject({ projectId: "wrong-project" });
  });

  test("423 when disabled — precedes the new route's own logic (handler-inline gate runs after every beforeHandle)", async () => {
    reset();
    handoffsConfig = { enabled: false };
    const res = await patch("/api/v1/handoff/h1", { summary: "x" });
    expect(res.status).toBe(423);
    expect(service.update).not.toHaveBeenCalled();
  });

  test("500 on generic error", async () => {
    reset();
    service.update.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await patch("/api/v1/handoff/h1", { summary: "x" });
    expect(res.status).toBe(500);
  });

  test("rethrows SearchServiceError", async () => {
    reset();
    service.update.mockImplementationOnce(async () => {
      throw new SSE("canonical", 503);
    });
    const res = await patch("/api/v1/handoff/h1", { summary: "x" });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/v1/handoff/:id", () => {
  test("deletes and returns 200 with the deleted id", async () => {
    reset();
    const res = await del("/api/v1/handoff/h1");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.id).toBe("h1");
    expect((service.delete.mock.calls[0] as any[])[0]).toMatchObject({ id: "h1" });
  });

  test("AC-01.4: delete is permitted regardless of status (route imposes no status check)", async () => {
    reset();
    const res = await del("/api/v1/handoff/h1");
    expect(res.status).toBe(200);
  });

  test("AC-01.6: unknown id is a real 404, not a 200 carrying {success:false}", async () => {
    reset();
    service.delete.mockImplementationOnce(async () => ({ ok: false, reason: "not-found" }));
    const res = await del("/api/v1/handoff/missing");
    expect(res.status).toBe(404);
    expect(res.json.success).toBeUndefined();
  });

  test("AC-01.7: project mismatch is 404, not 403", async () => {
    reset();
    service.delete.mockImplementationOnce(async () => ({ ok: false, reason: "project-mismatch" }));
    const res = await del("/api/v1/handoff/h1?projectId=wrong-project");
    expect(res.status).toBe(404);
    expect((service.delete.mock.calls[0] as any[])[0]).toMatchObject({ projectId: "wrong-project" });
  });

  test("423 when disabled", async () => {
    reset();
    handoffsConfig = { enabled: false };
    const res = await del("/api/v1/handoff/h1");
    expect(res.status).toBe(423);
    expect(service.delete).not.toHaveBeenCalled();
  });

  test("500 on generic error", async () => {
    reset();
    service.delete.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await del("/api/v1/handoff/h1");
    expect(res.status).toBe(500);
  });

  test("rethrows SearchServiceError", async () => {
    reset();
    service.delete.mockImplementationOnce(async () => {
      throw new SSE("canonical", 503);
    });
    const res = await del("/api/v1/handoff/h1");
    expect(res.status).toBe(500);
  });
});
