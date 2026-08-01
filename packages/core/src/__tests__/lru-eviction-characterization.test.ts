/**
 * RFS-02 AC-1 — characterization of the four LRU cache sites PR-D unifies.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NEW RATHER THAN AN EDIT.
 * PR-D extracts one shared eviction FUNCTION (`services/cache/lru-evict.ts`)
 * and repoints five call sites at it. That move is claimed behavior-preserving.
 * A claim about behavior is proven by tests written against the PRE-move code
 * that pass UNMODIFIED after it — not by the post-move suite being green, which
 * a test written from the new shape cannot distinguish from a regression
 * (`spec.md` R-02). So these assertions are taken here, first, and this file's
 * SHA-256 is asserted unchanged across the repoint commit.
 *
 * Every case drives a site through a surface that SURVIVES the extraction —
 * `ReadFileTool.handle()`, `SymbolGraphService.goToDefinition()`, the
 * `WebIndexDeps` seam, `FileFilterCache.getValidFiles()`. Deliberately NOT the
 * private members `read-file.test.ts:264-299` reaches (`fileCache`,
 * `projectRootCache`, `evictOldest`, `FILE_CACHE_MAX_ENTRIES`): all four move
 * during Phases 2-3, so a test written against them cannot be both a
 * characterization and byte-identical across the move (`tasks.md` §3.5 item 3).
 *
 * WHAT EACH CASE DISCRIMINATES. The five caches agree on eviction order and
 * disagree elsewhere, and a unification that flattened the differences would
 * still pass a test that only counted entries. So each case pins the axis its
 * site does NOT share with the others (`spec.md` §3.B's six-axis table):
 *
 *   | site                              | cap | evict     | read promotes? |
 *   | read_file.ts   · fileCache        | 512 | pre-set   | YES            |
 *   | read_file.ts   · projectRootCache | 512 | pre-set   | YES            |
 *   | symbol-graph.service.ts           | 512 | pre-set   | YES            |
 *   | web-controller.ts                 | 512 | post-set  | YES            |
 *   | file-filter-cache.ts              |  50 | post-set  | NO             |
 *
 * `file-filter-cache` is the one that must NOT promote on read, and the one
 * whose cap is 50. It is the case a single shared policy would break.
 */

import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

// ── Shared workspace stub ────────────────────────────────────────────────────
// Both ReadFileTool and SymbolGraphService resolve a project root through the
// workspaceManager singleton. One mutable map serves both, so a test can move a
// project's root mid-run and observe whether the cache re-resolves or serves the
// stale answer. `undefined` project_path is how a real lookup miss looks.
const workspaceRoots = new Map<string, string>();

mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    getWorkspace: async (projectId: string) => {
      const root = workspaceRoots.get(projectId);
      return root ? { project_id: projectId, project_path: root } : null;
    },
    markIndexing: async () => {},
  },
}));

// SymbolGraphService.goToDefinition() reaches the symbol repository for
// centrality before it enriches with a snippet. The snippet read is what
// exercises the project-root cache, so the repository only has to be present.
const mockRepo = {
  getCentrality: async () => new Map<string, number>(),
  findDependencies: async () => [],
};
mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: () => mockRepo,
}));

// WebController.fetchAndIndex() hands a freshly-built WebIndexDeps to
// fetchAndConvertOne. Capturing that object is how the cache seam is reached
// without a network fetch; `markIndexed` is the function whose body carries the
// eviction loop this PR repoints.
type WebIndexDepsCapture = {
  getLastIndexedAt: (key: string) => number | null;
  markIndexed: (key: string, ts: number) => void;
};
let capturedWebDeps: WebIndexDepsCapture | null = null;
mock.module("../services/web/fetcher.js", () => ({
  fetchAndConvertOne: async (url: string, deps: WebIndexDepsCapture) => {
    capturedWebDeps = deps;
    return { kind: "fetched", url, chunks: 0 };
  },
}));

import { ReadFileTool } from "../tools/read_file.js";
import { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";
import { WebController } from "../services/web/web-controller.js";
import { FileFilterCache } from "../services/search/file-filter-cache.js";
import type { DefinitionLookupResult } from "../services/symbol/definition-lookup.js";

// ── Fixture roots ────────────────────────────────────────────────────────────
// Two real directories holding the same relative file with different content,
// so "which root did the cache serve" is readable off the response body.
let rootA: string;
let rootB: string;
const REL = "sample.ts";

// read_file's containment check allows the project root and cwd. Every case
// below passes a projectId whose root IS one of these dirs, so the project-root
// leg admits them and no allowlist env is needed.
beforeAll(() => {
  rootA = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-lru-rootA-"));
  rootB = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-lru-rootB-"));
  fs.writeFileSync(path.join(rootA, REL), "export const marker = 'ROOT-A';\n");
  fs.writeFileSync(path.join(rootB, REL), "export const marker = 'ROOT-B';\n");
});

afterAll(() => {
  fs.rmSync(rootA, { recursive: true, force: true });
  fs.rmSync(rootB, { recursive: true, force: true });
});

/** The cap both read_file caches, symbol-graph's root cache and web's cache use. */
const CAP_512 = 512;
/** FileFilterCache's own cap — deliberately different, and deliberately asserted. */
const CAP_50 = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Site 1 — tools/read_file.ts · fileCache
// ─────────────────────────────────────────────────────────────────────────────
//
// The cache key is JSON over {filePath, includeSymbols, includeImports,
// projectId, relativePath}, so varying ONLY projectId yields distinct entries
// against a single file on disk. That keeps the fixture at one file while still
// driving the real cap.
//
// Staleness is the observation: a cache hit replays the content captured at
// insert time, so rewriting the file on disk and reading again distinguishes a
// hit (old bytes) from a miss (new bytes). Nothing here reads a private member.
describe("LRU characterization — read_file fileCache (cap 512, promote on hit)", () => {
  test("evicts the oldest entry on the 513th insert, and a hit promotes past it", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-lru-filecache-"));
    const file = path.join(dir, REL);
    fs.writeFileSync(file, "V1\n");
    workspaceRoots.set("fc-0", dir);

    try {
      const tool = new ReadFileTool();
      const read = async (projectId: string) => {
        workspaceRoots.set(projectId, dir);
        const res = await tool.handle({ filePath: REL, projectId, compress: false });
        expect(res.success).toBe(true);
        return (res.data as { content: string }).content;
      };

      // Entry 0 caches V1.
      expect(await read("fc-0")).toContain("V1");

      // Disk moves on. A cache HIT must still replay V1 — that is the property
      // making eviction observable at all.
      fs.writeFileSync(file, "V2\n");
      expect(await read("fc-0")).toContain("V1");

      // Fill to the cap: entries 0..511 is 512 entries, one short of eviction.
      for (let i = 1; i < CAP_512; i++) {
        expect(await read(`fc-${i}`)).toContain("V2");
      }

      // Touch entry 0. Map keeps insertion order and the hit path re-inserts, so
      // this moves entry 0 to newest and makes entry 1 the eviction candidate.
      expect(await read("fc-0")).toContain("V1");

      // The 513th distinct key evicts exactly one entry.
      expect(await read(`fc-${CAP_512}`)).toContain("V2");

      // Entry 1 was evicted: it re-reads from disk and sees V2.
      expect(await read("fc-1")).toContain("V2");
      // Entry 0 survived because the touch promoted it: it still replays V1.
      expect(await read("fc-0")).toContain("V1");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 2 — tools/read_file.ts · projectRootCache
// ─────────────────────────────────────────────────────────────────────────────
//
// Same cache mechanics, different observable: the resolved root shows up as
// `absolutePath` in the response, so moving a project's workspace entry and
// reading again distinguishes a cached root from a re-resolved one.
describe("LRU characterization — read_file projectRootCache (cap 512, promote on hit)", () => {
  test("evicts the oldest projectId on the 513th, and a hit promotes past it", async () => {
    const tool = new ReadFileTool();
    const resolvedRoot = async (projectId: string) => {
      const res = await tool.handle({ filePath: REL, projectId, compress: false });
      expect(res.success).toBe(true);
      return path.dirname((res.data as { absolutePath: string }).absolutePath);
    };

    // Entry 0 caches rootA.
    workspaceRoots.set("pr-0", rootA);
    expect(await resolvedRoot("pr-0")).toBe(rootA);

    // The workspace moves. A cached root must NOT follow it.
    workspaceRoots.set("pr-0", rootB);
    expect(await resolvedRoot("pr-0")).toBe(rootA);

    // Fill to the cap. Entry 1 is the eviction candidate once entry 0 is touched.
    for (let i = 1; i < CAP_512; i++) {
      workspaceRoots.set(`pr-${i}`, rootA);
      expect(await resolvedRoot(`pr-${i}`)).toBe(rootA);
    }

    // Touch entry 0 → promoted to newest.
    expect(await resolvedRoot("pr-0")).toBe(rootA);

    // Move entry 1's workspace so its re-resolution is observable, then insert
    // the 513th key to trigger exactly one eviction.
    workspaceRoots.set("pr-1", rootB);
    workspaceRoots.set(`pr-${CAP_512}`, rootA);
    expect(await resolvedRoot(`pr-${CAP_512}`)).toBe(rootA);

    // Entry 1 was evicted → re-resolves to the moved root.
    expect(await resolvedRoot("pr-1")).toBe(rootB);
    // Entry 0 survived the same insert → still serves the root cached before the move.
    expect(await resolvedRoot("pr-0")).toBe(rootA);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 3 — services/symbol/symbol-graph.service.ts · projectRootCache
// ─────────────────────────────────────────────────────────────────────────────
//
// goToDefinition enriches its top-3 results with a snippet, and the snippet is
// read from `path.resolve(projectRoot, def.file_path)`. So the snippet's content
// reports which root the cache served. Passing `resolvedLookup` as the fourth
// argument bypasses the identity lookup, leaving the root cache as the only
// moving part.
describe("LRU characterization — symbol-graph projectRootCache (cap 512, promote on hit)", () => {
  const lookupFor = (projectId: string): DefinitionLookupResult =>
    ({
      status: "resolved",
      definition: {
        id: `${REL}#marker`,
        project_id: projectId,
        file_path: REL,
        name: "marker",
        kind: "variable",
        line_start: 1,
        line_end: 1,
        exported: true,
        indexed_at: 0,
      },
    }) as unknown as DefinitionLookupResult;

  test("evicts the oldest projectId on the 513th, and a hit promotes past it", async () => {
    const service = new SymbolGraphService();
    const servedRoot = async (projectId: string) => {
      const results = await service.goToDefinition(
        projectId,
        "marker",
        undefined,
        lookupFor(projectId),
      );
      expect(results.length).toBe(1);
      // ROOT-A / ROOT-B are the only difference between the two fixture files.
      return results[0]!.snippet!.includes("ROOT-A") ? rootA : rootB;
    };

    workspaceRoots.set("sg-0", rootA);
    expect(await servedRoot("sg-0")).toBe(rootA);

    // Move it; the cached root must not follow.
    workspaceRoots.set("sg-0", rootB);
    expect(await servedRoot("sg-0")).toBe(rootA);

    for (let i = 1; i < CAP_512; i++) {
      workspaceRoots.set(`sg-${i}`, rootA);
      expect(await servedRoot(`sg-${i}`)).toBe(rootA);
    }

    // Touch entry 0 → promoted.
    expect(await servedRoot("sg-0")).toBe(rootA);

    workspaceRoots.set("sg-1", rootB);
    workspaceRoots.set(`sg-${CAP_512}`, rootA);
    expect(await servedRoot(`sg-${CAP_512}`)).toBe(rootA);

    expect(await servedRoot("sg-1")).toBe(rootB);
    expect(await servedRoot("sg-0")).toBe(rootA);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 4 — services/web/web-controller.ts · cache
// ─────────────────────────────────────────────────────────────────────────────
//
// This site evicts AFTER the insert (`while (size > cap)`), which retains the
// same number as the other three's pre-insert `>= cap`. The pin is the retained
// count and the victim, not the operator — an implementation detail a shared
// function is allowed to change, and a retained count is not.
describe("LRU characterization — web-controller cache (cap 512, post-insert evict, promote on get)", () => {
  test("keeps 512 after the 513th mark, evicting the oldest; a get promotes past it", async () => {
    WebController.resetInstance();
    const controller = new WebController({
      vectorStore: { addDocuments: async () => {} } as never,
      keywordSearch: { index: async () => {} } as never,
    });

    // One call captures the WebIndexDeps object; the cache behind it is the
    // controller's own instance field, shared across every built deps object.
    capturedWebDeps = null;
    await controller.fetchAndIndex({ url: "https://example.invalid/seed" });
    expect(capturedWebDeps).not.toBeNull();
    const deps = capturedWebDeps!;

    for (let i = 0; i < CAP_512; i++) deps.markIndexed(`url-${i}`, 1000 + i);

    // At the cap, nothing has been evicted yet.
    expect(deps.getLastIndexedAt("url-0")).toBe(1000);

    // That get promoted url-0, so url-1 becomes the oldest.
    deps.markIndexed(`url-${CAP_512}`, 9999);

    expect(deps.getLastIndexedAt("url-1")).toBeNull();
    expect(deps.getLastIndexedAt("url-0")).toBe(1000);
    expect(deps.getLastIndexedAt(`url-${CAP_512}`)).toBe(9999);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Site 5 — services/search/file-filter-cache.ts
// ─────────────────────────────────────────────────────────────────────────────
//
// The site that differs on two axes, and the reason RFS-02 AC-2 makes the shared
// module a FUNCTION rather than a cache class: cap 50, and a read does NOT
// promote. If the repoint gave this site the other four's read-promotion, the
// second assertion below flips.
describe("LRU characterization — file-filter-cache (cap 50, NO read promotion)", () => {
  const FILES = ["a.ts", "b.ts", "c.md"];

  test("keeps 50 after the 51st insert and evicts the first-inserted even when it was just read", () => {
    const cache = new FileFilterCache();

    for (let i = 0; i < CAP_50; i++) {
      cache.getValidFiles(`ffc-${i}`, FILES, ["**/*.ts"]);
    }
    expect(cache.getStats().size).toBe(CAP_50);
    expect(cache.getStats().maxSize).toBe(CAP_50);

    // Read the first entry. On the other four sites this promotes; here it only
    // bumps accessCount, leaving createdAt — the eviction key — untouched.
    cache.getValidFiles("ffc-0", FILES, ["**/*.ts"]);
    const afterTouch = cache.getStats().entries.find((e) => e.key.startsWith("project:ffc-0|"));
    expect(afterTouch).toBeDefined();
    expect(afterTouch!.accessCount).toBe(2);

    // The 51st insert evicts one entry, and the just-read entry is the victim.
    cache.getValidFiles(`ffc-${CAP_50}`, FILES, ["**/*.ts"]);
    expect(cache.getStats().size).toBe(CAP_50);

    const keys = cache.getStats().entries.map((e) => e.key);
    expect(keys.some((k) => k.startsWith("project:ffc-0|"))).toBe(false);
    expect(keys.some((k) => k.startsWith("project:ffc-1|"))).toBe(true);
    expect(keys.some((k) => k.startsWith(`project:ffc-${CAP_50}|`))).toBe(true);
  });
});
