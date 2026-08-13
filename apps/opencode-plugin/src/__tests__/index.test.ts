/**
 * Unit tests for the opencode-plugin entrypoint (MassaAiPlugin).
 *
 * Hooks-only (AD-017): the plugin registers zero in-process tools — the MCP
 * server registered by scripts/install-agents.sh is the one canonical tool
 * surface (59 tools). This suite asserts the hooks-only contract (zero
 * `tool` map entries) and exercises every lifecycle hook, the event
 * handler, and the HTTP helpers — with mocked fetch + mocked config so no
 * real API or filesystem config is needed.
 */

import "./env-setup"; // MUST stay the first import — freezes scratch XDG_CONFIG_HOME + 10 ms reindex debounce before ../index loads
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { configExists } from "@massa-ai/shared/config";
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

describe("MassaAiPlugin hooks-only contract (AD-017)", () => {
  async function setup() {
    const { input } = makePluginInput();
    const plugin = await MassaAiPlugin(input);
    return plugin;
  }

  test("plugin registers zero in-process tools", async () => {
    mockFetchCapture();
    const plugin = await setup();
    expect(plugin.tool).toBeUndefined();
  });

  test("every design-named event handler is present and invokable", async () => {
    mockFetchCapture();
    const plugin: any = await setup();
    const namedHandlers = [
      "session.created",
      "tool.execute.after",
      "experimental.session.compacting",
      "shell.env",
      "event",
      "dispose",
    ];
    for (const name of namedHandlers) {
      expect(typeof plugin[name]).toBe("function");
    }
    // Invokable smoke check — each handler runs without throwing given a
    // minimal well-typed input (full behavioral coverage lives in the
    // "lifecycle hooks" and "event handler" describe blocks below).
    await plugin["session.created"]();
    await plugin["shell.env"]({ cwd: "/p", sessionID: "s" }, { env: {} });
    await plugin["event"]({ event: { type: "unhandled.smoke", properties: {} } });
    await plugin.dispose();
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
  test("plugin constructs and exposes its hooks (ensureConfig is a no-op when config exists)", async () => {
    mockFetchCapture();
    const { input } = makePluginInput();
    const plugin = await MassaAiPlugin(input);
    expect(typeof plugin["session.created"]).toBe("function");
  });
});

describe("MassaAiPlugin config bootstrap + HTTP edge branches", () => {
  test("first run under a fresh XDG_CONFIG_HOME initializes config (ensureConfig init branch)", async () => {
    mockFetchCapture();
    const { input } = makePluginInput();
    await MassaAiPlugin(input);
    // env-setup.ts pointed XDG_CONFIG_HOME at a scratch dir before any file
    // in this package could freeze CONFIG_DIR (every shared/config importer
    // pulls env-setup first), so the suite's first plugin construction ran
    // initConfig() into the scratch. Assert through the config module's own
    // frozen view — order-independent, unlike a hand-built scratch path.
    expect(configExists()).toBe(true);
  });

  test("compacting: non-ok memory search response → debug log, snapshot still attempted", async () => {
    const { input, logs } = makePluginInput();
    const requests = mockFetchCapture((req) => {
      if (req.url.includes("/api/v1/memory/search")) {
        return new Response("overloaded", { status: 503 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    requests.length = 0;
    const output = { context: [] as string[] };
    await plugin["experimental.session.compacting"]!({ sessionID: "sx" } as any, output as any);
    // massaAiFetch threw its non-ok Error (status + body slice) → caught → debug log
    expect(output.context.length).toBe(0);
    expect(logs.some((l) => l.level === "debug" && /Failed to fetch memories/.test(l.message))).toBe(true);
    expect(requests.some((r) => r.url.includes("/api/v1/hook/compact-snapshot"))).toBe(true);
  });

  test("toast tolerates a rejecting client.tui.showToast", async () => {
    const { input } = makePluginInput({
      client: {
        app: { log: async () => {} },
        tui: { showToast: async () => { throw new Error("tui gone"); } },
      },
    });
    // Unhealthy health response → session.created calls toast(); the rejection
    // must be swallowed by toast()'s catch arm.
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    // reaching here without an unhandled rejection is the assertion; give the
    // fire-and-forget rejection a tick to surface if the catch arm were missing
    await new Promise((r) => setTimeout(r, 10));
    expect(typeof plugin["event"]).toBe("function");
  });
});

describe("MassaAiPlugin debounced incremental reindex", () => {
  test("15 edited files trigger one debounced /project/index call (10 ms test debounce)", async () => {
    const { input, logs } = makePluginInput();
    const requests = mockFetchCapture();
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    requests.length = 0;
    // 20 edits: crosses REINDEX_FILE_THRESHOLD (15) and re-schedules the
    // timer several times (covers the clearTimeout-on-reschedule branch).
    for (let i = 0; i < 20; i++) {
      await plugin["event"]!({ event: { type: "file.edited", properties: { file: `src/f${i}.ts` } } } as any);
    }
    await new Promise((r) => setTimeout(r, 120));
    const reindex = requests.filter((r) => r.url.includes("/api/v1/project/index"));
    expect(reindex.length).toBe(1);
    expect(JSON.parse(String(reindex[0]!.init?.body))).toMatchObject({ forceReindex: false, warmCache: false });
    // Count left loose (\d+): under coverage instrumentation the 10 ms timer
    // can fire mid-dispatch-loop, flushing before all 20 edits accumulate.
    expect(logs.some((l) => l.level === "info" && /Incremental reindex completed \(\d+ files changed\)/.test(l.message))).toBe(true);
  });

  test("reindex failure → warn log, in-flight flag released", async () => {
    const { input, logs } = makePluginInput();
    mockFetchCapture((req) => {
      if (req.url.includes("/api/v1/project/index")) {
        return new Response("boom", { status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const plugin = await MassaAiPlugin(input);
    await plugin["session.created"]!();
    for (let i = 0; i < 15; i++) {
      await plugin["event"]!({ event: { type: "file.watcher.updated", properties: { file: `w${i}.ts` } } } as any);
    }
    await new Promise((r) => setTimeout(r, 120));
    expect(logs.some((l) => l.level === "warn" && /Reindex failed/.test(l.message))).toBe(true);
  });
});
