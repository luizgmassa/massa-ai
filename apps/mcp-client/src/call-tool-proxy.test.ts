import { describe, expect, test } from "bun:test";
import { proxyCallTool } from "./call-tool-proxy.js";

const projectId = "transport-project";
const legacyFqn = "src/service.ts#run";
const modernFqn = `src/service.ts#Service.run~method~${"a".repeat(64)}`;
const candidates = [{
  fqn: modernFqn,
  file: "src/service.ts",
  name: "run",
  displayName: "Service.run",
  qualifiedName: "Service.run",
  kind: "method",
  signatureHash: "a".repeat(64),
}];

const identities = {
  resolved: { status: "resolved", fqn: modernFqn },
  missing: { status: "missing", query: legacyFqn },
  ambiguous: { status: "ambiguous", legacyFqn, candidates },
} as const;

const structuralTools = [
  {
    name: "go_to_definition",
    args: { projectId, symbolName: legacyFqn },
    data: (identity: unknown) => ({ identity, definitions: [] }),
  },
  {
    name: "get_references",
    args: { projectId, symbolName: "run", fqn: legacyFqn },
    data: (identity: unknown) => ({ identity, references: [] }),
  },
  {
    name: "trace_path",
    args: { projectId, qualifiedName: legacyFqn },
    data: (identity: unknown) => ({ found: false, identity }),
  },
] as const;

describe("MCP CallTool structural transport", () => {
  test("preserves resolved, missing, and ambiguous HTTP payloads exactly for all graph consumers", async () => {
    for (const tool of structuralTools) {
      for (const identity of Object.values(identities)) {
        const httpResponse = { success: true, data: tool.data(identity) };
        const calls: Array<{ endpoint: string; params?: Record<string, unknown> }> = [];
        const result = await proxyCallTool({
          get: async (endpoint, params) => {
            calls.push({ endpoint, params });
            return httpResponse;
          },
          post: async () => { throw new Error("structural tools must use GET"); },
        }, tool.name, tool.args);

        expect(calls).toHaveLength(1);
        expect(JSON.parse(result.content[0]!.text)).toEqual(httpResponse);
      }
    }
  });

  test("preserves durable index diagnostics and generation identity exactly", async () => {
    const httpResponse = {
      success: true,
      data: {
        jobId: "job-21",
        projectId,
        status: "completed",
        result: {
          filesIndexed: 3,
          chunksIndexed: 4,
          errors: 27,
          duration: 42,
          activatedGraphGenerationId: "generation-active",
          parserDiagnostics: {
            diagnosticsCount: 27,
            recoveredFiles: 2,
            hardFailureFiles: 3,
            staleFiles: 1,
            languages: { typescript: 2, vue: 1 },
          },
        },
      },
    };
    const calls: Array<{ endpoint: string; params?: Record<string, unknown> }> = [];
    const result = await proxyCallTool({
      get: async (endpoint, params) => {
        calls.push({ endpoint, params });
        return httpResponse;
      },
      post: async () => { throw new Error("index_status must use GET"); },
    }, "index_status", { jobId: "job-21" });

    expect(calls).toEqual([{ endpoint: "/api/v1/project/index/status/job-21", params: {} }]);
    expect(JSON.parse(result.content[0]!.text)).toEqual(httpResponse);
  });

  test("serializes operational API failures instead of fabricating identity data", async () => {
    for (const tool of structuralTools) {
      const result = await proxyCallTool({
        get: async () => { throw new Error("upstream unavailable"); },
        post: async () => { throw new Error("unexpected POST"); },
      }, tool.name, tool.args);
      expect(JSON.parse(result.content[0]!.text)).toEqual({
        success: false,
        error: "upstream unavailable",
      });
    }
  });
});
