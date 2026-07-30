/**
 * LATE-BIND sensor for the facade → hybrid-search seam (PR-B T9).
 *
 * **Why this file exists, against T8's expectation that it would not need to.**
 * T8 recorded that LATE-BIND has no sensor for *its* two members and that "from
 * T9 on the ordinary sensor takes over — `keywordSearch` has 10
 * post-construction assignment sites". **The first half is right and the second
 * is wrong**, and T9 measured it rather than inheriting it.
 *
 * Measured at T9 on the finished code, two LATE-BIND violations run separately:
 *
 * | violation                          | tsc | coverage | rlm-synapse | ranking-regression |
 * | ---------------------------------- | --- | -------- | ----------- | ------------------ |
 * | record captured at **construction**|  0  | 40 / 1   | **21 / 5**  | **1 / 1**          |
 * | record **memoised on first call**  |  0  | 41 / 0   | 26 / 0      | 2 / 0              |
 *
 * The ordinary sensor catches the first shape loudly and is **completely blind
 * to the second**. The reason is that the assignment-site count is not the
 * quantity that governs detectability. All six sites that reach `correctQuery`
 * — `rlm-synapse.test.ts`'s five cases and `search-ranking-regression.test.ts:37`
 * — do construct → assign field → call. A first-call memo populates *after* the
 * assignment and therefore captures the correct value. Detecting a memo requires
 * a collaborator to **change between two calls on one instance**, and the number
 * of tests doing that is **zero**.
 *
 * So the constraint as literally worded ("never capture them at construction")
 * is sensored at T9 by the existing suites, and the memoised shape is not. This
 * file covers the second. Test 2 below is the one that creates the missing
 * shape; nothing else in the repository exercises it.
 *
 * The same correction applies to T10/T12/T13, whose sensor status T8 inferred
 * from the same wrong quantity. Each must run the memo mutation itself rather
 * than inherit the claim — recorded in tasks.md.
 *
 * It is a separate file rather than cases added to
 * contextual-search-rlm-coverage.test.ts because AC-3's check column pins that
 * file at exactly **41** tests; adding to it would move a pinned sensor, which
 * reads as drift no matter what the commit message says. Same reasoning as
 * session-bias-late-bind.test.ts, which stays untouched at 3 tests.
 *
 * These assert the *observable form* of "assembled per call, from current
 * fields": a fresh object every call, contents tracking the live field, and
 * exactly the one key `HybridSearchDeps` declares at T9. **T13 widens that
 * record to five collaborators** (design.md §4.1), and test 3 is the assertion
 * that must be updated when it does.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.restore();

// Spy on the capability module so the deps record the facade assembles is
// directly observable. This is the only interception in the file.
const correctQuerySpy = mock(async (): Promise<string | null> => null);

mock.module("../services/search/hybrid-search.js", () => ({
  correctQuery: correctQuerySpy,
}));

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";

/** A distinct, *defined* keyword-store stub — see the identity assertions below. */
function makeKeywordStore(tag: string) {
  return { fuzzyCorrect: async (w: string) => `${tag}:${w}` };
}

/** The deps record the facade passed on call `n`. */
function depsArg(n: number): Record<string, unknown> {
  return correctQuerySpy.mock.calls[n]![0] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  correctQuerySpy.mockClear();
});

describe("LATE-BIND — the facade assembles HybridSearchDeps per call", () => {
  test("each call gets a freshly built record, not a captured one", async () => {
    const rlm = new ContextualSearchRLM();
    (rlm as any).keywordSearch = makeKeywordStore("k");

    await rlm.correctQuery("q1");
    await rlm.correctQuery("q2");

    expect(correctQuerySpy).toHaveBeenCalledTimes(2);
    // Distinct objects: a constructor-time or memoised capture would hand the
    // same reference to both calls. This is the assertion that fires.
    expect(depsArg(0)).not.toBe(depsArg(1));
    // ...while still carrying identical contents, so "fresh" does not mean
    // "recomputed differently".
    expect(depsArg(0)).toEqual(depsArg(1));
  });

  test("the record tracks the live field when it changes between two calls on one instance", async () => {
    const rlm = new ContextualSearchRLM();
    const first = makeKeywordStore("first");
    const second = makeKeywordStore("second");

    (rlm as any).keywordSearch = first;
    await rlm.correctQuery("q");
    // Re-stub *between* calls. This is the shape no other test in the repository
    // performs, and it is the only thing a first-call memo cannot survive: a memo
    // populated on call 1 would hand `first` to call 2 as well.
    (rlm as any).keywordSearch = second;
    await rlm.correctQuery("q");

    expect(depsArg(0).keywordSearch).toBe(first);
    expect(depsArg(1).keywordSearch).toBe(second);
  });

  test("the record carries exactly the one key HybridSearchDeps declares at T9", async () => {
    const rlm = new ContextualSearchRLM();
    (rlm as any).keywordSearch = makeKeywordStore("k");

    await rlm.correctQuery("q");

    // A record that grew a field would be the root leaking state back into a
    // capability module — the coupling G-HUB exists to measure, arriving by the
    // one route G-HUB cannot see, because a deps record is not a
    // `: ContextualSearchRLM` dereference. T13 widens this to five keys.
    expect(Object.keys(depsArg(0))).toEqual(["keywordSearch"]);
  });
});
