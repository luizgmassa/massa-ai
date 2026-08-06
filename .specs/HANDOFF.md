# Handoff — pr-review-workflow (Execute complete through T5; T6 validation in flight; push/PR = user decision)

Previous handoffs closed: untracked-generated-bundles merged as PR #73 @
`40ec631a`, released v1.29.0 (its full handoff is preserved below as Previous);
registry-cleanup-skill-imports merged as PR #72 @ `724ad02d` (main).

Session `spec-pr-review-workflow` · workflow spec-driven (Large) · massa-ai MCP
not used this session (no recall hits needed beyond CLAUDE.md/.specs context);
`.specs/` files canonical. Contract files:
`.specs/features/pr-review-workflow/{spec,design,tasks}.md` (+ `validation.md`
at T6).

## Objective

New routed workflow `pr-review`: six-dimension hosted PR (Pull Request) /
MR (Merge Request) review — security, requirements/DoD, test coverage,
architecture, regression/hallucination, performance — posting inline comments
plus one consolidated summary through `gh` (GitHub) or `glab` (GitLab).
Adapted from the TLC pr-review skill (CC-BY-4.0, github.com/augusto-dmh) with
massa-ai roster dispatches, orchestrator-posts channel discipline, `.specs/`
requirements Track B, and freshness-gated index retrieval. GitLab command
surface researched against official docs (citations in design.md D1); stable
`glab api` Discussions/Notes endpoints are the contract.

## State

- Branch `spec/pr-review-workflow` from origin/main @ `1906a04e` (v1.29.0).
  Commits: `55ed20e2` specs (Plan Challenge F1–F5 folded) → `18e0dbe6` T1
  workflow file (17,424 B) → T2 router registration (SKILL.md 20,091 B of
  21,000 ceiling) → T3 count locks 38→39 + complement 22→23 (observed
  red→green) → T4 CHANGELOG → this state commit (T6 partial).
- Gates green: `generate:artifacts` + `--check` no drift; integrity (6 new
  dispatch-block parses: audit-specialist + reviewer, persona clause present) +
  duplication + parity + size 81/0; doc-paths 0 misses; lint 0; both count
  suites 50/0; `test:scripts` 1451/4 — the 4 fails are the documented
  `.claude/worktrees/` needle-anchor contamination (3 sibling checkouts
  duplicate `const DAMPING = 0.85;`; CI authoritative, same class as the
  workflow-metadata-headers AC5 amendment).
- validate_state: 51 pre-existing errors on origin/main baseline (scratch
  worktree, measured 2026-08-05); this feature contributes 0; T6 gate amended
  accordingly in tasks.md.
- Plan Challenge (full pre_mortem, massa-ai-plan-critic subagent): F1
  consolidation check recorded as design D2b (six dispatches stand); F2 live
  read-only dry run executed on GitHub PR #73 (identity, metadata + head SHA,
  diff, changed files, comment inventory — all resolve), glab side
  skipped-with-reason (`glab` not installed on this machine); F3 numeric 80%
  confidence gate reworded qualitative; F4 accepted; F5 measured.

## Next Step

T6 close-out: independent verification-agent (author ≠ verifier) →
`.specs/features/pr-review-workflow/validation.md`; flip FEATURES.json status
on PASS; final state commit. Then push + PR are the user's decision
(outward-facing; not taken unattended). No installed-machine actions needed —
the workflow ships with the skills bundles on the next release/install.

---

# Previous — Handoff — untracked-generated-bundles (VALIDATED PASS; PR #73 open, CI 14/14 green; merge = user decision)

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
