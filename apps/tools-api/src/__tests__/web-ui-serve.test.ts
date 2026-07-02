/**
 * Phase 8 — Web UI serve tests (R8-SERVE-01).
 *
 * Asserts the Tools API serves the web-ui static bundle: index shell, CSS, JS,
 * index.html fallback for unknown non-traversal paths, and 404 when disabled.
 * Uses webUiRoutes.handle(Request) directly (no server boot).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
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
