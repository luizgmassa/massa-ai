import { describe, expect, test } from "bun:test";
import { proxyCallTool, type ToolProxyApiClient } from "./call-tool-proxy.js";
import { getToolDefinition, TOOL_DEFINITIONS } from "./tool-definitions.js";

describe("Project identity MCP tool definitions (T5)", () => {
  test("rename_project and merge_projects are defined with POST transport and required ids", () => {
    const rename = getToolDefinition("rename_project");
    const merge = getToolDefinition("merge_projects");

    expect(rename?.apiMethod).toBe("POST");
    expect(rename?.apiEndpoint).toBe("/api/v1/project/rename");
    expect(rename?.inputSchema.required).toEqual(["sourceProjectId", "targetProjectId"]);
    expect(merge?.apiMethod).toBe("POST");
    expect(merge?.apiEndpoint).toBe("/api/v1/project/merge");
    expect(merge?.inputSchema.required).toEqual(["sourceProjectId", "targetProjectId"]);

    // dryRun must be an optional boolean defaulting to preview (never required).
    for (const def of [rename, merge]) {
      const props = def?.inputSchema.properties as Record<string, { type?: string }>;
      expect(props.dryRun?.type).toBe("boolean");
      expect(props.operationId?.type).toBe("string");
      expect(props.expectedPlanHash?.type).toBe("string");
      expect(def?.inputSchema.required).not.toContain("dryRun");
      expect(def?.inputSchema.required).not.toContain("operationId");
      expect(def?.inputSchema.required).not.toContain("expectedPlanHash");
    }
    // 49 pre-Wave-5 tools + get_architecture (W5-T04)
    // + synapse_task_begin (W5-T21) + synapse_task_end (W5-T22) = 52.
    expect(TOOL_DEFINITIONS.length).toBe(52);
  });

  test("proxyCallTool routes rename_project/merge_projects to their REST endpoints with the body intact", async () => {
    const requests: { method: string; endpoint: string; body: unknown }[] = [];
    const client: ToolProxyApiClient = {
      get: async () => ({}),
      post: async (endpoint, body) => {
        requests.push({ method: "POST", endpoint, body });
        return { success: true, data: { dryRun: true, planHash: "p".repeat(64) } };
      },
    };

    const renameResult = await proxyCallTool(client, "rename_project", {
      sourceProjectId: "source",
      targetProjectId: "target",
    });
    await proxyCallTool(client, "merge_projects", {
      sourceProjectId: "a",
      targetProjectId: "b",
      dryRun: false,
      operationId: "op-9",
      expectedPlanHash: "e".repeat(64),
    });

    expect(requests).toEqual([
      {
        method: "POST",
        endpoint: "/api/v1/project/rename",
        body: { sourceProjectId: "source", targetProjectId: "target" },
      },
      {
        method: "POST",
        endpoint: "/api/v1/project/merge",
        body: {
          sourceProjectId: "a",
          targetProjectId: "b",
          dryRun: false,
          operationId: "op-9",
          expectedPlanHash: "e".repeat(64),
        },
      },
    ]);
    // The success envelope passes through as serialized JSON content.
    expect(renameResult.isError).toBeUndefined();
    expect(renameResult.content[0]?.text).toContain("planHash");
  });
});
