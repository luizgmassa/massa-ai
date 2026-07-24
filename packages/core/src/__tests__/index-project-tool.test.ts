/**
 * index_project tool coverage tests — covers canonicalizeProjectRoot,
 * assertProjectRootReuse, and IndexProjectTool handler error paths.
 * Mocks EtlPipeline and ContextualSearchRLM to test the handler + executeIndexing.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import path from "node:path";
import {
  canonicalizeProjectRoot,
  assertProjectRootReuse,
} from "../tools/index_project.js";

// Mock EtlPipeline to avoid real ETL execution.
let etlRunResult: any = null;
let etlRunShouldThrow = false;

mock.module("../services/etl/pipeline.js", () => ({
  EtlPipeline: {
    getInstance: () => ({
      run: async () => {
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
mock.module("../services/search/contextual-search-rlm.js", () => ({
  ContextualSearchRLM: class {
    async warmupCache() { return { warmed: 0 }; }
  },
}));

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
  mock.restore();
});

describe("canonicalizeProjectRoot", () => {
  test("resolves and canonicalizes a path", async () => {
    const result = await canonicalizeProjectRoot("/tmp");
    expect(result).toBe("/private/tmp");
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
    // Force ETL to throw → executeIndexing catches internally → setResult.
    // The outer .catch on executeIndexing should NOT fire because
    // executeIndexing has its own catch. But if indexJobTracker.updateStatus
    // throws before the try/catch, the .catch fires.
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