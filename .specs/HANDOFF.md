# Handoff

## Active — Core Layering and God-Module Split (PR-B), Phase 1 started

**Feature**: `core-layering-god-module-split` · branch
`refactor/search-facade-split-phase-1`, cut from `main` @ `d628464`.
**Phase 0 is merged and released (PR #44, v1.9.2). T6a and T6 are committed and green; T7 is not
started.** Working tree clean. Nothing is pushed — the branch is local only.

| # | commit | deliverable |
| --- | --- | --- |
| — | `569de25` | plan amendment: AC-3 retired, T6's sensor corrected |
| T6a | `7996c2d` | `capture-facade-baseline.ts` + 3 frozen fixtures; 9 assertions re-pointed |
| T6 | `f612e03` | `rlm-fusion.ts` → `result-fusion.ts` |

Gates at `f612e03`: `lint` 0 · `type-check` 0 · `test:scripts` **732 pass / 0 fail across 39
files** · `check-frozen-anchors` exit 0 · `check-characterization` exit 0 · characterization net
**160** · exclusions **9** · G-HUB exit 1, foreign modules **6 → 5**.

**Read before resuming**: `tasks.md` → *AC-3 vs GMS-03 AC-1*, *Phase 0's before-baselines were
live-tree assertions*, *T6's sensor was unfirable*, then the Phase 1 table.
Then `STATE.md` → *Execute — Phase 1 STARTED*.

**Next action: T7** (`buildGraphStream` → `graph-stream.ts`). It is **not** rename-only:
`graph-stream-project-scope-pg.test.ts` passes `NO_RLM` at **3 call sites** plus its import, and
the coverage suite has **2** forwarding assertions. Both are authorised under the amended AC-3.
That file needs a live PostgreSQL and will not run in a plain `bun test`.

**Two things a resumer must not re-derive the hard way:**

- **A fresh worktree needs `bunx prisma generate` and `bun run build`** before any gate is
  meaningful. Without the first, every `packages/core` suite dies on
  `Cannot find module '../../generated/prisma/index.js'`. Without the second,
  `verifyPackageContents` fails on `apps/tools-api/dist` and reads exactly like a real regression.
- **The Phase 1 baseline is `test:scripts` 732 pass / 0 fail**, not 730. The first reading here was
  taken by grepping the `Ran N tests` line and never the pass/fail split, which hid 4 environmental
  failures. Assert the pass count.

**Do not regenerate the frozen baselines.** `capture-facade-baseline.ts` refuses off the base
subject, and `--force` over a changed subject turns the provenance tests red rather than quietly
moving T17/T20's referent.

**Still open, unchanged from Phase 0**: `.ua/` regeneration is deferred to after PR-C, so **PR-B
does not close GMS-04 AC-3** for those 320 `rlm-` occurrences — T20's verifier has to be told
explicitly. The 18 authorised signature-tracking test edits must be told to it too, or they read as
the AC-3 violation they are not.

**Rebase note**: `origin/main` is `7c20d47` (`chore(release): v1.9.2`), one release-only commit
ahead of this branch's base. Merge must be a merge commit, not a squash (R-04).

---

## Superseded — Core Layering and God-Module Split (PR-B), Phase 0 complete

**Feature**: `core-layering-god-module-split` · branch `refactor/search-facade-split`, cut from
`main` @ `ce26f28` (v1.9.1). **Phase 0 (T0–T5) is done and committed; T6 is not started.**
Stopping here is the plan's own review point, not an interruption — Phase 0 locks every
before/after measurement, and none can be taken retroactively once a structural commit lands.

**Working tree is clean. Nothing is uncommitted.**

Commits: `ab80e62` T0 · `3dee676` T1 · `8fd3983` T2 · `e359115` T3 · `0129207` T4 · `06bde32` T5,
plus the artifact commit that follows this file.

**Read before resuming**, in order:

1. `.specs/features/core-layering-god-module-split/tasks.md` → *Phase 0 — executed* (commits,
   sensors, and the five things Phase 0 changed in the plan), then Phase 1's table.
2. `.specs/features/core-layering-god-module-split/validation.md` — the complete before-record.
   **It carries no verdict**; the verdict is T20's, by a fresh verifier.
3. `.specs/project/STATE.md` → *Execute — Phase 0 COMPLETE*.

**Next action**: review Phase 0, then start **T6** (`fuseResults`, `generateScoreExplanation` →
`result-fusion.ts`). Read `design.md` §3.4, §4.3.1, §4.4, §5.4 and §6.1 first — T6 touches three
of the four frozen anchors.

**Every Phase 1 commit additionally runs** `bun run lint`, `bun run type-check`,
`bun scripts/check-frozen-anchors.ts`, `bun scripts/check-characterization.ts`, and a
`git diff --name-only` review against PR-C-BOUNDARY and AC-3. Both new checks are sub-second and
locate their subjects by content and by symbol rather than by path, so **neither should ever need
editing as files move** — if one goes red, the task is wrong, not the check.

**Two decisions waiting on the reviewer:**

- The `[Unreleased]` CHANGELOG entry sits under `### Changed`, which cuts a **minor** release.
  Move it to `### Fixed` if PR-B should land as a patch. Left alone deliberately — release
  semantics is not the executor's call.
- `.ua/` regeneration stays deferred to after PR-C, so **PR-B does not close GMS-04 AC-3** for the
  320 `rlm-` occurrences in those three tracked generated artifacts. T20's verifier has to be told
  this explicitly or it reads as a miss.

**The trap that cost the most this phase**, three separate times: *a measurement whose reading was
an artifact of the state it was taken in.* T2's suite was verified at 17 pass / 0 fail while its
own files were **untracked** — and it enumerates `git ls-files`, so it was blind to itself.
Staging them moved fan-in from 26 to 27 and turned three of its own tests red. Verify any
measurement script in the tracked state it ships in, never the state it was written in.

---

## Superseded — Sensor Repair 2026-07 (PR-A), merged

Kept for its close-out detail; PR-B depends on it. Full record lives in
`.specs/features/sensor-repair-2026-07/`.

**Feature**: `sensor-repair-2026-07` — **COMPLETE AND MERGED.** All 9 planned tasks plus
**7** unplanned repairs are DONE. Every requirement is VERIFIED; SEN-02 was the last to close.
**PR**: [#42](https://github.com/luizgmassa/massa-ai/pull/42) — **merged** as `33efc82`, a merge
commit preserving all 21 commits (each carries its own discriminating-sensor evidence).
**Branch**: `fix/sensor-repair`, merged into `main`. Not deleted.
**Spec**: `.specs/features/sensor-repair-2026-07/spec.md` — SEN-01 AC-3, SEN-04 AC-2/AC-6/AC-8
carry recorded divergences; BEH-01 carries the corrected behaviour-change count (four, not one);
**SEN-02 gained AC-5 during close-out**.
**Design**: `.specs/features/sensor-repair-2026-07/design.md` — five forks. Read the Fourth and
Fifth before touching indexing.
**Tasks**: `.specs/features/sensor-repair-2026-07/tasks.md` — **authoritative for task state.**
**Validation**: `.specs/features/sensor-repair-2026-07/validation.md` — independent verifier, plus
a **close-out addendum that is explicitly not independent** (written by the agent that authored
the T10 fix). Read the authorship note before relying on it.
**Downstream**: `.specs/features/core-layering-god-module-split/spec.md` — PR-B, **now unblocked**.

---

## Active — Plugin Auto-Install, plan approved, Execute not started

**Feature**: `plugin-auto-install` · branch `feat/plugin-auto-install`, cut from
`origin/main` @ `ce26f28` (v1.9.1). **Specify, Design, Tasks are COMPLETE and APPROVED;
Execute (T1–T6) has NOT started.** Working tree clean; worktree provisioned
(`bun install` done 2026-07-29).

**Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-plugin-auto-install`
**Commits**: `345e753` (Specify), `fd0dbc8` (Design + Tasks + Plan Challenge revisions).

**Read before resuming**, in order:

1. `.specs/features/plugin-auto-install/spec.md` — 10 requirements (PAI-01..10), 16 ACs,
   user decisions (auto-detect at install time, all four hosts, absent = skip+log,
   auto-upgrade on version change) and the marketplace-copy assumption.
2. `.specs/features/plugin-auto-install/design.md` — approach A (harness-gated), C1–C5,
   risks R1–R9. **Approach was user-confirmed; do not re-litigate.**
3. `.specs/features/plugin-auto-install/tasks.md` — 6 tasks, gates, Test Coverage Matrix,
   and the *Plan Challenge — tasks* section (the four incorporated findings are
   load-bearing: exit-0-only records, `cursor-agent cursor` binary parity, gated
   marketplace resolution, AC-15 uninstall branch semantics).

**Plan Challenge done**: full gate, mode `pre_mortem`, `massa-ai-plan-critic`.
Findings C-1..C-4 verified against source and incorporated into spec/design/tasks.
Nothing is owed here.

**Next action**: **T1** — add `installer_host_config_dir`, `installer_host_binaries`,
`installer_host_detected`, `installer_bundle_version`, `installer_plugin_versions`,
`installer_compare_versions` to `scripts/lib/installer-shared.sh` (bash 3.2,
function-only). `installer_host_binaries` MUST mirror
`scripts/install-skills.sh:165-172` `platform_executables` (cursor → `cursor-agent cursor`).

**Execution contract reminders**:

- 6 tasks ≤ 8 → single batch, **inline execution, no sub-agent offer**.
- One atomic commit per task, gate green before commit (user pre-authorized task commits).
- Per-task commit gates: T1/T2 quick, T3/T4 full (`bun run test:scripts`), T5/T6 build
  (`bun run lint && bun run type-check && bun run test:scripts && bun run test:plugins`).
- After T6 (last task): fresh `massa-ai-verification-agent` runs automatically
  (author ≠ verifier) and writes `.specs/features/plugin-auto-install/validation.md`.
- `install.sh` menu strings are grep-pinned — do not reword.
- New plugin record code adds **no** new `source installer-shared.sh` dependency in any
  of the four plugin installers (inline heredoc ×4).
- Root + four plugin `package.json` versions are asserted equal in T4's parity suite
  (no PR gate runs `version:sync` — this is the only guard).

**Skipped sensors this session**: massa-ai MCP tools unregistered (no recall/remember,
no Synapse, no checkpoints); Context7 not registered. Graceful degradation recorded;
nothing blocked.

**Side finding reported, out of scope (design R9)**: `apps/claude-plugin/install.sh:42-43`
and `apps/codex-plugin/install.sh:41-42` `source "$REPO_ROOT/scripts/lib/installer-shared.sh"`
unconditionally — a published tarball lacking `scripts/` would crash them. Pre-existing;
not this feature's problem.

**Machine state**: tools-api stopped (port 3333 free). No DB needed — installer suites
run against scratch HOME dirs only.
