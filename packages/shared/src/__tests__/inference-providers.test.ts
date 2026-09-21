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

// PDM-13. Every literal below was read from a live LM Studio on 2026-09-21,
// never derived — A-02 measured that a catalog id cannot be computed from its
// Hugging Face repo path.
describe("mlxModels (PDM-13)", () => {
  test("ollama declares no MLX variants — it serves GGUF only", () => {
    expect(INFERENCE_PROVIDERS.ollama.mlxModels).toBeUndefined();
  });

  test("lmstudio declares an MLX variant for all three roles", () => {
    const mlx = INFERENCE_PROVIDERS.lmstudio.mlxModels;
    expect(mlx).toBeDefined();
    expect(Object.keys(mlx!).sort()).toEqual(["coding", "embedding", "instruct"]);
    for (const role of ["embedding", "instruct", "coding"] as const) {
      expect(mlx![role].repo.startsWith("mlx-community/")).toBe(true);
      expect(mlx![role].model.length).toBeGreaterThan(0);
    }
  });

  // The measurement that makes the format switch a no-op for two of three
  // roles: `lms get --mlx <repo>` answered "Model already downloaded. To use,
  // run: lms load <id>" with the GGUF install's own id. An edit that "fixes"
  // these to look MLX-flavoured ships a config LM Studio cannot resolve.
  test("instruct and coding keep their GGUF catalog ids on MLX", () => {
    const spec = INFERENCE_PROVIDERS.lmstudio;
    expect(spec.mlxModels!.instruct.model).toBe(spec.defaultModels.instruct);
    expect(spec.mlxModels!.coding.model).toBe(spec.defaultModels.coding);
  });

  // Embedding is the one role whose id changes, because LM Studio types the
  // MLX build as an LLM and so never applies its `text-embedding-` prefix.
  // Same cause as the /v1/embeddings refusal documented on the field.
  test("embedding is the only role whose MLX id diverges, losing the text-embedding- prefix", () => {
    const spec = INFERENCE_PROVIDERS.lmstudio;
    expect(spec.defaultModels.embedding.startsWith("text-embedding-")).toBe(true);
    expect(spec.mlxModels!.embedding.model.startsWith("text-embedding-")).toBe(false);
    expect(spec.mlxModels!.embedding.model).not.toBe(spec.defaultModels.embedding);
  });

  // Without this the MLX install path is fatal: the width resolver falls
  // through to one real embed call, and that call is the one measured to fail.
  test("both embedding ids resolve a width from the table, with no live probe", () => {
    const spec = INFERENCE_PROVIDERS.lmstudio;
    expect(spec.knownDimensions[spec.mlxModels!.embedding.model]).toBe(1024);
    expect(spec.knownDimensions[spec.defaultModels.embedding]).toBe(1024);
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

  test("trailing slashes are trimmed before the suffix is applied", () => {
    expect(deriveInferenceBaseUrls("ollama", "http://h:11434/")).toEqual({
      embeddingBaseUrl: "http://h:11434",
      llmBaseUrl: "http://h:11434/v1",
    });
    expect(deriveInferenceBaseUrls("ollama", "http://h:11434////")).toEqual({
      embeddingBaseUrl: "http://h:11434",
      llmBaseUrl: "http://h:11434/v1",
    });
    expect(deriveInferenceBaseUrls("lmstudio", "http://h:1234/v1//")).toEqual({
      embeddingBaseUrl: "http://h:1234/v1",
      llmBaseUrl: "http://h:1234/v1",
    });
  });

  test("an all-slash base url trims to empty rather than looping", () => {
    expect(deriveInferenceBaseUrls("ollama", "////")).toEqual({
      embeddingBaseUrl: "",
      llmBaseUrl: "/v1",
    });
  });

  // js/polynomial-redos, CodeQL alert on PR #122. The input shape matters: a
  // *trailing* run of slashes is benign, because `/\/+$/` matches at the run's
  // first position and returns. The quadratic case is a long run followed by a
  // non-slash, where every start position matches greedily and then fails `$`.
  // Measured on the retired regex: 20k slashes 142 ms, 50k slashes 648 ms; the
  // character loop is 0.0 ms at both. A trailing-run input discriminates
  // nothing and would pass under either implementation.
  test("trimming stays linear on a long run of slashes followed by a non-slash", () => {
    const adversarial = `${"/".repeat(50_000)}x`;
    const started = performance.now();
    expect(deriveInferenceBaseUrls("ollama", adversarial).embeddingBaseUrl).toBe(adversarial);
    expect(performance.now() - started).toBeLessThan(100);
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
