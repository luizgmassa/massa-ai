/**
 * SearchProjectTool — characterization tests (PR-C, T9)
 *
 * GMS-02 **AC-2**: a representative `tools/` handler's behavior is unchanged,
 * proven by tests written **before** the move and passing **unmodified** after
 * it. Written at `57db658`, against the shape where `SearchProjectTool` imports
 * `SearchController` from `../controllers/search-controller`. T10 moves that
 * controller into `services/`. **Nothing below may be edited to make it pass
 * again** — an edit here would prove nothing, which is the whole point of the
 * criterion.
 *
 * Every path named in this docblock is deliberately written **without its file
 * extension**. `check-stale-pointers` scans this file, and since T6 its
 * `POINTER` has a suffix branch that matches `*-controller.{ts,js}` anywhere in
 * tracked prose. Spelled in full, the three citations in this file and its
 * sibling take the corpus from 142 to 145 — and at T10, when the controllers
 * actually move, they would convert into HISTORICAL entries and break the pin
 * on documentation that references nothing. T7's docblock established the same
 * convention for the same reason.
 *
 * ## The rule that makes this file survive the move — do not break it
 *
 * **This file names exactly one module path: `../tools/search_project.js`, and
 * T10 does not move it.** There is deliberately no `mock.module` of the
 * controller. That is not a style preference:
 * a `mock.module` naming the controller's own module path would have to be
 * repointed at T10, and a repointed test cannot be the "unmodified" half of
 * AC-2. Worse, a `mock.module` on a path the subject no longer imports does not
 * throw — it silently stops mocking (CLAUDE.md, "Running tests"), so the
 * failure mode is a test that quietly starts driving the real controller.
 *
 * The collaborator is therefore replaced **on the instance**, after
 * construction, through the handler's own private field. The field is reached
 * by name rather than by module, so the move is invisible to it.
 *
 * Construction is safe to do for real here, and that was measured rather than
 * assumed: `new SearchProjectTool()` → `SearchController.getInstance()` →
 * `new ContextualSearchRLM()` costs **0 ms** and reaches no provider — no
 * Prisma, no embedding auto-selection. The memory-backed handlers in the same
 * §3.E candidate set do reach both, which is why this one is the zero-mock
 * subject. See `search-memories-tool.characterization.test.ts` for the other.
 *
 * That chain is also why `run-tests-isolated.ts` gives this file its own
 * process: the runner classifies on the literal `ContextualSearchRLM`, which
 * appears in this docblock — and the verdict is right on the merits, not by
 * luck. `SearchController.getInstance()` memoises into a static, so merely
 * constructing the handler creates a process-global singleton that the shared
 * mock-free process would leak to every later file in it. **Do not paraphrase
 * that class name out of this comment to "clean up" the classification**; the
 * file would move into the shared process while still building the singleton.
 *
 * ## Why a second file for a handler that already has three
 *
 * `search-tools-coverage.test.ts`, `search-dependency-outage.test.ts` and
 * `search-admission-preflight.test.ts` already exercise this handler across 32
 * test sites — and all three name a `controllers/` path, so all three are
 * *modified* by T10 and none of them can serve AC-2. They also assert very
 * little: six of the seven `SearchProjectTool` cases in
 * `search-tools-coverage.test.ts` assert only `success === true`, which holds
 * just as well against a handler whose body was deleted. One of them is named
 * `"tree format → groups by file"` and asserts no grouping — see the tree case
 * below for what that format actually does.
 *
 * Values below are **transcribed from a live reading**, not derived from the
 * source. Characterization pins what the code does, including where that
 * disagrees with what its comments claim.
 */

import { describe, test, expect } from "bun:test";
import { SearchProjectTool } from "../tools/search_project.js";
import { SearchServiceError } from "../kernel/search-diagnostics.js";

// ── The seam ─────────────────────────────────────────────────────────────────

/** The handler's private collaborator field, reached by name, not by module. */
interface ControllerSeam {
  controller: { searchProject: (input: unknown) => Promise<unknown> };
}

function toolWith(
  searchProject: (input: unknown) => Promise<unknown>,
): SearchProjectTool {
  const tool = new SearchProjectTool();
  (tool as unknown as ControllerSeam).controller = { searchProject };
  return tool;
}

/** Records what the controller was handed, and returns a fixed result. */
function recordingTool(result: unknown): { tool: SearchProjectTool; seen: unknown[] } {
  const seen: unknown[] = [];
  const tool = toolWith(async (input) => {
    seen.push(input);
    return result;
  });
  return { tool, seen };
}

/**
 * A `ProjectSearchResult`-shaped payload. Note it is an **object** with a
 * `results` array inside it, not a bare array — which is what decides the
 * `tree` case below.
 */
const RESULT = {
  query: "q",
  projectId: "p1",
  responseMode: "summary",
  results: [
    { filePath: "src/a/one.ts", score: 0.9, content: "x" },
    { filePath: "src/a/two.ts", score: 0.8, content: "y" },
    { filePath: "lib/b/three.ts", score: 0.7, content: "z" },
  ],
  recommendations: [],
};

/** The exact TOON encoding of RESULT. Byte-identical anchor. */
const RESULT_AS_TOON =
  "query: q\n" +
  "projectId: p1\n" +
  "responseMode: summary\n" +
  "results[3]{filePath,score,content}:\n" +
  "  src/a/one.ts,0.9,x\n" +
  "  src/a/two.ts,0.8,y\n" +
  "  lib/b/three.ts,0.7,z\n" +
  "recommendations: []";

describe("SearchProjectTool — characterization (PR-C T9, GMS-02 AC-2)", () => {
  describe("delegation", () => {
    test("hands the controller the caller's params object verbatim, by identity", async () => {
      const { tool, seen } = recordingTool(RESULT);
      const params = { query: "q", projectId: "p1", maxResults: 5, format: "json" };

      await tool.handle(params);

      expect(seen).toHaveLength(1);
      // Identity, not equality: this handler builds no request object of its
      // own. `format` — a presentation concern the controller has no use for —
      // reaches the controller precisely because nothing is filtered out.
      expect(seen[0]).toBe(params);
      expect(Object.keys(seen[0] as object)).toEqual([
        "query",
        "projectId",
        "maxResults",
        "format",
      ]);
    });

    test("calls the controller exactly once per handle()", async () => {
      const { tool, seen } = recordingTool(RESULT);
      await tool.handle({ query: "q", projectId: "p1" });
      await tool.handle({ query: "q", projectId: "p1" });
      expect(seen).toHaveLength(2);
    });
  });

  describe("format resolution", () => {
    test("absent format encodes as TOON", async () => {
      const { tool } = recordingTool(RESULT);
      const response = await tool.handle({ query: "q", projectId: "p1" });
      expect(response.success).toBe(true);
      expect(response.data).toBe(RESULT_AS_TOON);
    });

    test('empty-string format also encodes as TOON — the default is `||`, not `??`', async () => {
      const { tool } = recordingTool(RESULT);
      const response = await tool.handle({ query: "q", projectId: "p1", format: "" });
      // `p.format || "toon"` treats "" as absent. `??` would have passed ""
      // through to the serializer, which returns the raw object for anything
      // that is not the literal "toon". This case is the one that tells the
      // two operators apart.
      expect(response.data).toBe(RESULT_AS_TOON);
    });

    test('"toon" encodes as TOON', async () => {
      const { tool } = recordingTool(RESULT);
      const response = await tool.handle({ query: "q", projectId: "p1", format: "toon" });
      expect(response.data).toBe(RESULT_AS_TOON);
    });

    test('"json" returns the controller result as a raw object', async () => {
      const { tool } = recordingTool(RESULT);
      const response = await tool.handle({ query: "q", projectId: "p1", format: "json" });
      expect(response.data).toEqual(RESULT);
    });

    test("an unrecognized format is not rejected — it falls through to the raw object", async () => {
      const { tool } = recordingTool(RESULT);
      const response = await tool.handle({ query: "q", projectId: "p1", format: "bogus" });
      // The serializer branches only on the literal "toon"; the handler
      // validates nothing here, despite `inputSchema` declaring an enum.
      expect(response.data).toEqual(RESULT);
    });
  });

  describe("tree format", () => {
    test('"tree" returns JSON text of the whole payload — it does NOT group by file', async () => {
      const { tool } = recordingTool(RESULT);
      const response = await tool.handle({ query: "q", projectId: "p1", format: "tree" });

      expect(response.success).toBe(true);
      expect(typeof response.data).toBe("string");
      // Recorded as-is, because it contradicts both the handler's own comment
      // ("tree format groups results by file") and the name of the existing
      // case in search-tools-coverage.test.ts ("tree format → groups by file"):
      //
      // the handler passes `groupBy: { file: "filePath" }`, but
      // serializeToolResponse only groups when the PROJECTED PAYLOAD IS AN
      // ARRAY. A ProjectSearchResult is an object whose `results` array is one
      // field deep, so `Array.isArray(projected)` is false, the groupBy is
      // inert, and the tree branch falls through to flat JSON text.
      //
      // PR-C is behavior-preserving, so this is pinned, not fixed.
      expect(response.data).toBe(JSON.stringify(RESULT));
      expect(response.data).not.toContain("rows_total");
      expect(response.data).not.toContain("groups:");
    });
  });

  describe("fields projection", () => {
    test("a dotted field path projects element-wise inside results", async () => {
      const { tool } = recordingTool(RESULT);
      const response = await tool.handle({
        query: "q",
        projectId: "p1",
        format: "json",
        fields: ["results.filePath"],
      });
      expect(response.data).toEqual({
        results: [
          { filePath: "src/a/one.ts" },
          { filePath: "src/a/two.ts" },
          { filePath: "lib/b/three.ts" },
        ],
      });
    });

    test("an empty fields array is not a projection — full payload survives", async () => {
      const { tool } = recordingTool(RESULT);
      const response = await tool.handle({
        query: "q",
        projectId: "p1",
        format: "json",
        fields: [],
      });
      expect(response.data).toEqual(RESULT);
    });
  });

  describe("error handling", () => {
    test("an ordinary Error becomes a success:false envelope with a prefixed message", async () => {
      const tool = toolWith(async () => {
        throw new Error("boom");
      });
      const response = await tool.handle({ query: "q", projectId: "p1" });
      expect(response.success).toBe(false);
      expect((response as { error?: string }).error).toBe("Failed to search project: boom");
    });

    test("a non-Error throw is stringified rather than dropped", async () => {
      const tool = toolWith(async () => {
        throw "a string";
      });
      const response = await tool.handle({ query: "q", projectId: "p1" });
      expect(response.success).toBe(false);
      expect((response as { error?: string }).error).toBe("Failed to search project: a string");
    });

    test("a SearchServiceError propagates instead of being enveloped", async () => {
      const tool = toolWith(async () => {
        throw new SearchServiceError("SEARCH_BACKEND_UNAVAILABLE", "down");
      });
      // Load-bearing: the transports map this to a non-200 status. Swallowing
      // it into { success: false } would report an outage as an ordinary
      // tool-level failure with status 200.
      await expect(tool.handle({ query: "q", projectId: "p1" })).rejects.toThrow(
        SearchServiceError,
      );
    });
  });

  describe("declared surface", () => {
    test("name and the schema's required set are unchanged", async () => {
      const tool = toolWith(async () => RESULT);
      expect(tool.name).toBe("search_project");
      expect((tool.inputSchema as { required: string[] }).required).toEqual([
        "query",
        "projectId",
      ]);
    });
  });
});
