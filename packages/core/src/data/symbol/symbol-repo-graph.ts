/**
 * symbol-repo-graph.ts — graph query methods for SymbolRepositoryPg (N31 split T08/T09)
 *
 * Graph query methods (getProjectMapSnapshot, getProjectMapAggregates,
 * findEdges, runBfsCteImpact, countEdgesByKind, resolveDefinitionFqn) move
 * here in T09. getActiveGraphSnapshot is a graph snapshot query, relocated
 * here from symbol-repo-queries.ts to keep queries ≤500 LOC.
 */

import { getPrismaClient } from "../../services/query/prisma-client.js";
import type { SymbolDefinition, SymbolImport, SymbolReference } from "./symbol-repo-types.js";
import type { ImpRaw, RefRaw } from "./symbol-repo-mappers.js";
import { mapImp, mapRef } from "./symbol-repo-mappers.js";
import { lockActiveGenerations } from "./symbol-repo-generation.js";

export async function getActiveGraphSnapshot(projectId: string): Promise<{
  generationId: string;
  counts: { files: number; definitions: number; references: number; imports: number; centrality: number };
  diagnostics: { recovered: number; hardFailures: number; staleFiles: number; errors: number };
  languages: Record<string, number>;
} | null> {
  const rows = await getPrismaClient().$queryRaw<Array<{
    generation_id: string;
    files: number; definitions: number; references: number; imports: number; centrality: number;
    recovered: number; hard_failures: number; stale_files: number; errors: number;
    languages: Record<string, number> | null;
  }>>`
    SELECT w.active_graph_generation_id AS generation_id,
      (SELECT count(*)::integer FROM symbol_files f WHERE f.project_id = w.project_id AND f.generation_id = w.active_graph_generation_id) AS files,
      (SELECT count(*)::integer FROM symbol_definitions d WHERE d.project_id = w.project_id AND d.generation_id = w.active_graph_generation_id) AS definitions,
      (SELECT count(*)::integer FROM symbol_references r WHERE r.project_id = w.project_id AND r.generation_id = w.active_graph_generation_id) AS references,
      (SELECT count(*)::integer FROM symbol_imports i WHERE i.project_id = w.project_id AND i.generation_id = w.active_graph_generation_id) AS imports,
      (SELECT count(*)::integer FROM symbol_centrality c WHERE c.project_id = w.project_id AND c.generation_id = w.active_graph_generation_id) AS centrality,
      (SELECT count(*)::integer FROM symbol_files f WHERE f.project_id = w.project_id AND f.generation_id = w.active_graph_generation_id AND f.parser_status = 'recovered') AS recovered,
      (SELECT count(*)::integer FROM symbol_files f WHERE f.project_id = w.project_id AND f.generation_id = w.active_graph_generation_id AND f.parser_status IN ('failed','unsupported')) AS hard_failures,
      (SELECT count(*)::integer FROM symbol_files f WHERE f.project_id = w.project_id AND f.generation_id = w.active_graph_generation_id AND f.is_stale) AS stale_files,
      (SELECT COALESCE(sum(f.parser_error_count), 0)::integer FROM symbol_files f WHERE f.project_id = w.project_id AND f.generation_id = w.active_graph_generation_id) AS errors,
      (SELECT COALESCE(jsonb_object_agg(x.language, x.count), '{}'::jsonb) FROM (
        SELECT COALESCE(f.language, 'unknown') AS language, count(*)::integer AS count
        FROM symbol_files f WHERE f.project_id = w.project_id AND f.generation_id = w.active_graph_generation_id
        GROUP BY COALESCE(f.language, 'unknown')
      ) x) AS languages
    FROM workspaces w WHERE w.project_id = ${projectId} AND w.active_graph_generation_id IS NOT NULL
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    generationId: row.generation_id,
    counts: {
      files: Number(row.files), definitions: Number(row.definitions),
      references: Number(row.references), imports: Number(row.imports),
      centrality: Number(row.centrality),
    },
    diagnostics: {
      recovered: Number(row.recovered), hardFailures: Number(row.hard_failures),
      staleFiles: Number(row.stale_files), errors: Number(row.errors),
    },
    languages: row.languages ?? {},
  };
}

/** All file paths for a project (used by centrality / hasData checks). */
export async function allFiles(projectId: string): Promise<string[]> {
  const p = getPrismaClient();
  const rows = await p.$queryRaw<{ relative_path: string }[]>`
    SELECT relative_path FROM symbol_files WHERE project_id = ${projectId}
      AND generation_id = (SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${projectId})
  `;
  return rows.map((r) => r.relative_path);
}

/** All import edges for a project (used by PageRank). */
export async function allImportEdges(projectId: string): Promise<SymbolImport[]> {
  const p = getPrismaClient();
  const rows = await p.$queryRaw<ImpRaw[]>`
    SELECT * FROM symbol_imports WHERE project_id = ${projectId}
      AND generation_id = (SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${projectId})
  `;
  return rows.map(mapImp);
}

/** Batch-update centrality scores computed by PageRank. */
export async function updateCentrality(
  projectId: string,
  scores: Map<string, number>,
): Promise<void> {
  if (scores.size === 0) return;
  const p = getPrismaClient();
  const now = new Date();
  await p.$transaction(async (tx) => {
    const generationId = (await lockActiveGenerations(tx, [projectId])).get(projectId)!;
    for (const [filePath, score] of scores) {
      await tx.$executeRaw`
        INSERT INTO symbol_centrality (project_id, generation_id, file_path, score, updated_at)
        VALUES (${projectId}, ${generationId}, ${filePath}, ${score}, ${now})
        ON CONFLICT (project_id, generation_id, file_path) DO UPDATE SET
          score      = EXCLUDED.score,
          updated_at = EXCLUDED.updated_at
      `;
    }
  });
}

/** Reverse-import query: files that import `filePath`. */
export async function findImporters(
  projectId: string,
  filePath: string,
): Promise<SymbolImport[]> {
  const p = getPrismaClient();
  const rows = await p.$queryRaw<ImpRaw[]>`
    SELECT * FROM symbol_imports WHERE project_id = ${projectId}
      AND generation_id = (SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${projectId})
      AND to_file = ${filePath}
  `;
  return rows.map(mapImp);
}

/** References matching by target FQN. */
export async function findReferencesByFqn(
  projectId: string,
  fqn: string,
): Promise<SymbolReference[]> {
  const p = getPrismaClient();
  const rows = await p.$queryRaw<RefRaw[]>`
    SELECT * FROM symbol_references
    WHERE project_id = ${projectId}
      AND generation_id = (SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${projectId})
      AND target_fqn = ${fqn}
    ORDER BY from_file ASC, from_line ASC
  `;
  return rows.map(mapRef);
}

/** References matching by symbol name. */
export async function findReferencesByName(
  projectId: string,
  symbolName: string,
): Promise<SymbolReference[]> {
  const p = getPrismaClient();
  const rows = await p.$queryRaw<RefRaw[]>`
    SELECT * FROM symbol_references
    WHERE project_id = ${projectId}
      AND generation_id = (SELECT active_graph_generation_id FROM workspaces WHERE project_id = ${projectId})
      AND symbol_name = ${symbolName}
    ORDER BY from_file ASC, from_line ASC
  `;
  return rows.map(mapRef);
}