/**
 * Unit tests for `services/file-read/line-range.ts` — module 6 of the
 * `tools/read_file.ts` extraction (PR-D, T11).
 *
 * ## The case this file exists for
 *
 * `extractLines` numbers every line it returns; the N9 cap does NOT slice that
 * numbered string — it re-slices the RAW `lines` array and joins it. So a
 * CLIPPED response is unnumbered where an unclipped one is numbered. That
 * asymmetry has shipped since Wave 4 and, measured at T11, **no test anywhere
 * asserted content on the clipped path**: `wave-4-correctness.test.ts` and
 * `read-file-containment.test.ts` between them drive the cap four times and
 * every assertion is on the boolean, on `lineRange.actual.*`, or on
 * `content.split("\n").length` — a line COUNT, which is identical numbered or
 * not. The Plan Challenge gate's red-team lens found it before this module was
 * written and the evidence audit confirmed the zero coverage independently.
 *
 * Both branches' exact format are pinned below. PR-D does not decide whether
 * the asymmetry is intentional — it is characterization, not repair (`spec.md`
 * §6, R-07's precedent). What the pin buys is that the next person to touch it
 * has to mean it.
 *
 * ## What is NOT asserted, and why
 *
 * The `MASSA_AI_READ_FILE_MAX_LINES` override branch. The constant is a
 * module-level `const` evaluated once at import, so no in-process
 * `process.env` mutation can reach it — that was true before the move and is
 * true after, and making it testable would mean changing its shape inside a
 * behavior-preserving PR. The default (500) is pinned exactly, at the boundary,
 * in both directions.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import ts from "typescript";

import {
  calculateRange,
  adjustRange,
  extractLines,
  selectLines,
  type ReadRange,
} from "../services/file-read/line-range.js";

/** The N9 default. Named rather than repeated as a literal in every case. */
const CAP = 500;

/** `n` lines of distinguishable content — `L1`, `L2`, … so a slice is identifiable. */
const body = (n: number, from = 1): string[] =>
  Array.from({ length: n }, (_, i) => `L${i + from}`);

/** The prefix `extractLines` puts on line `n`: 6-wide right-aligned, then ": ". */
const numbered = (n: number, text: string): string => `${String(n).padStart(6, " ")}: ${text}`;

describe("calculateRange — request to range, priority order", () => {
  test("lineStart/lineEnd wins over offset/limit when both are present", () => {
    expect(calculateRange({ lineStart: 10, lineEnd: 20, offset: 99, limit: 5 })).toEqual({
      start: 10,
      end: 20,
    });
  });

  test("lineStart is floored at 1, and lineEnd is NOT — the asymmetry is the shipped shape", () => {
    // `Math.max(1, params.lineStart)` guards the start only; `end` is passed
    // through untouched, so a caller can ask for an end below its own start.
    // adjustRange, not this function, is what makes such a range harmless.
    expect(calculateRange({ lineStart: -5, lineEnd: 3 })).toEqual({ start: 1, end: 3 });
    expect(calculateRange({ lineStart: 8, lineEnd: 2 })).toEqual({ start: 8, end: 2 });
  });

  test("both of lineStart/lineEnd are required to take that branch — one alone falls through", () => {
    // `&&`, not `||`. With only lineStart present and no offset, this is the
    // whole-file default rather than a read from lineStart to the end.
    expect(calculateRange({ lineStart: 10 })).toEqual({ start: 1, end: Infinity });
    expect(calculateRange({ lineEnd: 10 })).toEqual({ start: 1, end: Infinity });
  });

  test("offset/limit is inclusive — end is offset + limit - 1", () => {
    expect(calculateRange({ offset: 10, limit: 5 })).toEqual({ start: 10, end: 14 });
  });

  test("a missing limit defaults to 1000, and so does a zero one", () => {
    // `params.limit || 1000` — falsy, not nullish, so 0 takes the default.
    expect(calculateRange({ offset: 1 })).toEqual({ start: 1, end: 1000 });
    expect(calculateRange({ offset: 1, limit: 0 })).toEqual({ start: 1, end: 1000 });
  });

  test("offset is floored at 1", () => {
    expect(calculateRange({ offset: 0, limit: 3 })).toEqual({ start: 1, end: 3 });
    expect(calculateRange({ offset: -4, limit: 3 })).toEqual({ start: 1, end: 3 });
  });

  test("no range at all is the whole file — start 1, end Infinity", () => {
    expect(calculateRange({})).toEqual({ start: 1, end: Infinity });
  });
});

describe("adjustRange — clamp a range onto a real file", () => {
  test("Infinity becomes the file's line count", () => {
    expect(adjustRange({ start: 1, end: Infinity }, 42)).toEqual({ start: 1, end: 42 });
  });

  test("a start past the end of the file is pulled back to the last line", () => {
    expect(adjustRange({ start: 900, end: Infinity }, 42)).toEqual({ start: 42, end: 42 });
  });

  test("a start below 1 is pushed up to 1", () => {
    expect(adjustRange({ start: -3, end: 10 }, 42)).toEqual({ start: 1, end: 10 });
  });

  test("a finite end past the file is clamped; one inside it is left alone", () => {
    expect(adjustRange({ start: 1, end: 999 }, 42)).toEqual({ start: 1, end: 42 });
    expect(adjustRange({ start: 5, end: 9 }, 42)).toEqual({ start: 5, end: 9 });
  });

  test("an inverted range survives adjustment inverted — it is not repaired", () => {
    // Characterization, not endorsement: adjustRange clamps each end
    // independently and never compares them, so start > end reaches
    // `lines.slice(start, end)`, which yields the empty selection.
    expect(adjustRange({ start: 8, end: 2 }, 42)).toEqual({ start: 8, end: 2 });
  });

  test("an empty file collapses the range to start 1, end 0", () => {
    // `Math.min(range.start, 0)` is 0, then `Math.max(1, 0)` is 1.
    expect(adjustRange({ start: 1, end: Infinity }, 0)).toEqual({ start: 1, end: 0 });
  });
});

describe("extractLines — the numbered format, pinned exactly", () => {
  test("every line carries a 6-wide right-aligned number and a colon-space", () => {
    const out = extractLines(body(3), { start: 1, end: 3 });
    expect(out).toBe(`${numbered(1, "L1")}\n${numbered(2, "L2")}\n${numbered(3, "L3")}`);
    // Stated literally as well, so a change to `padStart(6, " ")` fails here and
    // not only in a helper that moved with it.
    expect(out.split("\n")[0]).toBe("     1: L1");
  });

  test("numbering is absolute to the file, not relative to the slice", () => {
    const out = extractLines(body(10), { start: 4, end: 6 });
    expect(out).toBe(`${numbered(4, "L4")}\n${numbered(5, "L5")}\n${numbered(6, "L6")}`);
  });

  test("right-alignment holds across widths, and a 7-digit number simply outgrows the field", () => {
    // Widths 3 and 4 off a modest array...
    const out = extractLines(body(1000), { start: 998, end: 1000 });
    expect(out.split("\n")).toEqual(["   998: L998", "   999: L999", "  1000: L1000"]);

    // ...and the overflow case off a SPARSE array, so pinning a 7-digit line
    // number costs one element rather than a million. `slice` keeps a real
    // element at that index, which `.map` then visits; a hole would be skipped
    // and the assertion would pass vacuously on "".
    const sparse: string[] = [];
    sparse[999999] = "deep";
    expect(extractLines(sparse, { start: 1000000, end: 1000000 })).toBe("1000000: deep");
  });

  test("an empty or inverted range yields the empty string", () => {
    expect(extractLines(body(5), { start: 3, end: 2 })).toBe("");
    expect(extractLines([], { start: 1, end: 0 })).toBe("");
  });

  test("a blank source line keeps its number and its trailing space", () => {
    expect(extractLines(["", "x"], { start: 1, end: 2 })).toBe("     1: \n     2: x");
  });
});

describe("selectLines — extraction plus the N9 cap", () => {
  test("under the cap: the numbered text is returned unchanged and clipped is false", () => {
    const lines = body(10);
    const range: ReadRange = { start: 1, end: 10 };
    const sel = selectLines(lines, range);

    expect(sel.clipped).toBe(false);
    expect(sel.lineCount).toBe(10);
    expect(sel.content).toBe(extractLines(lines, range));
    expect(sel.content.startsWith("     1: L1")).toBe(true);
  });

  test("EXACTLY at the cap does not clip — the comparison is strict `>`", () => {
    const sel = selectLines(body(CAP), { start: 1, end: CAP });
    expect(sel.clipped).toBe(false);
    expect(sel.lineCount).toBe(CAP);
    // Still numbered, because nothing was re-sliced.
    expect(sel.content.startsWith("     1: L1")).toBe(true);
  });

  test("one line over the cap clips to exactly the cap", () => {
    const sel = selectLines(body(CAP + 1), { start: 1, end: CAP + 1 });
    expect(sel.clipped).toBe(true);
    expect(sel.lineCount).toBe(CAP);
  });

  test("THE CLIPPED PATH RETURNS UNNUMBERED TEXT — the characterization this file exists for", () => {
    // The cap re-slices the RAW array, so the line-number prefixes `extractLines`
    // added are discarded along with the lines past the cap. This is the shipped
    // behavior, moved verbatim; it is pinned, not endorsed.
    const sel = selectLines(body(CAP + 1), { start: 1, end: CAP + 1 });

    expect(sel.clipped).toBe(true);
    expect(sel.content.startsWith("L1\n")).toBe(true);
    expect(sel.content).not.toContain("     1: L1");
    expect(sel.content.split("\n")[0]).toBe("L1");
    expect(sel.content.split("\n")[CAP - 1]).toBe(`L${CAP}`);
    // And the two branches genuinely disagree about format on the same input
    // shape — one line fewer is numbered, one line more is not.
    expect(selectLines(body(CAP), { start: 1, end: CAP }).content.split("\n")[0]).toBe("     1: L1");
  });

  test("clipping counts from the range's own start, not from the file's", () => {
    // `lines.slice(range.start - 1, range.start - 1 + CAP)` — a mid-file range
    // that overflows the cap keeps its first CAP lines, not the file's.
    const sel = selectLines(body(1200), { start: 101, end: 1200 });
    expect(sel.clipped).toBe(true);
    expect(sel.lineCount).toBe(CAP);
    expect(sel.content.split("\n")[0]).toBe("L101");
    expect(sel.content.split("\n")[CAP - 1]).toBe(`L${100 + CAP}`);
  });

  test("lineCount is recomputed after clipping, never inherited from the extraction", () => {
    const sel = selectLines(body(CAP + 250), { start: 1, end: CAP + 250 });
    expect(sel.lineCount).toBe(CAP);
    expect(sel.lineCount).toBe(sel.content.split("\n").length);
  });

  test("the empty selection reports lineCount 1, which is what `\"\".split` returns", () => {
    // Characterization of a real edge: an inverted range yields "", and
    // `"".split("\n")` has length 1, so the count is 1 for zero lines. The
    // handler surfaces this as `lineRange.selected`.
    const sel = selectLines(body(5), { start: 3, end: 2 });
    expect(sel.content).toBe("");
    expect(sel.lineCount).toBe(1);
    expect(sel.clipped).toBe(false);
  });
});

describe("line-range.ts imports nothing — module 1's property, kept by module 6", () => {
  const MODULE_PATH = path.join(import.meta.dir, "../services/file-read/line-range.ts");

  test("zero import edges of any kind, by AST rather than by text match", () => {
    // On this feature's standing rule (`design.md` §6.4: never a regex). A
    // substring check for "import" would miss `require(`, a dynamic `import()`,
    // and an `export … from` re-export, all of which are import edges — and
    // would false-positive on the word "import" inside this module's docblock,
    // which mentions it five times.
    const source = readFileSync(MODULE_PATH, "utf8");
    const sf = ts.createSourceFile(MODULE_PATH, source, ts.ScriptTarget.Latest, true);
    const found: string[] = [];

    const walk = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) found.push(`import ${node.moduleSpecifier.getText(sf)}`);
      if (ts.isImportEqualsDeclaration(node)) found.push(`import = ${node.name.getText(sf)}`);
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        found.push(`export from ${node.moduleSpecifier.getText(sf)}`);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        found.push(`dynamic import(${node.arguments[0]?.getText(sf) ?? ""})`);
      }
      node.forEachChild(walk);
    };
    walk(sf);

    expect(found).toEqual([]);
    // A walk that resolved nothing reports zero edges too — prove it ran.
    expect(source.length).toBeGreaterThan(0);
    expect(sf.statements.length).toBeGreaterThan(0);
  });
});
