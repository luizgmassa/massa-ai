/** PostgreSQL/pgvector health checks used by local system status endpoints. */
import { config } from "@massa-ai/shared";
import { requirePostgresDatabaseUrl, loadConfigSafe } from "@massa-ai/shared/config";
import {
  INFERENCE_PROVIDERS,
  type InferenceProviderId,
} from "@massa-ai/shared/inference-providers";
import { probeProvider } from "../../kernel/inference-probe.js";
import { getPgPool } from "../../kernel/db-connection.js";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  getSearchDiagnostics,
  type SearchDiagnostic,
} from "../../kernel/search-diagnostics.js";

export interface ServiceStatus { available: boolean; latency?: number; error?: string; details?: Record<string, unknown>; }
export interface LocalHealthReport {
  status: "healthy" | "degraded" | "unhealthy"; mode: "postgresql"; timestamp: string;
  services: { ollama: ServiceStatus; inference: ServiceStatus; dataDirectory: ServiceStatus; vectorStore: ServiceStatus; keywordSearch: ServiceStatus; cache: ServiceStatus; embeddingCache: ServiceStatus; };
  diagnostics: { search: readonly SearchDiagnostic[] };
  summary: { total: number; healthy: number; degraded: number; failed: number; }; recommendations: string[];
}
export interface OllamaModelInfo { name: string; size: number; digest: string; modified_at: string; }

export class LocalHealthChecker {
  private readonly dataDir = config.get("dataDir") as string;

  /**
   * `config.json`'s `embedding` block, mirroring `embeddings/config.ts`'s own
   * `fileEmbedding` read — `config.get()`/`config.getAll()` (the `@massa-ai/shared`
   * default export) is a *different* runtime-defaults object (`ServerConfig`)
   * with no `embedding` key at all, so reading the provider from there would
   * always silently resolve `undefined` rather than throw. Read defensively:
   * an unconfigured install has no file, and this must fall back to `ollama`
   * rather than crash the health check.
   */
  private fileEmbedding(): { provider?: string; baseURL?: string; model?: string } | undefined {
    try {
      return loadConfigSafe().embedding;
    } catch {
      return undefined;
    }
  }

  /** Which local-inference provider is configured: `EMBEDDING_PROVIDER` env >
   *  `config.json`'s `embedding.provider` > `ollama` (mirrors
   *  `embeddings/config.ts`'s `selectedProvider` precedence). */
  private resolveProviderId(): InferenceProviderId {
    const provider = process.env.EMBEDDING_PROVIDER || this.fileEmbedding()?.provider;
    return provider === "lmstudio" ? "lmstudio" : "ollama";
  }

  private resolveProviderBaseUrl(id: InferenceProviderId): string {
    const spec = INFERENCE_PROVIDERS[id];
    const envUrl = process.env[spec.envNames.baseUrl];
    if (envUrl) return envUrl;
    const embedding = this.fileEmbedding();
    if (embedding?.provider === id && embedding?.baseURL) return embedding.baseURL;
    return spec.defaultEmbeddingBaseUrl;
  }

  private resolveConfiguredEmbeddingModel(envName: string): string {
    const envModel = process.env[envName];
    if (envModel) return envModel;
    const fileModel = this.fileEmbedding()?.model;
    if (fileModel) return fileModel;
    return "nomic-embed-text:latest";
  }

  async checkAll(): Promise<LocalHealthReport> {
    const [ollama, dataDirectory, database] = await Promise.all([this.checkOllama(), this.checkDataDirectory(), this.checkPostgres()]);
    const services = { ollama, inference: ollama, dataDirectory, vectorStore: database, keywordSearch: database, cache: database, embeddingCache: database };
    const unique = [ollama, dataDirectory, database];
    const healthy = unique.filter((status) => status.available).length;
    const failed = unique.length - healthy;
    const status = failed === 0 ? "healthy" : healthy > failed ? "degraded" : "unhealthy";
    return { status, mode: "postgresql", timestamp: new Date().toISOString(), services, diagnostics: { search: getSearchDiagnostics() }, summary: { total: unique.length, healthy, degraded: 0, failed }, recommendations: this.generateRecommendations(services) };
  }

  /**
   * Provider-aware reachability + model-listing check, kept under the
   * `ollama` name for compatibility (LIP-10: `services.ollama` and
   * `GET /api/v1/system/ollama` are public surfaces, never renamed in
   * place). Discriminates by response body shape via `probeProvider`
   * (kernel/inference-probe.ts) rather than trusting `response.ok` — LM
   * Studio answers HTTP 200 with `{"error": "..."}` for an Ollama-shaped
   * endpoint, so a status-code check alone reports "Ollama healthy" against
   * a server that is not Ollama.
   */
  async checkOllama(): Promise<ServiceStatus> {
    const start = Date.now();
    const providerId = this.resolveProviderId();
    const spec = INFERENCE_PROVIDERS[providerId];
    const baseUrl = this.resolveProviderBaseUrl(providerId);
    const result = await probeProvider(spec, baseUrl);
    const latency = Date.now() - start;
    if (!result.reachable) {
      return {
        available: false,
        latency,
        error: `${spec.id} ${result.reason} at ${baseUrl}`,
      };
    }
    const embeddingModel = this.resolveConfiguredEmbeddingModel(spec.envNames.model);
    return {
      available: true,
      latency,
      details: {
        provider: spec.id,
        url: baseUrl,
        modelsAvailable: result.models.length,
        models: result.models,
        embeddingModel,
        hasEmbeddingModel: result.models.some(
          (name) => name === embeddingModel || name.startsWith(embeddingModel.split(":")[0]),
        ),
      },
    };
  }

  /**
   * Neutral alias for `checkOllama` (LIP-10) — identical provider-aware
   * probe, added beside the Ollama-branded name rather than replacing it.
   */
  async checkInference(): Promise<ServiceStatus> {
    return this.checkOllama();
  }

  async checkDataDirectory(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      if (!existsSync(this.dataDir)) await fs.mkdir(this.dataDir, { recursive: true });
      const probe = path.join(this.dataDir, ".health-check-test"); await fs.writeFile(probe, "ok"); await fs.unlink(probe);
      return { available: true, latency: Date.now() - start, details: { path: this.dataDir, writable: true } };
    } catch (error) { return { available: false, latency: Date.now() - start, error: `Data directory error: ${(error as Error).message}` }; }
  }

  async checkPostgres(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      const url = new URL(requirePostgresDatabaseUrl());
      const pool = await getPgPool();
      const result = await pool.query<{ extension_installed: boolean; size_bytes: string }>("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS extension_installed, pg_database_size(current_database())::text AS size_bytes");
      const details = { backend: "postgres", database: decodeURIComponent(url.pathname.slice(1)), host: url.hostname, port: Number(url.port || 5432), sizeBytes: Number(result.rows[0]?.size_bytes || 0), pgvector: result.rows[0]?.extension_installed === true };
      if (!details.pgvector) return { available: false, latency: Date.now() - start, error: "pgvector extension is not installed", details };
      return { available: true, latency: Date.now() - start, details };
    } catch (error) { return { available: false, latency: Date.now() - start, error: `PostgreSQL health check failed: ${(error as Error).message}` }; }
  }

  async isOllamaReady(): Promise<boolean> { return (await this.checkOllama()).available; }
  async getOllamaModels(): Promise<string[]> { const result = await this.checkOllama(); return result.details?.models as string[] || []; }
  private generateRecommendations(services: LocalHealthReport["services"]): string[] {
    const recommendations: string[] = [];
    if (!services.vectorStore.available) recommendations.push("Configure a reachable PostgreSQL DATABASE_URL with pgvector, then deploy Prisma migrations.");
    if (!services.ollama.available) recommendations.push("Install and start Ollama, then pull the configured embedding model.");
    if (!services.dataDirectory.available) recommendations.push(`Create writable data directory: mkdir -p ${this.dataDir}`);
    return recommendations.length ? recommendations : ["PostgreSQL, pgvector, Ollama, and local artifacts are healthy."];
  }
}
let healthCheckerInstance: LocalHealthChecker | null = null;
export function getHealthChecker(): LocalHealthChecker { return healthCheckerInstance ??= new LocalHealthChecker(); }
