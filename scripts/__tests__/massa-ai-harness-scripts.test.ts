/**
 * Gate for the three harness scripts added alongside the workflow slimming:
 * `size_change.ts`, `resolve_scope.ts` and `ensure_worktree.ts`.
 *
 * Each script replaces a piece of arithmetic or shell transcription a workflow
 * used to spell out in prose, so the thing under test is the ANSWER, not that
 * the script runs. Every assertion below is written to fail on a plausible
 * one-line mutation of the script rather than on a crash:
 *
 *   - tier boundaries are probed AT the bound and one past it, both sides, so
 *     flipping a `<=` to a `<` fails;
 *   - changed LOC is asserted on a pure rewrite (equal adds and deletes), where
 *     "added only" and "added + deleted" give different answers;
 *   - the porcelain path column is asserted on an UNSTAGED change, the only
 *     case where the leading status column is a space and a `.trim()` would eat
 *     the path's first character (the defect this suite caught while it was
 *     being written);
 *   - `ensure_worktree` is asserted to refuse a mismatched existing worktree
 *     rather than reuse it, which is the difference between the reference's
 *     rule and "reuse whatever is there".
 *
 * Every test builds its own git repository under a temp dir, so nothing here
 * reads the repository it ships in — a suite that sized THIS tree would change
 * its own answer with every commit.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import { tierFloor } from "../../skills/massa-ai/scripts/size_change.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const SCRIPTS = path.join(REPO_ROOT, "skills", "massa-ai", "scripts");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "harness-scripts-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a shell command in `cwd`, capturing both streams and the exit code. */
function sh(cwd: string, cmd: string[]): RunResult {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const dec = new TextDecoder();
  return {
    code: proc.exitCode ?? -1,
    stdout: dec.decode(proc.stdout),
    stderr: dec.decode(proc.stderr),
  };
}

function script(name: string, cwd: string, args: string[]): RunResult {
  return sh(cwd, ["bun", path.join(SCRIPTS, name), "--root", cwd, ...args]);
}

/** Writes a file under the temp repo, creating parent directories. */
function write(rel: string, body: string): void {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body, "utf8");
}

/** A git repo with one commit, deterministic identity, no signing, no hooks. */
function initRepo(): void {
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  sh(dir, ["git", "config", "user.email", "t@example.com"]);
  sh(dir, ["git", "config", "user.name", "T"]);
  sh(dir, ["git", "config", "commit.gpgsign", "false"]);
  write("seed.txt", "seed\n");
  sh(dir, ["git", "add", "-A"]);
  sh(dir, ["git", "commit", "-qm", "chore: seed"]);
}

/** `n` distinct lines, so a rewrite produces exactly `n` adds and `n` deletes. */
function body(n: number, tag: string): string {
  return Array.from({ length: n }, (_, i) => `${tag} line ${i}`).join("\n") + "\n";
}

// ── portability: nothing is spawned that only exists on one runner ─────────

describe("portability: no harness script spawns a shell builtin", () => {
  /**
   * `command`, `type` and `which` are POSIX shell builtins. macOS ALSO ships
   * `/usr/bin/command`, so `Bun.spawnSync(["command", "-v", "gh"])` succeeds
   * there and dies with ENOENT on Ubuntu — where the process exits 1 with an
   * empty stdout and every downstream assertion reads as a logic failure.
   *
   * That shipped in `ensure_worktree.ts` and was caught only by CI's Linux
   * runner, after the whole macOS suite went green. A per-platform sensor is
   * not a sensor, so this asserts the class on the source instead: the
   * portable spelling is `Bun.which`.
   *
   * Matched on the ARGV ARRAY, not on `Bun.spawnSync(` — the first version of
   * this guard anchored on the call and stayed green against the very defect it
   * was written for, because these scripts spawn through a local `run()`/`git()`
   * wrapper and the builtin never sits next to `spawnSync`. The argv array is
   * the thing that travels to the kernel, so it is the thing to check.
   */
  const SHELL_BUILTIN_SPAWN = /\[\s*["'](?:command|type|which|source|hash|eval|export)["']\s*,/;
  const SCRIPT_FILES = [
    "size_change.ts",
    "resolve_scope.ts",
    "ensure_worktree.ts",
    "check_commit.ts",
  ] as const;

  for (const name of SCRIPT_FILES) {
    test(`${name} spawns no shell builtin`, async () => {
      const text = await Bun.file(path.join(SCRIPTS, name)).text();
      expect(SHELL_BUILTIN_SPAWN.test(text)).toBe(false);
    });
  }

  test("the pattern matches the spelling it bans, through a wrapper too", () => {
    // Guard the guard: a regex that stopped matching would clear every file.
    // The wrapper case is the one that matters — it is how the real defect was
    // written, and how the first version of this guard missed it.
    expect(SHELL_BUILTIN_SPAWN.test('const p = Bun.spawnSync(["command", "-v", "gh"]);')).toBe(true);
    expect(SHELL_BUILTIN_SPAWN.test('const gh = run(args.root, ["command", "-v", "gh"]).ok;')).toBe(true);
    expect(SHELL_BUILTIN_SPAWN.test('const p = git(root, ["status", "--porcelain"]);')).toBe(false);
    expect(SHELL_BUILTIN_SPAWN.test('const gh = Bun.which("gh") !== null;')).toBe(false);
  });

  test("ensure_worktree still reports gh capability, by the portable route", () => {
    initRepo();
    const out = JSON.parse(
      script("ensure_worktree.ts", dir, ["--branch", "feat/x", "--base", "main", "--path", path.join(dir, "wt-cap"), "--json"]).stdout,
    );
    // Whatever the runner has, the field must be a real boolean — not missing,
    // which is what an aborted capability probe would leave behind.
    expect(typeof out.capabilities.gh).toBe("boolean");
    expect(typeof out.capabilities.ghAuthenticated).toBe("boolean");
  });
});

// ── size_change: the tier boundary ─────────────────────────────────────────

describe("size_change: tierFloor sits exactly on the ladder's bounds", () => {
  // AT the bound and one past it, on both axes. A `<=` flipped to `<` in either
  // Quick condition fails the first row; a bound moved by one fails a pair.
  const CASES: Array<[files: number, loc: number, expected: string]> = [
    [3, 200, "quick"],
    [4, 200, "standard"],
    [3, 201, "standard"],
    [10, 500, "standard"],
    [11, 500, "spec-driven"],
    [10, 501, "spec-driven"],
    [1, 0, "quick"],
    [0, 0, "quick"],
  ];

  for (const [files, loc, expected] of CASES) {
    test(`${files} files / ${loc} LOC -> ${expected}`, () => {
      expect(tierFloor(files, loc)).toBe(expected);
    });
  }

  test("either axis alone can escalate to spec-driven", () => {
    // Guards the documented escalating reading of the ladder's overlapping
    // "or"/"," clauses. An implementation that required BOTH bounds to be
    // exceeded would return "standard" for both of these.
    expect(tierFloor(50, 10)).toBe("spec-driven");
    expect(tierFloor(2, 5000)).toBe("spec-driven");
  });
});

describe("size_change: counts come from the tree", () => {
  test("changed LOC counts deletions, not just additions", () => {
    initRepo();
    write("a.txt", body(10, "old"));
    sh(dir, ["git", "add", "-A"]);
    sh(dir, ["git", "commit", "-qm", "feat: a"]);
    // A pure rewrite: 10 added, 10 deleted. "adds only" reads 10; the ladder's
    // "changed LOC" reads 20.
    write("a.txt", body(10, "new"));

    const r = script("size_change.ts", dir, ["--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.added).toBe(10);
    expect(out.deleted).toBe(10);
    expect(out.changedLoc).toBe(20);
    expect(out.files).toBe(1);
  });

  test("--staged sizes the index, not the working tree", () => {
    initRepo();
    write("staged.txt", body(5, "s"));
    sh(dir, ["git", "add", "staged.txt"]);
    write("unstaged.txt", body(5, "u"));

    const staged = JSON.parse(script("size_change.ts", dir, ["--staged", "--json"]).stdout);
    expect(staged.files).toBe(1);
    expect(staged.perFile[0].path).toBe("staged.txt");
  });

  test("a binary file counts as a file and contributes no LOC", () => {
    initRepo();
    writeFileSync(path.join(dir, "blob.bin"), Buffer.from([0, 1, 2, 0, 255, 0]));
    sh(dir, ["git", "add", "-A"]);
    sh(dir, ["git", "commit", "-qm", "feat: blob"]);
    writeFileSync(path.join(dir, "blob.bin"), Buffer.from([0, 9, 9, 0, 255, 0, 7]));

    const out = JSON.parse(script("size_change.ts", dir, ["--json"]).stdout);
    expect(out.files).toBe(1);
    expect(out.binaryFiles).toBe(1);
    expect(out.changedLoc).toBe(0);
  });

  test("--staged and --range together is a usage error, not a silent precedence", () => {
    initRepo();
    const r = script("size_change.ts", dir, ["--staged", "--range", "main..HEAD"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("mutually exclusive");
  });
});

// ── resolve_scope: the packet ──────────────────────────────────────────────

describe("resolve_scope: the packet describes the tree it was run against", () => {
  test("modified scope keeps the whole path of an UNSTAGED change", () => {
    initRepo();
    write("src/deep/file.ts", "export const a = 1;\n");
    sh(dir, ["git", "add", "-A"]);
    sh(dir, ["git", "commit", "-qm", "feat: file"]);
    // Unstaged only: porcelain emits " M src/deep/file.ts" with a LEADING space.
    write("src/deep/file.ts", "export const a = 2;\n");

    const r = script("resolve_scope.ts", dir, ["--scope", "modified"]);
    expect(r.code).toBe(0);
    const packet = JSON.parse(r.stdout);
    expect(packet.files).toEqual(["src/deep/file.ts"]);
  });

  test("modified scope includes untracked source and records a rename's new path", () => {
    initRepo();
    write("old-name.ts", "export const a = 1;\n");
    sh(dir, ["git", "add", "-A"]);
    sh(dir, ["git", "commit", "-qm", "feat: old"]);
    sh(dir, ["git", "mv", "old-name.ts", "new-name.ts"]);
    write("brand-new.ts", "export const b = 2;\n");

    const packet = JSON.parse(script("resolve_scope.ts", dir, ["--scope", "modified"]).stdout);
    expect(packet.files).toContain("new-name.ts");
    expect(packet.files).toContain("brand-new.ts");
    expect(packet.files).not.toContain("old-name.ts");
  });

  test("excluded paths are reported, not silently dropped", () => {
    initRepo();
    write("src/real.ts", "export const a = 1;\n");
    write("node_modules/pkg/index.js", "module.exports = 1;\n");
    write("dist/bundle.js", "1;\n");

    const packet = JSON.parse(script("resolve_scope.ts", dir, ["--scope", "modified"]).stdout);
    expect(packet.files).toEqual(["src/real.ts"]);
    expect(packet.excluded.sort()).toEqual(["dist/bundle.js", "node_modules/pkg/index.js"]);
  });

  test("a segment match does not catch a path that merely starts with the word", () => {
    // `dist` is excluded; `dist-helper.ts` and `src/distance.ts` are not.
    initRepo();
    write("dist-helper.ts", "export const a = 1;\n");
    write("src/distance.ts", "export const b = 2;\n");

    const packet = JSON.parse(script("resolve_scope.ts", dir, ["--scope", "modified"]).stdout);
    expect(packet.files.sort()).toEqual(["dist-helper.ts", "src/distance.ts"]);
    expect(packet.excluded).toEqual([]);
  });

  test("a pathspec matching nothing fails instead of emitting an empty packet", () => {
    initRepo();
    const r = script("resolve_scope.ts", dir, ["--scope", "files", "--target", "nope/**"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("matched no tracked file");
  });

  test("--scope files without --target is a usage error", () => {
    initRepo();
    const r = script("resolve_scope.ts", dir, ["--scope", "files"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("requires --target");
  });

  test("branch scope with no resolvable base refuses rather than inventing one", () => {
    // A repo whose only branch is `work`: no origin, no main, no master.
    sh(dir, ["git", "init", "-q", "-b", "work"]);
    sh(dir, ["git", "config", "user.email", "t@example.com"]);
    sh(dir, ["git", "config", "user.name", "T"]);
    write("seed.txt", "seed\n");
    sh(dir, ["git", "add", "-A"]);
    sh(dir, ["git", "commit", "-qm", "chore: seed"]);

    const r = script("resolve_scope.ts", dir, ["--scope", "branch"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("do not invent a base");
  });
});

// ── ensure_worktree: Stage 0-1 ─────────────────────────────────────────────

describe("ensure_worktree: Stage 0-1 of the delivery protocol", () => {
  test("creates the worktree on the requested branch and prints both as evidence", () => {
    initRepo();
    const target = path.join(dir, "wt");
    const r = script("ensure_worktree.ts", dir, ["--branch", "feat/x", "--base", "main", "--path", target, "--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.isolated).toBe(true);
    expect(out.branch).toBe("feat/x");
    expect(out.skipReason).toBeNull();
    // The branch really exists and the worktree really is on it.
    const list = sh(dir, ["git", "worktree", "list", "--porcelain"]).stdout;
    expect(list).toContain("branch refs/heads/feat/x");
  });

  test("a taken branch name is suffixed rather than reused", () => {
    initRepo();
    sh(dir, ["git", "branch", "feat/x"]);
    const out = JSON.parse(
      script("ensure_worktree.ts", dir, ["--branch", "feat/x", "--base", "main", "--path", path.join(dir, "wt2"), "--json"]).stdout,
    );
    expect(out.branch).toBe("feat/x-2");
  });

  test("an existing worktree on a DIFFERENT branch is an error, not a reuse", () => {
    initRepo();
    const target = path.join(dir, "shared");
    sh(dir, ["git", "worktree", "add", "-b", "other/branch", target, "main"]);

    const r = script("ensure_worktree.ts", dir, ["--branch", "feat/x", "--base", "main", "--path", target]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Reuse is legal only when the branch matches");
  });

  test("an existing worktree on the SAME branch is reused", () => {
    initRepo();
    const target = path.join(dir, "same");
    sh(dir, ["git", "worktree", "add", "-b", "feat/x", target, "main"]);

    const r = script("ensure_worktree.ts", dir, ["--branch", "feat/x", "--base", "main", "--path", target, "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).isolated).toBe(true);
  });

  test("a non-repository emits the first legal skip reason verbatim", () => {
    // No git init: the directory is not a work tree.
    const r = script("ensure_worktree.ts", dir, ["--branch", "feat/x", "--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.isolated).toBe(false);
    expect(out.skipReason).toBe("The target is not a git repository.");
    expect(out.capabilities.gitRepo).toBe(false);
  });

  test("--skip-declined emits the second legal skip reason verbatim and changes nothing", () => {
    initRepo();
    const before = sh(dir, ["git", "worktree", "list"]).stdout;
    const out = JSON.parse(script("ensure_worktree.ts", dir, ["--skip-declined", "--json"]).stdout);
    expect(out.isolated).toBe(false);
    expect(out.skipReason).toBe("The user explicitly declined isolation for this task.");
    expect(sh(dir, ["git", "worktree", "list"]).stdout).toBe(before);
  });

  test("the two skip reasons are the only ones the script can emit", () => {
    // A third reason would be a protocol violation presented as a shortcut, so
    // the source is asserted to define exactly two.
    const src = Bun.file(path.join(SCRIPTS, "ensure_worktree.ts"));
    return src.text().then((text) => {
      const declared = [...text.matchAll(/^const SKIP_[A-Z_]+ = "/gm)];
      expect(declared.length).toBe(2);
    });
  });

  test("--dry-run prints the commands and creates nothing", () => {
    initRepo();
    const target = path.join(dir, "wt-dry");
    const r = script("ensure_worktree.ts", dir, ["--branch", "feat/x", "--base", "main", "--path", target, "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("git worktree add -b feat/x");
    expect(r.stdout).toContain("dry run");
    expect(sh(dir, ["git", "worktree", "list"]).stdout).not.toContain("wt-dry");
  });

  test("neither --branch nor --skip-declined is a usage error", () => {
    initRepo();
    const r = script("ensure_worktree.ts", dir, []);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("one of --branch or --skip-declined is required");
  });
});
