#!/usr/bin/env node
/**
 * massa-ai MCP Client
 *
 * Cliente MCP que se conecta ao OpenCode via stdio
 * e faz proxy das tool calls para a Tools API via HTTP.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { ApiClient } from "./api-client.js";
import { EmbeddedApiClient } from "./embedded-api-client.js";
import { collectFiles } from "./file-collector.js";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import { proxyCallTool, type ToolProxyApiClient } from "./call-tool-proxy.js";
import { pageToolDefinitions } from "./tool-discovery.js";
import { applyMoonshotFlavor, resolveFlavor } from "./moonshot-flavor.js";
import {
  configExists,
  initConfig,
  loadConfig,
  getConfigPath,
  getConfigDir
} from "@massa-ai/shared/config";

// Check for config-related flags before starting MCP server
const args = process.argv.slice(2);

/**
 * Handle CLI flags. Returns an exit code when a flag was handled (caller
 * should process.exit), or undefined when no flag matched (continue startup).
 */
export function processCliArgs(cliArgs: string[]): number | undefined {
  if (cliArgs.includes("--config-show")) {
    try {
      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
      return 0;
    } catch (error) {
      console.error("Error loading config:", error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (cliArgs.includes("--config-path")) {
    console.log(getConfigPath());
    return 0;
  }

  if (cliArgs.includes("--config-dir")) {
    console.log(getConfigDir());
    return 0;
  }

  if (cliArgs.includes("--config-init")) {
    try {
      initConfig();
      console.log(`Configuration initialized at: ${getConfigPath()}`);
      return 0;
    } catch (error) {
      console.error("Error initializing config:", error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (cliArgs.includes("--help") || cliArgs.includes("-h")) {
    console.log(`
massa-ai MCP Client

Usage:
  npx @massa-ai/mcp-client [options]

Options:
  --config-show     Show current configuration
  --config-path     Show config file path
  --config-dir      Show config directory path
  --config-init     Initialize configuration
  --help, -h        Show this help message

For advanced configuration, use the config CLI:
  npx @massa-ai/mcp-client massa-ai-config <command>

Examples:
  npx @massa-ai/mcp-client --config-show
  npx @massa-ai/mcp-client --config-path
`);
    return 0;
  }

  // Reject unknown CLI flags (usage error, exit code 2).
  const KNOWN_FLAGS = ["--config-show", "--config-path", "--config-dir", "--config-init", "--help", "-h"];
  const unknown = cliArgs.filter((a) => a.startsWith("-") && !KNOWN_FLAGS.includes(a));
  if (unknown.length) {
    console.error(`Unknown flag: ${unknown[0]}\nRun 'massa-ai --help' for usage.`);
    return 2;
  }

  return undefined;
}

if (import.meta.main) {
  const code = processCliArgs(args);
  if (code !== undefined) process.exit(code);

  // Auto-configure on first run
  // Silence output: MCP protocol is pure JSON-RPC on stdout; any preamble breaks handshakes.
  if (!configExists()) {
    initConfig();
    // For debugging, users can monitor stderr or check the config directly;
    // the stdout must remain pristine for MCP protocol traffic.
  }
}

export function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * The apiClient must implement the ToolProxyApiClient interface (for proxyCallTool)
 * AND expose uploadAndIndex + healthCheck (called directly by McpProxyServer for
 * the `index` tool and startup health check). Both ApiClient and EmbeddedApiClient
 * satisfy this union.
 */
type ApiClientLike = ToolProxyApiClient & {
  uploadAndIndex(params: {
    projectPath: string;
    projectId?: string;
    forceReindex?: boolean;
    warmCache?: boolean;
    warmupQueries?: string[];
    files: Array<{ relativePath: string; content: string }>;
  }): Promise<unknown>;
  healthCheck(): Promise<boolean>;
};

export function isEmbeddedMode(): boolean {
  return process.env.MASSA_AI_EMBEDDED === "true";
}

export class McpProxyServer {
  private server: Server;
  private transport: StdioServerTransport;
  private apiClient: ApiClientLike;
  private mode: "embedded" | "http";

  constructor() {
    this.server = new Server(
      {
        name: "massa-ai",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.transport = new StdioServerTransport();
    if (isEmbeddedMode()) {
      this.apiClient = new EmbeddedApiClient() as ApiClientLike;
      this.mode = "embedded";
    } else {
      this.apiClient = new ApiClient() as ApiClientLike;
      this.mode = "http";
    }
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List tools in stable protocol pages. Current roster remains one page.
    // Wave 5 FR-17: `?flavor=moonshot` strips root-level JSON Schema
    // combinators from each tool's inputSchema (transport-only, no storage
    // rewrite). The flavor may arrive via `_meta.flavor` or a `flavor`
    // param on the request.
    this.server.setRequestHandler(ListToolsRequestSchema, (async (request: any) => this.handleListTools(request)) as any);

    // Handle tool calls - proxy to Tools API
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => this.handleCallTool(request));
  }

  async handleListTools(request: { params?: { cursor?: string; flavor?: string }; _meta?: { flavor?: string } }): Promise<unknown> {
    const result = pageToolDefinitions(TOOL_DEFINITIONS, request.params?.cursor);
    const flavor = resolveFlavor(request);
    return applyMoonshotFlavor(result, flavor);
  }

  async handleCallTool(request: { params: { name: string; arguments?: unknown } }): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const { name, arguments: args } = request.params;

    try {
      if (name === "index") {
        return await this.handleIndexTool((args ?? {}) as Record<string, unknown>);
      }
      return await proxyCallTool(
        this.apiClient,
        name,
        (args ?? {}) as Record<string, unknown>,
      );
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      };
    }
  }

  private async handleIndexTool(
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const projectPath = args.projectPath as string | undefined;

    if (!projectPath) {
      return textContent(JSON.stringify({ success: false, error: "projectPath is required" }));
    }

    try {
      if (!(await fs.stat(projectPath)).isDirectory()) {
        return textContent(JSON.stringify({ success: false, error: `${projectPath} is not a directory` }));
      }
    } catch {
      return textContent(JSON.stringify({ success: false, error: `Path not found: ${projectPath}` }));
    }

    const files = await collectFiles(projectPath);

    if (files.length === 0) {
      return textContent(JSON.stringify({
        success: false,
        error: `No indexable files found in ${projectPath}`,
      }));
    }

    const response = await this.apiClient.uploadAndIndex({
      projectPath,
      projectId: args.projectId as string | undefined,
      forceReindex: args.forceReindex as boolean | undefined,
      warmCache: args.warmCache as boolean | undefined,
      warmupQueries: args.warmupQueries as string[] | undefined,
      files,
    });

    return textContent(JSON.stringify(response, null, 2));
  }

  async start(): Promise<void> {
    // Check API health before starting
    // Silence output: MCP protocol is pure JSON-RPC on stdout; any preamble breaks handshakes.
    const healthy = await this.apiClient.healthCheck();
    // Health check failures are logged via stderr by the client; no need to duplicate.

    await this.server.connect(this.transport);
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}

// Main
if (import.meta.main) {
  const client = new McpProxyServer();

  client.start().catch((error) => {
    console.error("Failed to start MCP client:", error);
    process.exit(1);
  });

  process.on("SIGINT", async () => {
    await client.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await client.close();
    process.exit(0);
  });
}
