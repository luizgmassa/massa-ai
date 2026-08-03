#!/usr/bin/env bun
/**
 * XP-03 / TASK-XP-005 — count-bounded allowlist gate for dangerous primitives.
 *
 * A code-execution sandbox product needs a gate that fails when a new
 * `exec`/`spawn`/raw-SQL/`eval` call site lands unreviewed — not a report
 * that reads clean forever because nobody looks at it. This is that gate:
 * every dangerous-primitive call site in the shipped product surface must be
 * named in `scripts/security-allowlist.txt` with the exact count expected at
 * that path, reviewed once when it was added. A stale entry (the count no
 * longer matches, in EITHER direction) is a failure, same as an unreviewed
 * new site.
 *
 * ## Engine: TypeScript compiler API, never regex (spec AC-4)
 *
 * `scripts/check-tools-thin.ts` already measured three regex detectors wrong
 * in three different ways on this tree. A regex over text cannot distinguish
 * a real call from a string literal, a comment, or `someRegExp.exec(...)` —
 * and "a claim of absence can be the match" is exactly the failure mode a
 * docblock disclaiming a trigger literal produces against a text scanner.
 * Every class below is matched against real AST nodes (import bindings,
 * call expressions, tagged templates), so none of those three shapes can
 * ever match.
 *
 * ## The four classes (design.md C2)
 *
 * 1. `child-process`  — a call of any local binding that was imported (named,
 *    aliased, or namespace) from `child_process`/`node:child_process`.
 * 2. `bun-spawn`       — `Bun.spawn(...)`, `Bun.spawnSync(...)`, or a
 *    `` Bun.$`...` `` tagged template.
 * 3. `raw-sql-unsafe`  — a call to a member named `$queryRawUnsafe` or
 *    `$executeRawUnsafe`. The parameterized, tagged-template `$queryRaw` is
 *    deliberately NOT counted — it cannot carry unparameterized SQL by
 *    construction, and counting it would drown the 4 real classes in ~258
 *    mostly-generated hits (design.md Tech Decisions).
 * 4. `dynamic-eval`    — a bare `eval(...)` identifier call, or `new
 *    Function(...)`. This class permits ZERO allowlist entries: an
 *    allowlisted `eval` is still an `eval` (design.md C2).
 *
 * ## Population (design.md C2)
 *
 * `git ls-files`, filtered to `packages/{core,shared}/src/**\/*.ts` and
 * `apps/{tools-api,mcp-client,web-ui}/src/**\/*.ts`, minus any path
 * containing `__tests__/`, any `*.test.ts`, and `src/generated/`.
 * `scripts/` is deliberately excluded from the population — dev-time gates
 * legitimately shell out (this file's own sibling `check-tools-thin.ts`
 * calls `execSync`), and the trust boundary this gate protects is the
 * shipped product surface, not the build tooling that ships it. The
 * exclusion is printed in this gate's own output header, never silent.
 *
 * ## Failure modes
 *
 * - A file's actual count for a class exceeds its allowlist entry: new
 *   unreviewed site.
 * - A file's actual count is below its allowlist entry: stale allowlist
 *   (spec AC-3 — a site was removed and nobody updated the list; drift in
 *   either direction is a defect, not a pass).
 * - An allowlist entry names a file no longer in the population.
 * - Any `dynamic-eval` hit anywhere, allowlisted or not.
 * - A source file fails to parse: exit 1 naming the file, never skip it
 *   silently (spec edge case).
 */

import ts from "typescript";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.join(import.meta.dir, "..");
export const ALLOWLIST_PATH = path.join(import.meta.dir, "security-allowlist.txt");

export const CLASSES = ["child-process", "bun-spawn", "raw-sql-unsafe", "dynamic-eval"] as const;
export type PrimitiveClass = (typeof CLASSES)[number];

const CHILD_PROCESS_SPECIFIERS = new Set(["child_process", "node:child_process"]);
const BUN_SPAWN_MEMBERS = new Set(["spawn", "spawnSync"]);
const RAW_SQL_UNSAFE_MEMBERS = new Set(["$queryRawUnsafe", "$executeRawUnsafe"]);

/** Population roots (spec/design.md C2), relative to REPO_ROOT. */
const POPULATION_ROOTS = [
  "packages/core/src/",
  "packages/shared/src/",
  "apps/tools-api/src/",
  "apps/mcp-client/src/",
  "apps/web-ui/src/",
];

export interface Hit {
  cls: PrimitiveClass;
  file: string; // repo-relative
  line: number; // 1-based
  text: string; // the matched call expression's own source text (single line, truncated)
}

/**
 * Tracked `.ts` files under the population roots, minus tests and generated
 * output. `git ls-files -z` repo-wide and then a **prefix** filter,
 * deliberately not a `git` pathspec glob — a pathspec `*` crosses `/`, so it
 * agrees with a prefix filter only while every directory stays flat.
 */
export function trackedPopulationFiles(root: string = REPO_ROOT): string[] {
  return execSync("git ls-files -z", { cwd: root, maxBuffer: 1 << 28 })
    .toString()
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => POPULATION_ROOTS.some((prefix) => p.startsWith(prefix)))
    .filter((p) => p.endsWith(".ts"))
    .filter((p) => !p.includes("__tests__/"))
    .filter((p) => !p.endsWith(".test.ts"))
    .filter((p) => !p.includes("/generated/"));
}

function truncate(s: string, max = 120): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/** Local bindings in this file that came from a child_process import. */
function childProcessBindings(sf: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;
    if (!CHILD_PROCESS_SPECIFIERS.has(node.moduleSpecifier.text)) return;
    const clause = node.importClause;
    if (!clause) return;
    // Default import: `import cp from "child_process"` (rare, but the whole
    // module surface shells out — any member call off it counts).
    if (clause.name) bindings.add(clause.name.text);
    const named = clause.namedBindings;
    if (!named) return;
    if (ts.isNamespaceImport(named)) {
      // `import * as cp from "child_process"` — cp.exec(...), cp.spawn(...).
      bindings.add(named.name.text);
    } else if (ts.isNamedImports(named)) {
      // `import { exec as run } from "child_process"` — local binding wins,
      // regardless of alias (the rename-evasion shape check-tools-thin
      // documents for IToolHandler).
      for (const el of named.elements) bindings.add(el.name.text);
    }
  });
  return bindings;
}

/**
 * `ts.SourceFile.parseDiagnostics` is `@internal` in the shipped
 * `typescript.d.ts` (so untyped here), but the field is populated on the
 * runtime object regardless — `ts.createSourceFile` never throws on invalid
 * syntax, it produces a best-effort tree, and this is the accessible signal
 * that it did. Checked here so a file that fails to parse fails loudly
 * (spec edge case) instead of silently scanning zero hits out of a tree the
 * parser gave up on.
 */
function parseDiagnosticCount(sf: ts.SourceFile): number {
  return (sf as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length ?? 0;
}

/** Analyze one file's source text. Pure: no disk, no git. */
export function analyzeSource(file: string, text: string): Hit[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  if (parseDiagnosticCount(sf) > 0) {
    throw new Error(`syntax error(s) in ${file} — ${parseDiagnosticCount(sf)} parse diagnostic(s)`);
  }
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const cpBindings = childProcessBindings(sf);
  const hits: Hit[] = [];

  const push = (cls: PrimitiveClass, node: ts.Node): void => {
    hits.push({ cls, file, line: lineOf(node.getStart(sf)), text: truncate(node.getText(sf)) });
  };

  const visit = (node: ts.Node): void => {
    // child-process: a CALL whose callee is a tracked binding (direct call)
    // or a member access rooted at one (namespace/default import).
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && cpBindings.has(callee.text)) {
        push("child-process", node);
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        cpBindings.has(callee.expression.text)
      ) {
        push("child-process", node);
      }

      // bun-spawn: Bun.spawn(...) / Bun.spawnSync(...)
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "Bun" &&
        BUN_SPAWN_MEMBERS.has(callee.name.text)
      ) {
        push("bun-spawn", node);
      }

      // raw-sql-unsafe: any `.$queryRawUnsafe(` / `.$executeRawUnsafe(` call,
      // regardless of receiver.
      if (ts.isPropertyAccessExpression(callee) && RAW_SQL_UNSAFE_MEMBERS.has(callee.name.text)) {
        push("raw-sql-unsafe", node);
      }

      // dynamic-eval: bare `eval(...)` identifier call — NOT a member call
      // like `foo.eval(...)`, which is a different, unrelated method.
      if (ts.isIdentifier(callee) && callee.text === "eval") {
        push("dynamic-eval", node);
      }
    }

    // bun-spawn: `` Bun.$`...` `` tagged template.
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag;
      if (
        ts.isPropertyAccessExpression(tag) &&
        ts.isIdentifier(tag.expression) &&
        tag.expression.text === "Bun" &&
        tag.name.text === "$"
      ) {
        push("bun-spawn", node);
      }
    }

    // dynamic-eval: `new Function(...)`.
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") {
      push("dynamic-eval", node);
    }

    node.forEachChild(visit);
  };
  sf.forEachChild(visit);
  return hits;
}

export interface AllowlistEntry {
  cls: PrimitiveClass;
  file: string;
  expected: number;
  justification: string;
  lineNo: number; // 1-based line in the allowlist file, for diagnostics
}

/** `class|path|expected-count|justification`, `#` full-line comments, blank lines ignored. */
export function parseAllowlist(text: string): AllowlistEntry[] {
  const entries: AllowlistEntry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|");
    if (parts.length !== 4) {
      throw new Error(`security-allowlist.txt:${i + 1}: expected 4 '|'-separated fields, got ${parts.length}: ${raw}`);
    }
    const [cls, file, expectedStr, justification] = parts as [string, string, string, string];
    if (!(CLASSES as readonly string[]).includes(cls)) {
      throw new Error(`security-allowlist.txt:${i + 1}: unknown class "${cls}"`);
    }
    const expected = Number(expectedStr);
    if (!Number.isInteger(expected) || expected < 0) {
      throw new Error(`security-allowlist.txt:${i + 1}: expected-count must be a non-negative integer, got "${expectedStr}"`);
    }
    entries.push({ cls: cls as PrimitiveClass, file, expected, justification, lineNo: i + 1 });
  }
  return entries;
}

export interface Violation {
  kind: "unreviewed" | "stale" | "missing-file" | "dynamic-eval";
  cls: PrimitiveClass;
  file: string;
  actual: number;
  expected: number;
  detail: string;
}

export interface CheckResult {
  filesScanned: number;
  filesSkippedByPattern: number;
  hits: Hit[];
  totalsByClass: Record<PrimitiveClass, number>;
  entries: AllowlistEntry[];
  violations: Violation[];
}

/**
 * Run the gate over `root`. `allowlistText` is injectable for fixture tests;
 * production reads the real file.
 */
export function check(root: string = REPO_ROOT, allowlistText?: string): CheckResult {
  const allTracked = execSync("git ls-files -z", { cwd: root, maxBuffer: 1 << 28 })
    .toString()
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => POPULATION_ROOTS.some((prefix) => p.startsWith(prefix)))
    .filter((p) => p.endsWith(".ts"));
  const files = trackedPopulationFiles(root);
  const filesSkippedByPattern = allTracked.length - files.length;

  const hits: Hit[] = [];
  for (const file of files) {
    const abs = path.join(root, file);
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch (e) {
      throw new Error(`failed to read ${file}: ${(e as Error).message}`);
    }
    let fileHits: Hit[];
    try {
      fileHits = analyzeSource(file, text);
    } catch (e) {
      // Loud, never silent (spec edge case): a parse failure names the file.
      throw new Error(`failed to parse ${file}: ${(e as Error).message}`);
    }
    hits.push(...fileHits);
  }

  const totalsByClass = Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<PrimitiveClass, number>;
  for (const h of hits) totalsByClass[h.cls]++;

  const rawAllowlist = allowlistText ?? (existsSync(ALLOWLIST_PATH) ? readFileSync(ALLOWLIST_PATH, "utf8") : "");
  const entries = parseAllowlist(rawAllowlist);

  const trackedSet = new Set(files);
  const violations: Violation[] = [];

  // Actual counts per (class, file).
  const actualByKey = new Map<string, number>();
  for (const h of hits) {
    const key = `${h.cls}|${h.file}`;
    actualByKey.set(key, (actualByKey.get(key) ?? 0) + 1);
  }

  const coveredKeys = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.cls}|${entry.file}`;
    coveredKeys.add(key);
    if (!trackedSet.has(entry.file)) {
      violations.push({
        kind: "missing-file",
        cls: entry.cls,
        file: entry.file,
        actual: 0,
        expected: entry.expected,
        detail: `security-allowlist.txt:${entry.lineNo} names a file not in the current population: ${entry.file}`,
      });
      continue;
    }
    const actual = actualByKey.get(key) ?? 0;
    if (actual > entry.expected) {
      violations.push({
        kind: "unreviewed",
        cls: entry.cls,
        file: entry.file,
        actual,
        expected: entry.expected,
        detail: `${entry.file}: ${actual} ${entry.cls} site(s), allowlist expects ${entry.expected} (unreviewed new site)`,
      });
    } else if (actual < entry.expected) {
      violations.push({
        kind: "stale",
        cls: entry.cls,
        file: entry.file,
        actual,
        expected: entry.expected,
        detail: `${entry.file}: ${actual} ${entry.cls} site(s), allowlist expects ${entry.expected} (stale entry — a site was removed)`,
      });
    }
  }

  // Any (class, file) with hits but no allowlist entry at all.
  for (const [key, actual] of actualByKey) {
    if (coveredKeys.has(key)) continue;
    const [cls, file] = key.split("|") as [PrimitiveClass, string];
    violations.push({
      kind: "unreviewed",
      cls,
      file,
      actual,
      expected: 0,
      detail: `${file}: ${actual} ${cls} site(s), not in security-allowlist.txt at all (unreviewed new site)`,
    });
  }

  // dynamic-eval permits NO allowlist entries — any hit is a violation,
  // regardless of what the allowlist says (design.md C2: "an allowlisted
  // eval is an eval").
  for (const h of hits) {
    if (h.cls !== "dynamic-eval") continue;
    violations.push({
      kind: "dynamic-eval",
      cls: "dynamic-eval",
      file: h.file,
      actual: 1,
      expected: 0,
      detail: `${h.file}:${h.line}: dynamic-eval hit "${h.text}" — this class permits zero allowlist entries`,
    });
  }

  return {
    filesScanned: files.length,
    filesSkippedByPattern,
    hits,
    totalsByClass,
    entries,
    violations,
  };
}

export function report(result: CheckResult): boolean {
  for (const v of result.violations) {
    console.log(`VIOLATION [${v.kind}] ${v.detail}`);
  }
  for (const h of result.hits) {
    console.log(`  hit  [${h.cls}]  ${h.file}:${h.line}  ${h.text}`);
  }

  const ok = result.violations.length === 0;
  // Population always printed — a mutation that resolves to nothing must
  // never read as clean (lesson: a gate that resolves to nothing reads as a
  // gate that catches nothing).
  console.log(
    `\n[security-allowlist] scanned ${result.filesScanned} file(s) under ` +
      `packages/{core,shared}/src, apps/{tools-api,mcp-client,web-ui}/src ` +
      `(${result.filesSkippedByPattern} skipped by pattern: __tests__/, *.test.ts, ` +
      `src/generated/; scripts/ excluded from the population entirely — dev-time ` +
      `gates legitimately shell out)`,
  );
  for (const cls of CLASSES) {
    console.log(`  ${cls}: ${result.totalsByClass[cls]} site(s)`);
  }
  console.log(`[security-allowlist] ${ok ? "PASS" : "FAIL"} — ${result.violations.length} violation(s)`);
  return ok;
}

if (import.meta.main) {
  const result = check();
  process.exit(report(result) ? 0 : 1);
}
