/**
 * @massa-ai/core - Read File Tool
 *
 * Schema and delegation only. Everything this tool used to do lives in
 * `services/file-read/` — containment, both caches, metadata, the line range
 * and N9 cap, and `read-file.service.ts` (module 7), which composes them.
 * Deliberately terse: the split's decision record sits in those modules'
 * docblocks, and repeating it here costs this file its 125-line ceiling.
 */

import { IToolHandler, ToolResponse } from "@massa-ai/shared";
import { logger } from "@massa-ai/shared";
import { serializeToolResponse } from "./serialize.js";
import { ReadFileService, readFileOptions, type ReadFileParams } from "../services/file-read/read-file.service.js";
import { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";

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

  private service: ReadFileService;

  /**
   * The parameter's arity and type are public surface — 41 measured construction
   * sites, both transports among them (`design.md` §3.2 as corrected at T9) — so
   * it is forwarded unchanged rather than replaced by an injected service.
   */
  constructor(symbolGraph?: SymbolGraphService) {
    this.service = new ReadFileService(symbolGraph);
  }

  async handle(params: unknown): Promise<ToolResponse> {
    const p = params as ReadFileParams;
    // Read OUTSIDE the try, at the position the inline prelude occupied: these
    // are the first property accesses on `params`, so a null/undefined argument
    // must keep throwing out of handle() rather than being caught and turned
    // into `{success:false}`. See read-file.service.ts's header.
    const options = readFileOptions(p);

    try {
      const outcome = await this.service.read(p, options);
      if (!outcome.ok) {
        return { success: false, error: outcome.error };
      }
      return serializeToolResponse(outcome.data, {
        format: options.format,
        fields: options.fields,
      });
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
}
