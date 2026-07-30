/**
 * LATE-BIND sensor for the facade → index-admin seam (PR-B T12).
 *
 * **Measured, not inherited.** T9 established that the assignment-site count is
 * not the quantity governing detectability, and required T10, T12 and T13 to each
 * run the memo mutation against their own surface rather than cite the count. T10
 * did, at the richest surface in the repository, and was blind. T12 did too, and
 * the readings are in tasks.md under *T12 ran the memo mutation*.
 *
 * A separate file rather than cases added to
 * contextual-search-rlm-coverage.test.ts, because AC-3 pins that file at exactly
 * **41** tests; and `session-bias-late-bind.test.ts` /
 * `hybrid-search-late-bind.test.ts` / `project-indexer-late-bind.test.ts` are left
 * untouched at 3/3/4 rather than extended, because editing a guard during the
 * refactor it polices is indistinguishable from weakening it.
 *
 * **Test 2 is wider here than in the three earlier sensors, deliberately.** Each
 * of those reassigns exactly one field between the two calls
 * (`project-indexer-late-bind.test.ts:119-135` reassigns `indexManager` alone), so
 * a memo on any *other* field of the same record survives them. `IndexAdminDeps`
 * has five non-re-entrant fields and `rlm-admin.test.ts` already stubs two of
 * them post-construction (`fileFilterCache` :85,:96 and `analytics` :159), so this
 * file reassigns all five and asserts each by identity. Observed red under a memo
 * confined to a single field, which the one-field shape would have missed.
 *
 * **Test 4 is the compensating control for a seam no pre-existing test can see.**
 * `IndexAdminDeps.search` is re-entrant — the root's own method, handed over as an
 * arrow wrapper. `rlm.search` is stubbed at 7 instance sites
 * (`rlm-admin.test.ts:124,137,148`;
 * `contextual-search-rlm-coverage.test.ts:382,395,407,416`), and those are also
 * the *only* 7 calls to `warmupCache` in the suite — every one of which assigns
 * before it calls. So a bare `search: this.search` reference or a `.bind(this)` at
 * assembly time still captures the stub and the whole pre-existing suite stays
 * green. Test 4 swaps the stub *between two invocations of one captured closure*,
 * which is the only shape that separates call-time from assembly-time dispatch.
 *
 * The spied surface is `getAnalytics` for a reason: it is the one T12 delegate
 * that does not await `ensureInitialized`, so this file never reaches a factory,
 * never needs `initialized = true`, and never touches a database.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.restore();

// Spy on the capability module so the deps record the facade assembles is
// directly observable. This is the only interception in the file, and only
// `getAnalytics` is replaced — the real module is never loaded.
const getAnalyticsSpy = mock(() => ({ tag: "analytics-return" }) as any);

mock.module("../services/search/index-admin.js", () => ({
  getAnalytics: getAnalyticsSpy,
}));

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";

/** The six keys `IndexAdminDeps` declares at T12, in assembly order. */
const DEPS_KEYS = [
  "vectorStore",
  "keywordSearch",
  "searchCache",
  "fileFilterCache",
  "analytics",
  "search",
];

/** The five non-re-entrant members; `search` is a fresh closure per call. */
const STORE_KEYS = DEPS_KEYS.slice(0, 5);

/** The deps record the facade passed on call `n`. */
function depsArg(n: number): Record<string, unknown> {
  return getAnalyticsSpy.mock.calls[n]![0] as unknown as Record<string, unknown>;
}

function stores(n: number): Record<string, unknown> {
  return Object.fromEntries(STORE_KEYS.map((k) => [k, depsArg(n)[k]]));
}

/** Assign all five non-re-entrant fields to distinguishable sentinels. */
function seed(rlm: ContextualSearchRLM, tag: string): Record<string, unknown> {
  const values = Object.fromEntries(STORE_KEYS.map((k) => [k, { tag: `${tag}:${k}` }]));
  for (const k of STORE_KEYS) (rlm as any)[k] = values[k];
  return values;
}

beforeEach(() => {
  getAnalyticsSpy.mockClear();
});

describe("LATE-BIND — the facade assembles IndexAdminDeps per call", () => {
  test("each call gets a freshly built record, not a captured one", () => {
    const rlm = new ContextualSearchRLM();
    seed(rlm, "same");

    rlm.getAnalytics();
    rlm.getAnalytics();

    expect(getAnalyticsSpy).toHaveBeenCalledTimes(2);
    // Distinct objects: a constructor-time or memoised capture hands the same
    // reference to both calls. This is the assertion that fires.
    expect(depsArg(0)).not.toBe(depsArg(1));
    // The re-entrant closure is rebuilt too. `.bind(this)` hoisted to the
    // constructor would keep one identity across every call.
    expect(depsArg(0).search).not.toBe(depsArg(1).search);
    // ...while the five stores still carry identical contents, so "fresh" does
    // not mean "recomputed differently".
    expect(stores(0)).toEqual(stores(1));
  });

  test("every non-re-entrant field tracks the live value when it changes between two calls on one instance", () => {
    const rlm = new ContextualSearchRLM();

    const first = seed(rlm, "first");
    rlm.getAnalytics();
    // Re-stub *between* calls — the shape a first-call memo cannot survive,
    // because a memo populated on call 1 hands call 2 the same values. Done for
    // all five fields rather than one, so a memo scoped to any single field is
    // caught; the three earlier sensors reassign one field each and would not be.
    const second = seed(rlm, "second");
    rlm.getAnalytics();

    for (const k of STORE_KEYS) {
      expect(depsArg(0)[k]).toBe(first[k]);
      expect(depsArg(1)[k]).toBe(second[k]);
    }
  });

  test("the record carries exactly the six keys IndexAdminDeps declares at T12", () => {
    const rlm = new ContextualSearchRLM();

    rlm.getAnalytics();

    // A record that grew a field would be the root leaking state back into a
    // capability module — the coupling G-HUB exists to measure, arriving by the
    // one route G-HUB cannot see, because a deps record is not a
    // `: ContextualSearchRLM` dereference.
    expect(Object.keys(depsArg(0))).toEqual(DEPS_KEYS);
  });

  test("the re-entrant search callback dispatches through the instance at call time, not at assembly time", async () => {
    const rlm = new ContextualSearchRLM();
    rlm.getAnalytics();
    const record = depsArg(0);

    // One captured record, two different instance stubs, invoked through the
    // *same* closure. `.bind(this)` or a bare `search: this.search` would resolve
    // the method when the record was assembled and run `first` twice — which is
    // exactly how the 7 sites that stub this method on the instance would go
    // silently ineffective while every suite stayed green.
    const seen: string[] = [];
    rlm.search = async () => {
      seen.push("first");
      return [];
    };
    await (record.search as (...a: unknown[]) => Promise<unknown>)("q", "p");
    rlm.search = async () => {
      seen.push("second");
      return [];
    };
    await (record.search as (...a: unknown[]) => Promise<unknown>)("q", "p");

    expect(seen).toEqual(["first", "second"]);
  });
});
