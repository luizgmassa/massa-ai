/**
 * T4 tests — project identity writer-guard installation, post-commit
 * invalidator registry, and production wiring composition.
 *
 * Spec anchors (M16+M17 spec.md):
 *  - req 3: every project-scoped writer passes through one PostgreSQL identity
 *    guard (trigger install on every mutable direct store + runtime tables).
 *  - req 8: post-commit invalidator/event failures NEVER flip a committed
 *    operation; diagnostics are sanitized (no messages, no payloads).
 *  - req 9: errors are typed and sanitized — SQLSTATE-style codes only.
 */

import { describe, expect, test } from "bun:test";

import { eventBus } from "../services/events/event-bus.js";
import {
  EMPTY_INVALIDATION_REPORT,
  ProjectIdentityInvalidatorRegistry,
  createEventBusProjectIdentityChangedPublisher,
  createProductionProjectIdentityInvalidatorRegistry,
  installGuardOnTable,
  installProjectIdentityGuards,
  type IdentityGuardInstallerClient,
  type ProductionInvalidatorTargets,
} from "../services/project-identity/index.js";

// ─── Guard installer ────────────────────────────────────────────────────────

class FakeInstallerClient implements IdentityGuardInstallerClient {
  installs: { target: string; column: string }[] = [];
  pgTables: string[] = [];
  failingTargets = new Map<string, unknown>();

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: Row[] }> {
    if (text.includes("pg_tables")) {
      return { rows: this.pgTables.map((tablename) => ({ tablename })) as unknown as Row[] };
    }
    if (text.includes("project_identity_install_guard")) {
      const target = values[0] as string;
      if (this.failingTargets.has(target)) throw this.failingTargets.get(target);
      this.installs.push({ target, column: values[1] as string });
      return { rows: [] as Row[] };
    }
    throw new Error(`unexpected SQL in fake: ${text}`);
  }
}

// FROZEN explicit expectation (review-driven: deriving this from
// STATIC_DIRECT_STORES would mirror the implementation and pass green if a
// registry entry were deleted). 22 mutable direct stores + operation_log
// (guarded so NEW audit rows resolve aliases; history is never rewritten).
const EXPECTED_GUARDED_TABLES = [
  "memories",
  "projects",
  "documents",
  "search_queries",
  "cache_stats",
  "workspaces",
  "symbol_files",
  "symbol_definitions",
  "symbol_references",
  "symbol_imports",
  "symbol_centrality",
  "index_jobs",
  "observations",
  "task_checkpoints",
  "handoffs",
  "proposals",
  "graph_generations",
  "keyword_documents",
  "search_cache",
  "search_analytics",
  "search_events",
  "synapse_sessions",
  "operation_log",
] as const;
const EXPECTED_SKIPPED_TABLES = ["project_identity_operations"] as const;

describe("project identity guard installer", () => {
  test("installs the guard on exactly the frozen guarded-table set and skips only the operations table", async () => {
    const client = new FakeInstallerClient();
    const report = await installProjectIdentityGuards(client);

    expect(report.installed.slice().sort()).toEqual(EXPECTED_GUARDED_TABLES.slice().sort());
    expect(report.skipped).toEqual([...EXPECTED_SKIPPED_TABLES]);
    expect(report.failures).toEqual([]);

    // Every install call targets public.<table> with the registry's identity
    // column — synapse_sessions is the workspace_id store.
    const byTable = new Map(
      client.installs.map((i) => [i.target.replace(/^public\./, ""), i.column]),
    );
    expect(byTable.get("synapse_sessions")).toBe("workspace_id");
    for (const table of EXPECTED_GUARDED_TABLES) {
      expect(byTable.get(table)).toBe(
        table === "synapse_sessions" ? "workspace_id" : "project_id",
      );
    }
  });

  test("discovers and guards runtime vector_documents* tables with project_id", async () => {
    const client = new FakeInstallerClient();
    client.pgTables = ["vector_documents", "vector_documents_768d", "vector_documents_3072d"];
    const report = await installProjectIdentityGuards(client);

    expect(report.runtimeTablesGuarded.slice().sort()).toEqual([
      "vector_documents",
      "vector_documents_3072d",
      "vector_documents_768d",
    ]);
    for (const table of client.pgTables) {
      const install = client.installs.find((i) => i.target === `public.${table}`);
      expect(install?.column).toBe("project_id");
    }
    expect(report.failures).toEqual([]);
  });

  test("per-table failure is isolated, sanitized, and never aborts the loop", async () => {
    const client = new FakeInstallerClient();
    const sensitive = Object.assign(new Error("relation detail: password=hunter2"), { code: "42703" });
    client.failingTargets.set("public.memories", sensitive);
    client.pgTables = ["vector_documents"];

    const report = await installProjectIdentityGuards(client);

    // Loop continued past the failure: every other guarded store installed.
    expect(report.installed.length).toBe(EXPECTED_GUARDED_TABLES.length - 1);
    expect(report.installed).not.toContain("memories");
    expect(report.runtimeTablesGuarded).toEqual(["vector_documents"]);
    expect(report.failures).toEqual([{ table: "memories", code: "42703" }]);
    // Sanitization: the error message never leaks into the report.
    expect(JSON.stringify(report)).not.toContain("hunter2");
    expect(JSON.stringify(report)).not.toContain("relation detail");
  });

  test("failure without a PG code is reported as UNKNOWN", async () => {
    const client = new FakeInstallerClient();
    client.failingTargets.set("public.documents", new Error("boom"));

    const report = await installProjectIdentityGuards(client);

    expect(report.failures).toEqual([{ table: "documents", code: "UNKNOWN" }]);
    expect(report.installed).toContain("memories");
  });

  test("installGuardOnTable returns undefined on success and the code on failure; never throws", async () => {
    const client = new FakeInstallerClient();
    await expect(installGuardOnTable(client, "public", "memories", "project_id"))
      .resolves.toBeUndefined();

    client.failingTargets.set("public.memories", Object.assign(new Error("x"), { code: "42P01" }));
    await expect(installGuardOnTable(client, "public", "memories", "project_id"))
      .resolves.toBe("42P01");

    client.failingTargets.set("public.other", new Error("no code"));
    await expect(installGuardOnTable(client, "public", "other", "project_id"))
      .resolves.toBe("UNKNOWN");
  });
});

// ─── Invalidator registry ───────────────────────────────────────────────────

describe("project identity invalidator registry", () => {
  test("empty registry returns the frozen EMPTY report by reference", async () => {
    const registry = new ProjectIdentityInvalidatorRegistry();
    const report = await registry.invalidateBoth("source", "target");
    expect(report).toBe(EMPTY_INVALIDATION_REPORT);
  });

  test("invalidateBoth runs every invalidator for source AND target with cell attribution", async () => {
    const calls: string[] = [];
    const registry = new ProjectIdentityInvalidatorRegistry();
    registry.register({
      id: "a",
      invalidateProject(projectId) { calls.push(`a:${projectId}`); },
    });
    registry.register({
      id: "b",
      async invalidateProject(projectId) { calls.push(`b:${projectId}`); },
    });

    const report = await registry.invalidateBoth("source", "target");

    expect(calls.sort()).toEqual(["a:source", "a:target", "b:source", "b:target"]);
    expect(report.invalidated).toHaveLength(4);
    expect(report.invalidated).toContainEqual({ invalidatorId: "a", projectId: "source" });
    expect(report.invalidated).toContainEqual({ invalidatorId: "a", projectId: "target" });
    expect(report.invalidated).toContainEqual({ invalidatorId: "b", projectId: "source" });
    expect(report.invalidated).toContainEqual({ invalidatorId: "b", projectId: "target" });
    expect(report.failures).toEqual([]);
  });

  test("a throwing registrant is isolated and sanitized; others still run for both IDs", async () => {
    const calls: string[] = [];
    const registry = new ProjectIdentityInvalidatorRegistry();
    registry.register({
      id: "broken-sync",
      invalidateProject() { throw Object.assign(new Error("secret path /home/alice"), { code: "E_CACHE" }); },
    });
    registry.register({
      id: "broken-async",
      async invalidateProject() { throw new Error("no code here"); },
    });
    registry.register({
      id: "healthy",
      invalidateProject(projectId) { calls.push(projectId); },
    });

    const report = await registry.invalidateBoth("source", "target");

    expect(calls.sort()).toEqual(["source", "target"]);
    expect(report.invalidated).toHaveLength(2);
    expect(report.failures).toHaveLength(4);
    expect(report.failures).toContainEqual({ invalidatorId: "broken-sync", code: "E_CACHE" });
    expect(report.failures).toContainEqual({ invalidatorId: "broken-async", code: "UNKNOWN" });
    // Sanitization: messages never surface.
    expect(JSON.stringify(report)).not.toContain("/home/alice");
    expect(JSON.stringify(report)).not.toContain("no code here");
  });
});

// ─── Production wiring composition ──────────────────────────────────────────

function recorderTargets(): ProductionInvalidatorTargets & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    queryUnderstanding: { invalidateProject: (p) => { calls.push(`qu:${p}`); } },
    fileFilterCache: { invalidateProject: (p) => { calls.push(`ff:${p}`); return 1; } },
    indexManager: { clearCache: (p) => { calls.push(`im:${p}`); } },
    symbolGraph: { clearProjectRoot: (p) => { calls.push(`sg:${p}`); } },
  };
}

describe("project identity production wiring", () => {
  test("composed registry fans out to all four production caches plus the alias resolver for both IDs", async () => {
    const targets = recorderTargets();
    const registry = createProductionProjectIdentityInvalidatorRegistry(() => targets);

    const report = await registry.invalidateBoth("source", "target");

    expect(report.failures).toEqual([]);
    // 4 target-backed invalidators × 2 IDs + alias-resolver × 2 IDs.
    expect(report.invalidated).toHaveLength(10);
    expect(report.invalidated).toContainEqual({ invalidatorId: "project-identity-alias-resolver", projectId: "source" });
    expect(report.invalidated).toContainEqual({ invalidatorId: "project-identity-alias-resolver", projectId: "target" });
    expect(targets.calls.sort()).toEqual([
      "ff:source", "ff:target",
      "im:source", "im:target",
      "qu:source", "qu:target",
      "sg:source", "sg:target",
    ]);
  });

  test("a cold engine (null indexManager) invalidates the rest without failure", async () => {
    const targets = recorderTargets();
    targets.indexManager = null;
    const registry = createProductionProjectIdentityInvalidatorRegistry(() => targets);

    const report = await registry.invalidateBoth("source", "target");

    expect(report.failures).toEqual([]);
    expect(targets.calls).not.toContain("im:source");
    expect(targets.calls).toContain("qu:source");
  });

  test("a target-resolver defect degrades to sanitized failures; invalidateBoth never rejects", async () => {
    const registry = createProductionProjectIdentityInvalidatorRegistry(() => {
      throw Object.assign(new Error("cannot resolve /secret"), { code: "E_RESOLVE" });
    });

    const report = await registry.invalidateBoth("source", "target");

    // The 4 target-backed invalidators fail per ID; the alias-resolver
    // invalidator does not depend on the injected targets and still succeeds.
    expect(report.invalidated).toHaveLength(2);
    expect(report.failures).toHaveLength(8);
    expect(report.failures.every((f) => f.code === "E_RESOLVE")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("/secret");
  });

  test("event publisher emits project-identity:changed through the shared event bus", () => {
    const publisher = createEventBusProjectIdentityChangedPublisher();
    const received: unknown[] = [];
    const unsubscribe = eventBus.subscribe("project-identity:changed", (payload) => {
      received.push(payload);
    });
    try {
      publisher.publish({
        mode: "rename",
        sourceProjectId: "source",
        targetProjectId: "target",
        operationId: "op-1",
        committedAt: "2026-07-19T00:00:00.000Z",
      });
    } finally {
      unsubscribe();
    }
    expect(received).toEqual([{
      mode: "rename",
      sourceProjectId: "source",
      targetProjectId: "target",
      operationId: "op-1",
      committedAt: "2026-07-19T00:00:00.000Z",
    }]);
  });
});
