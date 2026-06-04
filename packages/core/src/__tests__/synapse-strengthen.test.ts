import { describe, test, expect } from "bun:test";
import {
  computeStrengthenUpdates,
  DEFAULT_STRENGTHEN_CONFIG,
} from "../services/synapse/plasticity/strengthen.js";

describe("computeStrengthenUpdates", () => {
  test("disabled returns no updates", () => {
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 0.5, accessCount: 100, recentAccessCount: 50, edgeCount: 10 }],
      { ...DEFAULT_STRENGTHEN_CONFIG, enabled: false },
    );
    expect(out).toEqual([]);
  });

  test("frequent access at exact threshold yields full boost (IMP-13 ramp)", () => {
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 0.5, accessCount: 100, recentAccessCount: 3, edgeCount: 0 }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].delta).toBeCloseTo(0.05, 5);
  });

  test("frequent access above threshold saturates with diminishing returns", () => {
    // ratio=5/3≈1.67 → over=min(0.67,1)=0.67 → boost = 0.05 * (1 + 0.5*0.67) ≈ 0.067
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 0.5, accessCount: 100, recentAccessCount: 5, edgeCount: 0 }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].delta).toBeGreaterThan(0.05);
    expect(out[0].delta).toBeLessThanOrEqual(0.075);
  });

  test("frequent access below 50% threshold yields zero (IMP-13 ramp floor)", () => {
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 0.5, accessCount: 100, recentAccessCount: 1, edgeCount: 0 }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toEqual([]); // 1/3 < 0.5 → no boost
  });

  test("graph edges at exact threshold yield full boost", () => {
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 0.5, accessCount: 100, recentAccessCount: 0, edgeCount: 3 }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].delta).toBeCloseTo(0.03, 5);
  });

  test("graph edges above threshold give saturating boost", () => {
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 0.5, accessCount: 100, recentAccessCount: 0, edgeCount: 5 }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].delta).toBeGreaterThan(0.03);
    expect(out[0].delta).toBeLessThanOrEqual(0.045);
  });

  test("decision-referenced yields +0.08", () => {
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 0.5, accessCount: 100, recentAccessCount: 0, edgeCount: 0, referencedByDecision: true }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].delta).toBeCloseTo(0.08, 5);
  });

  test("multiple signals stack but are capped by maxDelta", () => {
    const out = computeStrengthenUpdates(
      [{
        id: "a",
        importance: 0.5,
        accessCount: 100,
        recentAccessCount: 10,
        edgeCount: 10,
        referencedByDecision: true,
      }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].delta).toBeLessThanOrEqual(DEFAULT_STRENGTHEN_CONFIG.maxDelta);
  });

  test("importance is capped at importanceCap", () => {
    const out = computeStrengthenUpdates(
      [{
        id: "a",
        importance: 0.95,
        accessCount: 100,
        recentAccessCount: 10,
        edgeCount: 10,
      }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out[0].newImportance).toBeCloseTo(1.0, 5);
  });

  test("no update produced when delta would be zero", () => {
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 0.5, accessCount: 100, recentAccessCount: 0, edgeCount: 0 }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toEqual([]);
  });

  test("no update produced when memory is already at cap", () => {
    const out = computeStrengthenUpdates(
      [{ id: "a", importance: 1.0, accessCount: 100, recentAccessCount: 10, edgeCount: 10 }],
      DEFAULT_STRENGTHEN_CONFIG,
    );
    expect(out).toEqual([]);
  });
});
