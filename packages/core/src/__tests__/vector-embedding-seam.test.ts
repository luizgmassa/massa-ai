/**
 * PR-C T4 — the embeddings seam (GMS-01 AC-4's last `data -> services` edge).
 *
 * `data/vector/base-vector-store.ts` used to call `createEmbeddingProvider` from
 * `services/embeddings/index.js` directly. That import was the 26th and final
 * `data -> services` edge, and closing it with an allowlist entry was ruled out —
 * design.md §3 and tasks.md T5 both require the group's allowlist to be empty, or
 * AC-1's check stops discriminating.
 *
 * The resolution moves the *composition* rather than the *capability*:
 * `services/vector/vector-store-factory.ts` is the vector subsystem's composition
 * root, it may legally import both halves, and it passes the provider factory into
 * the store's constructor.
 *
 * R-13 asks for the T11/F4 discipline on the one seam PR-C adds: default path
 * retained, parity proven, violation shapes observed red. This file is that.
 * Two things are being asserted, and they are different:
 *
 *   1. PARITY — the relocated default is the *same* call, made at the *same*
 *      time. Provider selection is still deferred to first embedding use, not
 *      pulled forward to construction. design.md §3 names that timing as the
 *      property a naive "take the provider as a constructor dependency" rewrite
 *      would have broken.
 *   2. VIOLATION SHAPES — a store built without a factory fails loudly, rather
 *      than silently reaching a live provider. That failure mode is not
 *      hypothetical: CLAUDE.md documents it as a recurring cause of 5001 ms test
 *      timeouts, and `postgres-vector-store.integration.test.ts` was relying on it.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  SearchResult,
  VectorDocument,
  VectorStoreStats,
  ProjectInfo,
  IVectorCollection,
  type VectorEmbeddingProvider,
} from "@massa-ai/shared";

// ── Seam observation for the composition root ────────────────────────────────
// The factory is the subject in §2 below, so both of its collaborators are
// mocked: the store it constructs (to capture the config it is handed) and the
// embeddings barrel (to count *when* the provider is actually built).

let capturedConfig: Record<string, unknown> | null = null;
let createProviderCalls: unknown[] = [];

const fakeProvider: VectorEmbeddingProvider = {
  dimensions: 384,
  async embedQuery(text: string) { return [text.length]; },
  async embedBatch(texts: string[]) { return texts.map((t) => [t.length]); },
};

mock.module("../data/vector/postgres-vector-store.js", () => ({
  PostgresVectorStore: class {
    constructor(config: Record<string, unknown>) { capturedConfig = config; }
    async ensureInitialized() {}
    async healthCheck() { return true; }
    async close() {}
  },
}));

mock.module("../services/embeddings/index.js", () => ({
  createEmbeddingProvider: mock(async (options?: unknown) => {
    createProviderCalls.push(options);
    return fakeProvider;
  }),
}));

import { BaseVectorStore } from "../data/vector/base-vector-store.js";
import { getVectorStore, resetVectorStore } from "../services/vector/vector-store-factory.js";

/** Minimal concrete store: exposes the protected embedding surface, touches no DB. */
class TestableVectorStore extends BaseVectorStore {
  public constructor(options?: ConstructorParameters<typeof BaseVectorStore>[0]) {
    super(options);
  }
  public providerPromiseField() { return (this as any).embeddingProviderPromise; }
  public callGetEmbeddingDimensions() { return this.getEmbeddingDimensions(); }
  public callEmbedContent(content: string) { return this.embedContent(content); }
  public callEmbedBatch(contents: string[]) { return this.embedBatch(contents); }
  public callGetEmbeddingProvider() { return (this as any).getEmbeddingProvider(); }

  async addDocument(): Promise<void> {}
  async addDocuments(_d: VectorDocument[]): Promise<void> {}
  async search(): Promise<SearchResult[]> { return []; }
  async searchByEmbedding(): Promise<SearchResult[]> { return []; }
  async delete(): Promise<boolean> { return true; }
  async deleteByProject(): Promise<number> { return 0; }
  async update(): Promise<void> {}
  async getCollection(): Promise<IVectorCollection> { return {} as IVectorCollection; }
  async getStats(): Promise<VectorStoreStats> { return { totalDocuments: 0, totalSize: 0 }; }
  async listProjects(): Promise<ProjectInfo[]> { return []; }
  async healthCheck(): Promise<boolean> { return true; }
  async close(): Promise<void> {}
}

beforeEach(async () => {
  capturedConfig = null;
  createProviderCalls = [];
  await resetVectorStore();
});

// ── 1. Violation shapes — each one observed red before the seam is quotable ──

describe("T4 violation shapes — a store with no factory fails loudly", () => {
  test("getEmbeddingDimensions throws, naming the composition root", async () => {
    const store = new TestableVectorStore();
    expect(store.callGetEmbeddingDimensions()).rejects.toThrow(
      /no embeddingProviderFactory was supplied/,
    );
  });

  test("embedContent throws rather than reaching a live provider", async () => {
    const store = new TestableVectorStore();
    expect(store.callEmbedContent("x")).rejects.toThrow(
      /services\/vector\/vector-store-factory\.ts/,
    );
  });

  test("embedBatch throws rather than reaching a live provider", async () => {
    const store = new TestableVectorStore();
    expect(store.callEmbedBatch(["x"])).rejects.toThrow(
      /no embeddingProviderFactory was supplied/,
    );
  });

  test("the failure does NOT construct a provider as a side effect", async () => {
    const store = new TestableVectorStore();
    await store.callEmbedContent("x").catch(() => undefined);
    // The point of the throw is that nothing is auto-selected. If this ever
    // reads 1, the seam has grown a fallback and AC-4's edge is back.
    expect(createProviderCalls).toHaveLength(0);
  });
});

// ── 2. Parity — the relocated default is the same call at the same time ──────

describe("T4 parity — the composition root supplies the pre-seam default", () => {
  test("getVectorStore passes an embeddingProviderFactory into the store", async () => {
    await getVectorStore({ postgres: { connectionString: "postgres://parity" } });
    expect(capturedConfig).not.toBeNull();
    expect(typeof capturedConfig!.embeddingProviderFactory).toBe("function");
  });

  test("provider selection is deferred, not pulled forward to construction", async () => {
    await getVectorStore({ postgres: { connectionString: "postgres://parity" } });
    // design.md §3's stated invariant: `:57` was a lazily-assigned memoised
    // promise, so building the store must not build the provider. A constructor
    // dependency that resolved eagerly would make this 1 and change *when*
    // provider auto-selection happens.
    expect(createProviderCalls).toHaveLength(0);
  });

  test("invoking that factory makes exactly the pre-seam call", async () => {
    await getVectorStore({ postgres: { connectionString: "postgres://parity" } });
    const factory = capturedConfig!.embeddingProviderFactory as () => Promise<unknown>;
    const provider = await factory();
    // Byte-for-byte the call that used to sit inline in base-vector-store.ts:57.
    expect(createProviderCalls).toEqual([{ cache: true }]);
    expect(provider).toBe(fakeProvider);
  });

  test("an explicitly injected factory is used instead of the default", async () => {
    const injected = mock(async () => fakeProvider);
    const store = new TestableVectorStore({ embeddingProviderFactory: injected });
    expect(await store.callGetEmbeddingDimensions()).toBe(384);
    expect(injected).toHaveBeenCalledTimes(1);
    expect(createProviderCalls).toHaveLength(0);
  });

  test("a caller-supplied factory overrides the factory's default", async () => {
    const injected = mock(async () => fakeProvider);
    await getVectorStore({
      postgres: {
        connectionString: "postgres://parity",
        embeddingProviderFactory: injected,
      },
    });
    expect(capturedConfig!.embeddingProviderFactory).toBe(injected);
  });
});

// ── 3. The race-condition property the base class exists to hold ─────────────

describe("T4 parity — memoisation survives the seam", () => {
  test("concurrent callers share one provider construction", async () => {
    const injected = mock(async () => fakeProvider);
    const store = new TestableVectorStore({ embeddingProviderFactory: injected });
    const [a, b, c] = await Promise.all([
      store.callGetEmbeddingProvider(),
      store.callGetEmbeddingProvider(),
      store.callGetEmbeddingProvider(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    // The whole reason the field is a promise and not a provider.
    expect(injected).toHaveBeenCalledTimes(1);
  });

  test("the memoised field stays unset until first use", async () => {
    const store = new TestableVectorStore({ embeddingProviderFactory: async () => fakeProvider });
    expect(store.providerPromiseField()).toBeNull();
    await store.callGetEmbeddingProvider();
    expect(store.providerPromiseField()).not.toBeNull();
  });
});
