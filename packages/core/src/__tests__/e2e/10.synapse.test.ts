/**
 * T7 — Synapse (E2E, live stack).
 *
 * Covers the Synapse session lifecycle + working-memory buffer against the
 * RUNNING Tools API and the MCP subprocess. Synapse sessions are in-memory
 * (not persisted across API restart), so every scenario is self-contained
 * within this process.
 *
 * Scenarios: F74–F80, edges E16–E20 + E28 schema drift, matrix equivalence.
 *
 * Gating: synapse itself needs only the API (no embeddings), so the top-level
 * gate is API_UP. Sub-describes that run search-with-session additionally gate
 * on OLLAMA_UP — but the core session/prime/access/lifecycle scenarios here do
 * not run search, so they run under API_UP alone.
 *
 * Real product bugs surfaced (skipped + printed, NOT worked around):
 *   - BUG-SYN-4 (DOMINANT): The MCP proxy (apps/mcp-client/src/index.ts:171)
 *     does NOT substitute `:id` path params for POST requests — only GET. So
 *     synapse_prime and synapse_access POST to the literal path
 *     "/api/v1/synapse/session/:id/...", Elysia binds params.id=":id", the
 *     registry never finds it, and both tools are NON-FUNCTIONAL via MCP.
 *     Probed live; matrix equivalence for prime/access skipped with reason.
 *   - BUG-SYN-1: MCP `synapse_prime` inputSchema declares `results` but the
 *     API route requires `entries` → even after BUG-SYN-4 is fixed, every MCP
 *     prime call 422s (schema/handler mismatch, additionalProperties:false).
 *   - BUG-SYN-2: MCP `synapse_access` inputSchema marks only `id` required;
 *     the route requires `memoryId`. An MCP client that omits memoryId (which
 *     the schema permits) triggers a route 422 (wrapped by the proxy, but the
 *     schema's required-array should include memoryId).
 *   - BUG-SYN-3 (drift E28): MCP `synapse_session` inputSchema documents
 *     `ttlMs` default as 900000 (15 min), but the route applies the registry's
 *     defaultTtlMs of 3_600_000 (1 hour). Asserted in E28.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  API,
  API_KEY,
  E2E_ENABLED,
  probeAvailability,
  httpGet,
  httpPost,
  normalize,
  assertMatrix,
} from "./_helpers";
import { startMcp, mcpCall, requireTool, type McpHandle } from "./_mcp";

// ── Gating ──────────────────────────────────────────────────────────────────
const READY = await (async () => {
  if (!E2E_ENABLED) return false;
  const a = await probeAvailability();
  return a.API_UP;
})();

// ── HTTP helpers (raw, so we can inspect status codes for validation paths) ─
function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (API_KEY) h["x-api-key"] = API_KEY;
  return h;
}

async function httpJson(
  method: string,
  endpoint: string,
  body?: unknown,
  timeoutMs = 60_000,
): Promise<{ status: number; json: any; ok: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${endpoint}`, {
      method,
      headers: apiHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: text };
    }
    return { status: res.status, json, ok: res.ok };
  } finally {
    clearTimeout(timer);
  }
}

// Small unique id generator scoped to this test process.
let _seq = 0;
function uniqId(prefix = "syn"): string {
  _seq += 1;
  return `${prefix}_e2e_${Date.now().toString(36)}_${_seq}`;
}

// ── Constants derived from source (used by E28 drift assertions) ────────────
const REGISTRY_DEFAULT_TTL_MS = 3_600_000; // session-registry.ts defaultTtlMs
const MCP_ADVERTISED_TTL_MS = 900_000; // tool-definitions.ts synapse_session ttlMs default
const BUFFER_DEFAULT_MAX_SIZE = 20; // working-memory-buffer.ts DEFAULT_BUFFER_CONFIG.maxSize

// ── MCP handle (started lazily for matrix tests) ────────────────────────────
let mcp: McpHandle | null = null;
beforeAll(async () => {
  if (!READY) return;
  try {
    mcp = await startMcp();
  } catch (e) {
    console.log("[T7] MCP start failed; matrix leg will be skipped:", String(e).slice(0, 200));
    mcp = null;
  }
});

afterAll(async () => {
  if (mcp) {
    await mcp.stop();
    mcp = null;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!READY)("T7 — Synapse session lifecycle (HTTP)", () => {
  // F74 — create returns sessionId; "resume" with explicit sessionId is a
  // create-with-override (echo same id), NOT an idempotent resume.
  test("F74: POST /session creates a session and echoes the generated sessionId", async () => {
    const { status, json } = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-agent",
      taskContext: "F74 create",
      workspaceId: "t7-ws",
    });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    const data = json.data;
    expect(typeof data.sessionId).toBe("string");
    expect(data.sessionId.startsWith("syn_")).toBe(true);
    expect(data.agentId).toBe("t7-agent");
    expect(data.workspaceId).toBe("t7-ws");
    expect(data.taskContext).toBe("F74 create");
    expect(typeof data.createdAt).toBe("number");
    expect(typeof data.expiresAt).toBe("number");
    expect(data.expiresAt).toBeGreaterThan(data.createdAt);
    expect(data.accessHistorySize).toBe(0);
    expect(data.bufferEnabled).toBe(true);
  });

  test("F74: POST /session with explicit sessionId echoes that id (create-with-override)", async () => {
    const explicit = uniqId("syn");
    const { status, json } = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-agent",
      sessionId: explicit,
    });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.sessionId).toBe(explicit);
  });

  test("F74-probe: resuming an EXISTING sessionId is NOT idempotent — it 500s", async () => {
    // Documented behavior, not a bug: registry.create throws on duplicate id.
    const id = uniqId("syn");
    const first = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-agent",
      sessionId: id,
    });
    expect(first.json.success).toBe(true);

    const second = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-agent",
      sessionId: id,
    });
    // The route does not catch the duplicate error → Elysia surfaces HTTP 500.
    expect(second.status).toBe(500);
    // Body is a plain string, not JSON — surfaced via _raw.
    const bodyText = String(second.json?._raw ?? second.json ?? "");
    expect(bodyText).toContain("Session already exists");
  });

  // F75 — stored fields are readable via GET.
  test("F75: GET /session/:id returns the stored agentId/workspaceId/taskContext", async () => {
    const created = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-readback",
      workspaceId: "t7-ws-readback",
      taskContext: "readback scenario",
      ttlMs: 60_000,
    });
    const sid = created.json.data.sessionId;

    const got = await httpJson("GET", `/api/v1/synapse/session/${sid}`);
    expect(got.status).toBe(200);
    expect(got.json.success).toBe(true);
    const data = got.json.data;
    expect(data.sessionId).toBe(sid);
    expect(data.agentId).toBe("t7-readback");
    expect(data.workspaceId).toBe("t7-ws-readback");
    expect(data.taskContext).toBe("readback scenario");
    // ttlMs is honored: expiresAt - createdAt ≈ 60s (tolerate clock drift).
    const ttl = data.expiresAt - data.createdAt;
    expect(ttl).toBeGreaterThan(55_000);
    expect(ttl).toBeLessThan(70_000);
  });

  test("F75-edge: GET /session/:id on a missing session returns 200 + success:false (no HTTP error)", async () => {
    const got = await httpJson("GET", "/api/v1/synapse/session/syn_definitely_missing_xyz");
    expect(got.status).toBe(200);
    expect(got.json.success).toBe(false);
    expect(typeof got.json.error).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!READY)("T7 — synapse_prime (HTTP)", () => {
  // F76 — prime seeds the buffer.
  test("F76: POST /prime seeds the buffer → {primed, bufferSize}", async () => {
    const created = await httpJson("POST", "/api/v1/synapse/session", { agentId: "t7-prime" });
    const sid = created.json.data.sessionId;

    const primed = await httpJson("POST", `/api/v1/synapse/session/${sid}/prime`, {
      entries: [
        { id: "m1", content: "alpha memory", score: 0.8 },
        { id: "m2", content: "beta memory" }, // score defaults to 0.7
      ],
    });
    expect(primed.status).toBe(200);
    expect(primed.json.success).toBe(true);
    expect(primed.json.data.primed).toBe(2);
    expect(primed.json.data.bufferSize).toBe(2);
  });

  // F77 — prime on a missing/expired session id → success:false (no HTTP error).
  test("F77: prime on a missing session id → 200 + success:false", async () => {
    const r = await httpJson("POST", "/api/v1/synapse/session/syn_missing_prime/prime", {
      entries: [{ id: "m1", content: "x" }],
    });
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(false);
    expect(typeof r.json.error).toBe("string");
  });

  // E17 — prime on a session without a buffer.
  test("E17: prime on a session created with enableBuffer:false → success:false", async () => {
    const created = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-nobuf",
      enableBuffer: false,
    });
    const sid = created.json.data.sessionId;
    expect(created.json.data.bufferEnabled).toBe(false);

    const primed = await httpJson("POST", `/api/v1/synapse/session/${sid}/prime`, {
      entries: [{ id: "m1", content: "x" }],
    });
    expect(primed.status).toBe(200);
    expect(primed.json.success).toBe(false);
    expect(primed.json.error).toContain("no working-memory buffer");
  });

  // E18 — buffer eviction is observable: prime > maxSize entries, buffer bounds.
  test("E18: prime > maxSize entries → bufferSize bounded to maxSize (lowest-score eviction)", async () => {
    const created = await httpJson("POST", "/api/v1/synapse/session", { agentId: "t7-evict" });
    const sid = created.json.data.sessionId;

    const entries = Array.from({ length: BUFFER_DEFAULT_MAX_SIZE + 5 }, (_, i) => ({
      id: `e${i}`,
      content: `content-${i}`,
      score: 0.1 + i * 0.01, // ascending so the lowest 5 are evicted
    }));
    const primed = await httpJson("POST", `/api/v1/synapse/session/${sid}/prime`, { entries });
    expect(primed.status).toBe(200);
    expect(primed.json.success).toBe(true);
    expect(primed.json.data.primed).toBe(entries.length);
    expect(primed.json.data.bufferSize).toBe(BUFFER_DEFAULT_MAX_SIZE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!READY)("T7 — synapse_access (HTTP)", () => {
  // F78 — record access increments accessHistorySize.
  test("F78: POST /access records memoryId → accessHistorySize > 0", async () => {
    const created = await httpJson("POST", "/api/v1/synapse/session", { agentId: "t7-access" });
    const sid = created.json.data.sessionId;

    const r = await httpJson("POST", `/api/v1/synapse/session/${sid}/access`, { memoryId: "mem-A" });
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(r.json.data.accessHistorySize).toBe(1);

    // Second access on a different memoryId increments further.
    const r2 = await httpJson("POST", `/api/v1/synapse/session/${sid}/access`, {
      memoryId: "mem-B",
    });
    expect(r2.json.data.accessHistorySize).toBe(2);

    // Re-access of the same memoryId refreshes recency (LRU) but does not grow
    // the unique count.
    const r3 = await httpJson("POST", `/api/v1/synapse/session/${sid}/access`, {
      memoryId: "mem-A",
    });
    expect(r3.json.data.accessHistorySize).toBe(2);
  });

  // F79 — missing/expired session → success:false (asymmetric shape: data.error).
  test("F79: access on a missing session → 200 + success:false (data.error)", async () => {
    const r = await httpJson("POST", "/api/v1/synapse/session/syn_missing_access/access", {
      memoryId: "mem-X",
    });
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(false);
    // NOTE the asymmetric shape: the error message lives under data.error,
    // not top-level error (unique to the access route).
    expect(r.json.data).toBeDefined();
    expect(typeof r.json.data.error).toBe("string");
  });

  // E16 — access on an explicitly deleted session is a silent no-op.
  test("E16: access on a DELETED session → success:false (silent no-op)", async () => {
    const created = await httpJson("POST", "/api/v1/synapse/session", { agentId: "t7-del" });
    const sid = created.json.data.sessionId;

    const del = await httpJson("DELETE", `/api/v1/synapse/session/${sid}`);
    expect(del.status).toBe(200);
    expect(del.json.success).toBe(true);

    const after = await httpJson("POST", `/api/v1/synapse/session/${sid}/access`, {
      memoryId: "mem-after-del",
    });
    expect(after.status).toBe(200);
    expect(after.json.success).toBe(false);
    expect(after.json.data.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!READY)("T7 — HTTP-only lifecycle (F80)", () => {
  test("F80: PATCH updates taskContext; DELETE removes; GET /sessions lists; prefetch returns shape", async () => {
    // Create
    const created = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-lifecycle",
      taskContext: "initial",
    });
    const sid = created.json.data.sessionId;

    // PATCH updates taskContext
    const patched = await httpJson("PATCH", `/api/v1/synapse/session/${sid}`, {
      taskContext: "patched context",
    });
    expect(patched.status).toBe(200);
    expect(patched.json.success).toBe(true);
    expect(patched.json.data.taskContext).toBe("patched context");

    // GET reflects the patch
    const got = await httpJson("GET", `/api/v1/synapse/session/${sid}`);
    expect(got.json.data.taskContext).toBe("patched context");

    // GET /sessions returns an activeCount number
    const listed = await httpJson("GET", "/api/v1/synapse/sessions");
    expect(listed.status).toBe(200);
    expect(listed.json.success).toBe(true);
    expect(typeof listed.json.data.activeCount).toBe("number");
    expect(listed.json.data.activeCount).toBeGreaterThanOrEqual(1);

    // POST /prefetch returns a valid shape (no-topics path is fine here)
    const prefetch = await httpJson("POST", `/api/v1/synapse/session/${sid}/prefetch`, {
      filePath: "src/index.ts",
      entries: [{ id: "p1", content: "prefetched memory" }],
    });
    expect(prefetch.status).toBe(200);
    expect(prefetch.json.success).toBe(true);
    expect(prefetch.json.data).toBeDefined();
    // Plan may be enabled:false with no symbols; both shapes carry `primed`.
    expect(typeof prefetch.json.data.primed).toBe("number");

    // DELETE removes
    const del = await httpJson("DELETE", `/api/v1/synapse/session/${sid}`);
    expect(del.status).toBe(200);
    expect(del.json.success).toBe(true);

    // Subsequent GET → not-found
    const after = await httpJson("GET", `/api/v1/synapse/session/${sid}`);
    expect(after.status).toBe(200);
    expect(after.json.success).toBe(false);
  });

  test("F80-edge: PATCH on a missing session → 200 + success:false", async () => {
    const r = await httpJson("PATCH", "/api/v1/synapse/session/syn_missing_patch", {
      taskContext: "x",
    });
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(false);
    expect(typeof r.json.error).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!READY)("T7 — Schema drift (E28) + best-effort edges", () => {
  // E28 — ttlMs default divergence between MCP schema and the route.
  test("E28: omitting ttlMs yields the REGISTRY default (1h), NOT the MCP-advertised 15min", async () => {
    const created = await httpJson("POST", "/api/v1/synapse/session", { agentId: "t7-ttl" });
    const data = created.json.data;
    const ttl = data.expiresAt - data.createdAt;

    // The route applies registry.defaultTtlMs = 3_600_000 (1h), regardless of
    // what the MCP inputSchema advertises. Document the divergence.
    expect(ttl).toBeGreaterThanOrEqual(REGISTRY_DEFAULT_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(REGISTRY_DEFAULT_TTL_MS + 5_000);

    // And explicitly NOT the advertised 15min.
    expect(ttl).not.toBe(MCP_ADVERTISED_TTL_MS);

    console.log(
      `[T7:E28] ttlMs drift: MCP inputSchema advertises default ${MCP_ADVERTISED_TTL_MS}ms ` +
        `(15min), but the route applied registry defaultTtlMs=${REGISTRY_DEFAULT_TTL_MS}ms (1h). ` +
        `Observed ttl=${ttl}ms. Schema description in tool-definitions.ts is wrong.`,
    );
  });

  // E19 — TTL slide. updateTaskContext refreshes expiresAt to now+ttl. Best-effort.
  test("E19: PATCH slides expiresAt forward (sliding TTL)", async () => {
    const created = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-slide",
      ttlMs: 60_000,
    });
    const sid = created.json.data.sessionId;
    const before = created.json.data.expiresAt;

    // Wait a beat so now+ttl is measurably later.
    await new Promise((r) => setTimeout(r, 1500));

    const patched = await httpJson("PATCH", `/api/v1/synapse/session/${sid}`, {
      taskContext: "slid",
    });
    expect(patched.json.success).toBe(true);
    const after = patched.json.data.expiresAt;
    expect(after).toBeGreaterThan(before);
  });

  // E20 — matchThreshold/hitBoost are internal buffer config; not observable via
  // the synapse HTTP surface. Skip with a reason.
  test.skip("E20: matchThreshold/hitBoost effect on buffer hits (internal — not observable)", () => {
    // These config fields live on WorkingMemoryBufferConfig and influence the
    // post-retrieval pipeline (SynapseManager.process), not the synapse HTTP
    // routes. No HTTP endpoint exposes the boosted score or the match decision
    // directly — only search-with-session would surface it, and even there the
    // boost is folded into the final score with no separate flag. Asserting it
    // would require isolating a single buffer hit against a controlled query
    // embedding, which is not isolatable without waiting on slow embeddings and
    // a stable index. Skipping per the brief's best-effort guidance.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!READY)("T7 — Matrix equivalence (HTTP vs MCP)", () => {
  // synapse_session is bucket C (no format param) and works on both transports.
  test("matrix: synapse_session — HTTP ≡ MCP (bucket C, tolerate sessionId/expiresAt)", async () => {
    if (!mcp) {
      console.log("[T7:matrix:session] SKIP: MCP subprocess not available");
      return;
    }
    requireTool(mcp.toolNames, "synapse_session");

    const httpRes = await httpJson("POST", "/api/v1/synapse/session", {
      agentId: "t7-matrix-session",
      workspaceId: "t7-matrix-ws",
      taskContext: "matrix session",
      ttlMs: 120_000,
    });
    expect(httpRes.json.success).toBe(true);

    const mcpRes = await mcpCall(mcp.client, "synapse_session", {
      agentId: "t7-matrix-session",
      workspaceId: "t7-matrix-ws",
      taskContext: "matrix session",
      ttlMs: 120_000,
    });

    // Bucket C: compare directly after dropping volatile + transport-specific keys.
    // Drop sessionId (random), createdAt/expiresAt (clock), bufferSize/accessHistorySize
    // (timing-dependent), and the wrapper success flag (both true).
    assertMatrix(
      httpRes.json.data,
      mcpRes?.data ?? mcpRes,
      { dropKeys: ["sessionId", "createdAt", "expiresAt", "bufferSize", "accessHistorySize"] },
      "synapse_session",
    );
  });

  // BUG-SYN-4 (DOMINANT BLOCKER): The MCP proxy does not substitute `:id`
  // path params for POST requests. apps/mcp-client/src/index.ts:171 forwards
  // the LITERAL apiEndpoint ("/api/v1/synapse/session/:id/access") with the
  // full args object as the body. Elysia binds params.id = ":id" (literal),
  // the registry looks up a session whose id is ":id", and the caller's
  // args.id is silently dropped into the body and ignored.
  // → synapse_prime and synapse_access do NOT operate on the caller's session.
  // This probe proves it by verifying the real session's accessHistory does
  // NOT grow after the MCP access call.
  test("matrix probe: MCP synapse_access forwards literal :id path → real session untouched (BUG-SYN-4)", async () => {
    if (!mcp) {
      console.log("[T7:bug4-probe] SKIP: MCP subprocess not available");
      return;
    }
    requireTool(mcp.toolNames, "synapse_access");

    // Clean any leftover ":id" session from prior probes so the bug is not
    // masked by a false-positive hit on it.
    await httpJson("DELETE", "/api/v1/synapse/session/:id");

    // Create a fresh session and read its initial accessHistorySize.
    const session = await httpJson("POST", "/api/v1/synapse/session", { agentId: "t7-bug4" });
    const sid = session.json.data.sessionId;
    expect(session.json.success).toBe(true);
    const before = await httpJson("GET", `/api/v1/synapse/session/${sid}`);
    expect(before.json.data.accessHistorySize).toBe(0);

    // Call MCP access targeting this session.
    await mcpCall(mcp.client, "synapse_access", { id: sid, memoryId: "mem-bug4" });

    // Read the REAL session back. If the proxy worked, accessHistorySize = 1.
    // Under BUG-SYN-4 the MCP call hit a session whose id is ":id" (now none),
    // so the real session is untouched → still 0.
    const after = await httpJson("GET", `/api/v1/synapse/session/${sid}`);
    const realSize = after.json.data.accessHistorySize;
    expect(realSize).toBe(0);

    const detail =
      `MCP synapse_access called with id=${sid} did NOT record access on that session ` +
      `(real session accessHistorySize stayed 0). Root cause: apps/mcp-client/src/index.ts:171 ` +
      `calls apiClient.post(toolDef.apiEndpoint, args) WITHOUT substituting :id — the literal path ` +
      `"/api/v1/synapse/session/:id/access" is used, Elysia binds params.id=":id", the registry ` +
      `looks up a different session. args.id is dropped into the body and ignored.`;
    console.log(`[T7:BUG-SYN-4] ${detail}`);
  });

  // BUG-SYN-1: even if BUG-SYN-4 were fixed, MCP synapse_prime would still
  // 422 because the inputSchema declares `results` while the route requires
  // `entries`. Probe the schema mismatch live.
  test("matrix probe: MCP synapse_prime schema sends `results`, route requires `entries` (BUG-SYN-1)", async () => {
    if (!mcp) {
      console.log("[T7:bug1-probe] SKIP: MCP subprocess not available");
      return;
    }
    requireTool(mcp.toolNames, "synapse_prime");

    // Clean any leftover ":id" session so BUG-SYN-4 does not mask BUG-SYN-1.
    await httpJson("DELETE", "/api/v1/synapse/session/:id");

    const session = await httpJson("POST", "/api/v1/synapse/session", { agentId: "t7-bug1" });
    const sid = session.json.data.sessionId;

    // Use the schema-declared `results` key (per the published inputSchema).
    const mcpRes = await mcpCall(mcp.client, "synapse_prime", {
      id: sid,
      results: [{ id: "r1", content: "x", score: 0.5 }],
    });

    // Confirm the call did not succeed with a primed count. (It will fail —
    // either via BUG-SYN-4's "not found" first, or via 422 if both the path
    // were fixed. Either way: NOT a clean prime success.)
    const isCleanSuccess =
      mcpRes?.success === true && typeof mcpRes?.data?.primed === "number";
    expect(isCleanSuccess).toBe(false);

    const reason =
      "BUG-SYN-1: MCP synapse_prime inputSchema (apps/mcp-client/src/tool-definitions.ts:755-767) " +
      "declares the array property as `results`, but the API route " +
      "(apps/tools-api/src/routes/synapse.ts:180) requires `entries`. Even after BUG-SYN-4 " +
      "is fixed, an MCP client sending `{id, results:[...]}` (per the schema) would hit " +
      "Elysia 422 because the route's t.Object body requires `entries` and rejects unknown " +
      "keys (additionalProperties:false). The schema property name must be changed to " +
      "`entries`, or the route must accept both.";
    console.log(`[T7:BUG-SYN-1] ${reason}`);
    console.log(
      "[T7:BUG-SYN-1] MCP prime outcome:",
      JSON.stringify(mcpRes).slice(0, 300),
    );
  });

  // BUG-SYN-2: MCP synapse_access inputSchema marks only `id` required; the
  // route requires `memoryId`. The proxy DOES wrap the resulting 422 into a
  // clean {success:false, error} envelope (good), but the error message leaks
  // the raw Elysia validation JSON, proving the schema/route mismatch. Probe
  // it so the divergence is documented.
  test("matrix probe: MCP synapse_access without memoryId surfaces the route's required-field error (BUG-SYN-2)", async () => {
    if (!mcp) {
      console.log("[T7:bug2-probe] SKIP: MCP subprocess not available");
      return;
    }
    requireTool(mcp.toolNames, "synapse_access");

    const mcpRes = await mcpCall(mcp.client, "synapse_access", { id: "syn_any" });

    // The proxy wraps the 422 into { success:false, error:"API error 422: ..." }.
    // Assert the surfaced error references memoryId (proving the route's
    // required-field validation fired) — i.e. the schema permitted a call the
    // route rejects.
    const errText = String(mcpRes?.error ?? mcpRes?.data?.error ?? JSON.stringify(mcpRes));
    const referencesMemoryId =
      errText.includes("memoryId") || errText.includes("422") || errText.includes("validation");
    expect(referencesMemoryId).toBe(true);

    const reason =
      "BUG-SYN-2: MCP synapse_access inputSchema (apps/mcp-client/src/tool-definitions.ts:769-782) " +
      "marks only `id` as required, but the API route (synapse.ts:208-210) requires `memoryId`. " +
      "An MCP client that omits memoryId (which the schema permits) triggers an Elysia 422. " +
      "The proxy does wrap it as {success:false, error:\"API error 422: ...\"}, but the schema's " +
      "required-array should include `memoryId` so MCP clients cannot make a call the route rejects.";
    console.log(`[T7:BUG-SYN-2] ${reason}`);
    console.log("[T7:BUG-SYN-2] surfaced error:", errText.slice(0, 250));
  });

  // synapse_access matrix equivalence is blocked by BUG-SYN-4 (literal :id
  // path not substituted for POST). Skipping equivalence with a reason.
  test.skip("matrix: synapse_access — HTTP ≡ MCP (blocked by BUG-SYN-4)", () => {
    // BUG-SYN-4: MCP proxy POSTs to literal "/api/v1/synapse/session/:id/access"
    // without substituting the :id path param, so the session is never found.
    // See the BUG-SYN-4 probe above for the live repro. Equivalence impossible
    // until apps/mcp-client/src/index.ts substitutes path params for POST too.
  });

  // synapse_prime matrix equivalence is blocked by BOTH BUG-SYN-4 (path
  // substitution) AND BUG-SYN-1 (results vs entries). Skipping with a reason.
  test.skip("matrix: synapse_prime — HTTP ≡ MCP (blocked by BUG-SYN-4 + BUG-SYN-1)", () => {
    // See the BUG-SYN-4 and BUG-SYN-1 probes above. Two independent bugs block
    // MCP prime: the path param is not substituted, and even if it were, the
    // schema's `results` key is rejected by the route's `entries` requirement.
  });
});

// Always-on sanity: if E2E is disabled, surface a clear reason.
describe("T7 — gating", () => {
  test("RUN_E2E gating is reported", () => {
    if (!E2E_ENABLED) {
      console.log("[T7] SKIP entire suite: RUN_E2E != 1");
    }
    expect(true).toBe(true);
  });
});
