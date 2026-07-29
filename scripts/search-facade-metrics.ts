#!/usr/bin/env bun
/**
 * search-facade-metrics — fan-in and fan-out for a module or a directory.
 *
 * fan-in   how many files import the target
 * fan-out  how many distinct modules the target imports
 *
 * Both over `git ls-files`, never over an ad-hoc shell grep. `grep` in this
 * environment is a shell function dispatching to ugrep with --ignore-files, so
 * it honours .gitignore and skips dist/, while a raw grep does not. The same
 * pattern gives different answers through the two paths, and a count taken with
 * one compared against a figure taken with the other is a phantom regression.
 *
 * Two counting rules, each learned from a wrong number:
 *
 * 1. MATCHING IS WHOLE-FILE, NOT LINE-ORIENTED. A dynamic import wraps:
 *
 *        const { ContextualSearchRLM } = await import(
 *          "../services/search/contextual-search-rlm.js"
 *        );
 *
 *    A line-oriented scan sees `import(` on one line and the specifier on the
 *    next and matches neither. Both of this repo's dynamic importers of the
 *    search facade are written that way, so a line-oriented tool reports
 *    fan-in 24 when it is 26 — under-reporting by two while looking right.
 *
 * 2. MENTIONING IS NOT IMPORTING. A plain string search for the module name
 *    returns 41 files where 26 import it; the other 15 are comments, fixture
 *    paths and `mock.module()` targets. `mock.module` is deliberately excluded:
 *    it replaces a module, it does not depend on one.
 *
 * Comments are stripped before matching; string literals are not. Stripping
 * literals pairs quotes across unrelated apostrophes and deletes real code.
 *
 * KNOWN LIMITATION, guarded rather than fixed: this cannot see through a
 * template literal, so a *verbatim* import pasted into one is counted as a
 * real import. That is not a heuristic gap — the fixture is the real thing,
 * quoted, and nothing short of a tokenizer tells them apart. Stripping
 * backtick-delimited spans instead is the same defect rotated: 67 tracked
 * files put a backtick inside a quoted literal and 47 carry an odd backtick
 * count once comments are gone, so the strip would mis-pair and delete real
 * code on exactly the corpus it is meant to measure. This file's own test
 * suite is the one place in the repo that pastes such a fixture; it holds a
 * regression test asserting it is not counted as an importer.
 *
 * Usage:
 *   bun scripts/search-facade-metrics.ts <file>          # fan-in + fan-out
 *   bun scripts/search-facade-metrics.ts --dir <dir>     # importers of a directory
 *   [--json]
 *
 * Exit codes: 0 always (this reports, it does not gate), 2 usage error.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

/** Every tracked file git knows about, so the count cannot depend on .gitignore. */
export function trackedFiles(exts = [".ts", ".tsx", ".js", ".mjs", ".cjs"]): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => f && exts.some((e) => f.endsWith(e)));
}

/** Block and line comments only. String literals stay — see the header. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export interface ImportRefs {
  static: string[];
  dynamic: string[];
  mocked: string[];
}

/**
 * Every module specifier `source` references, split by mechanism.
 *
 * `[\s\S]*?` rather than `.*?` throughout: these constructs wrap across lines
 * in real code and a dot does not match a newline.
 */
export function importSpecifiers(source: string): ImportRefs {
  const src = stripComments(source);
  const grab = (re: RegExp): string[] => [...src.matchAll(re)].map((m) => m[1]);
  return {
    static: [
      // import … from "s" | export … from "s". The gap before `from` may span
      // lines (a braced specifier list usually does) but may not cross a `;` or
      // a quote — otherwise the match runs on from an unrelated `export` line
      // and grabs the first string literal it meets. That is not theoretical:
      // it read `Pick<SessionRegistry, "getAsync">` as a module and reported
      // this facade's fan-out as 20 where it is 19.
      ...grab(/(?:^|\n)\s*(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']/g),
      // bare side-effect import: import "s";
      ...grab(/(?:^|\n)\s*import\s+["']([^"']+)["']/g),
    ],
    // await import( "s" ) — the specifier is frequently on its own line
    dynamic: grab(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    // mock.module("s") replaces a module; it does not depend on one
    mocked: grab(/\bmock\.module\(\s*["']([^"']+)["']/g),
  };
}

/** Does `spec` resolve to `target`? Compares basenames, extension-insensitive. */
export function specifierMatches(spec: string, target: string): boolean {
  const norm = (s: string): string => basename(s).replace(/\.(ts|tsx|js|mjs|cjs)$/, "");
  return norm(spec) === norm(target);
}

export interface FanReading {
  target: string;
  fanInStatic: string[];
  fanInDynamic: string[];
  mentionsOnly: string[];
  fanOut: string[];
}

export function measure(target: string, files = trackedFiles()): FanReading {
  const fanInStatic: string[] = [];
  const fanInDynamic: string[] = [];
  const mentionsOnly: string[] = [];
  const stem = basename(target).replace(/\.(ts|tsx|js|mjs|cjs)$/, "");

  for (const file of files) {
    if (file === target) continue;
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!raw.includes(stem)) continue;
    const refs = importSpecifiers(raw);
    const hasStatic = refs.static.some((s) => specifierMatches(s, target));
    const hasDynamic = refs.dynamic.some((s) => specifierMatches(s, target));
    if (hasStatic) fanInStatic.push(file);
    else if (hasDynamic) fanInDynamic.push(file);
    else mentionsOnly.push(file);
  }

  const own = importSpecifiers(readFileSync(target, "utf8"));
  return {
    target,
    fanInStatic: fanInStatic.sort(),
    fanInDynamic: fanInDynamic.sort(),
    mentionsOnly: mentionsOnly.sort(),
    fanOut: [...new Set([...own.static, ...own.dynamic])].sort(),
  };
}

export interface DirectoryReading {
  dir: string;
  members: string[];
  /** Importers of a named file inside the directory. */
  deep: string[];
  /** Importers of the directory itself — a barrel reference like `../controllers`. */
  barrel: string[];
  /** Reached only via `import(...)`; invisible to a static-import regex. */
  dynamic: string[];
}

/**
 * Who depends on a directory — the PR-C sizing question (§5.1).
 *
 * Reported in three separate buckets rather than one total, because the total
 * is exactly what is disputed: `spec.md` says the controllers retirement
 * "touches 3-4 files", the design says ~30, and a plain relative-import regex
 * says 22. The disagreement is entirely about whether barrel references and
 * dynamic sites count. Emitting the buckets lets a reader pick a definition and
 * see what it costs, instead of arguing about a single number whose method is
 * unstated.
 */
/**
 * Does `specifier` reference `leaf` itself — a barrel import like
 * `../controllers` or `../controllers/index` — rather than a file inside it?
 *
 * `leaf` reaches here as the basename of `--dir` on the command line
 * (`measureDirectory`, below), so this is plain string comparison rather than
 * a constructed `RegExp`: a directory named `a+b` must be matched literally,
 * not interpreted as "one or more `a` then `b`".
 */
export function isBarrelSpecifier(specifier: string, leaf: string): boolean {
  const stripped = specifier.replace(/\.(ts|js)$/, "");
  return (
    stripped === leaf ||
    stripped.endsWith(`/${leaf}`) ||
    stripped === `${leaf}/index` ||
    stripped.endsWith(`/${leaf}/index`)
  );
}

export function measureDirectory(dir: string, files = trackedFiles()): DirectoryReading {
  const clean = dir.replace(/\/$/, "");
  const leaf = basename(clean);
  const members = files.filter((f) => f.startsWith(clean + "/"));
  const stems = new Set(members.map((f) => basename(f).replace(/\.(ts|tsx|js|mjs|cjs)$/, "")));
  const isBarrel = (s: string): boolean => isBarrelSpecifier(s, leaf);

  const deep: string[] = [];
  const barrel: string[] = [];
  const dynamic: string[] = [];
  for (const f of files) {
    if (f.startsWith(clean + "/")) continue;
    let raw: string;
    try {
      raw = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (!raw.includes(leaf)) continue;
    const refs = importSpecifiers(raw);
    const hits = (list: string[]): boolean =>
      list.some((s) => s.includes(`/${leaf}/`) || s.startsWith(`${leaf}/`) || isBarrel(s) || stems.has(basename(s).replace(/\.(ts|tsx|js|mjs|cjs)$/, "")));
    if (refs.static.some((s) => (s.includes(`/${leaf}/`) || s.startsWith(`${leaf}/`)) && !isBarrel(s))) deep.push(f);
    else if (refs.static.some(isBarrel)) barrel.push(f);
    else if (hits(refs.dynamic)) dynamic.push(f);
  }
  return { dir: clean, members: members.sort(), deep: deep.sort(), barrel: barrel.sort(), dynamic: dynamic.sort() };
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const di = argv.indexOf("--dir");
  if (di >= 0) {
    const dir = argv[di + 1];
    if (!dir) {
      console.error("usage: bun scripts/search-facade-metrics.ts --dir <dir> [--json]");
      return 2;
    }
    const r = measureDirectory(dir);
    if (json) console.log(JSON.stringify(r, null, 2));
    else {
      const total = r.deep.length + r.barrel.length + r.dynamic.length;
      console.log(`${r.dir} — ${r.members.length} member files\n`);
      console.log(`deep     ${r.deep.length}\tdirect import of a file inside the directory`);
      console.log(`barrel   ${r.barrel.length}\timport of the directory itself`);
      console.log(`dynamic  ${r.dynamic.length}\treached only via import(...)`);
      console.log(`\ntotal outside importers: ${total} (deep-only reading: ${r.deep.length})`);
      for (const [label, list] of [["barrel", r.barrel], ["dynamic", r.dynamic]] as const) {
        if (list.length) {
          console.log(`\n${label}:`);
          for (const f of list) console.log(`  ${f}`);
        }
      }
    }
    return 0;
  }

  const target = argv.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("usage: bun scripts/search-facade-metrics.ts <file> [--json] | --dir <dir>");
    return 2;
  }
  const r = measure(target);
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    return 0;
  }
  const total = r.fanInStatic.length + r.fanInDynamic.length;
  console.log(`${r.target}\n`);
  console.log(`fan-in   ${r.fanInStatic.length} static · ${total} including dynamic`);
  console.log(`fan-out  ${r.fanOut.length} distinct specifiers`);
  console.log(`\nmentions but does not import: ${r.mentionsOnly.length} (comments, fixture paths, mock.module targets)`);
  if (r.fanInDynamic.length) {
    console.log(`\ndynamic importers:`);
    for (const f of r.fanInDynamic) console.log(`  ${f}`);
  }
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
