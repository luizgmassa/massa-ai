# Handoff — untracked-generated-bundles (VALIDATED PASS; PR open next; merge = user decision)

Previous handoffs closed: registry-cleanup-skill-imports merged as PR #72 @
`724ad02d` (main).

Session `spec-untracked-generated-bundles` · workflow spec-driven (Large) ·
persona route: AI Engineer (context-skill-harness-engineer-architect). massa-ai
MCP not used this session; `.specs/` files canonical. Contract files:
`.specs/features/untracked-generated-bundles/{spec,design,tasks,validation}.md`.

## Objective

Stop tracking the 1,141 generated plugin bundle files (4× skills managed
roots, 4× agents/, 4× agent-profiles/, 2 hook copies, opencode-config.cjs
mirror); generation-on-demand becomes the contract (AD-016). User decision
2026-08-05: untrack all four hosts including the git-marketplace channel,
which gains a documented generation prerequisite + opt-in post-merge hook
snippet (never auto-installed).

## State

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

## Next Step

Push branch, open PR (CHANGELOG entry present — merge gate satisfied), watch
CI. Merge is the user's decision. After merge: nothing further — feature
closes; installed machines are unaffected (bundles live under host config
dirs, not the repo).
