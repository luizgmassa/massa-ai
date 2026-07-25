import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { processCliArgs, textContent, isEmbeddedMode, McpProxyServer } from "../index.js";

const BASE_TMP = tmpdir();

function captureConsole(fn: () => unknown): { ret: unknown; out: string; err: string } {
  let out = "";
  let err = "";
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => { out += a.join(" ") + "\n"; };
  console.error = (...a: unknown[]) => { err += a.join(" ") + "\n"; };
  const ret = fn();
  if (ret instanceof Promise) {
    return ret.then(
      (r) => { console.log = origLog; console.error = origErr; return { ret: r, out, err }; },
      (e) => { console.log = origLog; console.error = origErr; throw e; },
    ) as any;
  }
  console.log = origLog;
  console.error = origErr;
  return { ret, out, err };
}

describe("processCliArgs", () => {
  test("--config-show prints config, returns 0", () => {
    const { ret, out } = captureConsole(() => processCliArgs(["--config-show"]));
    expect(ret).toBe(0);
    expect(out).toContain("embedding");
  });

  test("--config-path returns 0", () => {
    const { ret, out } = captureConsole(() => processCliArgs(["--config-path"]));
    expect(ret).toBe(0);
    expect(out.trim().length).toBeGreaterThan(0);
  });

  test("--config-dir returns 0", () => {
    const { ret, out } = captureConsole(() => processCliArgs(["--config-dir"]));
    expect(ret).toBe(0);
    expect(out.trim().length).toBeGreaterThan(0);
  });

  test("--help returns 0 + prints usage", () => {
    const { ret, out } = captureConsole(() => processCliArgs(["--help"]));
    expect(ret).toBe(0);
    expect(out).toContain("Usage");
  });

  test("-h returns 0", () => {
    const { ret } = captureConsole(() => processCliArgs(["-h"]));
    expect(ret).toBe(0);
  });

  test("unknown flag returns 2", () => {
    const { ret, err } = captureConsole(() => processCliArgs(["--bogus"]));
    expect(ret).toBe(2);
    expect(err).toContain("Unknown flag");
  });

  test("no flags returns undefined (continue startup)", () => {
    const { ret } = captureConsole(() => processCliArgs([]));
    expect(ret).toBeUndefined();
  });
});

describe("textContent + isEmbeddedMode", () => {
  test("textContent wraps text in content array", () => {
    const r = textContent("hello");
    expect(r.content[0].type).toBe("text");
    expect(r.content[0].text).toBe("hello");
  });

  test("isEmbeddedMode reads MASSA_AI_EMBEDDED", () => {
    const orig = process.env.MASSA_AI_EMBEDDED;
    process.env.MASSA_AI_EMBEDDED = "true";
    expect(isEmbeddedMode()).toBe(true);
    delete process.env.MASSA_AI_EMBEDDED;
    expect(isEmbeddedMode()).toBe(false);
    if (orig) process.env.MASSA_AI_EMBEDDED = orig;
  });
});

describe("McpProxyServer.handleIndexTool", () => {
  let server: InstanceType<typeof McpProxyServer>;

  beforeEach(() => {
    // Use embedded mode so the constructor doesn't make HTTP calls during init
    process.env.MASSA_AI_EMBEDDED = "true";
    server = new McpProxyServer();
  });

  afterEach(async () => {
    delete process.env.MASSA_AI_EMBEDDED;
    try { await server.close(); } catch { /* ok */ }
  });

  test("rejects missing projectPath", async () => {
    const result = await (server as any).handleIndexTool({});
    expect(JSON.parse(result.content[0].text).error).toContain("projectPath is required");
  });

  test("rejects nonexistent path", async () => {
    const result = await (server as any).handleIndexTool({ projectPath: "/nonexistent-xyz-999" });
    expect(JSON.parse(result.content[0].text).error).toContain("Path not found");
  });

  test("rejects a file path (not a directory)", async () => {
    const fileTmp = path.join(BASE_TMP, "notdir-" + Date.now());
    writeFileSync(fileTmp, "x");
    try {
      const result = await (server as any).handleIndexTool({ projectPath: fileTmp });
      expect(JSON.parse(result.content[0].text).error).toContain("not a directory");
    } finally {
      rmSync(fileTmp, { force: true });
    }
  });

  test("rejects empty directory (no indexable files)", async () => {
    const emptyDir = mkdtempSync(path.join(BASE_TMP, "empty-proj-"));
    try {
      const result = await (server as any).handleIndexTool({ projectPath: emptyDir });
      expect(JSON.parse(result.content[0].text).error).toContain("No indexable files");
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test("uploads indexable files via apiClient.uploadAndIndex", async () => {
    const projDir = mkdtempSync(path.join(BASE_TMP, "proj-"));
    writeFileSync(path.join(projDir, "a.ts"), "export const x = 1;");
    try {
      // Mock the apiClient's uploadAndIndex to capture the call
      let captured: any = null;
      (server as any).apiClient.uploadAndIndex = async (params: any) => {
        captured = params;
        return { success: true, jobId: "job-1" };
      };
      const result = await (server as any).handleIndexTool({ projectPath: projDir, projectId: "p1" });
      expect(captured.projectPath).toBe(projDir);
      expect(captured.projectId).toBe("p1");
      expect(captured.files.length).toBeGreaterThan(0);
      expect(JSON.parse(result.content[0].text).success).toBe(true);
    } finally {
      rmSync(projDir, { recursive: true, force: true });
    }
  });
});

describe("McpProxyServer.start", () => {
  test("start logs warning when API unhealthy", async () => {
    process.env.MASSA_AI_EMBEDDED = "true";
    const server = new McpProxyServer();
    (server as any).apiClient.healthCheck = async () => false;
    (server as any).server.connect = async () => {};
    const { out } = await captureConsole(() => server.start());
    delete process.env.MASSA_AI_EMBEDDED;
    try { await server.close(); } catch { /* ok */ }
    expect(out).toContain("not reachable");
  });

  test("start logs connected when API healthy", async () => {
    process.env.MASSA_AI_EMBEDDED = "true";
    const server = new McpProxyServer();
    (server as any).apiClient.healthCheck = async () => true;
    (server as any).server.connect = async () => {};
    const { out } = await captureConsole(() => server.start());
    delete process.env.MASSA_AI_EMBEDDED;
    try { await server.close(); } catch { /* ok */ }
    expect(out).toContain("Connected");
  });
});

describe("McpProxyServer.handleListTools + handleCallTool", () => {
  test("handleListTools returns paged tool definitions", async () => {
    process.env.MASSA_AI_EMBEDDED = "true";
    const server = new McpProxyServer();
    const result = await server.handleListTools({ params: {} }) as any;
    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);
    delete process.env.MASSA_AI_EMBEDDED;
    try { await server.close(); } catch { /* ok */ }
  });

  test("handleListTools applies moonshot flavor", async () => {
    process.env.MASSA_AI_EMBEDDED = "true";
    const server = new McpProxyServer();
    const result = await server.handleListTools({ params: { flavor: "moonshot" } }) as any;
    expect(result.tools).toBeDefined();
    delete process.env.MASSA_AI_EMBEDDED;
    try { await server.close(); } catch { /* ok */ }
  });

  test("handleCallTool proxies a non-index tool via proxyCallTool", async () => {
    process.env.MASSA_AI_EMBEDDED = "true";
    const server = new McpProxyServer();
    // Mock apiClient.get to return a canned response
    (server as any).apiClient.get = async () => ({ success: true, data: { x: 1 } });
    const result = await server.handleCallTool({ params: { name: "search", arguments: { query: "q" } } });
    expect(result.content[0].type).toBe("text");
    delete process.env.MASSA_AI_EMBEDDED;
    try { await server.close(); } catch { /* ok */ }
  });

  test("handleCallTool catches proxy errors and returns error envelope", async () => {
    process.env.MASSA_AI_EMBEDDED = "true";
    const server = new McpProxyServer();
    (server as any).apiClient.get = async () => { throw new Error("boom"); };
    (server as any).apiClient.post = async () => { throw new Error("boom"); };
    (server as any).apiClient.patch = async () => { throw new Error("boom"); };
    (server as any).apiClient.delete = async () => { throw new Error("boom"); };
    const result = await server.handleCallTool({ params: { name: "search", arguments: { query: "q" } } });
    expect(JSON.parse(result.content[0].text).success).toBe(false);
    delete process.env.MASSA_AI_EMBEDDED;
    try { await server.close(); } catch { /* ok */ }
  });
});
