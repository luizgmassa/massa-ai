import { describe, expect, test } from "bun:test";
import path from "path";
import {
  INFERENCE_PROVIDERS,
  LOCAL_INFERENCE_IDS,
  inferenceProviderList,
} from "../config/inference-providers";

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

  test("the source file has zero import statements", async () => {
    const source = await Bun.file(MODULE_PATH).text();
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toEqual([]);
  });
});
