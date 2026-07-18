# M13 — Summary

## Change

`packages/core/src/services/structural/query-pack.ts`, `structuralSignature`:
added a behavior-identical short-circuit. After `endByte` and `valuePrefix` are
resolved exactly as before, if the sliceable region is empty
(`endByte <= owner.startIndex && valuePrefix === ""`) the function returns `""`
immediately, skipping the `subarray` + `trim` + two regex replaces.

For that empty case the original fall-through produced:
`"".trim().replace(...).replace(...)` = `""` — so the early return is
byte-identical output. Only the wasted fingerprint work is eliminated.

## Why guard on the empty REGION, not on `!body`

The first attempt guarded on `!body` (absent body field). That was WRONG: a
`type_alias_declaration` (`type ShapeAlias = {…}`) has a `value` field but no
`body`, and the existing test
(`structural-query-pack.test.ts:324`) expects a full non-empty signature built
from `value.startIndex`. Guarding on `!body` would have changed observable
output for every value-bodied declaration. The correct signal for "nothing to
sign" is an empty sliceable region, which is what the committed guard checks.

## Dedup key

Untouched. `query-pack.ts:531-539` still keys on
`${kind}\0${qualifiedName}\0${span.startByte}\0${span.endByte}` — no body
component, so dedup output is unchanged.

## Gate evidence

- `bun test src/__tests__/structural-etl.test.ts` → 14 pass / 0 fail / 104
  expect() calls (unchanged vs baseline).
- `bun test src/__tests__/structural-query-pack.test.ts` → 36 pass / 0 fail /
  365 expect() calls (was 35 + 1 new regression test).
- All 7 structural suites → 150 pass / 0 fail / 989 expect() calls.
- `bunx tsc --noEmit` → exit 0.

## Test added

`structural-query-pack.test.ts` — "short-circuits empty-body signatures
without altering non-empty ones (M13)": parses
`function real(value: string): { ok: boolean } { return { ok: true }; }` and
asserts the non-empty body signature is preserved verbatim
(`function real(value: string): { ok: boolean }`), proving the guard does not
over-fire on real bodies.

## Residual risk

Low. The guard is a no-op for real ASTs in practice (zero-length sliceable
regions are rare), but it is provably behavior-identical and free. The honest
note: this is dead-work elimination more than a measurable hot-path win — the
slice itself is cheap; the main avoided cost is the two regex passes on empty
strings.
