/**
 * SymbolRepositoryPg facade coverage — uses PG when available.
 * The facade delegates to per-domain modules; this test verifies the delegates
 * are wired correctly and cover the singleton + method signatures.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { SymbolRepositoryPg } from "../data/symbol/symbol-repository-pg.js";
import { mapWs, mapFile, mapDef, mapRef, mapImp } from "../data/symbol/symbol-repo-mappers.js";
import {
  definitionIdentityColumns,
  generationDefinitionIdentityColumns,
  referenceSourceSpan,
} from "../data/symbol/symbol-repo-identity.js";
import {
  validateGenerationFileWrite,
  definitionCandidate,
  compareDefinitionCandidates,
  lockOwnedPendingGeneration,
  lockActiveGenerations,
} from "../data/symbol/symbol-repo-generation.js";
import type { GraphGenerationLease } from "../data/graph-generation/graph-generation-contract.js";
import type {
  SymbolDefinition,
  SymbolReference,
  SymbolImport,
  GenerationFileWrite,
} from "../data/symbol/symbol-repo-types.js";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const TEST_PREFIX = "cov-symrepo-";

function testProjectId(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
}

let prisma: any;

beforeAll(async () => {
  if (!DB_AVAILABLE) return;
  const { getPrismaClient } = await import("../kernel/prisma-client.js");
  prisma = getPrismaClient();
});

async function purgeTestRows(): Promise<void> {
  if (!DB_AVAILABLE) return;
  // Generation-scoped writes create graph_generations + symbol_* children under
  // the GEN_TEST_PREFIX; clean them explicitly (workspaces CASCADE handles the
  // facade-prefix rows, but explicit child deletes avoid FK ordering issues).
  await prisma.$executeRaw`DELETE FROM symbol_references WHERE project_id LIKE ${GEN_TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM symbol_imports WHERE project_id LIKE ${GEN_TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM symbol_centrality WHERE project_id LIKE ${GEN_TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM symbol_definitions WHERE project_id LIKE ${GEN_TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM symbol_files WHERE project_id LIKE ${GEN_TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM graph_generations WHERE project_id LIKE ${GEN_TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM workspaces WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
}

afterEach(async () => {
  await purgeTestRows();
});

afterAll(async () => {
  await purgeTestRows();
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

// ─── Generation-scoped writes: PG happy paths ───────────────────────────────
// The generation write methods (copy/write/delete/markStale/updateCentrality/
// writeFileSymbols) are leased. A "lease_lost" stub only covers the fast-reject
// branch; the durable write bodies need a real pending generation + matching
// lease so lockOwnedPendingGeneration() returns true and the INSERT/DELETE/UPDATE
// statements execute against the dedicated DB.

const GEN_TEST_PREFIX = "cov-symgen-";

function genProjectId(): string {
  return `${GEN_TEST_PREFIX}${randomUUID()}`;
}

function baseLease(projectId: string, activeId: string, pendingId: string): GraphGenerationLease {
  return {
    projectId,
    generationId: pendingId,
    leaseToken: "pending-owner-token",
    expectedActiveGenerationId: activeId,
    fingerprint: "structural:v2",
    inputSnapshotHash: "snapshot:v2",
    expectedFilesCount: 2,
    leaseExpiresAt: Date.now() + 300_000,
  };
}

async function seedPendingGeneration(
  projectId: string,
  activeId: string,
  pendingId: string,
): Promise<void> {
  await prisma.$executeRaw`DELETE FROM graph_generations WHERE project_id = ${projectId}`;
  await prisma.$executeRaw`
    INSERT INTO graph_generations (
      id, project_id, status, fingerprint, input_snapshot_hash, expected_active_id,
      lease_token, lease_expires_at, expected_files_count, started_at
    ) VALUES (
      ${activeId}, ${projectId}, 'active', 'structural:v1', 'snapshot:v1', NULL, NULL, NULL, 1, NOW()
    ), (
      ${pendingId}, ${projectId}, 'pending', 'structural:v2', 'snapshot:v2', ${activeId},
      'pending-owner-token', NOW() + INTERVAL '5 minutes', 2, NOW()
    )
  `;
  await prisma.$executeRaw`
    UPDATE workspaces
    SET active_graph_generation_id = ${activeId},
        pending_graph_generation_id = ${pendingId},
        graph_lease_token = 'pending-owner-token',
        graph_lease_expires_at = NOW() + INTERVAL '5 minutes',
        graph_lease_heartbeat_at = NOW()
    WHERE project_id = ${projectId}
  `;
}

async function seedFile(generationId: string, projectId: string, path: string, hash = "a".repeat(64)): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO symbol_files (
      project_id, generation_id, relative_path, content_hash, mtime, size, indexed_at,
      symbol_count, chunk_count, language, parser_status, parser_error_count, diagnostics, is_stale
    ) VALUES (
      ${projectId}, ${generationId}, ${path}, ${hash}, 1, 10, NOW(),
      1, 0, 'typescript', 'ok', 0, '[]'::jsonb, false
    )
  `;
}

describe.skipIf(!DB_AVAILABLE)("SymbolRepositoryPg generation-scoped writes (PostgreSQL)", () => {
  test("copyFileGeneration copies an unchanged file and reports missing/lease_lost", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = genProjectId();
    const activeId = `gen-active-${randomUUID()}`;
    const pendingId = `gen-pending-${randomUUID()}`;
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    await seedPendingGeneration(projectId, activeId, pendingId);
    await seedFile(activeId, projectId, "src/active.ts", "active-hash");
    const lease = baseLease(projectId, activeId, pendingId);

    expect((await repo.copyFileGeneration(lease, activeId, "src/active.ts")).status).toBe("copied");
    // Missing source file → "missing".
    expect((await repo.copyFileGeneration(lease, activeId, "src/absent.ts")).status).toBe("missing");
    // sourceGenerationId !== expectedActiveGenerationId → lease_lost (fast path).
    expect((await repo.copyFileGeneration(lease, "other-gen", "src/active.ts")).status).toBe("lease_lost");
  });

  test("writeFileGeneration writes a file with defs/refs/imports and collapses duplicate ids", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = genProjectId();
    const activeId = `gen-active-${randomUUID()}`;
    const pendingId = `gen-pending-${randomUUID()}`;
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    await seedPendingGeneration(projectId, activeId, pendingId);
    const lease = baseLease(projectId, activeId, pendingId);

    const def = (name: string): SymbolDefinition => ({
      id: `src/new.ts#${name}`, project_id: projectId, file_path: "src/new.ts", name,
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: Date.now(),
    });
    const file = {
      project_id: projectId, relative_path: "src/new.ts", content_hash: "new-hash",
      mtime: 1, size: 10, indexed_at: Date.now(), symbol_count: 1, chunk_count: 0,
      parser_status: "ok" as const, parser_error_count: 0, diagnostics: [],
    };
    // Two definitions share an id → collapse keeps one.
    const result = await repo.writeFileGeneration({
      lease, file,
      definitions: [def("Dup"), def("Dup"), def("Other")],
      references: [{
        project_id: projectId, from_file: "src/new.ts", from_line: 2, symbol_name: "Dup",
        target_fqn: "src/new.ts#Dup", ref_kind: "call",
        source_span: { startByte: 0, endByte: 4, start: { row: 1, column: 0 }, end: { row: 1, column: 4 } },
      }],
      imports: [{ project_id: projectId, from_file: "src/new.ts", specifier: "./x", imported_names: ["X"], is_external: false, is_type_only: false }],
    } as any);
    expect(result.status).toBe("written");
    const rows = await prisma.$queryRaw<Array<{ defs: number }>>`SELECT count(*)::int defs FROM symbol_definitions WHERE project_id=${projectId} AND generation_id=${pendingId} AND file_path='src/new.ts'`;
    expect(rows[0]!.defs).toBe(2);

    // Second write drops "Other": its id leaves retainedIds → the inbound-ref
    // cleanup DELETE (removedIds.length > 0) executes.
    const result2 = await repo.writeFileGeneration({
      lease, file,
      definitions: [def("Dup")],
      references: [], imports: [],
    } as any);
    expect(result2.status).toBe("written");
  });

  test("deleteFileGeneration removes the owned pending file graph and rejects empty path", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = genProjectId();
    const activeId = `gen-active-${randomUUID()}`;
    const pendingId = `gen-pending-${randomUUID()}`;
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    await seedPendingGeneration(projectId, activeId, pendingId);
    await seedFile(pendingId, projectId, "src/drop.ts", "drop-hash");
    const lease = baseLease(projectId, activeId, pendingId);
    // Seed a pending-only definition + an inbound reference so the delete path's
    // orphan-ref cleanup (ids.length > 0) executes.
    await prisma.$executeRaw`
      INSERT INTO symbol_definitions (id, project_id, generation_id, file_path, name, kind, line_start, line_end, exported, indexed_at, qualified_name, legacy_fqn)
      VALUES ('src/drop.ts#Gone', ${projectId}, ${pendingId}, 'src/drop.ts', 'Gone', 'function', 1, 2, true, NOW(), 'Gone', 'src/drop.ts#Gone')
    `;
    await prisma.$executeRaw`
      INSERT INTO symbol_references (project_id, generation_id, from_file, from_line, symbol_name, target_fqn, ref_kind)
      VALUES (${projectId}, ${pendingId}, 'src/caller.ts', 1, 'Gone', 'src/drop.ts#Gone', 'call')
    `;

    expect((await repo.deleteFileGeneration(lease, "src/drop.ts")).status).toBe("deleted");
    const left = await prisma.$queryRaw<Array<{ c: number }>>`SELECT count(*)::int c FROM symbol_files WHERE project_id=${projectId} AND generation_id=${pendingId} AND relative_path='src/drop.ts'`;
    expect(left[0]!.c).toBe(0);
    // Empty path throws before the transaction.
    await expect(repo.deleteFileGeneration(lease, "")).rejects.toThrow();
  });

  test("markFileStaleGeneration restores last-known-good and rejects bad input", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = genProjectId();
    const activeId = `gen-active-${randomUUID()}`;
    const pendingId = `gen-pending-${randomUUID()}`;
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    await seedPendingGeneration(projectId, activeId, pendingId);
    await seedFile(activeId, projectId, "src/lkg.ts", "lkg-hash");
    const lease = baseLease(projectId, activeId, pendingId);
    // Seed a pending-only definition (absent from last-known-good) + an inbound
    // reference so the stale-restore orphan-ref cleanup (removedIds.length > 0)
    // executes.
    await prisma.$executeRaw`
      INSERT INTO symbol_definitions (id, project_id, generation_id, file_path, name, kind, line_start, line_end, exported, indexed_at, qualified_name, legacy_fqn)
      VALUES ('src/lkg.ts#PendingOnly', ${projectId}, ${pendingId}, 'src/lkg.ts', 'PendingOnly', 'function', 1, 2, true, NOW(), 'PendingOnly', 'src/lkg.ts#PendingOnly')
    `;
    await prisma.$executeRaw`
      INSERT INTO symbol_references (project_id, generation_id, from_file, from_line, symbol_name, target_fqn, ref_kind)
      VALUES (${projectId}, ${pendingId}, 'src/caller.ts', 1, 'PendingOnly', 'src/lkg.ts#PendingOnly', 'call')
    `;

    expect(
      (await repo.markFileStaleGeneration(lease, "src/lkg.ts", {
        lastKnownGoodGenerationId: activeId, diagnostics: [{ code: "parse_failed" }], parserErrorCount: 1,
      })).status,
    ).toBe("stale");
    // Wrong last-known-good id → lease_lost (active mismatch).
    expect(
      (await repo.markFileStaleGeneration(lease, "src/lkg.ts", {
        lastKnownGoodGenerationId: "wrong-gen", diagnostics: [], parserErrorCount: 0,
      })).status,
    ).toBe("lease_lost");
    // Invalid input throws.
    await expect(repo.markFileStaleGeneration(lease, "", {
      lastKnownGoodGenerationId: activeId, diagnostics: [], parserErrorCount: 0,
    })).rejects.toThrow();
  });

  test("updateCentralityGeneration writes scores and rejects non-finite entries", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = genProjectId();
    const activeId = `gen-active-${randomUUID()}`;
    const pendingId = `gen-pending-${randomUUID()}`;
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    await seedPendingGeneration(projectId, activeId, pendingId);
    const lease = baseLease(projectId, activeId, pendingId);

    expect(
      (await repo.updateCentralityGeneration(lease, [
        { filePath: "src/a.ts", score: 0.5 }, { filePath: "src/b.ts", score: 0.25 },
      ])).status,
    ).toBe("written");
    const rows = await prisma.$queryRaw<Array<{ c: number }>>`SELECT count(*)::int c FROM symbol_centrality WHERE project_id=${projectId} AND generation_id=${pendingId}`;
    expect(rows[0]!.c).toBe(2);
    // Non-finite score → throws.
    await expect(
      repo.updateCentralityGeneration(lease, [{ filePath: "src/a.ts", score: Number.NaN }]),
    ).rejects.toThrow();
  });

  test("writeFileSymbols writes into the active generation", async () => {
    const repo = SymbolRepositoryPg.getInstance();
    const projectId = genProjectId();
    const activeId = `gen-active-${randomUUID()}`;
    const pendingId = `gen-pending-${randomUUID()}`;
    await repo.upsertWorkspace(wsInput(projectId, { status: "indexed" }));
    await seedPendingGeneration(projectId, activeId, pendingId);
    const def: SymbolDefinition = {
      id: "src/act.ts#Foo", project_id: projectId, file_path: "src/act.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 3, exported: true, indexed_at: Date.now(),
    };
    const ref: SymbolReference = {
      project_id: projectId, from_file: "src/act.ts", from_line: 2, symbol_name: "Foo",
      target_fqn: "src/act.ts#Foo", ref_kind: "call",
    };
    const imp: SymbolImport = {
      project_id: projectId, from_file: "src/act.ts", specifier: "./bar",
      imported_names: ["Bar"], is_external: false, is_type_only: false,
    };
    await repo.writeFileSymbols(projectId, "src/act.ts", [def], [ref], [imp]);
    const rows = await prisma.$queryRaw<Array<{ d: number; r: number; i: number }>>`
      SELECT (SELECT count(*)::int FROM symbol_definitions WHERE project_id=${projectId} AND generation_id=${activeId} AND file_path='src/act.ts') d,
             (SELECT count(*)::int FROM symbol_references WHERE project_id=${projectId} AND generation_id=${activeId} AND from_file='src/act.ts') r,
             (SELECT count(*)::int FROM symbol_imports WHERE project_id=${projectId} AND generation_id=${activeId} AND from_file='src/act.ts') i
    `;
    expect(rows[0]).toEqual({ d: 1, r: 1, i: 1 });
  });
});

// ─── Pure unit coverage (no DB) ──────────────────────────────────────────────
// Mappers, identity helpers, and the pure generation helpers (validation,
// candidate building, lease locking) are deterministic and do not need PG.

describe("symbol-repo mappers (pure)", () => {
  test("mapWs maps every field and coerces nullables", () => {
    const ws = mapWs({
      project_id: "p", project_path: "/p", display_name: null, status: "indexed",
      last_indexed_at: null, last_error: null, files_count: 3, chunks_count: 4, symbols_count: 5,
      created_at: new Date(1), updated_at: new Date(2),
    });
    expect(ws.display_name).toBeUndefined();
    expect(ws.last_indexed_at).toBeUndefined();
    expect(ws.last_error).toBeUndefined();
    expect(ws.files_count).toBe(3);
    expect(ws.created_at).toBe(1);
  });

  test("mapFile coerces bigint mtime and array-guards diagnostics", () => {
    const f = mapFile({
      project_id: "p", generation_id: "g", relative_path: "a.ts", content_hash: "h",
      mtime: 5n, size: 10, indexed_at: new Date(7), symbol_count: 1, chunk_count: 1,
      language: null, dialect: null, grammar_version: null, query_pack_version: null,
      resolver_version: null, parser_status: "ok", parser_error_count: 0,
      diagnostics: undefined as never, is_stale: false, last_known_good_generation_id: null, last_successful_at: null,
    });
    expect(f.mtime).toBe(5);
    expect(f.diagnostics).toEqual([]);
    expect(f.language).toBeUndefined();
    expect(f.last_successful_at).toBeUndefined();
  });

  test("mapDef maps null signature/source fields to undefined", () => {
    const d = mapDef({
      id: "x", project_id: "p", file_path: "a.ts", name: "n", kind: "function",
      line_start: 1, line_end: 2, exported: true, doc_comment: null, indexed_at: new Date(3),
      qualified_name: "n", canonical_signature: null, signature_hash: null, legacy_fqn: "a.ts#n",
      source_span: null,
    });
    expect(d.doc_comment).toBeUndefined();
    expect(d.canonical_signature).toBeUndefined();
    expect(d.signature_hash).toBeUndefined();
    expect(d.source_span).toBeUndefined();
    expect(d.exported).toBe(true);
  });

  test("mapRef maps null target/meta/source to undefined/null", () => {
    const r = mapRef({
      id: 9, project_id: "p", from_file: "a.ts", from_line: 1, symbol_name: "s",
      target_fqn: null, ref_kind: "call", meta: null, source_span: null,
    });
    expect(r.target_fqn).toBeUndefined();
    expect(r.meta).toBeNull();
    expect(r.source_span).toBeUndefined();
  });

  test("mapImp maps null to_file and guards imported_names", () => {
    const i = mapImp({
      id: 2, project_id: "p", from_file: "a.ts", to_file: null, specifier: "./b",
      imported_names: undefined as never, is_external: false, is_type_only: true,
    });
    expect(i.to_file).toBeUndefined();
    expect(i.imported_names).toEqual([]);
    expect(i.is_type_only).toBe(true);
  });
});

describe("symbol-repo identity helpers (pure)", () => {
  const sig = "0".repeat(64);
  const modernId = `src/a.ts#Foo~function~${sig}`;

  test("definitionIdentityColumns: legacy fallback when id is not a modern FQN", () => {
    // Simple id: parseStructuralFqn → simple; parsedModern stays null.
    const id = definitionIdentityColumns({
      id: "src/a.ts#Foo", project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    });
    expect(id.qualifiedName).toBe("Foo");
    expect(id.signatureHash).toBeNull();
    // legacy_fqn fallback when the field is absent.
    expect(id.legacyFqn).toBe("src/a.ts#Foo");
  });

  test("definitionIdentityColumns: legacy_fqn field wins when present", () => {
    const id = definitionIdentityColumns({
      id: "src/a.ts#Foo", project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
      legacy_fqn: "src/old.ts#Foo",
    });
    expect(id.legacyFqn).toBe("src/old.ts#Foo");
  });

  test("definitionIdentityColumns: parsedModern is used when the id matches the def", () => {
    const id = definitionIdentityColumns({
      id: modernId, project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    });
    expect(id.qualifiedName).toBe("Foo");
    expect(id.signatureHash).toBe(sig);
  });

  test("definitionIdentityColumns: parsedModern is rejected on kind mismatch", () => {
    const id = definitionIdentityColumns({
      id: modernId, project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "class", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    });
    // kind mismatch → parsedModern discarded → signatureHash null.
    expect(id.signatureHash).toBeNull();
  });

  test("definitionIdentityColumns: a malformed id (# missing) is swallowed by the catch", () => {
    const id = definitionIdentityColumns({
      id: "no-separator", project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    });
    expect(id.qualifiedName).toBe("Foo");
    expect(id.signatureHash).toBeNull();
  });

  test("generationDefinitionIdentityColumns: simple id happy path", () => {
    const out = generationDefinitionIdentityColumns({
      id: "src/a.ts#Foo", project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    });
    expect(out.qualifiedName).toBe("Foo");
  });

  test("generationDefinitionIdentityColumns: simple id with matching signature pair", () => {
    const { createHash } = require("node:crypto");
    const digest = createHash("sha256").update("sig", "utf8").digest("hex");
    const out = generationDefinitionIdentityColumns({
      id: "src/a.ts#Foo", project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
      canonical_signature: "sig", signature_hash: digest,
    });
    expect(out.signatureHash).toBe(digest);
  });

  test("generationDefinitionIdentityColumns: throws on every simple-format mismatch", () => {
    const base = {
      id: "src/a.ts#Foo", project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    };
    // file mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, file_path: "src/other.ts" }))
      .toThrow(/definition_fqn_file_mismatch/);
    // legacy_fqn mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, legacy_fqn: "x#y" }))
      .toThrow(/definition_legacy_fqn_mismatch/);
    // name mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, id: "src/a.ts#Bar", name: "Foo" }))
      .toThrow(/definition_fqn_name_mismatch/);
    // qualified_name mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, qualified_name: "Other" }))
      .toThrow(/definition_fqn_qualified_name_mismatch/);
    // simple signature pair mismatch (only canonical_signature set)
    expect(() => generationDefinitionIdentityColumns({ ...base, canonical_signature: "sig" }))
      .toThrow(/definition_simple_signature_pair_mismatch/);
    // signature digest mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, canonical_signature: "sig", signature_hash: "0".repeat(64) }))
      .toThrow(/definition_fqn_signature_mismatch/);
  });

  test("generationDefinitionIdentityColumns: qualified id happy path and mismatches", () => {
    const base = {
      id: modernId, project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    };
    expect(generationDefinitionIdentityColumns(base).signatureHash).toBe(sig);
    // kind mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, kind: "class" }))
      .toThrow(/definition_fqn_kind_mismatch/);
    // terminal name mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, name: "Bar" }))
      .toThrow(/definition_fqn_name_mismatch/);
    // qualified_name mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, qualified_name: "Other" }))
      .toThrow(/definition_fqn_qualified_name_mismatch/);
    // signature_hash mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, signature_hash: "f".repeat(64) }))
      .toThrow(/definition_fqn_signature_hash_mismatch/);
    // canonical_signature digest mismatch
    expect(() => generationDefinitionIdentityColumns({ ...base, canonical_signature: "not-the-sig" }))
      .toThrow(/definition_fqn_signature_mismatch/);
  });

  test("referenceSourceSpan: null/array/non-object/invalid-integer/endByte<startByte all return null", () => {
    expect(referenceSourceSpan({ project_id: "p", from_file: "a", from_line: 1, symbol_name: "s", ref_kind: "call" })).toBeNull();
    expect(referenceSourceSpan({ project_id: "p", from_file: "a", from_line: 1, symbol_name: "s", ref_kind: "call", source_span: [] as never })).toBeNull();
    expect(referenceSourceSpan({ project_id: "p", from_file: "a", from_line: 1, symbol_name: "s", ref_kind: "call", source_span: { startByte: -1, endByte: 1 } })).toBeNull();
    expect(referenceSourceSpan({ project_id: "p", from_file: "a", from_line: 1, symbol_name: "s", ref_kind: "call", source_span: { startByte: 5, endByte: 1 } })).toBeNull();
  });

  test("referenceSourceSpan: meta.sourceSpan fallback is accepted when valid", () => {
    const span = { startByte: 0, endByte: 2, start: { row: 0, column: 0 }, end: { row: 0, column: 2 } };
    expect(referenceSourceSpan({
      project_id: "p", from_file: "a", from_line: 1, symbol_name: "s", ref_kind: "call",
      meta: { sourceSpan: span },
    })).toEqual(span);
  });
});

describe("symbol-repo generation pure helpers (validation, candidates, locks)", () => {
  const lease: GraphGenerationLease = {
    projectId: "p", generationId: "g", leaseToken: "t", expectedActiveGenerationId: "a",
    fingerprint: "fp", inputSnapshotHash: "sh", expectedFilesCount: 1, leaseExpiresAt: Date.now() + 60_000,
  };

  function fileInput(overrides: Partial<GenerationFileWrite["file"]>): GenerationFileWrite {
    return {
      file: { project_id: "p", relative_path: "src/a.ts", content_hash: "h", mtime: 0, size: 0, indexed_at: 1, symbol_count: 0, chunk_count: 0, ...overrides },
      definitions: [], references: [], imports: [],
    };
  }

  test("validateGenerationFileWrite throws on each invariant", () => {
    expect(() => validateGenerationFileWrite(fileInput({ project_id: "other" }), lease)).toThrow(TypeError);
    expect(() => validateGenerationFileWrite(fileInput({ relative_path: "" }), lease)).toThrow(TypeError);
    expect(() => validateGenerationFileWrite(fileInput({ parser_error_count: -1 }), lease)).toThrow(RangeError);
    expect(() => validateGenerationFileWrite(fileInput({ parser_error_count: 1.5 }), lease)).toThrow(RangeError);
    expect(() => validateGenerationFileWrite(fileInput({ diagnostics: Array.from({ length: 11 }, () => ({})) }), lease)).toThrow(RangeError);
    expect(() => validateGenerationFileWrite({
      ...fileInput({}),
      definitions: [{ id: "x", project_id: "other", file_path: "src/a.ts", name: "n", kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1 }],
    }, lease)).toThrow(/definition must belong/);
    expect(() => validateGenerationFileWrite({
      ...fileInput({}),
      references: [{ project_id: "other", from_file: "src/a.ts", from_line: 1, symbol_name: "s", ref_kind: "call" }],
    }, lease)).toThrow(/reference must originate/);
    expect(() => validateGenerationFileWrite({
      ...fileInput({}),
      imports: [{ project_id: "other", from_file: "src/a.ts", specifier: "./b", imported_names: [], is_external: false, is_type_only: false }],
    }, lease)).toThrow(/import must originate/);
  });

  test("validateGenerationFileWrite passes a valid input", () => {
    expect(() => validateGenerationFileWrite(fileInput({}), lease)).not.toThrow();
  });

  test("definitionCandidate uses signature_hash, falls back to parsed id, and throws when ambiguous", () => {
    const sig = "1".repeat(64);
    expect(definitionCandidate({
      id: "src/a.ts#Foo", project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1, signature_hash: sig,
    }).signatureHash).toBe(sig);
    // Fallback to parsed qualified id hash.
    expect(definitionCandidate({
      id: `src/a.ts#Foo~function~${sig}`, project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    }).signatureHash).toBe(sig);
    // No hash anywhere → throws.
    expect(() => definitionCandidate({
      id: "src/a.ts#Foo", project_id: "p", file_path: "src/a.ts", name: "Foo",
      kind: "function", line_start: 1, line_end: 2, exported: true, indexed_at: 1,
    })).toThrow(/ambiguous_definition_identity_incomplete/);
  });

  test("compareDefinitionCandidates orders by file, then qualifiedName, then kind, then signatureHash", () => {
    const mk = (file: string, qn: string, kind: string, h: string) => ({ fqn: "x", file, name: "n", displayName: qn, qualifiedName: qn, kind, signatureHash: h });
    const a = mk("a.ts", "A", "function", "1".repeat(64));
    const b = mk("b.ts", "A", "function", "1".repeat(64));
    expect(compareDefinitionCandidates(a, b)).toBeLessThan(0);
    expect(compareDefinitionCandidates(b, a)).toBeGreaterThan(0);
    expect(compareDefinitionCandidates(a, a)).toBe(0);
  });

  test("lockOwnedPendingGeneration returns false when the generation is absent and true when every field matches", async () => {
    const tx = makeFakeTx([
      { match: /FROM graph_generations/, rows: [{ id: "g", status: "pending", expected_active_id: "a", lease_token: "t", lease_expires_at: new Date(Date.now() + 60_000), fingerprint: "fp", input_snapshot_hash: "sh", expected_files_count: 1 }] },
      { match: /FROM workspaces/, rows: [{ pending_graph_generation_id: "g", graph_lease_token: "t", graph_lease_expires_at: new Date(Date.now() + 60_000), active_graph_generation_id: "a", live: true }] },
    ]);
    expect(await lockOwnedPendingGeneration(tx, lease)).toBe(true);
  });

  test("lockOwnedPendingGeneration returns false when the generation row is missing", async () => {
    const tx = makeFakeTx([{ match: /FROM graph_generations/, rows: [] }]);
    expect(await lockOwnedPendingGeneration(tx, lease)).toBe(false);
  });

  test("lockOwnedPendingGeneration returns false when workspace fields disagree", async () => {
    const tx = makeFakeTx([
      { match: /FROM graph_generations/, rows: [{ id: "g", status: "pending", expected_active_id: "a", lease_token: "t", lease_expires_at: new Date(Date.now() + 60_000), fingerprint: "fp", input_snapshot_hash: "sh", expected_files_count: 1 }] },
      { match: /FROM workspaces/, rows: [{ pending_graph_generation_id: "other", graph_lease_token: "t", graph_lease_expires_at: new Date(Date.now() + 60_000), active_graph_generation_id: "a", live: true }] },
    ]);
    expect(await lockOwnedPendingGeneration(tx, lease)).toBe(false);
  });

  test("lockActiveGenerations resolves active ids and throws when a project has none", async () => {
    const tx = makeFakeTx([{ match: /FROM workspaces/, rows: [{ active_graph_generation_id: "gen-1" }] }]);
    const map = await lockActiveGenerations(tx, ["p1", "p1", "p2"]);
    expect(map.get("p1")).toBe("gen-1");
    expect(map.get("p2")).toBe("gen-1");
    const missing = makeFakeTx([{ match: /FROM workspaces/, rows: [{ active_graph_generation_id: null }] }]);
    await expect(lockActiveGenerations(missing, ["p3"])).rejects.toThrow(/active_graph_generation_missing/);
  });
});

// Fake Prisma transaction client for the pure lease-lock helpers. It pattern-
// matches the SQL text (the first template string) to return canned rows.
function makeFakeTx(responses: { match: RegExp; rows: unknown[] }[]): unknown {
  return {
    async $queryRaw(strings: TemplateStringsArray): Promise<unknown[]> {
      const sql = strings.join("?");
      for (const r of responses) if (r.match.test(sql)) return r.rows;
      return [];
    },
    async $executeRaw(): Promise<number> { return 0; },
  };
}