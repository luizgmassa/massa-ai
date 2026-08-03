# Handoff

## Active — DA Inventory Closure (Specify DONE 2026-08-03)

- **Feature:** `da-inventory-closure` — disposition + closure of DA-01..DA-17 from
  `.specs/reports/cross-pollination-portability-and-gaps.md` (folder removed at close-out per
  the user's instruction — recover via git history). Contract:
  `.specs/features/da-inventory-closure/spec.md` (the Re-verified table is the triage record;
  read it, not this file). Branch `spec/da-inventory-closure`, worktree
  `.claude/worktrees/da-inventory-closure`, from `origin/main` @ `8e63477` (v1.19.0).
- **State:** Specify complete — 17 rows re-measured at HEAD: 7 FIX / 8 RESOLVED / 1 ROUTED /
  2 ACCEPTED. Next: Design (DI-01/02/05 need shape decisions), Tasks, full Plan Challenge,
  Execute, independent validation.
- **Worktree provisioning note (measured):** `bun install` here exited 0 while node-gyp silently
  failed under Node 25.9.0 (macOS arm64) — no native tree-sitter builds; repaired by copying the
  4 `node_modules/tree-sitter*/build/` dirs from the main checkout; contract suite then 9/0.
  DI-06 turns this into a documented rule.
- **User process constraints:** `.ua/` data committed, token + trash excluded (flagged);
  `.specs/reports/` removed at end after content sweep; one PR; `skills-directive-dedup` parked,
  untouchable.
- **Environment facts that carry:** native PG on `localhost:5432/massa_ai` + dedicated
  `127.0.0.1:5433/massa_ai_test`; massa-ai MCP server not consulted this session
  (`.specs/` canonical).

## Previous — Cross-Pollination Ports & Gap Closure (VALIDATED PASS; **MERGED as PR #61 @ `0084d1a` 2026-08-03, RELEASED as v1.19.0 @ `8e63477`**)

- **Feature:** `cross-pollination-ports` — implement the still-live items of
  `.specs/reports/cross-pollination-portability-and-gaps.md`. Spec/design/tasks/validation all
  under `.specs/features/cross-pollination-ports/`; read those, not this file, for the contract.
- **Branch:** `feature/cross-pollination-ports`, worktree `.claude/worktrees/cross-pollination-ports`,
  cut from `origin/main` @ `94e6b05`. 23 commits (T1 `d62ab74` … close-out), one commit per task,
  three sequential builder batches + inline validation/close-out. One PR.
- **State:** Specify, Design, Tasks, full pre-mortem Plan Challenge (2 revisions folded in),
  Execute T1–T19, independent validation **PASS** (35/35 ACs evidenced, 6/6 discrimination
  mutations killed, all gates re-run green by the verifier — `validation.md`).
- **Merged.** PR #61 merged 2026-08-03T22:29Z as `0084d1a`; release chain fired — CI, Coverage
  and Release all `success` on that sha (verified via `gh run list`), v1.19.0 cut at `8e63477`.
  The deferred real-world sensors landed with it: T7 (dedicated-DB suites executing in Actions)
  and T8 (cache path exercised) rode the merge commit's green CI run.
- **Merge-time note: executed 2026-08-03.** The untracked duplicates of `.specs/reports/*` and
  `.specs/features/cross-pollination-ports/*` in the main checkout were diffed against the merged
  versions first (report + spec + both sibling reports byte-identical; design/tasks differed only
  by the recorded later amendments — merged files win, per this note's own instruction), then
  deleted; `git pull --ff-only` brought the main checkout to `8e63477` cleanly.
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
