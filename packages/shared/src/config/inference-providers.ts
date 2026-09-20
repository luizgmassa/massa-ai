/**
 * Provider-neutral data for the local inference seam: ids, default base URLs,
 * env names, known embedding widths, LLM-behaviour flags, and the pure
 * response-body parsers. Zero I/O — the only import is `embedding-dimensions.ts`
 * (also zero-I/O, one direction only: this module derives `ollama.knownDimensions`
 * from its `KNOWN_EMBEDDING_DIMENSIONS` rather than carrying a second copy of
 * that table, T07). `apps/web-ui` value-imports this module through the
 * `@massa-ai/shared/inference-providers` subpath, which must never reach
 * `config/index.ts` (`loadConfigSafe()` runs at module scope there and would
 * break the browser) — `embedding-dimensions.ts` never imports `config/index.ts`
 * either, so that constraint still holds transitively.
 */

import { KNOWN_EMBEDDING_DIMENSIONS } from "./embedding-dimensions.js";

export const LOCAL_INFERENCE_IDS = ["ollama", "lmstudio"] as const;

export type InferenceProviderId = (typeof LOCAL_INFERENCE_IDS)[number];

export interface InferenceProviderEnvNames {
  readonly model: string;
  readonly baseUrl: string;
  readonly dimensions: string;
}

export type ParseModelList = (body: unknown) => string[] | null;

export type InferenceRole = "embedding" | "instruct" | "coding";

export const INFERENCE_ROLE_DEFAULTS = {
  embedding: { contextWindow: 8192 },
  instruct: { contextWindow: 16384, temperature: 0.2 },
  coding: { contextWindow: 32768, temperature: 0.0 },
} as const;

export interface InferenceProviderSpec {
  readonly id: InferenceProviderId;
  readonly defaultEmbeddingBaseUrl: string;
  readonly defaultLlmBaseUrl: string;
  readonly envNames: InferenceProviderEnvNames;
  readonly knownDimensions: Readonly<Record<string, number>>;
  readonly defaultModels: Readonly<Record<InferenceRole, string>>;
  readonly appliesContextPerRequest: boolean;
  readonly embedBatchSize: number;
  readonly supportsOllamaVersionProbe: boolean;
  readonly injectsDisableThink: boolean;
  /**
   * Route structured output through `/v1/chat/completions` instead of the
   * Responses API. `@ai-sdk/openai@3` resolves the default callable
   * `openai(model)` to `/v1/responses`, and LM Studio serves that endpoint but
   * **silently drops** `text.format`: measured against `qwen/qwen3-4b-2507`, a
   * `json_schema` request came back as `"text":{"format":{"type":"text"}}` with
   * the prose "The capital of France is Paris.", while the identical schema on
   * `/v1/chat/completions` returned `{ "capital": "Paris" }`. Ollama is not
   * affected — its `/v1/responses` answered 400 for a model reason, so the
   * endpoint is implemented there.
   */
  readonly requiresChatCompletionsApi: boolean;
  readonly parseModelList: ParseModelList;
}

function parseOllamaModelList(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const models = (body as { models?: unknown }).models;
  if (!Array.isArray(models)) return null;
  return models.map((entry) => (entry as { name?: unknown }).name).filter(
    (name): name is string => typeof name === "string",
  );
}

function parseLmStudioModelList(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  return data.map((entry) => (entry as { id?: unknown }).id).filter(
    (id): id is string => typeof id === "string",
  );
}

export const INFERENCE_PROVIDERS: Readonly<
  Record<InferenceProviderId, InferenceProviderSpec>
> = {
  ollama: {
    id: "ollama",
    defaultEmbeddingBaseUrl: "http://localhost:11434",
    defaultLlmBaseUrl: "http://localhost:11434/v1",
    envNames: {
      model: "OLLAMA_EMBEDDING_MODEL",
      baseUrl: "OLLAMA_BASE_URL",
      dimensions: "OLLAMA_EMBEDDING_DIMENSIONS",
    },
    knownDimensions: KNOWN_EMBEDDING_DIMENSIONS,
    defaultModels: {
      embedding: "qwen3-embedding:0.6b",
      instruct: "qwen3-vl:8b",
      coding: "qwen2.5-coder:7b",
    },
    appliesContextPerRequest: true,
    embedBatchSize: 64,
    supportsOllamaVersionProbe: true,
    injectsDisableThink: true,
    requiresChatCompletionsApi: false,
    parseModelList: parseOllamaModelList,
  },
  lmstudio: {
    id: "lmstudio",
    defaultEmbeddingBaseUrl: "http://localhost:1234/v1",
    defaultLlmBaseUrl: "http://localhost:1234/v1",
    envNames: {
      model: "LMSTUDIO_EMBEDDING_MODEL",
      baseUrl: "LMSTUDIO_BASE_URL",
      dimensions: "LMSTUDIO_EMBEDDING_DIMENSIONS",
    },
    knownDimensions: {
      "text-embedding-nomic-embed-text-v1.5": 768,
      "text-embedding-qwen3-embedding-0.6b": 1024,
    },
    defaultModels: {
      embedding: "text-embedding-qwen3-embedding-0.6b",
      instruct: "qwen3-vl-8b-instruct",
      coding: "qwen2.5-coder-7b-instruct",
    },
    appliesContextPerRequest: false,
    embedBatchSize: 64,
    supportsOllamaVersionProbe: false,
    injectsDisableThink: false,
    requiresChatCompletionsApi: true,
    parseModelList: parseLmStudioModelList,
  },
};

export function inferenceProviderList(): readonly InferenceProviderSpec[] {
  return LOCAL_INFERENCE_IDS.map((id) => INFERENCE_PROVIDERS[id]);
}
