/**
 * WorkspaceManager unit tests — PG-backed.
 * Covers markIndexing, markIndexed, markError, listWorkspaces, getWorkspace,
 * resolveByNameTail, removeWorkspace, and EventBus integration.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { workspaceManager, WorkspaceManager } from "../services/workspace/workspace-manager.js";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const TEST_PREFIX = "cov-ws-";

function testProjectId(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
}

let prisma: any;

beforeAll(async () => {
  if (!DB_AVAILABLE) return;
  const { getPrismaClient } = await import("../kernel/prisma-client.js");
  prisma = getPrismaClient();
});

afterEach(async () => {
  if (!DB_AVAILABLE) return;
  await prisma.$executeRaw`
    DELETE FROM workspaces WHERE project_id LIKE ${TEST_PREFIX + "%"}
  `;
});

afterAll(async () => {
  if (!DB_AVAILABLE) return;
  await prisma.$executeRaw`
    DELETE FROM workspaces WHERE project_id LIKE ${TEST_PREFIX + "%"}
  `;
});

describe.skipIf(!DB_AVAILABLE)("WorkspaceManager (PostgreSQL)", () => {
  test("markIndexing creates/updates a workspace as indexing", async () => {
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/test-project");
    const ws = await workspaceManager.getWorkspace(projectId);
    expect(ws).not.toBeNull();
    expect(ws!.project_id).toBe(projectId);
    expect(ws!.status).toBe("indexing");
    expect(ws!.display_name).toBe("test-project");
  });

  test("markIndexing preserves existing counts on re-mark", async () => {
    const projectId = testProjectId();
    // First mark indexing.
    await workspaceManager.markIndexing(projectId, "/tmp/recount-project");
    // Mark indexed with counts.
    await workspaceManager.markIndexed(projectId, {
      filesCount: 42,
      chunksCount: 100,
      symbolsCount: 200,
    });
    // Re-mark indexing — existing counts should be preserved.
    await workspaceManager.markIndexing(projectId, "/tmp/recount-project");
    const ws = await workspaceManager.getWorkspace(projectId);
    expect(ws!.files_count).toBe(42);
    expect(ws!.chunks_count).toBe(100);
  });

  test("markIndexed updates status and counts", async () => {
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/indexed-project");
    await workspaceManager.markIndexed(projectId, {
      filesCount: 10,
      chunksCount: 30,
      symbolsCount: 50,
    });
    const ws = await workspaceManager.getWorkspace(projectId);
    expect(ws!.status).toBe("indexed");
    expect(ws!.files_count).toBe(10);
    expect(ws!.chunks_count).toBe(30);
    expect(ws!.symbols_count).toBe(50);
    expect(ws!.last_indexed_at).toBeGreaterThan(0);
  });

  test("markError updates status and error message", async () => {
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/error-project");
    await workspaceManager.markError(projectId, "ETL pipeline crashed");
    const ws = await workspaceManager.getWorkspace(projectId);
    expect(ws!.status).toBe("error");
    expect(ws!.last_error).toBe("ETL pipeline crashed");
  });

  test("listWorkspaces returns all workspaces", async () => {
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/list-project");
    const all = await workspaceManager.listWorkspaces();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.some((w) => w.project_id === projectId)).toBe(true);
  });

  test("listWorkspaces filters by status", async () => {
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/filter-project");
    const indexing = await workspaceManager.listWorkspaces("indexing");
    expect(indexing.every((w) => w.status === "indexing")).toBe(true);
    const indexed = await workspaceManager.listWorkspaces("indexed");
    expect(indexed.every((w) => w.status === "indexed")).toBe(true);
  });

  test("listWorkspaces with 'all' filter returns everything", async () => {
    const all = await workspaceManager.listWorkspaces("all");
    expect(Array.isArray(all)).toBe(true);
  });

  test("listWorkspaces with no filter returns everything", async () => {
    const all = await workspaceManager.listWorkspaces();
    expect(Array.isArray(all)).toBe(true);
  });

  test("getWorkspace returns null for unknown project", async () => {
    expect(await workspaceManager.getWorkspace("nonexistent-project-xyz")).toBeNull();
  });

  test("resolveByNameTail returns workspace by path tail", async () => {
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/unique-named-project");
    const resolved = await workspaceManager.resolveByNameTail("unique-named-project");
    expect(resolved).not.toBeNull();
    expect(resolved!.project_id).toBe(projectId);
  });

  test("resolveByNameTail returns workspace by projectId", async () => {
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/by-id-project");
    const resolved = await workspaceManager.resolveByNameTail(projectId);
    expect(resolved).not.toBeNull();
    expect(resolved!.project_id).toBe(projectId);
  });

  test("resolveByNameTail returns null for empty string", async () => {
    expect(await workspaceManager.resolveByNameTail("")).toBeNull();
  });

  test("resolveByNameTail returns null for unknown name", async () => {
    expect(await workspaceManager.resolveByNameTail("nonexistent-name-tail-xyz")).toBeNull();
  });

  test("resolveByNameTail throws on ambiguous match", async () => {
    const projectId1 = testProjectId();
    const projectId2 = testProjectId();
    // Both projects have the same path tail.
    await workspaceManager.markIndexing(projectId1, "/tmp/ambiguous-tail");
    await workspaceManager.markIndexing(projectId2, "/tmp/other/ambiguous-tail");
    await expect(workspaceManager.resolveByNameTail("ambiguous-tail")).rejects.toThrow("Ambiguous");
  });

  test("removeWorkspace deletes the workspace and its data", async () => {
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/remove-project");
    expect(await workspaceManager.getWorkspace(projectId)).not.toBeNull();
    await workspaceManager.removeWorkspace(projectId);
    expect(await workspaceManager.getWorkspace(projectId)).toBeNull();
  });

  test("getInstance returns a singleton", () => {
    const a = WorkspaceManager.getInstance();
    const b = WorkspaceManager.getInstance();
    expect(a).toBe(b);
  });

  test("EventBus integration: indexing:started triggers markIndexing", async () => {
    const { eventBus } = await import("../services/events/event-bus.js");
    const projectId = testProjectId();
    eventBus.publish("indexing:started", {
      projectId,
      projectPath: "/tmp/event-project",
    });
    // EventBus handlers are async (fire-and-forget). Wait for it.
    await new Promise((r) => setTimeout(r, 100));
    const ws = await workspaceManager.getWorkspace(projectId);
    expect(ws).not.toBeNull();
    expect(ws!.status).toBe("indexing");
  });

  test("EventBus integration: indexing:completed triggers markIndexed", async () => {
    const { eventBus } = await import("../services/events/event-bus.js");
    const projectId = testProjectId();
    // First mark indexing so the workspace exists.
    await workspaceManager.markIndexing(projectId, "/tmp/event-completed");
    eventBus.publish("indexing:completed", {
      projectId,
      filesIndexed: 5,
      chunksIndexed: 15,
      symbolsIndexed: 25,
    });
    await new Promise((r) => setTimeout(r, 200));
    const ws = await workspaceManager.getWorkspace(projectId);
    expect(ws!.status).toBe("indexed");
    expect(ws!.files_count).toBe(5);
  });

  test("EventBus integration: indexing:failed triggers markError", async () => {
    const { eventBus } = await import("../services/events/event-bus.js");
    const projectId = testProjectId();
    await workspaceManager.markIndexing(projectId, "/tmp/event-failed");
    eventBus.publish("indexing:failed", {
      projectId,
      error: "event-driven failure",
    });
    await new Promise((r) => setTimeout(r, 200));
    const ws = await workspaceManager.getWorkspace(projectId);
    expect(ws!.status).toBe("error");
    expect(ws!.last_error).toBe("event-driven failure");
  });
});