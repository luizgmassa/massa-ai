#!/usr/bin/env bun
/**
 * validate_state.ts - deterministic completion gate for a feature.
 *
 * The skill's strongest invariant is "the Verifier is always-on, never prompted;
 * Execute is not done until validation.md reports PASS." That is prose the model
 * must remember. This turns it into a checkable pass/fail the closing step runs
 * automatically, so declaring a feature done without a real Verifier report fails
 * loudly instead of slipping through.
 *
 * It does NOT merely check that validation.md exists - a report that exists but is
 * empty, still holds the template placeholder, or has no evidence would pass a
 * shallow existence check while proving nothing. This gate requires a real,
 * filled verdict plus at least one file:line evidence citation.
 *
 * Operates only on the .specs/ markdown artifacts (stack- and tool-agnostic). Bun
 * builtins only, no new dependencies. Run from the project root (the dir that
 * contains .specs), or pass --root. Meant to be invoked by the skill as the
 * closing gate of Execute, the same way lessons.ts is invoked at distillation -
 * not a manual step.
 *
 * Usage:
 *   bun skills/massa-ai/scripts/validate_state.ts [feature]
 *   bun skills/massa-ai/scripts/validate_state.ts
 *
 *   Invoke with the repo-root-relative script path shown above (matches
 *   lessons.ts's convention), not a project-local copy. Pass --root when cwd is
 *   not the project that contains .specs/.
 *
 * Exit codes: 0 ok, 1 a completed feature is missing a real PASS report,
 *             2 usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// A file:line citation: a path with an extension, then :<line>. e.g. src/a.ts:42
const EVIDENCE_RE = /[\w./-]+\.[A-Za-z0-9]+:\d+/;

const SUMMARY_HEADING_RE = /^#{1,4}\s*summary\b/i;
const NEXT_HEADING_RE = /^#{1,4}\s/;
const RESULT_RE = /\*{0,2}result\*{0,2}\s*:/i;
const VALIDATION_HEADING_RE = /^#{1,4}\s*validation\b/i;
const TASK_HEADING_RE = /^#{2,4}\s+T\d+\s*:/m;
const UNCHECKED_BOX_RE = /^\s*-\s*\[\s\]/m;

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

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function featureDirs(root: string): { base: string; dirs: string[] } {
  const base = join(root, ".specs", "features");
  if (!isDir(base)) {
    return { base, dirs: [] };
  }
  const dirs = readdirSync(base)
    .filter((d) => isDir(join(base, d)))
    .sort();
  return { base, dirs };
}

type Verdict = "pass" | "fail" | "unfilled" | null;

/** Return 'pass', 'fail', 'unfilled', or null from a validation report. */
function verdictOf(text: string): Verdict {
  const lines = splitLines(text);
  // Scope to the '## Summary' section when it carries its own Result line:
  // the Discrimination Sensor's per-mutation `**Result**:` sub-line elsewhere
  // in the report can carry the opposite word (sensor PASS, overall FAIL) and
  // must not collide with the report verdict.
  const summaryLines: string[] = [];
  let inSummary = false;
  for (const ln of lines) {
    const stripped = ln.trim();
    if (SUMMARY_HEADING_RE.test(stripped)) {
      inSummary = true;
      continue;
    }
    if (inSummary && NEXT_HEADING_RE.test(stripped)) {
      break;
    }
    if (inSummary) {
      summaryLines.push(ln);
    }
  }
  const scope = summaryLines.some((ln) => RESULT_RE.test(ln.trim())) ? summaryLines : lines;
  // Look at the '## Validation' heading first, then a '**Result**' line.
  const candidates = scope.filter((ln) => {
    const s = ln.trim();
    return VALIDATION_HEADING_RE.test(s) || RESULT_RE.test(s);
  });
  const hay = candidates.length ? candidates.join(" ") : scope.join("\n");
  const hasPass = /\bPASS\b/.test(hay);
  const hasFail = /\bFAIL\b/.test(hay);
  if (hasPass && hasFail) {
    // Both present on the verdict line = unfilled template "[PASS | FAIL]".
    return "unfilled";
  }
  if (hasPass) return "pass";
  if (hasFail) return "fail";
  return null;
}

/**
 * Conservative completeness heuristic for the cross-check mode.
 *
 * A feature 'appears complete' if it already has a validation.md, or if it has
 * a tasks.md with at least one task and no unchecked '- [ ]' boxes left. When
 * the signal is ambiguous (no tasks.md, Tasks phase skipped), returns false so
 * an in-flight feature is never falsely flagged.
 */
function appearsComplete(fdir: string): boolean {
  if (existsSync(join(fdir, "validation.md"))) {
    return true;
  }
  const tasks = join(fdir, "tasks.md");
  if (!existsSync(tasks)) {
    return false;
  }
  const body = readFileSync(tasks, "utf-8");
  if (!TASK_HEADING_RE.test(body)) {
    return false;
  }
  if (UNCHECKED_BOX_RE.test(body)) {
    return false; // unchecked box remains -> still in progress
  }
  return true;
}

/** Return list of error strings for one feature (empty = pass). */
function checkFeature(fdir: string, name: string): string[] {
  const errors: string[] = [];
  const vpath = join(fdir, "validation.md");
  if (!existsSync(vpath)) {
    errors.push(
      `${name}: no validation.md - Execute is not done until the Verifier writes it (author != verifier). Dispatch validation before marking done.`,
    );
    return errors;
  }
  const text = readFileSync(vpath, "utf-8");
  const verdict = verdictOf(text);
  if (verdict === null) {
    errors.push(`${name}: validation.md has no PASS/FAIL verdict (a prose-only report does not count)`);
  } else if (verdict === "unfilled") {
    errors.push(`${name}: validation.md verdict is still the template placeholder '[PASS | FAIL]' - not filled`);
  } else if (verdict === "fail") {
    errors.push(
      `${name}: validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify (feature is not done)`,
    );
  }
  if (verdict === "pass" && !EVIDENCE_RE.test(text)) {
    errors.push(`${name}: validation.md is PASS but cites no file:line evidence - evidence-or-zero not satisfied`);
  }
  return errors;
}

function resolveTargets(root: string, feature: string | null): [string, string][] {
  const { base, dirs } = featureDirs(root);
  if (!isDir(base)) {
    console.log(`validate_state: no ${base} directory - nothing to check.`);
    return [];
  }
  if (feature) {
    const fdir = isDir(feature) ? feature : join(base, feature);
    if (!isDir(fdir)) {
      console.error(`validate_state: feature not found: ${feature}`);
      process.exit(2);
    }
    return [[fdir, basename(fdir.replace(/\/+$/, ""))]];
  }
  if (dirs.length === 1) {
    return [[join(base, dirs[0]!), dirs[0]!]];
  }
  if (!dirs.length) {
    console.log("validate_state: no features under .specs/features/ - nothing to check.");
    return [];
  }
  // Cross-check mode: only features that appear complete.
  const picked: [string, string][] = dirs
    .filter((d) => appearsComplete(join(base, d)))
    .map((d) => [join(base, d), d]);
  if (!picked.length) {
    console.log("validate_state: no completed feature detected (all in progress) - nothing to gate.");
  }
  return picked;
}

const USAGE = "usage: validate_state.ts [-h] [--root ROOT] [feature]";
const HELP = `${USAGE}

Deterministic completion gate: a done feature must have a real PASS validation report.

positional arguments:
  feature      Feature dir or name (default: sole feature, else cross-check all completed)

options:
  -h, --help   show this help message and exit
  --root ROOT  Project root containing .specs/ (default: current dir)`;

interface Args {
  feature: string | null;
  root: string;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nvalidate_state.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  let root = ".";
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
  return { feature: positionals[0] ?? null, root };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;
  const root = resolve(args.root);

  const targets = resolveTargets(root, args.feature);
  const allErrors: string[] = [];
  for (const [fdir, name] of targets) {
    allErrors.push(...checkFeature(fdir, name));
  }

  for (const e of allErrors) console.log(`  ERROR ${e}`);
  const n = allErrors.length;
  const checked = targets.map(([, name]) => name).join(", ") || "(none)";
  console.log(`\nvalidate_state: ${n} error(s) across [${checked}]`);
  return n ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
