# Agent Roster Revision Validation

**Date**: 2026-09-23
**Spec**: `.specs/features/agent-roster-revision/spec.md`
**Diff range**: `36017f2d..ddc03812` (branch `feat/agent-roster-revision`; `36017f2d` = spec commit on `origin/main` `11fb8bb1`)
**Verifier**: independent sub-agent in the `code-reviewer` `verify` role (author ≠ verifier), at `9fb10c55`; one follow-up (`ddc03812`) closed the single coverage gap it found and produced the DB-backed `bun run test` verdict.

## Summary

**Result**: PASS

All 8 acceptance criteria (AC1–AC7 plus AC3b) are met. Discrimination sensor: 3/3 planted mutants killed. The verifier's exploratory fourth mutant, which deleted the Specify `product-manager` block, originally survived. Since `ddc03812` it is killed by `scripts/__tests__/workflow-dispatch-mapping.test.ts:345`. No validation asset was weakened. The only non-zero exit is a Bun 1.3.14 engine panic during test-runner teardown. It hits `packages/core` and `apps/mcp-client` with the same crash hash on `origin/main`, and every test file it follows reports 0 fail.

## Task Completion

| Task | Commit(s) | Status |
|---|---|---|
| T1 builder → senior-engineer | `1773bb00` | ✅ |
| T2 remove profile skill | `c85fc7c0` | ✅ |
| T3 router slim | `2541f141` | ✅ |
| T3b lazy mode-contract mechanism | `34a3eeb5` | ✅ |
| T4 code-reviewer (guide removed, review → audit `diff`) | `547d4c29` | ✅ |
| T5 code-explorer (lookup removed) | `b909d7af` | ✅ |
| T6 product-manager (requirements → audit, Specify wiring) | `b33485d8` | ✅ |
| T7 test-engineer (plan removed, lazy) | `837077f1` | ✅ |
| T8 designer (trace added, lazy) | `03d01d76` | ✅ |
| T9 judge (4 lazy contracts) | `10430918` | ✅ |
| T10 close-out | `9ecaa8c8`, `9fa9d3e0`, `d08c60d4`, `3902b665`, `9fb10c55` | ✅ |
| Verifier follow-up (coverage gap) | `ddc03812` | ✅ |

## Acceptance Criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC1 | PASS | `bun run generate:artifacts -- --check` exit 0, "No drift" ×2. Each host `apps/*-plugin/agents/` holds 7 files, including `senior-engineer`, and no `builder`. No `skills/profile` exists in any bundle. `profile` is listed in `scripts/generate-skill-artifacts.ts:254` and `scripts/install-skills.sh:232` |
| AC2 | PASS | `git grep -nE 'mode: \`(guide\|lookup\|requirements\|plan\|review)\`' -- skills/` returns 0 hits. The charters declare only these modes: code-reviewer {audit, verify}, code-explorer {trace}, product-manager {furps, audit}, test-engineer {audit, fix}, designer {audit, implement, trace}, judge {spec-author, scorer, plan-critique} |
| AC3 | PASS | 9 contract files under `skills/massa-ai/references/agent-modes/`. `scripts/__tests__/charter-contract-preservation.test.ts:256` prints "8 stub mode(s) checked, 0 inline" and passes 70/0. Swapping two stubs turns it red (seen by the verifier and by T7, T8, T9). Inlining a stub also turns it red (T10) |
| AC3b | PASS | The inline rule is at `skills/massa-ai/SKILL.md:31`. The Plan Challenge Gate names both judge files (`skills/massa-ai/SKILL.md:153`). All 12 lazy-mode dispatch blocks and 10 prose dispatch sites sit under `skills/massa-ai/` and are reachable through the router. None of them restates the rule |
| AC4 | PASS | `skills/massa-ai/workflows/spec-driven.md:100` has the product-manager `audit` block (every Specify run, `lens: requirements`). `skills/massa-ai/references/figma-pre-analysis.md:22` names `designer` in `trace` mode. Both are pinned by `scripts/__tests__/workflow-dispatch-mapping.test.ts:345` and `:367`, and each assertion was seen going red |
| AC5 | PASS | The router is 12,953 B, under the 13,000 B cap. The "## Workflow Router" span diffs clean, byte for byte, against `11fb8bb1` lines 131-193 |
| AC6 | PASS | `lint` exit 0; `type-check` exit 0. `test:scripts`: 2185 pass / 0 fail, and 41/41 shell suites. `test:plugins`: 183 pass / 0 fail. `bun run test -- --continue` with `DATABASE_URL`: shared 1015/0, tools-api 34/34 groups, opencode-plugin 197/0, web-ui 751/0, core 2305/0, mcp-client 287/0. Core and mcp-client then exit 137 on the Bun panic described under Risks |
| AC7 | PASS | `git grep -nw builder -- ':!.specs' ':!CHANGELOG.md'` returns 174 matches in 38 files, all on the allowlist: legacy `massa-ai-builder` names, the retired-agent mapping row, `docs/removed-features.md`, the REN-05 alias `scripts/lib/model-profiles.ts:690` and its tests, and unrelated or synthetic test data |

## Requirement Checks

- REN-05: `scripts/lib/model-profiles.ts:690` maps an overlay's `agents.builder` onto `senior-engineer`. The mutant that deletes this alias is killed by the REN-05 test in `scripts/__tests__/model-profiles.test.ts`.
- REV-02/03: all 13 former `review` blocks now use `mode: audit` with `lens: diff`. The fallback Role Default is keyed to `diff` only (`skills/massa-ai/references/agent-orchestration.md:213`).
- PMG-02: the carve-out row is at `skills/massa-ai/references/spec-driven/sub-agents.md:104`.
- TST-01, EXP-01, DES-01: the test-engineer `mode` is required; code-explorer has `trace` only; designer `trace` is read-only.
- CHANGELOG: `[Unreleased]` entries sit under the existing Added, Changed and Removed headings. No released section changed.

## Discrimination Sensor

| # | Mutant | Killed by |
|---|---|---|
| 1 | REN-05 alias removed (`scripts/lib/model-profiles.ts:690`) | `scripts/__tests__/model-profiles.test.ts` REN-05 case |
| 2 | designer `audit` ↔ `trace` stub citations swapped | `scripts/__tests__/charter-contract-preservation.test.ts:256` |
| 3 | `diff` removed from the code-reviewer lens list | `scripts/__tests__/workflow-dispatch-mapping.test.ts` lens-set check, which names all 13 dispatch sites |
| 4 | Specify product-manager block deleted | Originally survived. Since `ddc03812` it is killed by `scripts/__tests__/workflow-dispatch-mapping.test.ts:345` |

**Result**: 4/4 killed at `ddc03812`.

## Weakened-Assertion Review

The verifier reviewed all 31 changed test files and found no unjustified loosening. Three thresholds changed:

- The router reference floor went from `>20` to `>10` because the Shared References list was deleted. 14 references were measured afterwards.
- The installer-removal floor went from `3` to `2` because the `profile` skill left the harness set. The floor still equals the real population.
- The router ceiling went from 21,000 to 13,000 B, which is stricter.

## Risks

- **Bun 1.3.14 teardown panic** (`panic(main thread): A C++ exception occurred`) on this macOS host, after `packages/core` `etl-cache-invalidation.test.ts` and after `apps/mcp-client` `embedded-api-client-endpoints.test.ts` (122/0). It reproduces on `origin/main` with the same bun.report hash, and this diff reaches neither package's `src/`. CI on Linux is the authoritative run for those two packages.
- **Router headroom** is 47 B under the cap. Any future addition to the Core Contract needs a matching trim elsewhere.
- **Stale installs.** A `profile set` run before reinstalling can leave a stale installed `builder.md`, because the switch engine never deletes files. The next plugin install prunes it (accepted in the spec's Out of Scope).
- **Early plugin update.** A plugin update that ships stub charters before a repo-route `skills/massa-ai` has `agent-modes/` makes a lazy dispatch return `Blocked` loudly. It never passes silently (accepted in the Plan Challenge).
