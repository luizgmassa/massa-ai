/**
 * T5 tests — createProjectIdentityService composition (spec public contract:
 * Core preview()/apply()). Preview runs read-only on a released client;
 * apply delegates to the transactional apply service. Full apply semantics
 * are covered in project-identity-apply.test.ts; these pin the COMPOSITION.
 */

import { describe, expect, test } from "bun:test";

import {
  ProjectIdentityError,
  createProjectIdentityService,
  type ProjectIdentityTransactionClient,
} from "../services/project-identity/index.js";

type Row = Record<string, unknown>;

/** Minimal planner-satisfying client: one live source workspace, empty schema. */
function plannerClient(calls: string[]): ProjectIdentityTransactionClient {
  return {
    async query<T = Row>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
      if (/project_identity_lock_/.test(text)) return { rows: [] as T[] };
      if (text.includes("information_schema.columns")) return { rows: [] as unknown as T[] };
      if (text.includes("information_schema.table_constraints")) return { rows: [] as unknown as T[] };
      if (/FROM\s+workspaces\s+WHERE/i.test(text)) {
        calls.push("workspaces");
        const ids = values;
        const rows = [
          { project_id: "source", project_path: "/repos/app", active_graph_generation_id: null, pending_graph_generation_id: null },
        ].filter((row) => ids.includes(row.project_id));
        return { rows: rows as unknown as T[] };
      }
      if (/FROM\s+project_identity_aliases/i.test(text)) return { rows: [] as unknown as T[] };
      if (/FROM\s+project_identity_operations/i.test(text)) return { rows: [] as unknown as T[] };
      return { rows: [] as T[] };
    },
    async beginTransaction(): Promise<void> { /* noop */ },
    async commitTransaction(): Promise<void> { /* noop */ },
    async rollbackTransaction(): Promise<void> { /* noop */ },
  };
}

describe("createProjectIdentityService", () => {
  test("preview parses input, computes a dry-run plan with planHash, and releases the client", async () => {
    const calls: string[] = [];
    let releases = 0;
    const service = createProjectIdentityService({
      acquireClient: async () => plannerClient(calls),
      releaseClient: async () => { releases++; },
      invalidators: undefined,
      publisher: { publish: () => { /* noop */ } },
    });

    const preview = await service.preview({
      mode: "rename",
      sourceProjectId: "source",
      targetProjectId: "target",
    });

    expect(preview.dryRun).toBe(true);
    expect(preview.mode).toBe("rename");
    expect(preview.sourceCanonicalRoot).toBe("/repos/app");
    expect(preview.targetCanonicalRoot).toBeNull();
    expect(preview.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(calls).toContain("workspaces");
    expect(releases).toBe(1);
  });

  test("preview surfaces invalid requests as typed sanitized errors and still releases the client", async () => {
    let releases = 0;
    const service = createProjectIdentityService({
      acquireClient: async () => plannerClient([]),
      releaseClient: async () => { releases++; },
    });

    await expect(service.preview({
      mode: "rename",
      sourceProjectId: "same",
      targetProjectId: "same",
    })).rejects.toMatchObject({ code: "INVALID_PROJECT_IDENTITY_REQUEST" });
    // Release-on-throw: a "release only on success" mutant leaks the client.
    expect(releases).toBe(1);
  });

  test("a preview pool-acquisition failure surfaces as BACKEND_UNAVAILABLE (503), never raw", async () => {
    const service = createProjectIdentityService({
      acquireClient: async () => { throw new Error("connect to /secret-db refused"); },
      releaseClient: async () => { /* noop */ },
    });

    try {
      await service.preview({
        mode: "rename",
        sourceProjectId: "source",
        targetProjectId: "target",
      });
      throw new Error("expected preview to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectIdentityError);
      expect((error as ProjectIdentityError).code).toBe("PROJECT_IDENTITY_BACKEND_UNAVAILABLE");
      expect((error as ProjectIdentityError).statusCode).toBe(503);
      expect((error as Error).message).not.toContain("/secret-db");
    }
  });

  test("apply rejects invalid material with the typed code before any mutation", async () => {
    const service = createProjectIdentityService({
      acquireClient: async () => plannerClient([]),
      releaseClient: async () => { /* noop */ },
    });

    await expect(service.apply({
      mode: "merge",
      sourceProjectId: "a",
      targetProjectId: "b",
      dryRun: false,
      operationId: "not a valid op id!!",
      expectedPlanHash: "0".repeat(64),
    })).rejects.toBeInstanceOf(ProjectIdentityError);
    await expect(service.apply({
      mode: "merge",
      sourceProjectId: "a",
      targetProjectId: "b",
      dryRun: false,
      operationId: "not a valid op id!!",
      expectedPlanHash: "0".repeat(64),
    })).rejects.toMatchObject({ code: "INVALID_PROJECT_IDENTITY_REQUEST" });
  });

  test("apply wraps non-identity backend failures as BACKEND_UNAVAILABLE without leaking internals", async () => {
    const service = createProjectIdentityService({
      acquireClient: async () => ({
        async query(): Promise<{ rows: Row[] }> {
          throw new Error("pg: connection to /secret-db lost");
        },
        async beginTransaction(): Promise<void> { /* noop */ },
        async commitTransaction(): Promise<void> { /* noop */ },
        async rollbackTransaction(): Promise<void> { /* noop */ },
      }),
      releaseClient: async () => { /* noop */ },
    });

    try {
      await service.apply({
        mode: "rename",
        sourceProjectId: "source",
        targetProjectId: "target",
        dryRun: false,
        operationId: "op-backend",
        expectedPlanHash: "0".repeat(64),
      });
      throw new Error("expected apply to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectIdentityError);
      expect((error as ProjectIdentityError).code).toBe("PROJECT_IDENTITY_BACKEND_UNAVAILABLE");
      expect((error as Error).message).not.toContain("/secret-db");
    }
  });
});
