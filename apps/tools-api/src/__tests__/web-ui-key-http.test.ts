/**
 * SEC-05 over a real socket (T6 / TASK-006).
 *
 * `request.ip` only exists on a real connection, so this is the only place the
 * trust decision can actually be exercised. It also carries the tripwire for
 * TASK-000 finding 4: `request.ip` is an srvx implementation detail, not Elysia
 * public API. If a dependency bump removes it, the loopback check silently
 * starts failing closed and the dashboard stops loading data with no error —
 * the first test here turns that into a build failure instead.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "node:net";
import os from "node:os";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { webUiRoutes, API_KEY_META_NAME, ACCESS_META_NAME } from "../routes/web-ui.js";
import { __setAuthKeyForTests } from "../middleware/auth.js";

const API_KEY = "web-ui-injection-test-key";

function nonLoopbackIPv4(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

async function allocateTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "0.0.0.0", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close(() => reject(new Error("failed to allocate a TCP port")));
        return;
      }
      reservation.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

// Records what the handler actually saw, so the tripwire can assert on it.
let observedIp: unknown;

const app = new Elysia({ adapter: node() })
  .get("/probe-ip", ({ request }) => ({
    ip: (request as unknown as { ip?: string }).ip ?? null,
  }))
  .onRequest(({ request }) => {
    if (new URL(request.url).pathname.startsWith("/ui")) {
      observedIp = (request as unknown as { ip?: string }).ip;
    }
  })
  .use(webUiRoutes);

let server: { stop?: () => void } | undefined;
let port = 0;
const savedFlag = process.env.MASSA_AI_WEB_UI_TRUST_LOCAL;

beforeAll(async () => {
  delete process.env.MASSA_AI_WEB_UI_TRUST_LOCAL;
  __setAuthKeyForTests(API_KEY);
  port = await allocateTcpPort();
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
  __setAuthKeyForTests(undefined);
  if (savedFlag === undefined) delete process.env.MASSA_AI_WEB_UI_TRUST_LOCAL;
  else process.env.MASSA_AI_WEB_UI_TRUST_LOCAL = savedFlag;
});

describe("TASK-000 tripwire — request.ip still exists", () => {
  test("a booted node-adapter handler can read the peer address", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/probe-ip`);
    const body = (await res.json()) as { ip: string | null };
    // If this ever comes back null, SEC-05 has silently degraded to
    // "nobody is trusted" and the dashboard loads no data anywhere.
    expect(body.ip).not.toBeNull();
    expect(typeof body.ip).toBe("string");
    expect(body.ip).toMatch(/127\.0\.0\.1$|^::1$/);
  }, 15_000);
});

describe("SEC-05 — loopback caller", () => {
  test("GET /ui from 127.0.0.1 carries the API key meta tag", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ui`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain(`name="${API_KEY_META_NAME}"`);
    expect(html).toContain(API_KEY);
    expect(html).not.toContain("massa-ai-configure-access");
  }, 15_000);

  test("GET /ui from localhost (which resolves to ::1) also carries it", async () => {
    // The URL the README prints. ::1 and ::ffff:127.0.0.1 are different
    // strings, so a check written against one of them would fail here.
    const res = await fetch(`http://localhost:${port}/ui`);
    const html = await res.text();
    expect(html).toContain(API_KEY);
  }, 15_000);

  test("a deep link through the SPA fallback carries it too", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ui/memories/some-id`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(API_KEY);
  }, 15_000);

  test("static assets are served unchanged, without the key", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ui/app.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(API_KEY);
  }, 15_000);
});

describe("SEC-05 — non-loopback caller", () => {
  const lan = nonLoopbackIPv4();

  test.skipIf(lan === null)(
    "GET /ui from a non-loopback interface gets no key and a configure banner",
    async () => {
      const res = await fetch(`http://${lan}:${port}/ui`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toContain(API_KEY);
      expect(html).not.toContain(`name="${API_KEY_META_NAME}"`);
      expect(html).toContain(`name="${ACCESS_META_NAME}"`);
      expect(html).toContain("massa-ai-configure-access");
      // The address the server saw really was non-loopback.
      expect(typeof observedIp).toBe("string");
      expect(String(observedIp)).toContain(lan!);
    },
    15_000,
  );

  test("the non-loopback case is exercised, or the gap is recorded", () => {
    // Per TASK-000: check the non-loopback path where the environment allows,
    // otherwise record the gap rather than assume it.
    if (lan === null) {
      console.warn(
        "[web-ui-key-http] no non-loopback IPv4 interface available; " +
          "the untrusted-caller wire case was NOT exercised in this run.",
      );
    }
    expect(true).toBe(true);
  });
});
