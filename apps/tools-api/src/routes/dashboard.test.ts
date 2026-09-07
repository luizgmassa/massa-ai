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
        {
          id: "a",
          name: "n",
          jobKind: "etl",
          enabled: false,
          nextRunAt: 1,
          lastRunAt: 2,
          lastSuccessAt: 900,
          lastFailureAt: null,
          consecutiveFailures: 0,
          lastError: null,
          due: false,
          currentlyRunning: true,
        },
      ],
    }));
    const res = await get("/api/v1/scheduler/status");
    expect(res.status).toBe(200);
    const job = res.json.jobs[0];
    expect(job).toEqual({
      id: "a",
      name: "n",
      jobKind: "etl",
      enabled: false,
      nextRunAt: 1,
      lastRunAt: 2,
      // Read from the snapshot, not written as literals. The previous version
      // of this test asserted `lastSuccessAt: null, consecutiveFailures: 0`
      // against a stub carrying neither field — it passed only because the
      // route hardcoded both, so the sensor encoded the defect as the contract.
      lastSuccessAt: 900,
      lastFailureAt: null,
      consecutiveFailures: 0,
      lastError: null,
      due: false,
      currentlyRunning: true,
    });
  });

  test("a failing job is distinguishable from a healthy one (EB-SCH-3b)", async () => {
    // This is the case the literals made unrepresentable: over HTTP, a job that
    // had failed five ticks in a row looked exactly like one that had never
    // failed. Both jobs below are returned in the same snapshot, so the
    // assertion fails if either is flattened to a constant.
    status.mockImplementationOnce(() => ({
      running: true,
      tickIntervalMs: 1000,
      jobs: [
        {
          id: "healthy",
          name: "h",
          jobKind: "decay-sweep",
          enabled: true,
          nextRunAt: 10,
          lastRunAt: 9,
          lastSuccessAt: 9,
          lastFailureAt: null,
          consecutiveFailures: 0,
          lastError: null,
          due: false,
          currentlyRunning: false,
        },
        {
          id: "failing",
          name: "f",
          jobKind: "auto-improve",
          enabled: true,
          nextRunAt: 10,
          lastRunAt: 9,
          lastSuccessAt: null,
          lastFailureAt: 9,
          consecutiveFailures: 5,
          lastError: "handler threw",
          due: false,
          currentlyRunning: false,
        },
      ],
    }));
    const res = await get("/api/v1/scheduler/status");
    const [healthy, failing] = res.json.jobs;

    expect(healthy.lastSuccessAt).toBe(9);
    expect(healthy.consecutiveFailures).toBe(0);
    expect(healthy.lastError).toBeNull();

    expect(failing.lastSuccessAt).toBeNull();
    expect(failing.lastFailureAt).toBe(9);
    expect(failing.consecutiveFailures).toBe(5);
    expect(failing.lastError).toBe("handler threw");

    // The two must differ on the health axis. A literal projection makes this
    // impossible, which is the whole defect.
    expect(failing.consecutiveFailures).not.toBe(healthy.consecutiveFailures);
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
