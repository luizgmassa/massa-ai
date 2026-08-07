#!/usr/bin/env bun
/**
 * validate_figma_wiring.ts - deterministic backing for the Figma wiring
 * unused-Number stop rule (FIGMA-07, design D11b).
 *
 * Parses every per-link figma file's wiring table under
 * `.specs/<type>/<slug>/figma/*.md` for the given slug (`references/figma-wiring.md`
 * owns the per-link file template and the 8-column table contract) and
 * reports, for each Number row, whether it is wired to at least one
 * Spec(s)/Task(s)/Design(s) ID. Bun builtins only, zero dependencies.
 *
 * ALWAYS prints the parsed population (files scanned + rows parsed) beside
 * the verdict -- a bare pass/fail is not trustworthy on its own
 * (spec-scripts-parse-strict-shapes lesson): a script that silently parses
 * zero rows from a malformed table would otherwise report a vacuous pass.
 *
 * Usage:
 *   bun skills/massa-ai/scripts/validate_figma_wiring.ts <slug> [--root .] [--type features|quick|debug|refactors]
 *
 * What it checks:
 *   ERROR - the figma/ directory exists but zero wiring-table rows were
 *           parsed from it (loud failure, not a silent pass)
 *   ERROR - a Number row has Spec(s) ID, Task(s) ID, AND Design(s) ID all
 *           empty (unwired -- the unused-Number stop rule)
 *
 * A slug with no figma/ directory at all has nothing to check (Figma
 * ingestion was never enabled for it) and exits 0 with a zero population.
 *
 * Exit codes: 0 pass (or nothing to check), 1 errors found, 2 usage error.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const VALID_TYPES = ["features", "quick", "debug", "refactors"] as const;
type ArtifactType = (typeof VALID_TYPES)[number];

/** One parsed data row from a wiring table. */
interface WiringRow {
  number: string;
  nodeIds: string;
  category: string;
  specIds: string;
  taskIds: string;
  designIds: string;
  /** Path reported in output, relative to `--root`. */
  file: string;
}

/**
 * The wiring-table header row, per `references/figma-wiring.md`'s
 * Wiring-Table Contract: exactly these 8 columns, in this order.
 */
const HEADER_RE =
  /^\|\s*Number\s*\|\s*Figma node id\(s\)\s*\|\s*Category\s*\|\s*Spec\(s\) ID\s*\|\s*Task\(s\) ID\s*\|\s*Design\(s\) ID\s*\|\s*Explanation\s*\|\s*Notes\s*\|\s*$/i;

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

/** Universal newline split. */
function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/** Splits one markdown table row into trimmed cells, dropping the outer-pipe edge cells. */
function splitRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((c) => c.trim());
}

/** True when every cell of a row looks like a markdown table separator (`---`, `:--`, `--:`). */
function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/** A cell counts as "wired" when it is non-empty and not a bare placeholder dash. */
function isWiredCell(cell: string): boolean {
  return cell !== "" && cell !== "-" && cell !== "—" && cell !== "N/A";
}

/**
 * Parses every wiring table found in one figma file's markdown content.
 *
 * A table is recognized by its header row matching the 8-column contract
 * followed immediately by a markdown separator row; every subsequent
 * pipe-prefixed line with at least 8 cells is a data row, until a
 * non-pipe-prefixed line ends the table.
 *
 * @param content - Raw file text.
 * @param fileLabel - Path recorded on each parsed row for reporting.
 */
function parseWiringTables(content: string, fileLabel: string): WiringRow[] {
  const lines = splitLines(content);
  const rows: WiringRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!HEADER_RE.test(lines[i]!.trim())) continue;
    const sepIdx = i + 1;
    if (sepIdx >= lines.length || !isSeparatorRow(splitRow(lines[sepIdx]!))) continue;
    let j = sepIdx + 1;
    while (j < lines.length) {
      const line = lines[j]!;
      if (!line.trim().startsWith("|")) break;
      const cells = splitRow(line);
      if (cells.length < 8) break;
      rows.push({
        number: cells[0]!,
        nodeIds: cells[1]!,
        category: cells[2]!,
        specIds: cells[3]!,
        taskIds: cells[4]!,
        designIds: cells[5]!,
        file: fileLabel,
      });
      j++;
    }
    i = j - 1;
  }
  return rows;
}

function figmaDir(root: string, type: ArtifactType, slug: string): string {
  return join(root, ".specs", type, slug, "figma");
}

function listFigmaFiles(dir: string): string[] {
  if (!isDir(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && isFile(join(dir, f)))
    .sort()
    .map((f) => join(dir, f));
}

interface CheckResult {
  errors: string[];
  dirPresent: boolean;
  filesScanned: number;
  rowsParsed: number;
  unwired: WiringRow[];
}

function check(root: string, type: ArtifactType, slug: string): CheckResult {
  const dir = figmaDir(root, type, slug);
  const errors: string[] = [];
  const dirPresent = isDir(dir);
  const files = listFigmaFiles(dir);
  let rowsParsed = 0;
  const unwired: WiringRow[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const label = relative(root, file);
    const rows = parseWiringTables(content, label);
    rowsParsed += rows.length;
    for (const row of rows) {
      if (!isWiredCell(row.specIds) && !isWiredCell(row.taskIds) && !isWiredCell(row.designIds)) {
        unwired.push(row);
      }
    }
  }

  if (dirPresent && rowsParsed === 0) {
    errors.push(
      `figma/ directory exists at ${relative(root, dir)} but zero wiring-table rows were parsed -- check the table header matches the 8-column contract in references/figma-wiring.md`,
    );
  }
  for (const row of unwired) {
    errors.push(
      `${row.file} #${row.number}: unwired -- Spec(s) ID, Task(s) ID, and Design(s) ID are all empty (category: ${row.category || "?"}, node id(s): ${row.nodeIds || "?"})`,
    );
  }

  return { errors, dirPresent, filesScanned: files.length, rowsParsed, unwired };
}

const USAGE = "usage: validate_figma_wiring.ts [-h] [--root ROOT] [--type features|quick|debug|refactors] <slug>";
const HELP = `${USAGE}

Deterministic backing for the Figma wiring unused-Number stop rule (FIGMA-07).

positional arguments:
  slug         The feature/quick/debug/refactor slug whose figma/ directory to check

options:
  -h, --help   show this help message and exit
  --root ROOT  Project root that contains .specs/ (default: current dir)
  --type TYPE  Artifact type: features (default) | quick | debug | refactors`;

interface Args {
  slug: string;
  root: string;
  type: ArtifactType;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nvalidate_figma_wiring.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  let root = ".";
  let type: ArtifactType = "features";
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
    } else if (a === "--type") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --type: expected one argument");
        return null;
      }
      const v = argv[++i]!;
      if (!(VALID_TYPES as readonly string[]).includes(v)) {
        printUsageError(`argument --type: invalid choice: '${v}' (choose from ${VALID_TYPES.map((t) => `'${t}'`).join(", ")})`);
        return null;
      }
      type = v as ArtifactType;
    } else if (a.startsWith("--type=")) {
      const v = a.slice("--type=".length);
      if (!(VALID_TYPES as readonly string[]).includes(v)) {
        printUsageError(`argument --type: invalid choice: '${v}' (choose from ${VALID_TYPES.map((t) => `'${t}'`).join(", ")})`);
        return null;
      }
      type = v as ArtifactType;
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
    printUsageError("the following arguments are required: slug");
    return null;
  }
  if (positionals.length > 1) {
    printUsageError(`unrecognized arguments: ${positionals.slice(1).join(" ")}`);
    return null;
  }
  return { slug: positionals[0]!, root, type };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;

  const { errors, filesScanned, rowsParsed, unwired } = check(args.root, args.type, args.slug);
  for (const e of errors) console.log(`  ERROR ${e}`);
  console.log(
    `\nvalidate_figma_wiring: scanned ${filesScanned} file(s), parsed ${rowsParsed} row(s), ${unwired.length} unwired, ${errors.length} error(s) for slug "${args.slug}" (type: ${args.type})`,
  );
  return errors.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
