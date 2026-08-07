# Quick 009 — Summary

**Result**: Done. `AttributionResolver.resolve()`'s fail-open catch now logs
`safeErrorSummary(error)` — credential-scrubbed `{name, message}` — instead of
dropping the message and hand-rolling a "(sanitized)" suffix.

- Red-first evidence: new/updated tests failed against old code with meta
  `{"name":"Error"}` (message absent), then passed after the one-call fix.
- Test file: 37 pass / 0 fail / 3 skip (RUN_POSTGRES_TESTS-gated), exit 0.
- Existing HAR-09 leak assertions retained: warn still never carries cwd,
  caller id, or SQL.
- CHANGELOG: `### Fixed` entry under `[Unreleased]` (patch bump).
