/**
 * RFS-02 AC-2 and AC-3 — the shared eviction function's own unit suite.
 *
 * WHAT THIS FILE CARRIES THAT T1'S SUITE DOES NOT.
 * T1's `lru-eviction-characterization.test.ts` drives the five caches through their real
 * public surfaces and is the oracle T7's repoint must leave byte-identical and green. It has a
 * measured hole: its `read_file · fileCache` case cannot discriminate eviction at all. Neuter
 * `read_file.ts`'s `evictOldest` body entirely and that case still reads 1 pass / 0 fail, while
 * `read_file · projectRootCache` goes 0 pass / 1 fail. The mechanism is that the case offers
 * `read("fc-1")` returning "V2" as its evidence that fc-1 was evicted — but fc-1's CACHED value
 * is also "V2", because the fill loop ran after the disk was rewritten to V2. A cache hit and a
 * fresh re-read are the same bytes, so the assertion cannot tell them apart. `tasks.md` §10.1's
 * mutation M8 ("read_file evictOldest neutered") is recorded as FAIL 4p/1f, which is the same
 * reading from the other side and went unremarked. Full record: `tasks.md` §10.7, C45.
 *
 * So the retained count and the victim's identity — the two properties `spec.md` §3.B's
 * unification claim actually rests on — are pinned HERE, directly on the function, where they
 * survive Phases 3 and 4 moving `read_file.ts`'s caches into `services/file-read/`.
 *
 * AC-3'S PROPERTY IS THE IMPORT ASSERTION, AND IT IS THE ONE WITH NO CI BEHIND IT.
 * `spec.md` RFS-02 AC-3 as written is about `kernel/lru-cache.ts` and kernel leaf-ness enforced
 * by `check-core-layering`. C30 (`design.md` §5.2) moved the module to `services/cache/`, where
 * no tier rule constrains it, and recorded the replacement — "imports nothing at all" — as a
 * real loss of enforcement (R-29). The final group below is that replacement. It is an AST walk
 * rather than a text match on this feature's standing rule (`design.md` §6.4: never a regex);
 * a substring check for "import" would miss `require(`, a dynamic `import()`, and an
 * `export ... from` re-export, all of which are import edges.
 */

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import path from "path";
import ts from "typescript";

import { evictOldest } from "../services/cache/lru-evict.js";

/** The caps the four repointed files pass at T7. Named, not invented. */
const CAP_READ_FILE = 512; // file-content-cache.ts · FILE_CACHE_MAX_ENTRIES (T10)
const CAP_SYMBOL_GRAPH = 512; // symbol-graph.service.ts · PROJECT_ROOT_CACHE_MAX_ENTRIES
const CAP_WEB = 512; // web-controller.ts  · WEB_CACHE_MAX_ENTRIES
const CAP_FILTER = 50; // file-filter-cache.ts · MAX_CACHE_SIZE

const seed = (n: number, offset = 0): Map<string, number> => {
  const m = new Map<string, number>();
  for (let i = offset; i < offset + n; i++) m.set(`k-${i}`, i);
  return m;
};

/** A read that promotes, as four of the five sites do: delete + re-set moves the key to newest. */
const promote = <V>(m: Map<string, V>, key: string): void => {
  const v = m.get(key)!;
  m.delete(key);
  m.set(key, v);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. Retained count and victim identity — the property T1's fileCache case cannot see.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("evictOldest — retained count and victim", () => {
  test("evicts oldest-first until size <= maxRetained, and names the survivors exactly", () => {
    const m = seed(10);
    evictOldest(m, 6);

    expect(m.size).toBe(6);
    // Not just the count: WHICH keys survived. A cap-respecting implementation that evicted
    // the newest instead of the oldest passes a size assertion and fails this one.
    expect([...m.keys()]).toEqual(["k-4", "k-5", "k-6", "k-7", "k-8", "k-9"]);
  });

  test("a promoted (re-inserted) key survives an eviction that would otherwise take it", () => {
    const m = seed(5);
    promote(m, "k-0"); // k-0 becomes newest; k-1 becomes the eviction candidate
    evictOldest(m, 4);

    expect(m.size).toBe(4);
    expect(m.has("k-0")).toBe(true);
    expect(m.has("k-1")).toBe(false);
    // Insertion order after the promotion, so the NEXT eviction takes k-2, not k-0.
    expect([...m.keys()]).toEqual(["k-2", "k-3", "k-4", "k-0"]);
  });

  test("evicts however many entries it takes, not exactly one", () => {
    const m = seed(100);
    evictOldest(m, 10);

    expect(m.size).toBe(10);
    expect([...m.keys()][0]).toBe("k-90");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. Both call positions, at the four real caps. This is the group that makes T7 provable.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The five sites split on call position — three evict BEFORE the insert, two AFTER — and
// `design.md` §5.1's "(cache, cap)" does not say which the shared function speaks. Measured
// (`tasks.md` §10.7, C44): one operator with every site passing its own literal cap is
// behavior-preserving at NEITHER set of sites. The contract that serves both is a post-call
// bound, and these cases are its proof at the exact numbers T7 will pass.
describe("evictOldest — both call positions land on the same retained count", () => {
  for (const [label, cap] of [
    ["read_file (512)", CAP_READ_FILE],
    ["symbol-graph (512)", CAP_SYMBOL_GRAPH],
    ["web-controller (512)", CAP_WEB],
    ["file-filter-cache (50)", CAP_FILTER],
  ] as const) {
    test(`${label}: pre-insert with CAP-1 and post-insert with CAP agree, key for key`, () => {
      const pre = new Map<string, number>();
      const post = new Map<string, number>();

      // CAP+1 distinct inserts through each call position.
      for (let i = 0; i <= cap; i++) {
        evictOldest(pre, cap - 1); // pre-insert: reserve the slot the set() below takes
        pre.set(`k-${i}`, i);

        post.set(`k-${i}`, i);
        evictOldest(post, cap); // post-insert: the set() already happened
      }

      expect(pre.size).toBe(cap);
      expect(post.size).toBe(cap);
      // Same retained SET, not merely the same count — the two positions are interchangeable
      // for the caller only if they keep the same keys.
      expect([...pre.keys()]).toEqual([...post.keys()]);
      expect(pre.has("k-0")).toBe(false); // the first-inserted is the victim
      expect(pre.has(`k-${cap}`)).toBe(true); // the newest is retained
    });
  }

  test("the naive reading is pinned: pre-insert with CAP (no -1) retains CAP+1", () => {
    // This is C44 written as an assertion rather than as prose. It exists so that a later
    // editor "simplifying" the `- 1` out of a T7 call site fails here instead of shipping a
    // silent off-by-one that T1's fileCache case would not catch either.
    const naive = new Map<string, number>();
    for (let i = 0; i <= CAP_READ_FILE; i++) {
      evictOldest(naive, CAP_READ_FILE);
      naive.set(`k-${i}`, i);
    }
    expect(naive.size).toBe(CAP_READ_FILE + 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. Edges and the guard.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("evictOldest — edges", () => {
  test("is a no-op when the cache is already at or under the bound", () => {
    const m = seed(3);
    evictOldest(m, 3);
    expect([...m.keys()]).toEqual(["k-0", "k-1", "k-2"]);

    evictOldest(m, 99);
    expect([...m.keys()]).toEqual(["k-0", "k-1", "k-2"]);
  });

  test("is a no-op on an empty cache and does not throw", () => {
    const m = new Map<string, number>();
    evictOldest(m, 0);
    expect(m.size).toBe(0);
  });

  test("maxRetained 0 empties the cache", () => {
    const m = seed(4);
    evictOldest(m, 0);
    expect(m.size).toBe(0);
  });

  test("an `undefined` key does not wedge the loop — the guard's only reachable case", () => {
    // The `if (oldest === undefined) break` guard is unreachable for every real call site,
    // because the loop condition forces size >= 1 whenever maxRetained >= 0. It IS reachable
    // with `undefined` as an actual key, which is the only way a Map yields `undefined` from
    // `keys().next().value` while non-empty. Asserted so the guard's behavior is stated rather
    // than assumed — NOT for coverage: `scripts/check-coverage.ts:320` parses `DA:` only, so
    // that line is already covered by every case above.
    const m = new Map<string | undefined, number>([[undefined, 1], ["b", 2]]);
    evictOldest(m, 0);
    // The guard breaks out rather than looping forever; the undefined-keyed entry survives.
    expect(m.size).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. RFS-02 AC-3's replacement property — the one with no CI behind it (R-29).
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("lru-evict.ts imports nothing — RFS-02 AC-3's replacement for kernel leaf-ness", () => {
  const MODULE_PATH = path.join(import.meta.dir, "../services/cache/lru-evict.ts");

  test("the module file exists at the path this assertion checks", () => {
    // Refuse-on-missing. Without this, renaming or deleting the module makes every assertion
    // below vacuously true against an empty string — a gate that passes by not looking, which
    // is the exact class RFS-01 AC-5 exists to forbid.
    expect(existsSync(MODULE_PATH)).toBe(true);
    expect(readFileSync(MODULE_PATH, "utf8").length).toBeGreaterThan(0);
  });

  test("zero import edges of any kind, by AST rather than by text match", () => {
    const source = readFileSync(MODULE_PATH, "utf8");
    const sf = ts.createSourceFile(MODULE_PATH, source, ts.ScriptTarget.ES2022, true);

    const found: string[] = [];
    const walk = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) found.push(`ImportDeclaration ${node.moduleSpecifier.getText(sf)}`);
      if (ts.isImportEqualsDeclaration(node)) found.push(`ImportEqualsDeclaration ${node.name.text}`);
      // `export { x } from "./y.js"` is an import edge wearing an export's clothes.
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        found.push(`re-export from ${node.moduleSpecifier.getText(sf)}`);
      }
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          found.push(`dynamic import(${node.arguments[0]?.getText(sf) ?? ""})`);
        }
        if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
          found.push(`require(${node.arguments[0]?.getText(sf) ?? ""})`);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);

    expect(found).toEqual([]);
  });

  test("the AST walk is not vacuous — it finds every edge shape in a synthetic fixture", () => {
    // A sensor is not quotable until it has failed on purpose (`tasks.md` §10.2, C37). The
    // module is import-free, so the assertion above passes trivially and proves nothing about
    // the walk. This runs the identical walk over a fixture carrying all five shapes.
    const fixture = [
      `import a from "./a.js";`,
      `import b = require("./b.js");`,
      `export { c } from "./c.js";`,
      `const d = await import("./d.js");`,
      `const e = require("./e.js");`,
    ].join("\n");
    const sf = ts.createSourceFile("fixture.ts", fixture, ts.ScriptTarget.ES2022, true);

    const found: string[] = [];
    const walk = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) found.push("ImportDeclaration");
      if (ts.isImportEqualsDeclaration(node)) found.push("ImportEqualsDeclaration");
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) found.push("re-export");
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("dynamic-import");
        if (ts.isIdentifier(node.expression) && node.expression.text === "require") found.push("require");
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);

    // `import b = require(...)` is an ImportEqualsDeclaration whose initializer is NOT a
    // CallExpression to an identifier named `require` — TypeScript models it as an
    // ExternalModuleReference — so it is counted once, by its own predicate.
    expect(found).toContain("ImportDeclaration");
    expect(found).toContain("ImportEqualsDeclaration");
    expect(found).toContain("re-export");
    expect(found).toContain("dynamic-import");
    expect(found).toContain("require");
    expect(found.length).toBe(5);
  });
});
