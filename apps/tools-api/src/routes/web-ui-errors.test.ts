/**
 * Web UI route error/edge-path coverage. The happy asset-serving paths are
 * covered by the __tests__/web-ui-*.suite. This file mocks fs/promises to
 * force: disabled flag, static-dir resolution failure, index.html missing,
 * path traversal, asset read failure, SPA fallback, and fallback miss.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

type StatResult = { isDirectory: () => boolean };
let statImpl: (p: string) => Promise<StatResult> = async () => ({ isDirectory: () => true });
let readFileImpl: (p: string) => Promise<Buffer> = async (p) => {
  if (p.endsWith("index.html")) return Buffer.from("<html>shell</html>");
  if (p.endsWith("app.js")) return Buffer.from("console.log(1)");
  throw new Error("ENOENT");
};

mock.module("fs/promises", () => {
  const actual = require("fs/promises");
  const mocked = {
    ...actual,
    stat: (p: string) => statImpl(p),
    readFile: (p: string) => readFileImpl(p),
  };
  return { ...mocked, default: mocked };
});

import { Elysia } from "elysia";
const { webUiRoutes } = await import("./web-ui.js");
const app = new Elysia().use(webUiRoutes);

const origEnabled = process.env.WEB_UI_ENABLED;

async function get(path: string) {
  const res = await app.handle(new Request(`http://localhost${path}`));
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json body */
  }
  return { status: res.status, text, json, ct: res.headers.get("content-type") };
}

beforeEach(() => {
  process.env.WEB_UI_ENABLED = undefined;
  statImpl = async () => ({ isDirectory: () => true });
  readFileImpl = async (p) => {
    if (p.endsWith("index.html")) return Buffer.from("<html>shell</html>");
    if (p.endsWith("app.js")) return Buffer.from("console.log(1)");
    throw new Error("ENOENT");
  };
});

describe("GET /ui", () => {
  test("serves index.html shell", async () => {
    const res = await get("/ui");
    expect(res.status).toBe(200);
    expect(res.ct).toContain("text/html");
    expect(res.text).toContain("<html>");
  });

  test("404 when WEB_UI_ENABLED=false", async () => {
    process.env.WEB_UI_ENABLED = "false";
    const res = await get("/ui");
    expect(res.status).toBe(404);
    expect(res.json.error).toBe("web ui disabled");
  });

  test("500 when static dir cannot be resolved", async () => {
    statImpl = async () => {
      throw new Error("ENOENT");
    };
    const res = await get("/ui");
    expect(res.status).toBe(500);
    expect(res.json.error).toBe("web ui static dir not found");
  });

  test("500 when index.html is missing", async () => {
    readFileImpl = async () => {
      throw new Error("ENOENT");
    };
    const res = await get("/ui");
    expect(res.status).toBe(500);
    expect(res.json.error).toBe("index.html missing");
  });
});

describe("GET /ui/*", () => {
  test("disabled returns 404", async () => {
    process.env.WEB_UI_ENABLED = "0";
    const res = await get("/ui/app.js");
    expect(res.status).toBe(404);
  });

  test("500 when static dir cannot be resolved", async () => {
    statImpl = async () => {
      throw new Error("ENOENT");
    };
    const res = await get("/ui/app.js");
    expect(res.status).toBe(500);
  });

  test("path traversal is rejected with 400", async () => {
    const res = await get("/ui/..%2F..%2Fsecret");
    // Elysia decodes the wildcard; resolveSafePath detects the escape.
    expect([400, 404]).toContain(res.status);
  });

  test("serves a known asset with content-type", async () => {
    const res = await get("/ui/app.js");
    expect(res.status).toBe(200);
    expect(res.ct).toContain("javascript");
    expect(res.text).toContain("console.log");
  });

  test("500 when an existing asset fails to read", async () => {
    // stat succeeds (asset "exists") but readFile throws.
    statImpl = async (p) => {
      if (p.endsWith("broken.js")) return { isDirectory: () => false };
      return { isDirectory: () => true };
    };
    readFileImpl = async () => {
      throw new Error("disk error");
    };
    const res = await get("/ui/broken.js");
    expect(res.status).toBe(500);
    expect(res.json.error).toBe("read failed");
  });

  test("unknown non-traversal path falls back to index.html", async () => {
    // stat throws for the unknown asset path -> exists:false -> SPA fallback.
    statImpl = async (p) => {
      if (p.endsWith("deep-route")) throw new Error("ENOENT");
      return { isDirectory: () => true };
    };
    const res = await get("/ui/deep-route");
    expect(res.status).toBe(200);
    expect(res.ct).toContain("text/html");
  });

  test("fallback returns 404 when index.html is also missing", async () => {
    statImpl = async (p) => {
      if (p.endsWith("deep-route")) throw new Error("ENOENT");
      return { isDirectory: () => true };
    };
    readFileImpl = async () => {
      throw new Error("ENOENT");
    };
    const res = await get("/ui/deep-route");
    expect(res.status).toBe(404);
    expect(res.json.error).toBe("not found");
  });
});
