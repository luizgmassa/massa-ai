import { afterEach, describe, expect, jest, test } from "bun:test";
import {
  _setHeavyWorkRepositoryForTesting,
  probeHeavyWork,
  withHeavyWorkLease,
} from "../services/jobs/heavy-work-lease.js";
import type { ActiveManagedRun, ManagedRunLease } from "../data/managed-runs/managed-run-contract.js";

type BeginInput = { projectId: string; runKind: string; eventId: string };

function fakeRepo(overrides: Partial<Record<"begin" | "heartbeat" | "release" | "getAnyActive", (...args: any[]) => any>> = {}) {
  const calls = { begin: [] as BeginInput[], heartbeat: [] as ManagedRunLease[], release: [] as ManagedRunLease[] };
  const repo = {
    async begin(input: BeginInput) {
      calls.begin.push(input);
      if (overrides.begin) return overrides.begin(input);
      const lease: ManagedRunLease = {
        runId: "1",
        projectId: input.projectId,
        runKind: input.runKind as ManagedRunLease["runKind"],
        leaseToken: "token",
        leaseExpiresAt: Date.now() + 90_000,
        eventId: input.eventId,
      };
      return { status: "acquired" as const, lease };
    },
    async heartbeat(lease: ManagedRunLease) {
      calls.heartbeat.push(lease);
      return { status: "renewed" as const, leaseExpiresAt: Date.now() + 90_000 };
    },
    async release(lease: ManagedRunLease) {
      calls.release.push(lease);
      if (overrides.release) return overrides.release(lease);
      return { status: "aborted" as const, runId: lease.runId };
    },
    async getAnyActive(): Promise<ActiveManagedRun | null> {
      return overrides.getAnyActive ? overrides.getAnyActive() : null;
    },
  };
  _setHeavyWorkRepositoryForTesting(repo as any);
  return calls;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

afterEach(() => {
  jest.useRealTimers();
  _setHeavyWorkRepositoryForTesting(null);
});

describe("withHeavyWorkLease", () => {
  test("holds a sentinel-keyed lease for the duration of fn and releases it", async () => {
    const calls = fakeRepo();
    let releasedDuringFn = -1;
    const value = await withHeavyWorkLease("maintenance", "project-reset:alpha", async () => {
      releasedDuringFn = calls.release.length;
      return 42;
    });
    expect(value).toBe(42);
    expect(releasedDuringFn).toBe(0);
    expect(calls.begin).toHaveLength(1);
    expect(calls.begin[0]!.runKind).toBe("maintenance");
    expect(calls.begin[0]!.projectId).toMatch(/^heavy-work:project-reset:alpha:[0-9a-f-]{36}$/);
    expect(calls.release).toHaveLength(1);
    expect(calls.release[0]!.projectId).toBe(calls.begin[0]!.projectId);
  });

  test("uses a fresh sentinel per call so concurrent calls never collide", async () => {
    const calls = fakeRepo();
    await Promise.all([
      withHeavyWorkLease("reindex", "same", async () => {}),
      withHeavyWorkLease("reindex", "same", async () => {}),
    ]);
    expect(new Set(calls.begin.map((c) => c.projectId)).size).toBe(2);
  });

  test("releases the lease and rethrows fn's error unchanged", async () => {
    const calls = fakeRepo();
    const boom = new Error("boom");
    await expect(withHeavyWorkLease("maintenance", "x", async () => { throw boom; })).rejects.toBe(boom);
    expect(calls.release).toHaveLength(1);
  });

  test("runs fn without a lease when begin throws", async () => {
    const calls = fakeRepo({ begin: () => { throw new Error("db down"); } });
    await expect(withHeavyWorkLease("maintenance", "x", async () => "ran")).resolves.toBe("ran");
    expect(calls.release).toHaveLength(0);
  });

  test("runs fn without a lease when begin reports busy", async () => {
    const calls = fakeRepo({ begin: () => ({ status: "busy", activeRunId: "9", leaseExpiresAt: Date.now() }) });
    await expect(withHeavyWorkLease("maintenance", "x", async () => "ran")).resolves.toBe("ran");
    expect(calls.release).toHaveLength(0);
  });

  test("a failing release does not change fn's result", async () => {
    fakeRepo({ release: () => { throw new Error("release failed"); } });
    await expect(withHeavyWorkLease("maintenance", "x", async () => "ok")).resolves.toBe("ok");
  });

  test("heartbeats every 30 s while fn runs and stops afterwards", async () => {
    const calls = fakeRepo();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    jest.useFakeTimers();
    const run = withHeavyWorkLease("reindex", "slow", () => gate);
    await flushMicrotasks();
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(31_000);
      await flushMicrotasks();
    }
    expect(calls.heartbeat.length).toBe(3);
    finish();
    await run;
    const afterRun = calls.heartbeat.length;
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(31_000);
      await flushMicrotasks();
    }
    expect(calls.heartbeat.length).toBe(afterRun);
  });
});

describe("probeHeavyWork", () => {
  test("reports idle when no run is live", async () => {
    fakeRepo();
    expect(await probeHeavyWork()).toEqual({ busy: false });
  });

  test("reports busy with the live run as the reason", async () => {
    fakeRepo({
      getAnyActive: () => ({ runId: "7", projectId: "proj-a", runKind: "indexing" }),
    });
    expect(await probeHeavyWork()).toEqual({ busy: true, reason: "indexing run 7 (proj-a)" });
  });

  test("rejects when the query outlives the timeout", async () => {
    fakeRepo({ getAnyActive: () => new Promise(() => {}) });
    jest.useFakeTimers();
    const probe = probeHeavyWork();
    const settled = probe.then(() => "resolved", (e: Error) => e.message);
    jest.advanceTimersByTime(5_001);
    expect(await settled).toMatch(/timed out after 5000ms/);
  });
});
