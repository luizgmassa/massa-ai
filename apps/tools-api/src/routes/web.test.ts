/**
 * Web route coverage. POST /api/v1/web/fetch_and_index lazily resolves stores
 * into a WebController + FetchAndIndexTool, serialized via initPromise. Two
 * sequential requests cover the cached-tool fast path.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const handle = mock((): unknown => ({ success: true, data: { indexed: 1 } }));
const instantiate = mock((_opts?: unknown) => {});
let instance: any = null;

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    getVectorStore: async () => ({ name: "vec" }),
    getKeywordSearch: () => ({ name: "kw" }),
    WebController: Object.assign(
      class {
        static instantiate(opts: unknown) {
          instantiate(opts);
          instance = opts;
        }
        static getInstance() {
          return {
            fetchAndIndex: async () => ({ ok: true }),
          };
        }
      },
      {},
    ),
    FetchAndIndexTool: class {
      handle = handle;
    },
  };
});

import { webRoutes } from "./web.js";
const app = new Elysia().use(webRoutes);

async function post(body: unknown) {
  const res = await app.handle(
    new Request("http://localhost/api/v1/web/fetch_and_index", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/web/fetch_and_index", () => {
  test("first request lazily initializes + delegates", async () => {
    handle.mockImplementationOnce(() => ({ success: true, data: { urls: 1 } }));
    const res = await post({ url: "https://example.com", source: "ex" });
    expect(res.status).toBe(200);
    expect(res.json.data.urls).toBe(1);
    expect(instantiate).toHaveBeenCalledTimes(1);
  });

  test("second request reuses the cached tool (no re-init)", async () => {
    handle.mockImplementationOnce(() => ({ success: true, data: { cached: true } }));
    const res = await post({ url: "https://example.com/2" });
    expect(res.json.data.cached).toBe(true);
    expect(instantiate).toHaveBeenCalledTimes(1);
  });

  test("accepts the multi-request shape", async () => {
    handle.mockImplementationOnce(() => ({ success: true, data: { ok: 1 } }));
    const res = await post({
      requests: [{ url: "https://a.com" }, { url: "https://b.com", source: "b" }],
      concurrency: 2,
    });
    expect(res.status).toBe(200);
  });
});
