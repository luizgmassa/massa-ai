/**
 * Shared RSS-delta measurement idiom for native-heavy subsystem tests
 * (cycle-detection, structural-runtime). Test-only — not exported from the
 * package (`packages/core/src/index.ts` does not reference this module).
 *
 * `rssNow` standardizes on `process.memoryUsage.rss()` (the cheaper
 * accessor) rather than `process.memoryUsage().rss` — same value, no
 * allocation of the full memory-usage object.
 */

export function rssNow(): number {
  return process.memoryUsage.rss();
}

/**
 * Forces a GC pass (when exposed), measures baseline RSS, runs `fn`,
 * measures RSS again, and returns the delta in bytes (after − baseline).
 */
export function rssDeltaOver(fn: () => void): number {
  if (typeof globalThis.gc === "function") globalThis.gc();
  const baseline = rssNow();
  fn();
  const after = rssNow();
  return after - baseline;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}
