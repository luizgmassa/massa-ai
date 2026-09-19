/**
 * LIP-15 — index invalidation on provider/model switch (T09).
 *
 * Two gates, tested independently:
 *   1. Read gate — checkSearchAdmission (project-indexer.ts) returns an
 *      `embeddingMismatch` descriptor on a stored/live disagreement; the
 *      search entry path (search-controller.ts) is what actually throws
 *      EmbeddingIndexStaleError and never calls search().
 *   2. Write gate — ensureFreshIndex (project-indexer.ts) forces the full
 *      "clearing" branch on a fingerprint mismatch, even when the staleness
 *      reason alone would have taken the incremental branch, and stamps the
 *      fingerprint only from that clearing branch.
 *
 * Mocks the two collaborators T09 calls directly (not through IndexerDeps —
 * see project-indexer.ts's ManagedRunRepositoryPg precedent):
 * data/symbol/symbol-repo-workspace.js and services/embeddings/config.js.
 * Neither is exercised against a real database here — T08 already proved the
 * column persists against real Postgres.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.restore();

let storedFingerprint: string | null = null;
const stampCalls: Array<{ projectId: string; fingerprint: string }> = [];

mock.module("../data/symbol/symbol-repo-workspace.js", () => ({
  getEmbeddingFingerprint: async (_projectId: string) => storedFingerprint,
  stampEmbeddingFingerprint: async (projectId: string, fingerprint: string) => {
    stampCalls.push({ projectId, fingerprint });
  },
}));

let activeProvider = { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560, priority: 1 };

mock.module("../services/embeddings/config.js", () => ({
  getProvidersByPriority: () => [["ollama", activeProvider]],
}));

mock.module("../services/events/event-bus.js", () => ({
  eventBus: { publish: () => {} },
}));

mock.module("../data/managed-runs/managed-run-repository-pg.js", () => ({
  ManagedRunRepositoryPg: {
    getInstance: () => ({
      begin: async () => ({ status: "ok", lease: { id: "lease-1" } }),
      complete: async () => {},
      abort: async () => {},
    }),
  },
}));

mock.module("../kernel/alias-resolver.js", () => ({
  getProjectIdentityAliasResolver: () => ({ resolve: async (id: string) => id }),
}));

import {
  checkSearchAdmission,
  ensureFreshIndex,
  currentEmbeddingFingerprint,
  EmbeddingIndexStaleError,
  type IndexerDeps,
} from "../services/search/project-indexer.js";

function baseDeps(overrides: Partial<IndexerDeps> = {}): IndexerDeps {
  return {
    indexManager: {
      getIndexMetadata: async () => ({ projectId: "p", lastIndexed: Date.now() }) as any,
      isIndexStale: async () => ({ isStale: false }),
      getFilesToReindex: async () => [],
      updateIndexMetadata: async () => {},
    },
    symbolRepo: { getCentrality: async () => new Map() } as any,
    keywordSearch: {} as any,
    vectorStore: {} as any,
    searchCache: { invalidateProject: async () => {} } as any,
    indexFile: async () => ({ chunks: 0 }),
    indexProject: async () => ({ filesIndexed: 0, chunksIndexed: 0, errors: 0 }),
    ...overrides,
  };
}

beforeEach(() => {
  storedFingerprint = null;
  stampCalls.length = 0;
  activeProvider = { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560, priority: 1 };
});

// ── currentEmbeddingFingerprint ─────────────────────────────────────────────

describe("currentEmbeddingFingerprint", () => {
  test("formats provider:model:dimensions from the priority-1 provider", () => {
    expect(currentEmbeddingFingerprint()).toBe("ollama:qwen3-embedding:4b:2560");
  });

  test("null when the priority-1 entry is missing a component", () => {
    activeProvider = { provider: "ollama", model: "qwen3-embedding:4b", dimensions: undefined as any, priority: 1 };
    expect(currentEmbeddingFingerprint()).toBeNull();
  });
});

// ── checkSearchAdmission — read gate ─────────────────────────────────────────

describe("checkSearchAdmission — LIP-15 read gate", () => {
  test("no stored fingerprint (legacy/never-stamped) → admitted, no mismatch", async () => {
    storedFingerprint = null;
    const result = await checkSearchAdmission(baseDeps(), "p");
    expect(result.admitted).toBe(true);
    expect(result.embeddingMismatch).toBeUndefined();
  });

  test("stored fingerprint matches live → admitted, no mismatch", async () => {
    storedFingerprint = "ollama:qwen3-embedding:4b:2560";
    const result = await checkSearchAdmission(baseDeps(), "p");
    expect(result.admitted).toBe(true);
    expect(result.embeddingMismatch).toBeUndefined();
  });

  test("width-identical model change → admission carries embeddingMismatch, never admits", async () => {
    // Same 2560 width, different model: exactly the case a width-only check
    // would miss (design.md §5 — "width identical" is the silent-mixing case).
    storedFingerprint = "ollama:llama3-embed:2560";
    activeProvider = { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560, priority: 1 };
    const result = await checkSearchAdmission(baseDeps(), "p");
    expect(result.admitted).toBe(false);
    expect(result.embeddingMismatch).toEqual({
      stored: "ollama:llama3-embed:2560",
      current: "ollama:qwen3-embedding:4b:2560",
    });
  });

  test("provider change, width differs → admission carries embeddingMismatch", async () => {
    storedFingerprint = "ollama:qwen3-embedding:4b:2560";
    activeProvider = { provider: "custom", model: "text-embedding-nomic-embed-text-v1.5", dimensions: 768, priority: 1 };
    const result = await checkSearchAdmission(baseDeps(), "p");
    expect(result.admitted).toBe(false);
    expect(result.embeddingMismatch?.stored).toBe("ollama:qwen3-embedding:4b:2560");
    expect(result.embeddingMismatch?.current).toBe("custom:text-embedding-nomic-embed-text-v1.5:768");
  });
});

// ── EmbeddingIndexStaleError ─────────────────────────────────────────────────

describe("EmbeddingIndexStaleError", () => {
  test("names both fingerprints and the reindex command", () => {
    const err = new EmbeddingIndexStaleError("proj-1", "ollama:a:2560", "ollama:b:2560");
    expect(err.name).toBe("EmbeddingIndexStaleError");
    expect(err.message).toContain("ollama:a:2560");
    expect(err.message).toContain("ollama:b:2560");
    expect(err.message).toContain("index_project");
    expect(err.message).toContain("forceReindex");
  });
});

// ── ensureFreshIndex — write gate ───────────────────────────────────────────

describe("ensureFreshIndex — LIP-15 write gate", () => {
  test("width-identical model change on a files_changed (incremental-shaped) request → forced full reindex", async () => {
    // Stored fingerprint disagrees with live, same width (2560). The reason
    // reported by the staleness check is "files_changed" with one file — on
    // its own that is exactly the incremental branch (see the sibling
    // "stale + files_changed + incremental reindex" case in
    // search-facade-indexing.test.ts). The fingerprint mismatch must force
    // the full/clearing branch instead.
    storedFingerprint = "ollama:llama3-embed:2560";
    activeProvider = { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560, priority: 1 };

    let indexProjectCalls = 0;
    let indexFileCalls = 0;
    const deps = baseDeps({
      indexManager: {
        getIndexMetadata: async () => null as any,
        isIndexStale: async () => ({ isStale: true, reason: "files_changed" }),
        getFilesToReindex: async () => ["a.ts"],
        updateIndexMetadata: async () => {},
      },
      indexProject: async () => {
        indexProjectCalls++;
        return { filesIndexed: 1, chunksIndexed: 1, errors: 0 };
      },
      indexFile: async () => {
        indexFileCalls++;
        return { chunks: 1 };
      },
    });

    const result = await ensureFreshIndex(deps, "p", "/path", { allowFullReindex: true });

    expect(result.reindexed).toBe(true);
    expect(result.reason).toBe("full_reindex");
    // Forced full: the whole-project indexProject ran, not the per-file
    // incremental loop.
    expect(indexProjectCalls).toBe(1);
    expect(indexFileCalls).toBe(0);
  });

  test("forced full reindex stamps the fingerprint only after it completes (the clearing branch)", async () => {
    storedFingerprint = "ollama:llama3-embed:2560";
    activeProvider = { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560, priority: 1 };

    const deps = baseDeps({
      indexManager: {
        getIndexMetadata: async () => null as any,
        isIndexStale: async () => ({ isStale: true, reason: "files_changed" }),
        getFilesToReindex: async () => ["a.ts"],
        updateIndexMetadata: async () => {},
      },
    });

    await ensureFreshIndex(deps, "p", "/path", { allowFullReindex: true });

    expect(stampCalls).toEqual([{ projectId: "p", fingerprint: "ollama:qwen3-embedding:4b:2560" }]);
  });

  test("the incremental branch never stamps, even when it runs", async () => {
    // No fingerprint mismatch here — the ordinary incremental path from
    // search-facade-indexing.test.ts, re-asserted for the one property that
    // file cannot see: stampEmbeddingFingerprint is never called from it.
    storedFingerprint = "ollama:qwen3-embedding:4b:2560";
    activeProvider = { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560, priority: 1 };

    const deps = baseDeps({
      indexManager: {
        getIndexMetadata: async () => null as any,
        isIndexStale: async () => ({ isStale: true, reason: "files_changed" }),
        getFilesToReindex: async () => ["a.ts"],
        updateIndexMetadata: async () => {},
      },
    });

    const result = await ensureFreshIndex(deps, "p", "/path");

    expect(result.reason).toBe("incremental_reindex");
    expect(stampCalls).toEqual([]);
  });

  test("deferred (allowFullReindex: false) on a fingerprint mismatch never reindexes and never stamps", async () => {
    storedFingerprint = "ollama:llama3-embed:2560";
    activeProvider = { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560, priority: 1 };

    const deps = baseDeps({
      indexManager: {
        getIndexMetadata: async () => null as any,
        isIndexStale: async () => ({ isStale: true, reason: "files_changed" }),
        getFilesToReindex: async () => ["a.ts"],
        updateIndexMetadata: async () => {},
      },
    });

    const result = await ensureFreshIndex(deps, "p", "/path", { allowFullReindex: false });

    expect(result.deferred).toBe(true);
    expect(result.reindexed).toBe(false);
    expect(stampCalls).toEqual([]);
  });
});

// ── Search entry path — search-controller.ts throws, never returns rows ────

describe("SearchController.searchProject — LIP-15 read gate at the search entry path", () => {
  test("embeddingMismatch admission → throws EmbeddingIndexStaleError and never calls search()", async () => {
    let searchCalled = false;
    mock.module("../services/search/contextual-search-rlm.js", () => ({
      ContextualSearchRLM: class {
        async checkSearchAdmission() {
          return {
            admitted: false,
            embeddingMismatch: { stored: "ollama:a:2560", current: "ollama:b:2560" },
          };
        }
        async ensureFreshIndex() {
          return { wasStale: false, reindexed: false };
        }
        async search() {
          searchCalled = true;
          return [];
        }
      },
    }));
    mock.module("../services/search/reranker.js", () => ({
      LLMJudgeReranker: class {
        async rerank(_q: string, results: any[]) {
          return results;
        }
      },
    }));

    const { SearchController } = await import("../services/search/search-controller.js");
    (SearchController as any).instance = null;
    const ctrl = SearchController.getInstance();

    await expect(
      ctrl.searchProject({ query: "q", projectId: "p" }),
    ).rejects.toThrow(/ollama:a:2560/);
    expect(searchCalled).toBe(false);
  });
});
