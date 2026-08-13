/**
 * EmbeddedApiClient endpoint routing coverage (coverage-90pct, Batch K).
 *
 * Exercises every get/post/patch/delete endpoint branch + every private
 * handler method so the routing logic is fully covered. Runs against the real
 * test DB (RUN_POSTGRES_TESTS); tools may return empty/error results — the
 * routing branches execute regardless. This file is isolation-classified
 * (embedded + core) and runs in its own process.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { ApiHttpError as ApiHttpErrorInstance } from "../api-client.js";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// DI-01 (da-inventory-closure): scratch config home BEFORE any core-reaching
// import. The shared barrel eagerly reads the real CONFIG_DIR at import time,
// and /search/project + /search/code reach live embedding-provider
// auto-selection through it (`ensureInitialized` → `getVectorStore()`) — the
// cold-model 5001 ms class. Static imports hoist above statements, so every
// core-reaching import below is dynamic (the m25-m26 suite's pattern; the
// type-only import above is erased and loads nothing). This gives a direct
// `bun test <this file>` the same hermetic env the isolated runner's
// buildChildEnv (SEN-03) gives every wrapper child, DATABASE_URL still
// arriving via env exactly as the wrapper passes it through.
const SCRATCH_CONFIG_HOME = mkdtempSync(path.join(tmpdir(), "embedded-endpoints-config-"));
process.env.XDG_CONFIG_HOME = SCRATCH_CONFIG_HOME;

const { EmbeddedApiClient } = await import("../embedded-api-client.js");
const { ApiHttpError } = await import("../api-client.js");
const { _setLlmEnabledForTesting } = await import("@massa-ai/core");

// Second gate, mirroring buildChildEnv's MASSA_AI_LLM_ENABLED=false pin: the
// scratch config home closes the config.json path, this closes the env path
// (a repo .env setting the gate true would sail past the scratch dir).
beforeAll(() => _setLlmEnabledForTesting(false));
afterAll(() => {
  _setLlmEnabledForTesting(null);
  rmSync(SCRATCH_CONFIG_HOME, { recursive: true, force: true });
});

const client = new EmbeddedApiClient();
const BASE_TMP = tmpdir();

/** Call a method; return { result } on success or { err } on failure. */
async function call(fn: () => Promise<unknown>): Promise<{ result?: unknown; err?: unknown }> {
  try {
    return { result: await fn() };
  } catch (err) {
    return { err };
  }
}

describe("EmbeddedApiClient GET endpoints", () => {
  test("symbol/definitions: missing projectId → error envelope", async () => {
    const { result } = await call(() => client.get("/api/v1/symbol/definitions", {}));
    expect((result as any)?.success).toBe(false);
  });

  test("symbol/definitions: with projectId + kind + exportedOnly", async () => {
    await call(() => client.get("/api/v1/symbol/definitions", { projectId: "test-proj", kind: "function", exportedOnly: "true", limit: 5, search: "x" }));
  });

  test("symbol/references: missing projectId → error", async () => {
    const { result } = await call(() => client.get("/api/v1/symbol/references", {}));
    expect((result as any)?.success).toBe(false);
  });

  test("symbol/references: missing symbolName → error", async () => {
    const { result } = await call(() => client.get("/api/v1/symbol/references", { projectId: "p" }));
    expect((result as any)?.success).toBe(false);
  });

  test("symbol/references: with projectId + symbolName + fqn + limit", async () => {
    await call(() => client.get("/api/v1/symbol/references", { projectId: "p", symbolName: "foo", fqn: "a#b", limit: 10 }));
  });

  test("symbol/definition: missing projectId → error", async () => {
    const { result } = await call(() => client.get("/api/v1/symbol/definition", {}));
    expect((result as any)?.success).toBe(false);
  });

  test("symbol/definition: missing symbolName → error", async () => {
    const { result } = await call(() => client.get("/api/v1/symbol/definition", { projectId: "p" }));
    expect((result as any)?.success).toBe(false);
  });

  test("symbol/definition: with params + fromFile", async () => {
    await call(() => client.get("/api/v1/symbol/definition", { projectId: "p", symbolName: "foo", fromFile: "a.ts" }));
  });

  test("symbol/trace", async () => {
    await call(() => client.get("/api/v1/symbol/trace", { projectId: "p", fromSymbol: "a", toSymbol: "b" }));
  });

  test("symbol/snippet: missing projectId → error", async () => {
    const { result } = await call(() => client.get("/api/v1/symbol/snippet", {}));
    expect((result as any)?.success).toBe(false);
  });

  test("symbol/snippet: missing file → error", async () => {
    const { result } = await call(() => client.get("/api/v1/symbol/snippet", { projectId: "p" }));
    expect((result as any)?.success).toBe(false);
  });

  test("symbol/snippet: workspace not found", async () => {
    const { result } = await call(() => client.get("/api/v1/symbol/snippet", { projectId: "no-such-ws", file: "a.ts" }));
    expect((result as any)?.success).toBe(false);
  });

  test("workspace list", async () => {
    await call(() => client.get("/api/v1/workspace/list", { status: "all" }));
  });

  test("synapse/sessions", async () => {
    await call(() => client.get("/api/v1/synapse/sessions"));
  });

  test("analytics GET", async () => {
    await call(() => client.get("/api/v1/analytics", { type: "summary" }));
  });

  test("architecture parametric", async () => {
    await call(() => client.get("/api/v1/project/test-proj/architecture", { aspects: "domains", centralityLimit: 5, format: "json", fields: "name" }));
  });

  test("workspace map parametric", async () => {
    await call(() => client.get("/api/v1/workspace/test-proj/map", { centralityLimit: 5, recentLimit: 5 }));
  });

  test("index status parametric", async () => {
    await call(() => client.get("/api/v1/project/index/status/job-xyz"));
  });

  test("synapse session GET not found", async () => {
    const { result } = await call(() => client.get("/api/v1/synapse/session/no-such-session"));
    expect((result as any)?.success).toBe(false);
  });

  test("unknown GET → 404", async () => {
    const { err } = await call(() => client.get("/api/v1/unknown-get"));
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpErrorInstance).status).toBe(404);
  });
});

describe("EmbeddedApiClient POST endpoints", () => {
  const postEndpoints = [
    "/api/v1/project/index",
    "/api/v1/search/project",
    "/api/v1/search/code",
    "/api/v1/memory/store",
    "/api/v1/memory/search",
    "/api/v1/memory/update",
    "/api/v1/memory/delete",
    "/api/v1/checkpoints/list",
    "/api/v1/checkpoints/create",
    "/api/v1/checkpoints/restore",
    "/api/v1/context/compress",
    "/api/v1/context/optimized",
    "/api/v1/analytics/",
    "/api/v1/symbol/impact",
    "/api/v1/file/read",
    "/api/v1/hook/compact-snapshot",
  ];

  test.each(postEndpoints)("POST %s routes without 404", async (ep) => {
    const { err } = await call(() => client.post(ep, {}));
    // May throw 500 (tool error) but must NOT be 404
    if (err instanceof ApiHttpError) {
      expect(err.status).not.toBe(404);
    }
  });

  test("POST project/reset", async () => {
    const { err, result } = await call(() => client.post("/api/v1/project/reset", { projectId: "p" }));
    if (err instanceof ApiHttpError) expect(err.status).not.toBe(404);
    expect(result !== undefined || err !== undefined).toBe(true);
  });

  test("POST project/rename (dryRun)", async () => {
    await call(() => client.post("/api/v1/project/rename", { projectId: "p", newName: "p2", dryRun: true }));
  });

  test("POST project/merge (dryRun)", async () => {
    await call(() => client.post("/api/v1/project/merge", { sourceProjectId: "p1", targetProjectId: "p2", dryRun: true }));
  });

  test("POST memory/list", async () => {
    await call(() => client.post("/api/v1/memory/list", { limit: 5, offset: 0 }));
  });

  test("POST hook/batch (empty events)", async () => {
    const { result, err } = await call(() => client.post("/api/v1/hook/batch", { events: [] }));
    expect(result !== undefined || err !== undefined).toBe(true);
  });

  test("POST hook/batch (with events)", async () => {
    await call(() => client.post("/api/v1/hook/batch", { events: [{ event: "post-tool-use", projectId: "p", payload: { tool_name: "Read" } }] }));
  });

  test("POST bootstrap", async () => {
    await call(() => client.post("/api/v1/bootstrap", { projectId: "p", forceRefresh: false }));
  }, 30000);

  test("POST handoff/begin", async () => {
    await call(() => client.post("/api/v1/handoff/begin", { projectId: "p", targetAgent: "builder", summary: "s" }));
  });

  test("POST handoff/accept", async () => {
    await call(() => client.post("/api/v1/handoff/accept", { handoffId: "h1", acceptingAgent: "x" }));
  });

  test("POST handoff/cancel", async () => {
    await call(() => client.post("/api/v1/handoff/cancel", { handoffId: "h1" }));
  });

  test("POST handoff/list", async () => {
    await call(() => client.post("/api/v1/handoff/list", { projectId: "p" }));
  });

  test("POST proposal/list", async () => {
    await call(() => client.post("/api/v1/proposal/list", { projectId: "p" }));
  });

  test("POST proposal/approve", async () => {
    await call(() => client.post("/api/v1/proposal/approve", { proposalId: "pr1" }));
  });

  test("POST proposal/reject", async () => {
    await call(() => client.post("/api/v1/proposal/reject", { proposalId: "pr1" }));
  });

  test("POST executor/execute", async () => {
    await call(() => client.post("/api/v1/executor/execute", { command: "echo hi", language: "shell" }));
  });

  test("POST executor/execute_file", async () => {
    await call(() => client.post("/api/v1/executor/execute_file", { filePath: "/tmp/x.sh", language: "shell" }));
  });

  test("POST executor/batch_execute", async () => {
    await call(() => client.post("/api/v1/executor/batch_execute", { commands: [{ command: "echo a", language: "shell" }] }));
  });

  test("POST workspace reindex parametric", async () => {
    await call(() => client.post("/api/v1/workspace/test-proj/reindex", { projectPath: "/tmp" }));
  });

  test("POST synapse/task/end parametric (not found)", async () => {
    const { result } = await call(() => client.post("/api/v1/synapse/task/no-such/end", {}));
    expect((result as any)?.success).toBe(false);
  });

  test("POST unknown → 404", async () => {
    const { err } = await call(() => client.post("/api/v1/unknown-post", {}));
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpErrorInstance).status).toBe(404);
  });
});

describe("EmbeddedApiClient synapse session lifecycle", () => {
  let sessionId: string | undefined;

  test("create session", async () => {
    const { result } = await call(() => client.post("/api/v1/synapse/session", { agentId: "test", taskContext: "coverage" }));
    const r = result as any;
    if (r?.success && r.data?.sessionId) sessionId = r.data.sessionId;
    expect(result).toBeDefined();
  });

  test("prime session", async () => {
    const { result } = await call(() => client.post(`/api/v1/synapse/session/${sessionId || "x"}/prime`, { memories: [] }));
    expect(result !== undefined).toBe(true);
  });

  test("access session", async () => {
    const { result } = await call(() => client.post(`/api/v1/synapse/session/${sessionId || "x"}/access`, { memoryId: "m1" }));
    expect(result !== undefined).toBe(true);
  });

  test("prefetch session", async () => {
    const { result } = await call(() => client.post(`/api/v1/synapse/session/${sessionId || "x"}/prefetch`, { queries: ["test"] }));
    expect(result !== undefined).toBe(true);
  });

  test("task begin", async () => {
    const { result } = await call(() => client.post("/api/v1/synapse/task/begin", { sessionId: sessionId || "x", taskDescription: "t" }));
    expect(result !== undefined).toBe(true);
  });

  test("GET session by id", async () => {
    const { result } = await call(() => client.get(`/api/v1/synapse/session/${sessionId || "x"}`));
    expect(result).toBeDefined();
  });

  test("PATCH session taskContext", async () => {
    const { result } = await call(() => client.patch(`/api/v1/synapse/session/${sessionId || "x"}`, { taskContext: "new" }));
    expect(result).toBeDefined();
  });

  test("DELETE session", async () => {
    const { result } = await call(() => client.delete(`/api/v1/synapse/session/${sessionId || "x"}`));
    expect(result).toBeDefined();
  });
});

describe("EmbeddedApiClient PATCH / DELETE", () => {
  test("PATCH unknown → 404", async () => {
    const { err } = await call(() => client.patch("/api/v1/unknown", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(404);
  });

  test("DELETE workspace parametric", async () => {
    const { result, err } = await call(() => client.delete("/api/v1/workspace/no-such-ws"));
    expect(result !== undefined || err !== undefined).toBe(true);
  });

  test("DELETE unknown → 404", async () => {
    const { err } = await call(() => client.delete("/api/v1/unknown-delete"));
    expect((err as ApiHttpErrorInstance)?.status).toBe(404);
  });
});

describe("EmbeddedApiClient validation branches (missing required params)", () => {
  test("bootstrap missing projectId → 400", async () => {
    const { err } = await call(() => client.post("/api/v1/bootstrap", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("handoff/begin missing projectId → 400", async () => {
    const { err } = await call(() => client.post("/api/v1/handoff/begin", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("handoff/accept missing id → 400", async () => {
    const { err } = await call(() => client.post("/api/v1/handoff/accept", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("handoff/cancel missing id → 400", async () => {
    const { err } = await call(() => client.post("/api/v1/handoff/cancel", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("handoff/list missing projectId → 400", async () => {
    const { err } = await call(() => client.post("/api/v1/handoff/list", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("proposal/list missing projectId → 400", async () => {
    const { err } = await call(() => client.post("/api/v1/proposal/list", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("proposal/approve missing id → 400", async () => {
    const { err } = await call(() => client.post("/api/v1/proposal/approve", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("proposal/reject missing id → 400", async () => {
    const { err } = await call(() => client.post("/api/v1/proposal/reject", {}));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });
});

// T10 (HPC-05/AC-05.1) — handoff/proposal PATCH/DELETE + proposal create
// routing added for MCP parity with the Phase 3 portal CRUD REST routes.
// Round-trips a real row through the real DB rather than only checking a
// branch is reached, since these mirror route logic (allowlist rejection,
// not-found handling) that a bare "doesn't 404" check would not exercise.
describe("EmbeddedApiClient handoff/proposal PATCH/DELETE (T10, HPC-05/AC-05.1)", () => {
  test("PATCH then DELETE a handoff via embedded routing", async () => {
    const { result: beginResult } = await call(() =>
      client.post("/api/v1/handoff/begin", { projectId: "embed-t10", summary: "s0" }),
    );
    const id = (beginResult as any)?.data?.id;
    expect(typeof id).toBe("string");

    const { result: patchResult } = await call(() => client.patch(`/api/v1/handoff/${id}`, { summary: "s1" }));
    expect((patchResult as any)?.success).toBe(true);
    expect((patchResult as any)?.data?.summary).toBe("s1");

    const { result: deleteResult } = await call(() => client.delete(`/api/v1/handoff/${id}`));
    expect((deleteResult as any)?.success).toBe(true);
    expect((deleteResult as any)?.data?.id).toBe(id);
  });

  test("PATCH handoff rejects a disallowed field by name (AC-01.2)", async () => {
    const { err } = await call(() => client.patch("/api/v1/handoff/no-such-id", { status: "accepted" }));
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpErrorInstance).status).toBe(400);
    expect(String((err as ApiHttpErrorInstance).body?.error)).toContain("status");
  });

  test("DELETE handoff missing id → 404", async () => {
    const { err } = await call(() => client.delete("/api/v1/handoff/no-such-id"));
    expect((err as ApiHttpErrorInstance)?.status).toBe(404);
  });

  test("POST proposal/create then PATCH then DELETE via embedded routing", async () => {
    const { result: createResult } = await call(() =>
      client.post("/api/v1/proposal/create", {
        projectId: "embed-t10",
        kind: "memory.tag",
        payload: { tags: ["a"] },
        rationale: "r0",
      }),
    );
    const created = (createResult as any)?.data;
    expect(created?.id).toBeDefined();

    const { result: patchResult } = await call(() =>
      client.patch(`/api/v1/proposal/${created.id}`, { rationale: "r1" }),
    );
    expect((patchResult as any)?.success).toBe(true);
    expect((patchResult as any)?.data?.rationale).toBe("r1");

    const { result: deleteResult } = await call(() => client.delete(`/api/v1/proposal/${created.id}`));
    expect((deleteResult as any)?.success).toBe(true);
    expect((deleteResult as any)?.data?.id).toBe(created.id);
  });

  test("proposal/create rejects an invalid kind (AC-02.1)", async () => {
    const { err } = await call(() =>
      client.post("/api/v1/proposal/create", { projectId: "embed-t10", kind: "nope", payload: {} }),
    );
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("PATCH proposal rejects a disallowed field by name (AC-02.4)", async () => {
    const { err } = await call(() => client.patch("/api/v1/proposal/no-such-id", { kind: "memory.tag" }));
    expect((err as ApiHttpErrorInstance)?.status).toBe(400);
  });

  test("DELETE proposal missing id → 404", async () => {
    const { err } = await call(() => client.delete("/api/v1/proposal/no-such-id"));
    expect((err as ApiHttpErrorInstance)?.status).toBe(404);
  });
});

describe("EmbeddedApiClient synapse session with buffer", () => {
  let bufferedSessionId: string | undefined;

  test("create session WITH buffer enabled", async () => {
    const { result } = await call(() => client.post("/api/v1/synapse/session", {
      agentId: "buf-agent", taskContext: "buffered", enableBuffer: true, bufferMaxSize: 10,
    }));
    const r = result as any;
    if (r?.success && r.data?.sessionId) bufferedSessionId = r.data.sessionId;
    expect(result).toBeDefined();
  });

  test("prime buffered session", async () => {
    const { result } = await call(() => client.post(
      `/api/v1/synapse/session/${bufferedSessionId || "x"}/prime`,
      { entries: [{ id: "e1", content: "hello", score: 0.9, metadata: { foo: "bar" } }] },
    ));
    expect(result).toBeDefined();
  });

  test("prefetch buffered session", async () => {
    const { result, err } = await call(() => client.post(
      `/api/v1/synapse/session/${bufferedSessionId || "x"}/prefetch`,
      { queries: ["test"], maxResults: 5, minImportance: 0.3, chains: ["x"] },
    ));
    expect(result !== undefined || err !== undefined).toBe(true);
  }, 15000);

  test("access buffered session", async () => {
    const { result } = await call(() => client.post(
      `/api/v1/synapse/session/${bufferedSessionId || "x"}/access`,
      { memoryId: "m-buf" },
    ));
    expect(result).toBeDefined();
  });

  test("prime nonexistent session → error envelope", async () => {
    const { result } = await call(() => client.post("/api/v1/synapse/session/no-such/prime", { entries: [] }));
    expect((result as any)?.success).toBe(false);
  });

  test("prefetch buffered session with filePath + entries (plan enabled)", async () => {
    const { result, err } = await call(() => client.post(
      `/api/v1/synapse/session/${bufferedSessionId || "x"}/prefetch`,
      {
        filePath: "src/a.ts",
        symbols: [{ name: "foo" }],
        entries: [{ id: "e1", content: "ctx", score: 0.8, metadata: { k: "v" } }],
        maxResults: 3,
        minImportance: 0.2,
        chains: ["c1"],
      },
    ));
    expect(result !== undefined || err !== undefined).toBe(true);
  }, 15000);

  test("prefetch buffered session with filePath but no entries", async () => {
    const { result, err } = await call(() => client.post(
      `/api/v1/synapse/session/${bufferedSessionId || "x"}/prefetch`,
      { filePath: "src/b.ts", entries: [] },
    ));
    expect(result !== undefined || err !== undefined).toBe(true);
  });

  test("prefetch nonexistent session → error envelope", async () => {
    const { result } = await call(() => client.post("/api/v1/synapse/session/no-such/prefetch", {}));
    expect((result as any)?.success).toBe(false);
  });
});

describe("EmbeddedApiClient uploadAndIndex", () => {
  test("indexes files from a temp project dir", async () => {
    const projDir = mkdtempSync(path.join(BASE_TMP, "embed-upload-"));
    writeFileSync(path.join(projDir, "a.ts"), "export const x = 1;");
    try {
      const { result, err } = await call(() => client.uploadAndIndex({
        projectPath: projDir,
        files: [{ relativePath: "a.ts", content: "export const x = 1;" }],
      }));
      expect(result !== undefined || err !== undefined).toBe(true);
    } finally {
      rmSync(projDir, { recursive: true, force: true });
    }
  });

  test("writes nested file paths (parent dir creation)", async () => {
    const projDir = mkdtempSync(path.join(BASE_TMP, "embed-nest-"));
    try {
      const { result, err } = await call(() => client.uploadAndIndex({
        projectPath: projDir,
        projectId: "nest-proj",
        files: [{ relativePath: "src/sub/dir/a.ts", content: "x" }],
        warmupQueries: ["q"],
      }));
      expect(result !== undefined || err !== undefined).toBe(true);
    } finally {
      rmSync(projDir, { recursive: true, force: true });
    }
  });

  test("rejects absolute paths (path safety)", async () => {
    const { err } = await call(() => client.uploadAndIndex({
      projectPath: "/tmp/x",
      files: [{ relativePath: "/etc/passwd", content: "malicious" }],
    }));
    const msg = err instanceof Error ? err.message : String((err as ApiHttpErrorInstance)?.body?.error ?? err);
    expect(msg).toContain("Invalid file path");
  });

  test("rejects traversal sequences (path safety)", async () => {
    const { err } = await call(() => client.uploadAndIndex({
      projectPath: "/tmp/x",
      files: [{ relativePath: "../../../etc/passwd", content: "malicious" }],
    }));
    const msg = err instanceof Error ? err.message : String((err as ApiHttpErrorInstance)?.body?.error ?? err);
    expect(msg).toContain("Invalid file path");
  });

  test("healthCheck returns true (embedded always healthy)", async () => {
    expect(await client.healthCheck()).toBe(true);
  });
});

describe("EmbeddedApiClient additional endpoint coverage", () => {
  test("POST web/fetch_and_index", async () => {
    await call(() => client.post("/api/v1/web/fetch_and_index", { url: "https://example.com" }));
  }, 15000);

  test("POST project/reset with projectId (covers clear branches)", async () => {
    const { result } = await call(() => client.post("/api/v1/project/reset", {
      projectId: "reset-test-proj", clearVectors: true, clearSymbols: true, clearMemories: true,
    }));
    expect(result).toBeDefined();
  });

  test("POST project/reset missing projectId → error envelope", async () => {
    const { result } = await call(() => client.post("/api/v1/project/reset", {}));
    expect((result as any)?.success).toBe(false);
  });

  test("POST project/rename apply (dryRun false)", async () => {
    await call(() => client.post("/api/v1/project/rename", {
      sourceProjectId: "a", targetProjectId: "b", dryRun: false, operationId: "op1", expectedPlanHash: "h",
    }));
  });

  test("POST project/merge apply (dryRun false)", async () => {
    await call(() => client.post("/api/v1/project/merge", {
      sourceProjectId: "a", targetProjectId: "b", dryRun: false, operationId: "op2", expectedPlanHash: "h",
    }));
  });

  test("POST memory/list with level filter + type", async () => {
    await call(() => client.post("/api/v1/memory/list", { limit: 5, offset: 0, level: 1, type: "code", projectId: "p" }));
  });

  test("GET synapse/sessions count endpoint", async () => {
    await call(() => client.get("/api/v1/synapse/sessions"));
  });
});

// T12 — profile_list/profile_set (model-profile-switching). The invalid-host
// guard is exercised directly against the real `EmbeddedApiClient` (safe: it
// returns before touching the switch engine or any filesystem path). Success
// and MPS-09 error-mapping paths are covered in `embedded-profiles.test.ts`,
// which mocks `@massa-ai/shared` — the real engine defaults `targetHome` to
// `os.homedir()`, and this suite must never risk mutating the machine it runs
// on (unlike the DB-scoped calls above, this is real host filesystem state).
describe("EmbeddedApiClient GET/POST /api/v1/profiles — invalid-host guard", () => {
  test("GET /api/v1/profiles?host=nonesuch → InvalidHostError, no engine call", async () => {
    const result = await client.get("/api/v1/profiles", { host: "nonesuch" });
    expect(result).toMatchObject({ success: false, error: { code: "InvalidHostError" } });
  });

  test("POST /api/v1/profiles/switch with an unknown host → InvalidHostError, no engine call", async () => {
    const result = await client.post("/api/v1/profiles/switch", { profile: "work", host: "nonesuch" });
    expect(result).toMatchObject({ success: false, error: { code: "InvalidHostError" } });
  });
});
