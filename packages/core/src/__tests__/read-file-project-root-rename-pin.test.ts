/**
 * RFS-02 AC-4 — a PIN on the `projectRootCache` T9 moved into
 * `services/file-read/project-root-cache.ts` (it was `ReadFileTool`s own field
 * when this pin was written), not an assertion that
 * it is correct.
 *
 * `spec.md` §3.B measured two things about this cache and could not separate
 * their consequences by reading source:
 *
 *   1. `project-root-cache.ts:30` declares `private readonly ROOT_CACHE_TTL = 300000`
 *      and NOTHING READS IT. The declaration is the constant's only occurrence
 *      in the file. So the cache is LRU-bounded only, while `fileCache`'s
 *      `CACHE_TTL` really is checked at `file-content-cache.ts:107` (T10 moved
 *      the content cache out of `read_file.ts` into module 4, so the two
 *      constants are no longer even in the same file).
 *   2. `production-wiring.ts` composes the post-commit project-rename/merge
 *      invalidator registry and registers `symbolGraph.clearProjectRoot` — the
 *      exact same data, in a class whose own comment
 *      (`symbol-graph.service.ts:175`) cites `ReadFileTool` as the pattern it
 *      mirrors. `ReadFileTool`'s caches are deliberately absent, and
 *      `production-wiring.ts:67-68` USED TO give the reason: *"both are
 *      TTL-bounded and self-evict."* Finding 1 makes that false for
 *      `projectRootCache`, and T8b rewrote both that comment and
 *      `invalidator-registry.ts` to say so, citing this pin as the authority.
 *
 * Two readings survive the source: a live staleness bug, or a dead constant plus
 * a wrong comment over intended LRU-only behavior. Static reading cannot choose.
 * These tests choose by measurement, and WHICHEVER ANSWER THEY GIVE IS THE
 * CHARACTERIZATION — they are written to record behavior, not to demand it.
 *
 * **If this file shows a stale read, PR-D LOGS IT AND DOES NOT FIX IT.** Fixing
 * it is a behavior change inside a behavior-preserving PR (parent `spec.md` Out
 * of Scope, R-07's precedent). The pin exists so the extraction can neither
 * silently fix the bug nor silently break the intended behavior.
 *
 * Taken BEFORE the extraction, against surfaces that survive it: `handle()`,
 * `goToDefinition()`, and the injectable resolver on the production registry.
 * The already-covered path — a reindex refreshing the root through the
 * `indexing:started` event — is `read-file.test.ts`s own
 * "resolveFilePath branches" describe; this file covers
 * the rename that does NOT reindex, which nothing covered.
 */

import { describe, test, expect, mock, beforeAll, afterAll, setSystemTime } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

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

const mockRepo = {
  getCentrality: async () => new Map<string, number>(),
  findDependencies: async () => [],
};
mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: () => mockRepo,
}));

import { ReadFileTool } from "../tools/read_file.js";
import { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";
import { createProductionProjectIdentityInvalidatorRegistry } from "../services/project-identity/production-wiring.js";
import type { DefinitionLookupResult } from "../services/symbol/definition-lookup.js";

const REL = "sample.ts";
let rootA: string;
let rootB: string;

beforeAll(() => {
  rootA = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-pin-rootA-"));
  rootB = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-pin-rootB-"));
  fs.writeFileSync(path.join(rootA, REL), "export const marker = 'ROOT-A';\n");
  fs.writeFileSync(path.join(rootB, REL), "export const marker = 'ROOT-B';\n");
});

afterAll(() => {
  setSystemTime();
  fs.rmSync(rootA, { recursive: true, force: true });
  fs.rmSync(rootB, { recursive: true, force: true });
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Pin 1 — the rename path
// ─────────────────────────────────────────────────────────────────────────────
describe("RFS-02 AC-4 — projectRootCache across a committed rename/merge", () => {
  test("the production invalidator registry clears symbol-graph's root cache and not read_file's", async () => {
    const SOURCE = "pin-rename-source";
    const TARGET = "pin-rename-target";
    workspaceRoots.set(SOURCE, rootA);
    workspaceRoots.set(TARGET, rootA);

    const tool = new ReadFileTool();
    const symbolService = new SymbolGraphService();

    const toolRoot = async (projectId: string) => {
      const res = await tool.handle({ filePath: REL, projectId, compress: false });
      expect(res.success).toBe(true);
      return path.dirname((res.data as { absolutePath: string }).absolutePath);
    };
    const symbolRoot = async (projectId: string) => {
      const results = await symbolService.goToDefinition(projectId, "marker", undefined, lookupFor(projectId));
      expect(results.length).toBe(1);
      return results[0]!.snippet!.includes("ROOT-A") ? rootA : rootB;
    };

    // Warm BOTH caches on the pre-rename root.
    expect(await toolRoot(SOURCE)).toBe(rootA);
    expect(await symbolRoot(SOURCE)).toBe(rootA);

    // The rename commits: the workspace now resolves this project elsewhere.
    workspaceRoots.set(SOURCE, rootB);

    // Run the real post-commit registry. The resolver is the production factory's
    // own injection seam, so this is the registered invalidator SET under test,
    // not a hand-rolled stand-in.
    const registry = createProductionProjectIdentityInvalidatorRegistry(() => ({
      queryUnderstanding: { invalidateProject: () => {} },
      fileFilterCache: { invalidateProject: () => 0 },
      indexManager: null,
      symbolGraph: symbolService,
    }));
    const report = await registry.invalidateBoth(SOURCE, TARGET);

    // The registry really ran — without this, "read_file served a stale root"
    // could equally mean the registry no-opped, and the pin would prove nothing.
    const ranFor = report.invalidated.map((i) => `${i.invalidatorId}:${i.projectId}`);
    expect(ranFor).toContain(`symbol-graph-project-root:${SOURCE}`);
    expect(ranFor).toContain(`symbol-graph-project-root:${TARGET}`);

    // No invalidator in EITHER outcome list names the read_file tool. Checking
    // both lists is what makes this robust to a registrant that throws.
    const everyId = [
      ...report.invalidated.map((i) => i.invalidatorId),
      ...report.failures.map((f) => f.invalidatorId),
    ];
    expect(everyId.some((id) => /read[-_]?file/i.test(id))).toBe(false);

    // ── The pin ──────────────────────────────────────────────────────────────
    // symbol-graph was cleared, so it re-resolves to the post-rename root.
    expect(await symbolRoot(SOURCE)).toBe(rootB);
    // read_file was not, so it keeps serving the PRE-rename root. This is the
    // stale read `spec.md` §3.B could not settle by reading source. RECORDED,
    // NOT FIXED — see this file's header.
    expect(await toolRoot(SOURCE)).toBe(rootA);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Pin 2 — which of the two declared TTLs is enforced
// ─────────────────────────────────────────────────────────────────────────────
describe("RFS-02 AC-4 — CACHE_TTL is enforced and ROOT_CACHE_TTL is not", () => {
  test("past 60s the content re-reads; past 300s the project root still does not", async () => {
    const PROJECT = "pin-ttl";
    const BASE = new Date("2026-01-01T00:00:00.000Z").getTime();
    const CACHE_TTL = 60_000; // file-content-cache.ts:69, read at :107
    const ROOT_CACHE_TTL = 300_000; // project-root-cache.ts:30, read nowhere

    const movable = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-pin-ttl-"));
    fs.writeFileSync(path.join(movable, REL), "V1\n");
    fs.writeFileSync(path.join(rootB, REL), "V2-elsewhere\n");
    workspaceRoots.set(PROJECT, movable);

    try {
      setSystemTime(new Date(BASE));
      const tool = new ReadFileTool();
      const read = async () => {
        const res = await tool.handle({ filePath: REL, projectId: PROJECT, compress: false });
        expect(res.success).toBe(true);
        const d = res.data as { absolutePath: string; content: string };
        return { root: path.dirname(d.absolutePath), content: d.content };
      };

      const first = await read();
      expect(first.root).toBe(movable);
      expect(first.content).toContain("V1");

      // The workspace moves and the file's bytes change. Nothing has expired yet.
      workspaceRoots.set(PROJECT, rootB);
      fs.writeFileSync(path.join(movable, REL), "V2\n");

      const withinBoth = await read();
      expect(withinBoth.root).toBe(movable);
      expect(withinBoth.content).toContain("V1"); // fileCache still valid

      // Past CACHE_TTL, under ROOT_CACHE_TTL. The content cache expires — proving
      // this suite can see a TTL expiring at all — while the root cache does not.
      setSystemTime(new Date(BASE + CACHE_TTL + 1_000));
      const pastContentTtl = await read();
      expect(pastContentTtl.content).toContain("V2"); // CACHE_TTL IS enforced
      expect(pastContentTtl.root).toBe(movable); // root still cached

      // Past ROOT_CACHE_TTL. If the declared constant were read, the root would
      // re-resolve to rootB here. It does not: the constant is dead and the cache
      // is LRU-bounded only. That settles reading 1 of `spec.md` §3.B.
      setSystemTime(new Date(BASE + ROOT_CACHE_TTL + 60_000));
      const pastRootTtl = await read();
      expect(pastRootTtl.root).toBe(movable);
      expect(pastRootTtl.root).not.toBe(rootB);
    } finally {
      setSystemTime();
      fs.rmSync(movable, { recursive: true, force: true });
    }
  }, 30_000);
});
