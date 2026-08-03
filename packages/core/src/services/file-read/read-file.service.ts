/**
 * @massa-ai/core - Read-file orchestration
 *
 * Module 7 of the `tools/read_file.ts` extraction (PR-D, T12), and the last of
 * them. It COMPOSES modules 2-6 and owns everything `ReadFileTool.handle()` used
 * to do between parsing its parameters and handing a result to
 * `serializeToolResponse`: containment, the range, the cached read, the
 * compression decision, result assembly, the token math and the usage tips.
 *
 * WHY THE WHOLE PIPELINE MOVED AND NOT ONLY THE FOUR SPANS THE PLAN NAMED.
 * `tasks.md` §5's T12 row lists four statement runs — the compression decision,
 * result assembly, token math and usage tips. Measured at execute time those are
 * 97 of `handle()`'s 165 comment-inclusive lines, so taking only them leaves the
 * handler at ~70 against a target of ~15 and leaves modules 2-6 composed from
 * `tools/`, which is what "module 7 composes 2-6" forbids. The row's spans were
 * written pre-T7/T9/T10/T11 and every one of them was stale; the obligation the
 * row states in prose is the binding one.
 *
 * IT NEVER IMPORTS ANYTHING UNDER `tools/` (RFS-03 AC-2), which is why `read()`
 * returns a DISCRIMINATED RESULT rather than a `ToolResponse`. Response shaping
 * — `serializeToolResponse`, the two error bodies and the catch — stays in the
 * handler, on T14b's stated shape. The `try` also stays there: after this task
 * the compressor `await` in `read()` is the only throwing call in the moved
 * span, and `__tests__/read-file-presentation-characterization.test.ts` pins
 * that boundary from a test written before the move, deliberately (T3's Plan
 * Challenge gate, finding 5).
 *
 * `readFileOptions` IS A SEPARATE EXPORT AND THE HANDLER CALLS IT OUTSIDE ITS
 * `try`. That is behaviour preservation, not style. Before this task the six
 * option reads sat in `handle()`'s prelude ABOVE the `try`, so `handle(null)`
 * REJECTED rather than resolving to `{success:false}`. No test anywhere calls
 * `handle(null)` — measured over the whole repo — so folding those reads into
 * `read()` would have converted a rejection into an error response with nothing
 * to catch it: a behaviour change inside a behaviour-preserving PR, C67's class.
 * Keeping the reads in a function the handler calls at the same position keeps
 * the throw where it was and still leaves no option-derivation logic in `tools/`.
 *
 * ITS SIZE IS MEASURED BY NO GATE, AND THAT IS RECORDED RATHER THAN FIXED.
 * `check-tools-thin` is scoped to `tools/` by construction and `search-hub-metric`
 * runs on `packages/core/src/services/search` alone (`ci.yml:140`). This file is
 * the largest the extraction produces, so the property "the god module was split"
 * is enforced at the source and not at the destination. Found by the Plan
 * Challenge gate's red-team lens at T12; true of modules 2-6 since T9 and named
 * here because this is where it costs most. RFS-01 AC-6's practice of naming what
 * a gate does not certify is the precedent.
 */
import { estimateTokens } from "@massa-ai/shared";
import { CodeCompressor } from "../compression/code-compressor.js";
import { FileContentCache } from "./file-content-cache.js";
import { FileMetadataExtractor } from "./file-metadata.js";
import { adjustRange, calculateRange, selectLines } from "./line-range.js";
import { PathContainment } from "./path-containment.js";
import { ProjectRootCache } from "./project-root-cache.js";
import { SymbolGraphService } from "../symbol/symbol-graph.service.js";

/**
 * The `read_file` request. Moved verbatim from `tools/read_file.ts`, which
 * exported exactly one symbol (`ReadFileTool`), so this interface was
 * module-local before the move and `services/file-read/` is not re-exported from
 * `services/index.ts` — the move adds **0** names to `@massa-ai/core`'s published
 * surface.
 *
 * `line-range.ts` declares its own four-field `LineRangeRequest` rather than
 * importing this, and the two MUST NOT be unified (C66): module 6 is composed by
 * module 7, so importing this there is a 6 -> 7 edge against the composition
 * direction. `ReadFileParams` satisfies `LineRangeRequest` structurally, so
 * `calculateRange(p)` below needs no adapter and no call-site change.
 */
export interface ReadFileParams {
  filePath: string;
  projectId?: string;
  offset?: number;
  limit?: number;
  lineStart?: number;
  lineEnd?: number;
  compress?: boolean;
  targetRatio?: number;
  format?: "json" | "toon";
  includeSymbols?: boolean;
  includeImports?: boolean;
  fields?: string[];
}

/** The six values `handle()`'s prelude used to derive above its own `try`. */
export interface ReadFileOptions {
  shouldCompress: boolean;
  targetRatio: number;
  format: "json" | "toon";
  fields?: string[];
  includeSymbols: boolean;
  includeImports: boolean;
}

/**
 * A denial carries the exact error string the handler used to return inline; a
 * success carries the assembled result the handler used to pass straight to
 * `serializeToolResponse`. `data` is `unknown` because that value is built with
 * `any` below — see `read()`.
 */
export type ReadFileOutcome =
  | { ok: false; error: string }
  | { ok: true; data: unknown };

/**
 * Read the six option fields, in the order and at the call position `handle()`
 * used. Order is load-bearing only for a `params` whose property getters throw
 * selectively; position is load-bearing for `null`/`undefined`, which must keep
 * throwing out of `handle()` rather than being caught. See this file's header.
 */
export function readFileOptions(p: ReadFileParams): ReadFileOptions {
  const shouldCompress = p.compress !== false;
  const targetRatio = p.targetRatio || 0.3;
  const format = p.format || "json";
  const { fields } = p;
  const includeSymbols = p.includeSymbols !== false;
  const includeImports = p.includeImports !== false;
  return { shouldCompress, targetRatio, format, fields, includeSymbols, includeImports };
}

export class ReadFileService {
  private compressor: CodeCompressor;
  private symbolGraph?: SymbolGraphService;
  private projectRoots: ProjectRootCache;
  private pathContainment: PathContainment;
  private fileMetadata: FileMetadataExtractor;
  private fileContent: FileContentCache;

  constructor(symbolGraph?: SymbolGraphService) {
    this.compressor = new CodeCompressor();
    this.symbolGraph = symbolGraph;

    // One ProjectRootCache PER SERVICE, and one service per ReadFileTool: every
    // instance owned its own root Map before the extraction, and this
    // constructor is what subscribes to `indexing:started`, so the subscription
    // count and lifetime are unchanged by either move.
    this.projectRoots = new ProjectRootCache();
    this.pathContainment = new PathContainment(this.projectRoots);

    // Same per-instance rule for the file CONTENT cache and its metadata
    // extractor. The 4 -> 5 edge is a CALLBACK (`file-content-cache.ts` never
    // names SymbolGraphService), and it is an ARROW rather than a `.bind(...)`:
    // `this.fileMetadata.extractMetadata` is re-resolved on every call, so
    // replacing the method on the instance stays observable from the cache's two
    // call sites. `__tests__/read-file.test.ts` does exactly that. A bound
    // reference captured here would freeze the pre-replacement function and
    // silently make that seam untestable.
    //
    // THIS ARROW IS WHY T12 EXISTS AS A SEPARATE TASK (C64). A body declared
    // inside a constructor is counted MAXIMAL by `check-tools-thin`, because the
    // constructor is exempt by kind and so is never itself flagged. While this
    // composition lived in `ReadFileTool` it was the file's last remaining body
    // and `read_file.ts` could not reach `0 of 30`. Here it is outside the
    // gate's `tools/` population.
    this.fileMetadata = new FileMetadataExtractor(symbolGraph);
    this.fileContent = new FileContentCache((content, filePath, options) =>
      this.fileMetadata.extractMetadata(content, filePath, options),
    );
  }

  async read(p: ReadFileParams, options: ReadFileOptions): Promise<ReadFileOutcome> {
    const { shouldCompress, targetRatio, includeSymbols, includeImports } = options;

    // Resolve file path (async — looks up project root when projectId provided).
    // Returns null when the path is ambiguous (relative + no projectId) — we must
    // NOT guess against process.cwd(), so surface a distinct error here rather
    // than letting the generic "Failed to read file" catch swallow it.
    const resolved = await this.pathContainment.resolveFilePath(p.filePath, p.projectId);
    if (resolved === null) {
      return {
        ok: false,
        error:
          "Relative filePath requires a projectId (to resolve against the workspace) or an absolute path.",
      };
    }
    const filePath = resolved;

    // ── Wave 5 FR-12 / AD-W5-006: filesystem-side path containment. Absolute
    // paths must resolve under one of: the project root (projectPath arg /
    // workspace lookup), cwd, or an explicit allowlist env
    // MASSA_AI_READ_FILE_ROOTS (colon-separated). Outside → teaching
    // error listing valid roots only (no host path enumeration). Project
    // root + cwd are ALWAYS allowed. sanitizeFilePath strips ../ traversal
    // tokens before the containment check so a crafted relative path can't
    // escape. Does not regress the 500-line cap (N9) — applied later.
    const containment = await this.pathContainment.checkPathContainment(filePath, p.projectId);
    if (!containment.allowed) {
      return {
        ok: false,
        error: containment.error,
      };
    }

    // Keep original relative path for symbol DB queries (DB stores relative paths)
    const relativePath = p.filePath;

    // Calculate line range
    const range = calculateRange(p);

    // Read file with cache
    const { content, metadata } = await this.fileContent.readFileWithCache(filePath, {
      includeSymbols,
      includeImports,
      projectId: p.projectId,
      relativePath,
    });

    // Extract requested lines, then apply the N9 output cap. Both live in
    // services/file-read/line-range.ts: `selectLines` returns the clipped flag
    // rather than reassigning locals, and `lineRange.actual.total` below still
    // carries the true total so `omitted = total - shown` stays derivable.
    const lines = content.split("\n");
    const totalLines = lines.length;
    const adjustedRange = adjustRange(range, totalLines);
    const {
      content: selectedContent,
      lineCount: selectedLineCount,
      clipped: source_clipped,
    } = selectLines(lines, adjustedRange);

    // Determine if compression is needed
    const shouldAutoCompress =
      shouldCompress &&
      selectedLineCount > 100 &&
      targetRatio < 1;

    const result: any = {
      filePath: p.filePath,
      absolutePath: filePath,
      lineRange: {
        requested: {
          start: range.start,
          end: range.end === Infinity ? null : range.end,
        },
        actual: {
          start: adjustedRange.start,
          end: source_clipped
            ? adjustedRange.start + selectedLineCount - 1
            : adjustedRange.end,
          total: totalLines,
        },
        selected: selectedLineCount,
      },
      source_clipped,
      metadata: {
        totalLines,
        language: metadata.language,
        ...(metadata.symbols && { symbols: metadata.symbols }),
        ...(metadata.imports && { imports: metadata.imports }),
      },
      compressed: shouldAutoCompress,
      recommendations: [],
    };

    if (shouldAutoCompress) {
      // Auto-compress
      const compressed = await this.compressor.compress(
        selectedContent,
        "code_structure" as any
      );

      const originalTokens = estimateTokens(selectedContent, "code");
      const compressedTokens = estimateTokens(compressed.compressed, "code");
      const actualRatio = compressedTokens / originalTokens;

      result.content = compressed.compressed;
      result.tokens = {
        original: originalTokens,
        compressed: compressedTokens,
        saved: originalTokens - compressedTokens,
        savingsPercent: Math.round((1 - actualRatio) * 100),
      };
      result.compressionRatio = actualRatio;
      result.recommendations.push(
        `✓ Auto-compressed ${selectedLineCount} lines (${result.tokens.savingsPercent}% reduction)`
      );
    } else {
      result.content = selectedContent;
      result.tokens = {
        original: estimateTokens(selectedContent, "code"),
        compressed: estimateTokens(selectedContent, "code"),
        saved: 0,
        savingsPercent: 0,
      };

      // Add recommendations for large files
      if (selectedLineCount > 100) {
        result.recommendations.push(
          "💡 Content > 100 lines. Consider compress=true for token savings"
        );
      }
    }

    // Add usage tips
    if (range.start === 1 && range.end === Infinity) {
      result.recommendations.push(
        "💡 Use lineStart/lineEnd or offset/limit to read specific sections (60% token savings)"
      );
    }

    // Add related files tip if symbols found
    if (metadata.symbols && metadata.symbols.definitions > 0) {
      result.recommendations.push(
        `💡 Use get_references() to find usages of ${metadata.symbols.definitions} symbols in this file`
      );
    }

    return { ok: true, data: result };
  }
}
