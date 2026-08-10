/**
 * Project route coverage for the paths NOT covered by project-reset.test.ts
 * and project-identity.test.ts: GET /list, POST /index, POST /upload-and-index
 * (happy + traversal rejection), the reset error/partial/failure branches,
 * and handleProjectIdentity's non-ProjectIdentityError rethrow.
 */

import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

let uploadDir = "";
const indexHandle = mock((_b?: any): unknown => ({ success: true, data: { jobId: "j1" } }));
const statusHandle = mock((): unknown => ({ success: true, data: { status: "done" } }));
const identityPreview = mock(async () => ({ dryRun: true, planHash: "x" }));
const identityApply = mock(async () => ({ dryRun: false, operationId: "op" }));

const vectorProjects = mock(async (): Promise<any[]> => [{ projectId: "p1", documentCount: 3 }]);
const vectorAllProjects = mock(async (): Promise<any[]> => []);
const vectorDelete = mock(async () => 5);
const keywordDelete = mock(async () => 2);
const cacheInvalidate = mock(async () => 1);
const memoryDelete = mock(async () => 4);
const removeWorkspace = mock(async () => {});
const recordOperation = mock(async () => {});

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    IndexProjectTool: class {
      handle = indexHandle;
    },
    GetIndexStatusTool: class {
      handle = statusHandle;
    },
    ProjectIdentityError: actual.ProjectIdentityError,
    createProjectIdentityService: () => ({ preview: identityPreview, apply: identityApply }),
    getVectorStore: async () => ({
      listProjects: vectorProjects,
      listAllProjectsAcrossDimensions: vectorAllProjects,
      deleteByProject: vectorDelete,
    }),
    getKeywordSearch: () => ({ deleteByProject: keywordDelete }),
    getSearchCache: () => ({ invalidateProject: cacheInvalidate }),
    getMemoryRepository: () => ({ deleteByProject: memoryDelete }),
    workspaceManager: { removeWorkspace },
    getOperationLogRepository: () => ({ recordOperation }),
    UNKNOWN_ACTOR: { actorType: "api_key", actorId: "unknown" },
  };
});

import { Elysia } from "elysia";
import { projectRoutes } from "./project.js";
const app = new Elysia().use(projectRoutes);

async function req(method: string, p: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.handle(new Request(`http://localhost${p}`, init));
  return { status: res.status, json: (await res.json()) as any };
}

// For routes that propagate a thrown error (no try/catch), Elysia returns a
// non-JSON 500 body. Read text so the test can assert the status code.
async function reqRaw(method: string, p: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.handle(new Request(`http://localhost${p}`, init));
  return { status: res.status, text: await res.text() };
}

beforeAll(() => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-upload-"));
  process.env.MASSA_AI_UPLOAD_DIR = uploadDir;
});
afterAll(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe("GET /api/v1/project/list", () => {
  test("returns indexed projects", async () => {
    vectorProjects.mockImplementationOnce(async () => [{ projectId: "a" }, { projectId: "b" }]);
    const res = await req("GET", "/api/v1/project/list");
    expect(res.status).toBe(200);
    expect(res.json.data.total).toBe(2);
  });

  test("falls back to listAllProjectsAcrossDimensions when listProjects throws a dimension-mismatch error (APCR-02.1)", async () => {
    vectorProjects.mockImplementationOnce(async () => {
      throw new Error("Embedding dimension mismatch: got 384, expected 1536");
    });
    vectorAllProjects.mockImplementationOnce(async () => [{ projectId: "fallback-p", documentCount: 5 }]);
    const res = await req("GET", "/api/v1/project/list");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.projects[0].projectId).toBe("fallback-p");
  });

  test("returns failure envelope when both listProjects (dimension mismatch) and the fallback throw", async () => {
    vectorProjects.mockImplementationOnce(async () => {
      throw new Error("Embedding dimension mismatch: got 384, expected 1536");
    });
    vectorAllProjects.mockImplementationOnce(async () => {
      throw new Error("db unreachable");
    });
    const res = await req("GET", "/api/v1/project/list");
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("db unreachable");
  });

  test("a non-dimension error rethrows: success:false carrying its message, fallback never called (APCR-02.2/.3)", async () => {
    vectorAllProjects.mockClear();
    vectorProjects.mockImplementationOnce(async () => {
      throw new Error("store down");
    });
    const res = await req("GET", "/api/v1/project/list");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("store down");
    expect(vectorAllProjects).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/project/index", () => {
  test("delegates to the index tool", async () => {
    indexHandle.mockImplementationOnce(() => ({ success: true, data: { jobId: "jx" } }));
    const res = await req("POST", "/api/v1/project/index", { projectPath: "/repo", projectId: "p" });
    expect(res.json.data.jobId).toBe("jx");
  });
});

describe("POST /api/v1/project/upload-and-index", () => {
  test("writes files to staging and indexes", async () => {
    indexHandle.mockImplementationOnce((b: any) => ({ success: true, data: { projectId: b.projectId } }));
    const res = await req("POST", "/api/v1/project/upload-and-index", {
      projectPath: "/client/repo",
      files: [{ relativePath: "src/a.ts", content: "export const a = 1;" }],
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    const written = path.join(uploadDir, "repo", "src", "a.ts");
    expect(fs.existsSync(written)).toBe(true);
  });

  test("derives projectId from projectPath when omitted", async () => {
    indexHandle.mockImplementationOnce(() => ({ success: true, data: {} }));
    await req("POST", "/api/v1/project/upload-and-index", {
      projectPath: "/client/My-Project_2",
      files: [{ relativePath: "x.ts", content: "x" }],
    });
    expect((indexHandle.mock.calls.at(-1) as any[])?.[0]?.projectId).toBe("My-Project_2");
  });

  test("rejects relativePath traversal", async () => {
    const res = await reqRaw("POST", "/api/v1/project/upload-and-index", {
      projectPath: "/repo",
      files: [{ relativePath: "../escape.ts", content: "x" }],
    });
    expect(res.status).toBe(500);
  });

  test("rejects absolute relativePath", async () => {
    const res = await reqRaw("POST", "/api/v1/project/upload-and-index", {
      projectPath: "/repo",
      files: [{ relativePath: "/etc/passwd", content: "x" }],
    });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v1/project/reset error branches", () => {
  test("clearVectors failure yields a partial result + error message", async () => {
    vectorDelete.mockImplementationOnce(async () => {
      throw new Error("vec boom");
    });
    const res = await req("POST", "/api/v1/project/reset", { projectId: "partial" });
    expect(res.json.success).toBe(false);
    expect(res.json.errors.some((e: string) => e.includes("vectors"))).toBe(true);
    expect(res.json.data.symbolsCleared).toBe(1);
    expect(res.json.data.memoriesDeleted).toBe(4);
  });

  test("clearSymbols failure still reports symbolsCleared:0", async () => {
    removeWorkspace.mockImplementationOnce(async () => {
      throw new Error("no workspace");
    });
    const res = await req("POST", "/api/v1/project/reset", { projectId: "nosym" });
    expect(res.json.success).toBe(true);
    expect(res.json.data.symbolsCleared).toBe(0);
  });

  test("clearMemories failure surfaces in errors", async () => {
    memoryDelete.mockImplementationOnce(async () => {
      throw new Error("mem down");
    });
    const res = await req("POST", "/api/v1/project/reset", { projectId: "memfail" });
    expect(res.json.errors.some((e: string) => e.includes("memories"))).toBe(true);
  });

  test("all three failing => partial outcome (symbols failure does not push)", async () => {
    vectorDelete.mockImplementationOnce(async () => {
      throw new Error("v");
    });
    removeWorkspace.mockImplementationOnce(async () => {
      throw new Error("s");
    });
    memoryDelete.mockImplementationOnce(async () => {
      throw new Error("m");
    });
    const res = await req("POST", "/api/v1/project/reset", { projectId: "allfail" });
    // clearSymbols failure is treated as "workspace may not exist" (no error push),
    // so only vectors + memories surface → 2 errors → partial (failure needs >=3).
    expect(res.json.errors).toHaveLength(2);
    expect((recordOperation.mock.calls.at(-1) as any[])?.[0]?.result).toBe("partial");
  });

  test("one failing => partial outcome in audit", async () => {
    vectorDelete.mockImplementationOnce(async () => {
      throw new Error("v");
    });
    await req("POST", "/api/v1/project/reset", { projectId: "onefail" });
    expect((recordOperation.mock.calls.at(-1) as any[])?.[0]?.result).toBe("partial");
  });
});

/**
 * MBD-06 / MBD-07 — the memories-only scope combination the Memory tab's bulk
 * delete sends. This is the ONLY caller shape that sets all three flags
 * explicitly, and the one the feature's Test Coverage Matrix names; every other
 * case above posts a bare `{projectId}` and takes the full-scope defaults, so
 * the skipped-branch behavior below is otherwise unexercised.
 */
describe("POST /api/v1/project/reset memories-only scope (MBD-06, MBD-07)", () => {
  const MEMORIES_ONLY = {
    clearVectors: false,
    clearSymbols: false,
    clearMemories: true,
  };

  test("leaves vectors, keyword rows and the symbol graph untouched", async () => {
    const vectorsBefore = vectorDelete.mock.calls.length;
    const keywordsBefore = keywordDelete.mock.calls.length;
    const symbolsBefore = removeWorkspace.mock.calls.length;

    const res = await req("POST", "/api/v1/project/reset", {
      projectId: "mem-only",
      ...MEMORIES_ONLY,
    });

    expect(res.json.success).toBe(true);
    // Not merely "unchanged counts" — the skipped `if` blocks must never run.
    expect(vectorDelete.mock.calls.length).toBe(vectorsBefore);
    expect(keywordDelete.mock.calls.length).toBe(keywordsBefore);
    expect(removeWorkspace.mock.calls.length).toBe(symbolsBefore);
    // …and their result keys are absent, not zero — a zero would read as
    // "cleared nothing" instead of "was never in scope".
    expect(res.json.data).not.toHaveProperty("vectorsDeleted");
    expect(res.json.data).not.toHaveProperty("keywordsDeleted");
    expect(res.json.data).not.toHaveProperty("symbolsCleared");
    expect(res.json.data.memoriesDeleted).toBe(4);
  });

  test("writes an operation_log row recording the exact requested scopes", async () => {
    await req("POST", "/api/v1/project/reset", {
      projectId: "mem-only-audit",
      ...MEMORIES_ONLY,
    });

    const row = (recordOperation.mock.calls.at(-1) as any[])?.[0];
    expect(row?.op).toBe("project_reset");
    expect(row?.projectId).toBe("mem-only-audit");
    expect(row?.scope?.requestedScopes).toEqual({
      vectors: false,
      symbols: false,
      memories: true,
    });
    expect(row?.result).toBe("success");
    expect(row?.meta).toEqual({ memoriesDeleted: 4 });
  });

  test("a re-delete finding nothing still succeeds with memoriesDeleted:0", async () => {
    memoryDelete.mockImplementationOnce(async () => 0);

    const res = await req("POST", "/api/v1/project/reset", {
      projectId: "mem-only-again",
      ...MEMORIES_ONLY,
    });

    expect(res.json.success).toBe(true);
    expect(res.json.data.memoriesDeleted).toBe(0);
    expect((recordOperation.mock.calls.at(-1) as any[])?.[0]?.result).toBe("success");
  });
});

describe("POST /api/v1/project/rename non-identity rethrow", () => {
  test("a generic (non ProjectIdentityError) error propagates as 500", async () => {
    identityApply.mockImplementationOnce(async () => {
      throw new Error("unexpected");
    });
    const res = await reqRaw("POST", "/api/v1/project/rename", {
      sourceProjectId: "a",
      targetProjectId: "b",
      dryRun: false,
      operationId: "op",
      expectedPlanHash: "h",
    });
    expect(res.status).toBe(500);
  });
});
