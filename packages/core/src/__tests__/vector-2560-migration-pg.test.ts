/**
 * Migration integration test for `20260806120000_add_vector_2560_bq`
 * (`vector_documents_2560d`, the qwen3-embedding:4b table). Mirrors the
 * throwaway-database pattern in `graph-generation-lifecycle-pg.test.ts`:
 * every migration.sql under prisma/migrations is applied, in order, to a
 * freshly created database, and the test asserts on the resulting schema —
 * not on application code — so it fails if the migration file itself is
 * wrong (missing table, missing embedding_bq column, missing HNSW index),
 * the same class of defect a Prisma model alone cannot catch.
 *
 * Gated like its sibling: PG-required, off by default, on only when both
 * RUN_VECTOR_2560_MIGRATION=1 and MASSA_AI_DEDICATED=1 are set (the second
 * flag is the same "I understand this creates and drops a real database"
 * guard the lifecycle test uses, and is already in turbo.json
 * passThroughEnv). Neither RUN_VECTOR_2560_MIGRATION nor the admin URL is
 * wired into turbo's passThroughEnv — run this file directly with `bun test`,
 * exactly as graph-generation-lifecycle-pg.test.ts is run:
 *
 *   RUN_VECTOR_2560_MIGRATION=1 MASSA_AI_DEDICATED=1 PGPASSWORD=test \
 *     bun test src/__tests__/vector-2560-migration-pg.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const expectedAdminUrl = "postgresql://test@127.0.0.1:5433/postgres";
const integrationRequested =
  process.env.RUN_VECTOR_2560_MIGRATION === "1" && process.env.MASSA_AI_DEDICATED === "1";
const databaseName = `massa_vector_2560_migration_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let admin: Client | undefined;
let db: Client | undefined;
let ownsDatabase = false;

function migrations(): string[] {
  const root = join(import.meta.dir, "../../prisma/migrations");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((directory) => readFileSync(join(root, directory, "migration.sql"), "utf8"));
}

beforeAll(async () => {
  if (!integrationRequested) return;
  expect(databaseName).toMatch(/^massa_vector_2560_migration_[a-zA-Z0-9_]+$/);

  admin = new Client({ connectionString: expectedAdminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  ownsDatabase = true;

  db = new Client({ connectionString: `postgresql://test@127.0.0.1:5433/${databaseName}` });
  await db.connect();
  for (const migration of migrations()) await db.query(migration);
});

afterAll(async () => {
  if (!integrationRequested) return;
  await db?.end();
  if (admin && ownsDatabase) {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await admin.query(`DROP DATABASE "${databaseName}"`);
    ownsDatabase = false;
  }
  await admin?.end();
});

describe.skipIf(!integrationRequested)("vector_documents_2560d migration", () => {
  test("creates the table with the expected columns", async () => {
    const { rows } = await db!.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'vector_documents_2560d' ORDER BY column_name`,
    );
    const columnNames = rows.map((r) => r.column_name).sort();
    expect(columnNames).toEqual(
      ["content", "created_at", "embedding", "embedding_bq", "id", "metadata", "project_id", "updated_at"].sort(),
    );
  });

  test("embedding_bq is a bit(2560) column", async () => {
    const { rows } = await db!.query(
      `SELECT format_type(atttypid, atttypmod) AS type
       FROM pg_attribute
       WHERE attrelid = 'vector_documents_2560d'::regclass AND attname = 'embedding_bq'`,
    );
    expect(rows[0].type).toBe("bit(2560)");
  });

  test("embedding is a vector(2560) column", async () => {
    const { rows } = await db!.query(
      `SELECT format_type(atttypid, atttypmod) AS type
       FROM pg_attribute
       WHERE attrelid = 'vector_documents_2560d'::regclass AND attname = 'embedding'`,
    );
    expect(rows[0].type).toBe("vector(2560)");
  });

  test("has a project_id btree index for project-scoped lookups", async () => {
    const { rows } = await db!.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'vector_documents_2560d' AND indexname = 'vector_documents_2560d_project_id_idx'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("project_id");
  });

  test("has an HNSW bit_hamming_ops index on embedding_bq", async () => {
    const { rows } = await db!.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'vector_documents_2560d' AND indexname = 'idx_vector_documents_2560d_embedding_bq'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("hnsw");
    expect(rows[0].indexdef).toContain("bit_hamming_ops");
  });

  test("primary key is the id column", async () => {
    const { rows } = await db!.query(
      `SELECT a.attname FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'vector_documents_2560d'::regclass AND i.indisprimary`,
    );
    expect(rows.map((r) => r.attname)).toEqual(["id"]);
  });

  test("re-running the migration is idempotent", async () => {
    const migrationSql = readFileSync(
      join(import.meta.dir, "../../prisma/migrations/20260806120000_add_vector_2560_bq/migration.sql"),
      "utf8",
    );
    await expect(db!.query(migrationSql)).resolves.toBeDefined();
  });
});
