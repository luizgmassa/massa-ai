/**
 * Vector Search Components Export
 */

export { HybridSearch } from './hybrid-search.js';

// `vector-store-factory.ts` is deliberately NOT re-exported here. It moved to
// `services/vector/` as the vector subsystem's composition root (GMS-01 AC-4), so
// re-exporting it from this barrel would reintroduce the `data -> services` edge
// the move removes. `packages/core/src/index.ts` re-exports it from its new home.

export type { PostgresVectorStore, PostgresConfig } from './postgres-vector-store.js';

export { BaseVectorStore } from './base-vector-store.js';
