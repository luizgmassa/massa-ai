/**
 * index_project tool coverage tests — covers canonicalizeProjectRoot,
 * assertProjectRootReuse, and IndexProjectTool handler error paths.
 * Mocks EtlPipeline and ContextualSearchRLM to test the handler plus the
 * background `executeIndexing`, which since PR-D T13 lives in
 * `services/indexing/execute-indexing.ts` rather than in the tool. The
 * EtlPipeline mock below still reaches it: `mock.module` registers by RESOLVED
 * path, so this file's `"../services/etl/pipeline.js"` and that module's own
 * `"../etl/pipeline.js"` are the same registration.
 *
 * This file asserts only `handle()`'s SYNCHRONOUS return; the background
 * contract is pinned by `execute-indexing.test.ts`.
 */

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { realpathSync } from "node:fs";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";
import {
  canonicalizeProjectRoot,
  assertProjectRootReuse,
} from "../tools/index_project.js";

// Mock EtlPipeline to avoid real ETL execution.
let etlRunResult: any = null;
let etlRunShouldThrow = false;

// Every request the pipeline receives, recorded — this is how the handler's
// wiring is observed without replacing `executeIndexing` itself.
const etlRunCalls: any[] = [];

mock.module("../services/etl/pipeline.js", () => ({
  EtlPipeline: {
    getInstance: () => ({
      run: async (req: any) => {
        etlRunCalls.push(req);
        if (etlRunShouldThrow) throw new Error("ETL failed");
        return etlRunResult ?? {
          filesDiscovered: 1,
          filesIndexed: 1,
          filesSkipped: 0,
          chunksIndexed: 1,
          symbolsIndexed: 1,
          errors: 0,
          durationMs: 100,
          stageTimings: { discover: 10, parse: 10, resolve: 10, load: 10 },
          activatedGraphGenerationId: "gen-1",
          parserDiagnostics: {
            diagnosticsCount: 0, recoveredFiles: 0, hardFailureFiles: 0,
            staleFiles: 0, languages: [],
          },
        };
      },
    }),
  },
  EtlPipelineBusyError: class EtlPipelineBusyError extends Error {
    activeRunId: string;
    leaseExpiresAt: number;
    constructor(activeRunId: string, leaseExpiresAt: number) {
      super(`indexing_busy:${activeRunId}`);
      this.activeRunId = activeRunId;
      this.leaseExpiresAt = leaseExpiresAt;
    }
  },
}));

// Mock ContextualSearchRLM to avoid heavy init.
//
// `warmupCache` deliberately reaches through `this`, as the real method does
// (`await this.ensureInitialized()`), and returns the real method's shape. A
// receiver-free stub cannot tell a bound callback from an unbound one, so the
// §4.2 identity decision would be unenforceable — measured: the call-site
// mutation that drops `.bind()` survived every suite until this stub used
// `this`.
mock.module("../services/search/contextual-search-rlm.js", () => ({
  ContextualSearchRLM: class {
    #ready = true;
    async warmupCache() {
      if (!this.#ready) throw new Error("contextual search not initialized");
      return { queriesWarmed: 0, errors: 0 };
    }
  },
}));

/**
 * What the handler wires into the background run is observed through the ETL
 * mock above rather than by mocking `execute-indexing.js`, DELIBERATELY: the
 * real `executeIndexing` forwards the request's fields to
 * `EtlPipeline.run(...)`, so recording that call reaches the wiring without
 * replacing the module the three background-path tests exist to exercise
 * (GMS-05 AC-3 — no test weakened).
 *
 * A delegating module mock was tried first and is a trap worth recording:
 * `mock.module` also rebinds a namespace imported BEFORE the registration, so
 * the "real" implementation captured for delegation resolves to the mock and
 * recurses. Observed, not predicted — `Maximum call stack size exceeded`.
 */

// Mock workspaceManager.
mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    getWorkspace: async () => null,
    markIndexing: async () => {},
    markIndexed: async () => {},
    markError: async () => {},
  },
}));

// Mock ManagedRunRepositoryPg.
let managedRunBeginShouldFail = false;
let managedRunBeginShouldBeBusy = false;

mock.module("../data/managed-runs/managed-run-repository-pg.js", () => ({
  ManagedRunRepositoryPg: {
    getInstance: () => ({
      begin: async () => {
        if (managedRunBeginShouldFail) throw new Error("managed_runs begin failed");
        if (managedRunBeginShouldBeBusy) return {
          status: "busy",
          activeRunId: "existing-run",
          leaseExpiresAt: Date.now() + 90000,
        };
        return {
          status: "acquired",
          lease: {
            runId: "1", projectId: "test", runKind: "indexing",
            leaseToken: "token", leaseExpiresAt: Date.now() + 90000, eventId: "evt-1",
          },
        };
      },
      complete: async () => ({ status: "completed", runId: "1" }),
      abort: async () => ({ status: "aborted", runId: "1" }),
      heartbeat: async () => ({ status: "renewed", leaseExpiresAt: Date.now() + 90000 }),
      updateFileCursor: async () => ({ status: "renewed", leaseExpiresAt: Date.now() + 90000 }),
      getActive: async () => null,
    }),
  },
}));

// Mock assertParserReadyForIndexing.
mock.module("../services/structural/parser-readiness.js", () => ({
  assertParserReadyForIndexing: async () => {},
}));

// Import after mocks.
const { IndexProjectTool } = await import("../tools/index_project.js");

afterEach(() => {
  etlRunResult = null;
  etlRunShouldThrow = false;
  managedRunBeginShouldFail = false;
  managedRunBeginShouldBeBusy = false;
  etlRunCalls.length = 0;
  mock.restore();
});

/** Lets the background `.catch()`-free promise chain settle before asserting. */
const settle = () => new Promise((r) => setTimeout(r, 300));

/**
 * The call site itself, which no suite observed before PR-D T13.
 *
 * `execute-indexing.test.ts` pins what the extracted module DOES; it cannot see
 * how the handler wires it. Measured with the T13 mutation harness: four
 * call-site mutations — an unbound callback, a dropped lease, `projectPath`
 * receiving the project ID, and a dropped `include_tests` — survived BOTH the
 * module suite and every pre-existing suite. A method test is not a call-site
 * test; these four cases are the sensor for the wiring.
 */
describe("IndexProjectTool → executeIndexing wiring", () => {
  test("forwards the CANONICAL project path, not the project id", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-wire-path",
    });
    expect(result.success).toBe(true);
    await settle();
    expect(etlRunCalls).toHaveLength(1);
    const req = etlRunCalls[0];
    expect(req.projectId).toBe("cov-wire-path");
    expect(req.projectPath).toBe(realpathSync("/tmp"));
    expect(req.projectPath).not.toBe(req.projectId);
    expect(req.jobId).toBe(result.data!.jobId);
  });

  test("hands the ACQUIRED lease through to the pipeline", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-wire-lease",
    });
    await settle();
    const req = etlRunCalls[0];
    expect(req.managedRunLease).toBeDefined();
    expect(req.managedRunLease.runId).toBe(result.data!.runId);
  });

  test("forwards include_tests and forceReindex as given", async () => {
    const tool = new IndexProjectTool();
    await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-wire-flags",
      include_tests: true,
      forceReindex: true,
    });
    await settle();
    const req = etlRunCalls[0];
    expect(req.include_tests).toBe(true);
    expect(req.forceReindex).toBe(true);
  });

  test("the warmup callback reaches its receiver — an unbound one would throw", async () => {
    // The stubbed ContextualSearchRLM reads `this.#ready`, so a callback passed
    // without `.bind()` rejects; the module's catch then records a FAILURE via
    // setResult instead of completing through setResultAndFlush. Asserting the
    // successful terminal transition is what discriminates the two.
    const flush = spyOn(indexJobTracker, "setResultAndFlush");
    try {
      const tool = new IndexProjectTool();
      await tool.handle({
        projectPath: "/tmp",
        projectId: "cov-wire-bound",
        warmCache: true,
        warmupQueries: ["q1"],
      });
      await settle();
      expect(flush).toHaveBeenCalled();
    } finally {
      flush.mockRestore();
    }
  });
});

/**
 * The lease call site, which no suite observed before PR-D T14b.
 *
 * `acquire-indexing-lease.test.ts` pins what the extracted module DOES; it
 * cannot see how the handler consumes its discriminated result. The two cases
 * below asserted `result.error` only — the RESPONSE — and the response is not
 * what separates the two failure modes. `handle()`'s outer catch returns a
 * plausible 500 body and calls `setResult` NOT AT ALL, so a lease failure that
 * throws out of the module instead of resolving to `{status:"failed"}` returns
 * a similar-looking error while leaving the job non-terminal forever.
 *
 * Measured before these cases existed: `managed_runs_begin_failed:` appeared at
 * one site in the repository and in zero tests, and nothing anywhere asserted
 * the tracker's terminal state on either lease branch. The tracker transition is
 * therefore the sensor, not the message.
 */
describe("IndexProjectTool → acquireIndexingLease wiring", () => {
  test("the BUSY branch records a terminal job result, not just a 409 body", async () => {
    managedRunBeginShouldBeBusy = true;
    const setResult = spyOn(indexJobTracker, "setResult");
    try {
      const tool = new IndexProjectTool();
      const result = await tool.handle({
        projectPath: "/tmp",
        projectId: "cov-busy-terminal",
      });
      expect(result.success).toBe(false);
      const call = setResult.mock.calls.find((c) =>
        String(c[2]).startsWith("indexing_busy:"),
      );
      expect(call).toBeDefined();
      expect(call![0]).toBe(result.data!.jobId);
      expect(String(call![2])).toBe("indexing_busy:existing-run");
      expect((call![1] as { errors: number }).errors).toBe(0);
    } finally {
      setResult.mockRestore();
    }
  });

  test("the 409 body carries the ACTIVE run's id and expiry, not the job's", async () => {
    // The two mutations that survived T14b's first harness run were both here:
    // reporting `job.jobId` in the error string (the pre-existing assertion is
    // `toContain("indexing_busy")`, which passes either way) and zeroing
    // `leaseExpiresAt` (asserted by nothing at all). The 409 body is precisely
    // the part T14b's design keeps in the handler as response shaping, so it is
    // the part a module suite structurally cannot reach.
    managedRunBeginShouldBeBusy = true;
    const before = Date.now();
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-busy-body",
    });
    expect(result.error).toBe("indexing_busy:existing-run");
    expect(result.data!.activeRunId).toBe("existing-run");
    expect(result.data!.leaseExpiresAt).toBeGreaterThanOrEqual(before);
    expect(result.data!.jobId).not.toBe(result.data!.activeRunId);
  });

  test("the FAILED branch records a terminal job result — the outer catch does not", async () => {
    managedRunBeginShouldFail = true;
    const setResult = spyOn(indexJobTracker, "setResult");
    try {
      const tool = new IndexProjectTool();
      const result = await tool.handle({
        projectPath: "/tmp",
        projectId: "cov-fail-terminal",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to acquire indexing lease");
      const call = setResult.mock.calls.find((c) =>
        String(c[2]).startsWith("managed_runs_begin_failed:"),
      );
      expect(call).toBeDefined();
      expect((call![1] as { errors: number }).errors).toBe(1);
    } finally {
      setResult.mockRestore();
    }
  });

  test("an ACQUIRED lease reaches the response runId and the pipeline together", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-lease-mapped",
    });
    expect(result.success).toBe(true);
    expect(result.data!.runId).toBe("1");
    await settle();
    expect(etlRunCalls[0].managedRunLease.runId).toBe(result.data!.runId);
  });
});

describe("canonicalizeProjectRoot", () => {
  test("resolves and canonicalizes a path", async () => {
    const result = await canonicalizeProjectRoot("/tmp");
    // realpath("/tmp") is platform-dependent: macOS resolves the /tmp symlink
    // to /private/tmp, while Linux keeps /tmp. Compare against the live
    // canonical form rather than a hardcoded macOS-only string.
    expect(result).toBe(realpathSync("/tmp"));
  });

  test("uses custom canonicalize function", async () => {
    const result = await canonicalizeProjectRoot("/foo", async (p) => `/custom${p}`);
    expect(result).toBe("/custom/foo");
  });
});

describe("assertProjectRootReuse", () => {
  test("no-op when storedProjectPath is null", async () => {
    await expect(
      assertProjectRootReuse({
        projectId: "test",
        canonicalProjectPath: "/tmp/test",
        storedProjectPath: null,
        forceReindex: false,
      }),
    ).resolves.toBeUndefined();
  });

  test("no-op when forceReindex is true", async () => {
    await expect(
      assertProjectRootReuse({
        projectId: "test",
        canonicalProjectPath: "/tmp/test",
        storedProjectPath: "/tmp/other",
        forceReindex: true,
      }),
    ).resolves.toBeUndefined();
  });

  test("no-op when paths match", async () => {
    await expect(
      assertProjectRootReuse({
        projectId: "test",
        canonicalProjectPath: "/tmp/test",
        storedProjectPath: "/tmp/test",
        forceReindex: false,
        canonicalize: async (p) => p,
      }),
    ).resolves.toBeUndefined();
  });

  test("throws when paths differ", async () => {
    await expect(
      assertProjectRootReuse({
        projectId: "test",
        canonicalProjectPath: "/tmp/new",
        storedProjectPath: "/tmp/old",
        forceReindex: false,
        canonicalize: async (p) => p,
      }),
    ).rejects.toThrow("already indexes canonical root");
  });

  test("falls back to path.resolve when canonicalize fails", async () => {
    // canonicalize throws → falls back to path.resolve(storedProjectPath)
    await expect(
      assertProjectRootReuse({
        projectId: "test",
        canonicalProjectPath: "/tmp/test",
        storedProjectPath: "/tmp/test",
        forceReindex: false,
        canonicalize: async () => { throw new Error("ENOENT"); },
      }),
    ).resolves.toBeUndefined();
  });

  test("throws when fallback resolved path differs", async () => {
    await expect(
      assertProjectRootReuse({
        projectId: "test",
        canonicalProjectPath: "/tmp/new",
        storedProjectPath: "/tmp/old",
        forceReindex: false,
        canonicalize: async () => { throw new Error("ENOENT"); },
      }),
    ).rejects.toThrow("already indexes canonical root");
  });
});

describe("IndexProjectTool handler", () => {
  test("handle creates a job and returns started status", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-index-test",
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("started");
    expect(result.data!.jobId).toBeDefined();
    expect(result.data!.runId).toBeDefined();
  });

  test("handle with forceReindex bypasses root reuse check", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-force-test",
      forceReindex: true,
    });
    expect(result.success).toBe(true);
  });

  test("handle with warmCache starts cache warmup after ETL", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-warm-test",
      warmCache: true,
    });
    expect(result.success).toBe(true);
    // Wait for background indexing to complete.
    await new Promise((r) => setTimeout(r, 200));
  });

  test("handle with include_tests flag", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-inc-test",
      include_tests: true,
    });
    expect(result.success).toBe(true);
  });

  test("handle returns error on missing projectPath", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({});
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("handle generates projectId from path when not provided", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
    });
    expect(result.success).toBe(true);
    expect(result.data!.projectId).toBeDefined();
  });

  test("background indexing completes and sets job result", async () => {
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-bg-test",
    });
    expect(result.success).toBe(true);
    // Wait for background ETL to complete.
    await new Promise((r) => setTimeout(r, 300));
  });

  test("background indexing handles ETL failure gracefully", async () => {
    etlRunShouldThrow = true;
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-fail-test",
    });
    expect(result.success).toBe(true);
    // Wait for background ETL to fail.
    await new Promise((r) => setTimeout(r, 300));
  });

  test("handle returns busy when managed_runs begin returns busy", async () => {
    managedRunBeginShouldBeBusy = true;
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-busy-test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("indexing_busy");
    expect(result.data!.status).toBe("busy");
    expect(result.data!.activeRunId).toBe("existing-run");
  });

  test("handle returns error when managed_runs begin throws", async () => {
    managedRunBeginShouldFail = true;
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-begin-fail-test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to acquire indexing lease");
  });

  test("background indexing catch handler fires on executeIndexing rejection", async () => {
    // Force ETL to throw → `executeIndexing` catches internally → setResult.
    // The outer .catch on the call does NOT fire, because `executeIndexing`
    // (now `services/indexing/execute-indexing.ts`, PR-D T13) has its own catch
    // and RESOLVES.
    //
    // This comment used to say the outer .catch fires "if indexJobTracker
    // .updateStatus throws before the try/catch". Measured at T13: it does not,
    // and it never did — `updateStatus` is the FIRST statement INSIDE that try,
    // so it is caught like everything else. The only code outside the try is the
    // request destructure and `Date.now()`, neither reachable as a throw from any
    // request `handle()` builds. The outer .catch is unreachable defensive code,
    // which is why it is the one uncovered arrow in this file — a dead branch,
    // not a missing sensor, and deliberately not covered by an artificial reach.
    //
    // The swallow itself is pinned in `execute-indexing.test.ts`; this case
    // asserts only the handler's synchronous return.
    etlRunShouldThrow = true;
    const tool = new IndexProjectTool();
    const result = await tool.handle({
      projectPath: "/tmp",
      projectId: "cov-catch-test",
    });
    expect(result.success).toBe(true);
    // Wait for background.
    await new Promise((r) => setTimeout(r, 300));
  });
});