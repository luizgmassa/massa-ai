import { ApiHttpError } from "./api-client.js";
import { getToolDefinition } from "./tool-definitions.js";

export type ToolProxyMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ToolProxyApiClient {
  get(endpoint: string, queryParams?: Record<string, unknown>): Promise<unknown>;
  post(endpoint: string, body: unknown): Promise<unknown>;
  patch?(endpoint: string, body: unknown): Promise<unknown>;
  delete?(endpoint: string, body?: unknown): Promise<unknown>;
}

export async function proxyToolRequest(
  apiClient: ToolProxyApiClient,
  method: ToolProxyMethod,
  endpointTemplate: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let endpoint = endpointTemplate;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (endpoint.includes(`:${key}`)) {
      endpoint = endpoint.replace(`:${key}`, encodeURIComponent(String(value)));
    } else {
      payload[key] = value;
    }
  }

  switch (method) {
    case "GET":
      return apiClient.get(endpoint, payload);
    case "POST":
      return apiClient.post(endpoint, payload);
    case "PATCH":
      if (!apiClient.patch) throw new Error("API client does not support PATCH");
      return apiClient.patch(endpoint, payload);
    case "DELETE":
      if (!apiClient.delete) throw new Error("API client does not support DELETE");
      return apiClient.delete(endpoint, payload);
  }
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

    const response = await proxyToolRequest(
      apiClient,
      toolDef.apiMethod,
      toolDef.apiEndpoint,
      args,
    );
    const responseData = response as { success?: boolean; data?: unknown } | null;

    if (responseData?.success && typeof responseData.data === "string") {
      return { content: [{ type: "text", text: responseData.data }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  } catch (error) {
    const responseBody = error instanceof ApiHttpError
      ? error.body
      : {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
    return {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify(responseBody),
      }],
    };
  }
}
