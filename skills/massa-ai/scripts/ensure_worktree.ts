#!/usr/bin/env bun
/**
 * ensure_worktree.ts - Stage 0-1 of the Implementation Delivery Protocol.
 *
 * `references/implementation-delivery.md` Stage 0 records which capabilities are
 * present, and Stage 1 fetches the base and creates a worktree on a new branch
 * before the first repository mutation. This runs both and prints the worktree
 * path and branch — the isolation evidence Stage 1 requires be recorded the
 * moment it completes. Bun builtins only, zero dependencies, agent-agnostic.
 *
 * This is the HOW, not the WHEN. The Isolation Gate line in each of the 16
 * implementation workflows is what decides that isolation is due; it is
 * byte-identical across those files and gated by
 * `scripts/__tests__/workflow-harness-contract.test.ts`, and nothing here
 * replaces it.
 *
 * The two legal skips are the reference's, quoted verbatim, and the script
 * refuses to invent a third:
 *   1. The target is not a git repository.
 *   2. The user explicitly declined isolation for this task.
 * Only the first is detectable from the tree, and only that one is emitted
 * automatically. The second must be passed with --skip-declined, because a
 * script cannot observe a user declining anything.
 *
 * Failure handling mirrors the Stage 1 table: a taken branch name is suffixed
 * `-2`, `-3`, ...; a taken worktree path is reused ONLY when its branch already
 * matches, and is otherwise an error rather than a silent reuse.
 *
 * Usage:
 *   bun skills/massa-ai/scripts/ensure_worktree.ts --branch feat/login-retry
 *   bun skills/massa-ai/scripts/ensure_worktree.ts --branch fix/x --base main --path ../wt-fix-x
 *   bun skills/massa-ai/scripts/ensure_worktree.ts --skip-declined
 *   bun skills/massa-ai/scripts/ensure_worktree.ts --branch feat/x --dry-run
 *
 * Exit codes: 0 isolated or legally skipped, 1 isolation failed, 2 usage error.
 */

import path from "node:path";
import { realpathSync } from "node:fs";

const USAGE =
  "usage: ensure_worktree.ts [-h] (--branch BRANCH | --skip-declined) [--base REF] [--path DIR] [--root ROOT] [--dry-run] [--json]";
const HELP = `${USAGE}

Run Stage 0-1 of references/implementation-delivery.md and print the isolation evidence.

options:
  -h, --help          show this help message and exit
  --branch BRANCH     branch to create, e.g. feat/login-retry
  --base REF          base ref to branch from (default: origin/HEAD, then main)
  --path DIR          worktree directory (default: ../<repo>-<branch slug> beside the repo)
  --root ROOT         run git in this directory (default: cwd)
  --skip-declined     record the "user explicitly declined isolation" skip and exit 0
  --dry-run           print the commands that would run, change nothing
  --json              emit a JSON object instead of the text report`;

interface Args {
  branch: string | null;
  base: string | null;
  worktreePath: string | null;
  root: string;
  skipDeclined: boolean;
  dryRun: boolean;
  json: boolean;
}

interface Result {
  isolated: boolean;
  worktreePath: string | null;
  branch: string | null;
  base: string | null;
  skipReason: string | null;
  capabilities: { gitRepo: boolean; gh: boolean; ghAuthenticated: boolean };
  commands: string[];
}

/** The reference's two legal skip reasons, verbatim. Any third is a protocol violation. */
const SKIP_NOT_A_REPO = "The target is not a git repository.";
const SKIP_USER_DECLINED = "The user explicitly declined isolation for this task.";

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nensure_worktree.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  const args: Args = {
    branch: null, base: null, worktreePath: null, root: ".",
    skipDeclined: false, dryRun: false, json: false,
  };
  const valued: Record<string, keyof Args> = {
    "--branch": "branch", "--base": "base", "--path": "worktreePath", "--root": "root",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    }
    if (a === "--skip-declined") { args.skipDeclined = true; continue; }
    if (a === "--dry-run") { args.dryRun = true; continue; }
    if (a === "--json") { args.json = true; continue; }
    const eq = a.indexOf("=");
    const flag = eq === -1 ? a : a.slice(0, eq);
    const key = valued[flag];
    if (key === undefined) {
      printUsageError(`unrecognized argument: ${a}`);
      return null;
    }
    let value: string;
    if (eq !== -1) value = a.slice(eq + 1);
    else {
      if (i + 1 >= argv.length) {
        printUsageError(`argument ${flag}: expected one argument`);
        return null;
      }
      value = argv[++i]!;
    }
    (args as Record<string, unknown>)[key] = value;
  }
  if (!args.skipDeclined && args.branch === null) {
    printUsageError("one of --branch or --skip-declined is required");
    return null;
  }
  return args;
}

interface Run { ok: boolean; stdout: string; stderr: string }

function run(root: string, cmd: string[]): Run {
  const proc = Bun.spawnSync(cmd, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const dec = new TextDecoder();
  return { ok: proc.exitCode === 0, stdout: dec.decode(proc.stdout), stderr: dec.decode(proc.stderr) };
}

function git(root: string, gitArgs: string[]): Run {
  return run(root, ["git", ...gitArgs]);
}

/** See resolve_scope.ts's defaultBase — same rule, same reason not to invent one. */
function defaultBase(root: string): string | null {
  const symref = git(root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  if (symref.ok) return symref.stdout.trim().replace(/^refs\/remotes\//, "");
  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    if (git(root, ["rev-parse", "--verify", "--quiet", candidate]).ok) return candidate;
  }
  return null;
}

/** `feat/login-retry` -> `login-retry`, for the default worktree directory name. */
function slug(branch: string): string {
  return branch.replace(/[^A-Za-z0-9._/-]/g, "-").split("/").filter(Boolean).join("-");
}

/** First free branch name: `name`, then `name-2`, `name-3`, ... per the Stage 1 table. */
function freeBranch(root: string, wanted: string): string {
  if (!git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${wanted}`]).ok) return wanted;
  for (let n = 2; n < 100; n++) {
    const candidate = `${wanted}-${n}`;
    if (!git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`]).ok) return candidate;
  }
  return `${wanted}-${Date.now()}`;
}

/**
 * Canonical form for comparing two paths that may differ only by a symlink.
 *
 * On macOS the system temp dir is `/var/folders/...`, a symlink to
 * `/private/var/folders/...`, and `git worktree list` reports the resolved
 * form while an argument-derived path keeps the unresolved one. `path.resolve`
 * does not resolve symlinks, so comparing with it alone reports "no worktree
 * here" for a worktree that is very much here.
 */
function canonical(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** The branch an existing worktree at `dir` is on, or null when there is none. */
function worktreeBranchAt(root: string, dir: string): string | null {
  const out = git(root, ["worktree", "list", "--porcelain"]);
  if (!out.ok) return null;
  const want = canonical(path.resolve(root, dir));
  let current: string | null = null;
  for (const line of out.stdout.split("\n")) {
    if (line.startsWith("worktree ")) current = line.slice("worktree ".length).trim();
    else if (line.startsWith("branch ") && current !== null && canonical(current) === want) {
      return line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    }
  }
  return null;
}

function ensure(args: Args): Result {
  const commands: string[] = [];
  const isRepo = git(args.root, ["rev-parse", "--is-inside-work-tree"]).ok;
  const ghProbe = run(args.root, ["command", "-v", "gh"]);
  const gh = ghProbe.ok || Bun.which("gh") !== null;
  const ghAuthenticated = gh && run(args.root, ["gh", "auth", "status"]).ok;
  const capabilities = { gitRepo: isRepo, gh, ghAuthenticated };

  if (!isRepo) {
    return { isolated: false, worktreePath: null, branch: null, base: null, skipReason: SKIP_NOT_A_REPO, capabilities, commands };
  }
  if (args.skipDeclined) {
    return { isolated: false, worktreePath: null, branch: null, base: null, skipReason: SKIP_USER_DECLINED, capabilities, commands };
  }

  const base = args.base ?? defaultBase(args.root);
  if (base === null) {
    throw new Error("no base ref could be resolved and none was given. Pass --base; do not invent a base.");
  }
  const wanted = args.branch!;
  const repoName = path.basename(path.resolve(args.root));
  const dir = args.worktreePath ?? path.join("..", `${repoName}-${slug(wanted)}`);

  // Resolve the existing-worktree question BEFORE bumping the branch name.
  // Bumping first turns the reuse case into a mismatch against a name the
  // caller never asked for: the path is on `feat/x`, the bumped request is
  // `feat/x-2`, and a legal reuse reads as a collision.
  const existingBranch = worktreeBranchAt(args.root, dir);
  if (existingBranch !== null && !args.dryRun) {
    // Stage 1: "Worktree path taken -> reuse it only if its branch matches."
    if (existingBranch !== wanted) {
      throw new Error(
        `worktree path ${dir} already exists on branch '${existingBranch}', not '${wanted}'. Reuse is legal only when the branch matches.`,
      );
    }
    return {
      isolated: true,
      worktreePath: path.resolve(args.root, dir),
      branch: existingBranch,
      base,
      skipReason: null,
      capabilities,
      commands: [`# reused existing worktree at ${dir} on ${existingBranch}`],
    };
  }

  const branch = freeBranch(args.root, wanted);

  // `git fetch origin <base>` only makes sense for a remote-tracking base; a
  // purely local base has nothing to fetch and the fetch would fail noisily.
  const remoteBase = base.startsWith("origin/") ? base.slice("origin/".length) : null;
  if (remoteBase !== null) commands.push(`git fetch origin ${remoteBase}`);
  commands.push(`git worktree add -b ${branch} ${dir} ${base}`);

  if (args.dryRun) {
    return { isolated: false, worktreePath: path.resolve(args.root, dir), branch, base, skipReason: null, capabilities, commands };
  }

  if (remoteBase !== null) {
    const fetched = git(args.root, ["fetch", "origin", remoteBase]);
    if (!fetched.ok) throw new Error(`git fetch origin ${remoteBase} failed: ${fetched.stderr.trim()}`);
  }
  const added = git(args.root, ["worktree", "add", "-b", branch, dir, base]);
  if (!added.ok) throw new Error(`git worktree add failed: ${added.stderr.trim()}`);

  return { isolated: true, worktreePath: path.resolve(args.root, dir), branch, base, skipReason: null, capabilities, commands };
}

function report(r: Result, dryRun: boolean): void {
  const cap = r.capabilities;
  console.log(`git repository: ${cap.gitRepo ? "yes" : "no"}`);
  console.log(`gh:             ${cap.gh ? (cap.ghAuthenticated ? "present, authenticated" : "present, NOT authenticated") : "absent"}`);
  if (!cap.gh || !cap.ghAuthenticated) {
    console.log("                -> Stage 4 takes the degraded path in references/implementation-delivery.md");
  }
  console.log("");
  if (r.skipReason !== null) {
    console.log("isolation SKIPPED, legal reason (record it verbatim in the completion report):");
    console.log(`  ${r.skipReason}`);
    return;
  }
  for (const c of r.commands) console.log(`  $ ${c}`);
  console.log("");
  if (dryRun) {
    console.log("dry run — nothing was changed.");
    return;
  }
  console.log("isolation evidence — record both in the session status now:");
  console.log(`  worktree path: ${r.worktreePath}`);
  console.log(`  branch:        ${r.branch} (from ${r.base})`);
  console.log("");
  console.log("A fresh worktree has no node_modules, no dist and no .env. Provision it");
  console.log("before the first gate; a gate that fails only for that is an environment");
  console.log("failure, not a code failure.");
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;
  let result: Result;
  try {
    result = ensure(args);
  } catch (err) {
    process.stderr.write(`ensure_worktree: ${(err as Error).message}\n`);
    return 1;
  }
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else report(result, args.dryRun);
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
