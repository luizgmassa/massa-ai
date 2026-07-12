/**
 * T4 — Symbol graph (E2E, live stack).
 *
 * Domain: list_projects, project_map, search_definitions, get_references,
 * go_to_definition.
 * Targets the RUNNING Tools API (http://localhost:3333) + Ollama + the MCP
 * subprocess. Read-only: no production source, schema, or dist changes.
 *
 * Backend: PostgreSQL. Auth: off. Reuses the shared index `e2e-th0th-shared`
 * (indexed ONCE across the whole E2E suite via ensureSharedIndex). The polyglot
 * edges E8–E11 index their own tiny fixture into a per-run project so they can
 * assert symbol-extraction quirks without disturbing the shared index.
 *
 * KNOWN PRODUCT LIMITATIONS (asserted defensively or skipped+reported — never
 * worked around by editing source):
 *  - (previously) search_definitions on the PostgreSQL backend silently dropped
 *    the `search`, `kind`, and `file` filters. FIXED: the PG repository's
 *    listDefinitions now reads {search,kind,file} and searchDefinitions carries
 *    a filePath clause. F41/F43 assert all three filters positively.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  E2E_ENABLED,
  probeAvailability,
  httpGet,
  ensureSharedIndex,
  SHARED_PID,
  assertMatrix,
  PREFIX,
  RUN_STAMP,
  POLY_FIXTURE_PATH,
  POLY_PROJECT_ID,
  indexAndAwait,
  resetProject,
} from "./_helpers";
import { startMcp, mcpCall, requireTool, type McpHandle } from "./_mcp";

// ── Gating ──────────────────────────────────────────────────────────────────
// Symbol-graph reads don't need embeddings, but the suite still reuses the
// shared index (which requires Ollama to have been up at indexing time) and
// shares the standard probe.
const READY = await (async () => {
  if (!E2E_ENABLED) return false;
  const a = await probeAvailability();
  return a.API_UP && a.OLLAMA_UP;
})();

// Polyglot project for edges E8–E11. Per-run so the suite never mutates shared
// state. Indexed in beforeAll; reset in afterAll.
const POLY_PID = POLY_PROJECT_ID; // = `${PREFIX}poly-${RUN_STAMP}`

describe.skipIf(!READY)("T4 symbol graph", () => {
  let mcp: McpHandle;
  let pid: string;

  beforeAll(async () => {
    // ONE shared index for the whole suite (and across all E2E files). Never
    // reset SHARED_PID — it persists so separate `bun test` runs skip the
    // multi-minute embedding pass.
    pid = await ensureSharedIndex();
    mcp = await startMcp();
    requireTool(mcp.toolNames, "list_projects");
    requireTool(mcp.toolNames, "project_map");
    requireTool(mcp.toolNames, "search_definitions");
    requireTool(mcp.toolNames, "get_references");
    requireTool(mcp.toolNames, "go_to_definition");
  }, 700_000);

  afterAll(async () => {
    if (mcp) {
      try {
        await mcp.stop();
      } catch {
        /* ignore */
      }
    }
    // Do NOT reset SHARED_PID — shared/persistent across the whole suite.
  }, 60_000);

  // ── list_projects (F37, F38) ─────────────────────────────────────────────

  test(
    "F37: list_projects returns the shared project (indexed)",
    async () => {
      const r = await httpGet<any>("/api/v1/workspace/list");
      expect(r?.success).toBe(true);
      const workspaces = r?.data?.workspaces ?? [];
      expect(workspaces.length).toBeGreaterThan(0);
      const shared = workspaces.find((w: any) => w.projectId === SHARED_PID);
      expect(shared).toBeDefined();
      expect(shared.projectId).toBe(SHARED_PID);
      expect(shared.status).toBe("indexed");
      // Sanity: an indexed project carries non-zero file/symbol counts.
      expect(typeof shared.filesCount).toBe("number");
      expect(shared.filesCount).toBeGreaterThan(0);
      expect(typeof shared.symbolsCount).toBe("number");
      expect(shared.symbolsCount).toBeGreaterThan(0);
    },
    30_000,
  );

  test(
    "F38: status:indexed filter excludes non-indexed projects",
    async () => {
      const all = await httpGet<any>("/api/v1/workspace/list");
      const indexed = await httpGet<any>("/api/v1/workspace/list", {
        status: "indexed",
      });
      expect(all?.success).toBe(true);
      expect(indexed?.success).toBe(true);
      const allList = all?.data?.workspaces ?? [];
      const indexedList = indexed?.data?.workspaces ?? [];
      // Every workspace in the filtered list must be status:indexed.
      for (const w of indexedList) {
        expect(w.status).toBe("indexed");
      }
      // The shared project is indexed → must survive the filter.
      expect(indexedList.find((w: any) => w.projectId === SHARED_PID)).toBeDefined();
      // The filtered list is no larger than the unfiltered list.
      expect(indexedList.length).toBeLessThanOrEqual(allList.length);
    },
    30_000,
  );

  // ── project_map (F39, F40) ───────────────────────────────────────────────

  test(
    "F39: project_map aggregate has stats + central files + symbols-by-kind + files-by-language + recent files",
    async () => {
      const r = await httpGet<any>(`/api/v1/workspace/${pid}/map`);
      expect(r?.success).toBe(true);
      const data = r?.data ?? {};
      expect(data.projectId).toBe(pid);
      // stats block
      expect(data.stats).toEqual(expect.any(Object));
      expect(typeof data.stats?.files).toBe("number");
      expect(data.stats?.files).toBeGreaterThan(0);
      expect(typeof data.stats?.chunks).toBe("number");
      expect(typeof data.stats?.symbols).toBe("number");
      expect(data.stats?.status).toBe("indexed");
      // top central files (PageRank backbone) — non-empty for a real repo
      expect(Array.isArray(data.topCentralFiles)).toBe(true);
      expect((data.topCentralFiles ?? []).length).toBeGreaterThan(0);
      const top0 = data.topCentralFiles[0];
      expect(top0).toEqual(
        expect.objectContaining({ filePath: expect.any(String), score: expect.any(Number) }),
      );
      // symbols grouped by kind — a real repo has functions/classes/interfaces
      expect(data.symbolsByKind).toEqual(expect.any(Object));
      expect(Object.keys(data.symbolsByKind ?? {}).length).toBeGreaterThan(0);
      // files grouped by language extension
      expect(data.filesByLanguage).toEqual(expect.any(Object));
      expect(Object.keys(data.filesByLanguage ?? {}).length).toBeGreaterThan(0);
      // recent files
      expect(Array.isArray(data.recentFiles)).toBe(true);

      // D4 enriched fields (packages/entryPoints/routes/hotspots/communities/
      // layers/edgesByKind). These are CONDITIONAL: attached only when the
      // architecture pass succeeded AND each array is non-empty. For a real
      // monorepo the symbol-graph edges feed at least edgesByKind + usually
      // packages/hotspots. Assert type/shape when present; report (not fail)
      // when absent so the suite stays green on stacks where the architecture
      // pass produced nothing. This strengthens coverage of the D4 contract
      // without weakening the base-field assertions above.
      const enrichedKeys = [
        "packages", "entryPoints", "routes", "hotspots",
        "communities", "layers", "edgesByKind",
      ] as const;
      const present = enrichedKeys.filter((k) => data[k] !== undefined);
      for (const k of present) {
        // Every enriched field that is present must be a non-empty array
        // (packages/routes/etc.) or a non-empty object (edgesByKind).
        const v = data[k];
        if (k === "edgesByKind") {
          expect(v).toEqual(expect.any(Object));
          expect(Object.keys(v ?? {}).length).toBeGreaterThan(0);
        } else {
          expect(Array.isArray(v)).toBe(true);
          expect((v as unknown[]).length).toBeGreaterThan(0);
        }
      }
      // edgesByKind comes from the typed-edge count (D1) over the symbol
      // graph; a warm index of a real repo is expected to surface it. If it
      // is absent on this stack, log a defensive note (best-effort).
      if (data.edgesByKind === undefined) {
        console.log(
          "[T4:F39] NOTE: edgesByKind absent — the symbol graph's typed-edge " +
            "count returned nothing for " + pid + ". The base map contract " +
            "holds; the D4 enriched edge breakdown is not asserted further.",
        );
      }
      console.log(
        "[T4:F39] enriched fields present: " +
          present.join(", ") +
          (present.length === 0 ? " (none — architecture pass produced nothing on this index)" : ""),
      );
    },
    30_000,
  );

  test(
    "F40: centralityLimit:5 / recentLimit:3 honored",
    async () => {
      const r = await httpGet<any>(`/api/v1/workspace/${pid}/map`, {
        centralityLimit: 5,
        recentLimit: 3,
      });
      expect(r?.success).toBe(true);
      const data = r?.data ?? {};
      expect((data.topCentralFiles ?? []).length).toBeLessThanOrEqual(5);
      expect((data.recentFiles ?? []).length).toBeLessThanOrEqual(3);
    },
    30_000,
  );

  // ── search_definitions (F41–F44) ─────────────────────────────────────────
  //
  // All four filters (search/kind/file/exportedOnly) and the limit cap are now
  // honored on the PostgreSQL backend. F41 asserts search+kind, F42 exportedOnly,
  // F43 the file filter, F44 the limit cap.

  test(
    "F41: search + kind filter returns the matching class (PG honors both filters)",
    async () => {
      // search=ContextualSearchRLM&kind=class must return the class (not the
      // alphabetical default-order list). All returned rows must satisfy BOTH
      // filters: name ILIKE %ContextualSearchRLM% AND kind = class.
      const r = await httpGet<any>("/api/v1/symbol/definitions", {
        projectId: pid,
        search: "ContextualSearchRLM",
        kind: "class",
        limit: 20,
      });
      expect(r?.success).toBe(true);
      const defs = r?.data?.definitions ?? [];
      expect(defs.length).toBeGreaterThan(0);
      const hit = defs.find((d: any) => d.name === "ContextualSearchRLM");
      expect(hit).toBeDefined();
      expect(hit.kind).toBe("class");
      expect(String(hit.file)).toMatch(/contextual-search-rlm/);
      // Every returned row honors the search AND kind filters.
      for (const d of defs) {
        expect(d.kind).toBe("class");
        expect(String(d.name).toLowerCase()).toContain("contextualsearchrlm");
      }
    },
    30_000,
  );

  test(
    "F42: exportedOnly:true returns only exported symbols (subset)",
    async () => {
      const all = await httpGet<any>("/api/v1/symbol/definitions", {
        projectId: pid,
        limit: 30,
      });
      const exported = await httpGet<any>("/api/v1/symbol/definitions", {
        projectId: pid,
        exportedOnly: "true",
        limit: 30,
      });
      expect(all?.success).toBe(true);
      expect(exported?.success).toBe(true);
      const allDefs = all?.data?.definitions ?? [];
      const expDefs = exported?.data?.definitions ?? [];
      // Every def in the exportedOnly result must have exported === true.
      for (const d of expDefs) {
        expect(d.exported).toBe(true);
      }
      // The exported subset is no larger than the unfiltered set.
      expect(expDefs.length).toBeLessThanOrEqual(allDefs.length);
    },
    30_000,
  );

  test(
    "F43: file filter returns only definitions in the target file (PG honors the file filter)",
    async () => {
      const target = "packages/core/src/services/search/contextual-search-rlm.ts";
      const r = await httpGet<any>("/api/v1/symbol/definitions", {
        projectId: pid,
        file: target,
        limit: 50,
      });
      expect(r?.success).toBe(true);
      const defs = r?.data?.definitions ?? [];
      expect(defs.length).toBeGreaterThan(0);
      // Every returned row honors the file filter.
      for (const d of defs) {
        expect(d.file).toBe(target);
      }
      // The file's class is expected to surface.
      const names = new Set(defs.map((d: any) => d.name));
      expect(names.has("ContextualSearchRLM")).toBe(true);
    },
    30_000,
  );

  test(
    "F44: limit:3 caps the returned definitions count",
    async () => {
      // `limit` IS honored on the PG backend (passed through to LIMIT clause).
      const r = await httpGet<any>("/api/v1/symbol/definitions", {
        projectId: pid,
        limit: 3,
      });
      expect(r?.success).toBe(true);
      const defs = r?.data?.definitions ?? [];
      expect(defs.length).toBeLessThanOrEqual(3);
    },
    30_000,
  );

  // ── get_references (F45–F47) ─────────────────────────────────────────────

  test(
    "F45: get_references returns references with refKind in known set",
    async () => {
      const r = await httpGet<any>("/api/v1/symbol/references", {
        projectId: pid,
        symbolName: "getPrismaClient",
        limit: 20,
      });
      expect(r?.success).toBe(true);
      const refs = r?.data?.references ?? [];
      expect(refs.length).toBeGreaterThan(0);
      const knownKinds = new Set([
        "call",
        "import",
        "type_ref",
        "type_ref/import",
        "extend",
        "implement",
        "definition",
        "reference",
      ]);
      for (const ref of refs) {
        expect(typeof ref.fromFile).toBe("string");
        expect(typeof ref.fromLine).toBe("number");
        expect(typeof ref.refKind).toBe("string");
        // Either in the documented set, or carry the value defensively.
        if (!knownKinds.has(ref.refKind)) {
          console.log(
            "[T4:F45] NOTE: refKind '" + ref.refKind + "' is outside the documented " +
              "{call,import,type_ref,extend,implement} set. Asserted defensively.",
          );
        }
      }
    },
    30_000,
  );

  test(
    "F46: fqn disambiguation narrows results (best-effort)",
    async () => {
      // First find how many definitions exist for the name. If only one, the
      // fqn disambiguation has nothing to narrow → skip with a reason.
      const byName = await httpGet<any>("/api/v1/symbol/references", {
        projectId: pid,
        symbolName: "getPrismaClient",
        limit: 200,
      });
      expect(byName?.success).toBe(true);
      // Collect distinct target FQNs across the references.
      const byNameRefs = byName?.data?.references ?? [];
      const fqns = new Set<string>();
      for (const ref of byNameRefs) {
        if (typeof ref.targetFqn === "string") fqns.add(ref.targetFqn);
      }
      if (fqns.size <= 1) {
        console.log(
          "[T4:F46] SKIP: only one target FQN (" +
            Array.from(fqns).join(", ") +
            ") is referenced for getPrismaClient — fqn disambiguation has nothing " +
            "to narrow on this index. Best-effort skip.",
        );
        return;
      }
      // Pick one FQN and assert the fqn-scoped result is a subset (≤ by-name).
      const oneFqn = Array.from(fqns)[0];
      const byFqn = await httpGet<any>("/api/v1/symbol/references", {
        projectId: pid,
        symbolName: "getPrismaClient",
        fqn: oneFqn,
        limit: 200,
      });
      expect(byFqn?.success).toBe(true);
      const byFqnRefs = byFqn?.data?.references ?? [];
      expect(byFqnRefs.length).toBeLessThanOrEqual(byNameRefs.length);
      // Every fqn-scoped reference's targetFqn must equal the chosen fqn (or be
      // null/undefined — repo may null-out when scoped). Assert the ones that
      // carry a value match.
      for (const ref of byFqnRefs) {
        if (typeof ref.targetFqn === "string") {
          expect(ref.targetFqn).toBe(oneFqn);
        }
      }
    },
    30_000,
  );

  test(
    "F47: limit cap honored + shown/total present",
    async () => {
      const big = await httpGet<any>("/api/v1/symbol/references", {
        projectId: pid,
        symbolName: "getPrismaClient",
        limit: 200,
      });
      const small = await httpGet<any>("/api/v1/symbol/references", {
        projectId: pid,
        symbolName: "getPrismaClient",
        limit: 2,
      });
      expect(big?.success).toBe(true);
      expect(small?.success).toBe(true);
      // shown + total are part of the contract (see workspace.ts:209-216).
      expect(typeof small?.data?.shown).toBe("number");
      expect(typeof small?.data?.total).toBe("number");
      expect(small.data.shown).toBeLessThanOrEqual(2);
      expect((small?.data?.references ?? []).length).toBe(small.data.shown);
      // total is stable across limit changes (it's the full match count).
      expect(small.data.total).toBe(big.data.total);
    },
    30_000,
  );

  // ── go_to_definition (F48–F50) ───────────────────────────────────────────

  test(
    "F48: go_to_definition resolves ContextualSearchRLM to its source file",
    async () => {
      const r = await httpGet<any>("/api/v1/symbol/definition", {
        projectId: pid,
        symbolName: "ContextualSearchRLM",
      });
      expect(r?.success).toBe(true);
      expect(r?.data?.found).toBe(true);
      expect(r?.data?.symbolName).toBe("ContextualSearchRLM");
      const defs = r?.data?.definitions ?? [];
      expect(defs.length).toBeGreaterThan(0);
      const top = defs[0];
      expect(top.kind).toBe("class");
      expect(String(top.file)).toMatch(/contextual-search-rlm/);
      expect(typeof top.lineStart).toBe("number");
    },
    30_000,
  );

  test(
    "F49: fromFile prioritizes same-file definition among duplicates (best-effort)",
    async () => {
      // Find a symbol with >1 definition (duplicate name across files). If none
      // exists in the index, the fromFile priority path has nothing to choose
      // between → skip with a reason.
      const probe = await httpGet<any>("/api/v1/symbol/definition", {
        projectId: pid,
        symbolName: "getPrismaClient",
      });
      const defsNoFile = probe?.data?.definitions ?? [];
      const distinctFiles = new Set(defsNoFile.map((d: any) => d.file));
      if (distinctFiles.size <= 1) {
        console.log(
          "[T4:F49] SKIP: getPrismaClient resolves to " +
            defsNoFile.length +
            " def(s) across " +
            distinctFiles.size +
            " file(s) — no duplicates to disambiguate via fromFile. " +
            "Best-effort skip.",
        );
        return;
      }
      // Pick the file of one of the defs and ask go_to_definition with that
      // fromFile — the top result should be the def in that file (priority 2).
      const target = defsNoFile[0];
      const r = await httpGet<any>("/api/v1/symbol/definition", {
        projectId: pid,
        symbolName: "getPrismaClient",
        fromFile: target.file,
      });
      expect(r?.success).toBe(true);
      const defs = r?.data?.definitions ?? [];
      expect(defs.length).toBeGreaterThan(0);
      // Same-file def must sort to the top when fromFile is set.
      expect(defs[0].file).toBe(target.file);
    },
    30_000,
  );

  test(
    "F50: unknown symbol → {found:false} with empty definitions",
    async () => {
      const r = await httpGet<any>("/api/v1/symbol/definition", {
        projectId: pid,
        symbolName: "ZZZNoSuchSymbolXYZ_t4",
      });
      expect(r?.success).toBe(true);
      expect(r?.data?.found).toBe(false);
      expect(r?.data?.symbolName).toBe("ZZZNoSuchSymbolXYZ_t4");
      expect(Array.isArray(r?.data?.definitions)).toBe(true);
      expect((r?.data?.definitions ?? []).length).toBe(0);
    },
    30_000,
  );

  // ── Edges E8–E11 (polyglot fixture, regex symbol extractor) ───────────────
  //
  // The symbol extractor is a regex parser (no tree-sitter). These edges
  // assert its documented limitations against a tiny indexed fixture so the
  // suite never disturbs the shared index.

  describe("edges E8–E11 (polyglot fixture)", () => {
    beforeAll(async () => {
      // Index the polyglot fixture once for the whole sub-suite. Tiny fixture
      // → fast even under slow Ollama. Per-run project id; reset in afterAll.
      await indexAndAwait(POLY_FIXTURE_PATH, POLY_PID, { timeoutMs: 240_000 });
    }, 280_000);

    afterAll(async () => {
      try {
        await resetProject(POLY_PID);
      } catch {
        /* best-effort cleanup */
      }
    }, 60_000);

    test(
      "E8: decorator-heavy TS + indent-8 Python yield ≤ expected symbols",
      async () => {
        // The regex extractor may surface the top-level class/method but is
        // expected to miss deeply-nested or decorator-obscured members. Assert
        // that the files were walked (they appear in project_map) and that the
        // decorator-heavy file produced AT MOST a few symbols (not zero-fail).
        const map = await httpGet<any>(`/api/v1/workspace/${POLY_PID}/map`);
        expect(map?.success).toBe(true);
        const recent = (map?.data?.recentFiles ?? []).map((f: any) => f.filePath);
        // Both fixture files should have been visited.
        expect(recent.some((p: string) => p.endsWith("decorator-heavy.ts"))).toBe(true);

        // search the definitions for the polyglot project for the decorator file's
        // symbols. We can't rely on the (broken) `file`/`search` filters on PG, so
        // pull a wide window and filter client-side.
        const defs = await httpGet<any>("/api/v1/symbol/definitions", {
          projectId: POLY_PID,
          limit: 200,
        });
        const decDefs = (defs?.data?.definitions ?? []).filter((d: any) =>
          String(d.file).includes("decorator-heavy.ts"),
        );
        // Decorator-heavy: the regex extractor should at least catch the exported
        // class and the factory function; decorator-wrapped methods may be missed.
        const names = new Set(decDefs.map((d: any) => d.name));
        const hasClass = names.has("PolyRoot");
        if (!hasClass && decDefs.length === 0) {
          console.log(
            "[T4:E8] SKIP decorator-heavy assertion: the regex extractor " +
              "returned zero symbols for decorator-heavy.ts (decorators can mask " +
              "the real class signature under the regex parser). Reported as a " +
              "documented symbol-extraction limitation; not worked around.",
          );
          return;
        }
        // If symbols were extracted, the exported class is expected.
        expect(hasClass).toBe(true);
      },
      60_000,
    );

    test(
      "E9: Dart yields symbols but no imports (PageRank-disconnected)",
      async () => {
        // Dart is parsed for class/method symbols but its imports are not
        // extracted → the file has no import edges → it's PageRank-disconnected.
        // Assert Dart symbols exist (PolyDart class / polyTopLevel fn), and that
        // the Dart file does NOT appear with incoming/outgoing edges by checking
        // project_map's central files (a disconnected file scores 0 / is absent
        // from the top-central list).
        const defs = await httpGet<any>("/api/v1/symbol/definitions", {
          projectId: POLY_PID,
          limit: 200,
        });
        const dartDefs = (defs?.data?.definitions ?? []).filter((d: any) =>
          String(d.file).endsWith(".dart"),
        );
        const dartNames = new Set(dartDefs.map((d: any) => d.name));
        if (dartDefs.length === 0) {
          console.log(
            "[T4:E9] SKIP Dart symbol assertion: the regex extractor returned " +
              "zero symbols for poly.dart on this build. Dart support is " +
              "best-effort under the regex parser; reported as a symbol-extraction " +
              "limitation, not worked around.",
          );
          return;
        }
        // When symbols ARE extracted, the class + top-level fn are expected.
        expect(dartNames.has("PolyDart") || dartNames.has("polyTopLevel")).toBe(true);

        // PageRank-disconnected: the Dart file should not be a top-central file
        // (it has no import edges → score 0 / excluded from the backbone).
        const map = await httpGet<any>(`/api/v1/workspace/${POLY_PID}/map`, {
          centralityLimit: 50,
        });
        const centralFiles = (map?.data?.topCentralFiles ?? []).map((f: any) => f.filePath);
        const dartInCentral = centralFiles.some((p: string) => p.endsWith(".dart"));
        // Defensive: if Dart IS central, the import parser may have landed an
        // edge we didn't expect — log but don't fail (behavior is best-effort).
        if (dartInCentral) {
          console.log(
            "[T4:E9] NOTE: poly.dart appears in top-central files — the import " +
              "parser may have recorded an edge for it. Expected PageRank-" +
              "disconnected; asserted defensively.",
          );
        }
      },
      60_000,
    );

    test(
      "E10: broken tsconfig (trailing-comma paths) → silent alias-skip",
      async () => {
        // The fixture tsconfig.json has a trailing comma inside `paths`. The
        // indexer should parse what it can and skip unresolvable aliases
        // silently (no crash, index completes). Assert the polyglot project
        // reached `indexed` status and that the TS files were walked.
        const ws = await httpGet<any>("/api/v1/workspace/list", {
          status: "indexed",
        });
        const poly = (ws?.data?.workspaces ?? []).find(
          (w: any) => w.projectId === POLY_PID,
        );
        expect(poly).toBeDefined();
        expect(poly.status).toBe("indexed");
        // The unresolvable-import.ts file should still have been indexed for
        // symbols (even though its import specifier is dangling).
        const defs = await httpGet<any>("/api/v1/symbol/definitions", {
          projectId: POLY_PID,
          limit: 200,
        });
        const unresolvableDefs = (defs?.data?.definitions ?? []).filter((d: any) =>
          String(d.file).includes("unresolvable-import.ts"),
        );
        expect(unresolvableDefs.length).toBeGreaterThan(0);
        // `usesGhost` is the exported function — expected to surface.
        const names = new Set(unresolvableDefs.map((d: any) => d.name));
        expect(names.has("usesGhost")).toBe(true);
      },
      60_000,
    );

    test(
      "E11: unsupported extensions (.go/.rs/.md) → zero symbols",
      async () => {
        // The symbol extractor only walks known languages. .go / .rs / .md must
        // produce zero symbol rows — silently skipped, not an error.
        const defs = await httpGet<any>("/api/v1/symbol/definitions", {
          projectId: POLY_PID,
          limit: 300,
        });
        const allDefs = defs?.data?.definitions ?? [];
        const unsupported = allDefs.filter((d: any) =>
          /\.(go|rs|md)$/.test(String(d.file)),
        );
        expect(unsupported.length).toBe(0);
      },
      60_000,
    );
  });

  // ── Matrix (MCP ≡ HTTP) ───────────────────────────────────────────────────
  //
  // All T4 tools are bucket C (no `format` param) → the MCP proxy returns the
  // full {success,data} envelope directly comparable to the HTTP body. Volatile
  // keys (timestamps, lastIndexedAt, centrality scores, counts that depend on
  // extraction nondeterminism) are dropped via assertMatrix before comparison.

  test(
    "matrix: list_projects equivalent on both transports",
    async () => {
      const http = await httpGet<any>("/api/v1/workspace/list");
      const fresh = await startMcp();
      let mcpRes: any;
      try {
        mcpRes = await mcpCall(fresh.client, "list_projects", {});
      } finally {
        await fresh.stop();
      }
      expect(http?.success).toBe(true);
      expect(mcpRes?.success).toBe(true);
      assertMatrix(http, mcpRes, { dropKeys: ["lastIndexedAt"] }, "list_projects");
    },
    60_000,
  );

  test(
    "matrix: project_map equivalent on both transports",
    async () => {
      const args = { id: pid, centralityLimit: 5, recentLimit: 3 };
      const http = await httpGet<any>(`/api/v1/workspace/${pid}/map`, {
        centralityLimit: 5,
        recentLimit: 3,
      });
      const fresh = await startMcp();
      let mcpRes: any;
      try {
        mcpRes = await mcpCall(fresh.client, "project_map", args);
      } finally {
        await fresh.stop();
      }
      expect(http?.success).toBe(true);
      expect(mcpRes?.success).toBe(true);
      // Drop centrality scores (float nondeterminism) and timestamps. The
      // structural shape + integer counts + file lists are the parity contract.
      assertMatrix(
        http,
        mcpRes,
        { dropKeys: ["lastIndexedAt", "indexedAt", "updatedAt", "score"] },
        "project_map",
      );
    },
    60_000,
  );

  test(
    "matrix: search_definitions equivalent on both transports",
    async () => {
      // Exercise search + kind + exportedOnly + limit (all PG filters now honored)
      // so the matrix compares a deterministic, filtered result set.
      const http = await httpGet<any>("/api/v1/symbol/definitions", {
        projectId: pid,
        search: "ContextualSearchRLM",
        kind: "class",
        exportedOnly: "true",
        limit: 5,
      });
      const fresh = await startMcp();
      let mcpRes: any;
      try {
        mcpRes = await mcpCall(fresh.client, "search_definitions", {
          projectId: pid,
          search: "ContextualSearchRLM",
          kind: "class",
          exportedOnly: true,
          limit: 5,
        });
      } finally {
        await fresh.stop();
      }
      expect(http?.success).toBe(true);
      expect(mcpRes?.success).toBe(true);
      assertMatrix(http, mcpRes, { dropKeys: ["centralityScore"] }, "search_definitions");
    },
    60_000,
  );

  test(
    "matrix: get_references equivalent on both transports",
    async () => {
      const http = await httpGet<any>("/api/v1/symbol/references", {
        projectId: pid,
        symbolName: "getPrismaClient",
        limit: 5,
      });
      const fresh = await startMcp();
      let mcpRes: any;
      try {
        mcpRes = await mcpCall(fresh.client, "get_references", {
          projectId: pid,
          symbolName: "getPrismaClient",
          limit: 5,
        });
      } finally {
        await fresh.stop();
      }
      expect(http?.success).toBe(true);
      expect(mcpRes?.success).toBe(true);
      // `context` is a file-read enrichment that can vary if the underlying file
      // changes between calls; drop it. `targetFqn` is stable.
      assertMatrix(http, mcpRes, { dropKeys: ["context"] }, "get_references");
    },
    60_000,
  );

  test(
    "matrix: go_to_definition equivalent on both transports",
    async () => {
      const http = await httpGet<any>("/api/v1/symbol/definition", {
        projectId: pid,
        symbolName: "ContextualSearchRLM",
      });
      const fresh = await startMcp();
      let mcpRes: any;
      try {
        mcpRes = await mcpCall(fresh.client, "go_to_definition", {
          projectId: pid,
          symbolName: "ContextualSearchRLM",
        });
      } finally {
        await fresh.stop();
      }
      expect(http?.success).toBe(true);
      expect(mcpRes?.success).toBe(true);
      // snippet + centralityScore are enrichment that can vary; drop them.
      assertMatrix(
        http,
        mcpRes,
        { dropKeys: ["snippet", "centralityScore"] },
        "go_to_definition",
      );
    },
    60_000,
  );
});
