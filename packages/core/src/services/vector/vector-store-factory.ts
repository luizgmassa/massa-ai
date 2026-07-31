/**
 * Backend-neutral vector-store factory backed exclusively by PostgreSQL.
 *
 * **This is the composition root for the vector subsystem**, and that is why it
 * lives in `services/` rather than beside the store it builds (GMS-01 AC-4).
 *
 * It is the one module that legitimately needs both halves: `PostgresVectorStore`
 * from `data/vector/` and `createEmbeddingProvider` from `services/embeddings/`.
 * From `data/` those two cannot be combined — importing the second is the
 * `data -> services` edge AC-4 exists to eliminate. From `services/` both imports
 * are legal, so the composition happens here and the provider factory is passed
 * into the store's constructor.
 *
 * The alternative that was built and reverted was a registration port: a
 * process-wide slot in `data/vector/` that `services/embeddings` filled as a
 * module-load side effect. It reached zero edges and compiled, but the
 * registration is an import-order dependency that breaks production, not just
 * tests — `getVectorStore()` -> `store.ensureInitialized()` ->
 * `getEmbeddingDimensions()` resolves the provider on every real call path, and
 * `packages/core/src/index.ts` does not import `services/embeddings`. Moving the
 * composition root removes the ordering question instead of documenting it.
 */

import type { IVectorStore } from "@massa-ai/shared";
import { logger } from "@massa-ai/shared";
import { parsePositiveIntEnv, requirePostgresDatabaseUrl } from "@massa-ai/shared/config";
import { PostgresVectorStore, type PostgresConfig } from "../../data/vector/postgres-vector-store.js";
import { createEmbeddingProvider } from "../embeddings/index.js";

export interface VectorStoreConfig {
  postgres?: Partial<PostgresConfig>;
}

let cachedStore: IVectorStore | null = null;
let initializationPromise: Promise<IVectorStore> | null = null;

export async function getVectorStore(config?: VectorStoreConfig): Promise<IVectorStore> {
  if (cachedStore) return cachedStore;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const connectionString = config?.postgres?.connectionString ?? requirePostgresDatabaseUrl();
    const hnswM = parsePositiveIntEnv(process.env.POSTGRES_HNSW_M, 0);
    const hnswEfConstruction = parsePositiveIntEnv(process.env.POSTGRES_HNSW_EF_CONSTRUCTION, 0);
    const ivfflatLists = parsePositiveIntEnv(process.env.POSTGRES_IVFFLAT_LISTS, 0);
    const indexParams = {
      ...(hnswM ? { m: hnswM } : {}),
      ...(hnswEfConstruction ? { efConstruction: hnswEfConstruction } : {}),
      ...(ivfflatLists ? { lists: ivfflatLists } : {}),
    };
    const store = new PostgresVectorStore({
      // The default path, unchanged in behaviour and relocated in ownership: this
      // is the identical `createEmbeddingProvider({ cache: true })` call that used
      // to sit inline in base-vector-store.ts, still a deferred thunk so provider
      // selection still happens on first embedding use.
      embeddingProviderFactory: () => createEmbeddingProvider({ cache: true }),
      connectionString,
      poolSize: Number.parseInt(process.env.POSTGRES_VECTOR_POOL_SIZE || "10", 10),
      indexType: (process.env.POSTGRES_VECTOR_INDEX as "ivfflat" | "hnsw") || "hnsw",
      ...(Object.keys(indexParams).length ? { indexParams } : {}),
      ...config?.postgres,
    });
    await store.ensureInitialized();
    if (!await Promise.race([store.healthCheck(), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000))])) {
      await store.close().catch(() => undefined);
      throw new Error("PostgreSQL vector store health check failed");
    }
    cachedStore = store;
    logger.info("PostgreSQL vector store initialized");
    return store;
  })().finally(() => { initializationPromise = null; });
  return initializationPromise;
}

export async function resetVectorStore(): Promise<void> {
  if (!cachedStore) return;
  await cachedStore.close();
  cachedStore = null;
}
