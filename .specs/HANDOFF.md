# Handoff — workflow-commands (VALIDATED PASS; PR next — creation authorized this session, merge = user decision)

Session `spec-workflow-commands` · workflow spec-driven (Large) · branch
`spec/workflow-commands` from main @ `1906a04e` (v1.29.0), worktree
`.claude/worktrees/workflow-commands`. Contract:
`.specs/features/workflow-commands/{spec,design,tasks,validation}.md`.

## Objective

Per-workflow slash commands on all four hosts (e.g. `/massa-ai:debug`): 38
generated commands per host from the workflow inventory, Approach A (flat
host-native files + body ownership marker `<!-- massa-ai:generated
workflow-command -->`), marker-scoped prune/`--check`, installer delivery
including the new OpenCode `command/` surface, AD-018.

## State

- Commits: `783878c0` specs → T1–T12 (`7397b77b`, `b627dfe1`, `341a1fb9`,
  `29012d02`, `1a27e86a`, `18f47381`, `2c6625c9`, `d43a944e`, `1b317cc3`,
  `c76cafc5`, `be589404`, `1169c8d9`) → `b6189483` validation fix → state files.
- Validation: PASS iteration 2 of 3 — 14/14 ACs, 8/8 mutations killed, gates
  green (test:scripts 1519/0 + 21 shell suites, test:plugins 120/0, lint 0,
  both generators `--check` clean). Iteration-1 gap: gitignore negation removal
  undetectable via `git check-ignore` on tracked paths → text-lock sensor +
  behavioral star representatives (`b6189483`).
- Parked sibling `spec/plugin-architecture-unification` (AD-017, validated,
  unpushed) touches the same generator/installers — conflicts expected at
  whichever merges second (user-accepted 2026-08-05).

## Next Step

Push branch + `gh pr create` (authorized at Execute start), CI watch. Merge =
user decision. Post-merge on this machine: `bash scripts/install-harness.sh`
re-run delivers the 38 commands to installed hosts.

## Previous handoff — untracked-generated-bundles (merged as PR #73 @ `40ec631a`, released v1.29.0)

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

PR #73 open, CI 14/14 green (CHANGELOG entry present — merge gate satisfied).
First CI run failed once: pre-existing `skills-duplication-metric` full-repo
reachability scan crossed the global 5 s ceiling on the ubuntu runner
(5001 ms cut; ~2 s on Apple Silicon; scan surface unchanged by this PR —
walk() is gitignore-blind, bundles were on disk before and after). Fixed with
the established explicit-budget idiom @ `881b3f84`. Merge is the user's
decision. After merge: nothing further — installed machines are unaffected
(bundles live under host config dirs, not the repo).
