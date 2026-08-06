/**
 * Embedding Provider Factory with Auto-Fallback
 *
 * Main entry point for creating embedding providers with:
 * - Automatic provider selection based on availability
 * - Fallback chain: Mistral Text → Mistral Code
 * - Optional transparent caching
 * - Health checking before usage
 *
 * Usage:
 * ```typescript
 * // Auto-select first available provider with cache
 * const provider = await createEmbeddingProvider({ cache: true });
 *
 * // Specific provider with cache
 * const provider = await createEmbeddingProvider({
 *   provider: 'mistralText',
 *   cache: true
 * });
 *
 * // Use provider
 * const embedding = await provider.embedQuery("Hello world");
 * const embeddings = await provider.embedBatch(["Hello", "World"]);
 * ```
 */

import { EmbeddingProvider, DimensionMismatchError, createProvider } from "./provider.js";
import { withCache } from "./cached-provider.js";
import type { EmbeddingCacheStore } from "../cache/embedding-cache-contract.js";
import { createEmbeddingCache } from "../cache/embedding-cache-factory.js";
import {
  embeddingProviders,
  getProvidersByPriority,
  hasApiKey,
  type EmbeddingProviderConfig,
} from "./config.js";
import { logger } from "@massa-ai/shared";

/**
 * Options for creating an embedding provider
 */
export interface CreateProviderOptions {
  /**
   * Provider to use:
   * - 'auto': Try providers by priority until one works (Ollama first)
   * - 'ollama': Ollama local embeddings (768D, free, local-first)
   * - 'transformers' / 'local': In-process transformers.js ONNX embeddings
   *   (384D, fully offline after first model download — roadmap A5)
   * - 'mistralText': Mistral text embeddings (1024D)
   * - 'mistralCode': Mistral code embeddings (1536D)
   *
   * Default: 'auto'
   */
  provider?: "auto" | "ollama" | "transformers" | "local" | "mistralText" | "mistralCode";

  /**
   * Enable transparent caching using SHA-256 content hashing
   *
   * Benefits:
   * - 0.09ms cache hit latency
   * - Reduce API calls by 60-80%
   * - Automatic cleanup of old entries
   *
   * Default: true
   */
  cache?: boolean;

  /**
   * Custom cache instance (optional)
   * If not provided, a new cache will be created with default settings
   */
  cacheInstance?: EmbeddingCacheStore;

  /**
   * Skip health check before returning provider
   * Useful for testing or when you know provider is available
   *
   * Default: false
   */
  skipHealthCheck?: boolean;
}

/**
 * Result of a single provider-creation attempt. `provider` is set only on
 * success; `dimensionMismatch` is set only when the health check failed
 * specifically because the model's output length did not match the
 * configured `dimensions` (see `DimensionMismatchError`) — every other
 * failure cause (no API key, unreachable service, malformed response)
 * leaves it `undefined`.
 */
interface ProviderAttempt {
  provider: EmbeddingProvider | null;
  dimensionMismatch?: DimensionMismatchError;
}

/**
 * Try to create a provider from configuration.
 * `provider` is null if the provider is not available or configured.
 */
async function tryCreateProvider(
  config: EmbeddingProviderConfig,
  providerId: string,
  skipHealthCheck: boolean,
): Promise<ProviderAttempt> {
  // Check if API key is available (if needed)
  if (!hasApiKey(providerId)) {
    logger.debug(`[${providerId}] Skipping: No API key configured`);
    return { provider: null };
  }

  // Create provider
  const provider = createProvider(config, providerId);

  // Health check
  if (!skipHealthCheck) {
    const available = await provider.isAvailable();
    if (!available) {
      logger.debug(`[${providerId}] Health check failed`);
      return { provider: null, dimensionMismatch: provider.lastDimensionMismatch };
    }
  }

  logger.info(
    `[${providerId}] Provider ready (model: ${config.model}, dimensions: ${config.dimensions})`,
  );
  return { provider };
}

/**
 * Log the remediation-bearing ERROR and produce the error to throw when the
 * configured embedding provider fails its health check on a dimension
 * mismatch. Shared by both selection paths in `createEmbeddingProvider` so
 * the message stays identical regardless of how the provider was chosen.
 */
function refuseOnDimensionMismatch(
  providerId: string,
  mismatch: DimensionMismatchError,
): never {
  logger.error(
    `[${providerId}] Configured embedding provider failed with a dimension mismatch — refusing to ` +
      `fall through to another provider (that would silently degrade retrieval quality). ` +
      `configured dimensions ${mismatch.expected} ≠ model output ${mismatch.got} — fix ` +
      "`embedding.dimensions` in config.json or OLLAMA_EMBEDDING_DIMENSIONS to match the model actually pulled.",
  );
  throw mismatch;
}

/**
 * Create embedding provider with auto-fallback
 *
 * Auto mode:
 * Tries providers in priority order until one succeeds:
 * 1. Mistral Text (general purpose embeddings)
 * 2. Mistral Code (code-specialized embeddings)
 *
 * Specific provider mode:
 * Creates the requested provider or throws if unavailable
 */
export async function createEmbeddingProvider(
  options: CreateProviderOptions = {},
): Promise<EmbeddingProvider> {
  const {
    provider: requestedProvider = "auto",
    cache: enableCache = true,
    cacheInstance,
    skipHealthCheck = false,
  } = options;

  let baseProvider: EmbeddingProvider | null = null;

  // Auto mode: try providers by priority
  if (requestedProvider === "auto") {
    logger.info("Auto-selecting embedding provider...");

    const providers = getProvidersByPriority();

    for (const [id, config] of providers) {
      logger.debug(`Trying provider: ${id} (priority: ${config.priority})`);

      const attempt = await tryCreateProvider(config, id, skipHealthCheck);
      if (attempt.provider) {
        baseProvider = attempt.provider;
        logger.info(`Selected provider: ${id}`);
        break;
      }

      // The configured provider (priority 1 — the one EMBEDDING_PROVIDER /
      // config.json `embedding.provider` selected) failing on a dimension
      // mismatch is not a "try the next provider" situation: silently
      // falling through here is exactly how a stale `embedding.dimensions`
      // beside a re-pulled model used to degrade to the 384d transformers.js
      // fallback without anyone noticing. Any other failure (unreachable
      // service, no API key) keeps today's fallback behavior.
      if (config.priority === 1 && attempt.dimensionMismatch) {
        refuseOnDimensionMismatch(id, attempt.dimensionMismatch);
      }
    }

    if (!baseProvider) {
      throw new Error(
        "No embedding providers available. For local-first setup:\n" +
          "1. Install Ollama: curl -fsSL https://ollama.com/install.sh | sh\n" +
          "2. Start Ollama: ollama serve\n" +
          "3. Pull model: ollama pull nomic-embed-text:latest\n" +
          "\n" +
          "Or configure a remote provider:\n" +
          "- MISTRAL_API_KEY (Mistral AI text and code embeddings)",
      );
    }
  }
  // Specific provider mode
  else {
    const config = embeddingProviders[requestedProvider];
    if (!config) {
      throw new Error(`Unknown provider: ${requestedProvider}`);
    }

    const attempt = await tryCreateProvider(
      config,
      requestedProvider,
      skipHealthCheck,
    );

    // An explicitly requested provider has no fallback chain to protect —
    // but a dimension mismatch here is the same silent-degrade risk (a
    // caller that catches the generic "not available" error and retries
    // with 'auto' would otherwise land on the same stale-config problem),
    // so surface the distinguishable error here too.
    if (attempt.dimensionMismatch) {
      refuseOnDimensionMismatch(requestedProvider, attempt.dimensionMismatch);
    }

    baseProvider = attempt.provider;

    if (!baseProvider) {
      throw new Error(
        `Provider '${requestedProvider}' is not available. ` +
          `Please check configuration and ensure ${config.provider.toUpperCase()}_API_KEY is set.`,
      );
    }
  }

  // Wrap with cache if requested
  if (enableCache) {
    const cache =
      cacheInstance || createEmbeddingCache(baseProvider.id, baseProvider.model);

    const cachedProvider = withCache(baseProvider, cache);
    logger.info(`Cache enabled for ${baseProvider.id}`);

    return cachedProvider;
  }

  return baseProvider;
}

/**
 * Create all available providers (for testing/comparison)
 *
 * Returns an array of all providers that pass health checks. This is a
 * diagnostic/benchmarking enumeration, not the production selection chain —
 * it intentionally does NOT apply the dimension-mismatch refusal in
 * `createEmbeddingProvider`, so one misconfigured provider never aborts the
 * scan of the rest.
 */
export async function createAllProviders(
  options: { cache?: boolean; skipHealthCheck?: boolean } = {},
): Promise<EmbeddingProvider[]> {
  const { cache: enableCache = false, skipHealthCheck = false } = options;

  const providers = getProvidersByPriority();
  const results: EmbeddingProvider[] = [];

  for (const [id, config] of providers) {
    const attempt = await tryCreateProvider(config, id, skipHealthCheck);
    const provider = attempt.provider;
    if (provider) {
      if (enableCache) {
        const cache = createEmbeddingCache(provider.id, provider.model);
        results.push(withCache(provider, cache));
      } else {
        results.push(provider);
      }
    }
  }

  return results;
}

/**
 * Check which providers are available
 *
 * Returns a map of provider IDs to availability status.
 * Useful for diagnostics and configuration validation.
 */
export async function checkProviderAvailability(): Promise<
  Record<string, { available: boolean; reason?: string }>
> {
  const providers = getProvidersByPriority();
  const results: Record<string, { available: boolean; reason?: string }> = {};

  for (const [id, config] of providers) {
    // Check API key
    if (!hasApiKey(id)) {
      results[id] = {
        available: false,
        reason: "No API key configured",
      };
      continue;
    }

    // Check health
    try {
      const provider = createProvider(config, id);
      const available = await provider.isAvailable();

      results[id] = {
        available,
        reason: available ? undefined : "Health check failed",
      };
    } catch (error) {
      results[id] = {
        available: false,
        reason: (error as Error).message,
      };
    }
  }

  return results;
}

// Re-export types and utilities
export type { EmbeddingProvider } from "./provider.js";
export type { CachedEmbeddingProvider } from "./cached-provider.js";
export type { EmbeddingProviderConfig } from "./config.js";
export {
  embeddingProviders,
  getProvidersByPriority,
  hasApiKey,
} from "./config.js";

// Phase 7f: relocated EmbeddingService (was data/chromadb/vector-store.ts).
export { EmbeddingService } from "./embedding-service.js";
