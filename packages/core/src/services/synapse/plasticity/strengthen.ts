/**
 * Strengthen — neuroplasticity for memory importance.
 *
 * Pure analysis function. Computes the *delta* that should be added to a
 * memory's importance based on usage signals over a window. The caller
 * (typically MemoryConsolidationJob) applies the deltas via the DB layer;
 * Synapse never writes directly.
 *
 * Signals (configurable):
 *   - frequentAccessBoost: bonus when access_count in the last window ≥ threshold
 *   - graphEdgeBoost:      bonus per edge above an edge-count threshold
 *   - referencedByDecision: bonus when this memory is referenced by a decision
 *
 * Cap: per-cycle delta is clamped to `maxDelta` to prevent runaway inflation
 * from automated query loops.
 */

export interface MemoryUsageStats {
  id: string;
  importance: number;
  accessCount: number;
  /** Access count over the last evaluation window (e.g., 24h). */
  recentAccessCount: number;
  /** Number of outgoing MemoryEdges from this memory. */
  edgeCount: number;
  /** True if any decision-type memory references this one. */
  referencedByDecision?: boolean;
}

export interface StrengthenConfig {
  enabled: boolean;
  recentAccessThreshold: number;
  frequentAccessBoost: number;
  edgeCountThreshold: number;
  graphEdgeBoost: number;
  decisionReferenceBoost: number;
  maxDelta: number;
  importanceCap: number;
}

export interface StrengthenUpdate {
  id: string;
  delta: number;
  newImportance: number;
}

/**
 * Smooth sigmoid-style ramp instead of a binary threshold.
 *
 * IMP-13: the old behavior was a cliff — recentAccessCount=2 gave 0 boost,
 * 3 gave the full boost. That creates artificial discontinuities where one
 * extra access tips a memory over the line. The ramp returns 0 below 50%
 * of the threshold, smoothly grows to `boost` at the threshold, and
 * saturates softly above (diminishing returns up to 1.5× boost).
 */
function rampedBoost(value: number, threshold: number, boost: number): number {
  if (threshold <= 0 || value <= 0) return 0;
  const ratio = value / threshold;
  if (ratio < 0.5) return 0;
  if (ratio <= 1) return boost * (ratio - 0.5) * 2; // linear 0..boost
  // Saturating: diminishing returns above threshold, capped at 1.5× boost.
  const over = Math.min(ratio - 1, 1);
  return boost * (1 + 0.5 * over);
}

export function computeStrengthenUpdates(
  stats: MemoryUsageStats[],
  config: StrengthenConfig,
): StrengthenUpdate[] {
  if (!config.enabled || stats.length === 0) return [];
  const updates: StrengthenUpdate[] = [];

  for (const s of stats) {
    let delta = 0;
    delta += rampedBoost(
      s.recentAccessCount,
      config.recentAccessThreshold,
      config.frequentAccessBoost,
    );
    delta += rampedBoost(
      s.edgeCount,
      config.edgeCountThreshold,
      config.graphEdgeBoost,
    );
    if (s.referencedByDecision) {
      delta += config.decisionReferenceBoost;
    }
    if (delta <= 0) continue;
    const capped = Math.min(delta, config.maxDelta);
    const newImportance = Math.min(config.importanceCap, s.importance + capped);
    if (newImportance > s.importance) {
      updates.push({ id: s.id, delta: newImportance - s.importance, newImportance });
    }
  }
  return updates;
}

export const DEFAULT_STRENGTHEN_CONFIG: StrengthenConfig = {
  enabled: true,
  recentAccessThreshold: 3,
  frequentAccessBoost: 0.05,
  edgeCountThreshold: 3,
  graphEdgeBoost: 0.03,
  decisionReferenceBoost: 0.08,
  maxDelta: 0.1,
  importanceCap: 1.0,
};
