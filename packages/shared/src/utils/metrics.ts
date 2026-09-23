/**
 * Metrics and Cost Analysis
 *
 * Track token usage, compression ratios, and cost savings
 * Uses models.dev API for dynamic pricing
 */

import { logger } from "./logger.js";

/**
 * Fallback pricing for common models (used when API is unavailable)
 * Prices per 1M tokens in USD
 */
const FALLBACK_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4": { input: 30, output: 60 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4-mini": { input: 3, output: 6 },
  "gpt-3.5-turbo": { input: 1.5, output: 2 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "gemini-pro": { input: 0.25, output: 0.5 },
};

export type ModelName = keyof typeof FALLBACK_PRICING;

/**
 * Token usage metrics
 */
export interface TokenMetrics {
  originalTokens: number;
  compressedTokens: number;
  tokensSaved: number;
  compressionRatio: number;
  model: ModelName;
  costOriginal: number;
  costCompressed: number;
  costSavings: number;
}

/**
 * Metrics collector
 */
export class MetricsCollector {
  private static metrics: TokenMetrics[] = [];
  /**
   * Get model pricing (uses fallback pricing)
   */
  static async getModelPricing(
    modelId: string,
  ): Promise<{ input: number; output: number }> {
    try {
      // Use fallback pricing - external pricing service can be injected later
      const fallback = FALLBACK_PRICING[modelId as ModelName];
      if (fallback) {
        return fallback;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn("MetricsCollector: failed to fetch pricing", {
        modelId,
        error: err,
      });
    }

    // Fallback to hardcoded pricing
    const fallback = FALLBACK_PRICING[modelId as ModelName];
    if (fallback) {
      logger.debug(`Using fallback pricing for ${modelId}`);
      return fallback;
    }

    // Default to gpt-4 pricing if unknown model
    logger.warn("MetricsCollector: unknown model, using gpt-4 pricing as default", { modelId });
    return FALLBACK_PRICING["gpt-4"];
  }

  /**
   * Calculate token cost (sync version using fallback pricing)
   */
  static calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: ModelName,
  ): number {
    const pricing = FALLBACK_PRICING[model];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Calculate token cost (async version using models.dev API)
   */
  static async calculateCostAsync(
    inputTokens: number,
    outputTokens: number,
    modelId: string,
  ): Promise<number> {
    const pricing = await this.getModelPricing(modelId);
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Record compression metrics (sync version with fallback pricing)
   */
  static recordCompression(
    originalTokens: number,
    compressedTokens: number,
    model: ModelName = "gpt-4",
  ): TokenMetrics {
    const tokensSaved = originalTokens - compressedTokens;
    const compressionRatio =
      originalTokens > 0 ? tokensSaved / originalTokens : 0;

    // Assume output is ~20% of input (rough estimate)
    const outputTokens = Math.floor(originalTokens * 0.2);
    const outputTokensCompressed = Math.floor(compressedTokens * 0.2);

    const costOriginal = this.calculateCost(
      originalTokens,
      outputTokens,
      model,
    );
    const costCompressed = this.calculateCost(
      compressedTokens,
      outputTokensCompressed,
      model,
    );
    const costSavings = costOriginal - costCompressed;

    const metrics: TokenMetrics = {
      originalTokens,
      compressedTokens,
      tokensSaved,
      compressionRatio,
      model,
      costOriginal,
      costCompressed,
      costSavings,
    };

    this.metrics.push(metrics);

    logger.metric("token_compression", compressionRatio * 100, "%");
    logger.metric("cost_savings", costSavings, "USD");

    return metrics;
  }

  /**
   * Record compression metrics (async version using models.dev API)
   */
  static async recordCompressionAsync(
    originalTokens: number,
    compressedTokens: number,
    modelId: string = "gpt-4",
  ): Promise<TokenMetrics> {
    const tokensSaved = originalTokens - compressedTokens;
    const compressionRatio =
      originalTokens > 0 ? tokensSaved / originalTokens : 0;

    // Assume output is ~20% of input (rough estimate)
    const outputTokens = Math.floor(originalTokens * 0.2);
    const outputTokensCompressed = Math.floor(compressedTokens * 0.2);

    const costOriginal = await this.calculateCostAsync(
      originalTokens,
      outputTokens,
      modelId,
    );
    const costCompressed = await this.calculateCostAsync(
      compressedTokens,
      outputTokensCompressed,
      modelId,
    );
    const costSavings = costOriginal - costCompressed;

    const metrics: TokenMetrics = {
      originalTokens,
      compressedTokens,
      tokensSaved,
      compressionRatio,
      model: modelId as ModelName, // For backwards compatibility
      costOriginal,
      costCompressed,
      costSavings,
    };

    this.metrics.push(metrics);

    logger.metric("token_compression", compressionRatio * 100, "%");
    logger.metric("cost_savings", costSavings, "USD");

    return metrics;
  }

  /**
   * Get aggregated metrics
   */
  static getAggregatedMetrics(): {
    totalOriginalTokens: number;
    totalCompressedTokens: number;
    totalTokensSaved: number;
    avgCompressionRatio: number;
    totalCostSavings: number;
    count: number;
  } {
    if (this.metrics.length === 0) {
      return {
        totalOriginalTokens: 0,
        totalCompressedTokens: 0,
        totalTokensSaved: 0,
        avgCompressionRatio: 0,
        totalCostSavings: 0,
        count: 0,
      };
    }

    const totalOriginalTokens = this.metrics.reduce(
      (sum, m) => sum + m.originalTokens,
      0,
    );
    const totalCompressedTokens = this.metrics.reduce(
      (sum, m) => sum + m.compressedTokens,
      0,
    );
    const totalTokensSaved = this.metrics.reduce(
      (sum, m) => sum + m.tokensSaved,
      0,
    );
    const avgCompressionRatio =
      this.metrics.reduce((sum, m) => sum + m.compressionRatio, 0) /
      this.metrics.length;
    const totalCostSavings = this.metrics.reduce(
      (sum, m) => sum + m.costSavings,
      0,
    );

    return {
      totalOriginalTokens,
      totalCompressedTokens,
      totalTokensSaved,
      avgCompressionRatio,
      totalCostSavings,
      count: this.metrics.length,
    };
  }

  /**
   * Generate savings report
   */
  static generateReport(): string {
    const agg = this.getAggregatedMetrics();

    if (agg.count === 0) {
      return "No metrics collected yet";
    }

    const monthlyProjection = agg.totalCostSavings * 30; // Assuming daily metrics

    return `
📊 Token Compression Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Requests Analyzed: ${agg.count}

Tokens:
  Original:    ${agg.totalOriginalTokens.toLocaleString()}
  Compressed:  ${agg.totalCompressedTokens.toLocaleString()}
  Saved:       ${agg.totalTokensSaved.toLocaleString()} (${(agg.avgCompressionRatio * 100).toFixed(1)}%)

Cost Savings:
  Total:       $${agg.totalCostSavings.toFixed(4)}
  Per Request: $${(agg.totalCostSavings / agg.count).toFixed(6)}
  Monthly*:    $${monthlyProjection.toFixed(2)}

* Projected based on current usage
`.trim();
  }

  /**
   * Reset metrics
   */
  static reset(): void {
    this.metrics = [];
  }
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  operation: string;
  duration: number;
  success: boolean;
  timestamp: Date;
}

/**
 * Performance tracker
 */
export class PerformanceTracker {
  private static metrics: PerformanceMetrics[] = [];

  /**
   * Track operation
   */
  static async track<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    let success = false;

    try {
      const result = await fn();
      success = true;
      return result;
    } finally {
      const duration = performance.now() - start;

      this.metrics.push({
        operation,
        duration,
        success,
        timestamp: new Date(),
      });

      logger.metric(`${operation}_duration`, duration, "ms");
    }
  }

  /**
   * Get operation statistics
   */
  static getStats(operation: string): {
    count: number;
    avgDuration: number;
    successRate: number;
  } {
    const ops = this.metrics.filter((m) => m.operation === operation);

    if (ops.length === 0) {
      return { count: 0, avgDuration: 0, successRate: 0 };
    }

    const avgDuration =
      ops.reduce((sum, m) => sum + m.duration, 0) / ops.length;
    const successRate = ops.filter((m) => m.success).length / ops.length;

    return {
      count: ops.length,
      avgDuration,
      successRate,
    };
  }
}
