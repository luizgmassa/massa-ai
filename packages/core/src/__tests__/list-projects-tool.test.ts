/**
 * `list_projects` projection contract (EB-MCP-3).
 *
 * This tool is now the ONLY projection of a workspace row onto the wire.
 * `GET /api/v1/workspace/list` used to hand-roll a second one beside it, and
 * the two drifted: the route emitted neither `filter` nor per-workspace
 * `createdAt`/`updatedAt`, and validated `status` not at all. The live-stack
 * sensor at `29.audit-repairs.test.ts:1004` saw only the first of those three,
 * because it compares with `dropKeys: ["workspaces"]`.
 *
 * These cases therefore pin the whole envelope, not just the field the E2E
 * suite could see — a second hand-rolled projection would otherwise be free to
 * reappear and drift again on the two axes that sensor is blind to.
 *
 * Deliberately runs with no live stack: `workspace-manager` is mocked, so the
 * contract stays falsifiable on a machine with no PostgreSQL.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const listWorkspaces = mock(async (_status?: unknown): Promise<unknown[]> => []);

mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: { listWorkspaces },
}));

const { ListProjectsTool } = await import("../tools/list_projects.js");
const { ToolError } = await import("../kernel/enum-validation.js");

function row(over: Record<string, unknown> = {}) {
  return {
    project_id: "p1",
    project_path: "/tmp/p1",
    display_name: "P1",
    status: "indexed",
    last_indexed_at: 1000,
    last_error: undefined,
    files_count: 3,
    chunks_count: 9,
    symbols_count: 12,
    created_at: 500,
    updated_at: 1500,
    ...over,
  };
}

describe("ListProjectsTool — envelope", () => {
  beforeEach(() => {
    listWorkspaces.mockReset();
    listWorkspaces.mockImplementation(async () => []);
  });

  test("carries filter and total beside the rows", async () => {
    listWorkspaces.mockImplementation(async () => [row(), row({ project_id: "p2" })]);

    const res = await new ListProjectsTool().handle({ status: "all" });

    expect(res.success).toBe(true);
    const data = res.data as Record<string, unknown>;
    expect(data.total).toBe(2);
    // `filter` is the field the live-stack parity sensor caught. It is the
    // reason the REST route now delegates here instead of projecting its own.
    expect(data.filter).toBe("all");
  });

  test("defaults the filter to all when status is omitted", async () => {
    const res = await new ListProjectsTool().handle({});
    expect((res.data as Record<string, unknown>).filter).toBe("all");
    expect(listWorkspaces).toHaveBeenCalledWith("all");
  });

  test("forwards a concrete status to the manager and echoes it back", async () => {
    const res = await new ListProjectsTool().handle({ status: "error" });
    expect(listWorkspaces).toHaveBeenCalledWith("error");
    expect((res.data as Record<string, unknown>).filter).toBe("error");
  });

  test("projects every workspace field, including createdAt and updatedAt", async () => {
    listWorkspaces.mockImplementation(async () => [row()]);

    const res = await new ListProjectsTool().handle({ status: "all" });
    const ws = (res.data as { workspaces: Record<string, unknown>[] }).workspaces[0]!;

    // The exact key set, not a subset. `toMatchObject` here would let a
    // dropped field pass — which is precisely how the route's copy drifted.
    expect(Object.keys(ws).sort()).toEqual(
      [
        "chunksCount",
        "createdAt",
        "displayName",
        "filesCount",
        "lastError",
        "lastIndexedAt",
        "projectId",
        "projectPath",
        "status",
        "symbolsCount",
        "updatedAt",
      ].sort(),
    );
    expect(ws.createdAt).toBe(new Date(500).toISOString());
    expect(ws.updatedAt).toBe(new Date(1500).toISOString());
    expect(ws.lastIndexedAt).toBe(new Date(1000).toISOString());
  });

  test("null last_indexed_at stays null rather than becoming an invalid date", async () => {
    listWorkspaces.mockImplementation(async () => [row({ last_indexed_at: undefined })]);

    const res = await new ListProjectsTool().handle({ status: "all" });
    const ws = (res.data as { workspaces: Record<string, unknown>[] }).workspaces[0]!;

    expect(ws.lastIndexedAt).toBeNull();
  });
});

describe("ListProjectsTool — status validation", () => {
  beforeEach(() => {
    listWorkspaces.mockReset();
    listWorkspaces.mockImplementation(async () => []);
  });

  test("an unknown status throws a 400 ToolError naming every valid value", async () => {
    // Before the route delegated here it passed `?status=bogus` straight to
    // `listWorkspaces`, which filters on equality and so answered 200 with an
    // empty list — the silent-fallback behaviour `kernel/enum-validation.ts`
    // exists to replace.
    const promise = new ListProjectsTool().handle({ status: "bogus" });

    await expect(promise).rejects.toThrow(ToolError);
    await expect(promise).rejects.toThrow(
      "Invalid status value: bogus. Valid values: pending, indexing, indexed, error, all.",
    );
    expect(listWorkspaces).not.toHaveBeenCalled();
  });

  test("the thrown error carries statusCode 400 so a transport can map it", async () => {
    let caught: unknown;
    try {
      await new ListProjectsTool().handle({ status: "bogus" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as InstanceType<typeof ToolError>).statusCode).toBe(400);
  });

  test("a manager failure returns the failure envelope, it does not throw", async () => {
    listWorkspaces.mockImplementation(async () => {
      throw new Error("db down");
    });

    const res = await new ListProjectsTool().handle({ status: "all" });

    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to list projects: db down");
  });
});
