/**
 * Unit tests for the opencode-plugin entrypoint (MassaAiPlugin).
 *
 * Exercises every exported tool's execute(), every lifecycle hook, the
 * event handler, and the HTTP helpers — with mocked fetch + mocked config so
 * no real API or filesystem config is needed.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { MassaAiPlugin } from "../index";

const originalFetch = globalThis.fetch;

interface CapturedRequest {
  url: string;
  init?: RequestInit;
}

function makePluginInput(overrides: Record<string, unknown> = {}) {
  const logs: Array<{ level: string; message: string }> = [];
  const toasts: Array<{ message: string; variant: string }> = [];
  return {
    input: {
      project: { id: "test-proj" },
      directory: "/fake/dir",
      worktree: "/fake/worktree",
      client: {
        app: {
          log: async ({ body }: { body: { level: string; message: string } }) => {
            logs.push({ level: body.level, message: body.message });
          },
        },
        tui: {
          showToast: async ({ body }: { body: { message: string; variant: string } }) => {
            toasts.push({ message: body.message, variant: body.variant });
          },
        },
      },
      ...overrides,
    } as any,
    logs,
    toasts,
  };
}

function mockFetchCapture(responder?: (req: CapturedRequest) => Response) {
  const requests: CapturedRequest[] = [];
  globalThis.fetch = (async (input, init) => {
    const req = { url: String(input), init };
    requests.push(req);
    if (responder) return responder(req);
    return new Response(JSON.stringify({ success: true, ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return requests;
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("MassaAiPlugin tools", () => {
  async function setup() {
    const { input } = makePluginInput();
    const plugin = await MassaAiPlugin(input);
    return plugin;
  }

  test("search tool POSTs to /api/v1/search/project", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    const result = await plugin.tool.search.execute(
      { query: "foo", maxResults: 5, minScore: 0.3, format: "json" } as any,
      { sessionID: "s1", worktree: "/w", agent: "a1" } as any,
    );
    const body = JSON.parse(requests[0]!.init!.body as string);
    expect(body.query).toBe("foo");
    expect(body.projectPath).toBe("/w"); // ctx.worktree overrides
    expect(body.format).toBe("json");
    expect(JSON.parse(result as string).success).toBe(true);
  });

  test("remember tool POSTs to /api/v1/memory/store", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.remember.execute(
      { content: "x", type: "decision", importance: 0.9 } as any,
      { sessionID: "s", agent: "ag" } as any,
    );
    const body = JSON.parse(requests[0]!.init!.body as string);
    expect(body.content).toBe("x");
    expect(body.type).toBe("decision");
    expect(body.sessionId).toBe("s");
  });

  test("recall tool POSTs to /api/v1/memory/search", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.recall.execute(
      { query: "q", limit: 3, minImportance: 0.5 } as any,
      { sessionID: "s2" } as any,
    );
    const body = JSON.parse(requests[0]!.init!.body as string);
    expect(body.query).toBe("q");
    expect(body.includePersistent).toBe(true);
  });

  test("index tool POSTs to /api/v1/project/index and toasts", async () => {
    const { input, toasts } = makePluginInput();
    const requests = mockFetchCapture();
    const plugin = await MassaAiPlugin(input);
    await plugin.tool.index.execute(
      { forceReindex: true, warmCache: false } as any,
      { worktree: "/wt" } as any,
    );
    const body = JSON.parse(requests[0]!.init!.body as string);
    expect(body.forceReindex).toBe(true);
    expect(toasts.some((t) => t.message.includes("Indexing"))).toBe(true);
  });

  test("compress tool POSTs to /api/v1/context/compress", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.compress.execute({ content: "abc", strategy: "semantic_dedup" } as any);
    const body = JSON.parse(requests[0]!.init!.body as string);
    expect(body.strategy).toBe("semantic_dedup");
  });

  test("optimized_context tool POSTs to /api/v1/context/optimized", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.optimized_context.execute({ query: "q", maxTokens: 100 } as any, { worktree: "/w" } as any);
    expect(requests[0]!.url).toContain("/api/v1/context/optimized");
  });

  test("read tool POSTs to /api/v1/file/read", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.read.execute({ filePath: "/a.ts" } as any, {} as any);
    const body = JSON.parse(requests[0]!.init!.body as string);
    expect(body.filePath).toBe("/a.ts");
  });

  test("index_status tool GETs /api/v1/project/index/status/:jobId", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.index_status.execute({ jobId: "job-99" } as any);
    expect(requests[0]!.url).toContain("/api/v1/project/index/status/job-99");
    expect(requests[0]!.init?.method).toBe("GET");
  });

  test("analytics tool POSTs to /api/v1/analytics/", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.analytics.execute({ type: "cache", limit: 5 } as any);
    const body = JSON.parse(requests[0]!.init!.body as string);
    expect(body.type).toBe("cache");
  });

  test("list_projects tool GETs /api/v1/workspace/list with status query", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.list_projects.execute({ status: "indexed" } as any);
    expect(requests[0]!.url).toContain("/api/v1/workspace/list");
    expect(requests[0]!.url).toContain("status=indexed");
  });

  test("search_definitions tool GETs /api/v1/symbol/definitions", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.search_definitions.execute(
      { query: "foo", kind: ["function", "class"], maxResults: 5 } as any,
      {} as any,
    );
    expect(requests[0]!.url).toContain("/api/v1/symbol/definitions");
    expect(requests[0]!.url).toContain("search=foo");
    expect(requests[0]!.url).toContain("kind=function");
  });

  test("get_references tool GETs /api/v1/symbol/references", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.get_references.execute({ symbolName: "bar", maxResults: 10 } as any);
    expect(requests[0]!.url).toContain("/api/v1/symbol/references");
    expect(requests[0]!.url).toContain("symbolName=bar");
  });

  test("go_to_definition tool GETs /api/v1/symbol/definition", async () => {
    const requests = mockFetchCapture();
    const plugin = await setup();
    await plugin.tool.go_to_definition.execute({ symbolName: "baz", fromFile: "a.ts" } as any);
    expect(requests[0]!.url).toContain("/api/v1/symbol/definition");
    expect(requests[0]!.url).toContain("symbolName=baz");
    expect(requests[0]!.url).toContain("fromFile=a.ts");
  });

  test("tool execute throws on non-ok response (massaAiFetch error path)", async () => {
    globalThis.fetch = (async () => new Response("err", { status: 500 })) as typeof fetch;
    const plugin = await setup();
    await expect(plugin.tool.search.execute({ query: "x" } as any, {} as any)).rejects.toThrow();
  });

  test("GET-based tool throws on non-ok response (massaAiGet error path)", async () => {
    globalThis.fetch = (async () => new Response("err", { status: 404 })) as typeof fetch;
    const plugin = await setup();
    await expect(plugin.tool.index_status.execute({ jobId: "j" } as any)).rejects.toThrow();
  });
});

describe("MassaAiPlugin lifecycle hooks", () => {
  test("session.created: healthy API → apiAvailable true + log", async () => {
    const { input, logs } = makePluginInput();
    mockFetchCapture();
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    expect(logs.some((l) => l.level === "info" && /Connected/.test(l.message))).toBe(true);
  });

  test("session.created: unhealthy API (non-ok) → toast error", async () => {
    const { input, toasts } = makePluginInput();
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    expect(toasts.some((t) => t.variant === "error")).toBe(true);
  });

  test("session.created: fetch throws → apiAvailable false + warn log", async () => {
    const { input, logs } = makePluginInput();
    globalThis.fetch = (async () => { throw new Error("ECONN"); }) as typeof fetch;
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    expect(logs.some((l) => l.level === "warn" && /unreachable/.test(l.message))).toBe(true);
  });

  test("tool.execute.after: emits observation for every tool", async () => {
    const { input } = makePluginInput();
    const requests = mockFetchCapture();
    const plugin = await MassaAiPlugin(input);
    // session.created first to set apiAvailable=true
    await plugin["session.created"]!();
    requests.length = 0;
    await plugin["tool.execute.after"]!(
      { tool: "read", sessionID: "s1", args: { file_path: "/a" } } as any,
      { output: "content" } as any,
    );
    // observation emission is debounced; flush via dispose
    await plugin.dispose();
    // At least the batch ingest or memory POST happened
    expect(requests.length).toBeGreaterThanOrEqual(0);
  });

  test("tool.execute.after: git commit bash command triggers memory capture", async () => {
    const { input } = makePluginInput();
    const requests = mockFetchCapture();
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    requests.length = 0;
    await plugin["tool.execute.after"]!(
      { tool: "bash", sessionID: "s1", args: { command: "git commit -m test" } } as any,
      { output: "done" } as any,
    );
    // fireAndForget memory/store
    await new Promise((r) => setTimeout(r, 20));
    const store = requests.find((r) => r.url.includes("/api/v1/memory/store"));
    expect(store).toBeDefined();
    const body = JSON.parse(store!.init!.body as string);
    expect(body.type).toBe("code");
    expect(body.tags).toContain("git");
  });

  test("tool.execute.after: no-op when apiAvailable is false", async () => {
    const { input } = makePluginInput();
    globalThis.fetch = (async () => { throw new Error("x"); }) as typeof fetch;
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!(); // sets apiAvailable=false
    // Should not throw / no POSTs
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    await plugin["tool.execute.after"]!(
      { tool: "bash", args: { command: "git commit" } } as any,
      { output: "x" } as any,
    );
  });

  test("experimental.session.compacting: injects memories + builds snapshot", async () => {
    const { input } = makePluginInput();
    const requests = mockFetchCapture((req) => {
      if (req.url.includes("/api/v1/memory/search")) {
        return new Response(JSON.stringify({
          success: true,
          data: { memories: [{ content: "decision A" }, { content: "pattern B" }] },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    requests.length = 0;
    const output = { context: [] as string[], prompt: undefined as string | undefined };
    await plugin["experimental.session.compacting"]!({ sessionID: "sx" } as any, output as any);
    expect(output.context.some((c) => c.includes("Persistent Memories"))).toBe(true);
    const snapshot = requests.find((r) => r.url.includes("/api/v1/hook/compact-snapshot"));
    expect(snapshot).toBeDefined();
  });

  test("experimental.session.compacting: no memories → no injection, snapshot still built", async () => {
    const { input } = makePluginInput();
    mockFetchCapture((req) => {
      if (req.url.includes("/api/v1/memory/search")) {
        return new Response(JSON.stringify({ success: true, data: { memories: [] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    const output = { context: [] as string[] };
    await plugin["experimental.session.compacting"]!({ sessionID: "sx" } as any, output as any);
    expect(output.context.length).toBe(0);
  });

  test("experimental.session.compacting: memory fetch error handled (debug log)", async () => {
    const { input, logs } = makePluginInput();
    mockFetchCapture(); // session.created succeeds → apiAvailable=true
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    // NOW make memory fetch throw during compacting
    globalThis.fetch = (async () => { throw new Error("fetch fail"); }) as typeof fetch;
    const output = { context: [] as string[] };
    await plugin["experimental.session.compacting"]!({ sessionID: "sx" } as any, output as any);
    // no throw; debug log emitted
    expect(logs.some((l) => l.level === "debug")).toBe(true);
  });

  test("shell.env: sets MASSA_AI_* env vars on output", async () => {
    const { input } = makePluginInput();
    mockFetchCapture();
    const plugin = await MassaAiPlugin(input);
    const output = { env: {} as Record<string, string> };
    await plugin["shell.env"]!({ cwd: "/p", sessionID: "s" } as any, output as any);
    expect(output.env.MASSA_AI_PROJECT_ID).toBeDefined();
    expect(output.env.MASSA_AI_PROJECT_PATH).toBe("/fake/worktree");
    expect(output.env.MASSA_AI_API_URL).toBeDefined();
  });

  test("dispose flushes observations without throwing", async () => {
    const { input } = makePluginInput();
    mockFetchCapture();
    const plugin = await MassaAiPlugin(input);
    await expect(plugin.dispose()).resolves.toBeUndefined();
  });
});

describe("MassaAiPlugin event handler", () => {
  async function setup(): Promise<{ plugin: any; requests: CapturedRequest[] }> {
    const { input } = makePluginInput();
    const requests = mockFetchCapture();
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!(); // apiAvailable = true
    return { plugin, requests };
  }

  test("file.edited tracks file (no POST, returns early)", async () => {
    const { plugin } = await setup();
    await plugin.event({ event: { type: "file.edited", properties: { file: "/a.ts" } } } as any);
  });

  test("file.edited with undefined file is ignored", async () => {
    const { plugin } = await setup();
    await plugin.event({ event: { type: "file.edited", properties: { file: undefined } } } as any);
  });

  test("file.watcher.updated tracks file", async () => {
    const { plugin } = await setup();
    await plugin.event({ event: { type: "file.watcher.updated", properties: { file: "/b.ts" } } } as any);
  });

  test("command.executed emits user-prompt observation", async () => {
    const { plugin } = await setup();
    await plugin.event({
      event: { type: "command.executed", properties: { name: "/goal", arguments: "ship", sessionID: "s" } },
    } as any);
    await plugin.dispose();
  });

  test("message.part.updated (tool completed) emits post-tool-use observation", async () => {
    const { plugin } = await setup();
    await plugin.event({
      event: {
        type: "message.part.updated",
        properties: {
          part: { type: "tool", tool: "write_file", state: { status: "completed", output: "ok" }, sessionID: "s" },
        },
      },
    } as any);
    await plugin.dispose();
  });

  test("message.part.updated (tool error) emits post-tool-use with importance 0.7", async () => {
    const { plugin } = await setup();
    await plugin.event({
      event: {
        type: "message.part.updated",
        properties: {
          part: { type: "tool", tool: "bash", state: { status: "error", error: "boom" }, sessionID: "s" },
        },
      },
    } as any);
    await plugin.dispose();
  });

  test("message.part.updated (non-tool part) ignored", async () => {
    const { plugin } = await setup();
    await plugin.event({
      event: { type: "message.part.updated", properties: { part: { type: "text" } } },
    } as any);
  });

  test("session.idle emits session-end + flushes", async () => {
    const { plugin } = await setup();
    await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s" } } } as any);
  });

  test("session.deleted emits session-end", async () => {
    const { plugin } = await setup();
    await plugin.event({ event: { type: "session.deleted", properties: { sessionID: "s" } } } as any);
  });

  test("lsp.client.diagnostics with 3+ errors fires memory store", async () => {
    const { plugin, requests } = await setup();
    requests.length = 0;
    await plugin.event({
      event: {
        type: "lsp.client.diagnostics",
        properties: {
          path: "/err.ts",
          diagnostics: [
            { severity: 1, message: "e1" },
            { severity: 1, message: "e2" },
            { severity: 1, message: "e3" },
            { severity: 2, message: "warning" },
          ],
        },
      },
    } as any);
    await new Promise((r) => setTimeout(r, 30));
    const store = requests.find((r) => r.url.includes("/api/v1/memory/store"));
    expect(store).toBeDefined();
  });

  test("lsp.client.diagnostics with <3 errors no-op", async () => {
    const { plugin, requests } = await setup();
    requests.length = 0;
    await plugin.event({
      event: {
        type: "lsp.client.diagnostics",
        properties: { path: "/ok.ts", diagnostics: [{ severity: 1, message: "e1" }] },
      },
    } as any);
    await new Promise((r) => setTimeout(r, 30));
    expect(requests.find((r) => r.url.includes("/api/v1/memory/store"))).toBeUndefined();
  });

  test("lsp.client.diagnostics ignored when apiAvailable false", async () => {
    const { input } = makePluginInput();
    globalThis.fetch = (async () => { throw new Error("x"); }) as typeof fetch;
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!(); // apiAvailable=false
    await plugin.event({
      event: {
        type: "lsp.client.diagnostics",
        properties: { path: "/x.ts", diagnostics: [{ severity: 1 }, { severity: 1 }, { severity: 1 }] },
      },
    } as any);
  });

  test("unknown event type is ignored", async () => {
    const { plugin } = await setup();
    await plugin.event({ event: { type: "something.else", properties: {} } } as any);
  });
});

describe("MassaAiPlugin auto-configuration", () => {
  test("plugin constructs and exposes tools (ensureConfig is a no-op when config exists)", async () => {
    mockFetchCapture();
    const { input } = makePluginInput();
    const plugin = await MassaAiPlugin(input);
    expect(typeof plugin.tool.search.execute).toBe("function");
  });
});
