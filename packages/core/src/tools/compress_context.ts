/**
 * Compress Context Tool
 *
 * Comprime contexto usando compressão semântica com LLM.
 * Mantém estrutura essencial, remove detalhes, economiza tokens.
 */

import { IToolHandler } from "@massa-ai/shared";
import { ToolResponse } from "@massa-ai/shared";
import { CodeCompressor } from "../services/compression/code-compressor.js";
import {
  compressWithMetrics,
  type CompressContextStrategy,
} from "../services/compression/compress-with-metrics.js";
import { logger } from "@massa-ai/shared";
import { validateEnum } from "../kernel/enum-validation.js";

interface CompressContextParams {
  content: string;
  strategy?: CompressContextStrategy;
  language?: string;
  targetRatio?: number;
}

export class CompressContextTool implements IToolHandler {
  name = "compress_context";
  description =
    "Compress context using semantic compression (keeps structure, removes details)";
  inputSchema = {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Content to compress",
      },
      strategy: {
        type: "string",
        enum: [
          "code_structure",
          "conversation_summary",
          "semantic_dedup",
          "hierarchical",
        ],
        description: "Compression strategy",
        default: "code_structure",
      },
      language: {
        type: "string",
        description: "Programming language (for code compression)",
      },
      targetRatio: {
        type: "number",
        description:
          "Target compression ratio (0-1, e.g., 0.7 = 70% reduction)",
        default: 0.7,
      },
    },
    required: ["content"],
  };

  private compressor: CodeCompressor;

  constructor() {
    this.compressor = new CodeCompressor();
  }

  async handle(params: unknown): Promise<ToolResponse> {
    const {
      content,
      language,
      targetRatio = 0.7,
    } = params as CompressContextParams;
    const strategy = validateEnum<CompressContextStrategy>(
      "strategy",
      (params as CompressContextParams).strategy ?? "code_structure",
      [
        "code_structure",
        "conversation_summary",
        "semantic_dedup",
        "hierarchical",
      ] as const,
    );

    try {
      const metrics = await compressWithMetrics(
        this.compressor,
        content,
        strategy,
        { language, targetRatio },
      );

      return {
        success: true,
        data: {
          compressed: metrics.compressed,
          originalLength: content.length,
          compressedLength: metrics.compressed.length,
          originalTokens: metrics.originalTokens,
          compressedTokens: metrics.compressedTokens,
          strategy,
        },
        metadata: {
          tokensSaved: metrics.tokensSaved,
          compressionRatio: metrics.compressionRatio,
        },
      };
    } catch (error) {
      logger.error("Failed to compress context", error as Error, {
        strategy,
        contentLength: typeof content === "string" ? content.length : 0,
      });

      return {
        success: false,
        error: `Failed to compress context: ${(error as Error).message}`,
      };
    }
  }
}
