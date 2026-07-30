# Handoff

## Active — Core Layering and God-Module Split (PR-B), **Phase 1 COMPLETE**

**Feature**: `core-layering-god-module-split` · branch
`refactor/search-facade-split-phase-1b`, cut from `main` @ `5247ecb` (v1.11.0),
worktree `../massa-ai-wt-facade-phase-1b`.
**T6a and T6 are merged and released; T7–T14 are committed and green. Phase 1 is closed. T15 is
next and begins Phase 2.** Working tree clean. Nothing is pushed — the branch is local only, now ten
commits deep.

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

**Next action: T15 — GMS-04's non-source sites. Phase 1 is closed; this opens Phase 2.** Budgeted
45 m. Read *T15's sensor, scoped* in `tasks.md` before anything else, then *T13 and T15*. Concretely:

1. **Re-enumerate. Do not work from the plan's list.** It is frozen at `ce26f28` at **19** tracked
   files; measured **29** after T13. T14 cut the root's `rlm-search` lines 13 → 4 but removed no file
   from the set, so 29 is the number to re-confirm, not to assume. **Enumerate with `git grep -l -P`
   and explicit pathspec exclusions** — never the shell's `grep`, which here is a ugrep shim honouring
   `.gitignore` and independently produced 19 where the correct answer was 29. **`-P`, not `-E`**:
   POSIX ERE has no `\s`, and the wrong flag returns zero matches with exit 1, which reads exactly like
   a clean sweep. **Take the count with everything staged** — `git grep` enumerates tracked files only,
   and the same command a minute before `git add` has been wrong twice.
2. **Two classes, and T15 must not report them as one number.** Class 1 is a reference to an
   `rlm-*.test.ts` file, which *survives* PR-B — renaming those suites is T15's own decision, so these
   are consistent, not stale. Class 2 is a reference to a now-deleted `rlm-*.ts` source: legitimate
   historical provenance pointing at a path that no longer resolves. After T14 the root's own three
   are class 2 (`:91`, `:108`, `:446`) and its fourth (`:185`) is class 1.
3. **The named sites**: `docs/ONBOARDING.md:147,148,177`, `CLAUDE.md:157`, and the two the first draft
   missed — `architecture-map.test.ts:454-455` and `search-controller.test.ts:3`, both comments citing
   test files this PR renames. **The needles fixture is NOT a site** (PR-A content-anchored all 14
   needles; spec correction C4). Five stale `rlm-admin` mentions in
   `contextual-search-rlm-coverage.test.ts` (`:8`, `:9`, `:10`, `:84-85`) were left to T15 by T12
   deliberately.
4. **The sensor is zero hits outside `CHANGELOG.md`, `.specs/` and `.ua/`, enumerated by a script over
   `git ls-files`** so the count cannot depend on which `grep` is on PATH. **AC-3 as written is
   unsatisfiable** — 320 `rlm-` occurrences live in three tracked generated `.ua/` artifacts, and
   `.ua/` regeneration is deferred to after PR-C, so **PR-B does not close GMS-04 AC-3** for them and
   must not claim to.
5. **The two test-file comment corrections are explicitly authorised** and are the only test-file edits
   in PR-B outside the 4 rename sites. **Finding a third is a signal to stop, not a chore** — and
   T20's verifier has to be told all of this, or 19 authorised assertion changes in a PR claiming "no
   test weakened" read as the violation they are not.
6. **Do not start T16 without asking.** It edits CI and requires verifying the live `main` branch
   ruleset through `gh api` — a repo-settings change in a different risk class, and SEN-02 AC-5 is the
   recorded reason it needs its own decision.

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
| T14 | this commit | the root's final cleanup — ten stale `Visibility relaxed` notes replaced per group (§4.3 for the nine methods, §4.3.1 for the one field), the T13 hand-off block retired; **Phase 1 closes**; the eleventh plan defect |

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
