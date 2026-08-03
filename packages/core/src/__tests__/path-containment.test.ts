/**
 * Unit tests for `services/file-read/path-containment.ts` — module 2 of the
 * `tools/read_file.ts` extraction (PR-D, T9).
 *
 * `read-file-containment.test.ts` (7 cases) and `read-file-containment-shapes.test.ts`
 * (RFS-06's three mutation shapes) both drive this code through
 * `ReadFileTool.handle()`, which is the right surface for them: they must pass
 * unchanged across the move, so they may not name a member the move relocates.
 * The cost is that neither can reach a branch `handle()` does not route to.
 *
 * This file reaches the module directly and takes the branches those two
 * cannot: `resolveFilePath`'s null exits, the exact-root case (`rel === ""`),
 * and the cross-drive `path.isAbsolute(rel)` guard, which `spec.md` RFS-06
 * records as DEAD ON EVERY CI RUN — both runners are POSIX, where
 * `path.relative` between two absolute paths is never itself absolute.
 *
 * DEBT-02's coverage floor is per file and applies to this module alone (R-36).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "path";
import os from "os";
import fs from "fs";

import { PathContainment } from "../services/file-read/path-containment.js";
import type { ProjectRootCache } from "../services/file-read/project-root-cache.js";

/** Module 2 takes module 3 as a constructor dependency, so a stub is enough —
 *  no module mock, no event bus, no workspace repository. */
const rootsStub = (roots: Record<string, string>): ProjectRootCache =>
  ({
    getProjectRoot: async (projectId: string) => roots[projectId] ?? null,
  }) as unknown as ProjectRootCache;

/** The roots the teaching error enumerates, in order. Parsed rather than
 *  substring-matched: the message also echoes the REJECTED TARGET, so any
 *  `not.toContain(<a path>)` assertion over the whole message is unsound. */
const listedRoots = (error: string): string[] =>
  error
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.trim().slice(2));

const PREV_ROOTS = process.env.MASSA_AI_READ_FILE_ROOTS;
beforeEach(() => {
  delete process.env.MASSA_AI_READ_FILE_ROOTS;
});
afterEach(() => {
  if (PREV_ROOTS === undefined) delete process.env.MASSA_AI_READ_FILE_ROOTS;
  else process.env.MASSA_AI_READ_FILE_ROOTS = PREV_ROOTS;
});

describe("PathContainment.resolveFilePath", () => {
  test("an absolute path is returned normalized and base-independent", async () => {
    const pc = new PathContainment(rootsStub({}));
    const abs = path.join(os.tmpdir(), "somewhere", "file.ts");
    expect(await pc.resolveFilePath(`${abs}/../file.ts`)).toBe(abs);
  });

  test("a relative path with a projectId resolves under the workspace root", async () => {
    const pc = new PathContainment(rootsStub({ "proj-a": "/ws/proj-a" }));
    expect(await pc.resolveFilePath("src/index.ts", "proj-a")).toBe("/ws/proj-a/src/index.ts");
  });

  test("sanitizeFilePath strips traversal so a crafted relative path cannot escape the root", async () => {
    const pc = new PathContainment(rootsStub({ "proj-a": "/ws/proj-a" }));
    const resolved = await pc.resolveFilePath("../../etc/passwd", "proj-a");

    // The predicate is CONTAINMENT-RELATIVE, not "carries no literal `..`":
    // path.resolve normalizes `..` away on every exit, so a no-`..` assertion
    // passes with and without the sanitize call (C37, tasks.md §10.2).
    expect(resolved).not.toBeNull();
    const rel = path.relative("/ws/proj-a", resolved!);
    expect(rel.startsWith("..")).toBe(false);
  });

  test("a relative path with a projectId whose root does not resolve returns null", async () => {
    const pc = new PathContainment(rootsStub({}));
    expect(await pc.resolveFilePath("src/index.ts", "proj-unknown")).toBeNull();
  });

  test("a relative path with NO projectId returns null — never a cwd guess", async () => {
    const pc = new PathContainment(rootsStub({}));
    expect(await pc.resolveFilePath("src/index.ts")).toBeNull();
  });
});

describe("PathContainment.checkPathContainment", () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    // Every shape owns a private container: dirname(mkdtempSync(os.tmpdir(), …))
    // IS os.tmpdir(), so two fixtures using the natural convention would share a
    // parent and one shape's "outside" would be another's allowed root.
    const box = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-pathcont-"));
    root = fs.mkdtempSync(path.join(box, "root-"));
    outside = fs.mkdtempSync(path.join(box, "outside-"));
  });

  test("a file under the project root is allowed", async () => {
    const pc = new PathContainment(rootsStub({ "proj-a": root }));
    const r = await pc.checkPathContainment(path.join(root, "src", "a.ts"), "proj-a");
    expect(r.allowed).toBe(true);
  });

  test("the project root ITSELF is allowed — the rel === \"\" exact-match branch", async () => {
    const pc = new PathContainment(rootsStub({ "proj-a": root }));
    const r = await pc.checkPathContainment(root, "proj-a");
    expect(r.allowed).toBe(true);
  });

  test("a file under process.cwd() is allowed with no projectId at all", async () => {
    const pc = new PathContainment(rootsStub({}));
    const r = await pc.checkPathContainment(path.join(process.cwd(), "package.json"));
    expect(r.allowed).toBe(true);
  });

  test("a file outside every root is rejected", async () => {
    const pc = new PathContainment(rootsStub({ "proj-a": root }));
    const r = await pc.checkPathContainment(path.join(outside, "secret.txt"), "proj-a");
    expect(r.allowed).toBe(false);
  });

  test("path.dirname(root) is rejected — the one target whose rel is the bare \"..\"", async () => {
    // RFS-06 shape (a): `rel.startsWith("..")` narrowed to `rel.startsWith("../")`
    // survives every sibling-directory fixture and fails only here.
    const pc = new PathContainment(rootsStub({ "proj-a": root }));
    const r = await pc.checkPathContainment(path.dirname(root), "proj-a");
    expect(r.allowed).toBe(false);
    expect(path.relative(root, path.dirname(root))).toBe("..");
  });

  test("an unresolvable projectId falls back to cwd only, and rejects outside it", async () => {
    const pc = new PathContainment(rootsStub({}));
    const r = await pc.checkPathContainment(path.join(outside, "secret.txt"), "proj-unknown");
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    // Assert on the ENUMERATED ROOTS, not on the whole message: the teaching
    // error echoes the rejected target by design, and that target is under
    // `outside`, so a substring check on the message can never be clean.
    expect(listedRoots(r.error)).toEqual([path.resolve(process.cwd())]);
  });

  test("MASSA_AI_READ_FILE_ROOTS admits an extra root, colon-separated", async () => {
    const pc = new PathContainment(rootsStub({}));
    const target = path.join(outside, "allowed.txt");
    expect((await pc.checkPathContainment(target)).allowed).toBe(false);

    process.env.MASSA_AI_READ_FILE_ROOTS = `  ${outside}  :`;
    // Blank and whitespace-only entries are dropped rather than resolving to cwd.
    expect((await pc.checkPathContainment(target)).allowed).toBe(true);
  });

  test("the env allowlist is read at CALL TIME, not at construction time", async () => {
    // RFS-06 AC-3 / shape (b). The property has no structural witness — only a
    // comment asserts it — and all 7 pre-existing tests construct a FRESH tool
    // after mutating the env, so a hoist to construction time is invisible to
    // every one of them. This constructs ONCE and mutates the env between reads.
    const pc = new PathContainment(rootsStub({}));
    const target = path.join(outside, "later.txt");

    expect((await pc.checkPathContainment(target)).allowed).toBe(false);
    process.env.MASSA_AI_READ_FILE_ROOTS = outside;
    expect((await pc.checkPathContainment(target)).allowed).toBe(true);
    delete process.env.MASSA_AI_READ_FILE_ROOTS;
    expect((await pc.checkPathContainment(target)).allowed).toBe(false);
  });

  test("the teaching error enumerates roots ONLY, and never a host path", async () => {
    // RFS-06 AC-2. Asserted on the enumerated SET, because a presence/absence
    // pair stays green under a leak that adds a root nobody asked about.
    const pc = new PathContainment(rootsStub({ "proj-a": root }));
    const r = await pc.checkPathContainment(path.join(outside, "secret.txt"), "proj-a");

    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.error).toContain("read_file path containment:");
    expect(r.error).toContain("Valid roots (project root + cwd + MASSA_AI_READ_FILE_ROOTS):");
    expect(r.error).toContain("Provide a filePath that resolves under one of these roots.");

    // Exactly the roots that were in play — asserted as a SET, not as a
    // presence/absence pair. The existing suite's "root present + /etc/passwd
    // absent" pair stays green under a $HOME leak (tasks.md §10.2), which is
    // precisely the mutation this predicate has to see.
    expect(listedRoots(r.error)).toEqual([path.resolve(root), path.resolve(process.cwd())]);
  });

  test("the cross-drive guard is unreachable on POSIX, and that is recorded not asserted", () => {
    // spec.md RFS-06 "Logged, not tested": path.relative between two absolute
    // POSIX paths is never itself absolute, so `path.isAbsolute(rel)` at the
    // containment predicate is dead on both CI runners. Pinning the premise
    // rather than the branch keeps the claim falsifiable if it ever changes.
    expect(path.isAbsolute(path.relative("/a/b", "/c/d"))).toBe(false);
    expect(path.sep).toBe("/");
  });
});
