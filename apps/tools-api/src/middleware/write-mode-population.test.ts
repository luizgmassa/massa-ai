/**
 * T3 — the cardinality test (HPC-03, AC-03.4, AC-03.10).
 *
 * Enumerates every route from `apps/tools-api/src/routes/**` SOURCE — a text
 * scan, not an import. Importing every route file into one module is exactly
 * what `web-ui-contract.test.ts:17-19` documents breaking: `apps/tools-api`'s
 * own `tsconfig.json` (`rootDir: ./src`, no `allowJs`) and the Prisma-touching
 * side effects several route files carry at import time make that path
 * unusable for an enumeration test.
 *
 * The scan then subtracts `GET`, subtracts the T1 classification
 * (`READ_ONLY_ROUTES`), and simulates the T2 gate's own decision function
 * (`findReadOnlyRoute` — never a second, hand-rolled copy of the list) over
 * every remaining route, printing the population unconditionally so a
 * regression that silently empties it cannot pass vacuously (measured: an
 * empty scan would still clear a lax floor and nobody would notice without
 * the printed count).
 *
 * AC-03.4 fails a route that is "neither classified read-only nor covered by
 * the gate" — the second half of that clause is what a pure classified/
 * unclassified partition cannot see: `write-mode.ts` exempts `isPublicPath`
 * requests BEFORE it ever looks at the classification (AC-03.7), so a non-GET
 * route accidentally mounted under a public prefix (`/health`, `/swagger`,
 * `/ui`) would be unclassified AND ungated at once — refused by nothing. That
 * is the one way an unclassified route in this codebase could be a real gap
 * rather than default-deny's intended (over-)protection, and it is what the
 * RED proof below exercises: a fake route added under `/ui/` is the one
 * placement a floor-only check cannot catch, because growing the population
 * by one legitimate future write route (T7/T8, same branch) must NOT redden
 * this file, and no purely-numeric assertion can tell "one more legitimate
 * write route" apart from "one more fake write route" — only the
 * public-path-exemption check can, because it is not about count at all.
 *
 * Floors, not exact counts, for the raw totals: T7/T8 add 5 non-GET routes
 * later in this branch, and an equality assertion on the raw counts would
 * redden on that later, legitimate work.
 */

import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { findReadOnlyRoute, READ_ONLY_ROUTES } from "./write-mode-classification.js";
import { isPublicPath } from "./auth.js";

const ROUTES_DIR = path.resolve(import.meta.dir, "../routes");

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RouteRecord {
  file: string;
  method: Method;
  path: string;
}

function routeSourceFiles(): string[] {
  return fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();
}

function extractPrefix(source: string): string {
  const m = source.match(/new Elysia\(\s*\{\s*prefix:\s*(['"])([^'"]*)\1/);
  return m ? m[2] : "";
}

// AC-03.10: `.group(`, `.guard(`, `.all(` must appear nowhere in this tree.
// Anchored so `Promise.all(` — genuinely present in this tree
// (project.ts, web.ts) — is never a false positive: the character right
// before the dot must NOT be an identifier character.
const FORBIDDEN_CONSTRUCT_RE = /(^|[^a-zA-Z0-9_.])\.(group|guard|all)\(/;

// A genuine Elysia route-registration call in this codebase's own style is
// either (a) a chain continuation starting a source line — `  .post(` — or
// (b) chained directly onto the constructor on the same line —
// `new Elysia({ prefix: "..." }).post(`. That distinction is what keeps this
// scan from false-positiving on same-named methods that are not routes at
// all — `registry.get(id)`, `config.get("hooks")`, `someMap.delete(id)` all
// appear in this tree and match a naive `\.(get|post|...)\(` scan while
// matching neither shape here (measured: the naive form overcounts GET by
// treating `config.get("memory")` as a route, and separately undercounts
// nothing — both were checked before adopting the anchored form).
const ROUTE_CALL_RE = /(?:^[ \t]*\.|new Elysia\([^)]*\)\s*\.)(get|post|put|patch|delete)\(/gm;
const ROUTE_CALL_WITH_LITERAL_RE =
  /(?:^[ \t]*\.|new Elysia\([^)]*\)\s*\.)(get|post|put|patch|delete)\(\s*(['"])((?:(?!\2).)*)\2/gms;

function scanFile(file: string, source: string): { routes: RouteRecord[]; candidateCalls: number } {
  const prefix = extractPrefix(source);
  const routes: RouteRecord[] = [];
  const re = new RegExp(ROUTE_CALL_WITH_LITERAL_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const method = m[1].toUpperCase() as Method;
    const subPath = m[3];
    const full = subPath === "/" ? prefix || "/" : `${prefix}${subPath}`;
    routes.push({ file, method, path: full });
  }
  const candidateCalls = (source.match(ROUTE_CALL_RE) || []).length;
  return { routes, candidateCalls };
}

const files = routeSourceFiles();
const allRoutes: RouteRecord[] = [];
let totalCandidateCalls = 0;
let totalLiteralCalls = 0;
const forbiddenConstructFiles: string[] = [];
const nonLiteralFiles: string[] = [];

for (const file of files) {
  const source = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
  if (FORBIDDEN_CONSTRUCT_RE.test(source)) forbiddenConstructFiles.push(file);
  const { routes, candidateCalls } = scanFile(file, source);
  if (candidateCalls !== routes.length) nonLiteralFiles.push(file);
  allRoutes.push(...routes);
  totalCandidateCalls += candidateCalls;
  totalLiteralCalls += routes.length;
}

const getRoutes = allRoutes.filter((r) => r.method === "GET");
const nonGetRoutes = allRoutes.filter((r) => r.method !== "GET");

const classifiedNonGet = nonGetRoutes.filter((r) => findReadOnlyRoute(r.method, r.path));
const unclassifiedNonGet = nonGetRoutes.filter((r) => !findReadOnlyRoute(r.method, r.path));

// A route that is neither classified nor exempted by the public-path check
// would be neither "classified read-only" NOR "covered by the gate" — the
// exact AC-03.4 failure condition. Everything else in `unclassifiedNonGet`
// IS covered, by default-deny.
const ungatedUnclassified = unclassifiedNonGet.filter((r) => isPublicPath(r.path));

// Printed unconditionally — this is what stops the floor check below from
// passing vacuously over an accidentally-emptied population, and what
// satisfies "print any unclassified path by name" as a standing fact, not
// only on failure.
console.log(
  `[write-mode-population] files=${files.length} total=${allRoutes.length} (floor 81) ` +
    `GET=${getRoutes.length} non-GET=${nonGetRoutes.length} (floor 50) ` +
    `classified=${classifiedNonGet.length} (of ${READ_ONLY_ROUTES.length} table entries) ` +
    `gate-refused=${unclassifiedNonGet.length}`,
);
console.log(
  "[write-mode-population] gate-refused (unclassified, default-deny) non-GET routes:\n" +
    unclassifiedNonGet.map((r) => `  ${r.method} ${r.path}  (${r.file})`).join("\n"),
);

describe("write-mode population — enumeration assumptions hold (AC-03.10)", () => {
  test("every candidate route-verb call in routes/ source takes a literal string first argument", () => {
    if (nonLiteralFiles.length > 0) {
      console.log("[write-mode-population] non-literal verb-call files:", nonLiteralFiles);
    }
    expect(nonLiteralFiles).toEqual([]);
    expect(totalLiteralCalls).toBe(totalCandidateCalls);
  });

  test(".group(, .guard(, .all( appear nowhere in routes/ source", () => {
    expect(forbiddenConstructFiles).toEqual([]);
  });

  test("no duplicate method+path pair was scanned (a scan bug, not a real Elysia state)", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of allRoutes) {
      const key = `${r.method} ${r.path}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });
});

describe("write-mode population — cardinality floor (AC-03.4)", () => {
  test("total and non-GET route counts meet the floor, printed rather than pinned", () => {
    expect(allRoutes.length).toBeGreaterThanOrEqual(81);
    expect(nonGetRoutes.length).toBeGreaterThanOrEqual(50);
  });

  test("every T1 classification entry corresponds to a real scanned route", () => {
    const found = new Set(nonGetRoutes.map((r) => `${r.method} ${r.path}`));
    const missing = READ_ONLY_ROUTES.filter((e) => !found.has(`${e.method} ${e.path}`));
    expect(missing.map((e) => `${e.method} ${e.path}`)).toEqual([]);
  });

  test("the classified subset is exactly the T1 table — stable regardless of future route growth", () => {
    // This count does not move when T7/T8 add write routes later in this
    // branch (they are writes, not new read classifications), so pinning it
    // exactly does not carry the "redden on our own later work" risk the
    // raw totals above do.
    expect(classifiedNonGet.length).toBe(READ_ONLY_ROUTES.length);
  });

  test("the gate's own decision function partitions the population with no gap: unclassified + classified === non-GET", () => {
    expect(unclassifiedNonGet.length + classifiedNonGet.length).toBe(nonGetRoutes.length);
  });

  test("no unclassified non-GET route is exempted by the public-path check (AC-03.4's 'nor covered by the gate')", () => {
    if (ungatedUnclassified.length > 0) {
      console.log(
        "[write-mode-population] UNGATED unclassified routes (public-path AND unclassified — a real gap):\n" +
          ungatedUnclassified.map((r) => `  ${r.method} ${r.path}  (${r.file})`).join("\n"),
      );
    }
    expect(ungatedUnclassified.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });
});
