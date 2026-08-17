/**
 * T2 — the write-mode gate, over a real socket (HPC-03, AC-03.1/.3.3a/.5/.6/.7/.8/.9).
 *
 * `write-mode-classification.test.ts` proves T1's per-route classification
 * in-process via `app.handle(Request)`. That harness cannot prove `{ as:
 * "global" }` actually reaches across a plugin boundary — every route it
 * exercises is `.use()`d onto the SAME top-level `Elysia` instance in the
 * SAME file the classification lives in. This file proves T2's own wiring
 * instead: `writeModeMiddleware` is registered on one Elysia instance, and
 * the routes it gates (`executorRoutes`, `handoffRoutes`, `searchRoutes`) are
 * three separate, real plugin instances `.use()`d in afterward — mirroring
 * exactly how `index.ts` composes the real app. `auth-http.test.ts`
 * establishes this "boot the real node adapter, fetch over TCP" harness for
 * `authMiddleware`; this file copies it rather than inventing a second one,
 * per the task brief.
 *
 * Mock boundary: `@massa-ai/core` (ExecutorController, getHandoffService,
 * SearchProjectTool) and `@massa-ai/shared` (config, logger) — the same
 * package edge every `routes/*.test.ts` and `write-mode-classification.test.ts`
 * mocks at. Nothing here touches PostgreSQL or a live model.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const execute = mock((): unknown => ({ success: true, data: { stdout: "ok" } }));
const executeFile = mock((): unknown => ({ success: true, data: { stdout: "f" } }));
const batchExecute = mock((): unknown => ({ success: true, data: { results: [] } }));
const handoffListPending = mock(async (): Promise<unknown[]> => []);
const handoffBegin = mock(async (): Promise<unknown> => ({ ok: true }));
const handoffAccept = mock(async (): Promise<unknown> => ({ ok: true }));
const handoffCancel = mock(async (): Promise<unknown> => ({ ok: true }));
const searchProjectHandle = mock((body?: unknown): unknown => ({ success: true, data: {}, receivedBody: body }));

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
    getHandoffService: () => ({
      listPending: handoffListPending,
      begin: handoffBegin,
      accept: handoffAccept,
      cancel: handoffCancel,
    }),
    SearchProjectTool: class {
      handle = searchProjectHandle;
    },
  };
});

// Deliberately not falling back to a real config read — matching
// write-mode-classification.test.ts's own established pattern. `undefined`
// resolves `handoffsDisabled()` to `false` (not disabled), keeping the 423
// gate out of the way without touching the real config singleton.
mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    config: { get: () => undefined },
    logger: { ...actual.logger, error: () => {}, warn: () => {}, info: () => {} },
  };
});

import { writeModeMiddleware, __setReadOnlyModeAccessorForTests } from "./write-mode.js";
import { executorRoutes } from "../routes/executor.js";
import { handoffRoutes } from "../routes/handoff.js";
import { searchRoutes } from "../routes/search.js";

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

// Same registration shape as index.ts: writeModeMiddleware registered BEFORE
// the route plugins it gates. executorRoutes / handoffRoutes / searchRoutes
// are three separate Elysia instances — a request reaching any of them only
// proves `{ as: "global" }` if the middleware was never `.use()`d directly
// into that instance, which it isn't.
const app = new Elysia({ adapter: node() })
  .use(writeModeMiddleware)
  .use(executorRoutes)
  .use(handoffRoutes)
  .use(searchRoutes)
  // No non-GET route exists under a PUBLIC_PATHS prefix in production today
  // (auth.ts's PUBLIC_PATHS = /health, /swagger, /ui — every real /ui route
  // is GET-only). A stub is the only way to exercise AC-03.7 for a non-GET
  // request at all; it is mounted directly on the test's own app, the same
  // pattern `auth-http.test.ts` uses for its SEC-04 stub routes.
  .post("/ui/probe", () => ({ ok: true }));

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
  // `app.stop()` throws under the node adapter (measured elsewhere in this
  // tree); the listen callback's own server handle is the supported path.
  server?.stop?.();
  __setReadOnlyModeAccessorForTests(undefined);
});

function post(path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("write-mode gate — read-only mode OFF (AC-03.6)", () => {
  test("an unclassified write route behaves exactly as today: no 403", async () => {
    __setReadOnlyModeAccessorForTests(() => false);
    execute.mockClear();
    const res = await post("/api/v1/executor/execute", { language: "python", code: "print(1)" });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  }, 15_000);
});

describe("write-mode gate — read-only mode ON, across plugin boundaries (AC-03.1, AC-03.2, AC-03.5)", () => {
  test("an unclassified write route (a DIFFERENT plugin than write-mode's own) is refused with 403", async () => {
    __setReadOnlyModeAccessorForTests(() => true);
    execute.mockClear();
    const res = await post("/api/v1/executor/execute", { language: "python", code: "print(1)" });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("read-only");
    // The handler must never have run — this is what "refused", not merely
    // "reported", means.
    expect(execute).not.toHaveBeenCalled();
  }, 15_000);

  test("a classified read-only route (/handoff/list, yet another plugin) still passes", async () => {
    __setReadOnlyModeAccessorForTests(() => true);
    handoffListPending.mockClear();
    const res = await post("/api/v1/handoff/list", { projectId: "p1" });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(handoffListPending).toHaveBeenCalledTimes(1);
  }, 15_000);

  test("a public path still passes for a non-GET request (AC-03.7)", async () => {
    __setReadOnlyModeAccessorForTests(() => true);
    const res = await post("/ui/probe", {});
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  }, 15_000);
});

describe("write-mode gate — read-only mode OFF leaves public and classified routes unaffected too", () => {
  test("read-only OFF: classified route still 200s (sanity — off means off everywhere)", async () => {
    __setReadOnlyModeAccessorForTests(() => false);
    handoffListPending.mockClear();
    const res = await post("/api/v1/handoff/list", { projectId: "p1" });
    expect(res.status).toBe(200);
  }, 15_000);
});

describe("write-mode gate — fail-closed config read (AC-03.8)", () => {
  test("a throwing config accessor still yields 403, never lets the write through", async () => {
    __setReadOnlyModeAccessorForTests(() => {
      throw new Error("config read boom");
    });
    execute.mockClear();
    const res = await post("/api/v1/executor/execute", { language: "python", code: "print(1)" });
    expect(res.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  }, 15_000);

  test("a throwing config accessor does not block a classified read-only route", async () => {
    // Fail-closed means "treat read-only mode as active", which the
    // classification still exempts — it must not become "block everything".
    __setReadOnlyModeAccessorForTests(() => {
      throw new Error("config read boom");
    });
    handoffListPending.mockClear();
    const res = await post("/api/v1/handoff/list", { projectId: "p1" });
    expect(res.status).toBe(200);
    expect(handoffListPending).toHaveBeenCalledTimes(1);
  }, 15_000);
});

describe("write-mode gate — trailing-slash normalisation (AC-03.9)", () => {
  test("/handoff/list/ is allowed exactly as /handoff/list is", async () => {
    __setReadOnlyModeAccessorForTests(() => true);
    handoffListPending.mockClear();
    const noSlash = await post("/api/v1/handoff/list", { projectId: "p1" });
    const withSlash = await post("/api/v1/handoff/list/", { projectId: "p1" });
    expect(noSlash.status).toBe(200);
    expect(withSlash.status).toBe(200);
    expect(handoffListPending).toHaveBeenCalledTimes(2);
  }, 15_000);
});

describe("write-mode gate — /search/project sanitizer neutralises autoReindex in place (AC-03.3a)", () => {
  test("read-only ON: autoReindex:true is forced to false before the tool sees it", async () => {
    __setReadOnlyModeAccessorForTests(() => true);
    searchProjectHandle.mockClear();
    const res = await post("/api/v1/search/project", {
      query: "q",
      projectId: "p1",
      projectPath: "/tmp/write-mode-fixture",
      autoReindex: true,
    });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(searchProjectHandle).toHaveBeenCalledTimes(1);
    const received = (searchProjectHandle.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(received.autoReindex).toBe(false);
  }, 15_000);

  test("read-only OFF: autoReindex:true reaches the tool unchanged (sanitizer is read-only-mode-scoped)", async () => {
    __setReadOnlyModeAccessorForTests(() => false);
    searchProjectHandle.mockClear();
    const res = await post("/api/v1/search/project", {
      query: "q",
      projectId: "p1",
      projectPath: "/tmp/write-mode-fixture",
      autoReindex: true,
    });
    expect(res.status).toBe(200);
    const received = (searchProjectHandle.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(received.autoReindex).toBe(true);
  }, 15_000);
});

// ── index.ts wiring (AC-03.1, AC-03.5) ───────────────────────────────────
//
// Every test above builds its own app and mounts `writeModeMiddleware`
// directly — proving the middleware's own cross-plugin behavior, but nothing
// above imports `index.ts` (an executable entrypoint with real startup side
// effects — binding a port, provisioning an API key — that cannot be
// imported from a test). A source-level check is therefore the only way to
// prove `index.ts` actually registers the gate; `startup-config.test.ts`
// establishes exactly this pattern for `authMiddleware`'s own registration,
// and this mirrors it. Deleting `.use(writeModeMiddleware)` from `index.ts`
// leaves every test above green (they never read `index.ts`) while turning
// this describe block red — that combination is what proves the mutation
// this file is meant to catch is a wiring omission, not a logic bug the
// harness-level tests already cover.
const INDEX_SOURCE = fs.readFileSync(path.join(import.meta.dir, "../index.ts"), "utf-8");

describe("index.ts wiring — writeModeMiddleware is registered (AC-03.1, AC-03.5)", () => {
  test("writeModeMiddleware is registered", () => {
    expect(INDEX_SOURCE).toContain(".use(writeModeMiddleware)");
  });

  test("writeModeMiddleware is registered immediately after authMiddleware, before every route plugin", () => {
    const authAt = INDEX_SOURCE.indexOf(".use(authMiddleware)");
    const writeModeAt = INDEX_SOURCE.indexOf(".use(writeModeMiddleware)");
    expect(authAt).toBeGreaterThan(-1);
    expect(writeModeAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(writeModeAt);
    for (const route of [
      ".use(searchRoutes)",
      ".use(memoryRoutes)",
      ".use(executorRoutes)",
      ".use(handoffRoutes)",
      ".use(proposalRoutes)",
      ".use(webUiRoutes)",
    ]) {
      const routeAt = INDEX_SOURCE.indexOf(route);
      expect(routeAt).toBeGreaterThan(-1);
      expect(writeModeAt).toBeLessThan(routeAt);
    }
  });
});
