/**
 * session-bias unit tests — the GMS-03 AC-2 sensor for PR-B T8.
 *
 * **This file contains zero `mock.module` calls, and that is the assertion.**
 * AC-2 asks that a unit test of one capability module construct it without
 * mocking a stack of factory modules. Before T8 the only way to reach this
 * body was `new ContextualSearchRLM(...)`, which drags in seven factory mocks
 * (see search-facade-synapse.test.ts:12-75) before the first `expect` runs. Now both
 * collaborators arrive as an object literal in the `SessionBiasDeps` record,
 * so nothing is mocked and nothing is intercepted — `applySynapseState` is
 * called directly.
 *
 * The literals are typed, not cast. `Pick<SessionRegistry, "getAsync">` and
 * `Pick<SynapseManager, "process">` are satisfied structurally, which is what
 * makes the narrow-record shape (design.md §4.4) an actual seam rather than a
 * renamed parameter — an `as any` here would prove nothing about either.
 *
 * These are behavior assertions over the real body, not forwarding spies: the
 * facade-forwarding contract is contextual-search-rlm-coverage.test.ts's job,
 * and the degrade-to-base paths are search-facade-synapse.test.ts's through the facade.
 * This file is what proves the body runs standalone.
 */

import { describe, test, expect } from "bun:test";
import { SearchSource, type SearchResult } from "@massa-ai/shared";
import {
  applySynapseState,
  type SessionBiasDeps,
} from "../services/search/session-bias.js";
import type { AgentSession, SynapsePipelineResult } from "../services/synapse/types.js";

function makeResult(id: string, projectId = "p"): SearchResult {
  return {
    id,
    content: `${id} content`,
    score: 0.5,
    source: SearchSource.HYBRID,
    metadata: { projectId, filePath: `${id}.ts` },
  };
}

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    sessionId: "sess-1",
    agentId: "agent-1",
    ttlMs: 60_000,
    createdAt: 0,
    expiresAt: 60_000,
    accessHistory: new Map(),
    accessHistoryLimit: 100,
    ...overrides,
  };
}

function pipelineResult(results: SearchResult[]): SynapsePipelineResult {
  return {
    results,
    flags: {
      lowConfidence: false,
      noStrongMatch: false,
      definitiveMatch: false,
      spread: 0,
      mean: 0,
      confidence: 0,
    },
    queryClass: "broad",
    appliedFilters: [],
    intent: "general",
  };
}

/**
 * The whole point of AC-2: a complete dependency record, built inline, with no
 * module interception anywhere in the file.
 */
function makeDeps(
  session: AgentSession | null | (() => never),
  processed: (results: SearchResult[]) => SynapsePipelineResult = pipelineResult,
): SessionBiasDeps {
  return {
    sessionRegistry: {
      getAsync: async () => {
        if (typeof session === "function") session();
        return session as AgentSession | null;
      },
    },
    synapseManager: { process: (results) => processed(results) },
  };
}

describe("session-bias — applySynapseState, constructed from an object literal", () => {
  test("no sessionId → returns the exact base array, and never touches the registry", async () => {
    let registryCalls = 0;
    const deps: SessionBiasDeps = {
      sessionRegistry: {
        getAsync: async () => {
          registryCalls += 1;
          return null;
        },
      },
      synapseManager: { process: (results) => pipelineResult(results) },
    };
    const base = [makeResult("a"), makeResult("b")];

    const result = await applySynapseState(deps, base, "query", "p");

    expect(result).toBe(base);
    expect(registryCalls).toBe(0);
  });

  test("session lookup throws → reports SYNAPSE_UNAVAILABLE and returns base", async () => {
    const reported: Array<[string, string]> = [];
    const deps = makeDeps(() => {
      throw new Error("registry down");
    });
    const base = [makeResult("a")];

    const result = await applySynapseState(
      deps,
      base,
      "q",
      "p",
      "sess-1",
      (code, stage) => reported.push([code, stage]),
    );

    expect(result).toBe(base);
    expect(reported).toEqual([["SYNAPSE_UNAVAILABLE", "synapse_session_lookup"]]);
  });

  test("session lookup throws with no reporter → still degrades to base", async () => {
    const deps = makeDeps(() => {
      throw new Error("registry down");
    });
    const base = [makeResult("a")];

    expect(await applySynapseState(deps, base, "q", "p", "sess-1")).toBe(base);
  });

  test("unknown session → returns base", async () => {
    const base = [makeResult("a")];
    expect(await applySynapseState(makeDeps(null), base, "q", "p", "sess-1")).toBe(base);
  });

  test("workspace mismatch → returns base without processing", async () => {
    let processCalls = 0;
    const deps = makeDeps(makeSession({ workspaceId: "other-project" }), (results) => {
      processCalls += 1;
      return pipelineResult(results);
    });
    const base = [makeResult("a")];

    expect(await applySynapseState(deps, base, "q", "p", "sess-1")).toBe(base);
    expect(processCalls).toBe(0);
  });

  test("processing throws → reports SYNAPSE_UNAVAILABLE and returns base", async () => {
    const reported: Array<[string, string]> = [];
    const deps = makeDeps(makeSession({ workspaceId: "p" }), () => {
      throw new Error("pipeline blew up");
    });
    const base = [makeResult("a")];

    const result = await applySynapseState(
      deps,
      base,
      "q",
      "p",
      "sess-1",
      (code, stage) => reported.push([code, stage]),
    );

    expect(result).toBe(base);
    expect(reported).toEqual([["SYNAPSE_UNAVAILABLE", "synapse_processing"]]);
  });

  test("matching workspace → base ids pass through, in-project injections are kept", async () => {
    const base = [makeResult("a"), makeResult("b")];
    const injected = makeResult("mem-1", "p");
    const deps = makeDeps(makeSession({ workspaceId: "p" }), () =>
      pipelineResult([base[1]!, injected, base[0]!]),
    );

    const result = await applySynapseState(deps, base, "q", "p", "sess-1");

    expect(result.map((r) => r.id)).toEqual(["b", "mem-1", "a"]);
  });

  test("matching workspace → out-of-project injections are dropped", async () => {
    const base = [makeResult("a")];
    const deps = makeDeps(makeSession({ workspaceId: "p" }), () =>
      pipelineResult([base[0]!, makeResult("mem-other", "other-project")]),
    );

    const result = await applySynapseState(deps, base, "q", "p", "sess-1");

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  test("session without workspaceId → buffer injection disallowed, base ids still pass", async () => {
    // `allowBufferInjection` is `session.workspaceId === projectId`, so an
    // undefined workspaceId admits the session (the mismatch guard is
    // short-circuited by the falsy check) while barring every injected id.
    const base = [makeResult("a")];
    const deps = makeDeps(makeSession(), () =>
      pipelineResult([base[0]!, makeResult("mem-1", "p")]),
    );

    const result = await applySynapseState(deps, base, "q", "p", "sess-1");

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  test("injected result with no metadata → dropped rather than throwing", async () => {
    const base = [makeResult("a")];
    const bare: SearchResult = {
      id: "mem-bare",
      content: "bare",
      score: 0.1,
      source: SearchSource.HYBRID,
    };
    const deps = makeDeps(makeSession({ workspaceId: "p" }), () =>
      pipelineResult([base[0]!, bare]),
    );

    const result = await applySynapseState(deps, base, "q", "p", "sess-1");

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });
});
