/**
 * LATE-BIND sensor for the facade → session-bias seam (PR-B T8).
 *
 * **Why this file exists, and why it is not in the coverage suite.** LATE-BIND
 * (design.md §4.3.1) is normally sensed by the ~80 test sites that stub facade
 * state *after* construction: capture a collaborator at construction and those
 * stubs go silently ineffective, so the pass counts drop. That sensor does not
 * exist for T8. `injectedDeps` is `readonly` and has **zero** post-construction
 * assignment sites — design.md §4.3.1's own table says so — and there is
 * therefore no stub to break.
 *
 * Measured at T8, on the finished code, by hoisting `#sessionBiasDeps()`'s
 * literal into a field captured on first call: `tsc` exits 0, the seven
 * characterization suites stay at **160 pass / 0 fail**, session-bias.test.ts
 * stays at 10/0, and search-synapse-integration.test.ts stays at 5/0. Nothing
 * detected the violation. T8's shape is the one T9/T10/T12/T13 copy, so leaving
 * it held by review rather than by a gate is how the whole Phase 1 pattern
 * regresses in a later commit with every suite green.
 *
 * From T9 on the ordinary sensor takes over — `keywordSearch` has 10
 * post-construction assignment sites, T10's members 18/7/4/4 — so this file
 * covers the one task where it cannot.
 *
 * It is a separate file rather than two more cases in
 * contextual-search-rlm-coverage.test.ts because AC-3's check column pins that
 * file at exactly **41** tests. Adding to it would move a pinned sensor, which
 * reads as drift no matter what the commit message says.
 *
 * These assert the *observable form* of "assembled per call, from current
 * fields": a fresh object every call, contents read from `injectedDeps`, and
 * exactly the two keys `SessionBiasDeps` declares.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SearchSource, type SearchResult } from "@massa-ai/shared";

mock.restore();

// Spy on the capability module so the deps record the facade assembles is
// directly observable. This is the only interception in the file.
const applySynapseStateSpy = mock(async () => [] as SearchResult[]);

mock.module("../services/search/session-bias.js", () => ({
  applySynapseState: applySynapseStateSpy,
}));

import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";

const sessionRegistry = { getAsync: async () => null };
const synapseManager = { process: () => ({ results: [] as SearchResult[] }) };

function makeResult(id: string): SearchResult {
  return {
    id,
    content: `${id} content`,
    score: 0.5,
    source: SearchSource.HYBRID,
    metadata: { projectId: "p", filePath: `${id}.ts` },
  };
}

/** The deps record the facade passed on call `n`. */
function depsArg(n: number): Record<string, unknown> {
  return applySynapseStateSpy.mock.calls[n]![0] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  applySynapseStateSpy.mockClear();
});

describe("LATE-BIND — the facade assembles SessionBiasDeps per call", () => {
  test("each call gets a freshly built record, not a captured one", async () => {
    const rlm = new ContextualSearchRLM({ sessionRegistry, synapseManager });
    const base = [makeResult("a")];

    await rlm.applySynapseState(base, "q1", "p");
    await rlm.applySynapseState(base, "q2", "p");

    expect(applySynapseStateSpy).toHaveBeenCalledTimes(2);
    // Distinct objects: a constructor-time or memoised capture would hand the
    // same reference to both calls. This is the assertion that fires.
    expect(depsArg(0)).not.toBe(depsArg(1));
    // ...while still carrying identical contents, so "fresh" does not mean
    // "recomputed differently".
    expect(depsArg(0)).toEqual(depsArg(1));
  });

  test("the record's contents are read from injectedDeps, not fixed at module scope", async () => {
    const otherRegistry = { getAsync: async () => null };
    const otherManager = { process: () => ({ results: [] as SearchResult[] }) };
    const base = [makeResult("a")];

    await new ContextualSearchRLM({ sessionRegistry, synapseManager }).applySynapseState(
      base,
      "q",
      "p",
    );
    await new ContextualSearchRLM({
      sessionRegistry: otherRegistry,
      synapseManager: otherManager,
    }).applySynapseState(base, "q", "p");

    expect(depsArg(0)).toEqual({ sessionRegistry, synapseManager });
    expect(depsArg(1)).toEqual({
      sessionRegistry: otherRegistry,
      synapseManager: otherManager,
    });
  });

  test("the record carries exactly the two keys SessionBiasDeps declares", async () => {
    const rlm = new ContextualSearchRLM({ sessionRegistry, synapseManager });

    await rlm.applySynapseState([makeResult("a")], "q", "p");

    // A record that grew a third field would be the root leaking state back
    // into a capability module — the coupling G-HUB exists to measure, arriving
    // by the one route G-HUB cannot see, because a deps record is not a
    // `: ContextualSearchRLM` dereference.
    expect(Object.keys(depsArg(0)).sort()).toEqual([
      "sessionRegistry",
      "synapseManager",
    ]);
  });
});
