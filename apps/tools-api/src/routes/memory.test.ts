/**
 * Memory route coverage. /store /search /update /delete delegate to tools;
 * /list uses getMemoryRepository + formatRow (tags JSON parse branches).
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const storeHandle = mock((): unknown => ({ success: true, data: { id: "m1" } }));
const searchHandle = mock((): unknown => ({ success: true, data: { memories: [] } }));
const updateHandle = mock((): unknown => ({ success: true, data: { id: "m1" } }));
const deleteHandle = mock((): unknown => ({ success: true, data: { id: "m1" } }));

const repoSearch = mock(async (): Promise<any[]> => []);

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    StoreMemoryTool: class {
      handle = storeHandle;
    },
    SearchMemoriesTool: class {
      handle = searchHandle;
    },
    UpdateMemoryTool: class {
      handle = updateHandle;
    },
    DeleteMemoryTool: class {
      handle = deleteHandle;
    },
    getMemoryRepository: () => ({
      search: repoSearch,
      deleteByProject: async () => 0,
    }),
  };
});

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return { ...actual, logger: { ...actual.logger, error: () => {} } };
});

import { memoryRoutes } from "./memory.js";
const app = new Elysia().use(memoryRoutes);

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

describe("POST /api/v1/memory/store", () => {
  test("delegates to the store tool", async () => {
    storeHandle.mockImplementationOnce(() => ({ success: true, data: { id: "x" } }));
    const res = await post("/api/v1/memory/store", { content: "c", type: "code" });
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe("x");
  });

  test("returns an unavailable envelope when the tool throws", async () => {
    storeHandle.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const res = await post("/api/v1/memory/store", { content: "c", type: "code" });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("Memory service unavailable");
  });
});

describe("POST /api/v1/memory/search", () => {
  test("delegates to the search tool", async () => {
    searchHandle.mockImplementationOnce(() => ({ success: true, data: { n: 1 } }));
    const res = await post("/api/v1/memory/search", { query: "q" });
    expect(res.json.data.n).toBe(1);
  });

  test("returns unavailable envelope on throw", async () => {
    searchHandle.mockImplementationOnce(() => {
      throw new Error("nope");
    });
    const res = await post("/api/v1/memory/search", { query: "q" });
    expect(res.json.success).toBe(false);
  });
});

describe("POST /api/v1/memory/update", () => {
  test("delegates to the update tool", async () => {
    updateHandle.mockImplementationOnce(() => ({ success: true, data: { id: "m" } }));
    const res = await post("/api/v1/memory/update", { id: "m", importance: 0.9 });
    expect(res.json.data.id).toBe("m");
  });

  test("returns unavailable envelope on throw", async () => {
    updateHandle.mockImplementationOnce(() => {
      throw new Error("x");
    });
    const res = await post("/api/v1/memory/update", { id: "m" });
    expect(res.json.success).toBe(false);
  });
});

describe("POST /api/v1/memory/delete", () => {
  test("delegates to the delete tool", async () => {
    deleteHandle.mockImplementationOnce(() => ({ success: true, data: { id: "d" } }));
    const res = await post("/api/v1/memory/delete", { id: "d" });
    expect(res.json.data.id).toBe("d");
  });

  test("returns unavailable envelope on throw", async () => {
    deleteHandle.mockImplementationOnce(() => {
      throw new Error("x");
    });
    const res = await post("/api/v1/memory/delete", { id: "d" });
    expect(res.json.success).toBe(false);
  });
});

describe("POST /api/v1/memory/list", () => {
  test("maps rows with valid + invalid + null tags and paginates", async () => {
    const rows: any[] = [
      {
        id: "1",
        content: "a",
        type: "code",
        level: 1,
        agent_id: "ag",
        importance: 0.5,
        tags: JSON.stringify(["x", "y"]),
        created_at: new Date("2026-01-01").getTime(),
        access_count: 3,
      },
      {
        id: "2",
        content: "b",
        type: "decision",
        level: 2,
        agent_id: null,
        importance: 0.2,
        tags: "{bad json",
        created_at: new Date("2026-01-02").getTime(),
        access_count: 0,
      },
      {
        id: "3",
        content: "c",
        type: "pattern",
        level: 2,
        agent_id: "ag2",
        importance: 0.8,
        tags: null,
        created_at: new Date("2026-01-03").getTime(),
        access_count: 1,
      },
    ];
    repoSearch.mockImplementationOnce(async () => rows);
    const res = await post("/api/v1/memory/list", { limit: 2, offset: 1 });
    expect(res.status).toBe(200);
    expect(res.json.data.total).toBe(3);
    expect(res.json.data.limit).toBe(2);
    expect(res.json.data.offset).toBe(1);
    expect(res.json.data.memories).toHaveLength(2);
    expect(res.json.data.memories[0].id).toBe("2");
    // invalid JSON tags -> []; null tags -> []
    expect(res.json.data.memories[0].tags).toEqual([]);
    // score proxy equals importance
    expect(res.json.data.memories[0].score).toBe(0.2);
  });

  test("filters by level when provided", async () => {
    const rows: any[] = [
      { id: "1", content: "a", type: "code", level: 1, agent_id: "a", importance: 0.1, tags: null, created_at: 1, access_count: 0 },
      { id: "2", content: "b", type: "code", level: 2, agent_id: "a", importance: 0.1, tags: null, created_at: 1, access_count: 0 },
    ];
    repoSearch.mockImplementationOnce(async () => rows);
    const res = await post("/api/v1/memory/list", { level: 2 });
    expect(res.json.data.total).toBe(1);
    expect(res.json.data.memories[0].id).toBe("2");
  });

  test("passes type/minImportance/scopes into repo search", async () => {
    repoSearch.mockImplementationOnce(async () => []);
    await post("/api/v1/memory/list", {
      type: "decision",
      minImportance: 0.4,
      projectId: "p",
      userId: "u",
      sessionId: "s",
      agentId: "a",
    });
    expect((repoSearch.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({
      types: ["decision"],
      minImportance: 0.4,
      projectId: "p",
      userId: "u",
      sessionId: "s",
      agentId: "a",
      includePersistent: true,
      limit: 10000,
    });
  });

  test("returns failure envelope when repo throws", async () => {
    repoSearch.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    const res = await post("/api/v1/memory/list", {});
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("Failed to list memories");
  });
});
