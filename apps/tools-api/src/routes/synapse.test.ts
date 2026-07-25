/**
 * Synapse route coverage. Session lifecycle + working-memory buffer + task
 * envelope endpoints. A fake in-memory registry stands in for the PG-backed
 * one so no DB is required.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

type FakeSession = {
  sessionId: string;
  agentId: string;
  workspaceId?: string;
  taskContext?: string;
  createdAt: number;
  expiresAt: number;
  accessHistory: Set<string>;
  buffer: null | { size: () => number; prime: (e: any[]) => void };
};

function makeSession(over: Partial<FakeSession> = {}): FakeSession {
  return {
    sessionId: "syn_test",
    agentId: "ag",
    workspaceId: "ws",
    taskContext: "do thing",
    createdAt: 100,
    expiresAt: 9999,
    accessHistory: new Set<string>(),
    buffer: null,
    ...over,
  };
}

const sessions = new Map<string, FakeSession>();
const ensureReady = mock(async () => {});
const create = mock((opts: any): FakeSession => {
  const s = makeSession({
    sessionId: opts.sessionId ?? "syn_test",
    agentId: opts.agentId,
    workspaceId: opts.workspaceId,
    taskContext: opts.taskContext,
    buffer: opts.bufferConfig ? { size: () => 0, prime: () => {} } : null,
  });
  sessions.set(s.sessionId, s);
  return s;
});
const updateTaskContext = mock((id: string) => {
  const s = sessions.get(id);
  if (!s) return undefined;
  return s;
});
const recordAccess = mock((id: string, memId: string) => {
  sessions.get(id)?.accessHistory.add(memId);
});
const del = mock((id: string) => sessions.delete(id));
const evictExpired = mock(() => {});

const registry = {
  ensureReady,
  create,
  get: (id: string) => sessions.get(id),
  updateTaskContext,
  recordAccess,
  delete: del,
  evictExpired,
  size: () => sessions.size,
};

const begin = mock(async (): Promise<any> => ({
  sessionId: "syn_env",
  search: { results: [] },
  partial: false,
  errors: [],
}));
const end = mock((id: string): any => (sessions.has(id) ? { summary: "done", sessionId: id } : null));

mock.module("@massa-ai/core/services", () => ({
  getSessionRegistry: () => registry,
  DEFAULT_BUFFER_CONFIG: { maxSize: 50, ttlMs: 60000 },
  DEFAULT_PREFETCH_CONFIG: { enabled: true, maxResults: 5, minImportance: 0.3 },
  buildPrefetchPlan: (topics: any, cfg: any) => ({
    enabled: cfg.enabled !== false && !!(topics.filePath || topics.symbols?.length),
    query: topics.filePath ? `file:${topics.filePath}` : "symbol-query",
    chains: ["vector"],
    maxResults: cfg.maxResults ?? 5,
  }),
  TaskEnvelopeService: class {
    begin = begin;
    end = end;
  },
}));

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return { ...actual, SearchSource: actual.SearchSource };
});

import { synapseRoutes } from "./synapse.js";
const app = new Elysia().use(synapseRoutes);

async function call(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.handle(new Request(`http://localhost${path}`, init));
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/synapse/session", () => {
  test("creates a session (generated id) with a buffer", async () => {
    sessions.clear();
    const res = await call("POST", "/api/v1/synapse/session", { agentId: "ag1", taskContext: "t" });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.agentId).toBe("ag1");
    expect(res.json.data.bufferEnabled).toBe(true);
    expect(typeof res.json.data.sessionId).toBe("string");
  });

  test("creates a session with explicit id and no buffer", async () => {
    sessions.clear();
    const res = await call("POST", "/api/v1/synapse/session", {
      agentId: "ag2",
      sessionId: "syn_fixed",
      enableBuffer: false,
    });
    expect(res.json.data.sessionId).toBe("syn_fixed");
    expect(res.json.data.bufferEnabled).toBe(false);
    expect(res.json.data.bufferSize).toBeUndefined();
  });

  test("honors custom buffer size + ttl + access history entries", async () => {
    sessions.clear();
    const res = await call("POST", "/api/v1/synapse/session", {
      agentId: "ag3",
      sessionId: "syn_buf",
      enableBuffer: true,
      bufferMaxSize: 9,
      bufferTtlMs: 1234,
      accessHistoryMaxEntries: 7,
    });
    expect(res.json.success).toBe(true);
    expect(create.mock.calls.at(-1)![0].bufferConfig.maxSize).toBe(9);
  });
});

describe("GET /api/v1/synapse/session/:id", () => {
  test("returns serialized session after hydration", async () => {
    sessions.clear();
    sessions.set("syn_get", makeSession({ buffer: { size: () => 3, prime: () => {} } }));
    const res = await call("GET", "/api/v1/synapse/session/syn_get");
    expect(res.json.success).toBe(true);
    expect(res.json.data.bufferSize).toBe(3);
    expect(ensureReady).toHaveBeenCalled();
  });

  test("not-found when session missing", async () => {
    sessions.clear();
    const res = await call("GET", "/api/v1/synapse/session/nope");
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("not found");
  });
});

describe("PATCH /api/v1/synapse/session/:id", () => {
  test("updates task context", async () => {
    sessions.clear();
    sessions.set("syn_patch", makeSession());
    const res = await call("PATCH", "/api/v1/synapse/session/syn_patch", {
      taskContext: "new task",
      taskEmbedding: [0.1, 0.2],
    });
    expect(res.json.success).toBe(true);
    expect(updateTaskContext.mock.calls.at(-1) as any).toEqual(["syn_patch", "new task", [0.1, 0.2]]);
  });

  test("not-found when missing", async () => {
    sessions.clear();
    const res = await call("PATCH", "/api/v1/synapse/session/missing", { taskContext: "x" });
    expect(res.json.success).toBe(false);
  });
});

describe("DELETE /api/v1/synapse/session/:id", () => {
  test("deletes and reports success", async () => {
    sessions.clear();
    sessions.set("syn_del", makeSession());
    const res = await call("DELETE", "/api/v1/synapse/session/syn_del");
    expect(res.json.success).toBe(true);
  });
});

describe("POST /api/v1/synapse/session/:id/prime", () => {
  test("primes the buffer and returns counts", async () => {
    sessions.clear();
    const prime = mock(() => {});
    sessions.set("syn_prime", makeSession({ buffer: { size: () => 2, prime } }));
    const res = await call("POST", "/api/v1/synapse/session/syn_prime/prime", {
      entries: [{ id: "m1", content: "c", score: 0.9 }, { id: "m2", content: "c2" }],
    });
    expect(res.json.success).toBe(true);
    expect(res.json.data.primed).toBe(2);
    expect(res.json.data.bufferSize).toBe(2);
    expect(prime).toHaveBeenCalledTimes(1);
  });

  test("not-found when session missing", async () => {
    sessions.clear();
    const res = await call("POST", "/api/v1/synapse/session/none/prime", { entries: [] });
    expect(res.json.success).toBe(false);
  });

  test("no-buffer error when buffer absent", async () => {
    sessions.clear();
    sessions.set("syn_nobuf", makeSession({ buffer: null }));
    const res = await call("POST", "/api/v1/synapse/session/syn_nobuf/prime", { entries: [] });
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("no working-memory buffer");
  });
});

describe("POST /api/v1/synapse/session/:id/access", () => {
  test("records access and returns history size", async () => {
    sessions.clear();
    sessions.set("syn_acc", makeSession());
    const res = await call("POST", "/api/v1/synapse/session/syn_acc/access", { memoryId: "mem-1" });
    expect(res.json.success).toBe(true);
    expect(res.json.data.accessHistorySize).toBe(1);
  });

  test("returns failure when session missing", async () => {
    sessions.clear();
    const res = await call("POST", "/api/v1/synapse/session/none/access", { memoryId: "m" });
    expect(res.json.success).toBe(false);
  });
});

describe("POST /api/v1/synapse/session/:id/prefetch", () => {
  test("disabled plan returns enabled:false", async () => {
    sessions.clear();
    sessions.set("syn_pf", makeSession({ buffer: { size: () => 0, prime: () => {} } }));
    const res = await call("POST", "/api/v1/synapse/session/syn_pf/prefetch", { filePath: "" });
    expect(res.json.success).toBe(true);
    expect(res.json.data.enabled).toBe(false);
  });

  test("enabled plan without entries returns the note", async () => {
    sessions.clear();
    sessions.set("syn_pf2", makeSession({ buffer: { size: () => 0, prime: () => {} } }));
    const res = await call("POST", "/api/v1/synapse/session/syn_pf2/prefetch", {
      filePath: "src/a.ts",
      symbols: [{ name: "Foo" }],
    });
    expect(res.json.data.enabled).toBe(true);
    expect(res.json.data.primed).toBe(0);
    expect(res.json.data.note).toBeTruthy();
  });

  test("enabled plan with entries primes the buffer", async () => {
    sessions.clear();
    const prime = mock(() => {});
    sessions.set("syn_pf3", makeSession({ buffer: { size: () => 1, prime } }));
    const res = await call("POST", "/api/v1/synapse/session/syn_pf3/prefetch", {
      filePath: "src/a.ts",
      entries: [{ id: "e1", content: "c" }],
      maxResults: 3,
      minImportance: 0.5,
      chains: ["vector"],
    });
    expect(res.json.data.primed).toBe(1);
    expect(prime).toHaveBeenCalledTimes(1);
  });

  test("not-found when session missing", async () => {
    sessions.clear();
    const res = await call("POST", "/api/v1/synapse/session/none/prefetch", { filePath: "x" });
    expect(res.json.success).toBe(false);
  });

  test("no-buffer error when buffer absent", async () => {
    sessions.clear();
    sessions.set("syn_pf4", makeSession({ buffer: null }));
    const res = await call("POST", "/api/v1/synapse/session/syn_pf4/prefetch", { filePath: "x" });
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("no working-memory buffer");
  });
});

describe("POST /api/v1/synapse/task/begin", () => {
  test("returns the task envelope", async () => {
    begin.mockImplementationOnce(async () => ({ sessionId: "syn_env", search: null, partial: false, errors: [] }));
    const res = await call("POST", "/api/v1/synapse/task/begin", {
      agentId: "ag",
      query: "q",
      projectId: "p",
    });
    expect(res.json.success).toBe(true);
    expect(res.json.data.sessionId).toBe("syn_env");
  });
});

describe("POST /api/v1/synapse/task/:id/end", () => {
  test("ends and returns a summary", async () => {
    sessions.clear();
    sessions.set("syn_env", makeSession());
    const res = await call("POST", "/api/v1/synapse/task/syn_env/end");
    expect(res.json.success).toBe(true);
    expect(res.json.data.summary).toBe("done");
  });

  test("not-found when already ended", async () => {
    sessions.clear();
    const res = await call("POST", "/api/v1/synapse/task/ghost/end");
    expect(res.json.success).toBe(false);
  });
});

describe("GET /api/v1/synapse/sessions", () => {
  test("evicts expired and returns active count", async () => {
    sessions.clear();
    sessions.set("a", makeSession());
    sessions.set("b", makeSession());
    const res = await call("GET", "/api/v1/synapse/sessions");
    expect(res.json.success).toBe(true);
    expect(res.json.data.activeCount).toBe(2);
    expect(evictExpired).toHaveBeenCalled();
  });
});
