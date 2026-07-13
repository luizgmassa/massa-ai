import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

const calls = {
  vector: [] as string[],
  keyword: [] as string[],
  cache: [] as string[],
  symbol: [] as string[],
  memory: [] as string[],
};

mock.module("@massa-th0th/core", () => ({
  IndexProjectTool: class { handle() {} },
  GetIndexStatusTool: class { handle() {} },
  getVectorStore: async () => ({
    deleteByProject: async (projectId: string) => {
      calls.vector.push(projectId);
      return 3;
    },
  }),
  getKeywordSearch: () => ({
    deleteByProject: async (projectId: string) => {
      calls.keyword.push(projectId);
      return 4;
    },
  }),
  getSearchCache: () => ({
    invalidateProject: async (projectId: string) => {
      calls.cache.push(projectId);
      return 1;
    },
  }),
  workspaceManager: {
    removeWorkspace: async (projectId: string) => calls.symbol.push(projectId),
  },
  getMemoryRepository: () => ({
    deleteByProject: async (projectId: string) => {
      calls.memory.push(projectId);
      return 2;
    },
  }),
}));

const { projectRoutes } = await import("../routes/project.js");
const app = new Elysia().use(projectRoutes);

beforeEach(() => {
  for (const values of Object.values(calls)) values.length = 0;
});

async function reset(body: Record<string, unknown>) {
  const response = await app.handle(
    new Request("http://localhost/api/v1/project/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, json: await response.json() as any };
}

describe("project reset lexical lifecycle", () => {
  test("clearVectors deletes vector and keyword chunks before cache invalidation", async () => {
    const response = await reset({
      projectId: "reset-project",
      clearVectors: true,
      clearSymbols: false,
      clearMemories: false,
    });

    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      success: true,
      data: { vectorsDeleted: 3, keywordsDeleted: 4 },
    });
    expect(calls.vector).toEqual(["reset-project"]);
    expect(calls.keyword).toEqual(["reset-project"]);
    expect(calls.cache).toEqual(["reset-project"]);
    expect(calls.symbol).toEqual([]);
    expect(calls.memory).toEqual([]);
  });

  test("clearVectors false preserves both semantic and lexical chunks", async () => {
    const response = await reset({
      projectId: "partial-project",
      clearVectors: false,
      clearSymbols: true,
      clearMemories: true,
    });

    expect(response.status).toBe(200);
    expect(calls.vector).toEqual([]);
    expect(calls.keyword).toEqual([]);
    expect(calls.cache).toEqual([]);
    expect(calls.symbol).toEqual(["partial-project"]);
    expect(calls.memory).toEqual(["partial-project"]);
  });
});
