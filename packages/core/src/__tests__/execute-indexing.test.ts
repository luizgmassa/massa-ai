/**
 * Unit tests for `services/indexing/execute-indexing.ts` — module 8 of the
 * `tools/index_project.ts` extraction (PR-D, T13).
 *
 * WHAT THE PRE-EXISTING SUITES ALREADY REACH, so what this file adds is stated
 * rather than assumed. Measured at HEAD before a line moved:
 *
 *  - `index-project-tool.test.ts` drives `IndexProjectTool.handle()` through the
 *    background path in three tests (`:265`, `:276`, `:312`), each of which
 *    calls `handle()`, sleeps 300 ms, and then asserts NOTHING — every one of
 *    its assertions is on `handle()`'s SYNCHRONOUS return value. A fourth test
 *    (`:227`) drives the `warmCache` arm and sleeps 200 ms, likewise asserting
 *    only the synchronous return.
 *  - `indexing-readiness-guard.test.ts` constructs the tool and calls `handle()`,
 *    but the parser-readiness guard throws first: it asserts `createJob` was
 *    NOT called, so it never reaches this module at all.
 *  - `index-project-identity.test.ts` covers only the two module-level helpers.
 *
 * So the ENTIRE contract of this file was unpinned before it was written: the
 * job-tracker transitions, the ETL request shape, the warmup arm, and the
 * failure path all ran under the existing suites without a single assertion
 * observing them. That is what this file is for, and it is why the mutation
 * table for T13 shows column B killing so little.
 *
 * NO `mock.module`, AND THAT IS A MEASURED CHOICE RATHER THAN A STYLE ONE. A
 * module mock is registered by RESOLVED PATH and reaches every module loaded
 * beside it in the same process, so it contaminates siblings in a way the
 * isolation runner hides. `spyOn` is scoped to the object and restored per test.
 * This file is still FORKED by `run-tests-isolated.ts` — naming `EtlPipeline` in
 * test source is itself an isolation trigger (`:38`) — so core's group count
 * moves 150 → 151. That is expected and measured, not a regression: unlike
 * module 7's suite at T12, a fork-free suite is not reachable here, because a
 * suite that mocks the ETL pipeline must name it.
 *
 * THE SWALLOW IS THE LOAD-BEARING PIN. `executeIndexing` records a failed ETL
 * through `setResult(..., errors: 1, message)` and RESOLVES; it never rejects.
 * `handle()`'s `.catch()` on the call exists for the narrower case where the
 * tracker throws before the inner `try`. §5 asserts the resolution explicitly
 * with `await`, because a floating `expect(...).rejects` passes under the very
 * mutation it exists to kill (C74, T12).
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { EtlPipeline } from "../services/etl/pipeline.js";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";
import {
  executeIndexing,
  type ExecuteIndexingRequest,
} from "../services/indexing/execute-indexing.js";

/* ── harness ──────────────────────────────────────────────────────────────── */

const ETL_RESULT = {
  filesDiscovered: 9,
  filesIndexed: 7,
  filesSkipped: 2,
  chunksIndexed: 41,
  symbolsIndexed: 63,
  errors: 0,
  durationMs: 12,
  stageTimings: { discover: 1, parse: 2, resolve: 3, load: 4 },
  activatedGraphGenerationId: "gen-7",
  parserDiagnostics: {
    diagnosticsCount: 0,
    recoveredFiles: 0,
    hardFailureFiles: 0,
    staleFiles: 0,
    languages: ["ts"],
  },
};

const spies: Array<{ mockRestore: () => void }> = [];
const track = <T extends { mockRestore: () => void }>(s: T): T => {
  spies.push(s);
  return s;
};

/** Records the exact request the pipeline received, and the call order. */
function harness(options: { etlThrows?: boolean } = {}) {
  const order: string[] = [];
  const etlCalls: unknown[] = [];

  const run = async (req: unknown) => {
    order.push("etl.run");
    etlCalls.push(req);
    if (options.etlThrows) throw new Error("ETL exploded");
    return ETL_RESULT;
  };
  track(
    spyOn(EtlPipeline, "getInstance").mockReturnValue({
      run,
    } as unknown as EtlPipeline),
  );

  const updateStatus = track(
    spyOn(indexJobTracker, "updateStatus").mockImplementation(((
      _jobId: string,
      status: string,
    ) => {
      order.push(`updateStatus:${status}`);
    }) as typeof indexJobTracker.updateStatus),
  );
  const updateProgress = track(
    spyOn(indexJobTracker, "updateProgress").mockImplementation((() => {
      order.push("updateProgress");
    }) as typeof indexJobTracker.updateProgress),
  );
  const setResultAndFlush = track(
    spyOn(indexJobTracker, "setResultAndFlush").mockImplementation((async () => {
      order.push("setResultAndFlush");
    }) as typeof indexJobTracker.setResultAndFlush),
  );
  const setResult = track(
    spyOn(indexJobTracker, "setResult").mockImplementation((() => {
      order.push("setResult");
    }) as typeof indexJobTracker.setResult),
  );

  const warmupCalls: unknown[][] = [];
  const warmupCache = async (...args: unknown[]) => {
    order.push("warmupCache");
    warmupCalls.push(args);
    return { queriesWarmed: 3, errors: 0 };
  };

  return {
    order,
    etlCalls,
    warmupCalls,
    updateStatus,
    updateProgress,
    setResultAndFlush,
    setResult,
    warmupCache: warmupCache as unknown as ExecuteIndexingRequest["warmupCache"],
  };
}

const request = (
  h: ReturnType<typeof harness>,
  over: Partial<ExecuteIndexingRequest> = {},
): ExecuteIndexingRequest => ({
  jobId: "job-1",
  projectId: "proj-1",
  projectPath: "/tmp/proj",
  forceReindex: false,
  warmCache: false,
  warmupCache: h.warmupCache,
  ...over,
});

afterEach(() => {
  while (spies.length) spies.pop()!.mockRestore();
});

/* ── 1. the job-tracker transitions, in order ─────────────────────────────── */

describe("executeIndexing — job lifecycle", () => {
  test("marks the job running BEFORE the pipeline runs", async () => {
    const h = harness();
    await executeIndexing(request(h));
    expect(h.order[0]).toBe("updateStatus:running");
    expect(h.order[1]).toBe("etl.run");
  });

  test("on success emits 100% progress BEFORE the terminal transition", async () => {
    const h = harness();
    await executeIndexing(request(h));
    expect(h.order).toEqual([
      "updateStatus:running",
      "etl.run",
      "updateProgress",
      "setResultAndFlush",
    ]);
  });

  test("progress is emitted as indexed/indexed, not indexed/discovered", async () => {
    const h = harness();
    await executeIndexing(request(h));
    // 7 indexed of 9 discovered — a poller reading atomically must see 7/7.
    expect(h.updateProgress).toHaveBeenCalledWith("job-1", 7, 7);
  });

  test("the flushed result carries the pipeline's own counters", async () => {
    const h = harness();
    await executeIndexing(request(h));
    const [jobId, result] = h.setResultAndFlush.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(jobId).toBe("job-1");
    expect(result.filesIndexed).toBe(7);
    expect(result.chunksIndexed).toBe(41);
    expect(result.errors).toBe(0);
    expect(result.activatedGraphGenerationId).toBe("gen-7");
    expect(result.parserDiagnostics).toEqual(ETL_RESULT.parserDiagnostics);
    expect(typeof result.duration).toBe("number");
  });
});

/* ── 2. the ETL request shape ─────────────────────────────────────────────── */

describe("executeIndexing — the ETL request", () => {
  test("forwards every field the pipeline needs, under the pipeline's own names", async () => {
    const h = harness();
    const lease = { runId: "run-9", leaseToken: "tok" };
    await executeIndexing(
      request(h, {
        forceReindex: true,
        include_tests: true,
        managedRunLease: lease as never,
      }),
    );
    expect(h.etlCalls[0]).toEqual({
      projectId: "proj-1",
      projectPath: "/tmp/proj",
      jobId: "job-1",
      forceReindex: true,
      include_tests: true,
      managedRunLease: lease,
    });
  });

  test("include_tests defaults to false when the caller omits it", async () => {
    const h = harness();
    await executeIndexing(request(h));
    expect((h.etlCalls[0] as { include_tests: unknown }).include_tests).toBe(
      false,
    );
  });

  test("an absent lease is forwarded as undefined, not dropped", async () => {
    const h = harness();
    await executeIndexing(request(h));
    expect(h.etlCalls[0]).toHaveProperty("managedRunLease", undefined);
  });
});

/* ── 3. the warmup arm ────────────────────────────────────────────────────── */

describe("executeIndexing — cache warmup", () => {
  test("warmCache false does not touch the warmup surface", async () => {
    const h = harness();
    await executeIndexing(request(h, { warmCache: false }));
    expect(h.warmupCalls).toHaveLength(0);
    expect(h.order).not.toContain("warmupCache");
  });

  test("warmCache true calls the INJECTED callback with (projectId, projectPath, queries)", async () => {
    const h = harness();
    await executeIndexing(
      request(h, { warmCache: true, warmupQueries: ["a", "b"] }),
    );
    expect(h.warmupCalls).toHaveLength(1);
    expect(h.warmupCalls[0]).toEqual(["proj-1", "/tmp/proj", ["a", "b"]]);
  });

  test("warmup runs AFTER the pipeline and BEFORE the terminal transition", async () => {
    const h = harness();
    await executeIndexing(request(h, { warmCache: true }));
    expect(h.order).toEqual([
      "updateStatus:running",
      "etl.run",
      "warmupCache",
      "updateProgress",
      "setResultAndFlush",
    ]);
  });

  test("omitted warmupQueries reach the callback as undefined", async () => {
    const h = harness();
    await executeIndexing(request(h, { warmCache: true }));
    expect(h.warmupCalls[0]).toEqual(["proj-1", "/tmp/proj", undefined]);
  });
});

/* ── 4. the failure path ──────────────────────────────────────────────────── */

describe("executeIndexing — a thrown pipeline", () => {
  test("records the failure with errors: 1 and the thrown message", async () => {
    const h = harness({ etlThrows: true });
    await executeIndexing(request(h));
    const [jobId, result, message] = h.setResult.mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(jobId).toBe("job-1");
    expect(result.errors).toBe(1);
    expect(result.filesIndexed).toBe(0);
    expect(result.chunksIndexed).toBe(0);
    expect(message).toBe("ETL exploded");
  });

  test("does not reach the success-path transitions", async () => {
    const h = harness({ etlThrows: true });
    await executeIndexing(request(h));
    expect(h.updateProgress).not.toHaveBeenCalled();
    expect(h.setResultAndFlush).not.toHaveBeenCalled();
  });

  test("does not warm the cache when the pipeline threw, even with warmCache true", async () => {
    const h = harness({ etlThrows: true });
    await executeIndexing(request(h, { warmCache: true }));
    expect(h.warmupCalls).toHaveLength(0);
  });
});

/* ── 5. the swallow — the pin C74's shape says to write with `await` ──────── */

describe("executeIndexing — the catch swallows", () => {
  test("RESOLVES on a thrown pipeline rather than rejecting", async () => {
    const h = harness({ etlThrows: true });
    // `await` is load-bearing: a floating assertion passes under the mutation
    // that deletes the catch, which is the whole point of this case (C74).
    await expect(executeIndexing(request(h))).resolves.toBeUndefined();
  });

  test("a throwing warmup is swallowed by the same catch", async () => {
    const h = harness();
    const boom: ExecuteIndexingRequest["warmupCache"] = async () => {
      throw new Error("warmup exploded");
    };
    await expect(
      executeIndexing(request(h, { warmCache: true, warmupCache: boom })),
    ).resolves.toBeUndefined();
    expect(h.setResult).toHaveBeenCalled();
    const [, , message] = h.setResult.mock.calls[0] as [
      string,
      unknown,
      string,
    ];
    expect(message).toBe("warmup exploded");
    // and the terminal success transition is skipped
    expect(h.setResultAndFlush).not.toHaveBeenCalled();
  });
});
