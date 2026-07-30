# Handoff

## Active — Core Layering and God-Module Split (PR-B), Phase 1 started

**Feature**: `core-layering-god-module-split` · branch
`refactor/search-facade-split-phase-1b`, cut from `main` @ `5247ecb` (v1.11.0),
worktree `../massa-ai-wt-facade-phase-1b`.
**T6a and T6 are merged and released; T7, T8, T9, T10 and T11 are committed and green; T12 is not
started.** Working tree clean. Nothing is pushed — the branch is local only, now five commits deep.

**T11 is done — the F4 `IndexManager` seam, the only *added* seam in PR-B.**
`injectedDeps.indexManager` exists, the constructor's mirror type carries it, and
`ensureInitialized` reads `injected.indexManager ?? new IndexManager(this.vectorStore)`. **It is the
first Phase 1 task whose plan row survived execution unamended** — no eighth plan defect. Every
prediction held: **no structural sensor moved at all** (D1 9/6/626 unchanged, G-HUB `perModule`
byte-identical, `IndexManager` foreign 0 → 0 and reach 0 → 0), because T11 adds a field and moves no
function. AC-3 budget was **0** and **0** was spent: no existing test file appears in the diff.

**Two T11 results a resumer should not re-derive.**

- **Three violation shapes, all three red on the new sensor, and `tsc` blind to all three.** The plan
  named two (seam never consulted; default path deleted). A third — **seam correct but hoisted above
  the `Promise.all`**, so the default construction captures an unresolved `this.vectorStore` — still
  satisfies `instanceof IndexManager` and was surfaced by the plan critic, not the plan. It is why the
  default-path test asserts *which* vector store the constructed manager holds. **Two of the three are
  invisible to every pre-existing suite**: the repository's only prior assertion about this member was
  `rlm-indexing.test.ts:201`'s `toBeDefined()`, which catches the second shape (**24/1**) and neither
  other. That is plan-challenge finding 7 discharged by measurement instead of argument.
- **`indexManager?: IndexManager` does *not* fire T10's seventh defect, and the `?` is why.**
  `search-hub-metric.ts:139`'s pattern is `([A-Za-z0-9_]+)\s*:\s*<Type>\b` and `\s*` cannot match `?`,
  so an **optional** field is never captured as a binding — the same route by which the existing
  `indexManager!: IndexManager` at `contextual-search-rlm.ts:93` has always escaped it. Independently
  moot anyway: `perModule` only gains an entry on a *dereference*, and that file has no
  `indexManager.<member>` — only `this.indexManager`, attributed to `ContextualSearchRLM`. Both routes
  **measured**, not reasoned. **The T10 `Pick<>` decision does not apply here and must not be applied
  by analogy**: the seam's value lands in the public field `indexManager!: IndexManager`, so a `Pick<>`
  seam would need a cast to be assignable. **Residual risk: a later edit dropping the `?`**, or
  restyling the record into `IndexerDeps`' required-field shape — nothing fails until T14's gate. The
  field carries a comment saying so.

**Two findings from T10 that a resumer must not re-derive, and one open question for the reviewer.**

1. **Seventh plan defect — the deps-record pattern is *not* G-HUB-neutral.** Typing a record field
   with a bare nominal type that is **declared inside `services/search/`** makes the hub metric
   attribute that module's reads to it: `indexManager: IndexManager` took `IndexManager`'s
   `maxForeignReach` from **0 to 4** and gave the tree **two** G-HUB violations where it had one,
   which would have made T14's gate unclosable. Cause is `search-hub-metric.ts:139`'s annotation
   pattern not distinguishing an interface field declaration from a parameter. Fixed inside T10 by
   narrowing the field to `Pick<IndexManager, …4 methods>`, which is also the honest type.
   **T12 and T13 will each hit this**: `fileFilterCache: FileFilterCache`, any
   `SearchAnalytics`/`SearchAnalyticsPg` field, and `queryUnderstanding: QueryUnderstandingService`
   are all declared in that directory. **Add to both tasks' sensor lists**: the hub metric must report
   exactly **one** type above the ceiling and it must be `ContextualSearchRLM`. Reading only the
   `ContextualSearchRLM` row is what let this through for one measurement.
   **Settled by the reviewer at the T10 review point: `Pick<>` per record is the pattern.** Rescoping
   the ceiling inside `search-hub-metric.ts` was rejected — it edits a sensor during the refactor that
   sensor polices. The accepted cost is that "remember to narrow" is a precondition of T14 going
   green, so it is carried as a **sensor** on the T12 and T13 rows rather than as advice.
2. **PATCHABLE's footprint is 6 sites wider than the constraint names, and they are invisible to the
   established regex.** `rlm-indexing.test.ts` stubs `rlm.indexFile` (:377, :402, :537, :572, :609)
   and `rlm.indexProject` (:335) as **bare assignments with no `as any` cast**, so the sweep for
   `)\.\(ensureInitialized\|_indexProjectInternal\) *=` finds none of them — the first T10 sweep
   reported zero and was wrong. Every one is exercised *through* `ensureFreshIndex` or
   `_indexProjectInternal`, so `IndexerDeps` carries `indexFile` and `indexProject` as **per-call
   arrow wrappers**. A module-local call would compile, type-check, and make all six silently
   ineffective. The 16-site figure for the two named methods still reproduces exactly.

> **Two reviewer decisions taken at the T11 boundary (2026-07-29), both binding on T12.**
>
> 1. **Stop at T11; T12 runs in a fresh session.** Not an interruption — T11 is committed, green and
>    complete, and `.specs/` is current at `23470ce`. The reason is context budget, not scope: T12 needs
>    `rlm-admin.ts`, its suite, the re-entrant `search` callback, two `Pick<>` narrowings, the memo
>    mutation and the bare-assignment sweep, and starting it without room to finish risks an
>    uncommitted partial extraction — the exact state one-atomic-commit-per-task exists to prevent.
> 2. **T12 must also fix the stale Status line at `tasks.md:10-12`**, which still reads *"Phase 0
>    (T0–T5) COMPLETE … T6 not started"* and has been false since T7. Fold the one-line correction into
>    T12's own commit, the way T10 corrected stale comments in files already inside its write set —
>    **not** as a separate docs commit, and not left to T19. Correct it to name T6a–T12 as executed and
>    point at *Phase 1 — executed* for per-task state. It changes no behaviour and needs no sensor; it
>    is in scope because T12 is already editing that file to add its own executed row.

**Next action: T12** — indexing admin surfaces, `rlm-admin.ts` → `index-admin.ts`, 1.5 h. Four exports
(125 LOC): `clearProjectIndexImpl`, `getProjectStatsImpl`, `warmupCacheImpl`, `getAnalyticsImpl`.
**Read T12's row and the ordering fact it depends on before starting**: `warmupCacheImpl` reads
`search`, which does not exist in `hybrid-search.ts` until T13, and §12 item 4 orders index-admin
first — so `IndexAdminDeps.search` is a **re-entrant callback through `this.search`** (T10's per-call
arrow-wrapper pattern), not a reason to reorder the tasks. T12 must also: narrow `fileFilterCache` and
any `SearchAnalytics`/`SearchAnalyticsPg` field with `Pick<>` (T10's seventh defect — these are
*required* record fields, so unlike T11's optional seam they **will** fire); run the memo mutation
against its own surface on a delegate with **no preceding `await`**; and sweep for bare
`rlm.<method> =` as well as `(rlm as any).<method> =`. Then **T13** (5.5 h, most likely to overrun),
and stop at **T14** where G-HUB going green proves the split.

**Read the branch note before anything else.** T6a and T6 landed in `main` via **PR #46, which was
squashed, not merged** — R-04 was violated. None of its 8 commits are ancestors of `main`, the
per-commit sensor evidence survives only in `.specs/`, and the old branch
`refactor/search-facade-split-phase-1` is deleted. That is why this branch is `-1b` and not a
resumption of the old name: reusing it would make the commit table below ambiguous against a
history that no longer exists. `refactor/search-facade-split` (Phase 0's, `23e68b9`) still exists on
the remote and is **not** this work. **This PR must be merged with a merge commit.**

| # | commit | deliverable |
| --- | --- | --- |
| T6a/T6 | in `main` via #46 (squashed) | `capture-facade-baseline.ts` + 3 frozen fixtures; `rlm-fusion.ts` → `result-fusion.ts` |
| T7 | `3e46eae` | `buildGraphStream` → `graph-stream.ts`, plus the sensor amendment |
| T8 | `29ea8b9` | `applySynapseState` → `session-bias.ts` with `SessionBiasDeps`; the AC-2 and LATE-BIND sensors |
| T9 | `2664008` | `correctQuery` → `hybrid-search.ts` with `HybridSearchDeps`; **`rlm-synapse.ts` deleted whole**; a second LATE-BIND sensor |
| T10 | `b9d444d` | six indexing surfaces → `project-indexer.ts` with `IndexerDeps`; `ensureInitializedImpl` absorbed into the root; **`rlm-indexing.ts` deleted whole**; a third LATE-BIND sensor |
| T11 | this commit | `injectedDeps.indexManager` — the F4 seam (the only *added* seam in PR-B); `index-manager-seam.test.ts`, red under three violation shapes |

Gates at T10: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass / 0 fail
across 39 files** · `check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0 (3/3) ·
characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite individually
unchanged · `search-synapse-integration` **5/0** · `session-bias` **10/0** ·
`session-bias-late-bind` **3/0** · `hybrid-search-late-bind` **3/0** · `search-ranking-regression`
**2/0** · new `project-indexer-late-bind` **4/0** · G-HUB exit 1, 25 files, **foreign modules 4 → 3**,
reach **14** by `rlm-search.ts`, members **23**, largest file now `project-indexer.ts` **641**,
`perModule {csr 14, admin 7, search 14, warmup 1}` · D1 `delegateScope` **16 → 9**, facade-taking
**11 → 6**, scoped LOC **1108 → 626** · EXCLUSIONS **9**.

Gates at T11 — **every structural figure byte-identical to T10, which is the prediction**: `lint` 0 ·
`type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass / 0 fail across 39 files** ·
`check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0 (3/3) · characterization net
**160** across 7 suites (26·41·31·21·25·7·9), every suite individually unchanged ·
`search-synapse-integration` **5/0** · `session-bias` **10/0** · `session-bias-late-bind` **3/0** ·
`hybrid-search-late-bind` **3/0** · `project-indexer-late-bind` **4/0** ·
`search-ranking-regression` **2/0** · new `index-manager-seam` **3/0** · G-HUB exit 1, 25 files,
foreign **3**, reach **14** by `rlm-search.ts`, members **23**, `perModule {csr 14, admin 7, search 14,
warmup 1}`, and **exactly one type above the ceiling** — the T10 seventh-defect check, run and passed ·
D1 `delegateScope` **9**, facade-taking **6**, scoped LOC **626** · EXCLUSIONS **9** · CHANGELOG
released section still **974 lines**, T11's entry in `[Unreleased]` under `### Changed` and absent from
the released section, verified in both directions.

**`perModule csr` went 5 → 14 and that is the target state, not drift.** The nine new members arrive
from the absorbed `ensureInitialized` body, the three hoisted `await this.ensureInitialized()`
statements and `#indexerDeps()`. It now *ties* `rlm-search.ts` at 14 — but `foreign` excludes the
declaring file (`search-hub-metric.ts:150`), so `maxForeignReach` is still **14 by `rlm-search.ts`**
and there is still exactly **one** G-HUB violation. Predicted on paper before the edit.

**LATE-BIND at T10, measured not inherited** — and it settles the T9 finding for good.
`rlm-indexing.test.ts` holds **52 of the ~80** assignment sites, the richest surface in the repo, and
it is *still* blind to a first-call memo: construction capture gives coverage **33/8** and
`rlm-indexing` **8/17**, while the memo gives **41/0** and **25/0** with `tsc` at 0. Closed by
`project-indexer-late-bind.test.ts` (4 tests; **4/0** honest, observed **2/2** under the memo, **3/1**
under `.bind(this)` at assembly time, **3/1** under an eighth-key leak). **T12 and T13 must still run
it themselves** — the finding is that the assignment-site inference is invalid, not that the answer is
always "blind". Both mutations were verified *applied* before their readings were believed.

**The mutation shape matters at T10 and after.** The blind recursion run on `checkSearchAdmission`
**hung** instead of failing at the 5 s budget, and the run was killed at 10 minutes: T10 hoists
`await this.ensureInitialized()` above the delegate call, so the recursion is an unbounded *microtask*
chain that never yields to the macrotask queue, and the per-test timer cannot fire. Run it on a
delegate with **no preceding `await`** — at T10 that was `indexFile`, giving `tsc` 0, coverage 39/2,
`rlm-indexing` 22/3. T12 and T13 hoist init the same way.

**Read before resuming**: `tasks.md` → *AC-3 vs GMS-03 AC-1*, *Phase 0's before-baselines were
live-tree assertions*, *T6's sensor was unfirable*, *the foreign-module count is not a per-task
sensor either*, *LATE-BIND has no sensor at T8*, **the new *LATE-BIND's ordinary sensor does not
"come back" at T9* section**, the `ensureInitializedImpl` section (T10 owns it), *T15's sensor,
scoped* — including **the new note that its site list is frozen at `ce26f28` and Phase 1 has grown
it to 27 files** — then the Phase 1 table and *Phase 1 — executed*.
Then `STATE.md` → *Execute — Phase 1 STARTED*.

**The T9 finding that changed how T10, T12 and T13 must sensor themselves — T10 has now discharged
its half of it; T12 and T13 have not.** T8 recorded that
LATE-BIND self-heals from T9 because `keywordSearch` has 10 post-construction assignment sites.
**Measured at T9: that reasoning uses the wrong quantity.** The existing suites catch a
*construction* capture loudly (`rlm-synapse` 21/5, `search-ranking-regression` 1/1) and are
**completely blind** to a *first-call memo* (`tsc` 0, coverage 41/0, `rlm-synapse` 26/0,
`search-ranking-regression` 2/0). All six call sites do construct → assign → call, so a memo
populates after the assignment and captures the correct value; detecting one needs a collaborator to
**change between two calls on one instance**, and that count is **zero**. Closed by
`hybrid-search-late-bind.test.ts` (3 tests, observed **1/2 red** under the memo mutation and again
under the construction capture, **2/1** under a third-key leak). **T10/T12/T13 must each run the memo
mutation against their own surface and record the reading** — none may cite the assignment-site count
as evidence of coverage. `session-bias-late-bind.test.ts` was deliberately left untouched at 3 tests
rather than extended.

**Three T8 findings a resumer should not re-derive:**

- **LATE-BIND is not sensorable at T8, and now has a dedicated sensor.** `injectedDeps` is `readonly`
  with **zero** post-construction assignment sites, so capturing the deps record instead of
  assembling it per call passes `tsc`, the full **160/0** characterization net, and T8's own AC-2
  sensor. Full measurement in `tasks.md`. Closed by
  `packages/core/src/__tests__/session-bias-late-bind.test.ts` (3 tests, observed **2/1 red** under
  the mutation). **From T9 on the ordinary sensor takes over** — `keywordSearch` has 10
  post-construction assignment sites, so `rlm-search.test.ts`'s **31** and `rlm-synapse.test.ts`'s
  **26** are load-bearing at T9 in a way they were not at T8.
- **Which `this.`-recursion `tsc` can see depends on whether the module takes deps.** A deps-taking
  module is one argument wider than its facade method, so the naive substitution is **caught**
  (`TS2554: Expected 3-5 arguments, but got 6`). The blind variant is recursion that **also drops the
  deps record** — arity-identical, `tsc` exit **0**, coverage **39 pass / 2 fail**. **That is the
  mutation to run at T9/T10/T12/T13**, not T7's.
- **`toHaveBeenCalledWith` treats an undefined-valued key as absent.** `f({})` satisfies
  `toHaveBeenCalledWith({a: undefined})` — measured. So a deps-record assertion built from a facade
  with no injected deps proves nothing about the record existing. Inject defined stubs; then extra
  keys still fail and the check is exact.

**The foreign-module count moved at T9, exactly as predicted, and is spent.** Base 5, +T7 5, +T8 5,
**+T9 4** — three consecutive predictions held to the number. `rlm-synapse.ts` has left `perModule`
entirely. **It is not a sensor for T10–T13**: `rlm-indexing.ts`, `rlm-admin.ts` and `rlm-search.ts`
each keep members until their own extraction lands, so the next decrements are T10's, T12's and
T13's respectively, and **reach stays 14 until T13** because the maximum is `rlm-search.ts`'s.
**G-HUB exiting 1 remains correct until T14.** The per-task sensor for T10/T12/T13 is the D1 matrix
delta plus that task's own suite pass count.

**One `perModule` figure moves in the other direction and it is expected**:
`contextual-search-rlm.ts` **4 → 5** at T9, because `#hybridSearchDeps()` reads `this.keywordSearch`
and nothing in the root's class body read that member before. The declaring file is excluded from
`foreign` (`search-hub-metric.ts:150`), so it never touches `maxForeignReach`. Expect the same
increment at T10/T12/T13 and a high final figure at T14 — a composition root reading its own fields
is the target state.

**`rlm-synapse.test.ts` was deliberately left untouched at T7, T8 and T9**, so its sensor stays
exactly **26** and all three tasks stay inside AC-3's bound. Consequence: its header comment and all
three `describe` block names now cite functions that live in `graph-stream.ts`, `session-bias.ts` and
`hybrid-search.ts`. The tests themselves are correct — they drive the surviving facade methods, and
its five `correctQuery` cases are now load-bearing LATE-BIND evidence for T9. **Registered as T15
sites**; T20's verifier must not read the stale names as evidence the moves did not happen. The
**source** `rlm-synapse.ts` is gone as of T9; the **test** file survives PR-B and its own name is a
T15 decision.

**T15's site list is frozen at `ce26f28` and Phase 1 has outgrown it — re-enumerate, do not work
from it.** Measured after T11: **29** tracked files carry `rlm-` outside `CHANGELOG.md` / `.specs/` /
`.ua/`, against the 19 recorded in the plan, 27 after T9 and 28 after T10 (`rlm-indexing.ts` left the
set, `project-indexer.ts` entered it, and each new sensor file is a `+1` — T11's
`index-manager-seam.test.ts` cites `rlm-indexing.test.ts:201`, **class 1**). **Take the count with the
new files staged** — `git grep` enumerates tracked files only, and the same command run before
`git add` reported 28. **Enumerate with `git grep` and explicit pathspec exclusions, never the shell's
`grep`**: the plan critic independently measured this as **19** using a `grep` honouring `.gitignore`
(the repo's `grep` is a ugrep shim), which is the same two-methods-two-answers failure this feature has
now hit six times. Every extraction adds a provenance comment naming the
file the body came from. Two classes, and T15 must not conflate them: references to `rlm-*.test.ts`
(those files *survive*; renaming them is T15's own decision) versus references to a now-deleted
`rlm-*.ts` source (`docs/ONBOARDING.md:148`, `graph-stream.ts:11`, `session-bias.ts:20`,
`hybrid-search.ts:11,15,24`, `contextual-search-rlm-coverage.test.ts:158`). Full breakdown in
`tasks.md` under *T15's sensor, scoped*.

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

**Rebase note**: this branch is cut from `origin/main` @ `5247ecb` and is current with it.
Merge must be a merge commit, not a squash (R-04) — see the branch note above for what a squash
already cost once.

**CHANGELOG**: `[Unreleased]` now carries T7, T8, T9 and T10 under `### Changed`. Once `main` cuts
another release, verify **both** directions positionally after any merge — that this branch's entries
are in `[Unreleased]` **and** absent from the released section, and that the released section is
byte-identical to its published form. Asserting only that the old entry survived is the asymmetric
check that missed it last time. Verified at T10: released section **974 lines, byte-identical** to
`2664008`, all four entries present in `[Unreleased]` and none of them in the released section.

**Release semantics: settled at the T10 review point — stays `### Changed`, which derives a minor.**
Left open at T7, T8, T9 and T10 and now closed, so no later task needs to re-raise it. The reasoning
is that the module layout, exported symbols and file names are a public compatibility surface per
`CLAUDE.md`, and PR-B deletes `rlm-synapse.ts` and `rlm-indexing.ts` outright — a minor announces
that, where a patch would not. Do **not** move these entries to `### Fixed`.

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
