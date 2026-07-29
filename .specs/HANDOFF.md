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

## Active — Plugin Auto-Install, Execute T1–T4 done, T5 mid-flight

**Feature**: `plugin-auto-install` · branch `feat/plugin-auto-install`, cut from
`origin/main` @ `ce26f28` (v1.9.1). **Specify, Design, Tasks COMPLETE and APPROVED;
Execute T1–T4 DONE and committed. T5 (docs) edits written but UNCOMMITTED — build
gate not yet run. T6 and independent validation not started.**

**Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-plugin-auto-install`
**Commits**: `345e753` (Specify), `fd0dbc8` (Design + Tasks + Plan Challenge),
`41bfda3` (T1), `c2ee9b0` (T2), `9c68012` (T3), `bb42849` (T4), plus `docs(spec)`
progress commits `1e68651`, `2afe20b`, `1c4a502`, `c1e025a`.

**Read before resuming**, in order:

1. `.specs/project/STATE.md` — Current block (per-task status + gate counts).
2. `.specs/features/plugin-auto-install/tasks.md` — T5/T6 definitions; T1–T4
   done-when boxes all checked.
3. `.specs/features/plugin-auto-install/spec.md` / `design.md` — only if a
   decision needs re-checking; approach A is settled, do not re-litigate.

**Uncommitted files (T5 work — review, gate, then commit)**:

- `README.md` — Integration section: new paragraph on harness auto-detect +
  version gating (after the `p`/`k` menu paragraph, ~:208).
- `CLAUDE.md` — agent-harness paragraph: added the host-detected, version-gated
  plugin-phase sentence (~:309).
- `CHANGELOG.md` — `[Unreleased] → ### Added` entry (minor bump class).

**Next actions, in order**:

1. **T5 gate (build)**: `bun run lint && bun run type-check && bun run test:scripts
   && bun run test:plugins`. Expected: lint/type-check clean; `test:scripts` TS
   part 637 pass + **3 pre-existing env failures** (tree-sitter native suites in
   `scripts/tests/verify-tree-sitter-*.test.ts`, red at HEAD — verified by stash
   in T2; the `&&` chain then short-circuits the shell loop, so run it separately:
   `for f in scripts/tests/*.sh; do bash "$f" || exit 1; done` — all green);
   `test:plugins` 96/96. Then commit T5 as
   `docs(installer): plugin auto-install behavior + changelog`.
2. **T6** — aggregate gate in tracked state + the 4 design discrimination
   sensors (each in scratch state, reverted after observation): (1) delete the
   C4 `record_plugin_version` call → PAI-03 test red; (2) forced hooks-merge
   failure after `install_bundled_skills` → no `plugin` subfield (already a
   permanent test at suite 3.x(f) — sensor = confirm it kills a record-inside-
   `install_bundled_skills` mutant); (3) drop C5 write-side re-attach in
   `install-skills.sh` → round-trip test red; (4) harness with 0 detected hosts
   → no `.config/massa-ai/marketplace/` dir (permanent test at suite 2.12 —
   sensor = confirm it kills an ungated-marketplace mutant). Record evidence in
   tasks.md + STATE.md. Commit per tasks.md decision (`test(installer): …` or
   fold into T5).
3. **Validation** — dispatch a fresh `massa-ai-verification-agent` (author ≠
   verifier) over the diff `ce26f28..HEAD` with spec.md as source of truth;
   it writes `.specs/features/plugin-auto-install/validation.md`.

**Environment notes (discovered during Execute)**:

- `apps/opencode-plugin/dist/` is build output — `bun run build` was run this
  session (5/5 packages); rebuild if the worktree is reprovisioned, else
  `test:plugins` fails 17/94 on missing dist.
- Suite 2.10 (AC-12) moves `dist/index.js` aside mid-test and restores it via
  an EXIT trap — do not be surprised by the temporary move.
- `test-setup-wizard-db-selection.sh` flaked once under the full loop
  ("migrations fail closed"), green standalone — same class as the load flakes
  recorded in STATE.md history; do not chase.

**Skipped sensors this session**: massa-ai MCP tools unregistered (no
recall/remember, no Synapse, no checkpoints); Context7 not registered.
Graceful degradation recorded; nothing blocked.

**Machine state**: tools-api stopped (port 3333 free). No DB needed.
