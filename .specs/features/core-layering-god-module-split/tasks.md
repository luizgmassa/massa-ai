# Core Layering and God-Module Split — Tasks (PR-B)

- **Slug**: `core-layering-god-module-split` · **PR-B** · branch `refactor/search-facade-split`
- **Requirements**: GMS-03, GMS-04 · validated by GMS-05. **Not** GMS-01/GMS-02 (PR-C) or AS-06 (PR-D).
- **Design**: `design.md` — read §3.4 (G-HUB), §4.3.1 (LATE-BIND), §4.4 (module shape), §6.1
  (FROZEN-ANCHOR), §5.4 (the PR-C boundary) before the first structural commit.
- **Status**: written 2026-07-29 against `main` @ `ce26f28`; **revised 2026-07-29** after an
  independent Plan Challenge on this file (see [Plan Challenge — tasks](#plan-challenge--tasks)).
  Approved. Execute authorised; branch `refactor/search-facade-split` cut from `ce26f28`.

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
| **AC-3** | No test weakened, skipped or deleted. Under the §4.4 shape PR-B needs **zero** test-file edits except the 4 rename sites. | diff review; any test edit stops the task |
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
> **~2 minutes.** Budget the runs accordingly; this is spec correction C3.

---

## Phase 1 — extraction, cheapest and most separable first

Order is the matrix's, not preference: fewest facade members first, so the pattern is proven where
it is cheapest and `searchImpl` (455 LOC, 13 members) lands last, when everything it calls exists.

| # | task | from → to | members to remove | sensor | cost |
| --- | --- | --- | --- | --- | --- |
| **T6** | `fuseResults`, `generateScoreExplanation` | `rlm-fusion.ts` → `result-fusion.ts` | `RRF_K` → module const. **No deps parameter at all.** **Also updates two files the original row missed**: the re-export at `rlm-search.ts:498-501` (`export { fuseResultsImpl, generateScoreExplanationImpl } from "./rlm-fusion.js"`) and the import block at `contextual-search-rlm.ts:52-53`, which reaches these two symbols **through `rlm-search.js`, not directly**. | hub-metric reach drops below 14; frozen-anchor check (3 of the 4 live here); `rlm-search.test.ts` **31** + characterization **21** pass counts | 1.5 h |
| **T7** | `buildGraphStream` | `rlm-synapse.ts` → `graph-stream.ts` | none — it already reads **zero** facade members | `rlm-synapse.test.ts` pass count = **26** (the "14" in the first draft is the `buildGraphStream` describe block, not the file total); note `graph-stream-project-scope-pg.test.ts` imports it directly and needs a live DB | 1 h |
| **T8** | `applySynapseState` | `rlm-synapse.ts` → `session-bias.ts` | `injectedDeps` → `SessionBiasDeps {sessionRegistry, synapseManager}` | **GMS-03 AC-2 sensor**: a new unit test constructs it from an object literal with **zero** `mock.module` calls | 1.5 h |
| **T9** | `correctQuery` | `rlm-synapse.ts` → **`hybrid-search.ts`** (§4.1/§4.2). The first draft said "folded into the query module", which names nothing — and `query-understanding.ts` is a real, unrelated file in the same directory that an executor could plausibly pick. | `keywordSearch` → `HybridSearchDeps` | `rlm-synapse.test.ts` correctQuery cases (5) pass unmodified | 45 m |
| **T10** | indexing surfaces **and `ensureInitializedImpl`** | `rlm-indexing.ts` → `project-indexer.ts`; **`ensureInitializedImpl`'s body → `ContextualSearchRLM.ensureInitialized()`** | `indexManager`, `symbolRepo`, `keywordSearch`, `vectorStore`, `searchCache` → `IndexerDeps` | **LATE-BIND sensor**: `rlm-indexing.test.ts` pass count = **25**. Any drop means stubs stopped taking effect. **Plus**: `git grep -n 'ensureInitializedImpl' -- packages/core/src` returns nothing outside tests. | 3.5 h |
| **T11** | `IndexManager` injection seam (**F4**) | **`contextual-search-rlm.ts`** — re-pointed. The first draft named `rlm-indexing.ts:586`, which is *inside* `ensureInitializedImpl` and no longer exists after T10. | the one dependency that cannot be injected today; add the `injectedDeps.indexManager` field | default to today's direct construction; a parity test proves behavior identical when nothing is injected — **plus one positive test that an injected stub `IndexManager` is actually read**, since the parity test alone exercises only the default path and cannot fail on a seam that is wired but never consulted | 1.5 h |
| **T12** | admin surfaces | `rlm-admin.ts` → `index-admin.ts` | six stores + `fileFilterCache` | `rlm-admin.test.ts` (**7** cases) + the 4 `fileFilterCache` assignment sites | 1.5 h |
| **T13** | search surfaces | `rlm-search.ts` → `hybrid-search.ts` | `keywordSearch`, `vectorStore`, `searchCache`, `analytics`, `queryUnderstanding` → `HybridSearchDeps` | `rlm-search.test.ts` (**31** cases) + `search-dependency-outage` + `search-filter-overfetch` + `search-ranking-regression` pass counts | **5.5 h** |
| **T14** | root → composition root | `contextual-search-rlm.ts` | assemble narrow deps **per call**; state fields stay public (§4.3.1) | **G-HUB**: `bun scripts/search-hub-metric.ts packages/core/src/services/search` exits **0** | 2 h |

**Every task in Phase 1 additionally runs:** `bun run lint`, `bun run type-check`, the frozen-anchor
check, and `git diff --name-only` reviewed against PR-C-BOUNDARY and AC-3.

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

DATABASE_URL=postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test \
  MASSA_AI_DEDICATED=1 RUN_POSTGRES_TESTS=1 bun run test:coverage
```

**Assert pass counts, never exit status.** `bun test` exits 0 when everything skips. Known-good
baselines: `test:scripts` **602 pass / 0 fail** across 28 files in `scripts/__tests__` (the
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
