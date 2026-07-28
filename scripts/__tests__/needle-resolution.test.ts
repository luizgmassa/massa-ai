/**
 * Needle anchor-resolution suite (SEN-04).
 *
 * Provider-free by design: it exercises *resolution*, not retrieval, so it runs
 * in `bun run test:scripts` on any machine and in CI, with no Ollama, no
 * database and no embedding model. The retrieval gate itself
 * (`bun run bench:needles:gate`) needs a live provider and is dispatch-only;
 * a correctness check that could only run there would effectively never run.
 *
 * ## What is asserted here, and what deliberately is not
 *
 * The requirement's AC-8 asks that resolving an unchanged tree reproduce each
 * needle's previous `lineStart`/`lineEnd` exactly. That check was run once, as
 * calibration, and its result is recorded in
 * `.specs/features/sensor-repair-2026-07/tasks.md`. It is **not** frozen into a
 * test here, and that is a deliberate choice: a permanent assertion on absolute
 * line numbers would fail the moment code legitimately moves, which is precisely
 * the positional pinning this whole requirement exists to remove. Encoding it
 * would rebuild the defect one layer up.
 *
 * What is asserted permanently are the properties that must hold no matter where
 * the code lives: every needle resolves, every anchor is unique repo-wide, every
 * resolved span lies inside its file, and every failure path fails loudly.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  resolveNeedles,
  resolveAnchoredNeedle,
  collectSourceFiles,
  findAnchorMatches,
  NeedleResolutionError,
} from "../../benchmarks/needles/resolve.ts";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const FIXTURE_PATH = join(REPO_ROOT, "benchmarks/needles/fixtures/massa-ai.json");

interface FixtureNeedle {
  id: string;
  query: string;
  expected: Record<string, unknown>;
}
interface Fixture {
  needles: FixtureNeedle[];
  scoring: { lineTolerance: number; staleNeedles?: string[] };
}

const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

/** Build a throwaway repo so failure paths are exercised on real files. */
function makeRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "needle-resolve-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return dir;
}

function expectResolutionError(fn: () => unknown, code: string): NeedleResolutionError {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(NeedleResolutionError);
  const error = thrown as NeedleResolutionError;
  expect(error.code).toBe(code);
  return error;
}

// ── The real fixture: properties that survive code movement ─────────────────

describe("massa-ai fixture resolves", () => {
  test("every needle resolves without error", () => {
    const resolved = resolveNeedles(fixture.needles, REPO_ROOT, {
      staleNeedles: fixture.scoring.staleNeedles,
    });
    expect(resolved.length).toBe(fixture.needles.length);
  });

  test("every anchor is unique repo-wide (AC-9)", () => {
    const files = collectSourceFiles(REPO_ROOT);
    const anchored = fixture.needles.filter((n) => typeof n.expected.anchor === "string");
    // Guards against the whole set silently becoming positional again.
    expect(anchored.length).toBeGreaterThanOrEqual(11);
    for (const needle of anchored) {
      const matches = findAnchorMatches(needle.expected.anchor as string, REPO_ROOT, files);
      expect({ id: needle.id, matches: matches.length }).toEqual({ id: needle.id, matches: 1 });
    }
  });

  test("every resolved span lies inside its file", () => {
    const resolved = resolveNeedles(fixture.needles, REPO_ROOT, {
      staleNeedles: fixture.scoring.staleNeedles,
    });
    for (const { needle, resolved: span, positional } of resolved) {
      if (positional) continue; // grandfathered: known stale, checked by its own test
      const lines = readFileSync(join(REPO_ROOT, span.filePath), "utf8").split("\n").length;
      expect({ id: needle.id, ok: span.lineStart >= 1 && span.lineEnd <= lines }).toEqual({
        id: needle.id,
        ok: true,
      });
    }
  });

  test("no needle is queried twice, and none lost its query", () => {
    const queries = fixture.needles.map((n) => n.query);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries.every((q) => typeof q === "string" && q.length > 0)).toBe(true);
  });

  test("anchors sit on code, never on a comment line", () => {
    // The Wave 6 split stripped comments while moving code, so a comment-anchored
    // needle would not survive the transformation this requirement targets.
    const anchored = fixture.needles.filter((n) => typeof n.expected.anchor === "string");
    for (const needle of anchored) {
      const anchor = (needle.expected.anchor as string).trimStart();
      expect({ id: needle.id, isComment: anchor.startsWith("//") || anchor.startsWith("*") }).toEqual(
        { id: needle.id, isComment: false },
      );
    }
  });
});

// ── The grandfather list, checked in both directions ────────────────────────

describe("stale-needle grandfathering", () => {
  test("the list holds only ids that are genuinely still positional", () => {
    const stale = new Set(fixture.scoring.staleNeedles ?? []);
    for (const id of stale) {
      const needle = fixture.needles.find((n) => n.id === id);
      expect(needle).toBeDefined();
      expect(needle!.expected.anchor).toBeUndefined();
      expect(typeof needle!.expected.filePath).toBe("string");
    }
  });

  test("a grandfathered id that gains an anchor is a hard failure", () => {
    // This is what stops the exemption outliving its reason.
    const repo = makeRepo({ "src/a.ts": "const marker = 1;\n" });
    try {
      expectResolutionError(
        () =>
          resolveNeedles(
            [{ id: "N-stale", expected: { anchor: "const marker = 1;", startOffset: 0, endOffset: 0 } }],
            repo,
            { staleNeedles: ["N-stale"] },
          ),
        "NEEDLE_STALE_ENTRY_OBSOLETE",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a needle with no anchor and no grandfathering is a hard failure", () => {
    const repo = makeRepo({ "src/a.ts": "const marker = 1;\n" });
    try {
      expectResolutionError(
        () => resolveNeedles([{ id: "N-new", expected: { filePath: "src/a.ts", lineStart: 1, lineEnd: 1 } }], repo),
        "NEEDLE_ANCHOR_MISSING",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ── The three failure paths, on synthetic repos ─────────────────────────────

describe("loud failure paths", () => {
  test("an unresolvable anchor exits non-zero, naming the needle and anchor (AC-5)", () => {
    const repo = makeRepo({ "src/a.ts": "const present = 1;\n" });
    try {
      const error = expectResolutionError(
        () =>
          resolveAnchoredNeedle(
            "N42-gone",
            { anchor: "const vanished = 99;", startOffset: 0, endOffset: 0 },
            repo,
            collectSourceFiles(repo),
          ),
        "NEEDLE_ANCHOR_UNRESOLVED",
      );
      expect(error.message).toContain("N42-gone");
      expect(error.message).toContain("const vanished = 99;");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("an ambiguous anchor exits non-zero and lists every location (AC-2, AC-9)", () => {
    const repo = makeRepo({
      "src/a.ts": "const shared = 1;\n",
      "src/b.ts": "// other file\nconst shared = 1;\n",
    });
    try {
      const error = expectResolutionError(
        () =>
          resolveAnchoredNeedle(
            "N43-ambiguous",
            { anchor: "const shared = 1;", startOffset: 0, endOffset: 0 },
            repo,
            collectSourceFiles(repo),
          ),
        "NEEDLE_ANCHOR_AMBIGUOUS",
      );
      expect(error.message).toContain("src/a.ts:1");
      expect(error.message).toContain("src/b.ts:2");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("two matches inside ONE file are ambiguous too", () => {
    const repo = makeRepo({ "src/a.ts": "const twice = 1;\nconst filler = 0;\nconst twice = 1;\n" });
    try {
      expectResolutionError(
        () =>
          resolveAnchoredNeedle(
            "N44-same-file",
            { anchor: "const twice = 1;", startOffset: 0, endOffset: 0 },
            repo,
            collectSourceFiles(repo),
          ),
        "NEEDLE_ANCHOR_AMBIGUOUS",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a span past EOF exits non-zero — the path that previously emitted no signal at all", () => {
    // This is the defect actually firing on this repo today: the file exists, so
    // the old `existsSync` guard never triggered, no warning was printed, and the
    // needle scored zero against a span with no chunk behind it.
    const repo = makeRepo({ "src/a.ts": "const anchor = 1;\nsecond line\n" });
    try {
      const error = expectResolutionError(
        () =>
          resolveAnchoredNeedle(
            "N45-past-eof",
            { anchor: "const anchor = 1;", startOffset: 0, endOffset: 600 },
            repo,
            collectSourceFiles(repo),
          ),
        "NEEDLE_SPAN_OUT_OF_RANGE",
      );
      expect(error.message).toContain("N45-past-eof");
      expect(error.message).toContain("file length: 2 lines");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a span starting before line 1 is out of range", () => {
    const repo = makeRepo({ "src/a.ts": "const anchor = 1;\n" });
    try {
      expectResolutionError(
        () =>
          resolveAnchoredNeedle(
            "N46-negative",
            { anchor: "const anchor = 1;", startOffset: -50, endOffset: 0 },
            repo,
            collectSourceFiles(repo),
          ),
        "NEEDLE_SPAN_OUT_OF_RANGE",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a grandfathered needle whose file is gone is a hard failure, not a skip", () => {
    const repo = makeRepo({ "src/a.ts": "const present = 1;\n" });
    try {
      expectResolutionError(
        () =>
          resolveNeedles(
            [{ id: "N47-missing", expected: { filePath: "src/deleted.ts", lineStart: 1, lineEnd: 2 } }],
            repo,
            { staleNeedles: ["N47-missing"] },
          ),
        "NEEDLE_FILE_MISSING",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ── Resolution tolerates the transformations the refactor performs (AC-3) ───

describe("resolution survives code movement (AC-3)", () => {
  const SPAN = ["function target() {", "  const x = 1;", "  return x;", "}"].join("\n");

  test("verbatim move to a different file", () => {
    const repo = makeRepo({
      "src/moved.ts": `// relocated wholesale\n${SPAN}\n`,
      "src/other.ts": "const unrelated = 0;\n",
    });
    try {
      const span = resolveAnchoredNeedle(
        "N-move",
        { anchor: "function target() {", startOffset: 0, endOffset: 3 },
        repo,
        collectSourceFiles(repo),
      );
      expect(span).toEqual({ filePath: "src/moved.ts", lineStart: 2, lineEnd: 5 });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a within-file move far beyond lineTolerance", () => {
    const padding = Array.from({ length: 400 }, (_, i) => `// filler ${i}`).join("\n");
    const repo = makeRepo({ "src/a.ts": `${padding}\n${SPAN}\n` });
    try {
      const span = resolveAnchoredNeedle(
        "N-drift",
        { anchor: "function target() {", startOffset: 0, endOffset: 3 },
        repo,
        collectSourceFiles(repo),
      );
      // 400 lines of padding — an order of magnitude past lineTolerance (5).
      expect(span.lineStart).toBe(401);
      expect(span.lineEnd).toBe(404);
      expect(span.lineStart - fixture.scoring.lineTolerance).toBeGreaterThan(5);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("anchors match as substrings, so an added `export ` prefix still resolves", () => {
    // Not hypothetical: `netBraceDelta` gained exactly this prefix during the
    // Wave 6 split, and a whole-line match would have missed it.
    //
    // The symbol here is deliberately synthetic rather than the real one. Quoting
    // a live product symbol verbatim in a test makes that symbol ambiguous
    // repo-wide, which would break the very needle it illustrates — the resolver
    // caught exactly that when N07 was first anchored, reporting three matches:
    // chunker-code.ts plus two copies in this file.
    const repo = makeRepo({ "src/a.ts": "export function synthNetDelta(line: string): number {\n  return 0;\n}\n" });
    try {
      const span = resolveAnchoredNeedle(
        "N-prefix",
        { anchor: "function synthNetDelta(line: string): number {", startOffset: 0, endOffset: 2 },
        repo,
        collectSourceFiles(repo),
      );
      expect(span).toEqual({ filePath: "src/a.ts", lineStart: 1, lineEnd: 3 });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// ── The scan boundary ───────────────────────────────────────────────────────

describe("source scan", () => {
  test("build output, deps and generated code are never scanned", () => {
    const repo = makeRepo({
      "src/a.ts": "const only = 1;\n",
      "dist/a.ts": "const only = 1;\n",
      "node_modules/pkg/a.ts": "const only = 1;\n",
      "src/generated/a.ts": "const only = 1;\n",
    });
    try {
      // Without the exclusions this anchor would be ambiguous four ways.
      const span = resolveAnchoredNeedle(
        "N-scan",
        { anchor: "const only = 1;", startOffset: 0, endOffset: 0 },
        repo,
        collectSourceFiles(repo),
      );
      expect(span.filePath).toBe("src/a.ts");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
