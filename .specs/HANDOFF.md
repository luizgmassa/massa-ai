# Handoff

## Active — Cross-Pollination Ports & Gap Closure (VALIDATED PASS; PR open, merge = user's decision)

- **Feature:** `cross-pollination-ports` — implement the still-live items of
  `.specs/reports/cross-pollination-portability-and-gaps.md`. Spec/design/tasks/validation all
  under `.specs/features/cross-pollination-ports/`; read those, not this file, for the contract.
- **Branch:** `feature/cross-pollination-ports`, worktree `.claude/worktrees/cross-pollination-ports`,
  cut from `origin/main` @ `94e6b05`. 23 commits (T1 `d62ab74` … close-out), one commit per task,
  three sequential builder batches + inline validation/close-out. One PR.
- **State:** Specify, Design, Tasks, full pre-mortem Plan Challenge (2 revisions folded in),
  Execute T1–T19, independent validation **PASS** (35/35 ACs evidenced, 6/6 discrimination
  mutations killed, all gates re-run green by the verifier — `validation.md`).
- **Next action (user):** review + merge the PR. The PR's CI run is the deferred real-world sensor
  for T7 (dedicated-DB suites actually executing in Actions) and T8 (cache hit on a warm run).
  Merging cuts a **minor release** (CHANGELOG `[Unreleased]` has `### Added` content) — approving
  the merge approves a release.
- **Merge-time note:** the main checkout at `/Users/luizmassa/Projects/massa-ai` holds untracked
  duplicates of `.specs/reports/*` and `.specs/features/cross-pollination-ports/{spec,design,tasks}.md`
  (pre-worktree copies; deletion was declined by the tool-permission classifier mid-session).
  `git pull` after merge will refuse to overwrite them — delete those untracked copies first
  (contents match the merged versions except the later design/tasks amendments; the merged files win).
- **Decisions added:** AD-014 (kernel credential-scrub boundary). Note its renumbering story — the
  design pre-assigned "AD-013" and that slot was taken by the time the deferred append ran
  (lesson L-014: re-check the highest AD at append time).
- **Environment facts that carry:** native PG serves both `localhost:5432/massa_ai` and dedicated
  `127.0.0.1:5433/massa_ai_test` locally; `RUN_POSTGRES_TESTS` + 27 `MASSA_AI_*` vars now in turbo
  `passThroughEnv` with a standing drift test; massa-ai MCP server unreachable this whole session
  (memory recall/persist skipped; `.specs/` canonical).

## Previous — skills/ Directive Dedup (T1–T5 of 12, stopped at user instruction)

Branch `refactor/skills-directive-dedup` (T1–T5 committed at `ed1028e`, T6–T12 not started, not
pushed, no PR; its worktree has since been pruned — re-create one from the branch to resume).
Contract: `.specs/features/skills-directive-dedup/{spec,design,tasks}.md`.

The prior HANDOFF body describing PR-D (`core-layering-read-file-split`) is obsolete — PR-D merged
as PR #60 and shipped in v1.18.0; recover that record from this file's git history if needed.
