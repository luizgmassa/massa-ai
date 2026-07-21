import { createHash } from "node:crypto";

import { canonicalProjectIdentityJson } from "./hash.js";
import { parsePgArrayLiteral } from "./pg-array-codec.js";
import {
  PROJECT_IDENTITY_REGISTRY_VERSION,
  directStorePolicy,
  isKnownRegistryTable,
  payloadStorePolicies,
  type IdentityColumn,
  type PayloadStorePolicy,
} from "./registry.js";

export interface ProjectIdentityQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
}

export interface ProjectIdentityQueryClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<ProjectIdentityQueryResult<Row>>;
}

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
}

interface PrimaryKeyRow {
  table_name: string;
  columns: string[] | string;
}

export interface DiscoveredDirectStore {
  storeId: string;
  identityColumn: IdentityColumn;
  mutable: boolean;
  primaryKey: readonly string[];
  /**
   * Safe (non-heavy) columns to fingerprint and compare as row material.
   * Excludes the identity column and heavy types (bytea/vector) so previews
   * never ship embeddings or large binary payloads to the planner.
   */
  materialColumns: readonly string[];
}

export interface DiscoveredPayloadStore extends PayloadStorePolicy {
  /** True when the table carries its own project_id column, so payload scans
   *  can be scoped to the source/target rows instead of the whole table. */
  readonly hasProjectIdentityColumn: boolean;
}

export interface ProjectIdentityInventory {
  registryVersion: typeof PROJECT_IDENTITY_REGISTRY_VERSION;
  directStores: readonly DiscoveredDirectStore[];
  payloadStores: readonly DiscoveredPayloadStore[];
  unknownStores: readonly string[];
}

const IDENTITY_COLUMNS = new Set(["project_id", "workspace_id"]);
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
/** information_schema.data_type values that hold large/derived payloads we never ship to the planner. */
const HEAVY_DATA_TYPES = new Set(["bytea", "USER-DEFINED"]);

export function quoteDiscoveredIdentifier(identifier: string): string {
  if (!SAFE_IDENTIFIER.test(identifier)) throw new TypeError("Unsafe discovered SQL identifier");
  return `"${identifier}"`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Columns safe to load as row material: excludes the identity column and heavy binary/vector types. */
function materialColumnsFor(
  columns: Map<string, string>,
  identityColumn: string,
): string[] {
  const result: string[] = [];
  for (const [column, dataType] of columns) {
    if (column === identityColumn) continue;
    if (HEAVY_DATA_TYPES.has(dataType)) continue;
    result.push(column);
  }
  return result.sort(compareText);
}

export async function discoverProjectIdentityStorage(
  client: ProjectIdentityQueryClient,
  schema = "public",
): Promise<ProjectIdentityInventory> {
  const columnsResult = await client.query<ColumnRow>(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position`,
    [schema],
  );
  const primaryKeysResult = await client.query<PrimaryKeyRow>(
    `SELECT tc.table_name, array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_schema = tc.constraint_schema
        AND kcu.constraint_name = tc.constraint_name
        AND kcu.table_name = tc.table_name
      WHERE tc.table_schema = $1 AND tc.constraint_type = 'PRIMARY KEY'
      GROUP BY tc.table_name
      ORDER BY tc.table_name`,
    [schema],
  );

  const columnsByTable = new Map<string, Map<string, string>>();
  for (const row of columnsResult.rows) {
    if (!SAFE_IDENTIFIER.test(row.table_name) || !SAFE_IDENTIFIER.test(row.column_name)) continue;
    const columns = columnsByTable.get(row.table_name) ?? new Map<string, string>();
    if (!columns.has(row.column_name)) columns.set(row.column_name, row.data_type);
    columnsByTable.set(row.table_name, columns);
  }
  const primaryKeys = new Map(primaryKeysResult.rows.map((row) => [
    row.table_name,
    Array.isArray(row.columns) ? row.columns : String(row.columns).replace(/^\{|\}$/g, "").split(",").filter(Boolean),
  ]));

  const directStores: DiscoveredDirectStore[] = [];
  const payloadStores: DiscoveredPayloadStore[] = [];
  const unknown = new Set<string>();
  for (const [tableName, columns] of columnsByTable) {
    for (const [column, dataType] of columns) {
      if (!IDENTITY_COLUMNS.has(column)) continue;
      const policy = directStorePolicy(tableName, column as IdentityColumn);
      if (!policy) unknown.add(`${tableName}.${column}`);
      else directStores.push({
        ...policy,
        primaryKey: primaryKeys.get(tableName) ?? [],
        materialColumns: materialColumnsFor(columns, column),
      });
    }
    for (const policy of payloadStorePolicies(tableName)) {
      if (columns.has(policy.column)) {
        payloadStores.push({ ...policy, hasProjectIdentityColumn: columns.has("project_id") });
      }
    }
    if (/project|workspace/.test(tableName) && !isKnownRegistryTable(tableName)) {
      unknown.add(tableName);
    }
  }

  return {
    registryVersion: PROJECT_IDENTITY_REGISTRY_VERSION,
    directStores: directStores.sort((a, b) => compareText(a.storeId, b.storeId)),
    payloadStores: payloadStores.sort((a, b) =>
      compareText(a.storeId, b.storeId) || compareText(a.column, b.column)),
    unknownStores: [...unknown].sort(compareText),
  };
}

const IDENTITY_KEYS = new Set(["projectId", "project_id", "workspaceId", "workspace_id"]);

function countIdentityReferences(value: unknown, projectId: string): number {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countIdentityReferences(item, projectId), 0);
  }
  if (!value || typeof value !== "object") return 0;
  let count = 0;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (IDENTITY_KEYS.has(key) && item === projectId) count++;
    count += countIdentityReferences(item, projectId);
  }
  return count;
}

export function inspectIdentityPayload(
  raw: unknown,
  encoding: PayloadStorePolicy["encoding"],
  projectId: string,
): { count: number; malformed: boolean; canonical: string } {
  try {
    if (encoding === "text-array") {
      // TEXT columns arrive as PG array literals (`{a,b}`); native text[]
      // columns arrive as JS arrays. Both are valid (see pg-array-codec).
      const parsed = parsePgArrayLiteral(raw);
      if (parsed === undefined) {
        return { count: 0, malformed: raw != null, canonical: "" };
      }
      const count = parsed.filter((item) =>
        item === `handoff:${projectId}` || item === `project:${projectId}` || item === projectId
      ).length;
      return { count, malformed: false, canonical: canonicalProjectIdentityJson(parsed) };
    }
    const value = encoding === "json-text" && typeof raw === "string" ? JSON.parse(raw) : raw;
    if (value == null) return { count: 0, malformed: false, canonical: "null" };
    if (typeof value !== "object") return { count: 0, malformed: true, canonical: "" };
    return {
      count: countIdentityReferences(value, projectId),
      malformed: false,
      canonical: canonicalProjectIdentityJson(value),
    };
  } catch {
    return { count: 0, malformed: true, canonical: "" };
  }
}

export function fingerprintProjectIdentityRows(rows: readonly unknown[]): string {
  const hash = createHash("sha256");
  hash.update(`project-identity-registry:v${PROJECT_IDENTITY_REGISTRY_VERSION}\n`);
  for (const row of [...rows].map((item) => canonicalProjectIdentityJson(item)).sort(compareText)) {
    hash.update(row).update("\n");
  }
  return hash.digest("hex");
}
