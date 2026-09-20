/**
 * `resolveEmbeddingDimensions` — `env > known width > configured > default`.
 *
 * The case that matters is the one that shipped: a config.json written by an
 * older installer records `qwen3-embedding:4b` beside `4096`. That is not a
 * cosmetic mismatch. `createEmbeddingProvider` refuses to fall through on a
 * dimension mismatch — on purpose, so retrieval never silently degrades — so
 * every embedding path throws `DimensionMismatchError` until someone hand-edits
 * the file. Deriving the width from a known model is what lets an existing
 * install recover on its own.
 */

import { describe, test, expect } from "bun:test";
import {
  resolveEmbeddingDimensions,
  knownEmbeddingDimensions,
  knownEmbeddingModels,
  resolveModelDimensions,
  KNOWN_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from "../embedding-dimensions";
import { INFERENCE_PROVIDERS } from "../inference-providers";

// Module-level top-level await (this file is ESM): probed once, reused by
// the live LIP-04 check at the bottom of this file. Skipped everywhere LM
// Studio is not running (CI has none).
const LMSTUDIO_URL = "http://localhost:1234/v1";
const lmStudioReachable = await fetch(`${LMSTUDIO_URL}/models`, {
  signal: AbortSignal.timeout(1000),
})
  .then((r) => r.ok)
  .catch(() => false);

describe("resolveEmbeddingDimensions", () => {
  test("a known model's width beats a config value that contradicts it, and reports the correction", () => {
    const r = resolveEmbeddingDimensions("qwen3-embedding:4b", 4096, undefined);
    expect(r.dimensions).toBe(2560);
    expect(r.correctedFrom).toBe(4096);
  });

  test("an agreeing config value is not reported as a correction", () => {
    // A warning that fires for every correctly-configured install is a warning
    // operators learn to ignore.
    const r = resolveEmbeddingDimensions("qwen3-embedding:4b", 2560, undefined);
    expect(r.dimensions).toBe(2560);
    expect(r.correctedFrom).toBeUndefined();
  });

  test("an explicit env value wins over both, and is never a correction", () => {
    const r = resolveEmbeddingDimensions("qwen3-embedding:4b", 4096, 1024);
    expect(r.dimensions).toBe(1024);
    expect(r.correctedFrom).toBeUndefined();
  });

  test("an unknown model keeps the configured value untouched", () => {
    // It may be a truncated or fine-tuned variant whose width only the user
    // knows; overriding it would be guessing.
    const r = resolveEmbeddingDimensions("some-org/custom-embed:v2", 1536, undefined);
    expect(r.dimensions).toBe(1536);
    expect(r.correctedFrom).toBeUndefined();
  });

  test("an unknown model with nothing configured falls back to the reference default", () => {
    const r = resolveEmbeddingDimensions("some-org/custom-embed:v2", undefined, undefined);
    expect(r.dimensions).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
  });

  test("a known model with nothing configured resolves to its native width", () => {
    const r = resolveEmbeddingDimensions("qwen3-embedding:8b", undefined, undefined);
    expect(r.dimensions).toBe(4096);
    expect(r.correctedFrom).toBeUndefined();
  });

  test("an absent model name never throws and never invents a width", () => {
    expect(resolveEmbeddingDimensions(undefined, 768, undefined).dimensions).toBe(768);
    expect(resolveEmbeddingDimensions(undefined, undefined, undefined).dimensions).toBe(
      DEFAULT_EMBEDDING_DIMENSIONS,
    );
  });
});

describe("the known-width table", () => {
  test("carries the exact model set, not merely some of it", () => {
    // An exact set, so a model silently dropped from the table is as red as a
    // changed width — the shell/TypeScript parity check in
    // scripts/__tests__/embedding-defaults-parity.test.ts asserts the same set
    // against the bash copy.
    expect(knownEmbeddingModels()).toEqual([
      "bge-m3",
      "qwen3-embedding:0.6b",
      "qwen3-embedding:4b",
      "qwen3-embedding:8b",
    ]);
  });

  test("distinguishes a model it knows from one it does not", () => {
    expect(knownEmbeddingDimensions("qwen3-embedding:4b")).toBe(2560);
    expect(knownEmbeddingDimensions("nomic-embed-text")).toBeUndefined();
    expect(knownEmbeddingDimensions(undefined)).toBeUndefined();
  });

  test("tolerates surrounding whitespace from a hand-edited config.json", () => {
    expect(knownEmbeddingDimensions("  qwen3-embedding:4b  ")).toBe(2560);
  });
});

describe("inference-providers.ts derives its ollama table FROM this file (T07 collapse)", () => {
  test("INFERENCE_PROVIDERS.ollama.knownDimensions is the same object as KNOWN_EMBEDDING_DIMENSIONS", () => {
    // Identity, not just value equality — proves the seam derives from this
    // file rather than carrying a second, independently-maintained copy.
    expect(INFERENCE_PROVIDERS.ollama.knownDimensions).toBe(KNOWN_EMBEDDING_DIMENSIONS);
  });
});

describe("resolveModelDimensions — provider-aware, probe-backed resolution (LIP-04)", () => {
  test("a known Ollama model resolves instantly, no fetch", async () => {
    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      throw new Error("must not be called");
    }) as unknown as typeof fetch;
    const dims = await resolveModelDimensions("qwen3-embedding:4b", { fetchImpl });
    expect(dims).toBe(2560);
    expect(fetchCalled).toBe(false);
  });

  test("a model known only via the merged LM Studio table resolves instantly, no fetch", async () => {
    // Live-measured: text-embedding-nomic-embed-text-v1.5 → 768 (see the
    // live-probe test below for the network-backed confirmation).
    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      throw new Error("must not be called");
    }) as unknown as typeof fetch;
    const dims = await resolveModelDimensions("text-embedding-nomic-embed-text-v1.5", {
      knownDimensions: INFERENCE_PROVIDERS.lmstudio.knownDimensions,
      fetchImpl,
    });
    expect(dims).toBe(768);
    expect(fetchCalled).toBe(false);
  });

  test("an unknown model with no baseUrl throws immediately, naming the model", async () => {
    await expect(resolveModelDimensions("some-org/unknown-embed:v9")).rejects.toThrow(
      /some-org\/unknown-embed:v9/,
    );
  });

  test("an unknown model with an unreachable endpoint throws, naming model and endpoint (discriminating check)", async () => {
    const fetchImpl = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    await expect(
      resolveModelDimensions("some-org/unknown-embed:v9", {
        baseUrl: "http://localhost:1234/v1",
        fetchImpl,
      }),
    ).rejects.toThrow(/some-org\/unknown-embed:v9/);
    await expect(
      resolveModelDimensions("some-org/unknown-embed:v9", {
        baseUrl: "http://localhost:1234/v1",
        fetchImpl,
      }),
    ).rejects.toThrow(/localhost:1234/);
  });

  test("an unknown model probes a reachable endpoint and reads embedding.length (Ollama shape)", async () => {
    let requestedUrl = "";
    const fetchImpl = (async (url: string) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ embedding: Array.from({ length: 384 }, () => 0) }));
    }) as unknown as typeof fetch;
    const dims = await resolveModelDimensions("some-org/unknown-embed:v9", {
      baseUrl: "http://localhost:11434",
      embedPath: "/api/embed",
      fetchImpl,
    });
    expect(dims).toBe(384);
    expect(requestedUrl).toBe("http://localhost:11434/api/embed");
  });

  test("an unknown model probes a reachable endpoint and reads data[0].embedding.length (OpenAI shape)", async () => {
    let requestedUrl = "";
    const fetchImpl = (async (url: string) => {
      requestedUrl = url;
      return new Response(
        JSON.stringify({ object: "list", data: [{ embedding: Array.from({ length: 768 }, () => 0) }] }),
      );
    }) as unknown as typeof fetch;
    const dims = await resolveModelDimensions("some-org/unknown-embed:v9", {
      baseUrl: "http://localhost:1234/v1",
      embedPath: "/embeddings",
      fetchImpl,
    });
    expect(dims).toBe(768);
    // A base URL that already carries a path (`/v1`) must keep it — the join
    // is plain concatenation, never `new URL(path, baseUrl)`, which silently
    // drops any existing path on an absolute second argument.
    expect(requestedUrl).toBe("http://localhost:1234/v1/embeddings");
  });

  test("a non-JSON probe response throws, naming the model", async () => {
    const fetchImpl = (async () => new Response("not json")) as unknown as typeof fetch;
    await expect(
      resolveModelDimensions("some-org/unknown-embed:v9", {
        baseUrl: "http://localhost:1234/v1",
        fetchImpl,
      }),
    ).rejects.toThrow(/some-org\/unknown-embed:v9/);
  });

  test("an unrecognized response shape throws, naming the model", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ ok: true }))) as unknown as typeof fetch;
    await expect(
      resolveModelDimensions("some-org/unknown-embed:v9", {
        baseUrl: "http://localhost:1234/v1",
        fetchImpl,
      }),
    ).rejects.toThrow(/some-org\/unknown-embed:v9/);
  });

  // Live check (LIP-04 AC, measured against a running LM Studio): the merged
  // known-table path above already returns 768 for this exact model without
  // touching the network. This test instead forces the *probe* branch (by
  // omitting the known-table entry) to prove the live embed call itself also
  // yields 768 — i.e. the mechanism, not just the literal, is correct.
  // Skipped when LM Studio is not reachable (CI has none running).
  test.skipIf(!lmStudioReachable)(
    "LIVE: probing the real LM Studio embed endpoint for an unknown-to-us model yields 768",
    async () => {
      const dims = await resolveModelDimensions("text-embedding-nomic-embed-text-v1.5", {
        baseUrl: LMSTUDIO_URL,
        embedPath: "/embeddings",
        // No knownDimensions passed — forces the live probe branch even
        // though this model IS in INFERENCE_PROVIDERS.lmstudio.knownDimensions.
      });
      expect(dims).toBe(768);
    },
    30_000,
  );
});
