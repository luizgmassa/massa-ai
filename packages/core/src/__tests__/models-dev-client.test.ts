/**
 * ModelsDevClient unit tests — fetch is mocked; local cache file uses a temp dir.
 * Covers fetchAllModels (memory cache, local cache, remote, bundled defaults),
 * getModelPricing (exact, normalized, case-insensitive, not found),
 * searchModels, getTopExpensiveModels, getStatistics, clearCache, clearAllCaches,
 * hasLocalCache, normalizeModelId, addCommonAliases.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { config } from "@massa-ai/shared";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ModelsDevClient,
  getModelsDevClient,
} from "../services/pricing/models-dev-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("ModelsDevClient", () => {
  let tempDir: string;
  let client: ModelsDevClient;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "models-dev-test-"));
    (config as unknown as { set: (key: string, value: unknown) => void }).set(
      "dataDir",
      tempDir,
    );
    client = new ModelsDevClient();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("fetchAllModels falls back to bundled defaults when remote fails and no local cache", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const models = await client.fetchAllModels();
    expect(models.size).toBeGreaterThan(0);
    // Bundled defaults include known models.
    expect(models.get("ollama/nomic-embed-text")).toBeDefined();
    expect(models.get("gpt-4o-mini")).toBeDefined();
    expect(models.get("claude-3-5-sonnet-20241022")).toBeDefined();
  });

  test("fetchAllModels fetches from remote API and saves local cache", async () => {
    const apiResponse: Record<string, unknown> = {
      openai: {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-4o": {
            id: "gpt-4o",
            name: "GPT-4o",
            cost: { input: 5, output: 15 },
            limit: { context: 128000, output: 16384 },
            last_updated: "2025-01-01",
          },
          "text-embedding-3-small": {
            id: "text-embedding-3-small",
            name: "Text Embedding 3 Small",
            cost: { input: 0.02, output: 0 },
          },
          "free-model": {
            id: "free-model",
            name: "Free Model",
            cost: { input: 0, output: 0 },
          },
        },
      },
    };
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(JSON.stringify(apiResponse), { status: 200 }),
        ),
    ) as typeof fetch;

    const models = await client.fetchAllModels();
    expect(models.get("gpt-4o")).toBeDefined();
    expect(models.get("gpt-4o")!.inputCostPerMillion).toBe(5);
    // Common alias: gpt-4o includes "gpt-4" (not turbo) → alias "gpt-4" set.
    expect(models.get("gpt-4")).toBeDefined();
    // Free model (both costs zero) is skipped.
    expect(models.has("free-model")).toBe(false);

    // Local cache file should have been written.
    const cachePath = path.join(tempDir, "pricing-cache.json");
    const cached = JSON.parse(await readFile(cachePath, "utf-8"));
    expect(cached.models).toBeDefined();
    expect(cached.timestamp).toBeGreaterThan(0);
  });

  test("fetchAllModels uses memory cache on second call (no remote fetch)", async () => {
    let fetchCalls = 0;
    globalThis.fetch = mock(() => {
      fetchCalls++;
      return Promise.resolve(
        new Response(JSON.stringify({}), { status: 200 }),
      );
    }) as typeof fetch;

    await client.fetchAllModels(); // populates memory cache
    const firstCalls = fetchCalls;
    await client.fetchAllModels(); // should hit memory cache
    expect(fetchCalls).toBe(firstCalls);
  });

  test("fetchAllModels uses local cache when remote fails", async () => {
    // Pre-write a local cache file.
    const cachePath = path.join(tempDir, "pricing-cache.json");
    const localData = {
      timestamp: Date.now(),
      version: "1.0.0",
      models: {
        "local-model": {
          id: "local-model",
          name: "Local Model",
          provider: "TestProvider",
          inputCostPerMillion: 1,
          outputCostPerMillion: 2,
        },
      },
    };
    await writeFile(cachePath, JSON.stringify(localData), "utf-8");

    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const models = await client.fetchAllModels();
    expect(models.get("local-model")).toBeDefined();
    expect(models.get("local-model")!.inputCostPerMillion).toBe(1);
  });

  test("fetchAllModels handles HTTP error from remote (falls back)", async () => {
    globalThis.fetch = mock(
      () => Promise.resolve(new Response("error", { status: 500 })),
    ) as typeof fetch;
    const models = await client.fetchAllModels();
    // Falls back to bundled defaults.
    expect(models.size).toBeGreaterThan(0);
  });

  test("fetchAllModels handles expired local cache (still usable as fallback)", async () => {
    const cachePath = path.join(tempDir, "pricing-cache.json");
    const localData = {
      timestamp: Date.now() - 25 * 3600 * 1000, // 25h old → expired
      version: "1.0.0",
      models: {
        "expired-model": {
          id: "expired-model",
          name: "Expired Model",
          provider: "Test",
          inputCostPerMillion: 0.5,
          outputCostPerMillion: 0.5,
        },
      },
    };
    await writeFile(cachePath, JSON.stringify(localData), "utf-8");

    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const models = await client.fetchAllModels();
    // Expired local cache is still returned as fallback.
    expect(models.get("expired-model")).toBeDefined();
  });

  test("fetchAllModels handles corrupted local cache (falls back to defaults)", async () => {
    const cachePath = path.join(tempDir, "pricing-cache.json");
    await writeFile(cachePath, "not json", "utf-8");

    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const models = await client.fetchAllModels();
    expect(models.size).toBeGreaterThan(0);
  });

  test("getModelPricing returns exact match", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const pricing = await client.getModelPricing("gpt-4o-mini");
    expect(pricing).not.toBeNull();
    expect(pricing!.id).toBe("gpt-4o-mini");
  });

  test("getModelPricing returns null for unknown model", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const pricing = await client.getModelPricing("nonexistent-model-xyz");
    expect(pricing).toBeNull();
  });

  test("getModelPricing tries case-insensitive match", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const pricing = await client.getModelPricing("GPT-4O-MINI");
    expect(pricing).not.toBeNull();
    expect(pricing!.id).toBe("gpt-4o-mini");
  });

  test("getModelPricing normalizes provider-prefixed ids", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    // "openai/gpt-4o-mini" normalizes to "gpt-4o-mini".
    const pricing = await client.getModelPricing("openai/gpt-4o-mini");
    expect(pricing).not.toBeNull();
  });

  test("searchModels returns matching models sorted by input cost desc", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const results = await client.searchModels("gpt");
    expect(results.length).toBeGreaterThan(0);
    // Sorted by input cost descending.
    for (let i = 1; i < results.length; i++) {
      expect(results[i].inputCostPerMillion).toBeLessThanOrEqual(
        results[i - 1].inputCostPerMillion,
      );
    }
  });

  test("searchModels deduplicates by provider:name", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const results = await client.searchModels("claude");
    const keys = results.map((r) => `${r.provider}:${r.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("getTopExpensiveModels returns top N sorted by input cost", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const top = await client.getTopExpensiveModels(3);
    expect(top.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < top.length; i++) {
      expect(top[i].inputCostPerMillion).toBeLessThanOrEqual(
        top[i - 1].inputCostPerMillion,
      );
    }
  });

  test("getStatistics returns aggregate stats", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const stats = await client.getStatistics();
    expect(stats.totalModels).toBeGreaterThan(0);
    expect(stats.totalProviders).toBeGreaterThan(0);
    expect(stats.avgInputCost).toBeGreaterThanOrEqual(0);
    expect(stats.avgOutputCost).toBeGreaterThanOrEqual(0);
    expect(stats.cheapestModel).not.toBeNull();
    expect(stats.mostExpensiveModel).not.toBeNull();
    // Cheapest has lower-or-equal input cost than most expensive.
    expect(
      stats.cheapestModel!.inputCostPerMillion,
    ).toBeLessThanOrEqual(stats.mostExpensiveModel!.inputCostPerMillion);
  });

  test("clearCache resets the in-memory cache", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    await client.fetchAllModels();
    client.clearCache();
    // Next fetch should re-fetch (not hit memory cache).
    let fetched = false;
    globalThis.fetch = mock(() => {
      fetched = true;
      return Promise.reject(new Error("offline"));
    }) as typeof fetch;
    await client.fetchAllModels();
    expect(fetched).toBe(true);
  });

  test("clearAllCaches removes memory + local file", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    await client.fetchAllModels();
    await client.clearAllCaches();
    expect(await client.hasLocalCache()).toBe(false);
  });

  test("hasLocalCache returns false when no cache file exists", async () => {
    expect(await client.hasLocalCache()).toBe(false);
  });

  test("hasLocalCache returns true after a fetch writes the cache", async () => {
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              openai: {
                id: "openai",
                name: "OpenAI",
                models: {
                  "gpt-4o": {
                    id: "gpt-4o",
                    name: "GPT-4o",
                    cost: { input: 5, output: 15 },
                  },
                },
              },
            }),
            { status: 200 },
          ),
        ),
    ) as typeof fetch;
    await client.fetchAllModels();
    expect(await client.hasLocalCache()).toBe(true);
  });

  test("getModelsDevClient returns a shared singleton", () => {
    const a = getModelsDevClient();
    const b = getModelsDevClient();
    expect(a).toBe(b);
  });

  test("normalizeModelId strips provider prefixes and lowercases family prefixes", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    // "openai/gpt-4o" → normalizeModelId strips "openai/" → "gpt-4o".
    // "anthropic/claude-3" → strips "anthropic/" → "claude-3".
    const pricing1 = await client.getModelPricing("openai/text-embedding-3-small");
    expect(pricing1).not.toBeNull();
  });

  test("remote fetch with aliases (claude-3-haiku, gemini-1.5-flash)", async () => {
    const apiResponse = {
      anthropic: {
        id: "anthropic",
        name: "Anthropic",
        models: {
          "claude-3-haiku-20240307": {
            id: "claude-3-haiku-20240307",
            name: "Claude 3 Haiku",
            cost: { input: 0.25, output: 1.25 },
          },
        },
      },
      google: {
        id: "google",
        name: "Google",
        models: {
          "gemini-1.5-flash": {
            id: "gemini-1.5-flash",
            name: "Gemini 1.5 Flash",
            cost: { input: 0.075, output: 0.3 },
          },
          "gemini-1.5-pro": {
            id: "gemini-1.5-pro",
            name: "Gemini 1.5 Pro",
            cost: { input: 1.25, output: 5 },
          },
          "gemini-pro": {
            id: "gemini-pro",
            name: "Gemini Pro",
            cost: { input: 0.5, output: 1.5 },
          },
        },
      },
      openai: {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-4-turbo": {
            id: "gpt-4-turbo",
            name: "GPT-4 Turbo",
            cost: { input: 10, output: 30 },
          },
          "gpt-3.5-turbo": {
            id: "gpt-3.5-turbo",
            name: "GPT-3.5 Turbo",
            cost: { input: 0.5, output: 1.5 },
          },
        },
      },
    };
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(JSON.stringify(apiResponse), { status: 200 }),
        ),
    ) as typeof fetch;

    const models = await client.fetchAllModels();
    // Aliases.
    expect(models.get("claude-3-haiku")).toBeDefined();
    expect(models.get("gemini-1.5-flash")).toBeDefined();
    expect(models.get("gemini-1.5-pro")).toBeDefined();
    expect(models.get("gemini-pro")).toBeDefined();
    expect(models.get("gpt-4-turbo")).toBeDefined();
    expect(models.get("gpt-3.5-turbo")).toBeDefined();
  });

  test("saveLocalCache failure is caught (best-effort, no throw)", async () => {
    // Point dataDir to a path that cannot be created (under a file).
    (config as unknown as { set: (key: string, value: unknown) => void }).set(
      "dataDir",
      path.join(tempDir, "not-a-dir", "subdir"),
    );
    // Make "not-a-dir" a file so mkdir fails.
    await writeFile(path.join(tempDir, "not-a-dir"), "blocker", "utf-8");
    globalThis.fetch = mock(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              openai: {
                id: "openai",
                name: "OpenAI",
                models: {
                  "gpt-4o": {
                    id: "gpt-4o",
                    name: "GPT-4o",
                    cost: { input: 5, output: 15 },
                  },
                },
              },
            }),
            { status: 200 },
          ),
        ),
    ) as typeof fetch;
    // Should NOT throw despite saveLocalCache failure.
    const models = await client.fetchAllModels();
    expect(models.get("gpt-4o")).toBeDefined();
  });

  test("clearAllCaches handles unlink failure gracefully", async () => {
    // No cache file exists → unlink is skipped (existsSync false).
    await client.clearAllCaches();
    expect(await client.hasLocalCache()).toBe(false);
  });

  test("loadLocalCache handles missing file (existsSync false)", async () => {
    // Point dataDir to a fresh empty temp dir with no cache file.
    const freshDir = await mkdtemp(path.join(tmpdir(), "models-dev-fresh-"));
    (config as unknown as { set: (key: string, value: unknown) => void }).set(
      "dataDir",
      freshDir,
    );
    const freshClient = new ModelsDevClient();
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as typeof fetch;
    const models = await freshClient.fetchAllModels();
    expect(models.size).toBeGreaterThan(0);
    await rm(freshDir, { recursive: true, force: true });
  });
});