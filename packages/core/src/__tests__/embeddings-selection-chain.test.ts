/**
 * `createEmbeddingProvider` selection-chain tests — the loud-failure fix for
 * the silent 384d MiniLM fallback (Track 3). Before this fix, a configured
 * provider (priority 1, e.g. Ollama with a stale `embedding.dimensions`)
 * failing its health check on a dimension mismatch would fall through the
 * same as any other failure and silently land on the transformers.js
 * fallback (384 dimensions) — a real embedding, at the wrong dimensionality,
 * with nothing in the logs naming the cause.
 *
 * `createProvider` (services/embeddings/provider.js) is mocked so the test
 * controls each provider's `isAvailable()`/`lastDimensionMismatch` outcome
 * without touching a real network or Ollama instance. `hasApiKey` is left
 * real: with every API-key env var cleared below, only `ollama` (priority 1
 * by default) and `transformers`/`local` (no key required, fallback
 * priority 100) ever reach `createProvider` — the two providers this test
 * needs to control — so mocking `hasApiKey` itself is unnecessary.
 *
 * `XDG_CONFIG_HOME` is pointed at a scratch dir before the dynamic imports so
 * `services/embeddings/config.ts`'s `loadConfigSafe()` never reads the real
 * developer `~/.config/massa-ai/config.json` (whose `embedding.provider` /
 * `embedding.dimensions` would otherwise leak into `selectedProvider`, per
 * the m25-m26 "clean config dir" seam documented in CLAUDE.md).
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
const previousEmbeddingProvider = process.env.EMBEDDING_PROVIDER;
const clearedApiKeyVars = [
  "MISTRAL_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENAI_API_KEY",
  "AI_GATEWAY_API_KEY",
  "VERCEL_AI_GATEWAY_API_KEY",
  "LITELLM_BASE_URL",
  "CUSTOM_EMBEDDING_BASE_URL",
] as const;
const previousApiKeyValues = new Map<string, string | undefined>();

beforeAll(() => {
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "massa-ai-embeddings-chain-"));
  process.env.EMBEDDING_PROVIDER = "ollama";
  for (const key of clearedApiKeyVars) {
    previousApiKeyValues.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterAll(() => {
  if (previousXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
  if (previousEmbeddingProvider === undefined) delete process.env.EMBEDDING_PROVIDER;
  else process.env.EMBEDDING_PROVIDER = previousEmbeddingProvider;
  for (const [key, value] of previousApiKeyValues) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// providerId -> desired isAvailable() outcome for the current test. Reset in
// each test via resetBehaviors() so tests don't leak state into each other.
type Behavior = "available" | "unavailable" | "dimension-mismatch";
const behaviors = new Map<string, Behavior>();
function resetBehaviors(): void {
  behaviors.clear();
}

const { DimensionMismatchError } = await import("../services/embeddings/provider.js");

mock.module("../services/embeddings/provider.js", () => ({
  DimensionMismatchError,
  createProvider(config: { model: string; dimensions?: number }, providerId: string) {
    const dimensions = config.dimensions ?? 0;
    return {
      id: providerId,
      model: config.model,
      dimensions,
      lastDimensionMismatch: undefined as InstanceType<typeof DimensionMismatchError> | undefined,
      async embedQuery() {
        return Array(dimensions).fill(0.1);
      },
      async embedBatch(texts: string[]) {
        return texts.map(() => Array(dimensions).fill(0.1));
      },
      async isAvailable(this: { lastDimensionMismatch: unknown }) {
        const behavior = behaviors.get(providerId) ?? "available";
        if (behavior === "dimension-mismatch") {
          this.lastDimensionMismatch = new DimensionMismatchError(providerId, dimensions, 384);
          return false;
        }
        this.lastDimensionMismatch = undefined;
        if (behavior === "unavailable") return false;
        return true;
      },
      getConfig() {
        return config;
      },
    };
  },
}));

const { createEmbeddingProvider } = await import("../services/embeddings/index.js");

describe("createEmbeddingProvider selection chain — dimension-mismatch refusal", () => {
  test("regression: an unreachable configured provider still falls back to the next one", async () => {
    resetBehaviors();
    behaviors.set("ollama", "unavailable");
    behaviors.set("transformers", "available");

    const provider = await createEmbeddingProvider({ cache: false });
    // Falls through past ollama (priority 1) to the next reachable provider
    // in the chain — today's behavior for a non-dimension-mismatch failure.
    expect(provider.id).not.toBe("ollama");
  });

  test("a dimension-mismatch on the configured provider refuses to fall through", async () => {
    resetBehaviors();
    behaviors.set("ollama", "dimension-mismatch");
    behaviors.set("transformers", "available");
    behaviors.set("local", "available");

    await expect(createEmbeddingProvider({ cache: false })).rejects.toThrow(
      /dimension mismatch/i,
    );
  });

  test("the refusal error carries the configured and actual dimensions for remediation", async () => {
    resetBehaviors();
    behaviors.set("ollama", "dimension-mismatch");
    behaviors.set("transformers", "available");

    try {
      await createEmbeddingProvider({ cache: false });
      throw new Error("expected createEmbeddingProvider to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DimensionMismatchError);
      const mismatch = error as InstanceType<typeof DimensionMismatchError>;
      expect(mismatch.providerId).toBe("ollama");
      expect(typeof mismatch.expected).toBe("number");
      expect(mismatch.got).toBe(384);
    }
  });

  test("a dimension-mismatch on a non-configured (fallback) provider does not abort the chain", async () => {
    resetBehaviors();
    behaviors.set("ollama", "unavailable");
    // A lower-priority provider mismatching is not "the configured
    // provider" refusal case — only priority 1 refuses.
    behaviors.set("transformers", "dimension-mismatch");
    behaviors.set("local", "available");

    const provider = await createEmbeddingProvider({ cache: false });
    expect(provider.id).toBe("local");
  });
});
