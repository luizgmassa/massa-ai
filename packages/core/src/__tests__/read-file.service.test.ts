/**
 * Unit tests for `services/file-read/read-file.service.ts` — module 7 of the
 * `tools/read_file.ts` extraction (PR-D, T12), and the last of them.
 *
 * WHAT THE PRE-EXISTING SUITES ALREADY REACH, so what this file adds is stated
 * rather than assumed. `read-file-presentation-characterization.test.ts` pins
 * the four recommendation strings, their order, the token math, `Math.round`
 * and the compressed arm — all through `ReadFileTool.handle()`, with the
 * compressor mocked. `read-file-containment.test.ts` and
 * `-containment-shapes.test.ts` pin the containment predicate.
 * `line-range.test.ts` pins the range arithmetic and the N9 format.
 * `read-file.test.ts` drives the two cache call sites through the handler.
 *
 * So what has NO sensor anywhere, and is what this file is for:
 *
 *  1. `readFileOptions` AS A CONTRACT. It did not exist before T12; the six
 *     derivations lived inline in `handle()`'s prelude. Two of them are `||`
 *     rather than `??` and one is `!== false` rather than truthiness, so
 *     `targetRatio: 0`, `limit: 0` and `compress: undefined` all behave in ways
 *     a reader guesses wrong.
 *  2. `read()`'s DISCRIMINATED OUTCOME. Every pre-existing suite sees the
 *     serialized `ToolResponse` and therefore cannot distinguish "the service
 *     denied" from "the handler mapped a denial". The `ok` flag is the seam T12
 *     introduced and nothing else observes it.
 *  3. THE THROW POSITION, WHICH IS A BEHAVIOUR PIN AND NOT A TEST OF
 *     CORRECTNESS. Before T12 the six option reads sat above `handle()`'s `try`,
 *     so a request that threw while being read threw OUT of `handle()` instead
 *     of becoming `{success:false}`. Nothing in the repo observed it.
 *     `readFileOptions` is therefore called at the original position, and §3b
 *     pins it — with the discriminating input MEASURED rather than assumed: the
 *     plan named `handle(null)` and that is wrong, since the catch dereferences
 *     `p.filePath` and rethrows either way. See §3b for the derivation.
 *  4. RFS-03 AC-2 AT THE MODULE LEVEL. No module under `services/file-read/`
 *     may import anything under `tools/`. Module 7 is the one that would, since
 *     it is the piece that used to be a handler.
 *
 * NO MODULE MOCKS AND NO `process.env` WRITES, AND THAT IS A MEASURED CHOICE.
 * Both are `run-tests-isolated.ts` isolation triggers (`mock.module(`, and
 * `/process\.env\.[A-Z0-9_]+\s*=/`), so either would fork this file out of the
 * mock-free batch — and a global module mock reaches every module loaded beside
 * it, which is how `file-content-cache.test.ts`'s earlier draft read 20p/0f
 * alone and 128p/26f beside its siblings. Containment is satisfied the only
 * other way available: THE FIXTURES ARE REAL FILES UNDER `packages/core/src`,
 * which is inside `process.cwd()` whether the suite runs from the repo root or
 * from `packages/core` (the isolation runner's cwd). Nothing is written to disk.
 *
 * THE COMPRESSED ARM IS DELIBERATELY NOT DRIVEN HERE. Reaching it means running
 * a real `CodeCompressor`, which is this repo's live-LLM edge (42 s cold, 690 ms
 * warm — the documented 5001 ms class). The presentation suite already drives
 * that arm with the compressor mocked, and does so through this module. Stated
 * because the alternative reading of the same coverage number is that the arm is
 * untested.
 *
 * BECAUSE THE FIXTURES ARE LIVE FILES, NO ASSERTION PINS THEIR BYTES. Every
 * expectation is derived from reading the same file in the test, and each
 * fixture's size PRECONDITION is asserted explicitly — a fixture that drifts
 * below its threshold must fail loudly rather than quietly exercising the other
 * branch, which is the "a mutation that resolves to nothing" trap this feature
 * has recorded twice.
 */

import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import ts from "typescript";

import {
  ReadFileService,
  readFileOptions,
  type ReadFileParams,
} from "../services/file-read/read-file.service.js";
import type { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";

/** The N9 default, module 6's constant. Named rather than repeated as a literal. */
const N9_CAP = 500;

const SRC = path.join(import.meta.dir, "..");
const SMALL = path.join(SRC, "services/file-read/project-root-cache.ts"); // < 100 lines
const MEDIUM = path.join(SRC, "services/file-read/read-file.service.ts"); // > 100, < 500
const LARGE = path.join(SRC, "services/project-identity/apply.ts"); // > 500 lines

const linesOf = (f: string) => fs.readFileSync(f, "utf-8").split("\n").length;

/** A `SymbolGraphService` stand-in supplying a fixed definition count. */
const symbolGraphWith = (definitions: number) =>
  ({
    listDefinitions: async () => ({
      definitions: Array.from({ length: definitions }, (_, i) => ({ name: `sym${i}` })),
    }),
  }) as unknown as SymbolGraphService;

type Data = {
  filePath: string;
  absolutePath: string;
  lineRange: {
    requested: { start: number; end: number | null };
    actual: { start: number; end: number; total: number };
    selected: number;
  };
  source_clipped: boolean;
  metadata: { totalLines: number; language?: string; symbols?: unknown; imports?: unknown };
  compressed: boolean;
  recommendations: string[];
  content: string;
  tokens: { original: number; compressed: number; saved: number; savingsPercent: number };
  compressionRatio?: number;
};

const okData = (o: Awaited<ReturnType<ReadFileService["read"]>>): Data => {
  expect(o.ok).toBe(true);
  return (o as { ok: true; data: Data }).data;
};

// ── Fixture preconditions ────────────────────────────────────────────────────
// Asserted, not assumed: these are live source files, and a drift across one of
// these thresholds would silently move a case onto the branch it exists to
// exclude. That is indistinguishable from a passing test.
describe("read-file.service fixtures still have the sizes the cases rely on", () => {
  test("SMALL < 100 < MEDIUM, and LARGE > the N9 cap", () => {
    expect(linesOf(SMALL)).toBeLessThan(100);
    expect(linesOf(MEDIUM)).toBeGreaterThan(100);
    expect(linesOf(MEDIUM)).toBeLessThan(N9_CAP);
    expect(linesOf(LARGE)).toBeGreaterThan(N9_CAP);
  });
});

// ── 1. readFileOptions ───────────────────────────────────────────────────────
describe("readFileOptions — the six derivations handle() used to inline", () => {
  test("all six defaults on an empty request", () => {
    expect(readFileOptions({} as ReadFileParams)).toEqual({
      shouldCompress: true,
      targetRatio: 0.3,
      format: "json",
      fields: undefined,
      includeSymbols: true,
      includeImports: true,
    });
  });

  test("compress and the include flags are `!== false`, so any non-false value enables them", () => {
    // Not truthiness: `undefined` must enable, and only a literal `false` disables.
    expect(readFileOptions({ compress: undefined } as ReadFileParams).shouldCompress).toBe(true);
    expect(readFileOptions({ compress: false } as ReadFileParams).shouldCompress).toBe(false);
    expect(readFileOptions({ includeSymbols: false } as ReadFileParams).includeSymbols).toBe(false);
    expect(readFileOptions({ includeImports: false } as ReadFileParams).includeImports).toBe(false);
  });

  test("targetRatio is `||`, not `??` — 0 falls back to 0.3 and never disables compression", () => {
    // The distinction is load-bearing: under `??` a caller passing 0 would get
    // targetRatio 0, `0 < 1` holds, and compression would still fire — but with
    // a ratio the compressor never sees. Under `||` it is 0.3. A reader who
    // assumes nullish coalescing here reads the branch below backwards.
    expect(readFileOptions({ targetRatio: 0 } as ReadFileParams).targetRatio).toBe(0.3);
    expect(readFileOptions({ targetRatio: 0.5 } as ReadFileParams).targetRatio).toBe(0.5);
    expect(readFileOptions({ targetRatio: 1 } as ReadFileParams).targetRatio).toBe(1);
  });

  test("format is `||`, so an explicit \"toon\" survives and anything absent is \"json\"", () => {
    expect(readFileOptions({ format: "toon" } as ReadFileParams).format).toBe("toon");
    expect(readFileOptions({} as ReadFileParams).format).toBe("json");
  });

  test("fields is passed through by destructuring, undefined included", () => {
    expect(readFileOptions({ fields: ["a.b"] } as ReadFileParams).fields).toEqual(["a.b"]);
    expect(readFileOptions({} as ReadFileParams).fields).toBeUndefined();
  });
});

// ── 2. read() — the discriminated outcome ────────────────────────────────────
describe("read() denies through `ok:false`, never through a ToolResponse", () => {
  test("a relative path with no projectId is a denial, with the exact error text", async () => {
    const svc = new ReadFileService();
    const p = { filePath: "src/index.ts" } as ReadFileParams;
    const outcome = await svc.read(p, readFileOptions(p));

    expect(outcome.ok).toBe(false);
    expect((outcome as { ok: false; error: string }).error).toBe(
      "Relative filePath requires a projectId (to resolve against the workspace) or an absolute path.",
    );
    // The shape is the seam: no `success` key, so the handler's mapping is the
    // only thing that produces one. A service returning a ToolResponse directly
    // would pass every pre-existing suite and violate RFS-03 AC-2's intent.
    expect(outcome).not.toHaveProperty("success");
    expect(outcome).not.toHaveProperty("data");
  });

  test("an absolute path outside every root is a denial carrying the teaching error", async () => {
    const svc = new ReadFileService();
    const p = { filePath: "/etc/passwd" } as ReadFileParams;
    const outcome = await svc.read(p, readFileOptions(p));

    expect(outcome.ok).toBe(false);
    const { error } = outcome as { ok: false; error: string };
    expect(error).toContain("outside the allowed roots");
    // RFS-06 AC-2's property, re-asserted at this seam: the ENUMERATED LIST is
    // roots only. Echoing the caller's own input back is not host-path
    // enumeration and the message does it deliberately — the assertion is on the
    // list, not on the whole string, which is what the criterion actually says.
    const enumerated = error.slice(error.indexOf("Valid roots"));
    expect(enumerated).toContain(process.cwd());
    expect(enumerated).not.toContain("/etc/passwd");
    expect(enumerated.split("\n").filter((l) => l.startsWith("  - "))).toHaveLength(1);
  });
});

// ── 3. read() — the success path, end to end through modules 2-6 ─────────────
describe("read() composes modules 2-6 and assembles the result", () => {
  test("a small whole-file read: no tips but the line-range one, and tokens are uncompressed", async () => {
    const svc = new ReadFileService();
    const p = { filePath: SMALL, compress: false } as ReadFileParams;
    const outcome = await svc.read(p, readFileOptions(p));
    const d = okData(outcome);

    const total = linesOf(SMALL);
    expect(d.filePath).toBe(SMALL);
    expect(d.absolutePath).toBe(SMALL);
    expect(d.lineRange.requested).toEqual({ start: 1, end: null }); // Infinity → null
    expect(d.lineRange.actual).toEqual({ start: 1, end: total, total });
    expect(d.lineRange.selected).toBe(total);
    expect(d.source_clipped).toBe(false);
    expect(d.compressed).toBe(false);
    expect(d.metadata.totalLines).toBe(total);
    expect(d.metadata.language).toBe("TypeScript");
    // Under 100 lines, so the large-file tip must NOT fire; the whole-file tip must.
    expect(d.recommendations).toEqual([
      "💡 Use lineStart/lineEnd or offset/limit to read specific sections (60% token savings)",
    ]);
    // The else arm sets original === compressed and saved 0 — not a copy of the
    // compressed arm's math with different inputs.
    expect(d.tokens.original).toBe(d.tokens.compressed);
    expect(d.tokens.saved).toBe(0);
    expect(d.tokens.savingsPercent).toBe(0);
    expect(d.compressionRatio).toBeUndefined();
  });

  test("an explicit range suppresses the whole-file tip, because `end` is not Infinity", async () => {
    const svc = new ReadFileService();
    const p = { filePath: SMALL, compress: false, lineStart: 2, lineEnd: 5 } as ReadFileParams;
    const outcome = await svc.read(p, readFileOptions(p));
    const d = okData(outcome);

    expect(d.lineRange.requested).toEqual({ start: 2, end: 5 });
    expect(d.lineRange.selected).toBe(4);
    expect(d.metadata.totalLines).toBe(linesOf(SMALL)); // total, not the slice
    expect(d.recommendations).toEqual([]);
  });

  test("over 100 lines: the large-file tip fires and precedes the whole-file tip", async () => {
    const svc = new ReadFileService();
    const p = { filePath: MEDIUM, compress: false } as ReadFileParams;
    const outcome = await svc.read(p, readFileOptions(p));
    const d = okData(outcome);

    expect(d.lineRange.selected).toBeGreaterThan(100);
    // Order is user-visible MCP output. The large-file tip is pushed inside the
    // else arm, the whole-file tip after it.
    expect(d.recommendations).toEqual([
      "💡 Content > 100 lines. Consider compress=true for token savings",
      "💡 Use lineStart/lineEnd or offset/limit to read specific sections (60% token savings)",
    ]);
  });

  test("targetRatio 1 disables compression on a >100-line read without mocking the compressor", async () => {
    // `targetRatio < 1` is the third conjunct of shouldAutoCompress and the only
    // one no other suite varies: the presentation suite fixes it at 0.3 and
    // flips `compress` instead. A mutation making the conjunct `<=` is invisible
    // there and dies here.
    const svc = new ReadFileService();
    const p = { filePath: MEDIUM, compress: true, targetRatio: 1 } as ReadFileParams;
    const outcome = await svc.read(p, readFileOptions(p));
    const d = okData(outcome);

    expect(d.compressed).toBe(false);
    expect(d.compressionRatio).toBeUndefined();
  });

  test("past the N9 cap: clipped, and `actual.end` is derived from the clip while `total` is not", async () => {
    const svc = new ReadFileService();
    const p = { filePath: LARGE, compress: false } as ReadFileParams;
    const outcome = await svc.read(p, readFileOptions(p));
    const d = okData(outcome);

    const total = linesOf(LARGE);
    expect(d.source_clipped).toBe(true);
    expect(d.lineRange.selected).toBe(N9_CAP);
    // The whole point of keeping `total` truthful: `omitted = total - shown`.
    expect(d.lineRange.actual.total).toBe(total);
    expect(d.lineRange.actual.end).toBe(N9_CAP); // start 1 + 500 - 1
    expect(d.lineRange.actual.end).toBeLessThan(total);
    expect(d.metadata.totalLines).toBe(total);
    // C67, pinned at this seam too: the clipped path serves UNNUMBERED text
    // where an unclipped read is line-numbered. Logged, not fixed.
    expect(d.content.startsWith("     1: ")).toBe(false);
  });

  test("metadata keys are conditional spreads: absent, not undefined, when not requested", async () => {
    const svc = new ReadFileService();
    const p = { filePath: SMALL, compress: false, includeSymbols: false, includeImports: false } as ReadFileParams;
    const outcome = await svc.read(p, readFileOptions(p));
    const d = okData(outcome);

    // `...(x && {k:x})` omits the key entirely. `toBeUndefined()` alone would
    // also pass on a present key holding undefined, which is a different wire
    // shape once serialized.
    expect(Object.keys(d.metadata).sort()).toEqual(["language", "totalLines"]);
    expect("symbols" in d.metadata).toBe(false);
    expect("imports" in d.metadata).toBe(false);
    expect(d.recommendations).not.toContain(
      "💡 Use get_references() to find usages of 0 symbols in this file",
    );
  });

  test("the symbol tip fires only above zero definitions, and interpolates the count", async () => {
    const withSymbols = new ReadFileService(symbolGraphWith(3));
    const p = { filePath: SMALL, compress: false, projectId: "svc-t12" } as ReadFileParams;
    const d = okData(await withSymbols.read(p, readFileOptions(p)));
    expect(d.recommendations).toContain(
      "💡 Use get_references() to find usages of 3 symbols in this file",
    );

    const withNone = new ReadFileService(symbolGraphWith(0));
    const d0 = okData(await withNone.read(p, readFileOptions(p)));
    expect(d0.recommendations.some((r) => r.includes("get_references"))).toBe(false);
  });

  test("the 4 → 5 arrow re-resolves the extractor on every call, so replacing it is observable", async () => {
    // The constructor could have written `.bind(this.fileMetadata)`. It does not,
    // and this is the seam that proves it: a bound reference captured at
    // construction would freeze the original and this counter would read 0.
    // `read-file.test.ts` asserts the same property through the tool; here it is
    // asserted on the module that owns the wiring.
    const svc = new ReadFileService();
    const priv = svc as unknown as {
      fileMetadata: { extractMetadata: (...a: never[]) => Promise<unknown> };
    };
    let calls = 0;
    const real = priv.fileMetadata.extractMetadata.bind(priv.fileMetadata);
    priv.fileMetadata.extractMetadata = async (...a: Parameters<typeof real>) => {
      calls++;
      return real(...a);
    };

    const p = { filePath: SMALL, compress: false } as ReadFileParams;
    await svc.read(p, readFileOptions(p));
    expect(calls).toBe(1);
  });

  test("a second read of the same file with the same options is served from the cache", async () => {
    // Not a duplicate of file-content-cache.test.ts: that suite drives the cache
    // directly. This asserts module 7 still WIRES one, which a composition that
    // constructed a fresh FileContentCache per call would break while every
    // response assertion above stayed green.
    const svc = new ReadFileService();
    const priv = svc as unknown as { fileContent: { fileCache: Map<string, unknown> } };
    const p = { filePath: SMALL, compress: false } as ReadFileParams;

    await svc.read(p, readFileOptions(p));
    expect(priv.fileContent.fileCache.size).toBe(1);
    await svc.read(p, readFileOptions(p));
    expect(priv.fileContent.fileCache.size).toBe(1);
  });
});

// ── 3b. What the option-read POSITION actually preserves ──────────────────
describe("handle() reads its options above the try — the pre-T12 throw position", () => {
  // THE MECHANISM HERE WAS DERIVED WRONG TWICE AND THE HARNESS CAUGHT BOTH TIMES.
  //
  // First the pin was simply MISSING: the mutation that moves `readFileOptions`
  // inside the `try` survived this suite entirely, so the decision was
  // documented and unenforced. Then it was written as
  // `expect(...).rejects.toThrow()` WITHOUT `await` — a floating promise, which
  // passes under the very mutation it exists to kill.
  //
  // Then the third reading, and it corrects the plan rather than the test:
  // `handle(null)` is NOT the discriminating input. Measured — `null` rejects
  // with the option reads on EITHER side of the `try`, because the catch block
  // itself evaluates `p.filePath` to build its log context and throws again out
  // of the catch. The rejection was preserved by accident, not by the call
  // position, and the plan asserted the opposite.
  //
  // What the position actually preserves is narrower, and is what is pinned
  // below: a request whose OPTION accessor throws while `filePath` reads fine.
  // Above the `try` that rejects, exactly as it did before T12; inside, it is
  // caught and returned as `{success:false}`. Exotic, and still the exact
  // pre-T12 observable — which is the contract this PR is under.
  const throwingOption = () =>
    ({
      filePath: "/tmp/never-read.ts",
      get compress(): boolean {
        throw new Error("option getter exploded");
      },
    }) as unknown;

  test("an option accessor that throws REJECTS, because the read is above the try", async () => {
    const { ReadFileTool } = await import("../tools/read_file.js");
    const tool = new ReadFileTool();
    await expect(tool.handle(throwingOption())).rejects.toThrow("option getter exploded");
  });

  test("...while a well-formed request with a bad path resolves to success:false", async () => {
    // The other direction. Without it, the case above is satisfied by a handler
    // that throws on everything — a far larger behaviour change passing the same
    // assertion.
    const { ReadFileTool } = await import("../tools/read_file.js");
    const tool = new ReadFileTool();
    const res = await tool.handle({ filePath: "src/index.ts" });
    expect(res.success).toBe(false);
    expect(res.error).toBe(
      "Relative filePath requires a projectId (to resolve against the workspace) or an absolute path.",
    );
  });

  test("handle(null) rejects — but the catch's own `p.filePath` is why, not the call position", async () => {
    // Kept as a recorded measurement rather than deleted, because the plan
    // asserted the opposite and a later reader will draw the same inference from
    // the same code. This case DOCUMENTS a mechanism; it does not sense one, and
    // it stays green under the call-position mutation deliberately.
    const { ReadFileTool } = await import("../tools/read_file.js");
    const tool = new ReadFileTool();
    await expect(tool.handle(null)).rejects.toThrow();
  });
});

// ── 4. RFS-03 AC-2, at the module level ──────────────────────────────────────
describe("read-file.service.ts imports nothing under tools/ — RFS-03 AC-2", () => {
  const MODULE_PATH = path.join(SRC, "services/file-read/read-file.service.ts");

  test("no import edge of any kind reaches tools/, by AST rather than by text match", () => {
    // On this feature's standing rule (`design.md` §6.4: never a regex). A
    // substring check for "tools/" would false-positive on this module's own
    // docblock, which names `tools/read_file.ts` four times, and would miss a
    // dynamic `import()` or an `export … from` re-export.
    const source = fs.readFileSync(MODULE_PATH, "utf8");
    const sf = ts.createSourceFile(MODULE_PATH, source, ts.ScriptTarget.Latest, true);
    const specifiers: string[] = [];

    const walk = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) specifiers.push(node.moduleSpecifier.getText(sf));
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        specifiers.push(node.moduleSpecifier.getText(sf));
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        specifiers.push(node.arguments[0]?.getText(sf) ?? "(computed)");
      }
      if (ts.isImportEqualsDeclaration(node)) specifiers.push(node.name.getText(sf));
      ts.forEachChild(node, walk);
    };
    walk(sf);

    // Print the population beside the verdict: a walk that resolved nothing
    // reports zero violations exactly like a clean module.
    expect(specifiers.length).toBeGreaterThan(0);
    const offenders = specifiers.filter((s) => /(^|\/)tools\//.test(s.replace(/["']/g, "")));
    expect(offenders).toEqual([]);
    // ...and specifically the one it would reach for, since `handle()` returned
    // a serialized response and this module returns a plain object instead.
    expect(specifiers.some((s) => s.includes("serialize"))).toBe(false);
  });
});
