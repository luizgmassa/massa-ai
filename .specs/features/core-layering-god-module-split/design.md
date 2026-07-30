# Core Layering and God-Module Split — Design (PR-B)

- **Slug**: `core-layering-god-module-split`
- **projectId**: `massa-ai`
- **workflowSessionId**: `spec-core-layering-god-module-split`
- **Scope of this document**: **PR-B only** — the search facade split (GMS-03) and the `rlm-*`
  rename (GMS-04), validated by GMS-05. GMS-01 and GMS-02 belong to PR-C and PR-D and are
  touched here only where PR-B must avoid them.
- **Status**: Design complete. Written 2026-07-29 against `main` @ `ce26f28` (v1.9.1), clean tree.
- **Depends on**: `sensor-repair-2026-07` (PR-A) — **satisfied**, merged as `33efc82`, released
  v1.9.1.

> **Provenance correction, 2026-07-29 (Execute).** This document said in five places that D2 was
> "committed". **It was not.** `git log --all -- scripts/search-hub-metric.ts` was empty and
> `git status` showed the script and its tests untracked; nothing from the Design session was ever
> committed. The script was *written*, which is a different claim, and it is the same defect class
> this document catalogues — an artifact asserting a precondition that is silently unmet. Corrected
> in place below. D2 lands as **tasks.md T0, the first commit of Execute**; the script itself is
> unchanged and its 13 tests still pass. See `tasks.md` → Plan Challenge — tasks.

**Provenance of every number below.** All were produced at `ce26f28`. §3's readings come from
`scripts/search-hub-metric.ts` (D2), **written during this Design phase and committed as the first
commit of Execute (T0)**, covered by `scripts/__tests__/search-hub-metric.test.ts` (13 tests /
0 failures) — re-runnable by anyone.
§2's matrix and §7's fan-in/fan-out came from scripts that are **not yet committed** (D1, D3, §8);
they were independently hand-verified against source, but until those land they are reproducible
only by re-deriving the method described. §5.1's importer count is explicitly an
order-of-magnitude statement for the same reason. The distinction matters: this document's
measurement method was wrong four separate times (§3.2), and "verified by a script that exists" is
a different claim from "verified by a script you can run."

Where a figure contradicts `spec.md`, that is called out and the correction is listed in
[Spec corrections owed](#spec-corrections-owed).

---

## 1. AS-02's dangling forward reference — what was found

`spec.md`'s AS-02 closes with *"Settled in `design.md` against the member→consumer matrix; the
separable and shared members are already identified."* No `design.md` existed. The question was
whether the matrix was built and lost, or whether AS-02 was closed against work that was never
done.

**Finding: the matrix was built and read correctly. Only the artifact was lost.**

Evidence, in two parts.

**(a) No `design.md` was ever committed, on any branch.**

```
$ git log --all --oneline -- '.specs/features/core-layering-god-module-split/design.md'
(empty)
$ git log --oneline --all -- '.specs/features/core-layering-god-module-split/'
e95050e docs(specs): specify and plan the sensor repair before the layering r...
ac89d0f chore!: audit remediation 2026-07 PR2 — env rename, lint gate, coverage gate (#41)
```

The directory has only ever held `spec.md`. This is not a deleted file; it is a file that never
existed. `FEATURES.json` (`phases.design: false`) agreed with the filesystem; only `spec.md`'s
status line and AS-02 did not.

**(b) The three summary statistics that survived in the Evidence table all reproduce exactly.**

`spec.md`'s Evidence table carries one row marked `[new]` that is the matrix's residue:

> `searchImpl` touches 13 of ~16 facade members; `ensureInitialized()` is called by 7 of 15
> delegates; `RRF_K`, `fileFilterCache`, `queryUnderstanding` are each touched by exactly one —
> *read of every `*Impl` body, tabulated as a member→consumer matrix*

Rebuilt independently at `ce26f28` (§2):

| Retained claim | Rebuilt value | Verdict |
| --- | --- | --- |
| `searchImpl` touches **13** facade members | **13** | reproduces |
| `ensureInitialized` called by **7** of **15** delegates | **7** of **15** | reproduces |
| `RRF_K` touched by exactly one | 1 — `fuseResultsImpl` | reproduces |
| `fileFilterCache` touched by exactly one | 1 — `clearProjectIndexImpl` | reproduces |
| `queryUnderstanding` touched by exactly one | 1 — `searchImpl` | reproduces |
| **21** delegate surfaces | **21** exported functions | reproduces |

**That reproduction argument is weaker than it looks, and it is not what grounds AS-02.** The
three retained figures are not independent: all are summary projections of one artifact, computed
by one method over the same five files. Their agreement is a determinism check — the same
procedure yielding the same output twice — not triangulation. §3.2 shows a sibling script from the
same method-family miscounting an adjacent quantity on the same tree four separate ways, so
"these numbers matched, therefore trust the matrix" is not a safe inference here.

What actually grounds AS-02 is **direct re-derivation**: §2's matrix was rebuilt from source in
this session, and independently hand-verified against the delegate bodies by a second reader —
`searchImpl` = 13 members, 23 distinct members overall, 21 exported functions, 6 taking no facade
parameter, and `buildGraphStreamImpl`'s deliberately-unused `_rlm` correctly scoring 0. Those
reproduce exactly. The matrix is real and was read correctly; the reproduction-of-summaries
argument is corroboration, not proof.

**Resolution: AS-02 stands. It is not re-opened.** What was wrong was the *tense* — AS-02 cites
`design.md` as a place where the work had already been recorded, when it was a place where the
work was going to be recorded. The decision it records (capability modules owning only the state
they use, dependencies injected) is supported by the matrix. This document supplies the missing
artifact; §2 is what AS-02 pointed at.

**The one thing AS-02 got loose:** "13 of **~16** facade members". There is no reading of the
class that yields 16. The class declares **11** instance state members plus **21** methods; the
delegates collectively read **23** distinct names off the `rlm` parameter. The numerator 13 is
exact; the denominator `~16` is an approximation with no method behind it and is corrected in
§10.

---

## 2. The member→consumer matrix

Produced by `scripts/search-facade-matrix.ts` (deliverable D1, §8). It locates every exported
function in the five `rlm-*` delegates, detects the parameter annotated `: ContextualSearchRLM`,
and records every `<param>.<member>` read in the body.

> Method note, and it cost real time: a first attempt bounded function bodies by brace-matching
> and reported `searchImpl` as 5 lines with 0 members. The cause is `options: SearchOptions = {}`
> in the parameter list — an open/close brace pair at depth 0 that terminates the match before
> the body starts. Bodies are bounded by the next line equal to `}` instead. A matrix built on
> the first method would have shown the facade as almost uncoupled and inverted the entire
> design.

### 2.1 Consumer → members

| fn | file | LOC | facade param | members touched | n |
|---|---|---|---|---|---|
| `searchImpl` | rlm-search.ts | 455 | yes | addContextToResults, analytics, applySynapseState, buildGraphStream, calculateAvgScore, correctQuery, ensureInitialized, filterByPatterns, fuseResults, keywordSearch, queryUnderstanding, searchCache, vectorStore | **13** |
| `ensureInitializedImpl` | rlm-indexing.ts | 40 | yes | analytics, indexManager, initialized, injectedDeps, keywordSearch, searchCache, symbolRepo, vectorStore | 8 |
| `ensureFreshIndexImpl` | rlm-indexing.ts | 187 | yes | ensureInitialized, indexFile, indexManager, indexProject, searchCache, symbolRepo | 6 |
| `clearProjectIndexImpl` | rlm-admin.ts | 28 | yes | ensureInitialized, fileFilterCache, keywordSearch, searchCache, vectorStore | 5 |
| `_indexProjectInternalImpl` | rlm-indexing.ts | 126 | yes | ensureInitialized, indexFile, indexManager, symbolRepo | 4 |
| `indexFileImpl` | rlm-indexing.ts | 64 | yes | keywordSearch, vectorStore | 2 |
| `warmupCacheImpl` | rlm-admin.ts | 59 | yes | ensureInitialized, search | 2 |
| `checkSearchAdmissionImpl` | rlm-indexing.ts | 35 | yes | ensureInitialized, indexManager | 2 |
| `getProjectStatsImpl` | rlm-admin.ts | 10 | yes | ensureInitialized, vectorStore | 2 |
| `fuseResultsImpl` | rlm-fusion.ts | 202 | yes | **RRF_K** | 1 |
| `applySynapseStateImpl` | rlm-synapse.ts | 54 | yes | injectedDeps | 1 |
| `addContextToResultsImpl` | rlm-search.ts | 30 | yes | extractPreview | 1 |
| `correctQueryImpl` | rlm-synapse.ts | 24 | yes | keywordSearch | 1 |
| `getAnalyticsImpl` | rlm-admin.ts | 5 | yes | analytics | 1 |
| `buildGraphStreamImpl` | rlm-synapse.ts | 124 | yes | — | **0** |
| `generateScoreExplanationImpl` | rlm-fusion.ts | 38 | **no** | — | 0 |
| `filterByPatternsImpl` | rlm-search.ts | 29 | **no** | — | 0 |
| `runWithIndexLock` | rlm-indexing.ts | 27 | **no** | — | 0 |
| `extractPreviewImpl` | rlm-search.ts | 5 | **no** | — | 0 |
| `calculateAvgScoreImpl` | rlm-search.ts | 5 | **no** | — | 0 |
| `loadGitignoreImpl` | rlm-indexing.ts | 3 | **no** | — | 0 |

21 exported functions · 15 take the facade · 6 already do not · 1550 LOC covered.

### 2.2 Member → consumers

| member | kind | consumers | n |
|---|---|---|---|
| `ensureInitialized` | method | `_indexProjectInternalImpl`, `checkSearchAdmissionImpl`, `clearProjectIndexImpl`, `ensureFreshIndexImpl`, `getProjectStatsImpl`, `searchImpl`, `warmupCacheImpl` | **7** |
| `keywordSearch` | store | `clearProjectIndexImpl`, `correctQueryImpl`, `ensureInitializedImpl`, `indexFileImpl`, `searchImpl` | 5 |
| `vectorStore` | store | `clearProjectIndexImpl`, `ensureInitializedImpl`, `getProjectStatsImpl`, `indexFileImpl`, `searchImpl` | 5 |
| `indexManager` | store | `_indexProjectInternalImpl`, `checkSearchAdmissionImpl`, `ensureFreshIndexImpl`, `ensureInitializedImpl` | 4 |
| `searchCache` | store | `clearProjectIndexImpl`, `ensureFreshIndexImpl`, `ensureInitializedImpl`, `searchImpl` | 4 |
| `analytics` | store | `ensureInitializedImpl`, `getAnalyticsImpl`, `searchImpl` | 3 |
| `symbolRepo` | store | `_indexProjectInternalImpl`, `ensureFreshIndexImpl`, `ensureInitializedImpl` | 3 |
| `indexFile` | method | `_indexProjectInternalImpl`, `ensureFreshIndexImpl` | 2 |
| `injectedDeps` | seam | `applySynapseStateImpl`, `ensureInitializedImpl` | 2 |
| `addContextToResults`, `applySynapseState`, `buildGraphStream`, `calculateAvgScore`, `correctQuery`, `filterByPatterns`, `fuseResults`, `queryUnderstanding` | — | `searchImpl` | 1 each |
| `extractPreview` | method | `addContextToResultsImpl` | 1 |
| `fileFilterCache` | store | `clearProjectIndexImpl` | 1 |
| `indexProject` | method | `ensureFreshIndexImpl` | 1 |
| `initialized` | flag | `ensureInitializedImpl` | 1 |
| `RRF_K` | const | `fuseResultsImpl` | 1 |
| `search` | method | `warmupCacheImpl` | 1 |

### 2.3 What the matrix says

Four findings drive the design.

**F1 — `ensureInitialized` is the reason the facade is passed, not the state.** It is the single
most-read member (7 of 15). It is lazy async initialization: it resolves six factories and
assigns six fields. Six of its seven callers use it as their *first statement* and never touch
the resolved fields directly. That edge is not domain coupling; it is a construction sequence
smeared across every delegate. Resolve dependencies before construction and all seven edges
disappear at once.

**F2 — the state is exactly the injectable set.** The six store members (`keywordSearch`,
`vectorStore`, `indexManager`, `searchCache`, `analytics`, `symbolRepo`) plus the two
locally-constructed helpers (`fileFilterCache`, `queryUnderstanding`) are eight collaborators.
`initialized` and `injectedDeps` are artifacts of F1's lazy init and are deleted with it. `RRF_K`
is the literal `60` and becomes a module constant. There is no member left over that resists
injection — with one named exception, F4.

**F3 — the modules already have disjoint state; only `searchImpl` is broad.** Excluding
`ensureInitialized`, every delegate outside `rlm-search.ts` touches ≤ 4 members. `fuseResultsImpl`
touches **one**, and it is a constant. `buildGraphStreamImpl` — 124 lines — touches **zero**. The
subsystem is not entangled; it is *unwired*. `searchImpl` at 455 LOC and 13 members is the actual
god function, and 8 of its 13 reads are calls to sibling capabilities, not state.

**F4 — one dependency genuinely cannot be injected today, and it is not on the store list.**
`ensureInitializedImpl` builds `IndexManager` by direct construction at `rlm-indexing.ts:586`;
`injectedDeps` (`contextual-search-rlm.ts:103-111`) has no field for it. GMS-03 AC-2 already
names this. It is the one place PR-B must *add* a seam rather than move one.

---

## 3. What M14 actually did — and the metric that would have caught it

R-03 says *"splitting again produces another facade"* and `spec.md` marks it Open with
GMS-03 AC-3's fan-in/fan-out script as the check. Fan-in/fan-out is necessary but it is not
sufficient, and it is not what makes R-03 real. This section replaces assertion with measurement.

### 3.1 The measurement

`scripts/search-hub-metric.ts` (deliverable D2, §8) measures, for a directory:

- `members(T)` — distinct member names read off any binding of type `T` (via `this.` inside
  `class T`, and via any parameter annotated `: T`)
- `foreignModules(T)` — files *other than* `T`'s declaring file that perform such a read
- **`maxForeignReach(T)`** — the largest number of distinct members any single foreign module reads

**It takes no type name.** It enumerates every `class` / `interface` / `type` declared in the
directory and measures all of them. That is not a convenience — §3.4 shows a named-type version is
trivially evadable.

### 3.2 The measurement method was wrong four times, and that is itself a finding

This section's numbers were published twice in earlier drafts of this document and were wrong both
times. **Four** independent defects in one 60-line script, each found only by attacking it — two by
an adversarial pass, two by an independent hand-derivation:

| # | defect | effect on the numbers |
| --- | --- | --- |
| 1 | function bodies bounded by brace-matching; `options: SearchOptions = {}` in a parameter list closes the counter at depth 0 | `searchImpl` reported as 5 LOC / 0 members instead of 455 / 13 (§2) |
| 2 | comments not stripped; a JSDoc `… from contextual-search-rlm.ts` beside a parameter named `rlm` matches as `rlm.ts` | phantom member `ts` — **inflates** by 1 |
| 3 | string-literal stripping run over *unstripped* comments: the apostrophe in `contextual-search-rlm.ts:162` (`… so the test's`) pairs with `:299` (`… keyword store's`), deleting the 137 lines between | `this._indexProjectInternal` at `:167` swallowed — **deflates** by 1 |
| 4 | **string-literal stripping at all.** Quote-pairing across a 1668-line file deletes large spans of real code | **11 real members lost** at `c92e481^` — `RRF_K`, `fuseResults`, `indexProject`, `buildGraphStream`, `filterByPatterns`, … — reporting `members` as 15 when it is 26 |

Defect 4 is the serious one and it was invisible: it under-reported by 42% on one commit and by 0%
on the others, so cross-commit comparisons looked coherent. Defects 2 and 3 pushed in *opposite*
directions, so totals stayed plausible throughout. **A metric wrong by +1 and −1 simultaneously
reports a stable, credible, incorrect number** — which is why "the figure has not moved between
runs" is not evidence that it is right.

The corrected method strips **block comments, line comments, and `import`/`export … from` lines —
and nothing else.** String literals are deliberately left in place; once comments are gone the
phantom-member problem disappears without them, and stripping them destroys real code.

**This is the strongest available argument for §8's requirement that D1–D3 ship with unit tests
against known fixtures.** GMS-03 AC-3 already insists the counting method be *executable rather
than described*. Four defects in one script says executable is not sufficient either — it must be
executable, **committed**, and **tested**. §8 is amended accordingly: D2 lands before this
document is cited as verified evidence anywhere.

### 3.3 M14, measured

`c92e481` is the M14 refactor ("decompose query-pack + ContextualSearchRLM behind byte-identical
facades"). Run at its parent, at it, and at `HEAD`, with all four defects fixed. These readings were
independently reproduced by hand against real `git worktree` checkouts:

| commit | host file LOC | files in dir | members | foreign modules | **maxForeignReach** |
| --- | --- | --- | --- | --- | --- |
| `c92e481^` — pre-M14 | **1668** | 14 | 26 | **1** | **1** |
| `c92e481` — post-M14 | 463 | 19 | 24 | **6** | **14** |
| `ce26f28` — today | 461 | 23 | 24 | **6** | **14** |

**M14 divided the host file by 3.6 and multiplied foreign reach by 14.** Before it, exactly one
foreign module touched `ContextualSearchRLM` — `search-warmup.ts`, which calls `.search(...)` and
nothing else. After it, five delegates reach in, the deepest **14** members deep.

**The `members` column is the one that settles it, and it settles it the opposite way from this
document's earlier drafts.** An earlier draft claimed M14 *widened* the type from 17 to 22 members.
That was defect 4. Corrected, members went **26 → 24 — slightly down**. M14 did not add surface.

That makes the finding cleaner, not weaker:

> M14 changed **nothing** about how many members the type has, and **everything** about how many
> modules reach into it. Members flat (26 → 24). Foreign modules ×6. Deepest reach ×14. Lines per
> file ÷3.6.

The mechanism is visible in the source: fifteen fields had `private` dropped so the extracted
modules could read them. Relaxing visibility does not *create* members — it exposes existing ones,
which is exactly what the numbers say.

```
$ grep -c "Visibility relaxed\|Relaxed to \`public\`" \
    packages/core/src/services/search/contextual-search-rlm.ts
15
```

Post-M14 and today are **identical** on both coupling numbers (24 / 14). Nothing has improved in
the 18 commits since; the host file shrank by 2 lines and 4 files were added to the directory.

M14 moved code without moving responsibility, and the only metric anyone watched — lines per
file — improved by 3.6× while the coupling it was supposed to relieve got 14× worse.
**R-03 is not a hypothetical. It is a description of what already happened in this exact
directory, to this exact class, and it is now a number.**

### 3.4 The gate, after three attempts to break it

A first version of this gate read *"`maxForeignReach(ContextualSearchRLM) ≤ 1` and host file ≤ 500
LOC."* An adversarial pass broke it twice, and both breaks were reproduced against the real script:

| attack | result | why |
| --- | --- | --- |
| **Aggregate-holder rename.** Move the state into a `SearchDeps` record; delegates take `deps: SearchDeps` and read the same 14 members. | **PASSES** — `maxForeignReach(ContextualSearchRLM)` = 0, host 29 LOC | the gate audits one literal type name; the identical hub under any other name is invisible |
| **Class rename.** Rename `ContextualSearchRLM` → `SearchHub`, keep the file name. | **PASSES, vacuously** — reports `0/0` | the type name is a CLI argument with a default; nothing checks the named type still exists |
| Barrel re-export to get the host file under 500 LOC | no break alone | the class-body scan runs over every file in the directory, not just the host filename |

Both breaks share one cause: auditing a *name* instead of a *shape*. The gate is therefore:

> **G-HUB.** After PR-B, in `packages/core/src/services/search/`:
> **for every type declared in the directory, `maxForeignReach ≤ 3`**, **and** no single file in
> the directory exceeds **700 LOC**.
> The script takes no type name; it enumerates declarations.

Measured over every declaration at `ce26f28` — **exactly one type fails, and it is the target**:

| type | declared in | foreign modules | maxForeignReach |
| --- | --- | --- | --- |
| `ContextualSearchRLM` | contextual-search-rlm.ts | 6 | **14** ← fails |
| `SearchDegradation` | search-diagnostics.ts | 1 | 3 |
| `QueryLlmSurface` | query-understanding.ts | 1 | 2 |
| `Policy`, `SearchAnalyticsPg`, `SearchCachePg` | — | 1 | 1 |
| 11 others | — | 0 | 0 |

**Threshold rationale.** `≤ 3` rather than `≤ 1` because `SearchDegradation` is a plain data
record — reading three fields off a DTO is not coupling — and it is the highest legitimate reading
in the tree. It is a uniform bar, not an allowlist: a documented-exception list would rot, and this
repository has been bitten by report-without-enforce often enough to prefer a bar that needs no
maintenance. A `SearchDeps` bag holding the 5–8 collaborators the old facade held reads well above
3 and fails. The design's own per-module records (`SessionBiasDeps` = 2 members, `HybridSearchDeps`
= 5) are declared *in the module that reads them*, so their foreign reach is **0**.

**LOC condition: 700, not 500.** Its only job is to stop "put it all back in one file" from
passing. The largest file in the directory today is `rlm-indexing.ts` at 591; pre-M14's host was
1668. 700 clears every current file, kills the one-file regression, and forces no cosmetic
splitting. Applying it to *every* file rather than a named host also kills the barrel-re-export
dodge.

**Discrimination check — the gate fails both known-bad states, and both evasions:**

| state | reach ≤ 3 (all types) | every file ≤ 700 | passes |
| --- | --- | --- | --- |
| pre-M14 `c92e481^` | pass (1) | **fail** — `contextual-search-rlm.ts` 1668 | no |
| post-M14 `c92e481` | **fail** (14) | **fail** — `smart-chunker.ts` 946 | no |
| **today `ce26f28`** | **fail** (14) | pass — largest is `rlm-indexing.ts` 592 | **no** |
| `SearchDeps` aggregate-holder evasion | **fail** — the record is enumerated too | pass | no |
| class-rename evasion | **fail** — enumerated, not named | pass | no |
| PR-B target | pass | pass | **yes** |

Today's tree is the clean isolation: it passes the LOC condition and fails on reach alone, so the
reach criterion is doing real work rather than riding on a file-size failure. (Post-M14 happens to
fail both, but its LOC failure is `smart-chunker.ts` — unrelated to the facade, and since reduced.)

**Verified, not asserted.** D2 was run at all three commits (and is committed at T0, not during
Design — see the provenance correction at the top); today's tree exits **1** with exactly one
violation, and it is the target:

```
$ bun scripts/search-hub-metric.ts packages/core/src/services/search
packages/core/src/services/search — 23 files, largest rlm-indexing.ts (592 LOC)
…
[hub-metric] FAIL — ContextualSearchRLM (contextual-search-rlm.ts) is read 14 members deep
                    by rlm-search.ts (max 3)
$ echo $?
1
```

All 19 other declared types in the directory pass. `scripts/__tests__/search-hub-metric.test.ts`
is **13 tests / 0 failures**, with one named regression test per defect in §3.2 and one per evasion
above.

**Stated limit — G-HUB is necessary, not sufficient.** One evasion survives it: passing the
collaborators as 13 individual parameters instead of one object. Reach goes to 0 while coupling is
unchanged. G-HUB cannot see it, and claiming otherwise would be the exact defect class PR-A spent
itself removing. The compensating control is GMS-03 AC-2, which is a *usability* criterion rather
than a counting one — a unit test must construct a capability from an object literal with no
`mock.module` — and a 13-parameter function fails it on contact. Recorded here so no reader mistakes
G-HUB for a complete proof.

### 3.4 Why the existing AC-3 check is kept anyway

GMS-03 AC-3's fan-in/fan-out script stays a deliverable. It answers a different question — how
much of the *codebase* depends on this module — where G-HUB answers how deeply the *subsystem*
reaches into it. M14 left fan-in/fan-out unchanged **and** wrecked maxForeignReach; a future
change could do the reverse. Both are cheap. Both ship.

---

## 4. The capability-module boundary

### 4.1 Shape

Six capability modules, from today's five delegates. Each owns its collaborators as constructor
parameters. **No capability module imports `contextual-search-rlm.js`.**

| module (new name) | from | surfaces | injected collaborators | intra-subsystem deps |
| --- | --- | --- | --- | --- |
| `result-fusion.ts` | `rlm-fusion.ts` | `fuseResults`, `generateScoreExplanation` | — (`RRF_K` → module const) | **none** |
| `graph-stream.ts` | `rlm-synapse.ts` | `buildGraphStream` | (already self-contained) | **none** |
| `session-bias.ts` | `rlm-synapse.ts` | `applySynapseState` | `sessionRegistry`, `synapseManager` | none |
| `hybrid-search.ts` | `rlm-search.ts` + `correctQuery` | `search`, `correctQuery`, `addContextToResults`, `extractPreview`, `calculateAvgScore`, `filterByPatterns` | `keywordSearch`, `vectorStore`, `searchCache`, `analytics`, `queryUnderstanding` | `result-fusion`, `graph-stream`, `session-bias` |
| `project-indexer.ts` | `rlm-indexing.ts` | `indexProject`, `indexFile`, `ensureFreshIndex`, `checkSearchAdmission`, `loadGitignore`, `runWithIndexLock` | `indexManager`, `symbolRepo`, `keywordSearch`, `vectorStore`, `searchCache` | none |
| `index-admin.ts` | `rlm-admin.ts` | `clearProjectIndex`, `getProjectStats`, `warmupCache`, `getAnalytics` | six stores + `fileFilterCache` | `hybrid-search` (`warmupCache`) |

Dependency graph: `hybrid-search → {result-fusion, graph-stream, session-bias}`,
`index-admin → hybrid-search`, `project-indexer` standalone. **Acyclic, and nothing points back
at the root.**

> **Omission corrected, 2026-07-29 (Execute).** This table accounts for **20** of the 21 exported
> functions across the five `rlm-*` files. The twenty-first — **`ensureInitializedImpl`**
> (`rlm-indexing.ts:552`) — appears in no row above. It is not an oversight of substance: §4.5(b)
> already decides that lazy init stays in the root. But it was never written into the module table,
> and consequently `tasks.md`'s first draft gave it no destination either. It reads **8** facade
> members, so anywhere outside `contextual-search-rlm.ts` it fails G-HUB permanently. **Its body
> becomes the literal content of `ContextualSearchRLM.ensureInitialized()` and the export is
> deleted, at tasks.md T10.** Enumerating all 21 exports found no second omission.

### 4.2 Two boundary decisions, and the matrix reason for each

**`correctQuery` moves out of the synapse module into `hybrid-search`.** It has nothing to do
with Synapse. It reads `keywordSearch` (`rlm-synapse.ts:88,98`) — the same collaborator
`hybrid-search` already holds — and its only caller is `searchImpl`. It sits in `rlm-synapse.ts`
by accident of M14's extraction order.

**`buildGraphStream` becomes its own module.** 124 lines reading **zero** facade members. It is
already a free function wearing a delegate's signature. Extracting it is the cheapest possible
demonstration of the target shape.

`rlm-synapse.ts`'s three functions share **no state at all** — `injectedDeps`, `keywordSearch`,
and nothing. They are three modules that were filed together. Splitting them is not
over-decomposition; keeping them together is bundling by accident.

**Rejected: splitting further.** Every remaining module has ≥ 2 surfaces sharing ≥ 1 collaborator.
Going finer creates a coordinator, and a coordinator that everything reads is a hub — which
G-HUB would catch, on the same run, which is the point of having it.

### 4.3 What happens to `ContextualSearchRLM`

**It stays, as a composition root.** Deleting it is not on the table for PR-B: 24 files import it
statically and 2 more dynamically (§7), and R-04 requires PR-B to be independently shippable.

The class keeps its 21 public methods, its constructor signature, **and its public state fields**.
What it loses is the *outbound* coupling: nothing outside it reads anything off it.

```ts
export class ContextualSearchRLM {
  keywordSearch!: KeywordSearch;   // stays public — see 4.3.1
  indexManager!: IndexManager;
  initialized = false;
  // ...
  async checkSearchAdmission(projectId: string, projectPath?: string) {
    await this.ensureInitialized();
    return checkSearchAdmission(this.#indexerDeps(), projectId, projectPath);
  }
  #indexerDeps(): IndexerDeps {          // assembled per call, from current fields
    return { indexManager: this.indexManager, symbolRepo: this.symbolRepo, /* … */ };
  }
}
```

This is a facade. That is not a contradiction of R-03, and G-HUB is what makes the difference
measurable: a facade whose delegates read *it* has `maxForeignReach` 15; a root whose capability
modules have never heard of it has `maxForeignReach` 1. The distinction is not stylistic and not a
matter of judgement — it is one number, produced by a script, at two commits.

#### 4.3.1 The state fields stay public, and the reason overturns this design's first draft

This document's first draft made the ten state members `#private` and claimed the 15
`Visibility relaxed` comments would go to **0**. **That is wrong, and it would have broken 77
tests.** Measured at `ce26f28`:

| member | post-construction assignment sites in tests | member | sites |
| --- | --- | --- | --- |
| `initialized` | **25** | `vectorStore` | 4 |
| `indexManager` | **18** | `searchCache` | 4 |
| `keywordSearch` | 10 | `fileFilterCache` | 4 |
| `symbolRepo` | 7 | `analytics` | 3 |
| `queryUnderstanding` | 7 | `RRF_K`, `injectedDeps` | **0** |

**~80 sites across a dozen test files** write these fields via `(rlm as any).<member> = …` *after*
construction. Only `RRF_K` and `injectedDeps` are untouched — and `RRF_K` becomes a module
constant anyway.

> **Provenance correction, 2026-07-29 (Execute).** This paragraph said "**77** sites across **12**
> files". That number is not verified and should not be quoted: the table above **sums to 82**, and
> under direct measurement over `git ls-files 'packages/core/src/**/*.test.ts'` two rows
> (`keywordSearch`, `vectorStore`) miss by one once the `load.<member> =` assignments in
> `graph-generation-symbol-repository-pg.test.ts` — which are on `LoadStage`, not on the facade —
> are excluded. Three methods, three answers, which is precisely the §3.2 failure mode showing up
> again in a hand-tabulated count. **The constraint is unaffected**: the order of magnitude is
> right and capturing collaborators at construction still silently disables every one of those
> sites. **The sensor is the per-suite pass count** recorded in `tasks.md`, which is exact and
> re-measurable; the site count is provenance, and it is approximate. Of 90 `new ContextualSearchRLM(` sites, only 36 use the constructor seam; the
rest set up state by assignment. `rlm-indexing.test.ts` alone holds 52 of the 77.

The established pattern (`rlm-indexing.test.ts:209-219`) is:

```ts
const rlm = new ContextualSearchRLM({ vectorStore: {} as any, keywordSearch: {} as any } as any);
(rlm as any).initialized = true;                                    // skip ensureInitialized
(rlm as any).indexManager = { getIndexMetadata: async () => null };  // hand-place one collaborator
const result = await rlm.checkSearchAdmission("proj");
expect(result.admitted).toBe(false);                                 // real behavior assertion
```

Two properties of that pattern are load-bearing:

- **`initialized = true` is used to bypass lazy init.** That is what the 25 sites are for. If
  `ensureInitialized` were also responsible for *constructing* the capability modules, setting the
  flag would skip construction and every such test would null-deref.
- **These are real behavior tests, not forwarding tests.** They assert `admitted` / `error` /
  `stale`. GMS-05 AC-3 protects them, and they are worth protecting.

> **Constraint LATE-BIND.** Capability modules must resolve collaborators **at call time** from the
> root's current fields — never capture them at construction. A capability module that captured
> `keywordSearch` in its constructor would ignore every post-construction stub: the test would go
> green while exercising the real collaborator. That is this repository's signature defect class —
> a gate reporting success while measuring nothing — and this design would have introduced 77
> instances of it.

The upside is that **the existing suite is already a sensor for LATE-BIND.** A stub placed after
construction that never gets read makes `expect(result.admitted).toBe(false)` fail, loudly. No new
test is needed to detect the failure mode; the 77 sites detect it. What *is* needed is to run them
and assert the **pass count**, not the exit status.

**Consequence for GMS-05 AC-3:** with late binding, PR-B needs **zero test-file edits**. The
tension between GMS-03 (delegates stop taking the facade) and AC-3 (no test may change) dissolves —
but only under this shape. It was real under the first draft's, and it would have surfaced
mid-Execute as "77 tests to rewrite," which AC-3 forbids.

### 4.4 Capability modules stay functions, not classes

The first draft made each capability a class constructed inside `ensureInitialized`. LATE-BIND
rules that out. Instead each capability stays an exported **function taking a narrow deps record**
that the root assembles per call:

```ts
export async function checkSearchAdmission(deps: IndexerDeps, projectId: string, projectPath?: string)
export async function search(deps: HybridSearchDeps, query: string, projectId: string, options?: SearchOptions)
export function fuseResults(resultSets: SearchResult[][], query: string, explainScores?: boolean)  // no deps at all
```

Each module declares its own narrow interface — `IndexerDeps`, `HybridSearchDeps`,
`SessionBiasDeps` — containing exactly the collaborators §2.1 shows it reads, and nothing else.
That is AS-02's *"capability modules owning only the state they use, with dependencies injected"*,
satisfied literally.

This also satisfies the requirements as written, which the class shape did not do better:

- **GMS-03 AC-1** — no `*Impl` signature begins with the facade instance. Held: the first parameter
  is a narrow record, and `result-fusion` / `graph-stream` take no deps parameter at all.
- **GMS-03 AC-2** — a unit test of one capability constructs it without mocking five factory
  modules. Held: pass an object literal. No `mock.module` and no factory involved.
- **Per-module records, not one shared one.** A single `SearchDeps` passed everywhere would be the
  same hub with a new name; G-HUB (§3.3) measures it and would say so.

### 4.5 `ensureInitialized` — the fork

Six of seven `ensureInitialized` edges vanish once collaborators are passed as deps. The seventh is
the root's own. Two ways to get there:

**(a) Async factory — `await createContextualSearch(deps)`.** Cleanest; deletes lazy init outright.
**Rejected twice over**: it changes the construction contract for all 24 importers (R-04), and it
removes the `initialized` flag that 25 test sites set.

**(b) Keep lazy init in the root, and keep it doing exactly what it does today. ← chosen.**
`ensureInitialized()` resolves the six factories and assigns the six fields — no more. It does
**not** construct capability modules; there are none to construct. Every public method awaits it
first, then assembles its narrow deps record from current field values. Observable initialization
timing is unchanged, which is what "behavior-preserving" has to mean here.

**The delegate-preservation contract must survive, and it is wider than the source comments say.**
The facade's comments (`contextual-search-rlm.ts:127-132, 171-174`) name `concurrent-indexing.test.ts`
and "the characterization test". The measured footprint is **16 monkey-patch sites across 3 files** —
`concurrent-indexing.test.ts` **10**, `contextual-search-rlm.characterization.test.ts` **5**, and
`rlm-search.test.ts` **1** (`:156`, `(rlm as any).ensureInitialized = …`), which no comment
mentions. *(Corrected 2026-07-29 at Execute: this said "4 files". The **16** reproduces exactly
over `git ls-files` across assignment and `spyOn` forms; the file count does not.)* **`ensureInitialized` and `_indexProjectInternal` remain patchable public instance
methods, and internal calls route through `this.`, not through a captured local.**

---

### 4.6 The characterization net is in better shape than the spec assumed

GMS-05 AC-1 reads as if the net has holes to close: *"the characterization inventory must be
completed … and the gaps closed."* An independent inventory of the seven files at `ce26f28`
(`contextual-search-rlm-coverage`, `contextual-search-rlm.characterization`, `rlm-{admin,indexing,search,synapse}`,
`concurrent-indexing`) reports **160 test cases**, and:

> **Every one of the 21 delegate surfaces has real-behavior coverage somewhere in the net. Zero
> surfaces are covered by forwarding tests only.**

The 13 surfaces that `contextual-search-rlm-coverage.test.ts` stubs out are each independently
exercised elsewhere — `search` in `rlm-search.test.ts` (22 cases), `buildGraphStream` in
`rlm-synapse.test.ts` (14), `ensureFreshIndex` in `rlm-indexing.test.ts` (8), and so on.

**The forwarding/behavior split is classification-dependent and is not worth a spec correction.**
`spec.md` says 24 of the 41 cases in `contextual-search-rlm-coverage.test.ts` are forwarding-only;
the independent inventory says 23, differing on whether `loadGitignoreImpl` — a literal one-line
pass-through — counts. A bare `grep -c 'toHaveBeenCalledWith(\s*rlm'` finds only **4**, because
most forwarding assertions are written as return-identity rather than call-args. Three methods,
three answers. The count is not the finding; **"all 21 surfaces have real coverage" is**, and it
does not depend on the classification.

**What the inventory does change is the risk shape.** Not gaps — *single points of truth*:

| surface | sole source of real coverage |
| --- | --- |
| `extractPreview` | `contextual-search-rlm.characterization.test.ts` |
| `calculateAvgScore` | `contextual-search-rlm.characterization.test.ts` |
| `_indexProjectInternal` | `rlm-indexing.test.ts` |

If either file is gutted during the refactor, those three surfaces drop to forwarding-only with no
gate noticing. They are the three to watch, and they are cheap to watch.

**Two further facts that bear on scope:**

- **`graph-stream-project-scope-pg.test.ts` imports `buildGraphStreamImpl` directly from
  `rlm-synapse.js`** and is hard-gated on a live PostgreSQL (`DATABASE_URL` / `MASSA_AI_DEDICATED`).
  It is one of the four GMS-04 rename sites *and* the only file in the net needing a database.
  Rename-only, but it will not run in a plain `bun test`.
- **`index-project-tool.test.ts` and `search-controller.test.ts` `mock.module` the facade
  wholesale.** They test callers, not the facade, and contribute nothing to characterization —
  but they break if `contextual-search-rlm.ts` is renamed, which is one more reason §6 leaves that
  filename alone.

GMS-04's blast radius reproduces the spec exactly: **4 files import an `rlm-*` module directly** —
`contextual-search-rlm.ts`, `rlm-search.ts`, `__tests__/rlm-indexing.test.ts`,
`__tests__/graph-stream-project-scope-pg.test.ts` — plus 3 `mock.module` sites.

**Consequence for Tasks:** the AC-1 precondition is an *inventory to record*, not a body of
missing tests to write. That is materially less work than `spec.md` budgets for, and the saving
should not be quietly spent elsewhere.

---

## 5. Position on R-08

R-08 — *"PR-C is two changes wearing one label"* — is a **PR-C sizing question**. This section
answers it to the depth PR-B can answer it, and states precisely what is deferred and to whom.
It is answered here rather than deferred wholesale because leaving a risk marked *"Open — resolve
in Design"* unresolved in the Design is the same defect AS-02 just exhibited (§1).

### 5.1 The agreed rule of thumb, applied — and then falsified

`spec.md` R-08: *"if the `data → services` work touches more than 3× the files the controllers
move does, the single-PR framing is wrong."*

Measured at `ce26f28`:

| half of PR-C | files touched | detail |
| --- | --- | --- |
| retire `controllers/` | **~30** | 6 controller files moved; 23 files carry a direct `../controllers/*` import (14 tests, 9 sources); `package.json` `"./controllers"` subpath; `CLAUDE.md` + `src/index.ts` header |
| `data → services` cleanup | **~15** | 24 edges across **14** files under `data/`, plus the relocated module(s) |

Ratio **0.5×**, against a 3× threshold. By its own rule, R-08 resolves to *one PR is right*.

**The rule survives; its premise does not, and neither figure is crisp.** `spec.md` states the
controllers retirement *"touches 3-4 files"*; counting importers puts it near 30. The exact number
depends on scope decisions a script has to make, and D3 is not yet committed: a plain
relative-import regex gives **22** files, and whether to include `src/index.ts`'s same-level
`./controllers` barrel re-export and the two dynamic-import sites (`production-wiring.ts`,
`search-session-hook.ts`) moves it between 22 and 30. Treat "~30" as an order-of-magnitude
statement rather than a measurement until D3 lands.

The verdict is robust to all of that. Compared on commensurable units — **files moved** (6
controllers) against **files edited** (14 under `data/`) — the ratio is ≈2.3×, still under 3×, and
still *one PR*. Every defensible framing of the count reaches the same answer, which is the useful
thing to know about it.

### 5.2 What the file counts hide

Per-target importer counts for the six `data → services` destinations:

| module | importers in `services/` | in `data/` | elsewhere | LOC |
| --- | --- | --- | --- | --- |
| `services/query/prisma-client.ts` | 11 | 12 | — | 37 |
| `services/structural/fqn-codec.ts` | 5 | 4 | — | 361 |
| `services/project-identity/alias-resolver.ts` | 10 | 4 | — | 187 |
| `services/search/search-diagnostics.ts` | 6 | 2 | **1 tools, 1 controllers** | 148 |
| `services/search/lexical-search.ts` | 2 | 1 | — | 328 |
| `services/project-identity/identity-guard-installer.ts` | 3 | 2 | — | 155 |

**Every one has more importers inside `services/` than inside `data/`.** So the group is not 24
homogeneous edges. It is two problems:

- **`prisma-client.ts` — 12 of the 24 edges (50%) — is a pure relocation.** A 37-line Prisma
  client singleton living in `services/query/` is unambiguously misfiled persistence.
  Moving it under `data/` turns 12 backward edges into internal ones and its 11 `services/`
  importers into `services → data`, which is **forward and legal**. Mechanically identical in
  kind to the controllers move.
- **The other five are cross-cutting modules with no legal home.** `search-diagnostics.ts` is
  imported by **all four layers** — tools, controllers, services and data. In a strict linear
  stack there is no correct position for it. AS-01's decided contract (`tools → services → data`)
  does not add one.

### 5.3 The consequence, and the deferral

The real seam inside PR-C is not *controllers vs data*. It is **mechanical relocation** (the
controllers move, plus `prisma-client.ts` — ~42 files, no open questions) versus **a contract
extension** (five cross-cutting modules — ~10 files, one unanswered question: *does the layer
contract get a shared/kernel tier, or do those five edges enter the allowlist as accepted
exceptions?*).

That question is GMS-01's, and GMS-01 is PR-C. It cannot be answered here without deciding
PR-C's contract, and GMS-01 AC-1's CI import check cannot be *written* until it is answered —
the check must know whether `data → services/search/search-diagnostics.js` is a violation or a
legal reference to a shared module. Answering it in PR-B's Design would be exactly the silent
absorption the scope boundary forbids.

**Position:**

1. **R-08's rule of thumb is applied and passes** — under every defensible unit pairing (0.5× on
   files-touched, 2.3× on files-moved-vs-files-edited), it is below 3× and says *one PR*. What is
   corrected is its **premise**: `spec.md`'s *"3-4 files"* for the controllers side is roughly an
   order of magnitude low. The rule is not retired; it is noted as insufficient on its own, because
   file count is not where PR-C's risk lives (§5.2). → spec correction §10 C5.
2. **The measurement above is recorded** so PR-C's Design starts from it and does not re-derive it.
3. **The PR-C split decision is deferred to PR-C's Design, with a precondition:** PR-C's Design
   must answer *"where do cross-cutting modules live under the AS-01 contract?"* **before** it
   sizes itself. R-08's status changes from *"Open — resolve in Design"* to *"Deferred to PR-C
   Design with a named precondition (measurement recorded in PR-B design.md §5)"*. It is not
   closed and it is not silently carried.

### 5.4 What this costs PR-B — a hard boundary

Two of the five cross-cutting modules live in `services/search/`, inside PR-B's directory:

- `search-diagnostics.ts` — 2 `data/` importers
- `lexical-search.ts` — 1 `data/` importer

> **PR-B must not move, rename, or change the module path of `search-diagnostics.ts` or
> `lexical-search.ts`.** Either would alter a `data → services` edge and absorb part of PR-C's
> unanswered contract question into a PR that has no requirement covering it.

Both may be *imported* freely. Neither is an `rlm-*` file, so GMS-04 does not reach them.

---

## 6. GMS-04 — the rename

Target names, chosen to describe behavior (§4.1): `result-fusion.ts`, `graph-stream.ts`,
`session-bias.ts`, `hybrid-search.ts`, `project-indexer.ts`, `index-admin.ts`.

`contextual-search-rlm.ts` **keeps its name in PR-B.** It is not an `rlm-*` file, GMS-04 AC-1
does not require it, and renaming it would repath all 26 fan-in sites for zero structural gain.
GMS-04 AC-3 (`rg 'rlm-'` returns only CHANGELOG and `.specs/`) is unaffected — the hyphenated
prefix is what that pattern matches.

**GMS-04 AC-4 is partly obsolete and one of its clauses has inverted.** AC-4 names three
non-source sites and calls `benchmarks/needles/fixtures/massa-ai.json` the critical one, because
it *"pins 4 needle targets to `services/search/rlm-fusion.ts` and `services/search/rlm-search.ts`
by path."* PR-A removed that:

```
needles: 14
top-level keys: id, category, difficulty, query, expected, rationale
expected.* keys: anchor, startOffset, endOffset
needles containing a filePath: 0
needles with a content anchor: 14
```

All 14 are content-anchored; `run.ts` resolves anchor → path at runtime. **The rename is now
invisible to the fixture, and that AC-4 clause is dead.** The other two sites —
`docs/ONBOARDING.md` (3 places, including the layer-4 tour entry) and `CLAUDE.md:157` — still
stand.

### 6.1 The residual PR-A did not remove — and it is sharper than the one it did

The anchors are **content**, and PR-B rewrites content. Four of fourteen needles — **29% of the
corpus** — anchor to lines inside PR-B's blast radius:

| needle | file today | anchor (exact, unique in its file) |
| --- | --- | --- |
| `N03-keyword-boost-code-query` | `rlm-fusion.ts` | `const KEYWORD_BOOST = isCodeQuery ? codeKeywordBoost : 1.0;` |
| `N04-rrf-vector-blend` | `rlm-fusion.ts` | `const rrfNormalized = rrfScore / maxRrfScore;` |
| `N05-centrality-rerank-bonus` | `rlm-fusion.ts` | `const normalizedScore = Math.min(1, combinedScore * (1 + 0.2 * centralityScore));` |
| `N06-minscore-on-raw-vector` | `rlm-search.ts` | `rerankedTop = applyProximityRerank(rerankInput, query);` |

PR-A converted a missing target from a silent `[warn]`+zero into a **hard failure**. That is
strictly better, and it means a reflow that touches one of these four lines now stops the gate
outright rather than reporting a phantom retrieval regression.

> **Constraint FROZEN-ANCHOR.** These four strings are frozen text in PR-B. Moving them between
> files is safe — resolution is by content. Reformatting, renaming a local, or re-wrapping them
> is not. If one genuinely must change, updating the fixture is a **sensor edit** and needs its
> own justification recorded in `tasks.md`; it is not a free fix-up.

Three of the four are in `rlm-fusion.ts` — the module the matrix marks most separable (one
member, `RRF_K`). The cheapest first extraction is also the one the retrieval sensor is watching
hardest. Extraction itself does not touch the four lines; only reflow would.

---

## 7. Baseline, and what PR-B must not disturb

All four re-derived figures in `spec.md`'s Evidence table reproduce at `ce26f28` via D3 (§8) —
the baseline has not drifted since `a6216cd`:

| figure | spec (`a6216cd`) | measured (`ce26f28`) |
| --- | --- | --- |
| fan-in, static | 24 | **24** |
| fan-in, incl. dynamic | 26 | **26** |
| dynamic sites | `scripts/beir-benchmark.ts`, `scripts/symbol-benchmark.ts` | **both, confirmed** |
| fan-out, distinct specifiers | 19 | **19** |

> **Method warning, learned the expensive way.** `grep` in this environment is a shell function
> dispatching to `ugrep` with `--ignore-files`, so it honours `.gitignore` and skips `dist/`;
> `rtk proxy` reaches real BSD grep, which does not. The same pattern gives different answers
> through the two paths, and nesting quotes through `rtk proxy` degenerated one regex into 8901
> phantom hits. **Every figure in this document comes from a script over `git ls-files`, not from
> ad-hoc shell.** This is independent support for GMS-03 AC-3's insistence that the counting
> method be executable rather than described.

---

## 8. Deliverables

| id | file | purpose | required by |
| --- | --- | --- | --- |
| **D1** | `scripts/search-facade-matrix.ts` | member→consumer matrix (§2); regenerable | AS-02's artifact; §4 boundary |
| **D2** | `scripts/search-hub-metric.ts` — **written in this Design phase, committed at Execute T0** | `maxForeignReach` over every declared type, any dir | **G-HUB**, R-03 |
| **D3** | `scripts/search-facade-metrics.ts` | fan-in / fan-out over `git ls-files`; also settles §5.1's importer count | GMS-03 AC-3 |

D2 and D3 run at the pre-change commit and at the PR head; both readings go in `validation.md`.
All three take a directory argument and hardcode nothing about `rlm-*`, so they survive the
rename and remain usable for PR-C and PR-D.

**Unit-tested, not just committed.** A measurement script that silently mis-measures is this
repo's documented defect class, and D1's first draft did exactly that (§2). Each ships with a
fixture asserting a known non-trivial count.

---

## 9. Risks this design introduces

| id | risk | mitigation |
| --- | --- | --- |
| **D-R1** | The composition root is judged "just another facade" | G-HUB decides it numerically, not by argument. Root passes at `maxForeignReach ≤ 1`; today's facade is 15. |
| **D-R2** | `#private` state breaks the monkey-patch contract, and the tests keep passing while testing nothing | Privatize the **10 state members** only. `ensureInitialized` / `_indexProjectInternal` stay public patchable instance methods; internal calls route through `this.`. Verified by running `concurrent-indexing.test.ts` and asserting its **pass count**, not its exit status. |
| **D-R3** | Reflow breaks a frozen needle anchor → hard gate failure | FROZEN-ANCHOR (§6.1). Grep the four exact strings as a pre-commit check on every structural task. |
| **D-R4** | Six modules from five looks like churn for its own sake | Each split is matrix-justified (§4.2): `rlm-synapse.ts`'s three functions share zero state. G-HUB catches over-decomposition on the same run. |
| **D-R5** | Injecting `IndexManager` (F4) is the one *new* seam and could change init order | Smallest possible change: add the `injectedDeps` field, default to today's direct construction. Behavior-identical when nothing is injected. |
| **D-R6** | PR-B silently absorbs PR-C's `data → services` question | §5.4 hard boundary: `search-diagnostics.ts` and `lexical-search.ts` are not moved or renamed. |
| **D-R7** | The characterization net is thinner than coverage suggests | Owned by GMS-05 AC-1; inventory is a Tasks precondition, not an Execute discovery. 24 of the facade's 41 tests are forwarding-only and protect nothing once the wrapper is gone. |

---

## 10. Spec corrections owed

> **All twelve were applied to `spec.md` at T19** (2026-07-30), in place at each criterion or figure,
> indexed there under *Design and Execute corrections (C1–C12)*. **The rows are kept, not struck** —
> `spec.md` carries the amended text and a one-line summary; this section keeps the rationale, and
> deleting it would leave the summaries pointing at nothing. Verified by a per-correction
> discriminating pair (old text absent **and** new text present), recorded in `tasks.md` →
> *Gate check commands*.

`spec.md` is amended for each of these; none re-opens a locked assumption.

| # | Location | Correction |
| --- | --- | --- |
| C1 ✅ | Status line, AS-02 | `design.md` now exists. AS-02's *"Settled in `design.md`"* was a forward reference written in the past tense; the matrix it cites was built and its statistics reproduce (§1). AS-02 stands. |
| C2 ✅ | AS-02 | *"13 of ~16 facade members"* → **13 of 23** distinct members read by the delegates. The class declares 11 state members and 21 methods; `~16` has no method behind it. |
| C3 ✅ | GMS-05 AC-4 note 3 | *"Each observation costs roughly 90 minutes and a local Ollama"* → **~2 minutes locally.** 90 min is `needles-gate.yml`'s 2-core CI estimate, carried into a local-cost table. Falsified in PR-A. |
| C4 ✅ | GMS-04 AC-4 | The `benchmarks/needles/fixtures/massa-ai.json` clause is **obsolete** — PR-A content-anchored all 14 needles and removed every `filePath`. Replace with FROZEN-ANCHOR (§6.1): four anchors are inside PR-B's blast radius as **content**, and a hard failure now, not a silent zero. |
| C5 ✅ | R-08 | Rule of thumb **applied and passed** (0.5× on files-touched, 2.3× on files-moved-vs-edited; both under 3×). Its **premise** is corrected: *"3-4 files"* for the controllers side is ~an order of magnitude low. Recorded as insufficient on its own — the group is two problems, not one (§5.2). Status → *deferred to PR-C Design with a named precondition*. |
| C6 ✅ | R-03 | Status stays Open (PR-B has not shipped) but gains the falsifier: G-HUB, calibrated on M14 — `maxForeignReach` **1 → 14** and `members` **26 → 24** while host LOC fell 1668 → 463 (§3). Note the direction: M14 did **not** widen the type; it redistributed reach. |
| C7 ✅ | Evidence table | Add: `data → services` is 24 edges across **14** files (spec says 12 for the `getPrismaClient` subset alone — that part is correct and confirmed at 12). |
| C8 ✅ | §7 and `spec.md`, dynamic importers | The two dynamic importers are cited as `scripts/beir-benchmark.ts:258` and `scripts/symbol-benchmark.ts:213`, recorded as *"both, confirmed"*. **Neither path exists.** They are `packages/core/src/scripts/{beir,symbol}-benchmark.ts` at `:259` and `:214`. The count is right — 24 + 2 = 26 — and the citation was never checked against the filesystem. Measured by D3 at T2, which pins the real paths in a test. |
| C9 ✅ | §5.1, controllers importers | §5.1 names **two** dynamic `controllers` importers. There is **one** (`production-wiring.ts`); `search-session-hook.ts:21` is a plain static import. Measured: 6 members, **22 deep + 1 barrel (`src/index.ts`) + 1 dynamic = 24** outside importers, against §5.1's "~30" and "between 22 and 30" and `spec.md`'s "3-4 files". Settles the range rather than narrowing it. |
| C10 ✅ | GMS-04 AC-3 | *"`rg 'rlm-'` returns only CHANGELOG and `.specs/` history"* is **unsatisfiable, and was corrected twice before it was replaced**. Phase 0 measured **320** occurrences in three tracked, generated `.ua/` artifacts whose regeneration is deferred past PR-C; the 2026-07-29 narrowing to *"zero hits outside `CHANGELOG.md` / `.specs/` / `.ua/`"* was measured unsatisfiable again at T15, because every extraction deliberately added a provenance comment naming its deleted `rlm-*.ts` source (six files carry nothing else), and because `contextual-search-rlm-coverage.test.ts` carries `rlm-` in its own filename, which §6 keeps on purpose. **Replace the criterion with the sensor**: `scripts/check-stale-pointers.ts` exits 0 when no `rlm-*` or `search-facade-*` pointer is `BROKEN` **and** the `HISTORICAL` count sits exactly on its pin. Counting a string measures a *population*; the requirement was always about a *pointer that misleads a reader*. Added at T15 — see `tasks.md` → *Twelfth plan defect* and *Fourteenth plan defect*. |
| C11 ✅ | GMS-05 AC-4 note 2 | *"the evidence is that per-needle ranks are unchanged across the refactor"* is **unattainable for this PR, and for any PR that renames a file the needles corpus covers**. `smart-chunker.ts:62-70` prepends `// File: <relativePath>` to every chunk before it is embedded, and a `// Section: <label>` line repeated three more times whose label is the body's enclosing symbol. Both are naming, both enter the embedded text, and rank is a function of the cosine score computed over that text — so renaming a file or de-facading a symbol perturbs every score in it, and two adjacent chunks can swap. Measured at T17: `N05-centrality-rerank-bonus` went rank 5 → 6 while its target chunk's own top score was **byte-identical**, because a rival chunk overtook it across a **0.0134** margin. **Replace the criterion with the controlled comparison**: `scripts/needles-rename-control.ts` exits 0 when no needle is below its baseline rank once the file-path label is held at its baseline value. Note 2's *intent* — a floor pass hiding three needles slipping 1 → 4 is a regression that passed — is unchanged and still enforced; only the claim that raw rank equality is achievable is corrected. Added at T17 — see `tasks.md` → *Seventeenth plan defect*. |
| C12 ✅ | GMS-03 AC-3 | *"fan-in and fan-out are **both lower** after the change than before"* **fails on the shipped tree, and no tree this PR could produce would satisfy it.** Measured with one method at both commits — D3 `search-facade-metrics.ts` against the frozen `d628464` baseline in `facade-metrics-before.json` — fan-in falls **24 → 23** static and **26 → 25** including dynamic, and fan-out **rises 19 → 21**. The cause is the decomposition itself and is exact, not statistical: the facade sheds **4** `rlm-*` delegate imports and gains **6** capability-module imports, net **+2**. A split that replaces one delegate with N modules necessarily raises distinct-specifier fan-out, so requiring fan-out to fall is requiring the split not to happen. **Replace the criterion with the coupling measures that carry its intent**: D2 `maxForeignReach` on `ContextualSearchRLM` **14 → 1** with exit **1 → 0**, foreign modules **6 → 1**, D1 `delegateScope` **21 → 0**, facade-taking **15 → 0**, scoped LOC **1550 → 0**, and D3 fan-in. Fan-out is **reported, not a floor**. R-03's failure mode is a *facade*, and **depth** of reach is what distinguishes one from a set of capability modules; fan-out measures **breadth**, which a real split is supposed to increase — which is exactly the asymmetry C6 records about M14, where a fan-in/fan-out reading called that split a success and G-HUB called it a failure. Added at T19 — the **nineteenth plan defect**, and the first found by a scoped plan critic reading the spec against the shipped tree rather than by executing a task row. See `tasks.md` → *Nineteenth plan defect*. |

Both C8 and C9 are provenance errors: the counts hold, the citations behind them were never
verified against the tree. Found at T2 and recorded here rather than fixed in place, so T19
applies them to `spec.md` as one reviewed change.

**C11 was added at T17 and is the second row T19 must not skip, for the same reason as C10.** T20's
verifier reads `spec.md`. As GMS-05 AC-4 note 2 stands it requires per-needle ranks to be unchanged;
the shipped tree has one needle at 6 against a baseline of 5, so a verifier checking the criterion
**as written** marks AC-4 failed against a tree that satisfies what the criterion meant. The T19 row
in `tasks.md` moved from C1–C10 to C1–C11 at T17, and to **C1–C12** at T19 itself.

**C10 was added at T15 and is the row T19 must not skip.** Nothing in this section owned GMS-04 AC-3
before it — C4 covers only AC-4's obsolete needles clause — and T20's verifier reads `spec.md`. As
things stood it would have checked AC-3 **as written**, found the criterion unsatisfiable, and marked
it failed against a tree that satisfies the requirement the criterion was trying to express. The T19
row in `tasks.md` also scoped itself to *C1–C7* while this section has held **C1–C9** since Design;
both are corrected there.

---

## 11. Out of scope for PR-B

Restating the spec's boundary with what this Design adds:

| item | owner |
| --- | --- |
| Layer contract, `controllers/` retirement, CI import check | PR-C (GMS-01, GMS-02) |
| `data → services` cleanup, incl. the cross-cutting-module question | PR-C (GMS-01 AC-4) |
| `tools/read_file.ts` split | PR-D (AS-06) |
| `GraphController` / `TracePathTool` divergence | **its own change** — R-07; unifying it is a behavior change |
| `ExecuteTool` / `ExecuteFileTool` / `BatchExecuteTool` dead exports | not PR-B; noted in `spec.md` |
| Moving or renaming `search-diagnostics.ts`, `lexical-search.ts` | **PR-C** — §5.4 |
| Renaming `contextual-search-rlm.ts` | not required by GMS-04; 26 fan-in sites for no structural gain |
| Fusion/RRF weights, cache layers, retrieval tuning | `spec.md` Out of Scope — unchanged |

---

## 12. Open items handed to Tasks

1. **Characterization inventory — largely done, record it** (GMS-05 AC-1). §4.6 establishes that
   all 21 surfaces already have real-behavior coverage and no surface is forwarding-only. What
   Tasks owes is the written record plus watches on the three single-points-of-truth
   (`extractPreview`, `calculateAvgScore`, `_indexProjectInternal`). Coverage percentage is not
   evidence — the facade sat at 100% line coverage while a large share of its tests could not
   detect a behavior change.
2. **Needles before-baseline on clean `main`**, diffed programmatically against
   `benchmarks/needles/reports/massa-ai-after-t5b-recovery-results.json` (captured at `5e018e5`;
   three commits have landed since). Compare hit lists and score vectors, **not** the printed
   table. ~2 min per run (C3).
3. **D1–D3 written and unit-tested first**, before any structural commit — G-HUB needs a
   pre-change reading and cannot be taken retroactively.
4. **Task ordering follows the matrix**, cheapest-and-most-separable first: `result-fusion`
   (1 member, a constant) → `graph-stream` (0 members) → `session-bias` → `project-indexer` →
   `index-admin` → `hybrid-search` (13 members, last, because everything else must exist first).
5. **`IndexManager` seam (F4)** is its own task — it is the only *added* seam in PR-B.
6. **Rename lands with the module it renames**, per AS-03 — not as a trailing sweep commit.

---

## 13. Plan Challenge record

Gate: **full The Fool**, mode **`evidence_audit`** (policy `mode: auto`; the mode-selection guide
maps "data-driven conclusion" there, and this design's load-bearing content is measurements the
author produced plus a metric the author invented). Two read-only critics ran in parallel: a
`plan-critic` evidence audit of the whole document, and an adversary whose sole objective was to
break G-HUB. Policy `serious_findings: revise_plan` — every critical and high finding below was
incorporated before this document was finalized.

| # | severity | finding | disposition |
| --- | --- | --- | --- |
| 1 | critical | D1–D3 do not exist in the repo, so "produced by a script" is unverifiable | **Partially revised — and the disposition was itself wrong.** D2 was *written* with 13 unit tests, and this table claimed that closed the finding by committing it. It did not: the file stayed untracked and `git log --all` was empty until Execute T0. The header now states D1/D3 provenance honestly, and the "committed" claims are corrected throughout. **The finding was real and its closure was overstated** — see the provenance correction at the top of this document. |
| 2 | critical | §3's M14 calibration table does not reproduce: `members` and `maxForeignReach` both wrong | **Revised.** Reproduced independently; the metric had **four** defects (§3.2). Corrected table: members 26 → 24 → 24, reach 1 → 14 → 14. |
| 3 | high | §1's "three independent statistics" overstates independence — they are projections of one artifact | **Revised.** §1 now says so plainly and re-grounds AS-02 on direct re-derivation instead. |
| 4 | medium | §5's "rule of thumb retired" overstates: applied with commensurable units it passes and agrees | **Revised.** §5.1/§5.3/C5 now say *applied and passed*; only its premise is corrected. Importer count relabelled order-of-magnitude pending D3. |
| 5 | low | `rlm-synapse.ts:84` cites the declaration, not the read | **Fixed** → `:88,98`. |
| A | — | **G-HUB broken twice**: an aggregate holder under another name, and a class rename giving a vacuous 0/0 pass | **Revised.** The gate no longer names a type; it enumerates every declaration. Both evasions now fail, and both have regression tests. |
| B | — | The gate's third evasion (N individual parameters instead of one object) survives | **Accepted risk, stated.** §3.4 records G-HUB as necessary-not-sufficient with GMS-03 AC-2 as the compensating control. |

**Two findings the author caught before the critics reported**, both of which changed the design:

- **The `#private` plan was wrong.** 77 post-construction state assignments across 12 test files
  would have broken, and injecting collaborators at construction would have made those stubs
  silently ineffective — 77 instances of this repo's signature defect. → §4.3.1, constraint
  LATE-BIND; capability modules became functions taking narrow per-call deps records (§4.4).
- **Four of fourteen needle anchors sit inside PR-B's blast radius as content**, which PR-A's
  fixture repair does not cover. → §6.1, constraint FROZEN-ANCHOR.

**What the critics checked and could not falsify:** FROZEN-ANCHOR's four anchor strings are unique
and present, and `benchmarks/needles/run.ts` genuinely `process.exit(1)`s rather than warning; the
15 `Visibility relaxed` comments reproduce; §2's matrix reproduces exactly by hand, including
`buildGraphStreamImpl`'s deliberately-unused `_rlm` scoring 0; no destructuring, aliasing, or
computed-access false negatives in the matrix method.

**Residual risk after the gate.** The metric that anchors R-03 was wrong four times and is right
now only because it was attacked from three directions. D1 and D3 have had no equivalent
adversarial pass and their numbers should be treated as provisional until they ship with tests.
