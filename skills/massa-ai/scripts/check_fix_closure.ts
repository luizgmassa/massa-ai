#!/usr/bin/env bun
/**
 * check_fix_closure.ts - deterministic gate: a `*-fix` workflow's Fix Closure
 * Report is committed, complete, and evidence-backed before Propose/Evidence
 * Gate (the fix-family analogue of check_specs_delivered.ts).
 *
 * Three conjunctive checks against the closure contract in
 * `references/audit-report-io.md` (Fix Closure Report Contract):
 *
 *   1. The closure file exists, is tracked on HEAD, and is porcelain-clean
 *      (not modified-but-uncommitted).
 *   2. Every finding ID selected from the source audit report has a Closure
 *      Matrix row with a terminal status (`fixed|blocked|deferred|skipped`).
 *      The selected set is every finding in the source report, or the subset
 *      named via --findings. The source report path comes from the closure
 *      file's `Source Report:` metadata line, or --report.
 *   3. No `fixed` row carries a placeholder Command/Artifact or Result cell
 *      (empty, `<template>`, `TBD`, `-`, or `n/a`).
 *
 * Reuses the `### <PREFIX>-N:` finding parser exported by
 * validate_audit_report.ts, so the two scripts cannot drift on ID shape.
 * Bun builtins only. Run from the project root, or pass --root.
 *
 * Usage:
 *   bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family <family>
 *        [--report <report.md>] [--findings ID,ID,...] [--root DIR]
 *
 * Exit codes: 0 pass, 1 closure incomplete/dirty/placeholder (reasons named),
 *             2 usage/git error.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { FAMILIES, parseFindings, splitLines } from "./validate_audit_report.ts";

const TERMINAL_STATUSES = new Set(["fixed", "blocked", "deferred", "skipped"]);
const PLACEHOLDER_CELL_RE = /^(<.*>|TBD|-|n\/a)?$/i;

function runGit(args: string[], root: string): { exitCode: number; stdout: string; stderr: string } {
  try {
    const proc = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  } catch {
    console.error("check_fix_closure: git not found on PATH");
    process.exit(2);
  }
}

interface ClosureRow {
  findingId: string;
  status: string;
  commandArtifact: string;
  result: string;
  line: number;
}

/** Parse `Source Report:` and `Finding Selector:` metadata lines. */
function parseClosureMetadata(lines: string[]): Map<string, string> {
  const fields = new Map<string, string>();
  const lineRe = /^([A-Za-z][A-Za-z ./]*?):\s*(.*)$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+\S/.test(line)) break;
    const m = lineRe.exec(line);
    if (m) fields.set(m[1]!.trim(), m[2]!.trim());
  }
  return fields;
}

/** Split a markdown table row into trimmed cells (drops leading/trailing empties). */
function tableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  const cells = trimmed.split("|").map((c) => c.trim());
  // First and last entries are the empty strings outside the outer pipes.
  return cells.slice(1, cells.length - 1);
}

/** Rows of the `## Closure Matrix` table, resolved by header-name lookup. */
function parseClosureMatrix(lines: string[], errors: string[]): ClosureRow[] {
  let inMatrix = false;
  let header: string[] | null = null;
  const rows: ClosureRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^##\s+Closure Matrix\s*$/.test(line.trim())) {
      inMatrix = true;
      continue;
    }
    if (inMatrix && /^##\s+\S/.test(line)) break;
    if (!inMatrix) continue;
    const cells = tableCells(line);
    if (cells.length === 0) continue;
    if (header === null) {
      header = cells;
      continue;
    }
    if (cells.every((c) => /^[-: ]*$/.test(c))) continue; // separator row
    const col = (name: string): string => {
      const idx = header!.findIndex((h) => h.toLowerCase() === name.toLowerCase());
      return idx >= 0 && idx < cells.length ? cells[idx]! : "";
    };
    rows.push({
      findingId: col("Finding ID"),
      status: col("Status").toLowerCase(),
      commandArtifact: col("Command/Artifact"),
      result: col("Result"),
      line: i + 1,
    });
  }
  if (header !== null) {
    for (const required of ["Finding ID", "Status", "Command/Artifact", "Result"]) {
      if (!header.some((h) => h.toLowerCase() === required.toLowerCase())) {
        errors.push(`Closure Matrix header is missing the '${required}' column`);
      }
    }
  } else {
    errors.push("no '## Closure Matrix' table found in the closure report");
  }
  return rows;
}

interface CheckResult {
  errors: string[];
  selected: string[];
}

function check(
  root: string,
  closurePath: string,
  family: string,
  reportArg: string | null,
  findingsArg: string[] | null,
): CheckResult {
  const errors: string[] = [];

  // 1. Committed and clean.
  const relClosure = relative(root, resolve(closurePath)).split(sep).join("/");
  const tracked = runGit(["ls-tree", "-r", "--name-only", "HEAD"], root);
  if (tracked.exitCode !== 0) {
    console.error(`check_fix_closure: git ls-tree failed: ${tracked.stderr.trim()}`);
    process.exit(2);
  }
  if (!splitLines(tracked.stdout).includes(relClosure)) {
    errors.push(`closure report not tracked on HEAD: ${relClosure}`);
  }
  const porcelain = runGit(["status", "--porcelain", "--", relClosure], root);
  for (const ln of splitLines(porcelain.stdout).filter((l) => l.trim() !== "")) {
    errors.push(`closure report uncommitted/modified: ${ln.trim()}`);
  }

  const closureText = readFileSync(closurePath, "utf-8");
  const closureLines = splitLines(closureText);
  const meta = parseClosureMetadata(closureLines);

  // 2. Every selected source-report finding has a terminal-status row.
  const reportPath = reportArg ?? meta.get("Source Report") ?? null;
  const composite = family === "implementation";
  let selected: string[] = [];
  if (findingsArg !== null) {
    selected = findingsArg;
  } else if (reportPath !== null && reportPath !== "") {
    const absReport = isAbsolute(reportPath) ? reportPath : join(root, reportPath);
    if (!existsSync(absReport)) {
      errors.push(`source report not found: ${reportPath}`);
    } else {
      const reportLines = splitLines(readFileSync(absReport, "utf-8"));
      selected = parseFindings(reportLines, composite)
        .filter((f) => f.num !== null)
        .map((f) => f.raw);
    }
  } else {
    errors.push("no source report: closure has no 'Source Report:' line and no --report/--findings was given");
  }

  const rows = parseClosureMatrix(closureLines, errors);
  const rowById = new Map<string, ClosureRow>();
  for (const row of rows) {
    if (row.findingId !== "") rowById.set(row.findingId, row);
  }

  for (const id of selected) {
    const row = rowById.get(id);
    if (row === undefined) {
      errors.push(`selected finding has no Closure Matrix row: ${id}`);
      continue;
    }
    if (!TERMINAL_STATUSES.has(row.status)) {
      errors.push(
        `L${row.line}: finding ${id} has non-terminal status '${row.status}' (expected fixed|blocked|deferred|skipped)`,
      );
    }
  }

  // 3. No fixed row with placeholder evidence.
  for (const row of rows) {
    if (row.status !== "fixed") continue;
    if (PLACEHOLDER_CELL_RE.test(row.commandArtifact)) {
      errors.push(`L${row.line}: fixed finding ${row.findingId} has a placeholder Command/Artifact cell`);
    }
    if (PLACEHOLDER_CELL_RE.test(row.result)) {
      errors.push(`L${row.line}: fixed finding ${row.findingId} has a placeholder Result cell`);
    }
  }

  return { errors, selected };
}

const USAGE =
  "usage: check_fix_closure.ts [-h] --family NAME [--report PATH] [--findings IDS] [--root ROOT] closure.md";
const HELP = `${USAGE}

Gate: the Fix Closure Report is committed, complete, and evidence-backed
before Propose/Evidence Gate (references/audit-report-io.md, Fix Closure
Report Contract).

positional arguments:
  closure.md      Path to the Fix Closure Report markdown file

options:
  -h, --help      show this help message and exit
  --family NAME   One of: ${Object.keys(FAMILIES).join(", ")}
  --report PATH   Source audit report (default: the closure's 'Source Report:' line)
  --findings IDS  Comma-separated finding IDs (default: every finding in the source report)
  --root ROOT     Project root (default: current dir)`;

interface Args {
  closure: string;
  family: string;
  report: string | null;
  findings: string[] | null;
  root: string;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\ncheck_fix_closure.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  let family: string | null = null;
  let report: string | null = null;
  let findings: string[] | null = null;
  let root = ".";
  const positionals: string[] = [];
  const takeValue = (i: number, name: string): string | null => {
    if (i + 1 >= argv.length) {
      printUsageError(`argument ${name}: expected one argument`);
      return null;
    }
    return argv[i + 1]!;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--family") {
      const v = takeValue(i, "--family");
      if (v === null) return null;
      family = v;
      i++;
    } else if (a.startsWith("--family=")) {
      family = a.slice("--family=".length);
    } else if (a === "--report") {
      const v = takeValue(i, "--report");
      if (v === null) return null;
      report = v;
      i++;
    } else if (a.startsWith("--report=")) {
      report = a.slice("--report=".length);
    } else if (a === "--findings") {
      const v = takeValue(i, "--findings");
      if (v === null) return null;
      findings = v.split(",").map((s) => s.trim()).filter((s) => s !== "");
      i++;
    } else if (a.startsWith("--findings=")) {
      findings = a
        .slice("--findings=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    } else if (a === "--root") {
      const v = takeValue(i, "--root");
      if (v === null) return null;
      root = v;
      i++;
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
  if (positionals.length !== 1) {
    printUsageError("exactly one closure.md path is required");
    return null;
  }
  if (family === null) {
    printUsageError("the following arguments are required: --family");
    return null;
  }
  if (!(family in FAMILIES)) {
    printUsageError(`unknown family '${family}' (known: ${Object.keys(FAMILIES).join(", ")})`);
    return null;
  }
  return { closure: positionals[0]!, family, report, findings, root };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;
  const root = resolve(args.root);
  const closurePath = isAbsolute(args.closure) ? args.closure : join(root, args.closure);
  if (!existsSync(closurePath)) {
    console.error(`check_fix_closure: closure report not found: ${args.closure}`);
    return 2;
  }

  const { errors, selected } = check(root, closurePath, args.family, args.report, args.findings);

  for (const e of errors) console.log(`  ERROR ${e}`);
  console.log(`\ncheck_fix_closure: checked ${selected.length} selected finding(s):`);
  for (const id of selected) console.log(`  - ${id}`);
  console.log(`check_fix_closure: ${errors.length} error(s)`);
  return errors.length ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}

export { check, parseClosureMatrix, tableCells };
