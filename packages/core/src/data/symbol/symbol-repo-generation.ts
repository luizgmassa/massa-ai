/**
 * symbol-repo-generation.ts — generation-scoped writes + lock helpers (N31 T08/T09)
 *
 * Generation-write methods (copyFileGeneration, writeFileGeneration,
 * deleteFileGeneration, markFileStaleGeneration, updateCentralityGeneration,
 * writeFileSymbols) move here in T09. The shared lock + validation helpers
 * (GenerationWriteLockRow, lockOwnedPendingGeneration, lockActiveGenerations,
 * validateGenerationFileWrite, definitionCandidate, compareDefinitionCandidates)
 * live here because they are generation-scoped. T08's queries module imports
 * `lockActiveGenerations` from here.
 */

import { parseStructuralFqn, type StructuralFqnCandidate } from "../../services/structural/fqn-codec.js";
import type { GraphGenerationLease } from "../graph-generation/graph-generation-contract.js";
import type {
  SymbolDefinition,
  GenerationFileWrite,
} from "./symbol-repo-types.js";
import type { TransactionClient } from "./symbol-repo-identity.js";

export interface GenerationWriteLockRow {
  id: string;
  status: string;
  expected_active_id: string | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  fingerprint: string;
  input_snapshot_hash: string;
  expected_files_count: number;
  pending_graph_generation_id: string | null;
  graph_lease_token: string | null;
  graph_lease_expires_at: Date | null;
  active_graph_generation_id: string | null;
  live: boolean;
}

export async function lockOwnedPendingGeneration(
  tx: TransactionClient,
  lease: GraphGenerationLease,
): Promise<boolean> {
  // Lock only the generation row. T11 activation locks workspace then waits on
  // this row, so it cannot cut over while a file transaction is committing.
  // Taking the workspace lock after this lock would invert T11's order.
  const generations = await tx.$queryRaw<Array<Omit<GenerationWriteLockRow,
    "pending_graph_generation_id" | "graph_lease_token" | "graph_lease_expires_at" |
    "active_graph_generation_id" | "live">>>`
    SELECT id, status, expected_active_id, lease_token, lease_expires_at,
           fingerprint, input_snapshot_hash, expected_files_count
    FROM graph_generations
    WHERE project_id = ${lease.projectId} AND id = ${lease.generationId}
    FOR UPDATE
  `;
  const generation = generations[0];
  if (!generation) return false;
  const workspaces = await tx.$queryRaw<Array<{
    pending_graph_generation_id: string | null;
    graph_lease_token: string | null;
    graph_lease_expires_at: Date | null;
    active_graph_generation_id: string | null;
    live: boolean;
  }>>`
    SELECT pending_graph_generation_id, graph_lease_token, graph_lease_expires_at,
           active_graph_generation_id,
           (graph_lease_expires_at > clock_timestamp()
             AND ${generation.lease_expires_at}::timestamp > clock_timestamp()) AS live
    FROM workspaces WHERE project_id = ${lease.projectId}
  `;
  const workspace = workspaces[0];
  return Boolean(
    workspace && workspace.live && generation.status === "pending" &&
    workspace.pending_graph_generation_id === lease.generationId &&
    workspace.graph_lease_token === lease.leaseToken &&
    generation.lease_token === lease.leaseToken &&
    workspace.active_graph_generation_id === lease.expectedActiveGenerationId &&
    generation.expected_active_id === lease.expectedActiveGenerationId &&
    generation.fingerprint === lease.fingerprint &&
    generation.input_snapshot_hash === lease.inputSnapshotHash &&
    Number(generation.expected_files_count) === lease.expectedFilesCount
  );
}

export async function lockActiveGenerations(
  tx: TransactionClient,
  projectIds: readonly string[],
): Promise<Map<string, string>> {
  const generations = new Map<string, string>();
  for (const projectId of [...new Set(projectIds)].sort()) {
    const rows = await tx.$queryRaw<Array<{ active_graph_generation_id: string | null }>>`
      SELECT active_graph_generation_id FROM workspaces
      WHERE project_id = ${projectId} FOR UPDATE
    `;
    const generationId = rows[0]?.active_graph_generation_id;
    if (!generationId) throw new Error(`active_graph_generation_missing:${projectId}`);
    generations.set(projectId, generationId);
  }
  return generations;
}

export function validateGenerationFileWrite(input: GenerationFileWrite, lease: GraphGenerationLease): void {
  const { file } = input;
  if (file.project_id !== lease.projectId || !file.relative_path) {
    throw new TypeError("generation file must belong to the leased project and have a path");
  }
  if (!Number.isInteger(file.parser_error_count ?? 0) || (file.parser_error_count ?? 0) < 0) {
    throw new RangeError("parser_error_count must be a non-negative integer");
  }
  if ((file.diagnostics?.length ?? 0) > 10) throw new RangeError("diagnostics must contain at most 10 entries");
  for (const definition of input.definitions) {
    if (definition.project_id !== lease.projectId || definition.file_path !== file.relative_path) {
      throw new TypeError("definition must belong to the generation file");
    }
  }
  for (const reference of input.references) {
    if (reference.project_id !== lease.projectId || reference.from_file !== file.relative_path) {
      throw new TypeError("reference must originate from the generation file");
    }
  }
  for (const imported of input.imports) {
    if (imported.project_id !== lease.projectId || imported.from_file !== file.relative_path) {
      throw new TypeError("import must originate from the generation file");
    }
  }
}

export function definitionCandidate(definition: SymbolDefinition): StructuralFqnCandidate {
  let signatureHash = definition.signature_hash;
  if (!signatureHash) {
    const parsed = parseStructuralFqn(definition.id);
    if (parsed.format === "qualified") signatureHash = parsed.signatureHash;
  }
  if (!signatureHash) throw new Error(`ambiguous_definition_identity_incomplete:${definition.id}`);
  const qualifiedName = definition.qualified_name ?? definition.name;
  return Object.freeze({
    fqn: definition.id,
    file: definition.file_path,
    name: definition.name,
    displayName: qualifiedName,
    qualifiedName,
    kind: definition.kind,
    signatureHash,
  });
}

export function compareDefinitionCandidates(left: StructuralFqnCandidate, right: StructuralFqnCandidate): number {
  return left.file.localeCompare(right.file) ||
    left.qualifiedName.localeCompare(right.qualifiedName) ||
    left.kind.localeCompare(right.kind) ||
    left.signatureHash.localeCompare(right.signatureHash);
}