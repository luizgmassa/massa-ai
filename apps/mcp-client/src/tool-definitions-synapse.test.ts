import { describe, expect, test } from "bun:test";
import { getToolDefinition, TOOL_DEFINITIONS } from "./tool-definitions.js";

const expected = [
  ["synapse_session", "POST", "/api/v1/synapse/session", ["agentId"]],
  ["synapse_get", "GET", "/api/v1/synapse/session/:id", ["id"]],
  ["synapse_update", "PATCH", "/api/v1/synapse/session/:id", ["id", "taskContext"]],
  ["synapse_end", "DELETE", "/api/v1/synapse/session/:id", ["id"]],
  ["synapse_prime", "POST", "/api/v1/synapse/session/:id/prime", ["id", "entries"]],
  ["synapse_access", "POST", "/api/v1/synapse/session/:id/access", ["id", "memoryId"]],
  ["synapse_prefetch", "POST", "/api/v1/synapse/session/:id/prefetch", ["id", "filePath"]],
  ["synapse_list", "GET", "/api/v1/synapse/sessions", []],
] as const;

describe("Synapse MCP tool definitions", () => {
  test("exposes the complete REST lifecycle with exact methods and paths", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(47);
    for (const [name, method, endpoint, required] of expected) {
      const definition = getToolDefinition(name);
      expect(definition?.apiMethod).toBe(method);
      expect(definition?.apiEndpoint).toBe(endpoint);
      expect(definition?.inputSchema.required).toEqual(required);
    }
  });

  test("matches REST create, update, prime, and prefetch shapes", () => {
    const sessionProperties = getToolDefinition("synapse_session")?.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(sessionProperties)).toEqual([
      "sessionId", "agentId", "workspaceId", "taskContext", "ttlMs", "enableBuffer",
      "bufferMaxSize", "bufferTtlMs", "accessHistoryMaxEntries",
    ]);
    const updateProperties = getToolDefinition("synapse_update")?.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(updateProperties)).toEqual(["id", "taskContext", "taskEmbedding"]);
    const prefetchProperties = getToolDefinition("synapse_prefetch")?.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(prefetchProperties)).toEqual([
      "id", "filePath", "symbols", "chains", "maxResults", "minImportance", "entries",
    ]);
  });
});
