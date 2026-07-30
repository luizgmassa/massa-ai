# Core Layering and God-Module Split — Tasks (PR-B)

- **Slug**: `core-layering-god-module-split` · **PR-B** · branch `refactor/search-facade-split`
- **Requirements**: GMS-03, GMS-04 · validated by GMS-05. **Not** GMS-01/GMS-02 (PR-C) or AS-06 (PR-D).
- **Design**: `design.md` — read §3.4 (G-HUB), §4.3.1 (LATE-BIND), §4.4 (module shape), §6.1
  (FROZEN-ANCHOR), §5.4 (the PR-C boundary) before the first structural commit.
- **Status**: written 2026-07-29 against `main` @ `ce26f28`; **revised 2026-07-29** after an
  independent Plan Challenge on this file (see [Plan Challenge — tasks](#plan-challenge--tasks)).
  Approved. Execute authorised; branch `refactor/search-facade-split` cut from `ce26f28`.
  **Phase 0 (T0–T5) COMPLETE 2026-07-29** — see
  [Phase 0 — executed](#phase-0--executed). Stopped at the session boundary as planned; T6 not
  started.

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
| **T12** | admin surfaces | `rlm-admin.ts` → `index-admin.ts` | six stores + `fileFilterCache`. **Narrow `fileFilterCache: FileFilterCache` and any `SearchAnalytics`/`SearchAnalyticsPg` field with `Pick<>`** — all three types are declared in the gated directory (T10's seventh defect) | `rlm-admin.test.ts` (**7** cases) + the 4 `fileFilterCache` assignment sites. **Plus the T10 gate**: the hub metric reports exactly **one** type above the ceiling and it is `ContextualSearchRLM` — read the whole `types` array, not the `ContextualSearchRLM` row. **Plus the memo mutation, run against T12's own surface** (T9's finding; T10 measured it blind at the richest surface in the repo, so do not infer) — on a delegate with **no preceding `await`**, or it starves the event loop and hangs instead of failing at 5 s | 1.5 h |
| **T13** | search surfaces | `rlm-search.ts` → `hybrid-search.ts` | `keywordSearch`, `vectorStore`, `searchCache`, `analytics`, `queryUnderstanding` → `HybridSearchDeps`. **Narrow `queryUnderstanding: QueryUnderstandingService` with `Pick<>`** — same reason as T12 | `rlm-search.test.ts` (**31** cases) + `search-dependency-outage` + `search-filter-overfetch` + `search-ranking-regression` pass counts. **Plus the same three T10 additions as T12**: one-violation hub check, own memo mutation, mutation subject with no preceding `await`. Also the point where `hybrid-search-late-bind.test.ts`'s third test must widen from one key to five | **5.5 h** |
| **T14** | root → composition root | `contextual-search-rlm.ts` | assemble narrow deps **per call**; state fields stay public (§4.3.1) | **G-HUB**: `bun scripts/search-hub-metric.ts packages/core/src/services/search` exits **0** | 2 h |

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
| T10 | this commit | six indexing surfaces → `project-indexer.ts` with `IndexerDeps`; **`ensureInitializedImpl`'s body absorbed into `ContextualSearchRLM.ensureInitialized()`**; **`rlm-indexing.ts` deleted whole** | **foreign modules 4 → 3**, predicted by scratch simulation before the edit and confirmed exactly. D1 `delegateScope` **16 → 9**, facade-taking **11 → 6**, scoped LOC **1108 → 626** — all three predicted to the number; all six functions reappear in `all` with `facadeParam: null`. `git grep -n ensureInitializedImpl -- packages/core/src` returns **only comments** (0 code sites). Runtime mutation pair on `indexFile`: naive `this.indexFile(this.#indexerDeps(), …)` caught by `tsc` (**TS2554: Expected 3-4 arguments, but got 5**), blind `this.indexFile(filePath, …)` leaves `tsc` at **0** and takes coverage to **39/2** and `rlm-indexing` to **22/3**. Memo mutation run per the T9 finding and it is **blind** — see the section below. Invariance: `rlm-indexing.test.ts` **25**, `concurrent-indexing.test.ts` **9**, coverage **41 / 75 expect() calls**, characterization net **160**. New LATE-BIND sensor `project-indexer-late-bind.test.ts` **4/0**, observed **2/2 · 3/1 · 3/1** red under three mutations first. **Plus the seventh plan defect: `IndexManager` foreign reach 0 → 4** — caught, fixed inside the task, recorded below |

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
| T13 | 3 | — |
| **total** | **18** | 3 `mock.module` targets re-pointed across 6 modules; ~14 mocked symbol names |

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
of T7–T12: **reach cannot fall until T13 rewrites `rlm-search.ts`, and G-HUB cannot go green until
T14.** G-HUB's exit status is T14's gate and nobody else's. Recorded because a sensor that reports
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
| **T15** | GMS-04 non-source sites | `docs/ONBOARDING.md:147,148,177` (incl. the layer-4 tour entry) and `CLAUDE.md:157` — **plus two the first draft missed**: `packages/core/src/__tests__/architecture-map.test.ts:454-455` and `search-controller.test.ts:3`, both **comments** citing test files this PR renames. **The needles fixture is NOT a site** — PR-A content-anchored all 14 needles and removed every `filePath` (spec correction C4). | **scoped sensor** — see below | 45 m |
| **T16** | wire G-HUB into CI | add to the `build` job beside `verify-package-contents.ts` | flip a threshold in a scratch branch → CI goes red, **and** confirm `build` is in `main`'s required checks: `gh api repos/luizgmassa/massa-ai/rules/branches/main --jq '[.[] \| select(.type=="required_status_checks") \| .parameters.required_status_checks[].context]'`. A job that goes red without being in that list blocks nothing — that is exactly how PR-A's `coverage.yml` shipped claiming `BLOCKING BY DESIGN` and enforced nothing (SEN-02 AC-5). **A gate's enabling condition is part of the gate.** | 1 h |
| **T17** | needles after-run + comparison | rerun the gate; per-needle rank diff vs T4's baseline. **A floor pass with three needles slipping 1→4 is a regression that passed** (GMS-05 AC-4 note 2). | the T4 diff script, exit 0 | ~2 min + 30 m |
| **T18** | coverage gate | `DATABASE_URL=…5433/massa_ai_test MASSA_AI_DEDICATED=1 RUN_POSTGRES_TESTS=1 bun run test:coverage` | exclusions still **9**; no file this PR touches below floor | 30 m |
| **T19** | spec corrections C1–C7 | apply `design.md` §10 to `spec.md` | `design.md` §10 rows all struck | 45 m |
| **T20** | independent validation | fresh `verification-agent`, author ≠ verifier → `validation.md` | spec-anchored outcome check + discrimination sensor | — |

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

## Gate check commands

```bash
bun run lint                 # oxlint, root, correctness at error
bun run type-check           # 6 packages
bun run build                # 5 packages
bun run test                 # turbo — STOP any tools-api on :3333 first
bun run test:scripts         # includes the new hub-metric suite
bun run test:plugins
bun run bench:needles:gate   # ~2 min, needs local Ollama. NOT 90 min.
bun scripts/search-hub-metric.ts packages/core/src/services/search   # exit 0 = G-HUB pass

# Phase 0 sensors — sub-second, run on every Phase 1 commit
bun scripts/check-frozen-anchors.ts        # exit 0 = all 14 needle anchors still unique
bun scripts/check-characterization.ts      # exit 0 = the 3 guarded blocks still at floor

# T17: rerun the gate with a fresh label, then compare per-needle rank
NEEDLE_FLOOR_HIT1=0.5 NEEDLE_FLOOR_MRR=0.65 bun benchmarks/needles/run.ts --label pr-b-after
bun scripts/needles-diff.ts \
  .specs/features/core-layering-god-module-split/needles-before.json \
  benchmarks/needles/reports/massa-ai-pr-b-after-results.json   # exit 0 = no rank regression

DATABASE_URL=postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test \
  MASSA_AI_DEDICATED=1 RUN_POSTGRES_TESTS=1 bun run test:coverage
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
