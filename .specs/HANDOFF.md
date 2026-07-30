# Handoff

## Active — Core Layering and God-Module Split (PR-B), **T20 done — all 20 tasks complete, cleared to merge**

**Feature**: `core-layering-god-module-split` · branch
`refactor/search-facade-split-phase-1b`, cut from `main` @ `5247ecb` (v1.11.0),
worktree `../massa-ai-wt-facade-phase-1b`.
**T6a and T6 are merged and released; T7–T20 are committed and green. All 20 tasks are complete.**
Working tree clean. Nothing is pushed — the branch is local only, sixteen commits deep.

**T20 is done and PR-B is cleared to merge.** A fresh `verification-agent`, author ≠ verifier, took
every GMS-03 / GMS-04 / GMS-05 criterion **as amended by C1–C12** and re-derived rather than
inherited: all four structural sensors at both the frozen `d628464` base (through a temporary
worktree) and HEAD; `lint`, forced `type-check`, `build`, full `bun run test` **11/11**,
`test:scripts` **770/0 across 41**, `test:plugins` **94/0**; the live needles gate
(**hit@1 0.643 / MRR 0.745**, both floors PASS), `needles-diff` exit **1** with `N05` @5→@6 as
attributed, and `needles-rename-control` exit **0**; and per-file coverage recomputed from raw lcov
through the gate's own helpers, matching T18 byte for byte. **Every criterion PASS.** Full record in
`validation.md` Part II. **The merge must be `--no-ff` — a merge commit, not a squash (R-04).**

**Three things from T20 a resumer must not re-derive.**

1. **It was asked to argue C12 was a criterion relaxed to fit a result, and it rejected its own
   steelman on measured facts.** The strongest form of the objection is kept in `validation.md` §14
   because it is partly right: C10 and C11 rest on impossibilities that hold for *any* tree, while
   C12's holds for *the six-module decomposition this PR chose*. What defeats it is that collapsing
   those modules to keep fan-out flat would re-violate GMS-03 AC-1 and AC-2 and likely breach
   G-HUB's 700-LOC ceiling (two files already at 696 and 685), and that **G-HUB was calibrated
   before any Phase 1 code existed**, specifically against M14 — where fan-in/fan-out stayed flat
   while reach went 1 → 14. Fan-in/fan-out was *already known to be gameable by this exact kind of
   split* before PR-B began. **Endorsed, with the process finding kept rather than dissolved.**
2. **One genuinely new finding, correctly attributed: `bun run test:coverage` exited 1 in the
   verifier's environment, twice.** `embedded-api-client-endpoints.test.ts` → `POST
   web/fetch_and_index` at **20334 ms** against a 15000 ms budget, alongside a sibling parsing a
   5563-file corpus. **Not PR-B's** — that file has **zero diff** against base, re-confirmed, and the
   coverage *measurement* printed identically to T18 with all seven per-file figures reproducing.
   It is a **second instance** of the known concurrency class and a **different test** from the one
   `CLAUDE.md` documents (`routes without 404`, `:143`), so it is recorded separately rather than
   folded in.
3. **Two figures in T18's record were wrong, found while re-measuring T20's own claims.** `test(`
   55 → 56 names an identifier the file never uses (it declares with `it(`; that grep returns **0**),
   and `expect()` 98 → 101 should be **95 → 101**, a delta of +6. T20 flagged the second and
   mis-explained it as a comment-stripped count — comment-stripping lowers both sides and 101 matches
   raw exactly. **Seventh time a critic's mechanism held while its explanation did not.** Corrected
   in place; neither changes a verdict.

**T19 is done, and it found the nineteenth plan defect: GMS-03 AC-3 fails on the shipped tree.**
`design.md` §10's **C1–C12** are applied to `spec.md` in place, indexed there under *Design and
Execute corrections*. AC-3 required fan-in **and fan-out** both lower; measured with one method at
both commits against the **frozen** `d628464` baseline, fan-in falls 24 → 23 static and 26 → 25 with
dynamic, and **fan-out rises 19 → 21**. The cause is exact rather than statistical — the facade sheds
**4** `rlm-*` delegate imports and gains **6** capability-module imports, net +2 — so a decomposition
cannot satisfy the criterion and requiring fan-out to fall is requiring the split not to happen.
**Resolved as C12 on the C10/C11 precedent**: `maxForeignReach` **14 → 1** (exit 1 → 0) becomes the
criterion, alongside D1 `delegateScope` **21 → 0**, facade-taking **15 → 0**, scoped LOC
**1550 → 0** and fan-in; fan-out is **reported, not a floor**. Full record in `tasks.md` →
*Nineteenth plan defect* and *T19 — executed*.

**Three T19 results a resumer must not re-derive.**

1. **T19's own sensor was non-discriminating, and the replacement's controls found a defect in
   itself.** *"`design.md` §10 rows all struck"* reads the wrong artifact — measured at HEAD before
   the first edit, **8** old-text occurrences in `spec.md` survive a commit that strikes all twelve.
   The replacement is a per-correction pair (old absent **and** new present) plus a positional and a
   row-count check; run against the pre-T19 file it fails **every** correction, which is the
   discrimination the original could not give. Then the row-drop mutation printed `rows: 11 FAIL`
   and **exited 0** — `fail=1` inside `$( )` is a subshell assignment and is lost. *Silence as a
   failure mode, one level up, in the instrument rather than the subject.* Two further harness
   defects preceded it (an empty `-F` pattern matching all 449 lines; a phrase straddling a markdown
   wrap), both caught by the sensor failing on a subject that was verified correct first.
2. **A handoff figure did not survive re-measurement and was about to enter `spec.md`.** C12's D1
   numbers were drafted as `delegateScope 16 → 0` / facade-taking `11 → 0` from this file's own gate
   board. Those are **T10's mid-refactor readings**. The frozen `facade-matrix-before.json` at
   `d628464` gives **21 / 15 / 1550**. Both are consistent — T6a–T9 account for the difference — but
   only one is the baseline AC-3 names. **Twelfth figure in this feature that did not reproduce.**
   The frozen fixture is why it was caught.
3. **The CHANGELOG question had precedent after all, and the briefing said it did not.** `353de59`
   and `ba8d2bc` are both on this branch, both `docs(specs):`, both zero non-`.specs/` files and
   zero `CHANGELOG.md`. **T19 adds no thirteenth entry**; `[Unreleased]` stays at 12 bullets under
   `### Changed`, no new heading, and `STATE.md`'s open release-semantics item is untouched.

---

**T18 is done. The coverage gate is green on every file this work touches — and the row's own command
had to be fixed before it would terminate, which is the eighteenth plan defect.** `bun run
test:coverage < /dev/null` exits **0** at 315 measured / 0 below floor / 9 exclusions, and all seven
files (the row's six **plus `result-fusion.ts`**, which GMS-05 AC-2's *"this work"* reaches and the
row's *"this PR"* does not) are **present in the merged set** and above floor, minimum
`project-indexer.ts` at **94.57%**. Presence is the load-bearing half: the gate reports only
below-floor files, and a file no group reports never enters the merge, so *absence from the failure
list is not evidence of a pass*. Full readings under **Gates at T18** below — read those rather than
re-running a 2 m 15 s gate to re-derive them.

**A commit-trailer question was settled at T17, and the premise it was raised on did not reproduce.**
It was put as *"`d23bb43` carries a `Co-Authored-By` trailer; the other eleven commits do not"*, so
the choice looked like one amend. Measured across `5247ecb..HEAD` before acting on it: **8 of the 13
carry the trailer and 5 do not** — present on `3e46eae`, `29ea8b9`, `b9d444d`, `23470ce`, `353de59`,
`e4e38bd`, `b9781df`, `d23bb43`; absent from `2664008`, `484e61a`, `1090504`, `ba8d2bc` and T17's
own. There is no single amend that converges it. **Reviewer decision — leave it alone**: do not
amend, do not backfill. Rewriting eight commits would move shas this file, `STATE.md` and `tasks.md`
all cite, to fix something with no reader impact. *Eleventh figure in this feature that did not
reproduce when re-measured; the rule that catches these is to run the count before acting on it.*

**A second carry-forward retired at T17 for the same reason: it was already fixed.** Sessions since
T15 have carried *"`search-facade-admin.test.ts:24` still names `ensureInitializedImpl`, a symbol T10
deleted — decide explicitly if you touch that file"*. Measured at `d23bb43`:
`git grep -n ensureInitializedImpl -- packages/core/src/__tests__/search-facade-admin.test.ts`
returns **nothing**. T15 rewrote that file's header when it renamed the suite, and the stale symbol
went with it. **Stop carrying it.**

---

**T15 is done. GMS-04 AC-1 is closed by four `git mv` renames, and AC-3's criterion is replaced
rather than met** — it was unsatisfiable twice, which is the twelfth plan defect. The four suites are
now `search-facade-{admin,indexing,hybrid,synapse}.test.ts`; 17 citations were repointed; every stale
*description* was corrected while every *provenance* comment was kept, because those are the record.
AC-3's counter is replaced by `scripts/check-stale-pointers.ts`, whose header docblock is the
canonical rationale — **read it rather than re-deriving any of this.**

**Four T15 results a resumer must not re-derive. Two are plan defects, and one of those is in the
sensor written to fix the other.**

1. **Twelfth plan defect: AC-3's own correction was unsatisfiable too.** The 2026-07-29 narrowing to
   *zero `rlm-` hits outside `CHANGELOG.md` / `.specs/` / `.ua/`* cannot pass either: ~35 provenance
   pointers name deleted `rlm-*.ts` sources (six files carry nothing else), and
   `contextual-search-rlm-coverage.test.ts` carries `rlm-` in its own filename, which §6 keeps
   deliberately — excluding it moves the file count 29 → 29. **Eighth time a correction inherited the
   defect it was correcting; second time for this one criterion.** *Resolved (reviewer, 2026-07-30):
   stop measuring the population, measure the shape.* Over budget (45 m → ~2 h); accepted.
2. **Fourteenth plan defect: the replacement sensor under-enforced in two directions.** Found after
   its unit suite was already green, by a scoped plan critic, then re-measured. **(a)** `historical.length
   <= HISTORICAL_FLOOR` is a **ceiling under a name that says floor** — it catches a stale citation
   being added and is blind to a provenance comment being **deleted**. **(c)** the stem was the literal
   `rlm`, so the gate was blind to the **17 citations across 10 files T15's own rename minted** —
   green on exactly the failure its docblock claims to catch, for the names the task had just created.
   **Ninth correction to inherit the defect it was correcting.** *Resolved (reviewer, 2026-07-30):
   close (a) and (c), record (b).* **(b)** is that `POINTER` needs a file extension, so bare-word
   mentions — `` `rlm-admin` ``, a `describe("rlm-search — …")` title, an `rlm-*.test.ts` glob — are
   invisible. Those were all fixed by hand and **none of them is under a gate**; do not quote this
   sensor as though they were.
3. **Thirteenth plan defect, and it corrects how the rename was framed.** `HANDOFF.md:325`, `:561` and
   `tasks.md` all called renaming the four suites *"T15's own decision"*. **GMS-04 AC-1 already
   mandated it** — *"No source or test file under `packages/core/src` is named `rlm-*`"*. The plan
   relaxed an acceptance criterion its own spec had fixed, and a reader could have closed PR-B with
   `rlm-admin.test.ts` on disk believing AC-1 met. Only the **names** were the executor's call.
   (`contextual-search-rlm*.ts` is **not** an AC-1 violation — `rlm-*` means *starts with*.)
4. **The line-count constraint was wider than the plan stated, and nothing would have caught a
   breach.** The plan named the four renamed suites. Measured — **name the metric, all three are
   quotable and different**: **11 line-anchored citation tokens** on **10 matching lines** across
   **6 files**. Seven point into the renamed four; **four point into
   `contextual-search-rlm-coverage.test.ts`**, whose header T15 also rewrites and which the plan never
   flagged. Every edit in all five targets was an in-place single-line substitution;
   **162 / 647 / 520 / 389 / 936** lines before and after. A reflow would have silently invalidated
   those citations and **no gate would have seen it.** Same shape as T14's four-line subject
   undercount: a constraint enumerated over the files `git mv` touched missed the file that is edited
   but not moved.

**The discriminating evidence is M3b.** Three mutations were run on the real tree, each verified
*applied* before its reading was believed (backup rather than `git checkout`, since the tree was
dirty; diff-vs-pristine; refuse-on-byte-identical; restore diffed; final reading confirmed identical
to pristine): a citation reverted to its pre-rename name → HISTORICAL **29**, FAIL; a provenance
comment **deleted** → HISTORICAL **27**, FAIL (the shape `<=` passed); a typo in a `search-facade-*`
citation → BROKEN **1**, FAIL. **M3b judged that last tree by the pre-T15 `rlm`-only pattern and it
reported `PASS — 0 broken`.** That is the only reading proving the widening was not cosmetic. *A
sensor's alphabet is part of the sensor, alongside its label.*

**A fifth result, and it invalidated every number above until it was fixed: the gate was blind to
itself.** `check-stale-pointers.ts` enumerates `git ls-files`, so while its own two files were
untracked it could not scan them. Staging took it from **PASS `31/26/0`** to **FAIL `36/46/15`** — all
15 `BROKEN` being **fixture literals** in its own test file, which must use a real stem to exercise
`POINTER` at all. Resolved narrowly: the **test file** joins `EXCLUDED` (fixtures, not references);
the **script does not**, so its own two genuine citations of the deleted `rlm-search` count like
anyone else's, and the pin is **28**, not 26. Two more `BROKEN` then surfaced inside that new
exclusion's own docblock, which had spelled the fixture names out in full — the same trap one level
up, and it fired. **This is the Phase 0 lesson verbatim** (*verify a measurement script in the tracked
state it ships in*) and it has now cost this feature twice. **Any figure from this gate must be quoted
from a run taken after `git add`.**

**Three figure corrections folded in, each re-measured at `e4e38bd` rather than inherited.**
`.ua/` is **320 occurrences**; `git grep -c` says 315 because it counts matching **lines**
(`knowledge-graph.json` is 270 occurrences on 265 lines) — **do not "correct" the 320.** `tasks.md`'s
29-file breakdown said *"ten other test files, six `services/search`"*; it is **9 and 7**, and the two
errors cancelled, which is why the total still landed on 29. `tasks.md`'s T19 row scoped itself to
**C1–C7** while `design.md` §10 has held **C1–C9** since Design — and T15 adds **C10**.

---

**T14 is done and Phase 1 is closed. It moved no structural sensor at all, which is the T11 property
and this time was the entire point.** The ten stale `Visibility relaxed` notes are gone and the two
reasons that actually hold are in their place: §4.3's 21-public-method compatibility surface for the
nine methods, §4.3.1 plus a live production reader for the one field. One file, comments only,
**+23 / −24**, `maxFileLoc` **697 → 696**. **G-HUB's output is byte-identical to the pre-edit run
except that one number** — the sharpest statement of invariance available here. AC-3 budget **0**,
spent **0**, the third task with no test file in its diff.

**Four T14 results a resumer must not re-derive. The first is the eleventh plan defect and it is the
third consecutive defect in this one task row.**

1. **Eleventh plan defect: the private-revert is a *truth check*, not a discriminating sensor, and the
   T14 row said otherwise.** Measured on **both** states, same harness (10 markers verified applied,
   diff-vs-pristine 40 lines, refuse-on-byte-identical, restore diffed clean): `tsc` **exit 2, exactly
   1 `error TS` line, exactly 1 TS2341**, at `production-wiring.ts(51,32)` — **identical before and
   after**, because T14 edits only comments and the mutation edits only modifiers. By T7's vocabulary
   that is an invariance check. Citing it as discriminating would have let T14 report a sensor an empty
   commit also passes. **Resolved as a relabel plus one addition, not a scope change** — the set was
   always sufficient. **Truth check**: the private revert. **Discriminating pair**: `Visibility
   relaxed` 10 → 0 *and* the replacement comments present, neither half sufficient alone. **The pair
   needed a positional check**, on a plan-critic finding: asserting only that both `§4.3` and `§4.3.1`
   appear somewhere is passed by a replacement that **swaps them**, which is the "the ten sites are not
   one group" violation. Closed structurally — each citation sits adjacent to the group it justifies,
   so the field block at `:114` holds §4.3.1 and the nine-method block at `:456` holds §4.3 and **not**
   §4.3.1, and a swap is no longer expressible without moving a comment past 340 lines of class body.
   *Generalises, completing the ninth-and-tenth sentence: the ninth read an axis its task did not move,
   the tenth a population its task could not clear, the eleventh an axis its task moves nothing on. A
   sensor's label is part of the sensor.*
2. **The recorded subject was four lines short, and the grep is why.** *"11 lines: the 10 comments plus
   `:88`"* misses `:95-98`, which said the notes *"below are historical … Removing them is T14's …
   leaving them here is deliberate"* — false the moment T14 removes them, and **containing no
   `rlm-search` substring**, so the 13-line sweep that produced the enumeration could not see it. Short
   by two more on the other side: `:86-88` is one sentence. **Reviewer decision (2026-07-30): rewrite
   `:86-99`, preserving `:92-94`'s provenance** — *"do not touch `:93`"* read as preserve-the-record,
   not literal-line immutability. The authority to widen at all is **T10's own rule** about correcting
   stale comments in a source file already in the write set. Final subject **24 lines**. `:184` (now
   `:185`) untouched, and `rlm-search` in the root goes **13 → 4**: `:91`/`:108`/`:446` provenance plus
   `:185` PATCHABLE.
3. **The replacement follows two precedents already in this file that the plan never cited.** T12
   rewrote the `fileFilterCache` note at `:102-105` and T6 the `RRF_K` note at `:115-118` into the same
   shape — past tense, who removed the reader, where it went, why the member stays public, with
   evidence sites. T14 is the third application, not a new pattern. **A plan critic reported the
   `RRF_K` note as dead-reference staleness in T14's scope; it is not** — past tense, names
   `result-fusion.ts` as the current home, and `RRF_K` really is at `result-fusion.ts:19`. Left alone.
   Ninth two-methods-two-answers here, and the **third figure this agent has got wrong**: keep its
   findings, re-run its numbers.
4. **A CHANGELOG anchor reported a miss and the miss was the anchor's.** Verifying eight entries by
   substring, `"injection seam"` returned 0 in `[Unreleased]` — T11's bullet is worded *"can now be
   supplied from outside the search service"*. The entry was there all along. Same failure mode as the
   rest of this feature, pointing the other way: a mechanical check with a wrong *pattern* reports a
   fact about itself as a fact about the subject. Settled by listing all eight bullet first-lines.

---

**T13 is done, and G-HUB is green — the split is proven.** `rlm-search.ts` → `hybrid-search.ts`: the
fifth capability module, the **fourth and last** `rlm-*.ts` source to die whole, and the highest-arity
function in the matrix (`searchImpl`, 455 LOC, 13 members) moved with it. **Every structural
prediction held**: `ContextualSearchRLM` foreign **2 → 1**, reach **14 → 1** (`search-warmup.ts`),
members **23 → 18**, `perModule {csr 18, warmup 1}`, **zero** types above the ceiling, **G-HUB exit
1 → 0**. D1 went terminal on the same commit: `delegateScope` **5 → 0**, facade-taking **2 → 0**,
scoped LOC **524 → 0**.

**Five T13 results a resumer must not re-derive. The first is the ninth plan defect and it is the one
that changes T14.**

1. **Ninth plan defect: T14's sensor fires at T13, and it is the fifth correction in this feature to
   inherit the defect it was correcting.** `tasks.md`'s *T6's sensor was unfirable* section closed
   with *"reach cannot fall until T13 rewrites `rlm-search.ts`, and **G-HUB cannot go green until
   T14**"*. First clause right; second false, **because** the first is right — reach falling *is* the
   gate, and nothing else in the directory was above the ceiling. Measured before the first edit, on
   a scratch copy with `rlm-search.ts` removed and nothing else changed: **exit 0**, foreign 1, reach
   **1**, zero types over. Taken literally T14 would have read a gate already green before it
   started. **Reviewer decision at this boundary (2026-07-30): re-scope T14's sensor, keep the
   order.** T13 owns the G-HUB close and records it. T14 keeps its slot, narrows to the root's final
   cleanup, and its **discriminating** sensor becomes `git grep -c 'Visibility relaxed' --
   packages/core/src` **10 → 0** plus `git grep -l 'rlm-search' -- packages/core/src` going empty;
   **G-HUB exit 0 is demoted to an invariance check** (T7's vocabulary). Absorbing T14 into T13 and
   leaving a re-export husk were both put and both rejected — reasons in `tasks.md`.
   **Consequence T14 must know: T13 deliberately left the 10 `Visibility relaxed` comments in place**,
   against T10's "correct stale comments in files in your write set" rule, because removing them
   would take T14's new sensor with them. The root says so in a comment; it is not an oversight.
2. **The tenth finding, and it would have shipped a broken T13: a deps record snapshots by value, so
   `ensureInitialized` cannot live in it.** The first implementation put it in `HybridSearchDeps` as a
   ninth key, called *inside* the module — reasoning that `searchImpl` wraps an init failure in
   `searchBackendUnavailable("search_initialization", …)`, so T10's and T12's **bare** hoist would
   drop the wrap. That much is true. What it missed is **evaluation order**: `#hybridSearchDeps()` is
   evaluated as an argument *before* `search` runs and reads its five stores as plain values, so on an
   uninitialised facade all five are `undefined` and the module's later init populates the fields, not
   the record. `tsc` **0**; `rlm-search` **15/16**, `search-dependency-outage` **4/5**,
   `search-filter-overfetch` **1/9**. Resolution: hoist init to the root **carrying its `try/catch`**
   — wrap and failure record both survive, ordering correct, record back to **8** keys. **Surfaced by
   the read-only plan critic, then confirmed by measurement** (its third earned keep: T11's third
   violation shape, T12's superseded sensor, this). What generalises: *"assemble per call from current
   fields"* has an implicit precondition — the fields must be current **at assembly time**. Six tasks
   satisfied it by accident of hoisting.
3. **`HybridSearchDeps` is 8 keys, not the 5 §4.1 implies — and the T13 row's "widen test 3 from one
   key to five" is wrong by three and incomplete.** Dispositions were measured, not read: 5 store
   fields, **3 per-call arrow wrappers** (`buildGraphStream` and `addContextToResults` are each
   stubbed on the instance at **6** sites; `applySynapseState` has 0 but keeps the root the single
   `SessionBiasDeps` assembly point), 3 module-local calls, 1 direct import, and `ensureInitialized`
   hoisted. Test 1 also could not survive unchanged — its `toEqual` compares fresh closures — and a
   **test 4** was needed that the row never named. Full table in `tasks.md`.
4. **The eighth defect's one open site fires, and the gate still does not move.** T12 left
   `queryUnderstanding` as the last place both seventh-defect conditions might hold. They do: the
   binding is captured *and* dereferenced. Two-variant simulation, substitution verified
   non-identical first — bare nominal takes `QueryUnderstandingService` to foreign 0 → 1, reach
   0 → **1**; `Pick<…,"understand">` leaves it 0/0. **1 ≤ the ceiling of 3**, so no second violation:
   the `fileFilterCache` outcome, not the `IndexManager` one. The `Pick<>` is **honest typing per
   §4.4, not a sensor that fired**. Three tasks have asked; only T10's `IndexManager` at reach 4 ever
   moved the gate.
5. **AC-3's budget was 4, not 3, and two `mock.module` blocks collided.** T12's enumeration of
   `:647`/`:655`/`:844` was correct and all three were spent — but its sweep looked for the *facade
   first argument*, and a fourth site tracks the *record's shape* instead: `correctQuery`'s forwarding
   assertion lost its facade argument back at T9. Measured, not predicted — the file ran **40/1**.
   Ledger total **18 → 19**. Separately, the T9 `hybrid-search.js` block and the re-pointed
   `rlm-search.js` block would both have named `hybrid-search.js`; **two registrations on one
   specifier do not compose**, the later replaces the module wholesale, so they are **merged** and the
   `mock.module` count goes **16 → 15** — the first time it has moved down.

**`MAX_FILE_LOC` fired twice during T13 and both files now sit near the ceiling.** The root hit
**701** on first application and **711** after the init hoist; `hybrid-search.ts` hit **781**. As
committed: root **697**, `hybrid-search.ts` **686**, against 700 — **3 and 14 lines of headroom**.
Neither was fixed by touching the gate; the prose that would not fit moved into `tasks.md`, and the
source keeps the invariant plus a pointer. T14 only *removes* lines from the root, so it is safe;
PR-C is not. Two unspent options are recorded in `tasks.md` rather than taken (~10 lines from using
the exported `SearchOptions` in the root's `search()`, ~6 from the duplicated `correctQuery` doc).

**T13's mutation table — six shapes, every one verified applied before its reading was believed**
(diff vs pristine, marker grep, refuse-on-byte-identical, restore diffed; tree confirmed identical to
pristine afterwards):

| shape | `tsc` | `hybrid-search-late-bind` | `rlm-search` | coverage | charact. | dep-outage | filter-overfetch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| memo on first call | 0 | **2/2** | 31/0 blind | 41/0 blind | 21/0 blind | 9/0 blind | 10/0 blind |
| construction capture | 0 | **2/2** | **15/16** | **38/3** | **19/2** | **4/5** | **1/9** |
| ninth-key leak | **2** TS2353 | **3/1** | 31/0 | **38/3** | 21/0 | 9/0 | 10/0 |
| `.bind(this)` at assembly | 0 | **3/1** | 31/0 blind | 41/0 blind | 21/0 blind | 9/0 blind | 10/0 blind |
| `addContextToResults` module-local | 0 | 4/0 blind | **30/1** | 41/0 blind | 21/0 | 9/0 blind | 10/0 blind |
| naive recursion | **2** TS2554 | — | — | — | — | — | — |
| blind recursion | 0 | — | **hang**, killed at 75 s | — | — | — | — |

Four readings to keep. **The memo is blind for the fourth consecutive task**, now at the widest
surface — the assignment-site inference is refuted at the richest (T10), a sparse (T12) and the
widest (T13). **The assembly-time bind is invisible to the entire pre-existing suite** — all twelve
stub sites assign *before* they call and the record is per-call, so a bind at assembly still captures
the stub; test 4 is the only thing in the repo that sees it, and it was **not in the T13 row**.
**The module-local call is *not* fully blind, unlike T12's `search` seam**: `rlm-search.test.ts:184`
stubs `addContextToResults` to *throw*, so 1 of 6 sites fires (**30/1**) — one discriminating site out
of six is not coverage. **The recursion pair behaved exactly as T12 predicted and T13 spent no time
hunting a subject**: naive caught statically, blind **hangs** (the root's `search()` now has a
preceding `await` — T10's microtask case). *A hang is not blindness.*

---

**T12 — `rlm-admin.ts` → `index-admin.ts`, the fourth capability module, and the third
`rlm-*.ts` source to die whole.** Four surfaces (`clearProjectIndex`, `getProjectStats`,
`warmupCache`, `getAnalytics`) now take `IndexAdminDeps` instead of the facade. **Every structural
prediction held to the number**: foreign modules **3 → 2**, reach **14** by `rlm-search.ts` unchanged,
members **23** unchanged, `perModule` csr **14 → 15** (gains `search`), D1 `delegateScope` **9 → 5**,
facade-taking **6 → 2**, scoped LOC **626 → 524**. AC-3 budget **0** and **0** spent — the second task
after T11 whose diff contains no existing test file, and unlike T11 this one moves four signatures, so
the zero was checked rather than assumed.

**Four T12 results a resumer must not re-derive — the first is the eighth plan defect and the second
is a trap no task row names.**

1. **Eighth plan defect: the seventh defect's T12 sites do not fire, and one of them cannot be
   narrowed at all.** The T12 row and this file both said the two nominal fields "**will** fire"
   because they are required rather than optional. **False, on three measured grounds.** The analytics
   field cannot fire: `SearchAnalytics` is an alias re-export (`search-analytics.ts` is one
   `export … from` line, which `stripNonCode` deletes), so it is **never declared** and never appears
   in the metric's output at all; `SearchAnalyticsPg` only ever occurs after `| `, never in `<name>:`
   position; and `getAnalytics` returns `deps.analytics` **whole**, never dereferencing it. It also
   **must not** be `Pick<>`-narrowed — that breaks `type-check`, because the value is returned through
   the root's public `getAnalytics(): SearchAnalytics | SearchAnalyticsPg`, a 24-importer surface. So
   the row's instruction was not merely unnecessary, it was *unexecutable*. `fileFilterCache` **does**
   trip the mechanism — un-narrowed it goes foreign 0 → 1, reach 0 → **1** — but **1 ≤ the ceiling of
   3**, so it yields **no second violation**, unlike T10's `IndexManager` at reach 4. The `Pick<>` is
   kept as honest typing per §4.4, **not** as a sensor that fired. Both variants measured by scratch
   simulation, substitution verified non-identical first. **T13's `queryUnderstanding` is the one site
   left where both conditions may genuinely hold — run the two-variant simulation, do not inherit
   T12's answer.**
2. **`MAX_FILE_LOC` is 700, `contextual-search-rlm.ts` is now 675, and no task row mentions this
   axis.** G-HUB gates on two things and Phase 1 has only ever been read on one. The root took the
   largest-file title at T10 (641); T12 as first written pushed it to **685**, and trimming prose into
   `index-admin.ts` brought it to **675** — **25 lines of headroom**. T13 grows the root again
   (`#hybridSearchDeps()` 1 field → 5, four more hoisted `await`s). Crossing 700 fails G-HUB on an
   axis unrelated to hub coupling and makes T14 unclosable for a reason nothing names. Carried as a
   **sensor** on the T13 row. **Say which metric**: every LOC figure here and in `tasks.md` is the
   metric's own `split("\n").length`, which is `wc -l` **+1** on a file ending in a newline (675 vs
   674). The gate reads the former, so quote the former — and the 641/592 figures in the T10/T11
   records are on that same axis.
3. **The blind-recursion mutation has no observable subject on T12's surface, and T10's rule needed
   one more condition.** T10 said: run it on a delegate with **no preceding `await`**. `getAnalytics`
   is exactly that — and it **hangs anyway**: `tsc` **0**, then >60 s at ~98 % CPU with no throw, both
   inside `bun test` *and* in a bare script with a `try/catch`, which rules out the runner's error
   formatting. The assign-then-return form behaves identically. The missing condition is that the
   delegate be **`async`** (an async frame cannot be elided — why T9's and T10's overflowed at once and
   read cleanly). T12's four are three async-with-preceding-`await` and one sync, so none qualifies.
   **A hang is not blindness** — no such run can report green — and the positive runtime evidence is
   the new sensor's `toHaveBeenCalledTimes(2)` on the module spy. The naive half is caught statically:
   **TS2554: Expected 0 arguments, but got 1**. *A JavaScriptCore tail-call explanation was tested and
   **not confirmed**; it is recorded as unverified.* **T13 must not budget time hunting a subject.**
4. **`git grep -E` cannot express the PATCHABLE sweep and fails silently.** POSIX ERE has no `\s`, so
   `git grep -E '\.search\s*='` returns **zero matches and exit 1**, which reads exactly like "no stub
   sites". `-P` returns **7**: `rlm-admin.test.ts:124,137,148` and
   `contextual-search-rlm-coverage.test.ts:382,395,407,416`, all bare assignments with no `as any`
   cast — a **7-site extension** to PATCHABLE's measured footprint, and all 7 exercised through
   `warmupCache`. They are also the *only* 7 calls to `warmupCache` in the suite, and every one
   assigns *before* it calls, so a bare `search: this.search` or a `.bind(this)` at assembly time is
   invisible to the entire pre-existing suite. That is why `IndexAdminDeps.search` is a per-call arrow
   wrapper and why the new sensor's test 4 exists. **Name the flag, not just the tool** — seventh
   two-methods-two-answers in this feature.

**T11 — the F4 `IndexManager` seam, the only *added* seam in PR-B.**
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
   ~~**T12 and T13 will each hit this**~~ — **measured at T12 and that prediction is the eighth plan
   defect: neither of T12's two fields fires.** See result 1 at the top of this section. **`T13`'s
   `queryUnderstanding: QueryUnderstandingService` is the one site left where both conditions may
   hold**, because §2.1 shows it *dereferenced*; measure both variants there rather than inheriting
   either answer. **The sensor stays on both tasks' lists regardless**: the hub metric must report
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

> **Both T11-boundary reviewer decisions are discharged.** T12 ran in a fresh session as directed, and
> the stale Status line at `tasks.md:10-12` — *"Phase 0 (T0–T5) COMPLETE … T6 not started"*, false since
> T7 — is corrected inside T12's own commit rather than as a separate docs commit or left to T19. It now
> names T6a–T12 as executed and points at *Phase 1 — executed* for per-task state.
>
> **The one T12 decision left open is now due — it is the T13/T14 boundary.** The eighth plan defect
> was resolved by the executor **inside T12's own write set**, on T10's precedent for the seventh: the
> analytics field is left un-narrowed against the row's instruction, because narrowing it is
> unexecutable, and `tasks.md`'s T12 and T13 rows plus this file were corrected in the same commit.
> Nothing about scope, the gate or the task order changed. **T13 supplies the evidence that was
> missing when it was raised**: the same question was asked a third time at `queryUnderstanding`, the
> mechanism *did* fire there, and the gate still did not move (reach 1, ceiling 3). So the pattern
> across all three sites is consistent — narrow for honesty, and never quote the narrowing as a fired
> sensor. ~~**Ratify or reverse now.**~~ **Ratified at the T13/T14 boundary (2026-07-30).** No task
> re-raises it.
>
> ~~**A second decision is open at this boundary and it is new: the ninth plan defect's resolution.**~~
> **Also discharged at that boundary.** T14's sensor was re-scoped on a reviewer answer taken during
> T13; the re-scope stands, and T14 executed against it. What the reviewer settled at the same time,
> because T14's own measurement raised it: the eleventh defect is **an in-task correction, not a stop**
> (the mutation-label relabel and the four-line subject undercount are both wording and scope, resolved
> on the T10/T12 precedent of correcting the row inside the task's own commit — see T14 result 1 and 2
> above); the subject **widens to `:86-99`** with `:92-94`'s provenance preserved; and the replacement
> is **per-group, at each group's site**, which is what makes the citation-swap shape unexpressible.
> **No reviewer decision is open at the T14/T15 boundary.**

**T16 is done, and the risky half of it never happened.** `build` was **already** in `main`'s
`required_status_checks` — measured live, ruleset `19462721`, *Main - Restrictions* — so **no ruleset
mutation was performed** and the PUT-not-PATCH and DeployKey-bypass traps never came into play. Half of
SEN-02 AC-5 was satisfied before the task began; it is now recorded as measured rather than assumed.

Two things about T16 a reader will otherwise misread:

- **Its scope was deliberately widened past its row.** The row says G-HUB alone. `check-stale-pointers`
  was wired too, on a reviewer decision. Its pin of **28** is now a gate PR-C must maintain across a
  directory it moves again. The other two sensors — `check-frozen-anchors` and `check-characterization`
  — needed nothing: their unit suites already run the real script against the real tree inside
  `test:scripts`, which `build` runs. The briefing's "three other sensors are equally absent" was wrong;
  **one** was.
- **Its sensor was substituted, and the substitution is not the same evidence.** *"Flip a threshold in a
  scratch branch → CI goes red"* is unexecutable here: `ci.yml` triggers only on push-to-`main` and
  PR-into-`main`, so a scratch branch produces no run. That is the **fifteenth** plan defect. The
  three-part local equivalent used instead is recorded in `tasks.md` → *T16 — executed*. **No red CI run
  was observed.**

**The sixteenth plan defect came out of that widening and is the one to carry forward**: `actions/checkout@v4`
defaulted to `fetch-depth: 1`, and `check-stale-pointers` reads `git log --all` to tell a historical
reference from a broken one. At the same commit, depth 1 reports `28 broken, 0 historical` and full
history reports `0 broken, historical exactly at its pin of 28` — the categories invert, and the gate
would have been red on every clean run. Fixed with `fetch-depth: 0` on the `build` checkout. **The first
defect in this feature created during execution rather than inherited from the plan.**

**T17 is done, and its sensor did not hold — the seventeenth plan defect.** The row asks for
`needles-diff.ts` exit 0. It exits **1**: `N05-centrality-rerank-bonus` goes rank **5 → 6** while both
floors pass and MRR *rises* (0.7357 → **0.7452**). Attributed rather than accepted or dismissed, and
the attribution is the deliverable.

**The mechanism, measured.** `smart-chunker.ts:62-70` writes `// File: <path>` into every chunk before
it is embedded, plus a `// Section: <label>` line whose label is the enclosing symbol and which is
**repeated three more times** on any chunk of at least `REPEAT_MIN_LINES`. Rank is a function of the
cosine score over that text, so renaming a file — or renaming a function inside it — perturbs every
score in it. N05's own top score is **byte-identical** across the two runs (0.6712 → 0.6712); a rival
chunk overtook it across a **0.0134** margin. The 2x2: old path + old body **+0.0134** → @5; new + new
**−0.0030** → @6; old path + new body **+0.0044** → @5; new path + old body **+0.0068** → @5.
**Neither change flips it alone and reverting either restores rank 5.** The body delta is three
de-facading lines, which also rename the symbols the label derives from (`fuseResultsImpl` →
`fuseResults`, `searchImpl` → `search`). Both conjuncts are naming; **no retrieval logic moved a
rank.**

**Three things a resumer must not re-derive.**

1. **The first framing was wrong and a scoped plan critic caught it — its fourth earned keep.** The
   claim was *"attributable to the filename and to nothing else"*; it is a **conjunction**, and the
   2x2 already in hand said so. Its mechanism held, its figures were re-run rather than inherited, and
   re-measuring found the label repeats **three** times beyond the `// Section:` line, which the critic
   had not counted. **Keep a critic's finding, re-run its number** — that rule has now paid at T13,
   T15, T16 and T17.
2. **The confound was checked and there is none.** The baseline is at `ce26f28`, the branch base is
   `5247ecb`, so the window is wider than T7–T16. Over the eight corpus files `git log ce26f28..HEAD`
   returns exactly three commits — `fb8a3ed` (#46, PR-B's own T6a/T6), `2664008` (T9), `1090504` (T13).
   **Every commit in the window is PR-B's.**
3. **The pin trap fired on T17's own file, its third appearance in this feature.** The new script
   derives predecessor names from the baseline report specifically so none is hardcoded — and then its
   docblock spelled both out in full. Staging took `check-stale-pointers` from **PASS at 28** to
   **FAIL — 0 broken, 30 historical**, both hits on one line. Fixed in the subject: the names are
   written without their `.ts`, with the measurement in the comment, exactly as T15 resolved the same
   trap one level up. Its test file uses neutral fixtures (`alpha`, `beta`) for the same reason.

**Next action: merge PR-B.** All 20 tasks are complete and T20 cleared it. The branch is local and
unpushed, sixteen commits deep.

```bash
git push -u origin refactor/search-facade-split-phase-1b
gh pr create --base main --title 'refactor(core): PR-B — split the search facade into capability modules'
# then, and this is the load-bearing part:
gh pr merge --merge          # --merge = merge commit. NEVER --squash (R-04).
```

**Two things to carry into the merge.** CI has **never run on this branch**, so the authoritative
gate reading arrives at PR time; and the `mcp-client` coverage flake in T20's finding 1 may
reproduce there — if it does it is **not** a reason to block, but it deserves its own note, since it
is a second instance of a class `CLAUDE.md` documents for a different test. **Never write the skip-ci
marker literally in the PR body** — a squash folds every commit body into the merge message, and that
is what killed v1.3.0; PR #29 skipped CI merely by *explaining* the marker in prose.

**The briefing list T20 was given, kept because PR-C inherits most of it.** Each of these reads as a
violation if a reader does not know it:

1. **`.ua/` is out of scope for GMS-04 AC-3.** 320 occurrences across three tracked generated
   artifacts; regeneration deferred to after PR-C. **PR-B does not close AC-3 for them.**
2. **AC-3 as written is replaced, not met** — see `design.md` §10 C10 and the twelfth defect. The
   criterion to check is `scripts/check-stale-pointers.ts` exiting 0.
3. **19 authorised signature-tracking test edits**, enumerated per task in `tasks.md`'s ledger. A PR
   claiming "no test weakened" that contains 19 changed assertions is not a contradiction.
4. **T15's test-file footprint is 11 files** — four AC-1 renames plus seven modified — against the
   plan's *"the only test-file edits outside the 4 rename sites"*. Its AC-3 budget is nonetheless **0**
   and 0 spent, because AC-3 bounds *signature-tracking* edits and T15 moves no signature. Every
   `test(` / `expect(` / `skip` count is identical before and after in all eleven; the ledger row
   carries the numbers.
5. **What this repo's sensors do NOT cover**, stated so a green board is not over-read: bare-word
   `rlm-` mentions are outside `check-stale-pointers.ts` by design (fourteenth defect, part b), and the
   frozen baselines must not be regenerated — `capture-facade-baseline.ts` refuses off the base
   subject, and `--force` moves T17/T20's referent instead of failing.
6. **The needles corpus is bounded** — the 8 files the 14 needles resolve into, not the full index.
   T4 and T17 both use it; a full-corpus baseline still does not exist. **Do not quote a
   bounded-corpus number as a full-corpus one.**
7. **T16 is wider than its row and its sensor was substituted**, both deliberate and both on the
   record. It gates `check-stale-pointers` as well as G-HUB, which the row does not ask for, and it
   modifies `actions/checkout` — a step no task row mentions — because the widened gate is unusable at
   the default fetch depth (sixteenth defect). **No red CI run was ever observed**; the evidence is the
   three-part local equivalent in `tasks.md` → *T16 — executed*. A verifier looking for "CI went red"
   will not find it, and should not read its absence as an unmet criterion without reading the
   fifteenth defect first.
8. **T17's sensor was substituted too, and `needles-diff.ts` exits 1 on this tree by design.** A
   verifier running the T17 row's command gets a non-zero exit and one needle at rank 6 against a
   baseline of 5. **That is expected and attributed**, not an open regression: renaming a corpus file
   changes the text the chunker embeds, and rank rides on it. The criterion to check is
   `scripts/needles-rename-control.ts` exiting **0** — all 14 needles at baseline with the file path
   held constant — together with both floors passing. See the seventeenth plan defect and
   `design.md` §10 **C11**, which is what stops GMS-05 AC-4 note 2 being read as written. The new
   script is **not** in CI and cannot be: it needs a local Ollama and an 8B model, the same reason
   `needles-gate.yml` is `workflow_dispatch`-only. Its 17 unit tests *do* run in `test:scripts`.

9. **PR-B writes one file outside `packages/core` and `scripts/`, and it is a test in a package no
   task row names.** `apps/web-ui/src/__tests__/app-renderers.test.ts` — the eighteenth defect's fix,
   on an explicit reviewer decision. It is **not** an AC-3 charge: AC-3 bounds *signature-tracking*
   edits and this file tracks no signature, weakens nothing, skips nothing, deletes nothing. Test
   count **55 → 56**, `expect(` **95 → 101**, and the **19-edit AC-3 budget is unmoved**. *(Both
   corrected at T20 — this said "`test(` 55 → 56, `expect()` 98 → 101". The file uses **`it(`**, not
   `test(`, so that grep returns 0; and the `expect(` before-value is 95, a delta of +6.)* A verifier
   diffing PR-B's write set against the task rows will find this file unaccounted for; it is
   accounted for here and in `tasks.md` → *T18 — executed*.
10. **`bun run test:coverage` must be run with `< /dev/null`, and `bun run test` needs three env
   vars.** Without the redirect the coverage gate hangs forever inside `apps/web-ui` — the
   eighteenth defect; the failure mode is silence, not a red test, and a verifier will read it as a
   slow run. Without `DATABASE_URL`, `MASSA_AI_EXECUTOR_SANDBOX=none` and a scratch
   `XDG_CONFIG_HOME`, `bun run test` fails on the harness rather than on the tree — that is a
   pre-existing documented condition (`CLAUDE.md`, *Running tests*), not a PR-B regression.
11. **There are two AC-3s, both replaced, and the second one was replaced during T19 itself.**
    Item 2 above is **GMS-04** AC-3 (the `rlm-` population), replaced by `check-stale-pointers.ts`.
    **GMS-03** AC-3 is the other, and it required fan-in *and fan-out* both lower — which the shipped
    tree **fails**: fan-out **19 → 21**. That is the nineteenth plan defect, resolved as **C12**, and
    the criterion to check is now `maxForeignReach` on `ContextualSearchRLM` going **14 → 1** with
    G-HUB exit **1 → 0**, together with D1 `delegateScope` **21 → 0**, facade-taking **15 → 0**,
    scoped LOC **1550 → 0** and fan-in **24 → 23** / **26 → 25**. **Fan-out is reported, not a
    floor** — a verifier running D3 will see 21 against a baseline of 19 and must not read it as a
    regression. The cause is arithmetic: −4 `rlm-*` delegate imports, +6 capability-module imports.
    **Use the frozen baselines** — `facade-matrix-before.json` and `facade-metrics-before.json`, both
    captured at `d628464` — and not `HANDOFF.md`'s gate boards, which carry *mid-refactor* readings
    (D1 16/11 at T10, not the base's 21/15). T19 nearly shipped the wrong pair from exactly there.

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
| T11 | `23470ce` | `injectedDeps.indexManager` — the F4 seam (the only *added* seam in PR-B); `index-manager-seam.test.ts`, red under three violation shapes |
| T12 | `484e61a` | four admin surfaces → `index-admin.ts` with `IndexAdminDeps`; **`rlm-admin.ts` deleted whole**; `index-admin-late-bind.test.ts`, red under five mutation shapes; the eighth plan defect |
| T13 | `1090504` | five search surfaces → `hybrid-search.ts` with an 8-key `HybridSearchDeps`; **`rlm-search.ts` deleted whole** — the last delegate; `hybrid-search-late-bind.test.ts` widened to 4 tests, red under six shapes; **G-HUB exit 1 → 0**; the ninth plan defect |
| — | `ba8d2bc` | plan amendment: T14's sensor corrected — the tenth plan defect |
| T14 | `e4e38bd` | the root's final cleanup — ten stale `Visibility relaxed` notes replaced per group (§4.3 for the nine methods, §4.3.1 for the one field), the T13 hand-off block retired; **Phase 1 closes**; the eleventh plan defect |
| T15 | `b9781df` | GMS-04 **AC-1 closed** by four `git mv` renames to `search-facade-{admin,indexing,hybrid,synapse}.test.ts`, 17 citations repointed, every stale description corrected; **AC-3's criterion replaced** by `scripts/check-stale-pointers.ts` + its 21-test suite; `design.md` §10 gains **C10**; **Phase 2 opens**; the twelfth, thirteenth and fourteenth plan defects |
| T16 | `d23bb43` | **G-HUB and `check-stale-pointers` wired into the `build` job** — scope widened past the row on a reviewer decision, since the other two sensors were already enforced through their own suites; `fetch-depth: 0` on that job's checkout; `build` confirmed **already** in `main`'s required checks, so **no ruleset mutation**; the fifteenth and sixteenth plan defects |
| T17 | `0179566` | needles after-run at the shipped tree (**both floors PASS**, hit@1 0.643, MRR 0.745), the per-needle diff (**exit 1**, `N05` 5 → 6) and its attribution to naming rather than retrieval; **sensor substituted** by `scripts/needles-rename-control.ts` + 17 tests, exit **0** with all 14 needles at baseline; `design.md` §10 gains **C11**; the seventeenth plan defect |
| T18 | `510a410` | DEBT-02 coverage gate at the shipped tree — **exit 0**, 315 measured / 0 below / 9 exclusions, all **7** files this *work* touches present in `merged` and above floor (min `project-indexer.ts` **94.57%**); scope widened from the row's 6 to GMS-05 AC-2's 7, closing AC-2 without a spec correction; **the eighteenth plan defect** — the row's own command never terminates under an inherited live stdin — fixed in the command (`< /dev/null`) *and* in its subject (`fakeDialogs()` in `app-renderers.test.ts`, red first under `fakeDialogs(null)`), which is PR-B's only write outside `packages/core`/`scripts` |
| T19 | `b4f21a9` | `design.md` §10 applied to `spec.md` — **C1–C12**, in place, indexed there under *Design and Execute corrections*; §10's rows **kept and marked applied**, not struck, so the rationale survives the summaries that point at it. **`design.md` §10 gains C12 — the nineteenth plan defect**: GMS-03 AC-3's *"fan-in **and fan-out** both lower"* **fails on the shipped tree** (fan-out 19 → 21, exact cause −4 `rlm-*` delegates +6 capability modules) and is replaced by `maxForeignReach` **14 → 1** plus D1 and fan-in, with fan-out demoted to reported context. **T19's own sensor was non-discriminating and was substituted** — *"§10 rows all struck"* reads the wrong artifact and is passed by a commit that leaves `spec.md` untouched (measured: 8 old-text occurrences survive it); replaced by a per-correction discriminating pair with three mutation controls, one of which found a subshell defect in the sensor itself. **No CHANGELOG entry** — specs-only, on the `353de59`/`ba8d2bc` precedent |
| T20 | this commit | **independent validation — every GMS-03/04/05 criterion PASS as amended by C1–C12**, re-derived from raw data by a fresh verifier at `b4f21a9`, author ≠ verifier; `validation.md` gains **Part II** (§13–§17). C12 survived an adversarial pass that was told to argue it was a criterion relaxed to fit a result. One new finding — a **second instance** of the known `mcp-client` concurrency flake, in a file with zero diff, taking `test:coverage`'s *wrapper* to exit 1 while the measurement itself reproduced exactly. **Two wrong figures in T18's record corrected** (`it(` not `test(`; `expect(` 95 not 98). **PR-B cleared to merge — `--no-ff`, R-04** |

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

Gates at T12: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass / 0 fail
across 39 files**, exit 0 · `check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0
(3/3) · characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite individually
unchanged · `search-synapse-integration` **5/0** · `session-bias` **10/0** · `session-bias-late-bind`
**3/0** · `hybrid-search-late-bind` **3/0** · `project-indexer-late-bind` **4/0** ·
`index-manager-seam` **3/0** · `search-ranking-regression` **2/0** · new `index-admin-late-bind`
**4/0** · G-HUB exit 1, 25 files, foreign **3 → 2**, reach **14** by `rlm-search.ts`, members **23**,
`perModule {csr 15, search 14, warmup 1}`, **exactly one type above the ceiling** (the T10
seventh-defect check, run and passed; `FileFilterCache` foreign 0 → 0, reach 0 → 0), **`maxFileLoc`
641 → 675 against a 700 ceiling** · D1 `delegateScope` **9 → 5**, facade-taking **6 → 2**, scoped LOC
**626 → 524** · EXCLUSIONS **9** · T15's `rlm-` count **29 → 30** with the new files staged · CHANGELOG
released section still **974 lines and byte-identical to `353de59`**, T12's entry in `[Unreleased]`
under `### Changed` and absent from the released section, plus all five prior entries verified present
in one and absent from the other.

Gates at T13: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass / 0 fail
across 39 files**, exit 0 · `check-frozen-anchors` exit 0 (14 anchors) · `check-characterization`
exit 0 (3/3) · characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite
individually unchanged · `search-synapse-integration` **5/0** · `session-bias` **10/0** ·
`session-bias-late-bind` **3/0** · `project-indexer-late-bind` **4/0** · `index-admin-late-bind`
**4/0** · `index-manager-seam` **3/0** · `search-ranking-regression` **2/0** ·
`search-dependency-outage` **9/0** · `search-filter-overfetch` **10/0** ·
`search-admission-preflight` **5/0** · widened `hybrid-search-late-bind` **4/0 (12 expect() calls)** ·
**G-HUB exit 0**, 24 files, foreign **2 → 1**, reach **14 → 1** by `search-warmup.ts`, members
**23 → 18**, `perModule {csr 18, warmup 1}`, **zero** types above the ceiling, `maxFileLoc`
**675 → 697** against 700 · EXCLUSIONS **9** · D1 `delegateScope` **5 → 0**, facade-taking **2 → 0**,
scoped LOC **524 → 0** · T15's `rlm-` count **30 → 29**, the first decrement · CHANGELOG released
section still **974 lines, byte-identical to `353de59`**, all seven `[Unreleased]` entries verified
present there and absent from the released section, positionally and per entry.

Gates at T14 — **every figure identical to T13 except the one line T14 removes, which is the whole
claim**: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass / 0 fail across
39 files**, exit 0 · `check-frozen-anchors` exit 0 (14 anchors) · `check-characterization` exit 0 (3/3) ·
characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite individually unchanged ·
`session-bias` **10/0** · `session-bias-late-bind` **3/0** · `hybrid-search-late-bind` **4/0** ·
`project-indexer-late-bind` **4/0** · `index-admin-late-bind` **4/0** · `index-manager-seam` **3/0** ·
`search-ranking-regression` **2/0** · `search-dependency-outage` **9/0** · `search-filter-overfetch`
**10/0** · `search-admission-preflight` **5/0** · `search-synapse-integration` **5/0** · **G-HUB exit
0**, 24 files, foreign **1**, reach **1** by `search-warmup.ts`, members 18, `perModule {csr 18,
warmup 1}`, zero types above the ceiling, `maxFileLoc` **697 → 696** against 700 — and the **G-HUB
output is byte-identical to the pre-edit run except that number** · EXCLUSIONS **9** · D1
`delegateScope` **0**, facade-taking **0**, scoped LOC **0** · discriminating pair: `Visibility
relaxed` **10 → 0** *and* both replacement comments present, positionally checked · truth check: the
private revert of all ten gives `tsc` exit 2, **exactly 1 `error TS` line, exactly 1 TS2341**, at
`production-wiring.ts(51,32)`, **on both states** · guard: `rlm-search.test.ts:156` still cited **1**,
`rlm-search` in the root **13 → 4** · CHANGELOG released section still **974 lines, byte-identical to
`353de59`**, all **eight** `[Unreleased]` entries present there and absent from the released section,
positionally and per entry.

Gates at T15 — **every structural figure byte-identical to T14, which is the prediction, because T15
moves no code**: `lint` 0 · `type-check` 0 (6/6) · `check-frozen-anchors` exit 0 (14 anchors) ·
`check-characterization` exit 0 (3/3) · **new `check-stale-pointers` exit 0** — `RESOLVES 32 /
HISTORICAL 28 / BROKEN 0`, the pin met exactly, **measured with its own files staged** · **G-HUB exit 0**, 24 files, `ContextualSearchRLM`
foreign **1**, reach **1** by `search-warmup.ts`, `maxFileLoc` **696** against 700 · `test:scripts`
**753 pass / 0 fail across 40 files**, up from 732/39 by **exactly** the new
`check-stale-pointers.test.ts` (21 tests in 1 file) — the delta is accounted for, not assumed ·
characterization net **160** across 7 suites (26·41·31·21·25·7·9), every suite individually unchanged
under its new name: `search-facade-admin` **7/0**, `search-facade-indexing` **25/0**,
`search-facade-hybrid` **31/0**, `search-facade-synapse` **26/0**,
`contextual-search-rlm-coverage` **41/0**, `contextual-search-rlm.characterization` **21/0**,
`concurrent-indexing` **9/0** · `session-bias` **10/0** · line counts across the five
line-cited files **162 / 647 / 520 / 389 / 936**, identical before and after · CHANGELOG released
section still **974 lines, byte-identical to `353de59`**, all **nine** `[Unreleased]` entries present
there and absent from the released section, positionally and per entry.

Gates at T16 — **T16 changes no source, so every structural figure is byte-identical to T15, which is
the prediction**: `check-stale-pointers` exit **0**, `0 broken`, pin **28** met exactly and **unmoved by
this commit** — checked deliberately, because `.github/workflows/ci.yml` is **not** in `EXCLUDED` and a
step comment naming an `rlm-*` or `search-facade-*` file would have moved it · **G-HUB exit 0**,
`maxFileLoc` **696** against 700 · `ci.yml` parses under `Bun.YAML.parse`, **19** build steps,
`continue-on-error` **absent from the whole file** · step order `Build` → *Verify package contents* →
**G-HUB** → **stale pointers** → *Verify skill-bundle artifacts*.

**Sensor evidence, and its shape is not the one the row asked for.** Three parts, each measured:
`build` is in `main`'s required checks (live `gh api`, ruleset `19462721`); both new steps are bare
`run:` with no failure suppression (from the parsed YAML, not a grep that returns empty on error); and
both scripts exit non-zero on a **genuine** violation — G-HUB `--max-reach 0` → exit 1 with six FAIL
lines, `--max-loc 1` → exit 1, and `check-stale-pointers` with one injected broken pointer and **the pin
held at 28** → exit 1 naming the site, restored byte-identical by `git hash-object`. The pin-held
detail matters: the shallow-clone failure of the sixteenth defect is a *misconfiguration* going red, and
that is not evidence a gate detects a *violation*.

Gates at T17 — **T17 changes no source under `packages/core`, so every structural figure is
byte-identical to T16, which is the prediction**: `lint` 0 · `type-check` 0 (6/6) ·
`check-frozen-anchors` exit 0 (14 anchors — checked deliberately, because the new script and its
suite are `.ts` files under the root and `resolveNeedles` scans every `.ts`/`.tsx` for anchor
strings, so a fixture carrying one would have made that anchor ambiguous) ·
`check-characterization` exit 0 (3/3) · `check-stale-pointers` exit **0**, `RESOLVES 32 /
HISTORICAL 28 / BROKEN 0`, pin met exactly and **unmoved by this commit**, measured with the new
files staged · **G-HUB exit 0**, `maxFileLoc` **696** against 700 · `test:scripts` **770 pass / 0
fail across 41 files**, exit 0, up from 753/40 by **exactly** the new `needles-rename-control.test.ts`
(17 tests in 1 file) — the delta is accounted for, not assumed, and the 753/40 before-figure was
re-measured this session rather than inherited.

**T17's own readings, and the middle one is the one a reader will misjudge**: needles gate exit **0**
— hit@1 **0.643** ≥ 0.5 PASS, MRR **0.745** ≥ 0.65 PASS, and against the baseline hit@5 falls
**0.9286 → 0.8571** while MRR rises **0.7357 → 0.7452** · `needles-diff.ts` exit **1**, `N05` **@5 →
@6**, `N06` **@3 → @2**, the other twelve unmoved · `needles-rename-control.ts` exit **0**, pass A
faithful on all 14, `N05` restored to **@5** and `N06` to **@3**. Determinism was established before
any delta was attributed and not by re-running the same command: **11 of 14** needles reproduce their
top score to 4 dp across runs taken on different days, and the 3 that differ are exactly the needles
whose top hit lies in a file PR-B changed.

Gates at T18 — **T18 changes no source under `packages/core`, so every structural figure is
byte-identical to T17, which is the prediction**: `lint` 0 · `type-check` 0 (6/6) ·
`check-frozen-anchors` exit 0 (14 anchors — checked deliberately, since the edited `.ts` joins
`resolveNeedles`' scan) · `check-characterization` exit 0 (3/3) · `check-stale-pointers` exit **0**,
`0 broken`, pin **28** met exactly and **unmoved by this commit**, measured staged · **G-HUB exit
0**, every type ≤ 3 foreign reach, every file ≤ 700 LOC · `test:scripts` **770 pass / 0 fail across
41 files**, exit 0, identical to T17 since nothing under `scripts/` moved · `bun run test` **11
successful / 11 total** (needs `DATABASE_URL` on 5432, `MASSA_AI_EXECUTOR_SANDBOX=none` and a scratch
`XDG_CONFIG_HOME` — the documented `mcp-client` workaround; without them it fails on the harness,
not on the tree) · `apps/web-ui` **113 → 114 pass / 0 fail across 6 files**, `+1` exactly the new test.

**T18's own readings.** `bun run test:coverage < /dev/null` exit **0** — `floor 90% line · 315 source
files measured · 9 documented exclusions · PASS`, **2 m 14 s**, 169 `N fail` lines all zero, 165 lcov
files merged (129/25/8/1/1/1). `EXCLUSIONS.length` **9**, read by importing the gate rather than
counting entries by eye, and `scripts/check-coverage.ts` has **zero** diff on this branch — AC-2's
*"no new exclusion"* closed structurally, not by a count that could match while an entry was swapped.
Per-file, **presence asserted before percentage**, because `below` is built by iterating `merged` and
a file no group reports can never appear below the floor: `contextual-search-rlm` 221/221
**100.00%** · `index-admin` 80/80 **100.00%** · `session-bias` 49/49 **100.00%** · `graph-stream`
90/91 98.90% · `result-fusion` 164/168 97.62% · `hybrid-search` 407/426 95.54% · `project-indexer`
331/350 **94.57%**. That independent recomputation, through the gate's own exported
`parseLcov`/`mergeInto`/`linePercent`, reproduces **315 / 0 / 9** exactly. Corpus delta: tracked
measured-source **370 → 371**, `+1` — five modules added, four `rlm-*` removed; under
`services/search` alone **28 → 29**. **T18 changes no product code, so PASS is a truth check on the
tree, not proof T18 happened** — the only discriminating sensor in the commit is the new web-ui test.

Gates at T19 — **T19 changes no `.ts` at all, so every structural figure is byte-identical to T18,
which is the prediction; it was written down before the board was run and it held on every line**:
`lint` exit **0** · `type-check` exit **0 (6/6)** · `check-frozen-anchors` exit 0 (**14** anchors) ·
`check-characterization` exit 0 (**3/3**) · `check-stale-pointers` exit **0**, `0 broken`, pin **28**
met exactly and **unmoved by this commit** — measured **staged**, and checked deliberately rather
than assumed, because `.specs/` is in `EXCLUDED` (`scripts/check-stale-pointers.ts`) and this commit
writes `rlm-*` and `search-facade-*` names into five `.specs/` files · **G-HUB exit 0**, every type
≤ 3 foreign reach, every file ≤ 700 LOC · `test:scripts` **770 pass / 0 fail across 41 files**,
exit 0 in 60 s, identical to T17 and T18 since nothing under `scripts/` moved · **new T19 sensor
PASS**, all twelve corrections on both halves plus the positional and row-count checks · CHANGELOG
**untouched and unstaged** — `[Unreleased]` still **12** bullets, still only a `### Changed` heading,
released section still **974 lines**.

**Two of those readings needed a control before they could be quoted, and that is the T19-specific
warning.** `type-check` first returned **6/6 in 54 ms, "6 cached, 6 total", FULL TURBO** — a cache
hit is an *invariance* statement (no input turbo hashes moved), not a fresh compile, so it was re-run
with `--force`: **0 cached, 6 total, 4.62 s, exit 0**. And `lint` prints **nothing at all** on a clean
run and returns in under a second, which is indistinguishable from a no-op; `bunx oxlint` against a
known-bad file outside the repo returns **exit 1** with `no-dupe-keys`, which is what makes the repo's
silent exit 0 a real pass. *Neither reading changed — both were unquotable until the control existed.*

**`bun run test` was not re-run, deliberately.** The diff against `510a410` is **five `.md` files
under `.specs/`** and nothing else; no test input moved, which the `type-check` full-cache hit
independently demonstrates. T18's **11 successful / 11 total** stands. Do not read its absence here as
a skipped gate — read it as an invariance claim with a stated basis.

**Three things a resumer must not re-derive.**

1. **The paper prediction was falsified on ordering, and the falsification is the useful part.** All
   six extracted modules are `mock.module`'d in `contextual-search-rlm-coverage.test.ts`
   (`:126,162,179,189,199`) — the suite that covered those bodies before the split — and four again
   by their own `*-late-bind.test.ts`. From that topology `index-admin.ts` was predicted riskiest
   (234 LOC, only direct importer mocks it, 7 facade tests behind it). **It is 100.00%.** The
   `search-facade-*` characterization suites execute the real bodies through the facade, so the mock
   costs nothing. **Executable-line count predicted the ordering; mock topology did not.**
2. **The *this PR* / *this work* gap is closed by measurement, not by a correction.** The T18 row
   scopes to the branch diff (6 files); GMS-05 AC-2 says *every file this work touches*, which
   includes `result-fusion.ts` — T6's deliverable, in `main` through the squashed #46, hence outside
   the diff. A scoped plan critic raised it and proposed a **C12**; the premise was measured before
   the question was asked and it is **97.62%**, so reporting all seven closes AC-2 on its own
   wording. **No C12 — T19 stays C1–C11.** The gap is a downstream consequence of the R-04 violation,
   not a new one. *Fifth earned keep for a scoped critic, and the second time measuring its premise
   turned a proposed spec change into a one-line reporting widening.*
3. **A local PASS is not CI's PASS — real mechanism, bounded on this run.**
   `embeddings/config.ts:183,185` takes `OLLAMA_BASE_URL || localhost:11434` and gives Ollama
   `priority: 1` whenever `EMBEDDING_PROVIDER` is unset. **Both env-driven**, so the gate's scratch
   `XDG_CONFIG_HOME` — which does neutralise every `config.json`-driven LLM branch, and is argued in
   the gate's own header as making the numbers a property of the tree — **does not reach this one**,
   and `coverage.yml` configures no provider at all. Measured on the passing run: **`ollama-ok` = 0**,
   no successful live embed call; every provider tag in the log is an error/fallback/fixture shape.
   Also measured live: `coverage` **is** in `main`'s required checks, so a red gate blocks — and the
   branch base `5247ecb` has **no** coverage run at all (it is the `[skip ci]` release commit), which
   makes `fb8a3ed` the before-baseline and this **the first coverage reading PR-B has ever had**.

> **`CLAUDE.md` says 24 Prisma migrations; the tree has 23.** Measured against the dedicated database
> at T18: 23 on disk, 23 applied, 0 unfinished, 0 missing. Harmless in itself, but a verifier reading
> the gate's `_prisma_migrations intact at 23 row(s)` against that sentence will conclude the database
> is half-migrated. Not fixed here — `CLAUDE.md` is outside PR-B's write set.

> **Name the metric on the characterization net.** The seventh suite in `26·41·31·21·25·7·9` is
> `concurrent-indexing` at **9**, not `session-bias` at **10** — `session-bias` is tracked separately
> and has been since T8. A run that substitutes it reports **161** and looks like a regression in a
> gate that has not moved. Cost one wrong reading at T15 before the suite list was checked.

**Three suite baselines T13 had to measure because no prior record carried them**, and a sensor with
no before-value reports nothing: `search-dependency-outage` **9/0**, `search-filter-overfetch`
**10/0**, `search-admission-preflight` **5/0**. All taken against `484e61a` under a scratch
`XDG_CONFIG_HOME` before the first edit.

**`perModule csr` went 5 → 14 at T10, 14 → 15 at T12 and 15 → 18 at T13, and that is the target state, not drift.** The nine new members arrive
from the absorbed `ensureInitialized` body, the three hoisted `await this.ensureInitialized()`
statements and `#indexerDeps()`. It now *ties* `rlm-search.ts` at 14 — but `foreign` excludes the
declaring file (`search-hub-metric.ts:150`), so `maxForeignReach` is still **14 by `rlm-search.ts`**
and there is still exactly **one** G-HUB violation. Predicted on paper before the edit.

**LATE-BIND at T10, measured not inherited** — and it settles the T9 finding for good.
`rlm-indexing.test.ts` holds **52 of the ~80** assignment sites, the richest surface in the repo, and
it is *still* blind to a first-call memo: construction capture gives coverage **33/8** and
`rlm-indexing` **8/17**, while the memo gives **41/0** and **25/0** with `tsc` at 0. Closed by
`project-indexer-late-bind.test.ts` (4 tests; **4/0** honest, observed **2/2** under the memo, **3/1**
under `.bind(this)` at assembly time, **3/1** under an eighth-key leak). **T13 must still run it
itself** — the finding is that the assignment-site inference is invalid, not that the answer is always
"blind". **T12 ran it and the answer was "blind" for the third consecutive task** (memo: `tsc` 0,
`rlm-admin` 7/0, coverage 41/0, characterization 21/0; construction capture: 4/3 and 38/3), so the
inference is now refuted at both the richest and a sparse surface. Every mutation in all three tasks was
verified *applied* before its reading was believed.

**The mutation shape matters at T10 and after, and T12 found the rule incomplete.** The blind recursion
run on `checkSearchAdmission` **hung** instead of failing at the 5 s budget, and the run was killed at
10 minutes: T10 hoists `await this.ensureInitialized()` above the delegate call, so the recursion is an
unbounded *microtask* chain that never yields to the macrotask queue, and the per-test timer cannot
fire. Run it on a delegate with **no preceding `await`** — at T10 that was `indexFile`, giving `tsc` 0,
coverage 39/2, `rlm-indexing` 22/3. **Necessary, not sufficient: measured at T12, the delegate must
also be `async`.** `getAnalytics` has no preceding `await` and hangs anyway (>60 s at ~98 % CPU, no
throw, `tsc` 0 — reproduced outside `bun test` in a bare script with a `try/catch`, so it is not the
runner's error formatting). An async frame cannot be elided, which is why T9's and T10's overflowed
immediately and read cleanly. T12's four delegates are three async-with-preceding-`await` plus one
sync, so **none is observable**; T13 inherits both mechanisms and must not budget time hunting a
subject. **A hang is not blindness** — no such run reports green — and the positive evidence is the
module spy's call count.

**Read before resuming**: `tasks.md` → the three new T12 sections first (*Eighth plan defect*, *T12 ran
the memo mutation…*, *The trap the plan never named: `MAX_FILE_LOC`*), then *AC-3 vs GMS-03 AC-1*, *Phase 0's before-baselines were
live-tree assertions*, *T6's sensor was unfirable*, *the foreign-module count is not a per-task
sensor either*, *LATE-BIND has no sensor at T8*, **the new *LATE-BIND's ordinary sensor does not
"come back" at T9* section**, the `ensureInitializedImpl` section (T10 owns it), *T15's sensor,
scoped* — including **the new note that its site list is frozen at `ce26f28` and Phase 1 has grown
it to 27 files** — then the Phase 1 table and *Phase 1 — executed*.
Then `STATE.md` → *Execute — Phase 1 STARTED*.

**The T9 finding that changed how T10, T12 and T13 must sensor themselves — T10 and T12 have now
discharged their halves of it, with the same answer both times; T13 has not.** T8 recorded that
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
from it.** Measured after T12: **30** tracked files carry `rlm-` outside `CHANGELOG.md` / `.specs/` /
`.ua/`, against the 19 recorded in the plan, 27 after T9, 28 after T10 and 29 after T11
(`rlm-indexing.ts` and `rlm-admin.ts` left the set, `project-indexer.ts` and `index-admin.ts` entered it
carrying provenance comments, and each new sensor file is a `+1` — T11's `index-manager-seam.test.ts`
cites `rlm-indexing.test.ts:201` and T12's `index-admin-late-bind.test.ts` cites seven sites in
`rlm-admin.test.ts` / `contextual-search-rlm-coverage.test.ts`, both **class 1**). **Enumerate with
`git grep -l -P`, not `-E`** — see T12 result 4: POSIX ERE has no `\s`, and the wrong flag returns zero
matches with exit 1, which reads like a clean sweep. **Take the count with the
new files staged** — `git grep` enumerates tracked files only, and the same command run before
`git add` reported 28. **Enumerate with `git grep` and explicit pathspec exclusions, never the shell's
`grep`**: the plan critic independently measured this as **19** using a `grep` honouring `.gitignore`
(the repo's `grep` is a ugrep shim), which is the same two-methods-two-answers failure this feature has
now hit six times. Every extraction adds a provenance comment naming the
file the body came from. Two classes, and T15 must not conflate them: references to `rlm-*.test.ts`
(those files *survive* the extractions; ~~renaming them is T15's own decision~~ — **GMS-04 AC-1 mandates
the rename and only the new names were the executor's call, the thirteenth plan defect**) versus references to a now-deleted
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
explicitly. The ~~18~~ **19** authorised signature-tracking test edits must be told to it too, or they
read as the AC-3 violation they are not — **19 is the ledger's own total** (`tasks.md`, *AC-3 at T13*);
this line said 18 and was stale from T13 onward. The full briefing list is under *Next action* above.

**Rebase note**: this branch is cut from `origin/main` @ `5247ecb` and is current with it.
Merge must be a merge commit, not a squash (R-04) — see the branch note above for what a squash
already cost once.

**CHANGELOG**: `[Unreleased]` now carries all eight — T7 through T14 — under `### Changed`. Once `main` cuts
another release, verify **both** directions positionally after any merge — that this branch's entries
are in `[Unreleased]` **and** absent from the released section, and that the released section is
byte-identical to its published form. Asserting only that the old entry survived is the asymmetric
check that missed it last time. Verified at T12: released section **974 lines, byte-identical** to
`353de59`, all six entries present in `[Unreleased]` and none of them in the released section — both
directions checked positionally, per entry.

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
