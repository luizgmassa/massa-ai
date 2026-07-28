/**
 * Unit tests for SearchDefinitionsTool + GoToDefinitionTool success paths.
 *
 * The existing wave-4-enum-validation.test.ts covers the teaching-error
 * paths (invalid kind/scope). This file covers the success path: valid
 * kind filter passes validation, listDefinitions returns results, and
 * the tool shapes them into the N4 definitions_total/shown/omitted
 * response. Also covers GoToDefinitionTool found/not-found/error paths.
 *
 * Mocks symbolGraphService + active-generation so no DB is needed.
 */

import { describe, test, expect, beforeAll, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────

let stubListDefinitions: (...args: any[]) => Promise<any>;
let stubGoToDefinition: (...args: any[]) => Promise<any>;

mock.module("../services/symbol/symbol-graph.service.js", () => ({
  symbolGraphService: {
    listDefinitions: (...args: any[]) => stubListDefinitions(...args),
    goToDefinition: (...args: any[]) => stubGoToDefinition(...args),
  },
}));

mock.module("../services/symbol/active-generation.js", () => ({
  getActiveGeneration: async () => "gen-123",
  assertGenerationNotStale: () => {},
}));

import { SearchDefinitionsTool } from "../tools/search_definitions.js";
import { GoToDefinitionTool } from "../tools/go_to_definition.js";

function makeDef(overrides: any = {}) {
  return {
    fqn: "src/a.ts#foo",
    name: "foo",
    kind: "function",
    file: "src/a.ts",
    lineStart: 1,
    lineEnd: 10,
    exported: true,
    docComment: "Does foo",
    centralityScore: 0.8,
    ...overrides,
  };
}

describe("SearchDefinitionsTool — success path", () => {
  beforeAll(() => {
    stubListDefinitions = async () => ({ definitions: [], total: 0, total_exact: true });
  });

  test("valid kind filter passes validation and reaches the service", async () => {
    let capturedOpts: any;
    stubListDefinitions = async (_pid: string, opts: any) => {
      capturedOpts = opts;
      return {
        definitions: [makeDef({ kind: "function" }), makeDef({ name: "bar", kind: "class", fqn: "src/b.ts#bar" })],
        total: 2,
        total_exact: true,
      };
    };

    const tool = new SearchDefinitionsTool();
    const res = (await tool.handle({
      projectId: "p1",
      kind: ["function", "class"],
      maxResults: 10,
    })) as any;

    expect(res.success).toBe(true);
    expect(res.data.definitions.length).toBe(2);
    expect(res.data.definitions[0]).toMatchObject({
      fqn: "src/a.ts#foo",
      name: "foo",
      kind: "function",
      file: "src/a.ts",
      lineStart: 1,
      lineEnd: 10,
      exported: true,
      docComment: "Does foo",
      centralityScore: 0.8,
    });
    // validatedKind passed through to service
    expect(capturedOpts.kind).toEqual(["function", "class"]);
    // N4 counts
    expect(res.data.definitions_total).toBe(2);
    expect(res.data.definitions_shown).toBe(2);
    expect(res.data.definitions_omitted).toBe(0);
    expect(res.data.definitions_total_exact).toBe(true);
    // Legacy total = shown
    expect(res.data.total).toBe(2);
    // N1 generation id surfaced
    expect(res.data.activatedGraphGenerationId).toBe("gen-123");
  });

  test("omitted > 0 when total exceeds shown (limit cap)", async () => {
    stubListDefinitions = async () => ({
      definitions: [makeDef()],
      total: 50,
      total_exact: true,
    });

    const tool = new SearchDefinitionsTool();
    const res = (await tool.handle({ projectId: "p1", maxResults: 1 })) as any;

    expect(res.success).toBe(true);
    expect(res.data.definitions.length).toBe(1);
    expect(res.data.definitions_total).toBe(50);
    expect(res.data.definitions_shown).toBe(1);
    expect(res.data.definitions_omitted).toBe(49);
  });

  test("total_exact=false passed through (T10 sentinel cap)", async () => {
    stubListDefinitions = async () => ({
      definitions: [makeDef()],
      total: 100000,
      total_exact: false,
    });

    const tool = new SearchDefinitionsTool();
    const res = (await tool.handle({ projectId: "p1" })) as any;

    expect(res.data.definitions_total_exact).toBe(false);
  });

  test("empty results → definitions_total=0, omitted=0", async () => {
    stubListDefinitions = async () => ({ definitions: [], total: 0, total_exact: true });

    const tool = new SearchDefinitionsTool();
    const res = (await tool.handle({ projectId: "p1" })) as any;

    expect(res.data.definitions).toEqual([]);
    expect(res.data.definitions_total).toBe(0);
    expect(res.data.definitions_shown).toBe(0);
    expect(res.data.definitions_omitted).toBe(0);
  });

  test("search + file + exportedOnly filters passed through", async () => {
    let captured: any;
    stubListDefinitions = async (_pid: string, opts: any) => {
      captured = opts;
      return { definitions: [], total: 0, total_exact: true };
    };

    const tool = new SearchDefinitionsTool();
    await tool.handle({
      projectId: "p1",
      query: "foo",
      file: "src/a.ts",
      exportedOnly: true,
      maxResults: 5,
    });

    expect(captured.search).toBe("foo");
    expect(captured.file).toBe("src/a.ts");
    expect(captured.exportedOnly).toBe(true);
    expect(captured.limit).toBe(5);
  });

  test("service error → success:false with error message", async () => {
    stubListDefinitions = async () => {
      throw new Error("DB connection lost");
    };

    const tool = new SearchDefinitionsTool();
    const res = (await tool.handle({ projectId: "p1" })) as any;

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Failed to search definitions/);
    expect(res.error).toMatch(/DB connection lost/);
  });

  test("query null in response when not provided", async () => {
    stubListDefinitions = async () => ({ definitions: [], total: 0, total_exact: true });

    const tool = new SearchDefinitionsTool();
    const res = (await tool.handle({ projectId: "p1" })) as any;

    expect(res.data.query).toBeNull();
  });

  test("query string surfaced in response when provided", async () => {
    stubListDefinitions = async () => ({ definitions: [], total: 0, total_exact: true });

    const tool = new SearchDefinitionsTool();
    const res = (await tool.handle({ projectId: "p1", query: "searchterm" })) as any;

    expect(res.data.query).toBe("searchterm");
  });
});

describe("GoToDefinitionTool", () => {
  beforeAll(() => {
    stubGoToDefinition = async () => [];
  });

  test("found:true with definitions list when results exist", async () => {
    stubGoToDefinition = async () => [
      makeDef({ fqn: "src/a.ts#foo", name: "foo", kind: "function" }),
    ];

    const tool = new GoToDefinitionTool();
    const res = (await tool.handle({ projectId: "p1", symbolName: "foo" })) as any;

    expect(res.success).toBe(true);
    expect(res.data.found).toBe(true);
    expect(res.data.symbolName).toBe("foo");
    expect(res.data.definitions.length).toBe(1);
    expect(res.data.definitions[0]).toMatchObject({
      fqn: "src/a.ts#foo",
      name: "foo",
      kind: "function",
      file: "src/a.ts",
      exported: true,
      docComment: "Does foo",
      centralityScore: 0.8,
    });
    expect(res.data.total).toBe(1);
    expect(res.data.projectId).toBe("p1");
  });

  test("found:false with message when no definitions", async () => {
    stubGoToDefinition = async () => [];

    const tool = new GoToDefinitionTool();
    const res = (await tool.handle({ projectId: "p1", symbolName: "missing" })) as any;

    expect(res.success).toBe(true);
    expect(res.data.found).toBe(false);
    expect(res.data.symbolName).toBe("missing");
    expect(res.data.message).toContain("No definition found");
    expect(res.data.message).toContain("missing");
    expect(res.data.projectId).toBe("p1");
  });

  test("fromFile surfaced in response when provided", async () => {
    stubGoToDefinition = async () => [makeDef()];

    const tool = new GoToDefinitionTool();
    const res = (await tool.handle({
      projectId: "p1",
      symbolName: "foo",
      fromFile: "src/caller.ts",
    })) as any;

    expect(res.data.fromFile).toBe("src/caller.ts");
  });

  test("fromFile null when not provided", async () => {
    stubGoToDefinition = async () => [makeDef()];

    const tool = new GoToDefinitionTool();
    const res = (await tool.handle({ projectId: "p1", symbolName: "foo" })) as any;

    expect(res.data.fromFile).toBeNull();
  });

  test("multiple definitions → total reflects count", async () => {
    stubGoToDefinition = async () => [
      makeDef({ fqn: "src/a.ts#foo", name: "foo" }),
      makeDef({ fqn: "src/b.ts#foo", name: "foo", file: "src/b.ts" }),
    ];

    const tool = new GoToDefinitionTool();
    const res = (await tool.handle({ projectId: "p1", symbolName: "foo" })) as any;

    expect(res.data.definitions.length).toBe(2);
    expect(res.data.total).toBe(2);
  });

  test("service error → success:false with error message", async () => {
    stubGoToDefinition = async () => {
      throw new Error("graph unavailable");
    };

    const tool = new GoToDefinitionTool();
    const res = (await tool.handle({ projectId: "p1", symbolName: "foo" })) as any;

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Failed to go to definition/);
    expect(res.error).toMatch(/graph unavailable/);
  });
});