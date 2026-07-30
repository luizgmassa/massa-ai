/**
 * LATE-BIND sensor for the facade → hybrid-search seam (PR-B T9, widened at T13).
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
 * quantity that governs detectability: every site that reaches `correctQuery`
 * does construct → assign field → call, so a first-call memo populates *after*
 * the assignment and captures the correct value. Detecting a memo requires a
 * collaborator to **change between two calls on one instance**, and the number
 * of tests doing that is **zero**. Test 2 below is that shape.
 *
 * A separate file rather than cases added to
 * contextual-search-rlm-coverage.test.ts, because AC-3's check column pins that
 * file at exactly **41** tests; adding to it would move a pinned sensor.
 *
 * ── T13 ──────────────────────────────────────────────────────────────────────
 *
 * `HybridSearchDeps` widens from `correctQuery`'s **1** key to the **8** `search`
 * needs, and three of the eight are re-entrant arrow wrappers over the root's own
 * methods. Three consequences, all of which change this file:
 *
 * 1. **Test 1 could not survive unchanged**, and that is a property of the
 *    subject, not a weakening. Its `toEqual(depsArg(1))` compares functions by
 *    reference, and three freshly-created closures per assembly are never equal.
 *    It now splits the way `project-indexer-late-bind.test.ts:98-117` split at
 *    T10: `toEqual` over the five stores, `.not.toBe` per closure. The closure
 *    assertions are **stronger** than what they replace — a `.bind(this)` hoisted
 *    to the constructor keeps one identity across every call, which the old
 *    `toEqual` would have accepted.
 * 2. **Test 3 widens from 1 key to 8** — the `DEPS_KEYS` list below.
 * 3. **Test 4 is new**, and is the compensating control the plan did not name.
 *    `buildGraphStream` and `addContextToResults` are each stubbed on the
 *    instance at **6** sites, so a `.bind(this)`-at-assembly or a bare
 *    `buildGraphStream: this.buildGraphStream` would disable all twelve while
 *    `tsc`, the 41/0 coverage suite and tests 1–3 all stayed green. It mirrors
 *    `project-indexer-late-bind.test.ts:149-174` exactly.
 *
 * **`ensureInitialized` is deliberately *not* a key here.** T13 hoists it into
 * the root's `search()`, carrying the `searchBackendUnavailable` wrap
 * `searchImpl` applied, because this record snapshots its five stores **by
 * value**: assembling before init hands the module five `undefined`s. Measured
 * the other way round — leaving init inside the module took `rlm-search`
 * 31 → **15 / 16**, `search-dependency-outage` 9 → **4 / 5** and
 * `search-filter-overfetch` 10 → **1 / 9**.
 *
 * `session-bias-late-bind.test.ts`, `project-indexer-late-bind.test.ts` and
 * `index-admin-late-bind.test.ts` are left untouched.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.restore();

// Spy on the capability module so the deps record the facade assembles is
// directly observable. This is the only interception in the file. The real
// module is spread so the root's other five imports still resolve — at T9 the
// root imported only `correctQuery` from here and a bare replacement was enough;
// after T13 it imports six names.
const hybridSearchActual: typeof import("../services/search/hybrid-search.js") =
  require("../services/search/hybrid-search.js");

const correctQuerySpy = mock(async (): Promise<string | null> => null);

mock.module("../services/search/hybrid-search.js", () => ({
  ...hybridSearchActual,
  correctQuery: correctQuerySpy,
}));

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";
import type { SearchResult } from "@massa-ai/shared";

/** The eight keys `HybridSearchDeps` declares at T13, in assembly order. */
const DEPS_KEYS = [
  "keywordSearch",
  "vectorStore",
  "searchCache",
  "analytics",
  "queryUnderstanding",
  "buildGraphStream",
  "addContextToResults",
  "applySynapseState",
];

const STORE_KEYS = DEPS_KEYS.slice(0, 5);
const CALLBACK_KEYS = DEPS_KEYS.slice(5);

/** A distinct, *defined* keyword-store stub — see the identity assertions below. */
function makeKeywordStore(tag: string) {
  return { fuzzyCorrect: async (w: string) => `${tag}:${w}` };
}

/** The deps record the facade passed on call `n`. */
function depsArg(n: number): Record<string, unknown> {
  return correctQuerySpy.mock.calls[n]![0] as unknown as Record<string, unknown>;
}

/** Just the five store members of call `n` — the callbacks are fresh closures. */
function stores(n: number): Record<string, unknown> {
  return Object.fromEntries(STORE_KEYS.map((k) => [k, depsArg(n)[k]]));
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
    // The three re-entrant closures are rebuilt too. `.bind(this)` hoisted to the
    // constructor would keep one identity across every call, and it is the
    // plausible "optimisation" that breaks call-time dispatch.
    for (const k of CALLBACK_KEYS) {
      expect(depsArg(0)[k]).not.toBe(depsArg(1)[k]);
    }
    // ...while the stores still carry identical contents, so "fresh" does not
    // mean "recomputed differently".
    expect(stores(0)).toEqual(stores(1));
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

  test("the record carries exactly the eight keys HybridSearchDeps declares at T13", async () => {
    const rlm = new ContextualSearchRLM();
    (rlm as any).keywordSearch = makeKeywordStore("k");

    await rlm.correctQuery("q");

    // A record that grew a field would be the root leaking state back into a
    // capability module — the coupling G-HUB exists to measure, arriving by the
    // one route G-HUB cannot see, because a deps record is not a
    // `: ContextualSearchRLM` dereference. A record that grew `ensureInitialized`
    // back would be the T13 evaluation-order defect returning.
    expect(Object.keys(depsArg(0))).toEqual(DEPS_KEYS);
  });

  test("the re-entrant callbacks dispatch through the instance at call time, not at assembly time", async () => {
    const rlm = new ContextualSearchRLM();
    (rlm as any).keywordSearch = makeKeywordStore("k");
    await rlm.correctQuery("q");
    const record = depsArg(0);

    // One captured record, two different instance stubs, invoked through the
    // *same* closure. `.bind(this)` or a bare `buildGraphStream:
    // this.buildGraphStream` would resolve the method when the record was
    // assembled and run `first` twice — which is exactly how the 6
    // `buildGraphStream` and 6 `addContextToResults` sites that stub these
    // methods on the instance would go silently ineffective while every
    // pre-existing suite stayed green.
    const graph: string[] = [];
    (rlm as any).buildGraphStream = async () => { graph.push("first"); return []; };
    await (record.buildGraphStream as (...a: unknown[]) => Promise<unknown>)([], 5, "p");
    (rlm as any).buildGraphStream = async () => { graph.push("second"); return []; };
    await (record.buildGraphStream as (...a: unknown[]) => Promise<unknown>)([], 5, "p");
    expect(graph).toEqual(["first", "second"]);

    const ctx: string[] = [];
    (rlm as any).addContextToResults = async (r: SearchResult[]) => { ctx.push("a"); return r; };
    await (record.addContextToResults as (...a: unknown[]) => Promise<unknown>)([], "p");
    (rlm as any).addContextToResults = async (r: SearchResult[]) => { ctx.push("b"); return r; };
    await (record.addContextToResults as (...a: unknown[]) => Promise<unknown>)([], "p");
    expect(ctx).toEqual(["a", "b"]);

    const synapse: string[] = [];
    (rlm as any).applySynapseState = async (r: SearchResult[]) => { synapse.push("x"); return r; };
    await (record.applySynapseState as (...a: unknown[]) => Promise<unknown>)([], "q", "p");
    (rlm as any).applySynapseState = async (r: SearchResult[]) => { synapse.push("y"); return r; };
    await (record.applySynapseState as (...a: unknown[]) => Promise<unknown>)([], "q", "p");
    expect(synapse).toEqual(["x", "y"]);
  });
});
