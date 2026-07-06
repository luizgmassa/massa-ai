/**
 * T6 — Checkpoints (F68–F73)
 *
 * Exercises create/list/restore checkpoints against the RUNNING live stack.
 * Checkpoints do NOT need Ollama, so the suite gates on API_UP only.
 *
 * All three tools default to TOON output. To keep MCP and HTTP responses
 * directly comparable (the MCP proxy unwraps a TOON-string `data` into a bare
 * string at apps/mcp-client/src/index.ts:178-187, dropping the {success,data}
 * envelope), every call passes format:"json" on BOTH transports.
 *
 * Matrix normalization drops volatile keys: checkpointId/id, createdAt,
 * expiresAt, and the generated restoreInstructions/total/stats fields whose
 * values depend on global DB state and are not part of the per-checkpoint
 * contract under test.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  E2E_ENABLED,
  probeAvailability,
  httpPost,
  resetProject,
  assertE2ePrefix,
  assertMatrix,
  PREFIX,
  RUN_STAMP,
} from "./_helpers";
import { startMcp, mcpCall, requireTool, type McpHandle } from "./_mcp";

const PID = `${PREFIX}ckpt-${RUN_STAMP}`;
assertE2ePrefix(PID);

const READY = await (async () => {
  if (!E2E_ENABLED) return false;
  const a = await probeAvailability();
  return a.API_UP;
})();

// Per-checkpoint matrix drops: identity + timestamps (volatile), plus the
// generated restore instructions string and global stats (not per-checkpoint).
const MATRIX_DROPS = { dropKeys: ["restoreInstructions", "total", "stats"] };

describe.skipIf(!READY)("T6 checkpoints", () => {
  let mcp: McpHandle;

  beforeAll(async () => {
    mcp = await startMcp();
    requireTool(mcp.toolNames, "create_checkpoint");
    requireTool(mcp.toolNames, "list_checkpoints");
    requireTool(mcp.toolNames, "restore_checkpoint");
  }, 60_000);

  afterAll(async () => {
    try {
      await mcp?.stop();
    } catch {
      /* ignore */
    }
    try {
      await resetProject(PID);
    } catch {
      /* ignore */
    }
  });

  // ── F68: create with full state ───────────────────────────────────────────
  test(
    "F68 create_checkpoint returns checkpointId for full state",
    async () => {
      const taskId = `${PID}-f68`;
      const body = {
        taskId,
        description: "F68 full-state checkpoint",
        status: "in_progress" as const,
        currentStep: "step-1",
        progressPercent: 42,
        totalSteps: 10,
        completedSteps: 4,
        memoryIds: [],
        fileChanges: ["a.ts"],
        decisions: [],
        learnings: ["x"],
        nextAction: "y",
        pendingValidations: ["z"],
        checkpointType: "manual" as const,
        agentId: "e2e-t6",
        projectId: PID,
        format: "json" as const,
      };

      const http = await httpPost<any>("/api/v1/checkpoints/create", body);
      expect(http.success).toBe(true);
      expect(typeof http.data.checkpointId).toBe("string");
      expect(http.data.checkpointId.length).toBeGreaterThan(0);
      expect(http.data.taskId).toBe(taskId);
      expect(http.data.type).toBe("manual");
    },
    15_000,
  );

  // ── F69: checkpointType manual + milestone ────────────────────────────────
  test(
    "F69 create_checkpoint honors checkpointType manual and milestone",
    async () => {
      const taskManual = `${PID}-f69-manual`;
      const taskMilestone = `${PID}-f69-milestone`;

      const manual = await httpPost<any>("/api/v1/checkpoints/create", {
        taskId: taskManual,
        description: "F69 manual",
        projectId: PID,
        checkpointType: "manual",
        format: "json",
      });
      expect(manual.success).toBe(true);
      expect(manual.data.type).toBe("manual");

      const milestone = await httpPost<any>("/api/v1/checkpoints/create", {
        taskId: taskMilestone,
        description: "F69 milestone",
        projectId: PID,
        checkpointType: "milestone",
        format: "json",
      });
      expect(milestone.success).toBe(true);
      expect(milestone.data.type).toBe("milestone");
    },
    15_000,
  );

  // ── F70: list filters (taskId, projectId, type, includeExpired, limit) ─────
  test(
    "F70 list_checkpoints honors taskId / projectId / type / limit filters",
    async () => {
      const taskId = `${PID}-f70`;
      // Seed: two checkpoints on this task, one milestone elsewhere in PID.
      await httpPost("/api/v1/checkpoints/create", {
        taskId,
        description: "f70 first",
        projectId: PID,
        checkpointType: "manual",
        format: "json",
      });
      await httpPost("/api/v1/checkpoints/create", {
        taskId,
        description: "f70 second",
        projectId: PID,
        checkpointType: "milestone",
        format: "json",
      });
      const otherTask = `${PID}-f70-other`;
      await httpPost("/api/v1/checkpoints/create", {
        taskId: otherTask,
        description: "f70 other task",
        projectId: PID,
        checkpointType: "manual",
        format: "json",
      });

      // Filter by taskId — only the two for this task.
      const byTask = await httpPost<any>("/api/v1/checkpoints/list", {
        taskId,
        projectId: PID,
        format: "json",
        limit: 50,
      });
      expect(byTask.success).toBe(true);
      const tasksSeen = new Set(byTask.data.checkpoints.map((c: any) => c.taskId));
      expect([...tasksSeen]).toEqual([taskId]);
      expect(byTask.data.checkpoints.length).toBe(2);

      // Filter by checkpointType=milestone within PID — must include the f70
      // milestone and the F69 milestone; never a manual.
      const milestones = await httpPost<any>("/api/v1/checkpoints/list", {
        projectId: PID,
        checkpointType: "milestone",
        format: "json",
        limit: 50,
      });
      expect(milestones.success).toBe(true);
      for (const c of milestones.data.checkpoints) {
        expect(c.type).toBe("milestone");
      }
      expect(
        milestones.data.checkpoints.some((c: any) => c.taskId === taskId),
      ).toBe(true);

      // limit honored — at least 2 seeded on taskId; limit:1 returns <=1.
      const limited = await httpPost<any>("/api/v1/checkpoints/list", {
        taskId,
        projectId: PID,
        format: "json",
        limit: 1,
      });
      expect(limited.data.checkpoints.length).toBeLessThanOrEqual(1);

      // includeExpired:false by default excludes expired checkpoints.
      const noExpired = await httpPost<any>("/api/v1/checkpoints/list", {
        taskId,
        projectId: PID,
        includeExpired: false,
        format: "json",
        limit: 50,
      });
      // All returned checkpoints are non-expired (expiresAt in the future
      // or absent). Since default TTL is 7d, every seeded row qualifies.
      expect(noExpired.data.checkpoints.length).toBe(2);
    },
    15_000,
  );

  // ── F71: restore by checkpointId returns state + integrity ────────────────
  test(
    "F71 restore_checkpoint by checkpointId echoes description + status",
    async () => {
      const taskId = `${PID}-f71`;
      const created = await httpPost<any>("/api/v1/checkpoints/create", {
        taskId,
        description: "F71 restore target",
        status: "in_progress",
        currentStep: "restore-me",
        progressPercent: 42,
        totalSteps: 10,
        completedSteps: 4,
        fileChanges: ["a.ts"],
        learnings: ["x"],
        nextAction: "y",
        pendingValidations: ["z"],
        projectId: PID,
        checkpointType: "manual",
        format: "json",
      });
      expect(created.success).toBe(true);
      const checkpointId = created.data.checkpointId;

      const restored = await httpPost<any>("/api/v1/checkpoints/restore", {
        checkpointId,
        format: "json",
      });
      expect(restored.success).toBe(true);
      expect(restored.data.description).toBe("F71 restore target");
      expect(restored.data.status).toBe("in_progress");
      expect(restored.data.taskId).toBe(taskId);
      expect(restored.data.integrity).toBeDefined();
      // progress percent echoes back through state.progress.percentage.
      expect(restored.data.progress.percentage).toBe(42);
    },
    15_000,
  );

  // ── F72: restore by taskId (latest for that task) ─────────────────────────
  test(
    "F72 restore_checkpoint by taskId restores the latest for that task",
    async () => {
      const taskId = `${PID}-f72`;
      const first = await httpPost<any>("/api/v1/checkpoints/create", {
        taskId,
        description: "f72 older",
        projectId: PID,
        checkpointType: "manual",
        format: "json",
      });
      // small gap so created_at differs and "latest" is unambiguous
      await new Promise((r) => setTimeout(r, 20));
      const second = await httpPost<any>("/api/v1/checkpoints/create", {
        taskId,
        description: "f72 newer",
        projectId: PID,
        checkpointType: "manual",
        format: "json",
      });
      const latestId = second.data.checkpointId;
      expect(first.data.checkpointId).not.toBe(latestId);

      const restored = await httpPost<any>("/api/v1/checkpoints/restore", {
        taskId,
        format: "json",
      });
      expect(restored.success).toBe(true);
      expect(restored.data.checkpointId).toBe(latestId);
      expect(restored.data.description).toBe("f72 newer");
    },
    15_000,
  );

  // ── F73: missing/unknown checkpointId → clean failure, no throw ───────────
  test(
    "F73 restore_checkpoint with unknown checkpointId returns clean failure",
    async () => {
      const restored = await httpPost<any>("/api/v1/checkpoints/restore", {
        checkpointId: "00000000-0000-0000-0000-000000000000",
        format: "json",
      });
      // Must be a clean {success:false} (or {ok:false}) — never a throw/5xx.
      expect(restored).not.toBeNull();
      const failed = restored.success === false || restored.ok === false;
      expect(failed).toBe(true);
      expect(restored.success).toBe(false);
    },
    15_000,
  );

  // ── Matrix: MCP ≡ HTTP for all three tools (format:json both sides) ───────
  test(
    "matrix: create_checkpoint MCP ≡ HTTP (json)",
    async () => {
      const taskId = `${PID}-mx-create`;
      const args = {
        taskId,
        description: "matrix create",
        status: "in_progress",
        currentStep: "mx",
        progressPercent: 42,
        totalSteps: 10,
        completedSteps: 4,
        memoryIds: [],
        fileChanges: ["a.ts"],
        decisions: [],
        learnings: ["x"],
        nextAction: "y",
        pendingValidations: ["z"],
        checkpointType: "manual",
        agentId: "e2e-t6",
        projectId: PID,
        format: "json",
      };

      const http = await httpPost<any>("/api/v1/checkpoints/create", args);
      const viaMcp = await mcpCall(mcp.client, "create_checkpoint", args);

      expect(http.success).toBe(true);
      expect(viaMcp.success).toBe(true);
      // Drop checkpointId + createdAt/expiresAt (volatile).
      assertMatrix(http, viaMcp, { dropKeys: ["checkpointId"] }, "create_checkpoint");
    },
    15_000,
  );

  test(
    "matrix: list_checkpoints MCP ≡ HTTP (json, filtered to taskId)",
    async () => {
      const taskId = `${PID}-mx-list`;
      // Seed two on this task within PID.
      await httpPost("/api/v1/checkpoints/create", {
        taskId,
        description: "mx-list-1",
        projectId: PID,
        checkpointType: "manual",
        format: "json",
      });
      await httpPost("/api/v1/checkpoints/create", {
        taskId,
        description: "mx-list-2",
        projectId: PID,
        checkpointType: "milestone",
        format: "json",
      });

      const args = {
        taskId,
        projectId: PID,
        format: "json",
        limit: 50,
      };
      const http = await httpPost<any>("/api/v1/checkpoints/list", args);
      const viaMcp = await mcpCall(mcp.client, "list_checkpoints", args);

      expect(http.success).toBe(true);
      expect(viaMcp.success).toBe(true);
      expect(http.data.checkpoints.length).toBeGreaterThanOrEqual(2);
      // Drop per-item volatile keys (id, createdAt, expiresAt) and global
      // total/stats whose values depend on whole-DB state, not this filter.
      assertMatrix(http, viaMcp, MATRIX_DROPS, "list_checkpoints");
    },
    15_000,
  );

  test(
    "matrix: restore_checkpoint MCP ≡ HTTP (json)",
    async () => {
      const taskId = `${PID}-mx-restore`;
      const created = await httpPost<any>("/api/v1/checkpoints/create", {
        taskId,
        description: "mx restore target",
        status: "in_progress",
        currentStep: "mx-restore",
        progressPercent: 42,
        totalSteps: 10,
        completedSteps: 4,
        fileChanges: ["a.ts"],
        learnings: ["x"],
        nextAction: "y",
        pendingValidations: ["z"],
        projectId: PID,
        checkpointType: "manual",
        format: "json",
      });
      const checkpointId = created.data.checkpointId;

      const args = { checkpointId, format: "json" };
      const http = await httpPost<any>("/api/v1/checkpoints/restore", args);
      const viaMcp = await mcpCall(mcp.client, "restore_checkpoint", args);

      expect(http.success).toBe(true);
      expect(viaMcp.success).toBe(true);
      // Drop checkpointId (volatile) and restoreInstructions (generated text
      // that varies only by volatile timestamps embedded inside) + createdAt.
      assertMatrix(http, viaMcp, MATRIX_DROPS, "restore_checkpoint");
    },
    15_000,
  );
});
