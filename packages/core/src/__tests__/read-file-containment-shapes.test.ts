/**
 * RFS-06 AC-1, AC-2, AC-3 — the three containment mutation shapes, instrumented
 * BEFORE `checkPathContainment` moves.
 *
 * `spec.md` §5 RFS-06 measured three shapes a mechanical extraction plausibly
 * introduces and that ALL SEVEN existing tests in `read-file-containment.test.ts`
 * fail to kill. RFS-01's gate is structural and cannot tell a correct delegate
 * from a widened one (RFS-01 AC-6); `check-core-layering` cannot either. So
 * these tests are the containment check's only real sensor, and they must pass
 * against the PRE-EXTRACTION code — proving they hold today — and unmodified
 * after the move.
 *
 * (a) `rel.startsWith("..")` narrowed to `rel.startsWith("../")`
 *     (`read_file.ts:433`). Measured: `path.relative(root, target)` is the bare
 *     string ".." for EXACTLY ONE target — `path.dirname(root)`. A file in the
 *     parent gives "../secret.txt" and a prefix-named sibling gives
 *     "../ws-evil/f.txt"; both are rejected under either reading. The existing
 *     suite's only outside fixture is a sibling directory, and the string
 *     `dirname` does not occur in it.
 *
 * (b) the env allowlist read hoisted from CALL TIME (`read_file.ts:419-424`,
 *     the property `:400-402` asserts in a comment and nothing else witnesses)
 *     to construction time. All 7 existing tests construct a FRESH tool after
 *     any env mutation, so a hoist is invisible to every one of them.
 *
 * (c) `sanitizeFilePath` dropped from `resolveFilePath`'s projectId branch
 *     (`read_file.ts:378`). The existing test at `read-file-containment.test.ts:153-173`
 *     is ambiguous BY ITS OWN COMMENT — it accepts "either ENOENT ... or a
 *     containment error", so it cannot tell which of two independent defenses
 *     caught the traversal, and dropping one silently loses defence-in-depth.
 *
 * ── C37, the forty-second plan defect ────────────────────────────────────────
 * `spec.md` §5 RFS-06 row 3 and `tasks.md` §5 T2(c) both prescribe this test as
 * *"assert the returned `absolutePath` carries no literal `..` segment"*.
 * THAT ASSERTION IS VACUOUS AND IS DELIBERATELY NOT WRITTEN HERE. `resolveFilePath`
 * has exactly two non-null exits (`:370` and `:379`) and both return
 * `path.resolve(...)`, which normalizes `..` away unconditionally — measured over
 * nine adversarial inputs including over-traversal and `....//`, every result
 * carried zero `..` segments INCLUDING the ones that resolved outside the root.
 * So a test written to the letter of the criterion passes identically with and
 * without the `sanitizeFilePath` call, and RFS-06 AC-1's "proving they hold
 * today" would be false for shape (c) while reading green — C21's class, the
 * shape this requirement exists to close, one level down.
 *
 * The predicate written instead is CONTAINMENT-RELATIVE: the resolved path must
 * still be under the project root. Measured, it reads `escapes root: false`
 * against today's code and `escapes root: true` with the sanitize call dropped.
 * Recorded at author level rather than put to the user, on the C34/C35 precedent
 * — RFS-06 AC-1 fixes the answer and only the predicate was open. Owed back to
 * `spec.md` §5 and `tasks.md` T2, and handed to T25 as a question rather than as
 * a settled fact.
 *
 * ── Two fixture rules this file must not relax ───────────────────────────────
 * 1. EVERY SHAPE OWNS A PRIVATE CONTAINER. `dirname(mkdtempSync(os.tmpdir(), …))`
 *    IS `os.tmpdir()` — measured — so two shapes using the natural convention
 *    share a parent, and shape (c)'s allowlist entry would BE the directory
 *    shape (a) asserts is rejected. Distinct roots do not fix that; a private
 *    container per shape does. Shape (a) additionally asserts the env is empty
 *    before it runs, so a leak fails loudly instead of passing for the wrong
 *    reason.
 * 2. EVERY `handle()` CALL PASSES `compress: false` AND EVERY FIXTURE IS TINY.
 *    `ReadFileTool`'s constructor builds a real `CodeCompressor` with no injected
 *    LLM seam, `shouldAutoCompress` fires at >100 selected lines with the default
 *    `compress: true`, and `isLlmEnabled()` reads the developer's own
 *    `~/.config/massa-ai/config.json` — `true` on a machine with local Ollama.
 *    That is the 5001 ms flake CLAUDE.md documents, invisible in CI.
 */

import { describe, test, expect, mock, beforeAll, afterAll, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

const workspaceRoots = new Map<string, string>();

mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    getWorkspace: async (projectId: string) => {
      const root = workspaceRoots.get(projectId);
      return root ? { project_id: projectId, project_path: root } : null;
    },
    markIndexing: async () => {},
  },
}));

mock.module("../services/events/event-bus.js", () => ({
  eventBus: { subscribe: () => () => {}, publish: () => {} },
}));

import { ReadFileTool } from "../tools/read_file.js";

const ENV = "MASSA_AI_READ_FILE_ROOTS";

/** One private container per shape — see fixture rule 1. */
type Fixture = { container: string; root: string };
const makeFixture = (tag: string): Fixture => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), `massa-ai-rfs06-${tag}-`));
  const root = path.join(container, "ws");
  fs.mkdirSync(root, { recursive: true });
  return { container, root };
};

let a: Fixture;
let b: Fixture;
let c: Fixture;
let outsideDirB: string;
let outsideFileB: string;
let inRootFileC: string;
let escapedFileC: string;
let envBeforeFile: string | undefined;

beforeAll(() => {
  envBeforeFile = process.env[ENV];
  delete process.env[ENV];

  a = makeFixture("a");
  fs.writeFileSync(path.join(a.root, "inside.txt"), "A-INSIDE\n");

  b = makeFixture("b");
  outsideDirB = path.join(b.container, "outside");
  fs.mkdirSync(outsideDirB, { recursive: true });
  outsideFileB = path.join(outsideDirB, "secret.txt");
  fs.writeFileSync(outsideFileB, "B-OUTSIDE\n");

  c = makeFixture("c");
  // The two candidate resolutions of "../nested/sample.txt" from c.root, with
  // DIFFERENT contents so the served file identifies which one was read.
  inRootFileC = path.join(c.root, "nested", "sample.txt");
  escapedFileC = path.join(c.container, "nested", "sample.txt");
  fs.mkdirSync(path.dirname(inRootFileC), { recursive: true });
  fs.mkdirSync(path.dirname(escapedFileC), { recursive: true });
  fs.writeFileSync(inRootFileC, "C-IN-ROOT\n");
  fs.writeFileSync(escapedFileC, "C-ESCAPED\n");

  workspaceRoots.set("rfs06-a", a.root);
  workspaceRoots.set("rfs06-b", b.root);
  workspaceRoots.set("rfs06-c", c.root);
});

// Fixture rule 1: a throw inside any test must not leak the env into the next
// one. bun runs a file's tests sequentially in ONE process, so this is the only
// thing standing between a failed assertion and a neighbouring test that passes
// for the wrong reason.
afterEach(() => {
  delete process.env[ENV];
});

afterAll(() => {
  if (envBeforeFile === undefined) delete process.env[ENV];
  else process.env[ENV] = envBeforeFile;
  for (const f of [a, b, c]) fs.rmSync(f.container, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Shape (a) — the ".." vs "../" narrowing
// ─────────────────────────────────────────────────────────────────────────────
describe("RFS-06 AC-1 shape (a) — the project root's own parent is outside", () => {
  test("requesting path.dirname(projectRoot) is rejected by containment, not by the file read", async () => {
    // A leak from another test would put a.container on the allowlist and make
    // this pass for the wrong reason. Fail loudly instead.
    expect(process.env[ENV] ?? "").toBe("");

    const tool = new ReadFileTool();
    // path.relative(a.root, a.container) === ".." exactly — the ONE target that
    // separates startsWith("..") from startsWith("../"). Under the narrowed
    // reading containment ALLOWS this and the failure becomes a generic read
    // error on a directory, so the assertion is on the error's shape.
    expect(path.relative(a.root, a.container)).toBe("..");

    const res = await tool.handle({
      filePath: a.container,
      projectId: "rfs06-a",
      compress: false,
    });

    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error!).toMatch(/path containment/i);
    // The narrowed reading gets past containment and dies in readFileWithCache
    // on a directory. That is the discriminating difference.
    expect(res.error!).not.toMatch(/^Failed to read file:/);
    expect(res.error!).not.toMatch(/EISDIR|illegal operation on a directory/i);
  }, 30_000);

  test("positive control — a file INSIDE the project root still reads", async () => {
    const tool = new ReadFileTool();
    const res = await tool.handle({
      filePath: path.join(a.root, "inside.txt"),
      projectId: "rfs06-a",
      compress: false,
    });

    expect(res.success).toBe(true);
    const data = res.data as { absolutePath: string; content: string };
    expect(data.absolutePath).toBe(path.resolve(a.root, "inside.txt"));
    expect(data.content).toContain("A-INSIDE");
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Shape (b) — the env allowlist is read at CALL time (RFS-06 AC-3)
// ─────────────────────────────────────────────────────────────────────────────
describe("RFS-06 AC-3 shape (b) — MASSA_AI_READ_FILE_ROOTS is read per call", () => {
  test("one instance, three reads: the same tool follows the env in both directions", async () => {
    expect(process.env[ENV] ?? "").toBe("");

    // Constructed while the env is UNSET. Every existing test constructs AFTER
    // its env mutation, which is exactly why none of them can see a hoist.
    const tool = new ReadFileTool();
    const read = () => tool.handle({ filePath: outsideFileB, compress: false });

    try {
      // Direction A: unset -> reject, then set -> allow ON THE SAME INSTANCE.
      // This alone kills a construction-time hoist AND a naive first-call memo:
      // both would still be serving the empty value on the second read.
      const denied = await read();
      expect(denied.success).toBe(false);
      expect(denied.error!).toMatch(/path containment/i);

      process.env[ENV] = outsideDirB;
      const allowed = await read();
      expect(allowed.success).toBe(true);
      expect((allowed.data as { content: string }).content).toContain("B-OUTSIDE");

      // Direction B: set -> unset -> reject again, same instance. This is the
      // direction that kills a STICKY memo (recompute only while the cached
      // value is empty, freeze once non-empty), which direction A cannot see.
      // Containment runs at handle():206, BEFORE readFileWithCache at :221, so
      // the entry the previous read cached cannot satisfy this one.
      delete process.env[ENV];
      const deniedAgain = await read();
      expect(deniedAgain.success).toBe(false);
      expect(deniedAgain.error!).toMatch(/path containment/i);
    } finally {
      delete process.env[ENV];
    }
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Shape (c) — sanitizeFilePath still runs in resolveFilePath's projectId branch
// ─────────────────────────────────────────────────────────────────────────────
describe("RFS-06 AC-1 shape (c) — a traversal token cannot move the resolution out of the root", () => {
  test("'../nested/sample.txt' resolves INSIDE the project root, with containment unable to be the reason", async () => {
    // "independent of containment", literally: the escaped resolution is put ON
    // the allowlist, so containment permits BOTH candidate paths and cannot be
    // what fails. The only thing left to discriminate is where the path resolved.
    process.env[ENV] = c.container;
    try {
      const tool = new ReadFileTool();
      const res = await tool.handle({
        filePath: "../nested/sample.txt",
        projectId: "rfs06-c",
        compress: false,
      });

      expect(res.success).toBe(true);
      const data = res.data as { absolutePath: string; content: string };

      // The three assertions that flip when sanitizeFilePath is dropped from
      // read_file.ts:378. NOT the literal-".." assertion the criterion
      // prescribes — see C37 in this file's header; path.resolve normalizes it
      // away on both sides, so it can never fail.
      expect(data.absolutePath).toBe(path.resolve(c.root, "nested/sample.txt"));
      expect(path.relative(c.root, data.absolutePath).startsWith("..")).toBe(false);
      expect(data.content).toContain("C-IN-ROOT");
      expect(data.content).not.toContain("C-ESCAPED");
    } finally {
      delete process.env[ENV];
    }
  }, 30_000);

  test("the escaped resolution really is reachable — so the test above is not passing by accident", async () => {
    // Without this, "the read stayed in the root" and "the parent's file was
    // unreadable anyway" are the same observation. Reading the escaped file
    // directly proves the allowlist genuinely admits it.
    process.env[ENV] = c.container;
    try {
      const tool = new ReadFileTool();
      const res = await tool.handle({ filePath: escapedFileC, compress: false });

      expect(res.success).toBe(true);
      expect((res.data as { content: string }).content).toContain("C-ESCAPED");
    } finally {
      delete process.env[ENV];
    }
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 — the teaching error enumerates roots ONLY
// ─────────────────────────────────────────────────────────────────────────────
describe("RFS-06 AC-2 — the teaching error's shape and its root list", () => {
  test("the enumerated roots are EXACTLY project root + cwd + env roots, and nothing else", async () => {
    // The existing suite asserts each expected root is PRESENT and that one
    // hardcoded string ("/etc/passwd") is absent. Neither establishes "roots
    // only, never a host path": an error appending the developer's home
    // directory, or every value in process.env, satisfies all of it. This
    // asserts the SET, which is the property AC-2 actually names.
    process.env[ENV] = b.container;
    try {
      const tool = new ReadFileTool();
      const res = await tool.handle({
        filePath: a.container,
        projectId: "rfs06-a",
        compress: false,
      });

      expect(res.success).toBe(false);
      const error = res.error!;
      const target = path.resolve(a.container);

      // read_file.ts:443-447, unchanged — including that the first line names
      // the target and the last tells the caller what to do instead.
      const lines = error.split("\n");
      expect(lines[0]).toBe(
        `read_file path containment: "${target}" is outside the allowed roots.`,
      );
      expect(lines[1]).toBe("Valid roots (project root + cwd + MASSA_AI_READ_FILE_ROOTS):");
      expect(lines[lines.length - 1]).toBe(
        "Provide a filePath that resolves under one of these roots.",
      );

      // cwd is read LIVE: `bun run test` runs from packages/core and a manual
      // `bun test` from the repo root, and the two differ. A hardcoded path
      // would pass under one invocation and fail under the other.
      const listed = lines.filter((l) => l.startsWith("  - ")).map((l) => l.slice(4));
      expect(new Set(listed)).toEqual(
        new Set([path.resolve(a.root), path.resolve(process.cwd()), path.resolve(b.container)]),
      );
      // No line between the header and the closing sentence is anything but a
      // root entry — nothing extra is smuggled in outside the "  - " shape.
      expect(lines.slice(2, -1).every((l) => l.startsWith("  - "))).toBe(true);
      expect(listed.length).toBe(3);
    } finally {
      delete process.env[ENV];
    }
  }, 30_000);
});
