import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

// ── Mocks: child_process.spawn + profilesLib + configDir ──────────────────
// Mirror model-registry.test.ts mock shape so the new route reuses the same
// lazy profilesLib() pattern and GENERATE_SCRIPT resolution.

const builtinRegistry = {
  version: 1,
  tiers: ["light", "standard", "deep"],
  hostDefaults: { claude: "balanced", codex: "balanced", cursor: "balanced", opencode: "balanced" },
  workflowTiers: {},
  profiles: {
    balanced: {
      description: "builtin balanced",
      hosts: {
        claude: { light: { model: "m-light", effort: "high" }, standard: { model: "m-std", effort: "high" }, deep: { model: "m-deep", effort: "high" } },
      },
    },
  },
};

const loadEffectiveRegistry = mock((..._args: unknown[]): unknown => ({
  registry: builtinRegistry,
  source: { builtin: builtinRegistry, overlay: null, tombstoned: [] },
}));
const loadRegistry = mock((..._args: unknown[]): unknown => builtinRegistry);
const validateRegistry = mock((..._args: unknown[]): unknown => builtinRegistry);
const RegistryValidationError = class extends Error {
  violations: string[];
  constructor(violations: string[]) {
    super("validation failed");
    this.name = "RegistryValidationError";
    this.violations = violations;
  }
};

const actualProfilesLib = require("../../../../scripts/lib/model-profiles.ts");
mock.module("../../../../scripts/lib/model-profiles.ts", () => ({
  ...actualProfilesLib,
  loadEffectiveRegistry: (...args: unknown[]) => loadEffectiveRegistry(...args),
  loadRegistry: (...args: unknown[]) => loadRegistry(...args),
  validateRegistry: (...args: unknown[]) => validateRegistry(...args),
  RegistryValidationError,
  DEFAULT_REGISTRY_PATH: "/dev/null",
}));

const configDir = mock((..._args: unknown[]): string => "/tmp/massa-ai-test-overlay-stream");
mock.module("@massa-ai/shared/config", () => {
  const actual = require("@massa-ai/shared/config");
  return { ...actual, configDir: (...args: unknown[]) => configDir(...args) };
});

// ── Mock child_process: capture spawnSync (blocking route, REGEN-08) + spawn (stream) ──
const child_process = require("child_process");
const spawnSyncMock = mock((..._args: unknown[]): any => ({ exitCode: 0, stdout: "", stderr: "" }));

/** Builds a fake child process matching the EventEmitter shape the route expects:
 *  stdout/stderr are { on(data, cb) }, child emits "close" with an exit code.
 *  `errorEvent` fires the "error" listener with an Error (distinct from
 *  `spawnError` which throws at spawn time). */
function makeFakeChild(opts: {
  stdoutLines?: string[];
  stderrLines?: string[];
  exitCode: number | null;
  spawnError?: Error | null;
  errorEvent?: Error | null;
}): {
  stdout: { on: (ev: string, cb: (d: Buffer) => void) => void };
  stderr: { on: (ev: string, cb: (d: Buffer) => void) => void };
  on: (ev: string, cb: (code: number | null) => void) => void;
  kill: () => boolean;
} {
  const stream = (lines: string[] | undefined, _key: string) => ({
    on(event: string, cb: (d: Buffer) => void) {
      if (event !== "data") return;
      if (lines) for (const line of lines) cb(Buffer.from(line + "\n"));
    },
  });
  return {
    stdout: stream(opts.stdoutLines, "stdout"),
    stderr: stream(opts.stderrLines, "stderr"),
    on(event: string, cb: (code: number | null) => void) {
      if (event === "error" && opts.errorEvent) {
        queueMicrotask(() => cb(opts.errorEvent as unknown as number));
        return;
      }
      if (event === "close") {
        queueMicrotask(() => cb(opts.exitCode));
      }
    },
    kill() { return true; },
  };
}

const spawnMock = mock((..._args: unknown[]): any => {
  const opts = (_args[2] || {}) as { stdoutLines?: string[]; stderrLines?: string[]; exitCode: number | null; spawnError?: Error | null };
  if (opts.spawnError) throw opts.spawnError;
  return makeFakeChild({
    stdoutLines: opts.stdoutLines,
    stderrLines: opts.stderrLines,
    exitCode: opts.exitCode ?? 0,
    spawnError: opts.spawnError ?? null,
  });
});

mock.module("child_process", () => ({
  ...child_process,
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

// Import both routes so REGEN-08 (blocking route unchanged) is testable in one file.
import { modelRegistryRoutes } from "./model-registry.js";
import { modelRegistryStreamRoutes } from "./model-registry-stream.js";

const app = new Elysia().use(modelRegistryStreamRoutes);

beforeEach(() => {
  spawnMock.mockClear();
  spawnSyncMock.mockClear();
  configDir.mockClear();
});

async function postStream(path: string): Promise<{ status: number; text: string; contentType: string }> {
  const res = await app.handle(new Request(`http://localhost${path}`, { method: "POST" }));
  const text = await res.text();
  return { status: res.status, text, contentType: res.headers.get("content-type") || "" };
}

/** Parse the SSE text into discrete data: payloads (split on \n\n). */
function parseSseEvents(text: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const chunk of text.split("\n\n")) {
    const line = chunk.trim();
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim();
    try { events.push(JSON.parse(json)); } catch { /* ignore non-JSON */ }
  }
  return events;
}

describe("POST /api/v1/model-registry/regenerate-stream — SSE line emission (REGEN-03)", () => {
  test("emits line events for stdout + done event with exitCode 0", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: ["Generating claude agents...", "Generating codex agents..."],
      stderrLines: ["Warning: minor issue"],
      exitCode: 0,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("text/event-stream");

    const events = parseSseEvents(res.text);
    const lineEvents = events.filter((e) => e.type === "line");
    const doneEvents = events.filter((e) => e.type === "done");

    expect(lineEvents.length).toBeGreaterThanOrEqual(3);
    expect(lineEvents.some((e) => e.stream === "stdout" && e.text === "Generating claude agents...")).toBe(true);
    expect(lineEvents.some((e) => e.stream === "stdout" && e.text === "Generating codex agents...")).toBe(true);
    expect(lineEvents.some((e) => e.stream === "stderr" && e.text === "Warning: minor issue")).toBe(true);
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].exitCode).toBe(0);
  });

  test("emits done with non-zero exitCode on child failure", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: ["started..."],
      stderrLines: ["fatal: script error"],
      exitCode: 1,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done!.exitCode).toBe(1);
  });

  test("emits done with exitCode null + error on spawn failure (REGEN-07)", async () => {
    spawnMock.mockImplementationOnce(() => { throw new Error("spawn ENOENT"); });

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done!.exitCode).toBeNull();
    expect(done!.error).toContain("ENOENT");
  });

  test("emits done with exitCode null + error on child error event (not spawn failure)", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: ["starting..."],
      exitCode: null,
      errorEvent: new Error("child process error: SIGSEGV"),
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done!.exitCode).toBeNull();
    expect(done!.error).toContain("spawn error");
    expect(done!.error).toContain("SIGSEGV");
  });

  test("cancel hook kills the child on client disconnect", async () => {
    let killed = false;
    spawnMock.mockImplementationOnce(() => {
      const child = makeFakeChild({ stdoutLines: [], exitCode: 0 });
      return {
        ...child,
        kill() { killed = true; return true; },
      };
    });

    const res = await app.handle(new Request("http://localhost/api/v1/model-registry/regenerate-stream", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    // Cancel the stream reader — triggers the ReadableStream cancel hook
    const reader = res.body!.getReader();
    await reader.cancel();
    // The cancel hook should have called child.kill()
    expect(killed).toBe(true);
  });

  test("emits no line events for empty stdout/stderr but still emits done exit 0", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: [],
      stderrLines: [],
      exitCode: 0,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const lineEvents = events.filter((e) => e.type === "line");
    const doneEvents = events.filter((e) => e.type === "done");
    expect(lineEvents.length).toBe(0);
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].exitCode).toBe(0);
  });
});

// ── REGEN-08: blocking /regenerate route unchanged ──────────────────────────
const blockingApp = new Elysia().use(modelRegistryRoutes);

async function post(path: string): Promise<{ status: number; json: any }> {
  const res = await blockingApp.handle(new Request(`http://localhost${path}`, { method: "POST" }));
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/model-registry/regenerate — blocking route unchanged (REGEN-08)", () => {
  test("200 + regenerated:true on successful child process (uses spawnSync, not spawn)", async () => {
    spawnSyncMock.mockImplementationOnce(() => ({ exitCode: 0, stdout: "", stderr: "" }));
    const res = await post("/api/v1/model-registry/regenerate");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.regenerated).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  test("500 on non-zero child process exit", async () => {
    spawnSyncMock.mockImplementationOnce(() => ({ exitCode: 1, stdout: "", stderr: "err" }));
    const res = await post("/api/v1/model-registry/regenerate");
    expect(res.status).toBe(500);
    expect(res.json.error).toContain("regeneration failed");
  });
});

// ── Real socket: auth gate (AD-011) ──────────────────────────────────────────
import { authMiddleware, __setAuthKeyForTests } from "../middleware/auth.js";

const API_KEY = "model-registry-stream-test-key";

async function allocateTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close(() => reject(new Error("failed to allocate a TCP port")));
        return;
      }
      reservation.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const socketApp = new Elysia({ adapter: node() }).use(authMiddleware).use(modelRegistryStreamRoutes);

let server: { stop?: () => void } | undefined;
let base = "";

beforeAll(async () => {
  __setAuthKeyForTests(API_KEY);
  const port = await allocateTcpPort();
  base = `http://127.0.0.1:${port}`;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not listen in time")), 5000);
    socketApp.listen(port, (srv: unknown) => {
      clearTimeout(timeout);
      server = srv as { stop?: () => void };
      resolve();
    });
  });
});

afterAll(() => {
  server?.stop?.();
  __setAuthKeyForTests(undefined);
});

describe("SEC — /api/v1/model-registry/regenerate-stream over a real socket", () => {
  test("POST without a key returns 401", async () => {
    const res = await fetch(`${base}/api/v1/model-registry/regenerate-stream`, { method: "POST" });
    expect(res.status).toBe(401);
  }, 15_000);

  test("POST with the key returns 200 + text/event-stream", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: ["line 1"], exitCode: 0 }));
    const res = await fetch(`${base}/api/v1/model-registry/regenerate-stream`, {
      method: "POST",
      headers: { "x-api-key": API_KEY },
    });
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") || "";
    expect(ct).toContain("text/event-stream");
    await res.text();
  }, 15_000);
});