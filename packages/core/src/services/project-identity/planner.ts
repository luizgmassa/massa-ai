import { resolve } from "node:path";

import {
  PROJECT_IDENTITY_PLAN_VERSION,
  parseProjectIdentityPreviewRequest,
  type ProjectIdentityConflict,
  type ProjectIdentityPreview,
  type ProjectIdentityPreviewInput,
  type ProjectIdentityStoreCount,
} from "./contracts.js";
import {
  discoverProjectIdentityStorage,
  fingerprintProjectIdentityRows,
  inspectIdentityPayload,
  quoteDiscoveredIdentifier,
  type DiscoveredDirectStore,
  type ProjectIdentityQueryClient,
} from "./discovery.js";
import { ProjectIdentityError } from "./errors.js";
import { canonicalProjectIdentityJson, hashProjectIdentityPlan } from "./hash.js";

interface WorkspaceRow { project_id: string; project_path: string }
interface AliasRow { retired_project_id: string; target_project_id: string }
interface PayloadRow { payload_value: unknown }

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalRoot(projectPath: string): string {
  return resolve(projectPath);
}

function normalizedCollisionKey(row: Record<string, unknown>, store: DiscoveredDirectStore): string | null {
  const keyColumns = store.primaryKey.filter((column) => column !== store.identityColumn);
  if (keyColumns.length === 0) return null;
  return canonicalProjectIdentityJson(keyColumns.map((column) => row[column]));
}

function normalizedMaterial(row: Record<string, unknown>, identityColumn: string): string {
  const normalized = { ...row };
  delete normalized[identityColumn];
  return canonicalProjectIdentityJson(normalized);
}

function selectColumnsFor(store: DiscoveredDirectStore): string {
  const seen = new Set<string>();
  const quoted: string[] = [];
  for (const column of [store.identityColumn, ...store.primaryKey, ...store.materialColumns]) {
    if (seen.has(column)) continue;
    seen.add(column);
    quoted.push(quoteDiscoveredIdentifier(column));
  }
  return quoted.join(", ");
}

async function loadDirectRows(
  client: ProjectIdentityQueryClient,
  store: DiscoveredDirectStore,
  source: string,
  target: string,
): Promise<Record<string, unknown>[]> {
  const table = quoteDiscoveredIdentifier(store.storeId);
  const column = quoteDiscoveredIdentifier(store.identityColumn);
  const projection = selectColumnsFor(store);
  const result = await client.query<Record<string, unknown>>(
    `SELECT ${projection} FROM ${table} WHERE ${column} = $1 OR ${column} = $2`,
    [source, target],
  );
  return result.rows;
}

export class ProjectIdentityPreviewPlanner {
  constructor(
    private readonly client: ProjectIdentityQueryClient,
    private readonly schema = "public",
  ) {}

  async preview(input: ProjectIdentityPreviewInput): Promise<ProjectIdentityPreview> {
    const request = parseProjectIdentityPreviewRequest(input);
    try {
      const [workspaceResult, aliasResult, inventory] = await Promise.all([
        this.client.query<WorkspaceRow>(
          `SELECT project_id, project_path FROM workspaces WHERE project_id = $1 OR project_id = $2`,
          [request.sourceProjectId, request.targetProjectId],
        ),
        this.client.query<AliasRow>(
          `SELECT retired_project_id, target_project_id FROM project_identity_aliases
            WHERE retired_project_id = $1 OR retired_project_id = $2`,
          [request.sourceProjectId, request.targetProjectId],
        ),
        discoverProjectIdentityStorage(this.client, this.schema),
      ]);
      const workspaces = new Map(workspaceResult.rows.map((row) => [row.project_id, row]));
      const aliases = new Set(aliasResult.rows.map((row) => row.retired_project_id));
      const source = workspaces.get(request.sourceProjectId);
      const target = workspaces.get(request.targetProjectId);
      if (aliases.has(request.sourceProjectId)) throw new ProjectIdentityError("PROJECT_IDENTITY_SOURCE_RETIRED");
      if (!source) throw new ProjectIdentityError("PROJECT_IDENTITY_SOURCE_NOT_FOUND");
      if (aliases.has(request.targetProjectId)) throw new ProjectIdentityError("PROJECT_IDENTITY_TARGET_RETIRED");
      if (request.mode === "rename" && target) throw new ProjectIdentityError("PROJECT_IDENTITY_TARGET_EXISTS");
      if (request.mode === "merge" && !target) throw new ProjectIdentityError("PROJECT_IDENTITY_TARGET_NOT_FOUND");

      const sourceRoot = canonicalRoot(source.project_path);
      const targetRoot = target ? canonicalRoot(target.project_path) : null;
      if (request.mode === "merge" && sourceRoot !== targetRoot) {
        throw new ProjectIdentityError("PROJECT_IDENTITY_ROOT_MISMATCH");
      }

      const counts = new Map<string, ProjectIdentityStoreCount>();
      const conflicts = new Map<string, ProjectIdentityConflict>();
      const fingerprintRows: unknown[] = [];
      for (const store of inventory.directStores) {
        const rows = await loadDirectRows(
          this.client, store, request.sourceProjectId, request.targetProjectId,
        );
        fingerprintRows.push({ store: store.storeId, rows });
        const sourceRows = rows.filter((row) => row[store.identityColumn] === request.sourceProjectId);
        counts.set(store.storeId, { storeId: store.storeId, directCount: sourceRows.length, adaptedCount: 0 });
        if (request.mode === "merge") {
          const targets = new Map<string, string>();
          for (const row of rows.filter((item) => item[store.identityColumn] === request.targetProjectId)) {
            const key = normalizedCollisionKey(row, store);
            if (key != null) targets.set(key, normalizedMaterial(row, store.identityColumn));
          }
          let collisionCount = 0;
          for (const row of sourceRows) {
            const key = normalizedCollisionKey(row, store);
            const targetMaterial = key == null ? undefined : targets.get(key);
            if (targetMaterial !== undefined && targetMaterial !== normalizedMaterial(row, store.identityColumn)) {
              collisionCount++;
            }
          }
          if (collisionCount > 0) conflicts.set(`${store.storeId}:key_collision`, {
            storeId: store.storeId, kind: "key_collision", count: collisionCount,
          });
        }
      }

      for (const adapter of inventory.payloadStores) {
        const table = quoteDiscoveredIdentifier(adapter.storeId);
        const column = quoteDiscoveredIdentifier(adapter.column);
        const result = await this.client.query<PayloadRow>(
          `SELECT ${column} AS payload_value FROM ${table} WHERE ${column} IS NOT NULL`,
        );
        let adaptedCount = 0;
        let malformedCount = 0;
        const payloadFingerprints: string[] = [];
        for (const row of result.rows) {
          const inspected = inspectIdentityPayload(row.payload_value, adapter.encoding, request.sourceProjectId);
          adaptedCount += inspected.count;
          if (inspected.malformed) malformedCount++;
          else payloadFingerprints.push(inspected.canonical);
        }
        fingerprintRows.push({ store: `${adapter.storeId}.${adapter.column}`, payloads: payloadFingerprints });
        const count = counts.get(adapter.storeId) ?? {
          storeId: adapter.storeId, directCount: 0, adaptedCount: 0,
        };
        count.adaptedCount += adaptedCount;
        counts.set(adapter.storeId, count);
        if (malformedCount > 0) conflicts.set(`${adapter.storeId}:malformed_payload`, {
          storeId: adapter.storeId, kind: "malformed_payload", count: malformedCount,
        });
      }

      const storageFingerprint = fingerprintProjectIdentityRows(fingerprintRows);
      const material = {
        planVersion: PROJECT_IDENTITY_PLAN_VERSION,
        mode: request.mode,
        sourceProjectId: request.sourceProjectId,
        targetProjectId: request.targetProjectId,
        sourceCanonicalRoot: sourceRoot,
        targetCanonicalRoot: targetRoot,
        stores: [...counts.values()].sort((a, b) => compareText(a.storeId, b.storeId)),
        conflicts: [...conflicts.values()].sort((a, b) =>
          compareText(a.storeId, b.storeId) || compareText(a.kind, b.kind)),
        unknownStores: inventory.unknownStores,
        storageFingerprint,
      };
      return { ...material, dryRun: true, planHash: hashProjectIdentityPlan(material) };
    } catch (error) {
      if (error instanceof ProjectIdentityError) throw error;
      throw new ProjectIdentityError("PROJECT_IDENTITY_BACKEND_UNAVAILABLE", { cause: error });
    }
  }
}
