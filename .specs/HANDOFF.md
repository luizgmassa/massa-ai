# Handoff — agent-era-harness-upgrades (Execute in progress — Batches A+B (T1-T14) + Batch C (T15-T19) committed; PR not yet opened)

Previous handoffs closed: untracked-generated-bundles (PR #73 open at the time
of this handoff, CI 14/14 green; merge remains the user's decision — see
Previous section below).

Session `spec-agent-era-harness-upgrades` · workflow spec-driven (Large) ·
branch `spec/agent-era-harness-upgrades` from `main` @ `40ec631a` (post PR #73
merge). massa-ai MCP server not used this session; `.specs/` files canonical.
Contract files: `.specs/features/agent-era-harness-upgrades/{spec,design,tasks}.md`.

## Objective

Implement `agent-era-harness-upgrades` (AEH-01..10): `lessons.ts` trust-ramp
(`review add`/`trust status`) and metrics (`metrics add`/`metrics trend`)
commands; code-quality/refactor/coding-guidelines rewrites to an
agent-read-aware discoverability-or-change-risk split criterion and a file-shape
section; tests-audit five-gate error-class model + variation/trend sensors +
tests lens; feature-workflow AC capture/anchor; `massa-ai-reviewer` dispatch
wired into 14 workflows (5 implementing + 9 fix); gates and delivery artifacts.

## State

- `6 Phases = 19 Tasks`. Batches A+B (T1-T14, lessons.ts ramp engine, code-shape
  guidance, testing surfaces, spec anchor and policy prose) committed prior to
  this handoff.
- Batch C (this handoff, T15-T19): T15 `377b654a` (reviewer dispatch in 5
  implementing workflows, including spec-driven.md Execute step 6 placement
  immediately before the existing verification-agent block, which stays
  intact); T16 `2cf7d3fc` (reviewer dispatch in bugs-fix/code-quality-fix/
  architecture-fix/security-fix/requirements-fix); T17 `9f7a4718` (reviewer
  dispatch in tests-fix/implementation-fix/maestro-fix/mobile-figma-fix, plus
  the 14-file count sensor); T18 no commit — gates only (`bun install`,
  `generate:artifacts` + `--check`, parity suites, `bun run lint`, full gate
  all green, zero tracked-file drift); T19 this commit (CHANGELOG + FEATURES.json
  + STATE.md + HANDOFF.md).
- Every new sensor in `agent-era-guidance-content.test.ts` for T15-T17 was
  mutation-verified: apply -> observed red -> revert byte-identical (diff
  confirmed) -> green, before being trusted.
- `skills-harness-integrity.test.ts` held at 32 pass / 0 fail through T15,
  T16, and T17 (it asserts aggregate dispatch-block invariants — including
  the mandatory `persona:` bullet on every block — not a per-block count, so
  it does not grow with new blocks).
- SPEC_DEVIATION: T9/T10's literal Done-when reads `validate_skill.ts` exits
  0; re-baselined during Batches A+B to "no NEW failures" because
  `description_has_negative_scope` fails pre-existing on all 17 agent charters
  at the `origin/main` baseline (re-measured during this handoff: all 17
  charters under `skills/agents/*/SKILL.md` still fail `validate_skill.ts`
  with that same check, unrelated to this feature's edits).

## Next Step

Push the branch, open a PR, and run independent validation (verification-agent,
author != verifier) before merge. `check_specs_delivered.ts` result for this
feature is recorded in the T19 commit; merge remains the user's decision.

## Previous — Untracked Generated Bundles (VALIDATED PASS; PR #73 open, CI 14/14 green; merge = user decision)

Previous handoffs closed: registry-cleanup-skill-imports merged as PR #72 @
`724ad02d` (main).

Session `spec-untracked-generated-bundles` · workflow spec-driven (Large) ·
persona route: AI Engineer (context-skill-harness-engineer-architect). massa-ai
MCP not used this session; `.specs/` files canonical. Contract files:
`.specs/features/untracked-generated-bundles/{spec,design,tasks,validation}.md`.

### Objective

Stop tracking the 1,141 generated plugin bundle files (4× skills managed
roots, 4× agents/, 4× agent-profiles/, 2 hook copies, opencode-config.cjs
mirror); generation-on-demand becomes the contract (AD-016). User decision
2026-08-05: untrack all four hosts including the git-marketplace channel,
which gains a documented generation prerequisite + opt-in post-merge hook
snippet (never auto-installed).

### State

- Branch `spec/untracked-generated-bundles` from `main` @ `724ad02d`;
  17 commits: `381b48d7` specs → T1-T14 (`af907544`..`0fe89367`) →
  `33171311` results → `247ef8ef` verification fix (contract sensors).
- Validation: PASS (iteration 1 of 3) — 17/17 ACs, gates 6/6, discrimination
  sensor 7/7 killed after fix commit `247ef8ef` closed the two survivors
  (pretest:coverage deletion, .gitignore entry deletion). validate_state
  exit 0. Accepted-cosmetic: genIndex guard in 2 ci.yml sub-tests of
  `workflow-generation-order.test.ts`.
- Pre-mortem gate (full, pre_mortem): critical coverage.yml finding folded as
  UGB-17 (pretest:coverage + opencode package pretest); marketplace/config-cli
  ungenerated-checkout path recorded as accepted documented risk.
- Cold-path evidence (fresh worktree, bundles absent): test:scripts 1435/0,
  test:plugins 104/0, opencode `bun run test` 139/0, turbo 11/11; deliberate
  red observed on the parity beforeAll guard.

### Next Step

PR #73 open, CI 14/14 green (CHANGELOG entry present — merge gate satisfied).
First CI run failed once: pre-existing `skills-duplication-metric` full-repo
reachability scan crossed the global 5 s ceiling on the ubuntu runner
(5001 ms cut; ~2 s on Apple Silicon; scan surface unchanged by this PR —
walk() is gitignore-blind, bundles were on disk before and after). Fixed with
the established explicit-budget idiom @ `881b3f84`. Merge is the user's
decision. After merge: nothing further — installed machines are unaffected
(bundles live under host config dirs, not the repo).
