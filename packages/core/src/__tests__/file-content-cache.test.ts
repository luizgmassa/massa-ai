/**
 * Unit tests for `services/file-read/file-content-cache.ts` — module 4 of the
 * `tools/read_file.ts` extraction (PR-D, T10).
 *
 * WHAT THE PRE-EXISTING SUITES ALREADY REACH, so what this file adds is stated
 * rather than assumed. `read-file.test.ts` drives the cap through a cast and
 * drives one real read past a full cache (T8/C49's call-site sensor); its
 * writeback case drives the legacy-entry repair path and counts extractor
 * calls; `lru-eviction-characterization.test.ts` drives eviction and hit
 * promotion through `handle()`; `read-file-project-root-rename-pin.test.ts`
 * drives CACHE_TTL expiry with a faked clock. All four go through the handler.
 *
 * So the branches this file adds are the ones the handler cannot express: a
 * cache key that varies on each of the five fields INDEPENDENTLY (the handler
 * only ever varies three of them, and never includeSymbols/includeImports,
 * which are the two the original bug — 08.search F33 — was about), the TTL
 * boundary read EXACTLY at the cap rather than a second past it, and the two
 * error paths that cache nothing.
 *
 * NO MODULE MOCKS. An earlier draft did `mock.module("fs/promises", ...)` to
 * count disk reads directly. That is measured cross-contamination, not a style
 * preference: run under one process with the eight sibling read-file suites and
 * the aggregate went 128 pass / 26 fail, because a global `fs/promises` stub
 * reaches every module loaded beside it. `run-tests-isolated.ts` would have
 * forked this file and hidden it. Cache hits are observed the way
 * `lru-eviction-characterization.test.ts` observes them instead — REWRITE THE
 * FILE ON DISK AND READ AGAIN, since a hit replays the bytes captured at insert
 * time and a miss returns the new ones. C45 is the recorded trap: that only
 * discriminates while the two byte strings actually differ, so every fixture
 * below writes a distinct marker rather than reusing one.
 *
 * DEBT-02's coverage floor is per file and applies to this module on its own
 * (R-36), so every branch is exercised here rather than through the handler.
 */

import { describe, test, expect, beforeEach, afterEach, setSystemTime } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

import { FileContentCache } from "../services/file-read/file-content-cache.js";
import type { FileMetadata } from "../services/file-read/file-metadata.js";

type Priv = {
  fileCache: Map<string, { content: string; timestamp: number; metadata?: FileMetadata }>;
  CACHE_TTL: number;
  FILE_CACHE_MAX_ENTRIES: number;
};
const priv = (c: InstanceType<typeof FileContentCache>) => c as unknown as Priv;

const OPTS = { includeSymbols: true, includeImports: true };

/** A counting extractor standing in for the 4 → 5 callback. */
const counting = () => {
  const calls: { content: string; filePath: string }[] = [];
  const fn = async (content: string, filePath: string): Promise<FileMetadata> => {
    calls.push({ content, filePath });
    return { totalLines: content.split("\n").length, language: "TypeScript" };
  };
  return { fn, calls };
};

let dir: string;
let file: string;
/** Write a distinct marker so a hit and a miss can never be the same bytes (C45). */
const writeMarker = (marker: string) => fs.writeFileSync(file, `${marker}\n`);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-fcc-"));
  file = path.join(dir, "sample.ts");
  writeMarker("V1");
});
afterEach(() => {
  setSystemTime();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("FileContentCache — the constants it took from ReadFileTool", () => {
  test("CACHE_TTL is 60000 and FILE_CACHE_MAX_ENTRIES is 512, unchanged by the move", () => {
    const c = priv(new FileContentCache(counting().fn));
    expect(c.CACHE_TTL).toBe(60000);
    expect(c.FILE_CACHE_MAX_ENTRIES).toBe(512);
  });
});

describe("FileContentCache — the cache key", () => {
  test("identical options within the TTL hit the cache: the rewritten file is NOT seen", async () => {
    const { fn, calls } = counting();
    const c = new FileContentCache(fn);
    const first = await c.readFileWithCache(file, OPTS);
    expect(first.content).toBe("V1\n");

    writeMarker("V2");
    const second = await c.readFileWithCache(file, OPTS);
    expect(second.content).toBe("V1\n"); // served from cache
    expect(calls.length).toBe(1);
    expect(priv(c).fileCache.size).toBe(1);
  });

  // The handler only ever varies filePath, projectId and relativePath, so no
  // pre-existing suite can show that includeSymbols and includeImports are part
  // of the key independently. They are the two the original bug was about.
  test.each([
    ["includeSymbols", { includeSymbols: false }],
    ["includeImports", { includeImports: false }],
    ["projectId", { projectId: "p2" }],
    ["relativePath", { relativePath: "other.ts" }],
  ])("varying %s alone produces a distinct entry and re-reads from disk", async (_field, override) => {
    const c = new FileContentCache(counting().fn);
    const base = { ...OPTS, projectId: "p1", relativePath: "f.ts" };
    await c.readFileWithCache(file, base);

    writeMarker("V2");
    const second = await c.readFileWithCache(file, { ...base, ...override });

    expect(second.content).toBe("V2\n"); // a miss, so the rewrite IS seen
    expect(priv(c).fileCache.size).toBe(2);
  });

  test("varying filePath alone produces a distinct entry", async () => {
    const other = path.join(dir, "other.ts");
    fs.writeFileSync(other, "OTHER\n");
    const c = new FileContentCache(counting().fn);
    await c.readFileWithCache(file, OPTS);
    const second = await c.readFileWithCache(other, OPTS);
    expect(second.content).toBe("OTHER\n");
    expect(priv(c).fileCache.size).toBe(2);
  });

  test("undefined projectId and relativePath are keyed as null, not omitted", async () => {
    const c = new FileContentCache(counting().fn);
    await c.readFileWithCache(file, OPTS);
    // The literal is asserted whole: `read-file.test.ts`'s writeback case
    // hardcodes this exact JSON, and the two must not drift apart silently.
    expect([...priv(c).fileCache.keys()]).toEqual([
      JSON.stringify({
        filePath: file,
        includeSymbols: true,
        includeImports: true,
        projectId: null,
        relativePath: null,
      }),
    ]);
  });
});

describe("FileContentCache — TTL", () => {
  test("at exactly CACHE_TTL the entry is EXPIRED — the predicate is <, not <=", async () => {
    const BASE = new Date("2026-01-01T00:00:00.000Z").getTime();
    setSystemTime(new Date(BASE));
    const c = new FileContentCache(counting().fn);
    expect((await c.readFileWithCache(file, OPTS)).content).toBe("V1\n");

    writeMarker("V2");

    // 1 ms under the TTL: still a hit, so the rewrite is invisible.
    setSystemTime(new Date(BASE + 60000 - 1));
    expect((await c.readFileWithCache(file, OPTS)).content).toBe("V1\n");

    // Exactly at the TTL: `elapsed < CACHE_TTL` is false, so it re-reads. No
    // caller can express this boundary — the pin suite steps a full second past
    // it — and an off-by-one here is invisible to every one of them.
    setSystemTime(new Date(BASE + 60000));
    expect((await c.readFileWithCache(file, OPTS)).content).toBe("V2\n");
  });

  test("an expired entry is replaced in place, not accumulated", async () => {
    const BASE = new Date("2026-01-01T00:00:00.000Z").getTime();
    setSystemTime(new Date(BASE));
    const c = new FileContentCache(counting().fn);
    await c.readFileWithCache(file, OPTS);

    writeMarker("V2");
    setSystemTime(new Date(BASE + 120000));
    const r = await c.readFileWithCache(file, OPTS);

    expect(r.content).toBe("V2\n");
    expect(priv(c).fileCache.size).toBe(1);
  });
});

describe("FileContentCache — the legacy-entry repair path", () => {
  const keyFor = (p: string) =>
    JSON.stringify({
      filePath: p,
      includeSymbols: true,
      includeImports: true,
      projectId: null,
      relativePath: null,
    });

  test("an entry with undefined metadata re-extracts once and writes back", async () => {
    const { fn, calls } = counting();
    const c = new FileContentCache(fn);
    priv(c).fileCache.set(keyFor(file), { content: "SEEDED\n", timestamp: Date.now() });

    const r1 = await c.readFileWithCache(file, OPTS);
    expect(r1.content).toBe("SEEDED\n"); // served from cache, never from disk
    expect(calls.length).toBe(1);

    const r2 = await c.readFileWithCache(file, OPTS);
    expect(r2.content).toBe("SEEDED\n");
    expect(calls.length).toBe(1); // still 1 — the write-back took
    expect(priv(c).fileCache.get(keyFor(file))!.metadata).toBeDefined();
  });

  test("the repair extracts against the CACHED content, not a fresh disk read", async () => {
    const { fn, calls } = counting();
    const c = new FileContentCache(fn);
    priv(c).fileCache.set(keyFor(file), { content: "OLD\n", timestamp: Date.now() });
    writeMarker("NEW");

    await c.readFileWithCache(file, OPTS);
    expect(calls[0]!.content).toBe("OLD\n");
  });

  test("the repair preserves the original timestamp, so it does not extend the TTL", async () => {
    const BASE = new Date("2026-01-01T00:00:00.000Z").getTime();
    setSystemTime(new Date(BASE));
    const c = new FileContentCache(counting().fn);
    priv(c).fileCache.set(keyFor(file), { content: "SEEDED\n", timestamp: BASE });

    setSystemTime(new Date(BASE + 30000));
    await c.readFileWithCache(file, OPTS); // repairs metadata via `...cached`
    expect(priv(c).fileCache.get(keyFor(file))!.timestamp).toBe(BASE);

    // Still keyed to the ORIGINAL insert, so it expires on the original
    // schedule and the disk file finally wins.
    writeMarker("V2");
    setSystemTime(new Date(BASE + 60000));
    expect((await c.readFileWithCache(file, OPTS)).content).toBe("V2\n");
  });
});

describe("FileContentCache — LRU promotion and the cap", () => {
  test("a hit promotes its key to most-recently-used", async () => {
    const other = path.join(dir, "other.ts");
    fs.writeFileSync(other, "OTHER\n");
    const c = new FileContentCache(counting().fn);
    await c.readFileWithCache(file, OPTS);
    await c.readFileWithCache(other, OPTS);
    expect([...priv(c).fileCache.keys()][0]).toContain("sample.ts");

    await c.readFileWithCache(file, OPTS); // hit → delete+set
    const after = [...priv(c).fileCache.keys()];
    expect(after[0]).toContain("other.ts");
    expect(after[1]).toContain("sample.ts");
  });

  test("the cap is honoured on insert and the victim is the oldest", async () => {
    const c = new FileContentCache(counting().fn);
    const CAP = priv(c).FILE_CACHE_MAX_ENTRIES;
    // Seed to exactly CAP through the cast — the established reach here, and
    // the alternative is CAP real files for no added signal. These keys are
    // bare strings, so they cannot collide with the JSON blob a real read
    // composes and the read below is guaranteed a MISS.
    for (let i = 0; i < CAP; i++) {
      priv(c).fileCache.set(`seed-${i}`, { content: `c${i}`, timestamp: Date.now(), metadata: { totalLines: 1 } });
    }
    expect(priv(c).fileCache.size).toBe(CAP);

    await c.readFileWithCache(file, OPTS);

    // Exact, never an upper bound: over-eviction satisfies `<= CAP` and is the
    // recorded way an off-by-one walks through (file-filter-cache.test.ts:94).
    expect(priv(c).fileCache.size).toBe(CAP);
    expect(priv(c).fileCache.has("seed-0")).toBe(false); // oldest evicted
    expect(priv(c).fileCache.has("seed-1")).toBe(true); // and only the oldest
  });

  test("two instances do not share a cache — the per-tool rule, asserted", () => {
    const a = new FileContentCache(counting().fn);
    const b = new FileContentCache(counting().fn);
    priv(a).fileCache.set("k", { content: "x", timestamp: Date.now() });
    // A module singleton would leak file content between independently
    // constructed ReadFileTools. That is a behavior change, and this is the
    // only assertion in the repo that would notice it.
    expect(priv(b).fileCache.size).toBe(0);
  });
});

describe("FileContentCache — the 4 → 5 callback", () => {
  test("a miss extracts against the freshly read content and returns that metadata", async () => {
    const { fn, calls } = counting();
    const c = new FileContentCache(fn);
    fs.writeFileSync(file, "l1\nl2\nl3\n");
    const r = await c.readFileWithCache(file, OPTS);
    expect(calls).toEqual([{ content: "l1\nl2\nl3\n", filePath: file }]);
    expect(r.metadata).toEqual({ totalLines: 4, language: "TypeScript" });
  });

  test("the options object is forwarded to the extractor unchanged", async () => {
    const seen: unknown[] = [];
    const c = new FileContentCache(async (_c, _f, options) => {
      seen.push(options);
      return { totalLines: 1 };
    });
    const opts = { ...OPTS, projectId: "p", relativePath: "rel/f.ts" };
    await c.readFileWithCache(file, opts);
    expect(seen).toEqual([opts]);
  });

  test("a throwing extractor propagates and caches nothing", async () => {
    const c = new FileContentCache(async () => {
      throw new Error("extractor exploded");
    });
    await expect(c.readFileWithCache(file, OPTS)).rejects.toThrow("extractor exploded");
    // Nothing cached, so the next call retries rather than serving a half-built
    // entry — the module adds no error handling of its own.
    expect(priv(c).fileCache.size).toBe(0);
  });

  test("a failed disk read propagates and caches nothing", async () => {
    const c = new FileContentCache(counting().fn);
    const missing = path.join(dir, "does-not-exist.ts");
    await expect(c.readFileWithCache(missing, OPTS)).rejects.toThrow();
    expect(priv(c).fileCache.size).toBe(0);
  });
});
