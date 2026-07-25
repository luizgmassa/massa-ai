/**
 * M62 — GLR stack-merge depth verification probe.
 *
 * Read-only probe of the Node tree-sitter binding's GLR stack-merge depth cap.
 * Runs ambiguous grammar input and observes whether the parser caps stack
 * depth, and at what value.
 *
 * This is a READ-ONLY probe — it does NOT modify any code or configuration.
 * Findings are documented in docs/glr-verification.md.
 *
 * If the tree-sitter binding is not available (non-native runtime, missing
 * grammar), the probe reports the absence and exits cleanly.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface ProbeResult {
  bindingAvailable: boolean;
  grammarLoaded: boolean;
  ambiguousInputParsed: boolean;
  stackMergeDepthCap: number | null | string;
  errorCount: number;
  notes: string[];
}

/**
 * Minimal structural view of a tree-sitter Parser instance sufficient for the
 * probe. Defined as an interface so tests can inject a fake without the native
 * binding (which is build-gated and absent from many checkouts).
 */
export interface ParserLike {
  setLanguage(language: unknown): void;
  parse(input: string): { rootNode: { hasError?: boolean } | null } | unknown;
}

// ── Extracted, dependency-injected helpers (unit-testable) ───────────────────

/**
 * Try to load the native tree-sitter Parser constructor via a resolver.
 * Returns the constructor or null when the binding is unavailable. The default
 * resolver reads the real installed package; tests inject a fake resolver.
 */
export function loadBinding(
  resolve: () => unknown = () => {
    try {
      return require("tree-sitter");
    } catch {
      return null;
    }
  },
): { new (): ParserLike } | null {
  const resolved = resolve();
  if (typeof resolved === "function") {
    return resolved as { new (): ParserLike };
  }
  return null;
}

/**
 * Try to load a grammar with known ambiguity. Prefers tree-sitter-javascript,
 * falls back to tree-sitter-typescript. Returns the language or null.
 */
export function loadGrammar(
  resolve: (name: string) => unknown = (name) => {
    try {
      return require(name);
    } catch {
      return null;
    }
  },
): unknown {
  const js = resolve("tree-sitter-javascript");
  if (js) return js;
  const ts = resolve("tree-sitter-typescript");
  if (ts && typeof ts === "object") {
    const maybe = ts as Record<string, unknown>;
    if (maybe.typescript) return maybe.typescript;
  }
  return null;
}

/** Inspect a Parser instance's prototype for GLR/stack/depth-related accessors. */
export function inspectParserPrototype(parserInstance: {
  [key: string]: unknown;
} & ParserLike): {
  parserKeys: string[];
  parserProtoKeys: string[];
  glrRelated: string[];
  stackMergeDepthCap: number | null | string;
  notes: string[];
} {
  const notes: string[] = [];
  const parserKeys = Object.keys(parserInstance);
  const proto = Object.getPrototypeOf(parserInstance) as Record<string, unknown> | null;
  const parserProtoKeys = proto ? Object.getOwnPropertyNames(proto) : [];

  notes.push(`Parser instance keys: ${parserKeys.join(", ") || "(none)"}`);
  notes.push(`Parser prototype keys: ${parserProtoKeys.join(", ") || "(none)"}`);

  const glrRelated = parserProtoKeys.filter((k) =>
    /glr|stack|merge|depth|limit|max/i.test(k),
  );
  let stackMergeDepthCap: number | null | string = "not exposed";
  if (glrRelated.length > 0) {
    notes.push(`GLR-related keys found: ${glrRelated.join(", ")}`);
    stackMergeDepthCap = "not exposed (keys found but no direct cap accessor)";
  } else {
    notes.push("No GLR/stack/merge/depth/limit/max keys found on Parser prototype");
  }
  return { parserKeys, parserProtoKeys, glrRelated, stackMergeDepthCap, notes };
}

/** Build deeply-nested ternary input that stresses a GLR parser. Pure. */
export function buildAmbiguousNestedTernary(depth: number): string {
  let ambiguous = "let x = ";
  for (let i = 0; i < depth; i++) {
    ambiguous += "a ? b : ";
  }
  return ambiguous + "c;";
}

/**
 * Parse ambiguous input against an injected parser+language and report whether
 * it parsed cleanly, whether the error flag was set, or whether parsing threw.
 */
export function parseAmbiguousInput(
  parserInstance: ParserLike,
  language: unknown,
  depth = 100,
): { ambiguousInputParsed: boolean; errorCount: number; notes: string[] } {
  const notes: string[] = [];
  const ambiguous = buildAmbiguousNestedTernary(depth);
  try {
    parserInstance.setLanguage(language);
    const tree = parserInstance.parse(ambiguous) as {
      rootNode: { hasError?: boolean } | null;
    };
    notes.push(`Ambiguous input (depth=${depth}): parsed without crash`);

    const root = tree?.rootNode;
    if (root && root.hasError) {
      notes.push("Parse tree has error flag set (ambiguous input produced errors)");
      return { ambiguousInputParsed: true, errorCount: -1, notes };
    }
    notes.push("Parse tree: no error flag (ambiguous input resolved)");
    return { ambiguousInputParsed: true, errorCount: 0, notes };
  } catch (e) {
    notes.push(`Ambiguous input parse failed: ${(e as Error).message}`);
    return { ambiguousInputParsed: false, errorCount: 1, notes };
  }
}

// ── Top-level probe (orchestrates the helpers with the real resolver) ────────

export interface ProbeOptions {
  /** Override the native binding resolver (tests inject a fake). */
  bindingResolver?: () => unknown;
  /** Override the grammar resolver (tests inject a fake). */
  grammarResolver?: (name: string) => unknown;
}

async function probeGlrStackDepth(opts: ProbeOptions = {}): Promise<ProbeResult> {
  const notes: string[] = [];
  let bindingAvailable = false;
  let grammarLoaded = false;
  let ambiguousInputParsed = false;
  let stackMergeDepthCap: number | null | string = "not exposed";
  let errorCount = 0;

  // Step 1: Check if the tree-sitter binding is available
  const Parser = loadBinding(opts.bindingResolver);
  if (!Parser) {
    notes.push("tree-sitter binding: NOT available (non-native runtime or missing package)");
    return {
      bindingAvailable,
      grammarLoaded,
      ambiguousInputParsed,
      stackMergeDepthCap,
      errorCount,
      notes,
    };
  }
  bindingAvailable = true;
  notes.push("tree-sitter binding: available");

  // Step 2: Check if the Parser exposes any GLR-related config
  const parserInstance = new Parser();
  const inspection = inspectParserPrototype(parserInstance as unknown as {
    [key: string]: unknown;
  } & ParserLike);
  notes.push(...inspection.notes);
  stackMergeDepthCap = inspection.stackMergeDepthCap;

  // Step 3: Try to load a grammar with known ambiguity (JavaScript)
  const language = loadGrammar(opts.grammarResolver);
  if (!language) {
    notes.push("No grammar available — cannot probe ambiguous input");
    return {
      bindingAvailable,
      grammarLoaded,
      ambiguousInputParsed,
      stackMergeDepthCap,
      errorCount,
      notes,
    };
  }
  grammarLoaded = true;
  notes.push("tree-sitter-javascript grammar: loaded");

  // Step 4: Parse ambiguous input (deeply nested expressions that stress GLR)
  const parsed = parseAmbiguousInput(parserInstance, language);
  ambiguousInputParsed = parsed.ambiguousInputParsed;
  errorCount = parsed.errorCount;
  notes.push(...parsed.notes);

  // Step 5: Try to find a stack depth cap by checking if the binding documents one
  // The Node tree-sitter binding does not expose GLR internals via the JS API.
  // The cap is in the C runtime (tree-sitter/lib/src/parser.c) and is not
  // surfaced through the Node binding.
  notes.push("GLR stack-merge depth cap is internal to the C runtime (parser.c)");
  notes.push("The Node binding does not expose a JS-level accessor for stack depth cap");
  stackMergeDepthCap = "not exposed by binding API";

  return {
    bindingAvailable,
    grammarLoaded,
    ambiguousInputParsed,
    stackMergeDepthCap,
    errorCount,
    notes,
  };
}

// ── Run probe ───────────────────────────────────────────────────────────────

export function printReport(result: ProbeResult): void {
  console.log("═".repeat(70));
  console.log("M62 — GLR Stack-Merge Depth Verification Probe");
  console.log("═".repeat(70));
  console.log();
  console.log(`Binding available:     ${result.bindingAvailable}`);
  console.log(`Grammar loaded:        ${result.grammarLoaded}`);
  console.log(`Ambiguous input parsed: ${result.ambiguousInputParsed}`);
  console.log(`Stack-merge depth cap: ${result.stackMergeDepthCap}`);
  console.log(`Error count:           ${result.errorCount}`);
  console.log();
  console.log("Notes:");
  for (const note of result.notes) {
    console.log(`  • ${note}`);
  }
  console.log();
  console.log("═".repeat(70));
  console.log("Findings documented in docs/glr-verification.md");
  console.log("═".repeat(70));
}

if (import.meta.main) {
  const result = await probeGlrStackDepth();
  printReport(result);
}

export { probeGlrStackDepth };
