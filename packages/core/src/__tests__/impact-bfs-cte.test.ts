/**
 * Wave 5 T07 — Multi-source BFS recursive CTE (runBfsCteImpact).
 *
 * FR-05 / N3 / AD-W5-018 / AC-26 (partial): the single recursive CTE walks the
 * reverse import graph from changed files, returning { file, hop }[] with
 * `MIN(hop)` collapsing cycles. NULL guard (FR-24): NULL seeds are dropped so
 * a NULL in the changed-seed does not silently re-walk the whole graph.
 *
 * PG integration: skipped when DATABASE_URL is not a Postgres connection.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { getSymbolRepository } from "../data/symbol/symbol-repository-factory.js";
import { SymbolRepositoryPg } from "../data/symbol/symbol-repository-pg.js";

const DB_AVAILABLE = /^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "");
const RUN = DB_AVAILABLE && (process.env.RUN_POSTGRES_TESTS !== "0");

describe.skipIf(!RUN)("runBfsCteImpact — multi-source BFS CTE (T07 / FR-05 / AC-26)", () => {
  const projectId = `w5-bfs-cte-${randomUUID()}`;
  let prisma: any;

  beforeAll(async () => {
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
    const repo = getSymbolRepository();
    await repo.upsertWorkspace({
      project_id: projectId,
      project_path: "/tmp/w5-bfs",
      display_name: "W5 BFS CTE",
      status: "indexed",
      files_count: 5,
      chunks_count: 5,
      symbols_count: 5,
    });
    // Files: a.ts ← b.ts ← c.ts (changed), plus d.ts ← e.ts (disconnected),
    // plus a cyclic pair x.ts ↔ y.ts.
    // Import graph (from_file imports to_file):
    //   b.ts imports a.ts      (b depends on a)
    //   c.ts imports b.ts      (c depends on b)
    //   e.ts imports d.ts      (disconnected chain)
    //   x.ts imports y.ts
    //   y.ts imports x.ts      (cycle)
    const files = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "x.ts", "y.ts"];
    for (const f of files) {
      await repo.upsertFile({
        project_id: projectId,
        relative_path: f,
        content_hash: `h-${f}`,
        mtime: 1,
        size: 10,
        indexed_at: Date.now(),
        symbol_count: 1,
        chunk_count: 0,
      });
    }
    // Insert imports via insertImport.
    const imp = (from: string, to: string) => ({
      project_id: projectId,
      from_file: from,
      to_file: to,
      specifier: "./" + to,
      imported_names: ["x"],
      is_external: false,
      is_type_only: false,
    });
    await repo.insertImport(imp("b.ts", "a.ts"));
    await repo.insertImport(imp("c.ts", "b.ts"));
    await repo.insertImport(imp("e.ts", "d.ts"));
    await repo.insertImport(imp("x.ts", "y.ts"));
    await repo.insertImport(imp("y.ts", "x.ts"));
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$executeRaw`DELETE FROM symbol_imports WHERE project_id = ${projectId}`;
      await prisma.$executeRaw`DELETE FROM symbol_files WHERE project_id = ${projectId}`;
      await prisma.$executeRaw`DELETE FROM workspaces WHERE project_id = ${projectId}`;
    }
  });

  test("single changed file → reverse BFS finds importers at increasing hops", async () => {
    const repo = getSymbolRepository();
    // Changed: a.ts. Importers: b.ts (hop 1), c.ts (hop 2). d/e/x/y not reached.
    const r = await repo.runBfsCteImpact(projectId, ["a.ts"], {
      depth: 4,
      maxImpacted: 100,
    });
    const map = new Map(r.map((x) => [x.file, x.hop]));
    expect(map.get("a.ts")).toBe(0);
    expect(map.get("b.ts")).toBe(1);
    expect(map.get("c.ts")).toBe(2);
    expect(map.has("d.ts")).toBe(false);
    expect(map.has("e.ts")).toBe(false);
    expect(map.has("x.ts")).toBe(false);
  });

  test("multi-source BFS: changed {a.ts, d.ts} reaches both chains", async () => {
    const repo = getSymbolRepository();
    const r = await repo.runBfsCteImpact(projectId, ["a.ts", "d.ts"], {
      depth: 4,
      maxImpacted: 100,
    });
    const map = new Map(r.map((x) => [x.file, x.hop]));
    expect(map.get("a.ts")).toBe(0);
    expect(map.get("d.ts")).toBe(0);
    expect(map.get("b.ts")).toBe(1);
    expect(map.get("e.ts")).toBe(1);
    expect(map.get("c.ts")).toBe(2);
  });

  test("cyclic import (x↔y): MIN(hop) collapses; no infinite recursion", async () => {
    const repo = getSymbolRepository();
    // Changed: x.ts. y imports x (hop 1). x imports y — but x is the seed so
    // it's excluded from re-queueing via visited[].
    const r = await repo.runBfsCteImpact(projectId, ["x.ts"], {
      depth: 4,
      maxImpacted: 100,
    });
    const map = new Map(r.map((x) => [x.file, x.hop]));
    expect(map.get("x.ts")).toBe(0);
    expect(map.get("y.ts")).toBe(1);
    // The cycle x↔y does NOT cause the CTE to loop: visited[] guards it.
    // No extra files leaked in.
    expect(map.size).toBe(2);
  });

  test("NULL guard: NULL in changed-seed is dropped (no re-walk)", async () => {
    const repo = getSymbolRepository();
    // NULL must not match any to_file (which would re-walk everything).
    const r = await repo.runBfsCteImpact(projectId, ["a.ts", null as unknown as string], {
      depth: 4,
      maxImpacted: 100,
    });
    const map = new Map(r.map((x) => [x.file, x.hop]));
    expect(map.get("a.ts")).toBe(0);
    expect(map.get("b.ts")).toBe(1);
    // The NULL did not cause every file to appear.
    expect(map.has("d.ts")).toBe(false);
  });

  test("empty changed-seed → empty result", async () => {
    const repo = getSymbolRepository();
    const r = await repo.runBfsCteImpact(projectId, [], { depth: 4, maxImpacted: 100 });
    expect(r).toEqual([]);
  });

  test("depth=0 → only the seed files (hop 0)", async () => {
    const repo = getSymbolRepository();
    const r = await repo.runBfsCteImpact(projectId, ["a.ts"], { depth: 0, maxImpacted: 100 });
    expect(r).toEqual([{ file: "a.ts", hop: 0 }]);
  });

  test("maxImpacted cap truncates the result", async () => {
    const repo = getSymbolRepository();
    // 2 reachable files (b, c) + seed = 3; cap at 2 → 2 returned.
    const r = await repo.runBfsCteImpact(projectId, ["a.ts"], { depth: 4, maxImpacted: 2 });
    expect(r.length).toBe(2);
    // Ordered by hop, file_id → seed first.
    expect(r[0]).toEqual({ file: "a.ts", hop: 0 });
  });
});