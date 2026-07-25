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
  handoffsConfig = undefined;
  service.begin.mockImplementation(async () => ({ ok: true, id: "h1" }));
  service.accept.mockImplementation(async () => ({ ok: true }));
  service.cancel.mockImplementation(async () => ({ ok: true }));
  service.listPending.mockImplementation(async () => []);
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
