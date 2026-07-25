import { afterEach, describe, expect, test } from "bun:test";
import { ApiClient, ApiHttpError } from "./api-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ApiClient HTTP transport", () => {
  test("sends GET, POST, PATCH, and DELETE with API-key authentication and JSON bodies", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string, init: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new ApiClient({
      baseUrl: "https://tools.example",
      apiKey: "test-api-key",
      maxRetries: 0,
    });

    await client.get("/items", { query: "value", omitted: undefined });
    await client.post("/items", { value: "created" });
    await client.patch("/items/item-1", { value: "updated" });
    await client.delete("/items/item-1", { reason: "done" });

    expect(requests.map(({ url }) => url)).toEqual([
      "https://tools.example/items?query=value",
      "https://tools.example/items",
      "https://tools.example/items/item-1",
      "https://tools.example/items/item-1",
    ]);
    expect(requests.map(({ init }) => init?.method)).toEqual([
      "GET",
      "POST",
      "PATCH",
      "DELETE",
    ]);
    expect(requests.map(({ init }) => init?.headers)).toEqual([
      { "Content-Type": "application/json", "X-API-Key": "test-api-key" },
      { "Content-Type": "application/json", "X-API-Key": "test-api-key" },
      { "Content-Type": "application/json", "X-API-Key": "test-api-key" },
      { "Content-Type": "application/json", "X-API-Key": "test-api-key" },
    ]);
    expect(requests.map(({ init }) => init?.body)).toEqual([
      undefined,
      JSON.stringify({ value: "created" }),
      JSON.stringify({ value: "updated" }),
      JSON.stringify({ reason: "done" }),
    ]);
  });

  test("retains parsed REST error envelopes with status", async () => {
    const envelope = {
      success: false,
      error: { code: "SESSION_EXPIRED", message: "Session expired" },
    };
    globalThis.fetch = (async () => new Response(JSON.stringify(envelope), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;

    const client = new ApiClient({ baseUrl: "https://tools.example", maxRetries: 0 });
    const error = await client.get("/expired").catch((caught) => caught);

    if (!(error instanceof ApiHttpError)) throw error;
    expect(error).toBeInstanceOf(ApiHttpError);
    expect(error.status).toBe(410);
    expect(error.body).toEqual(envelope);
  });

  test("replaces non-JSON upstream errors with a generic envelope", async () => {
    globalThis.fetch = (async () => new Response("<html>proxy secret</html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    })) as unknown as typeof fetch;

    const client = new ApiClient({ baseUrl: "https://tools.example", maxRetries: 0 });
    const error = await client.get("/broken").catch((caught) => caught);

    if (!(error instanceof ApiHttpError)) throw error;
    expect(error).toBeInstanceOf(ApiHttpError);
    expect(error.status).toBe(502);
    expect(error.body).toEqual({
      success: false,
      error: "Upstream API request failed",
    });
  });

  test("uploadAndIndex POSTs to /api/v1/project/upload-and-index with the full payload", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string, init: RequestInit) => {
      captured.push({ url: String(input), init });
      return new Response(JSON.stringify({ success: true, jobId: "job-1" }), {
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new ApiClient({ baseUrl: "https://tools.example", maxRetries: 0 });
    const params = {
      projectPath: "/proj",
      projectId: "p1",
      forceReindex: true,
      warmCache: false,
      warmupQueries: ["a"],
      files: [{ relativePath: "a.ts", content: "x" }],
    };
    const result = await client.uploadAndIndex(params);

    expect(captured[0]!.url).toBe("https://tools.example/api/v1/project/upload-and-index");
    expect(captured[0]!.init?.method).toBe("POST");
    expect(JSON.parse(captured[0]!.init!.body as string)).toEqual(params);
    expect(result).toEqual({ success: true, jobId: "job-1" });
  });

  test("healthCheck returns true when /health responds ok", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: string) => {
      urls.push(String(input));
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const client = new ApiClient({ baseUrl: "https://tools.example", maxRetries: 0 });
    const ok = await client.healthCheck();
    expect(ok).toBe(true);
    expect(urls).toEqual(["https://tools.example/health"]);
  });

  test("healthCheck returns false when fetch throws (network failure)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const client = new ApiClient({ baseUrl: "https://tools.example", maxRetries: 0 });
    const ok = await client.healthCheck();
    expect(ok).toBe(false);
  });

  test("healthCheck returns false on non-ok status", async () => {
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;

    const client = new ApiClient({ baseUrl: "https://tools.example", maxRetries: 0 });
    const ok = await client.healthCheck();
    expect(ok).toBe(false);
  });

  test("post throws ApiHttpError on non-2xx after exhausting retries", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, error: "nope" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;

    const client = new ApiClient({ baseUrl: "https://tools.example", maxRetries: 1 });
    const error = await client.post("/fail", { a: 1 }).catch((c) => c);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).status).toBe(500);
  });
});
