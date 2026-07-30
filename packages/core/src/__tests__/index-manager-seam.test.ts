/**
 * The F4 `IndexManager` injection seam — PR-B T11's sensor.
 *
 * T11 is the only task in PR-B that *adds* a seam rather than moving one. Every
 * other collaborator on `ContextualSearchRLM` arrives from a factory that
 * `injectedDeps` can pre-empt; `IndexManager` was built by direct construction
 * inside `ensureInitialized`, with no field to override it (design.md §2.3 F4,
 * D-R5: "smallest possible change — add the `injectedDeps` field, default to
 * today's direct construction").
 *
 * **Two things need sensing, and the second is why this file exists.** A parity
 * test alone exercises only the default path, so it cannot fail on a seam that is
 * wired but never consulted — that is finding 7 of the plan challenge against
 * `tasks.md`, and it is the reason T11's row demands "one positive test that an
 * injected stub `IndexManager` is actually read" on top of parity. Measured
 * before writing this file: the repository's only assertion about this member is
 * `rlm-indexing.test.ts:201`'s `expect((rlm as any).indexManager).toBeDefined()`,
 * which survives every seam defect except deleting the default construction
 * outright.
 *
 * **Zero `mock.module` calls, and that is deliberate.** Injecting all five stores
 * makes `ensureInitialized` skip every factory, so nothing here can fall through
 * to live embedding-provider auto-selection — the failure mode that turns a core
 * suite into a 40-second cold model load. Six existing suites already construct
 * this facade with zero mocks, so the shape is established, not invented here.
 *
 * **The `deps` object literal is not cast, and that is the point.** The five
 * stores are cast individually because they stand in for real store interfaces
 * this file never dereferences; the literal *itself* stays un-cast so TypeScript
 * checks `indexManager` against the newly-declared field. A trailing `as any` —
 * the idiom in the older indexing suites — would make the seam's type unproven
 * and would also swallow the mirror defect, where the field is added to
 * `injectedDeps` but not to the constructor's parameter type. The injected stub is
 * a **real `IndexManager`** for the same reason: the class has private state, so
 * no structural literal can satisfy it, and a cast would prove nothing about the
 * declared type.
 */

import { describe, test, expect } from "bun:test";
import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";
import { IndexManager } from "../services/search/index-manager.js";

/** A vector-store stand-in. Identity is all this file reads off it. */
function vectorStoreStub(): any {
  return { search: async () => [] };
}

/**
 * The four stores whose identity this file does not care about, plus the vector
 * store, which it does — `IndexManager`'s constructor takes it, so the default
 * path's wiring is observable through it.
 */
function stores(vectorStore: any) {
  return {
    vectorStore,
    keywordSearch: { searchWithFilter: async () => [] } as any,
    searchCache: { get: async () => null, set: async () => {} } as any,
    analytics: { trackSearch: () => {} } as any,
    symbolRepo: { getCentrality: async () => new Map() } as any,
  };
}

describe("F4 — the IndexManager injection seam", () => {
  test("nothing injected → constructs an IndexManager over the resolved vector store", async () => {
    const vectorStore = vectorStoreStub();
    const rlm = new ContextualSearchRLM(stores(vectorStore));

    await rlm.ensureInitialized();

    // Parity with pre-T11 behaviour: the default path still constructs.
    expect(rlm.indexManager instanceof IndexManager).toBe(true);
    // And it is wired to the store this init actually resolved. This is the
    // assertion that distinguishes a correctly-ordered default from one hoisted
    // above the `Promise.all`, which would hand the manager `undefined` and
    // still satisfy the `instanceof` check above.
    expect((rlm.indexManager as any).vectorStore).toBe(vectorStore);
    expect(rlm.vectorStore).toBe(vectorStore);
  });

  test("indexManager injected → the seam is read, and nothing is constructed over it", async () => {
    const resolvedVectorStore = vectorStoreStub();
    const seamVectorStore = vectorStoreStub();
    // Typed, not cast — `indexManager?: IndexManager` is checked against this.
    const injected = new IndexManager(seamVectorStore);

    const rlm = new ContextualSearchRLM({
      ...stores(resolvedVectorStore),
      indexManager: injected,
    });

    await rlm.ensureInitialized();

    // The seam is consulted: identity, not shape.
    expect(rlm.indexManager).toBe(injected);
    // And the default construction did not also run and overwrite it. Two
    // distinct vector stores make that observable — a facade that ignored the
    // seam would hold a manager over `resolvedVectorStore` instead, which
    // `toBe(injected)` above catches, while this pins *which* store survived so
    // the failure names the cause rather than just the symptom.
    expect((rlm.indexManager as any).vectorStore).toBe(seamVectorStore);
    expect(rlm.vectorStore).toBe(resolvedVectorStore);
  });

  test("already initialized → the seam is not retro-fitted, matching the early return", async () => {
    // `ensureInitialized` returns before any assignment when `initialized` is
    // already true. ~25 test sites across the indexing suites set that flag to
    // skip factory resolution, and T11 must not change what they skip: the seam
    // is read during init, not applied to a facade that has already run it.
    const rlm = new ContextualSearchRLM({
      ...stores(vectorStoreStub()),
      indexManager: new IndexManager(vectorStoreStub()),
    });
    rlm.initialized = true;

    await rlm.ensureInitialized();

    expect(rlm.indexManager).toBeUndefined();
    expect(rlm.vectorStore).toBeUndefined();
  });
});
