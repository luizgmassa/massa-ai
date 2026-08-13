/**
 * Proposal route coverage (Phase 5 + T8). /list /approve /reject with disabled
 * (423), validation (400), success (200), domain reject (400), generic (500),
 * and SearchServiceError rethrow paths. /create, PATCH/DELETE :id (T8,
 * HPC-02) cover create validation, the payload-validation duck-type mapping,
 * the PATCH allowlist, and the not-found/project-mismatch 404 shape.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

let SSE: any;
const job = {
  listPending: mock(async (): Promise<any[]> => []),
  approve: mock(async (): Promise<any> => ({ ok: true })),
  reject: mock(async (): Promise<any> => ({ ok: true })),
};
const proposalStore = {
  create: mock(async (): Promise<any> => ({})),
  getById: mock(async (): Promise<any> => null),
  update: mock(async (): Promise<any> => null),
  delete: mock(async (): Promise<any> => null),
};

let memoryConfig: any = undefined;

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  SSE = actual.SearchServiceError;
  return {
    ...actual,
    getAutoImproveJob: () => job,
    getProposalStore: () => proposalStore,
    SearchServiceError: actual.SearchServiceError,
  };
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

/**
 * The REAL `ProposalPayloadValidationError`, not a double.
 *
 * This was a hand-rolled `FakeProposalPayloadValidationError` that copied the
 * class's `name` and `statusCode`, back when the route detected the error by
 * duck-typing those two fields. The route now uses `instanceof`, and a fake
 * cannot satisfy that — correctly: a double that only mimics the shape a check
 * happens to read can keep passing after the real class diverges from it.
 *
 * Reached through `require` rather than a static import so it resolves after
 * `mock.module` above has registered; that mock spreads `...actual`, so this is
 * the same class object the route receives.
 */
function payloadValidationError(message = "proposal payload is invalid"): Error {
  const { ProposalPayloadValidationError } = require("@massa-ai/core");
  return new ProposalPayloadValidationError("memory.create", message);
}

function reset() {
  memoryConfig = undefined;
  job.listPending.mockClear();
  job.approve.mockClear();
  job.reject.mockClear();
  proposalStore.create.mockClear();
  proposalStore.getById.mockClear();
  proposalStore.update.mockClear();
  proposalStore.delete.mockClear();

  job.listPending.mockImplementation(async () => []);
  job.approve.mockImplementation(async () => ({ ok: true, applied: true }));
  job.reject.mockImplementation(async () => ({ ok: true, flipped: true }));

  proposalStore.create.mockImplementation(async () => ({
    id: "p1",
    projectId: "proj",
    kind: "memory.create",
    payload: { content: "x" },
    rationale: "",
    status: "pending",
    createdAt: 1,
    decidedAt: null,
  }));
  proposalStore.getById.mockImplementation(async () => ({
    id: "p1",
    projectId: "proj",
    kind: "memory.create",
    payload: { content: "x" },
    rationale: "r",
    status: "pending",
    createdAt: 1,
    decidedAt: null,
  }));
  proposalStore.update.mockImplementation(async () => ({
    id: "p1",
    projectId: "proj",
    kind: "memory.create",
    payload: { content: "x" },
    rationale: "updated",
    status: "pending",
    createdAt: 1,
    decidedAt: null,
  }));
  proposalStore.delete.mockImplementation(async () => "p1");
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

describe("POST /api/v1/proposal/create", () => {
  test("AC-02.1: creates a pending proposal and returns 200", async () => {
    reset();
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
      rationale: "why",
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect((proposalStore.create.mock.calls[0] as any[])[0]).toMatchObject({
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
      rationale: "why",
    });
  });

  test("423 when auto-improve disabled", async () => {
    reset();
    memoryConfig = { autoImprove: { enabled: false } };
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
    });
    expect(res.status).toBe(423);
    expect(proposalStore.create).not.toHaveBeenCalled();
  });

  test("400 when projectId missing", async () => {
    reset();
    const res = await post("/api/v1/proposal/create", { kind: "memory.create", payload: { content: "x" } });
    expect(res.status).toBe(400);
    expect(proposalStore.create).not.toHaveBeenCalled();
  });

  test("AC-02.2: 400 when kind is missing", async () => {
    reset();
    const res = await post("/api/v1/proposal/create", { projectId: "proj", payload: { content: "x" } });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("kind");
    expect(proposalStore.create).not.toHaveBeenCalled();
  });

  test("AC-02.2: 400 when kind is not one of memory.create/memory.update/memory.tag", async () => {
    reset();
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.bogus",
      payload: { content: "x" },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("kind");
    expect(proposalStore.create).not.toHaveBeenCalled();
  });

  test("400 when payload is missing", async () => {
    reset();
    const res = await post("/api/v1/proposal/create", { projectId: "proj", kind: "memory.create" });
    expect(res.status).toBe(400);
    expect(proposalStore.create).not.toHaveBeenCalled();
  });

  test("400 when payload is not an object", async () => {
    reset();
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.create",
      payload: "not-an-object",
    });
    expect(res.status).toBe(400);
    expect(proposalStore.create).not.toHaveBeenCalled();
  });

  test("400 when rationale is not a string", async () => {
    reset();
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
      rationale: 5,
    });
    expect(res.status).toBe(400);
    expect(proposalStore.create).not.toHaveBeenCalled();
  });

  test("400 when targetMemoryId is not a string or null", async () => {
    reset();
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
      targetMemoryId: 5,
    });
    expect(res.status).toBe(400);
    expect(proposalStore.create).not.toHaveBeenCalled();
  });

  // AC-02.2: a payload the reader (parsePayload) would reject must be refused
  // at write time, not accepted and left to corrupt every later read. The
  // store's own create() already re-runs the shared validator and throws
  // ProposalPayloadValidationError (D4) — this proves the route surfaces
  // that as a 400 rather than swallowing it into a 500.
  test("AC-02.2: surfaces the store's write-time payload validation rejection as 400", async () => {
    reset();
    proposalStore.create.mockImplementationOnce(async () => {
      throw payloadValidationError('proposal payload is invalid for kind "memory.create"');
    });
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x", bogusKey: "nope" },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("invalid");
    expect(proposalStore.create).toHaveBeenCalled();
  });

  test("500 on generic error", async () => {
    reset();
    proposalStore.create.mockImplementationOnce(async () => {
      throw new Error("db");
    });
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
    });
    expect(res.status).toBe(500);
    expect(res.json.success).toBe(false);
  });

  test("rethrows SearchServiceError", async () => {
    reset();
    proposalStore.create.mockImplementationOnce(async () => {
      throw new SSE("canonical", 502);
    });
    const res = await post("/api/v1/proposal/create", {
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
    });
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/v1/proposal/:id", () => {
  test("updates and returns 200 with explicit status (not the {success:false}-carrying-200 shape)", async () => {
    reset();
    const res = await patch("/api/v1/proposal/p1", { rationale: "updated" });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect((proposalStore.update.mock.calls[0] as any[])[0]).toBe("p1");
    expect((proposalStore.update.mock.calls[0] as any[])[1]).toEqual({ rationale: "updated" });
  });

  test("AC-02.3: an absent field is left untouched — only provided keys reach the patch", async () => {
    reset();
    await patch("/api/v1/proposal/p1", { payload: { content: "y" } });
    expect((proposalStore.update.mock.calls[0] as any[])[1]).toEqual({ payload: { content: "y" } });
  });

  test("a body naming no editable field is 400, not a silent no-op", async () => {
    reset();
    const res = await patch("/api/v1/proposal/p1", {});
    expect(res.status).toBe(400);
    expect(proposalStore.update).not.toHaveBeenCalled();
  });

  for (const field of ["kind", "targetMemoryId", "status", "decidedAt", "id", "projectId", "createdAt"]) {
    test(`AC-02.4: rejects "${field}" with 400 naming the field`, async () => {
      reset();
      const res = await patch("/api/v1/proposal/p1", { [field]: "x" });
      expect(res.status).toBe(400);
      expect(res.json.error).toContain(field);
      expect(proposalStore.update).not.toHaveBeenCalled();
    });
  }

  test("a body naming only unknown keys is 400 naming them, not a 200 that silently changed nothing", async () => {
    reset();
    const res = await patch("/api/v1/proposal/p1", { bogusField: "x" });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("bogusField");
    expect(proposalStore.update).not.toHaveBeenCalled();
  });

  test("rejects a non-string rationale with 400", async () => {
    reset();
    const res = await patch("/api/v1/proposal/p1", { rationale: 123 });
    expect(res.status).toBe(400);
    expect(proposalStore.update).not.toHaveBeenCalled();
  });

  test("rejects a non-object payload with 400", async () => {
    reset();
    const res = await patch("/api/v1/proposal/p1", { payload: "nope" });
    expect(res.status).toBe(400);
    expect(proposalStore.update).not.toHaveBeenCalled();
  });

  // AC-02.3: a payload edit re-runs write-time validation against the row's
  // existing kind. Proven via the same duck-typed error the store throws.
  test("AC-02.3: surfaces the store's payload re-validation rejection as 400", async () => {
    reset();
    proposalStore.update.mockImplementationOnce(async () => {
      throw payloadValidationError('proposal payload is invalid for kind "memory.create"');
    });
    const res = await patch("/api/v1/proposal/p1", { payload: { bogusKey: "nope" } });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("invalid");
  });

  test("AC-02.6: unknown id is a real 404, not a 200 carrying {success:false}", async () => {
    reset();
    proposalStore.getById.mockImplementationOnce(async () => null);
    const res = await patch("/api/v1/proposal/missing", { rationale: "x" });
    expect(res.status).toBe(404);
    expect(res.json.success).toBeUndefined();
    expect(proposalStore.update).not.toHaveBeenCalled();
  });

  test("AC-02.6: project mismatch is 404, not 403", async () => {
    reset();
    proposalStore.getById.mockImplementationOnce(async () => ({
      id: "p1",
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
      rationale: "r",
      status: "pending",
      createdAt: 1,
      decidedAt: null,
    }));
    const res = await patch("/api/v1/proposal/p1?projectId=wrong-project", { rationale: "x" });
    expect(res.status).toBe(404);
    expect(proposalStore.update).not.toHaveBeenCalled();
  });

  test("423 when disabled — precedes the new route's own logic (handler-inline gate runs after every beforeHandle)", async () => {
    reset();
    memoryConfig = { autoImprove: { enabled: false } };
    const res = await patch("/api/v1/proposal/p1", { rationale: "x" });
    expect(res.status).toBe(423);
    expect(proposalStore.update).not.toHaveBeenCalled();
  });

  test("500 on generic getById error", async () => {
    reset();
    proposalStore.getById.mockImplementationOnce(async () => {
      throw new Error("db");
    });
    const res = await patch("/api/v1/proposal/p1", { rationale: "x" });
    expect(res.status).toBe(500);
  });

  test("rethrows SearchServiceError", async () => {
    reset();
    proposalStore.update.mockImplementationOnce(async () => {
      throw new SSE("canonical", 503);
    });
    const res = await patch("/api/v1/proposal/p1", { rationale: "x" });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/v1/proposal/:id", () => {
  test("deletes and returns 200 with the deleted id", async () => {
    reset();
    const res = await del("/api/v1/proposal/p1");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.id).toBe("p1");
    expect((proposalStore.delete.mock.calls[0] as any[])[0]).toBe("p1");
  });

  test("AC-02.5: delete is permitted regardless of status (route imposes no status check)", async () => {
    reset();
    proposalStore.getById.mockImplementationOnce(async () => ({
      id: "p1",
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
      rationale: "r",
      status: "rejected",
      createdAt: 1,
      decidedAt: 2,
    }));
    const res = await del("/api/v1/proposal/p1");
    expect(res.status).toBe(200);
    expect(res.json.data.note).toBeUndefined();
  });

  test("AC-02.5: deleting an approved proposal states in the response that the applied memory edit is not reversed", async () => {
    reset();
    proposalStore.getById.mockImplementationOnce(async () => ({
      id: "p1",
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
      rationale: "r",
      status: "approved",
      createdAt: 1,
      decidedAt: 2,
    }));
    const res = await del("/api/v1/proposal/p1");
    expect(res.status).toBe(200);
    expect(res.json.data.note).toContain("not reversed");
  });

  test("AC-02.6: unknown id is a real 404, not a 200 carrying {success:false}", async () => {
    reset();
    proposalStore.getById.mockImplementationOnce(async () => null);
    const res = await del("/api/v1/proposal/missing");
    expect(res.status).toBe(404);
    expect(res.json.success).toBeUndefined();
    expect(proposalStore.delete).not.toHaveBeenCalled();
  });

  test("AC-02.6: project mismatch is 404, not 403", async () => {
    reset();
    proposalStore.getById.mockImplementationOnce(async () => ({
      id: "p1",
      projectId: "proj",
      kind: "memory.create",
      payload: { content: "x" },
      rationale: "r",
      status: "pending",
      createdAt: 1,
      decidedAt: null,
    }));
    const res = await del("/api/v1/proposal/p1?projectId=wrong-project");
    expect(res.status).toBe(404);
    expect(proposalStore.delete).not.toHaveBeenCalled();
  });

  test("423 when disabled", async () => {
    reset();
    memoryConfig = { autoImprove: { enabled: false } };
    const res = await del("/api/v1/proposal/p1");
    expect(res.status).toBe(423);
    expect(proposalStore.delete).not.toHaveBeenCalled();
  });

  test("500 on generic error", async () => {
    reset();
    proposalStore.delete.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await del("/api/v1/proposal/p1");
    expect(res.status).toBe(500);
  });

  test("rethrows SearchServiceError", async () => {
    reset();
    proposalStore.getById.mockImplementationOnce(async () => {
      throw new SSE("canonical", 503);
    });
    const res = await del("/api/v1/proposal/p1");
    expect(res.status).toBe(500);
  });
});
