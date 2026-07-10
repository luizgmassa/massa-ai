/**
 * Unit tests for the PostgreSQL checkpoint path (structural gap #16).
 *
 * Covers:
 *   - factory selection: CheckpointManager.getInstance() routes to the PG store
 *     when DATABASE_URL is postgres.
 *   - CRUD round-trip under PG: create → list → get → getLatest → stats →
 *     delete.
 *   - restore integrity check runs through the manager over a PG-backed store.
 *   - persistence: a checkpoint created on one instance is observable from a
 *     FRESH instance after hydration (cross-instance / cross-process recovery).
 *   - SQLite path unaffected: with DATABASE_URL empty, the SQLite backend is
 *     used (backend parity / no regression).
 *
 * Isolation: this suite touches ONLY the task_checkpoints table in the shared PG
 * DB and cleans up its own rows. Run in isolation (RUN_E2E discipline; the known
 * memory-crud afterAll pool-kill does not affect this file).
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import {
  CheckpointType,
  TaskStatus,
  type TaskState,
} from "@massa-th0th/shared";
import fs from "fs";
import path from "path";
import os from "os";

// ── Mock config + logger so the manager never touches real config paths ──
let tmpDir: string;

mock.module("@massa-th0th/shared", () => {
  const actual = require("@massa-th0th/shared");
  return {
    ...actual,
    CheckpointType: actual.CheckpointType,
    TaskStatus: actual.TaskStatus,
    config: {
      get: (key: string) => {
        if (key === "dataDir") return tmpDir;
        const defaults: Record<string, any> = {};
        return defaults[key];
      },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      metric: () => {},
    },
  };
});

import { CheckpointManager } from "../services/checkpoint/checkpoint-manager.js";
import { PgCheckpointStore } from "../services/checkpoint/checkpoint-store-pg.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeTaskState(overrides?: Partial<TaskState>): TaskState {
  return {
    taskId: `task_pg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    description: "PG checkpoint test task",
    status: TaskStatus.IN_PROGRESS,
    progress: { total: 10, completed: 3, currentStep: "step 3", percentage: 30 },
    context: {
      decisions: ["mem_dec_pg_1"],
      filesRead: ["/src/foo.ts"],
      filesModified: [],
      errors: [],
      learnings: ["learned something"],
    },
    agentState: {
      lastAction: "search",
      nextAction: "implement",
      pendingValidations: [],
    },
    startedAt: Date.now() - 60000,
    lastCheckpointAt: 0,
    checkpointCount: 0,
    ...overrides,
  };
}

function resetManagerSingleton(): void {
  (CheckpointManager as any).instance?.close();
  (CheckpointManager as any).instance = null;
}

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

/** Clean any rows this test created from PG (idempotent, scoped by taskId). */
async function cleanupTaskRows(taskIds: string[]): Promise<void> {
  const { getPrismaClient } = await import("../services/query/prisma-client.js");
  const { disconnectPrisma } = await import("../services/query/prisma-client.js");
  try {
    const prisma = getPrismaClient();
    for (const tid of taskIds) {
      await prisma.$executeRaw`DELETE FROM task_checkpoints WHERE task_id = ${tid}`;
    }
  } catch {
    // best-effort
  } finally {
    await disconnectPrisma();
  }
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("PgCheckpointStore (structural gap #16)", () => {
  const createdTaskIds: string[] = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-th0th-ckpt-pg-"));
    // Ensure DATABASE_URL is postgres for the PG tests.
    process.env.DATABASE_URL =
      ORIGINAL_DATABASE_URL && ORIGINAL_DATABASE_URL.startsWith("postgres")
        ? ORIGINAL_DATABASE_URL
        : "postgresql://massa_th0th:massa_th0th_password@localhost:5432/massa_th0th";
    resetManagerSingleton();
  });

  afterEach(async () => {
    resetManagerSingleton();
    await cleanupTaskRows(createdTaskIds.splice(0));
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("factory selects PG store when DATABASE_URL is postgres", () => {
    const manager = CheckpointManager.getInstance();
    // The manager delegates to a PgCheckpointStore under PG.
    expect((manager as any).delegate).toBeInstanceOf(PgCheckpointStore);
  });

  test("create → list → get → getLatest round-trip under PG", async () => {
    const manager = CheckpointManager.getInstance();
    const store = (manager as any).delegate as PgCheckpointStore;
    await store.ensureReady();

    const state = makeTaskState();
    createdTaskIds.push(state.taskId);

    const created = manager.createCheckpoint(state, {
      agentId: "architect",
      projectId: "proj_pg_test",
      memoryIds: ["mem_dec_pg_1"],
      fileChanges: [],
    });

    expect(created.id).toBeTruthy();
    expect(created.taskId).toBe(state.taskId);

    // Drain the fire-and-forget write.
    await store.__drain();

    // Sync read from the mirror.
    const got = manager.getCheckpoint(created.id);
    expect(got).not.toBeNull();
    expect(got!.taskId).toBe(state.taskId);
    expect(got!.state.description).toBe(state.description);
    expect(got!.memoryIds).toEqual(["mem_dec_pg_1"]);

    // list with taskId filter
    const listed = manager.listCheckpoints({ taskId: state.taskId });
    expect(listed.length).toBe(1);
    expect(listed[0].id).toBe(created.id);

    // getLatest
    const latest = manager.getLatestCheckpoint(state.taskId);
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(created.id);

    // metadata-only (no state deserialization cost)
    const meta = manager.listCheckpointsMetadata({ taskId: state.taskId });
    expect(meta.length).toBe(1);
    expect(meta[0].memoryCount).toBe(1);

    // delete + confirm gone from mirror
    const deleted = manager.deleteCheckpoint(created.id);
    expect(deleted).toBe(true);
    await store.__drain();
    expect(manager.getCheckpoint(created.id)).toBeNull();
  });

  test("restore runs through the manager over a PG-backed store", async () => {
    const manager = CheckpointManager.getInstance();
    const store = (manager as any).delegate as PgCheckpointStore;
    await store.ensureReady();

    const state = makeTaskState({
      context: { decisions: ["mem_dec_pg_1"], filesRead: [], filesModified: [], errors: [], learnings: [] },
    });
    createdTaskIds.push(state.taskId);

    const created = manager.createCheckpoint(state, {
      memoryIds: ["mem_dec_pg_1"],
      fileChanges: [],
    });
    await store.__drain();

    const result = manager.restoreCheckpoint(created.id);
    expect(result).not.toBeNull();
    expect(result!.checkpoint.id).toBe(created.id);
    // Best-effort under PG: referenced memories assumed existing (non-blocking).
    expect(result!.restoreInstructions).toContain(state.description);
  });

  test("a fresh instance observes a PG-persisted checkpoint after hydration", async () => {
    // Instance A creates + persists.
    const managerA = CheckpointManager.getInstance();
    const storeA = (managerA as any).delegate as PgCheckpointStore;
    await storeA.ensureReady();

    const state = makeTaskState();
    createdTaskIds.push(state.taskId);

    const created = managerA.createCheckpoint(state, { projectId: "proj_pg_persist" });
    await storeA.__drain();

    // Confirm it landed in PG directly.
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    const prisma = getPrismaClient();
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM task_checkpoints WHERE id = ${created.id}
    `;
    expect(rows.length).toBe(1);

    // Drop instance A and build a fresh instance B (new mirror).
    resetManagerSingleton();
    const managerB = CheckpointManager.getInstance();
    const storeB = (managerB as any).delegate as PgCheckpointStore;
    // Hydration must settle before the sync read observes the persisted row.
    await storeB.ensureReady();
    await storeB.__hydrate();

    const got = managerB.getCheckpoint(created.id);
    expect(got).not.toBeNull();
    expect(got!.taskId).toBe(state.taskId);
    expect(got!.state.description).toBe(state.description);

    // getLatest + list also see it
    expect(managerB.getLatestCheckpoint(state.taskId)?.id).toBe(created.id);
    expect(managerB.listCheckpoints({ taskId: state.taskId }).length).toBe(1);
  });
});

describe("CheckpointManager SQLite path (no regression, #16)", () => {
  let savedUrl: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-th0th-ckpt-sqlite-"));
    savedUrl = process.env.DATABASE_URL;
    // Force SQLite by clearing DATABASE_URL (bun auto-loads .env otherwise).
    process.env.DATABASE_URL = "";
    resetManagerSingleton();
  });

  afterEach(() => {
    resetManagerSingleton();
    process.env.DATABASE_URL = savedUrl;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("SQLite backend is used when DATABASE_URL is empty", () => {
    const manager = CheckpointManager.getInstance();
    // No PG delegate under SQLite.
    expect((manager as any).delegate).toBeNull();

    const state = makeTaskState();
    const created = manager.createCheckpoint(state, { agentId: "x" });
    expect(created.id).toBeTruthy();

    // Full sync round-trip on SQLite.
    expect(manager.getCheckpoint(created.id)?.taskId).toBe(state.taskId);
    expect(manager.listCheckpoints({ taskId: state.taskId }).length).toBe(1);
    expect(manager.getLatestCheckpoint(state.taskId)?.id).toBe(created.id);

    // restore integrity + instructions
    const restored = manager.restoreCheckpoint(created.id);
    expect(restored).not.toBeNull();
    expect(restored!.checkpoint.id).toBe(created.id);

    // stats
    const stats = manager.getStats();
    expect(stats.totalCheckpoints).toBeGreaterThanOrEqual(1);

    // delete
    expect(manager.deleteCheckpoint(created.id)).toBe(true);
    expect(manager.getCheckpoint(created.id)).toBeNull();
  });
});
