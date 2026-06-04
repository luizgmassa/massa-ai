/**
 * IR metrics — pure functions used by the relevance-style tests.
 *
 * Mirrors the metric definitions in scripts/synapse-bench-analyze-v2.py so
 * unit-test expectations and production benchmarks speak the same language.
 */

export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (k <= 0) return NaN;
  const head = retrieved.slice(0, k);
  let hits = 0;
  for (const id of head) if (relevant.has(id)) hits++;
  return hits / k;
}

export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return NaN;
  const head = new Set(retrieved.slice(0, k));
  let hits = 0;
  for (const r of relevant) if (head.has(r)) hits++;
  return hits / relevant.size;
}

export function mrrAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  const limit = Math.min(retrieved.length, k);
  for (let i = 0; i < limit; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

export function ndcgAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return NaN;
  let dcg = 0;
  const limit = Math.min(retrieved.length, k);
  for (let i = 0; i < limit; i++) {
    if (relevant.has(retrieved[i])) dcg += 1 / Math.log2(i + 2);
  }
  const idealHits = Math.min(relevant.size, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  const union = new Set([...sa, ...sb]).size;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return union === 0 ? 0 : inter / union;
}
