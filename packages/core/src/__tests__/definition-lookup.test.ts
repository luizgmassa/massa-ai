import { describe, expect, test } from "bun:test";
import { DefinitionLookupService } from "../services/symbol/definition-lookup.js";
import { STRUCTURAL_SYMBOL_KINDS } from "../services/structural/types.js";
import { SearchDefinitionsTool } from "../tools/search_definitions.js";
import type { SymbolDefinition } from "../data/symbol/symbol-repository-pg.js";
import { TracePathService } from "../services/symbol/trace-path.js";
import { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";

const definition = (id: string, name = "run"): SymbolDefinition => ({
  id, project_id: "p", generation_id: "active", file_path: id.split("#")[0]!, name,
  qualified_name: name, kind: "function", line_start: 1, line_end: 1,
  exported: true, indexed_at: 1, legacy_fqn: `${id.split("#")[0]}#${name}`,
});

describe("shared definition identity lookup", () => {
  test("discriminates modern/legacy resolution, stable ambiguity, missing, and bare compatibility", async () => {
    const exact = definition("src/a.ts#run");
    const candidates = Object.freeze([
      { fqn: "src/a.ts#run~function~a".padEnd(86, "a"), file: "src/a.ts", name: "run", displayName: "run", qualifiedName: "run", kind: "function" as const, signatureHash: "a".repeat(64) },
      { fqn: "src/b.ts#run~function~b".padEnd(86, "b"), file: "src/b.ts", name: "run", displayName: "run", qualifiedName: "run", kind: "function" as const, signatureHash: "b".repeat(64) },
    ]);
    const repo = {
      async resolveDefinitionFqn(_project: string, query: string) {
        if (query === "src/a.ts#run") return { found: true as const, ambiguous: false as const, definition: exact };
        if (query === "src/shared.ts#run") return { found: false as const, ambiguous: true as const, legacyFqn: query, candidates };
        return { found: false as const, ambiguous: false as const, fqn: query, candidates: [] as const };
      },
      async findDefinitionsByName(_project: string, query: string) {
        return query === "run" ? [exact, definition("src/b.ts#run")]
          : query === "#secret" ? [definition("src/a.ts#secret", "#secret")] : [];
      },
    };
    const service = new DefinitionLookupService(() => repo as never);
    expect(await service.lookup("p", "src/a.ts#run")).toEqual({ status: "resolved", definition: exact });
    expect(await service.lookup("p", "src/shared.ts#run")).toEqual({ status: "ambiguous", legacyFqn: "src/shared.ts#run", candidates });
    expect(await service.lookup("p", "src/missing.ts#none")).toEqual({ status: "missing", query: "src/missing.ts#none" });
    expect((await service.lookup("p", "run"))).toMatchObject({ status: "bare", definitions: [exact, { file_path: "src/b.ts" }] });
    expect(await service.lookup("p", "none")).toEqual({ status: "missing", query: "none" });
    expect(await service.lookup("p", "#secret")).toMatchObject({ status: "bare", definitions: [{ name: "#secret" }] });
  });

  test("turns malformed FQN input into an explicit miss", async () => {
    const service = new DefinitionLookupService(() => ({
      findDefinitionsByName: async () => [],
      resolveDefinitionFqn: async () => { throw new Error("full SHA-256"); },
    }) as never);
    expect(await service.lookup("p", "src/a.ts#run~method~bad")).toEqual({
      status: "missing", query: "src/a.ts#run~method~bad",
    });
    expect(await new SymbolGraphService(service).lookupDefinition("p", "src/a.ts#run~method~bad"))
      .toEqual({ status: "missing", query: "src/a.ts#run~method~bad" });
    expect(await new TracePathService(service).resolveSeeds("p", { projectId: "p", symbol: "src/a.ts#run~method~bad" })).toEqual([]);
  });

  test("propagates repository operational failures", async () => {
    const service = new DefinitionLookupService(() => ({
      findDefinitionsByName: async () => [],
      resolveDefinitionFqn: async () => { throw new Error("database unavailable"); },
    }) as never);
    await expect(service.lookup("p", "src/a.ts#run")).rejects.toThrow("database unavailable");
  });

  test("trace treats a leading private marker as a bare name", async () => {
    const privateDefinition = definition("src/a.ts#secret", "#secret");
    const service = new DefinitionLookupService(() => ({
      resolveDefinitionFqn: async () => { throw new Error("must not resolve private name as FQN"); },
      findDefinitionsByName: async (_project: string, query: string) => query === "#secret" ? [privateDefinition] : [],
    }) as never);
    expect(await new TracePathService(service).resolveSeeds("p", { projectId: "p", symbol: "#secret" })).toEqual([{
      fqn: privateDefinition.id, name: "#secret", file: "src/a.ts", line: 1,
    }]);
  });

  test("search kind schema exposes exactly all 18 canonical kinds", () => {
    const schema = new SearchDefinitionsTool().inputSchema as { properties: { kind: { items: { enum: string[] } } } };
    expect(schema.properties.kind.items.enum).toEqual([...STRUCTURAL_SYMBOL_KINDS]);
    expect(schema.properties.kind.items.enum).toHaveLength(18);
  });
});
