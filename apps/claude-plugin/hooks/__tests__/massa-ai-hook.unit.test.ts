/**
 * In-process unit tests for massa-ai-hook.ts (coverage-90pct, Batch K).
 *
 * Unlike the integration tests (massa-ai-hook.test.ts, hook-breadcrumb.test.ts)
 * which spawn the binary as a subprocess, these import the exported functions
 * directly so bun can measure per-line coverage inside the test process.
 *
 * The behavior-preserving refactor (export functions, `import.meta.main` guard,
 * main() returns instead of process.exit, optional stdin injection) keeps the
 * subprocess contract identical (exit 0 in all paths) while enabling coverage.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import {
  EVENT_MAP,
  sanitizeSessionId,
  getPinDir,
  getPinFile,
  resolveProjectId,
  postObservation,
  readStdin,
  main,
} from "../massa-ai-hook.js";

const originalFetch = globalThis.fetch;
const originalArgv = process.argv;
const BASE_TMP = tmpdir(); // captured once at module load, before any TMPDIR mutation
const originalEnv = { ...process.env };

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(BASE_TMP, "hook-unit-"));
  process.env.TMPDIR = tmpRoot;
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  process.argv = originalArgv;
  // Restore env keys individually (reassigning process.env wholesale is unreliable).
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v;
  }
  globalThis.fetch = originalFetch;
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("EVENT_MAP", () => {
  test("maps all 6 subcommands to event kinds", () => {
    expect(EVENT_MAP["session-start"]).toBe("session-start");
    expect(EVENT_MAP["user-prompt-submit"]).toBe("user-prompt");
    expect(EVENT_MAP["pre-tool-use"]).toBe("pre-tool-use");
    expect(EVENT_MAP["post-tool-use"]).toBe("post-tool-use");
    expect(EVENT_MAP["pre-compact"]).toBe("pre-compact");
    expect(EVENT_MAP["stop"]).toBe("session-end");
  });
});

describe("sanitizeSessionId", () => {
  test("replaces invalid characters with underscore", () => {
    expect(sanitizeSessionId("abc/def:g h")).toBe("abc_def_g_h");
    expect(sanitizeSessionId("a/b\\c*d?e")).toBe("a_b_c_d_e");
  });

  test("keeps alphanumerics, dot, underscore, hyphen", () => {
    expect(sanitizeSessionId("safe.id_1-2")).toBe("safe.id_1-2");
    expect(sanitizeSessionId("")).toBe("");
  });
});

describe("getPinDir", () => {
  test("uses TMPDIR when set", () => {
    process.env.TMPDIR = "/custom-tmp";
    expect(getPinDir()).toBe("/custom-tmp/massa-ai-hooks");
  });

  test("falls back to /tmp when TMPDIR unset", () => {
    delete process.env.TMPDIR;
    expect(getPinDir()).toBe("/tmp/massa-ai-hooks");
  });
});

describe("getPinFile", () => {
  test("returns null for empty sessionId", () => {
    expect(getPinFile("")).toBeNull();
  });

  test("returns null for sessionId that sanitizes to . or ..", () => {
    expect(getPinFile(".")).toBeNull();
    expect(getPinFile("..")).toBeNull();
  });

  test("returns joined path for a valid sessionId", () => {
    const f = getPinFile("sess-1");
    expect(f).toBe(path.join(getPinDir(), "sess-1"));
  });
});

describe("resolveProjectId", () => {
  test("existing pin file wins over env and git", () => {
    const sid = "pinned-session";
    const pinDir = getPinDir();
    mkdirSync(pinDir, { recursive: true });
    writeFileSync(getPinFile(sid)!, "pinned-project-id");

    process.env.MASSA_AI_PROJECT_ID = "env-override";

    const result = resolveProjectId(sid, process.cwd());
    expect(result).toBe("pinned-project-id");
  });

  test("env override used when no pin file (and pin written)", () => {
    const sid = "env-session-" + Date.now();
    process.env.MASSA_AI_PROJECT_ID = "env-project";

    const result = resolveProjectId(sid, process.cwd());
    expect(result).toBe("env-project");
    // Pin file written for later reuse
    expect(readFileSync(getPinFile(sid)!, "utf8").trim()).toBe("env-project");
  });

  test("git toplevel basename used when no pin and no env", () => {
    const sid = "git-session-" + Date.now();
    delete process.env.MASSA_AI_PROJECT_ID;

    const result = resolveProjectId(sid, process.cwd());
    // In this repo git resolves the toplevel basename
    expect(result.length).toBeGreaterThan(0);
    expect(existsSync(getPinFile(sid))).toBe(true);
  });

  test("cwd basename fallback when git fails (nonexistent cwd)", () => {
    const sid = "cwd-session-" + Date.now();
    delete process.env.MASSA_AI_PROJECT_ID;

    const result = resolveProjectId(sid, "/nonexistent-dir-xyz-123");
    expect(result).toBe("nonexistent-dir-xyz-123");
  });

  test("empty sessionId skips pin read + write, computes from env/git", () => {
    process.env.MASSA_AI_PROJECT_ID = "computed-via-env";
    const result = resolveProjectId("", process.cwd());
    expect(result).toBe("computed-via-env");
  });

  test("pin read failure falls through to compute", () => {
    const sid = "readfail-" + Date.now();
    // Create the pin dir but make getPinFile point somewhere unreadable by
    // pointing TMPDIR at a file (so existsSync/readFileSync fail).
    const fileAsDir = path.join(tmpRoot, "imafile");
    writeFileSync(fileAsDir, "x");
    process.env.TMPDIR = fileAsDir;
    process.env.MASSA_AI_PROJECT_ID = "fallback-computed";
    const result = resolveProjectId(sid, process.cwd());
    expect(result).toBe("fallback-computed");
  });
});

describe("postObservation", () => {
  test("POSTs JSON with Content-Type header and resolves on success", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      captured.push({ url: String(input), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await postObservation("http://x/api/v1/hook", { event: "stop" }, 2000, "stop");
    expect(captured[0]!.url).toBe("http://x/api/v1/hook");
    expect(captured[0]!.init?.method).toBe("POST");
    const headers = captured[0]!.init!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(captured[0]!.init!.body as string)).toEqual({ event: "stop" });
  });

  test("adds x-api-key header when MASSA_AI_API_KEY is set", async () => {
    process.env.MASSA_AI_API_KEY = "secret-key";
    let headers: Record<string, string> = {};
    globalThis.fetch = (async (_input, init) => {
      headers = init!.headers as Record<string, string>;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await postObservation("http://x", {}, 2000, "x");
    expect(headers["x-api-key"]).toBe("secret-key");
  });

  test("swallows fetch rejection (silent-degrade, never throws)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await expect(postObservation("http://x", {}, 2000, "x")).resolves.toBeUndefined();
  });

  test("logs deadline-on-fire breadcrumb on AbortSignal timeout", async () => {
    const stderrWrites: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    // Never-responding fetch that respects the abort signal → AbortSignal.timeout fires
    globalThis.fetch = (async (_input, init) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("signal timed out", "TimeoutError"));
        });
      });
    }) as typeof fetch;

    try {
      await postObservation("http://x", {}, 300, "post-tool-use");
      const breadcrumbs = stderrWrites
        .join("")
        .split("\n")
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      const deadline = breadcrumbs.find((b: any) => b.type === "deadline-on-fire");
      expect(deadline).toBeDefined();
      expect(deadline!.hook).toBe("post-tool-use");
      expect(deadline!.reason).toBe("timeout");
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  test("logs breadcrumb when POST takes >80% of deadline", async () => {
    const stderrWrites: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    // Respond after ~85% of deadline
    globalThis.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 260));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      await postObservation("http://x", {}, 300, "stop");
      const breadcrumbs = stderrWrites
        .join("")
        .split("\n")
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      const bc = breadcrumbs.find((b: any) => b.type === "breadcrumb");
      expect(bc).toBeDefined();
      expect(bc!.pct).toBeGreaterThan(80);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  test("no breadcrumb when POST completes fast (< 80% deadline)", async () => {
    const stderrWrites: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    globalThis.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 5));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      await postObservation("http://x", {}, 3000, "stop");
      const breadcrumbs = stderrWrites
        .join("")
        .split("\n")
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      expect(breadcrumbs.find((b: any) => b.type === "breadcrumb" || b.type === "deadline-on-fire")).toBeUndefined();
    } finally {
      process.stderr.write = originalWrite;
    }
  });
});

describe("readStdin", () => {
  test("returns a string without throwing (terminal or pipe)", () => {
    // In the test process fd 0 is either a terminal (→ "") or a pipe. Either
    // way the function must not throw and must return a string.
    const result = readStdin();
    expect(typeof result).toBe("string");
  });
});

describe("main (in-process dispatch)", () => {
  test("unknown subcommand → returns early (no POST)", async () => {
    process.argv = ["bun", "hook.ts", "bogus"];
    const posts: string[] = [];
    globalThis.fetch = (async (input) => { posts.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    await main("{}");
    expect(posts.length).toBe(0);
  });

  test("missing subcommand → returns early (no POST)", async () => {
    process.argv = ["bun", "hook.ts"];
    const posts: string[] = [];
    globalThis.fetch = (async (input) => { posts.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    await main("{}");
    expect(posts.length).toBe(0);
  });

  test("empty stdin → returns early (no POST)", async () => {
    process.argv = ["bun", "hook.ts", "post-tool-use"];
    const posts: string[] = [];
    globalThis.fetch = (async (input) => { posts.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    await main("   ");
    expect(posts.length).toBe(0);
  });

  test("malformed JSON → returns early (no POST)", async () => {
    process.argv = ["bun", "hook.ts", "post-tool-use"];
    const posts: string[] = [];
    globalThis.fetch = (async (input) => { posts.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    await main("not json");
    expect(posts.length).toBe(0);
  });

  test("non-object JSON (array) → returns early (no POST)", async () => {
    process.argv = ["bun", "hook.ts", "post-tool-use"];
    const posts: string[] = [];
    globalThis.fetch = (async (input) => { posts.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    await main("[1,2,3]");
    expect(posts.length).toBe(0);
  });

  test("non-object JSON (null) → returns early (no POST)", async () => {
    process.argv = ["bun", "hook.ts", "post-tool-use"];
    const posts: string[] = [];
    globalThis.fetch = (async (input) => { posts.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    await main("null");
    expect(posts.length).toBe(0);
  });

  test("valid payload → single POST to /api/v1/hook with session_id", async () => {
    process.argv = ["bun", "hook.ts", "post-tool-use"];
    process.env.MASSA_AI_PROJECT_ID = "proj-x";
    delete process.env.MASSA_AI_API_BASE;
    const captured: Array<{ url: string; body: any }> = [];
    globalThis.fetch = (async (input, init) => {
      captured.push({ url: String(input), body: JSON.parse(init!.body as string) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await main(JSON.stringify({ session_id: "sess-1", tool_name: "Read" }));
    expect(captured.length).toBe(1);
    expect(captured[0]!.url).toContain("/api/v1/hook");
    expect(captured[0]!.body.event).toBe("post-tool-use");
    expect(captured[0]!.body.projectId).toBe("proj-x");
    expect(captured[0]!.body.sessionId).toBe("sess-1");
  });

  test("valid payload with sessionId (camelCase) field", async () => {
    process.argv = ["bun", "hook.ts", "stop"];
    process.env.MASSA_AI_PROJECT_ID = "proj-y";
    const captured: Array<{ url: string; body: any }> = [];
    globalThis.fetch = (async (input, init) => {
      captured.push({ url: String(input), body: JSON.parse(init!.body as string) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await main(JSON.stringify({ sessionId: "camel-sess" }));
    expect(captured[0]!.body.event).toBe("session-end");
    expect(captured[0]!.body.sessionId).toBe("camel-sess");
  });

  test("unknown sessionId → omitted sessionId field in body", async () => {
    process.argv = ["bun", "hook.ts", "post-tool-use"];
    process.env.MASSA_AI_PROJECT_ID = "proj-z";
    const captured: Array<{ body: any }> = [];
    globalThis.fetch = (async (_input, init) => {
      captured.push({ body: JSON.parse(init!.body as string) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await main(JSON.stringify({ tool_name: "Bash" })); // no session_id/sessionId
    expect(captured[0]!.body.sessionId).toBeUndefined();
    expect(captured[0]!.body.projectId).toBe("proj-z");
  });

  test("pre-compact → TWO POSTs (observation + compact-snapshot)", async () => {
    process.argv = ["bun", "hook.ts", "pre-compact"];
    process.env.MASSA_AI_PROJECT_ID = "compact-proj";
    const captured: Array<{ url: string; body: any }> = [];
    globalThis.fetch = (async (input, init) => {
      captured.push({ url: String(input), body: JSON.parse(init!.body as string) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await main(JSON.stringify({ session_id: "c-sess" }));
    expect(captured.length).toBe(2);
    expect(captured[0]!.url).toContain("/api/v1/hook");
    expect(captured[0]!.body.event).toBe("pre-compact");
    expect(captured[1]!.url).toContain("/api/v1/hook/compact-snapshot");
    expect(captured[1]!.body.persist).toBe(true);
    expect(captured[1]!.body.sessionId).toBe("c-sess");
  });

  test("respects MASSA_AI_API_BASE override", async () => {
    process.argv = ["bun", "hook.ts", "post-tool-use"];
    process.env.MASSA_AI_PROJECT_ID = "p";
    process.env.MASSA_AI_API_BASE = "http://custom-host:9999";
    const urls: string[] = [];
    globalThis.fetch = (async (input) => { urls.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;

    await main(JSON.stringify({ session_id: "s" }));
    expect(urls[0]).toContain("http://custom-host:9999");
  });
});
