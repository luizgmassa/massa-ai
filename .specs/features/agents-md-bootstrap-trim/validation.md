# AGENTS.md Bootstrap Trim Validation

**Date**: 2026-09-24
**Spec**: `.specs/features/agents-md-bootstrap-trim/spec.md`
**Diff range**: `origin/main..HEAD` (base `4455f80d`, v1.63.1)
**Verifier**: independent `code-reviewer` sub-agent in `verify` mode (author ≠ verifier), after a
separate `code-reviewer` `audit`/`diff` pass whose 2 blocking + 19 advisory findings were fixed
or answered first (commits `48192104`, `0796a30a`, `e1bec46b`).
**Fix-loop iteration**: 1 of 3.

## Acceptance Criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC1 | PASS | Spec grep over `skills/AGENTS.md` returns nothing; remaining rule spans are the six at `skills/AGENTS.md:13`–`skills/AGENTS.md:184`. |
| AC2 | PASS | Six ids at `packages/shared/src/bootstrap/rules.ts:35`; `RETIRED_RULE_IDS` at `packages/shared/src/bootstrap/rules.ts:51`; "was retired" message at `packages/shared/src/bootstrap/rules.ts:174`. Sensors: `packages/shared/src/bootstrap/__tests__/rules.test.ts:57`, `packages/shared/src/bootstrap/__tests__/state.test.ts:155`, `packages/shared/src/bootstrap/__tests__/engine.test.ts:629`, `scripts/__tests__/profile-cli-parity.test.ts:271`, and both `config-cli-bootstrap.test.ts` suites (28/0 each). |
| AC3 | PASS | Spec grep over `skills/` returns nothing; the gate is self-contained at `skills/massa-ai/SKILL.md:147`. |
| AC4 | PASS | Example line `skills/AGENTS.md:90`, rule `skills/AGENTS.md:102`; sensor `scripts/__tests__/workflow-harness-contract.test.ts:958`. |
| AC5 | PASS | `bun run lint` 0; `generate:artifacts --check` no drift; shared 996/0; `test:scripts` TS 2188/0 across 95 files and 41/41 shell suites; `test:plugins` 183/0 (rerun at load 5.5 — the first run's 7 reds were 5 s/30 s timeouts at load 28). |
| AC6 | PASS (amended, D7 resolution) | Spec grep returns nothing; no `hook-enforcement.md` tracked or on disk. Surviving contracts sensed at `scripts/__tests__/validate-repository.test.ts:390`. |
| AC7 | PASS | Only `skills/massa-ai/references/codebase-investigation.md:38` carries the numbered order; `skills/massa-ai/references/mcp-tools.md:151` and `skills/massa-ai/references/spec-driven/code-analysis.md:10` point to it. Sensor `scripts/__tests__/validate-repository.test.ts:358` (found a fourth copy in `spec-driven/tasks.md`, repointed). |

## Discrimination Sensor

Every mutant was backed up to `/tmp` and restored with `cp` (never git); final
`git status --short` matched the pre-mutation baseline.

| Mutant | Killed by |
|---|---|
| drop `caveman` from `RETIRED_RULE_IDS` (source) | shared `rules`/`state`/`engine` tests |
| same, in `packages/shared/dist` | `profile-cli-parity.test.ts` |
| drop `design` from the SKILL.md Full bullet | `workflow-harness-contract.test.ts` |
| delete the `design.md` gate sentence | `workflow-harness-contract.test.ts` |
| delete the AGENTS.md model/effort rule | `workflow-harness-contract.test.ts` |
| drop model/effort from the AGENTS.md example | `workflow-harness-contract.test.ts` |
| revert `lessons.md` to "is logged" | `validate-repository.test.ts` |
| delete one platform line from `repository-detection.md` | `validate-repository.test.ts` |
| append a numbered retrieval list to `mcp-tools.md` | `validate-repository.test.ts` |
| restore the old `code-analysis.md` (main agent run) | `validate-repository.test.ts` |
| drop `navigator` from `RETIRED_WORD` | `workflow-dispatch-mapping.test.ts` |

## Residual Risk

- `profile-cli-parity.test.ts` reads `@massa-ai/shared` from `dist`, so a source-only change
  to `rules.ts` survives it until shared is rebuilt; the shared unit tests still kill it.
- mcp-client DB-backed suites were not run locally (no `DATABASE_URL` reachable from the
  scratch config; identical failure on `main`). CI runs them against pgvector.
- Installed hosts keep the old eight-rule `MASSA-AI.md` until re-rendered; the CHANGELOG
  upgrade note says so.

## Summary

**Result**: PASS — AC1–AC7 verified with file:line evidence and 11 killed mutants.
