import { describe, expect, test } from "bun:test";
import path from "path";
import {
  INFERENCE_PROVIDERS,
  INFERENCE_ROLE_DEFAULTS,
  LOCAL_INFERENCE_IDS,
  inferenceProviderList,
  deriveInferenceBaseUrls,
  type InferenceRole,
} from "../config/inference-providers";

const ROLES: InferenceRole[] = ["embedding", "instruct", "coding"];

const MODULE_PATH = path.join(
  import.meta.dir,
  "..",
  "config",
  "inference-providers.ts",
);

describe("LOCAL_INFERENCE_IDS", () => {
  test("is exactly ollama + lmstudio", () => {
    expect([...LOCAL_INFERENCE_IDS].sort()).toEqual(["lmstudio", "ollama"]);
  });

  test("every id has a registry entry with a matching id field", () => {
    for (const id of LOCAL_INFERENCE_IDS) {
      expect(INFERENCE_PROVIDERS[id].id).toBe(id);
    }
  });

  test("inferenceProviderList returns one spec per id, in order", () => {
    expect(inferenceProviderList().map((spec) => spec.id)).toEqual([
      ...LOCAL_INFERENCE_IDS,
    ]);
  });
});

describe("provider defaults", () => {
  test("ollama defaults", () => {
    const ollama = INFERENCE_PROVIDERS.ollama;
    expect(ollama.defaultEmbeddingBaseUrl).toBe("http://localhost:11434");
    expect(ollama.defaultLlmBaseUrl).toBe("http://localhost:11434/v1");
    expect(ollama.supportsOllamaVersionProbe).toBe(true);
    expect(ollama.injectsDisableThink).toBe(true);
  });

  test("lmstudio defaults", () => {
    const lmstudio = INFERENCE_PROVIDERS.lmstudio;
    expect(lmstudio.defaultEmbeddingBaseUrl).toBe("http://localhost:1234/v1");
    expect(lmstudio.defaultLlmBaseUrl).toBe("http://localhost:1234/v1");
    expect(lmstudio.supportsOllamaVersionProbe).toBe(false);
    expect(lmstudio.injectsDisableThink).toBe(false);
  });

  test("lmstudio knownDimensions seeds the measured nomic model at 768", () => {
    expect(
      INFERENCE_PROVIDERS.lmstudio.knownDimensions[
        "text-embedding-nomic-embed-text-v1.5"
      ],
    ).toBe(768);
  });

  test("lmstudio knownDimensions additively gains the qwen3 embedding default at 1024", () => {
    expect(
      INFERENCE_PROVIDERS.lmstudio.knownDimensions[
        "text-embedding-qwen3-embedding-0.6b"
      ],
    ).toBe(1024);
  });

  test("env names follow the OLLAMA_/LMSTUDIO_ pattern with no collisions", () => {
    const allNames = LOCAL_INFERENCE_IDS.flatMap((id) => {
      const spec = INFERENCE_PROVIDERS[id];
      return [spec.envNames.model, spec.envNames.baseUrl, spec.envNames.dimensions];
    });
    expect(new Set(allNames).size).toBe(allNames.length);
    expect(INFERENCE_PROVIDERS.ollama.envNames).toEqual({
      model: "OLLAMA_EMBEDDING_MODEL",
      baseUrl: "OLLAMA_BASE_URL",
      dimensions: "OLLAMA_EMBEDDING_DIMENSIONS",
    });
    expect(INFERENCE_PROVIDERS.lmstudio.envNames).toEqual({
      model: "LMSTUDIO_EMBEDDING_MODEL",
      baseUrl: "LMSTUDIO_BASE_URL",
      dimensions: "LMSTUDIO_EMBEDDING_DIMENSIONS",
    });
  });
});

describe("INFERENCE_ROLE_DEFAULTS", () => {
  test("embedding: 8192 context, no temperature", () => {
    expect(INFERENCE_ROLE_DEFAULTS.embedding).toEqual({ contextWindow: 8192 });
  });

  test("instruct: 16384 context at temperature 0.2", () => {
    expect(INFERENCE_ROLE_DEFAULTS.instruct).toEqual({
      contextWindow: 16384,
      temperature: 0.2,
    });
  });

  test("coding: 32768 context at temperature 0.0", () => {
    expect(INFERENCE_ROLE_DEFAULTS.coding).toEqual({
      contextWindow: 32768,
      temperature: 0.0,
    });
  });
});

describe("per-provider defaultModels trio (PDM-01 AC-1)", () => {
  test("ollama carries the measured trio", () => {
    expect(INFERENCE_PROVIDERS.ollama.defaultModels).toEqual({
      embedding: "qwen3-embedding:0.6b",
      instruct: "qwen3-vl:8b",
      coding: "qwen2.5-coder:7b",
    });
  });

  test("lmstudio carries the measured trio", () => {
    expect(INFERENCE_PROVIDERS.lmstudio.defaultModels).toEqual({
      embedding: "text-embedding-qwen3-embedding-0.6b",
      instruct: "qwen3-vl-8b-instruct",
      coding: "qwen2.5-coder-7b-instruct",
    });
  });

  test("every provider's defaultModels covers exactly the three roles (PDM-01 AC-1)", () => {
    for (const id of LOCAL_INFERENCE_IDS) {
      const keys = Object.keys(INFERENCE_PROVIDERS[id].defaultModels).sort();
      expect(keys).toEqual([...ROLES].sort());
    }
  });
});

describe("per-provider mechanism fields", () => {
  test("ollama applies context per request; lmstudio applies it at load time", () => {
    expect(INFERENCE_PROVIDERS.ollama.appliesContextPerRequest).toBe(true);
    expect(INFERENCE_PROVIDERS.lmstudio.appliesContextPerRequest).toBe(false);
  });

  test("both providers embed in batches of 64 (design R-03)", () => {
    expect(INFERENCE_PROVIDERS.ollama.embedBatchSize).toBe(64);
    expect(INFERENCE_PROVIDERS.lmstudio.embedBatchSize).toBe(64);
  });
});

describe("deriveInferenceBaseUrls (G2)", () => {
  test("omitted --base-url returns ollama's declared pair unchanged", () => {
    expect(deriveInferenceBaseUrls("ollama", undefined)).toEqual({
      embeddingBaseUrl: INFERENCE_PROVIDERS.ollama.defaultEmbeddingBaseUrl,
      llmBaseUrl: INFERENCE_PROVIDERS.ollama.defaultLlmBaseUrl,
    });
  });

  test("omitted --base-url returns lmstudio's declared pair unchanged", () => {
    expect(deriveInferenceBaseUrls("lmstudio", undefined)).toEqual({
      embeddingBaseUrl: INFERENCE_PROVIDERS.lmstudio.defaultEmbeddingBaseUrl,
      llmBaseUrl: INFERENCE_PROVIDERS.lmstudio.defaultLlmBaseUrl,
    });
  });

  test("an explicit --base-url re-applies ollama's declared /v1 suffix to the LLM URL", () => {
    expect(deriveInferenceBaseUrls("ollama", "http://h:11434")).toEqual({
      embeddingBaseUrl: "http://h:11434",
      llmBaseUrl: "http://h:11434/v1",
    });
  });

  test("an explicit --base-url writes the same URL to both fields for lmstudio", () => {
    expect(deriveInferenceBaseUrls("lmstudio", "http://h:1234/v1")).toEqual({
      embeddingBaseUrl: "http://h:1234/v1",
      llmBaseUrl: "http://h:1234/v1",
    });
  });
});

describe("parseModelList", () => {
  test("ollama parser accepts {models:[{name}]} and returns the names", () => {
    const result = INFERENCE_PROVIDERS.ollama.parseModelList({
      models: [{ name: "qwen3-embedding:4b" }],
    });
    expect(result).toEqual(["qwen3-embedding:4b"]);
  });

  test("ollama parser rejects the lmstudio shape", () => {
    expect(
      INFERENCE_PROVIDERS.ollama.parseModelList({
        object: "list",
        data: [{ id: "text-embedding-nomic-embed-text-v1.5" }],
      }),
    ).toBeNull();
  });

  test("ollama parser rejects a 200-with-error body", () => {
    expect(
      INFERENCE_PROVIDERS.ollama.parseModelList({
        error: "Unexpected endpoint or method. (GET /api/tags)",
      }),
    ).toBeNull();
  });

  test("lmstudio parser accepts {data:[{id}]} and returns the ids", () => {
    const result = INFERENCE_PROVIDERS.lmstudio.parseModelList({
      object: "list",
      data: [{ id: "text-embedding-nomic-embed-text-v1.5" }],
    });
    expect(result).toEqual(["text-embedding-nomic-embed-text-v1.5"]);
  });

  test("lmstudio parser rejects the ollama shape", () => {
    expect(
      INFERENCE_PROVIDERS.lmstudio.parseModelList({
        models: [{ name: "qwen3-embedding:4b" }],
      }),
    ).toBeNull();
  });

  test("lmstudio parser rejects a 200-with-error body", () => {
    expect(
      INFERENCE_PROVIDERS.lmstudio.parseModelList({
        error: "Unexpected endpoint or method. (GET /api/tags)",
      }),
    ).toBeNull();
  });

  test("both parsers reject non-array and null-ish bodies", () => {
    for (const id of LOCAL_INFERENCE_IDS) {
      const parse = INFERENCE_PROVIDERS[id].parseModelList;
      expect(parse(null)).toBeNull();
      expect(parse(undefined)).toBeNull();
      expect(parse("not json")).toBeNull();
      expect(parse({})).toBeNull();
    }
  });
});

describe("side-effect freedom (T01 discriminating check)", () => {
  test("bundling this module in isolation never pulls in config/index.ts", async () => {
    const result = await Bun.build({
      entrypoints: [MODULE_PATH],
      target: "bun",
    });
    expect(result.success).toBe(true);
    const bundled = await result.outputs[0].text();

    // `loadConfigSafe` is declared only in config/index.ts (`:632` runs it at
    // module scope). Its presence in the bundle means the graph reached that
    // file — the exact reach that would break web-ui's bundler-less browser
    // load.
    expect(bundled).not.toContain("loadConfigSafe");
    expect(bundled).not.toContain("getConfigDir");
  });

  // T07 (2026-09-19, approved amendment): this module now derives
  // `ollama.knownDimensions` from `embedding-dimensions.ts`'s
  // `KNOWN_EMBEDDING_DIMENSIONS` rather than carrying a second copy of that
  // table — a one-line, one-direction import of an equally zero-I/O module.
  // The bundling check above is the test that actually matters (it would
  // catch a reach into `config/index.ts` through any import chain); this one
  // is narrowed from "zero imports" to "no import besides that one sanctioned
  // sibling", so a stray new import is still caught.
  test("the source file imports nothing besides embedding-dimensions.ts", async () => {
    const source = await Bun.file(MODULE_PATH).text();
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toEqual([
      'import { KNOWN_EMBEDDING_DIMENSIONS } from "./embedding-dimensions.js";',
    ]);
  });
});
