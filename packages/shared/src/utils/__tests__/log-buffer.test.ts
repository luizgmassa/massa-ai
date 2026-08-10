/**
 * `log-buffer.ts` ring buffer (T9 — LOG-01).
 *
 * Covers: eviction at capacity, monotonic `seq` across eviction, `snapshot`
 * filters, `subscribe`/unsubscribe, subscriber isolation (a throwing
 * subscriber must not break the next one), and re-entrancy termination (a
 * subscriber that itself pushes must terminate rather than recurse/hang).
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { logBuffer, type LogEntry } from "../log-buffer";

function entry(message: string, overrides: Partial<Omit<LogEntry, "seq">> = {}): Omit<LogEntry, "seq"> {
  return {
    ts: new Date().toISOString(),
    level: "info",
    message,
    ...overrides,
  };
}

describe("log-buffer", () => {
  beforeEach(() => {
    logBuffer._resetForTesting();
  });

  test("push increases size up to capacity", () => {
    logBuffer.setCapacity(5);
    for (let i = 0; i < 3; i++) logBuffer.push(entry(`m${i}`));
    expect(logBuffer.size()).toBe(3);
  });

  test("eviction at capacity: oldest entries are dropped, newest kept", () => {
    logBuffer.setCapacity(3);
    for (let i = 0; i < 5; i++) logBuffer.push(entry(`m${i}`));
    expect(logBuffer.size()).toBe(3);
    const messages = logBuffer.snapshot().map((e) => e.message);
    // newest-first: m4, m3, m2 (m0, m1 evicted)
    expect(messages).toEqual(["m4", "m3", "m2"]);
  });

  test("seq is monotonic across eviction — never reused or reset", () => {
    logBuffer.setCapacity(3);
    for (let i = 0; i < 5; i++) logBuffer.push(entry(`m${i}`));
    const seqs = logBuffer.snapshot().map((e) => e.seq);
    // newest-first, monotonically decreasing, and the evicted seqs (0, 1)
    // never reappear.
    expect(seqs).toEqual([4, 3, 2]);
  });

  test("setCapacity shrinking an existing buffer evicts down to the new size", () => {
    logBuffer.setCapacity(10);
    for (let i = 0; i < 6; i++) logBuffer.push(entry(`m${i}`));
    expect(logBuffer.size()).toBe(6);
    logBuffer.setCapacity(2);
    expect(logBuffer.size()).toBe(2);
    const messages = logBuffer.snapshot().map((e) => e.message);
    expect(messages).toEqual(["m5", "m4"]);
  });

  describe("snapshot filters", () => {
    beforeEach(() => {
      logBuffer.setCapacity(100);
      logBuffer.push(entry("alpha one", { level: "info" }));
      logBuffer.push(entry("beta two", { level: "warn" }));
      logBuffer.push(entry("gamma three", { level: "error" }));
      logBuffer.push(entry("delta ALPHA again", { level: "info" }));
    });

    test("no opts returns everything newest-first", () => {
      const messages = logBuffer.snapshot().map((e) => e.message);
      expect(messages).toEqual(["delta ALPHA again", "gamma three", "beta two", "alpha one"]);
    });

    test("from/to bound by seq (inclusive)", () => {
      const all = logBuffer.snapshot();
      const betaSeq = all.find((e) => e.message === "beta two")!.seq;
      const gammaSeq = all.find((e) => e.message === "gamma three")!.seq;
      const filtered = logBuffer.snapshot({ from: betaSeq, to: gammaSeq });
      expect(filtered.map((e) => e.message)).toEqual(["gamma three", "beta two"]);
    });

    test("level filters to an exact match", () => {
      const filtered = logBuffer.snapshot({ level: "info" });
      expect(filtered.map((e) => e.message)).toEqual(["delta ALPHA again", "alpha one"]);
    });

    test("q filters by case-insensitive substring on message", () => {
      const filtered = logBuffer.snapshot({ q: "alpha" });
      expect(filtered.map((e) => e.message)).toEqual(["delta ALPHA again", "alpha one"]);
    });

    test("combined level + q filters", () => {
      const filtered = logBuffer.snapshot({ level: "info", q: "delta" });
      expect(filtered.map((e) => e.message)).toEqual(["delta ALPHA again"]);
    });

    test("snapshot never mutates the buffer", () => {
      const before = logBuffer.size();
      const snap = logBuffer.snapshot({ level: "info" });
      snap.pop();
      snap.push({ seq: 999, ts: "x", level: "raw", message: "injected" });
      expect(logBuffer.size()).toBe(before);
      expect(logBuffer.snapshot().some((e) => e.message === "injected")).toBe(false);
    });
  });

  describe("subscribe / unsubscribe", () => {
    test("subscriber receives pushed entries", () => {
      const received: LogEntry[] = [];
      logBuffer.subscribe((e) => received.push(e));
      logBuffer.push(entry("hello"));
      expect(received).toHaveLength(1);
      expect(received[0].message).toBe("hello");
    });

    test("unsubscribe stops delivery", () => {
      const received: LogEntry[] = [];
      const unsubscribe = logBuffer.subscribe((e) => received.push(e));
      logBuffer.push(entry("first"));
      unsubscribe();
      logBuffer.push(entry("second"));
      expect(received).toHaveLength(1);
      expect(received[0].message).toBe("first");
    });

    test("a throwing subscriber does not break delivery to the next one", () => {
      const received: LogEntry[] = [];
      logBuffer.subscribe(() => {
        throw new Error("boom");
      });
      logBuffer.subscribe((e) => received.push(e));
      expect(() => logBuffer.push(entry("resilient"))).not.toThrow();
      expect(received).toHaveLength(1);
      expect(received[0].message).toBe("resilient");
    });

    test("a throwing subscriber does not corrupt subsequent pushes", () => {
      logBuffer.subscribe(() => {
        throw new Error("boom");
      });
      logBuffer.push(entry("one"));
      logBuffer.push(entry("two"));
      expect(logBuffer.size()).toBe(2);
    });
  });

  describe("re-entrancy: a subscriber that itself pushes terminates", () => {
    test("a nested push during dispatch is queued and delivered without recursing or hanging", () => {
      let notifyCount = 0;
      logBuffer.subscribe((e) => {
        notifyCount++;
        if (e.message === "outer") {
          logBuffer.push(entry("inner"));
        }
      });
      expect(() => logBuffer.push(entry("outer"))).not.toThrow();
      // Terminates: exactly two notifications (outer, then the queued inner),
      // and the inner push itself does not push again.
      expect(notifyCount).toBe(2);
      expect(logBuffer.size()).toBe(2);
      expect(logBuffer.snapshot().map((e) => e.message)).toEqual(["inner", "outer"]);
    });

    test("dispatching flag is reset after a nested push, so subsequent normal pushes still work", () => {
      logBuffer.subscribe((e) => {
        if (e.message === "trigger") logBuffer.push(entry("nested"));
      });
      logBuffer.push(entry("trigger"));
      logBuffer.push(entry("after"));
      expect(logBuffer.snapshot().map((e) => e.message)).toEqual(["after", "nested", "trigger"]);
    });
  });

  test("_resetForTesting clears entries, subscribers, and seq", () => {
    logBuffer.setCapacity(10);
    const received: LogEntry[] = [];
    logBuffer.subscribe((e) => received.push(e));
    logBuffer.push(entry("before-reset"));
    logBuffer._resetForTesting();
    expect(logBuffer.size()).toBe(0);
    logBuffer.push(entry("after-reset"));
    // The old subscriber was cleared by reset, so it received nothing more.
    expect(received).toHaveLength(1);
    expect(logBuffer.snapshot()[0].seq).toBe(0);
  });
});
