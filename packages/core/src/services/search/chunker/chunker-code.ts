/**
 * SmartChunker — code chunker (Wave 6 N31, T16)
 *
 * Extracted from smart-chunker.ts. chunkCode, findCodeBoundaries,
 * CodeBoundary, RESERVED_KEYWORDS, regex consts, netBraceDelta,
 * extractFileImports, CODE_EXTENSIONS, isCodeFile.
 */

import type { Chunk, ChunkerConfig } from "./chunker-types.js";
import { chunkFixed } from "./chunker-post.js";

export interface CodeBoundary {
  /** 0-indexed line where the declaration starts */
  line: number;
  /** Symbol name (e.g. "ParseStage", "extractJsSymbols") */
  label: string;
  /** Outer container name when this boundary is a method */
  container?: string;
}

export const RESERVED_KEYWORDS = new Set([
  "if", "for", "while", "switch", "return", "throw", "catch",
  "do", "try", "else", "case", "with", "yield", "await",
]);

/** Top-level container declarations (class/interface/enum/namespace/trait/impl) */
const CONTAINER_RE =
  /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?(?:class|interface|enum|namespace|trait|impl)\s+(\w+)/;

/** Top-level non-container declarations (function/const/let/var/type/struct/fn/def/func) */
const TOP_LEVEL_RE =
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|const|let|var|type|struct|fn|def|func)\s+(\w+)/;

/** Method-like declarations inside a class body: identifier followed by `(` or `<` */
const METHOD_RE =
  /^(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|override\s+|async\s+|abstract\s+|get\s+|set\s+)*(\w+)\s*[(<]/;

export function chunkCode(content: string, cfg: ChunkerConfig): Chunk[] {
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

export function findCodeBoundaries(lines: string[]): CodeBoundary[] {
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

/**
 * Count `{` minus `}` on one line, ignoring braces inside comments, string
 * literals, template literals, and regex literals.
 *
 * @param line - One source line (multi-line block state is tracked by callers).
 * @returns Net brace delta: openers positive, closers negative.
 */
// Why: the original strip-then-count chain ran five regexes over the line and
//      CodeQL flagged every one of them as polynomial (SEC-3 alert #27 plus
//      three PR-time alerts). Minified single-line files made that a real
//      indexing stall. This single left-to-right scan is O(n) on every input
//      shape and strictly more correct: the old chain mis-parsed lines whose
//      strings contained "//" or "/*". Regex-vs-division uses the standard
//      heuristic — a "/" opens a regex unless the previous significant token
//      is an identifier/number/closing bracket that is not a regex-prefix
//      keyword — which matches the old naive strip on well-formed code.
// Impacts: brace counting for every chunked code file.
// Test: bun test packages/core/src/__tests__/chunker-code-security.test.ts

/** Keywords after which a "/" opens a regex literal rather than division. */
const REGEX_PREFIX_KEYWORDS = new Set([
  "return", "typeof", "case", "do", "else", "in", "of", "new",
  "delete", "void", "throw", "yield", "await", "instanceof",
]);

export function netBraceDelta(line: string): number {
  let delta = 0;
  let i = 0;
  const n = line.length;
  let lastSig = -1; // char code of the previous significant (non-space) char
  let word = ""; // trailing identifier chars, for the keyword heuristic
  // A failed regex scan proves no unescaped "/" exists anywhere later in the
  // line, so every subsequent regex attempt would also fail — attempting one
  // per slash is the quadratic shape CodeQL flags. Scan at most once.
  let regexPossible = true;

  const opensRegex = (): boolean => {
    if (lastSig === -1) return true;
    const c = String.fromCharCode(lastSig);
    if (/[\w)\]}'"`]/.test(c)) return REGEX_PREFIX_KEYWORDS.has(word);
    return true;
  };

  while (i < n) {
    const code = line.charCodeAt(i);
    const next = line.charCodeAt(i + 1);
    // Line comment: nothing after it can hold a countable brace.
    if (code === 47 && next === 47) break;
    // Block comment closed on this line: skip the span. An unterminated
    // opener is treated as ordinary text, matching the old regex's behavior
    // of only stripping closed pairs.
    if (code === 47 && next === 42) {
      const end = line.indexOf("*/", i + 2);
      if (end === -1) {
        lastSig = code;
        word = "";
        i++;
        continue;
      }
      i = end + 2;
      continue;
    }
    // Regex literal: skip to the unescaped closing slash plus flag chars. An
    // unterminated slash is division/ordinary text — braces after it count,
    // exactly as the old unmatched-regex fallback behaved.
    if (code === 47 && regexPossible && opensRegex()) {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const inner = line.charCodeAt(j);
        if (inner === 92) {
          j += 2;
          continue;
        }
        if (inner === 47) {
          closed = true;
          break;
        }
        if (inner === 10) break;
        j++;
      }
      if (closed) {
        j++;
        while (j < n && /[a-z]/.test(line[j])) j++; // flags
        lastSig = 47;
        word = "";
        i = j;
        continue;
      }
      regexPossible = false;
      lastSig = code;
      word = "";
      i++;
      continue;
    }
    // String/template literal: skip to the matching quote, honoring escapes.
    if (code === 39 || code === 34 || code === 96) {
      const quote = code;
      i++;
      while (i < n) {
        const inner = line.charCodeAt(i);
        if (inner === 92) {
          i += 2;
          continue;
        }
        i++;
        if (inner === quote) break;
      }
      lastSig = quote;
      word = "";
      continue;
    }
    if (code === 123) delta++;
    else if (code === 125) delta--;
    if (code === 32 || code === 9) {
      i++;
      continue;
    }
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95 || code === 36) {
      word += line[i];
    } else {
      word = "";
    }
    lastSig = code;
    i++;
  }
  return delta;
}

export function extractFileImports(content: string, ext: string): string | undefined {
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

export const CODE_EXTENSIONS = new Set([
  ".ts",".js",".tsx",".jsx",".vue",".dart",".py",".php",".java",".go",
  ".rs",".cpp",".c",".h",".md",".json",".yaml",".yml",".hpp",".cs",".rb",
  ".swift",".kt",".kts",".scala",".lua",".zig",".ex",".exs",".erl",".clj",
  ".ml",".hs",
]);

export function isCodeFile(ext: string): boolean {
  return CODE_EXTENSIONS.has(ext);
}