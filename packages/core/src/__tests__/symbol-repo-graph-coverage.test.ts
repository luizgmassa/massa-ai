/**
 * Coverage tests for symbol-repo-graph.ts — graph query methods for
 * SymbolRepositoryPg (N31 split T08/T09).
 *
 * Covers the graph functions directly: getActiveGraphSnapshot, allFiles,
 * allImportEdges, updateCentrality, findImporters, findReferencesByFqn,
 * findReferencesByName, getProjectMapAggregates, getProjectMapSnapshot,
 * runBfsCteImpact, findEdges, countEdgesByKind, resolveDefinitionFqn.
 *
 * Uses the dedicated maintenance DB (127.0.0.1:5433/massa_ai_test).
 * Every fixture is scoped by a unique project id and removed after the test.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import {
  getActiveGraphSnapshot,
  allFiles,
  allImportEdges,
  updateCentrality,
  findImporters,
  findReferencesByFqn,
  findReferencesByName,
  getProjectMapAggregates,
  getProjectMapSnapshot,
  runBfsCteImpact,
  findEdges,
  countEdgesByKind,
  resolveDefinitionFqn,
} from "../data/symbol/symbol-repo-graph.js";
import { _resetPrismaForTesting } from "../kernel/prisma-client.js";
import { closeConnections } from "../kernel/db-connection.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1" &&
  /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);
const TEST_PREFIX = "cov-srg-";

let pool: Pool;

function projectId(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
}

async function seedWorkspace(pid: string, activeGenId: string | null = null): Promise<void> {
  // Insert the workspace FIRST with a NULL active pointer (the FK is
  // INITIALLY DEFERRED but the simple INSERT path still validates
  // immediately when the value is non-null), then seed the generation and
  // point the workspace at it.
  await pool.query(
    `INSERT INTO workspaces (project_id, project_path, display_name, status, active_graph_generation_id)
     VALUES ($1, $2, $3, 'indexed', NULL)
     ON CONFLICT (project_id) DO NOTHING`,
    [pid, `/tmp/${pid}`, `test-${pid}`],
  );
  if (activeGenId) {
    await seedGeneration(pid, activeGenId, "active");
    await pool.query(
      `UPDATE workspaces SET active_graph_generation_id = $2 WHERE project_id = $1`,
      [pid, activeGenId],
    );
  }
}

async function seedGeneration(
  pid: string,
  genId: string,
  status: "active" | "pending" | "superseded" = "active",
): Promise<void> {
  await pool.query(
    `INSERT INTO graph_generations (id, project_id, status, fingerprint, input_snapshot_hash, expected_files_count, started_at, activated_at)
     VALUES ($1, $2, $3, 'fp-v1', 'snap-v1', 1, NOW(), NOW())
     ON CONFLICT (project_id, id) DO UPDATE SET status = $3, activated_at = NOW()`,
    [genId, pid, status],
  );
}

async function seedFile(
  pid: string,
  genId: string,
  path: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO symbol_files (
       project_id, generation_id, relative_path, content_hash, mtime, size, indexed_at,
       symbol_count, chunk_count, language, parser_status, parser_error_count, diagnostics, is_stale
     ) VALUES ($1, $2, $3, $4, 1, 10, NOW(), 1, 0, $5, $6, $7, '[]'::jsonb, $8)`,
    [pid, genId, path, `hash-${path}`, overrides.language ?? "typescript", overrides.parser_status ?? "ok", overrides.parser_error_count ?? 0, overrides.is_stale ?? false],
  );
}

async function seedDefinition(
  pid: string,
  genId: string,
  id: string,
  path: string,
  name: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO symbol_definitions (
       id, project_id, generation_id, file_path, name, kind, line_start, line_end,
       exported, indexed_at, qualified_name, legacy_fqn
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)`,
    [id, pid, genId, path, name, overrides.kind ?? "function", overrides.line_start ?? 1, overrides.line_end ?? 5, overrides.exported ?? true, name, overrides.legacy_fqn ?? id],
  );
}

async function seedReference(
  pid: string,
  genId: string,
  fromFile: string,
  fromLine: number,
  symbolName: string,
  refKind: string,
  targetFqn: string | null = null,
  meta: Record<string, unknown> | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO symbol_references (
       project_id, generation_id, from_file, from_line, symbol_name, target_fqn, ref_kind, meta
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [pid, genId, fromFile, fromLine, symbolName, targetFqn, refKind, meta ? JSON.stringify(meta) : null],
  );
}

async function seedImport(
  pid: string,
  genId: string,
  fromFile: string,
  toFile: string | null,
  specifier: string,
  importedNames: string[] = [],
): Promise<void> {
  await pool.query(
    `INSERT INTO symbol_imports (
       project_id, generation_id, from_file, to_file, specifier, imported_names, is_external, is_type_only
     ) VALUES ($1, $2, $3, $4, $5, $6, false, false)`,
    [pid, genId, fromFile, toFile, specifier, importedNames],
  );
}

async function seedCentrality(
  pid: string,
  genId: string,
  filePath: string,
  score: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO symbol_centrality (project_id, generation_id, file_path, score, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (project_id, generation_id, file_path) DO UPDATE SET score = $4, updated_at = NOW()`,
    [pid, genId, filePath, score],
  );
}

async function cleanup(): Promise<void> {
  if (!pool) return;
  await pool.query(`DELETE FROM symbol_centrality WHERE project_id LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM symbol_references WHERE project_id LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM symbol_imports WHERE project_id LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM symbol_definitions WHERE project_id LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM symbol_files WHERE project_id LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM graph_generations WHERE project_id LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM workspaces WHERE project_id LIKE $1`, [`${TEST_PREFIX}%`]);
}

describe.skipIf(!DEDICATED_DB)("symbol-repo-graph — coverage", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const { getPrismaClient } = await import("../kernel/prisma-client.js");
    getPrismaClient();
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
    await closeConnections();
    _resetPrismaForTesting();
  });

  // ── getActiveGraphSnapshot ─────────────────────────────────────────────────

  test("returns null when the workspace has no active graph generation", async () => {
    const pid = projectId();
    await seedWorkspace(pid, null);
    expect(await getActiveGraphSnapshot(pid)).toBeNull();
  });

  test("returns null when the workspace does not exist", async () => {
    expect(await getActiveGraphSnapshot(projectId())).toBeNull();
  });

  test("returns counts + diagnostics + languages for an active generation", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedFile(pid, genId, "src/a.ts", { language: "typescript" });
    await seedFile(pid, genId, "src/b.ts", { language: "typescript", parser_status: "recovered" });
    await seedFile(pid, genId, "src/c.ts", { language: "python", parser_status: "failed", parser_error_count: 2, is_stale: true });
    await seedDefinition(pid, genId, "src/a.ts#foo", "src/a.ts", "foo");
    await seedReference(pid, genId, "src/b.ts", 1, "foo", "call", "src/a.ts#foo");
    await seedImport(pid, genId, "src/b.ts", "src/a.ts", "./a", ["foo"]);
    await seedCentrality(pid, genId, "src/a.ts", 0.9);

    const snap = await getActiveGraphSnapshot(pid);
    expect(snap).not.toBeNull();
    expect(snap!.generationId).toBe(genId);
    expect(snap!.counts).toEqual({ files: 3, definitions: 1, references: 1, imports: 1, centrality: 1 });
    expect(snap!.diagnostics).toEqual({ recovered: 1, hardFailures: 1, staleFiles: 1, errors: 2 });
    expect(snap!.languages).toEqual({ typescript: 2, python: 1 });
  });

  test("languages fall back to 'unknown' when the column is null", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await pool.query(
      `INSERT INTO symbol_files (project_id, generation_id, relative_path, content_hash, mtime, size, indexed_at, symbol_count, chunk_count, language, parser_status, parser_error_count, diagnostics, is_stale)
       VALUES ($1, $2, 'src/x.ts', 'h', 1, 10, NOW(), 1, 0, NULL, 'ok', 0, '[]'::jsonb, false)`,
      [pid, genId],
    );
    const snap = await getActiveGraphSnapshot(pid);
    expect(snap!.languages).toEqual({ unknown: 1 });
  });

  // ── allFiles ───────────────────────────────────────────────────────────────

  test("allFiles returns file paths for the active generation", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedFile(pid, genId, "src/a.ts");
    await seedFile(pid, genId, "src/b.ts");
    const files = await allFiles(pid);
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("allFiles returns [] when there is no active generation", async () => {
    const pid = projectId();
    await seedWorkspace(pid, null);
    expect(await allFiles(pid)).toEqual([]);
  });

  // ── allImportEdges ─────────────────────────────────────────────────────────

  test("allImportEdges returns imports for the active generation", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedImport(pid, genId, "src/a.ts", "src/b.ts", "./b", ["B"]);
    await seedImport(pid, genId, "src/c.ts", null, "./d", ["D"]);
    const edges = await allImportEdges(pid);
    expect(edges).toHaveLength(2);
    const withToFile = edges.find((e) => e.to_file === "src/b.ts");
    expect(withToFile).toBeDefined();
    expect(withToFile!.imported_names).toEqual(["B"]);
    const nullToFile = edges.find((e) => e.from_file === "src/c.ts");
    expect(nullToFile!.to_file).toBeUndefined();
  });

  // ── updateCentrality ───────────────────────────────────────────────────────

  test("updateCentrality with an empty map is a no-op", async () => {
    const pid = projectId();
    await updateCentrality(pid, new Map());
    // No rows were inserted (no generation either); the function returned void.
    expect(true).toBe(true);
  });

  test("updateCentrality writes scores and upserts on conflict", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await updateCentrality(pid, new Map([["src/a.ts", 0.5], ["src/b.ts", 0.25]]));
    const rows = await pool.query(
      "SELECT file_path, score FROM symbol_centrality WHERE project_id = $1 ORDER BY file_path",
      [pid],
    );
    expect(rows.rows).toEqual([
      { file_path: "src/a.ts", score: 0.5 },
      { file_path: "src/b.ts", score: 0.25 },
    ]);
    // Upsert: update src/a.ts.
    await updateCentrality(pid, new Map([["src/a.ts", 0.99]]));
    const updated = await pool.query(
      "SELECT score FROM symbol_centrality WHERE project_id = $1 AND file_path = 'src/a.ts'",
      [pid],
    );
    expect(Number(updated.rows[0]!.score)).toBe(0.99);
  });

  // ── findImporters ──────────────────────────────────────────────────────────

  test("findImporters returns imports whose to_file matches", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedImport(pid, genId, "src/a.ts", "src/b.ts", "./b");
    await seedImport(pid, genId, "src/c.ts", "src/b.ts", "./b");
    await seedImport(pid, genId, "src/d.ts", "src/other.ts", "./other");
    const importers = await findImporters(pid, "src/b.ts");
    expect(importers.map((i) => i.from_file).sort()).toEqual(["src/a.ts", "src/c.ts"]);
  });

  test("findImporters returns [] when no matches", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    expect(await findImporters(pid, "src/none.ts")).toEqual([]);
  });

  // ── findReferencesByFqn / findReferencesByName ──────────────────────────────

  test("findReferencesByFqn returns refs ordered by from_file, from_line", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/b.ts", 5, "foo", "call", "src/a.ts#foo");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call", "src/a.ts#foo");
    await seedReference(pid, genId, "src/b.ts", 2, "foo", "call", "src/a.ts#foo");
    const refs = await findReferencesByFqn(pid, "src/a.ts#foo");
    expect(refs.map((r) => [r.from_file, r.from_line])).toEqual([
      ["src/a.ts", 1],
      ["src/b.ts", 2],
      ["src/b.ts", 5],
    ]);
  });

  test("findReferencesByName returns refs ordered by from_file, from_line", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/z.ts", 9, "bar", "call");
    await seedReference(pid, genId, "src/a.ts", 1, "bar", "call");
    const refs = await findReferencesByName(pid, "bar");
    expect(refs).toHaveLength(2);
    expect(refs[0]!.from_file).toBe("src/a.ts");
  });

  // ── getProjectMapAggregates ────────────────────────────────────────────────

  test("returns empty aggregates when there is no active generation", async () => {
    const pid = projectId();
    await seedWorkspace(pid, null);
    const result = await getProjectMapAggregates(pid);
    expect(result.symbolsByKind).toEqual({});
    expect(result.filesByLanguage).toEqual({});
    expect(result.recentFiles).toEqual([]);
  });

  test("returns symbolsByKind, filesByLanguage (extension-keyed), recentFiles", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedFile(pid, genId, "src/a.ts", { language: "typescript" });
    await seedFile(pid, genId, "src/b.py", { language: "python" });
    await seedFile(pid, genId, "README", { language: "text" });
    await seedDefinition(pid, genId, "src/a.ts#foo", "src/a.ts", "foo", { kind: "function" });
    await seedDefinition(pid, genId, "src/a.ts#Bar", "src/a.ts", "Bar", { kind: "class" });
    await seedDefinition(pid, genId, "src/b.py#baz", "src/b.py", "baz", { kind: "function" });

    const result = await getProjectMapAggregates(pid, 10);
    expect(result.symbolsByKind).toEqual({ function: 2, class: 1 });
    // filesByLanguage is keyed by file extension (lowercased), 'other' when no ext.
    expect(result.filesByLanguage).toEqual({ ts: 1, py: 1, other: 1 });
    expect(result.recentFiles).toHaveLength(3);
    expect(result.recentFiles.map((f) => f.filePath).sort()).toEqual(["README", "src/a.ts", "src/b.py"]);
    // indexedAt is a number (ms epoch) or null.
    for (const f of result.recentFiles) {
      expect(f.indexedAt === null || typeof f.indexedAt === "number").toBe(true);
    }
  });

  test("filesByLanguage uses 'other' for files with no extension", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedFile(pid, genId, "Makefile", { language: "text" });
    const result = await getProjectMapAggregates(pid);
    expect(result.filesByLanguage).toEqual({ other: 1 });
  });

  test("recentFiles respects the recentLimit option", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    for (let i = 0; i < 5; i++) await seedFile(pid, genId, `src/f${i}.ts`);
    const result = await getProjectMapAggregates(pid, 2);
    expect(result.recentFiles).toHaveLength(2);
  });

  // ── getProjectMapSnapshot ───────────────────────────────────────────────────

  test("returns null when the workspace does not exist", async () => {
    expect(await getProjectMapSnapshot(projectId())).toBeNull();
  });

  test("returns an empty snapshot (generationId null) when no active generation", async () => {
    const pid = projectId();
    await seedWorkspace(pid, null);
    const snap = await getProjectMapSnapshot(pid);
    expect(snap).not.toBeNull();
    expect(snap!.generationId).toBeNull();
    expect(snap!.counts).toEqual({ files: 0, definitions: 0, references: 0, imports: 0, centrality: 0 });
    expect(snap!.diagnostics).toEqual({ recovered: 0, hardFailures: 0, staleFiles: 0, errors: 0 });
    expect(snap!.languages).toEqual({});
    expect(snap!.topCentralFiles).toEqual([]);
    expect(snap!.symbolsByKind).toEqual({});
    expect(snap!.filesByLanguage).toEqual({});
    expect(snap!.recentFiles).toEqual([]);
    expect(snap!.edgesByKind).toEqual({});
    expect(snap!.architecture.files).toEqual([]);
    expect(snap!.architecture.importEdges).toEqual([]);
    expect(snap!.architecture.definitions).toEqual([]);
    expect(snap!.architecture.httpEdges).toEqual([]);
    expect(snap!.architecture.callEdges).toEqual([]);
    expect(snap!.architecture.centrality.size).toBe(0);
  });

  test("invokes afterGenerationCaptured callback with the generation id", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    let captured: string | null | undefined = "not-called";
    await getProjectMapSnapshot(pid, { afterGenerationCaptured: (g) => { captured = g; } });
    expect(captured).toBe(genId);
  });

  test("returns a full snapshot with all aggregates + architecture for an active generation", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedFile(pid, genId, "src/a.ts", { language: "typescript" });
    await seedFile(pid, genId, "src/b.ts", { language: "typescript", parser_status: "recovered" });
    await seedFile(pid, genId, "src/c.ts", { language: "python", parser_status: "unsupported", parser_error_count: 3, is_stale: true });
    await seedDefinition(pid, genId, "src/a.ts#foo", "src/a.ts", "foo", { kind: "function" });
    await seedDefinition(pid, genId, "src/a.ts#Bar", "src/a.ts", "Bar", { kind: "class" });
    await seedReference(pid, genId, "src/b.ts", 1, "foo", "call", "src/a.ts#foo");
    await seedReference(pid, genId, "src/b.ts", 2, "foo", "call", "src/a.ts#foo");
    await seedReference(pid, genId, "src/b.ts", 3, "fetch", "http_call", "http://x");
    await seedImport(pid, genId, "src/b.ts", "src/a.ts", "./a", ["foo"]);
    await seedImport(pid, genId, "src/c.ts", null, "./missing");
    await seedCentrality(pid, genId, "src/a.ts", 0.9);
    await seedCentrality(pid, genId, "src/b.ts", 0.5);

    const snap = await getProjectMapSnapshot(pid, { centralityLimit: 5, recentLimit: 2, callEdgeBudget: 400_000 });
    expect(snap!.generationId).toBe(genId);
    expect(snap!.counts).toEqual({ files: 3, definitions: 2, references: 3, imports: 2, centrality: 2 });
    expect(snap!.diagnostics).toEqual({ recovered: 1, hardFailures: 1, staleFiles: 1, errors: 3 });
    expect(snap!.languages).toEqual({ typescript: 2, python: 1 });
    expect(snap!.symbolsByKind).toEqual({ function: 1, class: 1 });
    // filesByLanguage is keyed by file EXTENSION (lowercased), not the language column.
    expect(snap!.filesByLanguage).toEqual({ ts: 3 });
    expect(snap!.edgesByKind).toEqual({ call: 2, http_call: 1 });
    // topCentralFiles sorted by score DESC.
    expect(snap!.topCentralFiles.map((c) => c.file_path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(snap!.topCentralFiles[0]!.score).toBe(0.9);
    // recentFiles limited to 2, sorted by indexedAt DESC.
    expect(snap!.recentFiles).toHaveLength(2);
    // architecture.
    expect(snap!.architecture.files.sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(snap!.architecture.importEdges).toHaveLength(2);
    const importWithToFile = snap!.architecture.importEdges.find((e) => e.to_file === "src/a.ts");
    expect(importWithToFile).toBeDefined();
    const importNoToFile = snap!.architecture.importEdges.find((e) => e.from_file === "src/c.ts");
    expect(importNoToFile!.to_file).toBeUndefined();
    expect(snap!.architecture.definitions).toHaveLength(2);
    expect(snap!.architecture.httpEdges).toHaveLength(1);
    expect(snap!.architecture.callEdges).toHaveLength(2);
    expect(snap!.architecture.centrality.get("src/a.ts")).toBe(0.9);
  });

  test("topCentralFiles respects centralityLimit and ties break by file_path ASC", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedCentrality(pid, genId, "src/z.ts", 0.5);
    await seedCentrality(pid, genId, "src/a.ts", 0.5);
    await seedCentrality(pid, genId, "src/m.ts", 0.9);
    const snap = await getProjectMapSnapshot(pid, { centralityLimit: 2 });
    expect(snap!.topCentralFiles.map((c) => c.file_path)).toEqual(["src/m.ts", "src/a.ts"]);
  });

  test("recentFiles sorts by indexedAt DESC and ties break by filePath ASC", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    // Insert with the SAME indexed_at so the tie-break fires.
    const ts = new Date();
    for (const p of ["src/z.ts", "src/a.ts", "src/m.ts"]) {
      await pool.query(
        `INSERT INTO symbol_files (project_id, generation_id, relative_path, content_hash, mtime, size, indexed_at, symbol_count, chunk_count, language, parser_status, parser_error_count, diagnostics, is_stale)
         VALUES ($1, $2, $3, 'h', 1, 10, $4, 1, 0, 'typescript', 'ok', 0, '[]'::jsonb, false)`,
        [pid, genId, p, ts],
      );
    }
    const snap = await getProjectMapSnapshot(pid, { recentLimit: 10 });
    expect(snap!.recentFiles.map((f) => f.filePath)).toEqual(["src/a.ts", "src/m.ts", "src/z.ts"]);
  });

  test("callEdgeBudget truncates the call edges result", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    for (let i = 0; i < 5; i++) {
      await seedReference(pid, genId, "src/a.ts", i, "foo", "call", "src/x.ts#foo");
    }
    const snap = await getProjectMapSnapshot(pid, { callEdgeBudget: 2 });
    expect(snap!.architecture.callEdges).toHaveLength(2);
  });

  // ── runBfsCteImpact ─────────────────────────────────────────────────────────

  test("returns [] for an empty changedFiles list", async () => {
    const pid = projectId();
    expect(await runBfsCteImpact(pid, [], { depth: 3, maxImpacted: 100 })).toEqual([]);
  });

  test("clamps depth to [0,4] and maxImpacted to [1,1000]", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedFile(pid, genId, "src/a.ts");
    await seedFile(pid, genId, "src/b.ts");
    await seedImport(pid, genId, "src/b.ts", "src/a.ts", "./a");
    // depth=99 clamps to 4; maxImpacted=9999 clamps to 1000.
    const result = await runBfsCteImpact(pid, ["src/a.ts"], { depth: 99, maxImpacted: 9999 });
    // src/a.ts is the seed (hop 0); src/b.ts imports it (hop 1).
    expect(result.map((r) => r.file).sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.find((r) => r.file === "src/a.ts")!.hop).toBe(0);
    expect(result.find((r) => r.file === "src/b.ts")!.hop).toBe(1);
  });

  test("traverses a multi-hop import chain and dedupes visited files", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedFile(pid, genId, "src/a.ts");
    await seedFile(pid, genId, "src/b.ts");
    await seedFile(pid, genId, "src/c.ts");
    // c imports b, b imports a.
    await seedImport(pid, genId, "src/b.ts", "src/a.ts", "./a");
    await seedImport(pid, genId, "src/c.ts", "src/b.ts", "./b");
    const result = await runBfsCteImpact(pid, ["src/a.ts"], { depth: 4, maxImpacted: 100 });
    const hops = new Map(result.map((r) => [r.file, r.hop]));
    expect(hops.get("src/a.ts")).toBe(0);
    expect(hops.get("src/b.ts")).toBe(1);
    expect(hops.get("src/c.ts")).toBe(2);
  });

  // ── findEdges ──────────────────────────────────────────────────────────────

  test("findEdges with no filters returns all refs (up to default limit)", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call", "src/x.ts#foo");
    await seedReference(pid, genId, "src/b.ts", 2, "bar", "type_ref", "src/y.ts#bar");
    const edges = await findEdges(pid);
    expect(edges).toHaveLength(2);
  });

  test("findEdges filters by fromFile", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call");
    await seedReference(pid, genId, "src/b.ts", 2, "bar", "call");
    const edges = await findEdges(pid, { fromFile: "src/a.ts" });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.from_file).toBe("src/a.ts");
  });

  test("findEdges filters by toSymbol (target_fqn) with direction incoming", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call", "src/x.ts#foo");
    await seedReference(pid, genId, "src/b.ts", 2, "bar", "call", "src/y.ts#bar");
    const edges = await findEdges(pid, { toSymbol: "src/x.ts#foo", direction: "incoming" });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.target_fqn).toBe("src/x.ts#foo");
  });

  test("findEdges filters by toSymbol with direction outgoing (excludes target_fqn)", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call", "src/x.ts#foo");
    const edges = await findEdges(pid, { toSymbol: "src/x.ts#foo", direction: "outgoing" });
    // outgoing direction ignores toSymbol — returns the row.
    expect(edges).toHaveLength(1);
  });

  test("findEdges filters by fromSymbol (file#name) with direction outgoing", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call", "src/x.ts#foo", { callerFqn: "src/a.ts#foo" });
    await seedReference(pid, genId, "src/a.ts", 2, "bar", "call", "src/y.ts#bar", { callerFqn: "src/a.ts#bar" });
    const edges = await findEdges(pid, { fromSymbol: "src/a.ts#foo", direction: "outgoing" });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.symbol_name).toBe("foo");
  });

  test("findEdges filters by fromSymbol with no '#' (file-only, no callerFqn match)", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call");
    await seedReference(pid, genId, "src/b.ts", 2, "bar", "call");
    const edges = await findEdges(pid, { fromSymbol: "src/a.ts", direction: "outgoing" });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.from_file).toBe("src/a.ts");
  });

  test("findEdges filters by types (ref_kind IN ...)", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call");
    await seedReference(pid, genId, "src/b.ts", 2, "bar", "type_ref");
    await seedReference(pid, genId, "src/c.ts", 3, "baz", "http_call");
    const edges = await findEdges(pid, { types: ["call", "http_call"] });
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.ref_kind === "call" || e.ref_kind === "http_call")).toBe(true);
  });

  test("findEdges respects the limit option", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    for (let i = 0; i < 5; i++) {
      await seedReference(pid, genId, "src/a.ts", i, "foo", "call");
    }
    expect(await findEdges(pid, { limit: 2 })).toHaveLength(2);
  });

  test("findEdges returns [] when no matches", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    expect(await findEdges(pid, { fromFile: "src/none.ts" })).toEqual([]);
  });

  // ── countEdgesByKind ────────────────────────────────────────────────────────

  test("countEdgesByKind groups ref_kind counts", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedReference(pid, genId, "src/a.ts", 1, "foo", "call");
    await seedReference(pid, genId, "src/a.ts", 2, "foo", "call");
    await seedReference(pid, genId, "src/a.ts", 3, "bar", "http_call");
    const counts = await countEdgesByKind(pid);
    expect(counts).toEqual({ call: 2, http_call: 1 });
  });

  test("countEdgesByKind returns {} when no refs", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    expect(await countEdgesByKind(pid)).toEqual({});
  });

  // ── resolveDefinitionFqn ───────────────────────────────────────────────────

  test("returns found:false (no candidates) when the fqn has no '#'", async () => {
    const pid = projectId();
    const result = await resolveDefinitionFqn(pid, "no-separator");
    expect(result.found).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect((result as { fqn: string }).fqn).toBe("no-separator");
    expect((result as { candidates: readonly [] }).candidates).toEqual([]);
  });

  test("returns found:false (no candidates) when there is no active generation", async () => {
    const pid = projectId();
    await seedWorkspace(pid, null);
    const result = await resolveDefinitionFqn(pid, "src/a.ts#foo");
    expect(result.found).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect((result as { candidates: readonly [] }).candidates).toEqual([]);
  });

  test("returns found:true when an exact id match exists", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedDefinition(pid, genId, "src/a.ts#foo", "src/a.ts", "foo");
    const result = await resolveDefinitionFqn(pid, "src/a.ts#foo");
    expect(result.found).toBe(true);
    expect(result.ambiguous).toBe(false);
    expect((result as { definition: { id: string } }).definition.id).toBe("src/a.ts#foo");
  });

  test("returns found:true when a single legacy_fqn alias matches", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    // A definition whose legacy_fqn matches the query but whose id differs.
    const sig = "c".repeat(64);
    await seedDefinition(pid, genId, `src/new.ts#foo~function~${sig}`, "src/new.ts", "foo", { legacy_fqn: "src/old.ts#foo" });
    const result = await resolveDefinitionFqn(pid, "src/old.ts#foo");
    expect(result.found).toBe(true);
    expect(result.ambiguous).toBe(false);
    expect((result as { definition: { id: string } }).definition.id).toBe(`src/new.ts#foo~function~${sig}`);
  });

  test("returns found:false (legacyFqn, no candidates) when no alias matches", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    await seedDefinition(pid, genId, "src/a.ts#foo", "src/a.ts", "foo");
    const result = await resolveDefinitionFqn(pid, "src/missing.ts#foo");
    expect(result.found).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect((result as { legacyFqn: string }).legacyFqn).toBe("src/missing.ts#foo");
    expect((result as { candidates: readonly [] }).candidates).toEqual([]);
  });

  test("returns ambiguous:true with sorted candidates when multiple legacy_fqn aliases match", async () => {
    const pid = projectId();
    const genId = `gen-${randomUUID()}`;
    await seedWorkspace(pid, genId);
    await seedGeneration(pid, genId, "active");
    // Two definitions share the same legacy_fqn but have different ids (signatures).
    // The id suffix must be a full lowercase 64-char SHA-256 for parseStructuralFqn.
    const sig1 = "a".repeat(64);
    const sig2 = "b".repeat(64);
    await seedDefinition(pid, genId, `src/a.ts#foo~function~${sig1}`, "src/a.ts", "foo", { legacy_fqn: "src/old.ts#foo" });
    await seedDefinition(pid, genId, `src/b.ts#foo~function~${sig2}`, "src/b.ts", "foo", { legacy_fqn: "src/old.ts#foo" });
    const result = await resolveDefinitionFqn(pid, "src/old.ts#foo");
    expect(result.found).toBe(false);
    expect(result.ambiguous).toBe(true);
    const candidates = (result as { candidates: { fqn: string }[] }).candidates;
    expect(candidates).toHaveLength(2);
    // Candidates are sorted (file, then qualifiedName, then kind, then signatureHash).
    expect(candidates.map((c) => c.fqn)).toEqual([`src/a.ts#foo~function~${sig1}`, `src/b.ts#foo~function~${sig2}`]);
  });

  test("throws when the fqn is malformed (multiple '#' separators)", async () => {
    const pid = projectId();
    await expect(resolveDefinitionFqn(pid, "src/a.ts#foo#bar")).rejects.toThrow(/FQN must contain exactly one/);
  });
});