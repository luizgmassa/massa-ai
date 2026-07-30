# Handoff

## Active — skills/ directive dedup (T1–T5 of 12 done, stopped by user instruction)

- **projectId** `massa-ai` · **workflowSessionId** `spec-skills-directive-dedup`
- **branch** `refactor/skills-directive-dedup` · **worktree** `.claude/worktrees/skills-dedup`
- **base** `origin/main` @ `6d5dc6b` · **head** `ed1028e` · working tree clean, every gate green.
- **Not pushed. No PR.** Stopping was the user's instruction, not a blocker.

Read `.specs/features/skills-directive-dedup/{spec,design,tasks}.md` before resuming.
They are canonical; this entry is the pointer.

Specify, Design, Tasks: **done**. Plan Challenge: **done** (full gate, `evidence_audit`,
`massa-ai-plan-critic`) — but see amendment **A0**: it ran *concurrently with Execute*,
not before it. Execute: **T1–T5 of 12**. Independent validation (T12): **not run**.

| Task | Commit | State |
| --- | --- | --- |
| T1 metric + reference graph + 20 tests | `b11c9bf` | done |
| T2 absolute home path out of Maestro prose | `bc47359` | done |
| T3 model names out of `skills/AGENTS.md` | `99afd3a` | done |
| T4 every charter documented in orchestration | `dd09cc1` | done |
| T5 roster guard generalized + 4 stale counts | `bc5a76a` | done |
| plan-challenge amendments A0–A8 | `ed1028e` | done |
| T6 Knowledge Verification Chain → one owner | — | **not started** |
| T7 pointer replacements P1–P4, P6; P5 re-scoped | — | **not started** |
| T8 audit-family → `audit-scope.md` | — | **not started** |
| T9 ceiling + orphan assertion | — | **not started** |
| T10 regenerate 4 bundles | — | after T6–T8 |
| T11 CHANGELOG `[Unreleased]` | — | **not started; CI fails a PR without it** |
| T12 independent verification-agent | — | **not started** |

### Measured at head

`test:scripts` **922 pass / 0 fail** across 45 files (baseline 892/44) · `test:plugins`
**96/0** · `lint` 0 · both generators `--check` **No drift** · `verify-model-tokens.ts`
OK (155 files, 29 tokens) · duplication window=4 duplicatedLines 535, excessLines
**313 — unchanged** · reachability 151 files, **orphans 0**.

`excessLines` has not moved because T6–T8 *are* the dedup and none has run. T1–T5 are
correctness fixes and were never going to move it.

### Resume checklist

1. `cd .claude/worktrees/skills-dedup && bun install && bun run build` **before measuring
   anything** — an unbuilt worktree moves failures rather than reducing them.
2. Read `tasks.md` → Amendments **A0–A8** first. A6 withdraws P5 as originally written;
   `design.md` §D3 carries the replacement decision and its two non-optional conditions.
3. Start at T6.

### Decisions taken with the user — do not reopen

- **Scope tier B**: single-source + fix drift + collapse the audit/fix family
  scaffolding. Not tier C — no file is deleted or merged and no pinned count changes.
- **The metric ships** as a committed ceiling gate, not analysis-only.
- **T7/P5**: `references/mcp-tools.md` owns the eleven-item retrieval procedure;
  `SKILL.md` keeps one load-and-follow line. The conditional-load risk was stated and
  accepted; `design.md` §D3 records the two mitigations T7 must implement.

### Open risks

- **T7's accepted risk is this feature's own defect shape.** `mcp-tools.md` is
  conditionally loaded, so moving retrieval order there can reproduce SDD-03 exactly.
  Mitigation is a body-level mandatory load line **plus** a guard asserting both the
  pointer and single-sourcing. If T7 cannot satisfy both, stop and re-ask.
- **One unexplained flaky failure.** The T5 gate reported 921/1 once and the commit was
  made through it — a violation of the execution contract. It did not reproduce across
  four subsequent full runs, and the failing test could not be identified because the
  output had been reduced to counts. If it recurs, capture the full run; likeliest
  suspects are `lint-gate.test.ts` (mutates the tree in a subprocess) and the new roster
  scan (reads every tracked file).
- **Ceiling not yet set.** `skills-duplication-metric.test.ts` carries
  `EXCESS_CEILING = 313`, the **pre-cleanup** value. T9 must lower it to the post-cleanup
  measurement or the gate enforces nothing.
- `excessLines` is pre-pointer-cost (A7); net reduction lands below 313.

### What this feature turned out to be about

The request was to remove unnecessary and duplicated directions. Measurement refuted both
halves: nothing under `skills/` is unreachable, and removable literal duplication is 313
lines of 12,639 (2.5%), much of it **deliberately mandated** by
`skills-harness-integrity.test.ts` — a subagent receives only its charter, so a pointer
would resolve to a file not in context and the duplicate *is* the contract.

What the audit found instead were four correctness defects the duplication was hiding,
each shipping to users through four npm-published plugin bundles, each invisible to a
fully green suite:

1. A second hand-authored model-naming site, already wrong for two roles.
2. One developer's home-directory path used as a named evidence tier.
3. Two charters absent from the orchestration reference for a whole release.
4. A roster guard that could not match the one string it was written to ban.

Every one had a guard nearby that did not cover it. Three were fixed by correcting the
**direction** or **surface** of an existing gate rather than by adding a new one.

---

## Previous — Model Profile Registry, validated PASS, PR open, driving CI to green

- **projectId** `massa-ai` · **workflowSessionId** `spec-model-profile-registry`
- **branch** `feat/model-profile-registry` · **worktree** `.claude/worktrees/model-profiles`
- **base** `origin/main` @ `45daaa1` · **head** `281ac26` before the merge below · working
  tree clean at each commit.
- **Specify, Design, Tasks, Execute (T1–T13) and independent validation ALL COMPLETE.**
  **Verdict: PASS** — `.specs/features/model-profile-registry/validation.md`.
- **PR [#51](https://github.com/luizgmassa/massa-ai/pull/51) opened against `main`.**
  `origin/main` had advanced two commits past this branch's base while the PR was being
  prepared — PR #50 (`judge-with-debate`, see the entry below) merged and released as
  v1.13.0, adding two new specialist charters (`judge`, `meta-judge`) that still declared
  the retired `metadata.model_hint`. Merged `origin/main` into this branch (not rebased —
  the 14 feature commits are cited by hash in `tasks.md`/`validation.md`) and migrated both
  new charters to `metadata.model_tier: deep`, matching their original Claude/Codex pins
  (`opus` / `gpt-5.6-sol`, both this registry's `deep` tier under the `balanced` profile).
  Their Cursor/OpenCode output now goes through the same emitter fixes as the other 15.

**Read `.specs/features/model-profile-registry/tasks.md` first** — it is the task contract:
per-task status with commit hashes, the five recorded amendments A1–A5, the accepted known
limitation, and the gate commands. Then `validation.md` (the single validation record — it
replaces two earlier reports rather than appending to them), `spec.md` (MPR-R1..R12 + ACs,
§4 enumerated behaviour changes, §7 per-host evidence, §8 the corrected baseline, §9 recorded
divergences), `design.md`, and `fool.md`.

Each commit carries its own rationale and gate evidence in its body. Read the commit, not a
summary of it.

**Validation used two of the three permitted fix loops, and the first verdict was FAIL.**
That matters more than the final PASS:

- **Gap 1 — MPR-R1's central acceptance criterion had no mechanism at all.** A model name
  typed into a charter's *prose* propagated into 1 charter + 4 mirrored charters + 4 generated
  agent bodies while `test:scripts`, `lint` and both `--check` drift gates stayed green.
  `loadCharter` rejects the retired `model_hint` KEY and the emitters only ever see a
  resolved pair, so nothing could see it. Closed by T10's `scripts/verify-model-tokens.ts`.
- **Gap 2 — a test named for a guard it never called.** "loadCharter throws rather than
  defaulting" used `parseFrontmatter` and asserted a field was undefined. The `design.md` §6
  mutation it was listed as killing survived it. Closed by T11.
- **Gap 3** — `design.md` and `tasks.md` still carried the 39-fact / two-profile design-time
  figures against a seven-profile registry. Closed by T12 as recorded amendments, not silent
  rewrites.
- **Iteration-1 residual** — the scan matched per *line*, so a display name split across a
  line wrap slipped through. Realistic here, because prose wraps at ~95 columns. Closed by T13.

**Open, deliberately — decided, not gaps:**

- `verify-model-tokens.ts` can false-fire on ordinary English use of the three bare Claude
  aliases (two poetry forms and the Latin for "a great work"). Dormant — no charter triggers
  it. Narrowing it was **declined**: gating those tokens on an adjacent `model` context word
  trades a loud, five-second-to-diagnose false positive for a *silent false negative* on a
  real duplicated fact. If it fires on you, reword the sentence rather than weakening the
  gate. The reason lives in the script's own docblock.
- Cursor ships `model: inherit` on every tier. Accepted risk with a recorded reason
  (`spec.md` §7) and a **skipped sensor** — `cursor-agent` is not installed here, so the
  hard-error-vs-fallback question is unresolved. Do not close it by guessing a slug.
- Codex IDs are SKIPPED by `verify:model-ids` (docs-only model list). Expected.
- `CLAUDE_CODE_SUBAGENT_MODEL` outranks frontmatter and so defeats every registry pin on
  Claude (`spec.md` §5). Documentation-only, not fixable in code. Documented by T7.

**Build all five packages before believing any test number** — `tasks.md` → Gate Check
Commands. Final green at `af79151`: `test:scripts` **857 pass / 0 fail**, `test:plugins`
**96 pass / 0 fail**, both `--check` "No drift", `lint` 0, `verify:model-tokens` 0,
`verify:model-ids` 0 with codex SKIPPED. massa-ai MCP tools were not registered in any
session that produced this work; all state came from `.specs/` files and source reads.

---

## Previous — Judge With Debate, VALIDATED PASS, merged and released as v1.13.0

**Feature**: `judge-with-debate` · branch `feat/judge-with-debate` (from `origin/main` @
v1.12.1). **ALL TASKS COMPLETE 2026-07-30. Independent validation PASS**
(`.specs/features/judge-with-debate/validation.md` — read the Addendum first: verifier had
no shell/write; sensor executions + file persistence are the main agent's, recorded as
accepted deviation). **Final gate: lint 0 · type-check 6/6 · test:scripts 773 pass / 0 fail
across 41 files · both generators `--check` No drift.** 4/4 discrimination sensors executed
+ killed. PR [#50](https://github.com/luizgmassa/massa-ai/pull/50) went green after one
repair iteration (stale 15→17 rosters in the plugin install-test surface, which only
`test:plugins` covers) and merged; released as `v1.13.0`. Main checkout also carries PR-B
(`core-layering-god-module-split`) Execute on `refactor/search-facade-split-phase-1` —
untouched by this feature.

## Previous — Core Layering and God-Module Split (PR-B), Phase 1 started

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

## Inactive — Plugin Auto-Install COMPLETE, validated PASS, PR #47 open + CI green

**Feature**: `plugin-auto-install` · branch `feat/plugin-auto-install`, rebased onto
`origin/main` @ v1.11.0 and pushed. **Specify, Design, Tasks, Execute (T1–T6), and
independent validation ALL COMPLETE 2026-07-29. Verdict: PASS** (`.specs/features/
plugin-auto-install/validation.md`). **PR
[#47](https://github.com/luizgmassa/massa-ai/pull/47) OPEN — 14 checks pass, 0 fail
(`install-test` skips by workflow condition; first-pass green, zero fix pushes).
DO NOT MERGE per user instruction — merge withheld for user review (merge to `main`
auto-cuts a release).**

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
