/**
 * T1 — behavioural coverage for the read-only route classification (AC-03.3,
 * AC-03.3a, AC-03.3b).
 *
 * `write-mode.ts` (the gate itself, T2) does not exist yet — Phase 1's own
 * dependency order is T1 → T2 → T3. "No write with read-only mode active" is
 * therefore proven here at the level this file owns: for every one of the ten
 * entries, the route is exercised with the real route-file wiring (only the
 * underlying tool/service classes are mocked at the `@massa-ai/core` package
 * boundary — the same boundary every other `routes/*.test.ts` file in this
 * tree mocks at) and asserted to reach only its read method, never a
 * write-capable sibling. For `/search/project`, the one entry that *does*
 * write, the same boundary is used to prove the sanitizer neutralises the
 * flag before it reaches the tool — established as an equivalent proxy for
 * "does not reach `handleAutoReindex`" via the static trace in
 * `write-mode-classification.ts`'s justification (SearchController passes
 * `autoReindex` straight through with no intermediate branching between the
 * tool boundary and the `handleAutoReindex` call at search-controller.ts:177-179).
 *
 * `/checkpoints/list` is the one exception that runs the REAL production tool
 * (`ListCheckpointsTool` + `CheckpointManager`) end-to-end, mirroring
 * `checkpoints.test.ts`'s own established pattern — `CheckpointManager` is
 * file-backed (a temp `dataDir`), not PostgreSQL, so "no write happened" is
 * proven by diffing the temp directory's contents before and after the call,
 * a strictly stronger proof than a mocked spy.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { Elysia } from "elysia";
import fs from "fs";
import os from "os";
import path from "path";
import {
  READ_ONLY_ROUTES,
  findReadOnlyRoute,
  normalizeRoutePath,
  type ReadOnlyRouteEntry,
} from "./write-mode-classification.js";

// ── Mock boundary: every tool/service the ten routes under test resolve
// through `@massa-ai/core`. `ListCheckpointsTool` / `CheckpointManager` are
// deliberately NOT overridden — see file header.
const searchProjectHandle = mock((_b?: any): unknown => ({ success: true, data: {} }));
const searchCodeHandle = mock((_b?: any): unknown => ({ success: true, data: {} }));
const compressHandle = mock((_b?: any): unknown => ({ success: true, data: {} }));
const optimizedHandle = mock((_b?: any): unknown => ({ success: true, data: {} }));
const memSearchHandle = mock((_b?: any): unknown => ({ success: true, data: { memories: [] } }));
const memRepoSearch = mock(async (): Promise<any[]> => []);
const memRepoCreate = mock(async (): Promise<any> => ({ id: "should-not-be-called" }));
const memRepoUpdate = mock(async (): Promise<any> => ({ id: "should-not-be-called" }));
const memRepoDelete = mock(async (): Promise<any> => true);

const handoffListPending = mock(async (): Promise<any[]> => []);
const handoffBegin = mock(async (): Promise<any> => ({ ok: true, id: "should-not-be-called" }));
const handoffAccept = mock(async (): Promise<any> => ({ ok: true }));
const handoffCancel = mock(async (): Promise<any> => ({ ok: true }));

const proposalListPending = mock(async (): Promise<any[]> => []);
const proposalApprove = mock(async (): Promise<any> => ({ ok: true }));
const proposalReject = mock(async (): Promise<any> => ({ ok: true }));
const proposalRunOnce = mock(async (): Promise<any> => ({}));

const impactAnalyze = mock(async (): Promise<any> => ({ impactedCount: 0 }));
const tracePathSpy = mock(async (): Promise<any> => ({ found: false }));
const wsGetWorkspace = mock(async (projectId: string) => ({
  project_id: projectId,
  project_path: "/tmp/write-mode-classification-fixture",
  display_name: projectId,
  status: "indexed",
}));
const wsRemoveWorkspace = mock(async () => {});
const wsListWorkspaces = mock(async () => [] as any[]);
const getActiveGeneration = mock(async () => "gen-1");
const assertGenerationNotStale = mock(() => {});

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    SearchProjectTool: class {
      handle = searchProjectHandle;
    },
    SearchCodeTool: class {
      handle = searchCodeHandle;
    },
    CompressContextTool: class {
      handle = compressHandle;
    },
    GetOptimizedContextTool: class {
      handle = optimizedHandle;
    },
    SearchMemoriesTool: class {
      handle = memSearchHandle;
    },
    getMemoryRepository: () => ({
      search: memRepoSearch,
      create: memRepoCreate,
      update: memRepoUpdate,
      delete: memRepoDelete,
      deleteByProject: async () => 0,
    }),
    getHandoffService: () => ({
      listPending: handoffListPending,
      begin: handoffBegin,
      accept: handoffAccept,
      cancel: handoffCancel,
    }),
    getAutoImproveJob: () => ({
      listPending: proposalListPending,
      approve: proposalApprove,
      reject: proposalReject,
      runOnce: proposalRunOnce,
    }),
    GraphController: Object.assign(
      class {
        static getInstance() {
          return { analyzeImpact: impactAnalyze, tracePath: tracePathSpy };
        }
      },
      {},
    ),
    workspaceManager: {
      getWorkspace: wsGetWorkspace,
      removeWorkspace: wsRemoveWorkspace,
      listWorkspaces: wsListWorkspaces,
    },
    getActiveGeneration,
    assertGenerationNotStale,
  };
});

// Deliberately NOT falling back to `actual.config.get(key)` for unhandled
// keys — matching handoff.test.ts / proposals.test.ts's own established
// pattern. `undefined` for "handoffs"/"memory" resolves handoffsDisabled() /
// autoImproveDisabled() to `false` (not disabled), so the 423 gate stays out
// of the way without ever touching the real config singleton.
let tmpDataDir = "";
mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    config: {
      get: (key: string) => (key === "dataDir" ? tmpDataDir : undefined),
    },
    logger: { ...actual.logger, error: () => {}, warn: () => {}, info: () => {} },
  };
});

import { searchRoutes } from "../routes/search.js";
import { memoryRoutes } from "../routes/memory.js";
import { checkpointRoutes } from "../routes/checkpoints.js";
import { handoffRoutes } from "../routes/handoff.js";
import { proposalRoutes } from "../routes/proposals.js";
import { contextRoutes } from "../routes/context.js";
import { workspaceRoutes } from "../routes/workspace.js";

const app = new Elysia()
  .use(searchRoutes)
  .use(memoryRoutes)
  .use(checkpointRoutes)
  .use(handoffRoutes)
  .use(proposalRoutes)
  .use(contextRoutes)
  .use(workspaceRoutes);

async function post(p: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${p}`, {
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

function entry(routePath: string): ReadOnlyRouteEntry {
  const found = READ_ONLY_ROUTES.find((e) => e.path === routePath);
  if (!found) throw new Error(`fixture bug: no classification entry for ${routePath}`);
  return found;
}

beforeAll(() => {
  tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-write-mode-classification-"));
});
afterAll(() => {
  fs.rmSync(tmpDataDir, { recursive: true, force: true });
});

// ── Structural assertions over the table itself ─────────────────────────

describe("READ_ONLY_ROUTES — structural contract", () => {
  test("has exactly ten entries (AC-03.3)", () => {
    expect(READ_ONLY_ROUTES.length).toBe(10);
  });

  test("every entry is POST, has a unique path, and a source-traced justification", () => {
    const seen = new Set<string>();
    for (const e of READ_ONLY_ROUTES) {
      expect(e.method).toBe("POST");
      expect(seen.has(e.path)).toBe(false);
      seen.add(e.path);
      expect(e.path.startsWith("/api/v1/")).toBe(true);
      // A trace, not a rationale: at least one `<segment>.ts:<line(s)>` citation.
      expect(e.justification).toMatch(/\.ts:\d/);
      expect(e.justification.length).toBeGreaterThan(80);
    }
  });

  test("covers exactly the ten paths named in AC-03.3", () => {
    const paths = READ_ONLY_ROUTES.map((e) => e.path).sort();
    expect(paths).toEqual(
      [
        "/api/v1/checkpoints/list",
        "/api/v1/context/compress",
        "/api/v1/context/optimized",
        "/api/v1/handoff/list",
        "/api/v1/memory/list",
        "/api/v1/memory/search",
        "/api/v1/proposal/list",
        "/api/v1/search/code",
        "/api/v1/search/project",
        "/api/v1/symbol/impact",
      ].sort(),
    );
  });

  test("only /search/project declares a sanitizer", () => {
    const withSanitizer = READ_ONLY_ROUTES.filter((e) => typeof e.sanitizeBody === "function");
    expect(withSanitizer.map((e) => e.path)).toEqual(["/api/v1/search/project"]);
  });
});

describe("normalizeRoutePath / findReadOnlyRoute (AC-03.9)", () => {
  test("collapses exactly one trailing slash", () => {
    expect(normalizeRoutePath("/api/v1/handoff/list/")).toBe("/api/v1/handoff/list");
    expect(normalizeRoutePath("/api/v1/handoff/list")).toBe("/api/v1/handoff/list");
    expect(normalizeRoutePath("/")).toBe("/");
  });

  test("finds a classified route with or without the trailing slash", () => {
    expect(findReadOnlyRoute("POST", "/api/v1/handoff/list")).toBeDefined();
    expect(findReadOnlyRoute("POST", "/api/v1/handoff/list/")).toBeDefined();
    expect(findReadOnlyRoute("post", "/api/v1/handoff/list")).toBeDefined();
  });

  test("returns undefined for an unclassified path", () => {
    expect(findReadOnlyRoute("POST", "/api/v1/executor/execute")).toBeUndefined();
  });
});

// ── /search/project — the one entry that writes, and its sanitizer ──────

describe("POST /api/v1/search/project — sanitizer proof (AC-03.3a, AC-03.3b)", () => {
  test("sanitizeBody mutates autoReindex to false in place", () => {
    const body: Record<string, unknown> = { query: "q", projectId: "p", autoReindex: true };
    entry("/api/v1/search/project").sanitizeBody!(body);
    expect(body.autoReindex).toBe(false);
  });

  test("unsanitized: autoReindex:true reaches the tool boundary unchanged — proves the route DOES write absent the sanitizer", async () => {
    searchProjectHandle.mockClear();
    await post("/api/v1/search/project", {
      query: "q",
      projectId: "p",
      projectPath: "/tmp/x",
      autoReindex: true,
    });
    expect(searchProjectHandle).toHaveBeenCalledTimes(1);
    const received = (searchProjectHandle.mock.calls[0] as any[])[0];
    // Per the justification's trace, SearchController.searchProject passes this
    // flag straight into `if (autoReindex && projectPath) this.handleAutoReindex(...)`
    // with no branching in between — reaching the tool with autoReindex:true is
    // therefore equivalent to reaching handleAutoReindex.
    expect(received.autoReindex).toBe(true);
  });

  test("sanitized: applying the classification's sanitizer neutralises autoReindex before the tool sees it", async () => {
    searchProjectHandle.mockClear();
    const body: Record<string, unknown> = {
      query: "q",
      projectId: "p",
      projectPath: "/tmp/x",
      autoReindex: true,
    };
    entry("/api/v1/search/project").sanitizeBody!(body);
    await post("/api/v1/search/project", body);
    expect(searchProjectHandle).toHaveBeenCalledTimes(1);
    const received = (searchProjectHandle.mock.calls[0] as any[])[0];
    expect(received.autoReindex).toBe(false);
  });
});

// ── /search/code — no autoReindex field exists on this route to flip ────

describe("POST /api/v1/search/code — no write-triggering body flag exists (AC-03.3b)", () => {
  test("an attempted autoReindex flag never reaches the tool as true", async () => {
    searchCodeHandle.mockClear();
    await post("/api/v1/search/code", {
      query: "fn",
      projectId: "p",
      limit: 5,
      autoReindex: true, // not in this route's schema — must not survive decoding as true
    });
    expect(searchCodeHandle).toHaveBeenCalledTimes(1);
    const received = (searchCodeHandle.mock.calls[0] as any[])[0];
    expect(received?.autoReindex).not.toBe(true);
  });
});

// ── /memory/search, /memory/list — never reach a repository write method ─

describe("POST /api/v1/memory/search — no write across every schema-exposed flag (AC-03.3b)", () => {
  test.each([
    {},
    { includeRelated: true },
    { includePersistent: false },
    { types: ["code", "decision"] },
    { minImportance: 0.9, limit: 50 },
  ])("body variant %p never calls a memory-repository write method", async (extra) => {
    memRepoCreate.mockClear();
    memRepoUpdate.mockClear();
    memRepoDelete.mockClear();
    const res = await post("/api/v1/memory/search", { query: "q", ...extra });
    expect(res.status).toBe(200);
    expect(memRepoCreate).not.toHaveBeenCalled();
    expect(memRepoUpdate).not.toHaveBeenCalled();
    expect(memRepoDelete).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/memory/list — never reaches a repository write method (AC-03.3b)", () => {
  test.each([
    {},
    { type: "code" },
    { level: 2 },
    { projectId: "p", userId: "u", sessionId: "s", agentId: "a" },
    { offset: 10, limit: 5 },
  ])("body variant %p only calls repo.search, never create/update/delete", async (extra) => {
    memRepoSearch.mockClear();
    memRepoCreate.mockClear();
    memRepoUpdate.mockClear();
    memRepoDelete.mockClear();
    const res = await post("/api/v1/memory/list", extra);
    expect(res.status).toBe(200);
    expect(memRepoSearch).toHaveBeenCalledTimes(1);
    expect(memRepoCreate).not.toHaveBeenCalled();
    expect(memRepoUpdate).not.toHaveBeenCalled();
    expect(memRepoDelete).not.toHaveBeenCalled();
  });
});

// ── /checkpoints/list — real production tool, proven by a filesystem diff ─

describe("POST /api/v1/checkpoints/list — real tool, no filesystem write (AC-03.3b)", () => {
  function snapshotDataDir(): string[] {
    if (!fs.existsSync(tmpDataDir)) return [];
    return fs.readdirSync(tmpDataDir, { recursive: true } as any).map(String).sort();
  }

  test("directory contents are identical before and after, across every schema-exposed filter", async () => {
    // Warm-up call absorbs any lazy first-touch initialization so it is not
    // mistaken for a write caused by list's own semantics.
    await post("/api/v1/checkpoints/list", { format: "json" });
    const before = snapshotDataDir();

    const variants = [
      { format: "json" },
      { taskId: "t1", format: "json" },
      { projectId: "p1", format: "json" },
      { checkpointType: "manual", format: "json" },
      { includeExpired: true, limit: 5, format: "json" },
    ];
    for (const body of variants) {
      const res = await post("/api/v1/checkpoints/list", body);
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
    }

    const after = snapshotDataDir();
    expect(after).toEqual(before);
  });
});

// ── /handoff/list, /proposal/list — list-only, write siblings never called

describe("POST /api/v1/handoff/list — never calls begin/accept/cancel (AC-03.3b)", () => {
  test.each([{ projectId: "p" }, { projectId: "p", targetAgent: "orchestrator" }])(
    "body variant %p only calls listPending",
    async (body) => {
      handoffListPending.mockClear();
      handoffBegin.mockClear();
      handoffAccept.mockClear();
      handoffCancel.mockClear();
      const res = await post("/api/v1/handoff/list", body);
      expect(res.status).toBe(200);
      expect(handoffListPending).toHaveBeenCalledTimes(1);
      expect(handoffBegin).not.toHaveBeenCalled();
      expect(handoffAccept).not.toHaveBeenCalled();
      expect(handoffCancel).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/v1/proposal/list — never calls approve/reject/runOnce (AC-03.3b)", () => {
  test("only calls listPending", async () => {
    proposalListPending.mockClear();
    proposalApprove.mockClear();
    proposalReject.mockClear();
    proposalRunOnce.mockClear();
    const res = await post("/api/v1/proposal/list", { projectId: "p" });
    expect(res.status).toBe(200);
    expect(proposalListPending).toHaveBeenCalledTimes(1);
    expect(proposalApprove).not.toHaveBeenCalled();
    expect(proposalReject).not.toHaveBeenCalled();
    expect(proposalRunOnce).not.toHaveBeenCalled();
  });
});

// ── /context/compress, /context/optimized — pure transforms ─────────────

describe("POST /api/v1/context/compress — delegates to a pure in-memory transform (AC-03.3b)", () => {
  test.each([
    { content: "x" },
    { content: "x", strategy: "semantic_dedup" },
    { content: "x", targetRatio: 0.9, language: "typescript" },
  ])("body variant %p delegates without error", async (body) => {
    compressHandle.mockClear();
    const res = await post("/api/v1/context/compress", body);
    expect(res.status).toBe(200);
    expect(compressHandle).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/v1/context/optimized — autoReindex is not a field this route can set (AC-03.3b)", () => {
  test("an attempted autoReindex flag never reaches the tool as true", async () => {
    optimizedHandle.mockClear();
    await post("/api/v1/context/optimized", {
      query: "q",
      projectId: "p",
      projectPath: "/tmp/x",
      autoReindex: true, // not in this route's schema
    });
    expect(optimizedHandle).toHaveBeenCalledTimes(1);
    const received = (optimizedHandle.mock.calls[0] as any[])[0];
    expect(received?.autoReindex).not.toBe(true);
  });
});

// ── /symbol/impact — read-only git, proven by the analyze-only surface ──

describe("POST /api/v1/symbol/impact — no workspace mutation across every schema-exposed flag (AC-03.3b)", () => {
  test.each([
    { scope: "unstaged" },
    { scope: "staged" },
    { scope: "committed", base_branch: "main" },
    { scope: "committed", since: "1 week ago" },
    { depth: 3, paths: ["src/a.ts"] },
  ])("body variant %p only calls analyzeImpact, never removeWorkspace", async (extra) => {
    impactAnalyze.mockClear();
    wsRemoveWorkspace.mockClear();
    const res = await post("/api/v1/symbol/impact", {
      projectId: "p1",
      projectPath: "/tmp/write-mode-classification-fixture",
      ...extra,
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(impactAnalyze).toHaveBeenCalledTimes(1);
    expect(wsRemoveWorkspace).not.toHaveBeenCalled();
  });
});
