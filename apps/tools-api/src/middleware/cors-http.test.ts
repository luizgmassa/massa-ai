/**
 * SEC-02 over a real socket (T4 / TASK-004).
 *
 * CORS is enforced by the browser, so the only thing the server controls is
 * which headers it emits. That makes the response headers the entire contract,
 * and headers are exactly what an in-process `app.handle()` call is least
 * trustworthy about — the node adapter is what actually writes them. Two
 * servers are booted here: one with no allowlist (the default) and one with an
 * explicit allowlist.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";
import { buildCorsOptions } from "../startup-config.js";

const ALLOWED = "http://localhost:5173";
const FOREIGN = "https://evil.test";

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

async function boot(origins: string[]) {
  const app = new Elysia({ adapter: node() })
    .use(cors(buildCorsOptions(origins)))
    .get("/api/v1/ping", () => ({ ok: true }));

  const port = await allocateTcpPort();
  const server = await new Promise<{ stop?: () => void }>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("node-adapter server did not listen in time")),
      5000,
    );
    app.listen(port, (srv: unknown) => {
      clearTimeout(timeout);
      resolve(srv as { stop?: () => void });
    });
  });

  return { base: `http://127.0.0.1:${port}`, server };
}

let closed: { base: string; server: { stop?: () => void } };
let allowlisted: { base: string; server: { stop?: () => void } };

beforeAll(async () => {
  closed = await boot([]);
  allowlisted = await boot([ALLOWED]);
});

afterAll(() => {
  closed?.server?.stop?.();
  allowlisted?.server?.stop?.();
});

describe("SEC-02 — default (no allowlist configured)", () => {
  test("a foreign Origin gets no Access-Control-Allow-Origin", async () => {
    // Bare cors() reflected the request Origin here, which is what let any page
    // a developer had open call the local API and read the response.
    const res = await fetch(`${closed.base}/api/v1/ping`, { headers: { Origin: FOREIGN } });
    const allowOrigin = res.headers.get("access-control-allow-origin");
    expect(allowOrigin).not.toBe(FOREIGN);
    expect(allowOrigin).toBeNull();
  }, 15_000);

  test("no Access-Control-Allow-Credentials is emitted", async () => {
    const res = await fetch(`${closed.base}/api/v1/ping`, { headers: { Origin: FOREIGN } });
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  }, 15_000);

  test("a preflight for a foreign Origin is not granted", async () => {
    const res = await fetch(`${closed.base}/api/v1/ping`, {
      method: "OPTIONS",
      headers: {
        Origin: FOREIGN,
        "access-control-request-method": "POST",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  }, 15_000);

  test("same-origin requests are unaffected", async () => {
    // The dashboard at /ui is same-origin; blocking cross-origin must not
    // break it.
    const res = await fetch(`${closed.base}/api/v1/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  }, 15_000);
});

describe("SEC-02 — explicit allowlist", () => {
  test("an allow-listed Origin is echoed back exactly", async () => {
    const res = await fetch(`${allowlisted.base}/api/v1/ping`, { headers: { Origin: ALLOWED } });
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(res.status).toBe(200);
  }, 15_000);

  test("an Origin outside the allowlist is not echoed back", async () => {
    const res = await fetch(`${allowlisted.base}/api/v1/ping`, { headers: { Origin: FOREIGN } });
    expect(res.headers.get("access-control-allow-origin")).not.toBe(FOREIGN);
  }, 15_000);

  test("a near-miss Origin is not matched by prefix or suffix", async () => {
    for (const origin of [
      "http://localhost:5173.evil.test",
      "http://evil.test?x=http://localhost:5173",
      "http://localhost:51730",
    ]) {
      const res = await fetch(`${allowlisted.base}/api/v1/ping`, { headers: { Origin: origin } });
      expect(res.headers.get("access-control-allow-origin")).not.toBe(origin);
    }
  }, 15_000);
});
