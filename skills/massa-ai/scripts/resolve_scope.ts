#!/usr/bin/env bun
/**
 * resolve_scope.ts - deterministic audit scope packet.
 *
 * `references/audit-scope.md` requires every audit to produce a compact scope
 * packet before analysis: scope type, target focus, resolution method, base and
 * head, resolved files, exclusions, and a freshness timestamp. Assembling that
 * by hand means running three or four git commands and transcribing their
 * output, which is where a packet drifts from the tree it claims to describe.
 * This emits the packet as JSON from the tree itself. Bun builtins only, zero
 * dependencies, agent-agnostic.
 *
 * It resolves FILES, not judgment. It cannot decide whether a target focus is
 * too vague to audit, and it does not try: `--target` is recorded verbatim, and
 * the ask-when-vague rule stays with the agent and `references/audit-scope.md`.
 *
 * Exclusions are reported, never silently applied twice: the excluded paths are
 * listed in the packet alongside the resolved files, so a reader can see what
 * was dropped rather than inferring it from a count that does not add up.
 *
 * Usage:
 *   bun skills/massa-ai/scripts/resolve_scope.ts --scope modified
 *   bun skills/massa-ai/scripts/resolve_scope.ts --scope range --range abc123..def456
 *   bun skills/massa-ai/scripts/resolve_scope.ts --scope branch --base main
 *   bun skills/massa-ai/scripts/resolve_scope.ts --scope files --target 'src/**\/*.ts'
 *   bun skills/massa-ai/scripts/resolve_scope.ts --scope whole
 *
 * Exit codes: 0 resolved, 1 git failure or unresolvable scope, 2 usage error.
 */

const SCOPES = ["modified", "range", "branch", "files", "whole"] as const;
type Scope = (typeof SCOPES)[number];

const USAGE =
  "usage: resolve_scope.ts [-h] --scope {modified,range,branch,files,whole} [--range REV_RANGE] [--base REF] [--head REF] [--target TARGET] [--root ROOT]";
const HELP = `${USAGE}

Emit the shared audit scope packet from references/audit-scope.md as JSON.

options:
  -h, --help          show this help message and exit
  --scope SCOPE       one of: ${SCOPES.join(", ")}
  --range REV_RANGE   revision range for --scope range, e.g. abc123..def456
  --base REF          base ref for --scope branch (default: origin/HEAD, then main)
  --head REF          head ref for --scope branch (default: HEAD)
  --target TARGET     the target focus, recorded verbatim; a git pathspec for --scope files
                      (git's '*' crosses '/', so 'src/*.ts' also matches 'src/a/b.ts')
  --root ROOT         run git in this directory (default: cwd)`;

/**
 * Paths excluded from every audit scope per references/audit-scope.md
 * ("generated, dependency, build, log, cache, temporary, and secret paths").
 * Matched as a path segment so `src/dist-helper.ts` is not caught by `dist`.
 */
const EXCLUDED_SEGMENTS = [
  "node_modules", "vendor", ".venv", "__pycache__", "dist", "build", ".next",
  "out", "bin", "obj", "target", "Pods", ".gradle", ".expo", ".dart_tool",
  "logs", ".cache", "tmp", ".git",
];
const EXCLUDED_FILE_RE = /(?:\.min\.(?:js|css)|\.lock|\.log|\.pem|\.key|\.pyc|\.map)$/;

interface Args {
  scope: Scope | null;
  range: string | null;
  base: string | null;
  head: string | null;
  target: string | null;
  root: string;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nresolve_scope.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  const args: Args = { scope: null, range: null, base: null, head: null, target: null, root: "." };
  const valued: Record<string, keyof Args> = {
    "--scope": "scope", "--range": "range", "--base": "base",
    "--head": "head", "--target": "target", "--root": "root",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    }
    const eq = a.indexOf("=");
    const flag = eq === -1 ? a : a.slice(0, eq);
    const key = valued[flag];
    if (key === undefined) {
      printUsageError(`unrecognized argument: ${a}`);
      return null;
    }
    let value: string;
    if (eq !== -1) {
      value = a.slice(eq + 1);
    } else {
      if (i + 1 >= argv.length) {
        printUsageError(`argument ${flag}: expected one argument`);
        return null;
      }
      value = argv[++i]!;
    }
    (args as Record<string, unknown>)[key] = value;
  }
  if (args.scope === null) {
    printUsageError("argument --scope is required");
    return null;
  }
  if (!(SCOPES as readonly string[]).includes(args.scope)) {
    printUsageError(`argument --scope: invalid choice '${args.scope}' (choose from ${SCOPES.join(", ")})`);
    return null;
  }
  if (args.scope === "range" && args.range === null) {
    printUsageError("--scope range requires --range");
    return null;
  }
  if (args.scope === "files" && args.target === null) {
    printUsageError("--scope files requires --target");
    return null;
  }
  return args;
}

/** Runs git and returns stdout, or null when git itself failed. */
function git(root: string, gitArgs: string[], quiet = false): string | null {
  const proc = Bun.spawnSync(["git", ...gitArgs], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    if (!quiet) process.stderr.write(new TextDecoder().decode(proc.stderr));
    return null;
  }
  return new TextDecoder().decode(proc.stdout);
}

function lines(out: string | null): string[] {
  return (out ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

function isExcluded(p: string): boolean {
  if (EXCLUDED_FILE_RE.test(p)) return true;
  return p.split("/").some((seg) => EXCLUDED_SEGMENTS.includes(seg));
}

/**
 * The base ref for a branch comparison, when the user named none.
 *
 * `origin/HEAD` is the repository's own answer and is preferred over guessing
 * `main`; the fallbacks exist because a clone made with `--single-branch` has no
 * `origin/HEAD` symref at all. Returning null rather than defaulting silently is
 * deliberate: audit-scope.md says "Do not invent a base."
 */
function defaultBase(root: string): string | null {
  const symref = git(root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], true);
  if (symref) return symref.trim().replace(/^refs\/remotes\//, "");
  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    if (git(root, ["rev-parse", "--verify", "--quiet", candidate], true)) return candidate;
  }
  return null;
}

interface Packet {
  scopeType: Scope;
  targetFocus: string | null;
  resolutionMethod: string;
  base: string | null;
  head: string | null;
  files: string[];
  excluded: string[];
  freshness: string;
}

function resolve(args: Args): Packet | null {
  const scope = args.scope!;
  let method: string;
  let base: string | null = null;
  let head: string | null = null;
  let raw: string[];

  if (scope === "modified") {
    method = "git status --porcelain --untracked-files=all (staged, unstaged, and untracked)";
    head = "working-tree";
    base = "HEAD";
    // `--porcelain` covers untracked files, which `git diff --name-only` omits;
    // audit-scope.md counts relevant untracked source as in scope.
    // --untracked-files=all, not the default `normal`: git collapses an entirely
    // untracked directory to a single `?? src/` entry, and a scope packet listing
    // `src/` instead of the files under it under-reports the audit surface.
    const out = git(args.root, ["status", "--porcelain", "--untracked-files=all"]);
    if (out === null) return null;
    // Not lines(): porcelain columns are `XY<space>path`, and X is a space for
    // an unstaged-only change. Trimming the line first eats that column and
    // then slice(3) eats the path's first character instead.
    raw = out.split("\n").filter((l) => l.length > 3).map((l) => {
      const path = l.slice(3);
      // A rename is `R  old -> new`; the audit target is the new path.
      const arrow = path.indexOf(" -> ");
      return arrow === -1 ? path : path.slice(arrow + 4);
    });
  } else if (scope === "range") {
    method = `git diff --name-only ${args.range}`;
    const [b, h] = args.range!.split("..");
    base = b || null;
    head = h || "HEAD";
    const out = git(args.root, ["diff", "--name-only", args.range!]);
    if (out === null) return null;
    raw = lines(out);
  } else if (scope === "branch") {
    base = args.base ?? defaultBase(args.root);
    if (base === null) {
      process.stderr.write(
        "resolve_scope: no base ref could be resolved and none was given. Pass --base; do not invent a base.\n",
      );
      return null;
    }
    head = args.head ?? "HEAD";
    method = `git diff --name-only ${base}...${head} (merge-base three-dot)`;
    const out = git(args.root, ["diff", "--name-only", `${base}...${head}`]);
    if (out === null) return null;
    raw = lines(out);
  } else if (scope === "files") {
    method = `git ls-files -- ${args.target}`;
    const out = git(args.root, ["ls-files", "--", args.target!]);
    if (out === null) return null;
    raw = lines(out);
    if (raw.length === 0) {
      process.stderr.write(
        `resolve_scope: pathspec '${args.target}' matched no tracked file. Ask for a concrete target.\n`,
      );
      return null;
    }
  } else {
    method = "git ls-files (whole repository — explicitly requested scope only)";
    const out = git(args.root, ["ls-files"]);
    if (out === null) return null;
    raw = lines(out);
  }

  const excluded = raw.filter(isExcluded).sort();
  const files = raw.filter((p) => !isExcluded(p)).sort();
  return {
    scopeType: scope,
    targetFocus: args.target,
    resolutionMethod: method,
    base,
    head,
    files,
    excluded,
    freshness: new Date().toISOString(),
  };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;
  const packet = resolve(args);
  if (packet === null) return 1;
  console.log(JSON.stringify(packet, null, 2));
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
