/**
 * Impact Analysis — impacted_modules quotient rollup (Wave 5 FR-03 / N41 / AC-3).
 *
 * The rollup groups impacted files by 2-segment path prefix, caps at 20, and
 * folds overflow into `(other)`. This test exercises both the pure helper
 * (`computeImpactedModules`) and the end-to-end `analyze()` output.
 */

import { describe, test, expect } from "bun:test";
import {
  ImpactAnalysisService,
  computeImpactedModules,
} from "../services/symbol/impact-analysis.js";
import type { ImpactedSymbol } from "../services/symbol/impact-analysis.js";

function imp(file: string): ImpactedSymbol {
  return {
    fqn: `${file}#fn`,
    name: "fn",
    file,
    line: 1,
    depth: 0,
    centrality: 0.5,
    risk: 1,
    reason: "test",
    via: { changedFile: "c.ts", edge: "import" },
  };
}

describe("computeImpactedModules — pure quotient rollup (FR-03)", () => {
  test("empty input → empty rollup", () => {
    expect(computeImpactedModules([])).toEqual([]);
  });

  test("single prefix → single entry", () => {
    const r = computeImpactedModules([imp("src/a.ts"), imp("src/b.ts")]);
    expect(r).toEqual([{ prefix: "src", count: 2 }]);
  });

  test("2-segment prefix: path/to/file.ts → path/to", () => {
    const r = computeImpactedModules([
      imp("packages/core/src/a.ts"),
      imp("packages/core/src/b.ts"),
      imp("packages/api/src/c.ts"),
    ]);
    const map = new Map(r.map((x) => [x.prefix, x.count]));
    expect(map.get("packages/core")).toBe(2);
    expect(map.get("packages/api")).toBe(1);
  });

  test("files with fewer than 2 segments use full path as prefix", () => {
    const r = computeImpactedModules([imp("root.ts"), imp("root.ts")]);
    expect(r).toEqual([{ prefix: "root.ts", count: 2 }]);
  });

  test("≤ cap → all prefixes surfaced, no (other)", () => {
    const impacted: ImpactedSymbol[] = [];
    for (let i = 0; i < 5; i++) {
      impacted.push(imp(`pkg${i}/mod.ts`));
    }
    const r = computeImpactedModules(impacted, 20);
    expect(r.length).toBe(5);
    expect(r.some((x) => x.prefix === "(other)")).toBe(false);
  });

  test("> cap → overflow folds into (other)", () => {
    // 25 distinct prefixes, cap 20 → 19 head + (other) = 20 entries.
    const impacted: ImpactedSymbol[] = [];
    for (let i = 0; i < 25; i++) {
      impacted.push(imp(`pkg${i}/mod.ts`));
    }
    const r = computeImpactedModules(impacted, 20);
    expect(r.length).toBe(20);
    const other = r.find((x) => x.prefix === "(other)");
    expect(other).toBeDefined();
    // (other) aggregates the 6 overflow prefixes (25 - 19 = 6).
    expect(other!.count).toBe(6);
    // Head entries are sorted by count desc; here all counts are 1 so the
    // tiebreak is prefix asc.
    const head = r.filter((x) => x.prefix !== "(other)");
    expect(head.length).toBe(19);
  });

  test("sorted by count desc, then prefix asc for determinism", () => {
    const impacted = [
      imp("bbb/x.ts"),
      imp("aaa/x.ts"),
      imp("aaa/y.ts"),
      imp("ccc/x.ts"),
    ];
    const r = computeImpactedModules(impacted);
    // aaa has count 2 (highest), bbb & ccc have count 1 (tie → asc prefix).
    expect(r[0]).toEqual({ prefix: "aaa", count: 2 });
    expect(r[1]).toEqual({ prefix: "bbb", count: 1 });
    expect(r[2]).toEqual({ prefix: "ccc", count: 1 });
  });
});

describe("ImpactAnalysisService.analyze — impacted_modules in result (AC-3)", () => {
  // Fixture: 1 changed file imported by files across 6 distinct 2-segment
  // prefixes (under the default cap of 20 → no overflow).
  const changed = {
    id: "src/changed.ts#run",
    project_id: "p",
    generation_id: "active",
    file_path: "src/changed.ts",
    name: "run",
    qualified_name: "run",
    kind: "function" as const,
    line_start: 1,
    line_end: 1,
    exported: true,
    indexed_at: 1,
  };
  const prefixes = ["pkg/a", "pkg/b", "pkg/c", "pkg/d", "pkg/e", "pkg/f"];
  const importers = prefixes.map((p) => ({
    from_file: `${p}/mod.ts`,
    to_file: "src/changed.ts",
    is_external: false,
  }));
  const importerDefs = importers.map((e, i) => ({
    ...changed,
    id: `${e.from_file}#fn${i}`,
    file_path: e.from_file,
    name: `fn${i}`,
    qualified_name: `fn${i}`,
  }));
  const allDefs = [changed, ...importerDefs];
  const repo = {
    allFiles: async () => ["src/changed.ts", ...importers.map((e) => e.from_file)],
    listDefinitions: async (_pid: string, opts: { file?: string }) =>
      opts.file ? allDefs.filter((d) => d.file_path === opts.file) : allDefs,
    allImportEdges: async () => importers,
    getCentrality: async () => new Map(importers.map((e, i) => [e.from_file, i + 1])),
    findReferencesByFqn: async () => [],
    findReferencesByName: async () => [],
  };

  test("6 distinct prefixes → 6 entries, impacted_total matches", async () => {
    const result = await ImpactAnalysisService.getInstance().analyze({
      projectId: "p",
      projectPath: ".",
      scope: "unstaged",
      depth: 1,
      diffRunner: () => ({ paths: ["src/changed.ts"], untrackedFiltered: 0 }),
      repoOverride: repo as never,
    });
    expect(result.impacted_modules).toBeDefined();
    expect(result.impacted_modules!.length).toBe(6);
    const prefixSet = new Set(result.impacted_modules!.map((m) => m.prefix));
    for (const p of prefixes) expect(prefixSet.has(p)).toBe(true);
    // impacted_total = unique impacted FQNs = 6 (one per importer file).
    expect(result.impacted_total).toBe(6);
    // Sum of module counts equals impacted_total (no overflow).
    const sum = result.impacted_modules!.reduce((s, m) => s + m.count, 0);
    expect(sum).toBe(result.impacted_total);
  });

  test("empty diff → impacted_modules undefined or empty", async () => {
    const emptyRepo = {
      allFiles: async () => ["src/changed.ts"],
      listDefinitions: async () => [],
      allImportEdges: async () => [],
      getCentrality: async () => new Map(),
      findReferencesByFqn: async () => [],
      findReferencesByName: async () => [],
    };
    const result = await ImpactAnalysisService.getInstance().analyze({
      projectId: "p",
      projectPath: ".",
      scope: "unstaged",
      depth: 1,
      diffRunner: () => ({ paths: [], untrackedFiltered: 0 }),
      repoOverride: emptyRepo as never,
    });
    expect(result.impacted_total).toBe(0);
    // No impacted files → rollup is empty (not undefined, since analyze ran).
    expect(result.impacted_modules ?? []).toEqual([]);
  });
});