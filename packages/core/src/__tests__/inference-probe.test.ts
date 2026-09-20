import { afterEach, describe, expect, test } from "bun:test";
import { INFERENCE_PROVIDERS } from "@massa-ai/shared/inference-providers";
import { probeProvider } from "../kernel/inference-probe";
import fixtures from "./fixtures/inference-probe-bodies.json";

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

describe("probeProvider — body shape, never status", () => {
  test("LM Studio's 200-with-error body yields reachable:false against the ollama spec", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(fixtures.lmStudioUnknownEndpointError, 200),
      )) as typeof fetch;

    const result = await probeProvider(INFERENCE_PROVIDERS.ollama, "http://localhost:11434");

    expect(result).toEqual({ reachable: false, reason: "wrong-shape" });
  });

  test("LM Studio's 200-with-error body yields reachable:false against its own spec", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(fixtures.lmStudioUnknownEndpointError, 200),
      )) as typeof fetch;

    const result = await probeProvider(INFERENCE_PROVIDERS.lmstudio, "http://localhost:1234/v1");

    expect(result).toEqual({ reachable: false, reason: "wrong-shape" });
  });

  test("the LM Studio probe accepts {data:[...]} and reports the model ids", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse(fixtures.lmStudioModelList, 200))) as typeof fetch;

    const result = await probeProvider(INFERENCE_PROVIDERS.lmstudio, "http://localhost:1234/v1");

    expect(result).toEqual({
      reachable: true,
      models: ["text-embedding-nomic-embed-text-v1.5"],
    });
  });

  test("the LM Studio probe rejects the ollama {models:[...]} shape even at 200", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse(fixtures.ollamaModelList, 200))) as typeof fetch;

    const result = await probeProvider(INFERENCE_PROVIDERS.lmstudio, "http://localhost:1234/v1");

    expect(result).toEqual({ reachable: false, reason: "wrong-shape" });
  });

  test("the ollama probe accepts {models:[...]} and reports the model names", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse(fixtures.ollamaModelList, 200))) as typeof fetch;

    const result = await probeProvider(INFERENCE_PROVIDERS.ollama, "http://localhost:11434");

    expect(result).toEqual({ reachable: true, models: ["qwen3-embedding:4b"] });
  });

  test("a network error yields reachable:false with reason unreachable", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError("fetch failed"))) as typeof fetch;

    const result = await probeProvider(INFERENCE_PROVIDERS.ollama, "http://localhost:11434");

    expect(result).toEqual({ reachable: false, reason: "unreachable" });
  });

  test("a timeout (abort) yields reachable:false with reason unreachable", async () => {
    globalThis.fetch = (() => {
      const err = new DOMException("The operation was aborted.", "AbortError");
      return Promise.reject(err);
    }) as typeof fetch;

    const result = await probeProvider(INFERENCE_PROVIDERS.ollama, "http://localhost:11434", 10);

    expect(result).toEqual({ reachable: false, reason: "unreachable" });
  });

  test("a non-JSON body yields reachable:false with reason non-json", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("<html>not json</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )) as typeof fetch;

    const result = await probeProvider(INFERENCE_PROVIDERS.ollama, "http://localhost:11434");

    expect(result).toEqual({ reachable: false, reason: "non-json" });
  });

  test("probes ollama at /api/tags and lmstudio at /v1/models", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = ((url: string) => {
      requestedUrls.push(url);
      return Promise.resolve(jsonResponse(fixtures.ollamaModelList, 200));
    }) as typeof fetch;

    await probeProvider(INFERENCE_PROVIDERS.ollama, "http://localhost:11434");
    await probeProvider(INFERENCE_PROVIDERS.lmstudio, "http://localhost:1234/v1");

    expect(requestedUrls).toEqual([
      "http://localhost:11434/api/tags",
      "http://localhost:1234/v1/models",
    ]);
  });
});
