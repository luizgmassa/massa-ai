#!/usr/bin/env bun
/**
 * search-hub-metric — detect hub types in a directory.
 *
 * A "hub" is a type whose members are read from many other modules in the same
 * directory. Splitting a god class into delegates that each take the class back
 * as a parameter moves code without removing the hub: file sizes fall while
 * coupling is unchanged or worse. Lines-per-file cannot see that. This can.
 *
 * Calibrated against M14 (`c92e481`), which decomposed ContextualSearchRLM
 * behind a facade. Lines-per-file said the refactor succeeded (1668 -> 463).
 * This metric says it did not:
 *
 *     commit                 host LOC  members  foreignModules  maxForeignReach
 *     c92e481^  pre-M14          1668       26               1                1
 *     c92e481   post-M14          463       24               6               14
 *
 * Member count flat; deepest foreign reach x14. The split redistributed who may
 * reach into the type without reducing what there is to reach.
 *
 * Definitions, for a type T declared in the scanned directory:
 *   members(T)         distinct member names read off a binding of type T,
 *                      via `this.x` inside `class T {}` and via `p.x` where a
 *                      parameter `p` is annotated `: T`
 *   foreignModules(T)  files other than T's declaring file performing such a read
 *   maxForeignReach(T) the most distinct members any single foreign module reads
 *
 * The gate is `maxForeignReach <= MAX_FOREIGN_REACH` for EVERY declared type,
 * plus a per-file line cap. It deliberately takes no type name: an earlier
 * version audited one hardcoded name and was evaded two ways — renaming the
 * class (vacuous 0/0 pass) and moving the same state onto a differently-named
 * aggregate record. Enumerating declarations closes both.
 *
 * Known limit, stated rather than hidden: passing collaborators as N individual
 * parameters instead of one object drives reach to 0 with coupling unchanged.
 * This metric cannot see that. It is necessary, not sufficient.
 *
 * Usage:
 *   bun scripts/search-hub-metric.ts <dir> [--json] [--max-reach N] [--max-loc N]
 *
 * Exit codes: 0 pass, 1 gate violation, 2 usage error.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Default ceiling on how deep one module may reach into another's type. */
export const MAX_FOREIGN_REACH = 3;
/** Default ceiling on lines in any single file in the scanned directory. */
export const MAX_FILE_LOC = 700;

/**
 * Remove text that must not contribute member matches.
 *
 * Strips block comments, line comments, and module specifiers — and nothing
 * else. String literals are deliberately left in place. Quote-pairing across a
 * real file deletes the code between two unrelated apostrophes: on the pre-M14
 * ContextualSearchRLM it silently discarded 11 genuine members (`RRF_K`,
 * `fuseResults`, `indexProject`, …), reporting 15 where the true count is 26.
 * Once comments are gone, no phantom members survive without it.
 */
export function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*(?:import|export)[^;]*?from\s*["'][^"']*["'];?/gm, "");
}

export interface TypeReading {
  type: string;
  declaredIn: string;
  foreignModules: number;
  maxForeignReach: number;
  deepestReader: string | null;
  members: number;
  memberList: string[];
  perModule: Record<string, number>;
}

export interface DirectoryReading {
  dir: string;
  files: number;
  maxFileLoc: number;
  largestFile: string | null;
  types: TypeReading[];
}

const DECLARATION =
  /^\s*export\s+(?:abstract\s+)?(?:class|interface|type)\s+([A-Za-z0-9_]+)/gm;

/** Read every `.ts` file in `dir` (non-recursive) as stripped source. */
export function readSources(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
    if (!statSync(join(dir, name)).isFile()) continue;
    out.set(name, readFileSync(join(dir, name), "utf8"));
  }
  return out;
}

/**
 * Measure every type declared in `sources` against every file in `sources`.
 * `sources` maps file name to RAW (unstripped) content.
 */
export function measure(sources: Map<string, string>): TypeReading[] {
  const stripped = new Map<string, string>();
  for (const [file, raw] of sources) stripped.set(file, stripNonCode(raw));

  const declaredIn = new Map<string, string>();
  for (const [file, src] of stripped) {
    for (const m of src.matchAll(DECLARATION)) {
      if (!declaredIn.has(m[1])) declaredIn.set(m[1], file);
    }
  }

  const readings: TypeReading[] = [];
  for (const [type, owner] of declaredIn) {
    const perModule = new Map<string, Set<string>>();
    const add = (file: string, member: string): void => {
      if (!perModule.has(file)) perModule.set(file, new Set());
      perModule.get(file)!.add(member);
    };

    for (const [file, src] of stripped) {
      // `this.x` inside `class T {}` — the pre-split shape.
      if (file === owner) {
        const cls = new RegExp(
          `(?:^|\\n)\\s*export\\s+(?:abstract\\s+)?class\\s+${type}\\b`,
        ).exec(src);
        if (cls) {
          for (const m of src.slice(cls.index).matchAll(/\bthis\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
            add(file, m[1]);
          }
        }
      }
      // `p.x` where parameter `p` is annotated `: T` — the delegate shape.
      const params = new Set<string>();
      for (const m of src.matchAll(new RegExp(`([A-Za-z0-9_]+)\\s*:\\s*${type}\\b`, "g"))) {
        params.add(m[1]);
      }
      for (const p of params) {
        for (const m of src.matchAll(new RegExp(`\\b${p}\\.([A-Za-z_][A-Za-z0-9_]*)`, "g"))) {
          add(file, m[1]);
        }
      }
    }

    if (perModule.size === 0) continue;
    const foreign = [...perModule].filter(([file]) => file !== owner);
    const deepest = foreign.reduce<[string | null, number]>(
      (best, [file, set]) => (set.size > best[1] ? [file, set.size] : best),
      [null, 0],
    );
    const all = new Set<string>();
    for (const set of perModule.values()) for (const m of set) all.add(m);

    readings.push({
      type,
      declaredIn: owner,
      foreignModules: foreign.length,
      maxForeignReach: deepest[1],
      deepestReader: deepest[0],
      members: all.size,
      memberList: [...all].sort(),
      perModule: Object.fromEntries([...perModule].map(([f, s]) => [f, s.size])),
    });
  }
  return readings.sort((a, b) => b.maxForeignReach - a.maxForeignReach || a.type.localeCompare(b.type));
}

export function scan(dir: string): DirectoryReading {
  const sources = readSources(dir);
  let maxFileLoc = 0;
  let largestFile: string | null = null;
  for (const [file, raw] of sources) {
    const loc = raw.split("\n").length;
    if (loc > maxFileLoc) {
      maxFileLoc = loc;
      largestFile = file;
    }
  }
  return { dir, files: sources.size, maxFileLoc, largestFile, types: measure(sources) };
}

function main(argv: string[]): number {
  const dir = argv.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("usage: bun scripts/search-hub-metric.ts <dir> [--json] [--max-reach N] [--max-loc N]");
    return 2;
  }
  const numArg = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
  };
  const maxReach = numArg("--max-reach", MAX_FOREIGN_REACH);
  const maxLoc = numArg("--max-loc", MAX_FILE_LOC);

  const reading = scan(dir);
  if (argv.includes("--json")) {
    console.log(JSON.stringify(reading, null, 2));
  } else {
    console.log(`${reading.dir} — ${reading.files} files, largest ${reading.largestFile} (${reading.maxFileLoc} LOC)\n`);
    console.log("| type | declared in | foreign modules | maxForeignReach | deepest reader |");
    console.log("|---|---|---|---|---|");
    for (const t of reading.types) {
      console.log(
        `| ${t.type} | ${t.declaredIn} | ${t.foreignModules} | ${t.maxForeignReach} | ${t.deepestReader ?? "—"} |`,
      );
    }
  }

  const overReach = reading.types.filter((t) => t.maxForeignReach > maxReach);
  const overLoc = reading.maxFileLoc > maxLoc;
  if (overReach.length === 0 && !overLoc) {
    console.log(`\n[hub-metric] PASS — every type <= ${maxReach} foreign reach, every file <= ${maxLoc} LOC`);
    return 0;
  }
  for (const t of overReach) {
    console.error(
      `[hub-metric] FAIL — ${t.type} (${t.declaredIn}) is read ${t.maxForeignReach} members deep by ${t.deepestReader} (max ${maxReach})`,
    );
  }
  if (overLoc) {
    console.error(`[hub-metric] FAIL — ${reading.largestFile} is ${reading.maxFileLoc} LOC (max ${maxLoc})`);
  }
  return 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
