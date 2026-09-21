/**
 * PDM-03 AC-1: the shipped `defaultMassaAiConfig.embedding` block must derive
 * the ollama embedding model and its width from the inference-providers seam,
 * not restate them as literals — a future seam change must not leave this
 * block silently stale (T03b).
 */

import { describe, test, expect } from "bun:test";

import { defaultMassaAiConfig } from "../massa-ai-config";
import { INFERENCE_PROVIDERS } from "../inference-providers";
import { knownEmbeddingDimensions } from "../embedding-dimensions";

describe("defaultMassaAiConfig.embedding derives from the inference-providers seam (T03b)", () => {
  test("model equals INFERENCE_PROVIDERS.ollama.defaultModels.embedding", () => {
    expect(defaultMassaAiConfig.embedding.model).toBe(
      INFERENCE_PROVIDERS.ollama.defaultModels.embedding,
    );
  });

  test("dimensions equals the known width of the seam's ollama embedding model", () => {
    const expected = knownEmbeddingDimensions(INFERENCE_PROVIDERS.ollama.defaultModels.embedding);
    expect(expected).toBeDefined();
    expect(defaultMassaAiConfig.embedding.dimensions).toBe(expected as number);
  });
});
