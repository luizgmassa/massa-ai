/**
 * IndexJobTracker coverage — lifecycle, store-backed paths, reaper, eviction.
 *
 * Extends index-job-tracker-events.test.ts (which covers event publishing)
 * with the store-backed read/flush paths, heartbeat, reapStaleJobs, and
 * MAX_JOBS eviction logic.
 */

import { describe, expect, test } from "bun:test";
import { IndexJobTracker, type IndexJob } from "../services/jobs/index-job-tracker.js";
import { MemoryJobStore, type JobStore } from "../services/jobs/index-job-store-contract.js";

function makeJob(overrides: Partial<IndexJob> = {}): IndexJob {
  return {
    jobId: `job-${Math.random().toString(36).slice(2)}`,
    projectId: "proj-cov",
    projectPath: "/tmp/cov",
    status: "running",
    progress: { current: 0, total: 10, percentage: 0 },
    createdAt: new Date(),
    startedAt: new Date(),
    heartbeatAt: new Date(),
    ...overrides,
  };
}

/** Store whose listRunning returns a fixed set; used to drive the reaper. */
class FakeRunningStore implements JobStore {
  running: IndexJob[] = [];
  saved: IndexJob[] = [];
  flushCalled: string[] = [];
  save(job: IndexJob): void { this.saved.push(job); }
  get(id: string): IndexJob | null { return this.saved.find((j) => j.jobId === id) ?? null; }
  listByProject(projectId: string): IndexJob[] { return this.saved.filter((j) => j.projectId === projectId); }
  listAll(): IndexJob[] { return this.saved; }
  listRunning(): IndexJob[] { return [...this.running]; }
  markStaleRunningFailed(): number { return 0; }
  delete(): void { /* noop */ }
  async flush(jobId?: string): Promise<void> { this.flushCalled.push(jobId ?? "ALL"); }
}

describe("IndexJobTracker — store-backed coverage", () => {
  test("getJob lazy-loads from the store on a cache miss", () => {
    const store = new MemoryJobStore();
    const external = makeJob({ jobId: "external-job", projectId: "proj-x" });
    store.save(external);
    const tracker = new IndexJobTracker(store);
    // Not in tracker cache → loads from store.
    const loaded = tracker.getJob("external-job");
    expect(loaded).toBeDefined();
    expect(loaded!.jobId).toBe("external-job");
    // Now cached: subsequent get returns the cached object.
    const cached = tracker.getJob("external-job");
    expect(cached).toBe(loaded);
  });

  test("getJob returns undefined for unknown id even with a store", () => {
    const store = new MemoryJobStore();
    const tracker = new IndexJobTracker(store);
    expect(tracker.getJob("nope")).toBeUndefined();
  });

  test("getJob swallows store.get errors (best-effort)", () => {
    const failingStore: JobStore = {
      ...new MemoryJobStore(),
      get(): IndexJob | null { throw new Error("store down"); },
    };
    const tracker = new IndexJobTracker(failingStore);
    expect(tracker.getJob("anything")).toBeUndefined();
  });

  test("updateStatus falls back to getJob when job not in cache", () => {
    const store = new MemoryJobStore();
    const external = makeJob({ jobId: "status-job", status: "pending" });
    store.save(external);
    const tracker = new IndexJobTracker(store);
    tracker.updateStatus("status-job", "running");
    const job = tracker.getJob("status-job");
    expect(job!.status).toBe("running");
    expect(job!.startedAt).toBeDefined();
    expect(job!.heartbeatAt).toBeDefined();
  });

  test("updateStatus is a no-op for an unknown job", () => {
    const tracker = new IndexJobTracker(undefined);
    expect(() => tracker.updateStatus("ghost", "running")).not.toThrow();
  });

  test("updateProgress falls back to getJob and updates percentage", () => {
    const store = new MemoryJobStore();
    const external = makeJob({ jobId: "prog-job", status: "running" });
    store.save(external);
    const tracker = new IndexJobTracker(store);
    tracker.updateProgress("prog-job", 5, 10);
    expect(tracker.getJob("prog-job")!.progress).toEqual({ current: 5, total: 10, percentage: 50 });
  });

  test("updateProgress handles total=0 (no division by zero)", () => {
    const tracker = new IndexJobTracker(undefined);
    const job = tracker.createJob("p", "/p");
    tracker.updateStatus(job.jobId, "running");
    tracker.updateProgress(job.jobId, 0, 0);
    expect(tracker.getJob(job.jobId)!.progress.percentage).toBe(0);
  });

  test("heartbeat ticks heartbeatAt on a running job", async () => {
    const tracker = new IndexJobTracker(undefined);
    const job = tracker.createJob("p", "/p");
    tracker.updateStatus(job.jobId, "running");
    const before = tracker.getJob(job.jobId)!.heartbeatAt;
    // Ensure time advances.
    await new Promise((r) => setTimeout(r, 2));
    tracker.heartbeat(job.jobId);
    const after = tracker.getJob(job.jobId)!.heartbeatAt;
    expect(after.getTime()).toBeGreaterThanOrEqual(before!.getTime());
  });

  test("heartbeat is a no-op for unknown job", () => {
    const tracker = new IndexJobTracker(undefined);
    expect(() => tracker.heartbeat("ghost")).not.toThrow();
  });

  test("reapStaleJobs flips stale running jobs to failed", () => {
    const store = new FakeRunningStore();
    const stale = makeJob({
      jobId: "stale-job",
      status: "running",
      heartbeatAt: new Date(Date.now() - 600_000),
      startedAt: new Date(Date.now() - 600_000),
    });
    store.running = [stale];
    const tracker = new IndexJobTracker(store);
    const reaped = tracker.reapStaleJobs(300_000);
    expect(reaped).toBe(1);
    const job = tracker.getJob("stale-job");
    expect(job!.status).toBe("failed");
    expect(job!.error).toContain("heartbeat stale");
  });

  test("reapStaleJobs skips fresh-heartbeat jobs", () => {
    const store = new FakeRunningStore();
    const fresh = makeJob({
      jobId: "fresh-job",
      status: "running",
      heartbeatAt: new Date(),
    });
    store.running = [fresh];
    const tracker = new IndexJobTracker(store);
    expect(tracker.reapStaleJobs(300_000)).toBe(0);
    expect(tracker.getJob("fresh-job")).toBeUndefined();
  });

  test("reapStaleJobs uses startedAt fallback when heartbeatAt missing", () => {
    const store = new FakeRunningStore();
    const noHb = makeJob({
      jobId: "no-hb-job",
      status: "running",
      heartbeatAt: undefined,
      startedAt: new Date(Date.now() - 600_000),
    });
    store.running = [noHb];
    const tracker = new IndexJobTracker(store);
    expect(tracker.reapStaleJobs(300_000)).toBe(1);
  });

  test("reapStaleJobs returns 0 when store.listRunning throws", () => {
    const failingStore: JobStore = {
      ...new MemoryJobStore(),
      listRunning(): IndexJob[] { throw new Error("down"); },
    };
    const tracker = new IndexJobTracker(failingStore);
    expect(tracker.reapStaleJobs(300_000)).toBe(0);
  });

  test("reapStaleJobs returns 0 when no store is attached", () => {
    const tracker = new IndexJobTracker(undefined);
    expect(tracker.reapStaleJobs(300_000)).toBe(0);
  });

  test("setResultAndFlush awaits store.flush after setResult", async () => {
    const store = new FakeRunningStore();
    const tracker = new IndexJobTracker(store);
    const job = tracker.createJob("p", "/p");
    await tracker.setResultAndFlush(job.jobId, { filesIndexed: 1, chunksIndexed: 2, errors: 0, duration: 5 });
    expect(store.flushCalled).toContain(job.jobId);
    expect(tracker.getJob(job.jobId)!.status).toBe("completed");
  });

  test("listJobsByProject filters by project", () => {
    const tracker = new IndexJobTracker(undefined);
    tracker.createJob("proj-a", "/a");
    tracker.createJob("proj-b", "/b");
    tracker.createJob("proj-a", "/a2");
    expect(tracker.listJobsByProject("proj-a")).toHaveLength(2);
    expect(tracker.listJobsByProject("proj-b")).toHaveLength(1);
    expect(tracker.listJobsByProject("proj-z")).toHaveLength(0);
  });

  test("cleanupOldJobs evicts oldest terminal jobs beyond MAX_JOBS", () => {
    const tracker = new IndexJobTracker(undefined);
    // Reflect to read the private cap so the test tracks the real constant.
    const cap = (tracker as unknown as { MAX_JOBS: number }).MAX_JOBS;
    // Create cap + 5 completed jobs (all terminal → evictable).
    for (let i = 0; i < cap + 5; i++) {
      const job = tracker.createJob("proj-evict", `/e${i}`);
      tracker.setResult(job.jobId, { filesIndexed: i, chunksIndexed: 0, errors: 0, duration: 0 });
    }
    const all = tracker.listJobs();
    expect(all.length).toBeLessThanOrEqual(cap);
  });

  test("cleanupOldJobs never evicts non-terminal jobs until forced", () => {
    const tracker = new IndexJobTracker(undefined);
    const cap = (tracker as unknown as { MAX_JOBS: number }).MAX_JOBS;
    // Fill with running jobs (non-terminal).
    for (let i = 0; i < cap; i++) {
      const job = tracker.createJob("proj-nonterm", `/n${i}`);
      tracker.updateStatus(job.jobId, "running");
    }
    // Add one more → overflow path evicts oldest non-terminal with a warning.
    const overflow = tracker.createJob("proj-nonterm", "/overflow");
    tracker.updateStatus(overflow.jobId, "running");
    // The overflow eviction branch ran; total stays at or below cap.
    const remaining = tracker.listJobs();
    expect(remaining.length).toBeLessThanOrEqual(cap);
    // At least one job was evicted (we created cap+1, only cap remain).
    expect(remaining.length).toBe(cap);
  });

  test("createJob with a failing store does not throw (best-effort)", () => {
    const failingStore: JobStore = {
      ...new MemoryJobStore(),
      save(): void { throw new Error("store write failed"); },
    };
    const tracker = new IndexJobTracker(failingStore);
    expect(() => tracker.createJob("p", "/p")).not.toThrow();
  });

  test("setResult swallows store.save errors with a warning", () => {
    const failingStore: JobStore = {
      ...new MemoryJobStore(),
      save(): void { throw new Error("commit failed"); },
    };
    const tracker = new IndexJobTracker(failingStore);
    const job = tracker.createJob("p", "/p");
    expect(() => tracker.setResult(job.jobId, { filesIndexed: 1, chunksIndexed: 0, errors: 0, duration: 0 })).not.toThrow();
    // The job still transitioned in-memory.
    expect(tracker.getJob(job.jobId)!.status).toBe("completed");
  });
});
