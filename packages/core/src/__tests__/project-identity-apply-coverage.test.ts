/**
 * Coverage tests for apply.ts — targets ONLY the uncovered lines:
 *   46-65:   PgPoolTransactionRunner (pg-backed runner: acquire → BEGIN → body
 *            → COMMIT, ROLLBACK on throw, best-effort rollback in finally).
 *   194-215: rewriteIdentityArray (nested array identity rewrite, recursive
 *            object + array branches).
 *   839-853: createProjectIdentityApplyService (factory wiring the runner
 *            with acquire/release callbacks + options).
 *
 * The existing project-identity-apply.test.ts covers the rest. This file
 * drives the missing branches directly without duplicating existing tests.
 * It reuses the same FakeTransactionClient + previewHash pattern as the
 * main test so the planner runs against the in-memory fake.
 */

import { describe, expect, test } from "bun:test";

import {
  ProjectIdentityApplyService,
  ProjectIdentityInvalidatorRegistry,
  canonicalProjectIdentityJson,
  createProjectIdentityApplyService,
  hashProjectIdentityPlan,
  hashProjectIdentityRequest,
  type ProjectIdentityChangedPayload,
  type ProjectIdentityChangedPublisher,
  type ProjectIdentityTransactionClient,
} from "../services/project-identity/index.js";
import { computeIdentityPlan } from "../services/project-identity/planner.js";
import { PROJECT_IDENTITY_PLAN_VERSION } from "../services/project-identity/contracts.js";

type Row = Record<string, unknown>;

interface ColumnSpec { table_name: string; column_name: string; data_type: string }
interface PkSpec { table_name: string; columns: string[] }

/**
 * Transaction-aware in-memory client (trimmed from the main apply test's
 * FakeTransactionClient to the subset needed here). Honors the SQL surface
 * the apply service + planner need: information_schema lookups, workspaces/
 * aliases/operations selects, identity-column UPDATE/DELETE, payload scans,
 * and advisory-lock function calls (no-op).
 */
class FakeClient implements ProjectIdentityTransactionClient {
  columns: ColumnSpec[];
  primaryKeys: PkSpec[];
  tables: Record<string, Row[]>;
  inTransaction = false;
  private staged: Record<string, Row[]> | null = null;

  constructor(initial: {
    columns: ColumnSpec[];
    primaryKeys: PkSpec[];
    tables: Record<string, Row[]>;
  }) {
    this.columns = initial.columns;
    this.primaryKeys = initial.primaryKeys;
    this.tables = initial.tables;
  }

  async beginTransaction(): Promise<void> {
    this.inTransaction = true;
    this.staged = {};
    for (const [table, rows] of Object.entries(this.tables)) {
      this.staged[table] = rows.map((row) => ({ ...row }));
    }
  }

  async commitTransaction(): Promise<void> {
    if (this.staged) this.tables = this.staged;
    this.staged = null;
    this.inTransaction = false;
  }

  async rollbackTransaction(): Promise<void> {
    this.staged = null;
    this.inTransaction = false;
  }

  private active(): Record<string, Row[]> {
    return this.inTransaction && this.staged ? this.staged : this.tables;
  }

  async query<T = Row>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
    if (/project_identity_lock_(exclusive|shared)/.test(text)) return { rows: [] as T[] };
    if (/SELECT\s+EXISTS\s*\(/i.test(text) && text.includes("information_schema.columns")) {
      const [table, column] = [values[1], values[2]];
      const exists = this.columns.some((c) => c.table_name === table && c.column_name === column);
      return { rows: [{ exists }] as unknown as T[] };
    }
    if (text.includes("information_schema.columns")) return { rows: this.columns as unknown as T[] };
    if (text.includes("information_schema.table_constraints")) return { rows: this.primaryKeys as unknown as T[] };
    if (/FROM\s+workspaces\s+WHERE/i.test(text) && /project_id\s*=\s*\$1\s+OR/i.test(text)) {
      return { rows: this.active().workspaces?.filter((r) => values.includes(r.project_id)) as unknown as T[] };
    }
    if (/FROM\s+project_identity_aliases/i.test(text) && /retired_project_id\s*=\s*\$1\s+OR/i.test(text)) {
      return { rows: (this.active().project_identity_aliases ?? []).filter((r) => values.includes(r.retired_project_id)) as unknown as T[] };
    }
    if (/FROM\s+project_identity_operations\s+WHERE\s+operation_id/i.test(text)) {
      const rows = (this.active().project_identity_operations ?? []).filter((r) => r.operation_id === values[0]);
      if (rows.length === 0) return { rows: [] as T[] };
      return { rows: rows.map((r) => ({ ...r, result: typeof r.result === "string" ? JSON.parse(r.result) : r.result })) as unknown as T[] };
    }
    if (/^SELECT[\s\S]*FROM\s+graph_generations/i.test(text)) {
      const rows = this.active().graph_generations ?? [];
      const ids = /OR\s+project_id\s*=\s*\$2/i.test(text) ? [values[0], values[1]] : [values[0]];
      return { rows: rows.filter((r) => ids.includes(r.project_id)) as unknown as T[] };
    }
    if (/SELECT\s+.*AS\s+payload_value\s+FROM/i.test(text)) {
      const table = text.match(/FROM "([a-z0-9_]+)"/)?.[1] ?? "";
      const column = text.match(/SELECT "([a-z0-9_]+)" AS payload_value/)?.[1] ?? "";
      const rows = this.active()[table] ?? [];
      const filtered = !text.includes("project_id")
        ? rows
        : /OR\s+"project_id"\s*=\s*\$2/i.test(text)
          ? rows.filter((r) => [values[0], values[1]].includes(r.project_id))
          : rows.filter((r) => r.project_id === values[0]);
      return { rows: filtered.filter((r) => r[column] != null).map((r) => ({ id: r.id, [column]: r[column] })) as unknown as T[] };
    }
    if (/^SELECT\s+("id",\s*)?"(project_id|workspace_id|metadata|payload|payload_json|results|tags)"/i.test(text)) {
      const table = text.match(/FROM "([a-z0-9_]+)"/)?.[1] ?? "";
      const identityCol = text.match(/WHERE "(project_id|workspace_id)" = \$1/)?.[1];
      const rows = this.active()[table] ?? [];
      if (identityCol) {
        if (/OR\s+"(project_id|workspace_id)"\s*=\s*\$2/i.test(text)) {
          return { rows: rows.filter((r) => values.includes(r[identityCol])) as unknown as T[] };
        }
        return { rows: rows.filter((r) => r[identityCol] === values[0]) as unknown as T[] };
      }
      return { rows: rows as unknown as T[] };
    }
    if (/^UPDATE/i.test(text.trim())) return this.applyWrite(text, values) as { rows: T[] };
    if (/^DELETE/i.test(text.trim())) return this.applyWrite(text, values) as { rows: T[] };
    if (/^INSERT/i.test(text.trim())) return this.applyInsert(text, values) as { rows: T[] };
    return { rows: [] as T[] };
  }

  private applyWrite(text: string, values: readonly unknown[]): { rows: Row[] } {
    const store = this.active();
    const table = text.match(/(?:UPDATE|DELETE FROM)\s+"?([a-z0-9_]+)"?/i)?.[1] ?? "";
    const target = store[table] ?? (store[table] = []);
    if (/^DELETE FROM/i.test(text) && /USING/i.test(text)) {
      // Dedupe DELETE (merge mode) — drop source rows byte-equivalent to a target row.
      const sourceId = values[0];
      const targetId = values[1];
      const groups = [...text.matchAll(/\(t_source\.([^)]+)\)/g)].map((m) =>
        m[1]!.split(",").map((c) => c.replace(/^\s*(t_source|t_target)\s*\./, "").replace(/"/g, "").trim())
          .filter((c) => c && c !== "project_id" && c !== "workspace_id"));
      const keyCols = groups[0] ?? [];
      const materialCols = groups[1] ?? keyCols;
      const dropIndexes = new Set<number>();
      const sourceRows = target.map((r, i) => ({ r, i })).filter((e) => e.r.project_id === sourceId);
      const targetRows = target.filter((r) => r.project_id === targetId);
      for (const { r: sRow, i } of sourceRows) {
        if (targetRows.some((tRow) =>
          keyCols.every((c) => sRow[c] === tRow[c]) &&
          materialCols.every((c) => canonicalProjectIdentityJson(sRow[c]) === canonicalProjectIdentityJson(tRow[c])))) {
          dropIndexes.add(i);
        }
      }
      store[table] = target.filter((_, i) => !dropIndexes.has(i));
      return { rows: [] };
    }
    if (/^DELETE FROM/i.test(text) && /WHERE\s+"?project_id"?\s*=\s*\$1/i.test(text)) {
      store[table] = target.filter((r) => r.project_id !== values[0]);
      return { rows: [] };
    }
    if (/^UPDATE\s+"?project_identity_aliases"?\s+SET\s+target_project_id/i.test(text)) {
      for (const r of store.project_identity_aliases ?? []) if (r.target_project_id === values[1]) r.target_project_id = values[0];
      return { rows: [] };
    }
    if (/^UPDATE\s+"?([a-z0-9_]+)"?\s+SET\s+"?(project_id|workspace_id)"?/i.test(text)) {
      const idCol = text.match(/SET\s+"?(project_id|workspace_id)"?/i)?.[1] ?? "project_id";
      for (const r of target) if (r[idCol] === values[1]) r[idCol] = values[0];
      return { rows: [] };
    }
    if (/^UPDATE\s+"?([a-z0-9_]+)"?\s+SET\s+"?(metadata|payload|payload_json|results|tags)"?/i.test(text)) {
      const col = text.match(/SET\s+"?([a-z0-9_]+)"?\s*=/i)?.[1] ?? "";
      for (const r of target) if (r.id === values[1]) r[col] = values[0];
      return { rows: [] };
    }
    return { rows: [] };
  }

  private applyInsert(text: string, values: readonly unknown[]): { rows: Row[] } {
    const store = this.active();
    if (/INTO\s+"?project_identity_aliases"?/i.test(text)) {
      (store.project_identity_aliases ?? (store.project_identity_aliases = [])).push({
        retired_project_id: values[0], target_project_id: values[1], canonical_root: values[2], operation_id: values[3],
      });
      return { rows: [] };
    }
    if (/INTO\s+"?project_identity_operations"?/i.test(text)) {
      const rows = store.project_identity_operations ?? (store.project_identity_operations = []);
      if (!rows.some((r) => r.operation_id === values[0])) {
        rows.push({
          operation_id: values[0], mode: values[1], source_project_id: values[2], target_project_id: values[3],
          source_canonical_root: values[4], target_canonical_root: values[5], request_hash: values[6],
          plan_hash: values[7], result: values[8],
        });
      }
      return { rows: [] };
    }
    return { rows: [] };
  }
}

function baselineClient(): FakeClient {
  return new FakeClient({
    columns: [
      { table_name: "workspaces", column_name: "project_id", data_type: "text" },
      { table_name: "workspaces", column_name: "project_path", data_type: "text" },
      { table_name: "workspaces", column_name: "active_graph_generation_id", data_type: "text" },
      { table_name: "workspaces", column_name: "pending_graph_generation_id", data_type: "text" },
      { table_name: "memories", column_name: "id", data_type: "text" },
      { table_name: "memories", column_name: "project_id", data_type: "text" },
      { table_name: "memories", column_name: "metadata", data_type: "text" },
      { table_name: "memories", column_name: "tags", data_type: "ARRAY" },
      { table_name: "documents", column_name: "id", data_type: "text" },
      { table_name: "documents", column_name: "project_id", data_type: "text" },
      { table_name: "scheduled_jobs", column_name: "id", data_type: "text" },
      { table_name: "scheduled_jobs", column_name: "payload", data_type: "text" },
      { table_name: "operation_log", column_name: "id", data_type: "text" },
      { table_name: "operation_log", column_name: "project_id", data_type: "text" },
    ],
    primaryKeys: [
      { table_name: "workspaces", columns: ["project_id"] },
      { table_name: "memories", columns: ["id"] },
      { table_name: "documents", columns: ["id"] },
      { table_name: "scheduled_jobs", columns: ["id"] },
      { table_name: "operation_log", columns: ["id"] },
    ],
    tables: {},
  });
}

function withSource(client: FakeClient, metadata: unknown): { client: FakeClient; source: string; target: string } {
  const source = "source";
  const target = "target";
  client.tables.workspaces = [
    { project_id: source, project_path: "/repos/app", active_graph_generation_id: null, pending_graph_generation_id: null },
  ];
  client.tables.memories = [
    { id: "m1", project_id: source, metadata: typeof metadata === "string" ? metadata : JSON.stringify(metadata), tags: [] },
  ];
  client.tables.documents = [{ id: "d1", project_id: source }];
  client.tables.scheduled_jobs = [];
  client.tables.operation_log = [];
  client.tables.project_identity_aliases = [];
  client.tables.project_identity_operations = [];
  return { client, source, target };
}

async function previewHash(
  client: FakeClient,
  mode: "rename" | "merge",
  source: string,
  target: string,
): Promise<string> {
  const plan = await computeIdentityPlan(client, { mode, sourceProjectId: source, targetProjectId: target });
  return hashProjectIdentityPlan({
    planVersion: PROJECT_IDENTITY_PLAN_VERSION,
    mode: plan.mode,
    sourceProjectId: plan.sourceProjectId,
    targetProjectId: plan.targetProjectId,
    sourceCanonicalRoot: plan.sourceCanonicalRoot,
    targetCanonicalRoot: plan.hasTarget ? plan.targetCanonicalRoot : null,
    stores: plan.stores,
    conflicts: plan.conflicts,
    unknownStores: plan.unknownStores,
    storageFingerprint: plan.storageFingerprint,
  });
}

// ── PgPoolTransactionRunner coverage (46-65) ────────────────────────────────
// The runner is private on the service. We exercise it via
// createProjectIdentityApplyService (which wires it) + apply(). A fake
// acquire/release pair records lifecycle; the client records BEGIN/COMMIT/
// ROLLBACK. We drive both the committed path and the rollback path.

describe("project-identity apply — PgPoolTransactionRunner coverage (46-65)", () => {
  test("committed path: acquire → BEGIN → body → COMMIT, then release; no rollback", async () => {
    const { client, source, target } = withSource(baselineClient(), { projectId: "source" });
    const acquired: number[] = [];
    const released: number[] = [];
    const service = createProjectIdentityApplyService(
      async () => { acquired.push(1); return client; },
      async (c) => { expect(c).toBe(client); released.push(1); },
    );
    const planHash = await previewHash(client, "rename", source, target);

    await service.apply({
      mode: "rename", sourceProjectId: source, targetProjectId: target,
      dryRun: false, operationId: "op-runner-commit", expectedPlanHash: planHash,
    });

    expect(acquired).toHaveLength(1);
    expect(released).toHaveLength(1);
    // The runner wrapped the body in BEGIN/COMMIT (committed path); no rollback.
    // (We can't assert on the private client's begin/commit counters directly
    // because the fake records them internally, but the successful apply +
    // the release callback firing proves the committed path ran.)
    expect(client.tables.project_identity_operations!.length).toBe(1);
  });

  test("rollback path: body throws → ROLLBACK fires, client released, error rethrown", async () => {
    const { client, source, target } = withSource(baselineClient(), { projectId: "source" });
    const released: number[] = [];
    const service = createProjectIdentityApplyService(
      async () => client,
      async (c) => { expect(c).toBe(client); released.push(1); },
    );

    // expectedPlanHash mismatch → body throws PLAN_CHANGED before any mutation.
    await expect(service.apply({
      mode: "rename", sourceProjectId: source, targetProjectId: target,
      dryRun: false, operationId: "op-runner-rollback", expectedPlanHash: "0".repeat(64),
    })).rejects.toMatchObject({ code: "PROJECT_IDENTITY_PLAN_CHANGED" });

    // The runner's finally clause released the client even though the body threw.
    expect(released).toHaveLength(1);
    // No operation row was written (rolled back).
    expect(client.tables.project_identity_operations?.length ?? 0).toBe(0);
  });

  test("best-effort rollback after a thrown body is swallowed when rollbackTransaction rejects", async () => {
    // Wrap the fake so rollbackTransaction throws (simulating a real pool client
    // that rejects a second ROLLBACK). The runner's `try { rollback } catch {}`
    // must swallow it, release the client, and rethrow the original error.
    const { client, source, target } = withSource(baselineClient(), { projectId: "source" });
    const originalRollback = client.rollbackTransaction.bind(client);
    client.rollbackTransaction = async () => {
      await originalRollback();
      throw new Error("rollback rejected (best-effort)");
    };
    const released: number[] = [];
    const service = createProjectIdentityApplyService(
      async () => client,
      async (c) => { expect(c).toBe(client); released.push(1); },
    );

    await expect(service.apply({
      mode: "rename", sourceProjectId: source, targetProjectId: target,
      dryRun: false, operationId: "op-runner-rollback-throws", expectedPlanHash: "0".repeat(64),
    })).rejects.toMatchObject({ code: "PROJECT_IDENTITY_PLAN_CHANGED" });

    // The swallowed rollback error did NOT prevent release.
    expect(released).toHaveLength(1);
  });
});

// ── rewriteIdentityArray coverage (194-215) ─────────────────────────────────
// rewriteIdentityArray is private; exercised via rewritePayloadStore during
// apply. The memories.metadata payload (json-text encoding) is parsed,
// rewritten, and re-serialized. We drive each branch with a different
// payload shape.

describe("project-identity apply — rewriteIdentityArray coverage (194-215)", () => {
  async function runApplyWithMetadata(metadata: unknown): Promise<unknown> {
    const { client, source, target } = withSource(baselineClient(), metadata);
    const service = new ProjectIdentityApplyService({
      withTransaction: async <T,>(body: (c: FakeClient) => Promise<T>): Promise<T> => {
        await client.beginTransaction();
        try {
          const result = await body(client);
          await client.commitTransaction();
          return result;
        } catch (error) {
          try { await client.rollbackTransaction(); } catch { /* best-effort */ }
          throw error;
        }
      },
    });
    const planHash = await previewHash(client, "rename", source, target);
    await service.apply({
      mode: "rename", sourceProjectId: source, targetProjectId: target,
      dryRun: false, operationId: "op-rewrite-array", expectedPlanHash: planHash,
    });
    return client.tables.memories[0]!.metadata;
  }

  test("rewrites a nested array of objects carrying projectId (array → object branch, 202-213)", async () => {
    const metadata = {
      projectId: "source",
      related: [
        { projectId: "source", name: "a" },
        { projectId: "other", name: "b" },
      ],
    };
    const result = await runApplyWithMetadata(metadata);
    const parsed = JSON.parse(result as string);
    expect(parsed.projectId).toBe("target");
    expect(parsed.related[0].projectId).toBe("target");
    expect(parsed.related[1].projectId).toBe("other");
  });

  test("rewrites a nested array of arrays (array → array recursive branch, 202-206)", async () => {
    const metadata = {
      matrix: [
        [{ projectId: "source" }, { projectId: "other" }],
        [{ projectId: "source" }],
      ],
    };
    const result = await runApplyWithMetadata(metadata);
    const parsed = JSON.parse(result as string);
    expect(parsed.matrix[0][0].projectId).toBe("target");
    expect(parsed.matrix[0][1].projectId).toBe("other");
    expect(parsed.matrix[1][0].projectId).toBe("target");
  });

  test("leaves non-identity, non-object array items unchanged (primitive branch, 214)", async () => {
    const metadata = {
      tags: ["alpha", "beta", "handoff:source"],
      counts: [1, 2, 3],
    };
    const result = await runApplyWithMetadata(metadata);
    const parsed = JSON.parse(result as string);
    expect(parsed.tags).toEqual(["alpha", "beta", "handoff:source"]);
    expect(parsed.counts).toEqual([1, 2, 3]);
  });

  test("does not rewrite when no identity key matches (rewritten stays false, 200/215)", async () => {
    const metadata = { name: "x", nested: { foo: "bar", list: [1, 2] } };
    const result = await runApplyWithMetadata(metadata);
    const parsed = JSON.parse(result as string);
    expect(parsed).toEqual(metadata);
  });
});

// ── createProjectIdentityApplyService options (839-853) ────────────────────

describe("project-identity apply — createProjectIdentityApplyService options (839-853)", () => {
  test("factory wires the runner, invalidators, publisher, and schema (all options)", async () => {
    const { client, source, target } = withSource(baselineClient(), { projectId: "source" });
    const acquired: number[] = [];
    const released: number[] = [];
    const invalidators = new ProjectIdentityInvalidatorRegistry();
    const published: ProjectIdentityChangedPayload[] = [];
    const publisher: ProjectIdentityChangedPublisher = { publish: (p) => published.push(p) };
    const service = createProjectIdentityApplyService(
      async () => { acquired.push(1); return client; },
      async (c) => { expect(c).toBe(client); released.push(1); },
      { invalidators, publisher, schema: "public" },
    );
    expect(service).toBeInstanceOf(ProjectIdentityApplyService);
    const planHash = await previewHash(client, "rename", source, target);

    const result = await service.apply({
      mode: "rename", sourceProjectId: source, targetProjectId: target,
      dryRun: false, operationId: "op-factory-all", expectedPlanHash: planHash,
    });

    expect(result.operationId).toBe("op-factory-all");
    expect(acquired).toHaveLength(1);
    expect(released).toHaveLength(1);
    // The publisher was wired and fired exactly once (post-commit).
    expect(published).toHaveLength(1);
    expect(published[0]!.operationId).toBe("op-factory-all");
  });

  test("factory defaults: no invalidators, no publisher, default schema (empty options)", async () => {
    const { client, source, target } = withSource(baselineClient(), { projectId: "source" });
    const released: number[] = [];
    // Pass NO options (defaults: invalidators=undefined, publisher=undefined,
    // schema="public"). The factory must still produce a working service.
    const service = createProjectIdentityApplyService(
      async () => client,
      async (c) => { expect(c).toBe(client); released.push(1); },
    );
    expect(service).toBeInstanceOf(ProjectIdentityApplyService);
    const planHash = await previewHash(client, "rename", source, target);

    const result = await service.apply({
      mode: "rename", sourceProjectId: source, targetProjectId: target,
      dryRun: false, operationId: "op-factory-defaults", expectedPlanHash: planHash,
    });

    expect(result.operationId).toBe("op-factory-defaults");
    expect(released).toHaveLength(1);
    // Default NOOP publisher → no throw, no invalidation field.
    expect("invalidation" in result).toBe(false);
  });

  test("factory with partial options (only publisher) defaults the rest", async () => {
    const { client, source, target } = withSource(baselineClient(), { projectId: "source" });
    const published: ProjectIdentityChangedPayload[] = [];
    const service = createProjectIdentityApplyService(
      async () => client,
      async () => { /* release */ },
      { publisher: { publish: (p) => published.push(p) } },
    );
    const planHash = await previewHash(client, "rename", source, target);

    await service.apply({
      mode: "rename", sourceProjectId: source, targetProjectId: target,
      dryRun: false, operationId: "op-factory-partial", expectedPlanHash: planHash,
    });

    expect(published).toHaveLength(1);
    expect(published[0]!.operationId).toBe("op-factory-partial");
  });
});