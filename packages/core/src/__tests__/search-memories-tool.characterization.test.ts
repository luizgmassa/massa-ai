/**
 * SearchMemoriesTool — characterization tests (PR-C, T9)
 *
 * GMS-02 **AC-2**, second subject. Written at `57db658`, against the shape
 * where `SearchMemoriesTool` imports `MemoryController` from
 * `../controllers/memory-controller`. T10 moves that controller into
 * `services/`. **Nothing below may be edited to make it pass again.**
 *
 * Paths in this docblock carry no file extension on purpose —
 * `check-stale-pointers` matches `*-controller.{ts,js}` in prose since T6, and
 * a citation spelled in full here becomes a HISTORICAL entry the moment T10
 * moves the file. See the sibling file's docblock for the measured reading.
 *
 * Paired with `search-project-tool.characterization.test.ts`. That one is the
 * zero-mock subject and pins control flow — format resolution, tree, error
 * mapping. This one pins the other half of what a `tools/` handler is doing in
 * this codebase: **result mapping**. `handle()` here rebuilds every memory into
 * a nine-field DTO, converts a timestamp, and grafts a field from a second map.
 * That is the shape GMS-02's headline is about, and this handler had **zero**
 * tests of any kind before this file.
 *
 * ## The rule that makes this file survive the move — do not break it
 *
 * The move-proof rule is the same as the sibling file's: **name no module path
 * that T10 moves.** The controller is replaced on the instance, by field name,
 * never by `mock.module`. The three mocks below are all on paths T10 leaves
 * exactly where they are — one `data/` factory and two `services/` singletons —
 * so they keep intercepting after the controller has moved.
 *
 * ## Why the import is dynamic, and why that must stay dynamic
 *
 * `import` declarations are evaluated before any statement in the module body,
 * so a static `import { SearchMemoriesTool } from "../tools/search_memories.js"`
 * would load the whole controller graph **before** `mock.module` could run.
 * Measured, on this tree: that path initialises Prisma, constructs
 * `MemoryRepositoryPg`, and starts live embedding-provider auto-selection —
 * CLAUDE.md's 5001 ms class, 42 s on a cold model. With the mocks registered
 * first, the same file loads in ~60 ms and reaches no provider at all.
 *
 * So the `await import(...)` below is load-bearing. Tidying it into a static
 * import restores the hang, silently, and only on a machine that has a local
 * Ollama — CI would not catch it.
 *
 * Values are transcribed from a live reading, not derived from the source.
 */

import { describe, test, expect, mock } from "bun:test";

// Registered BEFORE the subject is loaded — see the docblock. None of these
// three paths is moved by T10.
mock.module("../data/memory/memory-repository-factory.js", () => ({
  getMemoryRepository: () => ({}),
}));
mock.module("../services/memory/memory-service.js", () => ({
  MemoryService: { getInstance: () => ({}) },
}));
mock.module("../services/memory-graph/memory-graph.service.js", () => ({
  MemoryGraphService: { getInstance: () => ({}) },
}));

const { SearchMemoriesTool } = await import("../tools/search_memories.js");

// ── The seam ─────────────────────────────────────────────────────────────────

interface ControllerSeam {
  controller: { search: (input: unknown) => Promise<unknown> };
}

interface Handler {
  name: string;
  inputSchema: unknown;
  handle: (params: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }>;
}

function toolWith(search: (input: unknown) => Promise<unknown>): Handler {
  const tool = new SearchMemoriesTool();
  (tool as unknown as ControllerSeam).controller = { search };
  return tool as unknown as Handler;
}

function recordingTool(result: unknown): { tool: Handler; seen: unknown[] } {
  const seen: unknown[] = [];
  const tool = toolWith(async (input) => {
    seen.push(input);
    return result;
  });
  return { tool, seen };
}

/**
 * A controller-shaped memory row. The last three fields exist to prove the
 * handler's whitelist drops whatever it does not name.
 */
const MEMORY = {
  id: "m1",
  content: "c",
  type: "code",
  level: "session",
  agentId: "ag",
  importance: 0.5,
  tags: ["t"],
  score: 0.9,
  createdAt: 1_700_000_000_000,
  accessCount: 2,
  embedding: [1, 2, 3],
  userId: "u1",
  updatedAt: 1_800_000_000_000,
};

/** MEMORY as the handler emits it: nine fields kept, `createdAt` as ISO-8601. */
const MEMORY_AS_EMITTED = {
  id: "m1",
  content: "c",
  type: "code",
  level: "session",
  agentId: "ag",
  importance: 0.5,
  tags: ["t"],
  score: 0.9,
  createdAt: "2023-11-14T22:13:20.000Z",
  accessCount: 2,
};

describe("SearchMemoriesTool — characterization (PR-C T9, GMS-02 AC-2)", () => {
  describe("delegation", () => {
    test("forwards exactly ten search fields and withholds the two presentation ones", async () => {
      const { tool, seen } = recordingTool({
        memories: [],
        relatedSummaries: {},
        query: "q",
        total: 0,
      });

      await tool.handle({
        query: "CALLER-QUERY",
        userId: "u",
        sessionId: "s",
        projectId: "p",
        agentId: "a",
        types: ["code"],
        minImportance: 0.4,
        limit: 5,
        includePersistent: false,
        includeRelated: true,
        format: "json",
        fields: ["memories"],
      });

      // Unlike SearchProjectTool — which hands its params object straight
      // through by identity — this handler rebuilds the request, so `format`
      // and `fields` never reach the controller. Both behaviors are pinned, in
      // their respective files, because they are genuinely different contracts.
      expect(Object.keys(seen[0] as object)).toEqual([
        "query",
        "userId",
        "sessionId",
        "projectId",
        "agentId",
        "types",
        "minImportance",
        "limit",
        "includePersistent",
        "includeRelated",
      ]);
      expect(seen[0]).toEqual({
        query: "CALLER-QUERY",
        userId: "u",
        sessionId: "s",
        projectId: "p",
        agentId: "a",
        types: ["code"],
        minImportance: 0.4,
        limit: 5,
        includePersistent: false,
        includeRelated: true,
      });
    });

    test("omitted optional params are forwarded as explicit undefined keys", async () => {
      const { tool, seen } = recordingTool({
        memories: [],
        relatedSummaries: {},
        query: "q",
        total: 0,
      });
      await tool.handle({ query: "only-query" });
      // Destructuring-then-rebuilding means every key is present on the object
      // handed down, holding `undefined` — not absent. A controller that
      // distinguishes "absent" from "undefined" would see all ten.
      expect(Object.keys(seen[0] as object)).toHaveLength(10);
      expect((seen[0] as { limit?: number }).limit).toBeUndefined();
    });
  });

  describe("result mapping", () => {
    test("keeps exactly nine memory fields and drops everything else", async () => {
      const { tool } = recordingTool({
        memories: [MEMORY],
        relatedSummaries: {},
        query: "q",
        total: 1,
      });
      const response = await tool.handle({ query: "q", format: "json" });
      const data = response.data as { memories: Record<string, unknown>[] };

      expect(data.memories[0]).toEqual(MEMORY_AS_EMITTED);
      // Named individually as well as by the whole-object equality above: a
      // controller that starts returning a new field will not surface it here
      // until this handler is taught the name, and that silence is the point.
      expect(data.memories[0]).not.toHaveProperty("embedding");
      expect(data.memories[0]).not.toHaveProperty("userId");
      expect(data.memories[0]).not.toHaveProperty("updatedAt");
    });

    test("createdAt is converted from epoch milliseconds to an ISO-8601 string", async () => {
      const { tool } = recordingTool({
        memories: [MEMORY],
        relatedSummaries: {},
        query: "q",
        total: 1,
      });
      const response = await tool.handle({ query: "q", format: "json" });
      const data = response.data as { memories: { createdAt: unknown }[] };
      expect(data.memories[0].createdAt).toBe("2023-11-14T22:13:20.000Z");
    });

    test("query and total are the controller's, not the caller's", async () => {
      const { tool } = recordingTool({
        memories: [],
        relatedSummaries: {},
        query: "CONTROLLER-QUERY",
        total: 7,
      });
      const response = await tool.handle({ query: "CALLER-QUERY", format: "json" });
      // Worth pinning because it is the surprising direction: the echoed query
      // is whatever the controller reports, and `total` is its count — not the
      // length of the `memories` array the caller just received (0 here).
      expect(response.data).toEqual({
        memories: [],
        query: "CONTROLLER-QUERY",
        total: 7,
      });
    });
  });

  describe("relatedContext graft", () => {
    test("added only to the memories that have a related summary", async () => {
      const { tool } = recordingTool({
        memories: [MEMORY, { ...MEMORY, id: "m2" }],
        relatedSummaries: { m1: "related blurb" },
        query: "q",
        total: 2,
      });
      const response = await tool.handle({ query: "q", format: "json" });
      const data = response.data as { memories: Record<string, unknown>[] };

      expect(data.memories[0]).toEqual({
        ...MEMORY_AS_EMITTED,
        relatedContext: "related blurb",
      });
      expect(data.memories[1]).toEqual({ ...MEMORY_AS_EMITTED, id: "m2" });
      expect(data.memories[1]).not.toHaveProperty("relatedContext");
    });

    test("a present-but-empty summary is treated as absent — the test is truthiness", async () => {
      const { tool } = recordingTool({
        memories: [MEMORY],
        relatedSummaries: { m1: "" },
        query: "q",
        total: 1,
      });
      const response = await tool.handle({ query: "q", format: "json" });
      const data = response.data as { memories: Record<string, unknown>[] };
      // `relatedSummaries[m.id] ? {...} : {}` — an `in` check or a `!== undefined`
      // would have grafted `relatedContext: ""` here.
      expect(data.memories[0]).not.toHaveProperty("relatedContext");
      expect(data.memories[0]).toEqual(MEMORY_AS_EMITTED);
    });
  });

  describe("format resolution", () => {
    test("absent format encodes as TOON", async () => {
      const { tool } = recordingTool({
        memories: [],
        relatedSummaries: {},
        query: "q",
        total: 0,
      });
      const response = await tool.handle({ query: "q" });
      expect(response.success).toBe(true);
      expect(response.data).toBe("memories: []\nquery: q\ntotal: 0");
    });

    test('"json" returns the mapped object rather than a string', async () => {
      const { tool } = recordingTool({
        memories: [],
        relatedSummaries: {},
        query: "q",
        total: 0,
      });
      const response = await tool.handle({ query: "q", format: "json" });
      expect(response.data).toEqual({ memories: [], query: "q", total: 0 });
    });
  });

  describe("error handling", () => {
    test("an ordinary Error becomes a success:false envelope with a prefixed message", async () => {
      const tool = toolWith(async () => {
        throw new Error("kaboom");
      });
      const response = await tool.handle({ query: "q" });
      expect(response.success).toBe(false);
      expect(response.error).toBe("Failed to search memories: kaboom");
    });

    test("a non-Error throw is stringified rather than dropped", async () => {
      const tool = toolWith(async () => {
        throw "a string";
      });
      const response = await tool.handle({ query: "q" });
      expect(response.error).toBe("Failed to search memories: a string");
    });

    test("every failure is enveloped — this handler rethrows nothing", async () => {
      const tool = toolWith(async () => {
        throw new TypeError("typed");
      });
      // The contrast with SearchProjectTool, which rethrows SearchServiceError,
      // is deliberate: there is no typed-error escape hatch on this path.
      const response = await tool.handle({ query: "q" });
      expect(response.success).toBe(false);
      expect(response.error).toBe("Failed to search memories: typed");
    });
  });

  describe("declared surface", () => {
    test("name and the schema's required set are unchanged", async () => {
      const tool = toolWith(async () => ({
        memories: [],
        relatedSummaries: {},
        query: "q",
        total: 0,
      }));
      expect(tool.name).toBe("search_memories");
      expect((tool.inputSchema as { required: string[] }).required).toEqual(["query"]);
    });
  });
});
