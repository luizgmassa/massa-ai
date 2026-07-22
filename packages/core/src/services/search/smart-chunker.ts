/**
 * Smart Chunker - Language/format-aware semantic chunking
 *
 * Wave 6 N31: types, markdown, json/yaml, and fixed chunking extracted to
 * chunker/ modules. Code chunking and post-processing remain here pending T16.
 */

import path from "path";

// ── Re-exports from extracted modules ───────────────────────────────────────
export type { Chunk, ChunkerConfig } from "./chunker/chunker-types.js";
export { DEFAULT_CONFIG } from "./chunker/chunker-types.js";
export { chunkMarkdown, chunkMarkdownByHeadings } from "./chunker/chunker-markdown.js";
export { chunkJSON, chunkYAML } from "./chunker/chunker-json-yaml.js";
export { chunkFixed } from "./chunker/chunker-post.js";

// ── Imports for internal use ────────────────────────────────────────────────
import type { Chunk, ChunkerConfig } from "./chunker/chunker-types.js";
import { DEFAULT_CONFIG } from "./chunker/chunker-types.js";
import { chunkMarkdown } from "./chunker/chunker-markdown.js";
import { chunkJSON, chunkYAML } from "./chunker/chunker-json-yaml.js";
import { chunkFixed } from "./chunker/chunker-post.js";

// ── Code chunker (T16 will extract) ─────────────────────────────────────────

export function smartChunk(
  content: string,
  filePath: string,
  config: Partial<ChunkerConfig> = {},
): Chunk[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ext = path.extname(filePath).toLowerCase();
  const relativePath = filePath;

  const fileImports = isCodeFile(ext) ? extractFileImports(content, ext) : undefined;

  let chunks: Chunk[];

  switch (ext) {
    case ".md":
    case ".mdx":
      chunks = chunkMarkdown(content, cfg);
      break;

    case ".json":
      chunks = chunkJSON(content, cfg);
      break;

    case ".yaml":
    case ".yml":
      chunks = chunkYAML(content, cfg);
      break;

    case ".py":
      chunks = chunkFixed(content, cfg);
      break;

    default:
      if (isCodeFile(ext)) {
        chunks = chunkCode(content, cfg);
      } else {
        chunks = chunkFixed(content, cfg);
      }
      break;
  }

  const HEADER_BUDGET = 250;
  const postCfg = cfg.maxChunkChars > HEADER_BUDGET
    ? { ...cfg, maxChunkChars: cfg.maxChunkChars - HEADER_BUDGET }
    : cfg;
  chunks = postProcess(chunks, postCfg);

  const REPEAT_MIN_LINES = 5;
  if (cfg.addFileContext) {
    chunks = chunks.map((chunk) => {
      const lineCount = chunk.content.split("\n").length;
      const repeat = chunk.label && lineCount >= REPEAT_MIN_LINES;
      const labelHeader = chunk.label
        ? repeat
          ? `// Section: ${chunk.label}\n// ${chunk.label}\n// ${chunk.label}\n`
          : `// Section: ${chunk.label}\n`
        : "";
      return {
        ...chunk,
        content: `// File: ${relativePath}\n${labelHeader}${chunk.content}`,
      };
    });
  }

  if (fileImports) {
    chunks = chunks.map((c) => ({
      ...c,
      fileImports,
      parentSymbol: c.label ?? undefined,
    }));
  }

  return chunks.filter((c) => c.content.trim().length > 0);
}

function chunkCode(content: string, cfg: ChunkerConfig): Chunk[] {
  const lines = content.split("\n");
  const boundaries = findCodeBoundaries(lines);

  if (boundaries.length === 0) return chunkFixed(content, cfg);

  const realStarts: number[] = [];
  for (let b = 0; b < boundaries.length; b++) {
    const limit = b > 0 ? boundaries[b - 1].line + 1 : 0;
    let s = boundaries[b].line;
    while (s > limit) {
      const prev = lines[s - 1].trimStart();
      const isDoc =
        prev.startsWith("//") ||
        prev.startsWith("/*") ||
        prev.startsWith("*") ||
        prev.startsWith("///") ||
        prev.startsWith("@") ||
        prev.startsWith('"""');
      if (isDoc) s--;
      else break;
    }
    realStarts.push(s);
  }

  const chunks: Chunk[] = [];

  if (realStarts[0] > 0) {
    const preamble = lines.slice(0, realStarts[0]);
    if (preamble.some((l) => l.trim())) {
      chunks.push({
        content: preamble.join("\n"),
        lineStart: 1,
        lineEnd: realStarts[0],
        type: "code_block",
        label: "imports",
      });
    }
  }

  for (let b = 0; b < boundaries.length; b++) {
    const start = realStarts[b];
    let end: number;
    if (b + 1 < realStarts.length) {
      const nextBoundaryLine = boundaries[b + 1].line;
      const overlapCeiling = Math.min(nextBoundaryLine, lines.length);
      end = Math.min(realStarts[b + 1] + cfg.chunkOverlapLines, overlapCeiling, lines.length);
    } else {
      end = lines.length;
    }
    const slice = lines.slice(start, end);
    if (!slice.some((l) => l.trim())) continue;
    const label = boundaries[b].container
      ? `${boundaries[b].container}.${boundaries[b].label}`
      : boundaries[b].label;
    chunks.push({
      content: slice.join("\n"),
      lineStart: start + 1,
      lineEnd: end,
      type: "code_block",
      label,
    });
  }

  return chunks;
}

interface CodeBoundary {
  line: number;
  label: string;
  container?: string;
}

const RESERVED_KEYWORDS = new Set([
  "if", "for", "while", "switch", "return", "throw", "catch",
  "do", "try", "else", "case", "with", "yield", "await",
]);

const CONTAINER_RE =
  /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?(?:class|interface|enum|namespace|trait|impl)\s+(\w+)/;

const TOP_LEVEL_RE =
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|const|let|var|type|struct|fn|def|func)\s+(\w+)/;

const METHOD_RE =
  /^(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|override\s+|async\s+|abstract\s+|get\s+|set\s+)*(\w+)\s*[(<]/;

function findCodeBoundaries(lines: string[]): CodeBoundary[] {
  const boundaries: CodeBoundary[] = [];
  const containerStack: { name: string; openDepth: number }[] = [];
  let depth = 0;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*") && !trimmed.includes("*/")) {
      inBlockComment = true;
      continue;
    }
    if (
      !trimmed ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("///") ||
      trimmed.startsWith("*")
    ) {
      continue;
    }

    if (depth === 0) {
      const c = CONTAINER_RE.exec(trimmed);
      if (c) {
        boundaries.push({ line: i, label: c[1] });
        containerStack.push({ name: c[1], openDepth: 0 });
      } else {
        const t = TOP_LEVEL_RE.exec(trimmed);
        if (t) boundaries.push({ line: i, label: t[1] });
      }
    } else if (
      containerStack.length > 0 &&
      depth === containerStack[containerStack.length - 1].openDepth + 1
    ) {
      const m = METHOD_RE.exec(trimmed);
      if (m && !RESERVED_KEYWORDS.has(m[1])) {
        boundaries.push({
          line: i,
          label: m[1],
          container: containerStack[containerStack.length - 1].name,
        });
      }
    }

    depth += netBraceDelta(line);

    while (
      containerStack.length > 0 &&
      depth <= containerStack[containerStack.length - 1].openDepth
    ) {
      containerStack.pop();
    }
  }

  return boundaries;
}

function netBraceDelta(line: string): number {
  const stripped = line
    .replace(/\/\*.*?\*\//g, "")
    .replace(/\/\/.*$/, "")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/\/(?:\\.|[^/\\\n])+\/[gimsuy]*/g, "//");
  return (stripped.match(/\{/g) || []).length - (stripped.match(/\}/g) || []).length;
}

function postProcess(chunks: Chunk[], cfg: ChunkerConfig): Chunk[] {
  if (chunks.length === 0) return chunks;

  const result: Chunk[] = [];

  for (const chunk of chunks) {
    const lineCount = chunk.content.split("\n").length;
    const charCount = chunk.content.length;

    const lineLimit =
      chunk.type === "code_block" ? cfg.codeChunkTarget : cfg.maxChunkLines;

    if (lineCount > lineLimit || charCount > cfg.maxChunkChars) {
      const subChunks = splitOversizedChunk(
        chunk,
        chunk.type === "code_block"
          ? { ...cfg, maxChunkLines: cfg.codeChunkTarget }
          : cfg,
      );
      result.push(...subChunks);
      continue;
    }

    if (chunk.label && chunk.type === "code_block") {
      result.push(chunk);
      continue;
    }
    if (
      lineCount < cfg.minChunkLines &&
      result.length > 0
    ) {
      const prev = result[result.length - 1];
      const prevLineCount = prev.content.split("\n").length;
      const prevCharCount = prev.content.length;
      if (
        prevLineCount + lineCount <= cfg.maxChunkLines &&
        prevCharCount + charCount + 1 <= cfg.maxChunkChars
      ) {
        prev.content += "\n" + chunk.content;
        prev.lineEnd = chunk.lineEnd;
        continue;
      }
    }

    result.push(chunk);
  }

  return result;
}

function splitOversizedChunk(chunk: Chunk, cfg: ChunkerConfig): Chunk[] {
  const lines = chunk.content.split("\n");
  const targetLines = cfg.maxChunkLines;
  const maxChars = cfg.maxChunkChars;
  const subChunks: Chunk[] = [];

  const pushSub = (subLines: string[], startIdx: number, endIdx: number) => {
    if (!subLines.some((l) => l.trim())) return;
    subChunks.push({
      content: subLines.join("\n"),
      lineStart: chunk.lineStart + startIdx,
      lineEnd: chunk.lineStart + endIdx - 1,
      type: chunk.type,
      label: chunk.label
        ? `${chunk.label} (part ${subChunks.length + 1})`
        : undefined,
    });
  };

  let start = 0;
  while (start < lines.length) {
    if (lines[start].length > maxChars) {
      const parts = splitLineByChars(lines[start], maxChars);
      for (const part of parts) {
        subChunks.push({
          content: part,
          lineStart: chunk.lineStart + start,
          lineEnd: chunk.lineStart + start,
          type: chunk.type,
          label: chunk.label
            ? `${chunk.label} (part ${subChunks.length + 1})`
            : undefined,
        });
      }
      start += 1;
      continue;
    }

    let end = Math.min(start + targetLines, lines.length);

    while (end > start + 1) {
      const sliceLen = lines.slice(start, end).reduce((s, l) => s + l.length + 1, -1);
      if (sliceLen <= maxChars) break;
      end--;
    }

    if (end < lines.length) {
      const minBreak = start + Math.max(1, Math.floor((end - start) * 0.5));
      for (let i = end; i > minBreak; i--) {
        if (lines[i]?.trim() === "") {
          end = i;
          break;
        }
      }
    }

    pushSub(lines.slice(start, end), start, end);

    start = end === start ? start + 1 : end;
  }

  return subChunks;
}

function splitLineByChars(line: string, maxChars: number): string[] {
  const parts: string[] = [];
  let remaining = line;
  while (remaining.length > maxChars) {
    const windowStart = Math.floor(maxChars * 0.8);
    const window = remaining.substring(windowStart, maxChars);
    let breakAt = -1;
    for (const sep of [";", ",", "}", " "]) {
      const idx = window.lastIndexOf(sep);
      if (idx >= 0) {
        breakAt = windowStart + idx + 1;
        break;
      }
    }
    if (breakAt < 0) breakAt = maxChars;
    parts.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function extractFileImports(content: string, ext: string): string | undefined {
  const lines = content.split("\n");
  const importLines: string[] = [];

  if (ext === ".py") {
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("import ") || t.startsWith("from ")) {
        importLines.push(t);
      }
    }
  } else {
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("import ") || t.startsWith("const {") || t.startsWith("require(")) {
        importLines.push(t);
      } else if (importLines.length > 0 && t === "") {
        break;
      }
    }
  }

  if (importLines.length === 0) return undefined;
  return importLines.join("\n");
}

const CODE_EXTENSIONS = new Set([
  ".ts",".js",".tsx",".jsx",".vue",".dart",".py",".php",".java",".go",
  ".rs",".cpp",".c",".h",".md",".json",".yaml",".yml",".hpp",".cs",".rb",
  ".swift",".kt",".kts",".scala",".lua",".zig",".ex",".exs",".erl",".clj",
  ".ml",".hs",
]);

function isCodeFile(ext: string): boolean {
  return CODE_EXTENSIONS.has(ext);
}