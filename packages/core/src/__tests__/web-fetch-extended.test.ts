/**
 * Web fetcher extended coverage tests.
 *
 * Covers: readCappedBody no-stream path, empty body, indexChunk error,
 * JSON scalar (string/number/boolean), HTML empty markdown, markdown slicing,
 * invalid JSON treated as text, classification edge cases.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchAndConvertOne,
  composeFetchCacheKey,
  MAX_FETCH_BYTES,
  type IndexedChunk,
  type WebIndexDeps,
} from "../services/web/fetcher.js";
import { setDnsResolver } from "../services/web/index.js";

function captureDeps(): {
  deps: WebIndexDeps & { chunks: IndexedChunk[] };
  chunks: IndexedChunk[];
  cache: Map<string, number>;
} {
  const chunks: IndexedChunk[] = [];
  const cache = new Map<string, number>();
  const deps = {
    chunks,
    indexChunk: async (c: IndexedChunk) => { chunks.push(c); },
    getLastIndexedAt: (k: string) => cache.get(k) ?? null,
    markIndexed: (k: string, ts: number) => { cache.set(k, ts); },
  };
  return { deps, chunks, cache };
}

function stubFetch(responder: (url: string) => Response): {
  restore: () => void;
  calls: string[];
} {
  const orig = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: any) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return Promise.resolve(responder(url));
  }) as any;
  return {
    calls,
    restore: () => { globalThis.fetch = orig; },
  };
}

function stubDnsPublic(): () => void {
  return setDnsResolver(async () => [{ address: "93.184.216.34" }]);
}

describe("fetcher — extended coverage", () => {
  let dnsRestore: () => void;
  beforeEach(() => { dnsRestore = stubDnsPublic(); });
  afterEach(() => dnsRestore());

  test("HTTP error status → error result", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("not found", { status: 404 }));
    try {
      const r = await fetchAndConvertOne("https://err.example/", deps);
      expect(r.kind).toBe("error");
      if (r.kind !== "error") return;
      expect(r.error).toMatch(/HTTP 404/);
    } finally {
      fetchStub.restore();
    }
  });

  test("empty body → error result", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("   ", {
      headers: { "content-type": "text/plain" },
    }));
    try {
      const r = await fetchAndConvertOne("https://empty.example/", deps);
      expect(r.kind).toBe("error");
      if (r.kind !== "error") return;
      expect(r.error).toBe("empty body");
    } finally {
      fetchStub.restore();
    }
  });

  test("indexChunk error → error result with chunk id", async () => {
    const { deps } = captureDeps();
    deps.indexChunk = async () => { throw new Error("index write failed"); };
    const fetchStub = stubFetch(() => new Response("<html><body><p>hi</p></body></html>", {
      headers: { "content-type": "text/html" },
    }));
    try {
      const r = await fetchAndConvertOne("https://idxerr.example/", deps);
      expect(r.kind).toBe("error");
      if (r.kind !== "error") return;
      expect(r.error).toMatch(/indexing failed/);
    } finally {
      fetchStub.restore();
    }
  });

  test("JSON scalar string → single chunk with $ label", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response('"hello world"', {
      headers: { "content-type": "application/json" },
    }));
    try {
      const r = await fetchAndConvertOne("https://json-str.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks.length).toBe(1);
      expect(r.chunks[0].metadata?.label).toBe("$");
    } finally {
      fetchStub.restore();
    }
  });

  test("JSON number → single chunk", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("42", {
      headers: { "content-type": "application/json" },
    }));
    try {
      const r = await fetchAndConvertOne("https://json-num.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks.length).toBe(1);
    } finally {
      fetchStub.restore();
    }
  });

  test("JSON boolean → single chunk", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("true", {
      headers: { "content-type": "application/json" },
    }));
    try {
      const r = await fetchAndConvertOne("https://json-bool.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks.length).toBe(1);
    } finally {
      fetchStub.restore();
    }
  });

  test("invalid JSON (despite content-type) → treated as text", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("{not valid json", {
      headers: { "content-type": "application/json" },
    }));
    try {
      const r = await fetchAndConvertOne("https://badjson.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks.length).toBe(1);
    } finally {
      fetchStub.restore();
    }
  });

  test("JSON object with no leaves → single text chunk", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("{}", {
      headers: { "content-type": "application/json" },
    }));
    try {
      const r = await fetchAndConvertOne("https://empty-obj.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks.length).toBe(1);
    } finally {
      fetchStub.restore();
    }
  });

  test("HTML → empty markdown → no chunks", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("<html><head><style></style></head><body></body></html>", {
      headers: { "content-type": "text/html" },
    }));
    try {
      const r = await fetchAndConvertOne("https://empty-html.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks.length).toBe(0);
    } finally {
      fetchStub.restore();
    }
  });

  test("fetch error (non-SSRF) → error result", async () => {
    const { deps } = captureDeps();
    const orig = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error("network error"))) as any;
    try {
      const r = await fetchAndConvertOne("https://neterr.example/", deps);
      expect(r.kind).toBe("error");
      if (r.kind !== "error") return;
      expect(r.error).toMatch(/fetch failed/);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("no-stream body (text fallback path) returns content", async () => {
    const { deps } = captureDeps();
    // Create a response with no body stream (already drained)
    const resp = new Response("plain text content", {
      headers: { "content-type": "text/plain" },
    });
    const orig = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(resp)) as any;
    try {
      const r = await fetchAndConvertOne("https://nostream.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.contentType).toBe("text");
      expect(r.chunks.length).toBe(1);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("large body via text fallback (no stream, exceeds cap) → error", async () => {
    const { deps } = captureDeps();
    const big = "x".repeat(MAX_FETCH_BYTES + 100);
    // Create a response-like object with no streaming body
    const fakeResp = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain" }),
      body: undefined, // no stream → forces text fallback
      text: async () => big,
    };
    const orig = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(fakeResp)) as any;
    try {
      const r = await fetchAndConvertOne("https://big-text.example/", deps);
      expect(r.kind).toBe("error");
      if (r.kind !== "error") return;
      expect(r.error).toMatch(/exceeds cap/);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("content-type with +json suffix → classified as json", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response('{"a":1}', {
      headers: { "content-type": "application/vnd.api+json" },
    }));
    try {
      const r = await fetchAndConvertOne("https://api-json.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.contentType).toBe("json");
    } finally {
      fetchStub.restore();
    }
  });

  test("content-type xhtml → classified as html", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("<html><body><p>x</p></body></html>", {
      headers: { "content-type": "application/xhtml+xml" },
    }));
    try {
      const r = await fetchAndConvertOne("https://xhtml.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.contentType).toBe("html");
    } finally {
      fetchStub.restore();
    }
  });

  test("projectId option scopes chunks", async () => {
    const { deps } = captureDeps();
    const fetchStub = stubFetch(() => new Response("text", {
      headers: { "content-type": "text/plain" },
    }));
    try {
      const r = await fetchAndConvertOne("https://scoped.example/", deps, {
        projectId: "custom-pid",
      });
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks[0].metadata?.projectId).toBe("custom-pid");
    } finally {
      fetchStub.restore();
    }
  });

  test("markIndexed is called after successful index", async () => {
    const { deps, cache } = captureDeps();
    const fetchStub = stubFetch(() => new Response("content", {
      headers: { "content-type": "text/plain" },
    }));
    try {
      await fetchAndConvertOne("https://marked.example/", deps, { source: "test" });
      const cacheKey = composeFetchCacheKey("test", "https://marked.example/");
      expect(cache.has(cacheKey)).toBe(true);
    } finally {
      fetchStub.restore();
    }
  });

  test("cache hit when getLastIndexedAt returns null/undefined → not cached", async () => {
    const { deps } = captureDeps();
    deps.getLastIndexedAt = () => null;
    const fetchStub = stubFetch(() => new Response("content", {
      headers: { "content-type": "text/plain" },
    }));
    try {
      const r = await fetchAndConvertOne("https://nocache.example/", deps);
      expect(r.kind).toBe("fetched"); // not cached → fetched
    } finally {
      fetchStub.restore();
    }
  });

  test("force=true bypasses cache even when fresh", async () => {
    const { deps, cache } = captureDeps();
    const fetchStub = stubFetch(() => new Response("content", {
      headers: { "content-type": "text/plain" },
    }));
    try {
      // First fetch to populate cache
      await fetchAndConvertOne("https://force-test.example/", deps, { source: "s" });
      // Force re-fetch
      const r = await fetchAndConvertOne("https://force-test.example/", deps, {
        source: "s", force: true,
      });
      expect(r.kind).toBe("fetched");
    } finally {
      fetchStub.restore();
    }
  });

  test("large markdown → sliced into multiple chunks", async () => {
    const { deps } = captureDeps();
    // Build an HTML page with enough content to exceed 7500 chars
    const bigParagraph = "<p>" + "content ".repeat(1000) + "</p>";
    const html = "<html><body>" + bigParagraph + "</body></html>";
    const fetchStub = stubFetch(() => new Response(html, {
      headers: { "content-type": "text/html" },
    }));
    try {
      const r = await fetchAndConvertOne("https://big-md.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks.length).toBeGreaterThan(1);
    } finally {
      fetchStub.restore();
    }
  });

  test("JSON object with no extractable key-path chunks → text fallback", async () => {
    const { deps } = captureDeps();
    // An object with only nested empty objects → jsonToKeyPathChunks returns []
    const fetchStub = stubFetch(() => new Response('{"a":{"b":null}}', {
      headers: { "content-type": "application/json" },
    }));
    try {
      const r = await fetchAndConvertOne("https://json-empty.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks.length).toBeGreaterThanOrEqual(1);
    } finally {
      fetchStub.restore();
    }
  });

  test("text fallback (no stream body) within cap → returns text", async () => {
    const { deps } = captureDeps();
    const fakeResp = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain" }),
      body: undefined, // no stream → text fallback
      text: async () => "small text content",
    };
    const orig = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(fakeResp)) as any;
    try {
      const r = await fetchAndConvertOne("https://small-text.example/", deps);
      expect(r.kind).toBe("fetched");
      if (r.kind !== "fetched") return;
      expect(r.chunks[0].content).toContain("small text content");
    } finally {
      globalThis.fetch = orig;
    }
  });
});