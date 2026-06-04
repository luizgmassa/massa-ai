/**
 * Score Spectrum — metacognition over a result set.
 *
 * Computes spread/mean/confidence and surfaces flags that let callers know
 * when the retrieval itself is unsure. "I know that I don't know" is more
 * useful than ten weak results pretending to be answers.
 */

import type { SpectrumFlags } from "../types.js";

export interface ScoreSpectrumConfig {
  enabled: boolean;
  lowConfidenceThreshold: number; // confidence below this -> lowConfidence flag
  definitiveTopScore: number;     // top score above this triggers definitiveMatch check
  definitiveGap: number;          // second score must be below (top - gap) for definitiveMatch
}

const EMPTY_FLAGS: SpectrumFlags = {
  lowConfidence: false,
  noStrongMatch: false,
  definitiveMatch: false,
  spread: 0,
  mean: 0,
  confidence: 0,
};

/**
 * Analyze the distribution of scores in a result set.
 * Pure function — no side effects, no mutations.
 *
 * IMP-12: the three flags are made *mutually exclusive* and prioritized:
 *   1. definitiveMatch — a clear winner exists (top high, second far below)
 *   2. noStrongMatch   — nothing crosses the relevance threshold
 *   3. lowConfidence   — results exist but the distribution is flat
 *
 * A single result with `top >= definitiveTopScore` is treated as definitive,
 * not as low-confidence (spread=0 was previously firing lowConfidence even
 * for a perfect single hit).
 */
export function analyzeSpectrum(
  scores: number[],
  thresholdForNoMatch: number,
  config: ScoreSpectrumConfig,
): SpectrumFlags {
  if (!config.enabled || scores.length === 0) {
    return { ...EMPTY_FLAGS };
  }

  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let top = -Infinity;
  let second = -Infinity;
  for (const s of scores) {
    if (s > max) max = s;
    if (s < min) min = s;
    sum += s;
    if (s >= top) { second = top; top = s; }
    else if (s > second) { second = s; }
  }
  if (second === -Infinity) second = 0;
  const mean = sum / scores.length;
  const spread = max - min;
  const confidence = spread * mean;

  const definitiveMatch =
    top >= config.definitiveTopScore && top - second >= config.definitiveGap;
  const noStrongMatch = !definitiveMatch && top < thresholdForNoMatch;
  // lowConfidence only fires when neither of the above already classified.
  const lowConfidence =
    !definitiveMatch && !noStrongMatch && confidence < config.lowConfidenceThreshold;

  return {
    lowConfidence,
    noStrongMatch,
    definitiveMatch,
    spread,
    mean,
    confidence,
  };
}
