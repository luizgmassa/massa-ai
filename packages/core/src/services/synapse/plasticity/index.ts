export {
  computeStrengthenUpdates,
  DEFAULT_STRENGTHEN_CONFIG,
  type StrengthenConfig,
  type StrengthenUpdate,
  type MemoryUsageStats,
} from "./strengthen.js";

export {
  selectCompressionCandidates,
  compressBatch,
  DEFAULT_COMPRESS_CONFIG,
  type CompressConfig,
  type CompressUpdate,
  type CompressionCandidate,
  type SummarizeFn,
} from "./compress.js";

export {
  evolveEmbeddings,
  DEFAULT_EMBEDDING_EVOLUTION_CONFIG,
  type EmbeddingEvolutionConfig,
  type EvolutionInput,
  type EvolutionUpdate,
} from "./embedding-evolution.js";
