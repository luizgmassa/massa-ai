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

export interface InferenceProviderSpec {
  readonly id: InferenceProviderId;
  readonly defaultEmbeddingBaseUrl: string;
  readonly defaultLlmBaseUrl: string;
  readonly envNames: InferenceProviderEnvNames;
  readonly knownDimensions: Readonly<Record<string, number>>;
  readonly supportsOllamaVersionProbe: boolean;
  readonly injectsDisableThink: boolean;
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
    supportsOllamaVersionProbe: true,
    injectsDisableThink: true,
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
    },
    supportsOllamaVersionProbe: false,
    injectsDisableThink: false,
    parseModelList: parseLmStudioModelList,
  },
};

export function inferenceProviderList(): readonly InferenceProviderSpec[] {
  return LOCAL_INFERENCE_IDS.map((id) => INFERENCE_PROVIDERS[id]);
}
