/**
 * Unit tests for the pure decay function (Phase 1, P1-DECAY).
 *
 * Property tests mirror ai-memory decay.rs: monotonic non-increase in Δt,
 * pinned exemption, bounded [0,1], recency boosts the access term, and
 * sub-threshold memories are flagged cold. Pure — no DB, no network.
 */

import { describe, test, expect } from "bun:test";
import {
  decayScore,
  isCold,
  DEFAULT_DECAY_PARAMS,
  type DecayMemory,
} from "../services/memory/decay.js";

const NOW = new Date("2026-07-02T00:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function mk(over: Partial<DecayMemory> = {}): DecayMemory {
  return {
    importance: 0.8,
    accessCount: 0,
    createdAt: NOW - 10 * DAY,
    lastAccessed: NOW - 10 * DAY,
    ...over,
  };
}

describe("decayScore — formula", () => {
  test("matches salience·exp(-λΔt) + σ·log(1+access)·exp(-μΔt_access)", () => {
    // Pick inputs that stay below the [0,1] clamp so the raw formula is
    // observable: modest salience, small access, non-trivial age.
    const mem = mk({ importance: 0.5, accessCount: 2 });
    const p = DEFAULT_DECAY_PARAMS;
    const deltaDays = 10;
    const expected =
      0.5 * Math.exp(-p.lambda * deltaDays) +
      p.sigma * Math.log1p(2) * Math.exp(-p.mu * deltaDays);
    // Sanity: expected is in (0,1) so clamping is a no-op.
    expect(expected).toBeLessThan(1);
    expect(expected).toBeGreaterThan(0);
    expect(decayScore(mem, p, NOW)).toBeCloseTo(expected, 6);
  });

  test("uses lastAccessed (not createdAt) for Δt when present", () => {
    const mem = mk({ createdAt: NOW - 30 * DAY, lastAccessed: NOW - 1 * DAY });
    const p = DEFAULT_DECAY_PARAMS;
    const expected =
      mem.importance * Math.exp(-p.lambda * 1) +
      p.sigma * Math.log1p(0) * Math.exp(-p.mu * 1);
    expect(decayScore(mem, p, NOW)).toBeCloseTo(expected, 6);
  });

  test("falls back to createdAt when lastAccessed is null/undefined", () => {
    const a = decayScore(mk({ lastAccessed: null }), DEFAULT_DECAY_PARAMS, NOW);
    const b = decayScore(
      mk({ lastAccessed: undefined }),
      DEFAULT_DECAY_PARAMS,
      NOW,
    );
    expect(a).toBeCloseTo(
      decayScore(mk({ lastAccessed: NOW - 10 * DAY }), DEFAULT_DECAY_PARAMS, NOW),
      6,
    );
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("decayScore — monotonic non-increasing in Δt", () => {
  test("score does not increase as the memory ages (access fixed)", () => {
    let prev = Infinity;
    for (let days = 0; days <= 200; days += 10) {
      const mem = mk({ createdAt: NOW - days * DAY, lastAccessed: NOW - days * DAY });
      const s = decayScore(mem, DEFAULT_DECAY_PARAMS, NOW);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });

  test("score does not increase as lastAccessed recedes (createdAt fixed)", () => {
    const createdAt = NOW - 5 * DAY;
    let prev = Infinity;
    for (let back = 0; back <= 50; back += 5) {
      const mem = mk({ createdAt, lastAccessed: NOW - back * DAY, accessCount: 2 });
      const s = decayScore(mem, DEFAULT_DECAY_PARAMS, NOW);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });
});

describe("decayScore — bounded [0,1]", () => {
  test("never below 0 or above 1 across extreme inputs", () => {
    const cases: DecayMemory[] = [
      mk({ importance: 0 }),
      mk({ importance: 1 }),
      mk({ importance: 1, accessCount: 1_000_000 }),
      mk({ importance: 0.5, createdAt: NOW - 10_000 * DAY, lastAccessed: NOW - 10_000 * DAY }),
      mk({ importance: -5 }), // garbage → clamped
      mk({ importance: Number.POSITIVE_INFINITY, accessCount: Number.POSITIVE_INFINITY }),
    ];
    for (const c of cases) {
      const s = decayScore(c, DEFAULT_DECAY_PARAMS, NOW);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  test("importance=0 yields 0 (access term alone can still contribute when accessed)", () => {
    // salience 0 → salience term 0; access term with accessCount=0 is 0.
    expect(decayScore(mk({ importance: 0, accessCount: 0 }), DEFAULT_DECAY_PARAMS, NOW)).toBe(0);
  });
});

describe("decayScore — pinned exemption", () => {
  test("pinned=1 returns importance unchanged regardless of age", () => {
    const mem = mk({ importance: 0.77, pinned: 1, createdAt: NOW - 365 * DAY });
    expect(decayScore(mem, DEFAULT_DECAY_PARAMS, NOW)).toBe(0.77);
  });

  test("pinned=true (boolean) also exempt", () => {
    const mem = mk({ importance: 0.42, pinned: true, createdAt: NOW - 365 * DAY });
    expect(decayScore(mem, DEFAULT_DECAY_PARAMS, NOW)).toBe(0.42);
  });

  test("pinned=0 decays normally (not exempt)", () => {
    const pinned0 = decayScore(mk({ importance: 0.8, pinned: 0, createdAt: NOW, lastAccessed: NOW }), DEFAULT_DECAY_PARAMS, NOW);
    const unpinned = decayScore(mk({ importance: 0.8, createdAt: NOW, lastAccessed: NOW }), DEFAULT_DECAY_PARAMS, NOW);
    expect(pinned0).toBeCloseTo(unpinned, 6);
  });
});

describe("decayScore — recency boosts access term", () => {
  test("higher accessCount (same recency) does not decrease the score", () => {
    const base = mk({ importance: 0.5, createdAt: NOW - 5 * DAY, lastAccessed: NOW - 1 * DAY });
    const s0 = decayScore({ ...base, accessCount: 0 }, DEFAULT_DECAY_PARAMS, NOW);
    const s5 = decayScore({ ...base, accessCount: 5 }, DEFAULT_DECAY_PARAMS, NOW);
    const s50 = decayScore({ ...base, accessCount: 50 }, DEFAULT_DECAY_PARAMS, NOW);
    expect(s5).toBeGreaterThanOrEqual(s0);
    expect(s50).toBeGreaterThanOrEqual(s5);
  });
});

describe("isCold — prune candidacy", () => {
  test("sub-threshold memory flagged cold", () => {
    // 0.2 importance, very old, never accessed → well below 0.2 threshold.
    const cold = mk({
      importance: 0.2,
      accessCount: 0,
      createdAt: NOW - 300 * DAY,
      lastAccessed: NOW - 300 * DAY,
    });
    expect(isCold(cold, DEFAULT_DECAY_PARAMS, NOW)).toBe(true);
  });

  test("fresh high-salience memory is not cold", () => {
    const fresh = mk({ importance: 0.9, createdAt: NOW, lastAccessed: NOW });
    expect(isCold(fresh, DEFAULT_DECAY_PARAMS, NOW)).toBe(false);
  });

  test("pinned memory is never cold even if it would otherwise be", () => {
    const pinnedCold = mk({
      importance: 0.05,
      pinned: 1,
      createdAt: NOW - 1000 * DAY,
      lastAccessed: NOW - 1000 * DAY,
    });
    expect(isCold(pinnedCold, DEFAULT_DECAY_PARAMS, NOW)).toBe(false);
  });
});
