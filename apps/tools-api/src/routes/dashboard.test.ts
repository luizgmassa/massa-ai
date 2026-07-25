/**
 * Dashboard route coverage (mocked). Covers the jobs mapping (per-field
 * projection) and the graceful-degradation catch blocks for both endpoints.
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const status = mock(() => ({
  running: true,
  tickIntervalMs: 30000,
  jobs: [
    {
      id: "j1",
      name: "etl",
      jobKind: "etl",
      enabled: true,
      nextRunAt: 100,
      lastRunAt: 50,
      due: true,
      currentlyRunning: false,
    },
  ],
}));

const queue = { pendingCount: 3, maxPendingCount: 256, saturated: false };

mock.module("@massa-ai/core/services", () => ({
  getScheduler: () => ({ status }),
  resetScheduler: () => {},
}));

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    getHookService: () => ({ queue, resetHookService: () => {} }),
  };
});

import { dashboardRoutes } from "./dashboard.js";
const app = new Elysia().use(dashboardRoutes);

async function get(path: string) {
  const res = await app.handle(new Request(`http://localhost${path}`));
  return { status: res.status, json: (await res.json()) as any };
}

describe("GET /api/v1/scheduler/status", () => {
  test("projects each job field", async () => {
    status.mockImplementationOnce(() => ({
      running: true,
      tickIntervalMs: 1000,
      jobs: [
        { id: "a", name: "n", jobKind: "etl", enabled: false, nextRunAt: 1, lastRunAt: 2, due: false, currentlyRunning: true },
      ],
    }));
    const res = await get("/api/v1/scheduler/status");
    expect(res.status).toBe(200);
    const job = res.json.jobs[0];
    expect(job).toMatchObject({
      id: "a",
      name: "n",
      jobKind: "etl",
      enabled: false,
      nextRunAt: 1,
      lastRunAt: 2,
      due: false,
      currentlyRunning: true,
      lastSuccessAt: null,
      consecutiveFailures: 0,
    });
  });

  test("degrades gracefully when scheduler throws", async () => {
    status.mockImplementationOnce(() => {
      throw new Error("scheduler gone");
    });
    const res = await get("/api/v1/scheduler/status");
    expect(res.json).toMatchObject({ running: false, tickIntervalMs: 0, jobs: [], unavailable: true });
    expect(res.json.error).toBe("scheduler gone");
  });
});

describe("GET /api/v1/hooks/queue-status", () => {
  test("returns queue depth", async () => {
    const res = await get("/api/v1/hooks/queue-status");
    expect(res.json).toEqual({ pendingCount: 3, maxPending: 256, saturated: false });
  });
});

describe("queue-status graceful degradation", () => {
  test("degrades when getHookService throws", async () => {
    // Re-mock core to throw on getHookService for this test by overriding queue
    // access indirectly: status() path already covered; here force queue throw.
    Object.defineProperty(queue, "pendingCount", {
      get() {
        throw new Error("boom");
      },
      configurable: true,
    });
    const res = await get("/api/v1/hooks/queue-status");
    expect(res.json).toMatchObject({ pendingCount: 0, maxPending: 0, saturated: false, unavailable: true });
    expect(res.json.error).toBe("boom");
    // restore
    Object.defineProperty(queue, "pendingCount", { value: 3, configurable: true, writable: true });
  });
});
