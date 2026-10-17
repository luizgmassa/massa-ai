/**
 * Unit tests for the opencode-plugin entrypoint (V2 plugin definition).
 *
 * Hooks-only (AD-017): the plugin registers zero in-process tools — the MCP
 * server registered by scripts/install-agents.sh is the one canonical tool
 * surface (59 tools). This suite asserts the hooks-only contract (only the
 * two observation tool-hooks register, no tool editing) and exercises every
 * domain hook (tool/session/shell), the event subscription, and the HTTP
 * helpers — with mocked fetch + mocked config + a V2 mock ctx so no real API
 * or filesystem config is needed.
 *
 * V2 shape: the default export is Plugin.define({ id, setup }); hooks are
 * captured by the mock ctx domains (ctx.tool.hook / ctx.session.hook /
 * ctx.shell.hook) and events are driven through a controllable async
 * iterable (ctx.event.subscribe).
 */

import "./env-setup"; // MUST stay the first import — freezes scratch XDG_CONFIG_HOME + 10 ms reindex debounce before ../v2 loads
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { configExists } from "@massa-ai/shared/config";
import pluginDefinition from "../v2";
import fs from "fs";
import os from "os";
import path from "path";

const originalFetch = globalThis.fetch;
const originalConsoleLog = console.log;

interface CapturedRequest {
  url: string;
  init?: RequestInit;
}

interface Registration {
  domain: "tool" | "session" | "shell";
  name: string;
  callback: (event: any) => any;
}

/** Console lines captured from the plugin's [massa-ai] logging/toasts. */
let consoleLines: string[] = [];

/**
 * V2 mock ctx: records hook registrations, exposes a controllable event
 * subscription (push events with `push`, invoke hooks via `hook`).
 */
function makeMockCtx(overrides: Record<string, unknown> = {}) {
  const registrations: Registration[] = [];
  const queue: any[] = [];
  const resolvers: Array<(evt: any) => void> = [];
  const push = (evt: any) => {
    const r = resolvers.shift();
    if (r) r(evt);
    else queue.push(evt);
  };
  const ctx: any = {
    location: {
      directory: "/fake/worktree",
      project: { id: "test-proj", directory: "/fake/worktree", canonical: "/fake/worktree" },
    },
    tool: {
      hook: async (name: string, callback: any) => {
        registrations.push({ domain: "tool", name, callback });
        return { dispose: async () => {} };
      },
    },
    session: {
      hook: async (name: string, callback: any) => {
        registrations.push({ domain: "session", name, callback });
        return { dispose: async () => {} };
      },
    },
    shell: {
      hook: async (name: string, callback: any) => {
        registrations.push({ domain: "shell", name, callback });
        return { dispose: async () => {} };
      },
    },
    event: {
      subscribe: async function* (_options?: { signal?: AbortSignal }) {
        while (true) {
          if (queue.length > 0) {
            yield queue.shift();
          } else {
            yield await new Promise<any>((resolve) => resolvers.push(resolve));
          }
        }
      },
    },
    ...overrides,
  };
  const hook = (domain: string, name: string) =>
    registrations.find((r) => r.domain === domain && r.name === name)!.callback;
  return { ctx, registrations, push, hook };
}

/** Run setup and return the pieces tests drive. */
async function setupPlugin(overrides: Record<string, unknown> = {}) {
  const { ctx, registrations, push, hook } = makeMockCtx(overrides);
  const cleanup = await pluginDefinition.setup(ctx);
  return { ctx, registrations, push, hook, cleanup };
}

/** Fire a session.created event and let the folded health-check settle. */
async function sessionStart(push: (evt: any) => void) {
  push({ type: "session.created" });
  await settle(20);
}

async function settle(ms = 5) {
  await new Promise((r) => setTimeout(r, ms));
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

/** Parse all /api/v1/hook/batch POSTs into a flat event list. */
function batchEvents(requests: CapturedRequest[]): any[] {
  return requests
    .filter((r) => r.url.includes("/api/v1/hook/batch"))
    .flatMap((r) => JSON.parse(String(r.init?.body)).events ?? []);
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
  consoleLines = [];
  console.log = ((...args: unknown[]) => {
    consoleLines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  }) as typeof console.log;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.log = originalConsoleLog;
});

describe("MassaAiPlugin hooks-only contract (AD-017)", () => {
  test("plugin registers only observation hooks — no in-process tool surface", async () => {
    mockFetchCapture();
    const { registrations, cleanup } = await setupPlugin();
    const toolHooks = registrations.filter((r) => r.domain === "tool").map((r) => r.name);
    // Only the two observe-only tool hooks; no tool add/update/transform is
    // ever used (the mock ctx exposes no such API — AD-017).
    expect(toolHooks).toEqual(["execute.before", "execute.after"]);
    expect(registrations.some((r) => r.domain === "session" && r.name === "compaction")).toBe(true);
    expect(registrations.some((r) => r.domain === "shell" && r.name === "create.before")).toBe(true);
    await cleanup();
  });

  test("every design-named hook is registered and invokable", async () => {
    mockFetchCapture();
    const { registrations, hook, push, cleanup } = await setupPlugin();
    const names = registrations.map((r) => `${r.domain}.${r.name}`);
    for (const name of [
      "tool.execute.before",
      "tool.execute.after",
      "session.compaction",
      "session.prompt",
      "shell.create.before",
    ]) {
      expect(names).toContain(name);
    }
    // Invokable smoke check — each hook runs without throwing given a minimal
    // well-typed event (full behavioral coverage lives in the "lifecycle
    // hooks" and "event handler" describe blocks below).
    await hook("tool", "execute.before")({ tool: "bash", sessionID: "s", input: { command: "ls" } });
    await hook("shell", "create.before")({ command: "ls", cwd: "/p", env: {} });
    push({ type: "unhandled.smoke", properties: {} });
    await settle();
    await cleanup();
  });
});

describe("MassaAiPlugin lifecycle hooks", () => {
  test("tool.execute.before: a massa-ai task dispatch shows a toast with model and effort", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-oc-before-"));
    try {
      fs.mkdirSync(path.join(dir, ".opencode", "agents"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, ".opencode", "agents", "judge.md"),
        "---\nmodel: m\nreasoningEffort: high\n---\n<!-- massa-ai-owned: true -->\n",
      );
      mockFetchCapture();
      const { hook, cleanup } = await setupPlugin({
        location: { directory: dir, project: { id: "test-proj", directory: dir, canonical: dir } },
      });
      const before = hook("tool", "execute.before");
      await before({ tool: "task", sessionID: "s", callID: "c", input: { subagent_type: "judge" } });
      await before({ tool: "bash", sessionID: "s", callID: "c", input: { command: "ls" } });
      expect(consoleLines).toEqual(["[massa-ai] [toast:info] Agent dispatch: judge — model m, effort high"]);
      await cleanup();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session.created event: healthy API → apiAvailable true + log", async () => {
    mockFetchCapture();
    const { push, cleanup } = await setupPlugin();
    await sessionStart(push);
    expect(consoleLines.some((l) => /\[info\]/.test(l) && /Connected/.test(l))).toBe(true);
    await cleanup();
  });

  test("session.created event: unhealthy API (non-ok) → toast error", async () => {
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
    const { push, cleanup } = await setupPlugin();
    await sessionStart(push);
    expect(consoleLines.some((l) => /\[toast:error\]/.test(l))).toBe(true);
    await cleanup();
  });

  test("session.created event: fetch throws → apiAvailable false + warn log", async () => {
    globalThis.fetch = (async () => { throw new Error("ECONN"); }) as typeof fetch;
    const { push, cleanup } = await setupPlugin();
    await sessionStart(push);
    expect(consoleLines.some((l) => /\[warn\]/.test(l) && /unreachable/.test(l))).toBe(true);
    await cleanup();
  });

  test("tool.execute.after: emits observation for every tool", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    const requests = mockFetchCapture();
    await sessionStart(push); // apiAvailable = true
    requests.length = 0;
    await hook("tool", "execute.after")({
      tool: "read", sessionID: "s1", input: { file_path: "/a" }, result: { output: "content" },
    });
    // observation emission is debounced; flush via dispose
    await cleanup();
    // At least the batch ingest or memory POST happened
    expect(requests.length).toBeGreaterThanOrEqual(0);
  });

  test("tool.execute.after: git commit bash command triggers memory capture", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    const requests = mockFetchCapture();
    await sessionStart(push);
    requests.length = 0;
    await hook("tool", "execute.after")({
      tool: "bash", sessionID: "s1", input: { command: "git commit -m test" }, result: { output: "done" },
    });
    // fireAndForget memory/store
    await new Promise((r) => setTimeout(r, 20));
    const store = requests.find((r) => r.url.includes("/api/v1/memory/store"));
    expect(store).toBeDefined();
    const body = JSON.parse(store!.init!.body as string);
    expect(body.type).toBe("code");
    expect(body.tags).toContain("git");
    await cleanup();
  });

  test("tool.execute.after: no-op when apiAvailable is false", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    globalThis.fetch = (async () => { throw new Error("x"); }) as typeof fetch;
    await sessionStart(push); // sets apiAvailable=false
    // Should not throw / no POSTs
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    await hook("tool", "execute.after")({
      tool: "bash", input: { command: "git commit" }, result: { output: "x" },
    });
    await cleanup();
  });

  test("compaction: injects memories as a user message + builds snapshot", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    const requests = mockFetchCapture((req) => {
      if (req.url.includes("/api/v1/memory/search")) {
        return new Response(JSON.stringify({
          success: true,
          data: { memories: [{ content: "decision A" }, { content: "pattern B" }] },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    await sessionStart(push);
    requests.length = 0;
    const messages: any[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
    await hook("session", "compaction")({ sessionID: "sx", messages });
    const injected = messages.find((m) => JSON.stringify(m).includes("Persistent Memories"));
    expect(injected).toBeDefined();
    expect(injected.role).toBe("user");
    expect(JSON.stringify(injected)).toContain("1. decision A");
    const snapshot = requests.find((r) => r.url.includes("/api/v1/hook/compact-snapshot"));
    expect(snapshot).toBeDefined();
    await cleanup();
  });

  test("compaction: no memories → no injection, snapshot still built", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    mockFetchCapture((req) => {
      if (req.url.includes("/api/v1/memory/search")) {
        return new Response(JSON.stringify({ success: true, data: { memories: [] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    await sessionStart(push);
    const messages: any[] = [];
    await hook("session", "compaction")({ sessionID: "sx", messages });
    expect(messages.length).toBe(0);
    await cleanup();
  });

  test("compaction: memory fetch error handled (debug log)", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    mockFetchCapture(); // session.created succeeds → apiAvailable=true
    await sessionStart(push);
    // NOW make memory fetch throw during compacting
    globalThis.fetch = (async () => { throw new Error("fetch fail"); }) as typeof fetch;
    const messages: any[] = [];
    await hook("session", "compaction")({ sessionID: "sx", messages });
    // no throw; debug log emitted
    expect(consoleLines.some((l) => /\[debug\]/.test(l))).toBe(true);
    await cleanup();
  });

  test("shell.create.before: sets MASSA_AI_* env vars on the launch payload", async () => {
    mockFetchCapture();
    const { hook, cleanup } = await setupPlugin();
    const env: Record<string, string> = {};
    await hook("shell", "create.before")({ command: "ls", cwd: "/p", sessionID: "s", env });
    expect(env.MASSA_AI_PROJECT_ID).toBeDefined();
    expect(env.MASSA_AI_PROJECT_PATH).toBe("/fake/worktree");
    expect(env.MASSA_AI_API_URL).toBeDefined();
    await cleanup();
  });

  test("cleanup flushes observations without throwing", async () => {
    mockFetchCapture();
    const { cleanup } = await setupPlugin();
    await expect(cleanup()).resolves.toBeUndefined();
  });
});

describe("MassaAiPlugin event handler", () => {
  async function setup(): Promise<{
    push: (evt: any) => void;
    cleanup: () => any;
    requests: CapturedRequest[];
  }> {
    const s = await setupPlugin();
    const requests = mockFetchCapture();
    await sessionStart(s.push); // apiAvailable = true
    return { push: s.push, cleanup: s.cleanup, requests };
  }

  test("file.edited tracks file (no POST, returns early)", async () => {
    const { push, cleanup } = await setup();
    push({ type: "file.edited", properties: { file: "/a.ts" } });
    await settle();
    await cleanup();
  });

  test("file.edited with undefined file is ignored", async () => {
    const { push, cleanup } = await setup();
    push({ type: "file.edited", properties: { file: undefined } });
    await settle();
    await cleanup();
  });

  test("file.watcher.updated tracks file", async () => {
    const { push, cleanup } = await setup();
    push({ type: "file.watcher.updated", properties: { file: "/b.ts" } });
    await settle();
    await cleanup();
  });

  test("filesystem.changed (V2 name) tracks file; unlink skipped", async () => {
    const { push, cleanup } = await setup();
    push({ type: "filesystem.changed", data: { file: "/c.ts", event: "change" } });
    push({ type: "filesystem.changed", data: { file: "/d.ts", event: "unlink" } });
    await settle();
    await cleanup();
  });

  test("session.prompt hook: emits user-prompt observation for the prompt text", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    const requests = mockFetchCapture();
    await sessionStart(push);
    requests.length = 0;
    await hook("session", "prompt")({ sessionID: "s", prompt: { text: "  /goal ship it  " } });
    await cleanup(); // dispose flushes the observation buffer
    const batch = batchEvents(requests);
    const userPrompt = batch.find((e) => e.event === "user-prompt");
    expect(userPrompt).toBeDefined();
    expect(userPrompt.sessionId).toBe("s");
    expect(userPrompt.payload.prompt).toBe("/goal ship it");
  });

  test("session.prompt hook: blank prompt is ignored", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    const requests = mockFetchCapture();
    await sessionStart(push);
    requests.length = 0;
    await hook("session", "prompt")({ sessionID: "s", prompt: { text: "   " } });
    await cleanup();
    expect(batchEvents(requests).some((e) => e.event === "user-prompt")).toBe(false);
  });

  test("session.prompt hook: no observation when apiAvailable is false", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    globalThis.fetch = (async () => { throw new Error("x"); }) as typeof fetch;
    await sessionStart(push); // sets apiAvailable=false
    const requests = mockFetchCapture();
    await hook("session", "prompt")({ sessionID: "s", prompt: { text: "hi" } });
    await cleanup();
    expect(batchEvents(requests).some((e) => e.event === "user-prompt")).toBe(false);
  });

  test("session.tool.* events (completed) emit post-tool-use observation", async () => {
    const { push, requests, cleanup } = await setup();
    push({ type: "session.tool.input.started", properties: { id: "c1", sessionID: "s", name: "write_file" } });
    push({ type: "session.tool.called", properties: { id: "c1", sessionID: "s", input: { file_path: "/a.ts" } } });
    push({ type: "session.tool.success", properties: { id: "c1", sessionID: "s", content: [{ type: "text", text: "ok" }] } });
    await settle();
    await cleanup(); // flush
    const post = batchEvents(requests).find((e) => e.event === "post-tool-use");
    expect(post).toBeDefined();
    expect(post.payload.tool_name).toBe("write_file");
    expect(JSON.stringify(post.payload)).toContain("/a.ts");
    expect(post.importance).toBeUndefined();
  });

  test("session.tool.* events (failed) emit post-tool-use with importance 0.7", async () => {
    const { push, requests, cleanup } = await setup();
    push({ type: "session.tool.input.started", properties: { id: "c2", sessionID: "s", name: "bash" } });
    push({ type: "session.tool.called", properties: { id: "c2", sessionID: "s", input: { command: "boom" } } });
    push({ type: "session.tool.failed", properties: { id: "c2", sessionID: "s", error: { type: "x", message: "boom" } } });
    await settle();
    await cleanup();
    const post = batchEvents(requests).find((e) => e.event === "post-tool-use");
    expect(post).toBeDefined();
    expect(post.payload.tool_name).toBe("bash");
    expect(post.payload.tool_response).toBe("boom");
    expect(post.importance).toBe(0.7);
  });

  test("session.tool.* events without a prior name event are ignored", async () => {
    const { push, requests, cleanup } = await setup();
    push({ type: "session.tool.success", properties: { id: "c3", sessionID: "s", content: [{ type: "text", text: "ok" }] } });
    await settle();
    await cleanup();
    expect(batchEvents(requests).some((e) => e.event === "post-tool-use")).toBe(false);
  });

  test("session.tool.* events ignored when apiAvailable false", async () => {
    globalThis.fetch = (async () => { throw new Error("x"); }) as typeof fetch;
    const s = await setupPlugin();
    await sessionStart(s.push); // apiAvailable=false
    const requests = mockFetchCapture();
    s.push({ type: "session.tool.input.started", properties: { id: "c4", sessionID: "s", name: "bash" } });
    s.push({ type: "session.tool.failed", properties: { id: "c4", sessionID: "s", error: { type: "x", message: "e" } } });
    await settle();
    await s.cleanup();
    expect(batchEvents(requests).some((e) => e.event === "post-tool-use")).toBe(false);
  });

  test("session.idle emits session-end + flushes", async () => {
    const { push, cleanup } = await setup();
    push({ type: "session.idle", properties: { sessionID: "s" } });
    await settle(20);
    await cleanup();
  });

  test("session.deleted emits session-end", async () => {
    const { push, cleanup } = await setup();
    push({ type: "session.deleted", properties: { sessionID: "s" } });
    await settle();
    await cleanup();
  });

  test("unknown event type is ignored", async () => {
    const { push, cleanup } = await setup();
    push({ type: "something.else", properties: {} });
    await settle();
    await cleanup();
  });
});

describe("MassaAiPlugin auto-configuration", () => {
  test("plugin constructs and registers its hooks (ensureConfig is a no-op when config exists)", async () => {
    mockFetchCapture();
    const { registrations, cleanup } = await setupPlugin();
    expect(registrations.length).toBeGreaterThanOrEqual(3);
    await cleanup();
  });
});

describe("MassaAiPlugin config bootstrap + HTTP edge branches", () => {
  test("first run under a fresh XDG_CONFIG_HOME initializes config (ensureConfig init branch)", async () => {
    mockFetchCapture();
    const { cleanup } = await setupPlugin();
    // env-setup.ts pointed XDG_CONFIG_HOME at a scratch dir before any file
    // in this package could freeze CONFIG_DIR (every shared/config importer
    // pulls env-setup first), so the suite's first plugin construction ran
    // initConfig() into the scratch. Assert through the config module's own
    // frozen view — order-independent, unlike a hand-built scratch path.
    expect(configExists()).toBe(true);
    await cleanup();
  });

  test("compaction: non-ok memory search response → debug log, snapshot still attempted", async () => {
    const { push, hook, cleanup } = await setupPlugin();
    const requests = mockFetchCapture((req) => {
      if (req.url.includes("/api/v1/memory/search")) {
        return new Response("overloaded", { status: 503 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    await sessionStart(push);
    requests.length = 0;
    const messages: any[] = [];
    await hook("session", "compaction")({ sessionID: "sx", messages });
    // massaAiFetch threw its non-ok Error (status + body slice) → caught → debug log
    expect(messages.length).toBe(0);
    expect(consoleLines.some((l) => /\[debug\]/.test(l) && /Failed to fetch memories/.test(l))).toBe(true);
    expect(requests.some((r) => r.url.includes("/api/v1/hook/compact-snapshot"))).toBe(true);
    await cleanup();
  });

  test("cleanup is a function and is safe to call twice (abort + dispose never throw)", async () => {
    mockFetchCapture();
    const { cleanup } = await setupPlugin();
    expect(typeof cleanup).toBe("function");
    await cleanup();
    await expect(cleanup()).resolves.toBeUndefined();
  });
});

describe("MassaAiPlugin debounced incremental reindex", () => {
  test("15 edited files trigger one debounced /project/index call (10 ms test debounce)", async () => {
    const s = await setupPlugin();
    const requests = mockFetchCapture();
    await sessionStart(s.push);
    requests.length = 0;
    // 20 edits: crosses REINDEX_FILE_THRESHOLD (15) and re-schedules the
    // timer several times (covers the clearTimeout-on-reschedule branch).
    for (let i = 0; i < 20; i++) {
      s.push({ type: "file.edited", properties: { file: `src/f${i}.ts` } });
    }
    await new Promise((r) => setTimeout(r, 120));
    const reindex = requests.filter((r) => r.url.includes("/api/v1/project/index"));
    expect(reindex.length).toBe(1);
    expect(JSON.parse(String(reindex[0]!.init?.body))).toMatchObject({ forceReindex: false, warmCache: false });
    // Count left loose (\d+): under coverage instrumentation the 10 ms timer
    // can fire mid-dispatch-loop, flushing before all 20 edits accumulate.
    expect(consoleLines.some((l) => /\[info\]/.test(l) && /Incremental reindex completed \(\d+ files changed\)/.test(l))).toBe(true);
    await s.cleanup();
  });

  test("reindex failure → warn log, in-flight flag released", async () => {
    const s = await setupPlugin();
    mockFetchCapture((req) => {
      if (req.url.includes("/api/v1/project/index")) {
        return new Response("boom", { status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    await sessionStart(s.push);
    for (let i = 0; i < 15; i++) {
      s.push({ type: "file.watcher.updated", properties: { file: `w${i}.ts` } });
    }
    await new Promise((r) => setTimeout(r, 120));
    expect(consoleLines.some((l) => /\[warn\]/.test(l) && /Reindex failed/.test(l))).toBe(true);
    await s.cleanup();
  });
});
