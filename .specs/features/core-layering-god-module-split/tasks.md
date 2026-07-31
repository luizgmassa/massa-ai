# Core Layering and God-Module Split — Tasks (PR-B)

- **Slug**: `core-layering-god-module-split` · **PR-B** · branch `refactor/search-facade-split`
- **Requirements**: GMS-03, GMS-04 · validated by GMS-05. **Not** GMS-01/GMS-02 (PR-C) or AS-06 (PR-D).
- **Design**: `design.md` — read §3.4 (G-HUB), §4.3.1 (LATE-BIND), §4.4 (module shape), §6.1
  (FROZEN-ANCHOR), §5.4 (the PR-C boundary) before the first structural commit.
- **Status**: written 2026-07-29 against `main` @ `ce26f28`; **revised 2026-07-29** after an
  independent Plan Challenge on this file (see [Plan Challenge — tasks](#plan-challenge--tasks)).
  Approved. Execute authorised. **The branch named on the Slug line above is Phase 0's and is not
  this work** — T6a/T6 ran on `refactor/search-facade-split-phase-1`, which reached `main` through
  the **squashed** PR #46 (R-04 violated) and is deleted; T7 onward lives on
  **`refactor/search-facade-split-phase-1b`**, cut from `main` @ `5247ecb`.
  **Phase 0 (T0–T5) and Phase 1 (T6a–T14) are COMPLETE; Phase 2 is open with T15–T19 executed and
  T20 — independent validation — the only task left.** See
  [Phase 0 — executed](#phase-0--executed), [Phase 1 — executed](#phase-1--executed) and the
  per-task *executed* sections below for commits and observed sensors; those are authoritative for
  task state, not this line. *(This line read "T6 not started" and had been false since T7;
  corrected at T12 per the T11-boundary reviewer decision. It then read "T15 is next" and had been
  false since T15; corrected at T19, again inside that task's own commit rather than as a separate
  docs commit — the same precedent.)*

**One atomic commit per task. Each carries its own discriminating sensor.** No task is done because
it looks done; the sensor decides.

---

## Standing constraints — violate any of these and the task is wrong, not just risky

| id | constraint | check |
| --- | --- | --- |
| **LATE-BIND** | Capability modules resolve collaborators **at call time** from the root's current fields. Never capture them at construction. ~80 test sites across a dozen files assign facade state post-construction; capturing makes those stubs silently ineffective. | `rlm-indexing.test.ts` pass **count** — the sensor, not the site count |
| **FROZEN-ANCHOR** | Four needle anchor strings are frozen text. Moving them between files is safe; rewriting or reflowing them is not. | `scripts/check-frozen-anchors.ts` (T3) |
| **PATCHABLE** | `ensureInitialized` and `_indexProjectInternal` stay public patchable instance methods; internal calls route through `this.`. **16 monkey-patch sites across 3 files** (measured — see below). | `concurrent-indexing.test.ts` pass count |
| **PR-C-BOUNDARY** | Do not move or rename `search-diagnostics.ts` or `lexical-search.ts`. Either alters a `data → services` edge and absorbs PR-C's unanswered contract question. | `git diff --name-only` review per commit |
| **AC-3** | No test weakened, skipped or deleted. **Signature-tracking edits are authorised and bounded** — see [AC-3 vs GMS-03 AC-1](#ac-3-vs-gms-03-ac-1--the-zero-test-edits-claim-is-false) below. The original "**zero** test-file edits except the 4 rename sites" is **false** and was retired at T6. | per-suite pass counts unchanged (160 net); `contextual-search-rlm-coverage.test.ts` stays at **41** tests; zero assertions deleted; zero skips |
| **AC-2** | No new exclusion in `scripts/check-coverage.ts`. Count stays **9**. | `bun -e '…EXCLUSIONS.length'` |

The four frozen anchors — each unique in its file:

```
rlm-fusion.ts   const KEYWORD_BOOST = isCodeQuery ? codeKeywordBoost : 1.0;
rlm-fusion.ts   const rrfNormalized = rrfScore / maxRrfScore;
rlm-fusion.ts   const normalizedScore = Math.min(1, combinedScore * (1 + 0.2 * centralityScore));
rlm-search.ts   rerankedTop = applyProximityRerank(rerankInput, query);
```

All four verified present and **exactly once** repo-wide at `ce26f28`, enumerated via `git ls-files`.

### Measured sensor baselines at `ce26f28` — assert these counts, not exit status

Every number below was re-measured in the Execute session under a scratch `XDG_CONFIG_HOME`.
**Two figures carried from `design.md` did not reproduce and are corrected here.**

| suite | pass | fail |
| --- | --- | --- |
| `rlm-indexing.test.ts` | **25** | 0 |
| `rlm-search.test.ts` | **31** | 0 |
| `rlm-synapse.test.ts` | **26** | 0 |
| `rlm-admin.test.ts` | **7** | 0 |
| `concurrent-indexing.test.ts` | **9** | 0 |
| `contextual-search-rlm-coverage.test.ts` | **41** | 0 |
| `contextual-search-rlm.characterization.test.ts` | **21** | 0 |
| **characterization net total** | **160** | 0 |

160 reproduces `design.md` §4.6 exactly. Other gates: `lint` **0** · hub-metric suite **13 pass /
0 fail** · hub-metric on `services/search` exit **1**, `ContextualSearchRLM` reach **14** by
`rlm-search.ts`, largest file `rlm-indexing.ts` **592** · `scripts/__tests__` **602 pass / 0 fail**
across 28 files · `check-coverage.ts` exclusions **9** · `:3333` free.

> **Capture the exit code directly.** `bun scripts/search-hub-metric.ts <dir> | tail -n 12` reports
> `tail`'s status, not the script's, and prints `0` on a failing gate. Redirect to a file and read
> `$?`, or the G-HUB gate silently inverts.

**Two corrections to `design.md`'s constraint provenance.** Neither weakens the constraint; both
are recorded so a later reader does not treat an unverified figure as measured.

- **PATCHABLE — 16 sites across 3 files, not 4.** Measured over `git ls-files
  'packages/core/src/**/*.test.ts'` for assignment and `spyOn` forms of `ensureInitialized` /
  `_indexProjectInternal`: `concurrent-indexing.test.ts` **10**,
  `contextual-search-rlm.characterization.test.ts` **5**, `rlm-search.test.ts` **1**. The count
  reproduces; `design.md` §4.5's "4 files" does not.
- **LATE-BIND — "77 sites across 12 files" is not a verified number.** `design.md` §4.3.1's
  per-member table *sums to 82* while its prose says 77, and under direct measurement two rows
  (`keywordSearch`, `vectorStore`) miss by one once the `LoadStage` assignments in
  `graph-generation-symbol-repository-pg.test.ts` — which are not on the facade — are excluded.
  The order of magnitude is right and the constraint is untouched: there are ~80 post-construction
  assignment sites on `ContextualSearchRLM` across a dozen test files, and capturing collaborators
  at construction makes every one of them silently ineffective. **The sensor is the per-suite pass
  count above, which is exact.** The site count is provenance, and it is approximate.

---

## Phase 0 — sensors before structure

No structural commit may land before Phase 0 is complete. G-HUB and the needles comparison are
**before/after** measurements; a reading taken after the change proves nothing.

| # | task | sensor (what would fail if the task were wrong) | cost |
| --- | --- | --- | --- |
| **T0** | **Commit D2.** `scripts/search-hub-metric.ts` + its 13 tests were *written* during Design but **never committed** — `git log --all -- scripts/search-hub-metric.ts` was empty and `git status` showed them untracked. They land as the **first commit of Execute**, with the `.specs/` artifacts that cite them. Spec-owner decision: keep the script (correct, tested, attacked three ways) rather than revert and re-derive a measurement that was already wrong four times; only its *provenance claim* was false. | `git log -1 --format=%H -- scripts/search-hub-metric.ts` non-empty; 13 pass / 0 fail; **real** exit 1 on today's tree | 30 m |
| **T1** | Ship **D1** `scripts/search-facade-matrix.ts` + tests. Regenerates §2's matrix. | fixture pins `searchImpl`=13 members, 21 exported fns, 6 with no facade param; a body-boundary regression test for the `= {}` defect | 45 m |
| **T2** | Ship **D3** `scripts/search-facade-metrics.ts` + tests. Fan-in/fan-out over `git ls-files`. Also settles §5.1's importer count. | fixture pins fan-in **24** static / **26** with the two dynamic sites, fan-out **19** | 45 m |
| **T3** | Ship `scripts/check-frozen-anchors.ts` + test. Asserts each of the 4 anchors appears **exactly once** repo-wide. | mutate one anchor in a scratch copy → script exits non-zero | 30 m |
| **T4** | **Needles before-baseline.** Run the gate on clean `main`; diff programmatically against `benchmarks/needles/reports/massa-ai-after-t5b-recovery-results.json` (captured at `5e018e5`; 3 commits since). Compare hit lists and score vectors, **not** the printed table. | the diff script itself: feed it two runs with one needle moved rank 1→4 and confirm it reports a regression | **~2 min per run** + 30 m tooling |
| **T5** | **Characterization record** (GMS-05 AC-1). Write the §4.6 inventory plus the corrected LATE-BIND / PATCHABLE measurements into `validation.md`. Add a guard test for the three single-points-of-truth: `extractPreview`, `calculateAvgScore` (only in `contextual-search-rlm.characterization.test.ts`) and `_indexProjectInternal` (only in `rlm-indexing.test.ts`). | **strengthened**: block presence is not enough — a `describe("extractPreview", …)` whose body is hollowed to `expect(true).toBe(true)` keeps its name and loses the protection. The guard asserts each block's **non-trivial assertion count** (`toBe`/`toEqual`/`toThrow`/`toHaveBeenCalled*`) is at or above a pinned floor, and is observed **red** against a hollowed scratch copy before it is trusted | 1 h |

> **T4 cost correction.** `spec.md` GMS-05 AC-4 note 3 says *"Each observation costs roughly 90
> minutes and a local Ollama"* and tells you to budget it. **That figure is wrong** — 90 min is
> `needles-gate.yml`'s 2-core CI estimate carried into a local-cost table. Measured locally:
> **~2 minutes.** Budget the runs accordingly; this is spec correction C3. **Confirmed at T4:
> the full gate run took well under two minutes** on the 8-file corpus.

---

## Phase 0 — executed

Complete 2026-07-29. Six commits, one per task, on `refactor/search-facade-split`.

| # | commit | deliverable | sensor observed |
| --- | --- | --- | --- |
| T0 | `ab80e62` | `scripts/search-hub-metric.ts` + 13 tests, and the `.specs/` artifacts | real exit **1** on today's tree |
| T1 | `3dee676` | `scripts/search-facade-matrix.ts` + 20 tests (D1) | fixture pins; 3 defects each reintroduced and observed red |
| T2 | `8fd3983` | `scripts/search-facade-metrics.ts` + 18 tests (D3) | fan-in 24/26, fan-out 19; self-count defect observed red |
| T3 | `e359115` | `scripts/check-frozen-anchors.ts` + 9 tests | reflow → exit 1; verbatim move → exit 0 |
| T4 | `0129207` | needles baseline + `scripts/needles-diff.ts` + 17 tests | rank 1→4 → exit 1; gate PASS at MRR 0.7357 |
| T5 | `06bde32` | `scripts/check-characterization.ts` + 14 tests, `validation.md` | hollowed real block → red on both floors |

Final gate readings: `lint` 0 · `type-check` 0 · `test:scripts` **725 pass / 0 fail across 39
files**, exit 0 · `check-frozen-anchors` exit 0 (14/14 unique) · `check-characterization` exit 0
(3/3 at floor) · characterization net **160** across 7 suites · G-HUB exit 1 at reach **14** ·
PATCHABLE **16 across 3 files** · coverage exclusions **9**.

The full before-record is `validation.md`. It carries no verdict; that is T20's.

### What Phase 0 changed in the plan

Five things a later reader should not mistake for drift.

1. **T2's "17 pass / 0 fail" was an artifact of the state it was measured in.** The suite was
   verified while its own two files were **untracked**, and the tool enumerates `git ls-files`,
   so the corpus tests were blind to their own source. Staging them moved fan-in to **27** and
   turned 3 of its own tests red — the fixture pasted the facade's real dynamic-import specifier
   verbatim, and a regex over comment-stripped source cannot see through a template literal.
   **Any measurement script in this repository has to be verified in the tracked state it will
   ship in**, not the state it was written in. It cost the same defect three times in one
   session (T2's fan-in, then the mention-only count twice more).
2. **T3 reuses `benchmarks/needles/resolve.ts` rather than implementing the check.** PR-A
   already made 0-match and >1-match hard failures (AC-8/AC-9). A second implementation is the
   drift surface this repo keeps paying for, and a pre-flight gate that can disagree with the
   gate it stands in for is worse than none. The anchors are **read from the fixture, never
   listed** — `resolve.ts` scans every `.ts`/`.tsx` under the root, so a checker holding its own
   copy of the four strings would make all four ambiguous and fail on its own existence.
3. **"Each anchor appears exactly once repo-wide" was already false** when written. Each of the
   four appears 4–6 times across tracked files: once in source, once in the fixture that defines
   it, 2–4 times in `.specs/` prose. It is true only inside `resolve.ts`'s `.ts`/`.tsx` corpus,
   which is the scope the real gate uses. Same shape as T15's sensor, found independently.
4. **T4 required a change to `benchmarks/needles/run.ts`.** Reports recorded only hits, so rank
   had to be recomputed against a tree — and after PR-B renames `rlm-fusion.ts` that resolves the
   anchor to its new home, matches nothing in the old hit list, and reads as a miss on every
   needle. A before/after diff would have shown a total collapse manufactured entirely by the
   measurement. `run.ts` now records `rank` and the resolved `expected` span. The baseline lives
   in `.specs/features/…/needles-before.json`, not `benchmarks/needles/reports/`, which is
   gitignored — a baseline that does not survive a fresh checkout cannot be T17's referent.
5. **T5's guard lives in `scripts/__tests__`, not `packages/core/src/__tests__`.** Core's
   isolated-group count is pinned at **126** by PR2's T20; a new file there would make it 127.
   Its blocks are located **by symbol, not by path**, so PR-B's rename does not force an edit to
   the guard — editing a guard during the refactor it polices is the same motion as weakening
   it, and indistinguishable from it in a diff.

### Flake seen once, attributed, not chased

`scripts/tests/test-setup-wizard-db-selection.sh` → `not ok - migrations fail closed` failed on
one of three consecutive `bun run test:scripts` runs. All 20 shell suites pass standalone; the
other two aggregate runs were clean. It touches no path Phase 0 changed. Recorded per the
standing instruction — if it returns, attribute before debugging.

---

## Phase 1 — extraction, cheapest and most separable first

Order is the matrix's, not preference: fewest facade members first, so the pattern is proven where
it is cheapest and `searchImpl` (455 LOC, 13 members) lands last, when everything it calls exists.

| # | task | from → to | members to remove | sensor | cost |
| --- | --- | --- | --- | --- | --- |
| **T6a** | **freeze Phase 0's before-baselines** — `scripts/capture-facade-baseline.ts` + three committed fixtures; re-point 9 assertions. Unplanned; see [the section below](#phase-0s-before-baselines-were-live-tree-assertions). | — | — | three mutants observed red first: a dropped delegate row, a whitespace-reflowed anchor, and a forced re-capture over a changed subject. Then: the three suites green **both** at base **and** with T6 applied — the second is the whole point | 1 h |
| **T6** | `fuseResults`, `generateScoreExplanation` | `rlm-fusion.ts` → `result-fusion.ts` | `RRF_K` → module const. **No deps parameter at all.** **Also updates two files the original row missed**: the re-export at `rlm-search.ts:498-501` (`export { fuseResultsImpl, generateScoreExplanationImpl } from "./rlm-fusion.js"`) and the import block at `contextual-search-rlm.ts:52-53`, which reaches these two symbols **through `rlm-search.js`, not directly**. | **hub-metric foreign modules 6 → 5** (*not* reach — see the correction below); frozen-anchor check (3 of the 4 live here); `rlm-search.test.ts` **31** + characterization **21** + coverage **41** pass counts | 1.5 h |
| **T7** | `buildGraphStream` | `rlm-synapse.ts` → `graph-stream.ts` | none — it already reads **zero** facade members, but its signature still *takes* one (the deliberately-unused `_rlm`), and dropping it is what makes the file `graph-stream.ts` rather than a rename | **D1 `delegateScope`: 19 → 18 rows, facade-taking 14 → 13, scoped LOC 1310 → 1186**, and `buildGraphStream` reappears in `all` with `facadeParam: null`. **Not** the foreign-module count — it cannot move here; see the correction below. Plus invariance: `rlm-synapse.test.ts` **26** (the "14" in the first draft is the `buildGraphStream` describe block, not the file total) and coverage **41**; and a runtime mutation pair, since `tsc` is blind to `this.`-prefixed recursion. `graph-stream-project-scope-pg.test.ts` imports it directly, needs a live DB, and passes `NO_RLM` at **3 call sites** — it is **not** rename-only, see the AC-3 section | 1 h |
| **T8** | `applySynapseState` | `rlm-synapse.ts` → `session-bias.ts` | `injectedDeps` → `SessionBiasDeps {sessionRegistry, synapseManager}` | **GMS-03 AC-2 sensor**: a new unit test constructs it from an object literal with **zero** `mock.module` calls. Plus **D1 facade-taking 13 → 12** and `rlm-synapse.ts`'s hub-metric reach **2 → 1**. The foreign-module count still does not move here — see below | 1.5 h |
| **T9** | `correctQuery` | `rlm-synapse.ts` → **`hybrid-search.ts`** (§4.1/§4.2). The first draft said "folded into the query module", which names nothing — and `query-understanding.ts` is a real, unrelated file in the same directory that an executor could plausibly pick. | `keywordSearch` → `HybridSearchDeps` | `rlm-synapse.test.ts` correctQuery cases (5) pass unmodified. **This is where the hub-metric foreign-module count moves, 5 → 4** — `rlm-synapse.ts` reads its last facade member here and leaves the foreign set | 45 m |
| **T10** | indexing surfaces **and `ensureInitializedImpl`** | `rlm-indexing.ts` → `project-indexer.ts`; **`ensureInitializedImpl`'s body → `ContextualSearchRLM.ensureInitialized()`** | `indexManager`, `symbolRepo`, `keywordSearch`, `vectorStore`, `searchCache` → `IndexerDeps` | **LATE-BIND sensor**: `rlm-indexing.test.ts` pass count = **25**. Any drop means stubs stopped taking effect. **Plus**: `git grep -n 'ensureInitializedImpl' -- packages/core/src` returns nothing outside tests. | 3.5 h |
| **T11** | `IndexManager` injection seam (**F4**) | **`contextual-search-rlm.ts`** — re-pointed. The first draft named `rlm-indexing.ts:586`, which is *inside* `ensureInitializedImpl` and no longer exists after T10. | the one dependency that cannot be injected today; add the `injectedDeps.indexManager` field | default to today's direct construction; a parity test proves behavior identical when nothing is injected — **plus one positive test that an injected stub `IndexManager` is actually read**, since the parity test alone exercises only the default path and cannot fail on a seam that is wired but never consulted | 1.5 h |
| **T12** | admin surfaces | `rlm-admin.ts` → `index-admin.ts` | ~~six stores~~ **three** stores (`vectorStore`, `keywordSearch`, `searchCache`) + `fileFilterCache` + `analytics` + the re-entrant `search` callback. **Narrow `fileFilterCache` with `Pick<>`; do NOT narrow the analytics field** — see [the eighth plan defect](#eighth-plan-defect-the-seventh-defects-t12-sites-do-not-fire-and-the-analytics-field-cannot-be-narrowed) | `rlm-admin.test.ts` (**7** cases) + the 4 `fileFilterCache` assignment sites. **Plus the T10 gate**: the hub metric reports exactly **one** type above the ceiling and it is `ContextualSearchRLM` — read the whole `types` array, not the `ContextualSearchRLM` row. **Plus the memo mutation, run against T12's own surface** (T9's finding; T10 measured it blind at the richest surface in the repo, so do not infer) — on a delegate with **no preceding `await`**, or it starves the event loop and hangs instead of failing at 5 s. *(Measured at T12: "no preceding `await`" is necessary and **not sufficient** — see the executed row.)* | 1.5 h |
| **T13** | search surfaces | `rlm-search.ts` → `hybrid-search.ts` | `keywordSearch`, `vectorStore`, `searchCache`, `analytics`, `queryUnderstanding` → `HybridSearchDeps`. **`queryUnderstanding: QueryUnderstandingService` is the one genuinely open seventh-defect site left** — `QueryUnderstandingService` is declared in the gated directory, is a bare nominal type, and §2.1 shows `searchImpl` *dereferences* it. **Measure both variants by scratch simulation before choosing**, the way T12 did; do not inherit T12's answer, which was "does not fire" for reasons specific to its two fields. The analytics field carries T12's measured finding: it cannot fire and cannot be `Pick<>`-narrowed | `rlm-search.test.ts` (**31** cases) + `search-dependency-outage` + `search-filter-overfetch` + `search-ranking-regression` pass counts. **Plus the same three T10 additions as T12**: one-violation hub check, own memo mutation, mutation subject with no preceding `await` — **and read T12's refinement of that last one first, because on T12's surface no subject satisfied it**. ~~Also the point where `hybrid-search-late-bind.test.ts`'s third test must widen from one key to five.~~ **Wrong by three, and incomplete: measured at T13, the record is 8 keys, test 1 could not survive unchanged, and a test 4 was needed — see [the disposition of §2.1's thirteen](#t13--the-disposition-of-21s-thirteen).** **Plus a new hard one: `contextual-search-rlm.ts` is 675 LOC against G-HUB's `MAX_FILE_LOC` 700** — T12 left **25** lines of headroom and T13 grows the root again (`#hybridSearchDeps()` goes from 1 field to 5, plus hoisted `await`s on four more methods). Crossing 700 makes G-HUB exit 1 on a second, independent axis and T14 unclosable. Keep the prose on `HybridSearchDeps` in `hybrid-search.ts`, as T12 did | **5.5 h** |
| **T14** | root → composition root | `contextual-search-rlm.ts` | ~~assemble narrow deps **per call**~~ — done incrementally at T8–T13; state fields stay public (§4.3.1). **Re-scoped at the T13 review point to the root's final cleanup, then re-scoped again after measurement** — see [the tenth plan defect](#tenth-plan-defect-t14s-re-scoped-sensor-is-both-unsatisfiable-and-tautological). Subject is **11 sites in `contextual-search-rlm.ts`**: the 10 `Visibility relaxed` comments plus `:88`. **`:93` and `:184` must NOT be touched** — the first is T13's own record of the deletion, the second is class 1 and the only place in source recording PATCHABLE's evidence trail | ~~**G-HUB** exits **0**~~ (fires at T13 — ninth defect) and ~~`git grep -l 'rlm-search'` → empty~~ (**unsatisfiable — tenth defect**). G-HUB exit 0 and the D1 zeros are **invariance** checks (T7's vocabulary). ~~The **discriminating** sensor is the **private-revert mutation**~~ — **corrected at T14, the eleventh defect: the private-revert is a *truth check*, invariant across this task's edit, and the discriminating sensor is the *pair* below.** The **truth check**: reprivatise the ten members and `bunx tsc --noEmit -p packages/core/tsconfig.json` must report **exactly 1 × TS2341**, on `queryUnderstanding`, from `production-wiring.ts:51`. The **discriminating pair**, neither half sufficient alone: `git grep -c 'Visibility relaxed' -- packages/core/src` **10 → 0** *and* the replacement comments citing **§4.3 for the nine methods and §4.3.1 for the one field**, checked **positionally** — the citation must sit adjacent to the group it justifies, or a swap passes. Plus one guard: `git grep -c 'rlm-search.test.ts:156' -- …/contextual-search-rlm.ts` stays **1** | 2 h |

**Every task in Phase 1 additionally runs:** `bun run lint`, `bun run type-check`,
`bun scripts/check-frozen-anchors.ts`, `bun scripts/check-characterization.ts`, and
`git diff --name-only` reviewed against PR-C-BOUNDARY and AC-3. The two checks are sub-second
and both are path-independent, so neither needs editing as files move — if either goes red the
task is wrong, not the check.

## Phase 1 — executed

T6a and T6 reached `main` through **PR #46, squashed rather than merged** — R-04 was violated, none
of those 8 commits are ancestors of `main`, and their per-commit sensor evidence survives only here.
T7 onward is on `refactor/search-facade-split-phase-1b`, cut from `5247ecb` (v1.11.0). **That PR must
be merged with a merge commit.**

| # | commit | deliverable | discriminating sensor observed |
| --- | --- | --- | --- |
| T6a | in `main` via #46 | `capture-facade-baseline.ts` + 3 frozen fixtures; 9 assertions re-pointed | three mutants red first; suites green at base **and** with T6 applied |
| T6 | in `main` via #46 | `rlm-fusion.ts` → `result-fusion.ts` | foreign modules **6 → 5** |
| T7 | `3e46eae` | `buildGraphStream` → `graph-stream.ts` | D1 `delegateScope` **19 → 18**, facade-taking **14 → 13**, scoped LOC 1310 → 1186 |
| T8 | `29ea8b9` | `applySynapseState` → `session-bias.ts` with `SessionBiasDeps` | D1 facade-taking **13 → 12**, `delegateScope` **18 → 17**, scoped LOC **1186 → 1132**; `rlm-synapse.ts` hub reach **2 → 1**; foreign modules **5 → 5** as predicted; new AC-2 sensor 10/0 with **zero** `mock.module`; new LATE-BIND sensor 3/0, observed **2/1 red** under the capture mutation |
| T9 | `2664008` | `correctQuery` → `hybrid-search.ts` with `HybridSearchDeps`; **`rlm-synapse.ts` deleted whole** | **foreign modules 5 → 4** — the one task where this is the right sensor, and it fired; `rlm-synapse.ts` leaves `perModule` entirely. D1 `delegateScope` **17 → 16**, facade-taking **12 → 11**, scoped LOC **1132 → 1108**; `correctQuery` reappears in `all` with `facadeParam: null`. Runtime mutation pair per the T8 refinement: the arity-identical recursion `this.correctQuery(query)` leaves `tsc` at **0** and takes coverage to **40/1**, while the naive `this.correctQuery(deps, query)` is caught (`TS2554: Expected 1 arguments, but got 2`). Invariance: `rlm-synapse.test.ts` **26** untouched, `rlm-search.test.ts` **31**, coverage **41**. New LATE-BIND sensor 3/0 — see the section below for why it was needed against T8's expectation |
| T10 | `b9d444d` | six indexing surfaces → `project-indexer.ts` with `IndexerDeps`; **`ensureInitializedImpl`'s body absorbed into `ContextualSearchRLM.ensureInitialized()`**; **`rlm-indexing.ts` deleted whole** | **foreign modules 4 → 3**, predicted by scratch simulation before the edit and confirmed exactly. D1 `delegateScope` **16 → 9**, facade-taking **11 → 6**, scoped LOC **1108 → 626** — all three predicted to the number; all six functions reappear in `all` with `facadeParam: null`. `git grep -n ensureInitializedImpl -- packages/core/src` returns **only comments** (0 code sites). Runtime mutation pair on `indexFile`: naive `this.indexFile(this.#indexerDeps(), …)` caught by `tsc` (**TS2554: Expected 3-4 arguments, but got 5**), blind `this.indexFile(filePath, …)` leaves `tsc` at **0** and takes coverage to **39/2** and `rlm-indexing` to **22/3**. Memo mutation run per the T9 finding and it is **blind** — see the section below. Invariance: `rlm-indexing.test.ts` **25**, `concurrent-indexing.test.ts` **9**, coverage **41 / 75 expect() calls**, characterization net **160**. New LATE-BIND sensor `project-indexer-late-bind.test.ts` **4/0**, observed **2/2 · 3/1 · 3/1** red under three mutations first. **Plus the seventh plan defect: `IndexManager` foreign reach 0 → 4** — caught, fixed inside the task, recorded below |
| T12 | `484e61a` | four admin surfaces → `index-admin.ts` with `IndexAdminDeps`; **`rlm-admin.ts` deleted whole**; a fourth LATE-BIND sensor | **Six mutations, every one verified *applied* before its reading was believed** (diff vs pristine, marker grep, refuse-on-byte-identical, restore diffed — and the restore step earned its keep: a hung run was killed mid-mutation and left the tree dirty). New `index-admin-late-bind.test.ts` **4/0** honest; observed **2/2** under a first-call memo, **2/2** under a construction capture, **3/1** under a seventh-key leak, **3/1** under `search` bound at assembly time, **3/1** under a memo confined to a *single* field. **Three of those five are invisible to the entire pre-existing suite** — see the section below. `tsc` **0** under all except the key leak (**TS2353**, excess property checking on a required-field record — T8's `SessionBiasDeps` was optional and had no such cover). Naive recursion caught (**TS2554: Expected 0 arguments, but got 1**); blind recursion **hangs** rather than failing, on *every* T12 delegate — the T10 rule refined below. **foreign modules 3 → 2**, predicted before the edit and confirmed exactly; reach **14** by `rlm-search.ts` unchanged; members **23** unchanged; `perModule` csr **14 → 15** (gains `search`), `rlm-admin.ts` gone. D1 `delegateScope` **9 → 5**, facade-taking **6 → 2**, scoped LOC **626 → 524** — all three predicted to the number; all four functions reappear in `all` with `facadeParam: null`. **T10's seventh-defect gate run and passed**: exactly **one** type above the ceiling and it is `ContextualSearchRLM`. Invariance, all unchanged: `rlm-admin.test.ts` **7**, coverage **41 / 75 expect() calls**, characterization net **160**, `concurrent-indexing` **9**. AC-3 budget **0**, spent **0** — no existing test file appears in the diff at all, the second task after T11 with that property. **Plus the eighth plan defect** (the seventh defect's T12 sites do not fire) and **a trap the plan never named** (`MAX_FILE_LOC`), both below |
| T11 | `23470ce` | `injectedDeps.indexManager` — the F4 seam, the only *added* seam in PR-B | **Three violation shapes, each observed red before the sensor was trusted, and `tsc` blind to all three.** New `index-manager-seam.test.ts` **3/0** honest; **2/1** under each of: the seam never consulted, the default path deleted, and the seam correct but hoisted above the `Promise.all`. **Two of the three are invisible to every pre-existing suite** — see the section below; that is plan-critic finding 7 measured rather than asserted. Invariance, all unchanged: `rlm-indexing.test.ts` **25**, `concurrent-indexing.test.ts` **9**, coverage **41**, characterization net **160**. **No movement in any structural sensor**, as predicted: D1 `delegateScope` **9 → 9**, facade-taking **6 → 6**, scoped LOC **626 → 626**; G-HUB exit 1 with `perModule` byte-identical. **T10's seventh-defect gate run and passed**: exactly **one** type above the ceiling and it is `ContextualSearchRLM`; `IndexManager` foreign **0 → 0**, reach **0 → 0**, members **7 → 7**. AC-3 budget **0**, spent **0** — no existing test file appears in the diff at all |

| T13 | `1090504` | five search surfaces → `hybrid-search.ts` with a widened `HybridSearchDeps`; **`rlm-search.ts` deleted whole** — the last of the five `rlm-*.ts` delegates; `hybrid-search-late-bind.test.ts` widened 3 → 4 tests | **G-HUB exit 1 → 0.** `ContextualSearchRLM` foreign **2 → 1**, reach **14 → 1** (`search-warmup.ts`), members **23 → 18**, `perModule {csr 18, warmup 1}`, **zero** types above the ceiling. `maxFileLoc` **675 → 697** against 700 — the T12 sensor fired twice during the task, at 701 and again at 728/702, and both were resolved by moving prose to `tasks.md`, not by moving the gate. D1 `delegateScope` **5 → 0**, facade-taking **2 → 0**, scoped LOC **524 → 0**, all terminal. `QueryUnderstandingService` 0/0 under the `Pick<>` — the two-variant simulation is the **eighth defect's open site, and it is the one that fires**: bare nominal reaches 1, under the ceiling. **Six mutations, each verified applied and each restore diffed** — memo **2/2**, construction capture **2/2**, ninth-key leak **3/1** (`tsc` **TS2353**), assembly-time `.bind(this)` **3/1**, module-local `addContextToResults` **4/0** on the new sensor but **30/1** on `rlm-search`; naive recursion caught (**TS2554: Expected 2-3 arguments**), blind recursion **hangs** (killed at 75 s) exactly as T12 predicted. **Two of the six are invisible to the entire pre-existing suite.** Invariance, all unchanged: characterization net **160** (26·41·31·21·25·7·9), coverage **41 / 75 expect() calls**, `search-dependency-outage` **9**, `search-filter-overfetch` **10**, `search-admission-preflight` **5**, `search-ranking-regression` **2**, `search-synapse-integration` **5**, the three earlier LATE-BIND sensors and `index-manager-seam` unmoved. AC-3 budget **3 → 4** and 4 spent. **Plus the ninth plan defect** (T14's sensor fires here) and a `mock.module` **collision** the plan never named, both below |
| T14 | `e4e38bd` | the root's final cleanup: the ten stale `Visibility relaxed` notes replaced by the two reasons that actually hold, and the T13 hand-off block at `:95-98` retired. **Phase 1 closes here.** | **Discriminating pair, both halves observed:** `Visibility relaxed` **10 → 0** *and* the two replacement comments present, checked **positionally** — the field block at `:114` cites §4.3.1, the nine-method block at `:456` cites §4.3 and **not** §4.3.1, so the citation-swap shape cannot pass. **Truth check:** the private revert of all ten gives `tsc` **exit 2, exactly 1 `error TS` line, exactly 1 TS2341**, at `production-wiring.ts(51,32)` — measured on **both** states and byte-identical, which is the eleventh defect below. Guard: `rlm-search.test.ts:156` still cited **1**; `rlm-search` lines in the root **13 → 4**, the four being `:91`/`:108`/`:446` provenance and `:185` PATCHABLE. Invariance, every figure unmoved: G-HUB **exit 0** and its output byte-identical to the pre-edit run **except the LOC it measures**, foreign **1**, reach **1** by `search-warmup.ts`, `perModule {csr 18, warmup 1}`, zero types above the ceiling, `maxFileLoc` **697 → 696**; D1 **0/0/0**; `lint` 0; `type-check` 0 (6/6); `build` 0 (5/5); `test:scripts` **732/0 across 39 files**; `check-frozen-anchors` 0 (14); `check-characterization` 0 (3/3); characterization net **160** (26·41·31·21·25·7·9); all eleven suite sensors unmoved. EXCLUSIONS **9**. AC-3 budget **0**, spent **0** — no test file in the diff, the third task with that property. **Plus the eleventh plan defect** and a **subject undercount**, both below |

Gate readings at T8: `lint` 0 · `type-check` 0 · `build` 0 · `test:scripts` **732 pass / 0 fail
across 39 files** · `check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0 (3/3) ·
characterization net **160** across 7 suites (26·41·31·21·25·7·9) · `search-synapse-integration`
**5/0** · G-HUB exit **1**, 25 files, foreign **5**, reach **14**, largest `rlm-indexing.ts` 592,
`perModule {csr 4, admin 7, indexing 11, search 14, synapse 1, warmup 1}` · coverage EXCLUSIONS **9**
(measured by importing the module — a regex over the array literal counts the `reason` strings and
reports 19).

Gate readings at T9: `lint` 0 · `type-check` 0 · `build` 0 · `test:scripts` **732 pass / 0 fail
across 39 files** · `check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0 (3/3) ·
characterization net **160** across 7 suites, every suite individually unchanged ·
`search-synapse-integration` **5/0** · `session-bias` **10/0** · `session-bias-late-bind` **3/0** ·
`search-ranking-regression` **2/0** · new `hybrid-search-late-bind` **3/0** · G-HUB exit **1**, 25
files, foreign **5 → 4**, reach **14**, members **23**, largest `rlm-indexing.ts` 592 · coverage
EXCLUSIONS **9** · D1 `delegateScope` **17 → 16**, facade-taking **12 → 11**, scoped LOC
**1132 → 1108**.

> **One `perModule` movement the plan did not predict, and it is not drift.**
> `contextual-search-rlm.ts` goes **4 → 5**. `#hybridSearchDeps()` reads `this.keywordSearch`, and
> that member was **not** previously read anywhere in the root's own class body — today's four are
> `_indexProjectInternal`, `fileFilterCache`, `injectedDeps`, `queryUnderstanding`. T8 did not move
> this number because `#sessionBiasDeps()` reads `this.injectedDeps`, which was already in the set.
> **It has no bearing on G-HUB**: `foreign` excludes the declaring file
> (`search-hub-metric.ts:150`), so the root's own reads never enter `maxForeignReach`. Expect the
> same increment at T10, T12 and T13 as each deps helper reads fields the root did not read before,
> and expect the figure to end high at T14 — a composition root reading its own fields is the
> target state, not a regression. Predicted by scratch simulation before the edit and confirmed
> against the live tree, per T7's practice.

Gate readings at T10: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass /
0 fail across 39 files** · `check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0
(3/3) · characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite individually
unchanged · `search-synapse-integration` **5/0** · `session-bias` **10/0** ·
`session-bias-late-bind` **3/0** · `hybrid-search-late-bind` **3/0** · `search-ranking-regression`
**2/0** · new `project-indexer-late-bind` **4/0** · G-HUB exit **1**, 25 files, foreign **4 → 3**,
reach **14** by `rlm-search.ts`, members **23**, largest file now `project-indexer.ts` **641** (was
`rlm-indexing.ts` 592; the 700 ceiling is untouched), `perModule {csr 14, admin 7, search 14,
warmup 1}` · coverage EXCLUSIONS **9** · D1 `delegateScope` **16 → 9**, facade-taking **11 → 6**,
scoped LOC **1108 → 626**.

> **The predicted `perModule` increment landed, and it is the large one.**
> `contextual-search-rlm.ts` goes **5 → 14** — the nine new members are `ensureInitialized`,
> `initialized`, `analytics`, `indexManager`, `symbolRepo`, `vectorStore`, `searchCache`,
> `indexFile` and `indexProject`, arriving from the absorbed `ensureInitialized` body, the three
> hoisted `await this.ensureInitialized()` statements and `#indexerDeps()`. It now **ties**
> `rlm-search.ts` at 14, which is worth stating plainly so no reader misreads it as reach moving:
> `foreign` excludes the declaring file (`search-hub-metric.ts:150`), so `maxForeignReach` is still
> **14 by `rlm-search.ts`** and the single G-HUB violation is still the target. Predicted on paper
> before the edit, per T7's practice.

AC-3 verified mechanically on the one signature-tracking test file, over comment-stripped source:
`test(` **39 → 39**, `describe(` **20 → 20**, `expect(` **71 → 71**, `toHaveBeenCalledWith`
**14 → 14**, `toHaveBeenLastCalledWith` **10 → 10**, skips/todos/only **0 → 0**, `mock.module`
**16 → 16** (re-pointed, not split — same as T9, because `rlm-indexing.js` was the whole block's
target and the module no longer exists), `toBeTruthy` / `toBeDefined` / `anything()` **0 → 0**, and
`expect.any` **0 → 2**. The runtime count stays at **41 pass / 0 fail** and **75 expect() calls**.
The eight edited assertions are the `_indexProjectInternalImpl` / `ensureFreshIndexImpl` /
`checkSearchAdmissionImpl` / `indexFileImpl` pairs, exactly the budget.

`rlm-indexing.test.ts` is confirmed genuinely rename-only: its whole diff is **one line**, the
`runWithIndexLock` import specifier, and every mechanical count is unchanged.

> **The `expect.any` 0 → 2 is the one authorised looseness in T10, and it is declared rather than
> discovered.** `IndexerDeps` is the first deps record with **re-entrant** members: `indexFile` and
> `indexProject` are the root's own methods, handed over as arrow wrappers that must be rebuilt on
> every assembly (below). A freshly-created closure cannot be identity-matched — measured:
> `toHaveBeenCalledWith` rejects a structurally-identical distinct closure, rejects an omitted key,
> and rejects an extra expected key, so the key set stays exact in both directions and
> `expect.any(Function)` is the tightest matcher available. Both occurrences are in one named helper
> (`indexerDeps(rlm)`, two sites), not scattered across eight assertions, and they sit on keys that
> **did not exist before**, so no pre-existing check was relaxed. What compensates for the looseness
> is test 4 of the new LATE-BIND sensor, which proves the two closures dispatch through the instance
> *by identity at call time* — strictly more than an identity check on the closure itself would say.
>
> Two further T10 changes to the same file, declared so they are not read as drift: the two
> `indexFile` tests gain an explicit `await rlm.ensureInitialized()`, and the `indexerDeps(rlm)`
> helper is added. The init line is needed because `indexFile` is the one indexing surface whose
> original never called `ensureInitialized` — so the facade method deliberately still does not, and
> without the line the subject's five store fields stay `undefined`, which the T8 trap
> (`toHaveBeenCalledWith` treats an undefined-valued key as absent) would make unassertable. Neither
> change adds an assertion: `expect(` is unchanged at **71** textual and **75** runtime.
>
> **Say which metric.** `test(` 39 and `expect(` 71 are *textual, comment-stripped* counts, and they
> reproduce T9's figures under T9's strip. A second, stricter strip written for this task reported 41
> and 75 — the same source, two methods, two answers, which is §3.2's failure mode arriving in a
> mechanical checker for the fifth time. The delta is **zero under both**, which is what AC-3 asserts;
> the absolute figures are only comparable across tasks if the method is named.

> **Strip comments before counting anything in a source file.** The first mechanical AC-2 check
> reported `mock.module` **1**, `as any` **1** and an import of `contextual-search-rlm` in
> `session-bias.test.ts` — all three were the file's own header comment *describing* what it does not
> do. Same defect as Phase 0's item 1 and T2's fixture: a regex over raw source counts the prose that
> documents the thing. Over stripped source the readings are **0 / 0 / false**.

Gate readings at T11: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass /
0 fail across 39 files**, exit 0 · `check-frozen-anchors` exit 0 (14/14) · `check-characterization`
exit 0 (3/3) · characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite
individually unchanged · `search-synapse-integration` **5/0** · `session-bias` **10/0** ·
`session-bias-late-bind` **3/0** · `hybrid-search-late-bind` **3/0** · `project-indexer-late-bind`
**4/0** · `search-ranking-regression` **2/0** · new `index-manager-seam` **3/0** · G-HUB exit **1**,
25 files, foreign **3**, reach **14** by `rlm-search.ts`, members **23**, `perModule {csr 14, admin 7,
search 14, warmup 1}` — **every figure byte-identical to T10** · coverage EXCLUSIONS **9** · D1
`delegateScope` **9**, facade-taking **6**, scoped LOC **626** · CHANGELOG released section still
**974 lines**, T11's entry present in `[Unreleased]` under `### Changed` and absent from the released
section, checked in both directions.

Gate readings at T12: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass /
0 fail across 39 files**, exit 0 · `check-frozen-anchors` exit 0 (14/14) · `check-characterization`
exit 0 (3/3) · characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite
individually unchanged · `search-synapse-integration` **5/0** · `session-bias` **10/0** ·
`session-bias-late-bind` **3/0** · `hybrid-search-late-bind` **3/0** · `project-indexer-late-bind`
**4/0** · `index-manager-seam` **3/0** · `search-ranking-regression` **2/0** · new
`index-admin-late-bind` **4/0 (16 expect() calls)** · G-HUB exit **1**, 25 files, foreign **3 → 2**,
reach **14** by `rlm-search.ts`, members **23**, `perModule {csr 15, search 14, warmup 1}`, and
**exactly one type above the ceiling** — the T10 seventh-defect check, run and passed, with
`FileFilterCache` at foreign **0 → 0** and reach **0 → 0** · **`maxFileLoc` 641 → 675**
(`contextual-search-rlm.ts`), against `MAX_FILE_LOC` **700** · coverage EXCLUSIONS **9** · D1
`delegateScope` **9 → 5**, facade-taking **6 → 2**, scoped LOC **626 → 524** · T15's `rlm-` file count
**29 → 30**, taken with the new files staged.

Gate readings at T13: `lint` exit 0 · `type-check` exit 0 (6/6) · `build` exit 0 (5/5) ·
`test:scripts` **732 pass / 0 fail across 39 files**, exit 0 · `check-frozen-anchors` exit 0 (14
anchors, each resolving to exactly one location) · `check-characterization` exit 0 (3/3) ·
characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite individually
unchanged · `search-synapse-integration` **5/0** · `session-bias` **10/0** · `session-bias-late-bind`
**3/0** · `project-indexer-late-bind` **4/0** · `index-admin-late-bind` **4/0** · `index-manager-seam`
**3/0** · `search-ranking-regression` **2/0** · `search-dependency-outage` **9/0** ·
`search-filter-overfetch` **10/0** · `search-admission-preflight` **5/0** · widened
`hybrid-search-late-bind` **4/0 (12 expect() calls)** · **G-HUB exit 0**, 24 files, foreign **2 → 1**,
reach **14 → 1** by `search-warmup.ts`, members **23 → 18**, `perModule {csr 18, warmup 1}`, **zero**
types above the ceiling, `maxFileLoc` **675 → 697** (`contextual-search-rlm.ts`; `hybrid-search.ts`
686) against `MAX_FILE_LOC` **700** · coverage EXCLUSIONS **9** · D1 `delegateScope` **5 → 0**,
facade-taking **2 → 0**, scoped LOC **524 → 0** · T15's `rlm-` count **30 → 29**, taken with
everything staged · CHANGELOG released section still **974 lines and byte-identical to `353de59`**,
T13's entry in `[Unreleased]` under `### Changed`, and all seven entries verified present in
`[Unreleased]` and absent from the released section, positionally and per entry.

> **Three baselines this task had to measure because no prior record carried them.**
> `search-dependency-outage` **9/0**, `search-filter-overfetch` **10/0** and
> `search-admission-preflight` **5/0**. The T13 row names the first two as sensors without a figure,
> and a sensor with no before-value cannot report anything. All three were taken against `484e61a`
> under a scratch `XDG_CONFIG_HOME` before the first edit.

Gate readings at T14 — **the T11 property, and this time it is the whole point**: `lint` exit 0 ·
`type-check` exit 0 (6/6) · `build` exit 0 (5/5) · `test:scripts` **732 pass / 0 fail across 39
files**, exit 0 · `check-frozen-anchors` exit 0 (14 anchors) · `check-characterization` exit 0 (3/3) ·
characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite individually unchanged ·
`session-bias` **10/0** · `session-bias-late-bind` **3/0** · `hybrid-search-late-bind` **4/0** ·
`project-indexer-late-bind` **4/0** · `index-admin-late-bind` **4/0** · `index-manager-seam` **3/0** ·
`search-ranking-regression` **2/0** · `search-dependency-outage` **9/0** · `search-filter-overfetch`
**10/0** · `search-admission-preflight` **5/0** · `search-synapse-integration` **5/0** · **G-HUB exit
0**, 24 files, foreign **1**, reach **1** by `search-warmup.ts`, members 18, `perModule {csr 18,
warmup 1}`, zero types above the ceiling, `maxFileLoc` **697 → 696** against 700 — **the G-HUB output
is byte-identical to the pre-edit run except that one number**, which is the sharpest available
statement of the invariance · EXCLUSIONS **9** · D1 `delegateScope` **0**, facade-taking **0**, scoped
LOC **0** · CHANGELOG released section still **974 lines and byte-identical to `353de59`**, and all
**eight** `[Unreleased]` entries verified present there and absent from the released section,
positionally and per entry.

> **One anchor in that CHANGELOG sweep reported a miss and the miss was the anchor's.** Checking eight
> entries by substring, `"injection seam"` returned 0 in `[Unreleased]` — T11's bullet is worded *"can
> now be supplied from outside the search service"* and never uses the phrase. The entry was present
> the whole time. Worth one line because the failure mode is the one this feature keeps paying for in
> the other direction: a mechanical check whose *pattern* is wrong reports a fact about itself as a
> fact about the subject. Confirmed by listing all eight bullet first-lines rather than trusting the
> eight greps.

### Eleventh plan defect: T14's private-revert is a truth check, not a discriminating sensor

Found at **T14**, before the first edit, by predicting the reading on paper and then measuring it on
both states — and it is the **seventh** time in this feature that a correction inherited the defect it
was correcting. The defective text is the *tenth* defect's own resolution, exactly as the tenth was the
ninth's.

The tenth defect replaced an unsatisfiable grep with the private-revert mutation and wrote, in the T14
row, *"The **discriminating** sensor is the **private-revert mutation**"*. **By T7's own vocabulary that
label is wrong.** T14 edits only comments; the mutation edits only modifiers. The two do not intersect,
so the mutation reads the same on a finished T14 and on an empty commit:

| state | `tsc` | `error TS` lines | TS2341 | site |
| --- | --- | --- | --- | --- |
| before T14 (`ba8d2bc`) | exit 2 | **1** | **1** | `production-wiring.ts(51,32)` |
| after T14 | exit 2 | **1** | **1** | `production-wiring.ts(51,32)` |

Both runs harnessed identically (10 markers verified applied, diff-vs-pristine 40 lines,
refuse-on-byte-identical, restore diffed clean, 0 residual markers). **An invariance check cited as a
discriminating one is this repository's signature defect class** — an artifact reporting success while
measuring nothing — and it would have let T14 report a sensor an empty commit also passes. That is the
*third consecutive* defect in this one task row: the ninth was a sensor already green before the task,
the tenth unsatisfiable and tautological, the eleventh invariant.

**Resolution, and it is a relabel plus one addition, not a scope change.** The sensor *set* was always
sufficient; only the labels were wrong, and one member needed strengthening.

- **Truth check** — the private revert. It witnesses that the *new comment is true*: that the nine
  methods are held by a compatibility argument no gate can see, and that `queryUnderstanding` is the
  one member a gate can see. `tasks.md`'s own tenth-defect prose already assigned it that job
  (*"witnesses that the new comment is true"*); the row's one-word label contradicted it.
- **Discriminating pair** — `Visibility relaxed` 10 → 0 **and** the replacement comments present.
  Neither half alone: the first is the tautology the tenth defect named, the second passes on a file
  that still carries the false notes.
- **The pair needed a positional check, on a plan-critic finding.** Asserting only that `§4.3` and
  `§4.3.1` both appear somewhere is passed by a replacement that **swaps them** — citing §4.3.1 for the
  nine methods and §4.3 for the field — which is precisely the *"the ten sites are not one group, which
  the replacement comment must not repeat"* violation. Closed structurally rather than by a bolt-on
  check: **each citation sits in the block adjacent to the group it justifies**, so the field block at
  `:114` contains §4.3.1 and the nine-method block at `:456` contains §4.3 and **not** §4.3.1. A swap is
  no longer expressible without moving a comment past 340 lines of class body.

**What generalises, and it completes the ninth-and-tenth sentence:** the ninth defect read an axis its
task did not move, the tenth read a population its task could not clear, and the eleventh reads an axis
its task moves **nothing** on. All three were written while correcting the previous one. *A sensor's
label is part of the sensor — say whether a reading proves the task happened or only that nothing
broke, because the two are indistinguishable in a report and opposite in meaning.*

### The subject was undercounted by four lines, and the grep is why

Not a plan defect — no row claims the enumeration is exhaustive — but the T14 subject as recorded
(*"11 lines: the 10 comments plus `:88`"*) is **short by the block at `:95-98`**, and the reason is
mechanical: that block says the `Visibility relaxed` notes *"below are historical as of this commit.
Removing them is T14's … leaving them here is deliberate, not an oversight"* — which goes false the
moment T14 removes them, and which **contains no `rlm-search` substring**, so the 13-line
`git grep 'rlm-search'` sweep that produced the enumeration could not see it. A subject enumerated by
one pattern is exhaustive only for statements that pattern matches.

Also short by two lines on the other side: `:86-88` is **one sentence**, so `:88` cannot be corrected in
isolation without leaving a fragment.

**Reviewer decision (2026-07-30, at the T13/T14 boundary): rewrite the header block `:86-99`, preserving
`:92-94`'s provenance.** *"Do not touch `:93`"* is read as **preserve the record**, not literal-line
immutability — the T10/T12/T13 provenance survives in meaning at `:89-92` of the new text, and `:184`
(now `:185`) is untouched. The authority for widening at all is **T10's own recorded rule**: *"source
files in the write set had their stale comments corrected … leaving them would mislead the next reader
of code this commit changed."* Leaving `:95-98` would have left a false statement behind in the one task
whose entire subject is false statements. Final subject: **24 lines**, one file, comments only,
**+23 / −24**.

**And the replacement follows two precedents already in this file, which the plan never cited.** T12
rewrote the `fileFilterCache` note at `:106-109` and T6 the `RRF_K` note at `:114-117` into the same
shape — past tense, who removed the reader, where it went, and why the member stays public with its
evidence sites. T14 is the third application, not a new pattern. *(A read-only plan critic reported that
`RRF_K` note as dead-reference staleness in scope for T14. It is not: it is past-tense, names
`result-fusion.ts` as the current home, and `RRF_K` is really at `result-fusion.ts:19`. Left alone.
**Ninth two-methods-two-answers in this feature, and the third figure this agent has got wrong** —
keep its findings, re-run its numbers.)*

### Ninth plan defect: T14's sensor fires at T13, and the correction to T6's unfirable sensor is what caused it

Found at **T13**, before any edit, by scratch simulation rather than by reading — same class and same
method as the previous eight. It is the **fifth** of the nine in which a *correction* inherited the
defect it was correcting (T6→T7→T9, T10→T12, and now T6's replacement→T14).

What it contradicts is the closing sentence of
[T6's sensor was unfirable](#t6s-sensor-was-unfirable--corrected): *"reach cannot fall until T13
rewrites `rlm-search.ts`, and **G-HUB cannot go green until T14**. G-HUB's exit status is T14's gate
and nobody else's."* The first clause is right. **The second is false, and it is false because the
first is right**: reach falling *is* the gate, and nothing else in the directory was above the
ceiling.

Measured before the first edit, on a scratch copy of `packages/core/src/services/search` with
`rlm-search.ts` removed and nothing else changed — the deletion verified by `diff -rq` against the
pristine copy:

| state | exit | `ContextualSearchRLM` | types above ceiling (3) |
| --- | --- | --- | --- |
| base (`484e61a`) | **1** | foreign 2, reach **14** by `rlm-search.ts` | 1 |
| `rlm-search.ts` removed | **0** | foreign 1, reach **1** by `search-warmup.ts` | **0** |

`search-warmup.ts` reads exactly one member and is the only foreign reader left; the declaring file
is excluded from `foreign` (`search-hub-metric.ts:150`). D1 goes terminal on the same commit —
`delegateScope` **5 → 0**, facade-taking **2 → 0**, scoped LOC **524 → 0** — so **both** of Phase 1's
structural sensors reach their target values at T13.

Taken literally, T14 would have read a gate that was already green before it started: an artifact
reporting success while measuring nothing, which is this repository's signature defect class arriving
in the plan's own final structural task. It is the same failure mode as T6's row, pointing the other
way — T6's would have reported a correct task as failed, T14's would have reported an empty task as
passed.

**Reviewer decision (2026-07-30, at the T13 review point): re-scope T14's sensor, keep the order.**
Three options were put with the measurements above. Absorbing T14 into T13 was rejected because T13
is already the 5.5 h task most likely to overrun and it would put the session boundary mid-task,
against the rule that stopped T11 and T12. Leaving `rlm-search.ts` as a re-export husk for T14 to
delete was rejected because GMS-04 AC-1 forbids the husk and T10 killed `rlm-indexing.ts` whole for
precisely that reason. The accepted resolution:

- **T13 owns the G-HUB close** and records `exit 1 → 0` as its own discriminating result, because
  that is what happened.
- **T14 keeps its slot** and its subject narrows to what is actually left: the root's final cleanup.
  Its **discriminating** sensor becomes `git grep -c 'Visibility relaxed' -- packages/core/src`
  **10 → 0** plus `git grep -l 'rlm-search' -- packages/core/src` going empty, each observed non-zero
  before the edit. **G-HUB exit 0 is demoted to an invariance check** — the plan's own distinction,
  drawn at T7: an invariance count proves nothing broke, a discriminating one proves the task
  occurred.

**T13 therefore leaves the ten `Visibility relaxed` comments in place deliberately**, and says so
in the source, rather than correcting them under T10's "stale comments in files in your write set"
rule. They are historical the moment `rlm-search.ts` dies, but removing them here would take T14's
new sensor with them — and the root already carried a comment, written at T10, saying "by T14 the
note goes with it". The rule and the exception are both recorded so a later reader does not read the
omission as an oversight.

### Tenth plan defect: T14's re-scoped sensor is both unsatisfiable and tautological

Found at the **T13/T14 boundary**, before any T14 edit, by measuring the sensor rather than reading
it. **It is the sixth time in this feature that a correction inherited the defect it was correcting,
and the shortest-lived one yet: the defective text is the ninth defect's own resolution, written into
this file during T13.** The executor wrote it from the reviewer's option text without measuring its
scope — the same motion the previous nine punish.

Two independent defects in one sensor, pointing opposite ways. Both reproduced by the executor and,
separately, by a read-only `massa-ai-plan-critic` run against the T14 row.

**(a) `git grep -l 'rlm-search' -- packages/core/src` → empty is unsatisfiable, and satisfying it
would be wrong.** Measured: **31** matches across **9** files, of which T14 owns **11 lines in one
file**. `rlm-search.test.ts` alone contributes nine — its header and eight `describe("rlm-search — …")`
blocks — and *this document already says that file survives PR-B and its rename is T15's decision*
(see [T13 and T15](#t13-and-t15--the-count-moves-back-to-29-and-it-is-the-first-decrement)). The
sensor is scoped to a **population** (`packages/core/src`) when its subject is one file, and reaching
it would require either silently widening the write set into `hybrid-search.ts` and four test files,
or re-scoping the sensor mid-task — which is the motion this repository treats as indistinguishable
from weakening one. **Exactly the shape of T15's AC-3** (*"`rg 'rlm-'` returns only CHANGELOG and
`.specs/`"*, unsatisfiable because of 320 `.ua/` occurrences), found independently, one section apart.

**(b) `'Visibility relaxed' 10 → 0` is a tautology.** It is satisfied by deleting the ten lines with
no replacement — which the plan's own instruction forbids — because nothing in the sensor set checks
for the **presence** of the replacement. Absence of a false statement is not presence of a true one.
**The concrete violation it would hide**: an executor chasing (a) deletes
`contextual-search-rlm.ts:184`, which cites `rlm-search.test.ts:156` as one of PATCHABLE's 16
monkey-patch sites. That line is the only place in *source* recording that constraint's evidence
trail, it is **class 1** (a pointer to a file that survives), and every proposed check — both greps,
all pass counts, G-HUB, `maxFileLoc` — stays green whether or not it survives.

**And the ten sites are not one group, which the replacement comment must not repeat.** Nine sit on
public **methods**; one sits on the **field** `queryUnderstanding`. Their justifications differ, and
neither is `rlm-search.ts` any more:

| group | what actually keeps it public | what a revert costs |
| --- | --- | --- |
| `queryUnderstanding` (field, `:112`) | a **live production reader** — `services/project-identity/production-wiring.ts:51` | `tsc` **TS2341**, the only one |
| the nine methods (`:448`–`:622`) | §4.3's *"the class keeps its 21 public methods"* — a published compatibility surface for 24 importers | **nothing any gate can see** |

**Measured, mutation verified applied (10 markers, restore diffed clean):** reprivatising all ten
gives `bunx tsc --noEmit -p packages/core/tsconfig.json` **exit 2 with exactly one TS2341**, on
`queryUnderstanding`, and every runtime suite stays green — coverage **41/0**, `rlm-search` **31/0**,
`rlm-admin` **7/0**, characterization **21/0**, `search-filter-overfetch` **10/0**.

That one-versus-nine split is itself a finding, and it corrects a plan-critic claim rather than
inheriting it. The critic reported that reprivatising the nine *"would be a loud `tsc` failure across
dozens of call sites"*, citing real, typed, **uncast** calls (`contextual-search-rlm-coverage.test.ts:840`,
`hybrid-search-late-bind.test.ts:124`, `rlm-synapse.test.ts:93`). The call sites are real; the
consequence is not. **`packages/core/tsconfig.json` excludes `src/__tests__`** (`CLAUDE.md`), and
`bun run type-check` covers four *other* packages — so no gate in this repository type-checks those
calls. The nine are protected by a compatibility argument and by nothing mechanical, which is a
sharper finding than the one reported, and the eighth time in this feature that two methods have given
two answers. **Re-measure a delegate's figures with the project's own command.**

**Resolution: the sensor is replaced, not relaxed, and the replacement is a mutation.** A grep can
only witness absence; the private-revert witnesses that the *new* comment is true. T14's discriminating
sensor is therefore `exactly 1 × TS2341 on queryUnderstanding` under the revert, plus two positive
content checks (`rlm-search.test.ts:156` still cited exactly once; the replacement block naming §4.3
for the nine and §4.3.1 for the one). The `rlm-search`-empty half is **struck**, and its subject is
restated as 11 enumerated lines in one file.

**The generalisable sentence, and it is the ninth defect's own lesson arriving one level up:** a
sensor must be scoped to the *subject* the task changes, not to the *population* the subject lives in.
The ninth defect was a sensor reading an axis its task did not move; the tenth is a sensor reading a
population its task cannot clear. Both were written by correcting the previous one.

### T13 — the disposition of §2.1's thirteen

`hybrid-search.ts`'s `HybridSearchDeps` doc points here rather than carrying this table, because
`MAX_FILE_LOC` made both files in T13's write set choose between prose and passing (below).

§2.1 records `searchImpl` reading **13** facade members, the highest arity in the matrix. §4.1's
"injected collaborators" column names **five**, and that column is a *store* list, not a member list —
following it literally would have produced a five-key record and silently disabled twelve test stubs.
Each member's disposition was decided by measuring the instance-stub sites that reach it. Sweep
method: `git grep -P '\.<member>\s*=(?!=)'` over `git ls-files 'packages/core/src/**/*.test.ts'` —
**`-P`, not `-E`**, per T12's finding.

| member | disposition | stub sites | why |
| --- | --- | --- | --- |
| `keywordSearch` | store field | 19 | structural type; cannot touch the metric |
| `vectorStore` | store field | 8 | ″ |
| `searchCache` | store field | 4 | ″ |
| `analytics` | store field | 3 | ″ |
| `queryUnderstanding` | store field, **`Pick<…, "understand">`** | 7 | the eighth defect's one open site — see below |
| `buildGraphStream` | **per-call arrow wrapper** | **6** | module-local call disables all 6 |
| `addContextToResults` | **per-call arrow wrapper** | **6** | ″ |
| `applySynapseState` | **per-call arrow wrapper** | 0 | keeps the root the single `SessionBiasDeps` assembly point |
| `ensureInitialized` | **hoisted to the root, with its wrapper** | 3 (+ PATCHABLE) | see the evaluation-order finding below |
| `correctQuery` | module-local call | 0 | lands in the same file |
| `calculateAvgScore` | module-local call | 0 | ″ |
| `filterByPatterns` | module-local call | 0 | ″ |
| `fuseResults` | direct import from `result-fusion.js` | 0 | 0 stub sites, so §4.1's edge is realised directly |

`HybridSearchDeps` is therefore **8** keys, not the five §4.1 implies and not the nine an
`ensureInitialized` field would have made. **The T13 row's instruction to widen
`hybrid-search-late-bind.test.ts`'s third test "from one key to five" is wrong by three**, and test 3
now pins eight.

**The eighth defect's open site fires, and the gate still does not move.** T12 left
`queryUnderstanding` as the one place where both of the seventh defect's conditions might genuinely
hold. Measured by two-variant scratch simulation, each substitution verified non-identical by `diff`
and by marker grep before either reading was believed:

| variant | `QueryUnderstandingService` |
| --- | --- |
| `queryUnderstanding: QueryUnderstandingService` | foreign 0 → **1**, reach 0 → **1**, members 4 → 5 |
| `queryUnderstanding: Pick<…, "understand">` | foreign **0**, reach **0** |

So unlike T12's two fields, the mechanism **does** fire here: the binding is captured and
`deps.queryUnderstanding.understand` is a dereference. But reach **1 ≤ the ceiling of 3**, so it
yields **no second G-HUB violation** — the `fileFilterCache` outcome, not the `IndexManager` one. The
`Pick<>` is kept because §4.4 says a record holds exactly what is read, and it is recorded as
**honest typing, not a sensor that fired**. Three tasks have now asked this question and the gate has
moved on none of them; only T10's `IndexManager` at reach 4 ever did.

**`correctQuery` takes the whole 8-key record while reading one field of it.** That is not a §4.4
violation: §4.4's narrowness is a property of the *module's* record, not of each surface's parameter
list, and `getAnalytics(deps: IndexAdminDeps)` established the shape at T12 by reading one field of
six. Narrowing it to `Pick<HybridSearchDeps, "keywordSearch">` was considered and rejected — it would
have blinded `hybrid-search-late-bind.test.ts`, which observes the assembled record through the
`correctQuery` spy and would then have seen one key instead of eight.

### The tenth finding, and it is T13's alone: the deps record snapshots by value, so init cannot stay in the module

Not a plan defect — no task row claims otherwise — but the single thing that would have shipped a
broken T13, and it was **surfaced by the read-only plan critic and then confirmed by measurement**,
which is the third time that agent has earned its keep (T11's third violation shape, T12's superseded
sensor, this).

The first implementation put `ensureInitialized` in `HybridSearchDeps` as a ninth key, an arrow
wrapper called *inside* `search`. The reasoning was correct as far as it went: `searchImpl` wraps its
init call in a `try/catch` converting any failure to
`searchBackendUnavailable("search_initialization", error)` and recording it through
`recordSearchFailure`, so the **bare** hoist T10 and T12 used would have dropped both and been a
behavior change.

**What that reasoning missed is evaluation order.** `#hybridSearchDeps()` is evaluated as an argument
*before* `search` runs, and it reads its five stores as **plain values**. On a facade that has not yet
initialised, all five are `undefined`, and the module's later `await deps.ensureInitialized()`
populates the *fields* while the record keeps the `undefined`s. Every prior task escaped this by
hoisting init ahead of the assembly; T13 is the first surface where the hoist was argued against.

Measured on the finished code, mutation verified applied:

| shape | `tsc` | `rlm-search` | `search-dependency-outage` | `search-filter-overfetch` |
| --- | --- | --- | --- | --- |
| init inside the module (ninth key) | **0** | **15 / 16** | **4 / 5** | **1 / 9** |
| init hoisted to the root, **with its wrapper** | 0 | **31 / 0** | **9 / 0** | **10 / 0** |

`tsc` is blind to it — `undefined` is assignable to nothing here, but the fields are
definite-assigned (`!`), which is exactly the assertion §4.3.1 keeps for the ~80 stub sites. The
resolution is the hoist **carrying its `try/catch`**, so the wrap and the failure record survive at
the root: behavior identical, ordering correct, and `HybridSearchDeps` back to 8 keys.

**What generalises**: "assemble a narrow record per call from current fields" has an implicit
precondition — *the fields must be current at assembly time*. Six tasks satisfied it by accident of
hoisting. A record whose members are values, not accessors, is only as late-bound as the moment it is
built, and `hybrid-search-late-bind.test.ts` test 3 now pins the absence of an `ensureInitialized`
key so the shape cannot come back.

### T13 ran the memo mutation — blind for the fourth consecutive task, at the widest surface yet

T9 required T10, T12 and T13 each to measure rather than inherit. **T13 measured.** Six shapes, run
separately against the finished code, **every one verified applied before its reading was believed**
(diff against a pristine copy, marker grep, refuse-to-report on byte-identical, restore diffed — and
the tree confirmed byte-identical to pristine after the last one):

| violation shape | `tsc` | `hybrid-search-late-bind` | `rlm-search` | coverage | charact. | dep-outage | filter-overfetch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| record **memoised on first call** | 0 | **2 / 2** | 31/0 — blind | 41/0 — blind | 21/0 — blind | 9/0 — blind | 10/0 — blind |
| record captured at **construction** | 0 | **2 / 2** | **15 / 16** | **38 / 3** | **19 / 2** | **4 / 5** | **1 / 9** |
| **ninth-key leak** | **2** (TS2353) | **3 / 1** | 31/0 | **38 / 3** | 21/0 | 9/0 | 10/0 |
| `buildGraphStream` **bound at assembly** | 0 | **3 / 1** | 31/0 — blind | 41/0 — blind | 21/0 — blind | 9/0 — blind | 10/0 — blind |
| `addContextToResults` **module-local** | 0 | 4/0 — blind | **30 / 1** | 41/0 — blind | 21/0 | 9/0 — blind | 10/0 — blind |
| naive recursion | **2** (TS2554: Expected 2-3 arguments) | — | — | — | — | — | — |
| blind recursion | 0 | — | **hang**, killed at 75 s | — | — | — | — |

Four things in that table are worth keeping.

- **The memo answer is "blind" for the fourth consecutive task**, now at a surface carrying
  `rlm-search.test.ts`'s 31 cases plus three more suites the earlier tasks did not have. The
  assignment-site inference is refuted at the richest surface (T10), a sparse one (T12) and the
  widest one (T13). The finding was that the inference is invalid, not that the answer is always
  blind — but it has been blind every time it has been asked.
- **The assembly-time `.bind(this)` is invisible to the entire pre-existing suite**, and for exactly
  T12's reason one axis over: all twelve stub sites assign *before* they call, and the record is
  assembled per call, so a bind at assembly still captures the stub. `hybrid-search-late-bind.test.ts`
  test 4 is the only thing in the repository that can see it. That test was **not in the T13 row** —
  the row asked only for test 3 to widen — and it was added on the plan critic's finding.
- **The module-local call is *not* fully blind, unlike T12's `search` seam**, and the difference is
  worth naming: `rlm-search.test.ts:184` stubs `rlm.addContextToResults` to *throw*, so one of the six
  sites fires (**30 / 1**). Five of six are still silent. A 6-site footprint with one discriminating
  site is not coverage, and the arrow wrapper is what the other five need.
- **The recursion pair behaves exactly as T12 predicted, and T13 spent no time hunting a subject.**
  The naive half is caught statically. The blind half **hangs** rather than failing: T13's root
  `search()` now has a preceding `await` — the hoisted init — which is precisely T10's unbounded
  microtask case, and the three sync delegates are T12's sync case, which also hangs. **A hang is not
  blindness**; no such run reports green. The positive runtime evidence is test 4's dispatch
  assertions and the coverage suite's forwarding checks.

### The `mock.module` collision the plan never named — a merge, not a re-point

`contextual-search-rlm-coverage.test.ts` carried **two** `mock.module` blocks that both name
`hybrid-search.js` after T13: the T9 block (`correctQuery` only) and the `rlm-search.js` block this
task re-points. **Two registrations on one specifier do not compose** — the later one replaces the
module wholesale, so the root's other five imports would have resolved to `undefined`. They are
therefore **merged into one**, and the `mock.module` count goes **16 → 15**, where T9's and T10's
re-points each held it at 16 and T6/T7/T8's splits each raised it. The merged block spreads the real
module, which also fixes a latent asymmetry: the T9 block had no spread because the root imported
only `correctQuery` from that module at the time.

### AC-3 at T13 — the budget is 4, not 3, and the ledger total is 19

T12 enumerated T13's budget as **3** by sweeping for the facade first argument
(`toHaveBeenCalledWith(rlm, …)`), and that sweep was correct: `:647`, `:655`, `:844` are the three,
and all three are spent exactly as recorded. **A fourth site exists that the sweep could not have
found.** `contextual-search-rlm-coverage.test.ts`'s `correctQuery` forwarding assertion lost its
facade argument back at **T9**; what T13 changes is the *shape of the record* it asserts, as
`HybridSearchDeps` widens from one key to eight. Measured, not predicted: it went **40 / 1** on the
first full run of the file.

So the class the ledger tracks is wider than "assertions naming the facade" — it is "assertions
tracking a delegate's signature", and once a task has replaced the facade argument with a record,
that record's shape is part of the signature. **T13's row is 4 and the total is 19.**

Nothing is relaxed. The file stays at **41** tests and **75** `expect()` calls, textual `expect(`
stays at **71**, `test(` at 39, `describe(` at 20, skips/todos/only at 0, and `toBeTruthy` /
`toBeDefined` / `anything()` at 0. `expect.any` goes **2 → 5**: three new `expect.any(Function)` keys
in the `hybridDeps(rlm)` helper, on the three re-entrant callbacks, for T10's reason — a per-call
closure cannot be identity-matched, and dispatch is proved by identity in
`hybrid-search-late-bind.test.ts` test 4 instead. Two further declared changes so they are not read
as drift: the `hybridDeps(rlm)` helper itself (T10's `indexerDeps` precedent, named once so each
assertion stays a one-token substitution), and the `mock.module` merge above. **No `await
rlm.ensureInitialized()` was needed in the two `search` tests**, unlike T10's two `indexFile` tests,
because T13 hoists init into `search()` itself — the fields are populated by the time the assertion
reads them.

### `MAX_FILE_LOC` at T13 — the sensor fired twice, and both files now sit near the ceiling

T12 carried this as a sensor on the T13 row rather than as advice. It was right to.

| point | `contextual-search-rlm.ts` | `hybrid-search.ts` |
| --- | --- | --- |
| T12 (committed) | **675** | 82 |
| T13, first application | **701** — over | **781** — over |
| T13, after the init hoist | 711 — over | 686 |
| T13, as committed | **697** | **686** |

Both files crossed 700 during the task, on the gate's own `split("\n").length` axis (`wc -l` + 1).
Neither was fixed by touching the gate: the prose that would not fit moved to *this file*, which is
where the measurement record belongs anyway, and the source keeps the invariant plus a pointer.

**Recorded loudly because the headroom is now 3 lines and 14 lines.** T14 only *removes* lines from
the root, so it is safe; PR-C is not. Two unspent options exist if a later task needs them, and both
are recorded rather than taken: the root's `search()` still inlines an options type that is now
byte-identical to `hybrid-search.ts`'s exported `SearchOptions` (**~10 lines**, not taken because it
changes an emitted declaration on a 24-importer surface), and `correctQuery`'s doc is duplicated
between the root method and the module function (**~6 lines**).

### Eighth plan defect: the seventh defect's T12 sites do not fire, and the analytics field cannot be narrowed

Found at **T12**, by measuring rather than by reading, same class and same method as the previous
seven. What it contradicts is the *resolution* of the seventh — the enumeration under
[Seventh plan defect](#seventh-plan-defect-the-deps-record-pattern-is-not-g-hub-neutral-after-all)
reading *"**T12** — `fileFilterCache: FileFilterCache` … and any analytics field typed
`SearchAnalytics` / `SearchAnalyticsPg` … Narrow all four with `Pick<>`"*, carried into the T12 row
and into `HANDOFF.md` as *"these are **required** record fields, so unlike T11's optional seam they
**will** fire."* **That is false for both fields, and for three independent measured reasons.** It is
the fourth time in this feature that a correction has inherited the defect it was correcting
(T6→T7→T9, and now T10→T12).

**Measured by scratch simulation before `index-admin.ts` was applied**, two copies of
`packages/core/src/services/search` differing in exactly one line — the substitution verified
non-identical by `diff` before either reading was believed:

| variant | `FileFilterCache` | `SearchAnalyticsPg` | `SearchAnalytics` | types above ceiling |
| --- | --- | --- | --- | --- |
| base (`353de59`) | foreign 0, reach 0 | foreign 1, reach 1 | **absent** | 1 — `ContextualSearchRLM` = 14 |
| `fileFilterCache: Pick<…>` | foreign 0, reach 0 | foreign 1, reach 1 | **absent** | 1 — unchanged |
| `fileFilterCache: FileFilterCache` | foreign **1**, reach **1** | foreign 1, reach 1 | **absent** | **1 — still one** |

1. **The analytics field cannot fire at all.** `SearchAnalytics` is not a declared type — 
   `search-analytics.ts` is the single line
   `export { SearchAnalyticsPg as SearchAnalytics } from "./search-analytics-pg.js";`, and
   `stripNonCode` (`search-hub-metric.ts:66`) deletes exactly that form, so the name never enters
   `declaredIn` and **never appears anywhere in the metric's output**. `SearchAnalyticsPg` *is*
   declared (`search-analytics-pg.ts:39`), but in `analytics: SearchAnalytics | SearchAnalyticsPg` it
   only ever occurs after `| `, never in `<name>:` position, so `search-hub-metric.ts:139`'s pattern
   captures no binding for it. Independently moot a third time: `getAnalytics` returns
   `deps.analytics` **whole** and never dereferences it, so `perModule` gains nothing either way —
   the same route by which T11's `indexManager` and T7's `_rlm` contributed zero.
2. **And it must not be narrowed even so.** `Pick<>`-narrowing it breaks `type-check`: the value is
   returned through the root's public `getAnalytics(): SearchAnalytics | SearchAnalyticsPg`, which is
   a compatibility surface for 24 importers. This is the same reason the T10 `Pick<>` decision did not
   generalise to T11's seam field, arriving on the return path instead of the assignment path. **The
   T12 row's instruction was therefore not merely unnecessary but unexecutable**, and a later reader
   following it literally would have produced a red gate.
3. **`fileFilterCache` does fire the mechanism and still does not fire the gate.** The binding *is*
   captured and `deps.fileFilterCache.invalidateProject` *is* a dereference, so un-narrowed it takes
   `FileFilterCache` from foreign 0 / reach 0 to foreign 1 / reach **1**. That is under
   `MAX_FOREIGN_REACH` (**3**), so unlike T10's `IndexManager` at reach **4** it produces **no second
   G-HUB violation** and would never have made T14's gate unclosable. **The `Pick<>` is kept anyway**,
   because §4.4 says a record holds exactly what is read and one method is the honest type — but it is
   recorded as honest typing, **not** as a sensor that fired. Claiming otherwise would be this
   repository's own defect class: an artifact reporting success while measuring nothing.

**What generalises, and it is the same sentence as T9's finding one level up:** a sensor claim has to
name the *mechanism* it detects on the *specific* type, not the *category* the type belongs to.
"Declared in the gated directory + required field" is a category; whether the annotation pattern
captures a binding and whether the module dereferences it are the mechanism, and they are two
separate measurements. **T13's `queryUnderstanding` is the one site left where both may hold** —
§2.1 shows `searchImpl` dereferencing it — so T13 must run the same two-variant simulation rather
than inherit either answer.

### T12 ran the memo mutation, and the blind-recursion mutation has no observable subject here

**The memo obligation, discharged for the third consecutive time with the same answer.** T9 required
T10, T12 and T13 to each measure rather than inherit the assignment-site count. T10 measured and was
blind at the richest surface in the repository. T12 measured, on a surface with far fewer sites, and
is blind in the same place:

| violation shape | `tsc` | `index-admin-late-bind` | `rlm-admin` | coverage | characterization |
| --- | --- | --- | --- | --- | --- |
| record **memoised on first call** | 0 | **2/2** | 7/0 — blind | 41/0 — blind | 21/0 — blind |
| record captured at **construction** | 0 | **2/2** | **4/3** | **38/3** | 21/0 |
| memo confined to a **single field** | 0 | **3/1** | 7/0 — blind | 41/0 — blind | — |
| `search` bound at **assembly** time | 0 | **3/1** | 7/0 — blind | 41/0 — blind | — |
| **seventh-key leak** | **2** (TS2353) | **3/1** | 7/0 | 41/0 | — |

Same split as T9's and T10's: a construction capture is caught loudly, a first-call memo is invisible
to everything except the dedicated sensor. **Three of the five shapes are invisible to the entire
pre-existing suite** — the memo, the single-field memo, and the assembly-time bind — which is T11's
two-of-three finding recurring on a different axis.

**Two things this file's sensor does that the three earlier ones do not, and both were measured
rather than assumed.**

- **Test 2 reassigns all five non-re-entrant fields, not one.** `project-indexer-late-bind.test.ts:119-135`
  reassigns `indexManager` alone, and its two siblings likewise reassign one field each — so a memo
  scoped to any *other* field of the same record survives them. Row 3 above is that shape: a memo on
  `analytics` only, which the one-field pattern would have missed and which this file catches at
  **3/1**. Recorded as a *widening*, not a correction: T10's shape is sound for the field it names.
- **Test 4 is the only thing in the repository that can see the `search` seam.** `rlm.search` is
  stubbed at **7 instance-method sites** (`rlm-admin.test.ts:124,137,148`;
  `contextual-search-rlm-coverage.test.ts:382,395,407,416`) as bare assignments with no `as any` cast
  — the same PATCHABLE-invisible shape T10 registered for `indexFile`/`indexProject`, and a **7-site
  extension** to the constraint's measured footprint. Those 7 are also the *only* 7 calls to
  `warmupCache` in the suite, and every one assigns before it calls, so a bare `search: this.search`
  or a `.bind(this)` at assembly time still captures the stub and every pre-existing suite stays
  green (row 4: 7/0, 41/0, `tsc` 0).

> **`git grep -E` cannot express the sweep that finds those 7 sites, and it fails silently.** POSIX
> ERE has no `\s`, so `git grep -E '\.search\s*='` returns **zero matches and exit 1** — which reads
> exactly like "no stub sites exist". `git grep -P '\.search\s*=(?!=)'` returns **7**. The first T12
> sweep reported zero and was wrong, which is precisely how T10's first PATCHABLE sweep failed, by a
> different mechanism. **Two methods, two answers, for the seventh time in this feature** — and the
> standing instruction to prefer `git grep` over the shell's `grep` is necessary but not sufficient:
> the *flag* is part of the method. Verified directly: the same pattern against
> `rlm-admin.test.ts` gives `-E` exit 1 / no output and `-P` a count of 2.

**The blind-recursion mutation refines T10's rule, and the refinement is that T12 has no subject
satisfying it.** T10 recorded: run the mutation on a delegate with **no preceding `await`**, because
`async f() { await g(); return this.f() }` is an unbounded *microtask* chain that never yields, so the
5 s per-test timer cannot fire — measured there as a run killed at 10 minutes. T12 chose
`getAnalytics` for exactly that property: the one delegate whose original never called
`ensureInitialized`, so nothing is awaited ahead of the module call. **It hangs anyway.** Measured:
`return this.getAnalytics()` leaves `tsc` at **0** and then runs >60 s at ~98% CPU with no throw and
no output — not only inside `bun test`, but in a bare `bun` script that calls the method inside a
`try/catch`, which rules out the test runner's error formatting. The `const r = this.getAnalytics();
return r;` form behaves identically (`tsc` 0, >45 s, three suites killed at 120 s each).

So the additional necessary condition is that the delegate be **`async`** — an async frame cannot be
elided, which is why T9's `correctQuery` and T10's `indexFile` overflowed the stack immediately and
reported clean 40/1 and 39/2 readings. T12's four delegates are three `async`-with-preceding-`await`
(T10's microtask case) and one `sync` (this case), so **no subject on this surface is observable**.
*A candidate mechanism for the sync case — JavaScriptCore performing tail-call elimination on
strict-mode code, Bun being JSC rather than V8 — was **tested and not confirmed**: the
assign-then-return form is not in tail position and hangs identically. It is recorded as unverified
rather than asserted; the observable facts above stand on their own.*

**What this does *not* mean is that the seam is unsensored.** A hang is not blindness: a blind
mutation exits 0 with every suite green, whereas none of these runs can ever report green. The
positive runtime evidence that the facade reaches the capability module is
`index-admin-late-bind.test.ts` test 1's `toHaveBeenCalledTimes(2)` on the module spy, which a
recursion cannot satisfy. And the *naive* half of the pair is caught statically exactly as T8
predicted for a deps-taking module: `return this.getAnalytics(this.#indexAdminDeps())` fails with
**TS2554: Expected 0 arguments, but got 1**. **T13 must not budget time to find an observable
recursion subject** — it inherits the same two mechanisms — and should record the hang plus the spy
assertion, as here.

### The trap the plan never named: `MAX_FILE_LOC` is 700 and the root is now 675

G-HUB gates on **two** axes, and every task so far has been read on one of them.
`scripts/search-hub-metric.ts:50` sets `MAX_FILE_LOC = 700`, and `scan()` fails the directory when any
single file exceeds it. Phase 1 has been moving LOC *out* of `rlm-*.ts` files and *into*
`contextual-search-rlm.ts`, which took the largest-file title from `project-indexer.ts` (641) at T10
and is now the binding constraint:

| commit | largest file | LOC |
| --- | --- | --- |
| T10 / T11 | `contextual-search-rlm.ts` | **641** |
| T12, as first written | `contextual-search-rlm.ts` | **685** — 15 lines of headroom |
| T12, as committed | `contextual-search-rlm.ts` | **675** — 25 lines of headroom |

**Say which metric — this axis has two and they differ by one.** Every figure above is the gate's own
count, `split("\n").length` inside `scan()`, which on a file ending in a newline is `wc -l` **+1**: the
committed root reads **675** to the gate and **674** to `wc -l`. The gate compares the former against
700, so the former is the only comparable number, and T10's 641 and T8's 592 sit on the same axis. A
`wc -l` figure quoted against the ceiling understates the risk by a line — trivial in size, and exactly
the §3.2 failure mode that has now cost this feature seven times. Caught here before it was written down.

The 685 reading is recorded rather than quietly fixed, because it is the number that shows how tight
this is: **T12 alone consumed three quarters of the remaining headroom**, and T13 grows the root
again — `#hybridSearchDeps()` goes from one field to five, and four more methods gain a hoisted
`await this.ensureInitialized()`. Crossing 700 makes G-HUB exit 1 on an axis unrelated to hub
coupling, and T14's gate would then be unclosable for a reason no task row names.

**Mitigation, applied inside T12's own write set:** the long doc prose lives on `IndexAdminDeps` in
`index-admin.ts` rather than on `#indexAdminDeps()` in the root — the `IndexerDeps` precedent from
T10 — and the root's block keeps a pointer. That bought 11 lines. It is carried as a **sensor on the
T13 row**, not as advice, for the same reason the `Pick<>` narrowing was: "remember to keep the root
small" is a precondition of T14 going green.

### T11 — the first Phase 1 task whose plan row survived execution unamended

Seven plan defects preceded this one, and T11 produced no eighth. The row was executed as written and
every prediction in it held: the field goes in `injectedDeps`, the default is today's direct
construction, and no structural sensor moves. Worth recording, because it is evidence about *where*
this plan's defects live rather than a claim that it is now sound — **T11 is the only Phase 1 task that
moves no function**, and every one of the seven defects was a consequence of a move. T12 and T13 move
functions again and each already carries a known trap.

One **near miss** that was not a plan defect but would have left a sensor decorative. The plan named
two violation shapes — seam never consulted (parity's complement) and default path deleted. It did not
name a third: **the seam correct but constructed in the wrong position**, hoisted above the
`Promise.all` so `new IndexManager(this.vectorStore)` captures an unresolved store. That shape still
satisfies `instanceof IndexManager`, so it passes any test asserting only the class. It was surfaced by
the read-only `massa-ai-plan-critic` run against T11's implementation plan before the first edit, and
it is why the default-path test asserts *which* vector store the constructed manager holds rather than
just its type. Measured: under that mutation the assertion fails with `Received: undefined` while the
`instanceof` above it still passes — so the assertion is load-bearing, not ceremony.

**The three shapes, each verified *applied* before its reading was believed** (a substitution that
silently no-ops reports blindness that is not there — T10's lesson, mechanised here as a harness that
diffs against a pristine copy, greps for an injected marker, and refuses to report if the file is
byte-identical; the restore is diffed too):

| violation shape | `tsc` | `index-manager-seam` | `rlm-indexing` | which assertion fired |
| --- | --- | --- | --- | --- |
| seam never consulted (unconditional construction) | 0 | **2/1** | 25/0 — blind | `toBe(injected)`, identity |
| default path deleted (injected value only) | 0 | **2/1** | **24/1** | `instanceof` → `false` |
| seam correct, hoisted above the `Promise.all` | 0 | **2/1** | 25/0 — blind | manager's `vectorStore` → `undefined` |

**Two of the three are invisible to the entire pre-existing suite, and that is finding 7 discharged
with a measurement instead of an argument.** The plan challenge predicted on principle that a parity
test "exercises only the default path and cannot fail on a seam that is wired but never consulted".
Measured here: the repository's *only* assertion about this member was
`rlm-indexing.test.ts:201`'s `expect((rlm as any).indexManager).toBeDefined()`, which catches the
second shape (hence **24/1**) and neither of the other two. `tsc` exits **0** on all three — the same
structural blindness T7 found for `this.`-recursion, arriving on a different axis.

### The `?` in `indexManager?: IndexManager` is a G-HUB guard, not a style choice

T10's seventh defect enumerated the sites that will fire it: `FileFilterCache`,
`SearchAnalytics`/`SearchAnalyticsPg` at T12, `QueryUnderstandingService` at T13 — all declared inside
the gated directory. **`IndexManager` at T11 is a fourth such site, and it does *not* fire, for a
reason worth writing down before someone "tidies" it.** `search-hub-metric.ts:139`'s pattern is
`([A-Za-z0-9_]+)\s*:\s*<Type>\b`, and `\s*` cannot match `?` — so an **optional** field is never
captured as a binding, exactly as the existing `indexManager!: IndexManager` at
`contextual-search-rlm.ts:93` has always escaped it via `!`. A second, independent route makes it moot
anyway: `perModule` only gains an entry when a *dereference* is found, and `contextual-search-rlm.ts`
contains no `indexManager.<member>` — only `this.indexManager`, which is attributed to
`ContextualSearchRLM`. That is the same mechanism by which `buildGraphStreamImpl`'s never-dereferenced
`_rlm` contributed zero at T7.

Both routes were **measured, not reasoned**: `IndexManager` reads foreign **0 → 0**, reach **0 → 0**,
members **7 → 7**, and the whole `types` array still holds exactly one entry above the ceiling.
Recorded because the narrowing decision settled at the T10 review point (`Pick<>` per record) does
**not** apply here and should not be applied by analogy: the seam's value is assigned to the public
field `indexManager!: IndexManager`, which `design.md` §4.3.1 keeps at the full type for its 18
post-construction stub sites, so a `Pick<>` seam would not be assignable without a cast — a narrowing
that buys nothing and costs type honesty. **The residual risk is a later edit dropping the `?`**, or
restyling this record into `IndexerDeps`' required-field shape; nothing fails until T14's gate. The
field carries a comment saying so, and this is its second record.

### T13 and T15 — the count moves back to 29, and it is the first decrement

`rlm-` in tracked files outside `CHANGELOG.md` / `.specs/` / `.ua/`: **30 → 29**, measured with
everything **staged**, via `git grep -l -P` with explicit pathspec exclusions. Every earlier Phase 1
task moved this number **up** (19 at `ce26f28` → 27 → 28 → 29 → 30) because each added a sensor file
citing the suite it was measured against. T13 is the first to move it down, and the arithmetic is two
moves netting **−1**: `rlm-search.ts` leaves the set (deleted), and **nothing enters** — the sensor
this task widens, `hybrid-search-late-bind.test.ts`, was already in the set from T9.

The 29 are: `CLAUDE.md`, `docs/ONBOARDING.md`, four `rlm-*.test.ts` files, ~~ten~~ **nine** other test
files under `packages/core/src/__tests__`, ~~six~~ **seven** `services/search/*.ts` carrying provenance
comments, and seven `scripts/`. **Both figures were wrong and they cancelled, which is why the total
still landed on 29** — re-measured at `e4e38bd` by bucketing the enumeration rather than by counting
prose. A naive bucket reports *twelve* "other test files" because three of them live under
`scripts/__tests__` and are already inside the `scripts/` bucket; that double-count is the same shape.
**Class 1 vs class 2 still must not be conflated** (see T15's section): `rlm-search.test.ts` *survives*
PR-B, while `hybrid-search.ts`'s new provenance comment naming the deleted `rlm-search.ts` is class 2.

> **Corrected at T15 — the thirteenth plan defect.** This paragraph, `HANDOFF.md:325`, `HANDOFF.md:561`
> and the T15 row all called renaming the four suites *"T15's own decision"*. **GMS-04 AC-1 already
> mandated it** — *"No source or test file under `packages/core/src` is named `rlm-*`"* — so the plan
> relaxed an acceptance criterion its own spec had fixed, and a reader could have closed PR-B with
> `rlm-admin.test.ts` still on disk and believed AC-1 met. Only the **names** were ever the executor's
> call. (`contextual-search-rlm*.ts` is **not** an AC-1 violation: `rlm-*` means *starts with*, and
> §6 keeps that file deliberately.)

### T12 and T15 — the count moves to 30

`rlm-` in tracked files outside `CHANGELOG.md` / `.specs/` / `.ua/`: **29 → 30**, measured with the new
files **staged**. The arithmetic is three moves netting `+1`: `rlm-admin.ts` leaves the set (deleted),
`index-admin.ts` enters it carrying its provenance comment (**class 2** — a reference to a now-deleted
`rlm-*.ts` source), and `index-admin-late-bind.test.ts` enters it citing `rlm-admin.test.ts:124,137,148`
and `contextual-search-rlm-coverage.test.ts:382,395,407,416` as the stub sites its test 4 compensates
for (**class 1** — a reference to a `rlm-*.test.ts` file that *survives* PR-B). Same shape as T10's and
T11's `+1`: every new sensor file cites the suite it was measured against.

**Enumerated with `git grep -l -P`.** The `-P` is not incidental here — see the `-E`/`\s` note in the
T12 mutation section; a load-bearing sweep in this repository now needs its *flag* named as well as
its tool.

### T11 and T15 — the count moves to 29, class 1

`rlm-` in tracked files outside `CHANGELOG.md` / `.specs/` / `.ua/`: **28 → 29**, measured with the new
file **staged** (`git grep` enumerates tracked files only; unstaged it reports 28 and would be wrong —
the same trap T10 recorded). The `+1` is `index-manager-seam.test.ts`, which cites
`rlm-indexing.test.ts:201` as the pre-existing assertion its second mutation overlaps. That is
**class 1** — a reference to a `rlm-*.test.ts` file that *survives* PR-B, so it is consistent until
T15 decides whether to rename those suites, not a stale pointer. Same class and same cause as T10's
`project-indexer-late-bind.test.ts`: every new sensor file cites the suite it was measured against.

> A cross-check worth keeping. The plan critic independently measured this count as **19**, against the
> **29** measured here. The critic's number came from a `grep` honouring `.gitignore` — the repo's
> `grep` is a ugrep shim, which is exactly why `tasks.md` specifies `git ls-files` / `git grep` with
> explicit pathspec exclusions for anything load-bearing. Two methods, two answers, for the sixth time
> in this feature. **Name the method or the number is not comparable.**

### AC-3 vs GMS-03 AC-1 — the "zero test edits" claim is false

Found at **T6**, by executing T6 and measuring rather than by reading. Same class as the
`ensureInitializedImpl` omission: a consequence the design decided in substance and never wrote
into the constraint that contradicts it.

**GMS-03 AC-1** requires that no `*Impl` signature begin with the facade instance.
`packages/core/src/__tests__/contextual-search-rlm-coverage.test.ts` contains **18 assertions
whose content is that the facade *is* the first argument** — `toHaveBeenCalledWith(rlm, …)` /
`toHaveBeenLastCalledWith(rlm, …)`. The two criteria cannot both hold. AC-3's *"PR-B needs zero
test-file edits except the 4 rename sites"* is therefore false, and it is false for every Phase 1
task, not just one.

**Where §4.3.1's reasoning was right and where it stopped.** Its subject is *post-construction
state assignment* — `(rlm as any).keywordSearch = …`. Those ~80 sites do survive untouched, exactly
as LATE-BIND predicts, and T6 confirms it: `rlm-indexing` 25, `rlm-search` 31, `rlm-synapse` 26,
`rlm-admin` 7, `concurrent-indexing` 9, characterization 21 — all unchanged. What it never covered
is *delegate call-signature forwarding*, which GMS-03 AC-1 exists to change. `design.md` D-R7 saw
the tests ("24 of the facade's 41 tests are forwarding-only") without drawing the consequence.

**Measured at T6**, before any test edit:

| suite | before | after T6 source change |
| --- | --- | --- |
| the other six characterization suites | 119 | **119** — unchanged |
| `contextual-search-rlm-coverage.test.ts` | 41 pass / 0 fail | **37 pass / 4 fail** |

The four are precisely the `fuseResults` / `generateScoreExplanation` forwarding tests.

**Resolution (spec-owner, 2026-07-29): amend AC-3, bounded.** Signature-tracking edits are
authorised, enumerated per task below, and each may do exactly one thing — drop the facade argument
that no longer exists, or re-point a `mock.module` specifier and the symbol names inside it.

| task | assertions | also |
| --- | --- | --- |
| T6 | 2 | `mock.module` split: `fuseResults`/`generateScoreExplanation` leave the `rlm-search.js` mock for a new `result-fusion.js` one |
| T7 | 2 | **plus 3 call sites** in `graph-stream-project-scope-pg.test.ts`, which passes `NO_RLM` as the first argument — that file is **not** rename-only, contrary to §4.6 |
| T8 | 2 | `mock.module` split: `applySynapseState` leaves the `rlm-synapse.js` mock for a new `session-bias.js` one, which keeps `correctQueryImpl` behind. **Plus a setup change in the same two tests, declared here so it is not read as drift:** each now passes two stub collaborators into `makeRlm(…)` so the asserted deps record has *defined* values. Measured reason — bun's `toHaveBeenCalledWith` treats an undefined-valued key as absent, so `f({})` satisfies `toHaveBeenCalledWith({a: undefined})`; asserting `{sessionRegistry: undefined, synapseManager: undefined}` would therefore also be satisfied by a facade that assembled `{}`. With defined values the check is exact on identity and extra keys still fail, so both assertions are **strictly stronger** than the `rlm` first argument they replace. Textual `expect(` sites unchanged at **71**, and bun's runtime tally unchanged at **75 expect() calls** — two different metrics, both pinned somewhere, so always say which |
| T9 | 1 | The `rlm-synapse.js` `mock.module` block is **deleted, not re-pointed** — `correctQueryImpl` was its last key and the module no longer exists — and replaced by a `hybrid-search.js` block, so the `mock.module` count stays at **16** rather than splitting to 17 as T6/T7/T8 each did. **Plus a setup change in the same test, declared here so it is not read as drift**, and it is the T8 pattern arriving by a different route: the stub must be *defined* for the record assertion to mean anything (the `toHaveBeenCalledWith` trap below), but `keywordSearch` is a **field**, not an `injectedDeps` read — the constructor stores its argument in `injectedDeps`, only `ensureInitialized` bridges it to the field, and `correctQuery` does not await it. So `makeRlm({keywordSearch})` would still yield an undefined-valued record; the stub is assigned as `(rlm as any).keywordSearch = …`, which is both the only way to get a defined record and this file's own established idiom (`:297`, `:333`, `:385`). Verified mechanically over comment-stripped source, before → after: `test(` **39 → 39**, `describe(` **20 → 20**, `expect(` **71 → 71**, `toHaveBeenCalledWith` **14 → 14**, `toHaveBeenLastCalledWith` **10 → 10**, `mock.module` **16 → 16**, skips/todos **0 → 0**, and zero occurrences of `toBeTruthy` / `toBeDefined` / `anything()` / `expect.any` in either state. Runtime **41 pass / 0 fail** and bun's **75 expect() calls**, both unchanged |
| T10 | 8 | `mock.module` **re-pointed, not split** — `rlm-indexing.js` → `project-indexer.js`, five spied names losing their `Impl` suffix and `_indexProjectInternalImpl` → `indexProjectInternal`; count stays at **16**, same shape as T9. **Plus three changes declared here so they are not read as drift**: one named helper `indexerDeps(rlm)` holding the expected record, whose two re-entrant keys are the file's only `expect.any(Function)` (**0 → 2**) because a per-call closure cannot be identity-matched and the compensating identity check lives in `project-indexer-late-bind.test.ts` test 4; an `await rlm.ensureInitialized()` added to the two `indexFile` tests, because `indexFile` is the one surface whose original never initialised and an all-`undefined` record is unassertable under the `toHaveBeenCalledWith` trap; and four comment corrections naming symbols this commit deletes. Zero assertions added or removed — `expect(` **71 → 71** textual, **75** runtime |
| T11 | **0**, and 0 spent | The only Phase 1 task whose diff contains **no existing test file at all**. It moves no signature, so there is nothing for a signature-tracking edit to track, and its sensor is a new file. Recorded rather than omitted so the ledger accounts for every task; the total is unchanged |
| T12 | **0**, and 0 spent | The second such task, and unlike T11 this one *does* move four signatures — so the zero needed checking rather than assuming. Measured: there is **no `mock.module` block targeting `rlm-admin.js` anywhere** (`git grep -P 'mock\.module\([^)]*rlm-admin'` → exit 1), because `contextual-search-rlm-coverage.test.ts:84-89` deliberately leaves `clearProjectIndexImpl` / `getProjectStatsImpl` / `warmupCacheImpl` spread from the **real** modules — "the describe blocks above already assert their real, end-to-end behavior, which is a strictly stronger forwarding proof than a spy would give". So no forwarding assertion names an admin symbol and none needs re-pointing. The file's three `toHaveBeenCalledWith(rlm, …)` sites (`:647`, `:655`, `:844`) are all `searchImplMock` / `addContextToResultsImplMock` — **T13's 3, exactly the budget below**, which is what makes the ledger's 18 add up. **Left to T15 deliberately: five stale comment mentions** of `rlm-admin` in that file (`:8`, `:9`, `:10`, `:84-85`). T10's rule corrects test-file comments only in a file already open for authorised assertions, and T12 opens no test file — so touching them here would be the first test-file edit in PR-B with no mechanical cause |
| T13 | ~~3~~ **4**, and 4 spent | `:647`, `:655`, `:844` — enumerated at T12 while confirming T12's own zero — **plus the `correctQuery` forwarding assertion, which T12's sweep could not have found**: it lost its facade argument at T9, and what T13 changes is the *shape of the record* it asserts as `HybridSearchDeps` widens 1 → 8 keys. Measured, not predicted (the file ran 40/1). See [AC-3 at T13](#ac-3-at-t13--the-budget-is-4-not-3-and-the-ledger-total-is-19). **Plus a `mock.module` merge, not a re-point** — two blocks would both have named `hybrid-search.js` — so the count goes **16 → 15**, the first time it has moved down. Plus the `hybridDeps(rlm)` helper (T10's `indexerDeps` precedent) and `expect.any` **2 → 5** on the three re-entrant callbacks |
| T14 | **0**, and 0 spent | The third such task. Comments only, one source file, no test file in the diff at all |
| T15 | **0**, and 0 spent — **but the widest test-file footprint in PR-B, and it must be read here or it reads as the violation it is not** | **11 test files**, against the plan's *"the only test-file edits in PR-B outside the 4 rename sites"*. Four are the AC-1 renames (`git mv`, similarity 93–98 %, the delta being header line 2 and the `describe` titles). Six carry **citation repoints** — `architecture-map`, `index-admin-late-bind`, `index-manager-seam`, `project-indexer-late-bind`, `search-controller`, `session-bias`. The eleventh is `contextual-search-rlm-coverage`, whose header block T12 deliberately left here. **Zero assertions were added, removed, relaxed, skipped or re-argumented**, and that is measured per file rather than argued: `test(` / `expect(` / `skip|todo` counts before (`e4e38bd`) → after are **identical in all eleven** — 7/11/0, 25/64/0, 31/43/0, 26/34/0, 41/75/0, 24/93/0, 4/8/0, 3/9/0, 4/10/0, 39/71/0, 10/14/0. The four suites still run 7 / 25 / 31 / 26 and the net is still **160**. **The reason the budget is 0 while the footprint is 11** is that AC-3 bounds *signature-tracking assertion edits*, and T15 moves no signature — every edit is a comment, a filename or a `describe` string. **T20's verifier must be given this row explicitly**, alongside the 19 authorised edits above and the `.ua/` exclusion |
| **total** | ~~18~~ **19** | 3 `mock.module` targets re-pointed across 6 modules and **1 merged**; ~14 mocked symbol names. **T14 and T15 add nothing to this total** — see their rows |

`rlm-indexing.test.ts` **is** genuinely rename-only: it imports only `runWithIndexLock`, whose
signature `(lockMap, projectId, work)` never took the facade.

**This is not a weakening, and the sensor says so rather than the author.** The file stays at
**41** tests, no assertion is deleted, nothing is skipped, and each edited assertion remains an
exact-argument check over every parameter that still exists. Any diff that drops a test, adds a
skip, or relaxes an assertion to a looser matcher is out of bounds and stops the task.
**T20's verifier must be told this explicitly**, alongside the two authorised comment edits in
T15 — otherwise 18 assertion changes in a PR claiming "no test weakened" read as the violation
they are not.

### Phase 0's before-baselines were live-tree assertions

Third defect found at T6, and the one that would have made Phase 1 unrunnable as specified.

Phase 0 recorded its before-measurements as unit tests that measure the **live tree** —
`describe("the real search directory at PR-B's base commit")` in `search-facade-matrix.test.ts`,
and its twin in `search-facade-metrics.test.ts`. Those pins hold exactly until the refactor they
exist to police begins. `search-facade-matrix.test.ts` even contains a synthetic test named
*"is empty when nothing takes the facade — the target state"*, so the suite knew the end state
empties `delegateScope` and still pinned **21** against the live directory.

**Consequence: `bun run test:scripts` could not stay green through Phase 1**, and the "Gate check
commands" section's *725 pass / 0 fail* known-good was an invariant Phase 1 necessarily destroys.
T6 alone reddened 5 assertions; by T14 the whole matrix block goes.

Note what this is **not**. The *gates* are fine and Phase 0 got them right: `check-frozen-anchors.ts`,
`check-characterization.ts` and `search-hub-metric.ts` all still exit correctly under T6, and
`check-characterization.test.ts` stays green because item 5 of *What Phase 0 changed in the plan*
deliberately located its blocks **by symbol, not by path**. That reasoning was simply never applied
to D1's and D3's own suites.

**Resolution (spec-owner, 2026-07-29): freeze to committed fixtures — T6a.** Same fix, same
reason, as T4's `needles-before.json`: *a baseline that does not survive a fresh checkout cannot be
T17's referent.* `scripts/capture-facade-baseline.ts` writes `facade-matrix-before.json`,
`facade-metrics-before.json` and `frozen-anchors-before.json` beside it.

Scoped to what actually moves — **9 assertions, not 16**:

| suite | frozen | left live, and why |
| --- | --- | --- |
| `search-facade-matrix.test.ts` | **7** | 15 synthetic-fixture tests — the real guards on the tool |
| `search-facade-metrics.test.ts` | **1** (§7 fan-in/fan-out) | 5: the mention-bucket partition is explicitly *a floor, not a pin*, and three measure `packages/core/src/controllers`, which is PR-C's territory and untouched here |
| `check-frozen-anchors.test.ts` | **1**, rewritten | 2 invariants (uniqueness; no grandfathered needle) |

Two things worth keeping straight:

- **The anchor test was asserting the opposite of its constraint.** It pinned the four anchors to
  `rlm-fusion.ts` / `rlm-search.ts` by path. FROZEN-ANCHOR says the anchor **text** is frozen and
  explicitly permits moving it between files, because resolution is by content — so the path pin
  went red on the one operation the constraint allows and added nothing the uniqueness test above
  it does not already catch. It now pins the text, which fails on a reflow and passes on a move.
- **Re-freezing is detectable.** The generator refuses to run when any measured path differs from
  the base commit, records `subjectAtBase`, and the suites assert it. `--force` over a changed
  subject turns the provenance tests red rather than quietly rebasing the record. The check is on
  the measured **subject**, not on `HEAD`'s sha: a docs-only commit has a different sha and an
  identical subject, and rejecting it would be the same conflation in the other direction.

### T6's sensor was unfirable — corrected

The T6 row read *"hub-metric reach drops below 14"*. It cannot. `maxForeignReach` is the deepest
single foreign **module**, and that module is `rlm-search.ts` at **14** — the union of `searchImpl`
(13) with its file-mates. `rlm-fusion.ts` read **one** member, so removing it cannot move the
maximum. Measured, before and after T6: reach **14 → 14**, foreign modules **6 → 5**.

Taken literally the row would have reported T6 as failed while it succeeded, and the same is true
of T7–T12: **reach cannot fall until T13 rewrites `rlm-search.ts`, and ~~G-HUB cannot go green until
T14. G-HUB's exit status is T14's gate and nobody else's.~~** — **the struck half is the ninth plan
defect, measured at T13: reach falling *is* the gate, so G-HUB goes green at T13.** See
[the ninth plan defect](#ninth-plan-defect-t14s-sensor-fires-at-t13); this is the fifth correction in
this feature to inherit the defect it was correcting. Recorded because a sensor that reports
failure on an axis its task does not touch is the same defect class Phase 0 found four times,
pointing the other way.

The replacement offered here — *"the per-task sensor is the foreign-module count"* — is itself
wrong for T7 and T8. See the next section; the correction inherited the defect it was correcting.

### The foreign-module count is not a per-task sensor either — it moves once, at T9

Fourth plan defect, found at **T7** the same way as the previous three: by measuring rather than by
reading. It is the *correction* to T6's unfirable sensor that is wrong, which is why it survived a
plan challenge — the sentence above replaced one unfirable sensor with another on the same axis.

**Mechanism**, read out of `scripts/search-hub-metric.ts:137-146`: a file counts as a foreign module
only when it **dereferences** a binding annotated `: ContextualSearchRLM`. `buildGraphStreamImpl`'s
`_rlm` is never dereferenced, so it contributes **zero** members and its departure cannot change the
count. `rlm-synapse.ts`'s two members come entirely from the two functions T7 does not touch:
`applySynapseStateImpl` → `rlm.injectedDeps`, `correctQueryImpl` → `rlm.keywordSearch`.

Measured by scratch simulation before any edit, then confirmed against the live tree at T7:

| state | foreign modules | `rlm-synapse.ts` members read |
| --- | --- | --- |
| base (T6 landed) | 5 | 2 — `injectedDeps`, `keywordSearch` |
| + T7 | **5** | 2 — `perModule` byte-identical |
| + T8 | **5** | 1 — `keywordSearch` |
| + T9 | **4** | — drops out of the foreign set |

So the count moves **once across T7+T8+T9, and it moves at T9.** Attributing a decrement to T7 or
T8 would report a correct task as failed, exactly as T6's row would have.

**Resolution (spec-owner, 2026-07-29): T7's and T8's sensor is the D1 matrix delta**, measured by
`scripts/search-facade-matrix.ts` — shipped at T1, no new tooling, and the frozen
`facade-matrix-before.json` is untouched and remains T17/T20's referent. It reads the axis these
tasks actually move: how many functions still take the facade at all. T9 keeps the foreign-module
count, which does fire there.

Note what the T7 row's *original* sensor was — `rlm-synapse.test.ts` = 26. That number holds whether
or not T7 happened, because those tests drive `rlm.buildGraphStream` through the facade, which
survives the move. It is an **invariance** check, not a discriminating one. Both kinds are kept and
labelled: the invariance counts prove nothing broke, the D1 delta proves the extraction occurred.

**A third sensor was added at T7 and belongs to every task that moves a delegate.** The capability
modules deliberately share a name with the facade methods that call them (§4.3, and the import
comment in `contextual-search-rlm.ts`), and after the facade parameter is dropped they also share an
**arity**. `tsc` therefore cannot distinguish a correct delegation from `this.`-prefixed infinite
recursion — measured at T7: with `return this.buildGraphStream(…)` substituted, `bunx tsc --noEmit
-p packages/core/tsconfig.json` **exits 0**, while the coverage suite goes **39 pass / 2 fail**.
Dropping the trailing argument gives the same 39/2. Prove the seam at runtime; type-check is
structurally blind to it.

> **Refined at T8 — which recursion is blind depends on whether the module takes deps.** T7's module
> takes none, so its arity matched the facade method's exactly. A **deps-taking** module is one
> argument wider, and the naive substitution is therefore *caught*: measured at T8, `return
> this.applySynapseState(this.#sessionBiasDeps(), …)` fails with
> `TS2554: Expected 3-5 arguments, but got 6`. The blind variant is recursion that **also drops the
> deps record** — `return this.applySynapseState(baseResults, …)`, arity 5, identical to the facade
> method: `tsc` **exits 0** and the coverage suite goes **39 pass / 2 fail**. That is the more likely
> mistake, because omitting the deps record is the same edit as forgetting to add it. **The mutation
> to run at T9, T10, T12 and T13 is this second shape, not T7's.** Dropping the trailing argument
> still gives 39/2 unchanged.

### LATE-BIND has no sensor at T8, and the gap is now closed by a dedicated one

Fifth plan defect, found at **T8**, same class and same method as the previous four: by measuring
rather than by reading. What it contradicts is not a task row this time but the standing constraint
itself — LATE-BIND's `check` column reads *"`rlm-indexing.test.ts` pass **count** — the sensor, not
the site count"*, and §4.3.1 says *"the existing suite is already a sensor for LATE-BIND … the 77
sites detect it."* **Neither is true for T8's two members.**

**Mechanism.** LATE-BIND is sensed by the ~80 sites that stub facade state *after* construction: a
capability module that captured a collaborator would ignore them, and the pass count would drop.
T8's members are `sessionRegistry` and `synapseManager`, reached through `injectedDeps` — which is
declared `readonly` and has, by §4.3.1's own table, **zero** post-construction assignment sites. It
is one of exactly two members in that table with zero, alongside `RRF_K`. There is no stub to make
ineffective, so there is nothing for the pass counts to report.

**Measured on the finished T8 code**, by hoisting `#sessionBiasDeps()`'s literal into a field
captured on first call — the literal LATE-BIND violation:

| gate | reading under the violation |
| --- | --- |
| `bunx tsc --noEmit -p packages/core/tsconfig.json` | exit **0** |
| the seven characterization suites | **160 pass / 0 fail** — the full net, unchanged |
| `search-synapse-integration.test.ts` | **5 pass / 0 fail** |
| `session-bias.test.ts` (T8's own new AC-2 sensor) | **10 pass / 0 fail** |

Nothing detected it. Note the third row: T8's *own* sensor cannot see this, because it calls the
capability module directly and never goes through the facade — AC-2 and LATE-BIND sense different
seams and neither substitutes for the other.

**Why this could not be left as a recorded gap.** It self-heals from T9 onward — `keywordSearch` has
10 post-construction assignment sites, T10's members 18/7/4/4, T12's and T13's likewise — so the
ordinary sensor fires for every remaining task. But T8 is explicitly the task whose deps-record
shape T9/T10/T12/T13 copy. An unsensored pattern at the point of copying is how the invariant
regresses three commits later with every suite green, which is this repository's signature defect
class and the reason PR-B exists.

**Resolution (spec-owner, 2026-07-29): a dedicated sensor, in its own file.**
`packages/core/src/__tests__/session-bias-late-bind.test.ts` — **3 tests**, spying on
`session-bias.js` to observe the record the facade actually assembles, and asserting the observable
form of *"assembled per call, from current fields"*:

1. two calls receive **distinct** record objects with **equal** contents (this is the case that
   fires — a capture hands both calls the same reference);
2. two facades with different `injectedDeps` produce correspondingly different records, so the
   contents are read from the field rather than fixed at module scope;
3. `Object.keys(record)` is exactly `["sessionRegistry", "synapseManager"]` — a third field would be
   the root leaking state back into a capability module by the one route G-HUB cannot see, since a
   deps record is not a `: ContextualSearchRLM` dereference.

**Observed red before being trusted**, per Phase 0's practice: under the capture mutation the file
goes **2 pass / 1 fail** while `tsc` still exits 0.

It is a **separate file** rather than two more cases in `contextual-search-rlm-coverage.test.ts`
because AC-3's check column pins that file at exactly **41** tests. Adding to it would move a pinned
sensor mid-refactor, which is indistinguishable from weakening it in a diff — the same reasoning that
put T5's guard in `scripts/__tests__` and located its blocks by symbol rather than by path.

### LATE-BIND's ordinary sensor does not "come back" at T9 — it covers one violation shape of two

Sixth plan defect, found at **T9**, same class and same method as the previous five: by measuring
rather than by reading. What it contradicts is the *resolution* of the fifth — the sentence in the
section above reading *"It self-heals from T9 onward — `keywordSearch` has 10 post-construction
assignment sites … so the ordinary sensor fires for every remaining task."* **That is half true, and
the half that is false is the half T8's own dedicated sensor was built to catch.**

**Measured at T9 on the finished code**, two LATE-BIND violations run separately:

| violation shape | `tsc` | coverage | `rlm-synapse` | `search-ranking-regression` |
| --- | --- | --- | --- | --- |
| record captured at **construction** | 0 | 40 / 1 | **21 / 5** | **1 / 1** |
| record **memoised on first call** | 0 | **41 / 0** | **26 / 0** | **2 / 0** |

The existing suites catch the first shape loudly and are **completely blind to the second**.

**Mechanism — the assignment-site count is not the quantity that governs detectability.** All six
sites that reach `correctQuery` (`rlm-synapse.test.ts`'s five cases and
`search-ranking-regression.test.ts:37`) do *construct → assign field → call*. A first-call memo
populates **after** the assignment and therefore captures the correct value; the stub is never made
ineffective. Detecting a memo requires a collaborator to **change between two calls on one
instance**, and the number of tests doing that is **zero**. Ten assignment sites and zero
interleaved re-assignments are different counts, and §4.3.1's table records the former.

So the constraint as literally worded — *"never capture them at construction"* — **is** sensored at
T9 by the existing pass counts. The memoised shape is not, and memoising a per-call helper is the
more natural mistake of the two, because it reads as an optimisation rather than a change.

**Resolution (spec-owner, 2026-07-29): a dedicated sensor, mirroring T8's.**
`packages/core/src/__tests__/hybrid-search-late-bind.test.ts` — **3 tests**, spying on
`hybrid-search.js`. Separate file for the same reason as T8's: AC-3 pins the coverage file at
exactly **41** tests, and `session-bias-late-bind.test.ts` stays untouched at **3** rather than
being extended, because editing a guard added in the previous commit is the motion this repository
treats as indistinguishable from weakening one.

Its second test is the one that closes the measured gap and the one nothing else in the repository
performs: **assign the field, call, re-assign the field, call**, then assert the two records carry
the two different stubs by identity. Observed red before being trusted — **1 pass / 2 fail** under
the memoised mutation, the same **1 / 2** under the construction capture, and **2 pass / 1 fail**
under a third-key leak, which fires test 3.

**This propagates, and is now recorded as unverified rather than inherited.** The same section's
*"T10's members 18/7/4/4, T12's and T13's likewise"* reasons from the same wrong quantity. **T10,
T12 and T13 must each run the memo mutation against their own surface** and record the reading;
none of them may cite the assignment-site count as evidence that the ordinary sensor covers them.
That is the whole finding generalised: a sensor claim has to name the shape it detects, not the
population it counts.

### T10 ran the memo mutation, and the ordinary sensor is blind at its richest surface

The T9 finding above required T10, T12 and T13 to each measure rather than inherit. **T10
measured, and the answer is the same as T9's — which is the strongest available refutation of T8's
reasoning, because `rlm-indexing.test.ts` is the best case there is.** It holds **52 of the ~80**
post-construction assignment sites, `initialized` has 25 and `indexManager` 18, and it is still
blind. Two violations run separately against the finished T10 code:

| violation shape | `tsc` | coverage | `rlm-indexing` | `concurrent-indexing` |
| --- | --- | --- | --- | --- |
| record captured at **construction** | 0 | **33 / 8** | **8 / 17** | 9 / 0 |
| record **memoised on first call** | 0 | **41 / 0** | **25 / 0** | 9 / 0 |

Both mutations were verified *applied* before their readings were believed — a `perl` substitution
that silently no-ops reports blindness that isn't there, which is the same defect as measuring a
tool in a state it will not ship in. The memo diff was diffed against the pre-mutation file, and the
construction-capture run was confirmed to contain `#capturedDeps` before it was read.

So the assignment-site count is now conclusively **not** the quantity that governs detectability: at
T10 it is the largest it will ever be in this refactor, and it detects nothing. **T12 and T13 must
still run the mutation themselves** — the finding is that the inference is invalid, not that the
answer is always "blind".

**Resolution: a third dedicated sensor**, `packages/core/src/__tests__/project-indexer-late-bind.test.ts`
— **4 tests**, spying on `project-indexer.js`. Tests 1–3 mirror T8's and T9's three, widened to
`IndexerDeps`' seven keys. Test 4 is new to this file and is the compensating control for the
`expect.any(Function)` in the coverage file: it captures one deps record, then swaps
`rlm.indexFile` on the instance *between two invocations of the same captured closure* and asserts
both stubs ran. Green at **4 / 0** on the honest code, and observed red before being trusted:
**2 pass / 2 fail** under the memo, **3 pass / 1 fail** under `.bind(this)` at assembly time, and
**3 pass / 1 fail** under an eighth-key leak. `session-bias-late-bind.test.ts` and
`hybrid-search-late-bind.test.ts` were left untouched at 3 each.

> **The mutation shape matters, and getting it wrong costs ten minutes instead of five seconds.**
> The blind recursion was first run on `checkSearchAdmission`, and it **hung** rather than failing at
> `bunfig.toml`'s 5 s budget — the run was killed at 10 minutes. Cause: T10 hoists
> `await this.ensureInitialized()` above the delegate call, so `async f() { await g(); return this.f() }`
> is an unbounded **microtask** chain rather than stack recursion. It never yields to the macrotask
> queue, so the per-test timer cannot fire. T9's `correctQuery` recursion had no preceding `await`,
> which is why it overflowed the stack immediately and reported a clean 40/1. **Run the mutation on a
> delegate call with no preceding `await`** — at T10 that is `indexFile`, which gave `tsc` 0, coverage
> 39/2 and `rlm-indexing` 22/3. T12 and T13 hoist init the same way, so the same care applies. This
> is a property of the sensor method, not of the code under test.

### Seventh plan defect: the deps-record pattern is not G-HUB-neutral after all

Found at **T10**, by measuring rather than by reading, same as the previous six. What it contradicts
is a recorded claim about the *pattern itself*: `design.md` §3.4's *"The design's own per-module
records (`SessionBiasDeps` = 2 members, `HybridSearchDeps` = 5) are declared in the module that reads
them, so their foreign reach is 0"*, carried forward into the executor's trap list as *"a deps record
declared and consumed in its own module has foreign reach 0 — that is why the pattern is
G-HUB-neutral."*

**That is true of the record type and false of the types its fields name.** Mechanism, read out of
`scripts/search-hub-metric.ts:139-141`: the annotation pattern is
`([A-Za-z0-9_]+)\s*:\s*<Type>\b`, which does not distinguish a *parameter* annotation from an
**interface field declaration**. So `IndexerDeps { indexManager: IndexManager; … }` registers
`indexManager` as a binding annotated `: IndexManager`, and the four `deps.indexManager.<method>`
reads in the same file are then attributed to `IndexManager`:

| state | `IndexManager` foreign modules | `maxForeignReach` | G-HUB violations |
| --- | --- | --- | --- |
| base (`2664008`) | 0 | 0 | 1 — `ContextualSearchRLM` = 14 |
| T10 with `indexManager: IndexManager` | 1 (`project-indexer.ts`) | **4** | **2** |
| T10 with the field narrowed | 0 | 0 | 1 — the target, unchanged |

Two members deep, this is why it matters: **G-HUB going green is T14's gate**, and a second
violation introduced at T10 would have surfaced four commits later as "the gate will not close",
with T10, T12 and T13 all plausible causes. It is exactly the shape the previous six defects share —
a consequence the design settled in substance (§4.4: records hold *exactly* what is read) and never
wrote into the mechanism that contradicts it.

**Resolution (executor, inside T10's own write set): narrow the field, not the gate.**
`indexManager: Pick<IndexManager, "getIndexMetadata" | "isIndexStale" | "getFilesToReindex" |
"updateIndexMetadata">`. This is not metric-gaming: the four methods are precisely what the module
calls, so the narrowing makes the *type* honest at the same time it makes the annotation structural
rather than nominal — which is the identical reason `SessionBiasDeps`' `Pick<SessionRegistry,
"getAsync">` never fired. Raising the threshold or adding an exception was not on the table; §3.4
rejects an allowlist explicitly.

Why T6–T9 never hit it: their collaborators are either structural
(`Awaited<ReturnType<typeof getKeywordSearch>>`) or declared **outside** `services/search/`.
`IndexManager` is the first that is both a bare nominal type and declared inside the gated directory.

> **This recurs, and the sites are enumerable now.** Every collaborator type declared under
> `packages/core/src/services/search/` will fire the same way when it becomes a deps field:
> **T12** — `fileFilterCache: FileFilterCache` (`file-filter-cache.ts`) and any analytics field
> typed `SearchAnalytics` / `SearchAnalyticsPg` (`search-analytics.ts`, `search-analytics-pg.ts`);
> **T13** — `queryUnderstanding: QueryUnderstandingService` (`query-understanding.ts`). Narrow all
> four with `Pick<>`. **The check is one command, and it belongs in T12's and T13's sensor list:**
> `bun scripts/search-hub-metric.ts packages/core/src/services/search --json` must report exactly
> **one** type above the ceiling, and it must be `ContextualSearchRLM`. Reading only the
> `ContextualSearchRLM` row — which is what T6–T9 did, correctly, because nothing else could move —
> is what let this through for one measurement.

**Reviewer decision (2026-07-29, at the T10 review point): `Pick<>` per record is the pattern.**
Put to the reviewer with both readings, because narrowing does make G-HUB blind to a genuine
four-method reach into `IndexManager`, and the same will be true of the four T12/T13 sites. The
alternative — rescoping the ceiling inside `search-hub-metric.ts` so the annotation pattern skips
interface member declarations — was **rejected**: it edits a sensor during the refactor that sensor
polices, which is the motion this repository treats as indistinguishable from weakening one, and it
would need its own discriminating test plus a re-read of the frozen baselines. The narrowing is
substantively correct on its own terms (a consumer calling four methods of a collaborator service is
ordinary use, not hub coupling; the ceiling was calibrated on a 3-field DTO) and it matches
`SessionBiasDeps`' existing `Pick<SessionRegistry, "getAsync">`.

**The accepted cost is that "remember to narrow" is now a precondition of T14 going green, so it is
carried as a sensor rather than as advice** — see the T12 and T13 rows in the Phase 1 table.

### `ensureInitializedImpl` — the export that had no destination

`rlm-indexing.ts` exports **7** functions. `design.md` §4.1's `project-indexer.ts` row names six of
them (`indexProject`, `indexFile`, `ensureFreshIndex`, `checkSearchAdmission`, `loadGitignore`,
`runWithIndexLock`). The seventh — `ensureInitializedImpl` (`rlm-indexing.ts:552`, imported at
`contextual-search-rlm.ts:42`, called at `:134`) — appears in **no** §4.1 destination row and in no
task row of this file's first draft. Enumerating all 21 exports across the five `rlm-*` files found
no second omission.

It cannot go to `project-indexer.ts`. It reads **8** facade members (`analytics`, `indexManager`,
`initialized`, `injectedDeps`, `keywordSearch`, `searchCache`, `symbolRepo`, `vectorStore`), and
8 > 3, so wherever it lands outside the root it fails G-HUB **permanently** — T14's gate could never
go green. §4.5(b) already decided the substance ("keep lazy init in the root, doing exactly what it
does today"); the module table simply never recorded the consequence.

**Resolution (spec-owner, 2026-07-29): T10 owns it.** Its body becomes the literal content of
`ContextualSearchRLM.ensureInitialized()`, the export is deleted, and `rlm-indexing.ts` therefore
dies whole in a single commit rather than surviving as a one-function husk that GMS-04 AC-1 forbids
and that nothing would catch until T15, three tasks later. T11 re-points to the root accordingly —
the F4 seam adds a field to `injectedDeps`, which is a root field, so the seam belongs beside it.

> **Executed at T10.** The body is now the content of `ContextualSearchRLM.ensureInitialized()`,
> moved verbatim with `rlm.` → `this.`, and the export is gone: `git grep -n ensureInitializedImpl --
> packages/core/src` returns comments only. Three consequences a later task needs:
>
> 1. **`T11`'s seam site is `this.indexManager = new IndexManager(this.vectorStore)`**, inside
>    `ensureInitialized()` in `contextual-search-rlm.ts` — not `rlm-indexing.ts:586`, which no longer
>    exists, and not `project-indexer.ts`, which imports `IndexManager` as a **type only**.
> 2. **The root's five factory imports changed from `import type` to value imports.** The specifiers
>    are byte-identical, which is what keeps every `mock.module("…-factory.js")` in the suite pointing
>    at the same resolved module. Had the move renamed or re-pathed one, the seven suites that mock
>    those factories would have silently fallen through to live embedding-provider selection.
> 3. **`ensureInitialized` can no longer be mocked away at module scope**, because it is not a module
>    export any more. `contextual-search-rlm-coverage.test.ts`'s comment previously *asserted by
>    convention* that it was left un-spied so injected-deps wiring stayed real; that property is now
>    structural. It remains monkey-patchable **on the instance**, which is what PATCHABLE requires and
>    what `concurrent-indexing.test.ts:67` and `rlm-search.test.ts:156` rely on — both still green.
>
> **One measured extension to PATCHABLE, registered rather than surprising.** The constraint names
> `ensureInitialized` and `_indexProjectInternal`, and its 16 sites across 3 files reproduce exactly.
> T10's surface has **6 more instance-method stub sites** that are equally load-bearing:
> `rlm-indexing.test.ts` assigns `rlm.indexFile` at :377, :402, :537, :572, :609 and
> `rlm.indexProject` at :335, and every one is exercised *through* `ensureFreshIndex` or
> `_indexProjectInternal`. They are written as bare `rlm.indexFile =`, with no `as any` cast, so the
> established PATCHABLE regex does not find them — the first sweep at T10 reported zero and was wrong.
> This is why `IndexerDeps` carries `indexFile` and `indexProject` as **per-call arrow wrappers** and
> not as module-local calls: a module-local call compiles, type-checks, and makes all six stubs
> silently ineffective. §2.1 lists both members and §4.4's rule already places them in the record;
> §4.1's "injected collaborators" column names only the five stores, which is the same class of
> omission as this section's own subject.

---

## Phase 2 — rename, gate, close

| # | task | detail | sensor | cost |
| --- | --- | --- | --- | --- |
| **T15** ✅ | GMS-04 non-source sites — **done**, see *T15 — executed* below | `docs/ONBOARDING.md:147,148,177` (incl. the layer-4 tour entry) and `CLAUDE.md:157` — **plus two the first draft missed**: `packages/core/src/__tests__/architecture-map.test.ts:454-455` and `search-controller.test.ts:3`, both **comments** citing test files this PR renames. **The needles fixture is NOT a site** — PR-A content-anchored all 14 needles and removed every `filePath` (spec correction C4). | **scoped sensor** — see below | 45 m |
| **T16** ✅ | wire G-HUB into CI — **done, and scoped wider than this row**, see *T16 — executed* below | add to the `build` job beside `verify-package-contents.ts` | ~~flip a threshold in a scratch branch → CI goes red~~ **unexecutable, see the fifteenth defect** — substituted by the three-part local equivalent recorded below, **and** confirm `build` is in `main`'s required checks: `gh api repos/luizgmassa/massa-ai/rules/branches/main --jq '[.[] \| select(.type=="required_status_checks") \| .parameters.required_status_checks[].context]'`. A job that goes red without being in that list blocks nothing — that is exactly how PR-A's `coverage.yml` shipped claiming `BLOCKING BY DESIGN` and enforced nothing (SEN-02 AC-5). **A gate's enabling condition is part of the gate.** | 1 h |
| **T17** ✅ | needles after-run + comparison — **done, and its sensor was substituted**, see *T17 — executed* below | rerun the gate; per-needle rank diff vs T4's baseline. **A floor pass with three needles slipping 1→4 is a regression that passed** (GMS-05 AC-4 note 2) — that intent is unchanged and still enforced. | ~~the T4 diff script, exit 0~~ **unreachable on any PR that renames a file the corpus covers — the seventeenth defect.** `needles-diff.ts` exits **1** (`N05` rank 5 → 6) and the exit is produced by naming rather than by retrieval. Substituted by `scripts/needles-rename-control.ts` **exit 0**, alongside both floors passing | ~2 min + 30 m → **~3.5 h** |
| **T18** ✅ | coverage gate — **done, and its command needed a fix before it would terminate**, see *T18 — executed* below | `DATABASE_URL=…5433/massa_ai_test MASSA_AI_DEDICATED=1 RUN_POSTGRES_TESTS=1 bun run test:coverage` **`< /dev/null`** — the redirect is load-bearing, not hygiene; without it the gate hangs forever in `apps/web-ui` (the eighteenth defect) | exclusions still **9** ✅ (and `check-coverage.ts` has **zero** diff on this branch, which is AC-2's *"no new exclusion"* closed structurally rather than by a count); no file this PR touches below floor ✅ — **scope widened from the row's 6 to AC-2's 7**, minimum **94.57%** (`project-indexer.ts`) | 30 m → **~1.5 h** |
| **T19** ✅ | spec corrections ~~C1–C7~~ ~~C1–C10~~ ~~C1–C11~~ **C1–C12** — **done**, see *T19 — executed* below | apply `design.md` §10 to `spec.md`. **The range was stale by two before T15, short by one after it, short by one again after T17, and short by one more found during T19 itself**: §10 has held **C1–C9** since Design, T15 adds **C10** for GMS-04 AC-3 itself, T17 adds **C11** for GMS-05 AC-4 note 2, and T19 adds **C12** for GMS-03 AC-3 — the nineteenth plan defect. Without C10 nothing in §10 owned AC-3 — C4 covers only AC-4's obsolete needles clause. Without C11 nothing owns note 2's *"per-needle ranks are unchanged"*, which the shipped tree does not satisfy and cannot. Without C12 nothing owns AC-3's *"fan-in **and fan-out** both lower"*, which the shipped tree **fails** — fan-out 19 → 21. In all three cases T20's verifier, which reads `spec.md`, checks the criterion **as written**, finds it unsatisfiable, and marks it failed against a tree that satisfies what the criterion meant | ~~`design.md` §10 rows all struck~~ **non-discriminating — replaced, see below.** Striking a row in `design.md` is an edit the executor controls and is passed by a commit that changes `spec.md` not at all; measured at HEAD, **8** old-text occurrences survive such a commit. Substituted by a **per-correction discriminating pair** — old text absent **and** new text present, neither half sufficient — plus a positional check and a row-count check, in *Gate check commands* | 45 m → **~2 h** |
| **T20** ✅ | independent validation — **done, every criterion PASS**, see *T20 — executed* below | fresh `verification-agent`, author ≠ verifier → `validation.md` **Part II** (§13–§17). It re-derived rather than inherited: all four structural sensors at both the frozen `d628464` base and HEAD, every gate re-run live including the needles trio against a real Ollama, and per-file coverage recomputed from raw lcov | spec-anchored outcome check ✅ + discrimination sensor ✅ — T19's own sensor was run **with its control**: shipped `spec.md` **PASS 12/12**, pre-T19 `spec.md` **FAIL on all 13 checks, rows=0**. **PR-B cleared to merge, `--no-ff`** | — |

---

### T15's sensor, scoped — GMS-04 AC-3 as written is unsatisfiable

AC-3 says *"`rg 'rlm-'` returns only CHANGELOG and `.specs/`"*. Enumerated at `ce26f28` via
`git ls-files` (**not** the shell's `grep`, which is a ugrep shim honouring `.gitignore`), **19**
tracked files carry the string. Ten are the `rlm-*` sources and test filenames this PR renames. The
nine that survive the rename:

| site | status |
| --- | --- |
| `CLAUDE.md:157` | named by T15 |
| `docs/ONBOARDING.md:147,148,177` | named by T15 |
| `packages/core/src/__tests__/architecture-map.test.ts:454-455` | **was unnamed** — comment citing `rlm-admin.test.ts` |
| `packages/core/src/__tests__/search-controller.test.ts:3` | **was unnamed** — comment citing `rlm-search.test.ts` |
| `contextual-search-rlm-coverage.test.ts` | its **filename** carries `rlm-`; §6 deliberately keeps `contextual-search-rlm.ts`, so this is by design |
| `.ua/knowledge-graph.json` | **was unnamed** — **270** occurrences |
| `.ua/fingerprints.json` · `.ua/intermediate/scan-result.json` | **was unnamed** — 25 each |

The `.ua/` files are generated understand-anything artifacts, tracked since `3a25cc6` and not
gitignored. **320 occurrences in generated output that no rename can reach.** The criterion could
never have gone green as written.

> **The enumeration above is frozen at `ce26f28` and Phase 1 has grown it — re-enumerate at T15,
> do not work from this list.** Found at T9. Every extraction so far adds a *provenance comment*
> naming the file the body moved out of (`result-fusion.ts`, `graph-stream.ts`, `session-bias.ts`,
> `hybrid-search.ts` all carry "byte-preserved from `rlm-<x>.ts`"), and the new sensor files cite
> the suites they were measured against. Measured after T9: **27** tracked files carry `rlm-`
> outside `CHANGELOG.md` / `.specs/` / `.ua/`, against the 19 recorded at `ce26f28`.
> **Re-measured after T10: 28** — `rlm-indexing.ts` left the set and `project-indexer.ts` entered it
> carrying its provenance comment, so those two net to zero, and the `+1` is the new sensor file
> `project-indexer-late-bind.test.ts`, which cites `rlm-indexing.test.ts` (class 1). Taken with the
> new file **staged**, not untracked: `git grep` enumerates tracked files only, so the same count run
> a minute earlier reported 27 and would have been wrong.
>
> T10 also splits the two classes by write set, which is the rule the remaining tasks should follow:
> **source files in the write set had their stale comments corrected** — `contextual-search-rlm.ts`
> names `rlm-indexing.ts` in three places this commit makes false, and leaving them would mislead the
> next reader of code this commit changed — while **test files got only the mechanically required
> edits**, because every test-file edit is AC-3-visible and T15 owns the rest. The exception is the
> four comment mentions inside `contextual-search-rlm-coverage.test.ts` that name deleted symbols
> (`ensureInitializedImpl`, `indexFileImpl`, `_indexProjectInternalImpl`, `rlm-indexing.js`); those
> are corrected because the file was already open for its eight authorised assertions and the comments
> describe the very mocks being re-pointed.
>
> They fall into **two classes T15 must not conflate**, because only one of them is a stale
> reference:
>
> 1. **References to `rlm-*.test.ts`** — those test files *survive* PR-B and their rename is T15's
>    own decision, so these are consistent until T15 decides otherwise. Sites include
>    `session-bias.test.ts:8,20`, `contextual-search-rlm.ts:333`,
>    `hybrid-search-late-bind.test.ts:12,20`, plus `rlm-synapse.test.ts`'s own four.
> 2. **References to a deleted `rlm-*.ts` source** — legitimate historical provenance (git still
>    has the file) but pointing at a path that no longer resolves. After T9 that is
>    `docs/ONBOARDING.md:148`, `graph-stream.ts:11`, `session-bias.ts:20`,
>    `hybrid-search.ts:11,15,24`, `contextual-search-rlm-coverage.test.ts:158`.
>
> Both classes are in scope for T15's *sensor* (zero hits outside the three excluded paths), so
> both must be swept — but class 1 is a rename decision and class 2 is a comment correction, and
> reporting them as one number hides that. **Not fixed at T9**: `docs/ONBOARDING.md` and the two
> sibling capability modules are outside T9's write set, and editing them here would put a
> documentation sweep inside a commit whose sensor evidence is about one extraction.

**Resolution (spec-owner, 2026-07-29):**

1. The sensor becomes **zero hits outside `CHANGELOG.md`, `.specs/` and `.ua/`**, enumerated by a
   script over `git ls-files` so the count does not depend on which `grep` is on PATH.
2. The two test-file comments **are** corrected. They are comment-only edits that make stale
   references point at real files; no assertion, skip or case count changes. Recorded here as
   **explicitly authorised** so T20's verifier does not read them as an AC-3 ("no test weakened")
   violation — under the §4.4 module shape these are the only test-file edits in PR-B outside the
   4 rename sites, and finding a *third* one is a signal to stop, not a chore.
3. **`.ua/` regeneration is deferred to after PR-C**, not done here. Regenerating the knowledge
   graph inside a behavior-preserving refactor would add a large generated diff to a PR whose whole
   claim is that nothing changed, and PR-C moves the same directory again — regenerating twice is
   the churn AS-03 exists to prevent. Registered as a follow-up; **PR-B does not close GMS-04 AC-3
   for `.ua/`** and must not claim to.

> **Name the metric: `.ua/` is 320 occurrences, and `git grep -c` reporting 315 is not a
> contradiction.** `-c` counts matching **lines**, and `knowledge-graph.json` carries 270 occurrences
> on 265 lines. Both figures re-measured at `e4e38bd` (`git grep -o -h 'rlm-' | wc -l` → 320). **Do
> not "correct" the 320 to 315.** Tenth time in this feature that two methods gave two answers.

### Twelfth plan defect: the corrected AC-3 sensor is unsatisfiable too, and counting was the wrong shape

Found at **T15**, before the first edit, by predicting the reading on paper and then measuring it. It
is the **eighth** time a correction inherited the defect it was correcting, and the **second** time for
this one criterion — the defective text is the 2026-07-29 resolution immediately above.

That resolution narrowed AC-3 to *zero `rlm-` hits outside `CHANGELOG.md` / `.specs/` / `.ua/`*.
Measured at `e4e38bd`, it cannot pass either, for two reasons **the plan states elsewhere itself**:

| blocker | count | why it cannot be driven to zero |
| --- | --- | --- |
| provenance comments naming a deleted `rlm-*.ts` source | ~35 pointers, 6 files carrying nothing else | every extraction added one **on purpose**; driving them to zero deletes the record PR-B exists to leave |
| `contextual-search-rlm-coverage.test.ts`'s own **filename** | 1 | §6 deliberately keeps `contextual-search-rlm.ts`; excluding the file moves the count 29 → 29 |

**Resolution (reviewer, 2026-07-30): stop measuring the population, measure the shape.** The counter is
replaced by `scripts/check-stale-pointers.ts`, which classifies every path-shaped pointer as
`RESOLVES` / `HISTORICAL` / `BROKEN` against real git history and pins the `HISTORICAL` count. Over
budget (45 m → ~2 h); accepted. The script's header docblock is the canonical rationale — read it
rather than re-deriving this.

*What generalises, and it extends the eleventh defect's sentence:* the ninth read an axis its task did
not move, the tenth a population its task could not clear, the eleventh an axis its task moves nothing
on — **and the twelfth read a population whose floor was never zero, because the plan had deliberately
put things in it.** A criterion phrased as *"grep returns nothing"* is a claim about a corpus; the
requirement was always a claim about a *pointer*.

### Fourteenth plan defect: the replacement sensor under-enforced in two directions

Found at **T15**, after the sensor was written and its unit suite was green, by a scoped read-only
plan critic and then re-measured. **Ninth correction to inherit the defect it was correcting** — this
one inside the very script written to replace a criterion about stale pointers.

| # | defect | measured | consequence |
| --- | --- | --- | --- |
| a | `historical.length <= HISTORICAL_FLOOR` is a **ceiling**, under a name that says floor | `:164` | catches a stale citation being *added*; **blind to a provenance comment being deleted** — one direction of a two-directional requirement |
| b | `POINTER` requires a file extension | `` `rlm-admin` `` → `[]`, `describe("rlm-search — …")` → `[]`, `rlm-*.test.ts` → `[]` | of T15's own description fixes, **9 moved the number and the rest moved it by zero** |
| c | the stem was the literal `rlm` | a typo'd `search-facade-indexng.test.ts` → `[]` | **blind to the 17 citations across 10 files T15's own rename minted** — green on exactly the failure its docblock claims to catch, for the names the task had just created |

**Resolution (reviewer, 2026-07-30): close (a) and (c); record (b).** (a) becomes an exact pin
(`=== HISTORICAL_PINNED`), injected as a parameter so the gate's own tests can exercise it off a
scratch repo. (c) becomes a `STEMS` list with `POINTER` **derived** from it, so adding a stem cannot
leave a hand-written alternation behind to drift. (b) stays open **deliberately and in writing**: a
bare word has no filename to resolve against, so policing it would be a banned-word list — a different
sensor with a different failure mode. Every site of shape (b) was fixed by hand at T15 and **none of
them is under a gate**; no reading of this script may be quoted as though they were.

**The discriminating evidence is M3b, and it is the only reading here that proves the widening was
not cosmetic.** Judged by the pre-T15 `rlm`-only pattern, the same tree carrying a broken
`search-facade-*` citation reports **PASS — 0 broken**. Judged by the shipped pattern it reports
**FAIL — 1 broken**. A sensor's *alphabet* is part of the sensor, alongside its label.

### T15 — executed

**Subject.** Four `git mv` renames (GMS-04 AC-1), 17 citations repointed across 6 test files and 3
sources, every stale *description* corrected, and AC-3's criterion replaced by a pinned sensor.
Provenance comments **kept**: they are the record, and the gate now fails if one is deleted.

**The sensor's readings, and the middle one is the discriminating half.** Baseline
`RESOLVES 17 / HISTORICAL 35 / BROKEN 0` → immediately after the four `git mv`, before repointing,
**`0 / 52 / 0`** → after repointing `0 / 35 / 0`. The middle reading caught **exactly** the citations
the rename invalidated, on the real tree rather than only in a unit test. After the description fixes
`0 / 26 / 0`; after widening `STEMS`, `31 / 26 / 0`; **in the tracked state it ships in,
`32 / 28 / 0`, exit 0.**

> **Every reading before the last one was taken in a state this tool does not ship in, and the last
> one is the only one that counts.** It enumerates `git ls-files`, so it is blind to itself until its
> own two files are tracked — and staging them took it from **PASS `31/26/0`** to **FAIL
> `36/46/15`**. All 15 `BROKEN` were **fixture literals** in its own test file (a misspelled
> `rlm-serch` stem and a pair of `rlm-gone-*`), which must use a real stem because their whole job is
> to exercise `POINTER`. Resolved narrowly: the **test file** joins `EXCLUDED` as fixtures-not-references
> — the **script does not**, so its own two genuine citations of the deleted `rlm-search` are counted
> like anyone else's, which is why the pin is **28** and not 26. Two further `BROKEN` then appeared in
> the *new exclusion's own docblock*, which had spelled the fixture names out in full: the same trap
> one level up, and it fired. Both phantoms are now written without extensions on purpose.
> **This is the Phase 0 lesson verbatim** — *verify any measurement script in the tracked state it
> ships in, never the state it was written in* — and it has now cost this feature twice.

**Mutation table — three shapes on the real tree, re-run in the tracked state**, each verified
*applied* before its reading was believed (backup rather than `git checkout`, since the tree was dirty;
diff-vs-pristine; refuse-on-byte-identical; restore diffed; final reading confirmed identical to
pristine):

| shape | RESOLVES | HISTORICAL | BROKEN | verdict |
| --- | --- | --- | --- | --- |
| pristine | 32 | 28 | 0 | **PASS** |
| M1 citation reverted to its pre-rename name | 31 | **29** | 0 | **FAIL** |
| M2 a provenance comment **deleted** | 32 | **27** | 0 | **FAIL** — the shape `<=` passed |
| M3 typo in a `search-facade-*` citation | 31 | 28 | **1** | **FAIL** |
| M3b — M3 judged by the **pre-T15** `rlm`-only pattern | 0 | 28 | 0 | **PASS** — the gap, measured |

**Gates**: `lint` 0 · `type-check` 0 (6/6) · `check-frozen-anchors` exit 0 (14 anchors) ·
`check-characterization` exit 0 (3/3) · `check-stale-pointers` **exit 0** · **G-HUB exit 0**, 24 files,
`ContextualSearchRLM` foreign **1**, reach **1** by `search-warmup.ts`, `maxFileLoc` **696** against
700 — every structural figure byte-identical to T14, which is the prediction, since T15 moves no code ·
`test:scripts` **753 pass / 0 fail across 40 files**, up from 732/39 by **exactly** the new
`check-stale-pointers.test.ts` (21 tests, 1 file) · characterization net **160** across 7 suites
(26·41·31·21·25·7·9), every suite individually unchanged under its new name.

**Line-count discipline held, and the constraint was wider than the plan stated.** The plan named the
four renamed suites. Measured — **and name the metric, because all three numbers are quotable and
different**: **11 line-anchored citation tokens**, on **10 matching lines**, across **6 distinct
files**. Seven of the eleven point into the renamed four; the other **four point into
`contextual-search-rlm-coverage.test.ts`**, which T15 also rewrites and which the plan never flagged.
(One of those four is new this task — `check-stale-pointers.ts:184` cites `…coverage.test.ts:174`.)
The lines and tokens differ because `contextual-search-rlm.ts:105` carries a citation into *both* files
on one line. Every edit inside all five targets was an in-place single-line substitution:
**162 / 647 / 520 / 389 / 936** lines before and after. A reflow would have invalidated those citations
silently and **no gate would have seen it** — same shape as T14's four-line subject undercount, a
constraint enumerated over the files `git mv` touched missing the file that is edited but not moved.

### Fifteenth plan defect: T16's sensor names an observation this repository's triggers cannot produce

Found at **T16**, before the first edit, by reading the triggers rather than assuming them. The row's
sensor is *"flip a threshold in a **scratch branch** → CI goes red."* `ci.yml` fires on
`push: branches: [main]` and `pull_request: branches: [main]` and nothing else, so **a pushed scratch
branch raises no CI run at all** — there is no red to observe. Producing one needs a throwaway PR
against `main`, which also fires the full matrix and the CHANGELOG merge gate, whose failure would sit
in the same log as the signal being measured.

**Resolution (reviewer, 2026-07-30): substitute the three-part local equivalent and say so.** The three
parts are recorded under *T16 — executed*. They are not the same evidence as a red CI run and the record
must not imply they are. What they do establish is the half that actually shipped broken in PR-A — the
enabling condition — which is what SEN-02 AC-5 was written for.

> **The mutation route also changed, and for the better.** The row assumes flipping a threshold is a
> source edit. `--max-reach` and `--max-loc` are already CLI arguments (`search-hub-metric.ts:196`), so
> the flip needs no source edit, no commit and no revert. Prefer the flag.

### Sixteenth plan defect: the widened scope's gate fails on a clean tree, and only in CI

**The first defect in this feature created by a decision taken during execution rather than inherited
from the plan text**, and it was caught before the edit landed by a scoped plan-critic, then re-measured
rather than believed. T16's row scopes to G-HUB alone; the reviewer widened it to `check-stale-pointers`
(see *T16 — executed*). That widening is what introduced this.

`check-stale-pointers` separates HISTORICAL from BROKEN by asking `git log --all --pretty=format:
--name-only` whether a path was ever recorded (`everKnownPaths`, `:172-178`), and `categorise`
(`:191-194`) falls through to **BROKEN** when the answer is no. `actions/checkout@v4` at `ci.yml:32`
carried **no `with:` block at all**, so `fetch-depth` defaulted to **1** — a log holding exactly one
commit. Measured at `b9781df` with depth as the sole variable, via `file://` clones because `--depth` is
silently ignored on a plain local path:

| checkout depth | `.git/shallow` | commits | reading | exit |
| --- | --- | --- | --- | --- |
| 1 (the default) | present | **1** | `FAIL — 28 broken, 0 historical against a pin of 28` | **1** |
| 0 (full) | absent | **488** | `PASS — 0 broken, historical exactly at its pin of 28` | **0** |

The categories invert wholesale. The gate would have gone red on **every** run against a clean tree —
a checker reporting a fact about its own environment as a fact about the subject, which is the defect
class this whole feature is about, now for the fourth time.

**Resolution: `fetch-depth: 0` on the `build` job's checkout, with the measurement in the comment.**
Fixing the subject, not the gate: lowering the pin to 0 would have made it green and meaningless. Cost
is one 8.2 MB / 488-commit fetch. No `fetch-depth` appears in any of the **11** `actions/checkout` uses
across the six workflows, so this is a new pattern in the repo and is commented as such.

> **Not specific to the wiring mechanism.** Routing the check through a `describe("the real
> repository")` block in its unit suite — the shape `check-frozen-anchors` and `check-characterization`
> already use — depends on the same git history and fails identically. The fix is required by the
> decision to gate this check at all, not by the choice of a `ci.yml` step.

### T16 — executed

**Subject.** Two steps added to the `build` job of `.github/workflows/ci.yml` between *Verify package
contents* and *Verify skill-bundle artifacts*, plus `fetch-depth: 0` on that job's checkout.

**The premise was checked before it was acted on, and it split the four sensors two ways — not the way
the briefing predicted.** The question was whether each sensor's `scripts/__tests__` suite, which CI
does run via `test:scripts` (`ci.yml:138`), already exercises the script *against the repository* rather
than only against fixtures:

| sensor | runs against the real tree in CI? | evidence |
| --- | --- | --- |
| `search-hub-metric` | **no** — scratch only | imports pure functions; only `mkdtempSync`; no `REPO_ROOT` and no `packages/core` anywhere in the file |
| `check-stale-pointers` | **no** — scratch only | only `mkdtempSync`; no `REPO_ROOT`. The prediction, now measured |
| `check-frozen-anchors` | **yes, already gated** | `:63` `runCli(["--json"])` with **no `--root`**; `:68` asserts `status === 0` |
| `check-characterization` | **yes, already gated** | `:17` `checkGuards(REPO_ROOT)`; `:20` asserts `failures` is `[]` |

So T16 closes a real gap, and the briefing's *"three other sensors are equally absent from CI"* was
wrong: **one** other sensor shared the gap. Two were enforced already, through a route that looks like
a unit test from the outside. *"Has a test"* and *"gates the repository"* are different properties and
this feature has now confused them once.

**Scope decision (reviewer, 2026-07-30): wire both.** The row scopes to G-HUB; `check-stale-pointers`
is wired too, deliberately and on the record, not by drift. Its pin of **28** therefore becomes a gate
PR-C must maintain across a directory it moves again — accepted, because a check that reports and never
enforces is the thing SEN-02 exists to prevent.

**The enabling condition, measured live rather than assumed.** `main`'s required status checks are
`["build","mcp","validate","Structural native tests (darwin-arm64)","Structural native tests
(linux-x64)","coverage"]` — ruleset id `19462721`, *Main - Restrictions*, target `branch`, enforcement
`active`. **`build` is already in the list**, so a step added to it enforces the moment it lands. **No
ruleset mutation was performed**, and the PUT-not-PATCH and DeployKey-bypass traps in `CLAUDE.md` never
came into play. Half of SEN-02 AC-5 was satisfied before this task began.

**The three-part local equivalent, substituted for the red CI run** (fifteenth defect), each part
measured this session:

1. **The job is required.** `build` is in the list above.
2. **The steps cannot fail silently.** Both are bare `run:` steps, and `continue-on-error` is absent
   from the **entire** `ci.yml` — established from the parsed YAML (`Bun.YAML.parse`, 19 build steps,
   zero `continue-on-error`), not from a grep that could return empty on error.
3. **The scripts exit non-zero on a genuine violation**, per the mutation table below.

Part 3 is the one worth stating precisely: a red run caused by a *misconfiguration* is not evidence
that a gate detects a *violation*, and the shallow-clone failure above is the former.

**Mutation table — every reading on the real tree, at the tracked state, restoration verified
byte-identical by `git hash-object` before and after:**

| gate | mutation | reading | exit |
| --- | --- | --- | --- |
| G-HUB | none | `PASS — every type <= 3 foreign reach, every file <= 700 LOC` | **0** |
| G-HUB | `--max-reach 0` | 6 × `FAIL — … (max 0)`, deepest `SearchDegradation` 3 deep by `hybrid-search.ts` | **1** |
| G-HUB | `--max-loc 1` | `FAIL — contextual-search-rlm.ts is 696 LOC (max 1)` | **1** |
| stale-pointers | none | `PASS — 0 broken, historical exactly at its pin of 28` | **0** |
| stale-pointers | one broken pointer injected, **pin held at 28** | `FAIL — 1 broken, 28 historical against a pin of 28`, site named | **1** |

**Three traps encoded in the step comments, each found by measurement:**

- **The directory is a required positional.** `bun scripts/search-hub-metric.ts` with no argument exits
  **2** with a usage line. That fails the job while measuring nothing, and in a CI log it is
  indistinguishable from a working gate. The briefing's *"exit 0 unmutated, exit 1 mutated"* figures
  only reproduce with the directory supplied; re-running rather than citing is what caught it.
- **`--json` is deliberately not used.** On a pass the script appends a non-JSON banner to **stdout**
  (`console.log`, `:216`); both FAIL branches go to **stderr** (`:220`, `:225`). Actions interleaves
  both, so the failure reason stays visible without it.
- **`ci.yml` is inside the stale-pointer corpus.** It is not in `EXCLUDED` (`:94-99`), so any
  `POINTER`-matching token written into these comments would itself move the pin. The comments name no
  `rlm-*` or `search-facade-*` file for that reason. Verified after `git add` with exit-code
  discrimination — `rc=1` is no-match, `rc>=2` would be a tool error, and `|| echo none` cannot tell
  them apart.

**Gates**: `check-stale-pointers` exit **0**, pin **28**, unmoved by this commit · **G-HUB exit 0**,
`maxFileLoc` **696** against 700 · `ci.yml` parses, **19** build steps, `continue-on-error` **none** ·
step order `Build` → *Verify package contents* → **G-HUB** → **stale pointers** → *Verify skill-bundle
artifacts*, which is the row's "beside `verify-package-contents.ts`".

> **Headroom worth carrying into PR-C:** `contextual-search-rlm.ts` is **696 LOC against a 700 cap**.
> Now that G-HUB gates `build`, any five-line addition to that file turns the build red. That is the
> gate working, not a defect — but it is a constraint PR-C inherits and the plan did not state.

### Seventeenth plan defect: T17's sensor is unreachable on a PR that renames a file the corpus covers

Found at **T17**, by running the row exactly as written and then attributing the result rather than
accepting or dismissing it. **Tenth correction to inherit the defect it was correcting**, and the
second defect in this feature created by a decision the plan took rather than by a figure it got
wrong — here, the decision to require rank equality across a PR whose whole subject is renaming.

The row's sensor is *"the T4 diff script, exit 0."* Run on the real reports it exits **1**:
`N05-centrality-rerank-bonus` goes rank **5 → 6**. Both floors pass, and `MRR` even **rises**
(0.7357 → 0.7452), so the aggregate says the opposite of the per-needle view — which is exactly the
asymmetry GMS-05 AC-4 note 2 was written to expose, firing in the direction nobody wrote down.

**The route is exact, and it is naming.** `smart-chunker.ts:62-70` prepends `// File: <relativePath>`
to every chunk before it is embedded, plus a `// Section: <label>` line whose label is the enclosing
symbol and which is **repeated three more times** for any chunk of at least `REPEAT_MIN_LINES`. Rank
is a function of the cosine score over that text. So a rename perturbs every score in the renamed
file, and where two adjacent chunks sit inside the perturbation they swap.

**Measured, and the tell is that N05's own score never moved.** Its top hit is in `centrality.ts`,
which PR-B does not touch, and its top score is byte-identical across the two runs — **0.6712 →
0.6712**. What changed is the pair below it:

| condition | chunk holding N05's target | the rival | margin | N05 |
| --- | --- | --- | --- | --- |
| old path + old body — **the baseline run** | 0.5954 | 0.5820 | **+0.0134** | **@5** |
| new path + new body — **the shipped run** | 0.5867 | 0.5897 | **−0.0030** | **@6** |
| old path + new body | 0.5922 | 0.5878 | +0.0044 | @5 |
| new path + old body | 0.5891 | 0.5823 | +0.0068 | @5 |

**Neither change flips it alone; reverting either one restores rank 5.** The two changes are the
file path, and the body — and the body delta is itself naming: the fusion window's lines are
**byte-identical** across the rename, while the search window differs in exactly **three** lines,
all de-facading (`rlm.buildGraphStream(` → `deps.buildGraphStream(`, `rlm.fuseResults(` →
`fuseResults(`, `rlm.filterByPatterns(` → `filterByPatterns(`). That same de-facading renames the
symbols the chunker derives its label from — `fuseResultsImpl` → `fuseResults` and `searchImpl` →
`search` — so the changed symbol name enters each rival chunk's embedded prefix **four times**.

> **The first framing of this was wrong and a scoped plan critic caught it, which is its fourth
> earned keep.** The claim was *"attributable to the filename and to nothing else"*. It is a
> **conjunction**: the file path is one necessary conjunct, the symbol rename the other, and the 2x2
> above says so directly — the same table that was already in hand when the overclaim was written.
> The critic's mechanism held and its figures were re-run rather than inherited; re-measuring found
> the label is repeated **three** times beyond the `// Section:` line, which the critic had not
> counted. **The defensible claim is that no change to retrieval *logic* moved a rank — nothing in
> the moved bodies changed except names.**

**Resolution (reviewer, 2026-07-30): substitute a controlled comparison, commit it, and leave
`needles-diff.ts` alone.** Editing the guard mid-refactor is the motion this feature has refused
three times, and lowering it to "allow a drop of 1" would make it green and meaningless.
`scripts/needles-rename-control.ts` re-ranks the current tree twice, changing only the string handed
to `smartChunk` as the file's path, and the map comes from the baseline report rather than a
hardcoded list — so PR-C, which moves the same directory again, needs no edit to it.

*What generalises:* the ninth read an axis its task did not move, the tenth a population its task
could not clear, the eleventh an axis its task moves nothing on, the twelfth a population whose floor
was never zero — **and the seventeenth reads an invariant the task's own subject necessarily
breaks.** `needles-diff.ts:31-37` exempts *score* drift from failure, and gives the right reason: "a
rename changes them without changing retrieval quality." It then calls rank the invariant. Rank is a
function of score, so the exemption does not reach it. **A sensor cannot exempt a cause and then
police an effect of that cause.**

> **Phase 0 saw the same mechanism and closed only its catastrophic half.** Finding 4 said that after
> the rename an old report's hit list "matches nothing… and reads as a miss on every needle", and
> fixed it by recording `rank` and `expected` at run time. That killed total collapse. The marginal
> form — the same perturbation moving one rank instead of fourteen — was never in view, and no gate
> saw it until it fired.

### Eighteenth plan defect: T18's command does not terminate under an automated runner

Found at **T18**, by running the row exactly as written and watching it produce nothing for six
minutes. **Not a correction inheriting its own defect** — the first defect in this feature that is
neither a wrong figure nor an unsatisfiable criterion, but a command that cannot complete in the
environment the task is executed in. Its class is the fifteenth's (*a sensor that is unexecutable
here*), narrowed: this one is unexecutable only when stdin is a live pipe that never delivers, which
is exactly what an agent, a CI-less script runner, or any `bash -c` under a supervisor hands it.

**The route is exact, and it is one line of a package this PR does not touch.**
`apps/web-ui/src/static/app.js:838` — `const newContent = prompt("Edit memory content:", "")`. Bun
implements `prompt()`, `confirm()` and `alert()` as **stdin readers**. `app-renderers.test.ts`'s
`makeFakeDom` returns a *stable child for any selector* (`querySelectorAll: () => childCache`,
ignoring its argument), so `bindEvents` registers the `memory-edit` and `memory-delete` click
handlers on that child alongside every other handler — and the test *"fires captured event handlers
… to cover callbacks"* then fires all of them. The gate prints `Edit memory content: []` and stops.

**Measured, both directions, and the discrimination is the point:**

| stdin | result |
| --- | --- |
| `< /dev/null` | `apps/web-ui` **113 pass / 0 fail in ~2 s**, exit 0 |
| an open pipe that never delivers | still running when killed at **46 s**; last output `Edit memory content: []` |

Per-suite, under a live stdin: **`app-renderers.test.ts` is the only one of the six that hangs**; the
other five complete in ~1 s each. No per-test timeout applies — `bunfig.toml`'s 5 s budget does not
reach a block inside a handler the test invoked synchronously — so the failure mode is an infinite
hang, not a red test.

**Why no gate saw it.** `apps/web-ui` has **zero** lines of diff in `5247ecb..HEAD`, and
`coverage.yml` is green on `main` through `6d5dc6b`. Under a GitHub Actions step stdin is at EOF, so
`prompt()` returns `null`, `handleMemoryEdit` early-returns at `app.js:839`, and the suite passes.
**The same EOF is why `app.js:840-848` was never covered in any environment** — the PUT after the
prompt was unreachable in CI and unreachable-by-hang locally.

**Resolution (reviewer, 2026-07-30): record it as a defect, fix the command, and fix the test at its
source.** All three, because each closes a different hole — the defect entry is what T20 reads, the
`< /dev/null` is what makes the row reproducible, and the stub is what stops the next suite that
fires those handlers from re-hanging. The subject was fixed, not the gate: `app-renderers.test.ts`
now installs recording `prompt`/`confirm`/`alert` stubs (`fakeDialogs`) restored in `afterEach`,
which is the same motion as T17's *fix the file, not the pin*.

*What generalises:* every prior defect in this feature was found by reading a number. **This one
produced no number at all** — the failure mode of an unexecutable command is silence, and silence
reads identically to "still working". The rule it earns is that a gate command with no output
budget needs a liveness expectation before it is run: T18's whole-gate wall clock is **2 m 14 s**,
so six minutes of nothing was already six times over budget when it was still being waited on.

### T17 — executed

**Subject.** The needles after-run at the shipped tree, its per-needle rank diff against T4's frozen
baseline, the attribution of the one rank that moved, and `scripts/needles-rename-control.ts` +
17 tests as the substituted sensor. **No source under `packages/core` was touched.**

**Preconditions re-measured rather than inherited**, since the handoff's were session-local: tree
clean at `d23bb43`; Ollama up with `qwen3-embedding:8b` present; `check-frozen-anchors` exit 0 at
14/14, so every anchor still resolves uniquely; `benchmarks/needles/reports/` empty of any
`pr-b-after` report; `test:scripts` **753 pass / 0 fail across 40 files**, reproducing the T15/T16
figure exactly.

**The confound was checked before the run, and there is none.** The baseline was captured at
`ce26f28` while this branch is cut from `5247ecb`, so the diff spans more than T7–T16. Over the eight
corpus files, `git log ce26f28..HEAD` returns exactly **three** commits — `fb8a3ed` (#46, PR-B's own
T6a/T6), `2664008` (T9) and `1090504` (T13). **Every commit in the window is PR-B's**, so the
comparison measures this PR and nothing else. Six of the eight corpus files are unchanged; only the
two renamed ones move.

**Predicted on paper before a single embedding was computed, then confirmed:** 4 of 14 needle spans
move — `N03`/`N04`/`N05` into `result-fusion.ts` and `N06` into `hybrid-search.ts`, which is exactly
the four anchors §6.1 flagged as inside PR-B's blast radius — the corpus stays **8 files**, and
`totalChunks` goes **87 → 90**.

**Readings.**

| reading | result |
| --- | --- |
| `run.ts --label pr-b-after`, floors on | exit **0** — hit@1 **0.643** ≥ 0.5 PASS, MRR **0.745** ≥ 0.65 PASS |
| aggregate vs baseline | hit@1 0.6429 → 0.6429 · hit@3 0.8571 → 0.8571 · **hit@5 0.9286 → 0.8571** · hit@10 1 → 1 · **MRR 0.7357 → 0.7452** |
| `needles-diff.ts` | exit **1** — `N05` **@5 → @6** REGRESSION, `N06` **@3 → @2** improved, the other 12 unmoved |
| `needles-rename-control.ts` | exit **0** — pass A faithful, `N05` restored to **@5** and `N06` to **@3**, **0** needles below baseline |

**No floor was edited and no needle content was touched.** `hit@5` falling while `MRR` rises is the
whole point of the per-needle view and is recorded rather than smoothed.

**Determinism was established before any delta was attributed, and not by re-running the same
command.** 11 of the 14 needles reproduce their top score to 4 dp across two runs taken on different
days; the 3 that differ — `N03`, `N04`, `N06` — are exactly the needles whose top hit lies in a file
PR-B changed. A rank delta here is therefore signal, not noise.

**The substituted sensor carries its own enabling condition, because this feature has now shipped two
gates that measured nothing.** `needles-rename-control.ts` re-implements the ranking loop
`benchmarks/needles/run.ts` owns, and Phase 0 finding 2 refused exactly that for
`check-frozen-anchors.ts` on the grounds that a second implementation which can disagree with the
gate it stands in for is worse than none. The mitigation is that **pass A must reproduce the shipped
report rank for rank before pass B is believed**, and a mismatch **aborts** at exit 2 rather than
degrading into a plausible wrong number. Observed faithful on all 14 needles. That check was run by
hand first — a scratch harness with no path rewrite reproduced `N05@6` and `N06@2` — before it was
made a precondition of the script's own output.

**The pin trap fired on this task's own file, which is its third appearance in this feature.** The
script's derivation was written to take predecessor names from the baseline report precisely so no
predecessor would be hardcoded — and then the docblock explaining that decision spelled both of them
out in full. Staging it took `check-stale-pointers` from **PASS at 28** to **FAIL — 0 broken, 30
historical against a pin of 28**, both hits on one line. **Fixed in the subject, not the pin**: the
two names are now written without their `.ts`, with the measurement in the comment, exactly as T15
resolved the same trap one level up inside that gate's own exclusion docblock. Its test file uses
neutral fixture names (`alpha`, `beta`) for the same reason, stated there.

**What this task does not establish, stated so a green board is not over-read.**

1. **The corpus is bounded** — the 8 files the 14 needles resolve into, not the full index. Fewer
   competing chunks makes retrieval strictly easier. **A full-corpus baseline still does not exist**
   and a bounded number must not be quoted as one.
2. **`needles-rename-control.ts` is not a CI gate and cannot become one.** It needs a local Ollama
   and an 8B embedding model — the same constraint that keeps `needles-gate.yml`
   `workflow_dispatch`-only and `continue-on-error: true`. It is an evidence instrument, in the class
   of this feature's mutation harnesses, and its 17 unit tests run in `test:scripts` while the
   live-model comparison does not.
3. **Its control label for one file is an approximation.** `hybrid-search.ts` was assembled from two
   predecessors, and a whole-file label can only name one. The derivation picks whichever the
   baseline recorded for that needle's own target span, which is right for `N06` and wrong for any
   other span in that file. Recorded in the script's docblock too.
4. **Pass B does not revert the symbol rename**, deliberately — that is a genuine code edit, not a
   measurement artifact. So exit 0 means "no needle is below baseline once the path is controlled
   for", not "the path was the sole cause".

**Gates**: `lint` 0 · `type-check` 0 (6/6) · `check-frozen-anchors` exit 0 (14 anchors) ·
`check-characterization` exit 0 (3/3) · `check-stale-pointers` exit **0**, `RESOLVES 32 /
HISTORICAL 28 / BROKEN 0`, pin met exactly and **unmoved by this commit**, measured with the new
files staged · **G-HUB exit 0**, `maxFileLoc` **696** against 700 — every structural figure identical
to T16, which is the prediction, since T17 moves no source.

### T18 — executed

**Subject.** The DEBT-02 coverage gate at the shipped tree, per-file for every file this work
touches, plus the eighteenth defect's fix. **No source under `packages/core` was touched**; the only
diff is `apps/web-ui/src/__tests__/app-renderers.test.ts`.

**Preconditions re-measured rather than inherited**, since the handoff's were session-local:
tree clean at `0179566`; postgres LISTENing on **127.0.0.1:5433**; port 3333 free; Ollama up;
dedicated DB migration state **23 on disk / 23 applied / 0 unfinished / 0 missing** — note
`CLAUDE.md` says *24 migrations* and is stale by one, which is a doc divergence a T20 verifier could
otherwise read as a half-migrated database.

**`coverage` is in `main`'s required checks, measured live rather than inherited.** `gh api …/rules/branches/main`
returns `["build","mcp","validate","Structural native tests (darwin-arm64)","Structural native tests (linux-x64)","coverage"]`.
`CLAUDE.md`'s warning describes the state *before* it was added; the enabling condition now holds, so
a red coverage check blocks a merge and T18 is a real gate. **The branch base `5247ecb` has no
coverage run at all** — it is the `[skip ci]` release commit — so the usable before-baseline is
`fb8a3ed` one commit earlier, green, and **CI has never measured this branch**.

**Predicted on paper before the gate was run, and the prediction was falsified on ordering.** All six
extracted modules are `mock.module`'d inside `contextual-search-rlm-coverage.test.ts` (`:126`, `:162`,
`:179`, `:189`, `:199`) — the suite that covered those bodies before the split — and four are mocked
again by their own `*-late-bind.test.ts`. From that topology `index-admin.ts` was predicted highest
risk (234 LOC, its only direct importer mocks it, 7 facade tests behind it). **It measures 100.00%.**
The two lowest are the two largest files. **Executable-line count predicted the ordering; mock
topology did not** — the `search-facade-*` characterization suites execute the real bodies through
the facade, so the mock is real and costs nothing. The one prediction that held is the pattern-level
one: `fb8a3ed` had already extracted `result-fusion.ts` under the identical mock shape and passed.

**Readings.**

| reading | result |
| --- | --- |
| `bun run test:coverage < /dev/null` | exit **0** · `floor 90% line · 315 source files measured · 9 documented exclusions` · `PASS` · **2 m 14 s** |
| suite health across the run | **169** `N fail` lines, **every one zero**; no unit reported `suite exited` or `no lcov.info` |
| lcov merged | **165** files — 129 core / 25 tools-api / 8 mcp-client / 1 shared / 1 web-ui / 1 opencode-plugin |
| `EXCLUSIONS.length` | **9**, read by importing `check-coverage.ts` rather than counting entries by eye |
| `scripts/check-coverage.ts` diff on this branch | **0 lines** — AC-2's *"no new exclusion added"* closed structurally, not by a count that could match while an entry was swapped |

**Per file, and presence is asserted before percentage** — this is the part the gate itself cannot
tell you. `below` is populated by iterating `merged` (`check-coverage.ts:618-626`), and a file no
group reports never enters `merged`, is never counted in `measured`, and therefore **can never appear
below the floor**. Absence from the failure list is not evidence of a pass. Re-derived through the
gate's own exported `parseLcov` / `mergeInto` / `linePercent`:

| file | present | executable | covered | line % |
| --- | --- | --- | --- | --- |
| `contextual-search-rlm.ts` | yes | 221 | 221 | **100.00** |
| `index-admin.ts` | yes | 80 | 80 | **100.00** |
| `session-bias.ts` | yes | 49 | 49 | **100.00** |
| `graph-stream.ts` | yes | 91 | 90 | 98.90 |
| `result-fusion.ts` | yes | 168 | 164 | 97.62 |
| `hybrid-search.ts` | yes | 426 | 407 | 95.54 |
| `project-indexer.ts` | yes | 350 | 331 | **94.57** ← minimum, 4.57 points of headroom |

That independent recomputation reproduces the gate's own verdict exactly — **315 measured / 0 below /
9 exclusions** — which is what makes it a check rather than a second opinion.

**The scope was widened from the row's to the criterion's, and the widening is what closes AC-2.**
The T18 row says *"no file **this PR** touches"*; GMS-05 AC-2 says *"every file **this work**
touches"*. They differ by `result-fusion.ts`, which **T6 delivered** — a row of this feature's own
commit table (*T6 · in `main` via #46 · `rlm-fusion.ts` → `result-fusion.ts`*) — and which is
therefore inside AC-2 and outside the branch diff, because #46 was squashed into `main` before this
branch was cut. That gap is a downstream consequence of the R-04 violation, not a new one. It
measures **97.62%**, so reporting all seven closes AC-2 on its own wording and **no spec correction
is owed**; T19's C1–C11 range is unchanged. Found by a scoped plan critic; its mechanism held and its
premise was measured before it was acted on, which is what kept it from becoming a C12.

**The corpus moved by exactly PR-B's delta, which is the invariance statement available here.**
Tracked measured-source files (the gate's own `isMeasuredSource` over `git ls-tree`): **370 → 371**,
`+1` — five modules added (`graph-stream`, `hybrid-search`, `index-admin`, `project-indexer`,
`session-bias`), four `rlm-*` removed. Under `services/search` alone, **28 → 29**.

**What this reading proves, stated plainly: T18 changes no product code, so a PASS is a truth check
on the tree, not a discriminating sensor that T18 happened.** Same shape as T14, T16 and T17. The
only discriminating sensor in this commit is the new web-ui test, below.

**The eighteenth defect's fix, and it was observed red first.**
`apps/web-ui/src/__tests__/app-renderers.test.ts` gains `fakeDialogs()` — recording `prompt` /
`confirm` / `alert` stubs restored in the existing `afterEach` — installed in the handler-firing
test, plus one new test, *"drives the write-mode dialog handlers through to their requests"*, which
asserts the PUT and DELETE each handler issues **after** its dialog. The old test asserted only that
the app root still existed, and passed just as happily when `prompt()` returned `null` at EOF and
`handleMemoryEdit` bailed one line later.

| check | result |
| --- | --- |
| suite under a live non-delivering stdin, after the fix | **completes in ~1 s**, 56 pass / 0 fail (was: still running at 46 s) |
| **mutation** — `fakeDialogs(null)`, i.e. exactly what un-stubbed `prompt()` returns at EOF | **55 pass / 1 fail**, red at `expect(put).toBeDefined()`; mutation verified applied by blob hash before the reading was believed, restored byte-identical after |
| `apps/web-ui` package | **113 → 114 pass / 0 fail across 6 files** — `+1`, exactly the new test |
| `app.js` line coverage, web-ui unit alone, before vs after | **93.56% → 95.34%** (683 → **696** of 730) — `+13` lines, the post-dialog bodies that were unreachable in *every* environment |

**Ledger — one authorised test edit, and it is not an AC-3 charge.** GMS-05 AC-3 bounds
*signature-tracking* edits, and this file tracks no signature: it is an `apps/web-ui` suite, adds a
test and strengthens an existing one, and weakens, skips or deletes nothing. Test count **55 → 56**
and `expect(` **95 → 101**, no `skip`. *(Both figures corrected at T20. This read "`test(` count
55 → 56, `expect()` 98 → 101": the file declares its tests with **`it(`**, never `test(`, so
`grep -c 'test('` returns **0** rather than 55 — the number was right and the identifier named was
not; and the `expect(` before-value is **95**, making the delta **+6**, not +3. Lines and
occurrences agree at both ends, so this was not a metric ambiguity. Found while re-measuring T20's
own report, which flagged the second and mis-explained it as a comment-stripped count — stripping
comments lowers both sides, and 101 matches the raw count exactly.)* The 19-edit AC-3 budget is
**unmoved** and neither correction changes a verdict. It does widen
PR-B's write set into a package no task row named, on an explicit reviewer decision — recorded here
rather than absorbed.

**What this task does not establish.**

1. **A local PASS is not CI's PASS, and the gap is mechanical, not hypothetical.**
   `embeddings/config.ts:183,185` reads `OLLAMA_BASE_URL || "http://localhost:11434"` and gives
   Ollama `priority: 1` whenever `EMBEDDING_PROVIDER` is unset — **both env-driven**, so the gate's
   scratch `XDG_CONFIG_HOME`, which does neutralise every `config.json`-driven LLM branch, does not
   reach this one. `coverage.yml` sets no provider env and runs no Ollama service. **Bounded by
   measurement on the passing run: `ollama-ok` = 0** — no successful live embed call happened; the
   only provider tags in the log are error/fallback/fixture shapes. The mechanism can bite a future
   run; it did not affect this one.
2. **CI's `coverage` job has still never run on this branch**, which is local and unpushed. The
   authoritative gate reading arrives at PR time. *(Post-merge update: `origin/main` merged in as
   `b7cb5a2` — still local and unpushed at that point, still true that CI has never run on it; see
   `HANDOFF.md` → Next action for the push/PR step and the re-run gate figures.)*
3. **The `apps/web-ui` fix is not itself under a CI gate that would catch a regression of the hang.**
   A future suite that fires those handlers without stubbing will hang, and a hang is not a red
   test. Nothing here changes that; only this one file is protected.

**Gates**: `lint` 0 · `type-check` 0 (6/6) · `check-frozen-anchors` exit 0 (14 anchors — checked
deliberately, since the edited `.ts` joins `resolveNeedles`' scan) · `check-characterization` exit 0
(3/3) · `check-stale-pointers` exit **0**, `0 broken`, pin **28** met exactly and **unmoved by this
commit**, measured staged · **G-HUB exit 0**, every type ≤ 3 foreign reach, every file ≤ 700 LOC ·
`test:scripts` **770 pass / 0 fail across 41 files**, exit 0 — identical to T17, which is the
prediction, since nothing under `scripts/` moved.

### Nineteenth plan defect — GMS-03 AC-3 fails on the shipped tree, and no correction owned it

Found at T19 by a scoped plan critic reading `spec.md` against the tree rather than by executing a
row — **the first defect in this feature surfaced that way**, and the first that is a *live
acceptance-criterion failure* rather than a wrong figure, an unsatisfiable criterion or a
non-terminating command.

AC-3 requires fan-in **and fan-out** both lower. Measured with **one method at both commits** — D3
`search-facade-metrics.ts`, against the frozen `d628464` baseline in `facade-metrics-before.json`
rather than a re-read of any live tree:

| metric | before (`d628464`, frozen) | after (`510a410`) | |
| --- | --- | --- | --- |
| fan-in, static | 24 | 23 | falls |
| fan-in, incl. dynamic | 26 | 25 | falls |
| **fan-out, distinct specifiers** | **19** | **21** | **rises — AC-3 violated as written** |

**The cause is the decomposition and it is exact, not statistical.** Diffing the two specifier sets:
**4 removed** (`./rlm-admin.js`, `./rlm-indexing.js`, `./rlm-search.js`, `./rlm-synapse.js`) and
**6 added** (`./graph-stream.js`, `./hybrid-search.js`, `./index-admin.js`, `./project-indexer.js`,
`./result-fusion.js`, `./session-bias.js`) — net **+2**, which is 19 → 21 exactly. A split that
replaces one delegate with N modules necessarily raises distinct-specifier fan-out, so requiring
fan-out to fall is requiring the split not to happen.

**Everything else moved decisively the right way**, each measured this session at both commits:

| metric | script | before | after |
| --- | --- | --- | --- |
| `maxForeignReach` on `ContextualSearchRLM` | D2 | **14** (`rlm-search.ts`), exit 1 | **1** (`search-warmup.ts`), exit 0 |
| foreign modules reading the facade | D2 | 6 | 1 |
| `delegateScope` functions | D1 | 21 | **0** |
| functions taking the facade | D1 | 15 | **0** |
| LOC in that scope | D1 | 1550 | **0** |

**Resolved (reviewer, 2026-07-30): add C12 — replace the criterion with the sensor, inside T19's own
commit.** Exactly the C10/C11 precedent, and for the identical stated reason: a verifier checking the
criterion literally marks it failed against a tree that satisfies what it meant. `maxForeignReach`
becomes AC-3's criterion; fan-out is **reported, not a floor**. Two alternatives were put and
rejected — accept-and-record, which ships PR-B with a red criterion the record itself calls
attributed; and narrowing the fan-out metric to exclude sibling capability modules, which **edits a
sensor during the refactor that sensor polices**, the move already rejected at T10 when rescoping the
ceiling inside `search-hub-metric.ts` was proposed.

*Why this generalises, and it sharpens C6.* R-03's failure mode is a **facade**, and **depth** of
reach is what distinguishes one from a set of capability modules. Fan-out measures **breadth**, which
a real split is supposed to increase. C6 already records the same asymmetry pointing the other way:
across M14 a fan-in/fan-out reading called that split a success while G-HUB called it a failure.
**The eleventh correction to inherit the defect it was correcting** — AC-3 was itself the rewrite of
the unmeasurable 22/26 figures, and it pinned the counting *method* while leaving the *direction*
claim unexamined. *A sensor's direction is part of the sensor, alongside its label and its alphabet.*

### T19 — executed

**Subject.** `design.md` §10's corrections **C1–C12** applied to `spec.md` in place, indexed there
under *Design and Execute corrections (C1–C12)*; §10's rows kept and marked applied. **Write set is
`.specs/` only** — no source, no CI, no CHANGELOG.

**The CHANGELOG question was settled by measurement, not by precedent-absence.** The carried
briefing said a specs-only task has no precedent because every prior task touched code or CI.
**False:** `353de59` and `ba8d2bc` are both on this branch, both `docs(specs):`, both **zero**
non-`.specs/` files and **zero** `CHANGELOG.md`. With `CONTRIBUTING.md`'s heading table mapping
docs/chore-only to *no entry*, T19 adds **no thirteenth entry**. `[Unreleased]` stays at **12**
bullets under `### Changed`, no new heading is created, and **`STATE.md`'s open release-semantics
item is untouched**. The CI merge gate is satisfied at PR level because PR-B modifies `CHANGELOG.md`
already; no `no-changelog` label is needed.

**T19's own sensor was non-discriminating and was substituted — measured, not argued.** The row asked
for *"`design.md` §10 rows all struck"*. That reads the wrong artifact: striking a row is an edit the
executor controls, and a commit that strikes all twelve while changing `spec.md` not at all passes
it. Measured at HEAD before the first edit, **8** old-text occurrences survive such a commit (C2 1,
C3 1, C8 2+2, C10 1, C11 1). By T7's vocabulary that is an invariance check. The replacement is a
**per-correction discriminating pair** — old text **absent** *and* new text **present**, neither half
sufficient — plus a positional check that fan-out is named as reported rather than as a pass
condition, and a row-count check on the index. Command in *Gate check commands*.

**Controls, and the strongest one is the pre-T19 file.** Run against `git show HEAD:…/spec.md`, the
sensor fails **every** correction on both halves, plus the positional and row-count checks. That is
the discrimination the original sensor could not provide, stated as a reading rather than an
argument. Three further mutations, each verified applied by blob hash before its reading was believed
and each applied to a `/tmp` copy so the subject was never edited (confirmed byte-identical
afterwards):

| mutation | reading |
| --- | --- |
| **half-application** — C10's new criterion deleted, old text *not* restored | **FAIL**, `old-absent ok / new-present FAIL` — proves old-absent alone is insufficient |
| **index-row drop** — one C row removed from the index | **FAIL**, `rows: 11` |
| **fan-out re-promoted** — C12 present but its *"reported, not a floor"* qualifier deleted | **FAIL** on the positional check — the citation-swap shape T14 closed structurally |

**The row-drop mutation found a defect in the sensor itself, and that is why the control exists.**
On its first run it printed `rows: 11 FAIL` and **exited 0**: the `fail=1` assignment sat inside a
`$( )` command substitution, which is a subshell, so it never reached the parent. A reader checking
exit status alone would have read a detected violation as green — *silence as a failure mode*, one
level up, in the instrument rather than the subject. Fixed before any reading was quoted; all three
mutations then exit 1.

**Two harness defects preceded it, both caught by the sensor failing on a correct subject** — the
discipline being that a guard firing on your own work is a claim to check, not to accommodate. An
empty `-F` pattern for the two add-only corrections (C7, C9) matched **449** lines, exactly the
file's line count; and C1's assertion straddled a markdown line wrap, which a line-oriented `grep`
cannot see. The subject was verified correct in both cases before the harness was touched. The
sensor is now whole-file and whitespace-normalised, which also makes it **reflow-proof** — the right
property for a task whose whole content is reflowing prose.

**C7 was applied with its metric named, and its stated method has a blind spot.** The figure
reproduces exactly at `a6216cd`: `git grep -nE 'from "(\.\./)+services/'` over
`packages/core/src/data/**/*.ts` gives **24 matching lines**, **24** unique (data-file →
service-module) edges, **14** distinct files, **6** target modules, and the `getPrismaClient` subset
at **12** — confirming both halves of C7 including its "correct, confirmed at 12". But the pattern
anchors on a **double quote**; quote-agnostic it is **26 / 16 / 7**. The two extra sites are
`data/vector/base-vector-store.ts:14` and `data/vector/postgres-vector-store.ts:26`, both
single-quoted, both present at `a6216cd` and unchanged at the shipped tree — **neither is a PR-B
regression**, and both belong to GMS-01, which PR-C owns. Recorded in `spec.md` rather than
corrected, since correcting a GMS-01 figure is not PR-B's to do. *A plan critic raised this and its
figures did not reproduce — it reported 25 edges and 15 files and named one of the two sites; the
mechanism was real and every number was wrong. **Sixth earned keep, and the sixth time the rule
"keep the finding, re-run the number" has paid.***

**C4 was widened by two sites on the same rule.** Its sentence says *"the three non-source mention
sites"*; T15 found five, adding `architecture-map.test.ts:454-455` and `search-controller.test.ts:3`.
Correcting a count inside the sentence C4 already rewrites is T10's rule, not a scope change.

**A figure inherited from the handoff did not survive re-measurement, and it was about to enter
`spec.md`.** The C12 proposal carried D1 as `delegateScope 16 → 0` and `facade-taking 11 → 0`, taken
from `HANDOFF.md`'s gate board. Those are **T10's mid-refactor readings**, not base-to-shipped. The
frozen `facade-matrix-before.json` at `d628464` gives **21 / 15 / 1550**. The two are consistent —
T6a/T6/T7/T8/T9 account for 21 → 16 and 15 → 11 — but only one of them is the baseline AC-3 names.
**Twelfth figure in this feature that did not reproduce when re-measured**, and the frozen fixture is
why it was caught: a before-baseline that cannot drift is worth more than one that is merely
recorded.

**Gates**: predicted entirely invariant before running, and confirmed — `.specs/` sits in
`check-stale-pointers`' `EXCLUDED`, and `.md` files are invisible to `check-frozen-anchors`
(`resolve.ts` scans only `.ts`/`.tsx`) and to G-HUB (`readdirSync` under `services/search`). Nothing
under `packages/core`, `scripts/` or `apps/` moved. Readings in `HANDOFF.md` under *Gates at T19*.

### T20 — executed

**Subject.** Independent validation by a fresh `massa-ai-verification-agent` at `b4f21a9`, author ≠
verifier — it authored none of T7–T19 and none of the spec corrections. Full report in
`validation.md` **Part II** (§13–§17); only what does not belong there is recorded here.

**Every GMS-03 / GMS-04 / GMS-05 criterion PASS**, read as amended by C1–C12. It re-derived rather
than inherited — all four structural sensors at both the frozen `d628464` base (through a temporary
worktree) and HEAD; `lint`, forced `type-check`, `build`, `bun run test` **11/11**, `test:scripts`
**770/0 across 41**, `test:plugins` **94/0**; the live needles trio; and per-file coverage
recomputed from raw lcov through the gate's own exported helpers, matching T18 byte for byte.

**The C12 judgement is the reason T20 existed, and the steelman it rejected is kept.** Told to argue
as hard as it could that C12 was a criterion relaxed to fit a result, it produced the strongest form
of the objection — C10 and C11 rest on impossibilities holding for *any* tree, while C12's holds for
*the decomposition this PR chose*, and no alternative topology was tried — then rejected it on facts
it measured: collapsing the six modules to hold fan-out flat would re-violate GMS-03 AC-1 and AC-2
and likely breach G-HUB's 700-LOC ceiling, and **G-HUB was calibrated before any Phase 1 code
existed**, against M14, where fan-in/fan-out stayed flat while reach went 1 → 14. Fan-in/fan-out was
*already known to be gameable by this exact kind of split* before PR-B began.

**Its medium finding is a governance one and it is about the record's format, not this decision.**
*"C12 was authored and resolved in the same commit as the work it excuses, with no independent party
at the time."* The reviewer did adjudicate it live, before it was written — but **the convention
`Resolved (reviewer, <date>)` does not let a later reader distinguish that from an executor
asserting approval**, which is exactly why the verifier could not tell. That ambiguity is worth
fixing in PR-C and PR-D, and it is the one thing T20 surfaced that no earlier task did.

**Two figures in T18's record were wrong**, found while re-measuring T20's own claims rather than by
T20 itself. Corrected in *T18 — executed* above and in `HANDOFF.md`. T20 flagged the second and
**mis-explained** it as a comment-stripped count; stripping comments lowers both sides and the
after-value matches raw exactly. *Seventh consecutive critic whose mechanism held while at least one
figure or explanation did not — the rule that catches these is to keep the finding and re-run the
number.*

**What T20 deliberately did not run, disclosed rather than hidden**: GMS-05 AC-1's hollowed-block
control, and the internal mutation tables of T19's sensor, `check-frozen-anchors` and
`check-stale-pointers`. Re-running them means mutating tracked files in a worktree it was told not to
write to. For T19's sensor it ran the base+control pair instead — shipped **PASS 12/12**, pre-T19
**FAIL on all 13 checks, rows=0** — which establishes discrimination without a mutation.

## Gate check commands

**Since T16, all four sensors are enforced in CI — but by two different routes, and the difference
matters when one of them goes red.** `check-frozen-anchors` and `check-characterization` are enforced
by their own `scripts/__tests__` suites, which run the real script against the real tree and reach CI
through `test:scripts`. `search-hub-metric` and `check-stale-pointers` are enforced by explicit steps
in the `build` job, because their suites use scratch directories only. All four land in the same
required check (`build`); a failure in the first pair surfaces as a **test** failure, in the second
pair as a **step** failure.

```bash
bun run lint                 # oxlint, root, correctness at error
bun run type-check           # 6 packages
bun run build                # 5 packages
bun run test                 # turbo — STOP any tools-api on :3333 first
bun run test:scripts         # includes the new hub-metric suite
bun run test:plugins
bun run bench:needles:gate   # ~2 min, needs local Ollama. NOT 90 min.
# CI step since T16. The directory is a REQUIRED positional — with no argument this
# exits 2 on a usage error, which fails a job while measuring nothing. Not `--json`:
# on a pass the script appends a non-JSON banner to stdout, so `--json` parses only
# when the gate is already red.
bun scripts/search-hub-metric.ts packages/core/src/services/search   # exit 0 = G-HUB pass

# Phase 0 sensors — sub-second, run on every Phase 1 commit
bun scripts/check-frozen-anchors.ts        # exit 0 = all 14 needle anchors still unique
bun scripts/check-characterization.ts      # exit 0 = the 3 guarded blocks still at floor

# GMS-04 AC-3's replacement (T15), a CI step since T16. Run it AFTER `git add` — it
# enumerates `git ls-files`, so an untracked file is invisible to it and the reading is
# wrong. It also needs FULL git history: it asks `git log --all` whether a path ever
# existed, so under a shallow clone every historical pointer reads as BROKEN and it
# reports `28 broken, 0 historical` on a clean tree. That is why the `build` job's
# checkout pins `fetch-depth: 0` (sixteenth defect).
bun scripts/check-stale-pointers.ts        # exit 0 = 0 BROKEN and HISTORICAL exactly on its pin

# T17: rerun the gate with a fresh label, then compare per-needle rank. ~2 min,
# needs a local Ollama with qwen3-embedding:8b. The report lands gitignored under
# benchmarks/needles/reports/, so the BASELINE is the committed copy in .specs/.
NEEDLE_FLOOR_HIT1=0.5 NEEDLE_FLOOR_MRR=0.65 bun benchmarks/needles/run.ts --label pr-b-after

# This exits 1 on PR-B and that is EXPECTED, not a regression to chase: N05 goes
# rank 5 -> 6 because renaming a corpus file changes the `// File:` header the
# chunker embeds. Run it — the per-needle table is the evidence — but read the
# seventeenth plan defect before quoting the exit code.
bun scripts/needles-diff.ts \
  .specs/features/core-layering-god-module-split/needles-before.json \
  benchmarks/needles/reports/massa-ai-pr-b-after-results.json   # exit 1 on PR-B, attributed

# The substituted sensor (T17). Re-ranks twice, changing only the path the chunker
# is told each file has. ~3.5 min: it embeds the corpus twice. Exit 0 = no needle
# below its baseline rank once the path is controlled for. Exit 2 = its identity
# pass disagreed with the report above, which means it is explaining nothing.
bun scripts/needles-rename-control.ts \
  .specs/features/core-layering-god-module-split/needles-before.json \
  benchmarks/needles/reports/massa-ai-pr-b-after-results.json   # exit 0

# T18. The `< /dev/null` is LOAD-BEARING, not hygiene — without it this never
# returns. `apps/web-ui/src/__tests__/app-renderers.test.ts` fires the click
# handlers `bindEvents` registered, which include `memory-edit` ->
# `app.js:838` `prompt("Edit memory content:", "")`. Bun's prompt/confirm/alert
# read stdin, so under any inherited live stdin the gate prints
# `Edit memory content: []` and hangs forever — no per-test timeout applies,
# because the block is inside a handler the test called synchronously.
# Measured: `</dev/null` -> web-ui 114 pass/0 fail in ~2 s; open pipe -> still
# running at 46 s. CI never sees it (stdin at EOF makes prompt() return null).
# Whole-gate wall clock is ~2 m 15 s — treat silence past that as the hang, not
# as progress. See the eighteenth plan defect.
DATABASE_URL=postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test \
  MASSA_AI_DEDICATED=1 RUN_POSTGRES_TESTS=1 bun run test:coverage < /dev/null

# The gate prints only an aggregate count and the BELOW-floor list. Absence from
# that list is NOT proof a file passed: `below` is built by iterating `merged`
# (check-coverage.ts:618-626), so a file no group reports never enters `merged`
# and can never be below the floor. To assert a specific file was measured,
# re-derive from the per-unit lcov left under `packages/*/coverage/` and
# `apps/*/coverage/` using the gate's own exported parseLcov/mergeInto/linePercent.
```

### T19's sensor — the spec-correction discriminating pair

**Not a committed script, deliberately.** A new file under the repo root joins both
`check-stale-pointers`' corpus and `resolveNeedles`' anchor scan — the pin trap that has fired three
times in this feature — and T19's write set is `.specs/` only. So it lives here, and the cost is
stated rather than hidden: **it is not in CI.** T20 runs it by hand.

Three properties are load-bearing and each was established by a control, not by reading:

- **Whole-file and whitespace-normalised, not line-oriented.** Markdown wraps and T19 reflows;
  a line-oriented `grep -F` cannot see an assertion that straddles a wrap, and reports that fact
  about itself as a fact about the subject. It did, on C1, before this was fixed.
- **"No old text" is an explicit `-` sentinel.** An empty `-F` pattern matches *every* line — 449 of
  449 on this file. Same class as the leading-dash trap: an unvalidated pattern silently inverts the
  reading.
- **`fail=1` never runs inside `$( )`.** A subshell assignment is lost, and the script then prints
  `FAIL` while exiting 0. Caught by the row-drop mutation; a positive control is the only thing that
  sees it.

```bash
# Exit 0 = all twelve corrections applied. Verify it discriminates before quoting it:
#   T19_SUBJECT=<(git show HEAD~1:.specs/features/core-layering-god-module-split/spec.md)
# must FAIL every correction. A sensor with no observed red is not a sensor.
S=${T19_SUBJECT:-.specs/features/core-layering-god-module-split/spec.md}
NORM=$(tr '\n' ' ' < "$S" | tr -s ' '); fail=0
have() { case "$NORM" in *"$1"*) return 0;; *) return 1;; esac; }
chk() { # tag | old (must be ABSENT; "-" = add-only) | new (must be PRESENT)
  local vo vn
  if [ "$2" = "-" ]; then vo="n/a "; elif have "$2"; then vo=FAIL; fail=1; else vo="ok  "; fi
  if have "$3"; then vn="ok  "; else vn=FAIL; fail=1; fi
  printf '  %-4s old-absent %s  new-present %s\n' "$1" "$vo" "$vn"; }

chk C1  "assumptions closed 2026-07-28; Design in progress"       "Execute in progress"
chk C2  "13 of ~16 facade members"                                 "**13 of 23** facade members"
chk C3  "roughly 90 minutes and a local Ollama"                    "roughly 2 minutes locally"
chk C4  "The three non-source mention sites are updated"           "FROZEN-ANCHOR"
chk C5  "Open — resolve in Design"                                 "Rule of thumb applied and passed at T19"
chk C6  "AC-3's committed measurement script is the check"         "calibrated on M14"
chk C7  "-"                                                        "24 edges across 14 files"
chk C8a "\`scripts/beir-benchmark.ts:258\`"                        "packages/core/src/scripts/beir-benchmark.ts:259"
chk C8b "\`scripts/symbol-benchmark.ts:213\`"                      "packages/core/src/scripts/symbol-benchmark.ts:214"
chk C9  "-"                                                        "there is **one**"
chk C10 "\`rg 'rlm-'\` returns only CHANGELOG and \`.specs/\` history." "check-stale-pointers.ts\` exits 0"
chk C11 "evidence is that per-needle ranks are unchanged"          "needles-rename-control.ts\` exiting 0"
chk C12 "fan-in and fan-out are both lower after the change"       "reported, not a floor"

# Positional: fan-out must be named as reported, NOT as a pass condition. Asserting
# only that C12 "appears somewhere" is passed by a replacement that re-promotes it.
have "Fan-out is reported and is deliberately not a pass condition" || fail=1

# Row count. NOTE: the assignment must sit OUTSIDE $( ) — see above.
rows=$(awk '/^\| # \| Amends \| Kind \|/{f=1;next} f&&/^\| C/{c++} f&&/^$/{if(f)exit} END{print c+0}' "$S")
if [ "$rows" -ne 12 ]; then fail=1; fi
echo "rows: $rows"; [ "$fail" -eq 0 ] && echo "T19 SENSOR: PASS" || echo "T19 SENSOR: FAIL"
exit $fail
```

**Assert pass counts, never exit status.** `bun test` exits 0 when everything skips. Known-good
baselines: `test:scripts` **725 pass / 0 fail across 39 files** at the end of Phase 0 (`06bde32`);
it was **602 across 28** at `ce26f28`, before T0–T5 added six suites (the
`__zzz_crash_*_probe` "1 suite crashed" line is a deliberate fixture exercising the runner's
ZERO-LOSS guard — pre-existing, not a failure). `mcp-client` is **95 pass / 0 fail in 4.34 s** only
with the API stopped; verify with `lsof -nP -iTCP:3333 -sTCP:LISTEN`, not `pgrep`.

---

## Sizing, and the sub-agent question

20 tasks — over the ~8-task single-batch threshold, so `references/spec-driven/sub-agents.md`'s
offer applies at Execute. **Recommendation: decline for Phase 1.** T6–T14 are one continuous
refactor of one directory with a shared invariant (LATE-BIND) that no per-batch summary conveys
reliably, and the write sets are not disjoint — T14 depends on all of T6–T13. Phase 0 (T1–T5) is
genuinely parallel-safe if the offer is wanted anywhere.

Estimated Execute: **~25 h** plus gate runs. Phase 0 ~4 h, Phase 1 ~17.5 h, Phase 2 ~3.5 h.
(Revised from ~22 h: T0 is real work, not "done"; T5 gained a discriminating sensor; T6 gained two
files; T10 absorbed `ensureInitializedImpl`; and T13 was under-budgeted at 4 h — it carries the
highest-arity function in the matrix, 455 LOC and 13 members, **and** is the only Phase 1 task that
wires into three already-extracted siblings, against T10's standalone module at 3.5 h.)

**Session boundary (spec-owner, 2026-07-29): stop after Phase 0.** T0–T5 lock every before/after
measurement — G-HUB, the needles baseline, the characterization record — and none of them can be
taken retroactively once a structural commit lands. It is the one review point Phase 1 cannot be
re-done without.

## Rollback

Every task is one commit on `refactor/search-facade-split`. R-04 requires the PR be independently
revertable: **the merge must be a merge commit, not a squash** — a squash folds every commit body
into the merge message, and that is what killed v1.3.0. Never write the skip-ci marker literally in
a commit or PR body.

## Plan Challenge — tasks

`design.md` went through a full The Fool `evidence_audit` with two parallel critics (§13). **This
file did not** — it was written afterward. One independent read-only `massa-ai-plan-critic` was run
against it before Execute was authorised, scoped to a single question: *does executing `tasks.md`
exactly as written produce a tree satisfying `design.md` and GMS-03/04/05, or does it strand
something?* Policy `serious_findings: revise_plan`. Nine findings; all incorporated above.

| # | severity | finding | disposition |
| --- | --- | --- | --- |
| 1 | critical | T0's "committed" is false — `git log --all` empty, files untracked | **Revised.** T0 is now the first commit of Execute, with a `git log` sensor. |
| 2 | critical | `ensureInitializedImpl` has no task-owned destination | **Revised.** T10 owns it; see the section above. Independently found by the main agent and the critic. |
| 3 | high | T6 breaks a re-export chain it does not name (`rlm-search.ts:498-501` → `contextual-search-rlm.ts:52-53`) | **Revised.** Both files added to T6; estimate 1 h → 1.5 h. `type-check` would have caught it, but the row's scope was wrong. |
| 4 | medium-high | T16's sensor tests redness, not blocking — the SEN-02 AC-5 defect class | **Revised.** `gh api` ruleset check added. |
| 5 | medium | T9's destination "the query module" names nothing, and `query-understanding.ts` is a plausible wrong pick | **Revised.** Named `hybrid-search.ts`. |
| 6 | medium | T5's guard is name-presence; a hollowed describe block passes | **Revised.** Assertion-count floor, observed red against a hollowed copy first. |
| 7 | low | T11's parity sensor exercises only the default path, never the seam it adds | **Revised.** Positive injected-stub assertion added. |
| 8 | low-medium | T13 under-budgeted against T10 | **Revised.** 4 h → 5.5 h; T10 3 h → 3.5 h. |
| 9 | low | No task owns `rlm-indexing.ts`'s deletion | **Resolved by #2** — it dies whole at T10. |

Found by the main agent, not the critic, and also incorporated: **T15's sensor is unsatisfiable**
(320 `rlm-` occurrences in tracked `.ua/` artifacts, plus two unnamed test-file comments), and the
**PATCHABLE / LATE-BIND provenance figures do not reproduce** (16 across **3** files, not 4; "77
across 12" is unverified and `design.md`'s own table sums to 82).

The critic returned `escalate_to_full: true`, recommending a second `pre_mortem` or `red_team` pass.
**Not run, deliberately, and recorded rather than skipped silently.** `design.md` already carries a
full `evidence_audit` gate with two critics against the same subject matter; every finding here is
concrete and closed by an edit to a task row, not by a design-level challenge; and the chosen
session boundary — stop at the end of Phase 0, before any structural commit — *is* the review gate
the escalation asks for, with every before/after measurement recorded and nothing yet irreversible.
If Phase 0's measurements contradict `design.md` §3, that is the point to escalate.

## Open, and not PR-B's to close

- **Full-corpus needles baseline** still does not exist (~3.2 h at `qwen3-embedding:8b`, cannot
  overlap `bun run test`). T4/T17 use the 8-file benchmark corpus, which is the right sensor for
  PR-B. Do not quote a bounded-corpus number as a full-corpus one.
- **Cross-package turbo concurrency against one database** — `graph_generation_workspace_missing`
  on `trace-path` / `arch-map`. Pre-existing, CI equally exposed, still no task. Attribute before
  debugging.
- **R-08** — deferred to PR-C's Design with a named precondition (`design.md` §5.3).
- **`.ua/` knowledge-graph regeneration** — 320 `rlm-` occurrences across three tracked generated
  artifacts. Deferred to **after PR-C** by spec-owner decision; PR-B's GMS-04 AC-3 is scoped to
  exclude them and does not claim otherwise.
