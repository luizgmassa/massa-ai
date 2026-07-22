/**
 * Symbol Repository - PostgreSQL Implementation
 *
 * All queries use raw SQL via $queryRaw / $executeRaw to avoid the
 * Prisma 7.7.0 + Bun ORM bug (isObjectEnumValue is not a function).
 */

import { logger } from "@massa-th0th/shared";
import { getPrismaClient } from "../../services/query/prisma-client.js";
import {
  parseStructuralFqn,
  type StructuralFqnCandidate,
} from "../../services/structural/fqn-codec.js";
import type { GraphGenerationLease } from "../graph-generation/graph-generation-contract.js";

// ─── Domain types (re-exported from symbol-repo-types.ts — N31 T06) ─────────
export type {
  SymbolKind,
  RefKind,
  WorkspaceStatus,
  SymbolFileRow,
  SymbolDefinition,
  SymbolReference,
  SymbolImport,
  CentralityEntry,
  WorkspaceRow,
  ProjectMapGraphSnapshot,
  ProjectMapSnapshotOptions,
  ActiveGenerationScope,
  GenerationFileWrite,
  DefinitionFqnResolution,
} from "./symbol-repo-types.js";
import type {
  SymbolKind,
  RefKind,
  WorkspaceStatus,
  SymbolFileRow,
  SymbolDefinition,
  SymbolReference,
  SymbolImport,
  CentralityEntry,
  WorkspaceRow,
  ProjectMapGraphSnapshot,
  ProjectMapSnapshotOptions,
  ActiveGenerationScope,
  GenerationFileWrite,
  DefinitionFqnResolution,
} from "./symbol-repo-types.js";

// ─── SQL identity helpers (from symbol-repo-identity.ts — N31 T07) ──────────
export type { TransactionClient } from "./symbol-repo-identity.js";
export {
  definitionIdentityColumns,
  generationDefinitionIdentityColumns,
  referenceSourceSpan,
} from "./symbol-repo-identity.js";
import type { TransactionClient } from "./symbol-repo-identity.js";
import {
  definitionIdentityColumns,
  generationDefinitionIdentityColumns,
  referenceSourceSpan,
} from "./symbol-repo-identity.js";

// ─── Raw row mappers (from symbol-repo-mappers.ts — N31 T07) ─────────────────
export type {
  WsRaw,
  FileRaw,
  DefRaw,
  RefRaw,
  ImpRaw,
} from "./symbol-repo-mappers.js";
export {
  mapWs,
  mapFile,
  mapDef,
  mapRef,
  mapImp,
} from "./symbol-repo-mappers.js";
import type { WsRaw, FileRaw, DefRaw, RefRaw, ImpRaw } from "./symbol-repo-mappers.js";
import { mapWs, mapFile, mapDef, mapRef, mapImp } from "./symbol-repo-mappers.js";

// ─── Generation lock + candidate helpers (from symbol-repo-generation.ts — N31 T08/T09)
import {
  lockOwnedPendingGeneration,
  lockActiveGenerations,
  validateGenerationFileWrite,
  definitionCandidate,
  compareDefinitionCandidates,
} from "./symbol-repo-generation.js";

// ─── CRUD module functions (from symbol-repo-queries.ts — N31 T08) ──────────
import * as queries from "./symbol-repo-queries.js";

// ─── Graph query module functions (from symbol-repo-graph.ts — N31 T08/T09)
import {
  getActiveGraphSnapshot,
  allFiles,
  allImportEdges,
  updateCentrality,
  findImporters,
  findReferencesByFqn,
  findReferencesByName,
} from "./symbol-repo-graph.js";

// ─── Repository ──────────────────────────────────────────────────────────────

export class SymbolRepositoryPg {
  private static instance: SymbolRepositoryPg | null = null;

  private constructor() {
    logger.info("SymbolRepositoryPg initialized (PostgreSQL)");
  }

  static getInstance(): SymbolRepositoryPg {
    if (!SymbolRepositoryPg.instance) {
      SymbolRepositoryPg.instance = new SymbolRepositoryPg();
    }
    return SymbolRepositoryPg.instance;
  }

  // ─── Workspace operations ─────────────────────────────────────────────────

  async upsertWorkspace(
    ws: Omit<WorkspaceRow, "created_at" | "updated_at"> & { created_at?: number },
  ): Promise<void> { return queries.upsertWorkspace(ws); }

  async updateWorkspaceStatus(
    projectId: string,
    status: WorkspaceStatus,
    opts?:
      | {
          lastError?: string | null;
          lastIndexedAt?: number;
          filesCount?: number;
          chunksCount?: number;
          symbolsCount?: number;
        }
      | string,
  ): Promise<void> { return queries.updateWorkspaceStatus(projectId, status, opts); }

  async getWorkspace(projectId: string): Promise<WorkspaceRow | null> {
    return queries.getWorkspace(projectId);
  }

  async listWorkspaces(): Promise<WorkspaceRow[]> {
    return queries.listWorkspaces();
  }

  async deleteWorkspace(projectId: string): Promise<void> {
    return queries.deleteWorkspace(projectId);
  }

  // ─── File operations ───────────────────────────────────────────────────────

  async upsertFile(file: SymbolFileRow): Promise<void> { return queries.upsertFile(file); }

  async getFile(
    projectId: string,
    relativePath: string,
  ): Promise<SymbolFileRow | null> { return queries.getFile(projectId, relativePath); }

  // ─── Definition operations ─────────────────────────────────────────────────

  async upsertDefinition(def: SymbolDefinition): Promise<void> { return queries.upsertDefinition(def); }

  async deleteDefinitionsByFile(
    projectId: string,
    filePath: string,
  ): Promise<number> { return queries.deleteDefinitionsByFile(projectId, filePath); }

  async searchDefinitions(
    projectId: string,
    query?: string,
    kinds?: SymbolKind[],
    exportedOnly?: boolean,
    limit: number = 20,
    filePath?: string,
  ): Promise<SymbolDefinition[]> {
    return queries.searchDefinitions(projectId, query, kinds, exportedOnly, limit, filePath);
  }

  /**
   * Pre-LIMIT total count for {@link searchDefinitions} (N4 correctness bundle).
   * Uses the exact same WHERE clauses so the count and the displayed list
   * share one code path (N4 invariant).
   */
  async countDefinitions(
    projectId: string,
    query?: string,
    kinds?: SymbolKind[],
    exportedOnly?: boolean,
    filePath?: string,
  ): Promise<number> {
    return queries.countDefinitions(projectId, query, kinds, exportedOnly, filePath);
  }

  async getDefinition(
    projectId: string,
    fqn: string,
  ): Promise<SymbolDefinition | null> {
    return queries.getDefinition(projectId, fqn);
  }

  // ─── Reference operations ──────────────────────────────────────────────────

  async insertReference(ref: SymbolReference): Promise<void> { return queries.insertReference(ref); }

  async deleteReferencesByFile(
    projectId: string,
    filePath: string,
  ): Promise<number> { return queries.deleteReferencesByFile(projectId, filePath); }

  async getReferences(
    projectId: string,
    symbolName: string,
    limit: number = 50,
  ): Promise<SymbolReference[]> {
    return queries.getReferences(projectId, symbolName, limit);
  }

  // ─── Import operations ─────────────────────────────────────────────────────

  async insertImport(imp: SymbolImport): Promise<void> { return queries.insertImport(imp); }

  async deleteImportsByFile(
    projectId: string,
    filePath: string,
  ): Promise<number> { return queries.deleteImportsByFile(projectId, filePath); }

  async getImportsFrom(
    projectId: string,
    filePath: string,
  ): Promise<SymbolImport[]> { return queries.getImportsFrom(projectId, filePath); }

  // ─── Centrality operations ─────────────────────────────────────────────────

  async upsertCentrality(entry: CentralityEntry): Promise<void> { return queries.upsertCentrality(entry); }

  async getTopCentralFiles(
    projectId: string,
    limit: number = 20,
  ): Promise<CentralityEntry[]> { return queries.getTopCentralFiles(projectId, limit); }

  /**
   * Aggregates used to build a project map in a single round trip:
   * symbols grouped by kind, files grouped by extension, and the most
   * recently indexed files (absolute timestamp for the caller to format).
   */
  async getProjectMapAggregates(
    projectId: string,
    recentLimit: number = 10,
  ): Promise<{
    symbolsByKind: Record<string, number>;
    filesByLanguage: Record<string, number>;
    recentFiles: Array<{ filePath: string; indexedAt: number | null }>;
  }> {
    const [kindRows, langRows, recentRows] = await getPrismaClient().$transaction(async (tx) => {
      const scopes = await tx.$queryRaw<Array<{ generation_id: string | null }>>`
        SELECT active_graph_generation_id AS generation_id FROM workspaces
        WHERE project_id = ${projectId} FOR SHARE
      `;
      const generationId = scopes[0]?.generation_id;
      if (!generationId) return [[], [], []] as [
        { kind: string; count: bigint }[],
        { ext: string | null; count: bigint }[],
        { relative_path: string; indexed_at: Date }[],
      ];
      const kindRows = await tx.$queryRaw<{ kind: string; count: bigint }[]>`
        SELECT kind, COUNT(*)::bigint AS count
        FROM symbol_definitions
        WHERE project_id = ${projectId}
          AND generation_id = ${generationId}
        GROUP BY kind
        ORDER BY count DESC
      `;
      // Postgres-native extension extraction; NULLIF avoids treating files
      // without a dot as extension "" (they fall under "other").
      const langRows = await tx.$queryRaw<{ ext: string | null; count: bigint }[]>`
        SELECT LOWER(NULLIF(SUBSTRING(relative_path FROM '\\.([^./\\\\]+)$'), '')) AS ext,
               COUNT(*)::bigint AS count
        FROM symbol_files
        WHERE project_id = ${projectId}
          AND generation_id = ${generationId}
        GROUP BY ext
        ORDER BY count DESC
      `;
      const recentRows = await tx.$queryRaw<{ relative_path: string; indexed_at: Date }[]>`
        SELECT relative_path, indexed_at
        FROM symbol_files
        WHERE project_id = ${projectId}
          AND generation_id = ${generationId}
        ORDER BY indexed_at DESC
        LIMIT ${recentLimit}
      `;
      return [kindRows, langRows, recentRows] as const;
    });

    const symbolsByKind: Record<string, number> = {};
    for (const row of kindRows) symbolsByKind[row.kind] = Number(row.count);

    const filesByLanguage: Record<string, number> = {};
    for (const row of langRows) {
      const key = row.ext ?? "other";
      filesByLanguage[key] = Number(row.count);
    }

    const recentFiles = recentRows.map((r) => ({
      filePath: r.relative_path,
      indexedAt: r.indexed_at ? r.indexed_at.getTime() : null,
    }));

    return { symbolsByKind, filesByLanguage, recentFiles };
  }

  /**
   * Capture every graph-backed project-map input from one active generation.
   * The workspace share lock prevents activation from changing the pointer
   * until all reads finish; every query is additionally scoped by the captured
   * generation id so pending rows can never leak into the response.
   */
  async getProjectMapSnapshot(
    projectId: string,
    opts: ProjectMapSnapshotOptions = {},
  ): Promise<ProjectMapGraphSnapshot | null> {
    const centralityLimit = opts.centralityLimit ?? 20;
    const recentLimit = opts.recentLimit ?? 10;
    // Wave 5 FR-02 / N2: CALL-edge budget. Matches the iterative Tarjan edge
    // budget (AD-W5-017) so the SCC detector never receives more edges than
    // it can process within the RSS guard. Over the budget, rows are
    // truncated and the `cycles` aspect surfaces `cycles_truncated=true`.
    const callEdgeBudget = opts.callEdgeBudget ?? 400_000;

    return getPrismaClient().$transaction(async (tx) => {
      const workspaceRows = await tx.$queryRaw<Array<WsRaw & { active_graph_generation_id: string | null }>>`
        SELECT * FROM workspaces WHERE project_id = ${projectId} FOR SHARE
      `;
      const workspaceRow = workspaceRows[0];
      if (!workspaceRow) return null;

      const generationId = workspaceRow.active_graph_generation_id;
      await opts.afterGenerationCaptured?.(generationId);

      const empty: ProjectMapGraphSnapshot = {
        workspace: mapWs(workspaceRow),
        generationId: null,
        counts: { files: 0, definitions: 0, references: 0, imports: 0, centrality: 0 },
        diagnostics: { recovered: 0, hardFailures: 0, staleFiles: 0, errors: 0 },
        languages: {},
        topCentralFiles: [],
        symbolsByKind: {},
        filesByLanguage: {},
        recentFiles: [],
        edgesByKind: {},
        architecture: {
          files: [], importEdges: [], definitions: [], httpEdges: [], callEdges: [], centrality: new Map(),
        },
      };
      if (!generationId) return empty;

      const fileRows = await tx.$queryRaw<Array<{
        relative_path: string;
        indexed_at: Date | null;
        language: string | null;
        parser_status: string;
        parser_error_count: number;
        is_stale: boolean;
      }>>`
        SELECT relative_path, indexed_at, language, parser_status,
               parser_error_count, is_stale
        FROM symbol_files
        WHERE project_id = ${projectId} AND generation_id = ${generationId}
      `;
      const kindRows = await tx.$queryRaw<Array<{ kind: string; count: bigint }>>`
        SELECT kind, COUNT(*)::bigint AS count
        FROM symbol_definitions
        WHERE project_id = ${projectId} AND generation_id = ${generationId}
        GROUP BY kind
      `;
      const definitionRows = await tx.$queryRaw<DefRaw[]>`
        SELECT * FROM symbol_definitions
        WHERE project_id = ${projectId} AND generation_id = ${generationId}
        ORDER BY file_path, line_start, id
        LIMIT 1000
      `;
      const importRows = await tx.$queryRaw<Array<{ from_file: string; to_file: string | null }>>`
        SELECT from_file, to_file FROM symbol_imports
        WHERE project_id = ${projectId} AND generation_id = ${generationId}
      `;
      const edgeRows = await tx.$queryRaw<Array<{ ref_kind: string; count: bigint }>>`
        SELECT ref_kind, COUNT(*)::bigint AS count
        FROM symbol_references
        WHERE project_id = ${projectId} AND generation_id = ${generationId}
        GROUP BY ref_kind
      `;
      const httpRows = await tx.$queryRaw<RefRaw[]>`
        SELECT * FROM symbol_references
        WHERE project_id = ${projectId} AND generation_id = ${generationId}
          AND ref_kind = 'http_call'
        ORDER BY from_file, from_line
        LIMIT 200
      `;
      // Wave 5 FR-02 / N2: CALL-kind edges drive the `cycles` aspect (Tarjan
      // SCC). Bounded by `callEdgeBudget` (default 400_000); over the budget,
      // the rows are truncated and `cycles_truncated=true` is surfaced. The
      // budget matches the iterative Tarjan edge ceiling (AD-W5-017) so the
      // SCC detector never overflows the JS stack under the RSS guard.
      const callRows = await tx.$queryRaw<RefRaw[]>`
        SELECT * FROM symbol_references
        WHERE project_id = ${projectId} AND generation_id = ${generationId}
          AND ref_kind = 'call'
        ORDER BY from_file, from_line
        LIMIT ${callEdgeBudget}
      `;
      const centralityRows = await tx.$queryRaw<Array<{
        file_path: string;
        score: number;
        updated_at: Date;
      }>>`
        SELECT file_path, score, updated_at FROM symbol_centrality
        WHERE project_id = ${projectId} AND generation_id = ${generationId}
      `;

      const symbolsByKind: Record<string, number> = {};
      let definitionCount = 0;
      for (const row of kindRows) {
        const count = Number(row.count);
        symbolsByKind[row.kind] = count;
        definitionCount += count;
      }

      const edgesByKind: Record<string, number> = {};
      let referenceCount = 0;
      for (const row of edgeRows) {
        const count = Number(row.count);
        edgesByKind[row.ref_kind] = count;
        referenceCount += count;
      }

      const languages: Record<string, number> = {};
      const filesByLanguage: Record<string, number> = {};
      let recovered = 0;
      let hardFailures = 0;
      let staleFiles = 0;
      let errors = 0;
      for (const row of fileRows) {
        const language = row.language ?? "unknown";
        languages[language] = (languages[language] ?? 0) + 1;
        const extension = row.relative_path.match(/\.([^./\\]+)$/)?.[1]?.toLowerCase() ?? "other";
        filesByLanguage[extension] = (filesByLanguage[extension] ?? 0) + 1;
        if (row.parser_status === "recovered") recovered++;
        if (row.parser_status === "failed" || row.parser_status === "unsupported") hardFailures++;
        if (row.is_stale) staleFiles++;
        errors += Number(row.parser_error_count);
      }

      const centrality = new Map<string, number>();
      const centralEntries = centralityRows.map((row) => {
        const score = Number(row.score);
        centrality.set(row.file_path, score);
        return {
          project_id: projectId,
          file_path: row.file_path,
          score,
          updated_at: row.updated_at.getTime(),
        } satisfies CentralityEntry;
      });
      centralEntries.sort((left, right) => right.score - left.score || left.file_path.localeCompare(right.file_path));

      const recentFiles = fileRows
        .map((row) => ({ filePath: row.relative_path, indexedAt: row.indexed_at?.getTime() ?? null }))
        .sort((left, right) => (right.indexedAt ?? 0) - (left.indexedAt ?? 0) || left.filePath.localeCompare(right.filePath))
        .slice(0, recentLimit);

      return {
        workspace: mapWs(workspaceRow),
        generationId,
        counts: {
          files: fileRows.length,
          definitions: definitionCount,
          references: referenceCount,
          imports: importRows.length,
          centrality: centralityRows.length,
        },
        diagnostics: { recovered, hardFailures, staleFiles, errors },
        languages,
        topCentralFiles: centralEntries.slice(0, centralityLimit),
        symbolsByKind,
        filesByLanguage,
        recentFiles,
        edgesByKind,
        architecture: {
          files: fileRows.map((row) => row.relative_path),
          importEdges: importRows.map((row) => ({
            from_file: row.from_file,
            ...(row.to_file ? { to_file: row.to_file } : {}),
          })),
          definitions: definitionRows.map(mapDef),
          httpEdges: httpRows.map(mapRef),
          callEdges: callRows.map(mapRef),
          centrality,
        },
      };
    });
  }

  async getCentrality(projectId: string): Promise<Map<string, number>> {
    return queries.getCentrality(projectId);
  }

  // ─── Batch operations ──────────────────────────────────────────────────────

  async batchUpsertDefinitions(defs: SymbolDefinition[]): Promise<void> {
    return queries.batchUpsertDefinitions(defs);
  }

  async batchInsertReferences(refs: SymbolReference[]): Promise<void> {
    return queries.batchInsertReferences(refs);
  }

  async batchInsertImports(imports: SymbolImport[]): Promise<void> {
    return queries.batchInsertImports(imports);
  }

  // ── Generation-scoped writes ─────────────────────────────────────────────

  async copyFileGeneration(
    lease: GraphGenerationLease,
    sourceGenerationId: string,
    filePath: string,
  ): Promise<{ status: "copied" | "missing" | "lease_lost" }> {
    return getPrismaClient().$transaction(async (tx) => {
      if (!await lockOwnedPendingGeneration(tx, lease)) return { status: "lease_lost" as const };
      if (lease.expectedActiveGenerationId !== sourceGenerationId) return { status: "lease_lost" as const };
      const inserted = await tx.$executeRaw`
        INSERT INTO symbol_files (
          project_id, generation_id, relative_path, content_hash, mtime, size, indexed_at,
          symbol_count, chunk_count, language, dialect, grammar_version, query_pack_version,
          resolver_version, parser_status, parser_error_count, diagnostics, is_stale,
          last_known_good_generation_id, last_successful_at
        ) SELECT project_id, ${lease.generationId}, relative_path, content_hash, mtime, size, indexed_at,
          symbol_count, chunk_count, language, dialect, grammar_version, query_pack_version,
          resolver_version, parser_status, parser_error_count, diagnostics, is_stale,
          last_known_good_generation_id, last_successful_at
        FROM symbol_files WHERE project_id = ${lease.projectId}
          AND generation_id = ${sourceGenerationId} AND relative_path = ${filePath}
      `;
      if (inserted !== 1) return { status: "missing" as const };
      await tx.$executeRaw`INSERT INTO symbol_definitions (id,project_id,generation_id,file_path,name,kind,line_start,line_end,exported,doc_comment,indexed_at,qualified_name,canonical_signature,signature_hash,legacy_fqn,source_span) SELECT id,project_id,${lease.generationId},file_path,name,kind,line_start,line_end,exported,doc_comment,indexed_at,qualified_name,canonical_signature,signature_hash,legacy_fqn,source_span FROM symbol_definitions WHERE project_id=${lease.projectId} AND generation_id=${sourceGenerationId} AND file_path=${filePath}`;
      await tx.$executeRaw`INSERT INTO symbol_references (project_id,generation_id,from_file,from_line,symbol_name,target_fqn,ref_kind,meta,source_span) SELECT project_id,${lease.generationId},from_file,from_line,symbol_name,target_fqn,ref_kind,meta,source_span FROM symbol_references WHERE project_id=${lease.projectId} AND generation_id=${sourceGenerationId} AND from_file=${filePath}`;
      await tx.$executeRaw`INSERT INTO symbol_imports (project_id,generation_id,from_file,to_file,specifier,imported_names,is_external,is_type_only) SELECT project_id,${lease.generationId},from_file,to_file,specifier,imported_names,is_external,is_type_only FROM symbol_imports WHERE project_id=${lease.projectId} AND generation_id=${sourceGenerationId} AND from_file=${filePath}`;
      await tx.$executeRaw`INSERT INTO symbol_centrality (project_id,generation_id,file_path,score,updated_at) SELECT project_id,${lease.generationId},file_path,score,updated_at FROM symbol_centrality WHERE project_id=${lease.projectId} AND generation_id=${sourceGenerationId} AND file_path=${filePath}`;
      return { status: "copied" as const };
    });
  }

  async writeFileGeneration(
    input: { lease: GraphGenerationLease } & GenerationFileWrite,
  ): Promise<{ status: "written" | "lease_lost" }> {
    validateGenerationFileWrite(input, input.lease);
    return getPrismaClient().$transaction(async (tx) => {
      if (!await lockOwnedPendingGeneration(tx, input.lease)) return { status: "lease_lost" as const };

      const { lease, file, definitions, references, imports } = input;
      const oldRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM symbol_definitions
        WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId}
          AND file_path = ${file.relative_path}
      `;
      const retainedIds = new Set(definitions.map((definition) => definition.id));
      const removedIds = oldRows.map((row) => row.id).filter((id) => !retainedIds.has(id));

      await tx.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND from_file = ${file.relative_path}`;
      if (removedIds.length > 0) {
        await tx.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND target_fqn = ANY(${removedIds}::text[])`;
      }
      await tx.$executeRaw`DELETE FROM symbol_imports WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND from_file = ${file.relative_path}`;
      await tx.$executeRaw`DELETE FROM symbol_centrality WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND file_path = ${file.relative_path}`;
      await tx.$executeRaw`DELETE FROM symbol_definitions WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND file_path = ${file.relative_path}`;

      const diagnostics = file.diagnostics ?? [];
      const diagnosticsJson = JSON.stringify(diagnostics);
      const parserStatus = file.parser_status ?? "ok";
      const successful = parserStatus === "ok" || parserStatus === "recovered";
      await tx.$executeRaw`
        INSERT INTO symbol_files (
          project_id, generation_id, relative_path, content_hash, mtime, size, indexed_at,
          symbol_count, chunk_count, language, dialect, grammar_version, query_pack_version,
          resolver_version, parser_status, parser_error_count, diagnostics, is_stale,
          last_known_good_generation_id, last_successful_at
        ) VALUES (
          ${lease.projectId}, ${lease.generationId}, ${file.relative_path}, ${file.content_hash},
          ${BigInt(Math.trunc(file.mtime))}, ${file.size}, ${new Date(file.indexed_at)},
          ${file.symbol_count}, ${file.chunk_count}, ${file.language ?? null}, ${file.dialect ?? null},
          ${file.grammar_version ?? null}, ${file.query_pack_version ?? null},
          ${file.resolver_version ?? null}, ${parserStatus}, ${file.parser_error_count ?? 0},
          ${diagnosticsJson}::jsonb, ${file.is_stale ?? false},
          ${file.last_known_good_generation_id ?? (successful ? lease.generationId : null)},
          ${file.last_successful_at ? new Date(file.last_successful_at) : (successful ? new Date(file.indexed_at) : null)}
        )
        ON CONFLICT (project_id, generation_id, relative_path) DO UPDATE SET
          content_hash = EXCLUDED.content_hash, mtime = EXCLUDED.mtime, size = EXCLUDED.size,
          indexed_at = EXCLUDED.indexed_at, symbol_count = EXCLUDED.symbol_count,
          chunk_count = EXCLUDED.chunk_count, language = EXCLUDED.language, dialect = EXCLUDED.dialect,
          grammar_version = EXCLUDED.grammar_version, query_pack_version = EXCLUDED.query_pack_version,
          resolver_version = EXCLUDED.resolver_version, parser_status = EXCLUDED.parser_status,
          parser_error_count = EXCLUDED.parser_error_count, diagnostics = EXCLUDED.diagnostics,
          is_stale = EXCLUDED.is_stale,
          last_known_good_generation_id = EXCLUDED.last_known_good_generation_id,
          last_successful_at = EXCLUDED.last_successful_at
      `;

      for (const definition of definitions) {
        const identity = generationDefinitionIdentityColumns(definition);
        await tx.$executeRaw`
          INSERT INTO symbol_definitions (id, project_id, generation_id, file_path, name, kind, line_start, line_end, exported, doc_comment, indexed_at, qualified_name, canonical_signature, signature_hash, legacy_fqn, source_span)
          VALUES (${definition.id}, ${lease.projectId}, ${lease.generationId}, ${file.relative_path}, ${definition.name}, ${definition.kind}, ${definition.line_start}, ${definition.line_end}, ${definition.exported}, ${definition.doc_comment ?? null}, ${new Date(definition.indexed_at)}, ${identity.qualifiedName}, ${identity.canonicalSignature}, ${identity.signatureHash}, ${identity.legacyFqn}, ${identity.sourceSpan}::jsonb)
        `;
      }
      for (const reference of references) {
        const sourceSpan = referenceSourceSpan(reference);
        await tx.$executeRaw`
          INSERT INTO symbol_references (project_id, generation_id, from_file, from_line, symbol_name, target_fqn, ref_kind, meta, source_span)
          VALUES (${lease.projectId}, ${lease.generationId}, ${file.relative_path}, ${reference.from_line}, ${reference.symbol_name}, ${reference.target_fqn ?? null}, ${reference.ref_kind}, ${reference.meta ?? null}::jsonb, ${sourceSpan}::jsonb)
        `;
      }
      for (const imported of imports) {
        await tx.$executeRaw`
          INSERT INTO symbol_imports (project_id, generation_id, from_file, to_file, specifier, imported_names, is_external, is_type_only)
          VALUES (${lease.projectId}, ${lease.generationId}, ${file.relative_path}, ${imported.to_file ?? null}, ${imported.specifier}, ${imported.imported_names}, ${imported.is_external}, ${imported.is_type_only})
        `;
      }
      return { status: "written" as const };
    });
  }

  async deleteFileGeneration(
    lease: GraphGenerationLease,
    filePath: string,
  ): Promise<{ status: "deleted" | "lease_lost" }> {
    if (!filePath) throw new TypeError("filePath must not be empty");
    return getPrismaClient().$transaction(async (tx) => {
      if (!await lockOwnedPendingGeneration(tx, lease)) return { status: "lease_lost" as const };
      const ids = (await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM symbol_definitions WHERE project_id = ${lease.projectId}
          AND generation_id = ${lease.generationId} AND file_path = ${filePath}
      `).map((row) => row.id);
      await tx.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND from_file = ${filePath}`;
      if (ids.length > 0) {
        await tx.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND target_fqn = ANY(${ids}::text[])`;
      }
      await tx.$executeRaw`DELETE FROM symbol_imports WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND (from_file = ${filePath} OR to_file = ${filePath})`;
      await tx.$executeRaw`DELETE FROM symbol_centrality WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND file_path = ${filePath}`;
      await tx.$executeRaw`DELETE FROM symbol_definitions WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND file_path = ${filePath}`;
      await tx.$executeRaw`DELETE FROM symbol_files WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND relative_path = ${filePath}`;
      return { status: "deleted" as const };
    });
  }

  async markFileStaleGeneration(
    lease: GraphGenerationLease,
    filePath: string,
    input: {
      lastKnownGoodGenerationId: string;
      diagnostics: readonly Record<string, unknown>[];
      parserErrorCount: number;
    },
  ): Promise<{ status: "stale" | "lease_lost" }> {
    if (!filePath || input.diagnostics.length > 10 || !Number.isInteger(input.parserErrorCount) || input.parserErrorCount < 0) {
      throw new TypeError("invalid stale file metadata");
    }
    return getPrismaClient().$transaction(async (tx) => {
      if (!await lockOwnedPendingGeneration(tx, lease)) return { status: "lease_lost" as const };
      const active = await tx.$queryRaw<Array<{ active_graph_generation_id: string | null }>>`
        SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${lease.projectId}
      `;
      if (active[0]?.active_graph_generation_id !== input.lastKnownGoodGenerationId) return { status: "lease_lost" as const };
      const diagnosticsJson = JSON.stringify(input.diagnostics);

      const oldIds = (await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM symbol_definitions WHERE project_id = ${lease.projectId}
          AND generation_id = ${lease.generationId} AND file_path = ${filePath}
      `).map((row) => row.id);
      const retainedIds = new Set((await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM symbol_definitions WHERE project_id = ${lease.projectId}
          AND generation_id = ${input.lastKnownGoodGenerationId} AND file_path = ${filePath}
      `).map((row) => row.id));
      const removedIds = oldIds.filter((id) => !retainedIds.has(id));

      await tx.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND from_file = ${filePath}`;
      if (removedIds.length > 0) {
        await tx.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND target_fqn = ANY(${removedIds}::text[])`;
      }
      await tx.$executeRaw`DELETE FROM symbol_imports WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND from_file = ${filePath}`;
      await tx.$executeRaw`DELETE FROM symbol_centrality WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND file_path = ${filePath}`;
      await tx.$executeRaw`DELETE FROM symbol_definitions WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND file_path = ${filePath}`;
      await tx.$executeRaw`DELETE FROM symbol_files WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId} AND relative_path = ${filePath}`;

      const inserted = await tx.$executeRaw`
        INSERT INTO symbol_files (
          project_id, generation_id, relative_path, content_hash, mtime, size, indexed_at,
          symbol_count, chunk_count, language, dialect, grammar_version, query_pack_version,
          resolver_version, parser_status, parser_error_count, diagnostics, is_stale,
          last_known_good_generation_id, last_successful_at
        )
        SELECT project_id, ${lease.generationId}, relative_path, content_hash, mtime, size, clock_timestamp(),
          symbol_count, chunk_count, language, dialect, grammar_version, query_pack_version,
          resolver_version, 'failed', ${input.parserErrorCount}, ${diagnosticsJson}::jsonb, true,
          ${input.lastKnownGoodGenerationId}, last_successful_at
        FROM symbol_files WHERE project_id = ${lease.projectId}
          AND generation_id = ${input.lastKnownGoodGenerationId} AND relative_path = ${filePath}
      `;
      if (inserted !== 1) throw new Error(`last_known_good_file_missing:${filePath}`);
      await tx.$executeRaw`
        INSERT INTO symbol_definitions (id, project_id, generation_id, file_path, name, kind, line_start, line_end, exported, doc_comment, indexed_at, qualified_name, canonical_signature, signature_hash, legacy_fqn, source_span)
        SELECT id, project_id, ${lease.generationId}, file_path, name, kind, line_start, line_end, exported, doc_comment, indexed_at, qualified_name, canonical_signature, signature_hash, legacy_fqn, source_span
        FROM symbol_definitions WHERE project_id = ${lease.projectId} AND generation_id = ${input.lastKnownGoodGenerationId} AND file_path = ${filePath}
      `;
      await tx.$executeRaw`
        INSERT INTO symbol_references (project_id, generation_id, from_file, from_line, symbol_name, target_fqn, ref_kind, meta, source_span)
        SELECT project_id, ${lease.generationId}, from_file, from_line, symbol_name, target_fqn, ref_kind, meta, source_span
        FROM symbol_references WHERE project_id = ${lease.projectId} AND generation_id = ${input.lastKnownGoodGenerationId} AND from_file = ${filePath}
      `;
      await tx.$executeRaw`
        INSERT INTO symbol_imports (project_id, generation_id, from_file, to_file, specifier, imported_names, is_external, is_type_only)
        SELECT project_id, ${lease.generationId}, from_file, to_file, specifier, imported_names, is_external, is_type_only
        FROM symbol_imports WHERE project_id = ${lease.projectId} AND generation_id = ${input.lastKnownGoodGenerationId} AND from_file = ${filePath}
      `;
      await tx.$executeRaw`
        INSERT INTO symbol_centrality (project_id, generation_id, file_path, score, updated_at)
        SELECT project_id, ${lease.generationId}, file_path, score, clock_timestamp()
        FROM symbol_centrality WHERE project_id = ${lease.projectId} AND generation_id = ${input.lastKnownGoodGenerationId} AND file_path = ${filePath}
      `;
      return { status: "stale" as const };
    });
  }

  async updateCentralityGeneration(
    lease: GraphGenerationLease,
    entries: readonly { filePath: string; score: number }[],
  ): Promise<{ status: "written" | "lease_lost" }> {
    if (entries.some((entry) => !entry.filePath || !Number.isFinite(entry.score))) {
      throw new TypeError("centrality entries require a path and finite score");
    }
    return getPrismaClient().$transaction(async (tx) => {
      if (!await lockOwnedPendingGeneration(tx, lease)) return { status: "lease_lost" as const };
      await tx.$executeRaw`DELETE FROM symbol_centrality WHERE project_id = ${lease.projectId} AND generation_id = ${lease.generationId}`;
      for (const entry of entries) {
        await tx.$executeRaw`
          INSERT INTO symbol_centrality (project_id, generation_id, file_path, score, updated_at)
          VALUES (${lease.projectId}, ${lease.generationId}, ${entry.filePath}, ${entry.score}, clock_timestamp())
        `;
      }
      return { status: "written" as const };
    });
  }

  // ── High-level composite operations ──────────────────────────────────────

  async writeFileSymbols(
    projectId: string,
    filePath: string,
    defs: SymbolDefinition[],
    refs: SymbolReference[],
    imports: SymbolImport[],
  ): Promise<void> {
    const now = new Date();

    await getPrismaClient().$transaction(async (tx) => {
      const generations = await tx.$queryRaw<Array<{ active_graph_generation_id: string }>>`
        SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${projectId} FOR UPDATE
      `;
      const generationId = generations[0]?.active_graph_generation_id;
      if (!generationId) throw new Error(`active_graph_generation_missing:${projectId}`);

      const oldIds = (await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM symbol_definitions WHERE project_id = ${projectId}
          AND generation_id = ${generationId} AND file_path = ${filePath}
      `).map((row) => row.id);
      const retainedIds = new Set(defs.map((definition) => definition.id));
      const removedIds = oldIds.filter((id) => !retainedIds.has(id));
      await tx.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${projectId} AND generation_id = ${generationId} AND from_file = ${filePath}`;
      if (removedIds.length > 0) {
        await tx.$executeRaw`DELETE FROM symbol_references WHERE project_id = ${projectId} AND generation_id = ${generationId} AND target_fqn = ANY(${removedIds}::text[])`;
      }
      await tx.$executeRaw`DELETE FROM symbol_imports WHERE project_id = ${projectId} AND generation_id = ${generationId} AND from_file = ${filePath}`;
      await tx.$executeRaw`DELETE FROM symbol_definitions WHERE project_id = ${projectId} AND generation_id = ${generationId} AND file_path = ${filePath}`;

      for (const def of defs) {
        const identity = definitionIdentityColumns(def);
        await tx.$executeRaw`
          INSERT INTO symbol_definitions (id, project_id, generation_id, file_path, name, kind, line_start, line_end, exported, doc_comment, indexed_at, qualified_name, canonical_signature, signature_hash, legacy_fqn, source_span)
          VALUES (${def.id}, ${projectId}, ${generationId}, ${filePath}, ${def.name}, ${def.kind}, ${def.line_start}, ${def.line_end}, ${def.exported}, ${def.doc_comment ?? null}, ${now}, ${identity.qualifiedName}, ${identity.canonicalSignature}, ${identity.signatureHash}, ${identity.legacyFqn}, ${identity.sourceSpan}::jsonb)
          ON CONFLICT (project_id, generation_id, id) DO UPDATE SET
            file_path   = EXCLUDED.file_path,
            name        = EXCLUDED.name,
            kind        = EXCLUDED.kind,
            line_start  = EXCLUDED.line_start,
            line_end    = EXCLUDED.line_end,
            exported    = EXCLUDED.exported,
            doc_comment = EXCLUDED.doc_comment,
            indexed_at  = EXCLUDED.indexed_at,
            qualified_name = EXCLUDED.qualified_name,
            canonical_signature = EXCLUDED.canonical_signature,
            signature_hash = EXCLUDED.signature_hash,
            legacy_fqn = EXCLUDED.legacy_fqn,
            source_span = EXCLUDED.source_span
        `;
      }

      for (const ref of refs) {
        const sourceSpan = referenceSourceSpan(ref);
        await tx.$executeRaw`
          INSERT INTO symbol_references (project_id, generation_id, from_file, from_line, symbol_name, target_fqn, ref_kind, meta, source_span)
          VALUES (${projectId}, ${generationId}, ${filePath}, ${ref.from_line}, ${ref.symbol_name}, ${ref.target_fqn ?? null}, ${ref.ref_kind}, ${ref.meta ?? null}::jsonb, ${sourceSpan}::jsonb)
        `;
      }

      for (const imp of imports) {
        await tx.$executeRaw`
          INSERT INTO symbol_imports (project_id, generation_id, from_file, to_file, specifier, imported_names, is_external, is_type_only)
          VALUES (${projectId}, ${generationId}, ${filePath}, ${imp.to_file ?? null}, ${imp.specifier}, ${imp.imported_names}, ${imp.is_external}, ${imp.is_type_only})
        `;
      }
    });
  }

  async clearProject(projectId: string): Promise<void> {
    return queries.clearProject(projectId);
  }

  // ── Query helpers ────────────────────────────────────────────────────────

  async getActiveGenerationScope(projectId: string): Promise<ActiveGenerationScope | null> {
    return queries.getActiveGenerationScope(projectId);
  }

  async resolveDefinitionFqn(
    projectId: string,
    fqn: string,
  ): Promise<DefinitionFqnResolution> {
    // Inputs without a file separator are valid misses, never substring name
    // searches. Inputs that claim to be FQNs must satisfy the shared codec.
    if (fqn.includes("#")) parseStructuralFqn(fqn);
    else return { found: false, ambiguous: false, fqn, candidates: [] };

    return getPrismaClient().$transaction(async (tx) => {
      const scopes = await tx.$queryRaw<Array<{ generation_id: string }>>`
        SELECT generation.id AS generation_id
        FROM workspaces workspace
        JOIN graph_generations generation
          ON generation.project_id = workspace.project_id
         AND generation.id = workspace.active_graph_generation_id
        WHERE workspace.project_id = ${projectId} AND generation.status = 'active'
        FOR SHARE OF generation
      `;
      const generationId = scopes[0]?.generation_id;
      if (!generationId) return { found: false, ambiguous: false, fqn, candidates: [] } as const;

      const exact = await tx.$queryRaw<DefRaw[]>`
        SELECT * FROM symbol_definitions WHERE project_id = ${projectId}
          AND generation_id = ${generationId} AND id = ${fqn} LIMIT 1
      `;
      if (exact[0]) return { found: true, ambiguous: false, definition: mapDef(exact[0]) } as const;

      const aliases = (await tx.$queryRaw<DefRaw[]>`
        SELECT * FROM symbol_definitions WHERE project_id = ${projectId}
          AND generation_id = ${generationId} AND legacy_fqn = ${fqn}
      `).map(mapDef);
      if (aliases.length === 1) {
        return { found: true, ambiguous: false, definition: aliases[0]! } as const;
      }
      if (aliases.length === 0) {
        return { found: false, ambiguous: false, legacyFqn: fqn, candidates: [] } as const;
      }
      return {
        found: false,
        ambiguous: true,
        legacyFqn: fqn,
        candidates: Object.freeze(aliases.map(definitionCandidate).sort(compareDefinitionCandidates)),
      } as const;
    });
  }

  async getActiveGraphSnapshot(projectId: string): Promise<{
    generationId: string;
    counts: { files: number; definitions: number; references: number; imports: number; centrality: number };
    diagnostics: { recovered: number; hardFailures: number; staleFiles: number; errors: number };
    languages: Record<string, number>;
  } | null> { return getActiveGraphSnapshot(projectId); }

  async findDefinitionsByName(
    projectId: string,
    name: string,
  ): Promise<SymbolDefinition[]> { return queries.findDefinitionsByName(projectId, name); }

  async findDefinitionByFqn(
    projectId: string,
    fqn: string,
  ): Promise<SymbolDefinition | null> { return queries.findDefinitionByFqn(projectId, fqn); }

  /** All file paths for a project (used by centrality / hasData checks). */
  async allFiles(projectId: string): Promise<string[]> { return allFiles(projectId); }

  /** All import edges for a project (used by PageRank). */
  async allImportEdges(projectId: string): Promise<SymbolImport[]> { return allImportEdges(projectId); }

  /**
   * Wave 5 FR-05 / N3 — Multi-source reverse-import BFS via a single recursive
   * CTE (additive, behind `MASSA_TH0TH_IMPACT_BFS_CTE=true`).
   *
   * Anchor = changed files at hop 0. Recursive step walks the REVERSE import
   * graph (`si.to_file = current → si.from_file` is an importer) up to `depth`
   * hops. `MIN(hop)` collapses cycles / multi-path arrivals so each file appears
   * once at its shortest distance. Result capped at `maxImpacted`.
   *
   * NULL guard (AD-W5-018 / FR-24): the anchor drops `NULL` seeds
   * (`WHERE file_id IS NOT NULL`) so a NULL in the changed-seed does not
   * silently re-walk the whole graph; the recursive step also skips
   * `si.from_file IS NULL`. Parity vs the TS path is scoped to "same FQN set;
   * depths may differ ≤1 hop on cyclic graphs" (AD-W5-018).
   *
   * Returns `{ file, hop }[]` (FQN resolution happens in the service). Pure
   * single-CTE: no per-FQN follow-up queries.
   */
  async runBfsCteImpact(
    projectId: string,
    changedFiles: string[],
    opts: { depth: number; maxImpacted: number },
  ): Promise<{ file: string; hop: number }[]> {
    const p = getPrismaClient();
    const depth = Math.max(0, Math.min(4, opts.depth));
    const maxImpacted = Math.max(1, Math.min(1000, opts.maxImpacted));
    if (changedFiles.length === 0) return [];

    // Prisma $queryRaw with an array param: pass as a JS array → PG text[].
    // The active generation is resolved inline so the CTE joins on the same
    // generation_id the rest of the snapshot uses.
    const rows = await p.$queryRaw<{ file: string; hop: number }[]>`
      WITH RECURSIVE bfs AS (
        SELECT file_id, 0 AS hop, ARRAY[file_id] AS visited
        FROM unnest(${changedFiles}::text[]) AS seed(file_id)
        WHERE file_id IS NOT NULL
        UNION ALL
        SELECT si.from_file, b.hop + 1, b.visited || si.from_file
        FROM bfs b
        JOIN symbol_imports si
          ON si.to_file = b.file_id
         AND si.project_id = ${projectId}
         AND si.generation_id = (
           SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${projectId}
         )
        WHERE b.hop < ${depth}
          AND si.from_file IS NOT NULL
          AND si.from_file <> b.file_id
          AND NOT si.from_file = ANY(b.visited)
      )
      SELECT file_id AS file, MIN(hop) AS hop
      FROM bfs
      WHERE file_id IS NOT NULL
      GROUP BY file_id
      ORDER BY hop ASC, file_id ASC
      LIMIT ${maxImpacted}
    `;
    return rows.map((r) => ({ file: r.file, hop: Number(r.hop) }));
  }

  /** Imports originating from a specific file (alias for getImportsFrom). */
  async findDependencies(
    projectId: string,
    fromFile: string,
  ): Promise<SymbolImport[]> { return queries.findDependencies(projectId, fromFile); }

  /** Reverse-import query: files that import `filePath` (PG parity with PostgreSQL). */
  async findImporters(
    projectId: string,
    filePath: string,
  ): Promise<SymbolImport[]> { return findImporters(projectId, filePath); }

  /** References matching by target FQN. */
  async findReferencesByFqn(
    projectId: string,
    fqn: string,
  ): Promise<SymbolReference[]> { return findReferencesByFqn(projectId, fqn); }

  /** References matching by symbol name. */
  async findReferencesByName(
    projectId: string,
    symbolName: string,
  ): Promise<SymbolReference[]> { return findReferencesByName(projectId, symbolName); }

  /**
   * Query typed structural edges with optional filtering (D1).
   * Mirrors the PostgreSQL SymbolRepository.findEdges contract.
   */
  async findEdges(
    projectId: string,
    opts: {
      types?: RefKind[];
      fromSymbol?: string;
      toSymbol?: string;
      fromFile?: string;
      direction?: "outgoing" | "incoming" | "both";
      limit?: number;
    } = {},
  ): Promise<SymbolReference[]> {
    const p = getPrismaClient();
    // Build a parameterized query — Prisma raw SQL doesn't expand arrays for IN,
    // so we interpolate placeholders with explicit casts to text.
    const conditions: string[] = [
      `project_id = $1::text`,
      `generation_id = (SELECT active_graph_generation_id FROM workspaces WHERE project_id = $1::text)`,
    ];
    const params: unknown[] = [projectId];
    let idx = 2;
    const direction = opts.direction ?? "both";

    if (opts.fromFile) {
      conditions.push(`from_file = $${idx}::text`);
      params.push(opts.fromFile);
      idx++;
    }
    if (opts.toSymbol && (direction === "incoming" || direction === "both")) {
      conditions.push(`target_fqn = $${idx}::text`);
      params.push(opts.toSymbol);
      idx++;
    }
    if (opts.fromSymbol && (direction === "outgoing" || direction === "both")) {
      const [file, name] = opts.fromSymbol.split("#");
      conditions.push(`from_file = $${idx}::text`);
      params.push(file);
      idx++;
      // When a '#Name' segment is present, push the caller-FQN predicate into
      // the query via the meta JSONB column (mirrors PostgreSQL json_extract).
      if (name) {
        conditions.push(`meta->>'callerFqn' = $${idx}::text`);
        params.push(opts.fromSymbol);
        idx++;
      }
    }
    // types IN clause
    if (opts.types && opts.types.length > 0) {
      const placeholders = opts.types.map(() => `$${idx++}::text`).join(",");
      conditions.push(`ref_kind IN (${placeholders})`);
      params.push(...opts.types);
    }

    const limit = opts.limit ?? 200;
    params.push(limit);
    const sql = `SELECT * FROM symbol_references WHERE ${conditions.join(" AND ")} ORDER BY from_file, from_line LIMIT $${idx}::int`;

    const rows = await p.$queryRawUnsafe<RefRaw[]>(sql, ...params);
    return rows.map(mapRef);
  }

  /** Count edges grouped by ref_kind — used by project_map for typed-edge stats. */
  async countEdgesByKind(projectId: string): Promise<Record<string, number>> {
    const p = getPrismaClient();
    const rows = await p.$queryRaw<{ ref_kind: string; count: bigint }[]>`
      SELECT ref_kind, COUNT(*) AS count FROM symbol_references
      WHERE project_id = ${projectId}
        AND generation_id = (SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${projectId})
      GROUP BY ref_kind
    `;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.ref_kind] = Number(r.count);
    return out;
  }

  /** List definitions with filter options (mirrors PostgreSQL SymbolRepository.listDefinitions). */
  async listDefinitions(
    projectId: string,
    opts: {
      search?: string;
      kind?: string[];
      file?: string;
      exportedOnly?: boolean;
      limit?: number;
    } = {},
  ): Promise<SymbolDefinition[]> { return queries.listDefinitions(projectId, opts); }

  /**
   * Return ALL symbol definitions for a project (no default LIMIT). Capped only
   * by a high safety ceiling (200k) to guard against pathological repos. Used
   * by the resolve-stage project-wide name→FQN map where the default LIMIT 100
   * of {@link listDefinitions} would silently truncate and drop cross-file
   * callees. Mirrors the PostgreSQL {@link SymbolRepository.listAllDefinitions}.
   */
  async listAllDefinitions(
    projectId: string,
    opts: { kind?: string[]; exportedOnly?: boolean } = {},
  ): Promise<SymbolDefinition[]> { return queries.listAllDefinitions(projectId, opts); }

  /** Batch-update centrality scores computed by PageRank. */
  async updateCentrality(
    projectId: string,
    scores: Map<string, number>,
  ): Promise<void> { return updateCentrality(projectId, scores); }
}
