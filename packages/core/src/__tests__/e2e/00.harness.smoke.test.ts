/**
 * T1 smoke — proves the E2E harness end-to-end:
 *   1. HTTP transport reaches the live API.
 *   2. MCP subprocess boots, advertises all 35 tools.
 *   3. Matrix machinery holds for a read-only tool (list_projects).
 *
 * Skipped unless RUN_E2E=1, the API is up, the MCP dist is built, and the
 * massa-th0th config exists (stdout-corruption precondition).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  E2E_ENABLED,
  probeAvailability,
  httpGet,
  assertMatrix,
  type Availability,
} from "./_helpers";
import { startMcp, mcpCall, type McpHandle } from "./_mcp";

// The 35 tools declared in apps/mcp-client/src/tool-definitions.ts
const EXPECTED_TOOLS = [
  "index", "index_status", "search", "remember", "recall",
  "memory_update", "memory_delete", "list_checkpoints", "create_checkpoint", "restore_checkpoint",
  "compress", "optimized_context", "analytics", "list_projects", "project_map",
  "search_definitions", "get_references", "go_to_definition", "reset_project", "read_file",
  "synapse_session", "synapse_prime", "synapse_access", "symbol_snippet", "memory_list",
  "reindex", "hook_ingest", "bootstrap", "handoff_begin", "handoff_accept",
  "handoff_cancel", "handoff_list_pending", "list_proposals", "approve_proposal", "reject_proposal",
];

let avail: Availability;
let mcp: McpHandle | null = null;

const READY = await (async () => {
  if (!E2E_ENABLED) return false;
  const a = await probeAvailability();
  return a.API_UP && !!a.MCP_BIN && a.CONFIG_OK;
})();

describe.skipIf(!READY)("T1 harness smoke", () => {
  beforeAll(async () => {
    avail = await probeAvailability();
    mcp = await startMcp();
  }, 60_000);

  afterAll(async () => {
    if (mcp) await mcp.stop();
  });

  test("HTTP /health reports ok", async () => {
    const res = await httpGet<any>("/health");
    expect(res.status).toBe("ok");
    expect(res.service).toBe("massa-th0th-tools-api");
  }, 10_000);

  test("MCP advertises all 35 tools", async () => {
    expect(mcp).not.toBeNull();
    const names = mcp!.toolNames;
    expect(names.length).toBeGreaterThanOrEqual(EXPECTED_TOOLS.length);
    const missing = EXPECTED_TOOLS.filter((n) => !names.includes(n));
    expect(missing).toEqual([]);
  }, 10_000);

  test("matrix: MCP list_projects ≡ HTTP /workspace/list", async () => {
    const http = await httpGet<any>("/api/v1/workspace/list");
    const viaMcp = await mcpCall(mcp!.client, "list_projects", { status: "all" });
    // list_projects is bucket C (no format param, always JSON): proxy returns
    // the full {success,data} envelope — directly comparable to HTTP.
    assertMatrix(http, viaMcp, { dropKeys: ["workspaces"] }, "list_projects");
  }, 15_000);

  test("availability probe captured backend + ollama", () => {
    expect(avail.BACKEND).not.toBe("unknown");
    // Info only — does not fail the suite.
    console.log(`[T1] backend=${avail.BACKEND} ollama=${avail.OLLAMA_UP} auth=${avail.AUTH_REQUIRED} model=${avail.EMBEDDING_MODEL}`);
  }, 5_000);
});
