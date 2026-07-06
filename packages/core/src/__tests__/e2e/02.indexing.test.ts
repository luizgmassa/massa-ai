/**
 * T2 — Indexing & project lifecycle (E2E, live stack).
 *
 * Covers: index, index_status, reindex, reset_project — over HTTP (Tools API)
 * and the MCP subprocess (matrix parity where both transports support the
 * same operation).
 *
 * Backend: SQLite (not postgres). No auth. All projectIds are scoped to the
 * e2e-th0th- prefix and reset in afterAll.
 *
 * KNOWN PRODUCT LIMITATIONS (asserted defensively, not worked around):
 *  - Job-tracker terminal-state contract (Batch D fix): indexJobTracker now
 *    reliably reaches completed/failed once the ETL resolves (pipeline emits a
 *    belt-and-suspenders setResult, non-terminal jobs are never evicted, and
 *    durable-store write failures are logged). F9b asserts this. The DATA-PLANE
 *    isSearchable probe (/project/list documentCount, search hits, symbol defs)
 *    remains the AUTHORITATIVE "indexed" check because an OOM crash mid-flight
 *    can still leave a job that never resolves — see the shared-index strategy
 *    residual in COVERAGE.md. The tracker's progress OBJECT SHAPE is asserted
 *    in F8.
 *  - SearchProjectTool defaults to format:"toon" → the HTTP body is
 *    {success:true, data:"<string>"}; we pass format:"json" so data.results is
 *    a real array we can count.
 *  - The qwen3-embedding:8b model is slow (~40s per query embed on this host)
 *    and Ollama wedges under concurrent indexing. To keep the suite stable we
 *    perform exactly ONE full index (in beforeAll) and verify its outcome
 *    thoroughly; F2/F3/F4 assert the index REQUEST is accepted (jobId
 *    returned) without awaiting another multi-minute re-index.
 *  - The MCP subprocess can drop after long idle periods during the heavy
 *    indexing; matrix blocks start a FRESH MCP handle just-in-time.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  E2E_ENABLED,
  probeAvailability,
  httpGet,
  httpPost,
  httpRaw,
  pollUntil,
  resetProject,
  assertE2ePrefix,
  assertMatrix,
  PROJECT_PATH,
  PREFIX,
  RUN_STAMP,
} from "./_helpers";
import { startMcp, mcpCall, requireTool, type McpHandle } from "./_mcp";

const PID = `${PREFIX}index-${RUN_STAMP}`;
assertE2ePrefix(PID);

const READY = await (async () => {
  if (!E2E_ENABLED) return false;
  const a = await probeAvailability();
  return a.API_UP && a.OLLAMA_UP;
})();

/**
 * Data-plane completion: poll /project/list until PID shows a stable,
 * non-zero documentCount (the ETL has finished writing embeddings). Two
 * consecutive identical, non-zero samples => settled.
 */
async function awaitIndexedData(
  projectId: string,
  { timeoutMs = 420_000, intervalMs = 5_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<number> {
  let prev = -1;
  let stableSince = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await httpGet<any>("/api/v1/project/list");
    const projects = list?.data?.projects ?? [];
    const mine = projects.find((p: any) => p.projectId === projectId);
    const docs = mine?.documentCount ?? 0;
    if (docs > 0) {
      if (docs === prev) {
        stableSince++;
        if (stableSince >= 1) return docs;
      } else {
        stableSince = 0;
      }
      prev = docs;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `awaitIndexedData(${projectId}) never stabilized within ${timeoutMs}ms (last docs=${prev})`,
  );
}

/** Run a single search (format=json) and return the hit count. */
async function searchHits(projectId: string, query: string): Promise<number> {
  const r = await httpPost<any>("/api/v1/search/project", {
    query,
    projectId,
    maxResults: 5,
    format: "json",
  });
  return r?.data?.results?.length ?? 0;
}

describe.skipIf(!READY)("T2 indexing & project lifecycle", () => {
  let mcp: McpHandle;
  let primaryJobId: string;
  let primaryDocs: number;

  // ONE shared full index for the whole suite. Subsequent tests assert
  // request acceptance rather than re-running a multi-minute ETL.
  beforeAll(async () => {
    mcp = await startMcp();
    requireTool(mcp.toolNames, "index");
    requireTool(mcp.toolNames, "index_status");
    requireTool(mcp.toolNames, "reindex");
    requireTool(mcp.toolNames, "reset_project");

    const start = await httpPost<any>("/api/v1/project/index", {
      projectPath: PROJECT_PATH,
      projectId: PID,
      forceReindex: true,
      warmCache: false,
    });
    primaryJobId = start?.data?.jobId;
    primaryDocs = await awaitIndexedData(PID, { timeoutMs: 420_000 });
  }, 480_000);

  afterAll(async () => {
    try {
      await resetProject(PID);
    } catch {
      /* best-effort */
    }
    if (mcp) await mcp.stop();
  }, 60_000);

  // ── index ───────────────────────────────────────────────────────────────

  test(
    "F1: full index of self repo via HTTP returns {data:{jobId}} and data lands",
    async () => {
      // The beforeAll index is the canonical run; assert its contract here.
      expect(primaryJobId).toEqual(expect.any(String));
      expect(primaryDocs).toBeGreaterThan(0);

      // Re-fetch the start-time status to confirm the initial envelope shape.
      const s = await httpGet<any>(`/api/v1/project/index/status/${primaryJobId}`);
      expect(s?.data?.jobId).toBe(primaryJobId);
      expect(s?.data?.projectId).toBe(PID);
    },
    30_000,
  );

  test(
    "F2: forceReindex:true reindexes (data settles after wipe + re-index)",
    async () => {
      await resetProject(PID);
      const start = await httpPost<any>("/api/v1/project/index", {
        projectPath: PROJECT_PATH,
        projectId: PID,
        forceReindex: true,
        warmCache: false,
      });
      expect(start?.success).toBe(true);
      expect(start?.data?.jobId).toEqual(expect.any(String));
      expect(start?.data?.status).toBe("started");
      // Await full settle so the background ETL is done before later searches
      // (concurrent embedding would wedge Ollama for the search tests).
      const docs = await awaitIndexedData(PID, { timeoutMs: 420_000 });
      expect(docs).toBeGreaterThan(0);
    },
    480_000,
  );

  test(
    "F3: warmCache:true accepted and data settles",
    async () => {
      const start = await httpPost<any>("/api/v1/project/index", {
        projectPath: PROJECT_PATH,
        projectId: PID,
        forceReindex: true,
        warmCache: true,
      });
      expect(start?.success).toBe(true);
      expect(start?.data?.jobId).toEqual(expect.any(String));
      expect(start?.data?.status).toBe("started");
      await awaitIndexedData(PID, { timeoutMs: 420_000 });
    },
    480_000,
  );

  test(
    "F4: custom warmupQueries accepted and data settles",
    async () => {
      const start = await httpPost<any>("/api/v1/project/index", {
        projectPath: PROJECT_PATH,
        projectId: PID,
        forceReindex: true,
        warmCache: true,
        warmupQueries: ["embedding index pipeline", "symbol graph centrality"],
      });
      expect(start?.success).toBe(true);
      expect(start?.data?.jobId).toEqual(expect.any(String));
      await awaitIndexedData(PID, { timeoutMs: 420_000 });
    },
    480_000,
  );

  test(
    "F5: missing projectPath (MCP index) -> {success:false, ...projectPath is required}",
    async () => {
      const r = await mcpCall(mcp.client, "index", { projectId: PID });
      expect(r?.success).toBe(false);
      expect(String(r?.error ?? "")).toMatch(/projectPath is required/i);
    },
    15_000,
  );

  test(
    "F6: non-directory path (MCP index) -> error",
    async () => {
      const r = await mcpCall(mcp.client, "index", {
        projectPath: "/dev/null/this/is/a/file",
        projectId: PID,
      });
      expect(r?.success).toBe(false);
      expect(String(r?.error ?? "")).toMatch(/not a directory|Path not found/i);
    },
    15_000,
  );

  test(
    "F7: empty dir (MCP index) -> No indexable files",
    async () => {
      const fs = await import("fs/promises");
      const os = await import("os");
      const path = await import("path");
      const emptyDir = path.join(
        os.tmpdir(),
        `e2e-empty-${RUN_STAMP}-${Math.random().toString(36).slice(2)}`,
      );
      await fs.mkdir(emptyDir, { recursive: true });
      try {
        const r = await mcpCall(mcp.client, "index", {
          projectPath: emptyDir,
          projectId: `${PREFIX}empty-${RUN_STAMP}`,
        });
        expect(r?.success).toBe(false);
        expect(String(r?.error ?? "")).toMatch(/No indexable files/i);
      } finally {
        await fs.rm(emptyDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    30_000,
  );

  // ── index_status ────────────────────────────────────────────────────────

  test(
    "F8: index_status exposes progress {current,total,percentage}",
    async () => {
      const s = await httpGet<any>(`/api/v1/project/index/status/${primaryJobId}`);
      expect(s?.success).toBe(true);
      expect(s?.data?.jobId).toBe(primaryJobId);
      const progress = s?.data?.progress;
      expect(progress).toEqual(
        expect.objectContaining({
          current: expect.any(Number),
          total: expect.any(Number),
          percentage: expect.any(Number),
        }),
      );
      expect(["pending", "running", "completed", "failed"]).toContain(s?.data?.status);
    },
    15_000,
  );

  test(
    "F9: unknown / empty jobId -> not-found (no throw, {success:false} or 4xx)",
    async () => {
      const unknown = await httpGet<any>(
        "/api/v1/project/index/status/nonexistent-job-id-" + RUN_STAMP,
      );
      expect(unknown?.success).toBe(false);

      const raw = await httpRaw("/api/v1/project/index/status/");
      expect(raw.ok).toBe(false);
      expect(raw.status).toBeGreaterThanOrEqual(400);
    },
    15_000,
  );

  test(
    "F9b: index_status reaches a TERMINAL state (completed/failed) after a real index job — job-tracker contract",
    async () => {
      // Job-tracker reliability contract (Batch D): once the ETL has finished
      // (the data plane already settled in beforeAll via awaitIndexedData), the
      // tracker MUST surface a terminal status — not stay pinned at "running".
      // This is independent of the isSearchable data-plane probe (F10), which
      // remains the authoritative "indexed" check. Here we assert the
      // job-tracker state machine specifically.
      expect(primaryJobId).toEqual(expect.any(String));

      const terminal = await pollUntil(
        async () => {
          const s = await httpGet<any>(
            `/api/v1/project/index/status/${primaryJobId}`,
          );
          const status = s?.data?.status;
          if (status === "completed" || status === "failed") return true;
          return false;
        },
        { timeoutMs: 60_000, intervalMs: 3_000 },
      );

      expect(terminal).toBe(true);

      const s = await httpGet<any>(
        `/api/v1/project/index/status/${primaryJobId}`,
      );
      expect(["completed", "failed"]).toContain(s?.data?.status);
      // On a successful terminal, percentage must be 100 and/or completedAt set.
      if (s?.data?.status === "completed") {
        const pct = s?.data?.progress?.percentage;
        const completedAt = s?.data?.completedAt;
        expect(pct === 100 || completedAt != null).toBe(true);
      }
    },
    90_000,
  );

  test(
    "F10: indexed data is searchable (data-plane completion proof)",
    async () => {
      // Search embeds the query through qwen3-embedding:8b (~tens of seconds
      // on this host). Poll up to 120s for the first hit.
      const searchable = await pollUntil(
        async () => (await searchHits(PID, "embedding vector search")) > 0,
        { timeoutMs: 120_000, intervalMs: 5_000 },
      );
      expect(searchable).toBe(true);
    },
    150_000,
  );

  // ── reindex ─────────────────────────────────────────────────────────────

  test(
    "F11: reindex {id} on indexed workspace returns a job (HTTP) and data persists",
    async () => {
      const r = await httpPost<any>(
        `/api/v1/workspace/${encodeURIComponent(PID)}/reindex`,
        { projectPath: PROJECT_PATH },
      );
      expect(r?.success).toBe(true);
      expect(r?.data?.jobId).toEqual(expect.any(String));
      // Await settle so the background ETL is finished before later tests
      // (avoids wedging Ollama during the matrix/search blocks).
      const docs = await awaitIndexedData(PID, { timeoutMs: 420_000 });
      expect(docs).toBeGreaterThan(0);
    },
    480_000,
  );

  test(
    "F12: reindex with missing projectPath -> clean failure (4xx)",
    async () => {
      const r = await httpRaw(
        `/api/v1/workspace/${encodeURIComponent(PID)}/reindex`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      expect(r.ok).toBe(false);
      expect(r.status).toBeGreaterThanOrEqual(400);
    },
    15_000,
  );

  // ── reset_project ───────────────────────────────────────────────────────

  test(
    "F13: full reset zeroes vectors — search returns no hits",
    async () => {
      // Pre-condition: search finds something on the shared index.
      const hadHits = await pollUntil(
        async () => (await searchHits(PID, "embedding")) > 0,
        { timeoutMs: 120_000, intervalMs: 5_000 },
      );
      expect(hadHits).toBe(true);

      const reset = await resetProject(PID);
      expect(reset?.success).toBe(true);

      // After the wipe, search must return 0 hits (allow time for cache
      // invalidation to propagate).
      const empty = await pollUntil(
        async () => (await searchHits(PID, "embedding")) === 0,
        { timeoutMs: 90_000, intervalMs: 4_000 },
      );
      expect(empty).toBe(true);
    },
    300_000,
  );

  test(
    "F14: partial reset clearVectors:true / clearSymbols:false preserves symbols",
    async () => {
      // F13 wiped everything. Re-seed — but ONLY await symbols this time
      // (vectors are not needed for the symbol-graph assertion and we want to
      // avoid a full embedding pass wedging Ollama). Symbols are written in
      // the ETL resolve stage, which runs early.
      await httpPost<any>("/api/v1/project/index", {
        projectPath: PROJECT_PATH,
        projectId: PID,
        forceReindex: true,
      });
      // Poll symbol/definitions until non-empty.
      const symbolsOk = await pollUntil(
        async () => {
          const d = await httpGet<any>("/api/v1/symbol/definitions", {
            projectId: PID,
            limit: "5",
          });
          return (d?.data?.definitions?.length ?? 0) > 0;
        },
        { timeoutMs: 300_000, intervalMs: 5_000 },
      );
      expect(symbolsOk).toBe(true);

      // Reset vectors only — keep symbols.
      const partial = await resetProject(PID, {
        clearVectors: true,
        clearSymbols: false,
        clearMemories: true,
      });
      expect(partial?.success).toBe(true);

      // symbol/definitions is served from the symbol graph, which we kept.
      const defs = await httpGet<any>("/api/v1/symbol/definitions", {
        projectId: PID,
        limit: "5",
      });
      expect(defs?.success).toBe(true);
      expect((defs?.data?.definitions ?? []).length).toBeGreaterThan(0);
    },
    360_000,
  );

  test(
    "F15: reset unknown id is a no-op success",
    async () => {
      const unknown = `${PREFIX}no-such-project-${RUN_STAMP}`;
      const r = await resetProject(unknown);
      expect(r?.success).toBe(true);
    },
    15_000,
  );

  // ── Matrix (MCP ≡ HTTP) ──────────────────────────────────────────────────
  //
  // Each matrix block starts a FRESH MCP handle. The earlier heavy indexing
  // can idle the MCP subprocess long enough for the stdio transport to drop.

  test(
    "matrix: index_status (HTTP vs MCP) on a shared jobId — shape parity",
    async () => {
      // Reuse the primary jobId from beforeAll — no new background ETL.
      const jobId = primaryJobId;
      expect(jobId).toEqual(expect.any(String));

      const fresh = await startMcp();
      try {
        const httpStatus = await httpGet<any>(`/api/v1/project/index/status/${jobId}`);
        const mcpStatus = await mcpCall(fresh.client, "index_status", { jobId });
        assertMatrix(httpStatus, mcpStatus, { dropKeys: ["elapsedMs"] }, "index_status");
      } finally {
        await fresh.stop();
      }
    },
    30_000,
  );

  test(
    "matrix: reindex via MCP returns {success:true} + jobId (functional POST with projectPath)",
    async () => {
      // MCP reindex tool now posts {id, projectPath} — the proxy substitutes
      // :id and the route's t.Object({projectPath}) body is satisfied. Assert
      // a real reindex result (success + a jobId), then await settle so the
      // background ETL is finished before later tests.
      const fresh = await startMcp();
      let mcpR: any;
      try {
        mcpR = await mcpCall(fresh.client, "reindex", {
          id: PID,
          projectPath: PROJECT_PATH,
        });
      } finally {
        await fresh.stop();
      }

      expect(mcpR?.success).toBe(true);
      expect(mcpR?.data?.jobId).toEqual(expect.any(String));

      // Await the MCP-triggered reindex so Ollama is free for F14.
      const docs = await awaitIndexedData(PID, { timeoutMs: 420_000 });
      expect(docs).toBeGreaterThan(0);
    },
    480_000,
  );

  test(
    "matrix: reset_project returns {success:true} on both transports",
    async () => {
      const httpR = await resetProject(PID);
      expect(httpR?.success).toBe(true);

      const fresh = await startMcp();
      let mcpR: any;
      try {
        mcpR = await mcpCall(fresh.client, "reset_project", {
          projectId: PID,
          clearVectors: true,
          clearSymbols: true,
          clearMemories: true,
        });
      } finally {
        await fresh.stop();
      }
      expect(mcpR?.success).toBe(true);

      assertMatrix(
        { success: httpR.success },
        { success: mcpR.success },
        {},
        "reset_project.success",
      );
    },
    60_000,
  );
});
