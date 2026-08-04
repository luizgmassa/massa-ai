#!/usr/bin/env bun
/**
 * check_specs_delivered.ts - deterministic gate: .specs/ artifacts are
 * committed on the branch before a PR is opened (GATE-02).
 *
 * massa-ai's `implementation-delivery.md` chain has no gate requiring
 * `.specs/` (spec/context/design/tasks/validation, project state, handoff,
 * features registry) to be committed before `gh pr create`. This turns that
 * gap into two conjunctive, deterministic checks:
 *
 *   1. `git status --porcelain -- .specs/` is empty - nothing under .specs/ is
 *      modified-but-uncommitted or untracked.
 *   2. The feature's `spec.md` (always required) plus any of
 *      `{context,design,tasks,validation}.md` that exist on disk, plus
 *      `.specs/project/STATE.md`, `.specs/HANDOFF.md`, and
 *      `.specs/project/FEATURES.json`, are tracked on HEAD
 *      (`git ls-tree -r --name-only HEAD`).
 *
 * Check 2 exists because check 1 alone is not sufficient: a feature whose
 * `.specs/` artifacts were simply never written is porcelain-clean (nothing to
 * be dirty about) while still failing the actual requirement. Absence must fail,
 * not pass.
 *
 * Bun builtins only, no new dependencies (D2 - `Bun.spawnSync` for the git
 * calls). Run from the project root (the dir that contains .specs/), or pass
 * --root.
 *
 * Usage:
 *   bun skills/massa-ai/scripts/check_specs_delivered.ts <feature> [--root DIR]
 *
 * Exit codes: 0 all required paths clean + tracked, 1 a required path is dirty,
 *             untracked, or not tracked on HEAD (paths named), 2 usage/git error.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

// Always required for the named feature.
const FEATURE_REQUIRED = ["spec.md"];
// Required only when present on disk (not every feature reaches every phase).
const FEATURE_OPTIONAL = ["context.md", "design.md", "tasks.md", "validation.md"];

const STATE_FILES = [
  join(".specs", "project", "STATE.md"),
  join(".specs", "HANDOFF.md"),
  join(".specs", "project", "FEATURES.json"),
];

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

function runGit(args: string[], root: string): string {
  let proc: ReturnType<typeof Bun.spawnSync>;
  try {
    proc = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  } catch {
    console.error("check_specs_delivered: git not found on PATH");
    process.exit(2);
  }
  const exitCode = proc.exitCode ?? -1;
  if (exitCode !== 0) {
    const stderrText = proc.stderr.toString().trim();
    console.error(`check_specs_delivered: git ${args.join(" ")} failed: ${stderrText}`);
    process.exit(2);
  }
  return proc.stdout.toString();
}

/** Lines from `git status --porcelain -- .specs/` (empty = clean). */
function porcelainDirtyPaths(root: string): string[] {
  const out = runGit(["status", "--porcelain", "--", ".specs/"], root);
  return splitLines(out).filter((ln) => ln.trim() !== "");
}

/** Set of every path tracked on HEAD, repo-root-relative, '/'-separated. */
function trackedOnHead(root: string): Set<string> {
  const out = runGit(["ls-tree", "-r", "--name-only", "HEAD"], root);
  return new Set(splitLines(out));
}

function resolveFeatureDir(root: string, feature: string): string {
  if (isAbsolute(feature) || feature.includes(sep)) {
    return resolve(feature);
  }
  return join(root, ".specs", "features", feature);
}

/** Repo-root-relative, '/'-separated paths this feature must have tracked. */
function requiredPaths(root: string, feature: string): string[] {
  const fdir = resolveFeatureDir(root, feature);
  const fdirRel = relative(root, fdir);
  const paths = FEATURE_REQUIRED.map((name) => join(fdirRel, name));
  if (existsSync(fdir) && statSync(fdir).isDirectory()) {
    for (const name of FEATURE_OPTIONAL) {
      const candidate = join(fdir, name);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        paths.push(join(fdirRel, name));
      }
    }
  }
  paths.push(...STATE_FILES);
  return paths.map((p) => p.split(sep).join("/"));
}

/** Return { errors, checked }. errors empty = pass. */
function check(root: string, feature: string): { errors: string[]; checked: string[] } {
  const errors: string[] = [];

  for (const ln of porcelainDirtyPaths(root)) {
    errors.push(`uncommitted/untracked under .specs/: ${ln.trim()}`);
  }

  const paths = requiredPaths(root, feature);
  const tracked = trackedOnHead(root);
  for (const p of paths) {
    if (!tracked.has(p)) {
      errors.push(`not tracked on HEAD: ${p}`);
    }
  }

  return { errors, checked: paths };
}

const USAGE = "usage: check_specs_delivered.ts [-h] [--root ROOT] feature";
const HELP = `${USAGE}

Gate: .specs/ artifacts committed on the branch before PR (GATE-02).

positional arguments:
  feature      Feature slug under <root>/.specs/features/, or a direct path

options:
  -h, --help   show this help message and exit
  --root ROOT  Project root containing .specs/ (default: current dir)`;

interface Args {
  feature: string;
  root: string;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\ncheck_specs_delivered.ts: error: ${msg}\n`);
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
  if (positionals.length === 0) {
    printUsageError("the following arguments are required: feature");
    return null;
  }
  if (positionals.length > 1) {
    printUsageError(`unrecognized arguments: ${positionals.slice(1).join(" ")}`);
    return null;
  }
  return { feature: positionals[0]!, root };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;
  const root = resolve(args.root);

  const { errors, checked } = check(root, args.feature);

  for (const e of errors) console.log(`  ERROR ${e}`);
  console.log(`\ncheck_specs_delivered: checked ${checked.length} path(s):`);
  for (const c of checked) console.log(`  - ${c}`);
  console.log(`check_specs_delivered: ${errors.length} error(s)`);
  return errors.length ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
