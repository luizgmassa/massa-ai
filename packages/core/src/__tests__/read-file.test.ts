/**
 * Unit tests for ReadFileTool path resolution (COVERAGE finding #3).
 *
 * Covers the three resolveFilePath branches surfaced through handle():
 *   1. relative filePath + no projectId  → distinct { success:false } error,
 *      NOT a cwd guess (the bug fixed in T3).
 *   2. relative filePath + projectId     → resolves against the workspace
 *      project_path (workspaceManager stubbed).
 *   3. absolute filePath                 → used verbatim (base-independent).
 */

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

import { ReadFileTool } from "../tools/read_file.js";
import { evictOldest } from "../services/cache/lru-evict.js";
import { eventBus } from "../services/events/event-bus.js";
import type { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";

// Stub the workspaceManager singleton BEFORE the tool imports it transitively.
// We only need getWorkspace(); the tool caches the returned project_path.
// Use a real temp dir so the tool can actually fs.readFile the resolved path.
const FAKE_WORKSPACE_ROOT = path.join(
  os.tmpdir(),
  `massa-ai-readfile-ws-${process.pid}`
);
type IndexingStartedPayload = {
  jobId: string;
  projectId: string;
  projectPath: string;
  totalFiles?: number;
};
const indexingStartedListeners = new Set<(payload: IndexingStartedPayload) => void>();

// Wave 5 FR-12: read_file path containment rejects absolute paths outside
// project root + cwd + MASSA_AI_READ_FILE_ROOTS. These Wave-4 tests
// create temp files under os.tmpdir() (outside cwd), so allow tmpdir as an
// extra root. The tool reads this env at CALL TIME, so setting it here
// covers all tests in this file. Restored in afterAll.
const PREV_READ_FILE_ROOTS = process.env.MASSA_AI_READ_FILE_ROOTS;
beforeEach(() => {
  fs.mkdirSync(FAKE_WORKSPACE_ROOT, { recursive: true });
  process.env.MASSA_AI_READ_FILE_ROOTS = os.tmpdir();
});
afterAll(() => {
  if (PREV_READ_FILE_ROOTS === undefined) delete process.env.MASSA_AI_READ_FILE_ROOTS;
  else process.env.MASSA_AI_READ_FILE_ROOTS = PREV_READ_FILE_ROOTS;
});
mock.module("../services/events/event-bus.js", () => ({
  eventBus: {
    subscribe: (event: string, listener: (payload: IndexingStartedPayload) => void) => {
      if (event === "indexing:started") indexingStartedListeners.add(listener);
      return () => indexingStartedListeners.delete(listener);
    },
    publish: (event: string, payload: IndexingStartedPayload) => {
      if (event === "indexing:started") {
        for (const listener of indexingStartedListeners) listener(payload);
      }
    },
  },
}));
mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    getWorkspace: async (_projectId: string) => ({
      project_path: FAKE_WORKSPACE_ROOT,
    }),
  },
}));

describe("ReadFileTool — resolveFilePath branches", () => {
  let tmpFile: string;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-readfile-"));
    tmpFile = path.join(tmpDir, "sample.txt");
    fs.writeFileSync(tmpFile, "line1\nline2\nline3\n");
  });

  test("relative filePath + no projectId → distinct success:false error", async () => {
    const tool = new ReadFileTool();
    const res = await tool.handle({
      filePath: "packages/core/src/tools/read_file.ts",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error!).toMatch(/requires a projectId.*absolute path/i);
    // Must NOT be the generic catch message — confirms we hit the early return.
    expect(res.error!).not.toMatch(/^Failed to read file:/);
  });

  test("relative filePath + projectId → resolves against workspace root", async () => {
    // Build an absolute target that matches what the tool will compute from the
    // (stubbed) workspace root + relative path, then assert absolutePath in the
    // successful response equals path.resolve(root, rel).
    const rel = "nested/file.txt";
    const expectedAbs = path.resolve(FAKE_WORKSPACE_ROOT, rel);

    // The tool will try to fs.readFile(expectedAbs). Create it so the read
    // succeeds and we can assert the resolved absolute path.
    fs.mkdirSync(path.dirname(expectedAbs), { recursive: true });
    fs.writeFileSync(expectedAbs, "hello\n");

    const tool = new ReadFileTool();
    const res = await tool.handle({
      filePath: rel,
      projectId: "proj-xyz",
    });

    expect(res.success).toBe(true);
    const data = res.data as { absolutePath: string };
    expect(data.absolutePath).toBe(expectedAbs);

    // cleanup the synthetic workspace file
    fs.rmSync(path.join(FAKE_WORKSPACE_ROOT, rel), { force: true });
  });

  test("reindex lifecycle refreshes a cached project root on the same tool instance", async () => {
    const projectId = "proj-moved-root";
    const rel = "nested/file.txt";
    const oldAbs = path.resolve(FAKE_WORKSPACE_ROOT, rel);
    const nextRoot = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-readfile-moved-"));
    const nextAbs = path.resolve(nextRoot, rel);

    fs.mkdirSync(path.dirname(oldAbs), { recursive: true });
    fs.writeFileSync(oldAbs, "old root\n");
    fs.mkdirSync(path.dirname(nextAbs), { recursive: true });
    fs.writeFileSync(nextAbs, "new root\n");

    try {
      const tool = new ReadFileTool();
      const before = await tool.handle({ filePath: rel, projectId });
      expect(before.success).toBe(true);
      expect((before.data as { absolutePath: string }).absolutePath).toBe(oldAbs);

      eventBus.publish("indexing:started", {
        jobId: "job-moved-root",
        projectId,
        projectPath: nextRoot,
      });

      const after = await tool.handle({ filePath: rel, projectId });
      expect(after.success).toBe(true);
      expect((after.data as { absolutePath: string; content: string }).absolutePath).toBe(nextAbs);
      expect((after.data as { content: string }).content).toContain("new root");
    } finally {
      fs.rmSync(nextRoot, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // best-effort teardown of both temp dirs
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(FAKE_WORKSPACE_ROOT, { recursive: true, force: true });
  });

  test("absolute filePath → used verbatim (base-independent)", async () => {
    const tool = new ReadFileTool();
    const res = await tool.handle({ filePath: tmpFile });

    expect(res.success).toBe(true);
    const data = res.data as { absolutePath: string; content: string };
    // path.resolve on an already-absolute path is idempotent.
    expect(data.absolutePath).toBe(path.resolve(tmpFile));
    expect(data.content).toContain("line2");
  });
});

// ── cache-key regression (side-finding [med] — the only e2e red: 08.search F33) ─
//
// ReadFileTool.fileCache keys on filePath ONLY, so a second read of the same
// file within the 60s TTL with different includeSymbols/includeImports returns
// stale, options-baked metadata. In production ONE ReadFileTool instance is a
// module singleton (apps/tools-api/src/routes/file.ts:15), so the cache
// survives across HTTP requests → F33 (includeSymbols:false) fails in-suite,
// warmed by F30 (includeSymbols defaults true) on the same file.
//
// CRITICAL: a real SymbolGraphService must be injected via the constructor —
// without it metadata.symbols is NEVER populated, so a vacuous pass would mask
// the bug. The stub provides listDefinitions returning one definition so the
// includeSymbols:true path populates metadata.symbols.
describe("ReadFileTool — cache key includes option flags", () => {
  let tmpFile: string;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-readfile-cache-"));
    // .ts so extractMetadata detects a language and the symbol path engages.
    tmpFile = path.join(tmpDir, "sample.ts");
    fs.writeFileSync(tmpFile, "import { x } from 'y';\nexport function foo() {}\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("same file, different includeSymbols within TTL → distinct metadata", async () => {
    // Duck-typed stub matching the slice of SymbolGraphService the tool calls
    // (extractMetadata → listDefinitions). Cast to the service type so the
    // constructor accepts it.
    const stubSymbolGraph = {
      listDefinitions: async (_projectId: string, _opts: any) => ({
        definitions: [
          {
            name: "foo",
            kind: "function",
            filePath: tmpFile,
            lineStart: 2,
            lineEnd: 2,
          },
        ],
        total: 1,
        total_exact: true,
      }),
      getReferences: async (_projectId: string, _name: string, _fqn?: string) => [],
    } as unknown as SymbolGraphService;

    // ONE instance — mirrors the production singleton.
    const tool = new ReadFileTool(stubSymbolGraph);

    // Call 1: includeSymbols true (default). Assert symbols populated.
    const r1 = await tool.handle({
      filePath: tmpFile,
      projectId: "proj-cache",
      compress: false,
    });
    expect(r1.success).toBe(true);
    const d1 = r1.data as { metadata?: { symbols?: { definitions: number } } };
    expect(d1.metadata?.symbols).toBeDefined();
    expect(d1.metadata!.symbols!.definitions).toBe(1);

    // Call 2: SAME file, SAME projectId, back-to-back (within TTL), but
    // includeSymbols:false. Pre-fix this returned d1's stale symbols entry.
    const r2 = await tool.handle({
      filePath: tmpFile,
      projectId: "proj-cache",
      includeSymbols: false,
      compress: false,
    });
    expect(r2.success).toBe(true);
    const d2 = r2.data as { metadata?: { symbols?: unknown } };
    expect(d2.metadata?.symbols).toBeUndefined();
  });
});

// ── T3: fileCache LRU cap (512) + cache-hit metadata writeback ──────────────
//
// The fileCache is a bounded LRU map mirroring WebController's 512-cap
// pattern, as was the projectRootCache T9 moved into
// services/file-read/project-root-cache.ts. On GET a key is promoted to
// most-recently-used (delete+set); on SET the oldest entry is evicted while
// over the cap. Separately, a legacy cache entry with undefined metadata used
// to re-extract on EVERY hit without persisting; it now writes back so the
// second hit is served from cache.

describe("ReadFileTool — fileCache LRU cap + promotion", () => {
  // CAP+1 distinct inserts → oldest evicted, a touched (LRU-promoted) hot key
  // survives. We drive this through the private fileCache directly via a cast,
  // since constructing CAP+1 real files is wasteful and the cap logic lives in
  // evictOldest() which is agnostic to the cache type.
  //
  // T8 REPOINT (GMS-05 AC-3 — repointed, not weakened, skipped or deleted).
  // The operator is services/cache/lru-evict.ts rather than a private
  // ReadFileTool wrapper. Both assertions are unchanged: CAP+1 evicts the
  // oldest, and a delete+set promoted hot key survives.
  //
  // T10 REPOINT (GMS-05 AC-3, and the move C34's table predicted for this task).
  // fileCache, CACHE_TTL and FILE_CACHE_MAX_ENTRIES all moved into
  // services/file-read/file-content-cache.ts, so the reach is one hop longer —
  // through the tool's own FileContentCache instance — exactly as T9 made the
  // projectRootCache reach one hop longer. The cap is the same 512 constant in
  // its new home; nothing about what is asserted changed.
  //
  // It deliberately still drives ReadFileTool's OWN cache and pins the cap
  // against that instance's FILE_CACHE_MAX_ENTRIES. Repointing onto a bare Map
  // instead would have made this case a duplicate of lru-evict.test.ts:60 and
  // :70, which already assert both properties over a plain Map — that is a
  // deletion wearing a repoint's clothes, not a repoint. The link to
  // ReadFileTool is the whole reason this case exists here rather than there.
  //
  // The pre-insert bound is CAP - 1, not CAP: lru-evict's second parameter is a
  // POST-CALL bound, so a pre-insert caller reserves the slot its pending set()
  // takes. `size > CAP - 1` and `size >= CAP` are the same predicate over the
  // integers, so the retained count is identical to the wrapper's (C44).
  const CAP = 512;

  test("inserting CAP+1 distinct keys evicts the oldest; a promoted hot key survives", () => {
    const priv = new ReadFileTool() as unknown as {
      fileContent: {
        fileCache: Map<string, unknown>;
        FILE_CACHE_MAX_ENTRIES: number;
      };
    };
    const cache = priv.fileContent.fileCache;

    expect(priv.fileContent.FILE_CACHE_MAX_ENTRIES).toBe(CAP);

    // Seed CAP entries. The first-inserted is the eviction candidate.
    for (let i = 0; i < CAP; i++) {
      evictOldest(cache, CAP - 1);
      cache.set(`key-${i}`, { content: `c${i}`, timestamp: Date.now() });
    }
    expect(cache.size).toBe(CAP);
    expect(cache.has("key-0")).toBe(true);

    // Touch key-0 (LRU promote via delete+set) — it must NOT be evicted next.
    const v0 = cache.get("key-0")!;
    cache.delete("key-0");
    cache.set("key-0", v0);

    // Insert one more → evict oldest in insertion order. After the key-0
    // promotion, the oldest is now key-1.
    evictOldest(cache, CAP - 1);
    cache.set(`key-${CAP}`, { content: `c${CAP}`, timestamp: Date.now() });

    expect(cache.size).toBe(CAP);
    // Hot (promoted) key survived.
    expect(cache.has("key-0")).toBe(true);
    // Oldest non-promoted key evicted.
    expect(cache.has("key-1")).toBe(false);
    // New key present.
    expect(cache.has(`key-${CAP}`)).toBe(true);
  });
});

// ── T8 / C49: call-site sensors for the two eviction calls nothing watched ───
//
// The case above characterizes the eviction OPERATOR. It calls it directly and
// never drives readFileWithCache or the indexing:started subscription, so it is
// blind to whether anything still CALLS eviction. Measured across all 92 cases
// in the repo's six eviction suites: deleting read_file.ts's fileCache call or
// its projectRootCache call inside the indexing:started handler left
// 92 pass / 0 fail — no sensor anywhere. The other three of the five repointed
// sites each had one. Deliberately unnumbered, and both call sites have since
// left the file: T9 took the projectRootCache one into
// services/file-read/project-root-cache.ts and T10 the fileCache one into
// services/file-read/file-content-cache.ts, so any line number written here
// would have been falsified twice over.
//
// Both cases below seed the cache to CAP through the cast and then drive the
// PRODUCTION path once, so the only thing standing between CAP and CAP+1 is the
// call site itself. Each asserts an EXACT size rather than an upper bound:
// file-filter-cache.test.ts:94's `toBeLessThanOrEqual` is the recorded example
// of an upper bound letting an over-eviction mutation walk through, so the
// victim and a survivor are named too.
describe("ReadFileTool — eviction call sites are driven, not just the operator", () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-readfile-callsite-"));
    tmpFile = path.join(tmpDir, "sample.ts");
    fs.writeFileSync(tmpFile, "export const x = 1;\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // T10 REPOINT (GMS-05 AC-3 — repointed, not weakened, skipped or deleted).
  // readFileWithCache, fileCache and FILE_CACHE_MAX_ENTRIES moved into
  // services/file-read/file-content-cache.ts, so the reach is one hop longer.
  // The case stays HERE and is not made redundant by that module's own eviction
  // case, for the reason the projectRootCache sensor below already states: this
  // one asserts a constructed ReadFileTool still WIRES a cache whose eviction
  // call is reachable from handle(). Drop it and the module could be correct
  // while nothing constructed it.
  test("one real read past a full fileCache evicts — readFileWithCache's call site is live", async () => {
    const tool = new ReadFileTool();
    const priv = tool as unknown as {
      fileContent: {
        fileCache: Map<string, unknown>;
        FILE_CACHE_MAX_ENTRIES: number;
      };
    };
    const cache = priv.fileContent.fileCache;
    const CAP = priv.fileContent.FILE_CACHE_MAX_ENTRIES;

    // Seed to exactly CAP. These keys are bare strings; handle() composes its
    // own key as a JSON blob (see the writeback test below), so the two key
    // namespaces cannot collide and the real read is guaranteed a cache MISS.
    for (let i = 0; i < CAP; i++) {
      cache.set(`seed-${i}`, { content: `c${i}`, timestamp: Date.now(), metadata: {} });
    }
    expect(cache.size).toBe(CAP);

    // One real read → readFileWithCache misses → evicts, then inserts.
    const res = await tool.handle({ filePath: tmpFile, compress: false });
    expect(res.success).toBe(true);

    // Exact, not an upper bound: without the eviction call this is CAP + 1.
    expect(cache.size).toBe(CAP);
    expect(cache.has("seed-0")).toBe(false); // oldest evicted
    expect(cache.has("seed-1")).toBe(true); // and only the oldest
  });

  // T9 REPOINT (GMS-05 AC-3 — repointed, not weakened, skipped or deleted).
  // projectRootCache, its cap and the indexing:started subscription all moved
  // into services/file-read/project-root-cache.ts, so the reach is one hop
  // longer and the cap is now that module's own PROJECT_ROOT_CACHE_MAX_ENTRIES
  // rather than the file CONTENT cache's FILE_CACHE_MAX_ENTRIES. Both were 512
  // and neither ever read the other's value, so the bound is unchanged.
  //
  // It stays HERE, and is not made redundant by project-root-cache.test.ts's
  // own eviction case, because the two assert different things: that suite
  // asserts the module evicts, this one asserts ReadFileTool still WIRES a live
  // subscription whose eviction call is reachable from a constructed tool. Drop
  // this case and the module could be correct while nothing constructed it.
  test("one indexing:started past a full projectRootCache evicts — the subscription's call site is live", () => {
    const tool = new ReadFileTool();
    const priv = tool as unknown as {
      projectRoots: {
        projectRootCache: Map<string, string>;
        PROJECT_ROOT_CACHE_MAX_ENTRIES: number;
      };
    };
    const roots = priv.projectRoots.projectRootCache;
    const CAP = priv.projectRoots.PROJECT_ROOT_CACHE_MAX_ENTRIES;

    for (let i = 0; i < CAP; i++) roots.set(`seeded-root-${i}`, `/tmp/root-${i}`);
    expect(roots.size).toBe(CAP);

    // The handler deletes the incoming projectId BEFORE evicting. If that id
    // were already cached, the delete alone would free a slot and the assertion
    // below would hold with or without the eviction call — the same vacuity
    // shape that made the operator case blind to its call sites. The id is
    // therefore drawn from a namespace the seed loop cannot produce, and the
    // precondition is asserted rather than assumed.
    const freshProjectId = "fresh-project-outside-seed-namespace";
    expect(roots.has(freshProjectId)).toBe(false);

    eventBus.publish("indexing:started", {
      jobId: "job-cap-boundary",
      projectId: freshProjectId,
      projectPath: "/tmp/fresh-root",
    });

    // Exact, not an upper bound: without the eviction call this is CAP + 1.
    expect(roots.size).toBe(CAP);
    expect(roots.has("seeded-root-0")).toBe(false); // oldest evicted
    expect(roots.has("seeded-root-1")).toBe(true); // and only the oldest
    expect(roots.get(freshProjectId)).toBe("/tmp/fresh-root");
  });
});

describe("ReadFileTool — cache-hit metadata writeback", () => {
  let tmpFile: string;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-readfile-writeback-"));
    tmpFile = path.join(tmpDir, "sample.ts");
    fs.writeFileSync(tmpFile, "import { x } from 'y';\nexport function foo() {}\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // T10 REPOINT (GMS-05 AC-3 — repointed, not weakened, skipped or deleted).
  // This is C34's own row: extractMetadata moved into
  // services/file-read/file-metadata.ts and fileCache into
  // services/file-read/file-content-cache.ts, so the spy target and the cache
  // reach are each one hop longer.
  //
  // THE SPY STILL WORKS BECAUSE OF HOW read_file.ts WIRES THE 4 -> 5 EDGE, and
  // that is the property this case now also pins. The cache receives an ARROW
  // that re-resolves `this.fileMetadata.extractMetadata` on every call; a
  // `.bind(...)` captured in the constructor would freeze the pre-replacement
  // function and this spy would silently count 0. Replacing the method on the
  // FileMetadataExtractor instance below is therefore observed by both of the
  // cache's call sites, exactly as replacing it on the tool was before the move.
  //
  // The cache KEY shape is unchanged by the extraction — same five fields, same
  // order, same JSON — which is why it is still hardcoded here rather than
  // imported: an accidental change to the key is precisely what this literal
  // catches.
  test("undefined-metadata entry: first hit re-extracts + persists, second hit does NOT re-extract", async () => {
    const tool = new ReadFileTool();
    const priv = tool as unknown as {
      fileMetadata: { extractMetadata: (...args: never[]) => Promise<unknown> };
      fileContent: { fileCache: Map<string, unknown> };
    };

    // Spy extractMetadata by replacing it on the extractor instance.
    let callCount = 0;
    const realExtract = priv.fileMetadata.extractMetadata.bind(priv.fileMetadata);
    priv.fileMetadata.extractMetadata = async (...args: Parameters<typeof realExtract>) => {
      callCount++;
      return realExtract(...args);
    };

    // Seed a cache entry with undefined metadata — the legacy/edge shape.
    // Use the SAME cache key shape the tool computes in readFileWithCache:
    // handle() passes options.projectId = p.projectId (undefined here → null)
    // and options.relativePath = p.filePath (the raw caller param, NOT the
    // resolved absolute path). includeSymbols/includeImports default to true.
    const cacheKey = JSON.stringify({
      filePath: tmpFile,
      includeSymbols: true,
      includeImports: true,
      projectId: null,
      relativePath: tmpFile,
    });
    const content = fs.readFileSync(tmpFile, "utf-8");
    priv.fileContent.fileCache.set(cacheKey, {
      content,
      timestamp: Date.now(),
      // metadata deliberately omitted → undefined
    });

    // Hit 1: cache valid (fresh), metadata undefined → re-extract + persist.
    const r1 = await tool.handle({ filePath: tmpFile, compress: false });
    expect(r1.success).toBe(true);
    expect(callCount).toBe(1);
    const d1 = r1.data as { metadata?: { language?: string } };
    expect(d1.metadata?.language).toBe("TypeScript");

    // The cache entry must now have metadata persisted (no longer undefined).
    const entry = priv.fileContent.fileCache.get(cacheKey) as
      | { metadata?: unknown }
      | undefined;
    expect(entry).toBeDefined();
    expect(entry?.metadata).toBeDefined();

    // Hit 2: cache valid, metadata now defined → served from cache, NO re-extract.
    const r2 = await tool.handle({ filePath: tmpFile, compress: false });
    expect(r2.success).toBe(true);
    expect(callCount).toBe(1); // still 1, not 2 — writeback worked
    const d2 = r2.data as { metadata?: { language?: string } };
    expect(d2.metadata?.language).toBe("TypeScript");
  });
});
