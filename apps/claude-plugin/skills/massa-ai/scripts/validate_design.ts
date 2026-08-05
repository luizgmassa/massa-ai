#!/usr/bin/env bun
/**
 * validate_design.ts - deterministic closure-gate checks for a feature
 * design.md (STO-9 top validator pack).
 *
 * Turns the spec-driven Design phase's "required sections + every flagged
 * concern has a mitigation" rule into a checkable pass/fail run, instead of
 * trusting the model to remember it. Same heuristic-markdown-inspection
 * style as validate_spec.ts: Bun builtins only, zero dependencies, operates
 * only on the design.md artifact.
 *
 * What it checks:
 *   ERROR  - a required section is missing (Design Summary, Risks & Concerns,
 *            Tech Decisions - heading-prefix match, case-insensitive)
 *   ERROR  - a Risks & Concerns table row has an empty/placeholder Mitigation
 *            cell (a bare "> None found" section with zero rows is valid -
 *            it is a real, empty risk register, not an unfilled one)
 *   WARN   - Risks & Concerns has no table rows and no "None found" marker
 *            (ambiguous: unfilled template vs. genuinely empty)
 *
 * Usage:
 *   bun skills/massa-ai/scripts/validate_design.ts [target] [--root DIR] [--strict]
 *
 *   target    Path to a design.md, a feature directory, or a project root.
 *             Omitted -> auto-detect the single feature under <root>/.specs/features/.
 *   --root    Project root that contains .specs/ (default: current dir).
 *   --strict  Treat warnings as errors.
 *
 * Exit codes: 0 pass, 1 errors found (or warnings under --strict), 2 usage error.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const REQUIRED_SECTIONS = ["Design Summary", "Risks & Concerns", "Tech Decisions"];
const PLACEHOLDER_RE = /^\s*\[.+\]\s*$|^\s*<.+>\s*$|^\s*-?\s*$/;

/** Mirrors os.path.join()'s "./" preservation — see validate_spec.ts for why. */
function pyJoin(...parts: string[]): string {
  let result = parts[0] ?? "";
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.startsWith("/")) {
      result = part;
    } else if (result === "" || result.endsWith("/")) {
      result += part;
    } else {
      result += `/${part}`;
    }
  }
  return result;
}

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  const result: string[] = [];
  const lineBreakRe = /\r\n|\r|\n/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = lineBreakRe.exec(text)) !== null) {
    result.push(text.slice(start, match.index));
    start = match.index + match[0].length;
  }
  if (start < text.length) result.push(text.slice(start));
  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function autodetect(root: string): string | null {
  const base = pyJoin(root, ".specs", "features");
  if (!isDir(base)) return null;
  const features = readdirSync(base)
    .filter((d) => isFile(pyJoin(base, d, "design.md")))
    .sort();
  if (features.length === 1) return pyJoin(base, features[0]!, "design.md");
  if (features.length === 0) return null;
  const joined = features.map((f) => pyJoin(base, f, "design.md")).join("\n  ");
  console.error(`validate_design: multiple features found; pass one explicitly:\n  ${joined}`);
  process.exit(1);
}

function resolveDesign(target: string | null, root: string): string | null {
  if (target) {
    if (isFile(target)) return target;
    if (isDir(target)) {
      const cand = pyJoin(target, "design.md");
      if (isFile(cand)) return cand;
      return autodetect(target);
    }
    const cand = pyJoin(root, ".specs", "features", target, "design.md");
    if (isFile(cand)) return cand;
    return null;
  }
  return autodetect(root);
}

function splitRow(line: string): string[] {
  const stripped = line.trim().replace(/^\|+/, "").replace(/\|+$/, "");
  return stripped.split("|").map((c) => c.trim());
}

function isSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

/** Return [start, end) for the FIRST `#{1,3} <namePrefix>...` heading (prefix match, case-insensitive). */
function sectionBoundsPrefix(lines: string[], namePrefix: string): [number, number] | null {
  const headingRe = new RegExp(`^#{1,3}\\s+${escapeRegExp(namePrefix)}\\b`, "i");
  let start: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i]!.trim())) {
      start = i + 1;
      break;
    }
  }
  if (start === null) return null;
  let end = lines.length;
  const nextHeadingRe = /^#{1,3}\s+\S/;
  for (let j = start; j < lines.length; j++) {
    if (nextHeadingRe.test(lines[j]!)) {
      end = j;
      break;
    }
  }
  return [start, end];
}

function check(designPath: string): { errors: string[]; warnings: string[] } {
  const text = readFileSync(designPath, "utf-8");
  const lines = splitLines(text);
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Required sections.
  const bounds = new Map<string, [number, number] | null>();
  for (const name of REQUIRED_SECTIONS) {
    const b = sectionBoundsPrefix(lines, name);
    bounds.set(name, b);
    if (b === null) {
      errors.push(`missing required section: ## ${name}`);
    }
  }

  // 2. Risks & Concerns: every table row needs a non-empty, non-placeholder
  //    Mitigation cell. A bare "None found" marker with zero rows is valid.
  const risksBounds = bounds.get("Risks & Concerns");
  if (risksBounds) {
    const [bs, be] = risksBounds;
    const rows: string[] = [];
    for (let i = bs; i < be; i++) {
      if (lines[i]!.trim().startsWith("|")) rows.push(lines[i]!);
    }
    const bodyText = lines.slice(bs, be).join("\n").toLowerCase();
    let data = rows.filter((r) => !isSeparator(r));
    if (data.length) {
      const headerCells = splitRow(data[0]!).map((c) => c.toLowerCase());
      const mitigationIdx = headerCells.findIndex((c) => c.includes("mitigation"));
      data = data.slice(1); // drop header row
      for (const r of data) {
        const cells = splitRow(r);
        const idx = mitigationIdx >= 0 ? mitigationIdx : cells.length - 1;
        const mitigation = cells[idx] ?? "";
        const concern = cells[0] ?? "(unknown concern)";
        if (!mitigation || PLACEHOLDER_RE.test(mitigation)) {
          errors.push(`Risks & Concerns row '${concern.slice(0, 50)}' has an empty or unfilled Mitigation cell`);
        }
      }
    } else if (!bodyText.includes("none found")) {
      warnings.push("Risks & Concerns has no table rows and no 'None found' marker (ambiguous — confirm intentional)");
    }
  }

  return { errors, warnings };
}

const USAGE = "usage: validate_design.ts [-h] [--root ROOT] [--strict] [target]";
const HELP = `${USAGE}

Closure-gate checks for a feature design.md.

positional arguments:
  target       Path to a design.md, a feature directory, or a project root

options:
  -h, --help   show this help message and exit
  --root ROOT
  --strict`;

interface Args {
  target: string | null;
  root: string;
  strict: boolean;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nvalidate_design.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  let root = ".";
  let strict = false;
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--root") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --root: expected one argument");
        return null;
      }
      root = argv[++i]!;
    } else if (a.startsWith("--root=")) {
      root = a.slice("--root=".length);
    } else if (a === "--strict") {
      strict = true;
    } else if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (a.startsWith("-") && a !== "-") {
      printUsageError(`unrecognized arguments: ${a}`);
      return null;
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length > 1) {
    printUsageError(`unrecognized arguments: ${positionals.slice(1).join(" ")}`);
    return null;
  }
  return { target: positionals[0] ?? null, root, strict };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;

  const design = resolveDesign(args.target, args.root);
  if (!design) {
    console.error("validate_design: could not locate a design.md. Pass a path or run from the project root.");
    return 2;
  }

  const { errors, warnings } = check(design);
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  const fail = errors.length > 0 || (warnings.length > 0 && args.strict);
  console.log(`\nvalidate_design: ${errors.length} error(s), ${warnings.length} warning(s) in ${design}`);
  return fail ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}

export { check };
