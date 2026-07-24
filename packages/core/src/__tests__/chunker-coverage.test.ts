/**
 * Chunker submodule coverage tests.
 *
 * Targets uncovered lines in chunker-json-yaml.ts, chunker-post.ts, and
 * chunker-code.ts that the smart-chunker.* tests don't reach via the
 * dispatcher. Pure module — no DB, no I/O, no config.
 */

import { describe, test, expect } from "bun:test";
import { smartChunk } from "../services/search/smart-chunker.js";
import {
  chunkJSON,
  chunkYAML,
} from "../services/search/chunker/chunker-json-yaml.js";
import {
  postProcess,
  splitOversizedChunk,
  splitLineByChars,
  chunkFixed,
} from "../services/search/chunker/chunker-post.js";
import {
  chunkCode,
  findCodeBoundaries,
  netBraceDelta,
  extractFileImports,
} from "../services/search/chunker/chunker-code.js";
import { DEFAULT_CONFIG, type Chunk, type ChunkerConfig } from "../services/search/chunker/chunker-types.js";

const cfg = (overrides: Partial<ChunkerConfig> = {}): ChunkerConfig => ({
  ...DEFAULT_CONFIG,
  addFileContext: false,
  ...overrides,
});

// ── chunkJSON ──────────────────────────────────────────────────────────────

describe("chunkJSON — edge cases", () => {
  test("invalid JSON → fixed fallback", () => {
    const chunks = chunkJSON("{not valid json", cfg());
    expect(chunks.every((c) => c.type === "fixed")).toBe(true);
  });

  test("JSON array → fixed fallback (arrays don't split)", () => {
    const chunks = chunkJSON("[1, 2, 3]", cfg());
    expect(chunks.every((c) => c.type === "fixed")).toBe(true);
  });

  test("JSON null → fixed fallback (typeof !== object after null check)", () => {
    const chunks = chunkJSON("null", cfg());
    expect(chunks.every((c) => c.type === "fixed")).toBe(true);
  });

  test("<5 keys → single chunk labeled with the key set", () => {
    const json = JSON.stringify({ a: 1, b: 2 }, null, 2);
    const chunks = chunkJSON(json, cfg());
    expect(chunks).toHaveLength(1);
    expect(chunks[0].label).toBe("{a, b}");
  });

  test(">=5 keys → per-key chunks with line ranges", () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 6; i++) obj[`k${i}`] = i;
    const json = JSON.stringify(obj, null, 2);
    const chunks = chunkJSON(json, cfg());
    expect(chunks.length).toBe(6);
    expect(chunks.every((c) => c.type === "json_key")).toBe(true);
    // Each chunk labeled by its key
    expect(chunks[0].label).toBe("k0");
    expect(chunks[5].label).toBe("k5");
  });
});

// ── chunkYAML ──────────────────────────────────────────────────────────────

describe("chunkYAML — edge cases", () => {
  test("multi-document YAML (--- separators) → one chunk per document", () => {
    const yaml = [
      "---",
      "alpha: 1",
      "beta: 2",
      "---",
      "gamma: 3",
      "delta: 4",
    ].join("\n");
    const chunks = chunkYAML(yaml, cfg());
    expect(chunks.length).toBe(2);
    expect(chunks.every((c) => c.type === "yaml_block")).toBe(true);
    expect(chunks[0].label).toBe("document 1");
    expect(chunks[1].label).toBe("document 2");
  });

  test("multi-document YAML with empty documents skips them", () => {
    const yaml = ["---", "", "---", "alpha: 1"].join("\n");
    const chunks = chunkYAML(yaml, cfg());
    // First doc is empty (only blank line) → skipped; second has content.
    expect(chunks.length).toBe(1);
    expect(chunks[0].label).toBe("document 2");
  });

  test("single-document YAML with --- line inside content is kept", () => {
    // A lone --- in a single-doc context is pushed as content (line 108-109).
    const yaml = ["---", "alpha: 1", "---", "beta: 2"].join("\n");
    const chunks = chunkYAML(yaml, cfg());
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.every((c) => c.type === "yaml_block")).toBe(true);
  });

  test("single-document YAML with ... terminator", () => {
    const yaml = ["alpha: 1", "...", "beta: 2"].join("\n");
    const chunks = chunkYAML(yaml, cfg());
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.every((c) => c.type === "yaml_block")).toBe(true);
  });

  test("top-level key split: first block labeled by key", () => {
    const yaml = "alpha: 1\nbeta: 2\ngamma: 3\n";
    const chunks = chunkYAML(yaml, cfg());
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].label).toBe("alpha");
  });

  test("empty YAML → fixed fallback", () => {
    const chunks = chunkYAML("", cfg());
    expect(chunks.every((c) => c.type === "fixed")).toBe(true);
  });
});

// ── postProcess ───────────────────────────────────────────────────────────

describe("postProcess — merge + split", () => {
  test("empty input → empty output", () => {
    expect(postProcess([], cfg())).toEqual([]);
  });

  test("tiny chunk merges into previous when it fits", () => {
    const big: Chunk = {
      content: "line1\nline2\nline3\nline4\nline5",
      lineStart: 1,
      lineEnd: 5,
      type: "fixed",
    };
    const tiny: Chunk = {
      content: "x",
      lineStart: 6,
      lineEnd: 6,
      type: "fixed",
    };
    const out = postProcess([big, tiny], cfg({ minChunkLines: 5 }));
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain("x");
    expect(out[0].lineEnd).toBe(6);
  });

  test("tiny chunk does NOT merge when previous is too large", () => {
    // Previous chunk at maxChunkChars limit → merge would exceed → tiny stays.
    const big: Chunk = {
      content: "a".repeat(7500),
      lineStart: 1,
      lineEnd: 1,
      type: "fixed",
    };
    const tiny: Chunk = {
      content: "x",
      lineStart: 2,
      lineEnd: 2,
      type: "fixed",
    };
    const out = postProcess([big, tiny], cfg({ minChunkLines: 5, maxChunkChars: 7500 }));
    // big is at char limit; tiny (1 char + "\n" = 2) would exceed → not merged.
    expect(out).toHaveLength(2);
  });

  test("code_block chunks are NOT merged even when small (label guard)", () => {
    const code1: Chunk = {
      content: "x",
      lineStart: 1,
      lineEnd: 1,
      type: "code_block",
      label: "Foo.bar",
    };
    const code2: Chunk = {
      content: "y",
      lineStart: 2,
      lineEnd: 2,
      type: "code_block",
      label: "Foo.baz",
    };
    const out = postProcess([code1, code2], cfg({ minChunkLines: 5 }));
    // Both are code_block with labels → both pushed, no merge.
    expect(out).toHaveLength(2);
  });

  test("oversized chunk by line count → splitOversizedChunk", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`);
    const big: Chunk = {
      content: lines.join("\n"),
      lineStart: 1,
      lineEnd: 300,
      type: "fixed",
    };
    const out = postProcess([big], cfg({ maxChunkLines: 100 }));
    expect(out.length).toBeGreaterThan(1);
  });

  test("oversized chunk by char count → splitOversizedChunk", () => {
    const big: Chunk = {
      content: "a".repeat(20000),
      lineStart: 1,
      lineEnd: 1,
      type: "fixed",
    };
    const out = postProcess([big], cfg({ maxChunkChars: 7500 }));
    expect(out.length).toBeGreaterThan(1);
  });
});

// ── splitOversizedChunk ───────────────────────────────────────────────────

describe("splitOversizedChunk — direct", () => {
  test("splits on blank line boundary when available", () => {
    const lines = Array.from({ length: 60 }, (_, i) => (i === 30 ? "" : `line ${i}`));
    const chunk: Chunk = {
      content: lines.join("\n"),
      lineStart: 1,
      lineEnd: 60,
      type: "fixed",
    };
    const out = splitOversizedChunk(chunk, cfg({ maxChunkLines: 20, maxChunkChars: 7500 }));
    expect(out.length).toBeGreaterThan(1);
  });

  test("oversized single line → splitLineByChars", () => {
    const chunk: Chunk = {
      content: "a".repeat(20000),
      lineStart: 1,
      lineEnd: 1,
      type: "fixed",
    };
    const out = splitOversizedChunk(chunk, cfg({ maxChunkLines: 20, maxChunkChars: 500 }));
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.content.length).toBeLessThanOrEqual(500);
  });

  test("labeled chunk parts get '(part N)' suffix", () => {
    const chunk: Chunk = {
      content: Array.from({ length: 60 }, () => "x".repeat(200)).join("\n"),
      lineStart: 1,
      lineEnd: 60,
      type: "code_block",
      label: "MyClass.method",
    };
    const out = splitOversizedChunk(chunk, cfg({ codeChunkTarget: 10, maxChunkChars: 7500 }));
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].label).toContain("(part 1)");
  });

  test("empty sub-chunks are skipped (pushSub guard)", () => {
    const chunk: Chunk = {
      content: "real\n\n\n\n\nreal",
      lineStart: 1,
      lineEnd: 6,
      type: "fixed",
    };
    const out = splitOversizedChunk(chunk, cfg({ maxChunkLines: 2, maxChunkChars: 7500 }));
    // Empty slices filtered by pushSub
    expect(out.every((c) => c.content.trim().length > 0)).toBe(true);
  });
});

// ── splitLineByChars ───────────────────────────────────────────────────────

describe("splitLineByChars — direct", () => {
  test("splits on semicolon separator", () => {
    const line = "a;".repeat(100) + "tail";
    const parts = splitLineByChars(line, 50);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(50);
  });

  test("splits on comma when no semicolon in window", () => {
    const line = "aaa,bbb,ccc,".repeat(50);
    const parts = splitLineByChars(line, 50);
    expect(parts.length).toBeGreaterThan(1);
  });

  test("splits on space when no semicolon/comma", () => {
    const line = "word ".repeat(200);
    const parts = splitLineByChars(line, 50);
    expect(parts.length).toBeGreaterThan(1);
  });

  test("hard-splits at maxChars when no separator found", () => {
    const line = "a".repeat(200);
    const parts = splitLineByChars(line, 50);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBe(50);
  });

  test("remaining tail is appended", () => {
    const line = "a".repeat(120);
    const parts = splitLineByChars(line, 50);
    expect(parts.join("").length).toBe(120);
  });
});

// ── chunkFixed ────────────────────────────────────────────────────────────

describe("chunkFixed — direct", () => {
  test("splits into fixedChunkSize blocks", () => {
    const content = Array.from({ length: 120 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkFixed(content, cfg({ fixedChunkSize: 50 }));
    expect(chunks).toHaveLength(3);
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBe(50);
  });

  test("skips all-whitespace chunks", () => {
    const content = "   \n  \n   ";
    const chunks = chunkFixed(content, cfg({ fixedChunkSize: 50 }));
    expect(chunks).toHaveLength(0);
  });
});

// ── chunkCode / findCodeBoundaries / netBraceDelta ─────────────────────────

describe("chunkCode — block comments", () => {
  test("block comment lines are skipped in boundary detection", () => {
    const code = [
      "/* this is a block comment",
      "spanning multiple lines",
      "with a function name inside: function fake() {}",
      "*/",
      "export function real() { return 1; }",
    ].join("\n");
    const lines = code.split("\n");
    const boundaries = findCodeBoundaries(lines);
    // 'fake' inside the comment must NOT be a boundary; 'real' must.
    expect(boundaries.some((b) => b.label === "real")).toBe(true);
    expect(boundaries.some((b) => b.label === "fake")).toBe(false);
  });

  test("single-line block comment (open+close same line) does not enter block mode", () => {
    const code = [
      "/* single line comment */",
      "export function afterComment() { return 1; }",
    ].join("\n");
    const lines = code.split("\n");
    const boundaries = findCodeBoundaries(lines);
    expect(boundaries.some((b) => b.label === "afterComment")).toBe(true);
  });
});

describe("netBraceDelta", () => {
  test("strips line comments", () => {
    expect(netBraceDelta("const x = 1; // { opens")).toBe(0);
  });

  test("strips string literals with braces", () => {
    expect(netBraceDelta('const s = "{ opens";')).toBe(0);
  });

  test("strips template literals with braces", () => {
    expect(netBraceDelta("const s = `${1}`;")).toBe(0);
  });

  test("counts actual braces outside strings/comments", () => {
    expect(netBraceDelta("function f() {")).toBe(1);
    expect(netBraceDelta("}")).toBe(-1);
    expect(netBraceDelta("{ } { }")).toBe(0);
  });
});

describe("extractFileImports", () => {
  test("TS: collects import lines until blank line", () => {
    const content = [
      "import { foo } from './foo';",
      "import { bar } from './bar';",
      "",
      "export const x = 1;",
    ].join("\n");
    const result = extractFileImports(content, ".ts");
    expect(result).toContain("import { foo }");
    expect(result).toContain("import { bar }");
    expect(result).not.toContain("export");
  });

  test("TS: includes const-destructure and require lines", () => {
    const content = [
      "const { baz } = require('./baz');",
      "require('side-effect');",
      "import { qux } from './qux';",
    ].join("\n");
    const result = extractFileImports(content, ".ts");
    expect(result).toContain("const { baz }");
    expect(result).toContain("require('side-effect')");
    expect(result).toContain("import { qux }");
  });

  test("Python: collects import and from lines", () => {
    const content = [
      "import os",
      "from typing import List",
      "x = 1",
    ].join("\n");
    const result = extractFileImports(content, ".py");
    expect(result).toContain("import os");
    expect(result).toContain("from typing import List");
    expect(result).not.toContain("x = 1");
  });

  test("No imports → undefined", () => {
    expect(extractFileImports("const x = 1;", ".ts")).toBeUndefined();
  });
});

// ── smartChunk dispatch: markdown .mdx ────────────────────────────────────

describe("smartChunk — .mdx dispatches to markdown chunker", () => {
  test(".mdx file uses markdown chunking", () => {
    const md = [
      "# Title", "l1", "l2", "l3", "l4", "l5",
    ].join("\n");
    const chunks = smartChunk(md, "doc.mdx", { addFileContext: false });
    expect(chunks.every((c) => c.type === "heading_section")).toBe(true);
  });
});