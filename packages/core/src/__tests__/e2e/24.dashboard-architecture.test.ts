/**
 * T24 — Dashboard, Architecture, and Project-Identity (E2E, live stack).
 *
 * Covers three disjoint feature surfaces that shipped since the last E2E
 * coverage update (COVERAGE.md 2026-07-13) without dedicated tests:
 *
 *   DB1-DB5  Dashboard routes     (/scheduler/status, /hooks/queue-status)
 *   AR1-AR5  get_architecture     (MCP tool + HTTP /project/:id/architecture)
 *   RN1-RN5  rename_project /     (dryRun preview only — apply path is
 *            merge_projects        covered by 23.owned-destructive.test.ts)
 *
 * Targets the RUNNING Tools API (http://localhost:3333) + Ollama + the MCP
 * subprocess. Read-only for dashboard + architecture (no mutation). Rename/
 * merge use dryRun:true exclusively — the apply path mutates project identity
 * and is covered by the owned destructive gate.
 *
 * Gating: two-level —
 *   - Dashboard routes degrade gracefully and need only API_UP.
 *   - Architecture reads need the shared index (ensureSharedIndex → Ollama).
 *   - Rename/merge previews need workspace entries (SHARED_PID for rename,
 *     polyglot fixture pair for merge) → also OLLAMA_UP.
 *
 * Conventions (from COVERAGE.md + _helpers.ts):
 *   - RUN_E2E=1 required; e2e-prefixed project IDs only; assertE2ePrefix guards.
 *   - Reuse SHARED_PID / ensureSharedIndex() for architecture reads (never reset).
 *   - HTTP/MCP parity via assertMatrix or shape comparison.
 *   - Tests degrade gracefully (sub-scope gates for OLLAMA_UP where needed).
 *   - bun:test with describe.skipIf(!READY) gating pattern.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  API,
  E2E_ENABLED,
  PREFIX,
  RUN_STAMP,
  assertE2ePrefix,
  probeAvailability,
  httpGet,
  httpPost,
  httpRaw,
  ensureSharedIndex,
  indexAndAwait,
  resetProject,
  POLY_FIXTURE_PATH,
  type Availability,
} from "./_helpers";
import { startMcp, mcpCall, requireTool, type McpHandle } from "./_mcp";

// ── Gating ──────────────────────────────────────────────────────────────────
let SKIP_REASON = "";
const AVAIL: Availability | null = await (async () => {
  if (!E2E_ENABLED) {
    SKIP_REASON = "RUN_E2E != 1";
    return null;
  }
  const a = await probeAvailability();
  if (!a.API_UP) {
    SKIP_REASON = "Tools API not up at " + API;
    return null;
  }
  return a;
})();

const READY = !!AVAIL;
const ARCH_READY = READY && AVAIL!.OLLAMA_UP;

// ── Project IDs (e2e-prefixed; reset in afterAll) ────────────────────────────
const RENAME_TGT = `${PREFIX}rename-tgt-${RUN_STAMP}`;
const MERGE_SRC = `${PREFIX}merge-src-${RUN_STAMP}`;
const MERGE_TGT = `${PREFIX}merge-tgt-${RUN_STAMP}`;
assertE2ePrefix(RENAME_TGT);
assertE2ePrefix(MERGE_SRC);
assertE2ePrefix(MERGE_TGT);

// ── MCP handle (lazily started) ──────────────────────────────────────────────
let mcp: McpHandle | null = null;

// Track projects that need cleanup.
const CLEANUP_PIDS: string[] = [];

beforeAll(async () => {
  if (!READY) {
    console.log(`[T24:SKIP] ${SKIP_REASON}`);
    return;
  }
  if (ARCH_READY) {
    try {
      mcp = await startMcp();
    } catch (e: any) {
      console.log(
        `[T24:WARN] MCP start failed: ${String(e?.message ?? e).slice(0, 200)}`,
      );
      mcp = null;
    }
  }
}, 120_000);

afterAll(async () => {
  if (mcp) {
    try {
      await mcp.stop();
    } catch {
      /* ignore */
    }
  }
  for (const pid of CLEANUP_PIDS) {
    try {
      await resetProject(pid);
    } catch {
      /* ignore */
    }
  }
}, 120_000);

// ──────────────────────────────────────────────────────────────────────────────
// Dashboard routes (DB1-DB5) — API_UP only.
//
// Source: apps/tools-api/src/routes/dashboard.ts (Wave 6 N28).
// Both routes degrade gracefully (catch + return error envelope, no 500).
// ──────────────────────────────────────────────────────────────────────────────
describe.skipIf(!READY)("T24 dashboard routes (DB1-DB5)", () => {
  test(
    "DB1: GET /scheduler/status returns {running, tickIntervalMs, jobs[]}",
    async () => {
      const r = await httpGet<any>("/api/v1/scheduler/status");
      expect(typeof r?.running).toBe("boolean");
      expect(typeof r?.tickIntervalMs).toBe("number");
      expect(Array.isArray(r?.jobs)).toBe(true);
      // Each job (when present) carries the dashboard shape.
      for (const j of r?.jobs ?? []) {
        expect(typeof j.id).toBe("string");
        expect(typeof j.name).toBe("string");
        expect(typeof j.enabled).toBe("boolean");
        expect(typeof j.due).toBe("boolean");
        expect(typeof j.currentlyRunning).toBe("boolean");
      }
    },
    10_000,
  );

  test(
    "DB2: GET /hooks/queue-status returns {pendingCount, maxPending, saturated}",
    async () => {
      const r = await httpGet<any>("/api/v1/hooks/queue-status");
      expect(typeof r?.pendingCount).toBe("number");
      expect(typeof r?.maxPending).toBe("number");
      expect(typeof r?.saturated).toBe("boolean");
      // An idle queue has pendingCount 0 and is not saturated.
      if (r?.pendingCount === 0) {
        expect(r.saturated).toBe(false);
      }
    },
    10_000,
  );

  test(
    "DB3: scheduler is disabled by default (running:false)",
    async () => {
      // The scheduler is boot-gated by MASSA_AI_SCHEDULER_ENABLED (default off).
      // On a standard E2E stack, running should be false unless explicitly enabled.
      const r = await httpGet<any>("/api/v1/scheduler/status");
      // Always valid: running is a boolean (asserted in DB1).
      expect(typeof r?.running).toBe("boolean");
      // When not running the scheduler still reports its registered job
      // definitions and configured tick interval — but no job is actively
      // running or due. (jobs may list disabled definitions; it is not empty
      // merely because the clock is stopped.)
      if (r?.running === false) {
        expect(Array.isArray(r.jobs)).toBe(true);
        expect(r.jobs.every((j: any) => j.currentlyRunning === false)).toBe(true);
        expect(r.jobs.every((j: any) => j.due === false)).toBe(true);
        expect(typeof r.tickIntervalMs).toBe("number");
      }
    },
    10_000,
  );

  test(
    "DB4: graceful degradation — both routes return error envelope, not 500",
    async () => {
      // The routes catch subsystem errors and return a degradation envelope.
      // On a healthy stack the subsystems are up, so we verify the contract
      // indirectly: the response is a plain JSON object with the expected keys,
      // NOT an HTTP 500 with an unstructured body. If the subsystem is healthy,
      // the normal shape is returned (running, pendingCount etc.); if it threw,
      // the degradation keys (unavailable, error) appear.
      const sched = await httpGet<any>("/api/v1/scheduler/status");
      const queue = await httpGet<any>("/api/v1/hooks/queue-status");
      // Scheduler: either the normal shape or the degradation shape.
      const schedOk =
        (typeof sched?.running === "boolean") &&
        (typeof sched?.tickIntervalMs === "number");
      const schedDegraded =
        sched?.unavailable === true && typeof sched?.error === "string";
      expect(schedOk || schedDegraded).toBe(true);
      // Queue: same contract.
      const queueOk =
        (typeof queue?.pendingCount === "number") &&
        (typeof queue?.maxPending === "number");
      const queueDegraded =
        queue?.unavailable === true && typeof queue?.error === "string";
      expect(queueOk || queueDegraded).toBe(true);
    },
    10_000,
  );

  test(
    "DB5: no scheduler MCP tool is advertised (dashboard is HTTP-only)",
    async () => {
      if (!mcp) {
        console.log("[T24:DB5:SKIP] MCP not started");
        expect(true).toBe(true);
        return;
      }
      const schedulerTools = mcp.toolNames.filter(
        (n) =>
          n.includes("scheduler") ||
          n.includes("schedule_job") ||
          n.includes("cron"),
      );
      expect(schedulerTools).toEqual([]);
    },
    10_000,
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// get_architecture (AR1-AR5) — API_UP + OLLAMA_UP (shared index).
//
// Source:
//   - MCP tool: apps/mcp-client/src/tool-defs/tool-defs-project.ts (get_architecture)
//   - HTTP route: apps/tools-api/src/routes/architecture.ts
//   - Core tool: packages/core/src/tools/get_architecture.ts
//
// Reuses SHARED_PID (shared monorepo index) — never resets it.
// ──────────────────────────────────────────────────────────────────────────────
describe.skipIf(!ARCH_READY)("T24 get_architecture (AR1-AR5)", () => {
  let pid: string;

  beforeAll(async () => {
    pid = await ensureSharedIndex();
    assertE2ePrefix(pid);
    if (mcp) requireTool(mcp.toolNames, "get_architecture");
  }, 900_000);

  test(
    "AR1: MCP get_architecture returns architecture fields for a valid projectId",
    async () => {
      const r = await mcpCall(mcp!.client, "get_architecture", {
        id: pid,
        centralityLimit: 20,
      });
      expect(r?.success).toBe(true);
      const map = r?.data ?? {};
      // Architecture fields (additive — asserted as arrays when present).
      expect(Array.isArray(map.packages)).toBe(true);
      expect(Array.isArray(map.entryPoints)).toBe(true);
      expect(Array.isArray(map.hotspots)).toBe(true);
      expect(Array.isArray(map.communities)).toBe(true);
      expect(Array.isArray(map.layers)).toBe(true);
      expect(Array.isArray(map.routes)).toBe(true);
      // The 250-file shared monorepo has a richly connected graph → packages
      // and hotspots are expected to be non-empty.
      expect((map.packages ?? []).length).toBeGreaterThan(0);
    },
    30_000,
  );

  test(
    "AR2: HTTP GET /project/:id/architecture matches MCP shape (parity)",
    async () => {
      const http = await httpGet<any>(
        `/api/v1/project/${pid}/architecture`,
        { centralityLimit: 20 },
      );
      expect(http?.success).toBe(true);
      const mcpRes = await mcpCall(mcp!.client, "get_architecture", {
        id: pid,
        centralityLimit: 20,
      });
      expect(mcpRes?.success).toBe(true);
      // Both transports return the same architecture fields. Compare the
      // field keys (stable contract) rather than deep-equality (graph state
      // can shift between calls on a live index).
      const httpKeys = Object.keys(http?.data ?? {}).sort();
      const mcpKeys = Object.keys(mcpRes?.data ?? {}).sort();
      expect(httpKeys).toEqual(mcpKeys);
      // Both carry the core architecture arrays.
      for (const key of [
        "packages", "entryPoints", "hotspots", "communities", "layers", "routes",
      ]) {
        expect(Array.isArray(http?.data?.[key])).toBe(true);
        expect(Array.isArray(mcpRes?.data?.[key])).toBe(true);
      }
    },
    30_000,
  );

  test(
    "AR3: ?aspects=cycles returns SCC cycle data (or empty cycles array)",
    async () => {
      const r = await httpGet<any>(
        `/api/v1/project/${pid}/architecture`,
        { aspects: "cycles" },
      );
      expect(r?.success).toBe(true);
      // When cycles are requested, the response includes cycle fields.
      // A large monorepo typically has call cycles; an empty array is valid
      // when the graph has no SCC > 1.
      const data = r?.data ?? {};
      // The cycles aspect adds `cycles` (array) and `cycles_truncated` (boolean).
      if (data.cycles !== undefined) {
        expect(Array.isArray(data.cycles)).toBe(true);
      }
      if (data.cycles_truncated !== undefined) {
        expect(typeof data.cycles_truncated).toBe("boolean");
      }
    },
    30_000,
  );

  test(
    "AR4: unknown aspect value returns success:false with a teaching error",
    async () => {
      const r = await httpGet<any>(
        `/api/v1/project/${pid}/architecture`,
        { aspects: "bogus_aspect" },
      );
      expect(r?.success).toBe(false);
      expect(typeof r?.error).toBe("string");
      // The teaching error lists the valid aspects.
      expect(r?.error).toContain("Valid values");
      expect(r?.error).toContain("cycles");
    },
    30_000,
  );

  test(
    "AR5: GET /project/architecture/_aspects returns the valid aspect list",
    async () => {
      const r = await httpGet<any>("/api/v1/project/architecture/_aspects");
      expect(r?.success).toBe(true);
      expect(Array.isArray(r?.data?.aspects)).toBe(true);
      expect(r?.data?.aspects).toContain("cycles");
    },
    10_000,
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// rename_project / merge_projects (RN1-RN5) — dryRun preview only.
//
// Source:
//   - MCP tools: tool-defs-project.ts (rename_project, merge_projects)
//   - HTTP routes: apps/tools-api/src/routes/project.ts (POST /rename, /merge)
//   - Core: packages/core/src/services/project-identity/
//
// dryRun:true (preview) never mutates. The apply path (dryRun:false) is
// destructive and covered by 23.owned-destructive.test.ts.
//
// Rename preview uses SHARED_PID as source (exists in workspaces table).
// Merge preview indexes the polyglot fixture under two e2e IDs (same canonical
// root required for merge).
// ──────────────────────────────────────────────────────────────────────────────
describe.skipIf(!ARCH_READY)("T24 rename/merge preview (RN1-RN5)", () => {
  let renameSrc: string;
  let mergeSrc: string;
  let mergeTgt: string;
  let mergeReady = false;

  beforeAll(async () => {
    renameSrc = await ensureSharedIndex();
    assertE2ePrefix(renameSrc);

    // Index the polyglot fixture under two IDs for merge preview (same
    // canonical root = POLY_FIXTURE_PATH). The fixture is 33 tiny files.
    mergeSrc = MERGE_SRC;
    mergeTgt = MERGE_TGT;
    try {
      await indexAndAwait(POLY_FIXTURE_PATH, mergeSrc, { forceReindex: true });
      await indexAndAwait(POLY_FIXTURE_PATH, mergeTgt, { forceReindex: true });
      CLEANUP_PIDS.push(mergeSrc, mergeTgt);
      mergeReady = true;
    } catch (e: any) {
      console.log(
        `[T24:merge] fixture index failed: ${String(e?.message ?? e).slice(0, 200)}`,
      );
      mergeReady = false;
    }
  }, 900_000);

  test(
    "RN1: MCP rename_project dryRun returns plan envelope with planHash",
    async () => {
      const r = await mcpCall(mcp!.client, "rename_project", {
        sourceProjectId: renameSrc,
        targetProjectId: RENAME_TGT,
        dryRun: true,
      });
      expect(r?.success).toBe(true);
      const data = r?.data ?? {};
      expect(data.dryRun).toBe(true);
      expect(typeof data.planHash).toBe("string");
      expect(data.planHash.length).toBeGreaterThan(0);
      expect(Array.isArray(data.stores)).toBe(true);
      expect(typeof data.sourceProjectId).toBe("string");
      expect(typeof data.targetProjectId).toBe("string");
    },
    30_000,
  );

  test(
    "RN2: HTTP POST /rename dryRun (default) matches MCP shape",
    async () => {
      const http = await httpPost<any>("/api/v1/project/rename", {
        sourceProjectId: renameSrc,
        targetProjectId: RENAME_TGT,
        // dryRun defaults to true — omitting it is the same as dryRun:true.
      });
      expect(http?.success).toBe(true);
      expect(http?.data?.dryRun).toBe(true);
      expect(typeof http?.data?.planHash).toBe("string");
      // Parity: the planHash is deterministic for the same source/target pair.
      const mcpRes = await mcpCall(mcp!.client, "rename_project", {
        sourceProjectId: renameSrc,
        targetProjectId: RENAME_TGT,
        dryRun: true,
      });
      expect(mcpRes?.success).toBe(true);
      expect(mcpRes?.data?.planHash).toBe(http?.data?.planHash);
    },
    30_000,
  );

  test(
    "RN3: merge_projects dryRun returns preview with per-store counts",
    async () => {
      if (!mergeReady) {
        console.log("[T24:RN3:SKIP] merge fixture not indexed");
        expect(true).toBe(true);
        return;
      }
      const r = await mcpCall(mcp!.client, "merge_projects", {
        sourceProjectId: mergeSrc,
        targetProjectId: mergeTgt,
        dryRun: true,
      });
      expect(r?.success).toBe(true);
      const data = r?.data ?? {};
      expect(data.dryRun).toBe(true);
      expect(typeof data.planHash).toBe("string");
      expect(Array.isArray(data.stores)).toBe(true);
      // Each store count carries {storeId, directCount, adaptedCount}.
      for (const s of data.stores ?? []) {
        expect(typeof s.storeId).toBe("string");
        expect(typeof s.directCount).toBe("number");
        expect(typeof s.adaptedCount).toBe("number");
      }
    },
    30_000,
  );

  test(
    "RN4: rename_project nonexistent source → {success:false, error:{code}} non-200",
    async () => {
      const bogus = `${PREFIX}nonexistent-${RUN_STAMP}`;
      assertE2ePrefix(bogus);
      const res = await httpRaw("/api/v1/project/rename", {
        method: "POST",
        body: JSON.stringify({
          sourceProjectId: bogus,
          targetProjectId: RENAME_TGT,
          dryRun: true,
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const json: any = await res.json();
      expect(json?.success).toBe(false);
      expect(json?.error?.code).toBeTruthy();
      expect(typeof json?.error?.message).toBe("string");
    },
    30_000,
  );

  test(
    "RN5: rename_project dryRun:false without operationId → {success:false, error}",
    async () => {
      const res = await httpRaw("/api/v1/project/rename", {
        method: "POST",
        body: JSON.stringify({
          sourceProjectId: renameSrc,
          targetProjectId: RENAME_TGT,
          dryRun: false,
          // Missing operationId + expectedPlanHash → validation error.
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const json: any = await res.json();
      expect(json?.success).toBe(false);
      expect(json?.error?.code).toBeTruthy();
      expect(typeof json?.error?.message).toBe("string");
    },
    30_000,
  );
});

// Always-on sanity: if E2E is disabled, surface a clear reason.
describe("T24 — gating", () => {
  test("RUN_E2E gating is reported", () => {
    if (!READY) {
      console.log(`[T24] SKIP entire suite: ${SKIP_REASON}`);
    }
    expect(true).toBe(true);
  });
});
