import { afterEach, describe, expect, test } from "bun:test";
import { ApiClient, ApiHttpError } from "./api-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ApiClient HTTP transport", () => {
  test("sends GET, POST, PATCH, and DELETE with API-key authentication and JSON bodies", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

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
});
