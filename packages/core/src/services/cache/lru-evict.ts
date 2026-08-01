/**
 * Shared insertion-order eviction for the LRU-bounded `Map`s PR-D unifies (RFS-02 AC-2).
 *
 * WHY A FUNCTION AND NOT A CACHE CLASS.
 * The five caches this serves agree on eviction ORDER and disagree on everything else: cap
 * (512 at four sites, 50 at `file-filter-cache`), TTL (enforced at `read_file`'s `fileCache`
 * only) and read-promotion (absent at `file-filter-cache`). A shared cache class would impose
 * one policy on all five, and that IS the behavior change `spec.md` §3.B measured the eviction
 * itself is not. RFS-02 AC-2 therefore fixes this as an eviction function; every site keeps its
 * own cap, its own TTL and its own promotion policy.
 *
 * WHY THE SECOND PARAMETER IS A POST-CALL BOUND AND NOT "the cap".
 * `design.md` §5.1 specifies only "a function taking `(cache, cap)`", and that phrasing does
 * not determine the predicate, because the five sites do not share one:
 *
 *   read_file.ts   · fileCache         pre-insert   while (size >= 512)
 *   read_file.ts   · projectRootCache  pre-insert   while (size >= 512)
 *   symbol-graph.service.ts            pre-insert   while (size >= 512)
 *   web-controller.ts                  post-insert  while (size >  512)
 *   file-filter-cache.ts               post-insert  if   (size >  50) evict-one
 *
 * `spec.md` §3.B establishes that pre-insert `>=` and post-insert `>` retain the same number.
 * They do — but only while each site keeps BOTH its operator and its call position. Collapsing
 * them onto one operator with every site passing its own literal cap moves the retained count,
 * and it moves in opposite directions depending on which operator wins. Measured against T1's
 * characterization oracle (`tasks.md` §10.7): a shared `>` breaks the three pre-insert sites, a
 * shared `>=` breaks the two post-insert ones.
 *
 * Stating the contract as a POST-CALL BOUND is what lets one function serve both call
 * positions without moving any retained count, because `size > cap - 1` and `size >= cap` are
 * the same predicate over integers:
 *
 *   pre-insert   caller passes `CAP - 1`  — reserves the slot the pending insert will take
 *   post-insert  caller passes `CAP`      — the insert already happened
 *
 * WHAT THIS MODULE DOES NOT CERTIFY, on RFS-01 AC-6's precedent of naming blind spots.
 * It evicts in `Map` insertion order and knows nothing about TTL, read-promotion, or whether a
 * caller's insertion order matches that caller's own notion of "oldest". `file-filter-cache`
 * evicts by `min(createdAt)` today and coincides with insertion order only because it never
 * re-inserts an entry on a read — an invariant unstated in that file, guarded by T1's
 * characterization suite (mutation M5b) and by nothing here. A future read-promotion added
 * there would silently defeat the shared eviction and no structural gate could see it.
 *
 * WHY IT IMPORTS NOTHING, AND WHY THAT IS ASSERTED IN A TEST RATHER THAN BY CI.
 * `spec.md` RFS-02 AC-3 originally placed this in `kernel/`, where `check-core-layering`'s
 * leaf-ness clause would have enforced import-freedom. C30 (`design.md` §5.2) moved it to
 * `services/cache/` because `kernel/`'s admission rule is "serves >= 2 tiers" and 11 of 11
 * shipped members keep it, while this module serves `services/` alone after Phase 3. Nothing
 * in CI now prevents this file from growing a dependency. That is a real loss of enforcement
 * (R-29), recorded rather than glossed, and the replacement is the AST assertion in this
 * module's own unit test.
 */

/**
 * Evict oldest-first from `cache` until `cache.size <= maxRetained`.
 *
 * @param cache        any `Map`; eviction order is the Map's own insertion order, so a caller
 *                     that promotes on read (delete + re-set) gets LRU and one that does not
 *                     gets FIFO. That choice stays with the caller.
 * @param maxRetained  the number of entries that may remain when this returns. Pre-insert
 *                     callers pass `CAP - 1`; post-insert callers pass `CAP`.
 */
export function evictOldest<K, V>(cache: Map<K, V>, maxRetained: number): void {
  while (cache.size > maxRetained) {
    const oldest = cache.keys().next().value;
    // Defensive and unreachable for any `maxRetained >= 0`: the loop condition forces
    // `cache.size >= 1`, so `keys().next()` always yields an entry. Kept because all four
    // original sites carry it, and dropping it inside a behavior-preserving PR would be an
    // unprovable change. It is NOT here for the 90% line-coverage floor — that gate parses
    // `DA:` records only (`scripts/check-coverage.ts:318`), never `BRDA:`, so this line counts
    // as covered the moment it is evaluated, whichever way the branch goes.
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
