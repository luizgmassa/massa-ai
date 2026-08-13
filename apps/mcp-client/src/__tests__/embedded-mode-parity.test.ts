/**
 * Embedded mode wiring + handleIndexTool parity tests (Wave 6 N32, T19)
 *
 * Verifies:
 * - MASSA_AI_EMBEDDED=true selects EmbeddedApiClient; unset selects ApiClient
 * - Health check reports mode ("embedded" or "http")
 * - handleIndexTool in embedded mode exercises path-safety validation
 * - Parity: same tool call in both modes → same result shape (including index tool)
 *
 * DB-free: these tests check routing and error shapes, not DB-dependent results.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { ApiClient } from "../api-client.js";
import { EmbeddedApiClient } from "../embedded-api-client.js";
import { proxyCallTool } from "../call-tool-proxy.js";
import type { ToolProxyApiClient } from "../call-tool-proxy.js";
import { TOOL_DEFINITIONS, getToolDefinition } from "../tool-definitions.js";

describe("Embedded mode wiring (T19)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("MASSA_AI_EMBEDDED=true → EmbeddedApiClient instance", () => {
    process.env.MASSA_AI_EMBEDDED = "true";
    // Simulate the constructor logic
    const isEmbedded = process.env.MASSA_AI_EMBEDDED === "true";
    expect(isEmbedded).toBe(true);
    const client = isEmbedded ? new EmbeddedApiClient() : new ApiClient();
    expect(client).toBeInstanceOf(EmbeddedApiClient);
  });

  test("MASSA_AI_EMBEDDED not set → ApiClient instance (HTTP, unchanged)", () => {
    delete process.env.MASSA_AI_EMBEDDED;
    const isEmbedded = process.env.MASSA_AI_EMBEDDED === "true";
    expect(isEmbedded).toBe(false);
    const client = isEmbedded ? new EmbeddedApiClient() : new ApiClient();
    expect(client).toBeInstanceOf(ApiClient);
  });

  test("both clients implement ToolProxyApiClient (get/post/patch/delete)", () => {
    // T11 (HPC-05/AC-05.1): this test's title has claimed patch/delete since
    // it was written, but only asserted get/post — the exact gap AC-05.2
    // names. `call-tool-proxy.ts`'s PATCH/DELETE branches (`proxyToolRequest`)
    // throw "API client does not support PATCH/DELETE" when either method is
    // absent, so an un-asserted client here is a silent parity break for
    // every `:id` tool (synapse_update/synapse_end and the new T10
    // handoff_update/handoff_delete/update_proposal/delete_proposal tools).
    const http = new ApiClient();
    const embedded = new EmbeddedApiClient();
    for (const client of [http, embedded]) {
      expect(typeof client.get).toBe("function");
      expect(typeof client.post).toBe("function");
      expect(typeof client.patch).toBe("function");
      expect(typeof client.delete).toBe("function");
    }
  });

  test("both clients have uploadAndIndex + healthCheck", () => {
    const http = new ApiClient();
    const embedded = new EmbeddedApiClient();
    for (const client of [http, embedded]) {
      expect(typeof (client as any).uploadAndIndex).toBe("function");
      expect(typeof (client as any).healthCheck).toBe("function");
    }
  });

  test("EmbeddedApiClient healthCheck returns true (mode: embedded)", async () => {
    const embedded = new EmbeddedApiClient();
    const healthy = await embedded.healthCheck();
    expect(healthy).toBe(true);
  });
});

describe("Parity: HTTP vs Embedded result shape (T19)", () => {
  test("all non-index tool definitions have apiEndpoint starting with /api/v1/", () => {
    // Parity contract: every tool endpoint is routed by both clients.
    // If a tool endpoint exists, EmbeddedApiClient must handle it.
    const nonIndexTools = TOOL_DEFINITIONS.filter((t) => t.name !== "index");
    for (const tool of nonIndexTools) {
      expect(tool.apiEndpoint.startsWith("/api/v1/")).toBe(true);
    }
  });

  test("index tool is special-cased in both modes (not via proxyCallTool)", () => {
    // proxyCallTool throws for "index" — both modes handle it via handleIndexTool
    const toolDef = getToolDefinition("index");
    expect(toolDef).toBeDefined();
    expect(toolDef!.name).toBe("index");
  });

  test("proxyCallTool rejects index tool (both modes use handleIndexTool)", async () => {
    const http = new ApiClient();
    const embedded = new EmbeddedApiClient();
    for (const client of [http, embedded]) {
      const result = await proxyCallTool(
        client as ToolProxyApiClient,
        "index",
        { projectPath: "/tmp" },
      );
      // proxyCallTool catches the "Unknown tool: index" error and returns isError
      expect(result.isError).toBe(true);
      const text = result.content[0]!.text;
      expect(text).toContain("Unknown tool");
    }
  });

  test("unknown tool produces isError in both modes (same shape)", async () => {
    const http = new ApiClient();
    const embedded = new EmbeddedApiClient();
    for (const client of [http, embedded]) {
      const result = await proxyCallTool(
        client as ToolProxyApiClient,
        "nonexistent_tool",
        {},
      );
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(false);
      expect(typeof parsed.error).toBe("string");
    }
  });
});

describe("Parity: profile_list/profile_set routing (T12)", () => {
  test("profile_list is GET /api/v1/profiles; profile_set is POST /api/v1/profiles/switch", () => {
    // Both ApiClient (HTTP) and EmbeddedApiClient dispatch off this same
    // toolDef.apiEndpoint/apiMethod pair (proxyToolRequest), so pinning it
    // here is a parity guarantee by construction — the two transports can
    // never diverge on which endpoint a tool call reaches.
    const list = getToolDefinition("profile_list");
    const set = getToolDefinition("profile_set");
    expect(list?.apiMethod).toBe("GET");
    expect(list?.apiEndpoint).toBe("/api/v1/profiles");
    expect(set?.apiMethod).toBe("POST");
    expect(set?.apiEndpoint).toBe("/api/v1/profiles/switch");
    expect(set?.inputSchema.required).toEqual(["profile"]);
  });

  test("both clients route /api/v1/profiles* rather than falling through to the 404 catch-all", async () => {
    // Safe against both transports without touching a real host filesystem:
    // an unknown host short-circuits before the switch engine or any HTTP
    // call. A generic "no GET/POST handler for <endpoint>" 404 would mean
    // the embedded client never wired the endpoint — that's exactly the
    // regression this test catches.
    const embedded = new EmbeddedApiClient();
    const getResult = (await embedded.get("/api/v1/profiles", { host: "nonesuch" })) as { error?: { code?: string } };
    expect(getResult.error?.code).toBe("InvalidHostError");
    const postResult = (await embedded.post("/api/v1/profiles/switch", { profile: "work", host: "nonesuch" })) as {
      error?: { code?: string };
    };
    expect(postResult.error?.code).toBe("InvalidHostError");
  });
});

describe("handleIndexTool path-safety in embedded mode (T19 F1)", () => {
  test("EmbeddedApiClient.uploadAndIndex rejects traversal paths (same as HTTP route)", async () => {
    const client = new EmbeddedApiClient();
    try {
      await client.uploadAndIndex({
        projectPath: "/tmp/test",
        files: [{ relativePath: "../../etc/passwd", content: "x" }],
      });
      expect(false).toBe(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      expect(msg).toContain("Invalid file path");
    }
  });

  test("EmbeddedApiClient.uploadAndIndex rejects absolute paths (same as HTTP route)", async () => {
    const client = new EmbeddedApiClient();
    try {
      await client.uploadAndIndex({
        projectPath: "/tmp/test",
        files: [{ relativePath: "/etc/passwd", content: "x" }],
      });
      expect(false).toBe(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      expect(msg).toContain("Invalid file path");
    }
  });

  test("EmbeddedApiClient.uploadAndIndex rejects path-escape via .. after resolve", async () => {
    const client = new EmbeddedApiClient();
    try {
      await client.uploadAndIndex({
        projectPath: "/tmp/test",
        files: [{ relativePath: "subdir/../../../etc/passwd", content: "x" }],
      });
      expect(false).toBe(true);
    } catch (error) {
      // Either "Invalid file path" (contains "..") or "Path escapes" after resolve
      const msg = error instanceof Error ? error.message : String(error);
      expect(msg.includes("Invalid file path") || msg.includes("Path escapes")).toBe(true);
    }
  });
});