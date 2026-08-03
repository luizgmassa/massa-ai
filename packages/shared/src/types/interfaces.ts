/**
 * Core Interfaces for Service Layer
 * 
 * Defines contracts between different architectural layers
 * following the Repository and Strategy patterns
 */

import {
  Memory,
  SearchResult,
  RetrievalOptions,
  StorageOptions,
  CompressedContent,
  CompressionStrategy,
  ToolResponse
} from './index.js';

/**
 * Memory Repository Interface
 * 
 * Abstracts storage operations across different backends
 */
export interface IMemoryRepository {
  store(memory: Memory, options: StorageOptions): Promise<void>;
  retrieve(id: string): Promise<Memory | null>;
  search(query: string, options: RetrievalOptions): Promise<SearchResult[]>;
  delete(id: string): Promise<boolean>;
  update(id: string, updates: Partial<Memory>): Promise<Memory>;
  list(filters: MemoryFilters): Promise<Memory[]>;
}

/**
 * Memory Filters
 */
export interface MemoryFilters {
  userId?: string;
  sessionId?: string;
  projectId?: string;
  types?: string[];
  levels?: number[];
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Cache Manager Interface
 * 
 * Manages hierarchical cache (L1, L2, L3)
 */
export interface ICacheManager {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(pattern?: string): Promise<void>;
  has(key: string): Promise<boolean>;
  invalidate(pattern: string): Promise<number>; // returns count
  getStats(): Promise<CacheStats>;
}

/**
 * Cache Statistics
 */
export interface CacheStats {
  l1: {
    hits: number;
    misses: number;
    size: number;
    entries: number;
  };
  l2: {
    hits: number;
    misses: number;
    size: number;
    entries: number;
  };
  l3: {
    hits: number;
    misses: number;
    entries: number;
  };
  totalHitRate: number;
}

/**
 * Compressor Interface
 * 
 * Strategy pattern for different compression approaches
 */
export interface ICompressor {
  compress(content: string, strategy?: CompressionStrategy): Promise<CompressedContent>;
  decompress(compressed: CompressedContent): Promise<string>;
  estimateCompression(content: string): Promise<number>; // ratio
  getStrategy(): CompressionStrategy;
}

/**
 * The embedding capability a vector store needs, and nothing more.
 *
 * GMS-01 AC-4. `data/vector/base-vector-store.ts` used to import both
 * `createEmbeddingProvider` and `EmbeddingProvider` from
 * `services/embeddings/index.js` — the last `data -> services` edge of the 26,
 * and the one design.md §3 resolves by inverting rather than by promoting, since
 * `services/embeddings/index.ts` is a barrel over six sibling modules and moving
 * it is a subsystem move rather than a kernel admission.
 *
 * This is deliberately NOT the full `EmbeddingProvider` interface. That one
 * carries `id`, `model`, `isAvailable()` and `getConfig(): EmbeddingProviderConfig`,
 * and lifting it whole would drag `services/embeddings/config.ts` into shared —
 * the same subsystem creep the inversion exists to avoid. Measured: `data/vector/`
 * reads exactly three members, `dimensions`, `embedQuery` and `embedBatch`.
 * The real provider satisfies this structurally, so nothing needs to declare it.
 */
export interface VectorEmbeddingProvider {
  /** Embedding dimensions — drives pgvector column sizing. */
  dimensions: number;
  /** Embed a single text query. */
  embedQuery(text: string): Promise<number[]>;
  /** Embed multiple texts in batch. */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Deferred construction of a {@link VectorEmbeddingProvider}.
 *
 * Deferred on purpose: `base-vector-store.ts` assigns its provider into a
 * memoised promise field on first use, not at construction time. Resolving
 * eagerly would move provider auto-selection to construction and change when it
 * happens — which is a behaviour change inside a behaviour-preserving refactor.
 */
export type VectorEmbeddingProviderFactory = () => Promise<VectorEmbeddingProvider>;

/**
 * Vector Store Interface
 *
 * Abstracts PostgreSQL + pgvector database operations.
 * Supports multiple backend implementations with consistent API.
 */
export interface IVectorStore {
  // Core document operations
  addDocument(id: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  addDocuments(documents: VectorDocument[]): Promise<void>;
  update(id: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<boolean>;
  deleteByProject(projectId: string): Promise<number>;
  
  // Search operations
  search(query: string, limit?: number, projectId?: string): Promise<SearchResult[]>;
  searchByEmbedding(embedding: number[], limit?: number, projectId?: string): Promise<SearchResult[]>;
  
  // Collection management
  getCollection(name: string): Promise<IVectorCollection>;
  
  // Statistics and metadata
  getStats(projectId?: string): Promise<VectorStoreStats>;
  listProjects(): Promise<ProjectInfo[]>;
  
  // Health and lifecycle
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Vector Store Statistics
 */
export interface VectorStoreStats {
  totalDocuments: number;
  totalSize: number;
  embeddingDimensions?: number;  // For validation (e.g., PostgreSQL schema vs provider)
  indexType?: string;            // 'none' | 'hnsw' | 'ivfflat'
  indexStatus?: 'building' | 'ready' | 'stale' | 'none';
}

/**
 * Project Information
 */
export interface ProjectInfo {
  projectId: string;
  projectPath: string | null;
  documentCount: number;
  totalSize: number;
  lastIndexed: string | null;
}

/**
 * Vector Collection Interface
 */
export interface IVectorCollection {
  name: string;
  count(): Promise<number>;
  query(params: VectorQueryParams): Promise<SearchResult[]>;
  add(documents: VectorDocument[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
}

/**
 * Vector Query Parameters
 */
export interface VectorQueryParams {
  queryEmbeddings?: number[][];
  queryTexts?: string[];
  nResults?: number;
  where?: Record<string, unknown>;
  whereDocument?: Record<string, unknown>;
}

/**
 * Vector Document
 */
export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

/**
 * Keyword Search Interface
 * 
 * PostgreSQL full-text search operations.
 */
export interface IKeywordSearch {
  index(id: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  delete(id: string): Promise<boolean>;
  update(id: string, content: string): Promise<void>;
  /**
   * Trigram (3-char substring) lexical search for identifier-substring recall
   * (e.g. "useEff" → chunks containing "useEffect"). Returns [] when the
   * backend lacks a trigram index or the sanitized query is empty.
   */
  searchTrigram?(
    query: string,
    filters: { projectId?: string },
    limit?: number,
  ): Promise<SearchResult[]>;
  /**
   * Levenshtein fuzzy correction of a single word against the per-store
   * vocabulary table, length-bounded by maxEditDistance. Returns the closest
   * vocabulary word within tolerance, or null when none qualifies (including
   * when no vocabulary table exists). Exact matches return null (no correction
   * needed).
   */
  fuzzyCorrect?(word: string): Promise<string | null>;
}

/**
 * Embedding Service Interface
 */
export interface IEmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getSimilarity(embedding1: number[], embedding2: number[]): number;
}

/**
 * MCP Tool Handler Interface
 */
export interface IToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handle(params: unknown): Promise<ToolResponse>;
}

/**
 * MCP Resource Handler Interface
 */
export interface IResourceHandler {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
  fetch(): Promise<unknown>;
}

/**
 * Context Optimizer Interface
 */
export interface IContextOptimizer {
  optimize(context: string, maxTokens: number): Promise<CompressedContent>;
  getOptimizedContext(query: string, options: RetrievalOptions): Promise<ToolResponse>;
  estimateTokens(text: string): number;
}

/**
 * Logger Interface
 */
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

/**
 * Configuration Interface
 */
export interface IConfig {
  get<T>(key: string): T;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  getAll(): Record<string, unknown>;
}
