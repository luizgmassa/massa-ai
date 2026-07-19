import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../prisma/migrations/20260719120000_add_project_identity/migration.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("project identity migration", () => {
  test("is atomic and adds durable alias and immutable operation records", () => {
    expect(migrationSql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migrationSql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(migrationSql).toContain('CREATE TABLE "project_identity_aliases"');
    expect(migrationSql).toContain('CREATE TABLE "project_identity_operations"');
    expect(migrationSql).toContain("project_identity_operations_immutable");
    expect(migrationSql).toContain("BEFORE UPDATE OR DELETE");
    expect(migrationSql).toContain("project_identity_operations_result_check");
    expect(migrationSql).toContain("project_identity_aliases_operation_id_fkey");
  });

  test("provides shared writer and ordered exclusive apply lock primitives", () => {
    expect(migrationSql).toContain("CREATE FUNCTION project_identity_lock_shared");
    expect(migrationSql).toContain("pg_advisory_xact_lock_shared");
    expect(migrationSql).toContain("CREATE FUNCTION project_identity_lock_exclusive");
    expect(migrationSql).toContain("pg_advisory_xact_lock(");
    expect(migrationSql).toContain("SELECT DISTINCT value");
    expect(migrationSql).toContain("ORDER BY value");
    expect(migrationSql).toContain("CREATE FUNCTION project_identity_resolve");
    expect(migrationSql).toMatch(/CREATE FUNCTION project_identity_resolve[\s\S]*?VOLATILE/);
    expect(migrationSql).toContain("project_identity_alias_cycle");
    expect(migrationSql).toContain("CREATE FUNCTION project_identity_install_guard");
    expect(migrationSql).toContain("BEFORE INSERT OR UPDATE OF %I OR DELETE");
  });

  test("repairs every graph composite FK for deferred update cascades", () => {
    for (const constraint of [
      "graph_generations_project_id_fkey",
      "workspaces_active_graph_generation_fkey",
      "workspaces_pending_graph_generation_fkey",
      "symbol_files_generation_fkey",
      "symbol_definitions_generation_fkey",
      "symbol_references_generation_fkey",
      "symbol_imports_generation_fkey",
      "symbol_centrality_generation_fkey",
    ]) {
      expect(migrationSql).toContain(`DROP CONSTRAINT "${constraint}"`);
      expect(migrationSql).toContain(`ADD CONSTRAINT "${constraint}"`);
    }
    expect(migrationSql.match(/ON UPDATE CASCADE/g)?.length).toBe(9);
    expect(migrationSql.match(/DEFERRABLE INITIALLY DEFERRED/g)?.length).toBe(10);
  });
});
