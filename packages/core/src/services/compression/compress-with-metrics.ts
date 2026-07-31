/**
 * Compress content and measure what the compression bought, in tokens.
 *
 * PR-C, T8b. This body was inside `CompressContextTool.handle`, and
 * `ContextController` reached it by constructing that tool and calling
 * `handle()` — the fifth `controllers -> tools` edge, and the one T10 converts
 * into `services -> tools` when it folds that controller into `services/`.
 * **AC-3 is closed by removal, not by an allowlist entry** (C19).
 *
 * The tool could not simply move: `CompressContextTool` is published API, imported
 * from `@massa-ai/core` by both transports. So the use case moves down and the
 * handler keeps what a handler owns — its MCP schema, its `validateEnum` call and
 * its `ToolResponse` envelope — which is the direction GMS-02 asks `tools/` to
 * move in anyway.
 *
 * **The arithmetic is deliberately re-derived from `estimateTokens` rather than
 * read off `CompressedContent`.** That struct carries its own `compressionRatio`
 * and `tokensSaved`, computed by the strategy over character lengths; the handler
 * has always ignored them and measured tokens instead. Preserving behavior means
 * preserving that choice, not tidying it.
 *
 * **Failure propagates.** Both callers already handle it, and they do it
 * differently: the tool turns it into `{success:false, error}`, the controller
 * degrades to the uncompressed context. Swallowing it here would flatten the two.
 */
import { logger, estimateTokens } from "@massa-ai/shared";
import type { CodeCompressor } from "./code-compressor.js";

/** The four strategies `compress_context` accepts. */
export type CompressContextStrategy =
  | "code_structure"
  | "conversation_summary"
  | "semantic_dedup"
  | "hierarchical";

export interface CompressionMetrics {
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  tokensSaved: number;
  compressionRatio: number;
}

/**
 * @param compressor The caller's own instance. Passed in rather than constructed
 *   here so both call sites keep the single long-lived compressor they hold
 *   today — `CodeCompressor` caches per-language state across calls.
 * @param targetRatio Reported only. The compressor has never received it; it
 *   appears in both log lines and nowhere else, and that is preserved.
 */
export async function compressWithMetrics(
  compressor: CodeCompressor,
  content: string,
  strategy: CompressContextStrategy,
  options: { language?: string; targetRatio?: number } = {},
): Promise<CompressionMetrics> {
  const { language, targetRatio } = options;
  const unit = (language as "code" | "text") || "code";

  const originalTokens = estimateTokens(content, unit);

  logger.info("Compressing context", {
    originalTokens,
    strategy,
    targetRatio,
  });

  const result = await compressor.compress(content, strategy as never);

  const compressedTokens = estimateTokens(result.compressed, unit);
  const compressionRatio = 1 - compressedTokens / originalTokens;
  const tokensSaved = originalTokens - compressedTokens;

  logger.info("Context compressed", {
    originalTokens,
    compressedTokens,
    tokensSaved,
    actualRatio: compressionRatio.toFixed(2),
    targetRatio,
  });

  return {
    compressed: result.compressed,
    originalTokens,
    compressedTokens,
    tokensSaved,
    compressionRatio,
  };
}
