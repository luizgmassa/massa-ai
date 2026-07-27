/**
 * SEC-01 over a real socket (T3 / TASK-003).
 *
 * `auth.test.ts` covers the same middleware through `app.handle(Request)`, which
 * builds a Response in-process. That path does not exercise the node adapter's
 * wire behavior — the documented content-type override on bare-string bodies
 * lives there, and so does anything else the adapter does to a response on its
 * way out. The spec requires SEC-01/02/05 to be proven against a booted server,
 * so this file boots the same adapter production uses and fetches over TCP.
 *
 * The executor routes are the reason this requirement is P1: they run arbitrary
 * code as the process user and were reachable with no credential at all. They
 * are mounted here for real, in the order `index.ts` mounts them, so the test
 * proves the middleware actually gates them rather than proving it gates a stub
 * that happens to share their path.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

// Keep the executor from running anything. The controller is stubbed, not the
// route: the route, its schema, and its path are the real ones.
const execute = mock((): unknown => ({ success: true, data: { stdout: "ok" } }));
const executeFile = mock((): unknown => ({ success: true, data: { stdout: "f" } }));
const batchExecute = mock((): unknown => ({ success: true, data: { results: [] } }));

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    ExecutorController: Object.assign(
      class {
        static getInstance() {
          return { execute, executeFile, batchExecute };
        }
      },
      {},
    ),
  };
});

import { authMiddleware, __setAuthKeyForTests } from "./auth.js";
import { executorRoutes } from "../routes/executor.js";
import { webUiRoutes } from "../routes/web-ui.js";

const API_KEY = "booted-server-test-key";

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

// Same registration order as index.ts: authMiddleware BEFORE the routes it
// guards. Registering it after would silently serve everything.
const app = new Elysia({ adapter: node() })
  .use(authMiddleware)
  .use(executorRoutes)
  .use(webUiRoutes)
  .get("/health", () => ({ status: "ok" }))
  .get("/swagger", () => "docs")
  .get("/api/v1/search", () => ({ data: "results" }))
  // Decoy routes. Elysia runs onBeforeHandle only after a route matches, so an
  // unregistered path 404s before auth is consulted and would prove nothing.
  // These exist so the assertion is about the public-path matcher: under the
  // former bare `startsWith`, every one of them would answer 200.
  .get("/uixyz", () => ({ leaked: true }))
  .get("/ui-admin", () => ({ leaked: true }))
  .get("/healthz", () => ({ leaked: true }))
  .get("/swaggerui", () => ({ leaked: true }));

let server: { stop?: () => void } | undefined;
let base = "";

beforeAll(async () => {
  __setAuthKeyForTests(API_KEY);
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
  __setAuthKeyForTests(undefined);
});

const EXECUTOR_ROUTES: Array<[string, unknown]> = [
  ["/api/v1/executor/execute", { language: "python", code: "print(1)" }],
  ["/api/v1/executor/execute_file", { path: "a.ts", language: "typescript", code: "x" }],
  ["/api/v1/executor/batch_execute", { commands: ["ls"] }],
];

function post(path: string, body: unknown, key?: string) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { "x-api-key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("SEC-01 over a real socket — executor routes", () => {
  test.each(EXECUTOR_ROUTES)("POST %s without a key returns 401", async (path, body) => {
    const res = await post(path as string, body);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("Unauthorized");
    // The handler must not have run.
    expect(execute).not.toHaveBeenCalled();
    expect(executeFile).not.toHaveBeenCalled();
    expect(batchExecute).not.toHaveBeenCalled();
  }, 15_000);

  test.each(EXECUTOR_ROUTES)("POST %s with a wrong key returns 401", async (path, body) => {
    const res = await post(path as string, body, "not-the-key");
    expect(res.status).toBe(401);
  }, 15_000);

  test.each(EXECUTOR_ROUTES)("POST %s with the key is not rejected", async (path, body) => {
    const res = await post(path as string, body, API_KEY);
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  }, 15_000);
});

describe("SEC-01 over a real socket — other guarded routes", () => {
  test("GET /api/v1/search without a key returns 401", async () => {
    const res = await fetch(`${base}/api/v1/search`);
    expect(res.status).toBe(401);
  }, 15_000);

  test("GET /api/v1/search with the key returns 200", async () => {
    const res = await fetch(`${base}/api/v1/search`, { headers: { "x-api-key": API_KEY } });
    expect(res.status).toBe(200);
  }, 15_000);
});

describe("SEC-01 over a real socket — public paths", () => {
  test.each(["/health", "/swagger", "/ui", "/ui/app.js", "/ui/styles.css"])(
    "GET %s is reachable with no key",
    async (path) => {
      const res = await fetch(`${base}${path}`);
      expect(res.status).not.toBe(401);
      expect(res.status).toBe(200);
    },
    15_000,
  );

  test("GET /ui over a real socket still returns text/html", async () => {
    // Guards the documented adapter behavior: a bare-string body would come
    // back as text/plain here while looking correct in-process.
    const res = await fetch(`${base}/ui`);
    expect(res.headers.get("content-type")).toContain("text/html");
  }, 15_000);

  test.each(["/uixyz", "/ui-admin", "/healthz", "/swaggerui"])(
    "GET %s is NOT exempted by the public-path prefixes",
    async (path) => {
      // Registered above, so a 401 here is the matcher rejecting them rather
      // than the router failing to find them.
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(401);
      const json = (await res.json()) as { leaked?: boolean };
      expect(json.leaked).toBeUndefined();
    },
    15_000,
  );
});
