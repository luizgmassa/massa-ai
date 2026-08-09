#!/usr/bin/env bun
/**
 * validate_tasks.ts - deterministic pre-approval checks for a feature tasks.md.
 *
 * Turns the three pre-approval checks (task granularity, diagram-vs-definition
 * cross-check, test co-location) into a checkable pass/fail run BEFORE tasks are
 * presented for approval, instead of trusting the model to build the tables by
 * hand. Bun builtins only, zero dependencies. Operates only on the tasks.md
 * markdown artifact, so it is stack-agnostic and tool-agnostic.
 *
 * What it checks (heuristic markdown inspection, not a full parser):
 *   ERROR  - a required section is missing
 *   ERROR  - a task is missing its `Tests` or `Gate` field
 *   ERROR  - a task depends on a task in a LATER phase (dependencies point back only)
 *   ERROR  - a dependency edge shown in the diagram has no matching `Depends on`
 *            (and vice-versa) when both sides are parseable
 *   WARN   - a task's `Where` names multiple files (granularity smell -> split it)
 *   WARN   - a task says `Tests: none` (confirm the coverage matrix agrees)
 *   WARN   - the diagram could not be parsed confidently (cross-check skipped)
 *
 * Usage:
 *   bun skills/massa-ai/scripts/validate_tasks.ts [target] [--root DIR] [--strict]
 *
 *   Invoke with the repo-root-relative script path shown above (matches
 *   lessons.ts's convention), not a project-local copy.
 *   target    Path to a tasks.md, a feature directory, or a project root.
 *             Omitted -> auto-detect the single feature under <root>/.specs/features/.
 *   --root    Project root that contains .specs/ (default: current dir).
 *   --strict  Treat warnings as errors.
 *
 * Exit codes: 0 pass, 1 errors found (or warnings under --strict), 2 usage error.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const REQUIRED_SECTIONS = ["Test Coverage Matrix", "Gate Check Commands", "Execution Plan", "Task Breakdown"];
// Task ids are `T<n>` plus optional letter prefix (`FT3` for fix tasks): an
// unrecognized `### FT3:` header would fold its fields into the previous task's
// record and misreport e.g. a self-dependency (IT2-01).
const TASK_RE = /^#{2,4}\s+([A-Z]*T\d+)\s*:/i;
const FILE_HINT_RE_SRC = "[\\w./-]+\\.\\w{1,6}\\b";
const TASK_BREAKDOWN_RE = /^#{1,4}\s+Task Breakdown\b/i;
const PHASE_HEADING_RE = /^#{2,4}\s+Phase\s+(\d+)/i;
const DEPENDS_RE = /^\*{0,2}Depends on\*{0,2}\s*:\s*(.*)$/i;
const WHERE_RE = /^\*{0,2}Where\*{0,2}\s*:\s*(.*)$/i;
const TESTS_RE = /^\*{0,2}Tests\*{0,2}\s*:\s*(.*)$/i;
const GATE_RE = /^\*{0,2}Gate\*{0,2}\s*:\s*(.*)$/i;

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

/**
 * Mirrors Python's os.path.join(): unlike node:path's join(), it does NOT
 * normalize away a leading "." segment (os.path.join(".", "a") === "./a",
 * node's join(".", "a") === "a") - divergence risk since this script's
 * default --root "." is never abspath()'d.
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

/** Mirrors Python's repr() for plain-text strings (single-quoted, backslash/quote/control escapes). */
function pyRepr(s: string): string {
  const hasSingle = s.includes("'");
  const hasDouble = s.includes('"');
  const quote = hasSingle && !hasDouble ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += "\\" + quote;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else {
      const code = ch.codePointAt(0)!;
      if (code < 0x20 || code === 0x7f) {
        out += "\\x" + code.toString(16).padStart(2, "0");
      } else {
        out += ch;
      }
    }
  }
  out += quote;
  return out;
}

/** Mirrors Python's `str(sorted(set(list)))` (a list repr: ['a', 'b']). */
function pyListRepr(items: string[]): string {
  return `[${items.map(pyRepr).join(", ")}]`;
}

function findAllEdges(text: string): string[] {
  const re = /\b[A-Z]*T\d+\b/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function findAllFileHints(text: string): string[] {
  const re = new RegExp(FILE_HINT_RE_SRC, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function autodetect(root: string): string | null {
  const base = pyJoin(root, ".specs", "features");
  if (!isDir(base)) return null;
  const features = readdirSync(base)
    .filter((d) => isFile(pyJoin(base, d, "tasks.md")))
    .sort();
  if (features.length === 1) return pyJoin(base, features[0]!, "tasks.md");
  if (features.length === 0) return null;
  const joined = features.map((f) => pyJoin(base, f, "tasks.md")).join("\n  ");
  console.error(`validate_tasks: multiple features found; pass one explicitly:\n  ${joined}`);
  process.exit(1);
}

function resolveTasks(target: string | null, root: string): string | null {
  if (target) {
    if (isFile(target)) return target;
    if (isDir(target)) {
      const cand = pyJoin(target, "tasks.md");
      if (isFile(cand)) return cand;
      return autodetect(target);
    }
    // Not a path: treat as a feature name under <root>/.specs/features/<name>/
    const cand = pyJoin(root, ".specs", "features", target, "tasks.md");
    if (isFile(cand)) return cand;
    return null;
  }
  return autodetect(root);
}

function sectionPresent(lines: string[], name: string): boolean {
  const re = new RegExp(`^#{1,4}\\s+${escapeRegExp(name)}\\b`);
  return lines.some((ln) => re.test(ln.trim()));
}

interface TaskRecord {
  deps: Set<string>;
  tests: string | null;
  gate: string | null;
  where: string;
}

/** Return a map: task_id -> {deps, tests, gate, where}. */
function parseTasks(lines: string[]): Map<string, TaskRecord> {
  const tasks = new Map<string, TaskRecord>();
  let current: string | null = null;
  for (const ln of lines) {
    const stripped = ln.trim();
    const m = TASK_RE.exec(stripped);
    if (m) {
      current = m[1]!.toUpperCase();
      tasks.set(current, { deps: new Set(), tests: null, gate: null, where: "" });
      continue;
    }
    if (current === null) continue;
    const record = tasks.get(current)!;
    const dm = DEPENDS_RE.exec(stripped);
    if (dm) {
      const body = dm[1]!;
      if (!body.toLowerCase().includes("none")) {
        for (const e of findAllEdges(body.toUpperCase())) {
          record.deps.add(e);
        }
      }
    }
    const wm = WHERE_RE.exec(stripped);
    if (wm) {
      record.where = wm[1]!;
    }
    const tm = TESTS_RE.exec(stripped);
    if (tm) {
      record.tests = tm[1]!.trim();
    }
    const gm = GATE_RE.exec(stripped);
    if (gm) {
      record.gate = gm[1]!.trim();
    }
  }
  return tasks;
}

/**
 * Map task_id -> phase index, read from '### Phase N' headers.
 *
 * massa-ai patch (beyond D1): the reference tasks.md template (and TLC's own)
 * puts the Execution Plan (phase headers + a diagram/list of the task IDs in
 * each phase) BEFORE the separate Task Breakdown section (a flat list of
 * "### Tn:" task headers with no phase sub-headers). Upstream mapped a task
 * to a phase only by which "### Tn:" HEADER line followed the most-recently-
 * seen "### Phase N" header while scanning the WHOLE file - so with that
 * template shape every task header in Task Breakdown inherits the LAST phase
 * index left over from Execution Plan, and the forward-phase-dependency
 * check (SYNC-01 AC2) never fires. Confirmed against this feature's own
 * tasks.md (whose Phase headers happen to sit directly inside Task
 * Breakdown, immediately before their tasks) still passing, and a
 * template-shaped fixture then found 0/18 forward-phase violations
 * detectable when it should catch a deliberately-introduced one.
 *
 * Fix: read membership from the Execution Plan's diagram/plain-list content
 * (bare `Tn` tokens under a `### Phase N` heading) as the authoritative
 * signal there, and fall back to the header-based signal (setdefault-style,
 * never overwriting) once "## Task Breakdown" is reached - which is also
 * exactly what the ORIGINAL algorithm already got right for tasks.md files
 * (like this feature's own) that interleave phase headers directly inside
 * Task Breakdown. Diagram-style scanning is deliberately NOT applied inside
 * Task Breakdown, preserving the original comment's concern: a `Depends on:`
 * line inside one task's block often names a task from an EARLIER phase and
 * must never be misattributed to the current phase.
 */
function parsePhaseMembership(lines: string[]): Map<string, number> {
  const membership = new Map<string, number>();
  let phaseIdx = 0;
  let inPhase = false;
  let inTaskBreakdown = false;
  for (const ln of lines) {
    const stripped = ln.trim();
    if (TASK_BREAKDOWN_RE.test(stripped)) {
      inTaskBreakdown = true;
    }
    const pm = PHASE_HEADING_RE.exec(stripped);
    if (pm) {
      phaseIdx = parseInt(pm[1]!, 10);
      inPhase = true;
      continue;
    }
    if (!inPhase) continue;
    const hm = TASK_RE.exec(stripped);
    if (hm) {
      const tid = hm[1]!.toUpperCase();
      if (!membership.has(tid)) membership.set(tid, phaseIdx);
      continue;
    }
    if (!inTaskBreakdown) {
      for (const tid of findAllEdges(stripped.toUpperCase())) {
        membership.set(tid, phaseIdx);
      }
    }
  }
  return membership;
}

/**
 * Best-effort: parse 'Tx -> Ty -> Tz' arrow chains from fenced blocks into
 * an ordering position per task (position increases along each chain).
 *
 * massa-ai patch (beyond D1): upstream compared the diagram against `Depends
 * on` as an exact edge set (`Tx -> Ty` in the diagram requires literally
 * `Depends on: Tx` on Ty and vice-versa). Both massa-ai's tasks.md reference
 * template AND TLC's own upstream template violate that under a real fill-in
 * - e.g. the upstream example diagrams `T1 -> T2 -> T3` while T3's `Depends
 * on` is `T1`, not `T2`, because the diagram documents *execution order*
 * ("tasks execute sequentially within a phase"), not a literal dependency
 * graph; the real graph lives in each task's `Depends on` field. Re-running
 * the strict edge check against this feature's own live tasks.md as its T2
 * fixture (as this task requires) failed with 16 false positives, confirming
 * the defect is not cosmetic. This function instead returns each task's
 * position in its diagram chain; check() below verifies the weaker, correct
 * invariant: every `Depends on` edge inside one phase must point to a task
 * that appears no later in that phase's diagram order.
 */
function parseDiagramOrder(lines: string[]): { positions: Map<string, number>; parsed: boolean } {
  const positions = new Map<string, number>();
  let inFence = false;
  let foundAnyArrow = false;
  for (const ln of lines) {
    if (ln.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    // normalize arrow glyphs
    const norm = ln.replaceAll("→", "->").replaceAll("──", "-");
    if (!norm.includes("->")) continue;
    // only treat as a chain if arrows connect them left-to-right
    const segments = norm.split("->");
    const seqRaw: (string | null)[] = [];
    for (const seg of segments) {
      const ids = findAllEdges(seg.toUpperCase());
      seqRaw.push(ids.length ? ids[ids.length - 1]! : null);
    }
    const seq = seqRaw.filter((s): s is string => s !== null);
    if (seq.length >= 2) {
      foundAnyArrow = true;
    }
    seq.forEach((tid, idx) => {
      positions.set(tid, idx);
    });
  }
  return { positions, parsed: foundAnyArrow };
}

const MAX_TASKS_PER_PHASE = 3;

/**
 * Count tasks (TASK_RE headings) per phase (PHASE_HEADING_RE), scoped to the
 * Task Breakdown section only - mirrors parsePhaseMembership's
 * inTaskBreakdown gating so a phase heading appearing earlier in the
 * Execution Plan diagram never seeds a count, and a task header encountered
 * before any Phase heading inside Task Breakdown is not counted against a
 * phase (unchanged behavior for phase-less breakdowns).
 */
function countTasksPerPhase(lines: string[]): Map<number, number> {
  const counts = new Map<number, number>();
  let inTaskBreakdown = false;
  let currentPhase: number | null = null;
  for (const ln of lines) {
    const stripped = ln.trim();
    if (TASK_BREAKDOWN_RE.test(stripped)) {
      inTaskBreakdown = true;
      continue;
    }
    if (!inTaskBreakdown) continue;
    const pm = PHASE_HEADING_RE.exec(stripped);
    if (pm) {
      currentPhase = parseInt(pm[1]!, 10);
      continue;
    }
    if (currentPhase === null) continue;
    if (TASK_RE.test(stripped)) {
      counts.set(currentPhase, (counts.get(currentPhase) ?? 0) + 1);
    }
  }
  return counts;
}

function check(tasksPath: string): { errors: string[]; warnings: string[] } {
  const text = readFileSync(tasksPath, "utf-8");
  const lines = splitLines(text);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const name of REQUIRED_SECTIONS) {
    if (!sectionPresent(lines, name)) {
      errors.push(`missing required section: ## ${name}`);
    }
  }

  const tasks = parseTasks(lines);
  if (tasks.size === 0) {
    warnings.push("no tasks (### T1: ...) parsed - is this file filled in?");
    return { errors, warnings };
  }

  // Field presence + granularity smell.
  for (const [tid, t] of tasks) {
    if (t.tests === null) {
      errors.push(`${tid}: missing \`Tests\` field`);
    } else if (t.tests.toLowerCase().startsWith("none")) {
      warnings.push(`${tid}: Tests: none - confirm the Test Coverage Matrix says 'none' for this layer`);
    }
    if (t.gate === null) {
      errors.push(`${tid}: missing \`Gate\` field`);
    }
    const files = findAllFileHints(t.where);
    const uniqueSorted = Array.from(new Set(files)).sort();
    if (uniqueSorted.length > 1) {
      warnings.push(
        `${tid}: \`Where\` names multiple files ${pyListRepr(uniqueSorted)} - granularity smell, consider splitting`,
      );
    }
  }

  // Per-phase task-count budget (WF-16, D14): a phase holding more than 3
  // tasks is wrongly sized, not merely a smell - see D14 in design.md.
  const phaseCounts = countTasksPerPhase(lines);
  for (const [phase, count] of phaseCounts) {
    if (count > MAX_TASKS_PER_PHASE) {
      errors.push(`Phase ${phase} has ${count} tasks (max 3 per phase, ideal 2)`);
    }
  }

  // Forward-phase dependency. Iterates each task's deps Set in JS insertion
  // order - note Python's own iteration here is UNSORTED (`for dep in
  // t["deps"]`, a set) and its per-process order is hash-randomized, so a
  // fixture must never trigger more than one forward-phase violation per
  // task or byte-parity with the Python original would be unachievable by
  // construction (both languages would be non-deterministic against each
  // other, and Python would even be non-deterministic against itself).
  const membership = parsePhaseMembership(lines);
  for (const [tid, t] of tasks) {
    const pHere = membership.get(tid);
    if (pHere === undefined) continue;
    for (const dep of t.deps) {
      const pDep = membership.get(dep);
      if (pDep !== undefined && pDep > pHere) {
        errors.push(
          `${tid} (phase ${pHere}) depends on ${dep} (phase ${pDep}) - dependencies must point backward or within the same phase`,
        );
      }
    }
  }

  // Diagram vs definition cross-check (best effort, order-consistency - see
  // parseDiagramOrder's docstring for why this is not exact-edge equality).
  const { positions, parsed } = parseDiagramOrder(lines);
  if (!parsed) {
    warnings.push("diagram arrows not parsed confidently - diagram/definition cross-check skipped (verify by hand)");
  } else {
    for (const [tid, t] of tasks) {
      const pHere = membership.get(tid);
      if (!positions.has(tid)) continue;
      for (const dep of Array.from(t.deps).sort()) {
        if (!positions.has(dep)) continue;
        const pDep = membership.get(dep);
        if (pDep === undefined || pHere === undefined || pDep !== pHere) continue; // cross-phase; forward-phase check above already covers ordering
        if (positions.get(dep)! >= positions.get(tid)!) {
          errors.push(
            `${tid} declares \`Depends on: ${dep}\` but the phase diagram shows ${dep} at or after ${tid}, not before it`,
          );
        }
      }
    }
  }

  return { errors, warnings };
}

const USAGE = "usage: validate_tasks.ts [-h] [--root ROOT] [--strict] [target]";
const HELP = `${USAGE}

Pre-approval checks for a feature tasks.md.

positional arguments:
  target       Path to a tasks.md, a feature directory, or a project root

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
  process.stderr.write(`${USAGE}\nvalidate_tasks.ts: error: ${msg}\n`);
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

  const tasksPath = resolveTasks(args.target, args.root);
  if (!tasksPath) {
    console.error("validate_tasks: could not locate a tasks.md. Pass a path or run from the project root.");
    return 2;
  }

  const { errors, warnings } = check(tasksPath);
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  const fail = errors.length > 0 || (warnings.length > 0 && args.strict);
  console.log(`\nvalidate_tasks: ${errors.length} error(s), ${warnings.length} warning(s) in ${tasksPath}`);
  return fail ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
