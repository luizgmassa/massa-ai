export interface EmbeddingCacheStats {
  totalEntries: number;
  cacheSize: number;
  hitRate: number;
  avgDimensions: number;
}

/** Shared contract implemented by the PostgreSQL and PostgreSQL embedding caches. */
export interface EmbeddingCacheStore {
  get(text: string): Promise<number[] | null>;
  set(text: string, embedding: number[]): Promise<void>;
  getBatch(texts: string[]): Promise<Array<number[] | null>>;
  setBatch(texts: string[], embeddings: number[][]): Promise<void>;
  getStats(): Promise<EmbeddingCacheStats>;
  /** Remove entries older than maxAgeMs, measured from their creation time. */
  cleanup(maxAgeMs: number): Promise<number>;
  close?(): Promise<void>;
}
