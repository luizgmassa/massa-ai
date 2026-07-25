import { describe, expect, test } from "bun:test";
import {
  MemoryHandoffStore,
  type HandoffRecord,
} from "../data/handoff/handoff-contract.js";
import { PgHandoffStore } from "../data/handoff/handoff-repository-pg.js";
import { SearchServiceError } from "../services/search/search-diagnostics.js";

function handoff(overrides: Partial<HandoffRecord> = {}): HandoffRecord {
  return {
    id: "handoff-1",
    projectId: "project-1",
    sourceSessionId: null,
    targetAgent: null,
    summary: "summary",
    openQuestions: [],
    nextSteps: [],
    files: [],
    status: "open",
    createdAt: 1_000,
    acceptedAt: null,
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "handoff-1",
    project_id: "project-1",
    source_session_id: null,
    target_agent: null,
    summary: "summary",
    open_questions_json: "[]",
    next_steps_json: "[]",
    files_json: "[]",
    status: "open",
    created_at: new Date(1_000),
    accepted_at: null,
    ...overrides,
  };
}

function client(query: () => Promise<unknown>, execute = async () => 1): any {
  return {
    $queryRaw: query,
    $executeRaw: execute,
  };
}

describe("async handoff stores", () => {
  test("memory store exposes awaited clone-safe operations", async () => {
    const store = new MemoryHandoffStore();
    const record = handoff();
    const insertion = store.insert(record);
    expect(insertion).toBeInstanceOf(Promise);
    await insertion;
    await store.insert({ ...record, id: "handoff-2" });
    const loaded = await store.getById("handoff-2");
    expect(loaded).toEqual({ ...record, id: "handoff-2" });
    loaded!.summary = "mutated";
    expect((await store.getById("handoff-2"))!.summary).toBe("summary");
    expect(await store.journalMode()).toBe("memory");
  });

  test("reads wait for hydration before observing the mirror", async () => {
    let resolveRows!: (rows: unknown[]) => void;
    const rows = new Promise<unknown[]>((resolve) => {
      resolveRows = resolve;
    });
    const store = new PgHandoffStore(client(() => rows));
    let settled = false;
    const pending = store.getById("handoff-1").then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveRows([row()]);
    expect(await pending).toEqual(handoff());
  });

  test.each([
    ["invalid syntax", "{", "handoff.open_questions_json"],
    ["invalid shape", "[1]", "handoff.open_questions_json"],
  ])("surfaces %s in stored arrays", async (_label, raw, component) => {
    const store = new PgHandoffStore(client(async () => [row({ open_questions_json: raw })]));
    try {
      await store.listPending("project-1");
      throw new Error("expected corruption error");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchServiceError);
      expect((error as SearchServiceError).code).toBe("STORE_CORRUPTION");
      expect((error as SearchServiceError).component).toBe(component);
      expect((error as Error).message).not.toContain(raw);
    }
  });

  test.each([
    ["status", { status: "unknown" }, "handoff.status"],
    ["created date", { created_at: new Date(Number.NaN) }, "handoff.created_at"],
    ["accepted date", { accepted_at: "not-a-date" }, "handoff.accepted_at"],
  ])("surfaces invalid %s", async (_label, overrides, component) => {
    const store = new PgHandoffStore(client(async () => [row(overrides)]));
    await expect(store.getById("handoff-1")).rejects.toMatchObject({
      code: "STORE_CORRUPTION",
      component,
    });
  });

  test("failed durable insert leaves the mirror unchanged", async () => {
    const store = new PgHandoffStore(
      client(async () => [], async () => {
        throw new Error("database detail");
      }),
    );
    await expect(store.insert(handoff())).rejects.toMatchObject({
      code: "SEARCH_BACKEND_UNAVAILABLE",
      component: "handoff_store",
    });
    expect(await store.getById("handoff-1")).toBeNull();
  });
});

describe("MemoryHandoffStore branch coverage", () => {
  test("listPending filters by targetAgent (null/exact/null-row) and orders by createdAt; getById/setStatus miss returns null", async () => {
    const store = new MemoryHandoffStore();
    await store.insert(handoff({ id: "h-a", targetAgent: "alpha", createdAt: 3_000 }));
    await store.insert(handoff({ id: "h-b", targetAgent: null, createdAt: 1_000 }));
    await store.insert(handoff({ id: "h-c", targetAgent: "beta", createdAt: 2_000 }));
    await store.insert(handoff({ id: "h-d", targetAgent: "alpha", projectId: "other", createdAt: 9_000 }));

    // No targetAgent filter: every open row for project-1, ordered by createdAt.
    expect((await store.listPending("project-1")).map((r) => r.id)).toEqual(["h-b", "h-c", "h-a"]);
    // Exact targetAgent match includes the alpha row; the null-agent row (h-b) is also included.
    expect((await store.listPending("project-1", "alpha")).map((r) => r.id)).toEqual(["h-b", "h-a"]);
    // Unknown targetAgent still returns the null-agent row (fail-open).
    expect((await store.listPending("project-1", "gamma")).map((r) => r.id)).toEqual(["h-b"]);

    // setStatus: missing row → null.
    expect(await store.setStatus("missing", "accepted")).toBeNull();
    // accepted with explicit acceptedAt; expired clears acceptedAt.
    const accepted = await store.setStatus("h-a", "accepted", 5_000);
    expect(accepted).toMatchObject({ id: "h-a", status: "accepted", acceptedAt: 5_000 });
    const expired = await store.setStatus("h-b", "expired");
    expect(expired).toMatchObject({ id: "h-b", status: "expired", acceptedAt: null });
    // accepted with no acceptedAt stamps Date.now().
    const before = Date.now();
    const stamped = await store.setStatus("h-c", "accepted");
    expect(stamped!.acceptedAt).toBeGreaterThanOrEqual(before);
    // Accepted/expired rows drop out of listPending.
    expect((await store.listPending("project-1")).map((r) => r.id)).toEqual([]);
  });
});
