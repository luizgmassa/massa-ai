# Handoff

## Active — Model Profile Switching (spec-driven, Execute complete, validation in flight)

- Session `spec-model-profile-switching`, branch `spec/model-profile-switching`,
  worktree `.claude/worktrees/model-profile-switching` @ `origin/main` = `d18e7764`.
  Contract: `.specs/features/model-profile-switching/{spec,design,tasks}.md` — read those,
  not this file, for requirements (MPS-01..12), per-task write sets and gates.
- Specify + Design + Tasks + full Plan Challenge (pre_mortem, F1-F4 all folded: installRoute
  data source, TS lock stale-owner reclaim, OpenCode symlink repoint, AC5 global-fail
  exemption) + Execute T1-T16 via 3 confirmed batch workers + 2 inline repairs
  (security-allowlist entry for lock.ts; tools-api type-check fix rode B3). One atomic
  commit per task. AD-015 appended (modelProfile single-writer).
- Gates at close-out, re-measured by main agent: lint 0, both generators --check 0,
  test:plugins 96/96, test:scripts 0, build 0, both isolated runners 0 (B3 matrix).
- massa-ai MCP unreachable this session; `.specs/` canonical.
- Next: independent validation (verification-agent, author != verifier) -> validation.md ->
  push + PR (user merge decision; minor release on merge).

## Previous — Python→TypeScript Scripts + Lessons Single-Store (VALIDATED PASS 2026-08-04 — T1-T12 + FT1-FT3 (FT2-FT3 = delivery repairs 1-2), 2 verification iterations; PR #65 open, merge = user's decision)

- **Validation:** iteration 1 FAIL (critical: round-half-even sensor not standing after
  T11's harness deletion — F1's "exercised, not assumed") → FT1 `67e769ca` (mutating
  goldens at the 0.625 boundary; observed red 44/2, mutant prints 0.63) → iteration 2
  **PASS** (independent kill re-confirmation, 4/4 mutations, no regression). L-016
  recorded via the ported `lessons.ts` itself.

- **Feature:** `python-to-typescript-scripts` — 8-script py→ts migration (PTS-01..06) +
  lessons single-store LSN-01 (user amendment: `lessons.json` survives, `LESSONS.md` +
  render path deleted). Contract:
  `.specs/features/python-to-typescript-scripts/{spec,design,tasks}.md` — read those, not
  this file, for per-task write sets and gates. Branch `spec/python-to-typescript-scripts`,
  worktree `.claude/worktrees/python-to-typescript-scripts`, from `origin/main` @
  `e932a673` (PR #64 merge commit).
- **State:** Specify (amended) + Design + Tasks + full Plan Challenge (pre_mortem, 4
  findings all folded — see design.md Plan Challenge Record) DONE; Execute ran as
  3 sequential batch workers (user confirmed): B1 T1-T3, B2 T4-T9, B3 T10-T12 — ALL 12
  TASKS COMPLETE, one atomic commit per task, status-before-commit, dual-run parity (or,
  for T10's mutating-in-place scripts, scratch-copy byte-diff) before every `.py`
  deletion, same-commit bundle regen. Commit range `e932a673..HEAD`: `b4782690` activate,
  `b8ef61e5` T1, `d6ca0747` T2, `74a19f2c` T3, `6b4e383f` T4, `e4931929` T5, `140398ed` T6,
  `109a8885` T7, `cccaad7b` T8, `3bc677c4` T9, `9e8ea516` T10, `1503995f` T11, T12 this
  commit. Full gates green at T12 close: `bun run test:scripts`, `bun run lint`,
  `generate-skill-artifacts.ts --check`, `generate-subagent-artifacts.ts --check`, all four
  ported validators + `check_specs_delivered.ts` dogfooded against this feature exit 0.
- **User decisions this session:** merge PR #64 first (done, `e932a673`); lessons.json is
  the single store; one combined feature; delivery through PR creation authorized
  (commits+push+PR); merge of THIS feature's PR stays the user's (minor release).
- **Environment:** worktree provisioned (install + 4-dir addon copy + build + prisma
  generate; grammar suite 9/0 — note turbo FULL-TURBO cache restores dist but NOT
  `src/generated/prisma`, run `bunx prisma generate` in fresh worktrees). massa-ai MCP
  unreachable; `.specs/` canonical.
- **Delivery repair 1 (FT2):** PR #65 (https://github.com/luizgmassa/massa-ai/pull/65)
  CI red on `e6d8362a` — `build` + `coverage`, one root cause, two venues: Bun test
  discovery matches any `*_spec.ts`, and the migration shipped `validate_spec.ts` into
  the plugin's bundled `skills/` tree; opencode-plugin is the only plugin declaring its
  own `test` script, so its bare package-wide `bun test` walked the bundle and died on
  the CLI's usage error. Fix: test script scoped to `__tests__ src/__tests__` (FT2,
  tasks.md Phase 6 — full record in STATE.md). Gates re-run own-exit-code green:
  turbo-filtered plugin test 0 (124/0), `test:scripts` 0 (1323/0 TS + shell suites),
  `lint` 0, `validate_tasks.ts` 0 errors. No verifier re-dispatch (delivery-stage
  repair — tlc-330 FT6 precedent). The `github-advanced-security` check-run failure is
  pre-existing (red on both PR #64 heads, merge state CLEAN), not merge-blocking.
- **Delivery repair 2 (FT3):** FT2's fix covered only the turbo venue — `coverage`
  stayed red on `46f7e581` (the FT2 commit itself) because `check-coverage.ts`'s
  opencode-plugin UNITS entry spawns its own bare `bun test --coverage` (second
  discovery mechanism; package.json `test` never consulted). Fix: unit command scoped
  to `__tests__ src/__tests__` mirroring the package test script (FT3, tasks.md Phase
  6 — full record in STATE.md). Observed red→green locally on the exact unit command;
  venue mirror `test:coverage apps/opencode-plugin` (dedicated DB) floor PASS. Gates:
  check-coverage.test solo 23/0, `test:scripts` 0 (1323/0), `lint` 0,
  `validate_tasks.ts` 0 errors.
- **Next action:** push FT3 commit → re-watch PR #65 to green (poll the new sha's
  check-run count >0 before `gh pr checks --watch` — the old-sha rollup race) → user
  merge decision (minor release on merge; CHANGELOG carries the commit-msg-hook operator
  note).

## Previous — TLC 3.3.0 Harness Update (VALIDATED PASS 2026-08-04 incl. Phase 5 amendment + FT6 delivery repair; MERGED as PR #64 @ `e932a673` 2026-08-04)
- **Phase 5 (user amendment):** ALL-workflows rules (verify-don't-assume + docs-are-leads +
  ask-when-in-doubt in router Core Contract; 8 read-only charters → `deep`) + planned
  `python-to-typescript-scripts` spec. T19 `e751c777`, T20 `277ec7a5`, T21 `b291b0fb`;
  T22 close-out + iteration-3 validation in flight.
- **Validation:** iteration 1 FAIL → FT1/FT2 (`19ebe0cd`, `98f76d0f`) → iteration 2 PASS
  (4/4 + 1 mutations killed across iterations, gates exit 0). Follow-ups IT2-01/IT2-02 in
  `validation.md` — future minor fix tasks, not blockers.
- **Delivery repair 1 (FT6):** post-close-out CI `build` red — 3 `bun run test:scripts`
  failures, all stale tests vs ALLWF-03 (outside the scoped verification set;
  validation.md's recorded scope limit). FT6: duplication ceiling 313→331
  raise-with-reason (+18 differential = charter-frontmatter uniformity from the 8 deep
  pins), investigator expectation `light`→`deep`, profile-selection test →
  `documentation-agent` (the remaining light charter). Worktree was wholly unprovisioned
  (no `node_modules`, worse than the earlier partial-copy note) — install + 4-dir addon
  copy + `bun run build`, grammar suite 9/0. Local gates own-exit-code green:
  `test:scripts` 0 (1277/0 TS + shell suites), `lint` 0, `validate_tasks.py` 0 errors.
  One atomic commit, then push + `gh pr checks 64` re-watch. Merge = user (minor release).


- **Feature:** `tlc-330-harness-update` — port TLC 3.3.0's spec-driven harness (four
  deterministic validator scripts + `check_specs_delivered.py`, EARS ACs, discuss pace system,
  git-stash ban with a porcelain baseline, status-before-commit reorder, deliver-specs-before-PR
  gate, batch-trigger lowering to `>3`, `verification-agent` deep-tier pin, `lessons.py` Unicode
  dedup fix). Contract: `.specs/features/tlc-330-harness-update/{spec,design,tasks}.md` — read
  those, not this file, for the per-task write sets and gate commands. Branch
  `spec/tlc-330-harness-update`, worktree `.claude/worktrees/tlc-330-harness-update`, from
  `origin/main` @ `066e86e` (v1.20.0).
- **State:** Specify + Design + Tasks + full Plan Challenge (five findings folded in: C1/C2/C3/C5
  revised the plan before Execute, C4 rejected) all DONE. Execute T1-T18 of 18, one atomic commit
  per task, commit range `e6b282c4`..`ca621e0a`+close-out. Delivery ran as two inline task ranges
  plus three sequential batch workers (Phase 1 inline T1-T6, Phase 2 inline T7-T15, Phase 3 batch
  T16-T18) — offered and confirmed per BATCH-01's own lowered `>3`-task trigger, which this
  feature's own change now governs. Independent validation HAS RUN since this note was first
  written: iterations 1-4 in `validation.md` (1 FAIL → FT1/FT2 → 2 PASS; Phase 5: 3 FAIL →
  FT3/FT4 → 4 FAIL → FT5 → iteration 5).
- **Next action (independent verifier):** run the Verification Ladder against this branch
  (author != verifier is mandatory), then `python3 skills/massa-ai/scripts/validate_state.py
  tlc-330-harness-update` before the feature is marked done. Do not push or open a PR until
  `check_specs_delivered.py tlc-330-harness-update` exits 0 on the close-out commit (GATE-02).
- **Process constraint (this session):** the close-out commit (this one) always lands **before**
  the first push — `implementation-delivery.md` stage 3.5's remediation branch is a defensive
  fallback that should never fire on this feature, per Plan Challenge C2.
- **Environment facts that carry:** massa-ai MCP server unreachable this session (`.specs/`
  files canonical, per contract); the worktree's `bun install` may have skipped native
  tree-sitter grammars (documented, harmless — the parity tests and both generators never
  touch tree-sitter).

## Previous — DA Inventory Closure (VALIDATED PASS 2026-08-03; PR open, merge = user's decision)

- **Feature:** `da-inventory-closure` — disposition + closure of DA-01..DA-17 from
  `.specs/reports/cross-pollination-portability-and-gaps.md` (folder removed at close-out per
  the user's instruction — recover via git history). Contract:
  `.specs/features/da-inventory-closure/spec.md` (the Re-verified table is the triage record;
  read it, not this file). Branch `spec/da-inventory-closure`, worktree
  `.claude/worktrees/da-inventory-closure`, from `origin/main` @ `8e63477` (v1.19.0).
- **State:** COMPLETE — Specify (17 rows: 7 FIX / 8 RESOLVED / 1 ROUTED / 2 ACCEPTED), Design +
  full Plan Challenge (2 structural revisions: DI-01 mechanism, DI-10 sweep rule; DI-05 withdrawn
  at D0 — SEN-03 had already shipped it), Execute T1-T11 (`c8174af`..`d6329a0`), independent
  validation **PASS** (`validation.md`; DI-02 mutation re-derived + killed, gates exit 0).
  L-001 promoted to confirmed by the lessons tool.
- **Next action (user):** review + merge the PR — merging cuts a **minor** release.
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
