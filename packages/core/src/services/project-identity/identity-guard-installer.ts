import { getPgPool } from "../../data/db-connection.js";
import { STATIC_DIRECT_STORES } from "./registry.js";

/**
 * Minimal query surface the installer needs. Production wires this to a pg
 * `PoolClient` (`pool.connect()`); in-process tests substitute a fake.
 */
export interface IdentityGuardInstallerClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
}

export interface ProjectIdentityGuardInstallReport {
  /** Tables on which the guard trigger was (re)installed. */
  readonly installed: readonly string[];
  /** Inventoryed tables deliberately left unguarded (project_identity_operations
   *  has no project_id column; it is the operation authority itself). */
  readonly skipped: readonly string[];
  /** Runtime vector_documents* tables discovered via pg_tables and guarded. */
  readonly runtimeTablesGuarded: readonly string[];
  /** Per-table failures with SANITIZED codes (PG SQLSTATE only — no message, no row data). */
  readonly failures: readonly { table: string; code: string }[];
}

/**
 * Install (or replace — the SQL fn is DROP IF EXISTS + CREATE) the project
 * identity guard trigger on a single table.column. Idempotent and safe to call
 * from runtime table-initialization sites (keyword/search/vector init).
 *
 * Returns the sanitized code on failure, or undefined on success. NEVER throws.
 */
export async function installGuardOnTable(
  client: IdentityGuardInstallerClient,
  schema: string,
  table: string,
  column: string,
): Promise<string | undefined> {
  try {
    await client.query(
      `SELECT project_identity_install_guard($1::regclass, $2)`,
      [`${schema}.${table}`, column],
    );
    return undefined;
  } catch (error) {
    return sanitizeErrorCode(error);
  }
}

/**
 * Iterate the static direct-store registry plus runtime vector_documents* tables
 * and install the project identity guard on every mutable identity column.
 *
 * The SQL function `project_identity_install_guard(target_table REGCLASS,
 * column_name TEXT)` (T1) is idempotent: it DROPs any existing trigger and
 * CREATEs a fresh BEFORE INSERT OR UPDATE OF column OR DELETE row-level trigger
 * that resolves aliases on INSERT/UPDATE and takes a shared advisory lock on
 * DELETE. So every guarded-table write is already safe — async writers need no
 * draining.
 *
 * Failure isolation (spec req 8): a single install failure is recorded in
 * `failures` with a SANITIZED code and NEVER aborts the loop or throws. Failure
 * codes are PG SQLSTATE strings only (e.g. "42703"); error.message, row data,
 * and SQL are never captured.
 */
export async function installProjectIdentityGuards(
  client: IdentityGuardInstallerClient,
  schema = "public",
): Promise<ProjectIdentityGuardInstallReport> {
  const installed: string[] = [];
  const skipped: string[] = [];
  const runtimeTablesGuarded: string[] = [];
  const failures: { table: string; code: string }[] = [];

  // 1. Static catalog. Mutable rows get a guard trigger. Immutable-by-rewrite
  //    rows split two ways: operation_log is GUARDED so NEW audit rows written
  //    with a retired id resolve to the live target (historical rows are never
  //    rewritten — that is what registry `mutable: false` means); the
  //    project_identity_operations table is skipped (no project_id column; it
  //    is the operation authority itself).
  for (const [table, policy] of Object.entries(STATIC_DIRECT_STORES)) {
    if (!policy.mutable && table !== "operation_log") {
      skipped.push(table);
      continue;
    }
    const code = await installGuardOnTable(client, schema, table, policy.identityColumn);
    if (code === undefined) {
      installed.push(table);
    } else {
      failures.push({ table, code });
    }
  }

  // 2. Runtime vector_documents[_Nd] tables. These are created at runtime when a
  //    new embedding dimension is detected; discovery picks them up, but the
  //    guard must be installed too so writers cannot bypass the contract.
  //    The probe itself is failure-isolated (req 8): a discovery error is one
  //    sanitized failure entry, never a rejected report.
  let runtimeTables: string[] = [];
  try {
    const probe = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename ~ '^vector_documents(_[0-9]+d)?$'`,
      [schema],
    );
    runtimeTables = probe.rows.map((row) => row.tablename).filter(Boolean);
  } catch (error) {
    failures.push({ table: "<runtime-discovery:vector_documents>", code: sanitizeErrorCode(error) });
  }
  for (const table of runtimeTables) {
    const code = await installGuardOnTable(client, schema, table, "project_id");
    if (code === undefined) {
      runtimeTablesGuarded.push(table);
    } else {
      failures.push({ table, code });
    }
  }

  return { installed, skipped, runtimeTablesGuarded, failures };
}

/**
 * Production startup path: acquire the shared pg pool, install guards on the
 * static catalog plus runtime vector tables, then release the client. Keeps
 * the data layer inside core — transport apps call this instead of touching
 * `pg` pools themselves.
 *
 * Throws ONLY on pool acquisition/connect failure (the caller warn-logs with
 * a sanitized shape and continues startup). Per-table install failures are
 * already captured inside the report with sanitized SQLSTATE codes.
 */
export async function installProjectIdentityGuardsFromPool(
  schema = "public",
): Promise<ProjectIdentityGuardInstallReport> {
  const pool = await getPgPool();
  const client = await pool.connect();
  try {
    return await installProjectIdentityGuards(client, schema);
  } finally {
    client.release();
  }
}

/**
 * Extract a sanitized error code from a caught value. Prefers the PG SQLSTATE
 * (`err.code`, e.g. "42703"); falls back to "UNKNOWN". NEVER returns err.message
 * or any other potentially-sensitive field — spec req 8.
 */
function sanitizeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "UNKNOWN";
}
