# LESSONS - auto-maintained by skills/massa-ai/scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features | window_days=45 | quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - UNION GUARD missing-suite path has no discriminating test. No test injects a suite into SUITE_TABLE but not into results. Add a mock-drop test asserting exit 1 + UNION GUARD FAIL.
- signal: `surviving_mutant` | recurrence: 1 feature(s) | scope: `test-strength` | harmful: 0 | confidence: 0.62
- features: wave-6-architecture-features
- evidence: scripts/run-tests-parallel.ts:243-257 + scripts/__tests__/run-tests-parallel.test.ts:69-74 (test-strength)
- last seen: 2026-07-22T21:39:38Z

### L-002 - Hook binary tests assert exit 0 only, never POST body/endpoint/count. Removing second pre-compact POST survived. Add capture-server test verifying 2 POSTs to correct endpoints + body shapes.
- signal: `surviving_mutant` | recurrence: 1 feature(s) | scope: `test-strength` | harmful: 0 | confidence: 0.62
- features: wave-6-architecture-features
- evidence: apps/claude-plugin/hooks/massa-ai-hook.ts:219-227 + apps/claude-plugin/hooks/__tests__/massa-ai-hook.test.ts (test-strength)
- last seen: 2026-07-22T21:39:38Z

### L-003 - M25 name-tail resolution has 0 behavior tests. Test only checks method exists. Add tests mocking listWorkspaces asserting unique/ambiguous/not-found paths.
- signal: `ac_gap` | recurrence: 1 feature(s) | scope: `test-coverage` | harmful: 0 | confidence: 0.62
- features: wave-6-architecture-features
- evidence: packages/core/src/__tests__/m25-m26-resolution-serialize.test.ts:101-107 (test-coverage)
- last seen: 2026-07-22T21:39:38Z

### L-004 - N20 crash test assumes architecture-map fails with DATABASE_URL empty but it passes via SQLite fallback. Test gets exit 0, expects non-zero. Rewrite to use genuinely-failing suite or wire unused crashTest variable.
- signal: `gate_fail` | recurrence: 1 feature(s) | scope: `test-design` | harmful: 0 | confidence: 0.62
- features: wave-6-architecture-features
- evidence: scripts/__tests__/run-tests-parallel.test.ts:113 (test-design)
- last seen: 2026-07-22T21:39:38Z

### L-005 - When a unit test bypasses a version-gate threshold via a testing seam (_setJsonSchemaSupportedForTesting), the threshold logic (_checkJsonSchemaSupport minor >= 5) is uncovered. Add direct tests of the version parser with mocked version strings (0.5.0, 0.4.9, 1.0.0, garbage) so threshold regressions are caught.
- signal: `surviving_mutant` | recurrence: 1 feature(s) | scope: `packages/core` | harmful: 0 | confidence: 0.62
- features: wave-7-hygiene-ui-process
- evidence: packages/core/src/__tests__/llm-client-json-schema.test.ts:62-69 (packages/core)
- last seen: 2026-07-22T23:54:13Z

### L-006 - CodeQL PR check treats a flagged pattern on any diff-touched line as a NEW alert, even when the pattern is unchanged and only moved. Security fixes that refactor flagged regex code must expect the gate to re-fire on the branch and must eliminate the pattern class, not just the originally flagged instance.
- signal: `gate_fail` | recurrence: 1 feature(s) | harmful: 0 | confidence: 0.53
- features: security-code-scanning-closeout
- context: project=massa-ai session=security-fix-code-scanning workflow=security-fix entity=code-scanning
- evidence: PR #48 CodeQL check, runs 90715511426/90719305396
- last seen: 2026-07-29T22:26:30Z

### L-007 - A registry-count change (15→17 specialists) shipped green under test:scripts but CI went red: the four plugin install-test rosters + shell installer advisories + config-cli help + README/FEATURES/marketplace copy are covered by test:plugins, which the local spec-driven final gate did not run. When a feature changes a shared cardinality, run test:plugins (or any surface asserting the count) before the local final gate, not after CI.
- signal: `gate_fail` | recurrence: 1 feature(s) | scope: `scripts/__tests__:apps/*/install.test.ts` | harmful: 0 | confidence: 0.62
- features: judge-with-debate
- context: project=massa-ai session=spec-judge-with-debate workflow=spec-driven entity=judge-with-debate
- evidence: PR #50 build/coverage red, repair e190b43 (scripts/__tests__:apps/*/install.test.ts)
- last seen: 2026-07-30T12:25:12Z

### L-008 - Live multi-agent protocol behavior (judge-with-debate meta-judge spec plus 3 judges plus consensus) is user-gated smoke only: no CI sensor can execute a prose workflow, so acceptance rests on charter and workflow file integrity plus discrimination sensors, not runtime evidence.
- signal: `spec_precision_gap` | recurrence: 1 feature(s) | scope: `workflows/judge-with-debate.md:audits/judge` | harmful: 0 | confidence: 0.62
- features: judge-with-debate
- context: project=massa-ai session=spec-judge-with-debate workflow=spec-driven entity=judge-with-debate
- evidence: validation.md Addendum item 6 (workflows/judge-with-debate.md:audits/judge)
- last seen: 2026-07-30T12:26:06Z

### L-009 - An in-process self-updater that fetches and applies code from the network is structurally a downloader, not an update mechanism; prefer printing the update command for the user to run over auto-applying it.
- signal: `spec_deviation` | recurrence: 1 feature(s) | scope: `harness/self-update` | harmful: 0 | confidence: 0.62
- features: cross-pollination-ports
- context: project=massa-ai session=spec-cross-pollination-ports workflow=spec-driven entity=cross-pollination-ports
- evidence: codebase-memory-mcp PR #1316/#1332/#1338 (harness/self-update)
- last seen: 2026-08-03T20:59:30Z

### L-010 - Retiring a compatibility boundary (env-var prefix, config key, feature flag) needs a two-direction test: the new name reaches its target AND the old name has zero effect; a one-direction test still passes if the old path is silently left wired up beside the new one.
- signal: `spec_precision_gap` | recurrence: 1 feature(s) | scope: `spec-precision/compat-boundary` | harmful: 0 | confidence: 0.62
- features: cross-pollination-ports
- context: project=massa-ai session=spec-cross-pollination-ports workflow=spec-driven entity=cross-pollination-ports
- evidence: packages/shared/src/config/__tests__/llm-env-prefix.test.ts (spec-precision/compat-boundary)
- last seen: 2026-08-03T20:59:38Z

### L-011 - CI's Bun install-cache race was mitigated only reactively (purge-and-retry on failure); warm the package-manager cache with actions/cache keyed on the lockfile hash instead, and keep the purge as a fallback rather than the sole mitigation.
- signal: `gate_fail` | recurrence: 1 feature(s) | scope: `ci/install-cache` | harmful: 0 | confidence: 0.62
- features: cross-pollination-ports
- context: project=massa-ai session=spec-cross-pollination-ports workflow=spec-driven entity=cross-pollination-ports
- evidence: .github/workflows/ci.yml:75 (ci/install-cache)
- last seen: 2026-08-03T20:59:43Z

### L-012 - Two CI workflows' test venues diverging silently isolates coverage: a gated suite that skips in the blocking workflow's venue but runs in a non-blocking one lets the required check report green while that suite never actually executed there; assert venue parity between workflows, not just presence in one.
- signal: `gate_fail` | recurrence: 1 feature(s) | scope: `ci/venue-parity` | harmful: 0 | confidence: 0.62
- features: cross-pollination-ports
- context: project=massa-ai session=spec-cross-pollination-ports workflow=spec-driven entity=cross-pollination-ports
- evidence: .github/workflows/ci.yml + coverage.yml RUN_POSTGRES_TESTS divergence (ci/venue-parity)
- last seen: 2026-08-03T21:00:06Z

### L-013 - A type-enforced sanitization boundary at a persistence insert seam needs to exist before the first real payload reaches it; retrofitting it after live data has accumulated leaves every pre-fix row permanently unsanitized, since sanitization is write-time only and does not retroactively touch existing rows.
- signal: `ac_gap` | recurrence: 1 feature(s) | scope: `core/security-boundary` | harmful: 0 | confidence: 0.62
- features: cross-pollination-ports
- context: project=massa-ai session=spec-cross-pollination-ports workflow=spec-driven entity=cross-pollination-ports
- evidence: packages/core/src/services/hooks/hook-service.ts:246 (core/security-boundary)
- last seen: 2026-08-03T21:00:12Z

### L-014 - A design doc that pre-assigns a decision-record ID (AD-NNN 'to append at Execute') goes stale if other features land AD entries before the deferred append runs; re-derive the next ID at append time, never trust the pre-assigned number.
- signal: `spec_deviation` | recurrence: 1 feature(s) | scope: `.specs/project/STATE.md` | harmful: 0 | confidence: 0.62
- features: cross-pollination-ports
- context: project=massa-ai session=spec-cross-pollination-ports workflow=spec-driven entity=cross-pollination-ports
- evidence: .specs/features/cross-pollination-ports/design.md:107 (.specs/project/STATE.md)
- last seen: 2026-08-03T21:30:48Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
