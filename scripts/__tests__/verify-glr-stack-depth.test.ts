/**
 * verify-glr-stack-depth.ts — unit tests for the extracted probe helpers.
 *
 * The native tree-sitter binding is build-gated (absent from many checkouts),
 * so the probe is split into dependency-injected helpers tested with fakes.
 * The top-level probeGlrStackDepth() is also invoked to cover its real
 * "binding unavailable" early-return path.
 */
import { describe, test, expect } from "bun:test";
import {
  loadBinding,
  loadGrammar,
  inspectParserPrototype,
  buildAmbiguousNestedTernary,
  parseAmbiguousInput,
  printReport,
  probeGlrStackDepth,
  type ParserLike,
} from "../verify-glr-stack-depth";

describe("buildAmbiguousNestedTernary", () => {
  test("produces depth repetitions of the ternary fragment", () => {
    expect(buildAmbiguousNestedTernary(0)).toBe("let x = c;");
    const d3 = buildAmbiguousNestedTernary(3);
    expect(d3.startsWith("let x = a ? b : a ? b : a ? b : ")).toBe(true);
    expect(d3.endsWith("c;")).toBe(true);
    // exactly 3 occurrences of the fragment
    expect(d3.split("a ? b : ").length - 1).toBe(3);
  });
});

describe("loadBinding", () => {
  test("returns the constructor when the resolver yields a function", () => {
    function FakeParser() {}
    const got = loadBinding(() => FakeParser);
    expect(got).toBe(FakeParser);
  });

  test("returns null when the resolver yields a non-function / null", () => {
    expect(loadBinding(() => null)).toBeNull();
    expect(loadBinding(() => ({ not: "a ctor" }))).toBeNull();
  });
});

describe("loadGrammar", () => {
  test("prefers tree-sitter-javascript when present", () => {
    const jsLang = { name: "js" };
    const got = loadGrammar((name) =>
      name === "tree-sitter-javascript" ? jsLang : null,
    );
    expect(got).toBe(jsLang);
  });

  test("falls back to tree-sitter-typescript.typescript when js is absent", () => {
    const tsLang = { name: "ts" };
    const got = loadGrammar((name) =>
      name === "tree-sitter-typescript" ? { typescript: tsLang } : null,
    );
    expect(got).toBe(tsLang);
  });

  test("returns null when no grammar resolves (and ignores ts without .typescript)", () => {
    expect(loadGrammar(() => null)).toBeNull();
    // ts object present but no truthy .typescript -> null (js absent)
    expect(
      loadGrammar((name) =>
        name === "tree-sitter-typescript" ? { typescript: null } : null,
      ),
    ).toBeNull();
    expect(
      loadGrammar((name) =>
        name === "tree-sitter-typescript" ? { other: 1 } : null,
      ),
    ).toBeNull();
  });

  test("default resolver never throws even when grammar packages are absent", () => {
    // Exercises the built-in require-based resolver (try/catch per name).
    expect(() => loadGrammar()).not.toThrow();
  });
});

describe("inspectParserPrototype", () => {
  function makeProto(keys: string[]): { [k: string]: unknown } & ParserLike {
    class Fake {
      [k: string]: unknown;
      setLanguage() {}
      parse() {
        return null;
      }
    }
    const proto = Fake.prototype as Record<string, unknown>;
    for (const k of keys) proto[k] = () => {};
    return new Fake() as unknown as { [k: string]: unknown } & ParserLike;
  }

  test("reports no GLR keys and the default 'not exposed' cap", () => {
    const inst = makeProto(["parse", "setLanguage"]);
    const r = inspectParserPrototype(inst);
    expect(r.glrRelated).toEqual([]);
    expect(r.stackMergeDepthCap).toBe("not exposed");
    expect(r.notes).toContain(
      "No GLR/stack/merge/depth/limit/max keys found on Parser prototype",
    );
  });

  test("detects GLR-related prototype keys and reports the keys-found cap", () => {
    const inst = makeProto(["parse", "setLanguage", "maxStackDepth", "glrLimit"]);
    const r = inspectParserPrototype(inst);
    expect(r.glrRelated).toContain("maxStackDepth");
    expect(r.glrRelated).toContain("glrLimit");
    expect(r.stackMergeDepthCap).toBe(
      "not exposed (keys found but no direct cap accessor)",
    );
    expect(r.notes.some((n) => n.startsWith("GLR-related keys found:"))).toBe(true);
  });
});

describe("parseAmbiguousInput", () => {
  function fakeParser(tree: unknown): ParserLike & { calls: number } {
    let calls = 0;
    return {
      calls,
      setLanguage() {},
      parse() {
        (this as { calls: number }).calls += 1;
        return tree;
      },
    } as ParserLike & { calls: number };
  }

  test("parses cleanly when no error flag is set", () => {
    const p = fakeParser({ rootNode: { hasError: false } });
    const r = parseAmbiguousInput(p, "lang");
    expect(r.ambiguousInputParsed).toBe(true);
    expect(r.errorCount).toBe(0);
    expect(r.notes).toContain("Ambiguous input (depth=100): parsed without crash");
    expect(r.notes).toContain("Parse tree: no error flag (ambiguous input resolved)");
  });

  test("reports error flag set when rootNode.hasError is true", () => {
    const p = fakeParser({ rootNode: { hasError: true } });
    const r = parseAmbiguousInput(p, "lang");
    expect(r.ambiguousInputParsed).toBe(true);
    expect(r.errorCount).toBe(-1);
    expect(r.notes).toContain(
      "Parse tree has error flag set (ambiguous input produced errors)",
    );
  });

  test("treats a null rootNode as a clean parse", () => {
    const p = fakeParser({ rootNode: null });
    const r = parseAmbiguousInput(p, "lang");
    expect(r.ambiguousInputParsed).toBe(true);
    expect(r.errorCount).toBe(0);
  });

  test("captures a thrown parse error", () => {
    const p: ParserLike = {
      setLanguage() {
        throw new Error("boom");
      },
      parse() {
        return null;
      },
    };
    const r = parseAmbiguousInput(p, "lang");
    expect(r.ambiguousInputParsed).toBe(false);
    expect(r.errorCount).toBe(1);
    expect(r.notes.some((n) => n.startsWith("Ambiguous input parse failed: boom"))).toBe(true);
  });
});

describe("probeGlrStackDepth (real binding resolution)", () => {
  test("returns a ProbeResult; binding availability reflects the live checkout", async () => {
    const result = await probeGlrStackDepth();
    expect(typeof result.bindingAvailable).toBe("boolean");
    expect(Array.isArray(result.notes)).toBe(true);
    expect(result.notes.length).toBeGreaterThan(0);
    // When the binding is unavailable the probe short-circuits cleanly.
    if (!result.bindingAvailable) {
      expect(result.grammarLoaded).toBe(false);
      expect(result.ambiguousInputParsed).toBe(false);
      expect(result.notes).toContain(
        "tree-sitter binding: NOT available (non-native runtime or missing package)",
      );
    } else {
      // When present, the probe must have attempted a grammar + parse.
      expect(result.stackMergeDepthCap).toContain("not exposed");
    }
  });
});

describe("probeGlrStackDepth (injected fakes cover the binding-available path)", () => {
  function makeFakeParser(tree: unknown): { new (): ParserLike } {
    return class {
      setLanguage() {}
      parse() {
        return tree;
      }
    };
  }

  test("binding available + grammar available + clean parse reaches finalize notes", async () => {
    const result = await probeGlrStackDepth({
      bindingResolver: () => makeFakeParser({ rootNode: { hasError: false } }),
      grammarResolver: (name) =>
        name === "tree-sitter-javascript" ? { isJs: true } : null,
    });
    expect(result.bindingAvailable).toBe(true);
    expect(result.grammarLoaded).toBe(true);
    expect(result.ambiguousInputParsed).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.stackMergeDepthCap).toBe("not exposed by binding API");
    expect(result.notes).toContain("tree-sitter binding: available");
    expect(result.notes).toContain("tree-sitter-javascript grammar: loaded");
    expect(result.notes).toContain("Ambiguous input (depth=100): parsed without crash");
    expect(result.notes).toContain(
      "GLR stack-merge depth cap is internal to the C runtime (parser.c)",
    );
  });

  test("binding available but no grammar -> early return before parse", async () => {
    const result = await probeGlrStackDepth({
      bindingResolver: () => makeFakeParser({ rootNode: null }),
      grammarResolver: () => null,
    });
    expect(result.bindingAvailable).toBe(true);
    expect(result.grammarLoaded).toBe(false);
    expect(result.ambiguousInputParsed).toBe(false);
    expect(result.notes).toContain("No grammar available — cannot probe ambiguous input");
  });

  test("falls back to typescript grammar when javascript is absent", async () => {
    const tsLang = { isTs: true };
    const result = await probeGlrStackDepth({
      bindingResolver: () => makeFakeParser({ rootNode: null }),
      grammarResolver: (name) =>
        name === "tree-sitter-typescript" ? { typescript: tsLang } : null,
    });
    expect(result.grammarLoaded).toBe(true);
    expect(result.ambiguousInputParsed).toBe(true);
  });

  test("error flag on root node propagates errorCount = -1", async () => {
    const result = await probeGlrStackDepth({
      bindingResolver: () => makeFakeParser({ rootNode: { hasError: true } }),
      grammarResolver: (name) =>
        name === "tree-sitter-javascript" ? { isJs: true } : null,
    });
    expect(result.ambiguousInputParsed).toBe(true);
    expect(result.errorCount).toBe(-1);
  });
});

describe("printReport", () => {
  test("renders the report header, fields, and notes", () => {
    const lines: string[] = [];
    const orig = console.log;
    try {
      console.log = (...a: unknown[]) => lines.push(a.join(" "));
      printReport({
        bindingAvailable: true,
        grammarLoaded: true,
        ambiguousInputParsed: true,
        stackMergeDepthCap: "not exposed by binding API",
        errorCount: 0,
        notes: ["alpha", "beta"],
      });
    } finally {
      console.log = orig;
    }
    expect(lines.some((l) => l.includes("M62 — GLR Stack-Merge Depth Verification Probe"))).toBe(true);
    expect(lines.some((l) => l.includes("Binding available:     true"))).toBe(true);
    expect(lines.some((l) => l.includes("Stack-merge depth cap: not exposed by binding API"))).toBe(true);
    expect(lines.some((l) => l.includes("• alpha"))).toBe(true);
    expect(lines.some((l) => l.includes("Findings documented in docs/glr-verification.md"))).toBe(true);
  });
});
