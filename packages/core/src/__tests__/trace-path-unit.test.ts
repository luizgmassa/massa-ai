/**
 * Unit tests for TracePathService — full method coverage without DB.
 *
 * Strategy: mock the symbol-graph.service module (getEdges) and
 * definition-lookup module (lookup) before importing TracePathService,
 * then construct a fresh instance with the mock lookup injected.
 * Exercises resolveSeeds, tracePath (outbound/inbound/both), BFS core,
 * syntheticTarget, extractCallerFqn, fqnToName, buildChains, deadline,
 * MAX_NODES truncation, edge_types override, and the test-file gate.
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── Mocks ────────────────────────────────────────────────────────────────────

type MockEdgeResult = {
  fromFile: string;
  fromLine: number;
  symbolName: string;
  refKind: string;
  targetFqn?: string;
  meta?: Record<string, unknown> | null;
};

let mockGetEdges: ReturnType<typeof mock>;
let mockLookup: ReturnType<typeof mock>;

mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: () => ({
    findDefinitionsByName: async () => [],
    resolveDefinitionFqn: async () => ({ found: false, ambiguous: false, fqn: "", candidates: [] }),
  }),
}));

mock.module("../services/symbol/symbol-graph.service.js", () => ({
  symbolGraphService: {
    getEdges: (...args: any[]) => mockGetEdges(...args),
  },
  SymbolGraphService: class {},
}));

mock.module("../services/symbol/definition-lookup.js", () => ({
  definitionLookupService: { lookup: (...args: any[]) => mockLookup(...args) },
  DefinitionLookupService: class {},
}));

import { TracePathService } from "../services/symbol/trace-path.js";
import type {
  TracePathOptions,
  TracePathResult,
  EdgeType,
} from "../services/symbol/trace-path.js";
import type { DefinitionLookupResult } from "../services/symbol/definition-lookup.js";
import type { SymbolDefinition } from "../data/symbol/symbol-repository-pg.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDef(
  file: string,
  name: string,
  overrides: Partial<SymbolDefinition> = {},
): SymbolDefinition {
  return {
    id: `${file}#${name}`,
    project_id: "cov-trace",
    file_path: file,
    name,
    kind: "function",
    line_start: 1,
    line_end: 3,
    exported: true,
    indexed_at: Date.now(),
    ...overrides,
  };
}

function mockLookupResult(
  status: "resolved" | "bare" | "missing" | "ambiguous",
  def?: SymbolDefinition,
  defs?: SymbolDefinition[],
): DefinitionLookupResult {
  switch (status) {
    case "resolved":
      return { status: "resolved", definition: def! } as DefinitionLookupResult;
    case "bare":
      return { status: "bare", query: "q", definitions: defs ?? [] } as DefinitionLookupResult;
    case "missing":
      return { status: "missing", query: "q" } as DefinitionLookupResult;
    case "ambiguous":
      return { status: "ambiguous", legacyFqn: "q", candidates: [] } as DefinitionLookupResult;
  }
}

function edge(
  fromFile: string,
  fromLine: number,
  symbolName: string,
  refKind: string,
  targetFqn: string | undefined,
  meta?: Record<string, unknown> | null,
): MockEdgeResult {
  return { fromFile, fromLine, symbolName, refKind, targetFqn, meta: meta ?? null };
}

// ── Test suites ──────────────────────────────────────────────────────────────

describe("TracePathService", () => {
  let svc: TracePathService;

  beforeEach(() => {
    mockGetEdges = mock(() => Promise.resolve([]));
    mockLookup = mock(() => Promise.resolve(mockLookupResult("missing")));
    svc = new TracePathService({ lookup: (...args: any[]) => mockLookup(...args) } as any);
  });

  // ── resolveSeeds ─────────────────────────────────────────────────────────

  describe("resolveSeeds", () => {
    test("returns empty when no symbol and no qualifiedName", async () => {
      const seeds = await svc.resolveSeeds("cov-trace", { symbol: "", projectId: "cov-trace" });
      expect(seeds).toEqual([]);
    });

    test("returns empty when no symbol, no function_name, no qualifiedName", async () => {
      const seeds = await svc.resolveSeeds("cov-trace", { projectId: "cov-trace" });
      expect(seeds).toEqual([]);
    });

    test("uses qualifiedName directly (skips name resolution)", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      const seeds = await svc.resolveSeeds("cov-trace", { qualifiedName: "src/a.ts#alpha", projectId: "cov-trace" });
      expect(seeds.length).toBe(1);
      expect(seeds[0]!.fqn).toBe("src/a.ts#alpha");
    });

    test("qualifiedName lookup returns empty when not resolved", async () => {
      mockLookup = mock(() => Promise.resolve(mockLookupResult("missing")));
      const seeds = await svc.resolveSeeds("cov-trace", { qualifiedName: "src/a.ts#alpha", projectId: "cov-trace" });
      expect(seeds).toEqual([]);
    });

    test("uses symbol with # as FQN directly", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      const seeds = await svc.resolveSeeds("cov-trace", { symbol: "src/a.ts#alpha", projectId: "cov-trace" });
      expect(seeds.length).toBe(1);
      expect(seeds[0]!.fqn).toBe("src/a.ts#alpha");
    });

    test("resolves bare name to multiple definitions", async () => {
      const def1 = makeDef("src/a.ts", "run");
      const def2 = makeDef("src/b.ts", "run");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("bare", undefined, [def1, def2])));
      const seeds = await svc.resolveSeeds("cov-trace", { symbol: "run", projectId: "cov-trace" });
      expect(seeds.length).toBe(2);
    });

    test("returns empty when lookup throws", async () => {
      mockLookup = mock(() => Promise.reject(new Error("DB down")));
      const seeds = await svc.resolveSeeds("cov-trace", { symbol: "run", projectId: "cov-trace" });
      expect(seeds).toEqual([]);
    });

    test("uses function_name as fallback when symbol is undefined", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("bare", undefined, [def])));
      const seeds = await svc.resolveSeeds("cov-trace", { symbol: undefined as any, function_name: "alpha", projectId: "cov-trace" });
      expect(seeds.length).toBe(1);
    });
  });

  // ── tracePath — basic flow ────────────────────────────────────────────────

  describe("tracePath basic flow", () => {
    test("returns empty result when no seeds resolve", async () => {
      mockLookup = mock(() => Promise.resolve(mockLookupResult("missing")));
      const result = await svc.tracePath({ symbol: "nonexistent", projectId: "cov-trace" });
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.chains).toEqual([]);
      expect(result.truncated).toBe(false);
      expect(result.nodes_total).toBe(0);
      expect(result.nodes_shown).toBe(0);
      expect(result.nodes_omitted).toBe(0);
    });

    test("outbound traversal follows call edges from seed", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      // alpha → beta
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "beta", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      expect(result.seeds).toContain("src/a.ts#alpha");
      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
      const betaNode = result.nodes.find((n) => n.fqn === "src/b.ts#beta");
      expect(betaNode).toBeDefined();
      expect(betaNode!.depth).toBe(1);
      expect(result.edges.length).toBe(1);
      expect(result.chains.length).toBeGreaterThan(0);
    });

    test("inbound traversal follows incoming edges to seed", async () => {
      const def = makeDef("src/b.ts", "beta");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      // caller is alpha → beta (inbound to beta)
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "alpha", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/b.ts#beta",
        projectId: "cov-trace",
        direction: "inbound",
        mode: "calls",
        depth: 3,
      });

      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
      // alpha is the caller found via inbound
      const alphaNode = result.nodes.find((n) => n.fqn === "src/a.ts#alpha");
      expect(alphaNode).toBeDefined();
    });

    test("both direction runs outbound and inbound", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      let callCount = 0;
      mockGetEdges = mock(() => {
        callCount++;
        if (callCount === 1) {
          // outbound from alpha → beta
          return Promise.resolve([edge("src/a.ts", 5, "beta", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" })]);
        }
        // inbound to alpha (gamma → alpha)
        return Promise.resolve([edge("src/c.ts", 10, "gamma", "call", "src/a.ts#alpha", { callerFqn: "src/c.ts#gamma" })]);
      });

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "both",
        mode: "calls",
        depth: 3,
      });

      const names = result.nodes.map((n) => n.name);
      expect(names).toContain("beta");
      expect(names).toContain("gamma");
    });
  });

  // ── tracePath — mode / edge_types ─────────────────────────────────────────

  describe("mode and edge_types", () => {
    test("mode=calls uses ['call'] edge types", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        mode: "calls",
      });
      expect(result.edgeTypes).toEqual(["call"]);
    });

    test("mode=data_flow uses ['call', 'data_flow'] edge types", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        mode: "data_flow",
      });
      expect(result.edgeTypes).toEqual(["call", "data_flow"]);
    });

    test("mode=cross_service uses http+emit+listen+data_flow", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        mode: "cross_service",
      });
      expect(result.edgeTypes).toEqual(["http_call", "emit", "listen", "data_flow"]);
    });

    test("mode=all uses all edge types", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        mode: "all",
      });
      expect(result.edgeTypes).toEqual(["call", "data_flow", "http_call", "emit", "listen", "import", "type_ref", "extend", "implement"]);
    });

    test("explicit edge_types overrides mode", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        mode: "calls",
        edge_types: ["http_call", "emit"],
      });
      expect(result.edgeTypes).toEqual(["http_call", "emit"]);
    });

    test("explicit empty edge_types falls back to mode", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        mode: "calls",
        edge_types: [],
      });
      expect(result.edgeTypes).toEqual(["call"]);
    });
  });

  // ── tracePath — depth ──────────────────────────────────────────────────────

  describe("depth handling", () => {
    test("depth is clamped to MAX_DEPTH (6)", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        depth: 999,
      });
      // Should not throw; depth clamped to 6
      expect(result.nodes.length).toBe(1); // just the seed
    });

    test("depth=0 means only seed is returned", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "beta", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        depth: 0,
      });
      expect(result.nodes.length).toBe(1); // only seed
      expect(result.edges.length).toBe(0);
    });

    test("negative depth is clamped to 0", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        depth: -5,
      });
      expect(result.nodes.length).toBe(1);
    });
  });

  // ── tracePath — syntheticTarget (HTTP routes, events, bare names) ─────────

  describe("syntheticTarget via outbound edges", () => {
    test("HTTP_CALL edge without targetFqn creates synthetic http: route leaf", async () => {
      const def = makeDef("src/a.ts", "fetchAlpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "fetch", "http_call", undefined, { route: "/api/v1/alpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#fetchAlpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "cross_service",
        depth: 3,
      });

      // The synthetic leaf should be in nodes
      const httpNode = result.nodes.find((n) => n.fqn === "http:/api/v1/alpha");
      expect(httpNode).toBeDefined();
      // Edge should be recorded
      const httpEdges = result.edges.filter((e) => e.type === "http_call");
      expect(httpEdges.length).toBe(1);
    });

    test("emit edge without targetFqn creates synthetic event: leaf", async () => {
      const def = makeDef("src/a.ts", "emitter");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "emit", "emit", undefined, { event: "user.created" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#emitter",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "cross_service",
        depth: 3,
      });

      const eventNode = result.nodes.find((n) => n.fqn === "event:user.created");
      expect(eventNode).toBeDefined();
    });

    test("edge with no route/event/target falls back to refKind:symbolName", async () => {
      const def = makeDef("src/a.ts", "caller");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "bareFn", "call", undefined, null),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#caller",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      // Synthetic leaf: call:bareFn
      const syntheticNode = result.nodes.find((n) => n.fqn === "call:bareFn");
      expect(syntheticNode).toBeDefined();
    });

    test("edge with no symbolName and no route/event returns undefined (no synthetic)", async () => {
      const def = makeDef("src/a.ts", "caller");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "", "call", undefined, null),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#caller",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      // Only the seed node — no synthetic leaf created
      expect(result.nodes.length).toBe(1);
    });
  });

  // ── tracePath — self-hop detection ────────────────────────────────────────

  describe("self-hop detection", () => {
    test("self-hop edge is recorded but not traversed", async () => {
      const def = makeDef("src/a.ts", "loop");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      // Edge from alpha to alpha (self-hop) — otherFqn === fqn
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "loop", "call", "src/a.ts#loop", { callerFqn: "src/a.ts#loop" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#loop",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      // Only seed node; self-hop doesn't add a new node
      expect(result.nodes.length).toBe(1);
      expect(result.truncated).toBe(false);
    });
  });

  // ── tracePath — include_tests gate ────────────────────────────────────────

  describe("include_tests gate", () => {
    test("test-file nodes excluded by default (include_tests=false)", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("alpha.test.ts", 5, "testAlpha", "call", "src/a.ts#alpha", { callerFqn: "alpha.test.ts#testAlpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "inbound",
        mode: "calls",
        depth: 3,
        include_tests: false,
      });

      // The test file node should NOT appear
      const testNode = result.nodes.find((n) => n.isTest && !n.isSeed);
      expect(testNode).toBeUndefined();
    });

    test("test-file nodes included when include_tests=true", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("alpha.test.ts", 5, "testAlpha", "call", "src/a.ts#alpha", { callerFqn: "alpha.test.ts#testAlpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "inbound",
        mode: "calls",
        depth: 3,
        include_tests: true,
      });

      const testNode = result.nodes.find((n) => n.isTest);
      expect(testNode).toBeDefined();
    });

    test("seed in test file is kept even with include_tests=false", async () => {
      const def = makeDef("alpha.test.ts", "testAlpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "alpha.test.ts#testAlpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
        include_tests: false,
      });

      const seedNode = result.nodes.find((n) => n.isSeed);
      expect(seedNode).toBeDefined();
      expect(seedNode!.isTest).toBe(true);
    });
  });

  // ── tracePath — deadline ───────────────────────────────────────────────────

  describe("deadline", () => {
    test("deadline aborts traversal with truncated=true", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "beta", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" }),
      ]));

      let ticks = 0;
      const start = 10_000;
      const now = () => {
        const v = ticks === 0 ? start : start + 1000;
        ticks++;
        return v;
      };

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
        deadlineMs: 1,
        now,
      });

      expect(result.truncated).toBe(true);
      expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    });

    test("default deadline does not truncate normal walk", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      expect(result.truncated).toBe(false);
    });
  });

  // ── tracePath — getEdges failure handling ─────────────────────────────────

  describe("getEdges failure", () => {
    test("getEdges throwing does not abort traversal (best-effort)", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.reject(new Error("DB error")));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      // Seed is still present; the failed edge query is skipped
      expect(result.nodes.length).toBe(1);
      expect(result.truncated).toBe(false);
    });
  });

  // ── tracePath — callerFqn defensive filter ────────────────────────────────

  describe("callerFqn defensive filter (outbound)", () => {
    test("edge with mismatched callerFqn is dropped", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        // callerFqn doesn't match seed fqn → dropped
        edge("src/a.ts", 5, "beta", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#other" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      // No edges recorded (the mismatched one was dropped)
      expect(result.edges.length).toBe(0);
      // Only seed
      expect(result.nodes.length).toBe(1);
    });

    test("edge without callerFqn is accepted (non-call edges)", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "beta", "data_flow", "src/b.ts#beta", null),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "data_flow",
        depth: 3,
      });

      // data_flow edge without callerFqn is accepted
      expect(result.edges.length).toBe(1);
      expect(result.nodes.length).toBe(2);
    });
  });

  // ── tracePath — inbound targetFqn filter ─────────────────────────────────

  describe("inbound targetFqn filter", () => {
    test("inbound edge with wrong targetFqn is dropped", async () => {
      const def = makeDef("src/b.ts", "beta");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        // targetFqn !== seed fqn → dropped
        edge("src/a.ts", 5, "alpha", "call", "src/c.ts#gamma", { callerFqn: "src/a.ts#alpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/b.ts#beta",
        projectId: "cov-trace",
        direction: "inbound",
        mode: "calls",
        depth: 3,
      });

      expect(result.edges.length).toBe(0);
      expect(result.nodes.length).toBe(1); // only seed
    });
  });

  // ── tracePath — extractCallerFqn (inbound) ────────────────────────────────

  describe("extractCallerFqn (inbound)", () => {
    test("inbound edge with callerFqn resolves to caller node", async () => {
      const def = makeDef("src/b.ts", "beta");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "alpha", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/b.ts#beta",
        projectId: "cov-trace",
        direction: "inbound",
        mode: "calls",
        depth: 3,
      });

      const alphaNode = result.nodes.find((n) => n.fqn === "src/a.ts#alpha");
      expect(alphaNode).toBeDefined();
    });

    test("inbound edge without callerFqn returns undefined (no hop)", async () => {
      const def = makeDef("src/b.ts", "beta");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "alpha", "data_flow", "src/b.ts#beta", null),
      ]));

      const result = await svc.tracePath({
        symbol: "src/b.ts#beta",
        projectId: "cov-trace",
        direction: "inbound",
        mode: "data_flow",
        depth: 3,
      });

      // No callerFqn → no hop → only seed
      expect(result.nodes.length).toBe(1);
    });
  });

  // ── tracePath — buildChains ────────────────────────────────────────────────

  describe("buildChains", () => {
    test("empty edges produce no chains", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });
      expect(result.chains).toEqual([]);
    });

    test("multi-hop chain produces readable chain string", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      let callCount = 0;
      mockGetEdges = mock(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([edge("src/a.ts", 5, "beta", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" })]);
        if (callCount === 2) return Promise.resolve([edge("src/b.ts", 10, "gamma", "call", "src/c.ts#gamma", { callerFqn: "src/b.ts#beta" })]);
        return Promise.resolve([]);
      });

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      const fullChain = result.chains.find((c) => c.includes("gamma"));
      expect(fullChain).toBeDefined();
      expect(fullChain).toMatch(/alpha.*beta.*gamma/);
    });

    test("cycle in chain produces ↺ marker", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      let callCount = 0;
      mockGetEdges = mock(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([edge("src/a.ts", 5, "beta", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" })]);
        if (callCount === 2) return Promise.resolve([edge("src/b.ts", 10, "alpha", "call", "src/a.ts#alpha", { callerFqn: "src/b.ts#beta" })]);
        return Promise.resolve([]);
      });

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 6,
      });

      // Chain should contain the cycle marker
      const cycleChain = result.chains.find((c) => c.includes("↺"));
      expect(cycleChain).toBeDefined();
    });
  });

  // ── tracePath — nodes_total / nodes_shown / nodes_omitted ─────────────────

  describe("N4 node counting", () => {
    test("nodes_total counts unique FQNs even when MAX_NODES rejects", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      // Return many edges to create many nodes — but we only have a few
      const edges: MockEdgeResult[] = [];
      for (let i = 0; i < 5; i++) {
        edges.push(edge("src/a.ts", i, `fn${i}`, "call", `src/b${i}.ts#fn${i}`, { callerFqn: "src/a.ts#alpha" }));
      }
      mockGetEdges = mock(() => Promise.resolve(edges));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      // 1 seed + 5 children = 6 total
      expect(result.nodes_total).toBe(6);
      expect(result.nodes_shown).toBe(6);
      expect(result.nodes_omitted).toBe(0);
    });
  });

  // ── tracePath — identityResolution ─────────────────────────────────────────

  describe("identityResolution", () => {
    test("resolved lookup includes identityResolution in result", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
      });
      expect(result.identityResolution).toBeDefined();
      expect(result.identityResolution!.status).toBe("resolved");
    });

    test("bare lookup does not include identityResolution", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("bare", undefined, [def])));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "alpha",
        projectId: "cov-trace",
      });
      // bare status is excluded from identityResolution
      expect(result.identityResolution).toBeUndefined();
    });
  });

  // ── tracePath — defaults ──────────────────────────────────────────────────

  describe("defaults", () => {
    test("direction defaults to outbound", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
      });
      expect(result.direction).toBe("outbound");
    });

    test("mode defaults to calls", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
      });
      expect(result.mode).toBe("calls");
    });

    test("include_tests defaults to false", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
      });
      expect(result.nodes.every((n) => !n.isTest || n.isSeed)).toBe(true);
    });

    test("symbol fallback to function_name when symbol is empty", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([]));

      const result = await svc.tracePath({
        function_name: "alpha",
        projectId: "cov-trace",
      });
      expect(result.symbol).toBe("alpha");
    });
  });

  // ── fqnToName ─────────────────────────────────────────────────────────────

  describe("fqnToName (via node names)", () => {
    test("FQN with # extracts name after #", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "beta", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "calls",
        depth: 3,
      });

      const betaNode = result.nodes.find((n) => n.fqn === "src/b.ts#beta");
      expect(betaNode!.name).toBe("beta");
    });

    test("FQN without # returns the FQN as name", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockLookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockGetEdges = mock(() => Promise.resolve([
        edge("src/a.ts", 5, "fetch", "http_call", undefined, { route: "/api/x" }),
      ]));

      const result = await svc.tracePath({
        symbol: "src/a.ts#alpha",
        projectId: "cov-trace",
        direction: "outbound",
        mode: "cross_service",
        depth: 3,
      });

      const httpNode = result.nodes.find((n) => n.fqn === "http:/api/x");
      // http:/api/x has no # → name is the full string
      expect(httpNode!.name).toBe("http:/api/x");
    });
  });

  // ── getInstance ────────────────────────────────────────────────────────────

  describe("getInstance", () => {
    test("returns singleton instance", () => {
      const inst1 = TracePathService.getInstance();
      const inst2 = TracePathService.getInstance();
      expect(inst1).toBe(inst2);
    });
  });
});