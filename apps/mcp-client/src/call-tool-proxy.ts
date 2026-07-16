import { getToolDefinition } from "./tool-definitions.js";

export interface ToolProxyApiClient {
  get(endpoint: string, queryParams?: Record<string, unknown>): Promise<unknown>;
  post(endpoint: string, body: unknown): Promise<unknown>;
}

export interface ToolProxyResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Execute the ordinary MCP CallTool -> Tools API proxy path. Keeping the
 * transport conversion here makes parity independently testable without
 * starting stdio or weakening the production SDK handler.
 */
export async function proxyCallTool(
  apiClient: ToolProxyApiClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolProxyResult> {
  try {
    const toolDef = getToolDefinition(name);
    if (!toolDef || name === "index") throw new Error(`Unknown tool: ${name}`);

    let endpoint = toolDef.apiEndpoint;
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (endpoint.includes(`:${key}`)) {
        endpoint = endpoint.replace(`:${key}`, encodeURIComponent(String(value)));
      } else {
        payload[key] = value;
      }
    }

    const response = toolDef.apiMethod === "GET"
      ? await apiClient.get(endpoint, payload)
      : await apiClient.post(endpoint, payload);
    const responseData = response as { success?: boolean; data?: unknown } | null;

    if (responseData?.success && typeof responseData.data === "string") {
      return { content: [{ type: "text", text: responseData.data }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      }],
    };
  }
}
