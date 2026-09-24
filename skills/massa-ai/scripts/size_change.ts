#!/usr/bin/env bun
/**
 * size_change.ts - deterministic change sizing for the Verification Ladder.
 *
 * `references/verification-ladder.md` sizes work by changed files and changed
 * LOC. Counting those by eye over a `git diff` is exactly the kind of
 * arithmetic a model gets subtly wrong, and the whole ladder hangs off the
 * answer. This reads `git diff --numstat` and reports the counts plus the
 * SIZE FLOOR of the tier. Bun builtins only, zero dependencies, agent-agnostic.
 *
 * FLOOR, not tier. Size is only half of the ladder's rule. The other half is
 * qualitative and invisible to a diff: unclear acceptance criteria, a new
 * dependency, a migration, an irreversible operation, security/privacy/auth, a
 * public compatibility surface, a cross-service contract, or an unresolved
 * architecture decision. Any one of those escalates regardless of how small the
 * diff is, so this script's answer is a lower bound the agent may raise and must
 * never lower.
 *
 * Boundary reading: the ladder states Standard as "<=10 files or <=500 changed
 * LOC" and Spec-driven as ">10 files, >500 changed LOC" — read literally, the
 * two clauses overlap. This resolves the overlap by escalating: anything over
 * either bound is Spec-driven. That is the safe direction (it over-verifies
 * rather than under-verifies), and it matches how the rest of the Spec-driven
 * bullet reads — a list of independent triggers, not a conjunction.
 *
 * Changed LOC is added + deleted, which is what the ladder's "changed LOC"
 * means: a 100-line rewrite is 200 changed LOC, not 0.
 *
 * Usage:
 *   bun skills/massa-ai/scripts/size_change.ts                 # working tree vs HEAD
 *   bun skills/massa-ai/scripts/size_change.ts --staged        # index vs HEAD
 *   bun skills/massa-ai/scripts/size_change.ts --range main..HEAD
 *   bun skills/massa-ai/scripts/size_change.ts --json
 *
 * Exit codes: 0 sized, 1 git failure, 2 usage error.
 */

const USAGE =
  "usage: size_change.ts [-h] [--staged | --range REV_RANGE] [--json] [--root ROOT]";
const HELP = `${USAGE}

Size a change set against the Verification Ladder's file/LOC bounds.

options:
  -h, --help          show this help message and exit
  --staged            size the index against HEAD (git diff --cached)
  --range REV_RANGE   size a revision range, e.g. main..HEAD
  --json              emit a JSON object instead of the text report
  --root ROOT         run git in this directory (default: cwd)`;

/** The ladder's numeric bounds. Changing one here changes the only place it is encoded. */
const QUICK_MAX_FILES = 3;
const QUICK_MAX_LOC = 200;
const STANDARD_MAX_FILES = 10;
const STANDARD_MAX_LOC = 500;

type Tier = "quick" | "standard" | "spec-driven";

interface Args {
  staged: boolean;
  range: string | null;
  json: boolean;
  root: string;
}

interface FileStat {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
}

interface Sizing {
  mode: string;
  files: number;
  added: number;
  deleted: number;
  changedLoc: number;
  binaryFiles: number;
  tierFloor: Tier;
  perFile: FileStat[];
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nsize_change.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  const args: Args = { staged: false, range: null, json: false, root: "." };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (a === "--staged") {
      args.staged = true;
    } else if (a === "--json") {
      args.json = true;
    } else if (a === "--range" || a === "--root") {
      if (i + 1 >= argv.length) {
        printUsageError(`argument ${a}: expected one argument`);
        return null;
      }
      const value = argv[++i]!;
      if (a === "--range") args.range = value;
      else args.root = value;
    } else if (a.startsWith("--range=")) {
      args.range = a.slice("--range=".length);
    } else if (a.startsWith("--root=")) {
      args.root = a.slice("--root=".length);
    } else {
      printUsageError(`unrecognized argument: ${a}`);
      return null;
    }
  }
  if (args.staged && args.range !== null) {
    printUsageError("--staged and --range are mutually exclusive");
    return null;
  }
  return args;
}

/** Runs git and returns stdout, or null when git itself failed. */
function git(root: string, gitArgs: string[]): string | null {
  const proc = Bun.spawnSync(["git", ...gitArgs], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    process.stderr.write(new TextDecoder().decode(proc.stderr));
    return null;
  }
  return new TextDecoder().decode(proc.stdout);
}

/**
 * Parses `git diff --numstat` output.
 *
 * A binary file is reported as `-\t-\tpath`: it has no line counts, so it
 * contributes to the file count and to nothing else. Counting `-` as 0 silently
 * would make a 40 MB asset look like a no-op change, which is why binaries are
 * reported separately instead.
 */
function parseNumstat(out: string): FileStat[] {
  const stats: FileStat[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [addedRaw, deletedRaw] = parts;
    const binary = addedRaw === "-" || deletedRaw === "-";
    stats.push({
      // A rename is `old => new`; keep git's own rendering rather than guessing.
      path: parts.slice(2).join("\t"),
      added: binary ? 0 : Number(addedRaw),
      deleted: binary ? 0 : Number(deletedRaw),
      binary,
    });
  }
  return stats;
}

/** The ladder's size floor. See the escalating boundary reading in the header. */
export function tierFloor(files: number, changedLoc: number): Tier {
  if (files <= QUICK_MAX_FILES && changedLoc <= QUICK_MAX_LOC) return "quick";
  if (files > STANDARD_MAX_FILES || changedLoc > STANDARD_MAX_LOC) return "spec-driven";
  return "standard";
}

function size(args: Args): Sizing | null {
  const diffArgs = args.range !== null
    ? ["diff", "--numstat", args.range]
    : args.staged
      ? ["diff", "--numstat", "--cached"]
      : ["diff", "--numstat", "HEAD"];
  const out = git(args.root, diffArgs);
  if (out === null) return null;

  const perFile = parseNumstat(out);
  const added = perFile.reduce((n, f) => n + f.added, 0);
  const deleted = perFile.reduce((n, f) => n + f.deleted, 0);
  const changedLoc = added + deleted;
  return {
    mode: args.range !== null ? `range ${args.range}` : args.staged ? "staged (index vs HEAD)" : "working tree vs HEAD",
    files: perFile.length,
    added,
    deleted,
    changedLoc,
    binaryFiles: perFile.filter((f) => f.binary).length,
    tierFloor: tierFloor(perFile.length, changedLoc),
    perFile,
  };
}

function report(s: Sizing): void {
  console.log(`scope:       ${s.mode}`);
  console.log(`files:       ${s.files}${s.binaryFiles ? ` (${s.binaryFiles} binary, no line counts)` : ""}`);
  console.log(`changed LOC: ${s.changedLoc} (+${s.added} / -${s.deleted})`);
  console.log(`tier floor:  ${s.tierFloor}`);
  console.log("");
  for (const f of s.perFile) {
    const counts = f.binary ? "binary" : `+${f.added}/-${f.deleted}`;
    console.log(`  ${counts.padEnd(12)} ${f.path}`);
  }
  console.log("");
  console.log(
    "This is a FLOOR. Raise it for unclear acceptance criteria, a new dependency,",
  );
  console.log(
    "a migration, an irreversible operation, security/privacy/auth, public",
  );
  console.log(
    "compatibility, a cross-service contract, or an unresolved architecture",
  );
  console.log("decision. Never lower it. See references/verification-ladder.md.");
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;
  const s = size(args);
  if (s === null) return 1;
  if (args.json) console.log(JSON.stringify(s, null, 2));
  else report(s);
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
