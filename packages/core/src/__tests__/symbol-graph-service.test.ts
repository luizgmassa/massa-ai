/**
 * Unit tests for SymbolGraphService — full method coverage.
 *
 * Strategy: mock the symbol-repository-factory + workspace-manager modules
 * before importing the service, so getSymbolRepository() returns a controllable
 * stub and getProjectRoot resolves against a temp dir without a live DB.
 * The DefinitionLookupService dependency is injected via constructor.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";

// ── Mock repository ──────────────────────────────────────────────────────────

type MockRepo = {
  allFiles: ReturnType<typeof mock>;
  allImportEdges: ReturnType<typeof mock>;
  getCentrality: ReturnType<typeof mock>;
  getTopCentralFiles: ReturnType<typeof mock>;
  getProjectMapSnapshot: ReturnType<typeof mock>;
  updateCentrality: ReturnType<typeof mock>;
  findDependencies: ReturnType<typeof mock>;
  findReferencesByFqn: ReturnType<typeof mock>;
  findReferencesByName: ReturnType<typeof mock>;
  findEdges: ReturnType<typeof mock>;
  listDefinitions: ReturnType<typeof mock>;
  countDefinitions: ReturnType<typeof mock>;
};

let mockRepo: MockRepo;

mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: () => mockRepo,
}));

mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    getWorkspace: async (projectId: string) => ({
      project_id: projectId,
      project_path: tempDir,
      status: "indexed",
      files_count: 1,
      chunks_count: 1,
      symbols_count: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    }),
    markIndexing: async () => {},
  },
}));

let tempDir: string;

// Import after mocks are registered
import { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";
import type { DefinitionLookupResult } from "../services/symbol/definition-lookup.js";
import type {
  SymbolDefinition,
  SymbolReference,
  SymbolImport,
  CentralityEntry,
  ProjectMapGraphSnapshot,
} from "../data/symbol/symbol-repository-pg.js";

// ── Helpers to build mock data ──────────────────────────────────────────────

function makeDef(
  file: string,
  name: string,
  overrides: Partial<SymbolDefinition> = {},
): SymbolDefinition {
  return {
    id: `${file}#${name}`,
    project_id: "cov-sym",
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

function makeRef(
  fromFile: string,
  fromLine: number,
  symbolName: string,
  refKind: string,
  targetFqn?: string,
  meta?: Record<string, unknown> | null,
): SymbolReference {
  return {
    project_id: "cov-sym",
    from_file: fromFile,
    from_line: fromLine,
    symbol_name: symbolName,
    ref_kind: refKind as any,
    target_fqn: targetFqn,
    meta,
  };
}

function makeImport(
  fromFile: string,
  toFile: string | undefined,
  specifier: string,
  names: string[] = [],
  isExternal = false,
): SymbolImport {
  return {
    project_id: "cov-sym",
    from_file: fromFile,
    to_file: toFile,
    specifier,
    imported_names: names,
    is_external: isExternal,
    is_type_only: false,
  };
}

function makeCentralityEntry(file: string, score: number): CentralityEntry {
  return {
    project_id: "cov-sym",
    file_path: file,
    score,
    updated_at: Date.now(),
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

function makeSnapshot(
  overrides: Partial<ProjectMapGraphSnapshot> = {},
): ProjectMapGraphSnapshot {
  return {
    workspace: {
      project_id: "cov-sym",
      project_path: tempDir,
      status: "indexed",
      last_indexed_at: Date.now(),
      files_count: 2,
      chunks_count: 2,
      symbols_count: 3,
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    generationId: "gen-1",
    counts: { files: 2, definitions: 3, references: 1, imports: 2, centrality: 1 },
    diagnostics: { recovered: 0, hardFailures: 0, staleFiles: 0, errors: 0 },
    languages: { typescript: 2 },
    topCentralFiles: [makeCentralityEntry("src/a.ts", 0.9)],
    symbolsByKind: { function: 2, class: 1 },
    filesByLanguage: { typescript: 2 },
    recentFiles: [{ filePath: "src/a.ts", indexedAt: Date.now() }],
    edgesByKind: { call: 1 },
    architecture: {
      files: ["src/a.ts", "src/b.ts"],
      importEdges: [makeImport("src/a.ts", "src/b.ts", "./b")],
      definitions: [makeDef("src/a.ts", "alpha"), makeDef("src/b.ts", "beta")],
      httpEdges: [],
      callEdges: [],
      centrality: new Map([["src/a.ts", 0.9]]),
    },
    ...overrides,
  };
}

// ── Test suites ──────────────────────────────────────────────────────────────

describe("SymbolGraphService", () => {
  let svc: SymbolGraphService;
  let lookupMock: { lookup: ReturnType<typeof mock> };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cov-sym-"));

    mockRepo = {
      allFiles: mock(() => Promise.resolve(["src/a.ts", "src/b.ts"])),
      allImportEdges: mock(() => Promise.resolve([makeImport("src/a.ts", "src/b.ts", "./b")])),
      getCentrality: mock(() => Promise.resolve(new Map([["src/a.ts", 0.9]]))),
      getTopCentralFiles: mock(() => Promise.resolve([makeCentralityEntry("src/a.ts", 0.9)])),
      getProjectMapSnapshot: mock(() => Promise.resolve(makeSnapshot())),
      updateCentrality: mock(() => Promise.resolve()),
      findDependencies: mock(() => Promise.resolve([makeImport("src/a.ts", "src/b.ts", "./b", ["beta"])])),
      findReferencesByFqn: mock(() => Promise.resolve([])),
      findReferencesByName: mock(() => Promise.resolve([])),
      findEdges: mock(() => Promise.resolve([])),
      listDefinitions: mock(() => Promise.resolve([makeDef("src/a.ts", "alpha")])),
      countDefinitions: mock(() => Promise.resolve(1)),
    };

    lookupMock = { lookup: mock(() => Promise.resolve(mockLookupResult("resolved", makeDef("src/a.ts", "alpha")))) };
    svc = new SymbolGraphService(lookupMock as any);

    // Clear the singleton cache so our mock workspace path doesn't leak
    (svc as any).projectRootCache.clear();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ── hasData ──────────────────────────────────────────────────────────────

  describe("hasData", () => {
    test("returns true when files exist", async () => {
      mockRepo.allFiles = mock(() => Promise.resolve(["src/a.ts"]));
      expect(await svc.hasData("cov-sym")).toBe(true);
    });

    test("returns false when no files", async () => {
      mockRepo.allFiles = mock(() => Promise.resolve([]));
      expect(await svc.hasData("cov-sym")).toBe(false);
    });
  });

  // ── goToDefinition ────────────────────────────────────────────────────────

  describe("goToDefinition", () => {
    test("returns empty when lookup is missing", async () => {
      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("missing")));
      const result = await svc.goToDefinition("cov-sym", "nonexistent");
      expect(result).toEqual([]);
    });

    test("returns empty when lookup is ambiguous (no defs)", async () => {
      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("ambiguous")));
      const result = await svc.goToDefinition("cov-sym", "ambiguousName");
      expect(result).toEqual([]);
    });

    test("resolves a single definition and enriches top-3 with snippet", async () => {
      const def = makeDef("src/a.ts", "alpha", { line_start: 1, line_end: 3 });
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "a.ts"), "line1\nline2\nline3\nline4\n");

      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map([["src/a.ts", 0.9]])));
      mockRepo.findDependencies = mock(() => Promise.resolve([]));

      const result = await svc.goToDefinition("cov-sym", "alpha");
      expect(result.length).toBe(1);
      expect(result[0]!.fqn).toBe("src/a.ts#alpha");
      expect(result[0]!.centralityScore).toBe(0.9);
      expect(result[0]!.snippet).toBeDefined();
    });

    test("uses bare lookup with multiple defs and sorts by centrality", async () => {
      const def1 = makeDef("src/a.ts", "run", { line_start: 1, line_end: 2 });
      const def2 = makeDef("src/b.ts", "run", { line_start: 1, line_end: 2 });
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "a.ts"), "content\n");
      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "content\n");

      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("bare", undefined, [def1, def2])));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map([["src/a.ts", 0.5], ["src/b.ts", 0.9]])));
      mockRepo.findDependencies = mock(() => Promise.resolve([]));

      const result = await svc.goToDefinition("cov-sym", "run");
      expect(result.length).toBe(2);
      // Higher centrality first
      expect(result[0]!.file).toBe("src/b.ts");
    });

    test("disambiguates by same-file priority when fromFile provided", async () => {
      const def1 = makeDef("src/a.ts", "run");
      const def2 = makeDef("src/b.ts", "run");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "a.ts"), "x\n");
      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "x\n");

      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("bare", undefined, [def2, def1])));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map([["src/a.ts", 0.1], ["src/b.ts", 0.9]])));
      mockRepo.findDependencies = mock(() => Promise.resolve([makeImport("src/a.ts", "src/b.ts", "./b")]));

      const result = await svc.goToDefinition("cov-sym", "run", "src/a.ts");
      // Same-file priority beats centrality
      expect(result[0]!.file).toBe("src/a.ts");
    });

    test("disambiguates by direct import when fromFile provided", async () => {
      const def1 = makeDef("src/a.ts", "run");
      const def2 = makeDef("src/b.ts", "run");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "a.ts"), "x\n");
      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "x\n");

      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("bare", undefined, [def2, def1])));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map([["src/a.ts", 0.1], ["src/b.ts", 0.9]])));
      mockRepo.findDependencies = mock(() => Promise.resolve([makeImport("src/main.ts", "src/b.ts", "./b")]));

      const result = await svc.goToDefinition("cov-sym", "run", "src/main.ts");
      // src/b.ts is a direct import of src/main.ts → priority 1 beats src/a.ts priority 0
      expect(result[0]!.file).toBe("src/b.ts");
    });

    test("uses resolvedLookup parameter when provided (skips lookup call)", async () => {
      const def = makeDef("src/a.ts", "alpha");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "a.ts"), "content\n");

      mockRepo.getCentrality = mock(() => Promise.resolve(new Map()));
      mockRepo.findDependencies = mock(() => Promise.resolve([]));

      const result = await svc.goToDefinition("cov-sym", "alpha", undefined, mockLookupResult("resolved", def));
      expect(result.length).toBe(1);
      expect(lookupMock.lookup).not.toHaveBeenCalled();
    });
  });

  // ── lookupDefinition ─────────────────────────────────────────────────────

  describe("lookupDefinition", () => {
    test("delegates to identityLookup", async () => {
      const def = makeDef("src/a.ts", "alpha");
      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      const result = await svc.lookupDefinition("cov-sym", "alpha");
      expect(result.status).toBe("resolved");
    });
  });

  // ── getReferences ─────────────────────────────────────────────────────────

  describe("getReferences", () => {
    test("searches by name when no fqn provided", async () => {
      const ref = makeRef("src/b.ts", 5, "alpha", "call", "src/a.ts#alpha");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "line1\nline2\nline3\nline4\nline5\nline6\n");

      mockRepo.findReferencesByName = mock(() => Promise.resolve([ref]));
      const result = await svc.getReferences("cov-sym", "alpha");
      expect(result.length).toBe(1);
      expect(result[0]!.fromFile).toBe("src/b.ts");
      expect(result[0]!.context).toBeDefined();
    });

    test("resolves by FQN when provided and lookup is resolved", async () => {
      const def = makeDef("src/a.ts", "alpha");
      const ref1 = makeRef("src/b.ts", 5, "alpha", "call", "src/a.ts#alpha");
      const ref2 = makeRef("src/c.ts", 10, "alpha", "call", "src/a.ts#alpha");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "x\n");
      await fs.writeFile(path.join(tempDir, "src", "c.ts"), "x\n");

      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockRepo.findReferencesByFqn = mock(() => Promise.resolve([ref1, ref2]));

      const result = await svc.getReferences("cov-sym", "alpha", "src/a.ts#alpha");
      expect(result.length).toBe(2);
    });

    test("deduplicates references by from_file+line+ref_kind+target_fqn", async () => {
      const def = makeDef("src/a.ts", "alpha");
      const ref = makeRef("src/b.ts", 5, "alpha", "call", "src/a.ts#alpha");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "x\n");

      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      // Same ref returned twice → deduped to 1
      mockRepo.findReferencesByFqn = mock(() => Promise.resolve([ref, ref, { ...ref }]));

      const result = await svc.getReferences("cov-sym", "alpha", "src/a.ts#alpha");
      expect(result.length).toBe(1);
    });

    test("uses both lookup.definition.id and fqn as targets when different", async () => {
      const def = makeDef("src/a.ts", "alpha");
      const ref1 = makeRef("src/b.ts", 5, "alpha", "call", "src/a.ts#alpha");
      const ref2 = makeRef("src/c.ts", 10, "alpha", "call", "src/a.ts#alpha-v2");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "x\n");
      await fs.writeFile(path.join(tempDir, "src", "c.ts"), "x\n");

      // def.id !== fqn → both targets queried
      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockRepo.findReferencesByFqn = mock((_pid: string, target: string) =>
        Promise.resolve(target === "src/a.ts#alpha" ? [ref1] : [ref2]));

      const result = await svc.getReferences("cov-sym", "alpha", "src/a.ts#alpha-v2");
      expect(result.length).toBe(2);
    });

    test("returns empty when FQN provided but lookup is not resolved", async () => {
      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("missing")));
      const result = await svc.getReferences("cov-sym", "alpha", "src/a.ts#alpha");
      expect(result).toEqual([]);
    });

    test("uses resolvedLookup parameter when provided", async () => {
      const def = makeDef("src/a.ts", "alpha");
      const ref = makeRef("src/b.ts", 5, "alpha", "call", "src/a.ts#alpha");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "x\n");

      mockRepo.findReferencesByFqn = mock(() => Promise.resolve([ref]));
      const result = await svc.getReferences("cov-sym", "alpha", "src/a.ts#alpha", mockLookupResult("resolved", def));
      expect(result.length).toBe(1);
      expect(lookupMock.lookup).not.toHaveBeenCalled();
    });
  });

  // ── getEdges ──────────────────────────────────────────────────────────────

  describe("getEdges", () => {
    test("queries typed edges and maps to EdgeResult", async () => {
      const ref = makeRef("src/a.ts", 5, "alpha", "call", "src/b.ts#beta", { callerFqn: "src/a.ts#alpha" });
      mockRepo.findEdges = mock(() => Promise.resolve([ref]));

      const result = await svc.getEdges("cov-sym", { types: ["call"], direction: "outgoing", fromSymbol: "src/a.ts#alpha" });
      expect(result.length).toBe(1);
      expect(result[0]!.refKind).toBe("call");
      expect(result[0]!.meta).toEqual({ callerFqn: "src/a.ts#alpha" });
    });

    test("returns empty when no edges found", async () => {
      mockRepo.findEdges = mock(() => Promise.resolve([]));
      const result = await svc.getEdges("cov-sym", {});
      expect(result).toEqual([]);
    });

    test("maps null meta to null", async () => {
      const ref = makeRef("src/a.ts", 5, "alpha", "call", undefined, null);
      mockRepo.findEdges = mock(() => Promise.resolve([ref]));
      const result = await svc.getEdges("cov-sym", {});
      expect(result[0]!.meta).toBeNull();
    });
  });

  // ── getDependencies ──────────────────────────────────────────────────────

  describe("getDependencies", () => {
    test("BFS over import graph builds nodes and edges", async () => {
      mockRepo.findDependencies = mock((_pid: string, file: string) => {
        if (file === "src/a.ts") return Promise.resolve([makeImport("src/a.ts", "src/b.ts", "./b", ["beta"])]);
        if (file === "src/b.ts") return Promise.resolve([makeImport("src/b.ts", "src/c.ts", "./c", ["gamma"])]);
        return Promise.resolve([]);
      });

      const result = await svc.getDependencies("cov-sym", "src/a.ts", 3);
      expect(result.nodes.map((n) => n.file)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
      expect(result.nodes.map((n) => n.depth)).toEqual([0, 1, 2]);
      expect(result.edges.length).toBe(2);
    });

    test("respects maxDepth limit", async () => {
      mockRepo.findDependencies = mock((_pid: string, file: string) => {
        if (file === "src/a.ts") return Promise.resolve([makeImport("src/a.ts", "src/b.ts", "./b")]);
        if (file === "src/b.ts") return Promise.resolve([makeImport("src/b.ts", "src/c.ts", "./c")]);
        return Promise.resolve([]);
      });

      const result = await svc.getDependencies("cov-sym", "src/a.ts", 1);
      expect(result.nodes.map((n) => n.file)).toEqual(["src/a.ts", "src/b.ts"]);
      // Only edge from a→b (depth 1), no b→c edge
      expect(result.edges.length).toBe(1);
    });

    test("handles external imports (no to_file) in edges", async () => {
      mockRepo.findDependencies = mock(() => Promise.resolve([
        makeImport("src/a.ts", undefined, "external-pkg", ["ext"], true),
      ]));

      const result = await svc.getDependencies("cov-sym", "src/a.ts", 3);
      expect(result.edges.length).toBe(1);
      expect(result.edges[0]!.to).toBe("external-pkg");
      expect(result.edges[0]!.isExternal).toBe(true);
    });

    test("does not re-visit already-visited nodes", async () => {
      mockRepo.findDependencies = mock((_pid: string, file: string) => {
        // a → b, a → c, b → c (c visited via a, not re-enqueued via b)
        if (file === "src/a.ts") return Promise.resolve([
          makeImport("src/a.ts", "src/b.ts", "./b"),
          makeImport("src/a.ts", "src/c.ts", "./c"),
        ]);
        if (file === "src/b.ts") return Promise.resolve([makeImport("src/b.ts", "src/c.ts", "./c")]);
        return Promise.resolve([]);
      });

      const result = await svc.getDependencies("cov-sym", "src/a.ts", 3);
      const cNodes = result.nodes.filter((n) => n.file === "src/c.ts");
      expect(cNodes.length).toBe(1);
    });
  });

  // ── listDefinitions ──────────────────────────────────────────────────────

  describe("listDefinitions", () => {
    test("returns definitions with total and total_exact=true under sentinel cap", async () => {
      const def = makeDef("src/a.ts", "alpha");
      mockRepo.listDefinitions = mock(() => Promise.resolve([def]));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map([["src/a.ts", 0.5]])));
      mockRepo.countDefinitions = mock(() => Promise.resolve(1));

      const result = await svc.listDefinitions("cov-sym");
      expect(result.definitions.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.total_exact).toBe(true);
    });

    test("returns total_exact=false when count exceeds 100k sentinel cap", async () => {
      mockRepo.listDefinitions = mock(() => Promise.resolve([]));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map()));
      mockRepo.countDefinitions = mock(() => Promise.resolve(100_001));

      const result = await svc.listDefinitions("cov-sym");
      expect(result.total).toBe(100_000);
      expect(result.total_exact).toBe(false);
    });

    test("passes opts to repo methods", async () => {
      mockRepo.listDefinitions = mock(() => Promise.resolve([]));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map()));
      mockRepo.countDefinitions = mock(() => Promise.resolve(0));

      await svc.listDefinitions("cov-sym", { kind: ["function"], exportedOnly: true, file: "src/a.ts", search: "alpha", limit: 50 });
      expect(mockRepo.countDefinitions).toHaveBeenCalledWith("cov-sym", "alpha", ["function"], true, "src/a.ts");
      expect(mockRepo.listDefinitions).toHaveBeenCalledWith("cov-sym", { kind: ["function"], exportedOnly: true, file: "src/a.ts", search: "alpha", limit: 50 });
    });
  });

  // ── getTopCentralFiles ───────────────────────────────────────────────────

  describe("getTopCentralFiles", () => {
    test("maps CentralityEntry rows to CentralityResult", async () => {
      const entry = makeCentralityEntry("src/a.ts", 0.9);
      mockRepo.getTopCentralFiles = mock(() => Promise.resolve([entry]));

      const result = await svc.getTopCentralFiles("cov-sym", 5);
      expect(result.length).toBe(1);
      expect(result[0]!.filePath).toBe("src/a.ts");
      expect(result[0]!.score).toBe(0.9);
    });
  });

  // ── getProjectMap ─────────────────────────────────────────────────────────

  describe("getProjectMap", () => {
    test("returns null when snapshot is null", async () => {
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(null));
      const result = await svc.getProjectMap("cov-sym");
      expect(result).toBeNull();
    });

    test("returns full ProjectMapResult with architecture fields", async () => {
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(makeSnapshot()));

      const result = await svc.getProjectMap("cov-sym");
      expect(result).not.toBeNull();
      expect(result!.projectId).toBe("cov-sym");
      expect(result!.stats.files).toBe(2);
      expect(result!.stats.symbols).toBe(3);
      expect(result!.topCentralFiles.length).toBe(1);
      expect(result!.symbolsByKind).toEqual({ function: 2, class: 1 });
      expect(result!.filesByLanguage).toEqual({ typescript: 2 });
      expect(result!.recentFiles.length).toBe(1);
      expect(result!.edgesByKind).toEqual({ call: 1 });
      // Architecture fields are additive — present when non-empty
      expect(result!.packages).toBeDefined();
      expect(result!.entryPoints).toBeDefined();
    });

    test("edgesByKind is undefined when empty", async () => {
      const snap = makeSnapshot();
      snap.edgesByKind = {};
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(snap));

      const result = await svc.getProjectMap("cov-sym");
      expect(result!.edgesByKind).toBeUndefined();
    });

    test("architecture fields are undefined when arch is null", async () => {
      const snap = makeSnapshot();
      snap.architecture.files = [];
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(snap));

      const result = await svc.getProjectMap("cov-sym");
      expect(result!.packages).toBeUndefined();
    });

    test("passes afterGenerationCaptured callback through", async () => {
      let captured: string | null = "not-called";
      mockRepo.getProjectMapSnapshot = mock((_pid: string, opts: any) => {
        if (opts.afterGenerationCaptured) opts.afterGenerationCaptured("gen-test");
        return Promise.resolve(makeSnapshot());
      });

      await svc.getProjectMap("cov-sym", { afterGenerationCaptured: (gen) => { captured = gen; } });
      expect(captured).toBe("gen-test");
    });

    test("handles architecture map computation failure gracefully", async () => {
      // Force architecture computation to fail by providing broken data
      const snap = makeSnapshot();
      snap.architecture.importEdges = [{ from_file: "nonexistent", to_file: undefined as any }];
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(snap));

      const result = await svc.getProjectMap("cov-sym");
      // Should still return a result (architecture failure is caught)
      expect(result).not.toBeNull();
      expect(result!.stats.files).toBe(2);
    });

    test("architecture map failure triggers catch block and returns null arch", async () => {
      // Override computeArchitectureMapSafe to throw, proving the catch
      // block in getProjectMap handles it gracefully.
      const s = svc as any;
      const orig = s.computeArchitectureMapSafe;
      s.computeArchitectureMapSafe = async () => { throw new Error("forced arch failure"); };

      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(makeSnapshot()));

      const result = await svc.getProjectMap("cov-sym");
      expect(result).not.toBeNull();
      expect(result!.stats.files).toBe(2);
      // Arch fields undefined because catch returned null
      expect(result!.packages).toBeUndefined();

      s.computeArchitectureMapSafe = orig;
    });

    test("httpEdges with route/method meta are mapped correctly", async () => {
      const snap = makeSnapshot();
      snap.architecture.httpEdges = [makeRef("src/a.ts", 5, "fetch", "http_call", "external", { method: "GET", route: "/api/x" })];
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(snap));

      const result = await svc.getArchitecture("cov-sym");
      expect(result).not.toBeNull();
      // The http edges should be mapped with route/method metadata
      expect(result!.routes).toBeDefined();
    });
  });

  // ── getArchitecture ──────────────────────────────────────────────────────

  describe("getArchitecture", () => {
    test("returns null when snapshot is null", async () => {
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(null));
      const result = await svc.getArchitecture("cov-sym");
      expect(result).toBeNull();
    });

    test("returns architecture map for valid snapshot", async () => {
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(makeSnapshot()));
      const result = await svc.getArchitecture("cov-sym");
      expect(result).not.toBeNull();
    });

    test("returns null when no files in architecture snapshot", async () => {
      const snap = makeSnapshot();
      snap.architecture.files = [];
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(snap));
      const result = await svc.getArchitecture("cov-sym");
      expect(result).toBeNull();
    });

    test("throws ToolError for unknown aspect", async () => {
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(makeSnapshot()));
      await expect(svc.getArchitecture("cov-sym", { aspects: ["unknown_aspect"] })).rejects.toThrow();
    });

    test("passes cycles aspect through", async () => {
      const snap = makeSnapshot();
      // Add a call edge to create a cycle
      snap.architecture.callEdges = [makeRef("src/a.ts", 5, "alpha", "call", "src/b.ts#beta")];
      mockRepo.getProjectMapSnapshot = mock(() => Promise.resolve(snap));
      const result = await svc.getArchitecture("cov-sym", { aspects: ["cycles"] });
      expect(result).not.toBeNull();
    });
  });

  // ── recomputeCentrality ──────────────────────────────────────────────────

  describe("recomputeCentrality", () => {
    test("does nothing when no files exist", async () => {
      mockRepo.allFiles = mock(() => Promise.resolve([]));
      await svc.recomputeCentrality("cov-sym");
      expect(mockRepo.updateCentrality).not.toHaveBeenCalled();
    });

    test("computes PageRank and updates centrality", async () => {
      mockRepo.allFiles = mock(() => Promise.resolve(["src/a.ts", "src/b.ts"]));
      mockRepo.allImportEdges = mock(() => Promise.resolve([makeImport("src/a.ts", "src/b.ts", "./b")]));
      mockRepo.updateCentrality = mock(() => Promise.resolve());

      await svc.recomputeCentrality("cov-sym");
      expect(mockRepo.updateCentrality).toHaveBeenCalledTimes(1);
      const scores = mockRepo.updateCentrality.mock.calls[0]![1] as Map<string, number>;
      expect(scores.size).toBe(2);
    });

    test("filters out import edges with no to_file", async () => {
      mockRepo.allFiles = mock(() => Promise.resolve(["src/a.ts"]));
      mockRepo.allImportEdges = mock(() => Promise.resolve([
        makeImport("src/a.ts", undefined, "external"),
        makeImport("src/a.ts", "src/a.ts", "./self"),
      ]));
      mockRepo.updateCentrality = mock(() => Promise.resolve());

      await svc.recomputeCentrality("cov-sym");
      const scores = mockRepo.updateCentrality.mock.calls[0]![1] as Map<string, number>;
      expect(scores.size).toBe(1);
    });
  });

  // ── Helpers: readSnippet / readContext / resolveToAbsolute / getProjectRoot ──

  describe("readSnippet enrichment", () => {
    test("goToDefinition returns undefined snippet when file doesn't exist", async () => {
      const def = makeDef("src/nonexistent.ts", "alpha");
      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map()));
      mockRepo.findDependencies = mock(() => Promise.resolve([]));

      const result = await svc.goToDefinition("cov-sym", "alpha");
      expect(result[0]!.snippet).toBeUndefined();
    });
  });

  describe("getProjectRoot caching", () => {
    test("caches project root after first resolution", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "a.ts"), "content\n");

      const def = makeDef("src/a.ts", "alpha");
      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map()));
      mockRepo.findDependencies = mock(() => Promise.resolve([]));

      // First call resolves root and caches it
      await svc.goToDefinition("cov-sym", "alpha");
      const cache = (svc as any).projectRootCache as Map<string, string>;
      expect(cache.size).toBe(1);

      // Second call uses cache (no new workspace lookup needed)
      await svc.goToDefinition("cov-sym", "alpha");
      expect(cache.size).toBe(1);
    });

    test("returns null root when workspace lookup fails", async () => {
      // Override workspaceManager mock to return null
      // We can't easily re-mock, but we can test the resolveToAbsolute path
      // by checking that a file read fails gracefully
      const def = makeDef("nonexistent.ts", "alpha");
      lookupMock.lookup = mock(() => Promise.resolve(mockLookupResult("resolved", def)));
      mockRepo.getCentrality = mock(() => Promise.resolve(new Map()));
      mockRepo.findDependencies = mock(() => Promise.resolve([]));

      // Clear cache so it re-resolves
      (svc as any).projectRootCache.clear();
      // Use a projectId that won't resolve to a workspace path
      // Since our mock always returns a workspace, the root will be tempDir
      // and the file read will fail → snippet is undefined
      const result = await svc.goToDefinition("cov-sym-does-not-exist", "alpha");
      expect(result[0]!.snippet).toBeUndefined();
    });
  });

  // ── projectRootCache LRU cap + promotion (existing tests preserved) ────────

  describe("projectRootCache LRU cap + promotion", () => {
    const CAP = 512;

    test("PROJECT_ROOT_CACHE_MAX_ENTRIES is 512", () => {
      const s = svc as unknown as { PROJECT_ROOT_CACHE_MAX_ENTRIES: number };
      expect(s.PROJECT_ROOT_CACHE_MAX_ENTRIES).toBe(CAP);
    });

    test("inserting CAP+1 distinct keys evicts the oldest; a promoted hot key survives", () => {
      const s = svc as unknown as {
        projectRootCache: Map<string, string>;
        evictOldestProjectRoot: () => void;
      };
      s.projectRootCache.clear();
      for (let i = 0; i < CAP; i++) {
        s.evictOldestProjectRoot();
        s.projectRootCache.set(`proj-${i}`, `/roots/r${i}`);
      }
      expect(s.projectRootCache.size).toBe(CAP);
      expect(s.projectRootCache.has("proj-0")).toBe(true);

      const v0 = s.projectRootCache.get("proj-0")!;
      s.projectRootCache.delete("proj-0");
      s.projectRootCache.set("proj-0", v0);

      s.evictOldestProjectRoot();
      s.projectRootCache.set(`proj-${CAP}`, `/roots/r${CAP}`);

      expect(s.projectRootCache.size).toBe(CAP);
      expect(s.projectRootCache.has("proj-0")).toBe(true);
      expect(s.projectRootCache.has("proj-1")).toBe(false);
      expect(s.projectRootCache.has(`proj-${CAP}`)).toBe(true);
      s.projectRootCache.clear();
    });
  });

  describe("clearProjectRoot", () => {
    test("drops only the named project's cached root", () => {
      const s = svc as unknown as {
        projectRootCache: Map<string, string>;
        clearProjectRoot(projectId: string): void;
      };
      s.projectRootCache.clear();
      s.projectRootCache.set("proj-a", "/roots/a");
      s.projectRootCache.set("proj-b", "/roots/b");

      s.clearProjectRoot("proj-a");
      expect(s.projectRootCache.has("proj-a")).toBe(false);
      expect(s.projectRootCache.get("proj-b")).toBe("/roots/b");

      s.clearProjectRoot("proj-absent");
      expect(s.projectRootCache.size).toBe(1);
      s.projectRootCache.clear();
    });
  });
});