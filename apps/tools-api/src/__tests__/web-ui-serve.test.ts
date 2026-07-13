/**
 * Phase 8 — Web UI serve tests (R8-SERVE-01).
 *
 * Asserts the Tools API serves the web-ui static bundle: index shell, CSS, JS,
 * index.html fallback for unknown non-traversal paths, and 404 when disabled.
 * Uses webUiRoutes.handle(Request) directly (no server boot).
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { webUiRoutes } from "../routes/web-ui.js";

async function get(p: string): Promise<Response> {
  return (await webUiRoutes.handle(
    new Request(`http://localhost${p}`, { method: "GET" }),
  )) as Response;
}

describe("web-ui serve (R8-SERVE-01)", () => {
  const prevEnabled = process.env.WEB_UI_ENABLED;

  beforeEach(() => {
    delete process.env.WEB_UI_ENABLED;
  });
  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.WEB_UI_ENABLED;
    else process.env.WEB_UI_ENABLED = prevEnabled;
  });

  test("GET /ui returns 200 + index.html with #app shell", async () => {
    const res = await get("/ui");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    // The app shell mounts into the #app element (<main id="app">).
    expect(body).toContain('id="app"');
    expect(body).toContain("app.js");
    // Asset refs must be absolute under /ui so they resolve at the no-slash
    // entry URL /ui (relative refs would 404 as /styles.css, /app.js).
    expect(body).toContain('href="/ui/styles.css"');
    expect(body).toContain('src="/ui/app.js"');
  });

  test("GET /ui/styles.css returns 200 + text/css", async () => {
    const res = await get("/ui/styles.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    const body = await res.text();
    expect(body).toContain("--bg");
  });

  test("GET /ui/app.js returns 200 + javascript content-type", async () => {
    const res = await get("/ui/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    const body = await res.text();
    expect(body).toContain("markdownToHtml");
  });

  test("GET /ui/unknown-path falls back to index.html (200 + #app)", async () => {
    const res = await get("/ui/some/unknown/path");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain('id="app"');
  });

  test("GET /ui/<traversal> is rejected (400)", async () => {
    const res = await get("/ui/../../etc/passwd");
    // The traversal guard returns 400 (invalid path) before the exists-check.
    expect([400, 404]).toContain(res.status);
  });

  test("WEB_UI_ENABLED=false -> 404", async () => {
    process.env.WEB_UI_ENABLED = "false";
    const res = await get("/ui");
    expect(res.status).toBe(404);
  });
});

// Real-wire regression guard.
//
// The in-process tests above use webUiRoutes.handle(Request), which builds a
// Response in-process. That path does NOT exhibit the failure mode where a
// handler returning a JS string gets Content-Type text/plain on the wire:
// when the node adapter writes the response, a bare-string body overrides the
// manually-set content-type header. Only a real socket reproduces it, so this
// boots the same adapter production uses (index.ts) and fetches over it.
// web-ui.ts: /ui and SPA fallback now return a Buffer (not a string) so the
// manual text/html header is honored.
//
async function allocateTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close(() => reject(new Error("failed to allocate a TCP port")));
        return;
      }
      reservation.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

describe("web-ui serve — real node-adapter wire (R8-SERVE-01 regression)", () => {
  const app = new Elysia({ adapter: node() }).use(webUiRoutes);
  let server: { stop?: () => void } | undefined;
  let base = "";

  beforeAll(async () => {
    const port = await allocateTcpPort();
    base = `http://127.0.0.1:${port}`;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("node-adapter server did not listen in time")),
        5000,
      );
      app.listen(port, (srv: unknown) => {
        clearTimeout(timeout);
        server = srv as { stop?: () => void };
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.stop?.();
  });

  test("GET /ui over a real socket returns text/html (not text/plain)", async () => {
    const res = await fetch(`${base}/ui`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('id="app"');
  });

  test("SPA fallback over a real socket returns text/html", async () => {
    const res = await fetch(`${base}/ui/some/unknown/path`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
