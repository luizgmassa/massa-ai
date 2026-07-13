import { logger } from "@massa-th0th/shared";
import type { EmbeddingCacheStore } from "./embedding-cache-contract.js";
import { EmbeddingCache } from "./embedding-cache.js";
import { EmbeddingCachePg } from "./embedding-cache-pg.js";

/** Select the cache backend from the canonical application database setting. */
export function createEmbeddingCache(
  provider: string,
  model: string,
): EmbeddingCacheStore {
  const databaseUrl = process.env.DATABASE_URL;
  const isPostgres =
    databaseUrl?.startsWith("postgresql://") ||
    databaseUrl?.startsWith("postgres://");

  if (isPostgres) {
    logger.info("Using PostgreSQL embedding cache", { provider, model });
    return new EmbeddingCachePg(provider, model);
  }

  logger.info("Using SQLite embedding cache", { provider, model });
  return new EmbeddingCache(provider, model);
}
