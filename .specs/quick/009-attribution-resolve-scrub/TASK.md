# Quick 009 — Scrub, don't drop, the error message in AttributionResolver.resolve()'s fail-open warn

## Goal
Convert the last hand-rolled "(sanitized)" log site to `safeErrorSummary`. The
`safeErrorSummary` adoption (kernel/sanitize/safe-error-summary.ts) replaced two
sites that dropped error messages instead of scrubbing them
(`kernel/alias-resolver.ts`, `PgWorkspaceRootProvider.listRoots`). A third site
with the same defect shape remained: `AttributionResolver.resolve()`'s own
fail-open catch (`services/hooks/attribution-resolver.ts`) logged only
`{name}` and appended "(sanitized)" to the literal, throwing away the debugging
signal the message might have safely carried.

## Scope
- `packages/core/src/services/hooks/attribution-resolver.ts` — resolve() catch:
  replace hand-rolled `{name}` meta with `safeErrorSummary(error)`; drop the
  "(sanitized)" suffix from the literal (matches the alias-resolver shape).
- `packages/core/src/__tests__/attribution-resolver.test.ts` — HAR-09 warn test
  updated to the new contract (message present, scrubbed; no cwd/caller/SQL
  leak) + a new discriminating test: credential in the message is redacted
  (`[REDACTED:bearer]`) while the safe residue is retained.

## Non-goals
- No behavior change to fail-open semantics (still returns verbatim, never throws).
- No change to safeErrorSummary itself or the other converted sites.

## Gate
- Red first: both tests observed failing against the old code with received meta
  `{"name":"Error"}` (message dropped).
- `bun test packages/core/src/__tests__/attribution-resolver.test.ts` →
  37 pass / 0 fail / 3 skip (PG-gated), exit 0.
- `bun run lint` → exit 0.
- Sweep: no other test or source asserts the old literal
  ("using caller id (sanitized)") — `git grep` returned zero sites.
