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

## Inactive — Plugin Auto-Install COMPLETE, validated PASS

**Feature**: `plugin-auto-install` · branch `feat/plugin-auto-install`, cut from
`origin/main` @ `ce26f28` (v1.9.1). **Specify, Design, Tasks, Execute (T1–T6), and
independent validation ALL COMPLETE 2026-07-29. Verdict: PASS** (`.specs/features/
plugin-auto-install/validation.md`). Branch is ready for PR/merge review — no
remaining task work.

**Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-plugin-auto-install`
**Commits** (oldest→newest): `345e753` (Specify), `fd0dbc8` (Design + Tasks + Plan
Challenge), `41bfda3` (T1), `c2ee9b0` (T2), `9c68012` (T3), `bb42849` (T4),
`f9fbc81` (T5 docs), `cc132bc` (T6 sensor evidence), `ad9232b` (AC-13 reword,
validation finding), `5438037` (README/CHANGELOG `k)` fix), `cba2159` (validation
PASS), plus `docs(spec)` progress commits `1e68651`, `2afe20b`, `1c4a502`,
`c1e025a`, `5dded42`, `a8e9aa5`.

**Final gate (tracked state @ `5438037`)**: lint clean; type-check 6/6;
`test:scripts` TS 637 pass + 3 pre-existing env failures
(`verify-tree-sitter-grammars` native suites, red at HEAD — recorded, not fixed);
shell loop 21/21 (run separately: `for f in scripts/tests/*.sh; do bash "$f" ||
exit 1; done`); `test:plugins` 96/96.

**Validation loop**: 1 of 3 iterations used. Findings fixed: AC-13 reworded to
harness routes (spec-internal conflict with PAI-08/goal 3 — `p)` menu is the
deliberately un-gated manual surface), and the pre-existing README `k)`
description corrected in both copies. Verifier session had no shell/write tools:
static per-AC evidence is the verifier's; gate re-runs are the main agent's
(recorded in validation.md as an accepted deviation).

**If a next session resumes this repo**: no active feature. Check
`.specs/project/STATE.md` — `core-layering-god-module-split` (PR-B) Execute is in
progress on `refactor/search-facade-split` in the main checkout.

**Environment notes (still true)**:

- `apps/opencode-plugin/dist/` is build output — rebuild with `bun run build` if
  the worktree is reprovisioned, else `test:plugins` fails on missing dist.
- Suite 2.10 moves `dist/index.js` aside mid-test and restores it via EXIT trap.
- massa-ai MCP tools were unregistered all session (no recall/remember/Synapse) —
  graceful degradation; nothing blocked.

**Machine state**: tools-api stopped (port 3333 free). No DB needed.
