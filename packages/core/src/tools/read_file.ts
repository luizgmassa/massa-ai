/**
 * @massa-ai/core - Read File Tool
 * 
 * Optimized file reading with:
 * - Automatic compression for large files
 * - Intelligent caching
 * - Symbol metadata integration
 * - Multi-range support
 * - Language detection
 */

import { IToolHandler, ToolResponse, estimateTokens } from "@massa-ai/shared";
import { logger } from "@massa-ai/shared";
import { CodeCompressor } from "../services/compression/code-compressor.js";
import { serializeToolResponse } from "./serialize.js";
import { FileContentCache } from "../services/file-read/file-content-cache.js";
import { FileMetadataExtractor } from "../services/file-read/file-metadata.js";
import { PathContainment } from "../services/file-read/path-containment.js";
import { ProjectRootCache } from "../services/file-read/project-root-cache.js";
import { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";

/**
 * N9: per-read line ceiling on user-facing read_file output. Default 500;
 * override via `MASSA_AI_READ_FILE_MAX_LINES`. Invalid/negative/zero
 * values fall back to 500 (treat invalid as unset). When the requested
 * range exceeds the cap, `selectedContent` is sliced and `source_clipped:
 * true` is emitted in the same response. The true total line count is
 * always surfaced as `lineRange.actual.total` so `omitted = total - shown`
 * is derivable. Internal enrichment paths (SymbolGraphService.readSnippet
 * /readContext used by go_to_definition) are NOT capped — see
 * symbol-graph.service.ts for the exclusion comment.
 */
const MASSA_AI_READ_FILE_MAX_LINES = (() => {
  const v = Number(process.env.MASSA_AI_READ_FILE_MAX_LINES);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 500;
})();

interface ReadFileParams {
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

interface ReadRange {
  start: number;
  end: number;
}

export class ReadFileTool implements IToolHandler {
  name = "read_file";
  description = 
    "Read file with automatic compression, caching, and symbol metadata. " +
    "Use with search results for 60% token savings.";

  inputSchema = {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "File path (absolute or relative to project root)",
      },
      projectId: {
        type: "string",
        description: "Project ID for symbol metadata (optional)",
      },
      offset: {
        type: "number",
        description: "Start line number (1-indexed)",
      },
      limit: {
        type: "number",
        description: "Number of lines to read",
      },
      lineStart: {
        type: "number",
        description: "Start line (alternative to offset)",
      },
      lineEnd: {
        type: "number",
        description: "End line (alternative to limit)",
      },
      compress: {
        type: "boolean",
        description: "Auto-compress content > 100 lines (default: true)",
        default: true,
      },
      targetRatio: {
        type: "number",
        description: "Compression target ratio (0.3 = 70% reduction)",
        default: 0.3,
      },
      format: {
        type: "string",
        enum: ["json", "toon"],
        description: "Output format",
        default: "json",
      },
      fields: {
        type: "array",
        items: { type: "string" },
        description:
          "Projection — keep only these keys (dotted paths supported, e.g. ['nodes.symbol']). Absent/empty → full data.",
      },
      includeSymbols: {
        type: "boolean",
        description: "Include symbol metadata from graph (default: true)",
        default: true,
      },
      includeImports: {
        type: "boolean",
        description: "Extract and show import statements (default: true)",
        default: true,
      },
    },
    required: ["filePath"],
  };

  private compressor: CodeCompressor;
  private symbolGraph?: SymbolGraphService;
  private projectRoots: ProjectRootCache;
  private pathContainment: PathContainment;
  private fileMetadata: FileMetadataExtractor;
  private fileContent: FileContentCache;

  constructor(symbolGraph?: SymbolGraphService) {
    this.compressor = new CodeCompressor();
    this.symbolGraph = symbolGraph;

    // One ProjectRootCache PER TOOL, constructed here rather than shared at
    // module scope: every instance owned its own root Map before the extraction,
    // and its constructor is what subscribes to `indexing:started`, so the
    // subscription count and lifetime are unchanged by the move.
    this.projectRoots = new ProjectRootCache();
    this.pathContainment = new PathContainment(this.projectRoots);

    // Same per-tool rule for the file CONTENT cache and its metadata extractor.
    // The 4 -> 5 edge is a CALLBACK (services/file-read/file-content-cache.ts
    // never names SymbolGraphService), and it is an arrow rather than a
    // `.bind(...)`: `this.fileMetadata.extractMetadata` is re-resolved on every
    // call, exactly as `this.extractMetadata` was before the move, so replacing
    // the method on the instance is still observable from the cache's two call
    // sites. A bound reference captured here would freeze the pre-replacement
    // function and silently make that seam untestable.
    //
    // MEASURED COST, RECORDED RATHER THAN GLOSSED: this arrow is a function body
    // inside the constructor, and the constructor is exempt from check-tools-thin
    // clause 1 BY KIND — so the arrow is counted MAXIMAL rather than nested (the
    // C39 asymmetry the gate's own suite pins synthetically). It is the only body
    // this task ADDS to the file the gate measures, taking read_file.ts to
    // maximal 5 where removing four methods alone would have left 4. It is
    // transient: T12 moves this whole composition into module 7, where it is
    // outside the gate's `tools/` population. RFS-01 AC-1 cannot read 0 of 30
    // until it does.
    this.fileMetadata = new FileMetadataExtractor(symbolGraph);
    this.fileContent = new FileContentCache((content, filePath, options) =>
      this.fileMetadata.extractMetadata(content, filePath, options),
    );
  }

  async handle(params: unknown): Promise<ToolResponse> {
    const p = params as ReadFileParams;
    const shouldCompress = p.compress !== false;
    const targetRatio = p.targetRatio || 0.3;
    const format = p.format || "json";
    const { fields } = p;
    const includeSymbols = p.includeSymbols !== false;
    const includeImports = p.includeImports !== false;

    try {
      // Resolve file path (async — looks up project root when projectId provided).
      // Returns null when the path is ambiguous (relative + no projectId) — we must
      // NOT guess against process.cwd(), so surface a distinct error here rather
      // than letting the generic "Failed to read file" catch swallow it.
      const resolved = await this.pathContainment.resolveFilePath(p.filePath, p.projectId);
      if (resolved === null) {
        return {
          success: false,
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
          success: false,
          error: containment.error,
        };
      }

      // Keep original relative path for symbol DB queries (DB stores relative paths)
      const relativePath = p.filePath;

      // Calculate line range
      const range = this.calculateRange(p);

      // Read file with cache
      const { content, metadata } = await this.fileContent.readFileWithCache(filePath, {
        includeSymbols,
        includeImports,
        projectId: p.projectId,
        relativePath,
      });

      // Extract requested lines
      const lines = content.split("\n");
      const totalLines = lines.length;
      const adjustedRange = this.adjustRange(range, totalLines);
      let selectedContent = this.extractLines(lines, adjustedRange);
      let selectedLineCount = selectedContent.split("\n").length;

      // N9: cap user-facing read_file output at MASSA_AI_READ_FILE_MAX_LINES
      // (default 500). When the adjusted range exceeds the cap, slice the
      // content and emit `source_clipped: true` in the same response so the
      // caller knows lines were omitted. `lineRange.actual.total` keeps the
      // true total line count so `omitted = total - shown` is derivable.
      let source_clipped = false;
      if (selectedLineCount > MASSA_AI_READ_FILE_MAX_LINES) {
        const cappedLines = lines.slice(
          adjustedRange.start - 1,
          adjustedRange.start - 1 + MASSA_AI_READ_FILE_MAX_LINES,
        );
        selectedContent = cappedLines.join("\n");
        selectedLineCount = selectedContent.split("\n").length;
        source_clipped = true;
      }

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

      return serializeToolResponse(result, { format, fields });
    } catch (error) {
      logger.error("Failed to read file", error as Error, {
        filePath: p.filePath,
      });
      return {
        success: false,
        error: `Failed to read file: ${(error as Error).message}`,
      };
    }
  }

  private calculateRange(params: ReadFileParams): ReadRange {
    // Priority: lineStart/lineEnd > offset/limit > entire file
    if (params.lineStart !== undefined && params.lineEnd !== undefined) {
      return {
        start: Math.max(1, params.lineStart),
        end: params.lineEnd,
      };
    }

    if (params.offset !== undefined) {
      const offset = Math.max(1, params.offset);
      const limit = params.limit || 1000;
      return {
        start: offset,
        end: offset + limit - 1,
      };
    }

    return {
      start: 1,
      end: Infinity,
    };
  }

  private adjustRange(range: ReadRange, totalLines: number): ReadRange {
    const start = Math.max(1, Math.min(range.start, totalLines));
    const end = range.end === Infinity 
      ? totalLines 
      : Math.min(range.end, totalLines);
    
    return { start, end };
  }

  private extractLines(lines: string[], range: ReadRange): string {
    const start = range.start - 1; // Convert to 0-indexed
    const end = range.end;
    
    const selectedLines = lines.slice(start, end);
    
    // Add line numbers for context
    return selectedLines
      .map((line, index) => {
        const lineNum = start + index + 1;
        return `${lineNum.toString().padStart(6, " ")}: ${line}`;
      })
      .join("\n");
  }
}
