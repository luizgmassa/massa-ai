/**
 * Track 5 (data hygiene) — schema-vs-registry completeness guard.
 *
 * `managed_runs` carried a `project_id` column but no registry entry, which
 * made `directStorePolicy`/`isKnownRegistryTable` blind to it and broke
 * rename/merge (`PROJECT_IDENTITY_UNKNOWN_STORAGE`) for any project with
 * managed_runs rows. This test regexes `prisma/schema.prisma` for every model
 * carrying a `@map("project_id")` column, resolves its `@@map(...)` table
 * name, and asserts each such table is known to
 * `packages/core/src/kernel/registry.ts` (or is on the explicit exclusion
 * list below, with a reason) — so the next new project-scoped table cannot
 * silently miss the registry the way managed_runs did.
 */
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { isKnownRegistryTable } from "../kernel/registry.js";

const SCHEMA_PATH = path.resolve(import.meta.dir, "../../prisma/schema.prisma");

/**
 * Tables that carry a `project_id` column by schema shape but are
 * intentionally NOT covered by the identity registry, with the reason.
 * Empty today: every project_id-bearing model in the current schema resolves
 * to a registry-known store. Add an entry here only with a one-line reason —
 * an unexplained addition defeats the point of this gate.
 */
const REGISTRY_EXCLUDED_TABLES: readonly string[] = [];

/**
 * Extracts every `{ table, hasProjectId }` pair from `schema.prisma` by
 * scanning top-level `model X { ... }` blocks for a `@map("project_id")`
 * field and reading the block's own `@@map("...")` table name.
 */
function extractProjectIdTables(schema: string): string[] {
  const modelBlockPattern = /model\s+\w+\s*\{([\s\S]*?)\n\}/g;
  const tables: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = modelBlockPattern.exec(schema)) !== null) {
    const body = match[1];
    if (!/@map\("project_id"\)/.test(body)) continue;
    const tableMatch = body.match(/@@map\("([^"]+)"\)/);
    if (!tableMatch) continue;
    tables.push(tableMatch[1]);
  }
  return tables;
}

describe("project identity registry — schema completeness", () => {
  test("every project_id-identity table in schema.prisma is known to the registry or explicitly excluded", () => {
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    const tables = extractProjectIdTables(schema);

    // Sanity: the regex still matches the schema's current shape (a schema
    // rewrite that silently stopped matching would otherwise pass vacuously).
    expect(tables.length).toBeGreaterThan(0);
    expect(tables).toContain("managed_runs");

    const unknown = tables.filter(
      (table) => !isKnownRegistryTable(table) && !REGISTRY_EXCLUDED_TABLES.includes(table),
    );

    expect(unknown).toEqual([]);
  });
});
