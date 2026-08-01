# Core Layering — `read_file.ts` Split (PR-D) — Tasks

- **Slug**: `core-layering-read-file-split` · **PR-D**, the last of four
- **projectId**: `massa-ai` · **workflowSessionId**: `spec-core-layering-read-file-split`
- **Specify**: `spec.md` (`a866537`, `183573c`) · **Design**: `design.md` (`d7091ac`) — both on
  `spec/pr-d-read-file-split`, **not yet on `main`**
- **Base**: `main` @ `f06b01d` (the v1.17.0 release bump on PR-C's merge `2bea11e`)
- **Status**: **Tasks complete**, 2026-07-31. **Full Plan Challenge gate run** (§7). Execute not
  started.
- **28 task rows (T1–T25, with T4 split into T4a/T4b and two tasks the Plan Challenge gate
  added — T14b and T20b), eight phases, 78 distinct files** as planned.
  §1's table is the planning estimate;
  read it against **R-25** (PR-C planned 104 and shipped **222**, 2.1×) and leave it as written when
  the measured outcome diverges — the divergence is the record.

Design left **one** thing open (§7's cut) and named **four** steps that cannot be taken
retroactively (§11). This document resolves the first, sizes the work into tasks with measured
write sets, and records the second — including the one whose stated ordering does not hold.

**Eleven corrections come out of the measurement this document required**, before the Plan
Challenge gate ran. They are §3.5, and three of them change what a task does rather than what a
reader believes.

---

## 1. The cut decision — **one PR, eight phased commits**

`design.md` §7 recorded rather than resolved this, on PR-C's precedent, because resolving it needs
the per-task write sets only Tasks produces. Those sets are now measured, repo-wide over
`git ls-files` (**884** tracked code files, **2258** tracked files total), at `d7091ac`:

| phase | files in write set | of which new | composition |
| --- | --- | --- | --- |
| **0 — instrument before moving** | **5** | 5 | 4 new characterization suites + this document |
| **1 — the gate** | **3** | 2 | `check-tools-thin.ts` + its unit suite + this document (T5's reading) |
| **2 — LRU** | **7** | 2 | `services/cache/lru-evict.ts` + its unit test + **4** repointed sites + `read-file.test.ts` |
| **3 — the extraction** | **13** | 12 | `read_file.ts` + **6** modules + **6** module suites |
| **4 — `index_project.ts`** | **9** | 6 | 1 handler + **3** modules + 3 module suites + **2** test repoints |
| **5 — the gate goes green** | **1** | 0 | `.github/workflows/ci.yml` |
| **6 — the rename** | **29** | 0 | **7** `git mv` + **19** external importers + **3** prose/fixture sites |
| **7 — the record** | **16** | 1 | RFS-04's 5 + RFS-05's 9 + `design.md` (T20b) + `validation.md` |
| **sum** | **83** | **28** | |
| **distinct union** | **78** | | against PR-C's planned **104** and PR-B's **37** |

**The phases are not disjoint, and the sum is not the review surface.** Measured: **5** files are
touched by two phases each, which is what takes 83 to 78.

| overlap | files |
| --- | --- |
| Phase 0 ∩ Phase 1 (**1**) | **this document** — created at Phase 0, and T5 writes the frozen reading into it. Reported by the Plan Challenge gate (§8, evidence finding 2); the first draft's per-phase rows omitted it and it self-cancelled in the union, which is how it survived a check that only verified the total |
| Phase 2 ∩ Phase 3 (**1**) | `packages/core/src/tools/read_file.ts` — the LRU repoint, then the extraction |
| Phase 6 ∩ Phase 7 (**3**) | `scripts/check-coverage.ts`, `scripts/__tests__/check-coverage.test.ts`, `CLAUDE.md` |
| Phase 6 ∩ Phases 0–5 | **none** — measured, and it is what made Phase 6 the cut candidate |

**Decision: PR-D ships as one PR, planned and committed as eight independently-revertable phases,
carrying its own `.specs/` artifacts (Specify, Design, Tasks) and its `validation.md`.**
**Decided by: the user, 2026-07-31**, from three options presented with the figures above.

**Options rejected, and why:**

1. **Two PRs — the work, then the rename.** D1 = Phases 0–5 + 7 (**52** files), D2 = Phase 6
   (**29**). The strongest challenger, because Phase 6 shares **0** files with Phases 0–5 and is the
   one group Design recommended *against* taking at all (§1.3 option 1, overridden by the user).
   **Rejected**: the 3-file Phase 6 ∩ Phase 7 overlap makes D2 a rebase on D1 rather than a parallel
   branch, so the split buys sequencing, not independence — and it doubles the review and release
   cycles for a behavior-preserving refactor.
2. **Three PRs — code / rename / record.** D1 = Phases 0–5 (**36**), D2 = Phase 6 (**29**), D3 =
   Phase 7 (**16**), with code ∩ rename and code ∩ record both **0**. **Rejected on the same ground
   PR-C rejected its own three-PR option**: three review cycles and three auto-cut releases for one
   refactor, where **AS-05** already sized this as one of four PRs rather than as three of six.

### 1.1 What the one-PR choice obliges, and these are not optional

Inherited from PR-C §1 and re-scoped to PR-D's sensors:

- **Each phase is its own commit range and must be green on its own.** A phase that only compiles
  once a later phase lands is not a phase. This is also why RFS-01's unit suite must use **synthetic
  fixtures only** (`design.md` §6.6 property 5) — a live-tree `2 of 30` assertion written at Phase 1
  goes red at Phase 3 and makes this promise false.
- **`check-core-layering` runs per structural commit, recording `edgesExamined`, not the pass bit**
  (RFS-03 AC-1). The bit carries no information here: `FORBIDDEN.tools` is `[]`, so the gate reads
  `PASS` before, during and after — that is **C28** restated. Re-derived at `d7091ac`:
  `PASS — 0 violation(s) across 965 tier-to-tier edges in 896 tracked files`, byte-for-byte what
  `design.md` §5.4 records.
- **`--no-ff`, and it is load-bearing twice over (R-04, R-27).** RFS-01 AC-3's frozen base is a claim
  about **history**; a squash makes ancestry and byte-identity unreconstructable, which is also the
  evidence shape RFS-02 AC-1 and RFS-06 AC-1 both depend on. **The risk is the default button, not
  the recent record, and the inherited figure said otherwise.** `HANDOFF.md` carries
  *"PR #53 is the only non-squash in the last nine merges"* — measured **before PR-C's four PRs
  landed**, and stale since. Re-derived over `git log --first-parent main -11`: **6 of the last 11
  first-parent commits are merge commits** (#53, #54, #56, #57, #58, #59), 4 are release bumps and
  **1** is a squashed PR (#52). Every PR-C PR honoured `--no-ff`. **R-04 stands on the default
  merge button being squash, which is unchanged** — not on a bad recent record, which is not what
  the tree shows.

### 1.2 The PR carries its own artifacts, so the `no-changelog` label is **not** used

**Decided by: the user, 2026-07-31.** Specify, Design and Tasks stay on this branch and merge with
the code. Consequences, stated because two of them are traps:

- **The `no-changelog` label is wrong here and must not be applied.** #56's precedent covers a
  `.specs/`-only PR; this PR edits `CHANGELOG.md` (T22), so the merge gate is satisfied by the entry
  itself. Applying the label as well would suppress the release this PR is supposed to cut.
- **The branch is based on `main`, not stacked**, so `ci.yml`'s `pull_request: branches: [main]`
  fires and all six required checks run. `HANDOFF.md`'s branch-name correction records what a
  stacked base costs: **zero** gate readings.
- **Rejected: three `.specs/`-only PRs on PR-C's per-phase precedent.** PR-C shipped Specify (#56)
  and Design (#57) separately, and that is genuinely the more reviewable shape for the artifacts.
  Rejected because Specify and Design are **already two commits on one branch**, so honouring the
  precedent now means rewriting published-to-nobody history to buy a review split for documents that
  cannot be read independently of each other.

---

## 2. RFS-04 AC-2 — the CHANGELOG heading, chosen before merge

RFS-04 AC-2 requires the choice made deliberately, **per item**, with who chose and what was
rejected written down — **R-10's shape**, and PR-D is its second application.

**Decision: `### Changed` **and** `### Removed`, both filed, deriving a minor.**
**Decided by: the user, 2026-07-31.**

**The premise PR-C's record supplies does not hold here, and it was checked before the options were
put.** PR-C `tasks.md` §2 frames the alternative as *"`### Removed`, cutting a major."*
`CONTRIBUTING.md`'s heading→bump table says `### Removed` derives a **minor**, identically to
`### Changed`; *"major versions are never bumped automatically; cutting a `2.0.0` is a deliberate
manual `package.json` edit."* PR-C's sentence is true of strict semver and false of this repo's
derivation. **So the two headings cost the same version and the choice is about the accuracy of the
record, not about the bump** — which is the opposite of how PR-C's decision was framed.

Per item, on RFS-04's own reachability table:

| item | reachable from a published entry point | heading |
| --- | --- | --- |
| `IHybridSearch` | **yes** — `@massa-ai/shared` `exports["."]` | `### Removed` |
| `BatchCommand` | **yes** — `@massa-ai/core` `exports["./tools"]` | `### Removed` |
| `data/vector/index.ts` | **no** — there is no `./data` subpath | `### Removed`, noted as unreachable |

**Rejected:**

1. **`### Changed` alone.** PR-C's literal precedent, and defensible on **0** measured consumers for
   all three. **Rejected because it understates the two items that *are* reachable from a published
   entry point** — which is the distinction RFS-04 AC-2 exists to price, and folding all three under
   one heading is exactly the blanket treatment the Plan Challenge gate corrected in Specify
   (finding 6).
2. **`### Removed` plus a deliberate major.** Strict semver for removing two published-reachable
   symbols. **Rejected on PR-C's measured ground**: zero consumers by every method tried — static
   import, dynamic `import()`, `mock.module`, string-built specifier, both transports — and a major
   on surfaces nobody imports prices the change wrong. It would also be this umbrella's first major,
   for a behavior-preserving refactor.

---

## 3. The four non-retroactive steps — **three are Phase 0, and the first is not**

`design.md` §11 names four things that cannot be taken after the fact. They are **not** all takeable
before everything else, and the ordering §11 implies does not hold for one of them.

### 3.1 The dependency §11 does not state

**RFS-01 AC-3's frozen base reading cannot precede the instrument that takes it.**
`scripts/check-tools-thin.ts` does not exist. PR-C's T0 had no such problem — `check-stale-pointers`
had already shipped, so its base reading really could be taken first. Here the reading is
**T5**, inside Phase 1, immediately after the script is written.

**The constraint that is load-bearing survives intact**: the reading must precede the **first
extraction commit**, which is **T9**. Phases 1 and 2 move no `tools/` file — Phase 2 edits
`read_file.ts` but adds and removes none, so the population the reading describes is unchanged
between T5 and T9.

**So the four are: T1, T2, T3 (Phase 0) and T5 (Phase 1).** §11's item 4 — R-31's `handle()`
characterization, which the gate re-scoped from verification to authorship — is **T3**, its own task
line, not a bullet on another task.

### 3.2 None of the four is taken in this document

PR-C's `tasks.md` §3 could record its two readings as *already taken*, because both instruments
existed and no structural work preceded them. **PR-D's cannot**: three of the four are new test
files (authorship, not measurement) and the fourth needs a script nobody has written. This section
therefore specifies them; **T1, T2, T3 and T5** take them.

### 3.3 What the frozen base reading must record (T5)

Per `design.md` §6.6 property 2, **per member, not per file** — every regex detector tried got the
per-file verdict right and the per-member count wrong, so `2 of 30` alone is not evidence the
instrument works:

| file | maximal bodies outside `handle()` | `Map`/`Set` instance fields | `handle()` body |
| --- | --- | --- | --- |
| `tools/read_file.ts` | **13**, each with its line span | **2** (`fileCache`, `projectRootCache`) | **175** |
| `tools/index_project.ts` | **3**, each with its line span | 0 | **128** |
| the other 25 handlers | **0** | **0** | ≤ 113 |
| `serialize.ts`, `serialize-interfaces.ts`, `index.ts` | n/a — no `IToolHandler` class | n/a | n/a |

Population premises re-derived at `d7091ac`, all holding: **30** tracked files under
`packages/core/src/tools/`, all `.ts`; **27** declare `handle()`; the same **27** name
`IToolHandler`; **3** declare neither. Readings are `2 of 30` on the body/`Map` clauses and
`2 of 27` on the `handle()` clause, **the same two files**, and the record must say that the third
clause flags no file the other two miss — its value is prospective (`design.md` §6.6 property 2).

**Name the metric**: the baseline counts **maximal** bodies — a body not contained in another
flagged body. An AST walk descending into nested arrows reports **18** for `read_file.ts`, not 13.

### 3.4 What Phase 0's three suites must pin (T1–T3)

| task | requirement | subject | the property that makes it non-retroactive |
| --- | --- | --- | --- |
| **T1** | RFS-02 AC-1, AC-4 | the four cache sites + the `projectRootCache` rename/merge pin | written from the new shape, a test cannot detect that the old shape did something else (R-02) |
| **T2** | RFS-06 AC-1 | the three containment mutation shapes `spec.md` §5 measured unguarded | must pass against the **pre-extraction** code, or it proves nothing about the move |
| **T3** | R-31, GMS-05 AC-1 | `recommendations` (**0** assertions in any of the four suites; **4** `.push(` sites at `:304`, `:318`, `:326`, `:333`, each emitting one literal string) and the `tokens` / `savingsPercent` / `compressionRatio` block (assertable today only through `e2e/08.search`, which needs a live PostgreSQL) | **R-26**: once `coverage` goes red on nine new files, "write tests" becomes "write tests fast" |

### 3.5 Eleven corrections from the measurement this document required

Found by measuring, before the Plan Challenge gate. **Three change what a task does.** They are
Tasks-level corrections to `design.md`, not new parent-spec C-numbers, except where marked.

1. **The frozen reading's ordering — §3.1.** *Changes what a task does.* §11 item 1 cannot be Phase 0.
2. **R-32 undercounts by two.** `design.md` R-32 names `scripts/__tests__/check-coverage.test.ts` as
   the one file Phase 6 and Phase 7 share. Measured, the intersection is **3**: also
   `scripts/check-coverage.ts` (`:279`, a docblock citing `src/services/graph/graph-queries.ts`) and
   `CLAUDE.md` (`:237`, the naming-trap note Phase 6 rewrites, while Phase 7 edits the same file's
   migration and package figures). *Changes what a task does* — **T18** sequences after **T21**.
3. **RFS-02 AC-1's "unmodified" property is unachievable for the test that already characterizes the
   LRU.** `read-file.test.ts:265-272` reaches into `ReadFileTool`'s **private** `fileCache`,
   `projectRootCache`, `evictOldest` and `FILE_CACHE_MAX_ENTRIES`. `evictOldest` moves at Phase 2 and
   both Maps at Phase 3, so that test **must** be rewritten — it cannot be both a characterization
   and byte-identical across the move. *Changes what a task does*: T1's suites are **new files
   written against a surface that survives the move**, and repointing the existing test is **T6**, a
   GMS-05 AC-3 case (repointed, not weakened, not deleted).
4. **`design.md` §6.6 property 1's stated mechanism does not apply to this gate.** It says the gate's
   *"own two files are invisible to it while untracked."* They are not in its population at all:
   `check-tools-thin.ts` filters to `packages/core/src/tools/` and its own files live under
   `scripts/`. `check-core-layering.ts:185-189` enumerates `git ls-files` repo-wide and *then*
   filters by tier prefix, which is why its own files were never the issue either. **Stage before
   reading anyway** — it is free and the habit is what caught two prior misses — but the real
   precondition is that nothing adds or removes a file under `packages/core/src/tools/` before T5,
   and PR-D adds none.
5. **The LRU population is 8 sites, not 4, and one of them is in `data/`.** Measured across **882**
   tracked code files — **name the filter**, because three defensible populations exist here and the
   gate flagged the bare number (§8, evidence finding 4): **882** is `.ts`/`.js`/`.tsx`; **884** adds
   the 2 `.cjs` and is the figure §1 uses; **896** is `check-core-layering.ts`'s own `CODE` regex,
   which also admits `.jsx`. No LRU site lives in a `.cjs` or `.jsx` file, so the population choice
   does not move this result. **Name the anchor** too — the gate reported these citations as
   off-by-one and they are not; they were **mixed**, which is the same defect stated more precisely
   (§8, finding 3). Both anchors, so neither reader is surprised:

   | site | tier | eviction entry | the `.keys().next().value` read | shape |
   | --- | --- | --- | --- | --- |
   | `tools/read_file.ts` | tools | `:477` `evictOldest<K,V>` | `:479` | `while (size >= cap)` |
   | `services/symbol/symbol-graph.service.ts` | services | `:808` guard | `:809` | `while (size >= cap)` |
   | `services/web/web-controller.ts` | services | `:138` guard | `:139` | `while (size > cap)` |
   | `services/search/file-filter-cache.ts` | services | `:82` guard | — | evict-one, `min(createdAt)` |
   | **`data/keyword/keyword-search-pg.ts`** | **data** | `:464` guard | `:465` | `if (size >= cap)`, evict-one |
   | `services/cache/l1-memory-cache.ts` | services | `:188` `evictLRU()` | `:190` | evict-one, caller-driven |
   | `services/compression/code-compressor.ts` | services | `:470` guard | `:471` | `if (size > 100)`, evict-one |
   | `services/synapse/session/session-registry.ts` | services | `:212` guard | `:213` | `while (size > cap)`, **promotes** |

   The first four are PR-D's. See §7 R-34 — **C30 is not reopened**, and the reason it is not is a
   fact `design.md` does not state.
6. **`evictOldest` has three call sites in `read_file.ts`, not two.** `:169` (inside the
   constructor's `eventBus` subscription), `:462` (`getProjectRoot`) and `:570` (`readFileWithCache`).
   Two go to module 3 and one to module 4. A task sized on "two caches" misses the constructor one.
7. **The module 4 → 5 edge is decided — §4, T8.** `design.md` §5.1 hands Tasks an explicit choice
   and it has one behavior-preserving answer.
8. **A raw resolver sweep of the rename returns 25 files / 45 lines, and 19 / 28 is right.** The
   difference is the 7 members' **own** 17 intra-directory import lines (`./graph-store-factory.js`
   and friends), which a `git mv` of the whole directory leaves resolving correctly and which
   therefore need no edit. `design.md` §1.2's figures reproduce **exactly** once members are
   excluded: **19** external importers (7 production / 12 test), **28** import lines, **6**
   `mock.module`. Recorded so no task hunts 17 phantom edits.
9. **RFS-05 AC-1's six stale statements are already closed**, by the Specify commit `183573c`,
   exactly as `spec.md` §4.6 said they would be. Verified at `d7091ac`: `HANDOFF.md:3` and
   `STATE.md:200` both name PR-D, the parent's Status line records PR-C merged and released,
   `FEATURES.json` has PR-C `complete` / `execute: true` and the parent `execute: true`.
   **One new one replaced them**: the parent `spec.md:14` says PR-D *"is **in Specify**"* while
   Design is complete. `design.md` §7 group G still prices *"6 stale statements"*; it is **1**, and
   it will be **2** by the time Execute runs, because it is the same field going stale again.
10. **`CLAUDE.md`'s "24 migrations" counts the lock file.** There are **23** migration directories
    and **23** tracked `migration.sql`; the 24th tracked file under `migrations/` is
    `migration_lock.toml`. RFS-05 AC-5's correction must name the metric, or the next reader
    "corrects" it back.
11. **The `services/graph` literal sweep is time-dependent and has already moved.** `design.md` §1.4
    measured **241 across 27 files**; at `d7091ac` it is **261 across 31**, with `.ua/` still exactly
    **200**. The growth is this feature's own artifacts — `design.md` alone carries 16. The
    acceptance reading is the **resolver sweep**, not this count (§1.4 already says so); any task
    quoting the literal figure must re-take it.

### 3.6 C33 — the fortieth plan defect: Phase 4 as designed cannot close the gate

**Found by the Plan Challenge gate (§8, evidence finding 1) and re-measured before acceptance.**

`design.md` §4.2 and §7 both treat `index_project.ts` as *"closed by removal, zero allowlist"* once
`executeIndexing` and the two module-level helpers move. **That closes clauses 1 and 2 and leaves
clause 3 red.** Measured at `d7091ac`:

| | span | inside `handle()` `:117-244`? |
| --- | --- | --- |
| `handle()` itself | `:117-244` = **128 lines** | — |
| `canonicalizeProjectRoot` (T14) | `:39-44` | **no** |
| `assertProjectRootReuse` (T14) | `:46-68` | **no** |
| `executeIndexing` (T13) | `:254-351` | **no** |
| their call sites | `:130`, `:135`, `:205` | yes — **one line each, and they stay** |

**T13 and T14 remove zero lines from inside `handle()`.** It stays at **128** against the ceiling of
**120** that `design.md` §6.2 chose *specifically to catch this file*, so `check-tools-thin` reads
**1 of 30**, not `0 of 30`, and **T15 cannot wire it to `ci.yml` without failing a required check**.
RFS-01 AC-1 and the GMS-02 headline — the thing this four-PR umbrella exists to close — do not
close.

**This is C28's shape a third time**: an instrument named as the proof that work landed, which the
work as planned does not satisfy. It is also the exact inverse of `design.md` §6.6 property 2's
concern. That note says the third clause *"flags no file the other two miss, so its contribution is
unmeasured."* True, and it conceals the real problem: the third clause flags the same two files and
**is not closed by the same work**. A property stated as "this clause adds nothing here" read as
reassurance when it was the warning.

**Resolution — C33: a new task, T14b.** Extract the managed-run lease acquisition. **Decided by:
the user, 2026-07-31**, from three options with measured consequences.

**Rejected:**

1. **Raise the ceiling to 130.** One constant, and `design.md` §6.2's enumeration supports it — at
   129–130 only `read_file.ts` is over today. **Rejected on two measured grounds**: after Phase 3
   `read_file.ts`'s `handle()` is ~15, so the clause would flag **0 of 27** and its value becomes
   entirely prospective; and `index_project.ts` at 128 would sit **2 lines** under the ceiling, which
   is R-18's zero-margin shape and precisely what §3 and §6.2 both refused when they chose 125 over
   111 and 120 over its own endpoints — *"a value sitting on its own edge is a value that fails on
   the next unrelated edit."*
2. **Ship two clauses and defer the third.** Phase 4 as written then reads `0 of 30`. **Rejected**:
   `design.md` §6.3 already rejected exactly this as *"the option that ships C28's shape one level
   down"*, because a two-clause rule passes a 175-line `handle()`. Taking it now would overturn a
   recorded Design decision to make a schedule work.

**Owed back to the parent `spec.md`** as **C33**, alongside C28–C32, amending `design.md` §4.2's
*"closed by removal"* claim and §6.6 property 2's reading. **T20's write set covers it**; the
running total across this umbrella becomes **forty** plan defects.

---

## 4. Two cross-module state decisions Design left to Tasks

`design.md` §5.1 names **one** — how module 4 reaches module 5 — and hands it to Tasks explicitly.
**There is a second of exactly the same shape in Phase 4 that no artifact names**, found by the Plan
Challenge gate (§8, finding 1). Both are decided here.

### 4.1 The module 4 → 5 edge — a callback into module 4, not an inverted call order

`design.md` §5.1 records that its module table is not the dependency graph and that **Tasks must
choose explicitly** how `file-content-cache` (module 4) reaches `file-metadata` (module 5), because
the cache would otherwise thread `SymbolGraphService` through purely to satisfy the metadata module.

**Decision: module 4 takes a `(content, filePath, options) => Promise<FileMetadata>` callback.
Module 7 binds it with the `symbolGraph` it already holds. Module 4 never names
`SymbolGraphService`.**

**Rejected: invert, so module 7 calls module 5 and hands the result to module 4.** **Rejected on
measurement, not on taste — it is not behavior-preserving.** `readFileWithCache` calls
`extractMetadata` on **two of three** paths:

| path | `read_file.ts` | calls `extractMetadata`? |
| --- | --- | --- |
| cache hit, metadata present | `:559-562` | **no** — returns `cached.metadata` |
| cache hit, metadata missing (legacy repair) | `:555-557` | yes, and **writes the result back into the cache** |
| cache miss | `:566-567` | yes |

Pre-computing in module 7 makes it eager on all three, so every cache **hit** would newly run
`extractMetadata` — and `extractMetadata` reaches `symbolGraph.listDefinitions` at `:606-615`. That
is an added database query per cache hit: a behavior change inside a behavior-preserving PR, and it
would defeat the cache's stated purpose. The callback keeps the laziness and the write-back exactly
where they are.

### 4.2 `executeIndexing` reads instance state, and no artifact says so

**Decision: `executeIndexing` takes its warmup surface as a bound callback parameter —
`warmupCache: (projectId, projectPath, queries?) => Promise<…>` — supplied by `IndexProjectTool`
from the instance it already holds. `services/indexing/execute-indexing.ts` never names
`ContextualSearchRLM`.** Same shape as §4.1, for consistency and to keep the extracted module
import-light.

**Measured.** The extracted span `:254-351` contains **exactly one** `this.` reference:

```
:306    const warmupStats = await this.contextualSearch.warmupCache(
```

`contextualSearch` is `private contextualSearch: ContextualSearchRLM` (`index_project.ts:111`),
constructed in the handler's own constructor at `:114` (`new ContextualSearchRLM()`), and **`:306`
is its only reader in the file**. So a free `executeIndexing` cannot compile as scoped — `this` has
no binding — and this is the structurally identical case to §4.1, which got a full decision while
this one got the write-set line *"no test repoints for this move."*

**Rejected: let the module construct its own `new ContextualSearchRLM()`.** **Rejected for a reason
that is not the obvious one, and the obvious one does not survive measurement.** The intuitive
objection — *"a fresh instance warms a throwaway cache"* — is only **half** true: `searchCache`,
`vectorStore`, `keywordSearch`, `analytics` and `symbolRepo` all resolve through **factories**
(`ContextualSearchRLM:212`, `getSearchCache()` and siblings), so a second instance shares them and
the warmup lands in the same place; only `fileFilterCache` and `queryUnderstanding` are per-instance
(`:178-179`). And because `:306` is the field's sole reader, **nothing in the tree would observe the
difference either way.** That is the actual ground for rejection: the two readings are
indistinguishable by static reading and PR-D would have to write a test to separate them — the same
position `spec.md` §3.B reached on `ROOT_CACHE_TTL`. **The parameter costs one argument and
preserves identity by construction, so PR-D does not have to find out.**

**Checked and negative — this does not move G-HUB, and the reason is a gate blind spot worth
recording.** PR-B's seventh plan defect trains the question: does typing a parameter with a nominal
type declared in `services/search/` grow `maxForeignReach`? Measured at `d7091ac`,
`ContextualSearchRLM` sits at **foreign modules 2, `maxForeignReach` 3/3, deepest reader
`search-controller.ts`** — `PASS` with **zero margin**, exactly PR-C's R-18. It does not move,
because `search-hub-metric.ts` scans readers with `readdirSync(dir)` over **files directly in the
directory it is given**: a reader in `tools/` today, or in `services/indexing/` tomorrow, is outside
the scan either way. **So `3/3` understates the real coupling, and moving a reader further out
cannot make the gate notice.** That is C21's class in a different gate. It is **not PR-D's to fix**
— logged here because it was found while sizing T13, and because a future reader who assumes G-HUB
is repo-wide will draw the wrong conclusion from the same number.

---

## 5. Tasks

Write sets are measured, not estimated. Every task states the gates it must leave green.

**Gates per structural commit, all phases** — `lint`, `type-check`, `build`, `test`,
**`test:scripts`**, **`test:plugins`** (GMS-05 AC-4 names all six; `bun run test` reaches none of
the last two, and **PR-C's C27 was a task shipping a red `test:scripts` because the suite was not in
its gate list**), plus `check-core-layering` **recording `edgesExamined`** (RFS-03 AC-1) — not the
pass bit, which cannot move.

**RFS-03 AC-3 is owned here rather than by a task, and it is named so that it is owned by
something.** *"The allowlist stays empty; any edge that 'has to' be legal is closed by moving the
module."* `check-core-layering` has **no allowlist mechanism at all** — PR-C's kernel decision made
membership a path prefix precisely so that an exemption would be inexpressible — so the criterion is
satisfied by construction and **no task can close it by doing anything**. It is stated here because
PR-C's **C19** was an acceptance criterion that no task owned, and "satisfied by construction" with
nothing saying so is indistinguishable from "forgotten". The check a verifier runs is that
`scripts/check-core-layering.ts` still declares no allowlist, exemption parameter or suppression
flag after Phase 5.

### Phase 0 — instrument before anything moves (no structural change)

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T1** | **The four cache sites characterized, plus the rename pin.** New file, against the **public** surface only — not `tool.FILE_CACHE_MAX_ENTRIES` (§3.5 item 3). Covers `read_file.ts`'s two caches, `symbol-graph.service.ts`, `web-controller.ts`, `file-filter-cache.ts`. **AC-4 is a pin, not an assertion of correctness**: warm `projectRootCache`, run the rename path, read again, record what is served. Whichever answer it gives *is* the characterization. **If it shows a stale read, PR-D logs and does not fix it** (`spec.md` RFS-02 AC-4). **Two files** — AC-1's four-site characterization and AC-4's rename pin are different subjects and the pin needs the rename path | 2 new test files | **RFS-02 AC-1, AC-4** |
| **T2** | **The three containment shapes.** New file, passing against **pre-extraction** code: (a) request `path.dirname(<project root>)` with a `projectId` — the `rel.startsWith("..")` vs `"../"` narrowing, which **no existing test targets** (`dirname` does not occur in the suite); (b) construct **once**, read under one env state, mutate `MASSA_AI_READ_FILE_ROOTS`, read again on the **same instance** — the call-time-vs-construction-time hoist all 7 existing tests are blind to; (c) assert the returned `absolutePath` carries no literal `..` segment, independent of containment. **AC-2: the teaching-error text at `:443-447` is unchanged, roots only, never a host path** | 1 new test file | **RFS-06 AC-1, AC-2, AC-3** |
| **T3** | **`handle()`'s presentation block characterized — authorship, not verification.** The fixture Design first cited for this is a **different tool's response** (`read-file-response.json`; 3 of 10 keys overlap and none of the moving ones). Pin `recommendations` — **0** assertions anywhere today — over all 5 push sites and their 4 literal strings, and pin `tokens` / `savingsPercent` / `compressionRatio`, today reachable only through `e2e/08.search` and a live PostgreSQL. **Unit-level, no database** | 1 new test file | **R-31**, GMS-05 AC-1 |

**Phase 0 leaves the tree structurally identical.** `check-core-layering` must read **965 / 896**
unchanged, and `check-tools-thin` does not exist yet.

### Phase 1 — the gate, committed but not wired to CI

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T4a** | **`scripts/check-tools-thin.ts`** — three clauses over a **TypeScript AST**, never a regex: no function body declared anywhere in a file declaring an `IToolHandler` class except inside `handle()`'s own; no `Map`/`Set` instance **or module-level** state; `handle()` body ≤ **120**. **File-scoped, not class-scoped** (C32) — a class scope is defeated by a constructor-body closure, which is none of AC-5's six shapes. **Zero allowlist entries, no exemption parameter, no suppression flag** (AC-2). **Prints its examined population on a PASS** (AC-1), on `check-core-layering.ts:277-282`'s `edgesExamined` precedent — *"a check that resolved nothing also reports zero violations, and the two must not read the same."* **Docblock names what it does not certify** (AC-6): a delegating `handle()` reads identically whether its delegate is correct or subtly wrong | 1 new script | **RFS-01 AC-1, AC-2, AC-6** |
| **T4b** | **`scripts/__tests__/check-tools-thin.test.ts`** — **synthetic fixtures only**, on `check-core-layering.test.ts`'s `mkdtemp` precedent, **never a live-tree count** (`design.md` §6.6 property 5): `bun test scripts/__tests__` auto-discovers and `ci.yml:200` runs it inside `build`, so a `2 of 30` assertion written here goes red at Phase 3 and makes §1.1's per-phase-green promise false. **Both directions observed red plus an inert control** (AC-4). **AC-5's fail shapes**: private method, public method, getter/setter, `static`, `#private`, arrow-function class property, module-level `const cache = new Map()`, object-literal handler, **the constructor-body closure**, and a `handle()` containing a string like `"unexpected token: {"` — the last because a careful and a naive brace counter are byte-identical on today's corpus, so the corpus **cannot falsify** a naive reimplementation. **Assert the nine member-kind classifications directly** so a `typescript` bump fails `test:scripts` rather than the gate (R-33) | 1 new test file | **RFS-01 AC-4, AC-5** |
| **T5** | **RFS-01 AC-3's frozen base reading — the fourth non-retroactive step, first by dependency.** Run T4a's script after `git add`, record §3.3's table **per member with line spans** into this file. Not a test (§3.5 item 4, `design.md` §6.6 property 5) | this file | **RFS-01 AC-3** |

### Phase 2 — the LRU, behavior-preserving

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T6** | **`packages/core/src/services/cache/lru-evict.ts`** — an eviction **function** over `Map<K,V>`, not a cache class (AC-2), importing **nothing at all**. **AC-3's original property is gone**: `services/cache/` is not `kernel/`, so `check-core-layering`'s leaf-ness clause does not constrain it. The replacement is asserted by the module's own unit test, and that is a **real loss of CI enforcement**, recorded rather than glossed (R-29) | 1 new module + 1 new test | **RFS-02 AC-2, AC-3** |
| **T7** | **Repoint the four sites** — `read_file.ts` (**3** call sites: `:169`, `:462`, `:570`, §3.5 item 6), `symbol-graph.service.ts:808`, `web-controller.ts:138`, `file-filter-cache.ts:82`. **No site's TTL or read-promotion moves.** T1's suites must pass **unmodified** — assert byte-identity by SHA-256 across the commit, on `validation.md` §1's evidence shape, not "the tests are green now" | 4 files | **RFS-02 AC-1** |
| **T8** | **Repoint `read-file.test.ts`'s eviction test** (`:264-272`), which reaches four private members and cannot survive T7 unmodified. **GMS-05 AC-3: repointed, not weakened, skipped or deleted** — the CAP+1 eviction and hot-key-promotion assertions must still run, against the module | 1 file | GMS-05 AC-3 |

### Phase 3 — the extraction, 490 of 707 lines

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T9** | **Modules 2 and 3** — `services/file-read/path-containment.ts` (`checkPathContainment` `:387-448` + `resolveFilePath` `:350-385`) and `services/file-read/project-root-cache.ts` (`getProjectRoot` `:450-470` + `projectRootCache` + `ROOT_CACHE_TTL` + the `eventBus` subscription `:162-171`). **Module 2 → module 3 is a real edge** — `:373` and `:415` both call `getProjectRoot` — one-directional, so no cycle, but module 2 cannot be constructed without module 3. T2's suite passes unmodified | 1 handler + 2 new modules + 2 new suites | RFS-06 AC-1 |
| **T10** | **Modules 4 and 5** — `file-content-cache.ts` (`readFileWithCache` `:518-580` + `fileCache` + `CACHE_TTL` + `FILE_CACHE_MAX_ENTRIES` + `interface CachedFile`) and `file-metadata.ts` (`extractMetadata` `:582-628` + `detectLanguage` `:645-681` + `extractImports` `:683-706` + `interface FileMetadata`). **The 4 → 5 edge is a callback — §4.** Module 4 never names `SymbolGraphService` | 1 handler + 2 new modules + 2 new suites | — |
| **T11** | **Module 6** — `line-range.ts` (`calculateRange` `:485-507` + `adjustRange` `:509-516` + `extractLines` `:630-643` + `interface ReadRange` + `MASSA_AI_READ_FILE_MAX_LINES` `:22-36` + **the N9 clipping `:235-249`**, which is 15 of `handle()`'s 98 non-delegation lines) | 1 handler + 1 new module + 1 new suite | — |
| **T12** | **Module 7 and the handler's collapse** — `read-file.service.ts` takes `interface ReadFileParams`, the compression decision `:251-255`, result assembly `:257-283`, token math + recommendation `:285-322` and usage tips `:324-336`, and composes 2–6. **`handle()` goes 175 → ~15**; `read_file.ts` to **≤ 125** (N). **`serializeToolResponse` stays in the handler** (`:338`) — any `services/file-read/` module importing `tools/serialize.ts` is a `services → tools` edge and fails `check-core-layering` (RFS-03 AC-2). **`constructor(symbolGraph?: SymbolGraphService)` keeps its exact arity and parameter type** — 20 construction sites, both transports among them (`design.md` §3.2). **MCP `inputSchema` + REST `/file` response shape byte-identical.** **The four moving interfaces are invisible to consumers**: `read_file.ts` exports exactly one symbol (`ReadFileTool`, `:74`), so `ReadFileParams`, `FileMetadata`, `CachedFile` and `ReadRange` are module-local today, and `services/file-read/` is deliberately not re-exported from `services/index.ts` — the extraction adds **0** names to `@massa-ai/core`'s published surface. T3's suite passes unmodified | 1 handler + 1 new module + 1 new suite | **GMS-02 AC-1**, RFS-03 AC-2 |

**Phase 3's four task rows sum to 16 and the phase is 13 distinct files** — all four edit
`read_file.ts`, which is the write set's only overlap. Each task removes its own spans and adds its
own imports; a reviewer sizing per-task diffs must not count that file four times.

**Acceptance reading for Phase 3** (GMS-02 AC-1, not a gate): `read_file.ts` **707 → ≤ 125**,
maximal bodies **13 → 0**, `Map` fields **2 → 0**, `handle()` **175 → ≤ 120**, the six modules
present and imported, schema byte-identical. **Below ~100 is also a failure** — 68 of the 125 is
schema and `IToolHandler` members, so a materially smaller file means the schema was altered
(R-30).

### Phase 4 — `index_project.ts`, closed by removal

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T13** | **`executeIndexing` `:254-351` → `services/indexing/execute-indexing.ts`.** It is `private` and has **0** importers — the only occurrences outside the file are **5 non-code mentions** in `index-project-tool.test.ts` — a JSDoc line (`:4`), a `test()` **title string** (`:312`) and three `//` comments (`:313-315`) — so no test repoints for this move. *(The first draft said "three comments"; the gate corrected it, §8 evidence finding 3. The conclusion is unchanged and slightly stronger: none of the five is an import.)* **It is not a pure function: `:306` reads `this.contextualSearch`, the sole `this.` reference in the span. It takes a bound `warmupCache` callback — §4.2**, decided here because no artifact named the dependency | 1 handler + 1 new module + 1 new suite | GMS-02 headline |
| **T14** | **The two module-level helpers C32's file scope surfaces → `services/project-identity/project-root-identity.ts`** — `canonicalizeProjectRoot` `:39-44` and `assertProjectRootReuse` `:46-68`. `spec.md` §4.2 names **1** body in this file; measured there are **3**. Both are already imported by name in `index-project-identity.test.ts` and `index-project-tool.test.ts`, so it is **2 import repoints and no test rewrite**. **Not a published-surface change**: `tools/index.ts` re-exports only `IndexProjectTool` (`:5`) and `ReadFileTool` (`:37`), so neither helper is on `@massa-ai/core/tools`. RFS-04's semver framing does not reach this task | 1 handler + 1 new module + 1 new suite + 2 test repoints | — |
| **T14b** | **The managed-run lease acquisition `:158-202` → `services/indexing/`. Without this task the gate cannot reach `0 of 30` — C33, §3.6.** 45 lines: `eventId`, `ManagedRunRepositoryPg.getInstance()`, `begin()`, the `"busy"` branch, the `catch`, and the `lease` assignment. **The module returns a discriminated result and `handle()` maps it to a `ToolResponse`** — the two early returns at `:175-186` and `:198-201` are response *shaping* and stay in the handler, so no `services/` module imports `tools/serialize.ts` (RFS-03 AC-2). `handle()` **128 → ~87**, 33 lines under the ceiling. **Closed by removal, zero allowlist** — §4.2's own principle, and this block is managed-run orchestration by any reading, so it is on-requirement rather than scope creep. **Decided by: the user, 2026-07-31**, from three options with their measured consequences | 1 handler + 1 new module + 1 new suite | **RFS-01 AC-1**, GMS-02 headline |

### Phase 5 — the gate goes green and is wired

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T15** | **`check-tools-thin` reads `0 of 30`, and `ci.yml`'s `build` job invokes it in the same commit** — *"ships with the restructuring, not after it"*, GMS-01 AC-1's wording and PR-C's precedent. `build` is in `main`'s live `required_status_checks`; verify against the ruleset API rather than a green check, and note the context is the **job id** | `.github/workflows/ci.yml` | **RFS-01 AC-1**, GMS-02 headline |

### Phase 6 — the rename, independent of everything above

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T16** | **`git mv packages/core/src/services/graph/ → services/memory-graph/`** — **7** files. The members' own **17** intra-directory import lines need no edit (§3.5 item 8) | 7 `git mv` | — |
| **T17** | **Repoint 19 external importers / 28 import lines**, 7 production and 12 test. **The 6 `mock.module` string specifiers are the sharp edge** — `tsc`, `build` and `type-check` are blind to all six, and a missed one does not fail: the registration silently targets a path nothing loads and the test runs against the real module (R-28). They are in `memory-consolidation-job.test.ts`, `memory-controller.test.ts`, `search-facade-{hybrid,indexing,synapse}.test.ts` and `search-memories-tool.characterization.test.ts`. **`services/index.ts` carries 5 of the 28 lines** — *name the metric*: `:127-135` is **5 specifier lines** re-exporting **7 symbols**, which is the figure `design.md` §1.2 quotes; both are right and they are not the same number. It includes the `MemoryRow as GraphMemoryRow` collision workaround at `:132` | 19 files | — |
| **T18** | **The 3 prose and fixture sites — R-32 as corrected to 3 (§3.5 item 2).** `CLAUDE.md:237`'s naming-trap note, `scripts/check-coverage.ts:279`'s docblock citation, and `scripts/__tests__/check-coverage.test.ts`'s **8** fixture citations at `:12`, `:38`, `:51`, `:58`, `:106`, `:107`, `:115`, `:143`. The fixtures are synthetic (`BASE = "/repo/packages/core"`, never resolved on disk) so **no test breaks if they are missed** — they are repointed as prose. **Sequence after T21** | 3 files | — |

**Acceptance reading for Phase 6** (R-28): the **resolver sweep**, not a grep count —
`packages/core/src/services/graph/` has **0 members and 0 resolvable importers**, measured by
resolving every relative specifier in all tracked code files. A literal `services/graph` sweep
certifies the rename while missing **all 12 production edges**, because they are written
`./graph/…` or `../graph/…` and contain no `services/` segment.

### Phase 7 — the record

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T19** | **RFS-04's three removals, priced per item.** Delete `data/vector/index.ts` (**0** importers, **unreachable** — `@massa-ai/core`'s `exports` are exactly `.`, `./tools`, `./services`), `data/vector/hybrid-search.ts` (its only importer is the barrel above), `IHybridSearch` from `packages/shared/src/types/interfaces.ts:253`, and `BatchCommand` from `tools/batch_execute.ts:13` + `tools/index.ts:45`. **Every command full-path-qualified, and each figure states which of the two files it read** — there are two files named `hybrid-search.ts`, and `services/search/hybrid-search.ts` is live with 3 importers and 2 `mock.module` registrations (**RFS-04 AC-3**). **Verify against a cache-forced `npm pack --dry-run`, not a stale `dist/`** — a `turbo` cache replay satisfying a published-surface check is a recorded failure mode (**RFS-04 AC-1**) | 5 files | **RFS-04 AC-1, AC-3** |
| **T20b** | **The six corrections this document's Plan Challenge gate found in `design.md` (§8.1), applied in place.** On PR-C's **C18** precedent — the Tasks gate found a broken regex in a `design.md` already on `main` and the Tasks PR fixed it there rather than deferring. **C33 is the load-bearing one**; the other five are figure corrections | 1 file | §8.1 |
| **T20** | **C28–C33 into the parent `core-layering-god-module-split/spec.md`**, in place at the criterion or figure each amends **and** indexed in its *Design and Execute corrections* table, on the C1–C27 convention. Measured: **C28 is named in the parent's Status block as owed and has no table row; C29–C32 are absent entirely.** Same commit: **C29 amends the Evidence row** *"`read_file.ts` is ~55% domain logic (~390 of 707 lines)"* → **490 of 707, 69.3%**, private methods **13 → 11**; **RFS-05 AC-3 corrects the layer figures at two sites** — `:502`'s Evidence row and `:161`'s prose, both reading `tools 31 / controllers 6 / services 208 / data 41`, measured **30 / 0 / 208 / 39** plus `kernel/` **11**, *with the method named* because the row claims *"unchanged, confirmed"*; and `:14`'s *"is in Specify"* (§3.5 item 9) | 1 file | **RFS-05 AC-2, AC-3** |
| **T21** | **`scripts/check-coverage.ts`'s dangling `EXCLUSIONS` entry deleted, and the class closed in the gate's *test*, not the gate.** 9 entries, **1** dangling — `packages/core/src/services/query/prisma-client.ts`, at `kernel/` since `9fe4545`. **Delete rather than repoint**: `2ea4ebd` took `kernel/prisma-client.ts` to **100% (26/26)**, so the exclusion is dead weight. The existing pinning test — `scripts/__tests__/check-coverage.test.ts:178`, *"every excluded path is one the gate would otherwise measure"* — asserts `isMeasuredSource(entry.file)`, and that is a **pure string-shape predicate** (`check-coverage.ts:379-388`: an extension regex plus six substring/prefix checks, no `existsSync`, no `readFileSync`, no `git`), so it can never see a dangle. **Cite the file with the line — `check-coverage.ts:178` is an unrelated `EXCLUSIONS` entry.** Add an existence assertion resolving against `check-coverage.ts`'s real `REPO_ROOT` (used at `:619`), **not** the test's synthetic `BASE = "/repo/packages/core"` or its cwd. **AC-4 closes with an observed red**: revert the deletion and the test must fail | 2 files | **RFS-05 AC-4** |
| **T22** | **`CLAUDE.md` and `docs/ONBOARDING.md`.** `CLAUDE.md:43`'s *"24 migrations"* → **23**, **naming the metric** (24 counts `migration_lock.toml`; there are 23 migration directories and 23 tracked `migration.sql` — §3.5 item 10). `CLAUDE.md:567`'s *"five … skipping lines"* → **8** publishable packages, measured from every non-`private` `package.json`. `docs/ONBOARDING.md:83-87`'s deferral marker must say `.ua/` regeneration is **its own change after PR-D**, not point at a PR that will have merged (`spec.md` §4.4) | 2 files | **RFS-05 AC-5** |
| **T23** | **The state files.** `HANDOFF.md`, `STATE.md`, `FEATURES.json` — PR-D `status: complete`, `phases.tasks: true`, `phases.execute: true`; parent `core-layering-god-module-split` to `complete`. **Do not touch `active_feature`** — it reads `skills-directive-dedup`, genuinely paused at T5 of 12 on the user's instruction, verified against `STATE.md`'s `## Current` for the **third** time. **Never `git add -A` under `.specs/`**: `.specs/reports/` is untracked on purpose and stays untracked; stage explicitly | 3 files | RFS-05 AC-1 |
| **T24** | **CHANGELOG entry — `### Changed` **and** `### Removed`** (§2). **Never write the skip-ci marker literally**, in the commit message, a commit body or the PR body | 1 file | **RFS-04 AC-2** |
| **T25** | **Independent validation — author ≠ verifier**, on PR-C's T18 and PR-B's T20 precedent. Re-derives every criterion from raw data rather than from this file. **Must re-take, not inherit**: T5's frozen reading against the shipped tree, Phase 6's resolver sweep, `check-core-layering`'s `edgesExamined` per structural commit, the `npm pack --dry-run`, and a **discrimination table** on the real tree — each subject backed up to a **scratch copy** with SHA-256 byte-identity asserted on restore. **Never `git checkout` to restore**: it restores to `HEAD`, not to pre-mutation state, and destroyed two files of uncommitted work at PR-C's T8b | 1 new file | GMS-02, RFS-01…RFS-06 |

---

## 6. Ordering, and what depends on what

1. **T1–T3 before every structural commit.** None can be taken retroactively (§3), and T3 in
   particular must precede the moment `coverage` can go red on nine new files (R-26).
2. **T4a before T5.** The frozen base reading cannot precede the instrument that takes it — the
   dependency `design.md` §11 does not state (§3.1). **T5 before T9**, the first extraction commit.
3. **T4b's fixtures must be synthetic.** Not an ordering rule but an ordering *consequence*: a
   live-tree assertion here goes red at Phase 3 and breaks §1.1's per-phase-green obligation.
4. **T6 before T7**, and **T7 before T8** — the test cannot be repointed at a module that does not
   exist, and T1's suites must be proven unmodified across T7 before T8 edits a neighbouring file.
5. **Phase 2 entirely before Phase 3.** The LRU move is provable behavior-preserving only while both
   `read_file.ts` caches are still in `read_file.ts`; after T10 they are in two different modules and
   T1's characterization no longer has one subject.
6. **T9 before T10.** Module 2 calls module 3 at `:373` and `:415`; extracting the containment module
   first without its root-cache dependency leaves a commit that does not compile.
7. **T12 last in Phase 3.** Modules 2–6 must exist before module 7 can compose them and `handle()`
   can collapse.
8. **T15 after T12, T14 *and* T14b**, and not before. **T14b is the one the first draft of this list
   omitted, and omitting it is what made T15 unachievable (C33, §3.6):** without it
   `index_project.ts`'s `handle()` is still 128 against a ceiling of 120, the gate reads `1 of 30`,
   and wiring it into `ci.yml` fails `build` — a check in `main`'s live `required_status_checks`.
   **T13, T14 and T14b may land in any order among themselves**; none touches another's span
   (`:39-68`, `:158-202`, `:254-351` are disjoint), though all three edit `index_project.ts`.
9. **T18 after T21.** They share `scripts/check-coverage.ts` and its test (§3.5 item 2); doing the
   rename's prose repoint after the exclusion edit turns R-32 from a merge conflict into a rebase.
10. **T20 after T5 and T12.** C29's `490 of 707` and the per-member frozen reading are both figures
    the parent amendment quotes; amending before they are taken writes a prediction into an index
    whose whole purpose is to record what was measured.
11. **T20b before T20.** `design.md`'s own C33 correction should exist before the parent's index
    cites it, so a verifier following the pointer finds a corrected document rather than the one the
    correction is about.
12. **T23 and T24 last before T25**, and **T25 by a different author.**

**Phase 6 (T16–T18) is independent of Phases 0–5** — measured, **0** shared files — and may be
committed at any point after Phase 0. It is placed sixth because it is the group Design recommended
against and the user chose anyway; putting it last among the structural phases keeps it separable
under review even in one PR.

---

## 7. Risks this Tasks document adds

| # | risk | why it is real | mitigation |
| --- | --- | --- | --- |
| R-34 | **C30's `services/cache/` destination silently forecloses ever unifying the one `data/`-tier LRU site** | `design.md` §5.2 rejects `kernel/` on a tier table reading `data/: 0`. That table counts **consumers PR-D repoints**, not LRU-shaped sites: measured, `data/keyword/keyword-search-pg.ts:464` carries the same insertion-order eviction (§3.5 item 5). Had it been in scope, the module would serve two tiers and `kernel/` would qualify | **C30 is not reopened, and the reason is decisive rather than a judgement call**: `FORBIDDEN.data` is `["services", "tools"]`, so `data → services` is **illegal** — `keyword-search-pg.ts` *cannot* import `services/cache/lru-evict.ts` at all. Unifying it later means moving the module to `kernel/`, which is then a real two-tier admission satisfying the rule 11 of 11 shipped modules keep. Recorded here so that move is not read as reversing C30. The other three sites are out of scope on policy grounds: an L1 cache evicting by byte size, a literal-100 cap, and a per-session promoting LRU |
| R-35 | **75 planned files against R-25's 2.1× multiplier is a ~160-file review at merge** | PR-C planned 104 and shipped 222; PR-B planned 37 and surfaced 19 confirmed plan defects. Design surfaced 4 before a line of code and this document surfaced 11 more | §1.1's three obligations, and the phase boundaries are the review unit. **Do not erase this row when the count diverges** — PR-C's §1 kept its estimate beside the outcome |
| R-36 | **Nine new source files must each clear the 90% per-file coverage floor independently, and `coverage` is in `main`'s live required checks** | R-23 as corrected: nine, not five or six. `2ea4ebd` is the measured precedent for the red arriving at all. GMS-05 AC-2 forbids a new `EXCLUSIONS` entry — and T21 is *deleting* one in the same PR | T1–T3 write the highest-stakes tests **before** the gate can go red (R-26). The two `scripts/` files are outside the floor (`isMeasuredSource` returns `false`), so the gate script carries no incentive pressure |
| R-37 | **T5's reading is quotable only from a run taken after `git add`, and the reason `design.md` gives for that is wrong** | §3.5 item 4: the gate's own files are outside its population either way. Believing the wrong mechanism means the **real** precondition — that nothing changes the `packages/core/src/tools/` population before T5 — goes unnamed | T5 states the population it read (**30** files, **27** with `handle()`) alongside the verdict, so a dead or shifted subject is distinguishable from a clean tree |
| R-38 | **The rename's only real sensor is a sweep nobody has written yet** | `check-stale-pointers` sees **none** of the 7 renamed filenames — none matches `PREFIX_STEMS = ["rlm","search-facade"]` or `SUFFIX_STEMS = ["controller"]` — so it reports an unchanged `PASS` across the whole of Phase 6. That is **C21's class**, and widening the stem alphabet is C21's owner's work, not PR-D's | Phase 6's acceptance is the resolver sweep in §5, and T25 re-takes it rather than inheriting it. The 6 `mock.module` specifiers are enumerated in T17 so no task re-derives them |
| R-39 | **The `handle()` ≤ 120 clause flags no file the other two clauses miss, so its contribution is unmeasured on this tree** | Both readings are the same two files: `2 of 30` on body/`Map`, `2 of 27` on `handle()`. A clause whose value is entirely prospective can be quietly wrong and nothing would show | T5 records both readings **separately** and states that they coincide (`design.md` §6.6 property 2). T4b's fixtures include a handler that is green on the first two clauses and red on the third |

| R-40 | **The gate's third clause is closed by a task no requirement asked for, in a file whose only named subject was `executeIndexing`** | C33 (§3.6). T14b exists because the ceiling was chosen to catch `index_project.ts` and the extraction chosen to clean it does not touch the body the ceiling measures. **Nothing checked that a clause and the work meant to close it acted on the same lines** — Design verified the clause *flagged* the right files and never that it *unflagged* them | T15's acceptance is the gate's own output at `0 of 30` with its population printed, taken **after** T14b, not an argument that the file was cleaned. **T25 re-runs it rather than inheriting it** — and re-runs it per clause, because a per-file `0 of 30` is what hid this |

**Inherited and unchanged:** R-04, R-07, R-20, R-21, R-22, R-26, R-27, R-28 through R-33.
**R-23 → nine** (`design.md` §5.1). **R-24 → six changes** (`design.md` §7).
**R-32 → three files, not one** (§3.5 item 2).

---

## 8. Plan Challenge record — full, two modes, 2026-07-31

Mode selection follows `spec.md` §9.1 and `design.md` §10: the domain maps to **Architecture**
(pre-mortem primary, red-team secondary) while the artifact carries ~70 quantitative claims, which
maps to **Evidence Audit**. Both ran read-only and independently, against the standing instruction to
**measure rather than reason**, and both were told the eleven §3.5 corrections so they would aim
elsewhere. **Neither modified the tree** — verified with `git status --porcelain` after each returned,
not from the agents' own reports, because a read-only critic on this feature once ran `git add -A`.

**Pre-mortem / red-team — 3 findings, all re-measured before acceptance. All 3 confirmed; 1 with its
characterization corrected. All 3 revised this document.**

| # | finding | severity | verdict on re-measurement | landed |
| --- | --- | --- | --- | --- |
| 1 | `executeIndexing` is not a pure function — it reads `this.contextualSearch`, and the write set treats T13 as mechanical while the structurally identical module 4→5 case got a full decision | high | **CONFIRMED.** `:306` is the **only** `this.` reference in `:254-351`; `contextualSearch` is a private field constructed at `:114` and `:306` is its sole reader | **§4.2**, a new decision with its rejected option; **T13** restated |
| 2 | R-31's *"5 `recommendations.push` sites"* counts the array initializer. The internal tell — 5 sites, 4 literal strings — survived two prior gates | medium | **CONFIRMED.** `:282` is `recommendations: []`; the `.push(` calls are `:304`, `:318`, `:326`, `:333` = **4** | **T3** corrected; owed back to `design.md` R-31 (T20b) |
| 3 | §3.5 item 5's eight LRU line citations are wrong, *"off by 1–2 lines, all in the same direction"* | low | **CONFIRMED in mechanism, corrected in characterization.** They are not uniformly short: measured, **6 are the eviction guard and 2 are a method declaration** (`read_file.ts:477` `evictOldest`, `l1-memory-cache.ts:188` `evictLRU`). The defect is a **mixed, unstated anchor**, not an off-by-one | **§3.5 item 5** now prints both anchors per site |

**Evidence audit — ~70 figures re-derived with independent parsers. 5 do not reproduce. All 5
re-measured by the main agent and all 5 confirmed. One reverses a plan outcome.**

| # | figure | stated | measured | severity | landed |
| --- | --- | --- | --- | --- | --- |
| 1 | **T15 reads `0 of 30` after Phase 4** | `0 of 30` | **`1 of 30`.** `index_project.ts`'s `handle()` is `:117-244` = **128**; all three extracted spans are outside it and only their one-line call sites are inside, so Phase 4 removes **zero** lines from `handle()` and 128 > the ceiling of 120 | **critical** | **C33 / §3.6**, new task **T14b**, decided by the user from three options |
| 2 | Phase 1 is 2 files; 4 overlapping files | 2 · 4 | **3 · 5** — T5 writes the frozen reading into this document, which Phase 0 also creates. It **self-cancels in the union**, which is exactly why a check verifying only the total missed it | low | **§1**'s table and overlap table |
| 3 | T13: *"three comments"* in `index-project-tool.test.ts` | 3 | **5 non-code mentions** — a JSDoc line, a `test()` **title string**, and 3 `//` comments | low | **T13** |
| 4 | *"882 tracked code files"* | 882 | reproduces only under an unstated filter; the document's two other established filters give **884** and **896** | low-med | **§3.5 item 5** now names all three |
| 5 | *"#53 and #59 are the only two non-squashes in the last eleven merges"* | 2 | **6** — #53, #54, #56, #57, #58, #59 | high | **already corrected in §1.1 before the gate reported it** — see below |

**What the gate got right that matters most.** Evidence finding 1 is not a residual risk: it is the
plan failing to deliver the requirement the entire four-PR umbrella exists to close, in the task
whose whole job is to close it, on an instrument this feature added *because the previous instrument
could not discriminate*. **C28's shape, a third time, and it would have shipped.** Pre-mortem
finding 1 is the second-order version of the same thing — a decision Design made carefully in one
place and never made in the structurally identical place one module over.

**Where the critics were corrected.** Pre-mortem finding 3 named a real defect and mis-described it —
*"all off by one, all short"* is false; the anchors were **mixed**. **Twelfth time on this feature
that a critic's mechanism held while one of its figures did not.** The evidence audit also called
finding 1's consequence *"a behavior change"* for §4.2's rejected option; measured, `searchCache` and
four sibling stores resolve through **factories**, so a second instance shares them and only
`fileFilterCache`/`queryUnderstanding` are per-instance — with `:306` the field's sole reader,
**nothing in the tree would observe the difference**. The honest ground for the parameter is that the
two readings are *indistinguishable without a test*, which is a stronger reason than the one offered.

**One figure the author caught before the gate reported it.** Evidence finding 5 — the merge-history
claim — was found and corrected during self-review roughly an hour before the audit returned, by
re-running `git log --first-parent main -11` rather than trusting `HANDOFF.md`'s figure. It is
recorded here anyway, at the gate's severity rather than the author's, because **it was inherited
text restated in a *stronger* form than its source** — `HANDOFF.md` says "the last nine merges" and
was measured before PR-C's four PRs existed. The rule that catches these is to re-run the count
before writing a sentence that depends on it, and it very nearly failed inside the section arguing
that `--no-ff` is load-bearing.

**Escalation.** `escalate_to_full: true` was returned by the evidence audit; **already at full depth
in both passes**, so it is moot as an escalation and taken as a severity signal instead.
`serious_findings: revise_plan` applied: all eight findings across the two modes revised this
document — one of them by adding a task and a user decision — rather than being appended to it.

### 8.1 Corrections owed to `design.md`, landing with the work

On PR-C's **C18** precedent, where the Tasks gate found a defect in a merged `design.md` and the
Tasks PR corrected it in place rather than deferring:

| # | site | correction |
| --- | --- | --- |
| 1 | `design.md` §4.2, §7 group D, §6.6 property 2 | **C33** — `index_project.ts` is not *"closed by removal"* for clause 3; the `handle()` ceiling needs T14b |
| 2 | `design.md` R-31 | **4** `recommendations.push` sites, not 5 — `:282` is the initializer |
| 3 | `design.md` §5.1 module 8 | `executeIndexing` reads `this.contextualSearch` at `:306`; the module table presents it as free-standing |
| 4 | `design.md` R-32 | **3** files shared between Phase 6 and Phase 7, not 1 |
| 5 | `design.md` §7 group G | *"6 stale statements"* → **1**; RFS-05 AC-1's six were closed by the Specify commit |
| 6 | `design.md` §6.6 property 1 | the gate's own files are outside its population whether tracked or not; the stated mechanism does not apply |

These are **T20b**.

---

## 9. Next action

**Execute, T1.** T1–T3 are pure test authorship against the unmodified tree; nothing structural moves
until T6. **T5 cannot be taken until T4a exists**, and must be taken before T9.

**Three things a resumer must not re-derive, and one it must.**

- **Do not re-derive** the eleven §3.5 corrections or the eight §8 findings. Every figure in both was
  measured at `d7091ac` and the non-reproducing ones were re-measured by a second party.
- **Do not re-take** §3.4's characterization decisions or §4's two threading decisions. Both were
  settled against measured alternatives, and §4.2's rejected option is rejected for a subtler reason
  than the obvious one.
- **Do not treat C33 as bookkeeping.** Without T14b the PR merges with `check-tools-thin` unwired or
  red, and the GMS-02 headline closes on paper only. It is the single highest-consequence line in
  this document.
- **Do re-derive** anything quoted from a gate — `check-tools-thin`, `check-core-layering`,
  `check-coverage`, G-HUB — because every one enumerates `git ls-files`, and `turbo` replays cached
  results unless forced. A background command's exit code is the wrapper's; read the task line.

---

## 10. Execute-time record

Findings and readings produced by running the tasks, appended per task. §1–§9 are the plan; this
section is what the plan met.

### 10.1 T1 — executed, 2026-07-31

Two new files, both against surfaces that survive Phases 2–3:
`packages/core/src/__tests__/lru-eviction-characterization.test.ts` (RFS-02 AC-1, 5 cases,
**3115** assertions) and `read-file-project-root-rename-pin.test.ts` (RFS-02 AC-4, 2 pins, **23**
assertions).

**Gates, all six, plus the layering gate.** `lint` exit **0** — and proven to bite rather than
assumed, because oxlint prints **nothing at all** on a clean tree, which is indistinguishable from a
gate that did not run; a deliberate duplicate-declaration probe produced
`error: Identifier \`a\` has already been declared` and was removed. `type-check` **6/6**. `build`
**5/5, 0 cached** — the unforced run was `FULL TURBO`, 5 of 5 replayed, and a replay is not a
measurement. `test` **11/11 tasks, 0 cached, 145 isolation groups**, both new suites confirmed
*inside* it under `[test-isolation] … (module mock)` rather than only standalone. `test:scripts`
exit **0**. `test:plugins` **96 pass / 0 fail**.

#### C34 — the forty-first plan defect: a second private-reaching test, owned by no task

Measured over **435** tracked test files: exactly **one** reaches `ReadFileTool`'s 18 private
members. It does so in **two** tests, with **different break phases**, and only one has an owner.

| test | span | privates reached (code lines only) | breaks at | owner |
| --- | --- | --- | --- | --- |
| *"inserting CAP+1 distinct keys evicts the oldest…"* | `:264-299` (describe `:257-300`) | `fileCache`, `projectRootCache`, `evictOldest`, `FILE_CACHE_MAX_ENTRIES` | **T7** — `evictOldest` leaves the class | **T8** |
| *"undefined-metadata entry: first hit re-extracts + persists…"* | `:316-366` (describe `:302-367`) | `extractMetadata`, `fileCache` | **T10** — `extractMetadata` → module 5, `fileCache` → module 4 | **none** |

The second also hardcodes `readFileWithCache`'s cache-key JSON at `:332-338`, which moves into
module 4 with the Map it keys. **T10's write set reads *"1 handler + 2 new modules + 2 new suites"*
and names no test repoint**, so Phase 3 as planned lands a commit where `read-file.test.ts` throws —
`tool.extractMetadata.bind(tool)` on a member that no longer exists — and §1.1's
per-phase-green obligation is false. GMS-05 AC-3 forbids deleting or weakening it.

**Resolution: T10's write set gains `+ 1 test repoint`** — T14's shape, not a new task. Recorded
rather than put to the user because GMS-05 AC-3 already fixes the answer (repointed, not weakened,
not skipped); the only open question was which task carries one file.

**Two span citations corrected in the same breath.** §3.5 item 3 cites `:265-272` and T8's row
`:264-272`; the test runs to `:299` and its private reach to `:298`. Both stop **27 lines** short of
their own subject. That is **C33's class one artifact down** — a clause and the work meant to close
it must be checked against the same lines, and here the file-level agreement (*"`read-file.test.ts`
needs a repoint"*) again hid a span-level disagreement about **which part** of it and **when**.

#### C35 — RFS-02 AC-4's comment correction names one site; there are two, and the named one points at the other

`spec.md` RFS-02 AC-4 requires that `production-wiring.ts:67-68`'s comment *"is corrected to say
what is actually true."* Measured, the same false claim is stated **twice**:

| site | text |
| --- | --- |
| `production-wiring.ts:67-68` | *"L1MemoryCache and the read_file tool cache are deliberately absent: both are TTL-bounded and self-evict **(see invalidator-registry.ts)**"* |
| `invalidator-registry.ts:34-36` | *"L1MemoryCache and the read_file tool cache are deliberately NOT registered: both are TTL-bounded, so a stale entry self-evicts within the TTL window without a per-project hook."* |

The named site **cites the unnamed one as its authority**, so correcting only `production-wiring.ts`
leaves a reader who follows its own pointer at the uncorrected claim. **Neither site is in any
task's write set**, so AC-4's correction is owned by nothing — PR-C's **C19** shape.

**Resolution: a new task T8b**, Phase 2, on the T14b/T20b precedent this document already set: both
comments corrected to state what the pin measured. Phase 2 rather than Phase 7 because AC-4 is an
RFS-02 criterion and Phase 2 is where the LRU work closes. Write set **2 files**, comments only.

#### C36 — Phase 0's acceptance figure moves, and the half that carries the requirement does not

§5 states *"`check-core-layering` must read **965 / 896** unchanged."* Measured after `git add` of
T1's two files:

```
[core-layering] PASS — 0 violation(s) across 965 tier-to-tier edges in 898 tracked files
```

**`edgesExamined` — the figure RFS-03 AC-1 actually requires per structural commit — is unchanged at
965**, which is the claim that matters: Phase 0 adds no tier-to-tier edge. The **896** is the gate's
*population*, and it counts every tracked file its `CODE` regex admits, tests included, so it rises
by exactly the number of tracked code files any phase adds. Phase 0 adds two.

§3.5 item 4 already drew this distinction for `check-tools-thin` — whose population is filtered to
`packages/core/src/tools/` and therefore genuinely does not move — and §5 then applied the
tools-gate reasoning to the repo-wide gate. **Read the Phase 0 line as `edges 965 unchanged;
files 896 → 898`.**

#### RFS-02 AC-4 — the pin's answer: the stale read is real, and it is logged, not fixed

`spec.md` §3.B left two readings open and said static reading could not choose. It is chosen:

- **After a committed rename, `ReadFileTool` serves the pre-rename root.** Driven through the real
  `createProductionProjectIdentityInvalidatorRegistry` via its own injection seam:
  `symbol-graph-project-root` ran for **both** source and target and `SymbolGraphService`
  re-resolved to the new root, while `ReadFileTool` kept serving the old one. **No invalidator id in
  either the `invalidated` or the `failures` list matches `/read[-_]?file/i`.** The contrast is what
  makes this a measurement rather than a vacuous pass — without it, "read_file served a stale root"
  and "the registry no-opped" are the same observation.
- **`CACHE_TTL` (60 s) is enforced and `ROOT_CACHE_TTL` (300 s) is not.** Past 60 s the content
  re-reads from disk; past 300 s the project root still does not re-resolve. So §3.B's **reading 1**
  holds: the constant at `read_file.ts:148` is dead and the comment over it is wrong.

**PR-D logs this and does not fix it** — RFS-02 AC-4, parent `spec.md` Out of Scope, R-07's
precedent. The only thing PR-D changes is the two comments (C35).

#### §3.B's coincidence premise is now measured rather than argued

T7 repoints `file-filter-cache.ts:82` — whose eviction is `min(createdAt)`, not insertion order — at
a shared insertion-order function. §3.B argued the two coincide *"because entries are `set` exactly
once and never re-inserted."* Argued in Specify, never run. Mutation **M5a** switches that site to
insertion-order eviction and the characterization suite stays **PASS**; **M5b** adds read-promotion
on top and it goes **FAIL**. So the premise holds, and the suite catches the one way T7 could break
it.

#### Both suites' discrimination, on the real tree

Backed up to scratch copies with SHA-256 byte-identity asserted on restore, refuse-on-byte-identical
on every patch, **never `git checkout`**. Ten mutations on the characterization suite and five on the
pin; **every one landed as expected**, `4/4` and `3/3` files byte-identical afterwards, and the
control's assertion count reproduced exactly (3115) either side.

| # | mutation | expected | got |
| --- | --- | --- | --- |
| M1 | `read_file` `fileCache` read-promotion removed | FAIL | FAIL 4p/1f |
| M2 | `read_file` `projectRootCache` read-promotion removed | FAIL | FAIL 4p/1f |
| M3 | `symbol-graph` `projectRootCache` read-promotion removed | FAIL | FAIL 4p/1f |
| M4 | `web-controller` read-promotion removed | FAIL | FAIL 4p/1f |
| M5a | `file-filter-cache` eviction → insertion order (**control**) | PASS | PASS 5p/0f |
| M5b | M5a **+** read-promotion — the naive unification | FAIL | FAIL 4p/1f |
| M6 | `read_file` cap 512 → 256 | FAIL | FAIL 3p/2f |
| M7 | `file-filter-cache` cap 50 → 40 | FAIL | FAIL 4p/1f |
| M8 | `read_file` `evictOldest` neutered | FAIL | FAIL 4p/1f |
| M9 | comment-only edit (**inert control**) | PASS | PASS 5p/0f |
| N1 | `getProjectRoot` stops caching | FAIL | FAIL 0p/2f |
| N2 | `CACHE_TTL` 60 s → 600 s (**positive control** — the suite can see a TTL expire) | FAIL | FAIL 1p/1f |
| N3 | `symbolGraph.clearProjectRoot` neutered | FAIL | FAIL 1p/1f |
| N4 | registry drops the `symbol-graph-project-root` registration | FAIL | FAIL 1p/1f |
| N5 | comment-only edit (**inert control**) | PASS | PASS 2p/0f |

**One harness defect, caught by the harness refusing rather than by a green run.** The first
implementation read `bun test`'s summary with `execFileSync`, which returns **stdout only** — and
bun writes that summary to **stderr** on success as well as failure. Every run threw
`unparseable bun test output`. Had it defaulted to "no match → treat as pass", all fifteen rows
would have read PASS and the table would have been worthless. *Silence is a failure mode, and the
instrument is where it fires first.*
