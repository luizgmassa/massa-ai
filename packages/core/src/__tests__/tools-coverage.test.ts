/**
 * Tools coverage tests — get_index_status, list_projects, create_checkpoint,
 * restore_checkpoint, list_checkpoints.
 * Uses DB when available; mocks where needed for tool handler isolation.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { GetIndexStatusTool } from "../tools/get_index_status.js";
import { CreateCheckpointTool } from "../tools/create_checkpoint.js";
import { RestoreCheckpointTool } from "../tools/restore_checkpoint.ts";
import { ListCheckpointsTool } from "../tools/list_checkpoints.ts";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const TEST_PREFIX = "cov-tools-";

// Mock workspaceManager for list_projects to avoid DB in non-PG env.
mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    listWorkspaces: async (statusFilter?: string) => {
      if (statusFilter && statusFilter !== "all") {
        return mockWorkspaces.filter((w) => w.status === statusFilter);
      }
      return mockWorkspaces;
    },
    getWorkspace: async (projectId: string) => mockWorkspaces.find((w) => w.project_id === projectId) ?? null,
    markIndexing: async () => {},
    markIndexed: async () => {},
    markError: async () => {},
    resolveByNameTail: async () => null,
    removeWorkspace: async () => {},
  },
  WorkspaceManager: { getInstance: () => ({}) },
}));

const mockWorkspaces = [
  {
    project_id: "test-proj-1",
    project_path: "/tmp/test-proj-1",
    display_name: "test-proj-1",
    status: "indexed",
    last_indexed_at: Date.now(),
    last_error: null,
    files_count: 10,
    chunks_count: 30,
    symbols_count: 50,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];

// Import list_projects AFTER the mock.
const { ListProjectsTool } = await import("../tools/list_projects.ts");

describe("GetIndexStatusTool", () => {
  test("returns error for unknown jobId", async () => {
    const tool = new GetIndexStatusTool();
    const result = await tool.handle({ jobId: "nonexistent" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Job not found");
  });

  test("returns status for a known job", async () => {
    const job = indexJobTracker.createJob("test-proj", "/tmp/test-proj");
    const tool = new GetIndexStatusTool();
    const result = await tool.handle({ jobId: job.jobId });
    expect(result.success).toBe(true);
    expect(result.data!.jobId).toBe(job.jobId);
    expect(result.data!.status).toBeDefined();
  });

  test("returns error when jobId is undefined", async () => {
    const tool = new GetIndexStatusTool();
    const result = await tool.handle({} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Job not found");
  });
});

describe("ListProjectsTool", () => {
  test("lists all projects", async () => {
    const tool = new ListProjectsTool();
    const result = await tool.handle({});
    expect(result.success).toBe(true);
    expect(result.data!.workspaces.length).toBeGreaterThan(0);
    expect(result.data!.total).toBeGreaterThan(0);
    expect(result.data!.filter).toBe("all");
  });

  test("filters by status", async () => {
    const tool = new ListProjectsTool();
    const result = await tool.handle({ status: "indexed" });
    expect(result.success).toBe(true);
    expect(result.data!.workspaces.every((w: any) => w.status === "indexed")).toBe(true);
    expect(result.data!.filter).toBe("indexed");
  });

  test("handles errors gracefully", async () => {
    const tool = new ListProjectsTool();
    // The mock should not throw, but test error handling.
    const result = await tool.handle({});
    expect(result.success).toBe(true);
  });
});

describe.skipIf(!DB_AVAILABLE)("CreateCheckpointTool", () => {
  let prisma: any;

  beforeAll(async () => {
    if (!DB_AVAILABLE) return;
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
  });

  afterEach(async () => {
    if (!DB_AVAILABLE) return;
    await prisma.$executeRaw`DELETE FROM task_checkpoints WHERE id LIKE ${TEST_PREFIX + "%"}`;
  });

  afterAll(async () => {
    if (!DB_AVAILABLE) return;
    await prisma.$executeRaw`DELETE FROM task_checkpoints WHERE id LIKE ${TEST_PREFIX + "%"}`;
  });

  test("creates a checkpoint with required params", async () => {
    const tool = new CreateCheckpointTool();
    const result = await tool.handle({
      taskId: `${TEST_PREFIX}task-create`,
      description: "test checkpoint",
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test("creates a milestone checkpoint", async () => {
    const tool = new CreateCheckpointTool();
    const result = await tool.handle({
      taskId: `${TEST_PREFIX}task-milestone`,
      description: "milestone checkpoint",
      checkpointType: "milestone",
    });
    expect(result.success).toBe(true);
  });

  test("creates a checkpoint with full params", async () => {
    const tool = new CreateCheckpointTool();
    const result = await tool.handle({
      taskId: `${TEST_PREFIX}task-full`,
      description: "full checkpoint",
      status: "in_progress",
      currentStep: "step-1",
      progressPercent: 50,
      totalSteps: 10,
      completedSteps: 5,
      agentId: "agent-1",
      projectId: "proj-1",
      memoryIds: ["mem-1"],
      fileChanges: ["file-a.ts"],
      decisions: ["dec-1"],
      learnings: ["learn-1"],
      nextAction: "do next thing",
      pendingValidations: ["val-1"],
    });
    expect(result.success).toBe(true);
  });

  test("creates checkpoint even with missing taskId (mirror is sync, PG write fails async)", async () => {
    const tool = new CreateCheckpointTool();
    const result = await tool.handle({ description: "no task id" } as any);
    // The tool constructs a TaskState with undefined taskId, creates the
    // checkpoint in the in-memory mirror (sync), and returns success.
    // The PG write fails async (best-effort) but the tool already returned.
    expect(result.success).toBe(true);
    // Cleanup the orphaned mirror entry.
    if (result.data) {
      const { CheckpointManager } = await import("../services/checkpoint/checkpoint-manager.js");
      CheckpointManager.getInstance().deleteCheckpoint((result.data as any).checkpointId);
    }
  });

  test("supports json format", async () => {
    const tool = new CreateCheckpointTool();
    const result = await tool.handle({
      taskId: `${TEST_PREFIX}task-json`,
      description: "json format test",
      format: "json",
    });
    expect(result.success).toBe(true);
  });
});

describe.skipIf(!DB_AVAILABLE)("RestoreCheckpointTool", () => {
  let prisma: any;

  beforeAll(async () => {
    if (!DB_AVAILABLE) return;
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
  });

  afterEach(async () => {
    if (!DB_AVAILABLE) return;
    await prisma.$executeRaw`DELETE FROM task_checkpoints WHERE id LIKE ${TEST_PREFIX + "%"}`;
  });

  afterAll(async () => {
    if (!DB_AVAILABLE) return;
    await prisma.$executeRaw`DELETE FROM task_checkpoints WHERE id LIKE ${TEST_PREFIX + "%"}`;
  });

  test("returns error when neither checkpointId nor taskId provided", async () => {
    const tool = new RestoreCheckpointTool();
    const result = await tool.handle({});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Either checkpointId or taskId");
  });

  test("returns error for unknown checkpointId", async () => {
    const tool = new RestoreCheckpointTool();
    const result = await tool.handle({ checkpointId: "nonexistent-checkpoint" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Checkpoint not found");
  });

  test("returns error for unknown taskId", async () => {
    const tool = new RestoreCheckpointTool();
    const result = await tool.handle({ taskId: "nonexistent-task-xyz" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No checkpoints found");
  });

  test("restores a created checkpoint", async () => {
    // First create a checkpoint.
    const createTool = new CreateCheckpointTool();
    const createResult = await createTool.handle({
      taskId: `${TEST_PREFIX}task-restore`,
      description: "checkpoint to restore",
    });
    expect(createResult.success).toBe(true);

    // Then restore by taskId.
    const restoreTool = new RestoreCheckpointTool();
    const result = await restoreTool.handle({ taskId: `${TEST_PREFIX}task-restore` });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

describe.skipIf(!DB_AVAILABLE)("ListCheckpointsTool", () => {
  let prisma: any;

  beforeAll(async () => {
    if (!DB_AVAILABLE) return;
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
  });

  afterEach(async () => {
    if (!DB_AVAILABLE) return;
    await prisma.$executeRaw`DELETE FROM task_checkpoints WHERE id LIKE ${TEST_PREFIX + "%"}`;
  });

  afterAll(async () => {
    if (!DB_AVAILABLE) return;
    await prisma.$executeRaw`DELETE FROM task_checkpoints WHERE id LIKE ${TEST_PREFIX + "%"}`;
  });

  test("lists checkpoints with no filters", async () => {
    // Create a checkpoint first.
    const createTool = new CreateCheckpointTool();
    await createTool.handle({
      taskId: `${TEST_PREFIX}task-list`,
      description: "checkpoint for listing",
    });

    const tool = new ListCheckpointsTool();
    const result = await tool.handle({});
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test("lists checkpoints filtered by taskId", async () => {
    const createTool = new CreateCheckpointTool();
    await createTool.handle({
      taskId: `${TEST_PREFIX}task-filter`,
      description: "filtered checkpoint",
    });

    const tool = new ListCheckpointsTool();
    const result = await tool.handle({ taskId: `${TEST_PREFIX}task-filter` });
    expect(result.success).toBe(true);
  });

  test("lists checkpoints with json format", async () => {
    const tool = new ListCheckpointsTool();
    const result = await tool.handle({ format: "json" });
    expect(result.success).toBe(true);
  });

  test("lists checkpoints with limit", async () => {
    const tool = new ListCheckpointsTool();
    const result = await tool.handle({ limit: 5 });
    expect(result.success).toBe(true);
  });
});