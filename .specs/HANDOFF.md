# Handoff

## Active — Core Layering and God-Module Split (PR-B), Phase 0 complete

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

## What happened after the PR opened, and why it matters

The PR was blocked on one red check, and closing it produced the two sharpest findings of the
whole feature. Both are recorded in full — T10 and the AC-5 note in T4.

1. **The coverage gate's first-ever CI run went red on a pre-existing defect** (`cc985905`,
   2026-07-13). `handoff-proposal-pg.test.ts` asserted `inet_server_port() === 5433`; that function
   reports the port PostgreSQL is bound to *inside the container* (5432), while 5433 is a host-side
   map. It cannot hold behind any Docker port map. It passed locally only because this host's 5433
   is a **native** install. The suite had never run in CI at all, because it is gated on a URL shape
   only `coverage.yml` — this feature's own T4 deliverable — ever produces.
2. **T4's gate reported and could not enforce.** AC-2 said "blocking — no `continue-on-error`".
   That governs whether the *check* goes red, not whether a red check *stops a merge*; the latter
   is the branch ruleset's `required_status_checks` list, which is a repo setting with no diff
   anywhere in this repository. `coverage` was absent from it. The gate written to prevent
   report-without-enforce was itself report-without-enforce. Fixed; recorded as **AC-5**.

**The generalisable lesson, and the reason this feature is worth reading later:** in eight of the
defects found here the artifact reported success while measuring nothing, and in six of those the
reason was an execution precondition silently unmet — an env var, a config field, a URL shape, a
required-checks entry. None of those preconditions lives next to the thing it gates. **A gate's
enabling condition is part of the gate, and must be asserted somewhere that fails loudly.**

## Final state of the gates

| Gate | Result |
| --- | --- |
| `Coverage` on the PR head `6533900` | **success** — run `30418495440`, `[coverage] PASS`, 314 files, **9** exclusions, 0 failing tests |
| `Coverage` on the merge commit `33efc82` | **success** — a second integrated run, in CI, with no developer config |
| `build` / `mcp` / `validate` / Structural ×2 | success |
| `coverage` in the `main` ruleset required checks | **present** — added during close-out, after the check went green |

Local gates from the pre-merge session are unchanged and still stand: `lint` 0 · `type-check` 6/6 ·
`build` 5/5 · `bun run test` 11/11 · `test:scripts` 634/0 + shell 5/22/26/11/8 · `test:plugins`
94/0 · `RUN_E2E=1 14.needles.test.ts` 1 pass/0 fail.

## Release

Merging cut the release chain automatically, as designed. `release.yml` fires on a green `CI` run
on `main`, derives the bump from `[Unreleased]` (all `### Fixed` → patch, so **v1.9.0 → v1.9.1**),
tags, and publishes to **npmjs.org and GitHub Packages**. Nothing was dispatched manually and
neither `release.yml` nor `publish.yml` was touched.

**If the chain did not complete**, do not re-run `release.yml` — it hits the tag-exists guard, and
`[Unreleased]` is already promoted so it derives `null` and exits at "no releasable entry". Recover
through `publish.yml` directly (`gh workflow enable publish.yml`, then
`gh workflow run publish.yml -f ref=vX.Y.Z`). See `CLAUDE.md`, "Recovering a half-released version".

## Traps that cost real time — keep these

- **`continue-on-error: false` is not "blocking".** Merge enforcement is the ruleset. Verify live:
  `gh api repos/luizgmassa/massa-ai/rules/branches/main --jq '[.[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context]'`.
  The context is the **job id**, not the workflow `name:`. Update via **PUT** (full replace) — a
  `PATCH` returns **404**, not 405, which reads like a permissions problem and is not one. Diff the
  whole ruleset before/after: the `DeployKey` bypass is what lets the release bot push the bump
  commit past the ruleset.
- **`inet_server_port()` is the container-internal port.** Never assert it against a host-side port
  map. Assert `current_database()` instead — it is what the client can actually observe.
- **A green gate can mean a skipped suite.** `bun test` exits 0 when everything skips. Assert the
  pass *count*, not the exit status. This is the feature's whole thesis and it caught T10's fix too.
- **"The API is down" is a claim to verify.** A tools-api orphaned to PPID 1 ran 48 minutes while a
  handoff said it was stopped, holding the indexing lease and sharing :3333 with a second instance.
  `pgrep -fl "tools-api"` cannot match it — its command line is `bun src/index.ts`. Use
  `lsof -nP -iTCP:3333 -sTCP:LISTEN`; **two LISTEN rows is the signal.**
- **A running tools-api on :3333 poisons `apps/mcp-client`.** 2 fail with it up, 6 with it up plus a
  scratch XDG, **95 pass / 0 fail in 4.34 s** with it stopped. Stop the API before `bun run test`.
- **The API resolves `@massa-ai/core` and `@massa-ai/shared` from `dist/`, not `src/`.** Core or
  shared changes need `bun run build` **and** an API restart — it runs under `start`, no hot reload.
- **`rtk` rewrites numbers and paths.** It truncated a gate log and mangled `find`. Use `rtk proxy`
  for anything you will cite as evidence.
- **`timeout` does not exist on macOS**, and there is no Grep tool — bash `grep` with quoted globs
  (`--include='*.ts'`). Long waits: `for i in 1 2 3; do sleep 55; done` with an explicit tool timeout.
- **Never write the skip-ci marker literally** in a commit body or PR body. A squash merge folds
  every commit body into the merge message; that killed v1.3.0. Checked clean (0) before merging.

## State of the machine, if you continue on this host

- **API is STOPPED.** Confirmed by port, not by name: `lsof -nP -iTCP:3333 -sTCP:LISTEN` empty.
- **Dedicated coverage DB up on 127.0.0.1:5433** (`massa_ai_test`) — and it is a **native** install,
  not a container. That is precisely why T10's assertion passed here and failed in CI. Different
  database from the dev one on 5432; do not conflate them.
- **Do not reset `e2e-ai-shared`.** It holds the bounded index (382 files, 4413 chunks, 4414
  vectors) that T6's gate reuses; rebuilding costs ~42 min.

## What a reader must not overclaim

T6's gate ran against a **bounded 382-file `.ts`-only corpus**, not the full warm shared index the
`hit@1 ≥ 0.36` / `hit@5 ≥ 0.64` floors were calibrated on. Fewer competing chunks makes retrieval
strictly easier, so **a pass there is weaker evidence than a pass on the full corpus, and the two
numbers are not comparable.** What the run proves is T6's actual subject: the sweep, the shared
resolver, `findRank` and the determinism assertions all execute end to end against a live API and a
real index. Recorded identically in `tasks.md`, `design.md` and `validation.md`.

No floor, needle query or needle content was edited to make anything pass. The `bge-m3` /
`qwen3-embedding:4b` option was considered and **not taken**: changing the embedding model changes
what the floors mean, and SEN-04's Out of Scope forbids touching floors in this PR.

## Open items for whoever picks this up

- **PR-B (`core-layering-god-module-split`) is unblocked.** Its whole thesis is that the sensors are
  trustworthy; they now are, with the caveat above. It is behaviour-preserving by design.
- **A full-corpus needles baseline is still owed** if anyone wants a number comparable to the
  floors. ~3.2 h at `qwen3-embedding:8b` on this host, and it cannot overlap `bun run test`.
- **Cross-package turbo concurrency against one database — still unfixed, still has no task.**
  `turbo.json`'s `test` task sets no concurrency limit and no cross-package ordering, so core,
  tools-api and mcp-client run simultaneously against one `DATABASE_URL` while
  `embedded-api-client-endpoints.test.ts` performs project resets there. Signature:
  `graph_generation_workspace_missing`. Each suite passes alone. **CI is equally exposed**, since it
  also runs one service database for all packages.
- **The ruleset is not self-healing.** Renaming `coverage.yml`'s job id, or any ruleset edit, silently
  un-blocks the gate with no diff in this repository. There is currently no sensor for that — which
  is, precisely, this feature's own defect class left open. Worth a task.
- **PR-A carried four behaviour changes, not the one the spec planned.** BEH-01, T6a, T6b, T6c —
  tabulated in `spec.md` under BEH-01. The last three cannot have been depended on, because the
  broken behaviour was "your configuration is ignored", and each has a default-parity test.
