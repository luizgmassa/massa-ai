/**
 * diagnose.ts — pure-helper coverage.
 *
 * diagnose is a live-stack diagnostic (it probes the configured inference
 * provider + PostgreSQL at module load). Those probes require a live
 * provider API and a live database, so `checkProvider` / `checkPostgres`'s
 * bodies are out of scope for the unit suite. The clearly-pure helpers —
 * DATABASE_URL credential masking, URL candidate construction, provider
 * selection, exact model matching, and the provider-dispatched embedding
 * response parser (T19 / LIP-10, LIP-03 site 2 of 5) — are exported and
 * tested here.
 */
import { afterEach, describe, test, expect } from "bun:test";
import {
  maskDatabaseUrl,
  providerCandidates,
  resolveProviderId,
  resolveProviderBaseUrl,
  resolveModelName,
  modelIsAvailable,
  parseEmbeddingResponse,
  detectProviderUrl,
} from "../diagnose";
import { INFERENCE_PROVIDERS } from "../../packages/shared/src/config/inference-providers";

describe("maskDatabaseUrl", () => {
  test("masks credentials while preserving host, port, and database", () => {
    const masked = maskDatabaseUrl(
      "postgresql://user:secret@db.example.com:5433/massa_ai_test",
    );
    expect(masked).toBe("postgres://****:****@db.example.com:5433/massa_ai_test");
    // credentials never leak
    expect(masked).not.toContain("user");
    expect(masked).not.toContain("secret");
  });

  test("omits the port segment when none is present", () => {
    expect(maskDatabaseUrl("postgres://u:p@host/db")).toBe(
      "postgres://****:****@host/db",
    );
  });

  test("reports 'unknown' database when the URL has no path", () => {
    expect(maskDatabaseUrl("postgres://u:p@host:5433/")).toBe(
      "postgres://****:****@host:5433/unknown",
    );
  });

  test("falls back to regex masking for an un-parseable value", () => {
    const masked = maskDatabaseUrl("not a url //user:pass@host/");
    // invalid URL -> catch -> regex replace the //...@ segment
    expect(masked).toContain("****:****");
    expect(masked).not.toContain("user:pass");
  });
});

describe("providerCandidates", () => {
  test("a localhost URL yields both localhost and 127.0.0.1 variants", async () => {
    const candidates = await providerCandidates("http://localhost:11434");
    expect(candidates[0]).toBe("http://localhost:11434");
    expect(candidates).toContain("http://127.0.0.1:11434");
  });

  test("a non-localhost URL is returned as-is (plus any resolv.conf nameserver)", async () => {
    const candidates = await providerCandidates("http://ollama.example:11434");
    expect(candidates[0]).toBe("http://ollama.example:11434");
    // localhost variant must NOT be added for a non-localhost input
    expect(candidates).not.toContain("http://127.0.0.1:11434");
  });

  test("never throws and always returns at least the input URL", async () => {
    const candidates = await providerCandidates("http://localhost:11434");
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  // LIP-03/LIP-10 — the WSL2 nameserver arm used to hardcode `:11434` and drop
  // the path, so under LM Studio it probed a port the provider does not listen
  // on. `resolvConf` is injected here so the arm is exercised off WSL2 rather
  // than depending on the host having an /etc/resolv.conf at all.
  const RESOLV = "nameserver 172.20.16.1\n";

  test("the WSL2 candidate keeps the LM Studio port and /v1 path, not Ollama's :11434", async () => {
    const candidates = await providerCandidates("http://localhost:1234/v1", RESOLV);
    expect(candidates).toContain("http://172.20.16.1:1234/v1");
    expect(candidates.some((c) => c.includes(":11434"))).toBe(false);
  });

  test("the WSL2 candidate for a pathless Ollama URL gains no trailing slash", async () => {
    // The probe concatenates its own `/api/tags`, so a trailing slash here
    // would produce a double slash rather than a working URL.
    const candidates = await providerCandidates("http://localhost:11434", RESOLV);
    expect(candidates).toContain("http://172.20.16.1:11434");
    expect(candidates.some((c) => c.endsWith("/"))).toBe(false);
  });

  test("every candidate shares the configured URL's port and path", async () => {
    for (const envUrl of ["http://localhost:1234/v1", "http://localhost:11434"]) {
      const candidates = await providerCandidates(envUrl, RESOLV);
      const { port, pathname } = new URL(envUrl);
      // Anti-vacuity: all three arms must be present, or the loop below could
      // pass over a single candidate that is trivially the input itself.
      expect(candidates.length).toBe(3);
      for (const candidate of candidates) {
        const url = new URL(candidate);
        expect(url.port).toBe(port);
        expect(url.pathname).toBe(pathname || "/");
      }
    }
  });
});

describe("resolveProviderId — EMBEDDING_PROVIDER env > config.json > ollama (LIP-10)", () => {
  test("EMBEDDING_PROVIDER=lmstudio wins over config.json", () => {
    expect(
      resolveProviderId({ EMBEDDING_PROVIDER: "lmstudio" }, { provider: "ollama" }),
    ).toBe("lmstudio");
  });

  test("no env var falls back to config.json's embedding.provider", () => {
    expect(resolveProviderId({}, { provider: "lmstudio" })).toBe("lmstudio");
  });

  test("neither env nor file defaults to ollama", () => {
    expect(resolveProviderId({}, undefined)).toBe("ollama");
  });

  test("an unknown provider value never resolves to lmstudio", () => {
    expect(resolveProviderId({ EMBEDDING_PROVIDER: "mistral" }, undefined)).toBe("ollama");
  });
});

describe("resolveProviderBaseUrl", () => {
  test("provider-specific env var wins", () => {
    expect(
      resolveProviderBaseUrl(
        "lmstudio",
        { LMSTUDIO_BASE_URL: "http://lms-host:1234/v1" },
        undefined,
      ),
    ).toBe("http://lms-host:1234/v1");
  });

  test("config.json's baseURL applies only when its provider matches", () => {
    expect(
      resolveProviderBaseUrl("lmstudio", {}, { provider: "lmstudio", baseURL: "http://cfg:1234/v1" }),
    ).toBe("http://cfg:1234/v1");
    // an ollama-provider file entry must not leak its baseURL to lmstudio
    expect(
      resolveProviderBaseUrl("lmstudio", {}, { provider: "ollama", baseURL: "http://cfg:11434" }),
    ).toBe(INFERENCE_PROVIDERS.lmstudio.defaultEmbeddingBaseUrl);
  });

  test("falls back to the provider's default base URL", () => {
    expect(resolveProviderBaseUrl("ollama", {}, undefined)).toBe(
      INFERENCE_PROVIDERS.ollama.defaultEmbeddingBaseUrl,
    );
  });
});

describe("resolveModelName", () => {
  test("provider-specific env var wins", () => {
    expect(
      resolveModelName("lmstudio", { LMSTUDIO_EMBEDDING_MODEL: "custom-model" }, undefined),
    ).toBe("custom-model");
  });

  test("config.json's model applies only when its provider matches", () => {
    expect(
      resolveModelName("lmstudio", {}, { provider: "lmstudio", model: "cfg-model" }),
    ).toBe("cfg-model");
  });

  test("falls back to the per-provider default", () => {
    expect(resolveModelName("ollama", {}, undefined)).toBe("qwen3-embedding:4b");
    expect(resolveModelName("lmstudio", {}, undefined)).toBe(
      "text-embedding-nomic-embed-text-v1.5",
    );
  });
});

describe("modelIsAvailable — exact match, never a substring (LIP-03)", () => {
  test("an exact id matches", () => {
    expect(modelIsAvailable(["qwen3-embedding:4b"], "qwen3-embedding:4b")).toBe(true);
  });

  test("a longer sibling id sharing the target as a substring does not match", () => {
    // the defect this replaces: `.includes()` made `qwen3-embedding:4b`
    // read as present just because `qwen3-embedding:4b-instruct` was.
    expect(modelIsAvailable(["qwen3-embedding:4b-instruct"], "qwen3-embedding:4b")).toBe(false);
  });

  test("a shorter prefix of the target does not match", () => {
    expect(modelIsAvailable(["qwen3-embedding"], "qwen3-embedding:4b")).toBe(false);
  });

  test("an absent model does not match", () => {
    expect(modelIsAvailable(["bge-m3:latest"], "qwen3-embedding:4b")).toBe(false);
  });
});

describe("parseEmbeddingResponse — provider-dispatched shape (LIP-10, LIP-03 site 2 of 5)", () => {
  test("ollama's batch shape { embeddings: number[][] }", () => {
    expect(parseEmbeddingResponse("ollama", { embeddings: [[0.1, 0.2, 0.3]] })).toEqual([
      0.1, 0.2, 0.3,
    ]);
  });

  test("ollama's legacy singular shape { embedding: number[] }", () => {
    expect(parseEmbeddingResponse("ollama", { embedding: [0.1, 0.2] })).toEqual([0.1, 0.2]);
  });

  test("LM Studio's OpenAI-compatible { data: [{ embedding }] } shape", () => {
    expect(
      parseEmbeddingResponse("lmstudio", { data: [{ embedding: [0.4, 0.5, 0.6] }] }),
    ).toEqual([0.4, 0.5, 0.6]);
  });

  test("the ollama shape does not satisfy the lmstudio parser — the defect this replaces", () => {
    // Before this change, the single reader (`data.embeddings?.[0] ??
    // data.embedding`) applied to an LM Studio body silently returned
    // undefined instead of the real vector at `data.data[0].embedding`.
    expect(parseEmbeddingResponse("lmstudio", { embeddings: [[0.1, 0.2]] })).toBeNull();
  });

  test("the lmstudio shape does not satisfy the ollama parser", () => {
    expect(parseEmbeddingResponse("ollama", { data: [{ embedding: [0.1, 0.2] }] })).toBeNull();
  });

  test("a non-object body yields null", () => {
    expect(parseEmbeddingResponse("ollama", null)).toBeNull();
  });
});

describe("detectProviderUrl — body shape, never HTTP status (discriminating check, LIP-03)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  test("a 200 response carrying an error body is reported unreachable — the old response.ok path could not do this", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse({ error: "Unexpected endpoint" }, 200))) as typeof fetch;

    const result = await detectProviderUrl(INFERENCE_PROVIDERS.lmstudio, [
      "http://localhost:1234/v1",
    ]);

    expect(result).toBeNull();
  });

  test("a real model list at 200 is reported reachable with its models", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse({ data: [{ id: "text-embedding-nomic-embed-text-v1.5" }] }, 200),
      )) as typeof fetch;

    const result = await detectProviderUrl(INFERENCE_PROVIDERS.lmstudio, [
      "http://localhost:1234/v1",
    ]);

    expect(result).toEqual({
      url: "http://localhost:1234/v1",
      models: ["text-embedding-nomic-embed-text-v1.5"],
    });
  });

  test("falls through to the next candidate when the first is unreachable", async () => {
    let call = 0;
    globalThis.fetch = ((_url: string) => {
      call += 1;
      if (call === 1) return Promise.reject(new TypeError("fetch failed"));
      return Promise.resolve(jsonResponse({ models: [{ name: "qwen3-embedding:4b" }] }, 200));
    }) as typeof fetch;

    const result = await detectProviderUrl(INFERENCE_PROVIDERS.ollama, [
      "http://localhost:11434",
      "http://127.0.0.1:11434",
    ]);

    expect(result).toEqual({
      url: "http://127.0.0.1:11434",
      models: ["qwen3-embedding:4b"],
    });
  });
});
