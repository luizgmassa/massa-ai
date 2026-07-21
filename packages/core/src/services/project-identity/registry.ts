export const PROJECT_IDENTITY_REGISTRY_VERSION = 1 as const;

export type IdentityColumn = "project_id" | "workspace_id";

export interface DirectStorePolicy {
  readonly storeId: string;
  readonly identityColumn: IdentityColumn;
  readonly mutable: boolean;
}

export interface PayloadStorePolicy {
  readonly storeId: string;
  readonly column: string;
  readonly encoding: "json" | "json-text" | "text-array";
}

/**
 * Catalog of every direct (non-payload) project/workspace identity column.
 * Mutable rows are rewritten by apply; immutable rows (operation_log,
 * project_identity_operations) are inventoried but never rewritten.
 * Exported so the T4 guard installer can iterate the same catalog and install
 * a BEFORE INSERT/UPDATE/DELETE trigger on every mutable direct store.
 */
export const STATIC_DIRECT_STORES: Readonly<Record<string, DirectStorePolicy>> = {
  memories: { storeId: "memories", identityColumn: "project_id", mutable: true },
  projects: { storeId: "projects", identityColumn: "project_id", mutable: true },
  documents: { storeId: "documents", identityColumn: "project_id", mutable: true },
  search_queries: { storeId: "search_queries", identityColumn: "project_id", mutable: true },
  cache_stats: { storeId: "cache_stats", identityColumn: "project_id", mutable: true },
  workspaces: { storeId: "workspaces", identityColumn: "project_id", mutable: true },
  symbol_files: { storeId: "symbol_files", identityColumn: "project_id", mutable: true },
  symbol_definitions: { storeId: "symbol_definitions", identityColumn: "project_id", mutable: true },
  symbol_references: { storeId: "symbol_references", identityColumn: "project_id", mutable: true },
  symbol_imports: { storeId: "symbol_imports", identityColumn: "project_id", mutable: true },
  symbol_centrality: { storeId: "symbol_centrality", identityColumn: "project_id", mutable: true },
  index_jobs: { storeId: "index_jobs", identityColumn: "project_id", mutable: true },
  observations: { storeId: "observations", identityColumn: "project_id", mutable: true },
  task_checkpoints: { storeId: "task_checkpoints", identityColumn: "project_id", mutable: true },
  handoffs: { storeId: "handoffs", identityColumn: "project_id", mutable: true },
  proposals: { storeId: "proposals", identityColumn: "project_id", mutable: true },
  graph_generations: { storeId: "graph_generations", identityColumn: "project_id", mutable: true },
  keyword_documents: { storeId: "keyword_documents", identityColumn: "project_id", mutable: true },
  search_cache: { storeId: "search_cache", identityColumn: "project_id", mutable: true },
  search_analytics: { storeId: "search_analytics", identityColumn: "project_id", mutable: true },
  search_events: { storeId: "search_events", identityColumn: "project_id", mutable: true },
  synapse_sessions: { storeId: "synapse_sessions", identityColumn: "workspace_id", mutable: true },
  // Historical identity records are deliberately inventoried but never rewritten.
  operation_log: { storeId: "operation_log", identityColumn: "project_id", mutable: false },
  project_identity_operations: {
    storeId: "project_identity_operations",
    identityColumn: "project_id",
    mutable: false,
  },
};

const PAYLOAD_STORES: readonly PayloadStorePolicy[] = [
  // memories.metadata is TEXT holding a JSON document (same Prisma/no-OID
  // mapping class as tags) — the "json-text" encoding parses + re-serializes
  // so the UPDATE round-trips the text representation (T6 finding).
  { storeId: "memories", column: "metadata", encoding: "json-text" },
  { storeId: "memories", column: "tags", encoding: "text-array" },
  { storeId: "scheduled_jobs", column: "payload", encoding: "json-text" },
  { storeId: "keyword_documents", column: "metadata", encoding: "json" },
  { storeId: "observations", column: "payload_json", encoding: "json-text" },
  { storeId: "proposals", column: "payload_json", encoding: "json-text" },
  { storeId: "search_cache", column: "results", encoding: "json" },
];

export function directStorePolicy(
  tableName: string,
  columnName: IdentityColumn,
): DirectStorePolicy | undefined {
  if (/^vector_documents(?:_\d+d)?$/.test(tableName) && columnName === "project_id") {
    return { storeId: tableName, identityColumn: columnName, mutable: true };
  }
  const policy = STATIC_DIRECT_STORES[tableName];
  return policy?.identityColumn === columnName ? policy : undefined;
}

export function payloadStorePolicies(tableName: string): readonly PayloadStorePolicy[] {
  const policies = PAYLOAD_STORES.filter((entry) => entry.storeId === tableName);
  if (/^vector_documents(?:_\d+d)?$/.test(tableName)) {
    return [...policies, { storeId: tableName, column: "metadata", encoding: "json" }];
  }
  return policies;
}

export function isKnownRegistryTable(tableName: string): boolean {
  return tableName in STATIC_DIRECT_STORES ||
    PAYLOAD_STORES.some((entry) => entry.storeId === tableName) ||
    /^vector_documents(?:_\d+d)?$/.test(tableName) ||
    tableName === "project_identity_aliases";
}
