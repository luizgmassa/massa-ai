#!/usr/bin/env bun
/**
 * validate_spec.ts - deterministic closure-gate checks for a feature spec.md.
 *
 * Turns the Requirement Closure Gate (Specify phase) into a checkable pass/fail
 * run BEFORE a spec is presented for confirmation, instead of trusting the model
 * to remember the checks. Bun builtins only, zero dependencies. Operates only
 * on the spec.md markdown artifact - never on the target codebase - so it stays
 * stack-agnostic and tool-agnostic.
 *
 * What it checks (heuristic markdown inspection, not a full parser):
 *   ERROR  - a required section is missing
 *   ERROR  - an acceptance criterion has no SHALL (not testable / not EARS-shaped)
 *   ERROR  - an Assumptions row has an empty "Chosen default" or "Rationale" cell
 *   ERROR  - a Requirement Traceability row has a malformed ID
 *   WARN   - an AC has SHALL but no recognizable EARS lead keyword
 *   WARN   - template placeholder rows are still present (spec not filled in)
 *   WARN   - open questions are not explicitly resolved
 *
 * Usage:
 *   bun skills/massa-ai/scripts/validate_spec.ts [target] [--root DIR] [--strict]
 *
 *   Invoke with the repo-root-relative script path shown above (matches
 *   lessons.ts's convention), not a project-local copy.
 *   target    Path to a spec.md, a feature directory, or a project root.
 *             Omitted -> auto-detect the single feature under <root>/.specs/features/.
 *   --root    Project root that contains .specs/ (default: current dir).
 *   --strict  Treat warnings as errors.
 *
 * Exit codes: 0 pass, 1 errors found (or warnings under --strict), 2 usage error.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const REQUIRED_SECTIONS = [
  "Problem Statement",
  "Out of Scope",
  "Assumptions & Open Questions",
  "User Stories",
  "Requirement Traceability",
];

const ID_RE = /^[A-Z][A-Z0-9]*-\d+$/;
const PLACEHOLDER_RE = /^\s*\[.+\]\s*$/;
// Defined for parity with the Python source (STATUS_VALUES); unused there too.
const STATUS_VALUES = new Set(["pending", "in design", "in tasks", "implementing", "verified"]);
void STATUS_VALUES;

/**
 * Mirrors Python's os.path.join(): unlike node:path's join(), it does NOT
 * normalize away a leading "." segment (os.path.join(".", "a") === "./a",
 * node's join(".", "a") === "a") - divergence risk since this script's
 * default --root "." is never abspath()'d, so a joined path can be printed
 * or matched literally with the leading "./" intact.
 */
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

/** Mirrors Python's str.splitlines(): universal newline split, no trailing empty element. */
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
  if (start < text.length) {
    result.push(text.slice(start));
  }
  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function autodetect(root: string): string | null {
  const base = pyJoin(root, ".specs", "features");
  if (!isDir(base)) return null;
  const features = readdirSync(base)
    .filter((d) => isFile(pyJoin(base, d, "spec.md")))
    .sort();
  if (features.length === 1) return pyJoin(base, features[0]!, "spec.md");
  if (features.length === 0) return null;
  // Ambiguous: signal the caller with the list (mirrors Python's
  // `raise SystemExit(str)`, which prints the string to stderr and exits 1).
  const joined = features.map((f) => pyJoin(base, f, "spec.md")).join("\n  ");
  console.error(`validate_spec: multiple features found; pass one explicitly:\n  ${joined}`);
  process.exit(1);
}

/** Return the path to a spec.md from a file, dir, or auto-detect. */
function resolveSpec(target: string | null, root: string): string | null {
  if (target) {
    if (isFile(target)) return target;
    if (isDir(target)) {
      const cand = pyJoin(target, "spec.md");
      if (isFile(cand)) return cand;
      // maybe it's a project root
      return autodetect(target);
    }
    // Not a path: treat as a feature name under <root>/.specs/features/<name>/
    const cand = pyJoin(root, ".specs", "features", target, "spec.md");
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

/** Return [start, end) line indices for a `## name` section body. */
function sectionBounds(lines: string[], name: string): [number, number] | null {
  const headingRe = new RegExp(`^#{1,3}\\s+${escapeRegExp(name)}\\s*$`);
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

const EARS_PATTERN: Record<string, string> = {
  WHILE: "state-driven",
  WHEN: "event-driven",
  "IF/THEN": "unwanted-behavior",
  WHERE: "optional-feature",
};

/** Return [ok, note]. ok requires a SHALL; note records the EARS pattern. */
function classifyEars(text: string): [boolean, string] {
  const t = text.trim();
  const low = t.toLowerCase();
  const hasShall = /\bshall\b/.test(low);
  if (!hasShall) {
    return [false, "no SHALL"];
  }
  const kws: string[] = [];
  if (/\bwhile\b/.test(low)) kws.push("WHILE");
  if (/\bwhen\b/.test(low)) kws.push("WHEN");
  if (/^\s*if\b/.test(low) || /\bif\b.*\bthen\b/.test(low)) kws.push("IF/THEN");
  if (/\bwhere\b/.test(low)) kws.push("WHERE");
  if (kws.length >= 2) {
    return [true, `complex (${kws.join("+")})`];
  }
  if (kws.length) {
    return [true, EARS_PATTERN[kws[0]!]!];
  }
  if (/^\s*the\b/.test(low)) {
    return [true, "ubiquitous"];
  }
  return [true, "warn: SHALL present but no EARS lead keyword"];
}

function check(specPath: string): { errors: string[]; warnings: string[] } {
  const text = readFileSync(specPath, "utf-8");
  const lines = splitLines(text);
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Required sections.
  for (const name of REQUIRED_SECTIONS) {
    if (sectionBounds(lines, name) === null) {
      errors.push(`missing required section: ## ${name}`);
    }
  }

  // 2. Acceptance criteria are EARS-shaped (have a SHALL).
  //
  // massa-ai patch (beyond D1): upstream terminated the AC scan on the FIRST
  // blank line after the "**Acceptance Criteria**:" header, before any item
  // was ever read - massa-ai's (and TLC's own) template puts a blank line
  // between the header and the numbered list, so the SHALL check was a
  // silent no-op against every realistically-formatted spec. Track whether
  // an item has been seen and only let a blank line end the block once it
  // has, so leading blank lines are skipped instead of ending the scan.
  let inAc = false;
  let seenItem = false;
  const acHeaderRe = /^\*{0,2}Acceptance Criteria\*{0,2}\s*:?\s*$/;
  const acItemRe = /^\s*\d+\.\s+(.*)$/;
  const headingRe = /^#{1,3}\s/;
  for (let idx = 0; idx < lines.length; idx++) {
    const i = idx + 1;
    const ln = lines[idx]!;
    const stripped = ln.trim();
    if (acHeaderRe.test(stripped)) {
      inAc = true;
      seenItem = false;
      continue;
    }
    if (inAc) {
      const m = acItemRe.exec(ln);
      if (m) {
        seenItem = true;
        const item = m[1]!.trim();
        if (PLACEHOLDER_RE.test(item)) {
          continue; // untouched template row
        }
        const [ok, note] = classifyEars(item);
        if (!ok) {
          errors.push(`L${i}: acceptance criterion has no SHALL (not testable): ${item.slice(0, 70)}`);
        } else if (note.startsWith("warn")) {
          warnings.push(
            `L${i}: AC has SHALL but no EARS keyword (WHEN/WHILE/WHERE/IF or ubiquitous 'The … shall'): ${item.slice(0, 60)}`,
          );
        }
      } else if (headingRe.test(ln) || stripped.startsWith("**") || (stripped === "" && seenItem)) {
        inAc = false;
      }
    }
  }

  // 3. Assumptions table cells filled.
  const assumptionsBounds = sectionBounds(lines, "Assumptions & Open Questions");
  if (assumptionsBounds) {
    const [bs, be] = assumptionsBounds;
    const rows: string[] = [];
    for (let i = bs; i < be; i++) {
      if (lines[i]!.trim().startsWith("|")) rows.push(lines[i]!);
    }
    let data = rows.filter((r) => !isSeparator(r));
    // drop the header row (first table row)
    if (data.length) data = data.slice(1);
    let templateSeen = false;
    for (const r of data) {
      const cells = splitRow(r);
      if (cells.length < 3) continue;
      const assumption = cells[0]!;
      const chosen = cells[1]!;
      const rationale = cells[2]!;
      if (PLACEHOLDER_RE.test(assumption) && PLACEHOLDER_RE.test(chosen)) {
        templateSeen = true;
        continue;
      }
      if (!chosen || PLACEHOLDER_RE.test(chosen)) {
        errors.push(`assumption '${assumption.slice(0, 40)}' has empty 'Chosen default'`);
      }
      if (!rationale || PLACEHOLDER_RE.test(rationale)) {
        errors.push(`assumption '${assumption.slice(0, 40)}' has empty 'Rationale'`);
      }
    }
    if (templateSeen) {
      warnings.push("Assumptions table still contains template placeholder rows");
    }
    // open questions line
    const oq: string[] = [];
    for (let i = bs; i < be; i++) {
      if (lines[i]!.toLowerCase().includes("open questions")) oq.push(lines[i]!);
    }
    const oqClean = oq
      .join(" ")
      .replace(/[*_]/g, "")
      .toLowerCase();
    if (!oq.length) {
      warnings.push("no 'Open questions:' line in Assumptions section");
    } else if (!/open questions.*:\s*none/.test(oqClean)) {
      warnings.push("open questions do not read as resolved ('Open questions: none')");
    }
  }

  // 4. Requirement traceability IDs.
  const traceabilityBounds = sectionBounds(lines, "Requirement Traceability");
  if (traceabilityBounds) {
    const [bs, be] = traceabilityBounds;
    const rows: string[] = [];
    for (let i = bs; i < be; i++) {
      if (lines[i]!.trim().startsWith("|")) rows.push(lines[i]!);
    }
    let data = rows.filter((r) => !isSeparator(r));
    if (data.length) data = data.slice(1);
    let templateSeen = false;
    let realIds = 0;
    for (const r of data) {
      const cells = splitRow(r);
      if (!cells.length) continue;
      const rid = cells[0]!;
      if (PLACEHOLDER_RE.test(rid) || rid.includes("[")) {
        templateSeen = true;
        continue;
      }
      if (!rid) continue;
      if (!ID_RE.test(rid)) {
        errors.push(`malformed requirement ID: '${rid}' (expected e.g. AUTH-01)`);
      } else {
        realIds++;
      }
    }
    if (templateSeen && realIds === 0) {
      warnings.push("Requirement Traceability has only template rows (no real IDs yet)");
    }
  }

  return { errors, warnings };
}

const USAGE = "usage: validate_spec.ts [-h] [--root ROOT] [--strict] [target]";
const HELP = `${USAGE}

Closure-gate checks for a feature spec.md.

positional arguments:
  target       Path to a spec.md, a feature directory, or a project root

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
  process.stderr.write(`${USAGE}\nvalidate_spec.ts: error: ${msg}\n`);
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

  const spec = resolveSpec(args.target, args.root);
  if (!spec) {
    console.error("validate_spec: could not locate a spec.md. Pass a path or run from the project root.");
    return 2;
  }

  const { errors, warnings } = check(spec);
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  const fail = errors.length > 0 || (warnings.length > 0 && args.strict);
  console.log(`\nvalidate_spec: ${errors.length} error(s), ${warnings.length} warning(s) in ${spec}`);
  return fail ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
