/**
 * The browser client's half of SEC-05 (T6 / TASK-006).
 *
 * The server stamps the key into the page for a trusted caller; this asserts
 * the client picks it up and sends it, and — just as important — that it sends
 * nothing when the tag is absent, so an untrusted page issues no authenticated
 * call rather than a stream of 401s.
 */

import { describe, it, expect } from "bun:test";

await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const { createApiClient, readInjectedApiKey } = UI as {
  createApiClient: (opts: any) => { request: (path: string, init?: any) => Promise<any> };
  readInjectedApiKey: (doc: any) => string | null;
};

function fakeDocument(metaContent: string | null | undefined, name = "massa-ai-api-key") {
  return {
    querySelector(selector: string) {
      if (selector !== `meta[name="${name}"]`) return null;
      if (metaContent === undefined) return null;
      return { getAttribute: (attr: string) => (attr === "content" ? metaContent : null) };
    },
  };
}

function recordingFetch() {
  const calls: Array<{ url: string; init: any }> = [];
  const fetchImpl = async (url: string, init: any) => {
    calls.push({ url, init });
    return {
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
      text: async () => "ok",
    };
  };
  return { calls, fetchImpl };
}

describe("readInjectedApiKey", () => {
  it("reads the key the server stamped into the page", () => {
    expect(readInjectedApiKey(fakeDocument("abc123"))).toBe("abc123");
  });

  it("trims surrounding whitespace", () => {
    expect(readInjectedApiKey(fakeDocument("  abc123\n"))).toBe("abc123");
  });

  it("returns null when the tag is absent", () => {
    expect(readInjectedApiKey(fakeDocument(undefined))).toBeNull();
  });

  it("treats an empty or blank content attribute as no key", () => {
    expect(readInjectedApiKey(fakeDocument(""))).toBeNull();
    expect(readInjectedApiKey(fakeDocument("   "))).toBeNull();
  });

  it("never throws on a missing or hostile document", () => {
    expect(readInjectedApiKey(null)).toBeNull();
    expect(readInjectedApiKey(undefined)).toBeNull();
    expect(readInjectedApiKey({})).toBeNull();
    expect(
      readInjectedApiKey({
        querySelector() {
          throw new Error("no DOM");
        },
      }),
    ).toBeNull();
  });
});

describe("createApiClient request headers", () => {
  it("sends x-api-key on a GET when the page carries a key", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const api = createApiClient({ fetch: fetchImpl, document: fakeDocument("abc123") });
    await api.request("/api/v1/memory/list");
    expect(calls[0]!.init.headers["x-api-key"]).toBe("abc123");
  });

  it("sends x-api-key alongside content-type on a POST", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const api = createApiClient({ fetch: fetchImpl, document: fakeDocument("abc123") });
    await api.request("/api/v1/search/project", { method: "POST", body: { q: "x" } });
    expect(calls[0]!.init.headers["x-api-key"]).toBe("abc123");
    expect(calls[0]!.init.headers["content-type"]).toBe("application/json");
    expect(calls[0]!.init.body).toBe(JSON.stringify({ q: "x" }));
  });

  it("omits the header entirely when the page carries no key", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const api = createApiClient({ fetch: fetchImpl, document: fakeDocument(undefined) });
    await api.request("/api/v1/memory/list");
    // Preserves the pre-existing shape: no headers at all on a bodiless GET.
    expect(calls[0]!.init.headers).toBeUndefined();
  });

  it("omits the key but keeps content-type on an unauthenticated POST", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const api = createApiClient({ fetch: fetchImpl, document: fakeDocument(undefined) });
    await api.request("/api/v1/search/project", { method: "POST", body: { q: "x" } });
    expect(calls[0]!.init.headers["x-api-key"]).toBeUndefined();
    expect(calls[0]!.init.headers["content-type"]).toBe("application/json");
  });

  it("an explicit apiKey option overrides the page", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const api = createApiClient({
      fetch: fetchImpl,
      document: fakeDocument("from-page"),
      apiKey: "explicit",
    });
    await api.request("/api/v1/memory/list");
    expect(calls[0]!.init.headers["x-api-key"]).toBe("explicit");
  });

  it("an explicit null apiKey suppresses the page key", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const api = createApiClient({
      fetch: fetchImpl,
      document: fakeDocument("from-page"),
      apiKey: null,
    });
    await api.request("/api/v1/memory/list");
    expect(calls[0]!.init.headers).toBeUndefined();
  });
});
