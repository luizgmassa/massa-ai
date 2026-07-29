# Core Layering and God-Module Split — Validation (PR-B)

- **Slug**: `core-layering-god-module-split` · **PR-B** · branch `refactor/search-facade-split`
- **Requirements**: GMS-03, GMS-04 · validated by GMS-05
- **Status**: **Phase 0 characterization record only.** This is the *before* half of a
  before/after measurement. It carries no PASS/FAIL verdict for PR-B and must not be read as
  one — the verdict is T20's, written by a fresh verification agent with author ≠ verifier.

Every figure below was measured in the Execute session at `0129207`, under a scratch
`XDG_CONFIG_HOME`, and reproduces unless the row says otherwise. Figures carried from
`design.md` that did **not** reproduce are called out rather than quietly corrected.

---

## Why this record exists first (GMS-05 AC-1)

PR-B is behavior-preserving, so it has no feature to demonstrate. Its only evidence is that a
set of instruments read the same before and after. Three of those readings cannot be taken
retroactively — once a structural commit lands, the *before* is gone. That is the whole reason
Phase 0 is a session boundary:

- **G-HUB** is a before/after coupling measurement. Read after the split, it proves nothing.
- **The needles baseline** is a retrieval measurement over files PR-B rewrites.
- **The characterization inventory** is the count of tests that must still exist and still pass.

## 1. Characterization inventory — the 160 (design.md §4.6)

Measured per file, one process each. `bun test` over a whole directory cross-contaminates
module and process state, so a directory-level count is not the same measurement.

| suite | pass | fail |
| --- | --- | --- |
| `rlm-indexing.test.ts` | 25 | 0 |
| `rlm-search.test.ts` | 31 | 0 |
| `rlm-synapse.test.ts` | 26 | 0 |
| `rlm-admin.test.ts` | 7 | 0 |
| `concurrent-indexing.test.ts` | 9 | 0 |
| `contextual-search-rlm-coverage.test.ts` | 41 | 0 |
| `contextual-search-rlm.characterization.test.ts` | 21 | 0 |
| **net** | **160** | **0** |

160 reproduces `design.md` §4.6 exactly.

## 2. The three single points of truth, and their floors

`extractPreview`, `calculateAvgScore` and `_indexProjectInternal` are each pinned behaviorally
in exactly one `describe` block repo-wide. Everywhere else they appear they are **replaced**:
`contextual-search-rlm-coverage.test.ts` mocks the impls and asserts the facade delegates to
them; `concurrent-indexing.test.ts` assigns over `_indexProjectInternal` to drive the lock.

That distinction is the point. A delegation test passes just as happily against an
implementation whose body has been deleted, so if the one behavioral block is weakened the loss
is invisible — suite still green, count still plausible, nothing in the diff looking wrong.

| behavior | behavioral block | assertions | tests | delegation blocks elsewhere |
| --- | --- | --- | --- | --- |
| `extractPreview` | `contextual-search-rlm.characterization.test.ts:328` | 4 | 4 | 1 (`…-coverage.test.ts:735`) |
| `calculateAvgScore` | `contextual-search-rlm.characterization.test.ts:301` | 4 | 3 | 1 (`…-coverage.test.ts:754`) |
| `_indexProjectInternal` | `rlm-indexing.test.ts:552` | 8 | 3 | 0 — every other reference is a monkey-patch |

Guarded by `scripts/check-characterization.ts`. Floors are the **measured** counts, so adding
assertions is fine and removing one is a failure.

**Name presence was rejected as the check.** A `describe("extractPreview", …)` hollowed to
`expect(true).toBe(true)` keeps its name and all of its apparent coverage. The guard was
observed red against exactly that mutation — applied to the real block, not a stand-in — and
that mutation is a permanent test rather than a one-off observation. It is also red on a
single assertion removed, on the block deleted, on the block duplicated (which would satisfy
any per-block floor while halving each half), and on real assertions swapped for
mock-delegation ones.

Blocks are located **by symbol, not by file path**, deliberately. PR-B renames the files these
blocks live in; a guard pinned to `rlm-indexing.test.ts` would go red on the rename itself and
then be "fixed" by editing the guard — the same motion as weakening it, and indistinguishable
from it in a diff. Same trade PR-A made when it content-anchored the needles fixture.

## 3. G-HUB — the coupling reading being refuted (design.md §3.4)

`bun scripts/search-hub-metric.ts packages/core/src/services/search` → **exit 1**.

| type | declared in | foreign modules | maxForeignReach | deepest reader |
| --- | --- | --- | --- | --- |
| `ContextualSearchRLM` | `contextual-search-rlm.ts` | 6 | **14** | `rlm-search.ts` |
| `SearchDegradation` | `search-diagnostics.ts` | 1 | 3 | `rlm-search.ts` |
| `Policy` | `capture-policy-interfaces.ts` | 1 | 2 | `capture-policy.ts` |
| `QueryLlmSurface` | `query-understanding.ts` | 1 | 2 | `reranker.ts` |

23 files, largest `rlm-indexing.ts` at **592** LOC. Exactly one type fails the ≤ 3 ceiling and
it is the target. T14's gate is this command exiting 0.

> Capture the exit code directly. `… | tail -n 12` reports `tail`'s status and prints `0` on a
> failing gate, which inverts G-HUB silently.

## 4. Facade shape — D1 and D3

`scripts/search-facade-matrix.ts` (D1): **21** exported functions · **15** take the facade ·
**6** already do not · **1550** LOC covered · **23** distinct members. Reproduces `design.md` §2.1.

`scripts/search-facade-metrics.ts` (D3): fan-in **24** static, **26** including the two dynamic
importers; fan-out **19**; **17** files mention without importing (24 + 2 + 17 = 43, which is
what a plain string search returns).

The mention-only bucket moved three times in one session — 13 when D3 was written, 15 once its
own two files were tracked, 17 once the frozen-anchor and characterization tooling landed. Every
movement was a new file *about* the facade, not a change to the facade. That count measures how
many things discuss the subject, which grows monotonically during a refactor whose entire
activity is discussing it, so it is asserted as a floor and a partition invariant rather than
pinned. **Fan-in and fan-out are the figures; the mention count is context.** What is pinned is
that tooling naming the facade lands in the mention-only bucket and never in fan-in — an
instrument counted as a consumer of its own subject is defect §10.1 below.

`controllers` (settles `design.md` §5.1, which had left this as "between 22 and 30" against
`spec.md`'s "3-4 files"): 6 members, **22** deep + **1** barrel + **1** dynamic = **24** outside
importers. The spread was entirely definitional.

## 5. PATCHABLE — 16 sites across 3 files

Measured over `git ls-files 'packages/core/src/**/*.test.ts'` for assignment and `spyOn` forms
of `ensureInitialized` / `_indexProjectInternal`:

| file | sites |
| --- | --- |
| `concurrent-indexing.test.ts` | 10 |
| `contextual-search-rlm.characterization.test.ts` | 5 |
| `rlm-search.test.ts` | 1 |
| **total** | **16 across 3 files** |

The 16 reproduces. `design.md` §4.5's "**4** files" does not. Sensor stays
`concurrent-indexing.test.ts` at 9 pass.

## 6. LATE-BIND — the count is not the sensor, and this is why

`design.md` §4.3.1 says 77 sites across 12 files in prose; its own per-member table sums to
**82**; direct measurement excluding the `LoadStage` assignments (which are not on the facade)
gives a third answer; and a fourth method here — post-construction assignment through an
`as any` cast, which catches only cast forms — gives **91 across 7 files**.

Four methods, four numbers. That spread *is* the finding: the site count is method-dependent
and cannot be an acceptance figure. The constraint is untouched — there are of order 80–90
post-construction assignments onto `ContextualSearchRLM` across roughly a dozen test files, and
capturing collaborators at construction makes every one of them silently ineffective.

**The sensor is the per-suite pass count in §1, which is exact.** The site count is provenance,
and it is approximate. Recorded rather than corrected, so a later reader does not adopt one of
the four as measured fact.

## 7. Needles — the retrieval before-baseline (GMS-05 AC-4)

Run at `0129207`, 8-file corpus, `qwen3-embedding:8b`, 87 chunks. Gate **PASS**.

| metric | value |
| --- | --- |
| hit@1 | 0.6429 |
| hit@3 | 0.8571 |
| hit@5 | 0.9286 |
| hit@10 | 1.0000 |
| MRR | **0.7357** |

Per-needle rank: N05 @5 · N12 @10 · N06/N08/N14 @3 · the other nine @1.

Artifact: `needles-before.json` in this directory. It lives here rather than in
`benchmarks/needles/reports/`, which is gitignored — a before-baseline that does not survive a
fresh checkout cannot be T17's referent. `run.ts` now records each needle's `rank` and resolved
`expected` span into the report, so the comparison needs no tree at all.

That last point is load-bearing. Recomputing an old report's rank against a post-rename tree
resolves the anchor to its new home, matches nothing in the old hit list, and reads as a miss on
every needle — a total collapse manufactured entirely by the measurement.

**Cross-check.** Against `massa-ai-after-t5b-recovery-results.json` (captured at `5e018e5`,
3 commits back): rank-for-rank identical, 14/14, MRR 0.7357 both sides. 13 of 14 top scores
match to four decimals. The one that moved is N10, 0.6395 → 0.6407 — and `discover.ts` is the
only needle target file changed in those 3 commits. The exception lands exactly where the tree
moved, which is what makes the other 13 worth believing.

**Bounded corpus.** 8 files means far fewer competing chunks than the repository, so this is
strictly easier than a full-corpus run. No full-corpus baseline exists (~3.2 h). These numbers
must never be quoted as full-corpus ones.

**The floors are not the sensor.** hit@1 ≥ 0.5 and MRR ≥ 0.65 answer "is retrieval still
acceptable". Three needles slipping rank 1 → 4 leaves hit@5 untouched and clears both floors
(GMS-05 AC-4 note 2). T17 compares per-needle rank via `scripts/needles-diff.ts`, which also
treats a *disappearing* needle as a regression — dropping a hard one is the cheapest way to
raise every aggregate.

## 8. FROZEN-ANCHOR — all 14 resolve uniquely

`bun scripts/check-frozen-anchors.ts` → **exit 0**, 270 ms.

| needle | resolves to |
| --- | --- |
| N03-keyword-boost-code-query | `services/search/rlm-fusion.ts:57-66` |
| N04-rrf-vector-blend | `services/search/rlm-fusion.ts:170-175` |
| N05-centrality-rerank-bonus | `services/search/rlm-fusion.ts:177-184` |
| N06-minscore-on-raw-vector | `services/search/rlm-search.ts:340-354` |

Those four are PR-B's blast radius. The other ten resolve into `symbol/centrality.ts`,
`search/chunker/`, `etl/stages/discover.ts` and `data/vector/postgres-vector-store.ts`, and PR-B
does not touch them.

Anchors are read from the fixture, never listed in the checker — `resolve.ts` scans every `.ts`
and `.tsx` under the repo root, so a file quoting an anchor verbatim *is* a second occurrence
of it and a checker carrying its own copy would fail on its own existence.

## 9. Other Phase 0 gate readings

| gate | reading |
| --- | --- |
| `bun run lint` | exit 0 |
| `bun run type-check` | exit 0 |
| `bun run test:scripts` | 730 pass / 0 fail across 39 files, exit 0 |
| `bun scripts/check-frozen-anchors.ts` | exit 0, 14/14 unique |
| `bun scripts/check-characterization.ts` | exit 0, 3/3 at floor |
| `check-coverage.ts` EXCLUSIONS | **9** (AC-2 requires this stays 9) |
| `:3333` | free |

## 10. Instrument defects found and closed during Phase 0

Both are the same shape — an instrument whose reading was an artifact of the state it was taken
in — and both would have produced a confidently wrong number rather than an error.

1. **D3's suite was verified while its own files were untracked.** It read 17 pass / 0 fail;
   `git ls-files` cannot see an untracked file, so the corpus tests were blind to their own
   source. Staging them moved fan-in from 26 to **27** and turned 3 of its tests red. The
   multi-line dynamic-import fixture pasted the facade's real specifier verbatim, and a regex
   over comment-stripped source cannot see through a template literal — the fixture is not an
   approximation of real code, it *is* real code, quoted. Fixed by a placeholder specifier plus
   a corpus test asserting the file is counted in neither fan-in bucket.

   Stripping backtick spans the way comments are stripped was rejected with measurement: **67**
   tracked files put a backtick inside a quoted literal and **47** carry an odd backtick count
   once comments are gone, so the strip would mis-pair and delete real code across exactly the
   corpus being measured — the mirror of the apostrophe hazard that already rules out stripping
   quotes.

2. **"Each anchor appears exactly once repo-wide" was already false.** Each of the four appears
   4–6 times across tracked files: once in source, once in the fixture that defines it, and
   2–4 times in `.specs/` prose quoting it. It is true only in `resolve.ts`'s corpus of `.ts`
   and `.tsx` sources, which is the scope that matters and is the one the real gate uses.

## 10a. A third instrument defect, found by CodeQL on PR #44

Both D1 and D3 built a `RegExp` by interpolating a **command-line argument** unescaped
(`js/regex-injection`, alerts 29 and 30):

- `search-facade-matrix.ts` — `--type` interpolated into `` `([A-Za-z0-9_]+)\s*:\s*${type}\b` ``
- `search-facade-metrics.ts` — `basename(--dir)` interpolated into `` `(^|/)${leaf}(/index)?$` ``

A directory or type named `a+b` stops meaning the literal name and starts meaning "one or more
`a` then `b`". Same family as §10's other two: the instrument silently measuring something other
than what it was asked to.

Fixed at `9c6916e`. D3's needed no pattern at all — "does this specifier end with `<leaf>` or
`<leaf>/index`" is what `===`/`endsWith` say directly — so the dynamic regex is gone, extracted
as `isBarrelSpecifier()`. D1's genuinely needs a pattern (it captures the identifier *preceding*
the type name), so its argument is escaped through a new `escapeRegExp()`. Both carry regression
tests proving a metacharacter-laden value is matched literally.

**All three load-bearing figures are byte-identical across the fix** — fan-in 24/26, fan-out 19;
controllers 6/22/1/1; D1 21/15/6/1550/23 — which is the evidence the rewrite is
behavior-preserving, over and above the four-branch equivalence being readable by eye.

## 11. Known-flaky, attributed, not chased

Three, all observed during PR #44. None was fixed, and none should be until it reproduces
deterministically — each will get another roll on every Phase 1 push.

1. **`scripts/tests/test-setup-wizard-db-selection.sh` → `not ok - migrations fail closed`.**
   Failed once in three consecutive local `bun run test:scripts` runs, and once more in a later
   session. All 20 shell suites pass standalone. It is a pure text assertion over
   `setup-local-first.sh` with no database or Docker dependency, and the preceding suite was
   confirmed to use `mktemp -d` with a cleanup trap, so it is not state leakage. Touches no path
   Phase 0 changed.

2. **`native Tree-sitter package contract > discriminates no-delete growth and bounds patched
   100-cycle RSS` — `this test timed out after 5000ms`.** Failed CI's `build` job once. Three
   observations on identical code: **5156.78 ms** (fail), **3790.74 ms** (pass, 75.8% of budget),
   **4910.31 ms** (pass, 98.2%). It measures RSS over 100 parse cycles in a cold Bun child on a
   2-core runner. Load-sensitive, not deterministic.

   **Budgeted at 30 s (spec-owner decision).** Held back at first on the rule that one failure is
   not a base rate — but a fourth reading at **4710.44 ms** made the pattern the criterion, not
   the single failure: three of four runs sit at 94%, 98% and 103% of budget on effectively
   identical code. The cost is honest (two child processes × 100 parse cycles on a 2-core runner),
   not a leak.

   The decisive point is that **nothing in the test asserts elapsed time.** Its assertions are
   `control.cycles === 100`, `control.growthBytes > 8 MiB`, `patched.cycles === 100`, and
   `patched.cycles81To100Median <= cycles21To40Median + 16 MiB`. The 5 s was `bunfig.toml`'s
   global default truncating it, never part of the contract, so raising the per-test budget
   removes a red that would land on roughly one Phase 1 push in four while weakening nothing.
   The diff is one non-comment line — `});` → `}, 30_000);` — which is the evidence.

   Never raise `bunfig.toml`'s global 5 s, and never reduce the cycle count: the first keeps real
   hangs visible everywhere else, the second *is* the measurement.

3. **`coverage` → `error: graph_generation_workspace_missing:p4d2-trace-path`** at
   `graph-generation-repository-pg.ts:113` in `lockWorkspace`, failing
   `trace_path > outbound traversal follows alpha → beta → gamma`. Passed on re-run, no code
   change. This is the shared-test-database race already registered in `tasks.md` → *Open, and
   not PR-B's to close*: cross-package turbo concurrency against one database. Pre-existing, CI
   equally exposed, still no task, and nowhere near this diff.

**GitHub Advanced Security's job failure is not in this list.** Its failing step is literally
named `Processing Request (Linux)` on both the pre-fix and post-fix commits — GitHub's own
scanning infrastructure, and `github-advanced-security` is not in `main`'s required-checks list.
The `CodeQL` check is separate and is green.

## 12. What Phase 0 does **not** establish

- No `after` reading exists for anything here. Every table is a *before*.
- **GMS-04 AC-3 is scoped, and PR-B does not close it for `.ua/`.** Three tracked generated
  artifacts carry **320** `rlm-` occurrences that no rename reaches; regeneration is deferred to
  after PR-C by spec-owner decision. T20's verifier must be told this explicitly or it reads as
  a miss.
- No full-corpus needles baseline exists.
- Spec corrections C1–C9 are recorded in `design.md` §10 and are applied at T19, not here.
