import { describe, test, expect } from "bun:test";
import { analyzeSpectrum } from "../services/synapse/metacognition/score-spectrum.js";

const CONFIG = {
  enabled: true,
  lowConfidenceThreshold: 0.1,
  definitiveTopScore: 0.8,
  definitiveGap: 0.4,
};

describe("analyzeSpectrum", () => {
  test("disabled returns zeroed flags", () => {
    const out = analyzeSpectrum([0.9, 0.1], 0.3, { ...CONFIG, enabled: false });
    expect(out.lowConfidence).toBe(false);
    expect(out.noStrongMatch).toBe(false);
    expect(out.definitiveMatch).toBe(false);
    expect(out.spread).toBe(0);
  });

  test("empty list returns zeroed flags", () => {
    const out = analyzeSpectrum([], 0.3, CONFIG);
    expect(out.spread).toBe(0);
    expect(out.mean).toBe(0);
    expect(out.confidence).toBe(0);
  });

  test("definitive match: high top, low second", () => {
    const out = analyzeSpectrum([0.95, 0.3, 0.25], 0.3, CONFIG);
    expect(out.definitiveMatch).toBe(true);
    expect(out.lowConfidence).toBe(false);
  });

  test("not definitive when top is high but second is close", () => {
    const out = analyzeSpectrum([0.95, 0.7, 0.6], 0.3, CONFIG);
    expect(out.definitiveMatch).toBe(false);
  });

  test("low confidence when results are clustered low", () => {
    const out = analyzeSpectrum([0.31, 0.32, 0.33], 0.3, CONFIG);
    expect(out.lowConfidence).toBe(true);
  });

  test("noStrongMatch when top is below adaptive threshold", () => {
    const out = analyzeSpectrum([0.2, 0.15, 0.1], 0.4, CONFIG);
    expect(out.noStrongMatch).toBe(true);
  });

  test("normal distribution: no flags raised", () => {
    const out = analyzeSpectrum([0.9, 0.7, 0.5, 0.3], 0.25, CONFIG);
    expect(out.lowConfidence).toBe(false);
    expect(out.noStrongMatch).toBe(false);
    expect(out.definitiveMatch).toBe(false);
    expect(out.spread).toBeCloseTo(0.6, 5);
    expect(out.mean).toBeCloseTo(0.6, 5);
  });
});
