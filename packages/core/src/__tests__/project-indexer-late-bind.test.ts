/**
 * LATE-BIND sensor for the facade → project-indexer seam (PR-B T10).
 *
 * **Measured, not inherited.** T8 recorded that LATE-BIND "self-heals from T9
 * onward" and that "T10's members 18/7/4/4 … likewise" make the ordinary sensor
 * sufficient. T9 showed the reasoning uses the wrong quantity and required T10,
 * T12 and T13 each to run the memo mutation against their own surface. T10 did.
 * `search-facade-indexing.test.ts` holds 52 of the ~80 post-construction assignment sites
 * — the richest LATE-BIND surface in the repository — and it is **still blind**:
 *
 * | violation                           | tsc | coverage | rlm-indexing | concurrent-indexing |
 * | ----------------------------------- | --- | -------- | ------------ | ------------------- |
 * | record captured at **construction** |  0  | 33 / 8   | **8 / 17**   | 9 / 0               |
 * | record **memoised on first call**   |  0  | 41 / 0   | **25 / 0**   | 9 / 0               |
 *
 * Same split as T9's, and for the same reason: every site does construct →
 * assign field → call, so a memo populated on the first call captures the
 * correct value. Detecting one needs a collaborator to **change between two
 * calls on one instance**, and the number of tests doing that is zero. Test 2
 * below is that shape. So the assignment-site count is not the quantity that
 * governs detectability — at T10 it is the largest it will ever be and it still
 * proves nothing.
 *
 * A separate file rather than cases added to
 * contextual-search-rlm-coverage.test.ts, because AC-3 pins that file at exactly
 * **41** tests; and `session-bias-late-bind.test.ts` / `hybrid-search-late-bind.test.ts`
 * are left untouched at 3 each rather than extended, because editing a guard
 * during the refactor it polices is indistinguishable from weakening it.
 *
 * **It carries a fourth test the two earlier sensors do not need.** `IndexerDeps`
 * is the first deps record with *re-entrant* members: `indexFile` and
 * `indexProject` are the root's own methods, reached back through arrow wrappers,
 * and six sites in `search-facade-indexing.test.ts` stub those two methods on the instance
 * (:335, :377, :402, :537, :572, :609). A fresh closure cannot be identity-checked,
 * so `contextual-search-rlm-coverage.test.ts` can only match them with
 * `expect.any(Function)`. Test 4 is what makes that acceptable: it proves the
 * closures re-resolve `this.<method>` at **call** time, which is the property
 * `.bind(this)` at assembly time or a bare method reference would silently lose.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.restore();

// Spy on the capability module so the deps record the facade assembles is
// directly observable. This is the only interception in the file. Only
// `checkSearchAdmission` is replaced — the real module is never loaded, which is
// deliberate: requiring it would drag in smart-chunker and the native
// tree-sitter grammars for a test that reads one object literal.
const checkSearchAdmissionSpy = mock(async () => ({ admitted: true }));

mock.module("../services/search/project-indexer.js", () => ({
  checkSearchAdmission: checkSearchAdmissionSpy,
}));

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";

/** The seven keys `IndexerDeps` declares at T10, in assembly order. */
const DEPS_KEYS = [
  "indexManager",
  "symbolRepo",
  "keywordSearch",
  "vectorStore",
  "searchCache",
  "indexFile",
  "indexProject",
];

const STORE_KEYS = DEPS_KEYS.slice(0, 5);

/** The deps record the facade passed on call `n`. */
function depsArg(n: number): Record<string, unknown> {
  return checkSearchAdmissionSpy.mock.calls[n]![0] as unknown as Record<string, unknown>;
}

/** Just the five store members of call `n` — the callbacks are fresh closures. */
function stores(n: number): Record<string, unknown> {
  return Object.fromEntries(STORE_KEYS.map((k) => [k, depsArg(n)[k]]));
}

/**
 * A subject that skips lazy init. `initialized = true` is the established idiom
 * (25 sites, design.md §4.3.1) and it is what keeps this file off the real
 * factories: `checkSearchAdmission` awaits `ensureInitialized()` first, and that
 * body now lives in the root as of T10.
 */
function makeRlm(): ContextualSearchRLM {
  const rlm = new ContextualSearchRLM();
  (rlm as any).initialized = true;
  return rlm;
}

beforeEach(() => {
  checkSearchAdmissionSpy.mockClear();
});

describe("LATE-BIND — the facade assembles IndexerDeps per call", () => {
  test("each call gets a freshly built record, not a captured one", async () => {
    const rlm = makeRlm();
    (rlm as any).indexManager = { tag: "im" };

    await rlm.checkSearchAdmission("p1");
    await rlm.checkSearchAdmission("p2");

    expect(checkSearchAdmissionSpy).toHaveBeenCalledTimes(2);
    // Distinct objects: a constructor-time or memoised capture hands the same
    // reference to both calls. This is the assertion that fires.
    expect(depsArg(0)).not.toBe(depsArg(1));
    // The two re-entrant closures are rebuilt too. `.bind(this)` hoisted to the
    // constructor would keep one identity across every call, and it is the
    // plausible "optimisation" that breaks call-time dispatch.
    expect(depsArg(0).indexFile).not.toBe(depsArg(1).indexFile);
    expect(depsArg(0).indexProject).not.toBe(depsArg(1).indexProject);
    // ...while the stores still carry identical contents, so "fresh" does not
    // mean "recomputed differently".
    expect(stores(0)).toEqual(stores(1));
  });

  test("the record tracks the live field when it changes between two calls on one instance", async () => {
    const rlm = makeRlm();
    const first = { tag: "first" };
    const second = { tag: "second" };

    (rlm as any).indexManager = first;
    await rlm.checkSearchAdmission("p");
    // Re-stub *between* calls. This is the shape no other test in the repository
    // performs, and the only thing a first-call memo cannot survive: a memo
    // populated on call 1 hands `first` to call 2 as well. Measured above as
    // invisible to all seven characterization suites.
    (rlm as any).indexManager = second;
    await rlm.checkSearchAdmission("p");

    expect(depsArg(0).indexManager).toBe(first);
    expect(depsArg(1).indexManager).toBe(second);
  });

  test("the record carries exactly the seven keys IndexerDeps declares at T10", async () => {
    const rlm = makeRlm();

    await rlm.checkSearchAdmission("p");

    // A record that grew a field would be the root leaking state back into a
    // capability module — the coupling G-HUB exists to measure, arriving by the
    // one route G-HUB cannot see, because a deps record is not a
    // `: ContextualSearchRLM` dereference.
    expect(Object.keys(depsArg(0))).toEqual(DEPS_KEYS);
  });

  test("the re-entrant callbacks dispatch through the instance at call time, not at assembly time", async () => {
    const rlm = makeRlm();
    await rlm.checkSearchAdmission("p");
    const record = depsArg(0);

    // One captured record, two different instance stubs, invoked through the
    // *same* closure. `.bind(this)` or a bare `indexFile: this.indexFile` would
    // resolve the method when the record was assembled and run `first` twice —
    // which is exactly how the six sites that stub these methods on the instance
    // would go silently ineffective while every suite stayed green.
    const seen: string[] = [];
    (rlm as any).indexFile = async () => { seen.push("first"); return { chunks: 1 }; };
    await (record.indexFile as (...a: unknown[]) => Promise<unknown>)("f", "p", "/r");
    (rlm as any).indexFile = async () => { seen.push("second"); return { chunks: 2 }; };
    await (record.indexFile as (...a: unknown[]) => Promise<unknown>)("f", "p", "/r");

    expect(seen).toEqual(["first", "second"]);

    const projects: string[] = [];
    (rlm as any).indexProject = async () => { projects.push("a"); return { filesIndexed: 0, chunksIndexed: 0, errors: 0 }; };
    await (record.indexProject as (...a: unknown[]) => Promise<unknown>)("/root", "p");
    (rlm as any).indexProject = async () => { projects.push("b"); return { filesIndexed: 0, chunksIndexed: 0, errors: 0 }; };
    await (record.indexProject as (...a: unknown[]) => Promise<unknown>)("/root", "p");

    expect(projects).toEqual(["a", "b"]);
  });
});
