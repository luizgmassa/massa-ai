import { describe, test, expect } from "bun:test";
import {
  WorkingMemoryBuffer,
  DEFAULT_BUFFER_CONFIG,
  restoreWorkingMemoryBuffer,
  snapshotWorkingMemoryBuffer,
  type BufferSnapshot,
  type BufferEntrySnapshot,
} from "../services/synapse/buffer/working-memory-buffer.js";
import type { SearchResult } from "@massa-ai/shared";
import { SearchSource } from "@massa-ai/shared";

function r(id: string, score: number, content?: string): SearchResult {
  return {
    id,
    content: content ?? id,
    score,
    source: SearchSource.VECTOR,
    metadata: {},
  };
}

const NOW = 2_000_000_000;

describe("WorkingMemoryBuffer", () => {
  test("put + get with same query returns hits with boost", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.put([r("a", 0.5), r("b", 0.4)], "auth middleware", NOW);
    const hit = buf.get("auth middleware", NOW);
    expect(hit.hitIds.size).toBe(2);
    const byId = Object.fromEntries(hit.results.map((x) => [x.id, x.score]));
    expect(byId.a).toBeCloseTo(0.65, 5); // 0.5 * 1.3
    expect(byId.b).toBeCloseTo(0.52, 5); // 0.4 * 1.3
  });

  test("get returns no hits when query is unrelated", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.put([r("a", 0.9)], "auth middleware token configuration", NOW);
    const hit = buf.get("database migration rollback strategy", NOW);
    expect(hit.results).toHaveLength(0);
  });

  test("partial query overlap above threshold yields hit", () => {
    const buf = new WorkingMemoryBuffer({
      ...DEFAULT_BUFFER_CONFIG,
      matchThreshold: 0.3,
    });
    buf.put([r("a", 0.5)], "auth middleware timeout", NOW);
    const hit = buf.get("middleware timeout settings", NOW);
    expect(hit.results.length).toBeGreaterThan(0);
  });

  test("primed entries match via content tokens (IMP-9)", () => {
    const buf = new WorkingMemoryBuffer({ ...DEFAULT_BUFFER_CONFIG, matchThreshold: 0.2 });
    // The primed entry's content shares tokens with the query.
    buf.prime([r("p1", 0.7, "auth middleware token configuration")], NOW);
    const overlapping = buf.get("auth middleware behavior", NOW);
    expect(overlapping.hitIds.has("p1")).toBe(true);

    // An unrelated query should NOT pull the primed entry (no flood).
    const unrelated = buf.get("database migration rollback strategy", NOW);
    expect(unrelated.hitIds.has("p1")).toBe(false);
  });

  test("eviction respects maxSize using LRU-by-score", () => {
    const buf = new WorkingMemoryBuffer({ ...DEFAULT_BUFFER_CONFIG, maxSize: 2 });
    buf.put([r("a", 0.9)], "auth middleware", NOW);
    buf.put([r("b", 0.5)], "auth middleware", NOW);
    buf.put([r("c", 0.7)], "auth middleware", NOW);
    expect(buf.size()).toBe(2);
    expect(buf.has("a")).toBe(true);
    expect(buf.has("c")).toBe(true);
    expect(buf.has("b")).toBe(false); // lowest score evicted
  });

  test("TTL expiry removes stale entries", () => {
    const buf = new WorkingMemoryBuffer({ ...DEFAULT_BUFFER_CONFIG, ttlMs: 1000 });
    buf.put([r("a", 0.5)], "auth middleware", NOW);
    expect(buf.size()).toBe(1);
    buf.evictExpired(NOW + 2000);
    expect(buf.size()).toBe(0);
  });

  test("invalidate removes specific ids", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.put([r("a", 0.5), r("b", 0.5), r("c", 0.5)], "auth middleware", NOW);
    expect(buf.invalidate(["a", "b"])).toBe(2);
    expect(buf.size()).toBe(1);
    expect(buf.has("c")).toBe(true);
  });

  test("put accumulates query tokens across calls (IMP-8: baseline preserved)", () => {
    const buf = new WorkingMemoryBuffer({
      ...DEFAULT_BUFFER_CONFIG,
      matchThreshold: 0.3,
    });
    buf.put([r("a", 0.5)], "auth middleware", NOW);
    // Second put with a different (post-pipeline) score must NOT override
    // the original baseline — IMP-8 prevents drift across cycles.
    buf.put([r("a", 0.6)], "session storage", NOW);
    const hit1 = buf.get("auth middleware", NOW);
    expect(hit1.results[0].score).toBeCloseTo(0.65, 5); // 0.5 * 1.3
    const hit2 = buf.get("session storage", NOW);
    expect(hit2.results[0].score).toBeCloseTo(0.65, 5);
  });

  test("put with explicit rawScores overwrites baseline (IMP-8)", () => {
    const buf = new WorkingMemoryBuffer({
      ...DEFAULT_BUFFER_CONFIG,
      matchThreshold: 0.3,
    });
    buf.put([r("a", 0.5)], "auth middleware", NOW);
    // Caller explicitly hands in the raw pre-pipeline score.
    buf.put([r("a", 0.9)], "auth middleware refined", NOW, new Map([["a", 0.55]]));
    const hit = buf.get("auth middleware", NOW);
    expect(hit.results[0].score).toBeCloseTo(0.715, 5); // 0.55 * 1.3
  });

  test("clear empties all entries", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.put([r("a", 0.5), r("b", 0.4)], "auth middleware", NOW);
    expect(buf.size()).toBe(2);
    buf.clear();
    expect(buf.size()).toBe(0);
  });

  test("has returns false for unknown id", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    expect(buf.has("nope")).toBe(false);
  });

  test("evictExpired returns count of removed entries", () => {
    const buf = new WorkingMemoryBuffer({ ...DEFAULT_BUFFER_CONFIG, ttlMs: 1000 });
    buf.put([r("a", 0.5), r("b", 0.4)], "auth middleware", NOW);
    const removed = buf.evictExpired(NOW + 2000);
    expect(removed).toBe(2);
    expect(buf.size()).toBe(0);
  });

  test("evictExpired returns 0 when nothing expired", () => {
    const buf = new WorkingMemoryBuffer({ ...DEFAULT_BUFFER_CONFIG, ttlMs: 100_000 });
    buf.put([r("a", 0.5)], "auth middleware", NOW);
    expect(buf.evictExpired(NOW + 1000)).toBe(0);
  });

  test("get with empty query returns no hits", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.put([r("a", 0.5)], "auth middleware", NOW);
    const hit = buf.get("", NOW);
    expect(hit.results).toHaveLength(0);
    expect(hit.appliedBoost).toBe(false);
  });
});

// ── restoreWorkingMemoryBuffer ────────────────────────────────────────────

describe("restoreWorkingMemoryBuffer", () => {
  // Use a recent timestamp so the TTL check in restore (which uses Date.now())
  // does not skip the entries as stale.
  const RECENT = Date.now();

  test("returns undefined for null/undefined snapshot", () => {
    expect(restoreWorkingMemoryBuffer(null)).toBeUndefined();
    expect(restoreWorkingMemoryBuffer(undefined)).toBeUndefined();
  });

  test("returns undefined for malformed snapshot (missing config)", () => {
    expect(restoreWorkingMemoryBuffer({ entries: [] } as any)).toBeUndefined();
  });

  test("returns undefined for malformed snapshot (missing entries array)", () => {
    expect(
      restoreWorkingMemoryBuffer({ config: DEFAULT_BUFFER_CONFIG } as any),
    ).toBeUndefined();
  });

  test("returns undefined for malformed snapshot (entries not array)", () => {
    expect(
      restoreWorkingMemoryBuffer({
        entries: "not-an-array",
        config: DEFAULT_BUFFER_CONFIG,
      } as any),
    ).toBeUndefined();
  });

  test("restores a valid snapshot with entries", () => {
    const result = r("a", 0.5, "auth middleware token");
    const snapshot: BufferSnapshot = {
      entries: [
        {
          id: "a",
          addedAt: RECENT,
          lastAccessedAt: RECENT,
          baselineScore: 0.5,
          result,
        },
      ],
      config: DEFAULT_BUFFER_CONFIG,
    };
    const buf = restoreWorkingMemoryBuffer(snapshot);
    expect(buf).toBeDefined();
    expect(buf!.size()).toBe(1);
    expect(buf!.has("a")).toBe(true);
  });

  test("restored entries match via content tokens (primed semantics)", () => {
    const result = r("p1", 0.7, "auth middleware token configuration");
    const snapshot: BufferSnapshot = {
      entries: [
        {
          id: "p1",
          addedAt: RECENT,
          lastAccessedAt: RECENT,
          baselineScore: 0.7,
          result,
        },
      ],
      config: { ...DEFAULT_BUFFER_CONFIG, matchThreshold: 0.2 },
    };
    const buf = restoreWorkingMemoryBuffer(snapshot)!;
    const hit = buf.get("auth middleware behavior", RECENT);
    expect(hit.hitIds.has("p1")).toBe(true);
    // boosted score = min(1, 0.7 * 1.3) = 0.91
    expect(hit.results[0].score).toBeCloseTo(0.91, 5);
  });

  test("skips entries past TTL at restore time", () => {
    const result = r("stale", 0.5, "old content");
    const snapshot: BufferSnapshot = {
      entries: [
        {
          id: "stale",
          addedAt: RECENT,
          lastAccessedAt: RECENT,
          baselineScore: 0.5,
          result,
        },
      ],
      config: { ...DEFAULT_BUFFER_CONFIG, ttlMs: 1000 },
    };
    // restore long after TTL expired -> entry skipped. We simulate by using a
    // lastAccessedAt far in the past relative to Date.now() used by restore.
    snapshot.entries[0]!.lastAccessedAt = RECENT - 10_000_000;
    const buf = restoreWorkingMemoryBuffer(snapshot);
    expect(buf).toBeDefined();
    expect(buf!.size()).toBe(0);
  });

  test("skips malformed entries (missing result/id)", () => {
    const good = r("good", 0.5, "auth middleware");
    const snapshot: BufferSnapshot = {
      entries: [
        { id: "bad-no-result", addedAt: RECENT, lastAccessedAt: RECENT, baselineScore: 0.5 } as any,
        { result: good, addedAt: RECENT, lastAccessedAt: RECENT, baselineScore: 0.5 } as any, // missing id
        { id: "good", addedAt: RECENT, lastAccessedAt: RECENT, baselineScore: 0.5, result: good },
      ],
      config: DEFAULT_BUFFER_CONFIG,
    };
    const buf = restoreWorkingMemoryBuffer(snapshot);
    expect(buf).toBeDefined();
    expect(buf!.size()).toBe(1);
    expect(buf!.has("good")).toBe(true);
  });

  test("uses fallback values for missing entry scalars", () => {
    const result = r("fb", 0.6, "auth middleware token");
    const snapshot: BufferSnapshot = {
      entries: [
        // missing addedAt, lastAccessedAt, baselineScore
        { id: "fb", result } as BufferEntrySnapshot,
      ],
      config: { ...DEFAULT_BUFFER_CONFIG, matchThreshold: 0.2 },
    };
    const buf = restoreWorkingMemoryBuffer(snapshot);
    expect(buf).toBeDefined();
    expect(buf!.size()).toBe(1);
    // baselineScore defaults to result.score (0.6); get returns min(1, 0.6*1.3)
    const hit = buf!.get("auth middleware", RECENT);
    expect(hit.results[0].score).toBeCloseTo(0.78, 5);
  });

  test("BUGFIX: missing lastAccessedAt is treated as fresh (not epoch-0 expired)", () => {
    // Regression: the TTL check previously used `?? 0` for lastAccessedAt,
    // so a malformed entry with no lastAccessedAt was always skipped as
    // stale (now - 0 >= ttlMs). The fix uses `?? now` so a missing
    // lastAccessedAt is treated as fresh, matching the stored value fallback.
    const result = r("bugfix", 0.5, "auth middleware token");
    const snapshot: BufferSnapshot = {
      entries: [
        { id: "bugfix", addedAt: RECENT, baselineScore: 0.5, result } as BufferEntrySnapshot,
      ],
      config: { ...DEFAULT_BUFFER_CONFIG, matchThreshold: 0.2, ttlMs: 1000 },
    };
    const buf = restoreWorkingMemoryBuffer(snapshot);
    expect(buf).toBeDefined();
    // Without the fix, this entry would be skipped (now - 0 >= 1000).
    expect(buf!.size()).toBe(1);
    expect(buf!.has("bugfix")).toBe(true);
  });
});

// ── snapshotWorkingMemoryBuffer ───────────────────────────────────────────

describe("snapshotWorkingMemoryBuffer", () => {
  const RECENT = Date.now();

  test("returns null when session has no buffer", () => {
    const snap = snapshotWorkingMemoryBuffer({});
    expect(snap).toBeNull();
  });

  test("returns null when buffer has no entries", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    // Note: the code returns null only when buf/buf.entries is missing, NOT
    // when entries is empty. An empty buffer returns { entries: [], config }.
    const snap = snapshotWorkingMemoryBuffer({ buffer: buf });
    expect(snap).not.toBeNull();
    expect(snap!.entries).toHaveLength(0);
  });

  test("returns { entries: [], config } for an empty (but valid) buffer", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    const snap = snapshotWorkingMemoryBuffer({ buffer: buf });
    expect(snap).not.toBeNull();
    expect(snap!.entries).toEqual([]);
    expect(snap!.config).toEqual(DEFAULT_BUFFER_CONFIG);
  });

  test("snapshots a populated buffer with per-entry scalars + config", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.put([r("a", 0.5, "auth middleware"), r("b", 0.4, "session token")], "auth", RECENT);
    const snap = snapshotWorkingMemoryBuffer({ buffer: buf });
    expect(snap).not.toBeNull();
    expect(snap!.entries).toHaveLength(2);
    expect(snap!.config).toEqual(DEFAULT_BUFFER_CONFIG);
    const ids = snap!.entries.map((e) => e.id).sort();
    expect(ids).toEqual(["a", "b"]);
    const a = snap!.entries.find((e) => e.id === "a")!;
    expect(a.baselineScore).toBe(0.5);
    expect(a.addedAt).toBe(RECENT);
    expect(a.lastAccessedAt).toBe(RECENT);
    expect(a.result.id).toBe("a");
  });

  test("snapshot -> restore round-trip preserves entries", () => {
    const buf = new WorkingMemoryBuffer({
      ...DEFAULT_BUFFER_CONFIG,
      matchThreshold: 0.2,
    });
    buf.put([r("rt", 0.55, "auth middleware token")], "auth middleware", RECENT);
    const snap = snapshotWorkingMemoryBuffer({ buffer: buf });
    expect(snap).not.toBeNull();
    const restored = restoreWorkingMemoryBuffer(snap)!;
    expect(restored.size()).toBe(1);
    expect(restored.has("rt")).toBe(true);
    const hit = restored.get("auth middleware", RECENT);
    expect(hit.hitIds.has("rt")).toBe(true);
    // baseline 0.55 * 1.3 = 0.715
    expect(hit.results[0].score).toBeCloseTo(0.715, 5);
  });

  test("snapshot of primed buffer entries", () => {
    const buf = new WorkingMemoryBuffer(DEFAULT_BUFFER_CONFIG);
    buf.prime([r("p1", 0.7, "auth middleware token configuration")], RECENT);
    const snap = snapshotWorkingMemoryBuffer({ buffer: buf });
    expect(snap).not.toBeNull();
    expect(snap!.entries).toHaveLength(1);
    expect(snap!.entries[0].id).toBe("p1");
  });
});
