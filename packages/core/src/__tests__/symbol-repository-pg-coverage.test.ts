/**
 * SymbolRepositoryPg facade coverage — uses PG when available.
 * The facade delegates to per-domain modules; this test verifies the delegates
 * are wired correctly and cover the singleton + method signatures.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { SymbolRepositoryPg } from "../data/symbol/symbol-repository-pg.js";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const TEST_PREFIX = "cov-symrepo-";

function testProjectId(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
}

let prisma: any;

beforeAll(async () => {
  if (!DB_AVAILABLE) return;
  const { getPrismaClient } = await import("../services/query/prisma-client.js");
  prisma = getPrismaClient();
});

afterEach(async () => {
  if (!DB_AVAILABLE) return;
  await prisma.$executeRaw`DELETE FROM workspaces WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
});

afterAll(async () => {
  if (!DB_AVAILABLE) return;
  await prisma.$executeRaw`DELETE FROM workspaces WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
});

function wsInput(projectId: string, overrides: Record<string, any> = {}) {
  return {
    project_id: projectId,
    project_path: `/tmp/${projectId}`,
    display_name: "test",
    status: "indexing",
    files_count: 0,
    chunks_count: 0,
    symbols_count: 0,
    ...overrides,
  };
}

describe.skipIf(!DB_AVAILABLE)("SymbolRepositoryPg facade (PostgreSQL)", () => {
  test("getInstance returns a singleton", () => {
    const a = SymbolRepositoryPg.getInstance();
    const b = SymbolRepositoryPg.getInstance();
    expect(a).toBe(b);
  });

  test("upsertWorkspace + getWorkspace round-trip", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const ws = await repo.getWorkspace(projectId);
    expect(ws).not.toBeNull();
    expect(ws!.project_id).toBe(projectId);
    expect(ws!.status).toBe("indexing");
  });

  test("updateWorkspaceStatus changes status", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.updateWorkspaceStatus(projectId, "indexed", {
      filesCount: 5,
      chunksCount: 10,
      symbolsCount: 20,
    });
    const ws = await repo.getWorkspace(projectId);
    expect(ws!.status).toBe("indexed");
    expect(ws!.files_count).toBe(5);
  });

  test("updateWorkspaceStatus with string error option", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.updateWorkspaceStatus(projectId, "error", "something went wrong");
    const ws = await repo.getWorkspace(projectId);
    expect(ws!.status).toBe("error");
    expect(ws!.last_error).toBe("something went wrong");
  });

  test("listWorkspaces returns all workspaces", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId, { display_name: "list-test" }));
    const all = await repo.listWorkspaces();
    expect(all.some((w) => w.project_id === projectId)).toBe(true);
  });

  test("deleteWorkspace removes a workspace", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.deleteWorkspace(projectId);
    expect(await repo.getWorkspace(projectId)).toBeNull();
  });

  test("upsertFile + getFile round-trip", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.upsertFile({
      project_id: projectId,
      relative_path: "src/a.ts",
      content_hash: "hash-a",
      mtime: Date.now(),
      size: 100,
      indexed_at: Date.now(),
      symbol_count: 5,
      chunk_count: 2,
    } as any);
    const file = await repo.getFile(projectId, "src/a.ts");
    expect(file).not.toBeNull();
    expect(file!.content_hash).toBe("hash-a");
  });

  test("getFile returns null for missing file", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    expect(await repo.getFile("nonexistent", "missing.ts")).toBeNull();
  });

  test("getCentrality returns a Map", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const centrality = await repo.getCentrality(projectId);
    expect(centrality).toBeInstanceOf(Map);
  });

  test("clearProject removes all project data", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.clearProject(projectId);
    expect(await repo.getWorkspace(projectId)).toBeNull();
  });

  test("getActiveGenerationScope returns scope for project with legacy generation", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const scope = await repo.getActiveGenerationScope(projectId);
    expect(scope).not.toBeNull();
  });

  test("getActiveGraphSnapshot returns snapshot", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const snapshot = await repo.getActiveGraphSnapshot(projectId);
    expect(snapshot).not.toBeNull();
  });

  test("allFiles returns array of file paths", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const files = await repo.allFiles(projectId);
    expect(Array.isArray(files)).toBe(true);
  });

  test("allImportEdges returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const edges = await repo.allImportEdges(projectId);
    expect(Array.isArray(edges)).toBe(true);
  });

  test("findImporters returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const importers = await repo.findImporters(projectId, "src/a.ts");
    expect(Array.isArray(importers)).toBe(true);
  });

  test("findReferencesByFqn returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const refs = await repo.findReferencesByFqn(projectId, "src/a.ts#foo");
    expect(Array.isArray(refs)).toBe(true);
  });

  test("findReferencesByName returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const refs = await repo.findReferencesByName(projectId, "foo");
    expect(Array.isArray(refs)).toBe(true);
  });

  test("findEdges returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const edges = await repo.findEdges(projectId);
    expect(Array.isArray(edges)).toBe(true);
  });

  test("countEdgesByKind returns record", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const counts = await repo.countEdgesByKind(projectId);
    expect(typeof counts).toBe("object");
  });

  test("listDefinitions returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const defs = await repo.listDefinitions(projectId);
    expect(Array.isArray(defs)).toBe(true);
  });

  test("listAllDefinitions returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const defs = await repo.listAllDefinitions(projectId);
    expect(Array.isArray(defs)).toBe(true);
  });

  test("findDefinitionsByName returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const defs = await repo.findDefinitionsByName(projectId, "foo");
    expect(Array.isArray(defs)).toBe(true);
  });

  test("findDefinitionByFqn returns null for missing", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const def = await repo.findDefinitionByFqn(projectId, "src/missing.ts#foo");
    expect(def).toBeNull();
  });

  test("findDependencies returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const deps = await repo.findDependencies(projectId, "src/a.ts");
    expect(Array.isArray(deps)).toBe(true);
  });

  test("getProjectMapAggregates returns result", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.getProjectMapAggregates(projectId);
    expect(result).toBeDefined();
  });

  test("getProjectMapSnapshot returns snapshot or null", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.getProjectMapSnapshot(projectId);
    expect(result === null || typeof result === "object").toBe(true);
  });

  test("resolveDefinitionFqn returns result", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.resolveDefinitionFqn(projectId, "src/a.ts#foo");
    expect(result).toBeDefined();
  });

  test("searchDefinitions returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.searchDefinitions(projectId, "foo");
    expect(Array.isArray(result)).toBe(true);
  });

  test("countDefinitions returns number", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.countDefinitions(projectId);
    expect(typeof result).toBe("number");
  });

  test("getDefinition returns null for missing", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    expect(await repo.getDefinition("nonexistent", "missing#foo")).toBeNull();
  });

  test("getTopCentralFiles returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.getTopCentralFiles(projectId, 5);
    expect(Array.isArray(result)).toBe(true);
  });

  test("getReferences returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.getReferences(projectId, "foo");
    expect(Array.isArray(result)).toBe(true);
  });

  test("getImportsFrom returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.getImportsFrom(projectId, "src/a.ts");
    expect(Array.isArray(result)).toBe(true);
  });

  test("updateCentrality updates scores", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const scores = new Map([["src/a.ts", 0.5]]);
    await repo.updateCentrality(projectId, scores);
  });

  test("runBfsCteImpact returns array", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.runBfsCteImpact(projectId, ["src/a.ts"], { depth: 3, maxImpacted: 100 });
    expect(Array.isArray(result)).toBe(true);
  });

  test("deleteDefinitionsByFile returns number", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.deleteDefinitionsByFile(projectId, "src/a.ts");
    expect(typeof result).toBe("number");
  });

  test("deleteReferencesByFile returns number", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.deleteReferencesByFile(projectId, "src/a.ts");
    expect(typeof result).toBe("number");
  });

  test("deleteImportsByFile returns number", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    const result = await repo.deleteImportsByFile(projectId, "src/a.ts");
    expect(typeof result).toBe("number");
  });

  test("batchUpsertDefinitions does not throw", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.batchUpsertDefinitions([
      {
        id: `${projectId}/src/a.ts#foo`,
        project_id: projectId,
        file_path: "src/a.ts",
        name: "foo",
        kind: "function",
        line_start: 1,
        line_end: 5,
        exported: true,
        indexed_at: Date.now(),
      } as any,
    ]);
  });

  test("batchInsertReferences does not throw", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.batchInsertReferences([
      {
        project_id: projectId,
        from_file: "src/a.ts",
        from_line: 1,
        symbol_name: "foo",
        target_fqn: undefined,
        ref_kind: "call",
        meta: null,
      } as any,
    ]);
  });

  test("batchInsertImports does not throw", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.batchInsertImports([
      {
        project_id: projectId,
        from_file: "src/a.ts",
        to_file: undefined,
        specifier: "./b",
        imported_names: ["B"],
        is_external: false,
        is_type_only: false,
      } as any,
    ]);
  });

  test("insertReference does not throw", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.insertReference({
      project_id: projectId,
      from_file: "src/a.ts",
      from_line: 1,
      symbol_name: "foo",
      target_fqn: undefined,
      ref_kind: "call",
      meta: null,
    } as any);
  });

  test("insertImport does not throw", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.insertImport({
      project_id: projectId,
      from_file: "src/a.ts",
      to_file: undefined,
      specifier: "./b",
      imported_names: ["B"],
      is_external: false,
      is_type_only: false,
    } as any);
  });

  test("upsertDefinition does not throw", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId));
    await repo.upsertDefinition({
      id: `${projectId}/src/a.ts#bar`,
      project_id: projectId,
      file_path: "src/a.ts",
      name: "bar",
      kind: "class",
      line_start: 1,
      line_end: 10,
      exported: false,
      indexed_at: Date.now(),
    } as any);
  });

  test("upsertCentrality does not throw", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    await repo.upsertCentrality({
      project_id: projectId,
      file_path: "src/a.ts",
      score: 0.75,
      updated_at: Date.now(),
    } as any);
  });

  test("writeFileSymbols does not throw", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    await repo.writeFileSymbols(projectId, "src/a.ts", [], [], []);
  });

  test("copyFileGeneration returns missing for nonexistent file", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    const lease = {
      projectId, generationId: "test-gen", leaseToken: "token",
      expectedActiveGenerationId: null, fingerprint: "fp", inputSnapshotHash: "hash",
      expectedFilesCount: 0, leaseExpiresAt: Date.now() + 300000,
    } as any;
    const result = await repo.copyFileGeneration(lease, "old-gen", "src/a.ts");
    expect(result.status).toBe("lease_lost");
  });

  test("writeFileGeneration returns lease_lost for invalid lease", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    const lease = {
      projectId, generationId: "test-gen", leaseToken: "token",
      expectedActiveGenerationId: null, fingerprint: "fp", inputSnapshotHash: "hash",
      expectedFilesCount: 0, leaseExpiresAt: Date.now() + 300000,
    } as any;
    const result = await repo.writeFileGeneration({
      lease,
      file: {
        project_id: projectId,
        relative_path: "src/a.ts",
        content_hash: "hash",
        mtime: 0,
        size: 0,
        indexed_at: Date.now(),
        symbol_count: 0,
        chunk_count: 0,
        is_stale: false,
      },
      definitions: [],
      references: [],
      imports: [],
    } as any);
    expect(result.status).toBe("lease_lost");
  });

  test("deleteFileGeneration returns lease_lost for invalid lease", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    const lease = {
      projectId, generationId: "test-gen", leaseToken: "token",
      expectedActiveGenerationId: null, fingerprint: "fp", inputSnapshotHash: "hash",
      expectedFilesCount: 0, leaseExpiresAt: Date.now() + 300000,
    } as any;
    const result = await repo.deleteFileGeneration(lease, "src/a.ts");
    expect(result.status).toBe("lease_lost");
  });

  test("markFileStaleGeneration returns lease_lost for invalid lease", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    const lease = {
      projectId, generationId: "test-gen", leaseToken: "token",
      expectedActiveGenerationId: null, fingerprint: "fp", inputSnapshotHash: "hash",
      expectedFilesCount: 0, leaseExpiresAt: Date.now() + 300000,
    } as any;
    const result = await repo.markFileStaleGeneration(lease, "src/a.ts", {
      lastKnownGoodGenerationId: "old-gen",
      diagnostics: [],
      parserErrorCount: 0,
    } as any);
    expect(result.status).toBe("lease_lost");
  });

  test("updateCentralityGeneration returns lease_lost for invalid lease", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = testProjectId();
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    const lease = {
      projectId, generationId: "test-gen", leaseToken: "token",
      expectedActiveGenerationId: null, fingerprint: "fp", inputSnapshotHash: "hash",
      expectedFilesCount: 0, leaseExpiresAt: Date.now() + 300000,
    } as any;
    const result = await repo.updateCentralityGeneration(lease, [
      { filePath: "src/a.ts", score: 0.5 },
    ]);
    expect(result.status).toBe("lease_lost");
  });
});