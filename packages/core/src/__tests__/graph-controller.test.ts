/**
 * Unit tests for GraphController.
 *
 * Mocks tracePathService and impactAnalysisService so the controller's
 * input validation, result shaping, and not-found hint logic can be
 * exercised without a DB. Covers tracePath (found/not-found/throw/
 * identityResolution) and analyzeImpact (shaping + throw + defaults).
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────

mock.module("../services/symbol/trace-path.js", () => ({
  tracePathService: { tracePath: mock(() => Promise.resolve({})) },
}));

mock.module("../services/symbol/impact-analysis.js", () => ({
  impactAnalysisService: { analyze: mock(() => Promise.resolve({})) },
}));

mock.module("../services/symbol/definition-lookup.js", () => ({
  toSymbolIdentityResolution: (r: any) =>
    r ? { status: r.status, fqn: r.definition?.id ?? r.query } : undefined,
}));

import { GraphController } from "../controllers/graph-controller.js";

function resetController() {
  (GraphController as any).instance = null;
}

describe("GraphController", () => {
  let ctrl: GraphController;

  beforeEach(() => {
    resetController();
    ctrl = GraphController.getInstance();
  });

  // ── tracePath ────────────────────────────────────────────
  describe("tracePath", () => {
    test("throws when projectId is missing", async () => {
      await expect(
        ctrl.tracePath({ projectId: "", function_name: "foo" } as any),
      ).rejects.toThrow("projectId is required");
    });

    test("throws when no seed (function_name/symbol/qualifiedName) provided", async () => {
      await expect(
        ctrl.tracePath({ projectId: "p1" } as any),
      ).rejects.toThrow("function_name (or symbol/qualifiedName) is required");
    });

    test("returns found:true with shaped result when seeds resolve", async () => {
      const { tracePathService } = require("../services/symbol/trace-path.js");
      tracePathService.tracePath = mock(() =>
        Promise.resolve({
          projectId: "p1",
          symbol: "foo",
          mode: "calls",
          direction: "outbound",
          edgeTypes: ["call"],
          seeds: ["src/a.ts#foo"],
          nodes: [{ fqn: "src/a.ts#foo", name: "foo", depth: 0 }],
          edges: [],
          chains: ["foo()"],
          truncated: false,
          nodes_total: 1,
          nodes_shown: 1,
          nodes_omitted: 0,
        }),
      );
      const res = await ctrl.tracePath({ projectId: "p1", function_name: "foo" });
      expect(res.found).toBe(true);
      if (res.found) {
        expect(res.result.projectId).toBe("p1");
        expect(res.result.symbol).toBe("foo");
        expect(res.result.nodeCount).toBe(1);
        expect(res.result.edgeCount).toBe(0);
        expect(res.result.seeds).toEqual(["src/a.ts#foo"]);
        expect(res.result.chains).toEqual(["foo()"]);
      }
    });

    test("returns found:false with hint when seeds empty", async () => {
      const { tracePathService } = require("../services/symbol/trace-path.js");
      tracePathService.tracePath = mock(() =>
        Promise.resolve({
          projectId: "p1",
          symbol: "missing",
          mode: "calls",
          direction: "outbound",
          edgeTypes: ["call"],
          seeds: [],
          nodes: [],
          edges: [],
          chains: [],
          truncated: false,
          nodes_total: 0,
          nodes_shown: 0,
          nodes_omitted: 0,
        }),
      );
      const res = await ctrl.tracePath({ projectId: "p1", symbol: "missing" });
      expect(res.found).toBe(false);
      if (!res.found) {
        expect(res.symbol).toBe("missing");
        expect(res.projectId).toBe("p1");
        expect(res.hint).toContain("search_definitions");
      }
    });

    test("found:false includes identityResolution when present", async () => {
      const { tracePathService } = require("../services/symbol/trace-path.js");
      tracePathService.tracePath = mock(() =>
        Promise.resolve({
          projectId: "p1",
          symbol: "amb",
          mode: "calls",
          direction: "outbound",
          edgeTypes: ["call"],
          seeds: [],
          nodes: [],
          edges: [],
          chains: [],
          truncated: false,
          nodes_total: 0,
          nodes_shown: 0,
          nodes_omitted: 0,
          identityResolution: {
            status: "ambiguous",
            legacyFqn: "amb",
            candidates: [{ fqn: "a.ts#amb", score: 0.9 }],
          },
        }),
      );
      const res = await ctrl.tracePath({ projectId: "p1", symbol: "amb" });
      expect(res.found).toBe(false);
      if (!res.found) {
        expect(res.identityResolution).toBeDefined();
        expect(res.identityResolution.status).toBe("ambiguous");
      }
    });

    test("found:true includes identity when identityResolution present", async () => {
      const { tracePathService } = require("../services/symbol/trace-path.js");
      tracePathService.tracePath = mock(() =>
        Promise.resolve({
          projectId: "p1",
          symbol: "foo",
          mode: "calls",
          direction: "outbound",
          edgeTypes: ["call"],
          seeds: ["a.ts#foo"],
          nodes: [],
          edges: [],
          chains: [],
          truncated: false,
          nodes_total: 0,
          nodes_shown: 0,
          nodes_omitted: 0,
          identityResolution: { status: "resolved", definition: { id: "a.ts#foo" } },
        }),
      );
      const res = await ctrl.tracePath({ projectId: "p1", function_name: "foo" });
      expect(res.found).toBe(true);
      if (res.found) {
        expect(res.result.identity).toBeDefined();
        expect(res.result.identity.status).toBe("resolved");
      }
    });

    test("passes direction/mode/depth/edge_types/include_tests through", async () => {
      const { tracePathService } = require("../services/symbol/trace-path.js");
      tracePathService.tracePath = mock(() =>
        Promise.resolve({
          projectId: "p1",
          symbol: "foo",
          mode: "data_flow",
          direction: "inbound",
          edgeTypes: ["call", "data_flow"],
          seeds: ["a.ts#foo"],
          nodes: [],
          edges: [],
          chains: [],
          truncated: true,
          nodes_total: 0,
          nodes_shown: 0,
          nodes_omitted: 0,
        }),
      );
      await ctrl.tracePath({
        projectId: "p1",
        function_name: "foo",
        direction: "inbound",
        mode: "data_flow",
        depth: 5,
        include_tests: true,
        edge_types: ["call", "data_flow"],
      });
      const arg = tracePathService.tracePath.mock.calls[0][0];
      expect(arg.direction).toBe("inbound");
      expect(arg.mode).toBe("data_flow");
      expect(arg.depth).toBe(5);
      expect(arg.include_tests).toBe(true);
      expect(arg.edge_types).toEqual(["call", "data_flow"]);
    });

    test("uses qualifiedName as seed when function_name/symbol absent", async () => {
      const { tracePathService } = require("../services/symbol/trace-path.js");
      tracePathService.tracePath = mock(() =>
        Promise.resolve({
          projectId: "p1",
          symbol: "foo",
          mode: "calls",
          direction: "outbound",
          edgeTypes: ["call"],
          seeds: ["a.ts#foo"],
          nodes: [],
          edges: [],
          chains: [],
          truncated: false,
          nodes_total: 0,
          nodes_shown: 0,
          nodes_omitted: 0,
        }),
      );
      const res = await ctrl.tracePath({
        projectId: "p1",
        qualifiedName: "a.ts#foo",
      });
      expect(res.found).toBe(true);
      // tracePath called with symbol="" (no function_name), qualifiedName set
      const arg = tracePathService.tracePath.mock.calls[0][0];
      expect(arg.qualifiedName).toBe("a.ts#foo");
    });
  });

  // ── analyzeImpact ────────────────────────────────────────
  describe("analyzeImpact", () => {
    test("throws when projectId is missing", async () => {
      await expect(
        ctrl.analyzeImpact({ projectId: "", projectPath: "/p" } as any),
      ).rejects.toThrow("projectId is required");
    });

    test("throws when projectPath is missing", async () => {
      await expect(
        ctrl.analyzeImpact({ projectId: "p1", projectPath: "" } as any),
      ).rejects.toThrow("projectPath is required");
    });

    test("returns shaped result with default scope 'unstaged'", async () => {
      const { impactAnalysisService } = require("../services/symbol/impact-analysis.js");
      impactAnalysisService.analyze = mock(() =>
        Promise.resolve({
          projectId: "p1",
          scope: "unstaged",
          depth: 2,
          changedFiles: [{ path: "a.ts", symbols: [] }],
          impacted: [
            {
              fqn: "b.ts#bar",
              name: "bar",
              file: "b.ts",
              line: 5,
              depth: 1,
              centrality: 0.8,
              risk: 0.9,
              reason: "imports a.ts",
              via: { changedFile: "a.ts", edge: "import" },
            },
          ],
          truncated: false,
          untrackedFiltered: 0,
          impacted_total: 1,
          impacted_shown: 1,
          impacted_omitted: 0,
        }),
      );
      const res = await ctrl.analyzeImpact({
        projectId: "p1",
        projectPath: "/repo",
      });
      expect(res.projectId).toBe("p1");
      expect(res.scope).toBe("unstaged");
      expect(res.changedFileCount).toBe(1);
      expect(res.impactedCount).toBe(1);
      expect(res.impacted_total).toBe(1);
      expect(res.impacted_shown).toBe(1);
      expect(res.impacted_omitted).toBe(0);
      expect(res.untrackedFiltered).toBe(0);
      // default scope passed to service
      const arg = impactAnalysisService.analyze.mock.calls[0][0];
      expect(arg.scope).toBe("unstaged");
    });

    test("passes scope/base_branch/since/depth/paths/diffRunner through", async () => {
      const { impactAnalysisService } = require("../services/symbol/impact-analysis.js");
      impactAnalysisService.analyze = mock(() =>
        Promise.resolve({
          projectId: "p1",
          scope: "committed",
          baseBranch: "main",
          since: "2026-01-01",
          depth: 3,
          changedFiles: [],
          impacted: [],
          truncated: false,
          untrackedFiltered: 2,
          impacted_total: 0,
          impacted_shown: 0,
          impacted_omitted: 0,
          note: "clean tree",
        }),
      );
      const diffRunner = () => ({ paths: [], untrackedFiltered: 0 });
      const res = await ctrl.analyzeImpact({
        projectId: "p1",
        projectPath: "/repo",
        scope: "committed",
        base_branch: "main",
        since: "2026-01-01",
        depth: 3,
        paths: ["src/a.ts"],
        diffRunner,
      });
      expect(res.scope).toBe("committed");
      expect(res.baseBranch).toBe("main");
      expect(res.since).toBe("2026-01-01");
      expect(res.depth).toBe(3);
      expect(res.note).toBe("clean tree");
      expect(res.untrackedFiltered).toBe(2);
      const arg = impactAnalysisService.analyze.mock.calls[0][0];
      expect(arg.baseBranch).toBe("main");
      expect(arg.since).toBe("2026-01-01");
      expect(arg.depth).toBe(3);
      expect(arg.paths).toEqual(["src/a.ts"]);
      expect(arg.diffRunner).toBe(diffRunner);
    });

    test("surfaces truncated + note in result", async () => {
      const { impactAnalysisService } = require("../services/symbol/impact-analysis.js");
      impactAnalysisService.analyze = mock(() =>
        Promise.resolve({
          projectId: "p1",
          scope: "all",
          depth: 2,
          changedFiles: [],
          impacted: [],
          truncated: true,
          untrackedFiltered: 0,
          impacted_total: 150,
          impacted_shown: 100,
          impacted_omitted: 50,
          note: "capped at MAX_IMPACTED",
        }),
      );
      const res = await ctrl.analyzeImpact({
        projectId: "p1",
        projectPath: "/repo",
        scope: "all",
      });
      expect(res.truncated).toBe(true);
      expect(res.impacted_total).toBe(150);
      expect(res.impacted_shown).toBe(100);
      expect(res.impacted_omitted).toBe(50);
      expect(res.note).toBe("capped at MAX_IMPACTED");
    });
  });

  // ── singleton ────────────────────────────────────────────
  describe("singleton", () => {
    test("getInstance returns same instance", () => {
      const a = GraphController.getInstance();
      const b = GraphController.getInstance();
      expect(a).toBe(b);
    });
  });
});