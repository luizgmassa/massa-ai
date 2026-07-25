/**
 * Workspace route coverage. All 12 endpoints (workspace CRUD, symbol graph,
 * trace, impact, map, centrality, snippet) with happy + validation + stale +
 * error/edge paths. The core services are stubbed so no DB/disk beyond a tmp
 * snippet fixture is required.
 */

import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

let snippetDir = "";
const wsList = mock(async () => [] as any[]);
const wsGet = mock(async () => null as any);
const wsRemove = mock(async () => {});
const listDefinitions = mock(async (): Promise<any> => ({ definitions: [], total: 0, total_exact: true }));
const lookupDefinition = mock(async () => ({ status: "resolved" } as any));
const getReferences = mock(async () => [] as any[]);
const goToDefinition = mock(async () => [] as any[]);
const getProjectMap = mock(async () => null as any);
const getTopCentralFiles = mock(async () => [] as any[]);
const tracePath = mock(async () => ({ found: false, symbol: "s", projectId: "p", hint: "h" } as any));
const analyzeImpact = mock(async () => ({ impactedCount: 0 } as any));
const indexHandle = mock((): unknown => ({ success: true, data: { jobId: "j" } }));
const getActiveGeneration = mock(async () => "gen-1");
const assertGenerationNotStale = mock((ifNoneMatch?: string, active?: string) => {
  if (ifNoneMatch && ifNoneMatch !== active) throw new Error("stale generation");
});

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    IndexProjectTool: class {
      handle = indexHandle;
    },
    GraphController: Object.assign(
      class {
        static getInstance() {
          return { tracePath, analyzeImpact };
        }
      },
      {},
    ),
    symbolGraphService: {
      listDefinitions,
      lookupDefinition,
      getReferences,
      goToDefinition,
      getProjectMap,
      getTopCentralFiles,
    },
    toSymbolIdentityResolution: (lookup: any) => lookup,
    workspaceManager: {
      listWorkspaces: wsList,
      getWorkspace: wsGet,
      removeWorkspace: wsRemove,
    },
    getActiveGeneration,
    assertGenerationNotStale,
  };
});

import { Elysia } from "elysia";
import { workspaceRoutes } from "./workspace.js";
const app = new Elysia().use(workspaceRoutes);

async function get(p: string, headers: Record<string, string> = {}) {
  const res = await app.handle(new Request(`http://localhost${p}`, { headers }));
  return { status: res.status, json: (await res.json()) as any };
}
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

beforeAll(() => {
  snippetDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-ws-"));
  fs.writeFileSync(path.join(snippetDir, "src.ts"), "a\nb\nc\nd\ne\n");
});
afterAll(() => fs.rmSync(snippetDir, { recursive: true, force: true }));

function wsRow(over: any = {}): any {
  return {
    project_id: "p1",
    project_path: snippetDir,
    display_name: "P1",
    status: "indexed",
    last_indexed_at: 1000,
    last_error: null,
    files_count: 3,
    chunks_count: 9,
    symbols_count: 12,
    ...over,
  };
}

describe("GET /api/v1/workspace/list", () => {
  test("maps each workspace row", async () => {
    wsList.mockImplementationOnce(async () => [wsRow({ project_id: "a" }), wsRow({ project_id: "b", last_indexed_at: null })]);
    const res = await get("/api/v1/workspace/list");
    expect(res.status).toBe(200);
    expect(res.json.data.total).toBe(2);
    expect(res.json.data.workspaces[0]).toMatchObject({ projectId: "a", filesCount: 3 });
    expect(res.json.data.workspaces[1].lastIndexedAt).toBeNull();
  });

  test("returns failure envelope on error", async () => {
    wsList.mockImplementationOnce(async () => {
      throw new Error("db");
    });
    const res = await get("/api/v1/workspace/list");
    expect(res.json.success).toBe(false);
  });
});

describe("GET /api/v1/workspace/:id", () => {
  test("returns the workspace when found", async () => {
    wsGet.mockImplementationOnce(async () => wsRow());
    const res = await get("/api/v1/workspace/p1");
    expect(res.json.success).toBe(true);
  });

  test("not found when missing", async () => {
    wsGet.mockImplementationOnce(async () => null);
    const res = await get("/api/v1/workspace/ghost");
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("not found");
  });

  test("error envelope on throw", async () => {
    wsGet.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await get("/api/v1/workspace/p1");
    expect(res.json.error).toBe("x");
  });
});

describe("workspace delete + reindex (direct)", () => {
  test("DELETE removes the workspace", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/workspace/p1", { method: "DELETE" }));
    expect(((await res.json()) as any).success).toBe(true);
  });

  test("DELETE error envelope on throw", async () => {
    wsRemove.mockImplementationOnce(async () => {
      throw new Error("nope");
    });
    const res = await app.handle(new Request("http://localhost/api/v1/workspace/p1", { method: "DELETE" }));
    expect(((await res.json()) as any).error).toBe("nope");
  });

  test("POST /workspace/:id/reindex delegates to the index tool", async () => {
    indexHandle.mockImplementationOnce(() => ({ success: true, data: { reindexed: true } }));
    const res = await post("/api/v1/workspace/p1/reindex", { projectPath: "/repo" });
    expect(res.json.data.reindexed).toBe(true);
    expect((indexHandle.mock.calls.at(-1) as any[])?.[0]).toMatchObject({ projectId: "p1", forceReindex: true });
  });

  test("reindex error envelope on throw", async () => {
    indexHandle.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const res = await post("/api/v1/workspace/p1/reindex", { projectPath: "/repo" });
    expect(res.json.success).toBe(false);
  });
});

describe("GET /api/v1/symbol/definitions", () => {
  test("requires projectId", async () => {
    const res = await get("/api/v1/symbol/definitions");
    expect(res.json.error).toBe("projectId is required");
  });

  test("returns definitions with paging + generation id", async () => {
    listDefinitions.mockImplementationOnce(async () => ({ definitions: [{ id: 1 }], total: 5, total_exact: true }));
    const res = await get("/api/v1/symbol/definitions?projectId=p1&limit=10&exportedOnly=true&kind=method&search=foo&file=a.ts");
    expect(res.json.data.definitions_total).toBe(5);
    expect(res.json.data.definitions_shown).toBe(1);
    expect(res.json.data.activatedGraphGenerationId).toBe("gen-1");
  });

  test("412 on stale generation (header If-None-Match)", async () => {
    const res = await get("/api/v1/symbol/definitions?projectId=p1", { "if-none-match": "gen-old" });
    expect(res.json.statusCode).toBe(412);
  });

  test("412 on stale generation (query ifNoneMatch)", async () => {
    const res = await get("/api/v1/symbol/definitions?projectId=p1&ifNoneMatch=gen-old");
    expect(res.json.statusCode).toBe(412);
  });

  test("error envelope on service throw", async () => {
    listDefinitions.mockImplementationOnce(async () => {
      throw new Error("svc");
    });
    const res = await get("/api/v1/symbol/definitions?projectId=p1");
    expect(res.json.error).toBe("svc");
  });
});

describe("GET /api/v1/symbol/references", () => {
  test("requires projectId + symbolName", async () => {
    expect((await get("/api/v1/symbol/references")).json.error).toBe("projectId is required");
    expect((await get("/api/v1/symbol/references?projectId=p1")).json.error).toBe("symbolName is required");
  });

  test("ambiguous identity short-circuits with empty references", async () => {
    lookupDefinition.mockImplementationOnce(async () => ({ status: "ambiguous", candidates: [] }));
    const res = await get("/api/v1/symbol/references?projectId=p1&symbolName=run&fqn=src/x#run");
    expect(res.json.success).toBe(true);
    expect(res.json.data.references).toEqual([]);
  });

  test("missing identity short-circuits", async () => {
    lookupDefinition.mockImplementationOnce(async () => ({ status: "missing", query: "q" }));
    const res = await get("/api/v1/symbol/references?projectId=p1&symbolName=run&fqn=src/x#run");
    expect(res.json.data.references).toEqual([]);
  });

  test("returns references with paging", async () => {
    lookupDefinition.mockImplementationOnce(async () => ({ status: "resolved", fqn: "f" }));
    getReferences.mockImplementationOnce(async () => [{ fromFile: "a" }, { fromFile: "b" }, { fromFile: "c" }]);
    const res = await get("/api/v1/symbol/references?projectId=p1&symbolName=run&fqn=f&limit=2");
    expect(res.json.data.total).toBe(3);
    expect(res.json.data.shown).toBe(2);
    expect(res.json.data.omitted).toBe(1);
  });

  test("412 stale", async () => {
    const res = await get("/api/v1/symbol/references?projectId=p1&symbolName=run&ifNoneMatch=old");
    expect(res.json.statusCode).toBe(412);
  });
});

describe("GET /api/v1/symbol/definition", () => {
  test("requires projectId + symbolName", async () => {
    expect((await get("/api/v1/symbol/definition")).json.error).toBe("projectId is required");
    expect((await get("/api/v1/symbol/definition?projectId=p1")).json.error).toBe("symbolName is required");
  });

  test("ambiguous identity returns empty definitions", async () => {
    lookupDefinition.mockImplementationOnce(async () => ({ status: "ambiguous" }));
    const res = await get("/api/v1/symbol/definition?projectId=p1&symbolName=run");
    expect(res.json.data.found).toBe(false);
    expect(res.json.data.definitions).toEqual([]);
  });

  test("resolved returns definitions", async () => {
    lookupDefinition.mockImplementationOnce(async () => ({ status: "resolved" }));
    goToDefinition.mockImplementationOnce(async () => [{ fqn: "f" }]);
    const res = await get("/api/v1/symbol/definition?projectId=p1&symbolName=run&fromFile=a.ts");
    expect(res.json.data.found).toBe(true);
  });
});

describe("GET /api/v1/symbol/trace", () => {
  test("requires projectId", async () => {
    const res = await get("/api/v1/symbol/trace");
    expect(res.json.error).toBe("projectId is required");
  });

  test("requires a seed (function_name/symbol/qualifiedName)", async () => {
    const res = await get("/api/v1/symbol/trace?projectId=p1");
    expect(res.json.error).toContain("function_name");
  });

  test("412 stale", async () => {
    const res = await get("/api/v1/symbol/trace?projectId=p1&function_name=run&ifNoneMatch=old");
    expect(res.json.statusCode).toBe(412);
  });

  test("found result returns the graph", async () => {
    tracePath.mockImplementationOnce(async () => ({ found: true, result: { nodeCount: 4, chains: [] } }));
    const res = await get("/api/v1/symbol/trace?projectId=p1&symbol=run&depth=2&direction=both&mode=all&include_tests=true&edge_types=call,data_flow,unknown");
    expect(res.json.success).toBe(true);
    expect(res.json.data.nodeCount).toBe(4);
    expect(res.json.data.activatedGraphGenerationId).toBe("gen-1");
  });

  test("ambiguous not-found returns success:false-found:false with identity", async () => {
    tracePath.mockImplementationOnce(async () => ({ found: false, symbol: "s", projectId: "p1", identityResolution: { status: "ambiguous", candidates: [] }, hint: "h" }));
    const res = await get("/api/v1/symbol/trace?projectId=p1&symbol=run");
    expect(res.json.success).toBe(true);
    expect(res.json.data.found).toBe(false);
    expect(res.json.data.identity.status).toBe("ambiguous");
  });

  test("plain not-found returns failure envelope", async () => {
    tracePath.mockImplementationOnce(async () => ({ found: false, symbol: "s", projectId: "p1", hint: "h" }));
    const res = await get("/api/v1/symbol/trace?projectId=p1&symbol=run");
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("not found");
    expect(res.json.data.hint).toBe("h");
  });

  test("error envelope on throw", async () => {
    tracePath.mockImplementationOnce(async () => {
      throw new Error("graph");
    });
    const res = await get("/api/v1/symbol/trace?projectId=p1&symbol=run");
    expect(res.json.error).toBe("graph");
  });
});

describe("POST /api/v1/symbol/impact", () => {
  test("requires projectId + projectPath", async () => {
    // Empty strings pass the t.String() schema but hit the handler checks.
    expect((await post("/api/v1/symbol/impact", { projectId: "", projectPath: "/x" })).json.error).toBe("projectId is required");
    expect((await post("/api/v1/symbol/impact", { projectId: "p1", projectPath: "" })).json.error).toContain("projectPath is required");
  });

  test("412 stale (body ifNoneMatch)", async () => {
    const res = await post("/api/v1/symbol/impact", { projectId: "p1", projectPath: "/x", ifNoneMatch: "old" });
    expect(res.json.statusCode).toBe(412);
  });

  test("workspace not found", async () => {
    wsGet.mockImplementationOnce(async () => null);
    const res = await post("/api/v1/symbol/impact", { projectId: "p1", projectPath: "/x" });
    expect(res.json.error).toContain("not found");
  });

  test("rejects projectPath outside the registered workspace root", async () => {
    wsGet.mockImplementationOnce(async () => wsRow({ project_path: snippetDir }));
    const res = await post("/api/v1/symbol/impact", { projectId: "p1", projectPath: path.join(os.tmpdir(), "elsewhere") });
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("outside the registered workspace");
  });

  test("happy path returns impacted result + generation id", async () => {
    wsGet.mockImplementationOnce(async () => wsRow({ project_path: snippetDir }));
    analyzeImpact.mockImplementationOnce(async () => ({ impactedCount: 7 }));
    const res = await post("/api/v1/symbol/impact", { projectId: "p1", projectPath: snippetDir, scope: "staged", depth: 3 });
    expect(res.json.success).toBe(true);
    expect(res.json.data.impactedCount).toBe(7);
    expect(res.json.data.activatedGraphGenerationId).toBe("gen-1");
  });

  test("error envelope on throw", async () => {
    wsGet.mockImplementationOnce(async () => wsRow({ project_path: snippetDir }));
    analyzeImpact.mockImplementationOnce(async () => {
      throw new Error("fail");
    });
    const res = await post("/api/v1/symbol/impact", { projectId: "p1", projectPath: snippetDir });
    expect(res.json.error).toBe("fail");
  });
});

describe("GET /api/v1/workspace/:id/map", () => {
  test("not found when map is null", async () => {
    getProjectMap.mockImplementationOnce(async () => null);
    const res = await get("/api/v1/workspace/p1/map");
    expect(res.json.success).toBe(false);
  });

  test("returns the map", async () => {
    getProjectMap.mockImplementationOnce(async () => ({ projectId: "p1", stats: { files: 1 } }));
    const res = await get("/api/v1/workspace/p1/map?centralityLimit=10&recentLimit=5");
    expect(res.json.success).toBe(true);
    expect(res.json.data.projectId).toBe("p1");
  });

  test("error envelope on throw", async () => {
    getProjectMap.mockImplementationOnce(async () => {
      throw new Error("map");
    });
    const res = await get("/api/v1/workspace/p1/map");
    expect(res.json.error).toBe("map");
  });
});

describe("GET /api/v1/symbol/centrality/:projectId", () => {
  test("returns top central files", async () => {
    getTopCentralFiles.mockImplementationOnce(async () => [{ file: "a.ts", score: 0.9 }]);
    const res = await get("/api/v1/symbol/centrality/p1?limit=5");
    expect(res.json.success).toBe(true);
    expect(res.json.data.files[0].file).toBe("a.ts");
  });

  test("error envelope on throw", async () => {
    getTopCentralFiles.mockImplementationOnce(async () => {
      throw new Error("x");
    });
    const res = await get("/api/v1/symbol/centrality/p1");
    expect(res.json.error).toBe("x");
  });
});

describe("GET /api/v1/symbol/snippet", () => {
  test("requires projectId + file", async () => {
    expect((await get("/api/v1/symbol/snippet")).json.error).toBe("projectId is required");
    expect((await get("/api/v1/symbol/snippet?projectId=p1")).json.error).toBe("file is required");
  });

  test("workspace not found", async () => {
    wsGet.mockImplementationOnce(async () => null);
    const res = await get("/api/v1/symbol/snippet?projectId=p1&file=src.ts");
    expect(res.json.error).toContain("not found");
  });

  test("returns lines for the requested range", async () => {
    wsGet.mockImplementationOnce(async () => wsRow({ project_path: snippetDir }));
    const res = await get("/api/v1/symbol/snippet?projectId=p1&file=src.ts&lineStart=1&lineEnd=3");
    expect(res.json.success).toBe(true);
    expect(res.json.data.startLine).toBe(1);
    expect(res.json.data.endLine).toBe(3);
    expect(res.json.data.lines).toHaveLength(3);
    expect(res.json.data.source_clipped).toBe(false);
  });

  test("clamps oversized range and sets source_clipped", async () => {
    wsGet.mockImplementationOnce(async () => wsRow({ project_path: snippetDir }));
    process.env.MASSA_AI_READ_FILE_MAX_LINES = "2";
    try {
      const res = await get("/api/v1/symbol/snippet?projectId=p1&file=src.ts&lineStart=1&lineEnd=50");
      expect(res.json.data.source_clipped).toBe(true);
      expect(res.json.data.endLine).toBe(2);
    } finally {
      delete process.env.MASSA_AI_READ_FILE_MAX_LINES;
    }
  });

  test("default 20-line window when lineEnd omitted", async () => {
    wsGet.mockImplementationOnce(async () => wsRow({ project_path: snippetDir }));
    const res = await get("/api/v1/symbol/snippet?projectId=p1&file=src.ts&lineStart=1");
    expect(res.json.data.lines.length).toBeLessThanOrEqual(20);
  });

  test("error envelope when read fails", async () => {
    wsGet.mockImplementationOnce(async () => wsRow({ project_path: "/no/such/dir" }));
    const res = await get("/api/v1/symbol/snippet?projectId=p1&file=missing.ts");
    expect(res.json.success).toBe(false);
  });
});
