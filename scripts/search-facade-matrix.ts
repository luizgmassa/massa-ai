#!/usr/bin/env bun
/**
 * search-facade-matrix — which delegate reads which facade member.
 *
 * A god class that has been "split" into delegates taking the class back as
 * their first parameter has not been split. This builds the member -> consumer
 * matrix that says so numerically: for every exported function in a directory,
 * the parameter annotated with the facade type, and every `<param>.<member>`
 * read in its body.
 *
 * Measured on `packages/core/src/services/search` at ce26f28:
 *
 *     21 exported functions - 15 take the facade - 6 already do not
 *     searchImpl                 13 members   <- the actual god function
 *     fuseResultsImpl             1 member    (RRF_K, a constant)
 *     buildGraphStreamImpl        0 members   (124 lines, reads nothing)
 *
 * Function bodies are bounded by the next line equal to `}`, NOT by
 * brace-matching. This is the single most important line in the file. A
 * brace-matching first draft counted `options: SearchOptions = {}` in the
 * parameter list as an open/close pair at depth 0, terminated the body before
 * it began, and reported searchImpl as 5 lines with 0 members instead of 455
 * with 13 — inverting the finding the whole design rests on.
 *
 * Comments are stripped; string literals are NOT. Quote-pairing across a real
 * file joins two unrelated apostrophes and deletes every line between them.
 *
 * Usage:
 *   bun scripts/search-facade-matrix.ts <dir> [--type Name] [--json]
 *
 * Exit codes: 0 always (this reports, it does not gate), 2 usage error.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The facade type whose members are counted, when none is given. */
export const DEFAULT_FACADE = "ContextualSearchRLM";

/**
 * Remove text that must not contribute member matches.
 *
 * Block comments, line comments and module specifiers only. String literals
 * stay: stripping them cost 11 real members on the pre-M14 facade, because a
 * `'` inside one comment paired with a `'` 137 lines away in another.
 */
export function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*(?:import|export)[^;]*?from\s*["'][^"']*["'];?/gm, "");
}

export interface FunctionReading {
  name: string;
  file: string;
  loc: number;
  facadeParam: string | null;
  members: string[];
}

const DECL = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/gm;

/**
 * Split `src` into its exported functions, with parameter list and body text.
 *
 * The body runs from its opening brace to the next line that is exactly `}`.
 * A parameter default containing braces therefore cannot truncate it.
 */
export function findFunctions(src: string): Array<{ name: string; params: string; body: string; loc: number }> {
  const out: Array<{ name: string; params: string; body: string; loc: number }> = [];
  for (const m of src.matchAll(DECL)) {
    const paramStart = m.index + m[0].length;
    let depth = 1;
    let i = paramStart;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    if (depth !== 0) continue;
    const params = src.slice(paramStart, i - 1);

    const bodyOpen = src.indexOf("{", i - 1);
    if (bodyOpen === -1) continue;
    // The body ends at the next line consisting solely of `}` — never by
    // counting braces, which a `= {}` parameter default would corrupt.
    const bodyEnd = src.slice(bodyOpen).search(/\n\}[ \t]*(?:\r?\n|$)/);
    const end = bodyEnd === -1 ? src.length : bodyOpen + bodyEnd + 2;
    const body = src.slice(bodyOpen + 1, end - 2);
    out.push({
      name: m[1],
      params,
      body,
      loc: src.slice(m.index, end).split("\n").length,
    });
  }
  return out;
}

/**
 * Escape regex metacharacters so `s` can be interpolated into a `RegExp` and
 * still match only itself, literally.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The parameter in `params` annotated with `type`, or null.
 *
 * `type` reaches here from `--type` on the command line (`main`, below), so it
 * is escaped before being interpolated: an unescaped value lets a caller
 * change what the pattern matches rather than what it searches for — `a+b`,
 * for instance, would stop meaning the literal type name and start meaning
 * "one or more `a` then `b`".
 */
export function facadeParamOf(params: string, type: string): string | null {
  const m = new RegExp(`([A-Za-z0-9_]+)\\s*:\\s*${escapeRegExp(type)}\\b`).exec(params);
  return m ? m[1] : null;
}

/** Distinct member names read off `param` in `body`, sorted. */
export function membersRead(body: string, param: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(new RegExp(`\\b${param}\\.([A-Za-z_][A-Za-z0-9_]*)`, "g"))) {
    found.add(m[1]);
  }
  return [...found].sort();
}

export function measureSource(file: string, raw: string, type: string): FunctionReading[] {
  const src = stripNonCode(raw);
  return findFunctions(src).map((fn) => {
    const param = facadeParamOf(fn.params, type);
    return {
      name: fn.name,
      file,
      loc: fn.loc,
      facadeParam: param,
      members: param ? membersRead(fn.body, param) : [],
    };
  });
}

export function scan(dir: string, type: string): FunctionReading[] {
  const out: FunctionReading[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
    if (!statSync(join(dir, name)).isFile()) continue;
    out.push(...measureSource(name, readFileSync(join(dir, name), "utf8"), type));
  }
  return out.sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
}

/**
 * The delegate scope: every function in a file that declares at least one
 * facade-taking function.
 *
 * Derived, never hardcoded. Naming the five `rlm-*` files would make this tool
 * die at the rename it exists to justify — and the derivation is also the
 * measurement that matters: when the split is done, no file qualifies and the
 * scope is empty.
 */
export function delegateScope(readings: FunctionReading[]): FunctionReading[] {
  const files = new Set(readings.filter((r) => r.facadeParam !== null).map((r) => r.file));
  return readings.filter((r) => files.has(r.file));
}

function main(argv: string[]): number {
  const dir = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--type");
  if (!dir) {
    console.error("usage: bun scripts/search-facade-matrix.ts <dir> [--type Name] [--json]");
    return 2;
  }
  const ti = argv.indexOf("--type");
  const type = ti >= 0 && argv[ti + 1] ? argv[ti + 1] : DEFAULT_FACADE;

  const all = scan(dir, type);
  const readings = argv.includes("--all") ? all : delegateScope(all);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ delegateScope: delegateScope(all), all }, null, 2));
    return 0;
  }

  const withFacade = readings.filter((r) => r.facadeParam !== null);
  const distinct = new Set(readings.flatMap((r) => r.members));

  console.log(`### Consumer -> members (${type} in ${dir})\n`);
  console.log(
    `Delegate scope: ${new Set(readings.map((r) => r.file)).size} of ${new Set(all.map((r) => r.file)).size} ` +
      `files declare a facade-taking function. \`--all\` widens to the whole directory.\n`,
  );
  console.log("| fn | file | LOC | facade param | members touched | n |");
  console.log("|---|---|---|---|---|---|");
  for (const r of readings) {
    console.log(
      `| \`${r.name}\` | ${r.file} | ${r.loc} | ${r.facadeParam ? "yes" : "**no**"} | ${r.members.join(", ") || "—"} | ${r.members.length} |`,
    );
  }
  console.log(
    `\n${readings.length} exported functions · ${withFacade.length} take the facade · ` +
      `${readings.length - withFacade.length} already do not · ` +
      `${readings.reduce((s, r) => s + r.loc, 0)} LOC covered · ${distinct.size} distinct members`,
  );

  const byMember = new Map<string, string[]>();
  for (const r of readings) {
    for (const m of r.members) byMember.set(m, [...(byMember.get(m) ?? []), r.name].sort());
  }
  console.log("\n### Member -> consumers\n");
  console.log("| member | consumers | n |");
  console.log("|---|---|---|");
  for (const [m, cs] of [...byMember].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    console.log(`| \`${m}\` | ${cs.join(", ")} | ${cs.length} |`);
  }
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
