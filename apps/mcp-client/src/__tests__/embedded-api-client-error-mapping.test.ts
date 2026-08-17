/**
 * EmbeddedApiClient private-handler error-mapping coverage (coverage-90pct
 * follow-up after CI's 90% floor flagged apps/mcp-client/src/embedded-api-client.ts
 * at 89.87%).
 *
 * The catch blocks inside `EmbeddedApiClient`'s private handlers
 * (`handleMemoryList`, `handleProjectReset`, `handleProjectIdentity`,
 * `handleHookBatch`, `handleBootstrap`, `handleHandoffBegin`,
 * `handleHandoffList`, `handleProposalList`) only run when the underlying
 * core singleton throws. `embedded-api-client-endpoints.test.ts` exercises
 * these against the real DB, where the happy path (or a benign not-found)
 * is what actually happens — the failure branches are unreachable without
 * forcing the singleton itself to throw. This file mocks `@massa-ai/core`'s
 * factory functions (same technique `embedded-profiles.test.ts` uses for
 * `@massa-ai/shared`: spread the real module, override only what each test
 * needs) so each failure path can be driven deterministically and the
 * embedded transport's error-mapping contract (mirrors the tools-api REST
 * routes) is actually verified rather than merely reached.
 */

import { describe, test, expect, mock, afterAll, beforeEach } from "bun:test";
import type { ApiHttpError as ApiHttpErrorType } from "../api-client.js";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// DI-01 (da-inventory-closure): scratch config home BEFORE any core-reaching
// import — see embedded-api-client-endpoints.test.ts for the full rationale.
// Most of this file's core calls are mocked below, but the top-level
// `require("@massa-ai/core")` (needed to spread the real module before
// overriding a handful of factories) still runs the barrel's real
// module-load side effects, so the same scratch dir applies here.
const SCRATCH_CONFIG_HOME = mkdtempSync(path.join(tmpdir(), "embedded-error-mapping-config-"));
process.env.XDG_CONFIG_HOME = SCRATCH_CONFIG_HOME;

const memorySearch = mock((..._args: unknown[]): unknown => []);
const memoryDeleteByProject = mock((..._args: unknown[]): unknown => 0);
const vectorDeleteByProject = mock((..._args: unknown[]): unknown => 0);
const keywordDeleteByProject = mock((..._args: unknown[]): unknown => 0);
const removeWorkspace = mock((..._args: unknown[]): unknown => undefined);
const projectIdentityPreview = mock((..._args: unknown[]): unknown => ({}));
const projectIdentityApply = mock((..._args: unknown[]): unknown => ({}));
const hookIngestBatch = mock((..._args: unknown[]): unknown => []);
const bootstrapRun = mock((..._args: unknown[]): unknown => ({}));
const handoffBegin = mock((..._args: unknown[]): unknown => ({ ok: true }));
const handoffListPending = mock((..._args: unknown[]): unknown => []);
const autoImproveListPending = mock((..._args: unknown[]): unknown => []);

const actualCore = require("@massa-ai/core");
mock.module("@massa-ai/core", () => ({
  ...actualCore,
  getMemoryRepository: () => ({
    search: (...args: unknown[]) => memorySearch(...args),
    deleteByProject: (...args: unknown[]) => memoryDeleteByProject(...args),
  }),
  getVectorStore: async () => ({
    deleteByProject: (...args: unknown[]) => vectorDeleteByProject(...args),
  }),
  getKeywordSearch: () => ({
    deleteByProject: (...args: unknown[]) => keywordDeleteByProject(...args),
  }),
  workspaceManager: {
    ...actualCore.workspaceManager,
    removeWorkspace: (...args: unknown[]) => removeWorkspace(...args),
  },
  createProjectIdentityService: () => ({
    preview: (...args: unknown[]) => projectIdentityPreview(...args),
    apply: (...args: unknown[]) => projectIdentityApply(...args),
  }),
  getHookService: () => ({
    ingestBatch: (...args: unknown[]) => hookIngestBatch(...args),
  }),
  getBootstrapService: () => ({
    bootstrap: (...args: unknown[]) => bootstrapRun(...args),
  }),
  getHandoffService: () => ({
    begin: (...args: unknown[]) => handoffBegin(...args),
    listPending: (...args: unknown[]) => handoffListPending(...args),
  }),
  getAutoImproveJob: () => ({
    listPending: (...args: unknown[]) => autoImproveListPending(...args),
  }),
}));

const { EmbeddedApiClient } = await import("../embedded-api-client.js");
const { ApiHttpError } = await import("../api-client.js");
const { QueueSaturatedError, ValidationError, ProjectIdentityError } = await import("@massa-ai/core");

const client = new EmbeddedApiClient();

afterAll(() => {
  rmSync(SCRATCH_CONFIG_HOME, { recursive: true, force: true });
});

beforeEach(() => {
  memorySearch.mockClear();
  memoryDeleteByProject.mockClear();
  vectorDeleteByProject.mockClear();
  keywordDeleteByProject.mockClear();
  removeWorkspace.mockClear();
  projectIdentityPreview.mockClear();
  projectIdentityApply.mockClear();
  hookIngestBatch.mockClear();
  bootstrapRun.mockClear();
  handoffBegin.mockClear();
  handoffListPending.mockClear();
  autoImproveListPending.mockClear();
});

/** Call a method; return { result } on success or { err } on failure. */
async function call(fn: () => Promise<unknown>): Promise<{ result?: unknown; err?: unknown }> {
  try {
    return { result: await fn() };
  } catch (err) {
    return { err };
  }
}

describe("EmbeddedApiClient handleMemoryList error mapping", () => {
  test("repo.search throwing → {success:false, error} envelope, not a thrown ApiHttpError", async () => {
    memorySearch.mockImplementationOnce(() => {
      throw new Error("db unreachable");
    });
    const result = (await client.post("/api/v1/memory/list", {})) as any;
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Failed to list memories");
    expect(String(result.error)).toContain("db unreachable");
  });
});

describe("EmbeddedApiClient handleProjectReset error mapping", () => {
  test("vectors + symbols + memories all fail → success:false with 3 collected errors", async () => {
    vectorDeleteByProject.mockImplementationOnce(() => {
      throw new Error("vector store down");
    });
    removeWorkspace.mockImplementationOnce(() => {
      throw new Error("symbol repo down");
    });
    memoryDeleteByProject.mockImplementationOnce(() => {
      throw new Error("memory repo down");
    });
    const result = (await client.post("/api/v1/project/reset", { projectId: "p" })) as any;
    expect(result.success).toBe(false);
    expect(result.data.errors).toHaveLength(3);
    expect(result.data.errors.join(" | ")).toContain("vectors: vector store down");
    expect(result.data.errors.join(" | ")).toContain("symbols: symbol repo down");
    expect(result.data.errors.join(" | ")).toContain("memories: memory repo down");
  });
});

describe("EmbeddedApiClient handleProjectIdentity error mapping", () => {
  test("a non-ProjectIdentityError from service.preview() propagates as a generic 500", async () => {
    projectIdentityPreview.mockImplementationOnce(() => {
      throw new Error("unexpected identity-service failure");
    });
    const { err } = await call(() =>
      client.post("/api/v1/project/rename", { sourceProjectId: "a", targetProjectId: "b" }),
    );
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpErrorType).status).toBe(500);
    expect(String((err as ApiHttpErrorType).body?.error)).toContain("unexpected identity-service failure");
  });

  test("a real ProjectIdentityError from service.apply() maps to its own statusCode", async () => {
    projectIdentityApply.mockImplementationOnce(() => {
      throw new ProjectIdentityError("PROJECT_IDENTITY_PLAN_CHANGED");
    });
    const { err } = await call(() =>
      client.post("/api/v1/project/merge", {
        sourceProjectId: "a",
        targetProjectId: "b",
        dryRun: false,
        operationId: "op1",
        expectedPlanHash: "stale",
      }),
    );
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpErrorType).status).toBe(409);
    expect(String((err as ApiHttpErrorType).body?.error)).toContain("preview has changed");
  });
});

describe("EmbeddedApiClient handleHookBatch error mapping", () => {
  test("QueueSaturatedError → 429", async () => {
    hookIngestBatch.mockImplementationOnce(() => {
      throw new QueueSaturatedError();
    });
    const { err } = await call(() => client.post("/api/v1/hook/batch", { events: [] }));
    expect((err as ApiHttpErrorType)?.status).toBe(429);
  });

  test("ValidationError → its own .code", async () => {
    hookIngestBatch.mockImplementationOnce(() => {
      throw new ValidationError(413, "event payload too large");
    });
    const { err } = await call(() => client.post("/api/v1/hook/batch", { events: [] }));
    expect((err as ApiHttpErrorType)?.status).toBe(413);
    expect(String((err as ApiHttpErrorType)?.body?.error)).toContain("event payload too large");
  });

  test("an unrecognized error → 500 naming the writer queue as unavailable", async () => {
    hookIngestBatch.mockImplementationOnce(() => {
      throw new Error("connection reset");
    });
    const { err } = await call(() => client.post("/api/v1/hook/batch", { events: [] }));
    expect((err as ApiHttpErrorType)?.status).toBe(500);
    expect(String((err as ApiHttpErrorType)?.body?.error)).toContain("hook service unavailable");
  });
});

describe("EmbeddedApiClient handleBootstrap error mapping", () => {
  test("bootstrap() throwing → 500 naming the failure", async () => {
    bootstrapRun.mockImplementationOnce(() => {
      throw new Error("workspace scan failed");
    });
    const { err } = await call(() => client.post("/api/v1/bootstrap", { projectId: "p" }));
    expect((err as ApiHttpErrorType)?.status).toBe(500);
    expect(String((err as ApiHttpErrorType)?.body?.error)).toContain("bootstrap failed");
    expect(String((err as ApiHttpErrorType)?.body?.error)).toContain("workspace scan failed");
  });
});

describe("EmbeddedApiClient handleHandoffBegin error mapping", () => {
  test("HandoffService.begin() throwing → 500 naming the failure", async () => {
    handoffBegin.mockImplementationOnce(() => {
      throw new Error("write conflict");
    });
    const { err } = await call(() => client.post("/api/v1/handoff/begin", { projectId: "p" }));
    expect((err as ApiHttpErrorType)?.status).toBe(500);
    expect(String((err as ApiHttpErrorType)?.body?.error)).toContain("handoff begin failed");
  });
});

describe("EmbeddedApiClient handleHandoffList error mapping", () => {
  test("HandoffService.listPending() throwing → 500 naming the failure", async () => {
    handoffListPending.mockImplementationOnce(() => {
      throw new Error("read replica lagging");
    });
    const { err } = await call(() => client.post("/api/v1/handoff/list", { projectId: "p" }));
    expect((err as ApiHttpErrorType)?.status).toBe(500);
    expect(String((err as ApiHttpErrorType)?.body?.error)).toContain("handoff list failed");
  });
});

describe("EmbeddedApiClient handleProposalList error mapping", () => {
  test("AutoImproveJob.listPending() throwing → 500 naming the failure", async () => {
    autoImproveListPending.mockImplementationOnce(() => {
      throw new Error("job queue unavailable");
    });
    const { err } = await call(() => client.post("/api/v1/proposal/list", { projectId: "p" }));
    expect((err as ApiHttpErrorType)?.status).toBe(500);
    expect(String((err as ApiHttpErrorType)?.body?.error)).toContain("proposal list failed");
  });
});
