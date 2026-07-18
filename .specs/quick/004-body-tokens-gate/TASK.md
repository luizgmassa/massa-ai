# M13 — Skip Signature Computation for Empty Bodies Before Dedup

Intent: in structural definition extraction, `structuralSignature` is computed
for EVERY draft (including zero/empty bodies) BEFORE the dedup gate filters
duplicates — wasted work. Short-circuit the signature COMPUTATION for empty
bodies. cbm ref (b9797ec, extract_defs.c:134) — the lesson is ordering: don't
compute a fingerprint/signature for an empty body.

## Scope

- File: `packages/core/src/services/structural/query-pack.ts`,
  `structuralSignature` (~lines 299-318).
- Only the COMPUTATION is short-circuited. The dedup KEY
  (`${kind}\0${qualifiedName}\0${span.startByte}\0${span.endByte}`, lines
  ~531-539) is NOT touched — changing the key would split currently-collapsed
  same-name/span symbols and alter observable dedup output.

## Acceptance

- When the sliceable signature region is empty (`endByte <= owner.startIndex`
  AND `valuePrefix === ""`), `structuralSignature` returns `""` WITHOUT
  running the `subarray` + `trim` + two regex replaces. This is byte-identical
  to the fall-through for that case (empty input to the trim/regex chain also
  yields `""`).
- Non-empty bodies keep their exact prior signature (regression guard).
- The dedup key string is unchanged.
- `structural-etl.test.ts` and `structural-query-pack.test.ts` stay GREEN with
  identical pass counts (behavior-preserving proof).
- New focused test asserts a non-empty-bodied symbol yields its verbatim
  signature (guard must not over-fire).

## Out of scope (explicit)

- Changing the dedup key to include body length/tokens: explicitly forbidden —
  would alter dedup behavior.
- Refactoring `signatureOwner` / `signatureMaterial`: unchanged.
- Exporting `structuralSignature` for direct unit testing: it stays private;
  the guard is exercised via the public `normalizeQueryCaptures` /
  `parseTypeScriptWithCapabilities` path.

## Residual risk

- Low. The guard is a pure dead-work elimination for an empty sliceable region;
  the early return value is provably equal to the original fall-through output
  for that region. Real ASTs rarely produce a zero-length region, so the guard
  is mostly a no-op in practice — but it is correct and free.
